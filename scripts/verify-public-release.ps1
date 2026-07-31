param(
    [string] $Owner = "EfeErim",
    [string] $Repository = "evo-racer-ai-lab",
    [string] $Tag = "v1.1.0"
)

$ErrorActionPreference = "Stop"

function Assert-Equal {
    param(
        [Parameter(Mandatory)] $Actual,
        [Parameter(Mandatory)] $Expected,
        [Parameter(Mandatory)][string] $Label
    )

    if ($Actual -ne $Expected) {
        throw "$Label mismatch. Expected '$Expected', found '$Actual'."
    }
}

$repoRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$zipName = "EvoRacer-Windows-x64.zip"
$checksumName = "$zipName.sha256"
$localZip = Join-Path $repoRoot "release\$zipName"
$localChecksum = Join-Path $repoRoot "release\$checksumName"
$apiHeaders = @{
    Accept                 = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2026-03-10"
    "User-Agent"           = "EvoRacer-Phase11-Release-Verifier"
}

$package = Get-Content -Raw -LiteralPath (Join-Path $repoRoot "package.json") |
    ConvertFrom-Json
$packageLockPath = Join-Path $repoRoot "package-lock.json"
$packageLockText = Get-Content -Raw -LiteralPath $packageLockPath
$packageLockMatch = [regex]::Match(
    $packageLockText,
    '(?s)^\s*\{\s*"name"\s*:\s*"[^"]+",\s*"version"\s*:\s*"([^"]+)".*?' +
    '"packages"\s*:\s*\{\s*""\s*:\s*\{\s*"name"\s*:\s*"[^"]+",\s*' +
    '"version"\s*:\s*"([^"]+)"'
)
if (-not $packageLockMatch.Success) {
    throw "Could not read both package-lock.json project versions."
}
$pyproject = Get-Content -Raw -LiteralPath (Join-Path $repoRoot "pyproject.toml")
$pythonInit = Get-Content -Raw -LiteralPath (
    Join-Path $repoRoot "python\src\evo_racer\__init__.py"
)
$expectedVersion = $Tag.TrimStart("v")

Assert-Equal $package.version $expectedVersion "package.json version"
Assert-Equal $packageLockMatch.Groups[1].Value $expectedVersion "package-lock.json version"
Assert-Equal $packageLockMatch.Groups[2].Value $expectedVersion "package-lock root version"
if ($pyproject -notmatch "(?m)^version = `"$([regex]::Escape($expectedVersion))`"$") {
    throw "pyproject.toml version does not match $expectedVersion."
}
if ($pythonInit -notmatch "(?m)^__version__ = `"$([regex]::Escape($expectedVersion))`"$") {
    throw "Python package version does not match $expectedVersion."
}

foreach ($path in @($localZip, $localChecksum)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Required local release artifact is missing: $path"
    }
}

$localChecksumValue = (
    Get-Content -Raw -LiteralPath $localChecksum
).Trim().Split(" ", [System.StringSplitOptions]::RemoveEmptyEntries)[0].ToLowerInvariant()
$localZipHash = (Get-FileHash -LiteralPath $localZip -Algorithm SHA256).Hash.ToLowerInvariant()
Assert-Equal $localZipHash $localChecksumValue "Local ZIP SHA-256"

$releaseUri = "https://api.github.com/repos/$Owner/$Repository/releases/tags/$Tag"
$latestUri = "https://api.github.com/repos/$Owner/$Repository/releases/latest"
$tagRefUri = "https://api.github.com/repos/$Owner/$Repository/git/ref/tags/$Tag"
$release = Invoke-RestMethod -Uri $releaseUri -Headers $apiHeaders
$latest = Invoke-RestMethod -Uri $latestUri -Headers $apiHeaders
$tagRef = Invoke-RestMethod -Uri $tagRefUri -Headers $apiHeaders

