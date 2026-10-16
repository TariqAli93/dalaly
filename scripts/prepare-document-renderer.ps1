param([string]$Version = '26.2.6')
$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid LibreOffice version' }
$taskTools = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../tools'))
$taskTarget = [IO.Path]::GetFullPath((Join-Path $taskTools 'libreoffice'))
$taskStage = [IO.Path]::GetFullPath((Join-Path $taskTools '.document-renderer-setup'))
if (!$taskTarget.StartsWith($taskTools + [IO.Path]::DirectorySeparatorChar) -or !$taskStage.StartsWith($taskTools + [IO.Path]::DirectorySeparatorChar)) { throw 'Renderer directory is outside tools' }
if (Test-Path -LiteralPath (Join-Path $taskTarget 'program/soffice.exe')) { Write-Output 'Local document renderer already prepared.'; exit 0 }
New-Item -ItemType Directory -Force -Path $taskStage | Out-Null
$taskName = "LibreOffice_${Version}_Win_x86-64.msi"
$taskUrl = "https://download.documentfoundation.org/libreoffice/stable/$Version/win/x86_64/$taskName"
$taskInstaller = Join-Path $taskStage $taskName
$taskChecksumFile = $taskInstaller + '.sha256'
# Bounded ranges work behind desktop download proxies. The SHA-256 is still
# verified against Document Foundation before any executable is unpacked.
$taskMirror = "https://mirror.freedif.org/TDF/libreoffice/stable/$Version/win/x86_64/$taskName"
if (!(Test-Path -LiteralPath $taskInstaller) -or (Get-Item -LiteralPath $taskInstaller).Length -eq 0) {
  & node (Join-Path $PSScriptRoot 'download-document-renderer.mjs') $taskMirror $taskInstaller
  if ($LASTEXITCODE) { throw 'Failed to download the document renderer' }
}
& curl.exe -L --fail --silent --show-error --max-time 60 -o $taskChecksumFile ($taskUrl + '.sha256')
if ($LASTEXITCODE) { throw 'Failed to download the official checksum' }
$taskExpected = (Get-Content -LiteralPath $taskChecksumFile -Raw).Split(' ', [StringSplitOptions]::RemoveEmptyEntries)[0].Trim()
$taskHasher = [Security.Cryptography.SHA256]::Create()
$taskStream = [IO.File]::OpenRead($taskInstaller)
try { $taskHash = [BitConverter]::ToString($taskHasher.ComputeHash($taskStream)).Replace('-', '') } finally { $taskStream.Dispose(); $taskHasher.Dispose() }
if ($taskHash -ne $taskExpected) { throw 'Document renderer checksum mismatch' }
$taskExtract = [IO.Path]::GetFullPath((Join-Path $taskStage 'extracted'))
New-Item -ItemType Directory -Force -Path $taskExtract | Out-Null
# Administrative image extraction only; does not install/register Office on Windows.
$taskArgs = @('/a', ('"' + $taskInstaller + '"'), '/qn', ('TARGETDIR="' + $taskExtract + '"'), '/norestart')
if (!(Test-Path -LiteralPath (Join-Path $taskExtract 'program/soffice.exe'))) {
  $taskProcess = Start-Process -FilePath 'msiexec.exe' -ArgumentList $taskArgs -Wait -PassThru -WindowStyle Hidden
  if ($taskProcess.ExitCode -ne 0) { throw "Extraction failed: $($taskProcess.ExitCode)" }
}
$taskOffice = Get-ChildItem -LiteralPath $taskExtract -Filter soffice.exe -Recurse -File | Select-Object -First 1
if (!$taskOffice) { throw 'Extracted renderer executable not found' }
$taskOfficeRoot = [IO.Path]::GetFullPath($taskOffice.Directory.Parent.FullName)
if ($taskOfficeRoot -ne $taskExtract -and !$taskOfficeRoot.StartsWith($taskExtract + [IO.Path]::DirectorySeparatorChar)) { throw 'Unexpected extraction path' }
Copy-Item -LiteralPath $taskOfficeRoot -Destination $taskTarget -Recurse
Write-Output "Local offline document renderer prepared in $taskTarget"
