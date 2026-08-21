import { contextBridge, ipcRenderer } from 'electron';

// The only bridge the splash/error pages need in phase 1: a Retry button that
// asks the main process to re-run the backend readiness wait. contextIsolation
// is on, so nothing else from Node/Electron leaks into the page.
contextBridge.exposeInMainWorld('till', {
  retry: (): void => ipcRenderer.send('till:retry'),
});
