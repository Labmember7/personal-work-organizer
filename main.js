const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { createStore } = require("./electron/store");

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

const store = createStore(() => path.join(getDataDir(), "store.json"));

ipcMain.handle("storage:get", (_e, key) => {
  const value = store.get(key);
  if (value === undefined) return null;
  return { key, value };
});

ipcMain.handle("storage:set", (_e, key, value) => {
  store.set(key, value);
  return { key, ok: true };
});

ipcMain.handle("storage:delete", (_e, key) => {
  const deleted = store.delete(key);
  return { key, deleted };
});

ipcMain.handle("storage:list", (_e, prefix) => {
  return { keys: store.keys(prefix), prefix };
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

// --- Export / Import : sauvegarde de toutes les données dans un seul
// fichier JSON, choisi par l'utilisateur via les boîtes de dialogue
// natives (cohérent avec les autres apps de bureau).

ipcMain.handle("data:export", async (e, payload) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: "Exporter les données",
    defaultPath: `suivi-travaux-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: "Fichier JSON", extensions: ["json"] }],
  });
  if (canceled || !filePath) return { canceled: true };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");
  return { canceled: false, filePath };
});

ipcMain.handle("data:import", async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: "Importer des données",
    properties: ["openFile"],
    filters: [{ name: "Fichier JSON", extensions: ["json"] }],
  });
  if (canceled || !filePaths.length) return { canceled: true };
  try {
    const raw = fs.readFileSync(filePaths[0], "utf-8");
    const data = JSON.parse(raw);
    return { canceled: false, filePath: filePaths[0], data };
  } catch {
    return { canceled: false, error: "invalid" };
  }
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
      sandbox: true,
    },
  });

  win.loadFile(path.join(__dirname, "dist", "index.html"));

  // L'app est mono-page : toute navigation (lien dans l'aperçu Markdown…)
  // ou ouverture de fenêtre est refusée, les liens externes partent vers
  // le navigateur du système.
  win.webContents.on("will-navigate", (e, url) => {
    e.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

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

// Les écritures sont regroupées (debounce) : celle en attente est forcée
// avant la fermeture pour ne rien perdre.
app.on("before-quit", () => {
  try {
    store.flush();
  } catch {
    // disque indisponible à la fermeture : rien de plus à tenter
  }
});
