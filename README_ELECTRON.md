# Aplicación de Escritorio - Registro de Documentos Clínicos

Esta aplicación ha sido convertida a una aplicación de escritorio usando Electron, lo que permite acceder a las rutas absolutas de los archivos del sistema.

## Requisitos Previos

1. **Node.js y npm**: Necesitas tener Node.js instalado (versión 14 o superior)
   - Verificar instalación: `node --version` y `npm --version`

2. **Entorno virtual de Python**: Ya está creado en `venv/`

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

Si el servidor no inicia:
- Verifica que el entorno virtual esté creado: `python3 -m venv venv`
- Verifica que las dependencias de Python estén instaladas: `pip install -r requirements.txt`

Si Electron no se instala:
- Verifica que Node.js esté instalado correctamente
- Intenta eliminar `node_modules` y `package-lock.json` y ejecutar `npm install` nuevamente

