param(
    [Parameter(Mandatory)]
    [string] $CertificateThumbprint,

    [ValidateSet("CurrentUser", "LocalMachine")]
    [string] $CertificateStoreLocation = "CurrentUser",

    [Parameter(Mandatory)]
    [string] $TimestampUrl,

    [string] $SignToolPath
)

$ErrorActionPreference = "Stop"

function Assert-LastExitCode {
    param([Parameter(Mandatory)][string] $Label)

    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE."
    }
}

function Resolve-SignTool {
    param([string] $RequestedPath)

    if ($RequestedPath) {
        $resolved = (Resolve-Path -LiteralPath $RequestedPath).Path
        if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
            throw "The requested SignTool path is not a file: $resolved"
        }
        return $resolved
    }

    $command = Get-Command signtool.exe -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $kitRoots = @(
        "C:\Program Files (x86)\Windows Kits\10\bin",
        "C:\Program Files\Windows Kits\10\bin"
    )
    $candidates = foreach ($kitRoot in $kitRoots) {
        if (Test-Path -LiteralPath $kitRoot -PathType Container) {
            Get-ChildItem -LiteralPath $kitRoot -Filter signtool.exe -File -Recurse `
                -ErrorAction SilentlyContinue |
                Where-Object { $_.DirectoryName -match "\\x64$" }
        }
    }
    $selected = $candidates | Sort-Object FullName -Descending | Select-Object -First 1
    if (-not $selected) {
        throw "SignTool was not found. Install the Windows SDK or pass -SignToolPath."
    }
    return $selected.FullName
}

$repoRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$artifactRoot = Join-Path $repoRoot "release"
$runnableRoot = Join-Path $artifactRoot "EvoRacer"
$executable = Join-Path $runnableRoot "EvoRacer.exe"
$zipPath = Join-Path $artifactRoot "EvoRacer-Windows-x64.zip"
$checksumPath = "$zipPath.sha256"

foreach ($target in @($executable, $zipPath, $checksumPath)) {
    if (-not $target.StartsWith("$artifactRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to modify a signing target outside the release directory: $target"
    }
}
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    throw "Build the release before signing: $executable"
}

$thumbprint = ($CertificateThumbprint -replace "\s", "").ToUpperInvariant()
if ($thumbprint -notmatch "^[0-9A-F]{40}$") {
    throw "CertificateThumbprint must contain exactly 40 hexadecimal characters."
}
$storeRoot = if ($CertificateStoreLocation -eq "LocalMachine") {
    "Cert:\LocalMachine\My"
}
else {
    "Cert:\CurrentUser\My"
}
$certificate = Get-Item -LiteralPath (Join-Path $storeRoot $thumbprint) -ErrorAction SilentlyContinue
if (-not $certificate) {
    throw "The requested code-signing certificate is not installed in $storeRoot."
}
if (-not $certificate.HasPrivateKey) {
    throw "The requested code-signing certificate has no accessible private key."
}
$now = Get-Date
if ($certificate.NotBefore -gt $now -or $certificate.NotAfter -le $now) {
    throw "The requested code-signing certificate is not currently valid."
}
$codeSigningEku = $certificate.EnhancedKeyUsageList |
    Where-Object { $_.ObjectId.Value -eq "1.3.6.1.5.5.7.3.3" }
if (-not $codeSigningEku) {
    throw "The requested certificate is not valid for code signing."
}

try {
    $timestamp = [Uri] $TimestampUrl
}
catch {
    throw "TimestampUrl must be an absolute HTTP or HTTPS URL."
}
if (-not $timestamp.IsAbsoluteUri -or $timestamp.Scheme -notin @("http", "https")) {
    throw "TimestampUrl must be an absolute HTTP or HTTPS URL."
}

$signTool = Resolve-SignTool $SignToolPath
$signArguments = @(
    "sign",
    "/sha1", $thumbprint,
    "/s", "My",
    "/fd", "SHA256",
    "/tr", $timestamp.AbsoluteUri,
    "/td", "SHA256",
    "/d", "EvoRacer AI Lab",
    "/v"
)
if ($CertificateStoreLocation -eq "LocalMachine") {
    $signArguments += "/sm"
}
$signArguments += $executable

& $signTool @signArguments
Assert-LastExitCode "Authenticode signing"
& $signTool verify /pa /all /v $executable
Assert-LastExitCode "Authenticode verification"

$signature = Get-AuthenticodeSignature -LiteralPath $executable
if ($signature.Status -ne "Valid" -or
    -not $signature.SignerCertificate -or
    $signature.SignerCertificate.Thumbprint -ne $thumbprint) {
    throw "The signed executable did not validate against the requested certificate."
}

if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -LiteralPath $runnableRoot -DestinationPath $zipPath -CompressionLevel Optimal
$checksum = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath $checksumPath `
    -Value "$checksum *EvoRacer-Windows-x64.zip" `
    -Encoding ascii

Write-Host "Signed executable: $executable"
Write-Host "Signer:            $($signature.SignerCertificate.Subject)"
Write-Host "Release ZIP:       $zipPath"
Write-Host "SHA-256:           $checksum"
