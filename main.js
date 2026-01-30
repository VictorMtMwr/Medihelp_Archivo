const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const http = require('http');

// Deshabilitar sandbox para evitar problemas de permisos en Linux
app.commandLine.appendSwitch('--no-sandbox');

let mainWindow;
let pythonServer;
let isQuitting = false;

function getAsarDir() {
  // Archivos empaquetados (frontend, main.js, preload.js, app.asar)
  if (app.isPackaged) return path.join(process.resourcesPath, 'app.asar');
  return __dirname;
}

function getUnpackedDir() {
  // Archivos extraResources (backend/, python-embed.zip, site-packages.zip) viven directamente en process.resourcesPath.
  // En desarrollo, viven en la raíz del proyecto.
  if (app.isPackaged) return process.resourcesPath;
  return __dirname;
}

function getBackendDir() {
  const base = getUnpackedDir();
  const candidate = path.join(base, 'backend');
  return candidate;
}

function getPortableWritableDir() {
  // Para portable, electron-builder exporta PORTABLE_EXECUTABLE_DIR (ver script NSIS).
  // Preferimos escribir junto al exe si es posible; fallback a userData.
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  if (portableDir && typeof portableDir === 'string' && portableDir.trim()) {
    return path.join(portableDir, 'Medihelp Archivo Runtime');
  }
  return path.join(app.getPath('userData'), 'runtime');
}

function getRuntimeEmbeddedPythonDir() {
  return path.join(getPortableWritableDir(), 'python');
}

function getRuntimeEmbeddedPythonExe() {
  const pyDir = getRuntimeEmbeddedPythonDir();
  if (process.platform === 'win32') return path.join(pyDir, 'python.exe');
  // No soportado por ahora: este empaquetado está enfocado en Windows portable.
  return path.join(pyDir, 'python');
}

function getBundledPythonEmbedZipPath() {
  // Debe empaquetarse como extraResource -> process.resourcesPath/python-embed.zip
  if (app.isPackaged) return path.join(process.resourcesPath, 'python-embed.zip');
  return path.join(__dirname, 'build', 'python-embed.zip');
}

function getBundledSitePackagesZipPath() {
  // Debe empaquetarse como extraResource -> process.resourcesPath/site-packages.zip
  if (app.isPackaged) return path.join(process.resourcesPath, 'site-packages.zip');
  return path.join(__dirname, 'build', 'site-packages.zip');
}

