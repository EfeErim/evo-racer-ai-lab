$ErrorActionPreference = "Stop"

function Assert-LastExitCode {
    param([Parameter(Mandatory)][string] $Label)

    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE."
    }
}

$repoRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$pythonPath = Join-Path $repoRoot ".venv\Scripts\python.exe"
$buildRoot = Join-Path $repoRoot ".runtime_tmp\phase9-release"
$artifactRoot = Join-Path $repoRoot "release"
$bundleRoot = Join-Path $buildRoot "dist\EvoRacer"
$zipPath = Join-Path $artifactRoot "EvoRacer-Windows-x64.zip"
$checksumPath = "$zipPath.sha256"

$runtimeRoot = Split-Path -Parent $buildRoot
if (-not (Test-Path -LiteralPath $runtimeRoot)) {
    New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
}

foreach ($target in @($buildRoot, $artifactRoot)) {
    $resolvedParent = (Resolve-Path -LiteralPath (Split-Path -Parent $target)).Path
    if (-not $target.StartsWith("$repoRoot\", [System.StringComparison]::OrdinalIgnoreCase) -or
        -not $resolvedParent.StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to replace release path outside the repository: $target"
    }
    if (Test-Path -LiteralPath $target) {
        Remove-Item -LiteralPath $target -Recurse -Force
    }
}

New-Item -ItemType Directory -Path $buildRoot, $artifactRoot -Force | Out-Null

Push-Location -LiteralPath $repoRoot
try {
    npm run build --silent
    Assert-LastExitCode "Production frontend build"

    & $pythonPath -m PyInstaller `
        --noconfirm `
        --clean `
        --distpath (Join-Path $buildRoot "dist") `
        --workpath (Join-Path $buildRoot "work") `
        (Join-Path $repoRoot "packaging\EvoRacer.spec")
    Assert-LastExitCode "PyInstaller onedir build"

    if (-not (Test-Path -LiteralPath (Join-Path $bundleRoot "EvoRacer.exe"))) {
        throw "PyInstaller did not produce EvoRacer.exe."
    }

    $licenseRoot = Join-Path $bundleRoot "licenses"
    New-Item -ItemType Directory -Path $licenseRoot -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $repoRoot "README.md") -Destination $bundleRoot
    Copy-Item `
        -LiteralPath (Join-Path $repoRoot "docs\user-guide.md") `
        -Destination (Join-Path $bundleRoot "USER-GUIDE.md")
    Copy-Item -LiteralPath (Join-Path $repoRoot "packaging\THIRD-PARTY-NOTICES.txt") -Destination $bundleRoot

    $pythonLicense = & $pythonPath -c "import sys; from pathlib import Path; print(Path(sys.base_prefix) / 'LICENSE.txt')"
    Assert-LastExitCode "Python license lookup"
    Copy-Item -LiteralPath $pythonLicense.Trim() -Destination (Join-Path $licenseRoot "PYTHON-LICENSE.txt")

    $pyInstallerLicenseTarget = Join-Path $licenseRoot "PYINSTALLER-LICENSE.txt"
    & $pythonPath -c "from importlib.metadata import distribution; from shutil import copyfile; import sys; dist=distribution('pyinstaller'); copyfile(dist.locate_file('pyinstaller-6.21.0.dist-info/licenses/COPYING.txt'), sys.argv[1])" $pyInstallerLicenseTarget
    Assert-LastExitCode "PyInstaller license copy"

    Compress-Archive -LiteralPath $bundleRoot -DestinationPath $zipPath -CompressionLevel Optimal
    $checksum = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
    Set-Content -LiteralPath $checksumPath -Value "$checksum *EvoRacer-Windows-x64.zip" -Encoding ascii

    Write-Host "Release ZIP: $zipPath"
    Write-Host "SHA-256:     $checksum"
}
finally {
    Pop-Location
}
