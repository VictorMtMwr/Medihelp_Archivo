from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
import json
import logging
import os
import shutil
import sys

import pyodbc
import requests

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stderr,
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("medihelp-backend")

from medihelpBooking import consultar_ingresos, consultar_booking

app = FastAPI()


@app.exception_handler(Exception)
def log_unhandled_exception(request, exc):
    """
    Registra en backend.log cualquier excepción no capturada y devuelve 500.
    Las HTTPException se re-lanzan para que FastAPI responda con su código normal.
    """
    if isinstance(exc, HTTPException):
        raise exc
    log.exception("Excepción no capturada: %s %s -> %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={"detail": f"Error interno: {str(exc)}"},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"

if FRONTEND_DIR.exists() and FRONTEND_DIR.is_dir():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

DATA_FILE = BASE_DIR / "data" / "registros.txt"
DATA_FILE.parent.mkdir(exist_ok=True)

CAPBAS_API_BASE = "http://172.16.2.51:8070/Medihelp-api/capbas/get"
MEDIHELP_BASE = "http://172.16.2.51:8070/Medihelp-api"
IMAPRONQ_CREATE_URL = f"{MEDIHELP_BASE}/imapronq/create"
IMAHC_GET_URL = f"{MEDIHELP_BASE}/imahc/get"

PDF_DEST_DIR = Path(
    os.environ.get("PDF_DEST_DIR", r"\\filemh01\USERS\gustavob\Documents\GUSTAVO.BLANCO")
)


def _safe_filename(name: str) -> str:
    """
    Devuelve un nombre de archivo seguro (solo basename, sin rutas ni caracteres prohibidos).
    Lanza HTTPException 400 si name es inválido o vacío.
    """
    if not name or not isinstance(name, str):
        raise HTTPException(status_code=400, detail="dest_name inválido")
    base = Path(name).name
    base = base.strip().strip(".")
    if not base:
        raise HTTPException(status_code=400, detail="dest_name inválido")
    forbidden = '<>:"/\\|?*\0'
    if any(ch in base for ch in forbidden):
        raise HTTPException(status_code=400, detail="dest_name contiene caracteres no permitidos")
    return base


def _as_str(v: Any) -> str:
    """Convierte a string sin None; devuelve cadena vacía para None."""
    if v is None:
        return ""
    return str(v).strip()


def _normalize_unc_path(p: str) -> str:
    """
    Normaliza una ruta para que sea UNC con doble backslash (\\\\servidor\\share\\...).
    Acepta un solo backslash inicial o sin barra y lo corrige.
    """
    s = (p or "").strip()
    if not s:
        return ""
    s = s.replace("/", "\\")
    if s.startswith("\\\\"):
        return s
    if s.startswith("\\"):
        return "\\" + s
    return "\\\\" + s


def _clean_rutima(v: Any) -> str:
    """Limpia el campo rutima (espacios) y lo normaliza como ruta UNC."""
    s = _as_str(v)
    s = s.rstrip()
    return _normalize_unc_path(s)


def _as_int(v: Any) -> int:
    """Convierte a int; devuelve 0 para None, vacío o error."""
    try:
        if v is None or v == "":
            return 0
        return int(v)
    except Exception:
        return 0


def _normalize_imapronq_payload(data: Any) -> list[dict]:
    """
    Convierte el body (dict o lista de dicts) al formato esperado por POST imapronq/create.
    Campos faltantes se rellenan con "" o 0. Acepta alias 'archivos' para imarutpro.
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
    Abre una conexión ODBC al DSN 'HIS' (usuario HOSVITAL).
    Requiere que el DSN esté configurado en el Administrador ODBC (64 bits si la app es 64 bits).
    """
    return pyodbc.connect("DSN=HIS;UID=HOSVITAL;PWD=HOSVITAL;")


@app.get("/")
async def read_root():
    """
    Raíz: en desarrollo sirve index.html si existe; en Electron devuelve estado del servicio.
    """
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    return {"ok": True, "service": "medihelp-backend", "frontend": "served-by-electron"}


@app.get("/api/capbas/get/{tipo_documento}/{numero}")
def capbas_get(tipo_documento: str, numero: str):
    """
    Proxy a Medihelp capbas/get para obtener datos del usuario por tipo y número de documento.
    """
    url = f"{CAPBAS_API_BASE}/{tipo_documento}/{numero}"
    try:
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        return r.json()
    except requests.RequestException as e:
        log.exception("GET /api/capbas/get/%s/%s -> %s", tipo_documento, numero, e)
        raise HTTPException(status_code=502, detail=f"Error al consultar capbas: {str(e)}")


@app.get("/api/ingresos/get/{hisckey}/{histipdoc}")
def ingresos_get(hisckey: str, histipdoc: str):
    """
    Proxy a Medihelp ingresos/get. Devuelve JSON o raw según content-type de la API.
    """
    try:
        r = consultar_ingresos(MEDIHELP_BASE, hisckey=hisckey, histipdoc=histipdoc)
        r.raise_for_status()
        ct = (r.headers.get("content-type") or "").lower()
        if "application/json" in ct:
            return r.json()
        return {"raw": r.text}
    except requests.RequestException as e:
        log.exception("GET /api/ingresos/get/%s/%s -> %s", hisckey, histipdoc, e)
        raise HTTPException(status_code=502, detail=f"Error al consultar ingresos: {str(e)}")


@app.get("/api/hccom/v2/booking/{histipdoc}/{hisckey}/{ingresos_response}/{sede}/{valor}")
def booking_get(histipdoc: str, hisckey: str, ingresos_response: str, sede: str, valor: str):
    """
    Proxy a Medihelp hccom/v2/booking. ingresos_response es el valor retornado por ingresos/get.
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
        log.exception("GET /api/hccom/v2/booking/... -> %s", e)
        raise HTTPException(status_code=502, detail=f"Error al consultar booking: {str(e)}")


@app.get("/api/hiscsec/{hisckey}")
def get_hiscsec(hisckey: str):
    """
    Obtiene HISCSEC desde his.hccom1 por HISCKEY.
    Si ODBC no está disponible (ej. DSN 32/64 bits incompatible), devuelve hiscsec vacío sin error.
    """
    try:
        conn = get_his_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT HISCSEC FROM his.hccom1 WHERE HISCKEY = ? ORDER BY HISCSEC DESC", hisckey)
        row = cursor.fetchone()
        cursor.close()
        conn.close()
    except pyodbc.Error as e:
        log.warning("GET /api/hiscsec/%s -> HIS no disponible (ODBC incompatible): %s", hisckey, e)
        return {"hisckey": hisckey, "hiscsec": ""}
    if not row:
        raise HTTPException(status_code=404, detail="No se encontró HISCSEC para el HISCKEY indicado")
    return {"hisckey": hisckey, "hiscsec": str(row.HISCSEC)}


@app.get("/api/imahc/get/{s1codima}")
def imahc_get(s1codima: str):
    """
    Proxy a Medihelp imahc/get para obtener rutima (ruta destino) por S1CODIMA.
    Añade rutima_clean normalizada al resultado.
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
        target = data[0] if isinstance(data, list) and data else data
        if isinstance(target, dict):
            rut = target.get("rutima")
            return {**target, "rutima_clean": _clean_rutima(rut)}
        return {"data": data}
    except requests.RequestException as e:
        log.exception("GET /api/imahc/get/%s -> %s", s1codima, e)
        raise HTTPException(status_code=502, detail=f"Error al consultar imahc/get: {str(e)}")


@app.post("/guardar")
def guardar(data: Any = Body(...)):
    """
    Recibe un registro (dict) o lista de registros, los normaliza y envía a imapronq/create.
    Si la API responde 200, escribe respaldo en DATA_FILE. Devuelve api + backup_ok/backup_error.
    """
    payload = _normalize_imapronq_payload(data)
    try:
        print(f"[IMAPRONQ] POST {IMAPRONQ_CREATE_URL} (registros: {len(payload)})")
        r = requests.post(IMAPRONQ_CREATE_URL, json=payload, timeout=15)
        if r.status_code != 200:
            detail = (r.text or "")[:1200]
            log.error("POST /guardar imapronq/create -> %s. Body (trunc): %s", r.status_code, detail)
            raise HTTPException(
                status_code=502,
                detail=f"imapronq/create respondió {r.status_code}. No se guardó respaldo. Body: {detail}",
            )
        print("[IMAPRONQ] Respuesta 200 OK")
        ct = (r.headers.get("content-type") or "").lower()
        res = r.json() if "application/json" in ct else {"raw": r.text}
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
        log.exception("POST /guardar (imapronq/create) -> %s", detail)
        raise HTTPException(status_code=502, detail=f"Error al enviar a imapronq/create. No se guardó respaldo. Detalle: {detail}")


@app.post("/api/archivos/copiar")
async def copiar_archivo(
    file: UploadFile = File(...),
    dest_name: str = Form(...),
    dest_dir: Optional[str] = Form(None),
):
    """
    Recibe un PDF por multipart y lo guarda en dest_dir (UNC) con nombre dest_name.
    dest_dir es opcional; por defecto usa PDF_DEST_DIR. Solo acepta rutas UNC.
    """
    safe_name = _safe_filename(dest_name)
    if not safe_name.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos .pdf")
    dest_dir_str = _normalize_unc_path(_as_str(dest_dir)) if dest_dir else str(PDF_DEST_DIR)
    if len(dest_dir_str) >= 2 and dest_dir_str[1] == ":":
        raise HTTPException(status_code=400, detail="dest_dir debe ser una ruta UNC (\\\\servidor\\share\\...)")
    dest_dir_path = Path(dest_dir_str)
    try:
        dest_dir_path.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        log.exception("POST /api/archivos/copiar (mkdir/acceso destino %s): %s", dest_dir_str, e)
        raise HTTPException(
            status_code=500,
            detail=f"No se pudo crear/acceder a la carpeta destino: {dest_dir_str}. Error: {e}",
        )
    dest_path = dest_dir_path / safe_name
    tmp_path = dest_dir_path / f".{safe_name}.uploading"
    try:
        with tmp_path.open("wb") as out:
            shutil.copyfileobj(file.file, out)
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
        log.exception("POST /api/archivos/copiar (guardar %s): %s", safe_name, e)
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
