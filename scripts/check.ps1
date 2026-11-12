$ErrorActionPreference = "Stop"

# Every source check, in order, stopping at the first failure.
$steps = @(
    @{ Name = "Format (TypeScript, CSS, docs)"; Script = "format:check" },
    @{ Name = "Documentation links"; Script = "check:docs" },
    @{ Name = "Lint (TypeScript)"; Script = "lint" },
    @{ Name = "Types (TypeScript)"; Script = "typecheck" },
    @{ Name = "Tests (Vitest)"; Script = "test" },
    @{ Name = "Format (Python)"; Script = "format:python:check" },
    @{ Name = "Lint (Python)"; Script = "lint:python" },
    @{ Name = "Types (Python)"; Script = "typecheck:python" },
    @{ Name = "Tests (pytest)"; Script = "test:python" },
    @{ Name = "Production build"; Script = "build" }
)

$repoRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
Push-Location -LiteralPath $repoRoot
try {
    $index = 0
    foreach ($step in $steps) {
        $index += 1
        Write-Host "[$index/$($steps.Count)] $($step.Name)"
        npm run --silent $step.Script
        if ($LASTEXITCODE -ne 0) {
            throw "Check failed: $($step.Name) (npm run $($step.Script))."
        }
    }
    Write-Host "All $($steps.Count) checks passed."
}
finally {
    Pop-Location
}
