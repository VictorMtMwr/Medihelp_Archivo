let archivos = [];

const API_BASE = (typeof window !== "undefined" && window.APP_CONFIG)
  ? window.APP_CONFIG.BACKEND_BASE
  : "http://127.0.0.1:8000";

const RUTA_BASE = "\\filemh01\USERS\gustavob\Documents\GUSTAVO.BLANCO";

/**
 * Valida login, pre-llena histipdoc/hisckey, oculta login y muestra formulario principal.
 */
function iniciarSesion() {
  const loginHistipdoc = document.getElementById("loginHistipdoc").value.trim();
  const loginHisckey = document.getElementById("loginHisckey").value.trim();
  
  if (!loginHistipdoc || !loginHisckey) {
    alert("Por favor, complete todos los campos");
    return;
  }
  document.getElementById("histipdoc").value = loginHistipdoc;
  document.getElementById("hisckey").value = loginHisckey;
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("formularioPrincipal").style.display = "block";
  inicializarFormularioPrincipal();
}

/**
 * Configura drop zone y file input para arrastrar/seleccionar archivos.
 */
function inicializarFormularioPrincipal() {
  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("fileInput");
  
  if (dropZone && fileInput) {
    dropZone.replaceWith(dropZone.cloneNode(true));
    const newDropZone = document.getElementById("dropZone");
    const newFileInput = document.getElementById("fileInput");
    
    newDropZone.addEventListener("click", () => newFileInput.click());
    newFileInput.addEventListener("change", e => handleFiles(e.target.files));
    
    newDropZone.addEventListener("dragover", e => {
      e.preventDefault();
      newDropZone.classList.add("dragover");
    });
    newDropZone.addEventListener("dragleave", () => newDropZone.classList.remove("dragover"));
    newDropZone.addEventListener("drop", e => {
      e.preventDefault();
      newDropZone.classList.remove("dragover");
      handleFiles(e.dataTransfer.files);
    });
  }
}

const grid = document.getElementById("grid");

document.addEventListener("DOMContentLoaded", () => {
  const loginHistipdoc = document.getElementById("loginHistipdoc");
  const loginHisckey = document.getElementById("loginHisckey");
  
  if (loginHistipdoc && loginHisckey) {
    loginHistipdoc.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        loginHisckey.focus();
      }
    });
    
    loginHisckey.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        iniciarSesion();
      }
    });
  }
});

/**
 * Añade archivos al array archivos (usa file.path en Electron o electronAPI.getFilePath).
 * @param {FileList|File[]} files - Archivos seleccionados.
 */
function handleFiles(files) {
  Array.from(files).forEach(file => {
    let rutaAbsoluta = null;
    if (file.path) {
      rutaAbsoluta = file.path;
    } else if (window.electronAPI && window.electronAPI.getFilePath) {
      rutaAbsoluta = window.electronAPI.getFilePath(file);
    }
    if (!rutaAbsoluta) {
      rutaAbsoluta = RUTA_BASE + file.name;
    }
    
    archivos.push({
      imarutpro: rutaAbsoluta,
      s1CODIMA: "",
      file
    });
  });
  render();
}

/**
 * Vuelve a dibujar la grilla de cards (preview, nombre, input S1CODIMA, eliminar).
 */
function render() {
  grid.innerHTML = "";

  archivos.forEach((a, i) => {
    const card = document.createElement("div");
    card.className = "card";

    const preview = document.createElement("div");
    preview.className = "preview";
    preview.innerHTML = "<span>📄</span>";

    const name = document.createElement("div");
    name.className = "filename";
    name.textContent = a.file.name;

    const input = document.createElement("input");
    input.placeholder = "S1CODIMA obligatorio";
    input.value = a.s1CODIMA;
    input.oninput = e => a.s1CODIMA = e.target.value;

    const del = document.createElement("button");
    del.className = "delete-btn";
    del.textContent = "Eliminar";
    del.onclick = () => {
      archivos.splice(i, 1);
      render();
    };

    card.append(preview, name, input, del);
    grid.appendChild(card);
  });
}

/**
 * Vacía campos del formulario, array archivos y el input file; re-renderiza la grilla.
 */
function limpiarFormulario() {
  document.getElementById("histipdoc").value = "";
  document.getElementById("hisckey").value = "";
  document.getElementById("hiscsec").value = "";
  document.getElementById("imafechor").value = "";
  document.getElementById("codpro").value = "";
  document.getElementById("imatipreg").value = "";
  document.getElementById("imausureg").value = "";
  document.getElementById("imaobs").value = "";
  archivos = [];
  const fileInput = document.getElementById("fileInput");
  if (fileInput) fileInput.value = "";
  render();
}

/**
 * Valida S1CODIMA en todos los archivos, genera registros con imacnsreg e imafechor,
 * envía POST /guardar por cada uno y al finalizar OK limpia y muestra alert.
 */
function guardar() {
  let valido = true;

  archivos.forEach((a, i) => {
    if (!a.s1CODIMA) {
      grid.children[i].querySelector("input").classList.add("error");
      valido = false;
    }
  });

  if (!valido) {
    alert("Todos los documentos deben tener S1CODIMA");
    return;
  }
  const ahora = new Date();
  const año = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  const horas = String(ahora.getHours()).padStart(2, '0');
  const minutos = String(ahora.getMinutes()).padStart(2, '0');
  const segundos = String(ahora.getSeconds()).padStart(2, '0');
  const milisegundos = String(ahora.getMilliseconds()).padStart(3, '0');
  const fechaHora = `${año}-${mes}-${dia} ${horas}:${minutos}:${segundos}.${milisegundos}`;
  const contadorS1CODIMA = {};
  const registros = archivos.map(a => {
    const s1CODIMA = a.s1CODIMA;
    if (!contadorS1CODIMA[s1CODIMA]) {
      contadorS1CODIMA[s1CODIMA] = 1;
    } else {
      contadorS1CODIMA[s1CODIMA]++;
    }
    const imacnsreg = contadorS1CODIMA[s1CODIMA];
    return {
      imapronqpk: {
        histipdoc: histipdoc.value,
        hisckey: hisckey.value,
        imacnsreg: imacnsreg.toString(),
        hiscsec: hiscsec.value
      },
      imafechor: fechaHora, // Fecha y hora automática
      imaobs: imaobs.value,
      codpro: codpro.value,
      imatipreg: imatipreg.value,
      imausureg: imausureg.value,
      archivos: a.imarutpro
    };
  });

  const guardarRegistros = async () => {
    try {
      for (let i = 0; i < registros.length; i++) {
        const registro = registros[i];
        const response = await fetch(`${API_BASE}/guardar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(registro)
        });
        
        if (!response.ok) {
          throw new Error(`Error al guardar registro ${i + 1}`);
        }
        if (i < registros.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      alert(`Se guardaron ${registros.length} registro(s) correctamente`);
      limpiarFormulario();
    } catch (error) {
      console.error("Error al guardar:", error);
      alert(`Error al guardar: ${error.message}`);
    }
  };

  guardarRegistros();
}
