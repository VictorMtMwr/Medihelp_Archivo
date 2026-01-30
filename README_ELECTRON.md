# Medihelp Archivo – Electron y portable

La documentación principal del proyecto está en **[README.md](README.md)**.

Este archivo resume solo lo relativo a Electron y al ejecutable portable.

## Ejecutar en desarrollo

```bash
npm install
npm run setup-venv
npm start
```

Con DevTools: `npm run dev`.

## Generar el .exe portable (Windows)

1. **Node.js** y **Python 3.13 (64 bits)** instalados en la máquina de build.
2. `npm install`
3. `npm run setup-venv`
4. Descargar **Windows embeddable package (64-bit)** de python.org y guardarlo como `build/python-embed.zip`.
5. `npm run build`

Salida: `dist-build/Medihelp Archivo-Portable-1.0.0.exe`.

El .exe no requiere Python instalado en el equipo donde se ejecuta; incluye Python embeddable y site-packages (FastAPI, uvicorn, etc.).

Para requisitos, estructura del proyecto, configuración y solución de problemas, ver **[README.md](README.md)**.
