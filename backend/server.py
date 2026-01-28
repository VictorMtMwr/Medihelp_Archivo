from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
import json
import os
import shutil

import pyodbc
import requests

from medihelpBooking import consultar_ingresos, consultar_booking

app = FastAPI()

# Permitir llamadas desde el HTML
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rutas del proyecto (independientes del directorio desde donde se ejecute uvicorn)
BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"

# Servir archivos estáticos del frontend
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

@app.get("/")
async def read_root():
    """Sirve la splash (index) en la ruta raíz"""
    return FileResponse(str(FRONTEND_DIR / "index.html"))

# Ruta a la carpeta data (relativa a la raíz del proyecto)
DATA_FILE = BASE_DIR / "data" / "registros.txt"
DATA_FILE.parent.mkdir(exist_ok=True)

CAPBAS_API_BASE = "http://172.16.2.51:8070/Medihelp-api/capbas/get"
MEDIHELP_BASE = "http://172.16.2.51:8070/Medihelp-api"
IMAPRONQ_CREATE_URL = f"{MEDIHELP_BASE}/imapronq/create"
IMAHC_GET_URL = f"{MEDIHELP_BASE}/imahc/get"


# Carpeta destino donde se guardan los PDFs (UNC en Windows).
# Se puede sobreescribir con la variable de entorno PDF_DEST_DIR.
PDF_DEST_DIR = Path(
    os.environ.get("PDF_DEST_DIR", r"\\filemh01\USERS\gustavob\Documents\GUSTAVO.BLANCO")
)


def _safe_filename(name: str) -> str:
    """
    Normaliza el nombre para evitar traversal/paths (solo nombre de archivo).
    Nota: no intenta "corregir" extensiones; valida y usa el basename.
    """
    if not name or not isinstance(name, str):
        raise HTTPException(status_code=400, detail="dest_name inválido")

    # Elimina cualquier ruta que venga embebida (../, C:\, \\server\share\, etc.)
    base = Path(name).name
    base = base.strip().strip(".")  # evita nombres tipo "." o ".."

    if not base:
        raise HTTPException(status_code=400, detail="dest_name inválido")

    # Bloqueo mínimo de caracteres problemáticos en Windows/UNC
    forbidden = '<>:"/\\|?*\0'
    if any(ch in base for ch in forbidden):
        raise HTTPException(status_code=400, detail="dest_name contiene caracteres no permitidos")

    return base


def _as_str(v: Any) -> str:
    if v is None:
        return ""
    s = str(v).strip()
    return s


def _normalize_unc_path(p: str) -> str:
    r"""
    Asegura que una ruta UNC inicie con doble backslash:
      \\servidor\share\...

    Si llega con un solo "\" al inicio (por escapes en frontend),
    la corrige a "\\...".
    """
    s = (p or "").strip()
    if not s:
        return ""

    # Normalizar posibles slashes
    s = s.replace("/", "\\")

    if s.startswith("\\\\"):
        return s
    if s.startswith("\\"):
        return "\\" + s  # agrega el backslash faltante
    # si viene sin barra inicial, lo convertimos a UNC
    return "\\\\" + s


def _clean_rutima(v: Any) -> str:
    r"""
    Limpia rutima (Medihelp suele devolverla con padding de espacios).
    Retorna ruta UNC normalizada (\\servidor\share\...).
    """
    s = _as_str(v)
    # quitar padding derecho, pero no tocar backslashes
    s = s.rstrip()
    return _normalize_unc_path(s)


def _as_int(v: Any) -> int:
    try:
        if v is None or v == "":
            return 0
        return int(v)
    except Exception:
        return 0


def _normalize_imapronq_payload(data: Any) -> list[dict]:
    """
    Normaliza el payload para que cumpla el schema esperado por:
      POST /imapronq/create

    Si faltan campos o no coinciden, se envían como vacíos ("" / 0).
    """
    raw = data
    if isinstance(raw, dict):
        raw = [raw]
    if not isinstance(raw, list):
        raise HTTPException(status_code=400, detail="Payload inválido: se esperaba dict o lista de dicts")

    out: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            item = {}

        pk = item.get("imapronqpk") if isinstance(item.get("imapronqpk"), dict) else {}

        # Soportar nombres previos (por ejemplo 'archivos' en vez de 'imarutpro')
        imarutpro = item.get("imarutpro")
        if imarutpro is None:
            imarutpro = item.get("archivos")

        rec = {
            "imapronqpk": {
                "s1CODIMA": _as_int(pk.get("s1CODIMA", item.get("s1CODIMA"))),
                "imacnsreg": _as_int(pk.get("imacnsreg", item.get("imacnsreg"))),
                "hisckey": _as_str(pk.get("hisckey", item.get("hisckey"))),
                "histipdoc": _as_str(pk.get("histipdoc", item.get("histipdoc"))),
                "hiscsec": _as_int(pk.get("hiscsec", item.get("hiscsec"))),
            },
            "imatipreg": _as_str(item.get("imatipreg")),
            "imausureg": _as_str(item.get("imausureg")),
            "imarutpro": _normalize_unc_path(_as_str(imarutpro)),
            "imafechor": _as_str(item.get("imafechor")),
            "imaobs": _as_str(item.get("imaobs")),
            "codpro": _as_str(item.get("codpro")),
        }
        out.append(rec)
    return out


