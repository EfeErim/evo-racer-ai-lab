$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$zipPath = Join-Path $repoRoot "release\EvoRacer-Windows-x64.zip"
$checksumPath = "$zipPath.sha256"
$acceptanceRoot = Join-Path $repoRoot ".runtime_tmp\phase9-acceptance"
$extractRoot = Join-Path $acceptanceRoot "extract"
$dataRoot = Join-Path $acceptanceRoot "local-data"
$appOrigin = "http://127.0.0.1:8765"

function Wait-ForHealth {
    param([Parameter(Mandatory)][System.Diagnostics.Process] $AppProcess)

    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    do {
        if ($AppProcess.HasExited) {
            throw "EvoRacer exited before its health endpoint became ready."
        }
        try {
            $health = Invoke-RestMethod -Uri "$appOrigin/health" -TimeoutSec 2
            if ($health.status -eq "ready" -and $health.host -eq "127.0.0.1") {
                return
            }
        }
        catch {
            Start-Sleep -Milliseconds 200
        }
    } while ([DateTime]::UtcNow -lt $deadline)

    throw "EvoRacer health endpoint did not become ready within 30 seconds."
}

function Start-AcceptanceApp {
    param(
        [Parameter(Mandatory)][string] $Executable,
        [Parameter(Mandatory)][string] $LocalData
    )

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $Executable
    $startInfo.Arguments = "--no-browser --data-root `"$LocalData`""
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.WorkingDirectory = Split-Path -Parent $Executable
    $startInfo.EnvironmentVariables["PATH"] = "$env:SystemRoot\System32"
    $startInfo.EnvironmentVariables["HTTP_PROXY"] = "http://127.0.0.1:9"
    $startInfo.EnvironmentVariables["HTTPS_PROXY"] = "http://127.0.0.1:9"
    $startInfo.EnvironmentVariables["ALL_PROXY"] = "http://127.0.0.1:9"
    $startInfo.EnvironmentVariables["NO_PROXY"] = "127.0.0.1,localhost"
    $startInfo.EnvironmentVariables.Remove("PYTHONHOME")
    $startInfo.EnvironmentVariables.Remove("PYTHONPATH")

    $appProcess = [System.Diagnostics.Process]::Start($startInfo)
    if ($null -eq $appProcess) {
        throw "EvoRacer process could not be started."
    }
    Wait-ForHealth -AppProcess $appProcess
    return $appProcess
}

function Assert-LoopbackOnly {
    param([Parameter(Mandatory)][System.Diagnostics.Process] $AppProcess)

    $connections = Get-NetTCPConnection -OwningProcess $AppProcess.Id -ErrorAction SilentlyContinue
    $nonLoopback = @(
        $connections | Where-Object {
            $_.LocalAddress -notin @("127.0.0.1", "::1") -or
            ($_.RemoteAddress -notin @("0.0.0.0", "127.0.0.1", "::", "::1") -and
             $_.State -ne "Listen")
        }
    )
    if ($nonLoopback.Count -ne 0) {
        throw "EvoRacer opened a non-loopback network connection."
    }

    $unexpectedChildren = @(
        Get-CimInstance Win32_Process |
            Where-Object {
                $_.ParentProcessId -eq $AppProcess.Id -and
                $_.Name -match "^(node|python|pythonw)(\.exe)?$"
            }
    )
    if ($unexpectedChildren.Count -ne 0) {
        throw "The packaged application launched an external Node.js or Python process."
    }
}

function Stop-AcceptanceApp {
    param([Parameter(Mandatory)][System.Diagnostics.Process] $AppProcess)

    if ($AppProcess.HasExited) {
        return
    }
    Invoke-RestMethod -Uri "$appOrigin/v1/app/shutdown" -Method Post -TimeoutSec 5 | Out-Null
    if (-not $AppProcess.WaitForExit(10000)) {
        $AppProcess.Kill()
        throw "EvoRacer did not complete graceful shutdown within 10 seconds."
    }
}

if (-not (Test-Path -LiteralPath $zipPath) -or
    -not (Test-Path -LiteralPath $checksumPath)) {
    throw "Build the Phase 9 release before running acceptance: npm run build:release"
}

$expectedHash = ((Get-Content -LiteralPath $checksumPath -Raw).Trim() -split "\s+")[0]
$actualHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($expectedHash -ne $actualHash) {
    throw "Release ZIP SHA-256 does not match its checksum file."
}

if (Test-Path -LiteralPath $acceptanceRoot) {
    $resolvedAcceptance = (Resolve-Path -LiteralPath $acceptanceRoot).Path
    if (-not $resolvedAcceptance.StartsWith("$repoRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to replace acceptance path outside the repository."
    }
    Remove-Item -LiteralPath $acceptanceRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $extractRoot, $dataRoot -Force | Out-Null
Expand-Archive -LiteralPath $zipPath -DestinationPath $extractRoot

$bundleRoot = Join-Path $extractRoot "EvoRacer"
$executable = Join-Path $bundleRoot "EvoRacer.exe"
foreach ($requiredPath in @(
    $executable,
    (Join-Path $bundleRoot "README.md"),
    (Join-Path $bundleRoot "USER-GUIDE.md"),
    (Join-Path $bundleRoot "THIRD-PARTY-NOTICES.txt"),
    (Join-Path $bundleRoot "licenses\PYTHON-LICENSE.txt"),
    (Join-Path $bundleRoot "licenses\PYINSTALLER-LICENSE.txt")
)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Release content is missing: $requiredPath"
    }
}

$firstProcess = $null
$secondProcess = $null
try {
    $firstProcess = Start-AcceptanceApp -Executable $executable -LocalData $dataRoot
    $index = Invoke-WebRequest -Uri "$appOrigin/" -TimeoutSec 5 -UseBasicParsing
    if ($index.StatusCode -ne 200 -or $index.Content -notmatch "EvoRacer") {
        throw "The packaged production frontend did not load."
    }

    $startPayload = @{
        contractVersion = 1
        trackPreset = "easy-oval"
        settings = @{
            algorithm = "fixed-ga"
            populationSize = 10
            generations = 2
            episodeSeconds = 15
            seed = 20260729
        }
    } | ConvertTo-Json -Depth 5
    $started = Invoke-RestMethod `
        -Uri "$appOrigin/v1/runs/start" `
        -Method Post `
        -ContentType "application/json" `
        -Body $startPayload `
        -TimeoutSec 30
    if (-not $started.valid -or $started.snapshot.status -ne "running") {
        throw "The packaged app did not start the reviewed offline run."
    }
    $runId = [string] $started.snapshot.runId

    $observed = Invoke-RestMethod `
        -Uri "$appOrigin/v1/runs/observe" `
        -Method Post `
        -ContentType "application/json" `
        -Body (@{ contractVersion = 1; runId = $runId } | ConvertTo-Json) `
        -TimeoutSec 120
    if (-not $observed.valid -or $observed.snapshot.generation -ne 1) {
        throw "The packaged app did not save the first complete generation."
    }
    Assert-LoopbackOnly -AppProcess $firstProcess
    Stop-AcceptanceApp -AppProcess $firstProcess
    $firstProcess = $null

    $secondProcess = Start-AcceptanceApp -Executable $executable -LocalData $dataRoot
    $library = Invoke-RestMethod -Uri "$appOrigin/v1/runs/library" -TimeoutSec 10
    if ($library.runs.runId -notcontains $runId) {
        throw "The packaged app did not restore the saved run after restart."
    }

    $resumed = Invoke-RestMethod `
        -Uri "$appOrigin/v1/runs/resume" `
        -Method Post `
        -ContentType "application/json" `
        -Body (@{ contractVersion = 1; runId = $runId } | ConvertTo-Json) `
        -TimeoutSec 120
    if (-not $resumed.valid -or $resumed.snapshot.status -ne "running") {
        throw "The packaged app could not resume the saved run."
    }

    $completed = Invoke-RestMethod `
        -Uri "$appOrigin/v1/runs/observe" `
        -Method Post `
        -ContentType "application/json" `
        -Body (@{ contractVersion = 1; runId = $runId } | ConvertTo-Json) `
        -TimeoutSec 120
    if (-not $completed.valid -or
        $completed.snapshot.status -ne "completed" -or
        $completed.snapshot.result.replay.frames.Count -eq 0) {
        throw "The packaged app did not complete training and retain replay frames."
    }
    Assert-LoopbackOnly -AppProcess $secondProcess
    Stop-AcceptanceApp -AppProcess $secondProcess
    $secondProcess = $null

    Write-Host "Phase 9 release acceptance passed."
    Write-Host "Archive SHA-256: $actualHash"
    Write-Host "Run restored and completed: $runId"
    Write-Host "Packaged process used loopback only and spawned no Node.js or Python process."
}
finally {
    if ($null -ne $firstProcess -and -not $firstProcess.HasExited) {
        Stop-AcceptanceApp -AppProcess $firstProcess
    }
    if ($null -ne $secondProcess -and -not $secondProcess.HasExited) {
        Stop-AcceptanceApp -AppProcess $secondProcess
    }
}
