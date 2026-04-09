const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // We can add communication methods here if needed
  platform: process.platform,
  openNewWindow: () => ipcRenderer.send('open-new-window'),
});
