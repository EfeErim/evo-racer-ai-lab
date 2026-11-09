$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$pythonPath = Join-Path $repoRoot ".venv\Scripts\python.exe"
$dataRoot = Join-Path $repoRoot ".runtime_tmp\e2e-data"
$staticRoot = Join-Path $repoRoot "dist"
$port = if ($env:EVORACER_E2E_PORT) { [int] $env:EVORACER_E2E_PORT } else { 8765 }

if (Test-Path -LiteralPath $dataRoot) {
    Remove-Item -LiteralPath $dataRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $dataRoot | Out-Null

& $pythonPath -m evo_racer.launcher `
    --no-browser `
    --port $port `
    --data-root $dataRoot `
    --static-root $staticRoot
