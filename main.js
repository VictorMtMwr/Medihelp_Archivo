const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');

// Deshabilitar sandbox para evitar problemas de permisos en Linux
app.commandLine.appendSwitch('--no-sandbox');

let mainWindow;
let pythonServer;
let isQuitting = false;

function sanitizeFilename(name) {
  // Windows: <>:"/\|?* no permitidos + control chars
  return String(name)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

ipcMain.handle('copy-files', async (_event, items) => {
  if (!Array.isArray(items)) {
    return { ok: false, error: "items must be an array", copied: [], errors: [] };
  }

  const copied = [];
  const errors = [];

  for (const it of items) {
    try {
      const src = it?.src;
      const destDir = it?.destDir;
      const destNameRaw = it?.destName;

      if (!src || !destDir || !destNameRaw) {
        throw new Error("Parámetros inválidos (src/destDir/destName)");
      }

      const destName = sanitizeFilename(destNameRaw);
      const destPath = path.win32.join(destDir, destName);

      // En Windows con rutas UNC, mkdir puede fallar aunque exista.
      // Intentamos, pero si falla continuamos y dejamos que copyFile determine el error real.
      try {
        await fsp.mkdir(destDir, { recursive: true });
      } catch (_e) {
        // ignorar
      }

      await fsp.copyFile(src, destPath);
      let size = null;
      try {
        const st = await fsp.stat(destPath);
        size = st.size;
      } catch (_e) {
        // si no podemos stat, igual consideramos copiado pero sin tamaño
      }

      copied.push({ destPath, size });
    } catch (e) {
      errors.push({
        src: it?.src ?? null,
        destDir: it?.destDir ?? null,
        destName: it?.destName ?? null,
        error: String(e?.message || e),
      });
    }
  }

  return { ok: errors.length === 0, copied, errors };
});

// Función para iniciar el servidor Python
function startPythonServer() {
  // Detectar ruta de Python dependiendo del SO y del venv
  let pythonPath = null;

  if (process.platform === 'win32') {
    // En Windows, los binarios de venv van en venv/Scripts
    const candidate = path.join(__dirname, 'venv', 'Scripts', 'python.exe');
    if (fs.existsSync(candidate)) {
      pythonPath = candidate;
    } else {
      console.warn('Python no encontrado en venv/Scripts, usando "python" del sistema...');
      pythonPath = 'python';
    }
  } else {
    // Linux / macOS: venv/bin/python, python3 o python
    const pythonNames = ['python', 'python3'];
    for (const name of pythonNames) {
      const testPath = path.join(__dirname, 'venv', 'bin', name);
      if (fs.existsSync(testPath)) {
        pythonPath = testPath;
        break;
      }
    }

    if (!pythonPath) {
      console.warn('Python no encontrado en venv, intentando usar el del sistema (python3)...');
      pythonPath = 'python3';
    }
  }

  // Iniciar el servidor FastAPI (sin --reload para evitar problema de stdin en Electron)
  pythonServer = spawn(pythonPath, ['-m', 'uvicorn', 'server:app', '--host', '127.0.0.1', '--port', '8000'], {
    cwd: path.join(__dirname, 'backend'),
    stdio: 'inherit',
    shell: false
  });

  pythonServer.on('error', (err) => {
    console.error('Error al iniciar el servidor Python:', err);
    dialog.showErrorBox('Error', `No se pudo iniciar el servidor Python: ${err.message}`);
  });

  pythonServer.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.log(`Servidor Python terminado con código ${code}`);
    }
  });
  
  console.log('Servidor Python iniciado en http://127.0.0.1:8000');
}

