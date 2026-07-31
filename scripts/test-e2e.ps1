$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
Push-Location -LiteralPath $repoRoot
try {
    npm run build --silent
    if ($LASTEXITCODE -ne 0) {
        throw "Production frontend build failed."
    }
    npx playwright test
    if ($LASTEXITCODE -ne 0) {
        throw "Playwright end-to-end test failed."
    }
}
finally {
    Pop-Location
}
