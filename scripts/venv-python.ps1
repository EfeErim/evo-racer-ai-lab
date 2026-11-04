function Resolve-VenvPython {
    param(
        [Parameter(Mandatory)]
        [string] $RepoRoot
    )

    $pythonPath = Join-Path $RepoRoot ".venv\Scripts\python.exe"
    if (-not (Test-Path -LiteralPath $pythonPath)) {
        throw "Python virtual environment not found at $pythonPath. Run ./scripts/setup.ps1 first."
    }
    return $pythonPath
}
