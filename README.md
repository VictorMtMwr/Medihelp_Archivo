# Proyecto de Carga de Documentos

Aplicación web para registro y carga de documentos con API REST.

## Estructura del Proyecto

```
ARCHIVOS/
├── backend/
│   └── server.py          # Servidor FastAPI
├── frontend/
│   ├── index.html         # Interfaz de usuario
│   └── app.js             # Lógica del frontend
├── data/
│   └── registros.txt      # Archivo de datos (generado automáticamente)
├── requirements.txt       # Dependencias de Python
└── README.md             # Este archivo
```

## Requisitos

- Python 3.7 o superior
- pip (gestor de paquetes de Python)

## Instalación

1. Instalar las dependencias:
```bash
pip install -r requirements.txt
```

## Ejecución

1. Iniciar el servidor backend:
```bash
cd backend
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

2. Abrir el frontend:
   - Abre `frontend/index.html` en tu navegador (splash 3 s → login), o
   - Accede a `http://localhost:8000/` o `http://localhost:8000/static/index.html` cuando el servidor esté corriendo

## Funcionalidades

- Formulario de registro con campos personalizados
- Carga múltiple de archivos
- Guardado de datos en archivo TXT
- API REST para guardar registros

## Endpoints

- `POST /guardar` - Guarda los datos del formulario y archivos en `data/registros.txt`
