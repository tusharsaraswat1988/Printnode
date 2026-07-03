$ErrorActionPreference = "Stop"

. (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "sumatra-runtime.ps1")
$manifest = Get-SumatraManifest

try {
  $result = Update-SumatraVendoredRuntime
  if ($result.Status -eq "cached") {
    Write-Host "Verified cached SumatraPDF $($manifest.version) runtime at $($result.ExecutablePath)"
    exit 0
  }

  Write-Host "Downloaded, verified, and vendored SumatraPDF $($manifest.version) at $($result.ExecutablePath)"
} catch {
  Write-Error $_
  exit 1
}
