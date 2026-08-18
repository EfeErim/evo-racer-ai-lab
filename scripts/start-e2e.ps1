$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$pythonPath = Join-Path $repoRoot ".venv\Scripts\python.exe"
$dataRoot = Join-Path $repoRoot ".runtime_tmp\e2e-data"
$staticRoot = Join-Path $repoRoot "dist"
$port = 8765
if (-not [string]::IsNullOrWhiteSpace($env:EVORACER_E2E_PORT)) {
    $parsedPort = 0
    if (-not [int]::TryParse($env:EVORACER_E2E_PORT, [ref] $parsedPort) -or $parsedPort -lt 1 -or $parsedPort -gt 65535) {
        throw "EVORACER_E2E_PORT must be an integer from 1 through 65535."
    }
    $port = $parsedPort
}

if (Test-Path -LiteralPath $dataRoot) {
    $resolved = (Resolve-Path -LiteralPath $dataRoot).Path
    if (-not $resolved.StartsWith("$repoRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to replace E2E data outside the repository."
    }
    Remove-Item -LiteralPath $dataRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $dataRoot | Out-Null

& $pythonPath -m evo_racer.launcher `
    --no-browser `
    --port $port `
    --data-root $dataRoot `
    --static-root $staticRoot