// Función para crear la ventana principal
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Iniciar maximizado (sin modo pantalla completa)
  mainWindow.maximize();

  // Cargar splash (index) y luego redirige a login
  mainWindow.loadFile(path.join(__dirname, 'frontend', 'index.html'));

  // Abrir DevTools en modo desarrollo
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // Bloqueo de cierre si hay folio abierto sin guardar (controlado desde renderer vía localStorage)
  mainWindow.on('close', async (e) => {
    if (isQuitting) return;
    e.preventDefault();

    let mustBlock = false;
    try {
      mustBlock = await mainWindow.webContents.executeJavaScript(
        `(() => {
          try {
            const locked = localStorage.getItem('folio_locked') === 'true';
            const closed = localStorage.getItem('folio_closed') === 'true';
            return locked && !closed;
          } catch (e) { return false; }
        })()`,
        true
      );
    } catch (_err) {
      mustBlock = false;
    }

    if (mustBlock) {
      // Intentar mostrar un modal dentro del renderer (UI)
      try {
        await mainWindow.webContents.executeJavaScript(
          `(() => {
            const ID = 'close-block-modal-overlay';
            const exists = document.getElementById(ID);
            if (exists) { exists.style.display = 'flex'; return true; }

            const overlay = document.createElement('div');
            overlay.id = ID;
            overlay.style.position = 'fixed';
            overlay.style.inset = '0';
            overlay.style.display = 'flex';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            overlay.style.background = 'rgba(0,0,0,.55)';
            overlay.style.zIndex = '999999';

            const card = document.createElement('div');
            card.style.width = 'min(520px, calc(100vw - 32px))';
            card.style.background = '#0b1220';
            card.style.color = '#e8eefc';
            card.style.border = '1px solid rgba(255,255,255,.14)';
            card.style.borderRadius = '14px';
            card.style.boxShadow = '0 18px 60px rgba(0,0,0,.45)';
            card.style.padding = '16px 16px 14px 16px';
            card.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';

            const title = document.createElement('div');
            title.textContent = 'Folio abierto';
            title.style.fontSize = '16px';
            title.style.fontWeight = '700';
            title.style.marginBottom = '8px';

            const body = document.createElement('div');
            body.textContent = 'No puede cerrar la aplicación. Debe cargar al menos 1 documento y dar a Guardar para cerrar el folio.';
            body.style.fontSize = '13px';
            body.style.lineHeight = '1.35';
            body.style.opacity = '0.95';
            body.style.marginBottom = '14px';

            const actions = document.createElement('div');
            actions.style.display = 'flex';
            actions.style.justifyContent = 'flex-end';
            actions.style.gap = '10px';

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = 'Entendido';
            btn.style.cursor = 'pointer';
            btn.style.border = '1px solid rgba(255,255,255,.18)';
            btn.style.background = 'rgba(255,255,255,.08)';
            btn.style.color = '#e8eefc';
            btn.style.borderRadius = '10px';
            btn.style.padding = '8px 12px';
            btn.style.fontWeight = '600';
            btn.onclick = () => { overlay.style.display = 'none'; };

            actions.appendChild(btn);
            card.appendChild(title);
            card.appendChild(body);
            card.appendChild(actions);
            overlay.appendChild(card);
            overlay.addEventListener('click', (ev) => {
              if (ev.target === overlay) overlay.style.display = 'none';
            });
            document.body.appendChild(overlay);
            return true;
          })()`,
          true
        );
      } catch (_err) {
        // Fallback: modal nativo si el renderer no responde
        await dialog.showMessageBox(mainWindow, {
          type: 'warning',
          buttons: ['Entendido'],
          defaultId: 0,
          cancelId: 0,
          title: 'Folio abierto',
          message: 'No puede cerrar la aplicación.',
          detail: 'Hay un folio abierto. Debe cargar al menos 1 documento y dar a Guardar para cerrarlo.',
        });
      }
      return;
    }

    isQuitting = true;
    mainWindow.destroy();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Cuando la aplicación esté lista
app.whenReady().then(() => {
  // Iniciar el servidor Python
  startPythonServer();
  
  // Esperar un momento para que el servidor inicie
  setTimeout(() => {
    createWindow();
  }, 2000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Cerrar la aplicación
app.on('window-all-closed', () => {
  // Terminar el servidor Python
  if (pythonServer) {
    pythonServer.kill();
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Manejar el cierre de la aplicación
app.on('before-quit', () => {
  isQuitting = true;
  if (pythonServer) {
    pythonServer.kill();
  }
});

