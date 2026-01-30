from __future__ import annotations

import requests


def consultar_ingresos(base_url: str, hisckey: str, histipdoc: str) -> requests.Response:
    """
    Llama a Medihelp {base_url}/ingresos/get/{hisckey}/{histipdoc}.
    Devuelve el Response; el caller decide si leer JSON o texto.
    """
    base = (base_url or "").rstrip("/")
    url = f"{base}/ingresos/get/{hisckey}/{histipdoc}"
    return requests.get(url, timeout=10)


def consultar_booking(
    base_url: str,
    histipdoc: str,
    hisckey: str,
    ingresos_response: str,
    sede: str = "ARH01",
    valor: str = "4",
) -> requests.Response:
    """
    Llama a Medihelp hccom/v2/booking con histipdoc, hisckey, ingresos_response, sede y valor.
    ingresos_response es el valor devuelto por ingresos/get.
    """
    base = (base_url or "").rstrip("/")
    url = f"{base}/hccom/v2/booking/{histipdoc}/{hisckey}/{ingresos_response}/{sede}/{valor}"
    return requests.put(url, timeout=10)
