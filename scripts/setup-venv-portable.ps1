# Prepara un venv SOLO para construir el portable:
# - Instala dependencias de Python en `venv/`
# - El build empaqueta `venv\Lib\site-packages` a `build\site-packages.zip`
# La portabilidad en otros equipos se logra con Python embeddable (no con el venv).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

if (Test-Path "venv") {
    Write-Host "Eliminando venv anterior..."
    Remove-Item -Recurse -Force venv
}

function Get-Python313Command {
    # Preferir el launcher de Python de Windows (py) para fijar versión.
    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) {
        try {
            $v = & py -3.13 -c "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}')"
            if ($v -eq "3.13") { return @("py", "-3.13") }
        } catch { }
    }
    return @("python")
}

$pyCmd = Get-Python313Command
$ver = & $pyCmd[0] $pyCmd[1] -c "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}')"
if ($ver -ne "3.13") {
    throw "Debes usar Python 3.13 (x64) para construir (Pydantic/FastAPI). Ahora tienes: $ver. Instala Python 3.13 desde python.org o usa 'py -3.13'."
}

Write-Host "Creando venv para instalar dependencias (Python 3.13)..."
& $pyCmd[0] $pyCmd[1] -m venv venv
if ($LASTEXITCODE -ne 0) {
    Write-Error "Falló: crear venv con Python 3.13. Usa Python desde python.org (no Microsoft Store) y con ensurepip disponible."
    exit 1
}

Write-Host "Instalando dependencias..."
& "$root\venv\Scripts\pip.exe" install -r requirements.txt
if ($LASTEXITCODE -ne 0) {
    Write-Error "Falló pip install."
    exit 1
}

Write-Host "Listo. Ahora ejecuta: npm run build"