Assert-Equal $release.tag_name $Tag "Release tag"
Assert-Equal $latest.tag_name $Tag "Latest release tag"
Assert-Equal $release.draft $false "Release draft state"
Assert-Equal $release.prerelease $false "Release prerelease state"
Assert-Equal $tagRef.object.type "tag" "Git tag object type"

$tagObject = Invoke-RestMethod -Uri $tagRef.object.url -Headers $apiHeaders
Assert-Equal $tagObject.object.type "commit" "Annotated tag target type"
$localTagCommit = (& git -C $repoRoot rev-list -n 1 $Tag).Trim()
if ($LASTEXITCODE -ne 0 -or -not $localTagCommit) {
    throw "Could not resolve local tag $Tag to a commit."
}
Assert-Equal $tagObject.object.sha $localTagCommit "Public annotated tag commit"

$compareUri = "https://api.github.com/repos/$Owner/$Repository/compare/$localTagCommit...main"
$comparison = Invoke-RestMethod -Uri $compareUri -Headers $apiHeaders
if ($comparison.status -notin @("identical", "ahead")) {
    throw "The release tag commit is not on the public main branch."
}

$zipAsset = @($release.assets | Where-Object { $_.name -eq $zipName })
$checksumAsset = @($release.assets | Where-Object { $_.name -eq $checksumName })
Assert-Equal $zipAsset.Count 1 "ZIP asset count"
Assert-Equal $checksumAsset.Count 1 "Checksum asset count"
Assert-Equal $zipAsset[0].state "uploaded" "ZIP asset state"
Assert-Equal $checksumAsset[0].state "uploaded" "Checksum asset state"
Assert-Equal $zipAsset[0].size (Get-Item -LiteralPath $localZip).Length "ZIP asset size"
Assert-Equal $checksumAsset[0].size (Get-Item -LiteralPath $localChecksum).Length "Checksum asset size"

$downloadRoot = Join-Path $repoRoot ".runtime_tmp\phase11-public-release"
$runtimeRoot = Join-Path $repoRoot ".runtime_tmp"
if (-not (Test-Path -LiteralPath $runtimeRoot)) {
    New-Item -ItemType Directory -Path $runtimeRoot | Out-Null
}
$resolvedRuntimeRoot = (Resolve-Path -LiteralPath $runtimeRoot).Path
if (-not $downloadRoot.StartsWith("$resolvedRuntimeRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to replace a download path outside .runtime_tmp: $downloadRoot"
}
if (Test-Path -LiteralPath $downloadRoot) {
    Remove-Item -LiteralPath $downloadRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $downloadRoot | Out-Null

try {
    $downloadedZip = Join-Path $downloadRoot $zipName
    $downloadedChecksum = Join-Path $downloadRoot $checksumName
    Invoke-WebRequest -Uri $zipAsset[0].browser_download_url -OutFile $downloadedZip
    Invoke-WebRequest -Uri $checksumAsset[0].browser_download_url -OutFile $downloadedChecksum

    $publishedChecksum = (
        Get-Content -Raw -LiteralPath $downloadedChecksum
    ).Trim().Split(" ", [System.StringSplitOptions]::RemoveEmptyEntries)[0].ToLowerInvariant()
    $downloadedHash = (
        Get-FileHash -LiteralPath $downloadedZip -Algorithm SHA256
    ).Hash.ToLowerInvariant()

    Assert-Equal $publishedChecksum $localChecksumValue "Published checksum value"
    Assert-Equal $downloadedHash $publishedChecksum "Downloaded ZIP SHA-256"

    Write-Host "Phase 11 public release verification passed."
    Write-Host "Release: $($release.html_url)"
    Write-Host "Tag:     $Tag"
    Write-Host "SHA-256: $downloadedHash"
}
finally {
    if (Test-Path -LiteralPath $downloadRoot) {
        Remove-Item -LiteralPath $downloadRoot -Recurse -Force
    }
}
