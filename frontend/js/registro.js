// Config desde archivo externo
const API_BASE = (typeof window !== "undefined" && window.APP_CONFIG)
  ? window.APP_CONFIG.BACKEND_BASE
  : "http://127.0.0.1:8000";

const API_USERINFO = (typeof window !== "undefined" && window.APP_CONFIG)
  ? window.APP_CONFIG.MEDIHELP_BASE
  : "http://api-service:8080/Medihelp-api";

function logCapbas(line) {
  const el = document.getElementById("capbas-logs");
  if (!el) return;
  const ts = new Date().toISOString().slice(11, 19);
  el.textContent += `[${ts}] ${line}\n`;
  el.scrollTop = el.scrollHeight;
}

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

function extraerIngresosResponse(payload) {
  // El usuario pidió: "ingresosresponse es el valor que responde la api de consultar ingresos"
  // Intentamos varios campos comunes sin asumir un contrato fijo.
  const pick = (obj) => {
    if (!obj || typeof obj !== "object") return null;
    const keys = [
      "ingresosresponse",
      "ingresosResponse",
      "ingresoResponse",
      "ingreso_response",
      "ingreso",
      "INGRESO",
      "idIngreso",
      "idingreso",
      "ingresoId",
      "ingresoid",
    ];
    for (const k of keys) {
      if (obj[k] != null && String(obj[k]).trim() !== "") return String(obj[k]).trim();
    }
    // Si solo hay un valor primitivo en el objeto, úsalo
    const vals = Object.values(obj).filter((v) => ["string", "number"].includes(typeof v));
    if (vals.length === 1) return String(vals[0]).trim();
    return null;
  };

  if (payload == null) return null;
  if (typeof payload === "string" || typeof payload === "number") return String(payload).trim();
  if (Array.isArray(payload)) return pick(payload[0]);
  return pick(payload);
}

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

  // Fallback: buscar en texto crudo
  const txt = String(rawText || "");
  const m = txt.match(/hiscnum\s*["']?\s*[:=]\s*["']?(\d+)/i);
  return m ? m[1] : null;
}

// Inicializar cuando se carga la página
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

  // Mostrar también en el header
  const hdrTip = document.getElementById("hdr-histipdoc");
  const hdrKey = document.getElementById("hdr-hisckey");
  if (hdrTip) hdrTip.textContent = histipdoc;
  if (hdrKey) hdrKey.textContent = hisckey;

  const url = `${API_USERINFO}/capbas/get/${encodeURIComponent(histipdoc)}/${encodeURIComponent(hisckey)}`;
  const msgEl = document.getElementById("capbas-msg");
  const logsEl = document.getElementById("capbas-logs");
  if (logsEl) logsEl.textContent = "";

  try {
    if (msgEl) msgEl.textContent = "Cargando nombres…";
    logCapbas("GET " + url);
    console.log("[Capbas] Petición GET:", url);
    const res = await fetch(url);
    logCapbas("Respuesta: " + res.status + " " + res.statusText);
    console.log("[Capbas] Respuesta:", res.status, res.statusText);
    if (!res.ok) {
      const text = await res.text();
      logCapbas("Error: " + text.slice(0, 500));
      console.warn("[Capbas] Cuerpo error:", text);
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
    if (msgEl) msgEl.textContent = "";

    // --- Consulta adicional: ingresos/get/{hisckey}/{histipdoc} vía backend ---
    try {
      const ingresosUrl = `${API_BASE}/api/ingresos/get/${encodeURIComponent(hisckey)}/${encodeURIComponent(histipdoc)}`;
      logCapbas("INGRESOS GET " + ingresosUrl);
      const r2 = await fetch(ingresosUrl);
      logCapbas("INGRESOS Respuesta: " + r2.status + " " + r2.statusText);
      const body2 = await r2.text();
      // Intentar parsear JSON para imprimir bonito
      let pretty = body2;
      let ingresosPayload = null;
      try {
        const j = JSON.parse(body2);
        ingresosPayload = j;
        pretty = JSON.stringify(j, null, 2);
      } catch (_e) {}
      logCapbas("INGRESOS Body:\n" + pretty.slice(0, 1200) + (pretty.length > 1200 ? "\n…" : ""));

      // --- Booking: hccom/v2/booking/... usando ingresosresponse ---
      const ingresosresponse = extraerIngresosResponse(ingresosPayload);
      if (!ingresosresponse) {
        logCapbas("BOOKING: No se pudo extraer 'ingresosresponse' del response de INGRESOS.");
      } else {
        const bookingUrl = `${API_BASE}/api/hccom/v2/booking/${encodeURIComponent(histipdoc)}/${encodeURIComponent(hisckey)}/${encodeURIComponent(ingresosresponse)}/ARH01/4`;
        logCapbas("BOOKING GET " + bookingUrl);
        const r3 = await fetch(bookingUrl);
        logCapbas("BOOKING Respuesta: " + r3.status + " " + r3.statusText);
        const body3 = await r3.text();
        let pretty3 = body3;
        let bookingPayload = null;
        try {
          const j3 = JSON.parse(body3);
          bookingPayload = j3;
          pretty3 = JSON.stringify(j3, null, 2);
        } catch (_e) {}
        logCapbas("BOOKING Body:\n" + pretty3.slice(0, 1200) + (pretty3.length > 1200 ? "\n…" : ""));

        // Tomar hiscnum y mostrarlo en el campo hiscsec
        const hiscnum = extraerHiscnum(bookingPayload, body3);
        if (!hiscnum) {
          logCapbas("BOOKING: No se encontró 'hiscnum' en el response.");
        } else {
          const elHiscsec = document.getElementById("hiscsec");
          if (elHiscsec) elHiscsec.value = hiscnum;
          try { sessionStorage.setItem("hiscsec", hiscnum); } catch (_e) {}
          try { sessionStorage.setItem("booking_done", "true"); } catch (_e) {}
          // Bloqueo global de folio abierto (se libera cuando Documentos guarda OK)
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
    console.warn("[Capbas] Error:", e.message || e);
  }
});

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

function irADocumentos() {
  sessionStorage.setItem("hiscsec", document.getElementById("hiscsec").value);
  sessionStorage.setItem("imaobs", document.getElementById("imaobs").value);
  // Campos eliminados del formulario; se envían vacíos
  sessionStorage.setItem("imatipreg", "");
  sessionStorage.setItem("imausureg", "");
  sessionStorage.setItem("nombres", document.getElementById("nombres").value);
  sessionStorage.setItem("apellidos", document.getElementById("apellidos").value);
  window.location.href = "documentos.html";
}
