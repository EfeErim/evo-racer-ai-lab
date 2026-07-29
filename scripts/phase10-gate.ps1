$ErrorActionPreference = "Stop"

function Invoke-GateStep {
    param(
        [Parameter(Mandatory)]
        [string] $Name,

        [Parameter(Mandatory)]
        [scriptblock] $Action
    )

    Write-Host "==> $Name"
    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed with exit code $LASTEXITCODE."
    }
}

$repoRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$reportPath = Join-Path $repoRoot ".runtime_tmp\phase10\performance.json"
$python = Join-Path $repoRoot ".venv\Scripts\python.exe"

Push-Location -LiteralPath $repoRoot
try {
    Invoke-GateStep "Full automated regression suite" { npm run check --silent }
    Invoke-GateStep "Development loopback smoke" { npm run smoke:m0 --silent }
    Invoke-GateStep "Three-seed, three-preset algorithm matrix" {
        & $python -m evo_racer.hardening `
            --fixture contracts/phase10-regression.json `
            --report $reportPath
    }
    Invoke-GateStep "Windows release build" { npm run build:release --silent }
    Invoke-GateStep "Clean-runtime release acceptance" { npm run test:release --silent }
    Invoke-GateStep "Git whitespace validation" { git diff --check }

    Write-Host "Phase 10 gate passed."
    Write-Host "Performance report: $reportPath"
}
finally {
    Pop-Location
}
