$ErrorActionPreference = "Stop"

. (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "sumatra-runtime.ps1")

$manifest = Get-SumatraManifest
$packagedExecutablePath = Join-Path $PSScriptRoot "..\\dist\\win-unpacked\\resources\\daemon\\bin\\$($manifest.bundledExecutableFileName)"
$packagedExecutablePath = [System.IO.Path]::GetFullPath($packagedExecutablePath)

Assert-SumatraExecutable -Path $packagedExecutablePath -Label "Packaged SumatraPDF executable"

$process = Start-Process -FilePath $packagedExecutablePath -ArgumentList "-restrict" -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 2

if ($process.HasExited -and $process.ExitCode -ne 0) {
  throw "Packaged SumatraPDF exited immediately with code $($process.ExitCode)"
}

if (-not $process.HasExited) {
  Stop-Process -Id $process.Id -Force
}

Write-Host "Verified packaged SumatraPDF $($manifest.version) exists and is launchable at $packagedExecutablePath"
