$ErrorActionPreference = "Stop"

function Wait-ForHttp {
    param(
        [Parameter(Mandatory)]
        [string] $Uri,

        [int] $TimeoutSeconds = 20
    )

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        try {
            return Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 1
        }
        catch {
            Start-Sleep -Milliseconds 200
        }
    } while ([DateTime]::UtcNow -lt $deadline)

    throw "Timed out waiting for $Uri."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$pythonPath = Join-Path $repoRoot ".venv\Scripts\python.exe"
$vitePath = Join-Path $repoRoot "node_modules\vite\bin\vite.js"
$frontendUri = "http://127.0.0.1:4173"
$serviceUri = "http://127.0.0.1:8765/health"

if (-not (Test-Path -LiteralPath $pythonPath) -or -not (Test-Path -LiteralPath $vitePath)) {
    throw "Development dependencies are missing. Run ./scripts/setup.ps1 first."
}

Push-Location -LiteralPath $repoRoot
$serviceProcess = $null
$frontendProcess = $null

try {
    $serviceProcess = Start-Process `
        -FilePath $pythonPath `
        -ArgumentList @("-m", "evo_racer.service") `
        -PassThru `
        -WindowStyle Hidden

    $frontendProcess = Start-Process `
        -FilePath "node.exe" `
        -ArgumentList @(
            ".\node_modules\vite\bin\vite.js",
            "--host",
            "127.0.0.1",
            "--port",
            "4173",
            "--strictPort"
        ) `
        -WorkingDirectory $repoRoot `
        -PassThru `
        -WindowStyle Hidden

    $serviceResponse = Wait-ForHttp -Uri $serviceUri
    $frontendResponse = Wait-ForHttp -Uri $frontendUri
    $servicePayload = $serviceResponse.Content | ConvertFrom-Json

    if ($servicePayload.status -ne "ready" -or $servicePayload.host -ne "127.0.0.1") {
        throw "The Python service health contract is invalid."
    }

    if ($frontendResponse.Content -notmatch "EvoRacer AI Lab") {
        throw "The frontend response does not contain the product title."
    }

    Write-Host "M0 smoke passed: frontend=$frontendUri python=$serviceUri"
}
finally {
    foreach ($process in @($frontendProcess, $serviceProcess)) {
        if ($null -ne $process -and -not $process.HasExited) {
            Stop-Process -Id $process.Id
            Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
        }
    }
    Pop-Location
}
