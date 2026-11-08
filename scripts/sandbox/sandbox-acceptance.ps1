<#
Runs inside Windows Sandbox (roadmap step 4). The host script maps the release
read-only to C:\EvoRacer, this folder to C:\Acceptance, and a writable evidence
folder to C:\Evidence, with networking disabled.

The script records what a clean machine proves, then guides the person through
the user interface journey and checks persistence between the two launches.
Use -SelfTest on a development machine to exercise the script without a
sandbox: it uses a temporary data folder, opens no browser, starts a small run
through the local API instead of the user interface, and does not require the
network to be off.
#>
param(
    [string] $AppRoot = "C:\EvoRacer",
    [string] $EvidenceRoot = "C:\Evidence",
    [switch] $SelfTest
)

$ErrorActionPreference = "Stop"
$appOrigin = "http://127.0.0.1:8765"
$executable = Join-Path $AppRoot "EvoRacer.exe"
$evidencePath = Join-Path $EvidenceRoot "sandbox-acceptance.json"
New-Item -ItemType Directory -Path $EvidenceRoot -Force | Out-Null
Start-Transcript -Path (Join-Path $EvidenceRoot "sandbox-acceptance.log") -Force | Out-Null

$evidence = [ordered]@{
    contractVersion = 1
    selfTest = [bool] $SelfTest
    startedAt = (Get-Date).ToUniversalTime().ToString("o")
    machine = [ordered]@{}
    checkpoints = @()
    checks = [ordered]@{}
    passed = $false
}

function Save-Evidence {
    $evidence | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $evidencePath -Encoding UTF8
}

function Set-Check {
    param([string] $Name, [bool] $Passed, $Detail)
    $evidence.checks[$Name] = [ordered]@{ passed = $Passed; detail = $Detail }
    $mark = if ($Passed) { "PASS" } else { "FAIL" }
    Write-Host "[$mark] $Name"
    Save-Evidence
}

function Test-Outbound {
    # A raw TCP connect and a DNS lookup, each bounded, against public addresses.
    $tcp = [System.Net.Sockets.TcpClient]::new()
    try {
        $connected = $tcp.ConnectAsync("1.1.1.1", 443).Wait(3000) -and $tcp.Connected
    }
    catch {
        $connected = $false
    }
    finally {
        $tcp.Dispose()
    }
    try {
        [System.Net.Dns]::GetHostAddresses("example.com") | Out-Null
        $resolved = $true
    }
    catch {
        $resolved = $false
    }
    [ordered]@{ tcpConnected = $connected; dnsResolved = $resolved }
}

function Get-EvoRacerProcessIds {
    @(Get-CimInstance Win32_Process |
        Where-Object { $_.ExecutablePath -and $_.ExecutablePath -like "$AppRoot\*" } |
        ForEach-Object { [int] $_.ProcessId })
}