def get_his_connection() -> pyodbc.Connection:
  """
  Retorna una conexión ODBC hacia HIS.

  Se asume que en el sistema está configurado un DSN llamado 'HIS'
  que apunta al servidor 192.168.20.3 y base de datos correspondiente.
  """
  return pyodbc.connect("DSN=HIS;UID=HOSVITAL;PWD=HOSVITAL;")

@app.get("/api/capbas/get/{tipo_documento}/{numero}")
def capbas_get(tipo_documento: str, numero: str):
    """Proxy al endpoint capbas para obtener datos del usuario por TIPO_DOCUMENTO y NUMERO."""
    url = f"{CAPBAS_API_BASE}/{tipo_documento}/{numero}"
    try:
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        return r.json()
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Error al consultar capbas: {str(e)}")


@app.get("/api/ingresos/get/{hisckey}/{histipdoc}")
def ingresos_get(hisckey: str, histipdoc: str):
    """
    Proxy a Medihelp API para consultar ingresos:
      /Medihelp-api/ingresos/get/{hisckey}/{histipdoc}
    """
    try:
        r = consultar_ingresos(MEDIHELP_BASE, hisckey=hisckey, histipdoc=histipdoc)
        r.raise_for_status()
        # Algunos endpoints devuelven JSON; si no, devolvemos texto.
        ct = (r.headers.get("content-type") or "").lower()
        if "application/json" in ct:
            return r.json()
        return {"raw": r.text}
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Error al consultar ingresos: {str(e)}")


@app.get("/api/hccom/v2/booking/{histipdoc}/{hisckey}/{ingresos_response}/{sede}/{valor}")
def booking_get(histipdoc: str, hisckey: str, ingresos_response: str, sede: str, valor: str):
    """
    Proxy a Medihelp API para consultar booking:
      /Medihelp-api/hccom/v2/booking/{histipdoc}/{hisckey}/{ingresos_response}/{sede}/{valor}

    ingresos_response: el valor retornado por ingresos/get
    """
    try:
        r = consultar_booking(
            MEDIHELP_BASE,
            histipdoc=histipdoc,
            hisckey=hisckey,
            ingresos_response=ingresos_response,
            sede=sede,
            valor=valor,
        )
        r.raise_for_status()
        ct = (r.headers.get("content-type") or "").lower()
        if "application/json" in ct:
            return r.json()
        return {"raw": r.text}
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Error al consultar booking: {str(e)}")

@app.get("/api/hiscsec/{hisckey}")
def get_hiscsec(hisckey: str):
    """
    Obtiene el HISCSEC de la tabla his.hccom1 a partir de HISCKEY.
    """
    try:
        conn = get_his_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT HISCSEC FROM his.hccom1 WHERE HISCKEY = ? ORDER BY HISCSEC DESC", hisckey)
        row = cursor.fetchone()
        cursor.close()
        conn.close()
    except pyodbc.Error as e:
        # Error al conectar o ejecutar el query en HIS
        raise HTTPException(status_code=500, detail=f"Error al consultar HIS: {str(e)}")

    if not row:
        raise HTTPException(status_code=404, detail="No se encontró HISCSEC para el HISCKEY indicado")

    # Se retorna como JSON para que el frontend lo consuma fácilmente
    return {"hisckey": hisckey, "hiscsec": str(row.HISCSEC)}


@app.get("/api/imahc/get/{s1codima}")
def imahc_get(s1codima: str):
    """
    Proxy a Medihelp API:
      /Medihelp-api/imahc/get/{S1CODIMA}

    Se usa para obtener rutima (ruta destino) según S1CODIMA.
    """
    url = f"{IMAHC_GET_URL}/{s1codima}"
    try:
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        ct = (r.headers.get("content-type") or "").lower()
        if "application/json" in ct:
            data = r.json()
        else:
            return {"raw": r.text}

        # Normalizar rutima y devolver en un campo adicional
        target = data[0] if isinstance(data, list) and data else data
        if isinstance(target, dict):
            rut = target.get("rutima")
            return {**target, "rutima_clean": _clean_rutima(rut)}
        return {"data": data}
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Error al consultar imahc/get: {str(e)}")

