$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$zipPath = Join-Path $repoRoot "release\EvoRacer-Windows-x64.zip"
$checksumPath = "$zipPath.sha256"
$directBundleRoot = Join-Path $repoRoot "release\EvoRacer"
$directExecutable = Join-Path $directBundleRoot "EvoRacer.exe"
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

$script:SawLiveTelemetry = $false
$script:SawGenerationReplay = $false

function Wait-ForRunState {
    param(
        [Parameter(Mandatory)][string] $RunId,
        [Parameter(Mandatory)][int] $TargetGeneration,
        [string] $ExpectedStatus = ""
    )

    $deadline = [DateTime]::UtcNow.AddSeconds(180)
    do {
        $observed = Invoke-RestMethod `
            -Uri "$appOrigin/v1/runs/observe" `
            -Method Post `
            -ContentType "application/json" `
            -Body (@{ contractVersion = 1; runId = $RunId } | ConvertTo-Json) `
            -TimeoutSec 10
        if (-not $observed.valid) {
            throw "The packaged app rejected a run observation."
        }

        $selectedCar = $observed.snapshot.selectedCar
        $positionFields = if ($null -eq $selectedCar) {
            @()
        }
        else {
            @($selectedCar.PSObject.Properties.Name)
        }
        if ($observed.snapshot.generationInProgress -eq $true -and
            $null -ne $observed.snapshot.activeCandidate -and
            $positionFields -contains "x" -and
            $positionFields -contains "y" -and
            $positionFields -contains "heading") {
            $script:SawLiveTelemetry = $true
        }

        $generationReplay = $observed.snapshot.generationReplay
        $replayFrames = if ($null -eq $generationReplay) {
            @()
        }
        else {
            @($generationReplay.frames)
        }
        $replayFields = if ($replayFrames.Count -eq 0) {
            @()
        }
        else {
            @($replayFrames[0].PSObject.Properties.Name)
        }
        if ($replayFrames.Count -gt 1 -and
            $replayFields -contains "x" -and
            $replayFields -contains "y" -and
            $replayFields -contains "heading" -and
            $replayFields -contains "simulatedSeconds") {
            $script:SawGenerationReplay = $true
        }

        $generationReached = $observed.snapshot.generation -ge $TargetGeneration
        $statusReached = [string]::IsNullOrEmpty($ExpectedStatus) -or
            $observed.snapshot.status -eq $ExpectedStatus
        if ($generationReached -and $statusReached) {
            return $observed
        }
        Start-Sleep -Milliseconds 200
    } while ([DateTime]::UtcNow -lt $deadline)

    throw "The packaged run did not reach generation $TargetGeneration with status '$ExpectedStatus'."
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

function Test-ExecutableStarter {
    param(
        [Parameter(Mandatory)][string] $Executable,
        [Parameter(Mandatory)][string] $LocalData
    )

    $previousDataRoot = $env:EVORACER_DATA_ROOT
    $env:EVORACER_DATA_ROOT = $LocalData
    $starter = $null
    $runtimeProcess = $null
    try {
        $starter = Start-Process `
            -FilePath $Executable `
            -WorkingDirectory (Split-Path -Parent $Executable) `
            -WindowStyle Hidden `
            -PassThru
        $health = $null
        $deadline = [DateTime]::UtcNow.AddSeconds(30)
        do {
            try {
                $health = Invoke-RestMethod -Uri "$appOrigin/health" -TimeoutSec 2
                if ($health.status -eq "ready") {
                    break
                }
            }
            catch {
                Start-Sleep -Milliseconds 200
            }
        } while ([DateTime]::UtcNow -lt $deadline)
        if ($null -eq $health -or $health.status -ne "ready") {
            throw "EvoRacer.exe did not start the packaged application."
        }
        $listener = Get-NetTCPConnection `
            -LocalAddress "127.0.0.1" `
            -LocalPort 8765 `
            -State Listen `
            -ErrorAction Stop |
            Select-Object -First 1
        $packagedProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
        if ($packagedProcess.ExecutablePath -ne $Executable) {
            throw "EvoRacer.exe did not own the packaged loopback service."
        }
        $runtimeProcess = [System.Diagnostics.Process]::GetProcessById($listener.OwningProcess)
        Invoke-RestMethod -Uri "$appOrigin/v1/app/shutdown" -Method Post -TimeoutSec 5 | Out-Null
        if (-not $runtimeProcess.WaitForExit(10000)) {
            $runtimeProcess.Kill()
            throw "EvoRacer.exe did not shut down within 10 seconds."
        }
    }
    finally {
        if ($null -ne $runtimeProcess -and -not $runtimeProcess.HasExited) {
            try {
                Invoke-RestMethod `
                    -Uri "$appOrigin/v1/app/shutdown" `
                    -Method Post `
                    -TimeoutSec 2 |
                    Out-Null
                $runtimeProcess.WaitForExit(3000) | Out-Null
            }
            catch {
                # PID-scoped termination below guarantees cleanup after a failed starter check.
            }
            if (-not $runtimeProcess.HasExited) {
                $runtimeProcess.Kill()
                $runtimeProcess.WaitForExit(3000) | Out-Null
            }
        }
        if ($null -ne $starter -and -not $starter.HasExited) {
            $starter.Kill()
            $starter.WaitForExit(3000) | Out-Null
        }
        if ($null -eq $previousDataRoot) {
            Remove-Item Env:EVORACER_DATA_ROOT -ErrorAction SilentlyContinue
        }
        else {
            $env:EVORACER_DATA_ROOT = $previousDataRoot
        }
    }
}

