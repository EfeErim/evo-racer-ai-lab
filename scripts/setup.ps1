$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $repoRoot

try {
    if (-not (Test-Path -LiteralPath ".venv\Scripts\python.exe")) {
        py -3.13 -m venv .venv
        if ($LASTEXITCODE -ne 0) {
            throw "Python 3.13 virtual environment creation failed."
        }
    }

    & ".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -r requirements-dev.lock
    if ($LASTEXITCODE -ne 0) {
        throw "Locked Python dependency installation failed."
    }

    & ".venv\Scripts\python.exe" -m pip install --disable-pip-version-check --no-deps --no-build-isolation -e .
    if ($LASTEXITCODE -ne 0) {
        throw "Editable EvoRacer Python package installation failed."
    }

    npm ci
    if ($LASTEXITCODE -ne 0) {
        throw "Locked Node dependency installation failed."
    }

    Write-Host "EvoRacer development setup is ready."
}
finally {
    Pop-Location
}
