const API_BASE = (typeof window !== "undefined" && window.APP_CONFIG)
  ? window.APP_CONFIG.BACKEND_BASE
  : "http://127.0.0.1:8000";

const API_PROXY = API_BASE;

(function () {
  if (typeof sessionStorage !== "undefined" && sessionStorage.getItem("booking_done") === "true" && sessionStorage.getItem("docs_uploaded") !== "true") {
    window.location.replace("documentos.html");
  }
})();

/**
 * Escribe una línea en el área de logs de capbas (#capbas-logs) con timestamp.
 * @param {string} line - Texto a añadir.
 */
function logCapbas(line) {
  const el = document.getElementById("capbas-logs");
  if (!el) return;
  const ts = new Date().toISOString().slice(11, 19);
  el.textContent += `[${ts}] ${line}\n`;
  el.scrollTop = el.scrollHeight;
}

/**
 * Extrae nombres y apellidos de la respuesta de capbas (mpnom1/mpnom2/mpnomc, mrape1/mrape2).
 * @param {object|array} data - Payload de capbas (objeto o array de un elemento).
 * @returns {{ nombres: string, apellidos: string }}
 */
function extraerNombresApellidos(data) {
  if (!data || typeof data !== "object") return { nombres: "", apellidos: "" };
  const d = Array.isArray(data) ? data[0] : data;
  if (!d || typeof d !== "object") return { nombres: "", apellidos: "" };
  const trim = (v) => (v != null ? String(v).trim() : "");
  const joinFields = (...keys) =>
    keys.map((k) => trim(d[k])).filter(Boolean).join(" ").trim();
  const nombres = joinFields("mpnom1", "mpnom2") || trim(d.mpnomc);
  const apellidos = joinFields("mpape1", "mpape2");
  return { nombres, apellidos };
}

/**
 * Extrae el valor de ingresosresponse del payload de ingresos (varios nombres de campo posibles).
 * @param {object|array|string|number} payload - Respuesta de ingresos/get.
 * @returns {string|null}
 */
function extraerIngresosResponse(payload) {
  const pick = (obj) => {
    if (!obj || typeof obj !== "object") return null;
    const keys = [
      "ingresosresponse", "ingresosResponse", "ingresoResponse", "ingreso_response",
      "ingreso", "INGRESO", "idIngreso", "idingreso", "ingresoId", "ingresoid",
    ];
    for (const k of keys) {
      if (obj[k] != null && String(obj[k]).trim() !== "") return String(obj[k]).trim();
    }
    const vals = Object.values(obj).filter((v) => ["string", "number"].includes(typeof v));
    if (vals.length === 1) return String(vals[0]).trim();
    return null;
  };
  if (payload == null) return null;
  if (typeof payload === "string" || typeof payload === "number") return String(payload).trim();
  if (Array.isArray(payload)) return pick(payload[0]);
  return pick(payload);
}

/**
 * Extrae hiscnum del payload de booking (campo hiscnum o búsqueda en texto crudo).
 * @param {object|array} payload - Respuesta de booking.
 * @param {string} rawText - Texto crudo de la respuesta por si no viene en JSON.
 * @returns {string|null}
 */
