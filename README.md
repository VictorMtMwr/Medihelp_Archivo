# Medihelp Archivo

Aplicación de escritorio para el **registro y carga de documentos clínicos**. Permite identificar al paciente por tipo y número de documento, completar datos de registro, cargar PDFs con código S1CODIMA y enviar los registros a la API Medihelp, copiando los archivos a rutas UNC configuradas.

## Qué hace la aplicación

1. **Login**: Tipo de documento (CC, TI, etc.) y número. Consulta HIS (ODBC) para obtener HISCSEC y valida el documento.
2. **Registro**: Carga datos del paciente vía API capbas, consulta ingresos y booking (Medihelp). El usuario completa observaciones y da **Continuar a Documentos**.
3. **Documentos**: Carga uno o más PDFs, asigna a cada uno un S1CODIMA (tipo de documento clínico). Al **Guardar** se envían los registros a `imapronq/create` y los archivos se copian a la ruta destino (rutima por S1CODIMA o ruta por defecto).
4. Tras guardar correctamente, se libera el folio y el usuario puede volver al login.

La aplicación puede ejecutarse en **modo desarrollo** (Node + Python local) o como **ejecutable portable Windows** (.exe) que incluye Python embebido y no requiere instalación de Python en el equipo.

## Tecnologías

- **Frontend**: HTML, CSS, JavaScript (sin framework). Interfaz cargada por Electron.
- **Backend**: FastAPI (Python), servidor que se inicia automáticamente al abrir la app.
- **Escritorio**: Electron. En portable, Python embeddable (64 bits) + site-packages empaquetados.

El backend actúa como proxy hacia:
- API Medihelp (capbas, ingresos, booking, imahc/get, imapronq/create).
- Base HIS vía ODBC (DSN `HIS`) para obtener HISCSEC.

## Requisitos previos

