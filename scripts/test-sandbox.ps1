<#
Opens the packaged application in a disposable, network-less Windows Sandbox
(roadmap step 4). Windows Sandbox must be enabled once, from an administrator
PowerShell, followed by a restart:

  Enable-WindowsOptionalFeature -Online -FeatureName Containers-DisposableClientVM

Build the package first with `npm run build:release`. The sandbox maps the
release read-only, runs scripts\sandbox\sandbox-acceptance.ps1 at sign-in, and
writes its evidence to .runtime_tmp\sandbox\evidence on this machine.
#>
param([switch] $NoLaunch)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$appRoot = Join-Path $repoRoot "release\EvoRacer"
$executable = Join-Path $appRoot "EvoRacer.exe"
$acceptanceRoot = Join-Path $PSScriptRoot "sandbox"
$workRoot = Join-Path $repoRoot ".runtime_tmp\sandbox"
$evidenceRoot = Join-Path $workRoot "evidence"
$configPath = Join-Path $workRoot "EvoRacer-offline.wsb"

if (-not (Test-Path -LiteralPath $executable)) {
    throw "Build the release first: npm run build:release (missing $executable)"
}
$sandboxExe = Join-Path $env:SystemRoot "System32\WindowsSandbox.exe"
if (-not $NoLaunch -and -not (Test-Path -LiteralPath $sandboxExe)) {
    throw "Windows Sandbox is not enabled. Run, as administrator: Enable-WindowsOptionalFeature -Online -FeatureName Containers-DisposableClientVM, then restart."
}

# A new evidence folder each time, so old results cannot be mistaken for new ones.
if (Test-Path -LiteralPath $evidenceRoot) {
    $resolved = (Resolve-Path -LiteralPath $evidenceRoot).Path
    if (-not $resolved.StartsWith("$repoRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to replace evidence outside the repository."
    }
    Remove-Item -LiteralPath $evidenceRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null

function ConvertTo-XmlText([string] $Value) {
    [System.Security.SecurityElement]::Escape($Value)
}

# Paths must be absolute: Windows Sandbox does not support relative HostFolder paths.
$config = @"
<Configuration>
  <Networking>Disable</Networking>
  <ClipboardRedirection>Disable</ClipboardRedirection>
  <PrinterRedirection>Disable</PrinterRedirection>
  <AudioInput>Disable</AudioInput>
  <VideoInput>Disable</VideoInput>
  <MemoryInMB>4096</MemoryInMB>
  <MappedFolders>
    <MappedFolder>
      <HostFolder>$(ConvertTo-XmlText $appRoot)</HostFolder>
      <SandboxFolder>C:\EvoRacer</SandboxFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
    <MappedFolder>
      <HostFolder>$(ConvertTo-XmlText $acceptanceRoot)</HostFolder>
      <SandboxFolder>C:\Acceptance</SandboxFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
    <MappedFolder>
      <HostFolder>$(ConvertTo-XmlText $evidenceRoot)</HostFolder>
      <SandboxFolder>C:\Evidence</SandboxFolder>
      <ReadOnly>false</ReadOnly>
    </MappedFolder>
  </MappedFolders>
  <LogonCommand>
    <Command>cmd.exe /c start "EvoRacer acceptance" powershell.exe -NoProfile -NoExit -ExecutionPolicy Bypass -File C:\Acceptance\sandbox-acceptance.ps1</Command>
  </LogonCommand>
</Configuration>
"@
Set-Content -LiteralPath $configPath -Value $config -Encoding UTF8
[xml] (Get-Content -LiteralPath $configPath -Raw) | Out-Null

$hash = (Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host "Sandbox configuration: $configPath"
Write-Host "EvoRacer.exe SHA-256: $hash"
Write-Host "Evidence will be written to: $evidenceRoot"
if ($NoLaunch) {
    return
}
Start-Process -FilePath $configPath
Write-Host "Windows Sandbox is starting. Follow the instructions in its PowerShell window."
Write-Host "When it says Result, read $evidenceRoot\sandbox-acceptance.json here."
