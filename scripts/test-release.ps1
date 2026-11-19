# Runs the extracted release ZIP with no Node.js or Python on PATH and unreachable proxies,
# trains a short run to completion, and fails on any non-loopback socket or child runtime.
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$zipPath = Join-Path $repoRoot "release\EvoRacer-Windows-x64.zip"
$acceptanceRoot = Join-Path $repoRoot ".runtime_tmp\release-acceptance"
$origin = "http://127.0.0.1:8765"

function Invoke-Api([string] $Path, [hashtable] $Body) {
    $json = if ($null -eq $Body) { "{}" } else { $Body | ConvertTo-Json -Depth 5 }
    Invoke-RestMethod -Uri "$origin$Path" -Method Post -ContentType "application/json" `
        -Body $json -TimeoutSec 30
}

if (-not (Test-Path -LiteralPath (Join-Path $repoRoot "release\EvoRacer\EvoRacer.exe"))) {
    throw "Build the release first: npm run build:release"
}
$expectedHash = ((Get-Content -LiteralPath "$zipPath.sha256" -Raw).Trim() -split "\s+")[0]
$actualHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($expectedHash -ne $actualHash) {
    throw "Release ZIP SHA-256 does not match its checksum file."
}

Remove-Item -LiteralPath $acceptanceRoot -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive -LiteralPath $zipPath -DestinationPath $acceptanceRoot
$bundleRoot = Join-Path $acceptanceRoot "EvoRacer"
foreach ($required in @("EvoRacer.exe", "README.md", "USER-GUIDE.md", "THIRD-PARTY-NOTICES.txt",
        "licenses\PYTHON-LICENSE.txt", "licenses\PYINSTALLER-LICENSE.txt",
        "licenses\NEAT-PYTHON-LICENSE.txt")) {
    if (-not (Test-Path -LiteralPath (Join-Path $bundleRoot $required))) {
        throw "Release content is missing: $required"
    }
}

$startInfo = [System.Diagnostics.ProcessStartInfo]::new((Join-Path $bundleRoot "EvoRacer.exe"))
$startInfo.Arguments = "--no-browser --data-root `"$(Join-Path $acceptanceRoot 'data')`""
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$startInfo.WorkingDirectory = $bundleRoot
$startInfo.EnvironmentVariables["PATH"] = "$env:SystemRoot\System32"
foreach ($proxy in @("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY")) {
    $startInfo.EnvironmentVariables[$proxy] = "http://127.0.0.1:9"
}
$startInfo.EnvironmentVariables.Remove("PYTHONHOME")
$startInfo.EnvironmentVariables.Remove("PYTHONPATH")
$app = [System.Diagnostics.Process]::Start($startInfo)

try {
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while ($true) {
        if ($app.HasExited) { throw "EvoRacer exited before its health endpoint was ready." }
        try {
            if ((Invoke-RestMethod -Uri "$origin/health" -TimeoutSec 2).status -eq "ready") { break }
        }
        catch {
            if ([DateTime]::UtcNow -gt $deadline) { throw "EvoRacer did not become ready in 30 s." }
            Start-Sleep -Milliseconds 200
        }
    }
    if ((Invoke-WebRequest -Uri "$origin/" -UseBasicParsing).Content -notmatch "EvoRacer") {
        throw "The packaged frontend did not load."
    }

    $started = Invoke-Api "/v1/runs/start" @{
        contractVersion = 1
        trackPreset = "easy-oval"
        settings = @{ algorithm = "fixed-ga"; populationSize = 10; generations = 3; episodeSeconds = 15; seed = 20260729 }
    }
    if (-not $started.valid) { throw "The packaged app did not start a run." }
    $runId = [string] $started.snapshot.runId

    $deadline = [DateTime]::UtcNow.AddSeconds(180)
    do {
        Start-Sleep -Milliseconds 500
        $snapshot = (Invoke-Api "/v1/runs/observe" @{ contractVersion = 1; runId = $runId }).snapshot
    } while ($snapshot.status -ne "completed" -and [DateTime]::UtcNow -lt $deadline)
    if ($snapshot.status -ne "completed" -or $snapshot.result.replay.frames.Count -eq 0) {
        throw "The packaged run did not complete with a champion replay."
    }

    $foreign = @(Get-NetTCPConnection -OwningProcess $app.Id -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalAddress -notin @("127.0.0.1", "::1") -or
            ($_.State -ne "Listen" -and $_.RemoteAddress -notin @("127.0.0.1", "::1")) })
    if ($foreign.Count -ne 0) { throw "EvoRacer opened a non-loopback connection." }
    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$($app.Id)" |
        Where-Object { $_.Name -match "^(node|python|pythonw)\.exe$" })
    if ($children.Count -ne 0) { throw "EvoRacer launched an external Node.js or Python process." }

    Invoke-Api "/v1/app/shutdown" $null | Out-Null
    if (-not $app.WaitForExit(10000)) { throw "EvoRacer did not shut down within 10 s." }
    Write-Host "Release acceptance passed: run $runId, archive SHA-256 $actualHash"
}
finally {
    if (-not $app.HasExited) { $app.Kill() }
}
