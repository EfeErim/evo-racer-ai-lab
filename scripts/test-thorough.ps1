$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
. (Join-Path $PSScriptRoot "venv-python.ps1")
$pythonPath = Resolve-VenvPython $repoRoot
$reportPath = Join-Path $repoRoot ".runtime_tmp\thorough\acceptance.json"

Push-Location -LiteralPath $repoRoot
try {
    & $pythonPath python/tools/hardening.py --thorough-report $reportPath
    if ($LASTEXITCODE -ne 0) {
        throw "Thorough preset acceptance failed."
    }
}
finally {
    Pop-Location
}
