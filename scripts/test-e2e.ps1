param(
    [ValidateRange(0, 65535)]
    [int] $Port = 0,
    [string] $Grep = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
if ($Port -gt 0) {
    $env:EVORACER_E2E_PORT = [string] $Port
}
if ($env:EVORACER_E2E_PORT) {
    $env:VITE_EVORACER_SERVICE_ORIGIN = "http://127.0.0.1:$([int] $env:EVORACER_E2E_PORT)"
}
Push-Location -LiteralPath $repoRoot
try {
    npm run build --silent
    if ($LASTEXITCODE -ne 0) {
        throw "Production frontend build failed."
    }
    $playwrightArguments = @("playwright", "test")
    if (-not [string]::IsNullOrWhiteSpace($Grep)) {
        $playwrightArguments += @("--grep", $Grep)
    }
    npx @playwrightArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Playwright end-to-end test failed."
    }
}
finally {
    Pop-Location
}
