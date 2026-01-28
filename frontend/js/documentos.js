let archivos = [];

// Ruta base UNC. Usar String.raw para evitar que JS "coma" los backslashes.
// Valor real: \\filemh01\USERS\gustavob\Documents\GUSTAVO.BLANCO
const RUTA_BASE = String.raw`\\filemh01\USERS\gustavob\Documents\GUSTAVO.BLANCO`;
const RUTIMA_CACHE = new Map(); // s1codima(string) -> destDir(string)

function joinUncDirAndName(dir, name) {
  const d = String(dir || "").trim().replaceAll("/", "\\").replace(/\s+$/g, "");
  if (!d) return name;
  const normalized = d.endsWith("\\") ? d.slice(0, -1) : d;
  return `${normalized}\\${name}`;
}

function normalizeRutimaDir(rutima) {
  const raw = String(rutima || "").replaceAll("/", "\\").replace(/\s+$/g, "").trim();
  if (!raw) return "";
  // asegurar \\ al inicio
  if (raw.startsWith("\\\\")) return raw;
  if (raw.startsWith("\\")) return `\\${raw}`;
  return `\\\\${raw}`;
}

async function getRutimaDirForCodima(backendBase, s1codima) {
  const code = String(s1codima || "").trim();
  if (!code) return "";
  if (RUTIMA_CACHE.has(code)) return RUTIMA_CACHE.get(code);

  const url = `${backendBase}/api/imahc/get/${encodeURIComponent(code)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`imahc/get/${code} -> HTTP ${res.status}. ${t.slice(0, 200)}`);
  }
  const data = await res.json().catch(() => ({}));
  const rutima = data?.rutima_clean ?? data?.rutima ?? "";
  const dir = normalizeRutimaDir(rutima);
  RUTIMA_CACHE.set(code, dir);
  return dir;
}

const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const grid = document.getElementById("grid");
const toastContainer = document.getElementById("toastContainer");
const loadingOverlay = document.getElementById("loadingOverlay");
const loadingText = document.getElementById("loadingText");
const confirmModal = document.getElementById("confirmModal");
const confirmModalTitle = document.getElementById("confirmModalTitle");
const confirmModalDesc = document.getElementById("confirmModalDesc");
const confirmModalCancel = document.getElementById("confirmModalCancel");
const confirmModalConfirm = document.getElementById("confirmModalConfirm");

const S1CODIMA_OPTIONS = (typeof window !== "undefined" && window.APP_CONFIG && Array.isArray(window.APP_CONFIG.S1CODIMA_OPTIONS))
  ? window.APP_CONFIG.S1CODIMA_OPTIONS
  : [];
const S1CODIMA_MAP = new Map(S1CODIMA_OPTIONS.map((o) => [String(o.value), o]));

// Inicializar cuando se carga la página
document.addEventListener("DOMContentLoaded", () => {
  // Verificar que hay datos del registro
  const histipdoc = sessionStorage.getItem("histipdoc");
  const hisckey = sessionStorage.getItem("hisckey");
  
  if (!histipdoc || !hisckey) {
    // Si no hay datos, redirigir al login
    window.location.href = "login.html";
    return;
  }

  // Mostrar también en el header (Documentos)
  const hdrTip = document.getElementById("hdr-histipdoc-docs");
  const hdrKey = document.getElementById("hdr-hisckey-docs");
  if (hdrTip) hdrTip.textContent = histipdoc;
  if (hdrKey) hdrKey.textContent = hisckey;
  
  // Inicializar event listeners
  if (dropZone && fileInput) {
    dropZone.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", e => handleFiles(e.target.files));
    
    dropZone.addEventListener("dragover", e => {
      e.preventDefault();
      dropZone.classList.add("dragover");
    });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
    dropZone.addEventListener("drop", e => {
      e.preventDefault();
      dropZone.classList.remove("dragover");
      handleFiles(e.dataTransfer.files);
    });
  }
});

function showToast(title, message, variant = "success", details = null, timeoutMs = 6000) {
  if (!toastContainer) {
    // Fallback final: no bloquear con alert; solo consola.
    console.log(`[Toast:${variant}] ${title} - ${message}`);
    if (details) console.log(details);
    return;
  }

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

  if (timeoutMs && timeoutMs > 0) {
    window.setTimeout(remove, timeoutMs);
  }
}

function setLoading(isOpen, text = "Procesando…") {
  if (!loadingOverlay) return;
  if (isOpen) {
    if (loadingText) loadingText.textContent = text;
    loadingOverlay.hidden = false;
    loadingOverlay.removeAttribute("hidden");
    loadingOverlay.classList.add("is-open");
    loadingOverlay.setAttribute("aria-hidden", "false");
    try { document.body.setAttribute("aria-busy", "true"); } catch (_e) {}
  } else {
    loadingOverlay.classList.remove("is-open");
    loadingOverlay.hidden = true;
    loadingOverlay.setAttribute("hidden", "");
    loadingOverlay.setAttribute("aria-hidden", "true");
    try { document.body.removeAttribute("aria-busy"); } catch (_e) {}
  }
}

function confirmGuardarModal({
  title = "¿Desea cerrar el folio y guardar?",
  message = "Seleccione 'Revisar' si desea revisar algún documento antes de guardar.",
  confirmText = "Guardar",
  cancelText = "Revisar",
} = {}) {
  return new Promise((resolve) => {
    // Fallback por si falta el modal en el HTML
    if (!confirmModal || !confirmModalTitle || !confirmModalDesc || !confirmModalCancel || !confirmModalConfirm) {
      const ok = window.confirm(`${title}\n\n${message}`);
      resolve(!!ok);
      return;
    }

    confirmModalTitle.textContent = title;
    confirmModalDesc.textContent = message;
    confirmModalConfirm.textContent = confirmText;
    confirmModalCancel.textContent = cancelText;

    // Mostrar (solo cuando se confirma guardado)
    confirmModal.hidden = false;
    confirmModal.removeAttribute("hidden");
    confirmModal.classList.add("is-open");

    const cleanup = () => {
      confirmModal.hidden = true;
      confirmModal.setAttribute("hidden", "");
      confirmModal.classList.remove("is-open");
      // limpiar handlers (más robusto que removeEventListener si hay múltiples aperturas)
      confirmModal.onclick = null;
      confirmModalCancel.onclick = null;
      confirmModalConfirm.onclick = null;
      document.removeEventListener("keydown", onKeyDown);
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    const onConfirm = () => {
      cleanup();
      resolve(true);
    };

    const onOverlayClick = (e) => {
      // si hace click fuera del cuadro, se considera "Revisar"
      if (e.target === confirmModal) onCancel();
    };

    const onKeyDown = (e) => {
      if (e.key === "Escape") onCancel();
      // Evitar confirmaciones accidentales con Enter (el usuario debe hacer click)
    };

    confirmModalCancel.onclick = (e) => {
      try { e.preventDefault(); e.stopPropagation(); } catch (_e) {}
      onCancel();
    };
    confirmModalConfirm.onclick = (e) => {
      try { e.preventDefault(); e.stopPropagation(); } catch (_e) {}
      onConfirm();
    };
    confirmModal.onclick = onOverlayClick;
    document.addEventListener("keydown", onKeyDown);

    // Foco inicial
    window.setTimeout(() => {
      try { confirmModalConfirm.focus(); } catch (_e) {}
    }, 0);
  });
}

function volverAtras() {
  const bookingDone = sessionStorage.getItem("booking_done") === "true";
  const docsUploaded = sessionStorage.getItem("docs_uploaded") === "true";
  if (bookingDone && !docsUploaded) {
    showToast("Acción no permitida", "Debe cargar al menos 1 documento antes de volver.", "warn", null, 7000);
    return;
  }
  window.location.href = "registro.html";
}

function crearS1CodimaControl(valorActual, onChange, idx) {
  // Un solo campo (una celda) con autocompletado + escritura manual
  const wrapper = document.createElement("div");
  wrapper.className = "s1codima-field";

  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "numeric";
  input.className = "s1codima-input";
  input.placeholder = "S1CODIMA (seleccione o escriba el código)";

  // datalist para mostrar "código - nombre" en una sola celda
  const listId = `s1codima-list-${idx}`;
  input.setAttribute("list", listId);

  const datalist = document.createElement("datalist");
  datalist.id = listId;

  S1CODIMA_OPTIONS.forEach((o) => {
    const opt = document.createElement("option");
    // el usuario verá "código - nombre" en sugerencias
    opt.value = String(o.label ?? o.value);
    datalist.appendChild(opt);
  });

  const helper = document.createElement("div");
  helper.className = "s1codima-helper";

  const normalizarACodigo = (raw) => {
    const txt = (raw ?? "").trim();
    if (!txt) return "";
    // Acepta "12" o "12 - ORDENES..." o "12-ORDENES..."
    const m = txt.match(/^(\d{1,3})/);
    return m ? m[1] : "";
  };

  const actualizarEstado = (raw, shouldCommit) => {
    const code = normalizarACodigo(raw);
    const item = code ? S1CODIMA_MAP.get(code) : null;

    if (!code) {
      input.classList.remove("error");
      helper.textContent = "";
      if (shouldCommit) onChange("");
      return;
    }

    if (!item) {
      input.classList.add("error");
      helper.textContent = "Código no permitido (no está en la lista)";
      if (shouldCommit) onChange("");
      return;
    }

    input.classList.remove("error");
    helper.textContent = String(item.label ?? item.value);
    if (shouldCommit) onChange(code);
  };

  // Inicializar
  const init = (valorActual ?? "").trim();
  if (init && S1CODIMA_MAP.has(init)) {
    const item = S1CODIMA_MAP.get(init);
    input.value = String(item?.label ?? init);
    helper.textContent = String(item?.label ?? init);
  } else {
    input.value = "";
    helper.textContent = "";
  }

  input.addEventListener("input", (e) => {
    actualizarEstado(e.target.value, true);
  });

  // Al salir del campo, si no es válido, lo limpiamos para "controlar" el ingreso
  input.addEventListener("blur", (e) => {
    const code = normalizarACodigo(e.target.value);
    if (code && !S1CODIMA_MAP.has(code)) {
      e.target.value = "";
      helper.textContent = "";
      e.target.classList.remove("error");
      onChange("");
      return;
    }
    // si es válido, dejamos el texto completo "código - nombre" en el input
    if (code && S1CODIMA_MAP.has(code)) {
      const item = S1CODIMA_MAP.get(code);
      e.target.value = String(item?.label ?? code);
      helper.textContent = String(item?.label ?? code);
      onChange(code);
    }
  });

  wrapper.append(input, datalist, helper);
  return wrapper;
}

function mostrarFallbackPDF(preview) {
  preview.innerHTML = `
    <div style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #f5f5f5;">
      <span style="font-size: 48px; margin-bottom: 10px;">📄</span>
      <span style="font-size: 12px; color: #666;">PDF</span>
    </div>
  `;
}

function mostrarEmbedPDF(preview, fileUrl) {
  // Fallback final (Windows/Electron): incrustar el PDF directamente
  preview.innerHTML = "";
  const iframe = document.createElement("iframe");
  iframe.src = `${fileUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0`;
  iframe.loading = "lazy";
  iframe.tabIndex = -1;
  iframe.setAttribute("tabindex", "-1");
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "none";
  preview.appendChild(iframe);
}

async function renderPdfPreview(preview, file, fileUrl) {
  // Intenta renderizar con PDF.js (sin worker) y si falla, usa embed.
  if (typeof pdfjsLib === "undefined") {
    mostrarEmbedPDF(preview, fileUrl);
    return;
  }

  try {
    preview.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#666;">Cargando...</div>';

    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer, disableWorker: true }).promise;
    const page = await pdf.getPage(1);

    // Render simple (evita escalas gigantes que fallan en Windows con PDFs pesados)
    const baseViewport = page.getViewport({ scale: 1 });
    const desiredCssWidth = 290; // aprox. ancho de la card
    const cssScale = Math.min(2, desiredCssWidth / baseViewport.width);
    const dpr = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: cssScale * dpr });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    // Mostrar canvas ajustado al contenedor
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.objectFit = "contain";

    await page.render({ canvasContext: ctx, viewport }).promise;

    preview.innerHTML = "";
    preview.appendChild(canvas);
  } catch (e) {
    console.warn("[PDF Preview] Falló PDF.js, usando embed:", e);
    mostrarEmbedPDF(preview, fileUrl);
  }
}

function handleFiles(files) {
  const incoming = Array.from(files || []);
  if (!incoming.length) return;

  const aceptados = [];
  const rechazados = [];

  for (const file of incoming) {
    const name = String(file?.name || "").toLowerCase();
    const type = String(file?.type || "").toLowerCase();
    const esPdf = name.endsWith(".pdf") || type === "application/pdf";

    if (!esPdf) {
      rechazados.push(file?.name || "(sin nombre)");
      continue;
    }
    aceptados.push(file);
  }

  if (rechazados.length) {
    const preview = rechazados.slice(0, 10).map((n) => `- ${n}`).join("\n");
    showToast(
      "Solo se permiten PDF",
      `Se rechazaron ${rechazados.length} archivo(s) porque no son PDF.`,
      "warn",
      preview + (rechazados.length > 10 ? "\n…" : ""),
      9000
    );
  }

  aceptados.forEach(file => {
    let rutaAbsoluta = null;
    
    // En Electron, file.path contiene la ruta absoluta completa
    if (file.path) {
      rutaAbsoluta = file.path;
    }
    // Si estamos en un navegador web (fallback)
    else if (window.electronAPI && window.electronAPI.getFilePath) {
      rutaAbsoluta = window.electronAPI.getFilePath(file);
    }
    // Si no se puede obtener la ruta absoluta, usar la ruta base configurada
    if (!rutaAbsoluta) {
      rutaAbsoluta = `${RUTA_BASE}\\${file.name}`;
    }
    
    console.log('Archivo cargado:', file.name, 'Ruta absoluta:', rutaAbsoluta);
    
    archivos.push({
      imarutpro: rutaAbsoluta,
      s1CODIMA: "",
      file
    });
  });
  // Marcar que al menos 1 documento fue cargado en esta sesión
  try {
    if (aceptados.length > 0) sessionStorage.setItem("docs_uploaded", "true");
  } catch (_e) {}
  render();
}

function render() {
  if (!grid) return;
  
  grid.innerHTML = "";

  archivos.forEach((a, i) => {
    const card = document.createElement("div");
    card.className = "card";

    const preview = document.createElement("div");
    preview.className = "preview";
    
    // Crear URL del objeto para previsualización
    const fileUrl = URL.createObjectURL(a.file);
    const fileName = a.file.name.toLowerCase();
    
    // Determinar tipo de archivo y mostrar previsualización apropiada
    if (fileName.endsWith('.pdf')) {
      renderPdfPreview(preview, a.file, fileUrl);
      
    } else if (fileName.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/)) {
      // Para imágenes, usar img tag
      const img = document.createElement("img");
      img.src = fileUrl;
      img.onload = () => {
        // Ajustar el preview al tamaño exacto de la imagen
        const cardElement = preview.closest('.card');
        const containerWidth = cardElement ? (cardElement.offsetWidth - 30) : 290;
        const imgAspectRatio = img.naturalWidth / img.naturalHeight;
        let displayWidth = containerWidth;
        let displayHeight = containerWidth / imgAspectRatio;
        
        preview.style.width = displayWidth + 'px';
        preview.style.height = displayHeight + 'px';
        img.style.width = displayWidth + 'px';
        img.style.height = displayHeight + 'px';
        img.style.display = 'block';
        img.style.objectFit = 'contain';
      };
      img.onerror = () => {
        preview.innerHTML = "<span>📷</span>";
      };
      preview.appendChild(img);
    } else {
      // Para otros tipos, mostrar icono genérico
      preview.innerHTML = "<span>📄</span>";
    }

    const name = document.createElement("div");
    name.className = "filename";
    name.textContent = a.file.name;
    name.title = a.file.name; // Tooltip con nombre completo

    const s1Control = crearS1CodimaControl(a.s1CODIMA, (val) => {
      a.s1CODIMA = val;
    }, i);

    const del = document.createElement("button");
    del.className = "delete-btn";
    del.textContent = "Eliminar";
    del.tabIndex = -1;
    del.onclick = () => {
      // Liberar URL del objeto al eliminar
      if (a.fileUrl) {
        URL.revokeObjectURL(a.fileUrl);
      }
      archivos.splice(i, 1);
      render();
    };

    // Guardar la URL en el objeto para poder liberarla después
    a.fileUrl = fileUrl;

    card.append(preview, name, s1Control, del);
    grid.appendChild(card);
  });
}

async function guardar() {
  if (!archivos || archivos.length === 0) {
    showToast("Validación", "Debe cargar al menos 1 documento antes de guardar.", "error", null, 7000);
    return;
  }
  let valido = true;

  archivos.forEach((a, i) => {
    const code = (a.s1CODIMA ?? "").trim();
    const card = grid.children[i];
    const inp = card ? card.querySelector("input.s1codima-input") : null;
    const helper = card ? card.querySelector(".s1codima-helper") : null;

    const isValid = !!code && S1CODIMA_MAP.has(code);
    if (!isValid) {
      if (inp) inp.classList.add("error");
      if (helper && code) helper.textContent = "Código no existe en la lista";
      valido = false;
    } else {
      if (inp) inp.classList.remove("error");
    }
  });

  if (!valido) {
    showToast("Validación", "Todos los documentos deben tener S1CODIMA.", "error", null, 7000);
    return;
  }

  const okCerrar = await confirmGuardarModal({
    title: "¿Desea cerrar el folio y guardar?",
    message: "Seleccione 'Revisar' si desea revisar algún documento antes de guardar.",
    confirmText: "Guardar",
    cancelText: "Revisar",
  });
  if (!okCerrar) return;

  const backendBase = (typeof window !== "undefined" && window.APP_CONFIG)
    ? window.APP_CONFIG.BACKEND_BASE
    : "http://127.0.0.1:8000";

  setLoading(true, "Guardando…");

  // Obtener datos del formulario desde sessionStorage
  const histipdoc = sessionStorage.getItem("histipdoc");
  const hisckey = sessionStorage.getItem("hisckey");
  const hiscsec = sessionStorage.getItem("hiscsec") || "";
  const imaobs = sessionStorage.getItem("imaobs") || "";
  const imatipreg = sessionStorage.getItem("imatipreg") || "";
  const imausureg = sessionStorage.getItem("imausureg") || "";
  const codpro = sessionStorage.getItem("codpro") || "";

  // Generar fecha y hora automáticamente en el momento de guardar
  // Formato ISO esperado por la API (ej: 2026-01-27T20:15:11.482Z)
  const fechaHora = new Date().toISOString();
  
  // Calcular IMACNSREG para cada archivo: contador creciente por cada repetición de S1CODIMA
  // Si un S1CODIMA se repite, el primero tiene 1, el segundo 2, etc.
  const contadorS1CODIMA = {};

  // Resolver rutima por S1CODIMA (en paralelo, con caché)
  const uniqueCodes = Array.from(new Set(archivos.map((a) => String(a.s1CODIMA || "").trim()))).filter(Boolean);
  const rutimaByCode = new Map();
  try {
    setLoading(true, "Consultando rutas…");
    await Promise.all(uniqueCodes.map(async (code) => {
      const dir = await getRutimaDirForCodima(backendBase, code);
      rutimaByCode.set(code, dir || "");
    }));
  } catch (e) {
    // No bloqueamos si falla: usamos fallback RUTA_BASE
    console.warn("[IMAHC] No se pudo resolver rutima, usando fallback:", e);
    showToast("Aviso", "No se pudo consultar la ruta (rutima) para algunos S1CODIMA. Se usará ruta por defecto.", "warn", e?.message || String(e), 12000);
  }
  
  // Crear un registro por cada archivo
  const registros = archivos.map(a => {
    const s1CODIMA = a.s1CODIMA;
    
    // Inicializar contador para este S1CODIMA si no existe (empezando en 1)
    if (!contadorS1CODIMA[s1CODIMA]) {
      contadorS1CODIMA[s1CODIMA] = 1;
    } else {
      // Incrementar si ya existe
      contadorS1CODIMA[s1CODIMA]++;
    }
    
    // Asignar el valor del contador (empezando desde 1)
    const imacnsreg = contadorS1CODIMA[s1CODIMA];
    // Guardar IMACNSREG en el objeto del archivo para reutilizarlo al copiar
    a.imacnsreg = imacnsreg;
    
    // Obtener la extensión del archivo original
    const extension = a.file.name.split('.').pop() || 'pdf';
    
    // Generar nombre de archivo en formato:
    // S1CODIMA-HISCKEY-HISTIPDOC-HISCSEC-IMACNSREG.ext
    const nombreArchivo = `${s1CODIMA}-${hisckey}-${histipdoc}-${hiscsec}-${imacnsreg}.${extension}`;

    // Ruta destino: por rutima (imahc/get) y fallback a RUTA_BASE
    const destDir = rutimaByCode.get(String(s1CODIMA).trim()) || RUTA_BASE;
    a.destDir = destDir;
    const rutaDestino = joinUncDirAndName(destDir, nombreArchivo);
    
    // Crear un registro por cada archivo
    return {
      imapronqpk: {
        s1CODIMA: Number(s1CODIMA) || 0,
        histipdoc: histipdoc,
        hisckey: hisckey,
        imacnsreg: Number(imacnsreg) || 0,
        hiscsec: Number(hiscsec) || 0
      },
      imafechor: fechaHora, // Fecha y hora automática
      imaobs: imaobs,
      imatipreg: imatipreg,
      imausureg: imausureg,
      codpro: codpro,
      imarutpro: rutaDestino  // Ruta destino final (UNC) con nombre formateado
    };
  });

  console.log("Registros a guardar:", registros);
  console.log(`Total de registros a guardar: ${registros.length}`);

  // Guardar cada registro por separado con un pequeño delay entre cada uno
  const guardarRegistros = async () => {
    try {
      setLoading(true, "Enviando registros…");
      for (let i = 0; i < registros.length; i++) {
        const registro = registros[i];
        console.log(`Guardando registro ${i + 1} de ${registros.length}:`, registro);

        const response = await fetch(`${backendBase}/guardar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(registro)
        });
        
        if (!response.ok) {
          throw new Error(`Error al guardar registro ${i + 1}`);
        }
        
        // Pequeño delay entre registros para evitar problemas
        if (i < registros.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // Copiar archivos al servidor una vez guardado el registro
      // Copiar archivos al servidor una vez guardado el registro (vía backend FastAPI)
      setLoading(true, "Copiando archivos…");
      const copyErrors = [];
      const copied = [];

      for (let i = 0; i < archivos.length; i++) {
        const a = archivos[i];
        const s1CODIMA = a.s1CODIMA;
        const imacnsreg = a.imacnsreg != null ? a.imacnsreg : (i + 1);
        const extension = a.file?.name?.split(".").pop() || "pdf";
        const nombreArchivo = `${s1CODIMA}-${hisckey}-${histipdoc}-${hiscsec}-${imacnsreg}.${extension}`;
        const destDir = a.destDir || rutimaByCode.get(String(s1CODIMA).trim()) || RUTA_BASE;

        // Por ahora el backend valida .pdf; si llega otro tipo, se reporta como error.
        const form = new FormData();
        form.append("file", a.file);
        form.append("dest_name", nombreArchivo);
        form.append("dest_dir", destDir);

        try {
          const resp = await fetch(`${backendBase}/api/archivos/copiar`, {
            method: "POST",
            body: form,
          });
          const payload = await resp.json().catch(() => ({}));

          if (!resp.ok || !payload?.ok) {
            copyErrors.push({
              name: a.file?.name,
              destName: nombreArchivo,
              destDir,
              error: payload?.detail || `HTTP ${resp.status}`,
            });
          } else {
            copied.push(payload);
          }
        } catch (e) {
          copyErrors.push({
            name: a.file?.name,
            destName: nombreArchivo,
            destDir,
            error: e?.message || String(e),
          });
        }
      }

      if (copyErrors.length) {
        console.warn("[Copy Backend] Errores:", copyErrors);
        const preview = copyErrors.slice(0, 3).map((e) =>
          `- Archivo: ${e.name}\n  Destino: ${joinUncDirAndName(e.destDir || RUTA_BASE, e.destName)}\n  Error: ${e.error}`
        ).join("\n\n");
        showToast(
          "Guardado con errores",
          `Se guardaron ${registros.length} registro(s), pero hubo errores al copiar ${copyErrors.length} archivo(s).`,
          "warn",
          `${preview}`,
          12000
        );

        // Dejar la pantalla lista para cargar nuevos documentos (sin bloquear)
        setLoading(false);
        archivos.forEach((a) => {
          try {
            if (a?.fileUrl) URL.revokeObjectURL(a.fileUrl);
          } catch (_e) {}
        });
        archivos = [];
        if (fileInput) fileInput.value = "";
        render();
      } else {
        const first = copied.slice(0, 5).map((c) =>
          `- ${c?.dest_path}${c?.bytes != null ? ` (bytes: ${c.bytes})` : ""}`
        ).join("\n");
        const destDirs = Array.from(new Set(archivos.map((a) => a.destDir || "").filter(Boolean))).slice(0, 5).join("\n");
        showToast(
          "Guardado OK",
          `Se guardaron ${registros.length} registro(s) y se copiaron los archivos correctamente.`,
          "success",
          `Destinos (ejemplos):\n${destDirs || RUTA_BASE}\n\nEjemplos copiados:\n${first}`,
          5000
        );

        // Liberar bloqueo de cierre del folio (ya guardó y copió OK)
        try {
          localStorage.setItem("folio_closed", "true");
          localStorage.removeItem("folio_locked");
        } catch (_e) {}

        // Confirmado guardado + copiado: volver a login
        window.setTimeout(() => {
          // Mostrar overlay solo al momento de redirigir
          setLoading(true, "Redirigiendo a login…");
          // Guardar toast para mostrarlo en login el tiempo restante (hasta completar 5s)
          try {
            localStorage.setItem("flash_toast", JSON.stringify({
              title: "Guardado OK",
              message: `Se guardaron ${registros.length} registro(s) y se copiaron los archivos correctamente.`,
              variant: "success",
              details: `Destinos (ejemplos):\n${destDirs || RUTA_BASE}\n\nEjemplos copiados:\n${first}`,
              startedAt: Date.now(),
              ttlMs: 5000,
            }));
          } catch (_e) {}

          try { sessionStorage.clear(); } catch (_e) {}
          window.location.href = "login.html";
        }, 1000);
      }
    } catch (error) {
      console.error("Error al guardar:", error);
      setLoading(false);
      showToast("Error", `Error al guardar: ${error.message}`, "error", null, 12000);
    }
  };

  guardarRegistros();
}