- **Node.js** 14+ y **npm** (para desarrollo y para generar el portable).
- **Python 3.13 (64 bits)** desde [python.org](https://www.python.org/downloads/) (no Microsoft Store), solo en la máquina donde vayas a **generar el .exe** o a ejecutar el backend en desarrollo.
- **Windows** para el ejecutable portable (el flujo de build está pensado para Windows).

## Instalación y ejecución (desarrollo)

1. Clonar o descargar el proyecto e instalar dependencias de Node:

   ```bash
   npm install
   ```

2. Crear el entorno virtual de Python e instalar dependencias del backend:

   ```bash
   npm run setup-venv
   ```

   Usa Python 3.13 (64 bits). El script crea `venv/` e instala lo que está en `requirements.txt`.

3. Ejecutar la aplicación:

   ```bash
   npm start
   ```

   Se abre la ventana de Electron, se inicia el servidor FastAPI en `http://127.0.0.1:8000` y se carga el frontend (splash → login).

4. Modo desarrollo (con DevTools abiertos):

   ```bash
   npm run dev
   ```

## Generar el ejecutable portable (Windows)

El portable es un único `.exe` que no requiere Python instalado en el equipo donde se ejecuta. Incluye Python embeddable y las dependencias (FastAPI, uvicorn, requests, pyodbc, etc.) empaquetadas.

1. **Requisitos en la máquina de build**: Node.js, npm y **Python 3.13 (64 bits)**.

2. Instalar dependencias de Node (si no lo has hecho):

   ```bash
   npm install
   ```

3. Crear el venv e instalar dependencias de Python (obligatorio antes del build):

   ```bash
   npm run setup-venv
   ```

4. Descargar el **Python embeddable (64 bits)** desde python.org:
   - [Windows embeddable package (64-bit)](https://www.python.org/downloads/windows/).
   - Descargar el `.zip` y guardarlo en el proyecto como:
     - `build/python-embed.zip`

   (Crear la carpeta `build` si no existe.)

5. Generar el portable:

   ```bash
   npm run build
   ```

   El script comprueba que exista `venv` con uvicorn; si falta, ejecuta el setup del venv. Luego empaqueta `venv\Lib\site-packages` en `build/site-packages.zip` y ejecuta electron-builder.

6. Salida:
   - `dist-build/Medihelp Archivo-Portable-1.0.0.exe`

Al ejecutar el .exe por primera vez, se descomprimen el Python embeddable y los site-packages en una carpeta tipo `Medihelp Archivo Runtime` (junto al ejecutable en modo portable), y el backend se inicia con ese Python.

## Estructura del proyecto

```
├── main.js                 # Proceso principal Electron: ventana, inicio del backend Python
├── preload.js              # Preload: APIs seguras para el renderer
├── package.json
├── requirements.txt        # Dependencias Python (FastAPI, uvicorn, requests, pyodbc, etc.)
├── backend/
│   ├── server.py           # FastAPI: rutas API, proxy Medihelp, HIS (ODBC), guardar/copiar
│   └── medihelpBooking.py  # Llamadas a ingresos y booking Medihelp
├── frontend/
│   ├── index.html          # Splash; redirige a pages/login.html
│   ├── css/
│   ├── js/
│   │   ├── config.js       # APP_CONFIG (BACKEND_BASE, S1CODIMA_OPTIONS)
│   │   ├── login.js        # Login y redirección a registro
│   │   ├── registro.js     # Registro, capbas, ingresos, booking, ir a documentos
│   │   ├── documentos.js   # Carga de PDFs, S1CODIMA, guardar y copiar
│   │   └── app.js          # Código legacy/alternativo si se usa
│   ├── pages/
│   │   ├── login.html
│   │   ├── registro.html
│   │   └── documentos.html
│   └── assets/
├── scripts/
│   ├── setup-venv-portable.ps1   # Crea venv e instala requirements.txt
│   └── build-portable.ps1        # Comprueba venv/uvicorn, empaqueta site-packages, electron-builder
└── build/                   # Aquí va python-embed.zip; site-packages.zip se genera al hacer build
```

## Configuración

- **Backend (API y rutas)**  
  En `backend/server.py` están definidas las URLs base de Medihelp (`CAPBAS_API_BASE`, `MEDIHELP_BASE`) y la ruta por defecto de los PDFs (`PDF_DEST_DIR`). Esta última puede sobrescribirse con la variable de entorno `PDF_DEST_DIR`.

- **HIS (ODBC)**  
  La conexión usa el DSN `HIS` (usuario/password en `server.py`). En cada equipo debe existir un origen de datos ODBC **64 bits** llamado `HIS` si se quiere obtener HISCSEC desde la base. Si el DSN no existe o es 32 bits, la app sigue funcionando y devuelve HISCSEC vacío.

- **Frontend**  
  La URL del backend y las opciones de S1CODIMA se configuran en `frontend/js/config.js` (`APP_CONFIG`).

## Solución de problemas

- **"No module named uvicorn" al abrir el portable**  
  El .exe usa las dependencias de `site-packages.zip`, generado desde `venv\Lib\site-packages` en el build. Ejecuta `npm run setup-venv` y luego `npm run build` de nuevo en la máquina donde compilas. El script de build comprueba que exista uvicorn y, si falta, instala dependencias antes de empaquetar.

- **"Falta build\\python-embed.zip" al compilar**  
  Descarga el Windows embeddable package (64-bit) de python.org y guárdalo como `build/python-embed.zip`.

- **Error "La arquitectura del DSN especificado no coincide..." (ODBC)**  
  La aplicación usa Python 64 bits. El DSN `HIS` debe estar creado en el **Administrador de orígenes de datos ODBC de 64 bits** (`C:\Windows\System32\odbcad32.exe`). Si solo está en el de 32 bits, aparece ese error; la app sigue y devuelve HISCSEC vacío.

- **"did not find executable at 'C:\\Python314\\python.exe'"**  
  Indica un portable antiguo que esperaba Python instalado. Usa el .exe generado con el flujo actual (python-embed.zip + site-packages.zip). Si ya tienes una carpeta `Medihelp Archivo Runtime` antigua, bórrala y vuelve a ejecutar el .exe.

- **El servidor no arranca en desarrollo**  
  Asegúrate de haber ejecutado `npm run setup-venv`. Puedes comprobar manualmente: `.\venv\Scripts\pip install -r requirements.txt` y luego `.\venv\Scripts\python -m uvicorn server:app --host 127.0.0.1 --port 8000` desde la carpeta `backend`.

Los logs del backend en ejecución (incluido el portable) se escriben en un archivo de log (por ejemplo `backend.log` en la carpeta del runtime o en userData); ahí aparecen errores de API u ODBC.

## Licencia

MIT.