async function expandZipWindows(zipPath, destPath) {
  await new Promise((resolve, reject) => {
    const ps = spawn(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${destPath}" -Force`,
      ],
      { stdio: 'ignore', shell: false }
    );
    ps.on('error', reject);
    ps.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Expand-Archive falló (code=${code})`))));
  });
}

async function patchEmbeddedPythonPth(pyDir) {
  // El Python embeddable usa un archivo pythonXY._pth al lado de python.exe.
  // Para habilitar site-packages, debemos:
  // - agregar "Lib\\site-packages"
  // - asegurar "import site" (sin #)
  let entries = [];
  try {
    entries = await fsp.readdir(pyDir);
  } catch (_e) {
    return;
  }

  const pthName = entries.find((n) => n.toLowerCase().endsWith('._pth'));
  if (!pthName) return;

  const pthPath = path.join(pyDir, pthName);
  let txt = '';
  try {
    txt = await fsp.readFile(pthPath, 'utf8');
  } catch (_e) {
    return;
  }

  const lines = txt.split(/\r?\n/);
  const norm = (s) => String(s || '').trim().toLowerCase();

  const hasSitePkgs = lines.some((l) => norm(l) === 'lib\\site-packages' || norm(l) === '.\\lib\\site-packages');
  const hasImportSite = lines.some((l) => norm(l) === 'import site');
  const hasCommentedImportSite = lines.some((l) => norm(l) === '#import site' || norm(l) === '# import site');

  const out = [...lines.filter((l) => l !== undefined)];
  // Insertar site-packages antes de import site/comentarios finales si es posible.
  if (!hasSitePkgs) {
    // buscar posición: antes de la última línea vacía final
    let insertAt = out.length;
    while (insertAt > 0 && norm(out[insertAt - 1]) === '') insertAt -= 1;
    out.splice(insertAt, 0, 'Lib\\site-packages');
  }

  if (!hasImportSite) {
    if (hasCommentedImportSite) {
      for (let i = 0; i < out.length; i++) {
        if (hasCommentedImportSite && (norm(out[i]) === '#import site' || norm(out[i]) === '# import site')) {
          out[i] = 'import site';
        }
      }
    } else {
      // agregar al final (antes de espacios)
      let insertAt = out.length;
      while (insertAt > 0 && norm(out[insertAt - 1]) === '') insertAt -= 1;
      out.splice(insertAt, 0, 'import site');
    }
  }

  // Normalizar finales de línea a CRLF para Windows
  const newTxt = out.join('\r\n');
  try {
    await fsp.writeFile(pthPath, newTxt, 'utf8');
  } catch (_e) {
    // ignore
  }
}

async function ensureRuntimeEmbeddedPythonReady() {
  const runtimeDir = getPortableWritableDir();
  const pyDir = getRuntimeEmbeddedPythonDir();
  const pyExe = getRuntimeEmbeddedPythonExe();
  const markerPath = path.join(runtimeDir, 'runtime-version.txt');
  const version = app.getVersion();

  const embedZip = getBundledPythonEmbedZipPath();
  const siteZip = getBundledSitePackagesZipPath();

  // Si recompilas el .exe con la MISMA versión pero cambian los recursos,
  // queremos re-extraer igualmente (caso típico al reemplazar el portable en red).
  let embedSig = '0';
  let siteSig = '0';
  try {
    const st1 = await fsp.stat(embedZip);
    embedSig = `${st1.size}`;
  } catch (_e) {}
  try {
    const st2 = await fsp.stat(siteZip);
    siteSig = `${st2.size}`;
  } catch (_e) {}
  const signature = `${version}|embed=${embedSig}|site=${siteSig}`;

  // Re-extraer si cambia la firma (para evitar quedarse con un runtime viejo en red)
  let marker = null;
  try { marker = (await fsp.readFile(markerPath, 'utf8')).trim(); } catch (_e) {}
  const mustExtract = marker !== signature;

  if (!mustExtract && fs.existsSync(pyExe)) {
    return { ok: true, pythonExe: pyExe };
  }

  if (process.platform !== 'win32') {
    return { ok: false, pythonExe: pyExe, error: 'Python embeddable solo está configurado para Windows.' };
  }

  if (!fs.existsSync(embedZip)) {
    return { ok: false, pythonExe: pyExe, error: `No se encontró python-embed.zip: ${embedZip}` };
  }
  if (!fs.existsSync(siteZip)) {
    return { ok: false, pythonExe: pyExe, error: `No se encontró site-packages.zip: ${siteZip}` };
  }

  try {
    await fsp.mkdir(pyDir, { recursive: true });
  } catch (_e) {
    // ignore
  }

  // Extraer Python embeddable a runtime/python
  try {
    await expandZipWindows(embedZip, pyDir);
  } catch (e) {
    return { ok: false, pythonExe: pyExe, error: `Falló extracción python-embed.zip: ${String(e?.message || e)}` };
  }

  // Extraer site-packages en runtime/python/Lib/site-packages
  const spDir = path.join(pyDir, 'Lib', 'site-packages');
  try {
    await fsp.mkdir(spDir, { recursive: true });
  } catch (_e) {
    // ignore
  }
  try {
    await expandZipWindows(siteZip, spDir);
  } catch (e) {
    return { ok: false, pythonExe: pyExe, error: `Falló extracción site-packages.zip: ${String(e?.message || e)}` };
  }

  // Parchear el ._pth para que reconozca site-packages
  await patchEmbeddedPythonPth(pyDir);

  // Guardar marker de versión+firma (para re-extraer aunque no cambie version)
  try { await fsp.writeFile(markerPath, `${signature}\r\n`, 'utf8'); } catch (_e) {}

  if (!fs.existsSync(pyExe)) {
    return { ok: false, pythonExe: pyExe, error: `Se extrajo Python pero no apareció python.exe en: ${pyExe}` };
  }
  return { ok: true, pythonExe: pyExe };
}

function checkBackendOnce(url = 'http://127.0.0.1:8000/') {
  return new Promise((resolve) => {
    try {
      const req = http.get(url, (res) => {
        // Si el servidor responde cualquier status, está vivo.
        res.resume();
        resolve(true);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(800, () => {
        try { req.destroy(); } catch (_e) {}
        resolve(false);
      });
    } catch (_e) {
      resolve(false);
    }
  });
}

async function waitForBackendReady(timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    // /docs puede tardar si carga OpenAPI; / es rápido y sirve index.
    // Igual nos basta con que responda algo.
    // Probamos /api/hiscsec/0 que puede fallar por lógica, pero el server existiría:
    // mantenemos / para un simple "alive".
    // eslint-disable-next-line no-await-in-loop
    const ok = await checkBackendOnce('http://127.0.0.1:8000/');
    if (ok) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

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

function getBackendLogPath() {
  // En portable, preferimos log junto al exe (misma carpeta del runtime)
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  if (portableDir && typeof portableDir === 'string' && portableDir.trim()) {
    return path.join(getPortableWritableDir(), 'backend.log');
  }
  // Fallback a userData (instalado/no-portable)
  return path.join(app.getPath('userData'), 'backend.log');
}

// Función para iniciar el servidor Python
function startPythonServer(pythonPathOverride = null) {
  const backendDir = getBackendDir();

  // Detectar ruta de Python dependiendo del SO y del venv
  let pythonPath = pythonPathOverride || null;

  if (process.platform === 'win32') {
    // En Windows, preferimos Python embeddable extraído al runtime (portable real).
    if (!pythonPath) {
      const embedded = getRuntimeEmbeddedPythonExe();
      if (fs.existsSync(embedded)) pythonPath = embedded;
      else pythonPath = 'python';
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

  // Log del backend para diagnóstico
  const logPath = getBackendLogPath();
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  logStream.write(`\n\n=== START ${new Date().toISOString()} ===\n`);
  logStream.write(`pythonPath=${pythonPath}\nbackendDir=${backendDir}\n`);

  // Iniciar el servidor FastAPI (sin --reload para evitar problema de stdin en Electron)
  pythonServer = spawn(pythonPath, ['-m', 'uvicorn', 'server:app', '--host', '127.0.0.1', '--port', '8000'], {
    cwd: backendDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false
  });

  pythonServer.on('error', (err) => {
    console.error('Error al iniciar el servidor Python:', err);
    try {
      logStream.write(`[spawn error] ${String(err?.stack || err)}\n`);
      logStream.end();
    } catch (_e) {}
    dialog.showErrorBox('Error', `No se pudo iniciar el servidor Python: ${err.message}\n\nLog: ${logPath}`);
  });

  pythonServer.stdout?.on('data', (d) => {
    try { logStream.write(d); } catch (_e) {}
  });
  pythonServer.stderr?.on('data', (d) => {
    try { logStream.write(d); } catch (_e) {}
  });

  pythonServer.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.log(`Servidor Python terminado con código ${code}`);
    }
    try {
      logStream.write(`\n[exit] code=${code}\n=== END ${new Date().toISOString()} ===\n`);
      logStream.end();
    } catch (_e) {}
  });
  
  console.log('Servidor Python iniciado en http://127.0.0.1:8000');
}

// Función para crear la ventana principal
function createWindow() {
  const asarDir = getAsarDir();
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: path.join(asarDir, 'frontend', 'assets', 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(asarDir, 'preload.js')
    }
  });

  // Iniciar maximizado (sin modo pantalla completa)
  mainWindow.maximize();

  // Cargar splash (index) y luego redirige a login
  mainWindow.loadFile(path.join(asarDir, 'frontend', 'index.html'));

  // Abrir DevTools en modo desarrollo
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // Bloqueo de cierre si hay folio abierto sin guardar (solo si el usuario ya dio "Continuar a Documentos")
  mainWindow.on('close', async (e) => {
    if (isQuitting) return;
    e.preventDefault();

    let mustBlock = false;
    try {
      mustBlock = await mainWindow.webContents.executeJavaScript(
        `(() => {
          try {
            // Bloquear cierre cuando ya se hizo la petición a booking y aún no se han guardado documentos
            const bookingDone = sessionStorage.getItem('booking_done') === 'true';
            const docsUploaded = sessionStorage.getItem('docs_uploaded') === 'true';
            return bookingDone && !docsUploaded;
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
  (async () => {
    // Asegurar que el runtime python (embeddable) exista en portable
    let ensuredPy = null;
    try {
      ensuredPy = await ensureRuntimeEmbeddedPythonReady();
      if (!ensuredPy.ok) {
        dialog.showErrorBox('Error', `No se pudo preparar el Python portable.\n\n${ensuredPy.error}\n\nRuta: ${ensuredPy.pythonExe}`);
      }
    } catch (e) {
      dialog.showErrorBox('Error', `No se pudo preparar el Python portable.\n\n${String(e?.message || e)}`);
    }

    // Iniciar el servidor Python
    startPythonServer(ensuredPy?.ok ? ensuredPy.pythonExe : null);

    // Esperar a que el backend realmente responda antes de mostrar UI
    const ready = await waitForBackendReady(25000);
    if (!ready) {
      dialog
        .showMessageBox({
          type: 'warning',
          buttons: ['Continuar'],
          defaultId: 0,
          title: 'Backend no disponible',
          message: 'El backend no respondió a tiempo.',
          detail:
            `La aplicación se abrirá, pero los llamados al servidor pueden fallar.\n\nRevise el log:\n${getBackendLogPath()}`,
        })
        .finally(() => createWindow());
      return;
    }
    createWindow();
  })();

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

