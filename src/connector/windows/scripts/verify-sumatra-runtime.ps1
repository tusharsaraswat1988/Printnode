$ErrorActionPreference = "Stop"

. (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "sumatra-runtime.ps1")

$manifest = Get-SumatraManifest
$vendoredExecutablePath = Get-SumatraVendoredExecutablePath

try {
  Assert-SumatraExecutable -Path $vendoredExecutablePath -Label "Vendored SumatraPDF executable"
} catch {
  if ($_.Exception.Message -like "*is missing at*") {
    throw "SumatraPDF $($manifest.version) is not available in $vendoredExecutablePath. Production builds are offline-only and will not fetch binaries during packaging. Restore the vendored runtime from source control or run 'npm run prepare:sumatra' in a connected environment first."
  }

  throw
}

Write-Host "Verified vendored SumatraPDF $($manifest.version) runtime at $vendoredExecutablePath"
