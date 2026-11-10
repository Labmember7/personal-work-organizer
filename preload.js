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
  watch: (id, dir) => ipcRenderer.invoke("plugins:watch", { id, dir }),
  onReload: (callback) => ipcRenderer.on("host:reload", (_e, payload) => callback(payload)),
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

contextBridge.exposeInMainWorld("petBridge", {
  show: () => ipcRenderer.invoke("pet:show"),
  hide: () => ipcRenderer.invoke("pet:hide"),
  restoreMain: () => ipcRenderer.invoke("pet:restoreMain"),
  moveBy: (dx, dy) => ipcRenderer.send("pet:moveBy", { dx, dy }),
  sendState: (state) => ipcRenderer.send("pet:state", state),
  getState: () => ipcRenderer.invoke("pet:getState"),
  onState: (cb) => {
    const listener = (_e, state) => cb(state);
    ipcRenderer.on("pet:state", listener);
    return () => ipcRenderer.removeListener("pet:state", listener);
  },
  sendAction: (action) => ipcRenderer.send("pet:action", action),
  onAction: (cb) => {
    const listener = (_e, action) => cb(action);
    ipcRenderer.on("pet:action", listener);
    return () => ipcRenderer.removeListener("pet:action", listener);
  },
  notifyReady: () => ipcRenderer.send("pet:ready"),
  onReady: (cb) => {
    const listener = () => cb();
    ipcRenderer.on("pet:ready", listener);
    return () => ipcRenderer.removeListener("pet:ready", listener);
  },
  onMainMinimizedChanged: (cb) => {
    const listener = (_e, min) => cb(min);
    ipcRenderer.on("main:minimized-changed", listener);
    return () => ipcRenderer.removeListener("main:minimized-changed", listener);
  },
});