if (-not (Test-Path -LiteralPath $zipPath) -or
    -not (Test-Path -LiteralPath $checksumPath)) {
    throw "Build the Phase 9 release before running acceptance: npm run build:release"
}
if (-not (Test-Path -LiteralPath $directExecutable)) {
    throw "The outside-ZIP release executable is missing: $directExecutable"
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
    (Join-Path $bundleRoot "licenses\PYINSTALLER-LICENSE.txt"),
    (Join-Path $bundleRoot "licenses\NEAT-PYTHON-LICENSE.txt")
)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Release content is missing: $requiredPath"
    }
}
if (Test-Path -LiteralPath (Join-Path $bundleRoot "EvoRacer.cmd")) {
    throw "The release still depends on an EvoRacer.cmd starter."
}

$firstProcess = $null
$secondProcess = $null
try {
    Test-ExecutableStarter -Executable $directExecutable -LocalData $dataRoot
    Test-ExecutableStarter -Executable $executable -LocalData $dataRoot
    $firstProcess = Start-AcceptanceApp -Executable $executable -LocalData $dataRoot
    $index = Invoke-WebRequest -Uri "$appOrigin/" -TimeoutSec 5 -UseBasicParsing
    if ($index.StatusCode -ne 200 -or $index.Content -notmatch "EvoRacer") {
        throw "The packaged production frontend did not load."
    }

    $presets = Invoke-RestMethod -Uri "$appOrigin/v1/tracks/presets" -TimeoutSec 5
    $draft = $presets.presets[0].track | ConvertTo-Json -Depth 10 | ConvertFrom-Json
    $draft.pieces = @($draft.pieces) + [pscustomobject]@{ kind = "straight-short" }
    $draftRequest = @{
        contractVersion = 1
        track = $draft
    } | ConvertTo-Json -Depth 12
    $draftResponse = Invoke-RestMethod `
        -Uri "$appOrigin/v1/tracks/compile" `
        -Method Post `
        -ContentType "application/json" `
        -Body $draftRequest `
        -TimeoutSec 10
    if ($draftResponse.valid -ne $false -or $null -eq $draftResponse.preview) {
        throw "The packaged editor did not return Python-derived open-draft geometry."
    }

    $assisted = Invoke-RestMethod `
        -Uri "$appOrigin/v1/tracks/assist-closure" `
        -Method Post `
        -ContentType "application/json" `
        -Body $draftRequest `
        -TimeoutSec 15
    if ($assisted.valid -ne $true -or $assisted.removedPieces -ne 1) {
        throw "The packaged editor did not repair one invalid trailing piece."
    }

    $generatorRequest = @{
        contractVersion = 1
        seed = 731
        length = "long"
        difficulty = "hard"
    } | ConvertTo-Json
    $generated = Invoke-RestMethod `
        -Uri "$appOrigin/v1/tracks/generate" `
        -Method Post `
        -ContentType "application/json" `
        -Body $generatorRequest `
        -TimeoutSec 15
    $generatedKinds = @($generated.compiled.track.pieces | ForEach-Object { $_.kind })
    $generatedHairpins = @($generatedKinds | Where-Object { $_ -like "hairpin-*" })
    $generatedChicanes = @($generatedKinds | Where-Object { $_ -like "chicane-*" })
    $halfLength = [int] ($generatedKinds.Count / 2)
    $generatedFirstHalf = @($generatedKinds[0..($halfLength - 1)] | ForEach-Object {
        if ($_ -eq "start-finish") { "straight-short" } else { $_ }
    })
    $generatedSecondHalf = @($generatedKinds[$halfLength..($generatedKinds.Count - 1)])
    $halfDifferences = 0
    for ($pieceIndex = 0; $pieceIndex -lt $halfLength; $pieceIndex += 1) {
        if ($generatedFirstHalf[$pieceIndex] -ne $generatedSecondHalf[$pieceIndex]) {
            $halfDifferences += 1
        }
    }
    if ($generated.valid -ne $true -or
        $generated.generatorVersion -ne 4 -or
        @($generated.compiled.track.pieces).Count -ne 24 -or
        $generatedHairpins.Count -eq 0 -or
        $generatedChicanes.Count -eq 0 -or
        $generated.features.layout -ne "asymmetric" -or
        $halfDifferences -lt 2) {
        throw "The packaged generator v4 did not produce the expected asymmetric hard layout."
    }
    Write-Host "Packaged Track Builder: open preview, repair, and generator v4 verified."

    $startPayload = @{
        contractVersion = 1
        trackPreset = "easy-oval"
        settings = @{
            algorithm = "fixed-ga"
            populationSize = 10
            generations = 3
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

    $observed = Wait-ForRunState -RunId $runId -TargetGeneration 1
    if (-not $observed.valid -or $observed.snapshot.generation -ne 1) {
        throw "The packaged app did not save the first complete generation."
    }
    if (-not $script:SawLiveTelemetry) {
        throw "The packaged app did not expose live candidate position telemetry."
    }
    if (-not $script:SawGenerationReplay) {
        throw "The packaged app did not expose a Python generation replay for smooth presentation."
    }
    $pauseRequested = Invoke-RestMethod `
        -Uri "$appOrigin/v1/runs/command" `
        -Method Post `
        -ContentType "application/json" `
        -Body (@{
            contractVersion = 1
            runId = $runId
            command = "pause"
        } | ConvertTo-Json) `
        -TimeoutSec 30
    if (-not $pauseRequested.valid) {
        throw "The packaged app rejected the pause command."
    }
    $paused = Wait-ForRunState `
        -RunId $runId `
        -TargetGeneration 2 `
        -ExpectedStatus "paused"
    if (-not $paused.valid -or $paused.snapshot.status -ne "paused") {
        throw "The packaged app did not persist the requested generation-boundary pause."
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

    $completed = Wait-ForRunState `
        -RunId $runId `
        -TargetGeneration 3 `
        -ExpectedStatus "completed"
    $racingLineComparison = $completed.snapshot.result.racingLineComparison
    $referenceLine = @($racingLineComparison.referenceLine)
    if (-not $completed.valid -or
        $completed.snapshot.status -ne "completed" -or
        $completed.snapshot.result.replay.frames.Count -eq 0 -or
        $racingLineComparison.contractVersion -ne 1 -or
        $racingLineComparison.method -ne "minimum-curvature-v1" -or
        $referenceLine.Count -lt 3 -or
        $referenceLine.Count -gt 64 -or
        $referenceLine[0][0] -ne $referenceLine[-1][0] -or
        $referenceLine[0][1] -ne $referenceLine[-1][1]) {
        throw "The packaged app did not complete training and retain replay frames."
    }
    Assert-LoopbackOnly -AppProcess $secondProcess
    Stop-AcceptanceApp -AppProcess $secondProcess
    $secondProcess = $null

    Write-Host "Phase 9 release acceptance passed."
    Write-Host "Archive SHA-256: $actualHash"
    Write-Host "Run restored and completed: $runId"
    Write-Host "Packaged minimum-curvature result contract verified."
    Write-Host "Outside-ZIP executable started successfully: $directExecutable"
    Write-Host "EvoRacer.exe started directly and owned the loopback service."
    Write-Host "Packaged runtime used loopback only and spawned no external Node.js or Python process."
}
finally {
    if ($null -ne $firstProcess -and -not $firstProcess.HasExited) {
        Stop-AcceptanceApp -AppProcess $firstProcess
    }
    if ($null -ne $secondProcess -and -not $secondProcess.HasExited) {
        Stop-AcceptanceApp -AppProcess $secondProcess
    }
}
