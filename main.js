const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const path = require("path");
const fs = require("fs");

// --- Stockage local portable -----------------------------------------
// Les données sont écrites dans un dossier "data" situé À CÔTÉ de
// l'exécutable (et non dans AppData/.config), pour rester portables
// sur la clé / SSD externe et voyager avec l'app entre Windows et Ubuntu.

function resolveBaseDir() {
  // AppImage monte l'app dans /tmp/.mount_XXXX (lecture seule, temporaire) :
  // process.execPath y pointe, pas vers le vrai fichier .AppImage sur le disque.
  // La variable APPIMAGE, fournie par le runtime AppImage, donne le vrai chemin.
  if (process.env.APPIMAGE) return path.dirname(process.env.APPIMAGE);
  if (app.isPackaged) return path.dirname(process.execPath);
  return __dirname;
}

let cachedDataDir = null;

function getDataDir() {
  if (cachedDataDir) return cachedDataDir;

  const candidates = [
    path.join(resolveBaseDir(), "data"),
    // Repli si le dossier ci-dessus n'est pas accessible en écriture
    // (ex: SSD monté en lecture seule) : dossier utilisateur standard.
    path.join(app.getPath("userData"), "data"),
  ];
  console.log("Candidates for data dir:", candidates);
  for (const dir of candidates) {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      cachedDataDir = dir;
      return dir;
    } catch {
      continue;
    }
  }

  throw new Error("Aucun dossier de données accessible en écriture n'a été trouvé.");
}

function getStoreFile() {
  return path.join(getDataDir(), "store.json");
}

function readStore() {
  const file = getStoreFile();
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return {};
  }
}

function writeStore(store) {
  fs.writeFileSync(getStoreFile(), JSON.stringify(store, null, 2), "utf-8");
}

ipcMain.handle("storage:get", (_e, key) => {
  const store = readStore();
  if (!(key in store)) return null;
  return { key, value: store[key], shared: false };
});

ipcMain.handle("storage:set", (_e, key, value) => {
  const store = readStore();
  store[key] = value;
  writeStore(store);
  return { key, value, shared: false };
});

ipcMain.handle("storage:delete", (_e, key) => {
  const store = readStore();
  const existed = key in store;
  delete store[key];
  writeStore(store);
  return { key, deleted: existed, shared: false };
});

ipcMain.handle("storage:list", (_e, prefix) => {
  const store = readStore();
  const keys = Object.keys(store).filter((k) => !prefix || k.startsWith(prefix));
  return { keys, prefix, shared: false };
});

// --- Config des projets ---------------------------------------------------
// Fichier JSON éditable à la main (projects.config.json, à côté de store.json).
// Sert de liste de projets au premier démarrage, et reste synchronisé avec
// les modifications faites depuis l'application (ajout/suppression de projets).

const DEFAULT_PROJECTS_FALLBACK = [];

function getProjectsConfigFile() {
  return path.join(getDataDir(), "projects.config.json");
}

function readProjectsConfig() {
  const file = getProjectsConfigFile();
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    if (Array.isArray(parsed.projects)) return parsed.projects;
  } catch {
    // fichier invalide
  }
  return null;
}

function writeProjectsConfig(projects) {
  fs.writeFileSync(getProjectsConfigFile(), JSON.stringify({ projects }, null, 2), "utf-8");
}

ipcMain.handle("config:getProjects", () => {
  const existing = readProjectsConfig();
  if (existing && existing.length) return existing;
  writeProjectsConfig(DEFAULT_PROJECTS_FALLBACK);
  return DEFAULT_PROJECTS_FALLBACK;
});

ipcMain.handle("config:setProjects", (_e, projects) => {
  writeProjectsConfig(Array.isArray(projects) ? projects : []);
  return { ok: true };
});

// --- Fenêtre principale -------------------------------------------------
// frame: false pour remplacer la décoration par défaut du gestionnaire de
// fenêtres Linux (barre de titre GTK) par une barre de titre custom dessinée
// dans le renderer, cohérente avec le thème sombre de l'app.

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    transparent: true,
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, "dist", "index.html"));

  win.on("maximize", () => win.webContents.send("window:maximized-changed", true));
  win.on("unmaximize", () => win.webContents.send("window:maximized-changed", false));
}

ipcMain.handle("window:minimize", (e) => {
  BrowserWindow.fromWebContents(e.sender)?.minimize();
});
ipcMain.handle("window:toggleMaximize", (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return;
  if (w.isMaximized()) w.unmaximize();
  else w.maximize();
});
ipcMain.handle("window:close", (e) => {
  BrowserWindow.fromWebContents(e.sender)?.close();
});
ipcMain.handle("window:isMaximized", (e) => {
  return BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false;
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
