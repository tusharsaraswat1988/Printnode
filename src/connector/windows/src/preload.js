const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bidwarConnector", {
  init: () => ipcRenderer.invoke("connector:init"),
  listPrinters: () => ipcRenderer.invoke("connector:list-printers"),
  pair: (payload) => ipcRenderer.invoke("connector:pair", payload),
  restartService: () => ipcRenderer.invoke("connector:restart-service"),
  readHealth: () => ipcRenderer.invoke("connector:read-health"),
  openDashboard: () => ipcRenderer.invoke("connector:open-dashboard"),
  readLogs: () => ipcRenderer.invoke("connector:read-logs"),
});
