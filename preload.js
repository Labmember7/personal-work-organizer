const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("storage", {
  get: (key) => ipcRenderer.invoke("storage:get", key),
  set: (key, value) => ipcRenderer.invoke("storage:set", key, value),
  delete: (key) => ipcRenderer.invoke("storage:delete", key),
  list: (prefix) => ipcRenderer.invoke("storage:list", prefix),
});

contextBridge.exposeInMainWorld("config", {
  getProjects: () => ipcRenderer.invoke("config:getProjects"),
  setProjects: (projects) => ipcRenderer.invoke("config:setProjects", projects),
});

contextBridge.exposeInMainWorld("dataIO", {
  export: (payload) => ipcRenderer.invoke("data:export", payload),
  import: () => ipcRenderer.invoke("data:import"),
});

contextBridge.exposeInMainWorld("images", {
  save: (buffer) => ipcRenderer.invoke("images:save", buffer),
  prune: (usedFiles) => ipcRenderer.invoke("images:prune", usedFiles),
});

contextBridge.exposeInMainWorld("plugins", {
  list: () => ipcRenderer.invoke("plugins:list"),
  saveFile: (payload) => ipcRenderer.invoke("plugins:saveFile", payload),
});

contextBridge.exposeInMainWorld("windowControls", {
  minimize: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximize: () => ipcRenderer.invoke("window:toggleMaximize"),
  close: () => ipcRenderer.invoke("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
  onMaximizedChanged: (cb) => {
    const listener = (_e, isMaximized) => cb(isMaximized);
    ipcRenderer.on("window:maximized-changed", listener);
    return () => ipcRenderer.removeListener("window:maximized-changed", listener);
  },
});
