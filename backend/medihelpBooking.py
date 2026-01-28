from __future__ import annotations

import requests


def consultar_ingresos(base_url: str, hisckey: str, histipdoc: str) -> requests.Response:
    """
    Consulta Medihelp API:
      {base_url}/ingresos/get/{hisckey}/{histipdoc}

    Devuelve el objeto Response para que el caller decida cómo manejar JSON/texto.
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
    Consulta Medihelp API:
      {base_url}/hccom/v2/booking/{histipdoc}/{hisckey}/{ingresos_response}/{sede}/{valor}

    ingresos_response: el valor devuelto por la API de ingresos/get
    """
    base = (base_url or "").rstrip("/")
    url = f"{base}/hccom/v2/booking/{histipdoc}/{hisckey}/{ingresos_response}/{sede}/{valor}"
    return requests.put(url, timeout=10)


