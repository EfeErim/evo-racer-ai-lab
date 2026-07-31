$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$pythonPath = Join-Path $repoRoot ".venv\Scripts\python.exe"
$reportPath = Join-Path $repoRoot ".runtime_tmp\thorough\acceptance.json"

Push-Location -LiteralPath $repoRoot
try {
    & $pythonPath -m evo_racer.hardening --thorough-report $reportPath
    if ($LASTEXITCODE -ne 0) {
        throw "Thorough preset acceptance failed."
    }
}
finally {
    Pop-Location
}
