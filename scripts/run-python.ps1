$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "venv-python.ps1")

$python = Resolve-VenvPython (Split-Path -Parent $PSScriptRoot)
& $python @args
exit $LASTEXITCODE
