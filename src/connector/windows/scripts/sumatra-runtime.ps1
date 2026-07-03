$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
$vendorDir = Join-Path $rootDir "resources\\vendor"
$manifestPath = Join-Path $vendorDir "sumatra-manifest.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$vendoredExecutablePath = Join-Path $vendorDir $manifest.bundledExecutableFileName

function Get-SumatraManifest {
  return $manifest
}

function Get-SumatraVendoredExecutablePath {
  return $vendoredExecutablePath
}

function Assert-FileExists {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Label
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "$Label is missing at $Path"
  }
}

function Assert-Sha256 {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$ExpectedHash,
    [Parameter(Mandatory = $true)][string]$Label
  )

  Assert-FileExists -Path $Path -Label $Label
  $actualHash = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant()
  $expected = $ExpectedHash.ToUpperInvariant()

  if ($actualHash -ne $expected) {
    throw "$Label checksum mismatch. Expected $expected, got $actualHash. Delete the corrupted file and restore or refresh the cached runtime before packaging."
  }
}

function Assert-AuthenticodeSignature {
  param(
    [Parameter(Mandatory = $true)][string]$Path
  )

  $signature = Get-AuthenticodeSignature -LiteralPath $Path
  if ($signature.Status -ne "Valid") {
    throw "Authenticode signature is not valid for $Path. Status: $($signature.Status). $($signature.StatusMessage)"
  }

  $expectedThumbprint = $manifest.signature.thumbprint.ToUpperInvariant()
  $actualThumbprint = $signature.SignerCertificate.Thumbprint.ToUpperInvariant()
  if ($actualThumbprint -ne $expectedThumbprint) {
    throw "Unexpected SumatraPDF signer thumbprint. Expected $expectedThumbprint, got $actualThumbprint."
  }
}

function Assert-SumatraExecutable {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $false)][string]$Label = "SumatraPDF executable"
  )

  Assert-Sha256 -Path $Path -ExpectedHash $manifest.bundledExecutableSha256 -Label $Label
  Assert-AuthenticodeSignature -Path $Path
}

function Copy-ItemAtomic {
  param(
    [Parameter(Mandatory = $true)][string]$SourcePath,
    [Parameter(Mandatory = $true)][string]$DestinationPath
  )

  $destinationDir = Split-Path -Parent $DestinationPath
  New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null
  $tempPath = Join-Path $destinationDir ("{0}.{1}.tmp" -f (Split-Path -Leaf $DestinationPath), $PID)
  Copy-Item -LiteralPath $SourcePath -Destination $tempPath -Force
  Move-Item -LiteralPath $tempPath -Destination $DestinationPath -Force
}

function Update-SumatraVendoredRuntime {
  New-Item -ItemType Directory -Force -Path $vendorDir | Out-Null

  if (Test-Path -LiteralPath $vendoredExecutablePath) {
    Assert-SumatraExecutable -Path $vendoredExecutablePath -Label "Vendored SumatraPDF executable"
    return @{
      Status = "cached"
      ExecutablePath = $vendoredExecutablePath
    }
  }

  $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("bidwar-sumatra-" + [guid]::NewGuid().ToString("N"))
  $archivePath = Join-Path $tempDir $manifest.archiveFileName
  $extractDir = Join-Path $tempDir "extract"

  try {
    New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
    & curl.exe -L $manifest.archiveDownloadUrl --output $archivePath | Out-Null

    Assert-Sha256 -Path $archivePath -ExpectedHash $manifest.archiveSha256 -Label "SumatraPDF portable archive"

    Expand-Archive -LiteralPath $archivePath -DestinationPath $extractDir -Force
    $extractedExecutablePath = Join-Path $extractDir $manifest.archiveExecutableFileName
    if (-not (Test-Path -LiteralPath $extractedExecutablePath)) {
      throw "Downloaded archive did not contain $($manifest.archiveExecutableFileName). Refusing to vendor an incomplete runtime."
    }

    Assert-SumatraExecutable -Path $extractedExecutablePath -Label "Extracted SumatraPDF executable"
    Copy-ItemAtomic -SourcePath $extractedExecutablePath -DestinationPath $vendoredExecutablePath
    Assert-SumatraExecutable -Path $vendoredExecutablePath -Label "Vendored SumatraPDF executable"

    return @{
      Status = "downloaded"
      ExecutablePath = $vendoredExecutablePath
    }
  } finally {
    if (Test-Path -LiteralPath $tempDir) {
      Remove-Item -LiteralPath $tempDir -Recurse -Force
    }
  }
}
