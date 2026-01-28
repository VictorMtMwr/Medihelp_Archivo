const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

// Exponer APIs seguras al renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Obtener la ruta absoluta de un archivo
  getFilePath: (file) => {
    // En Electron, los archivos del input tienen la propiedad path
    if (file && file.path) {
      return file.path;
    }
    return null;
  },
  
  // Verificar si estamos en Electron
  isElectron: () => true,

  // Copiar archivos usando el proceso principal (soporta rutas UNC)
  copyFiles: (items) => ipcRenderer.invoke('copy-files', items),
});

