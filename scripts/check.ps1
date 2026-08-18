$ErrorActionPreference = "Stop"

function Invoke-Check {
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

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $repoRoot

try {
    Invoke-Check "TypeScript formatting" { npm run format:check --silent }
    Invoke-Check "TypeScript lint" { npm run lint --silent }
    Invoke-Check "TypeScript type-check" { npm run typecheck --silent }
    Invoke-Check "TypeScript tests" { npm run test --silent }
    Invoke-Check "PowerShell syntax" {
        $syntaxErrors = @()
        foreach ($scriptPath in Get-ChildItem -LiteralPath (Join-Path $repoRoot "scripts") -Filter "*.ps1" -File) {
            $tokens = $null
            $errors = $null
            [System.Management.Automation.Language.Parser]::ParseFile(
                $scriptPath.FullName,
                [ref] $tokens,
                [ref] $errors
            ) | Out-Null
            $syntaxErrors += $errors
        }
        if ($syntaxErrors.Count -gt 0) {
            $syntaxErrors | ForEach-Object { Write-Error $_.Message }
            throw "PowerShell syntax validation failed."
        }
    }
    Invoke-Check "Python formatting" { npm run format:python:check --silent }
    Invoke-Check "Python lint" { npm run lint:python --silent }
    Invoke-Check "Python type-check" { npm run typecheck:python --silent }
    Invoke-Check "Python tests" { npm run test:python --silent }
    Invoke-Check "Production frontend build" { npm run build --silent }
}
finally {
    Pop-Location
}