function extraerHiscnum(payload, rawText = "") {
  const pick = (obj) => {
    if (!obj || typeof obj !== "object") return null;
    const keys = ["hiscnum", "HISCNUM", "hiscNum", "hisc_num"];
    for (const k of keys) {
      if (obj[k] != null && String(obj[k]).trim() !== "") return String(obj[k]).trim();
    }
    return null;
  };
  if (payload != null) {
    if (Array.isArray(payload)) {
      const v = pick(payload[0]);
      if (v) return v;
    } else if (typeof payload === "object") {
      const v = pick(payload);
      if (v) return v;
    }
  }
  const txt = String(rawText || "");
  const m = txt.match(/hiscnum\s*["']?\s*[:=]\s*["']?(\d+)/i);
  return m ? m[1] : null;
}

document.addEventListener("DOMContentLoaded", async () => {
  const histipdoc = sessionStorage.getItem("histipdoc");
  const hisckey = sessionStorage.getItem("hisckey");
  const hiscsec = sessionStorage.getItem("hiscsec") || "";

  if (!histipdoc || !hisckey) {
    window.location.href = "login.html";
    return;
  }

  document.getElementById("histipdoc").value = histipdoc;
  document.getElementById("hisckey").value = hisckey;
  document.getElementById("hiscsec").value = hiscsec;

  const hdrTip = document.getElementById("hdr-histipdoc");
  const hdrKey = document.getElementById("hdr-hisckey");
  if (hdrTip) hdrTip.textContent = histipdoc;
  if (hdrKey) hdrKey.textContent = hisckey;

  const url = `${API_PROXY}/api/capbas/get/${encodeURIComponent(histipdoc)}/${encodeURIComponent(hisckey)}`;
  const msgEl = document.getElementById("capbas-msg");
  const logsEl = document.getElementById("capbas-logs");
  if (logsEl) logsEl.textContent = "";

  try {
    if (msgEl) msgEl.textContent = "Cargando nombres…";
    logCapbas("GET " + url);
    const res = await fetch(url);
    logCapbas("Respuesta: " + res.status + " " + res.statusText);
    if (!res.ok) {
      const text = await res.text();
      logCapbas("Error: " + text.slice(0, 500));
      throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    logCapbas("OK – datos recibidos");
    const jsonPreview = JSON.stringify(data).slice(0, 800);
    logCapbas("JSON: " + jsonPreview + (JSON.stringify(data).length > 800 ? "…" : ""));
    const { nombres, apellidos } = extraerNombresApellidos(data);
    logCapbas("Extraídos: nombres=\"" + nombres + "\" apellidos=\"" + apellidos + "\"");
    document.getElementById("nombres").value = nombres;
    document.getElementById("apellidos").value = apellidos;
    const hdrNombre = document.getElementById("hdr-nombre-apellido");
    if (hdrNombre) hdrNombre.textContent = [nombres, apellidos].filter(Boolean).join(" ") || "—";
    if (msgEl) msgEl.textContent = "";

    try {
      const ingresosUrl = `${API_BASE}/api/ingresos/get/${encodeURIComponent(hisckey)}/${encodeURIComponent(histipdoc)}`;
      logCapbas("INGRESOS GET " + ingresosUrl);
      const r2 = await fetch(ingresosUrl);
      logCapbas("INGRESOS Respuesta: " + r2.status + " " + r2.statusText);
      const body2 = await r2.text();
      let pretty = body2;
      let ingresosPayload = null;
      try {
        const j = JSON.parse(body2);
        ingresosPayload = j;
        pretty = JSON.stringify(j, null, 2);
      } catch (_e) {}
      logCapbas("INGRESOS Body:\n" + pretty.slice(0, 1200) + (pretty.length > 1200 ? "\n…" : ""));

      const ingresosresponse = extraerIngresosResponse(ingresosPayload);
      if (!ingresosresponse) {
        logCapbas("BOOKING: No se pudo extraer 'ingresosresponse' del response de INGRESOS.");
      } else {
        const bookingUrl = `${API_BASE}/api/hccom/v2/booking/${encodeURIComponent(histipdoc)}/${encodeURIComponent(hisckey)}/${encodeURIComponent(ingresosresponse)}/ARH01/4`;
        logCapbas("BOOKING GET " + bookingUrl);
        const r3 = await fetch(bookingUrl);
        logCapbas("BOOKING Respuesta: " + r3.status + " " + r3.statusText);
        const body3 = await r3.text();
        let bookingPayload = null;
        try {
          const j3 = JSON.parse(body3);
          bookingPayload = j3;
        } catch (_e) {}
        logCapbas("BOOKING Body:\n" + (JSON.stringify(bookingPayload || {}).slice(0, 1200)) + (body3.length > 1200 ? "…" : ""));

        const hiscnum = extraerHiscnum(bookingPayload, body3);
        if (!hiscnum) {
          logCapbas("BOOKING: No se encontró 'hiscnum' en el response.");
        } else {
          const elHiscsec = document.getElementById("hiscsec");
          if (elHiscsec) elHiscsec.value = hiscnum;
          try { sessionStorage.setItem("hiscsec", hiscnum); } catch (_e) {}
          try { sessionStorage.setItem("booking_done", "true"); } catch (_e) {}
          try {
            localStorage.setItem("folio_locked", "true");
            localStorage.setItem("folio_closed", "false");
          } catch (_e) {}
          logCapbas(`BOOKING: hiscnum="${hiscnum}" -> asignado a #hiscsec`);
        }
      }
    } catch (e2) {
      logCapbas("INGRESOS Excepción: " + (e2.message || String(e2)));
    }
  } catch (e) {
    logCapbas("Excepción: " + (e.message || String(e)));
    if (msgEl) msgEl.textContent = "No se pudieron cargar los nombres.";
  }
});

/**
 * Navega a login; si hay booking hecho y documentos no guardados, muestra mensaje y no navega.
 */
function volverALogin() {
  const bookingDone = sessionStorage.getItem("booking_done") === "true";
  const docsUploaded = sessionStorage.getItem("docs_uploaded") === "true";
  if (bookingDone && !docsUploaded) {
    const msgEl = document.getElementById("capbas-msg");
    if (msgEl) msgEl.textContent = "Debe cargar al menos 1 documento antes de finalizar la sesión.";
    logCapbas("Bloqueado: intento de volver a login sin cargar documentos.");
    return;
  }
  try { sessionStorage.clear(); } catch (_e) {}
  window.location.href = "login.html";
}

/**
 * Guarda en sessionStorage los datos del formulario de registro y navega a documentos.html.
 * Activa el bloqueo de cierre de app (folio_close_block_enabled).
 */
function irADocumentos() {
  sessionStorage.setItem("hiscsec", document.getElementById("hiscsec").value);
  sessionStorage.setItem("imaobs", document.getElementById("imaobs").value);
  sessionStorage.setItem("imatipreg", "F");
  sessionStorage.setItem("imausureg", "");
  sessionStorage.setItem("nombres", document.getElementById("nombres").value);
  sessionStorage.setItem("apellidos", document.getElementById("apellidos").value);
  try { sessionStorage.setItem("folio_close_block_enabled", "true"); } catch (_e) {}
  window.location.href = "documentos.html";
}
