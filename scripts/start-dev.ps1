# Runs the Python service and the Vite dev server together; Ctrl+C stops both.
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)

$service = Start-Process -FilePath ".venv\Scripts\python.exe" `
    -ArgumentList "-m", "evo_racer.service" -PassThru -WindowStyle Hidden
try {
    npx vite --open
}
finally {
    Stop-Process -Id $service.Id -ErrorAction SilentlyContinue
}