function Wait-ForHealth {
    $deadline = [DateTime]::UtcNow.AddSeconds(60)
    do {
        try {
            $health = Invoke-RestMethod -Uri "$appOrigin/health" -TimeoutSec 2
            if ($health.status -eq "ready") {
                return $health
            }
        }
        catch {
            Start-Sleep -Milliseconds 250
        }
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "EvoRacer did not report ready on $appOrigin within 60 seconds."
}

function Get-RunLibrary {
    $library = Invoke-RestMethod -Uri "$appOrigin/v1/runs/library" -TimeoutSec 10
    @($library.runs | ForEach-Object {
        [ordered]@{ runId = $_.runId; status = $_.status }
    })
}

function Add-Checkpoint {
    param([string] $Name)
    $ids = Get-EvoRacerProcessIds
    $connections = @(Get-NetTCPConnection -ErrorAction SilentlyContinue |
        Where-Object { $ids -contains $_.OwningProcess } |
        ForEach-Object {
            [ordered]@{
                state = [string] $_.State
                local = "$($_.LocalAddress):$($_.LocalPort)"
                remote = "$($_.RemoteAddress):$($_.RemotePort)"
            }
        })
    $children = @(Get-CimInstance Win32_Process |
        Where-Object { $ids -contains $_.ParentProcessId -and $_.Name -match "^(node|python|pythonw)(\.exe)?$" } |
        ForEach-Object { $_.Name })
    $nonLoopback = @($connections | Where-Object {
        ($_.local -notmatch "^(127\.0\.0\.1|::1):") -or
        ($_.state -ne "Listen" -and $_.remote -notmatch "^(127\.0\.0\.1|::1|0\.0\.0\.0|::):")
    })
    $checkpoint = [ordered]@{
        name = $Name
        at = (Get-Date).ToUniversalTime().ToString("o")
        processIds = $ids
        connections = $connections
        externalChildren = $children
        outbound = Test-Outbound
        runs = Get-RunLibrary
    }
    $evidence.checkpoints += $checkpoint
    Set-Check "$Name loopback only" ($nonLoopback.Count -eq 0 -and $connections.Count -gt 0) $nonLoopback
    Set-Check "$Name no external Python or Node.js" ($children.Count -eq 0) $children
    $checkpoint
}

function Start-EvoRacer {
    param([string] $DataRoot)
    if ($SelfTest) {
        $process = Start-Process -FilePath $executable -ArgumentList @("--no-browser", "--data-root", "`"$DataRoot`"") -WorkingDirectory $AppRoot -PassThru -WindowStyle Hidden
    }
    else {
        # The normal user path: start the EXE, which opens the default browser.
        $process = Start-Process -FilePath $executable -WorkingDirectory $AppRoot -PassThru
    }
    Wait-ForHealth | Out-Null
    $process
}

function Wait-ForExit {
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while ((Get-EvoRacerProcessIds).Count -gt 0 -and [DateTime]::UtcNow -lt $deadline) {
        Start-Sleep -Milliseconds 250
    }
    (Get-EvoRacerProcessIds).Count -eq 0
}

function Wait-ForPerson {
    param([string[]] $Steps)
    if ($SelfTest) {
        return
    }
    Write-Host ""
    $Steps | ForEach-Object { Write-Host "  $_" }
    Read-Host "Press Enter when done" | Out-Null
}

try {
    if (-not (Test-Path -LiteralPath $executable)) {
        throw "EvoRacer.exe is missing at $executable."
    }

    # Machine facts: a clean Windows without Python or Node.js and without a network.
    $os = Get-CimInstance Win32_OperatingSystem
    $evidence.machine = [ordered]@{
        os = "$($os.Caption) $($os.Version)"
        user = $env:USERNAME
        computer = $env:COMPUTERNAME
        adapters = @(Get-NetAdapter -ErrorAction SilentlyContinue | ForEach-Object {
            [ordered]@{ name = $_.Name; status = [string] $_.Status }
        })
        executableSha256 = (Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    $runtimes = @("python", "python3", "py", "node") | ForEach-Object {
        $command = Get-Command $_ -ErrorAction SilentlyContinue
        # The Microsoft Store alias for python is a stub, not an installed runtime.
        if ($null -ne $command -and $command.Source -notlike "*\WindowsApps\*") { $command.Source }
    }
    $registered = @("HKLM:\SOFTWARE\Python", "HKCU:\SOFTWARE\Python", "HKLM:\SOFTWARE\Node.js") |
        Where-Object { Test-Path $_ }
    $outbound = Test-Outbound
    if (-not $SelfTest) {
        Set-Check "no Python or Node.js installed" ($runtimes.Count -eq 0 -and $registered.Count -eq 0) ([ordered]@{ onPath = @($runtimes); registry = @($registered) })
        Set-Check "network is off" (-not $outbound.tcpConnected -and -not $outbound.dnsResolved) $outbound
    }

    $dataRoot = if ($SelfTest) { Join-Path $EvidenceRoot "self-test-data" } else { $null }
    if ($SelfTest -and (Test-Path -LiteralPath $dataRoot)) {
        Remove-Item -LiteralPath $dataRoot -Recurse -Force
    }

    # First launch and the reviewed run.
    Start-EvoRacer -DataRoot $dataRoot | Out-Null
    $first = Add-Checkpoint "first launch"
    Set-Check "first launch starts with no saved runs" ($first.runs.Count -eq 0) $first.runs

    if ($SelfTest) {
        $start = @{
            contractVersion = 1
            trackPreset = "easy-oval"
            settings = @{ algorithm = "neat"; populationSize = 10; generations = 2; episodeSeconds = 15; seed = 42 }
        } | ConvertTo-Json -Depth 5
        $started = Invoke-RestMethod -Uri "$appOrigin/v1/runs/start" -Method Post -ContentType "application/json" -Body $start -TimeoutSec 30
        if (-not $started.valid) {
            throw "The self-test run was rejected: $($started | ConvertTo-Json -Depth 4 -Compress)"
        }
        $deadline = [DateTime]::UtcNow.AddSeconds(180)
        do {
            Start-Sleep -Milliseconds 500
            $observed = Invoke-RestMethod -Uri "$appOrigin/v1/runs/observe" -Method Post -ContentType "application/json" -Body (@{ contractVersion = 1; runId = $started.snapshot.runId } | ConvertTo-Json) -TimeoutSec 10
        } while ($observed.snapshot.status -ne "completed" -and [DateTime]::UtcNow -lt $deadline)
    }
    Wait-ForPerson @(
        "In the EvoRacer browser window:",
        "1. Press 'Review recommended experiment' and check that Review says 'Setup is valid'.",
        "2. Press 'Start training'. Watch Training until it finishes, or press 'Stop after generation'.",
        "3. Press 'Open results' and check the summary, chart, and replay.",
        "Leave EvoRacer open; this window checks the network next."
    )
    $trained = Add-Checkpoint "after training"
    $completed = @($trained.runs | Where-Object { $_.status -in @("completed", "stopped") })
    Set-Check "a run reached Results" ($completed.Count -ge 1) $trained.runs

    Wait-ForPerson @(
        "Now close EvoRacer the way a user would:",
        "4. Press the Exit button (top right) in EvoRacer and confirm.",
        "Close the browser tab afterwards if it stays open."
    )
    if ($SelfTest) {
        Invoke-RestMethod -Uri "$appOrigin/v1/app/shutdown" -Method Post -TimeoutSec 5 | Out-Null
    }
    Set-Check "Exit stops every EvoRacer process" (Wait-ForExit) (Get-EvoRacerProcessIds)

    # Second launch: the saved run must still be there.
    Write-Host ""
    Write-Host "Starting EvoRacer again from $executable ..."
    Start-EvoRacer -DataRoot $dataRoot | Out-Null
    $second = Add-Checkpoint "second launch"
    $kept = @($second.runs | Where-Object { $completed.runId -contains $_.runId })
    Set-Check "the run survives a restart" ($completed.Count -ge 1 -and $kept.Count -eq $completed.Count) $second.runs

    Wait-ForPerson @(
        "5. On Welcome, open 'Saved runs' and press 'Open results' for the run.",
        "6. Check that the summary, chart, and replay are the same as before.",
        "Then press Exit in EvoRacer."
    )
    if ($SelfTest) {
        Invoke-RestMethod -Uri "$appOrigin/v1/app/shutdown" -Method Post -TimeoutSec 5 | Out-Null
    }
    Set-Check "second Exit stops every EvoRacer process" (Wait-ForExit) (Get-EvoRacerProcessIds)

    $evidence.passed = @($evidence.checks.Values | Where-Object { -not $_.passed }).Count -eq 0
}
catch {
    $evidence.error = $_.Exception.Message
    Write-Host "ERROR: $($_.Exception.Message)"
}
finally {
    $evidence.finishedAt = (Get-Date).ToUniversalTime().ToString("o")
    Save-Evidence
    Write-Host ""
    Write-Host ("Result: " + $(if ($evidence.passed) { "PASSED" } else { "FAILED" }))
    Write-Host "Evidence: $evidencePath"
    Stop-Transcript | Out-Null
}
if (-not $evidence.passed) {
    exit 1
}
