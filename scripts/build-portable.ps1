# Build portable: asegura venv con uvicorn, empaqueta site-packages, ejecuta electron-builder.
$ErrorActionPreference = "Continue"
Get-Process | Where-Object ProcessName -like "Medihelp*" | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue .\dist-build

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

New-Item -ItemType Directory -Force build | Out-Null

if (!(Test-Path .\build\python-embed.zip)) {
    throw "Falta build\python-embed.zip (Python embeddable). Descargalo desde python.org y ponlo en build\python-embed.zip"
}

# Asegurar que venv existe y tiene uvicorn (evita 'No module named uvicorn' en el portable)
$uvicornPath = "venv\Lib\site-packages\uvicorn"
if (!(Test-Path "venv") -or !(Test-Path $uvicornPath)) {
    Write-Host "Venv sin uvicorn o inexistente. Ejecutando setup-venv..."
    & "$root\scripts\setup-venv-portable.ps1"
    if ($LASTEXITCODE -ne 0) { throw "Falló setup-venv. Corrige el venv y vuelve a ejecutar npm run build." }
    if (!(Test-Path $uvicornPath)) { throw "uvicorn no quedo instalado. Revisa requirements.txt." }
}

Write-Host "Empaquetando site-packages..."
Compress-Archive -Path ".\venv\Lib\site-packages\*" -DestinationPath ".\build\site-packages.zip" -Force

Write-Host "Ejecutando electron-builder..."
& "$root\node_modules\.bin\electron-builder.cmd" --win portable
if ($LASTEXITCODE -ne 0) { throw "Falló electron-builder" }
Write-Host "Listo: dist-build\Medihelp Archivo-Portable-*.exe"
