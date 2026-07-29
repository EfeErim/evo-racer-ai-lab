param(
    [switch] $NoBrowser
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$pythonPath = Join-Path $repoRoot ".venv\Scripts\python.exe"
$vitePath = Join-Path $repoRoot "node_modules\vite\bin\vite.js"

if (-not (Test-Path -LiteralPath $pythonPath) -or -not (Test-Path -LiteralPath $vitePath)) {
    throw "Development dependencies are missing. Run ./scripts/setup.ps1 first."
}

Push-Location -LiteralPath $repoRoot
$serviceProcess = $null

try {
    $serviceProcess = Start-Process `
        -FilePath $pythonPath `
        -ArgumentList @("-m", "evo_racer.service") `
        -PassThru `
        -WindowStyle Hidden

    $viteArguments = @($vitePath, "--host", "127.0.0.1")
    if (-not $NoBrowser) {
        $viteArguments += "--open"
    }

    Write-Host "Python service: http://127.0.0.1:8765/health"
    Write-Host "Frontend:       http://127.0.0.1:5173"
    Write-Host "Press Ctrl+C to stop both processes."
    & node $viteArguments
}
finally {
    if ($null -ne $serviceProcess -and -not $serviceProcess.HasExited) {
        Stop-Process -Id $serviceProcess.Id
        Wait-Process -Id $serviceProcess.Id -ErrorAction SilentlyContinue
    }
    Pop-Location
}