@app.post("/guardar")
def guardar(data: Any = Body(...)):
    """
    Recibe un registro (dict) o una lista de registros y los envía a:
      POST {MEDIHELP_BASE}/imapronq/create

    Nota: por compatibilidad, se mantiene la ruta /guardar usada por el frontend.
    """
    # Normalizar al schema que espera imapronq/create
    payload = _normalize_imapronq_payload(data)

    try:
        print(f"[IMAPRONQ] POST {IMAPRONQ_CREATE_URL} (registros: {len(payload)})")
        r = requests.post(IMAPRONQ_CREATE_URL, json=payload, timeout=15)
        # Requisito: SOLO guardar respaldo si la API responde 200
        if r.status_code != 200:
            detail = (r.text or "")[:1200]
            print(f"[IMAPRONQ] Respuesta {r.status_code}. Body (trunc): {detail}")
            raise HTTPException(
                status_code=502,
                detail=f"imapronq/create respondió {r.status_code}. No se guardó respaldo. Body: {detail}",
            )

        print(f"[IMAPRONQ] Respuesta 200 OK")
        ct = (r.headers.get("content-type") or "").lower()
        if "application/json" in ct:
            res = r.json()
        else:
            res = {"raw": r.text}

        # Respaldo local en TXT (solo si status 200)
        backup_error = None
        try:
            with open(DATA_FILE, "a", encoding="utf-8") as f:
                f.write("=" * 40 + "\n")
                f.write(f"FECHA REGISTRO: {datetime.now().isoformat()}\n")
                f.write("PAYLOAD (imapronq/create):\n")
                f.write(json.dumps(payload, indent=2, ensure_ascii=False))
                f.write("\n\n")
        except Exception as e:
            backup_error = str(e)

        if backup_error:
            return {"api": res, "backup_ok": False, "backup_error": backup_error}
        return {"api": res, "backup_ok": True}
    except HTTPException:
        raise
    except requests.RequestException as e:
        detail = str(e)
        try:
            if getattr(e, "response", None) is not None and e.response is not None:
                detail = (e.response.text or "")[:1200] or detail
        except Exception:
            pass
        raise HTTPException(status_code=502, detail=f"Error al enviar a imapronq/create. No se guardó respaldo. Detalle: {detail}")


@app.post("/api/archivos/copiar")
async def copiar_archivo(
    file: UploadFile = File(...),
    dest_name: str = Form(...),
    dest_dir: Optional[str] = Form(None),
):
    """
    Recibe un archivo (PDF) y lo guarda en la carpeta destino configurada (UNC).

    - file: multipart/form-data
    - dest_name: nombre final del archivo (sin rutas)
    """
    safe_name = _safe_filename(dest_name)

    # (Opcional) restringir a PDF por seguridad/consistencia del flujo.
    if not safe_name.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos .pdf")

    # Determinar carpeta destino (por rutima o fallback)
    dest_dir_str = _normalize_unc_path(_as_str(dest_dir)) if dest_dir else str(PDF_DEST_DIR)
    # Rechazar rutas locales tipo C:\...
    if len(dest_dir_str) >= 2 and dest_dir_str[1] == ":":
        raise HTTPException(status_code=400, detail="dest_dir debe ser una ruta UNC (\\\\servidor\\share\\...)")

    dest_dir_path = Path(dest_dir_str)
    try:
        dest_dir_path.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        raise HTTPException(
            status_code=500,
            detail=f"No se pudo crear/acceder a la carpeta destino: {dest_dir_str}. Error: {e}",
        )

    dest_path = dest_dir_path / safe_name
    tmp_path = dest_dir_path / f".{safe_name}.uploading"

    try:
        # Guardado streaming para no cargar todo en memoria.
        with tmp_path.open("wb") as out:
            shutil.copyfileobj(file.file, out)
        # Reemplazo atómico (sobrescribe si existe).
        os.replace(tmp_path, dest_path)

        size = dest_path.stat().st_size
        return {
            "ok": True,
            "dest_dir": str(dest_dir_path),
            "dest_path": str(dest_path),
            "bytes": size,
            "filename": safe_name,
        }
    except Exception as e:
        # Limpieza si quedó temporal.
        try:
            if tmp_path.exists():
                tmp_path.unlink()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Error al copiar/guardar archivo: {str(e)}")
    finally:
        try:
            await file.close()
        except Exception:
            pass
