(function () {
  if (typeof sessionStorage !== "undefined" && sessionStorage.getItem("booking_done") === "true" && sessionStorage.getItem("docs_uploaded") !== "true") {
    window.location.replace("documentos.html");
  }
})();

/**
 * Valida tipo y número de documento, llama a /api/hiscsec y navega a registro con los datos en sessionStorage.
 */
async function iniciarSesion() {
  const API_BASE = (typeof window !== "undefined" && window.APP_CONFIG)
    ? window.APP_CONFIG.BACKEND_BASE
    : "http://127.0.0.1:8000";

  const loginHistipdoc = document.getElementById("loginHistipdoc").value.trim();
  const loginHisckey = document.getElementById("loginHisckey").value.trim();
  const helpText = document.querySelector(".login-help-text");

  if (!loginHistipdoc || !loginHisckey) {
    if (helpText) {
      helpText.classList.add("login-error");
      if (!loginHistipdoc && !loginHisckey) {
        helpText.textContent = "Por favor, seleccione el tipo de documento e ingrese el número.";
      } else if (!loginHistipdoc) {
        helpText.textContent = "Por favor, seleccione el tipo de documento.";
      } else {
        helpText.textContent = "Por favor, ingrese el número de documento.";
      }
    }
    if (!loginHistipdoc) {
      document.getElementById("loginHistipdoc").focus();
    } else if (!loginHisckey) {
      document.getElementById("loginHisckey").focus();
    }
    return;
  }

  try {
    if (helpText) {
      helpText.textContent = "";
      helpText.classList.remove("login-error");
    }
    const resp = await fetch(`${API_BASE}/api/hiscsec/${encodeURIComponent(loginHisckey)}`);
    if (!resp.ok) {
      if (resp.status === 404) {
        if (helpText) {
          helpText.classList.add("login-error");
          helpText.textContent = "No se encontró información en HIS para este número de documento.";
        }
      } else {
        if (helpText) {
          helpText.classList.add("login-error");
          helpText.textContent = "Error al consultar HIS. Intente nuevamente.";
        }
      }
      return;
    }
    const data = await resp.json();
    sessionStorage.setItem("histipdoc", loginHistipdoc);
    sessionStorage.setItem("hisckey", loginHisckey);
    sessionStorage.setItem("hiscsec", data.hiscsec ?? "");
    window.location.href = "registro.html";
  } catch (error) {
    console.error("Error al llamar al backend /api/hiscsec:", error);
    if (helpText) {
      helpText.classList.add("login-error");
      helpText.textContent = "Error de conexión con el servidor. Verifique que el backend esté en ejecución.";
    }
  }
}

/**
 * Muestra un toast en #toastContainer. Si no existe, no hace nada.
 * @param {string} title - Título.
 * @param {string} message - Mensaje.
 * @param {string} [variant="success"] - success | warn | error.
 * @param {string|null} details - Texto en "Ver detalles".
 * @param {number} [timeoutMs=5000] - Tiempo para auto-ocultar (0 = no).
 */
function showToast(title, message, variant = "success", details = null, timeoutMs = 5000) {
  const toastContainer = document.getElementById("toastContainer");
  if (!toastContainer) return;

  const el = document.createElement("div");
  el.className = `toast toast-${variant}`;
  const header = document.createElement("div");
  header.className = "toast-header";
  const t = document.createElement("div");
  t.className = "toast-title";
  t.textContent = title;
  const close = document.createElement("button");
  close.className = "toast-close";
  close.type = "button";
  close.setAttribute("aria-label", "Cerrar");
  close.textContent = "×";
  const body = document.createElement("div");
  body.className = "toast-body";
  body.textContent = message;
  header.append(t, close);
  el.append(header, body);
  if (details) {
    const det = document.createElement("details");
    const sum = document.createElement("summary");
    sum.textContent = "Ver detalles";
    const pre = document.createElement("pre");
    pre.textContent = String(details);
    det.append(sum, pre);
    el.append(det);
  }
  const remove = () => {
    try { el.remove(); } catch (_e) {}
  };
  close.addEventListener("click", remove);
  toastContainer.appendChild(el);
  if (timeoutMs && timeoutMs > 0) window.setTimeout(remove, timeoutMs);
}

document.addEventListener("DOMContentLoaded", () => {
  const loginHistipdoc = document.getElementById("loginHistipdoc");
  const loginHisckey = document.getElementById("loginHisckey");
  if (loginHistipdoc && loginHisckey) {
    loginHistipdoc.addEventListener("keypress", (e) => {
      if (e.key === "Enter") loginHisckey.focus();
    });
    loginHisckey.addEventListener("keypress", (e) => {
      if (e.key === "Enter") iniciarSesion();
    });
    loginHistipdoc.focus();
  }
  try {
    const raw = localStorage.getItem("flash_toast");
    if (raw) {
      const payload = JSON.parse(raw);
      localStorage.removeItem("flash_toast");
      const startedAt = Number(payload?.startedAt || 0);
      const ttlMs = Number(payload?.ttlMs || 5000);
      const elapsed = startedAt ? (Date.now() - startedAt) : 0;
      const remaining = Math.max(0, ttlMs - elapsed);
      if (remaining > 0) {
        showToast(
          String(payload?.title || "Guardado OK"),
          String(payload?.message || "Se guardó correctamente."),
          String(payload?.variant || "success"),
          payload?.details ?? null,
          remaining
        );
      }
    }
  } catch (_e) {}
});
