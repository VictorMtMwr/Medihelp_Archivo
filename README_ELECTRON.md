# Aplicación de Escritorio - Registro de Documentos Clínicos

Esta aplicación ha sido convertida a una aplicación de escritorio usando Electron, lo que permite acceder a las rutas absolutas de los archivos del sistema.

## Requisitos Previos

1. **Node.js y npm**: Necesitas tener Node.js instalado (versión 14 o superior)
   - Verificar instalación: `node --version` y `npm --version`

2. **Python para construir (Windows)**: instala **Python 3.13 (x64)** desde python.org (no Microsoft Store)
   - Esto es importante porque dependencias como **pydantic_core** necesitan wheels compatibles (en Python 3.14 no van a instalar bien).
3. **Entorno virtual de Python**: se creará en `venv/` al ejecutar `npm run setup-venv`

## Instalación

1. **Instalar dependencias de Electron**:
```bash
npm install
```

Esto instalará Electron y todas sus dependencias.

## Ejecutar la Aplicación

### Modo Normal:
```bash
npm start
```

### Modo Desarrollo (con DevTools abierto):
```bash
npm run dev
```

## Generar ejecutable portable (Windows)

Este proyecto inicia un servidor **Python/FastAPI** al arrancar Electron. Para que el `.exe` funcione **en cualquier equipo de la red** (sin tener Python instalado), el portable incluye:

- **Python embeddable** (zip oficial de python.org) → `build/python-embed.zip`
- **Dependencias** (site-packages) → `build/site-packages.zip` (se genera desde tu `venv/`)

Al arrancar, Electron extrae ambos a `Medihelp Archivo Runtime\\python` (junto al `.exe` en modo portable) y levanta el backend con ese `python.exe`.

1. Instala dependencias de Node:
```bash
npm install
```

2. **Crear venv para instalar dependencias** (obligatorio antes del build):
```bash
npm run setup-venv
```
   - Usa **Python 3.13 (x64)** desde **python.org** (no Microsoft Store) para poder instalar `requirements.txt`.

3. **Descargar Python embeddable (x64)** y guardarlo como `build/python-embed.zip`:
   - Ve a python.org → Windows → “**Windows embeddable package (64-bit)**”.
   - Descarga el `.zip` y **renómbralo** exactamente a `build/python-embed.zip`.

4. Genera el portable:
```bash
npm run build
```

Salida esperada:
- `dist-build/Medihelp Archivo-Portable-1.0.0.exe`

## Cómo Funciona

1. **Inicio Automático del Servidor**: Cuando inicias la aplicación, automáticamente se inicia el servidor FastAPI en segundo plano en `http://localhost:8000`.

2. **Rutas Absolutas**: Al seleccionar archivos, la aplicación ahora puede acceder a la ruta absoluta completa del sistema de archivos (ej: `/media/victormtmwr/Ventoy/Medihelp/V0.6/mg20260121_07191406.pdf`).

3. **Interfaz**: La interfaz es la misma que antes, pero ahora funciona como una aplicación de escritorio nativa.

## Estructura de Archivos

- `main.js`: Proceso principal de Electron que crea la ventana y gestiona el servidor Python
- `preload.js`: Script que expone APIs seguras al renderer
- `package.json`: Configuración y dependencias de Node.js/Electron
- `frontend/`: Archivos HTML, CSS y JavaScript de la interfaz
- `backend/`: Servidor FastAPI

## Notas

- El servidor Python se inicia automáticamente cuando abres la aplicación
- El servidor se cierra automáticamente cuando cierras la aplicación
- Las rutas absolutas de los archivos se guardan automáticamente en el campo `imarutpro`

## Solución de Problemas

**"No module named uvicorn" al abrir el portable**  
El `.exe` usa un Python embebido que carga dependencias desde `site-packages.zip`. Ese zip se genera desde tu `venv\Lib\site-packages` al hacer el build. Si no ejecutaste `npm run setup-venv` antes de `npm run build`, el venv no tendrá uvicorn y el portable fallará. **Solución:** en la máquina donde compilas, ejecuta `npm run setup-venv` y luego `npm run build` de nuevo. El script de build ahora comprueba que exista uvicorn en el venv y, si falta, instala las dependencias antes de empaquetar.

**Sigue saliendo "did not find executable at 'C:\\Python314\\python.exe'"**  
Eso indica que estás ejecutando un portable viejo que todavía dependía del venv. Asegúrate de usar el `.exe` nuevo (el que ya empaqueta `python-embed.zip` y `site-packages.zip`).

Además, si estás ejecutándolo desde una carpeta que ya tenía runtime, borra la carpeta:
- `Medihelp Archivo Runtime`

o simplemente vuelve a abrir el `.exe`. La app guarda un marcador y **re-extrae** el runtime cuando detecta cambios en los zips.

**Error "Falta build\\python-embed.zip" al compilar**  
Te falta descargar el zip embeddable de python.org y guardarlo como `build/python-embed.zip`.

Si el servidor no inicia en desarrollo:
- Crea el venv portable: `npm run setup-venv`
- O manualmente: `python -m venv venv` y `.\venv\Scripts\pip install -r requirements.txt`

Si Electron no se instala:
- Verifica que Node.js esté instalado correctamente
- Intenta eliminar `node_modules` y `package-lock.json` y ejecutar `npm install` nuevamente

