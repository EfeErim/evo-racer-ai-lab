$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$pythonPath = Join-Path $repoRoot ".venv\Scripts\python.exe"
$dataRoot = Join-Path $repoRoot ".runtime_tmp\e2e-data"
$staticRoot = Join-Path $repoRoot "dist"

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
    --data-root $dataRoot `
    --static-root $staticRoot
