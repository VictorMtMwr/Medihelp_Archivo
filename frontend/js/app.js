let archivos = [];

// Ruta base configurada automáticamente
const RUTA_BASE = "\\filemh01\USERS\gustavob\Documents\GUSTAVO.BLANCO";

// Función para iniciar sesión
function iniciarSesion() {
  const loginHistipdoc = document.getElementById("loginHistipdoc").value.trim();
  const loginHisckey = document.getElementById("loginHisckey").value.trim();
  
  if (!loginHistipdoc || !loginHisckey) {
    alert("Por favor, complete todos los campos");
    return;
  }
  
  // Pre-llenar los campos del formulario principal
  document.getElementById("histipdoc").value = loginHistipdoc;
  document.getElementById("hisckey").value = loginHisckey;
  
  // Ocultar pantalla de login y mostrar formulario principal
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("formularioPrincipal").style.display = "block";
  
  // Inicializar event listeners del formulario principal
  inicializarFormularioPrincipal();
}

// Función para inicializar los event listeners del formulario principal
function inicializarFormularioPrincipal() {
  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("fileInput");
  
  if (dropZone && fileInput) {
    // Remover listeners anteriores si existen
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

// Permitir Enter en los campos de login
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

function handleFiles(files) {
  Array.from(files).forEach(file => {
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
      rutaAbsoluta = RUTA_BASE + file.name;
    }
    
    console.log('Archivo cargado:', file.name, 'Ruta absoluta:', rutaAbsoluta);
    
    archivos.push({
      imarutpro: rutaAbsoluta,
      s1CODIMA: "",
      file
    });
  });
  render();
}

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

function limpiarFormulario() {
  // Limpiar todos los campos del formulario
  document.getElementById("histipdoc").value = "";
  document.getElementById("hisckey").value = "";
  document.getElementById("hiscsec").value = "";
  document.getElementById("imafechor").value = "";
  document.getElementById("codpro").value = "";
  document.getElementById("imatipreg").value = "";
  document.getElementById("imausureg").value = "";
  document.getElementById("imaobs").value = "";
  
  // Limpiar la lista de archivos
  archivos = [];
  
  // Limpiar el input de archivos
  const fileInput = document.getElementById("fileInput");
  if (fileInput) {
    fileInput.value = "";
  }
  
  // Re-renderizar la grilla (quedará vacía)
  render();
}

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

  // Generar fecha y hora automáticamente en el momento de guardar
  // Formato: YYYY-MM-DD HH:MM:SS.mmm
  const ahora = new Date();
  const año = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  const horas = String(ahora.getHours()).padStart(2, '0');
  const minutos = String(ahora.getMinutes()).padStart(2, '0');
  const segundos = String(ahora.getSeconds()).padStart(2, '0');
  const milisegundos = String(ahora.getMilliseconds()).padStart(3, '0');
  const fechaHora = `${año}-${mes}-${dia} ${horas}:${minutos}:${segundos}.${milisegundos}`;
  
  // Calcular IMACNSREG para cada archivo: contador creciente por cada repetición de S1CODIMA
  // Si un S1CODIMA se repite, el primero tiene 1, el segundo 2, etc.
  const contadorS1CODIMA = {};
  
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
    
    // Crear un registro por cada archivo
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
      archivos: a.imarutpro  // Solo la ruta absoluta del archivo (string)
    };
  });

  console.log("Registros a guardar:", registros);
  console.log(`Total de registros a guardar: ${registros.length}`);

  // Guardar cada registro por separado con un pequeño delay entre cada uno
  const guardarRegistros = async () => {
    try {
      for (let i = 0; i < registros.length; i++) {
        const registro = registros[i];
        console.log(`Guardando registro ${i + 1} de ${registros.length}:`, registro);
        
        const response = await fetch("http://localhost:8000/guardar", {
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
      
      alert(`Se guardaron ${registros.length} registro(s) correctamente`);
      limpiarFormulario();
    } catch (error) {
      console.error("Error al guardar:", error);
      alert(`Error al guardar: ${error.message}`);
    }
  };

  guardarRegistros();
}
