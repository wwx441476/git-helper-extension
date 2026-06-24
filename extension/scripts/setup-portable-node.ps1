# ASCII-only: Windows PowerShell 5.x reads .ps1 as system ANSI unless UTF-8 BOM.
$ErrorActionPreference = 'Stop'

$Version = '20.18.0'
$Root = Split-Path -Parent $PSScriptRoot
$ToolsRoot = Join-Path $Root 'tools'
$NodeDir = Join-Path $ToolsRoot 'node'
$ZipPath = Join-Path $ToolsRoot 'node-download.zip'
$NodeExe = Join-Path $NodeDir 'node.exe'

if (Test-Path $NodeExe) {
  Write-Host 'Portable Node.js is ready.'
  exit 0
}

Write-Host "Downloading Node.js v$Version portable (~30MB, network required)..."
New-Item -ItemType Directory -Force -Path $ToolsRoot | Out-Null

$url = "https://nodejs.org/dist/v$Version/node-v$Version-win-x64.zip"
Invoke-WebRequest -Uri $url -OutFile $ZipPath -UseBasicParsing

Write-Host 'Extracting...'
$ExtractDir = Join-Path $ToolsRoot 'node-extract'
if (Test-Path $ExtractDir) {
  Remove-Item -Recurse -Force $ExtractDir
}
Expand-Archive -Path $ZipPath -DestinationPath $ExtractDir -Force

$Inner = Join-Path $ExtractDir "node-v$Version-win-x64"
if (-not (Test-Path $Inner)) {
  throw "Extract failed: node-v$Version-win-x64 not found"
}

if (Test-Path $NodeDir) {
  Remove-Item -Recurse -Force $NodeDir
}
Move-Item -Force $Inner $NodeDir
Remove-Item -Recurse -Force $ExtractDir -ErrorAction SilentlyContinue
Remove-Item -Force $ZipPath -ErrorAction SilentlyContinue

if (-not (Test-Path $NodeExe)) {
  throw 'Portable Node.js install failed'
}

Write-Host 'Portable Node.js installed.'
exit 0
