$ErrorActionPreference = "Stop"

function Assert-LastExitCode {
    param([Parameter(Mandatory)][string] $Label)

    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE."
    }
}

$repoRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$pythonPath = Join-Path $repoRoot ".venv\Scripts\python.exe"
$buildRoot = Join-Path $repoRoot ".runtime_tmp\portable-release"
$cacheRoot = Join-Path $repoRoot ".runtime_tmp\release-cache"
$artifactRoot = Join-Path $repoRoot "release"
$bundleRoot = Join-Path $buildRoot "EvoRacer"
$runtimeRoot = Join-Path $bundleRoot "runtime"
$appRoot = Join-Path $bundleRoot "app"
$zipPath = Join-Path $artifactRoot "EvoRacer-Windows-x64.zip"
$checksumPath = "$zipPath.sha256"
$pythonVersion = "3.13.5"
$pythonArchiveName = "python-$pythonVersion-embed-amd64.zip"
$pythonArchive = Join-Path $cacheRoot $pythonArchiveName
$pythonArchiveUrl = "https://www.python.org/ftp/python/$pythonVersion/$pythonArchiveName"
$pythonArchiveSha256 = "7d2650fd9d1b9d002d4a315d5f354247fd6a44f30517c7ef577b08f57a0fb6d9"

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

New-Item -ItemType Directory -Path $buildRoot, $cacheRoot, $artifactRoot -Force | Out-Null
if (-not (Test-Path -LiteralPath $pythonArchive)) {
    Invoke-WebRequest -Uri $pythonArchiveUrl -OutFile $pythonArchive
}
$actualPythonHash = (Get-FileHash -LiteralPath $pythonArchive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualPythonHash -ne $pythonArchiveSha256) {
    throw "Official embedded Python archive SHA-256 mismatch."
}

Push-Location -LiteralPath $repoRoot
try {
    npm run build --silent
    Assert-LastExitCode "Production frontend build"

    New-Item -ItemType Directory -Path $bundleRoot, $runtimeRoot, $appRoot | Out-Null
    Expand-Archive -LiteralPath $pythonArchive -DestinationPath $runtimeRoot
    Copy-Item -LiteralPath (Join-Path $repoRoot "python\src\evo_racer") -Destination $appRoot -Recurse
    Copy-Item -LiteralPath (Join-Path $repoRoot "dist") -Destination (Join-Path $appRoot "web") -Recurse

    $sitePackages = Join-Path $runtimeRoot "Lib\site-packages"
    New-Item -ItemType Directory -Path $sitePackages -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $repoRoot ".venv\Lib\site-packages\neat") -Destination $sitePackages -Recurse
    Copy-Item -LiteralPath (Join-Path $repoRoot ".venv\Lib\site-packages\neat_python-2.0.0.dist-info") -Destination $sitePackages -Recurse

    @(
        "python313.zip"
        "."
        "Lib\site-packages"
        "..\app"
    ) | Set-Content -LiteralPath (Join-Path $runtimeRoot "python313._pth") -Encoding ascii

    @(
        "@echo off"
        "setlocal"
        'set "EVORACER_PORTABLE_ROOT=%~dp0"'
        'start "" "%EVORACER_PORTABLE_ROOT%runtime\pythonw.exe" -m evo_racer.launcher --static-root "%EVORACER_PORTABLE_ROOT%app\web"'
        "endlocal"
    ) | Set-Content -LiteralPath (Join-Path $bundleRoot "EvoRacer.cmd") -Encoding ascii

    $licenseRoot = Join-Path $bundleRoot "licenses"
    New-Item -ItemType Directory -Path $licenseRoot -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $repoRoot "README.md") -Destination $bundleRoot
    Copy-Item -LiteralPath (Join-Path $repoRoot "docs\user-guide.md") -Destination (Join-Path $bundleRoot "USER-GUIDE.md")
    Copy-Item -LiteralPath (Join-Path $repoRoot "packaging\THIRD-PARTY-NOTICES.txt") -Destination $bundleRoot
    Copy-Item -LiteralPath (Join-Path $runtimeRoot "LICENSE.txt") -Destination (Join-Path $licenseRoot "PYTHON-LICENSE.txt")
    Copy-Item -LiteralPath (Join-Path $sitePackages "neat_python-2.0.0.dist-info\licenses\LICENSE") -Destination (Join-Path $licenseRoot "NEAT-PYTHON-LICENSE.txt")

    $runtimePython = Join-Path $runtimeRoot "python.exe"
    & $runtimePython -c "import evo_racer, neat; print(evo_racer.__file__); print(neat.__file__)"
    Assert-LastExitCode "Portable runtime import check"
    if (Test-Path -LiteralPath (Join-Path $bundleRoot "EvoRacer.exe")) {
        throw "The portable bundle must not contain a frozen EvoRacer.exe."
    }

    Compress-Archive -LiteralPath $bundleRoot -DestinationPath $zipPath -CompressionLevel Optimal
    $checksum = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
    Set-Content -LiteralPath $checksumPath -Value "$checksum *EvoRacer-Windows-x64.zip" -Encoding ascii

    Write-Host "Portable release ZIP: $zipPath"
    Write-Host "SHA-256:            $checksum"
}
finally {
    Pop-Location
}
