// SDK des plugins TrkPlugin — variante module ES (v2, `kind: "app"`).
//
// Servi par le processus principal à `app-plugin://<id>/@trk/sdk.js` (même
// origine que le plugin, donc autorisé par `script-src 'self'` de la CSP v2 —
// la CSP v2 interdit `unsafe-inline`, contrairement à la v1). Le plugin y
// accède via `import trk from "trk:sdk"` (carte d'imports posée dans sa page).
//
// Miroir fonctionnel de `trk-plugin-sdk.js` (v1) : même pont `postMessage`,
// même surface `TrkPlugin`. Différence d'identité : la v1 lit l'id dans la
// balise `#trk-plugin` injectée ; ici l'id vient d'une balise
// `<meta name="trk-plugin-id" content="…">` posée par la page du plugin
// (nécessaire pour que `plugin:ready` porte déjà l'id, condition préalable à
// `host:init` côté hôte — cf. src/features/plugins/usePluginHost.ts).

const NS = "trk.plugin";
const API_VERSION = 1;

const state = {
  id: null,
  version: null,
  lang: "fr",
  dict: {},
  capabilities: [],
  doc: null,
  snapshot: null,
  theme: null,
  ready: false,
};

const listeners = { doc: [], snapshot: [], theme: [], lang: [], saved: [], error: [], fullscreen: [] };
const readyResolvers = [];
let readyPromise = null;

// Pour la v2, l'id n'est connu qu'au chargement de la page (pas de balise
// manifeste injectée) : la page pose `<meta name="trk-plugin-id">`. On lit
// aussi la balise `#trk-plugin` (v1) par compatibilité, et on met en cache
// dès que `host:init` l'a confirmé.
function readOwnId() {
  if (state.id) return state.id;
  const meta = document.querySelector('meta[name="trk-plugin-id"]');
  if (meta && meta.getAttribute("content")) return meta.getAttribute("content");
  const tag = document.getElementById("trk-plugin");
  if (tag) {
    try {
      const manifest = JSON.parse(tag.textContent || "");
      if (typeof manifest.id === "string" && manifest.id) return manifest.id;
    } catch {
      // Manifeste illisible : la validation vit côté hôte.
    }
  }
  return null;
}

function hasCapability(cap) {
  return state.capabilities.indexOf(cap) !== -1;
}

function post(message) {
  const id = readOwnId();
  if (!id) {
    console.warn("[TrkPlugin] identifiant introuvable (balise meta trk-plugin-id absente) : message ignoré", message);
    return;
  }
  window.parent.postMessage({ ns: NS, protocol: API_VERSION, pluginId: id, message: message }, "*");
}

// N'émet rien pour une capacité non accordée : un avertissement console suffit.
function guarded(cap, message) {
  if (cap && !hasCapability(cap)) {
    console.warn('[TrkPlugin] capacité "' + cap + '" non accordée : message ignoré', message);
    return;
  }
  post(message);
}

const nativeConsole = { log: console.log, info: console.info, warn: console.warn, error: console.error };
let forwarding = false;
function stringifyArg(a) {
  if (typeof a === "string") return a;
  if (a instanceof Error) return a.stack || a.name + ": " + a.message;
  try {
    const s = JSON.stringify(a);
    return s === undefined ? String(a) : s;
  } catch {
    return String(a);
  }
}
function forwardLog(level, args) {
  if (forwarding) return;
  forwarding = true;
  try {
    const text = Array.prototype.map.call(args, stringifyArg).join(" ");
    guarded("debug", { type: "plugin:log", level: level, args: [text.length > 2000 ? text.slice(0, 2000) + "…" : text] });
  } finally {
    forwarding = false;
  }
}
["log", "info", "warn", "error"].forEach((level) => {
  const orig = nativeConsole[level];
  console[level] = function () {
    orig.apply(console, arguments);
    forwardLog(level, arguments);
  };
});
window.addEventListener("error", (e) => forwardLog("error", [e.message + " (" + e.filename + ":" + e.lineno + ")"]));
window.addEventListener("unhandledrejection", (e) => forwardLog("error", ["Unhandled rejection: " + stringifyArg(e.reason)]));

function emit(event, payload) {
  const cbs = listeners[event];
  if (!cbs) return;
  for (const cb of cbs) {
    try {
      cb(payload);
    } catch (e) {
      console.error("[TrkPlugin] erreur dans un écouteur '" + event + "'", e);
    }
  }
}

function applyTheme(theme) {
  if (!theme || !theme.tokens) return;
  const root = document.documentElement;
  for (const name in theme.tokens) {
    if (Object.prototype.hasOwnProperty.call(theme.tokens, name)) {
      root.style.setProperty(name, theme.tokens[name]);
    }
  }
  root.classList.toggle("trk-plugin-dark", !!theme.dark);
  root.classList.toggle("trk-plugin-light", !theme.dark);
}

function handleHostMessage(raw) {
  if (!raw || raw.ns !== "trk.plugin" || raw.protocol !== API_VERSION) return;
  const message = raw.message;
  if (!message || typeof message.type !== "string") return;

  switch (message.type) {
    case "host:init":
      state.id = (message.plugin && message.plugin.id) || state.id;
      state.version = (message.plugin && message.plugin.version) || state.version;
      state.lang = message.lang || state.lang;
      state.dict = message.dict || {};
      state.capabilities = message.capabilities || [];
      state.theme = message.theme || null;
      state.doc = message.doc || null;
      state.snapshot = message.snapshot || null;
      state.ready = true;
      if (state.theme) applyTheme(state.theme);
      for (const r of readyResolvers) r(message);
      readyResolvers = [];
      break;
    case "host:doc":
      state.doc = message.doc || null;
      emit("doc", state.doc);
      break;
    case "host:snapshot":
      state.snapshot = message.snapshot || null;
      emit("snapshot", state.snapshot);
      break;
    case "host:theme":
      state.theme = message.theme || null;
      if (state.theme) applyTheme(state.theme);
      emit("theme", state.theme);
      break;
    case "host:lang":
      state.lang = message.lang || state.lang;
      state.dict = message.dict || {};
      emit("lang", { lang: state.lang, dict: state.dict });
      break;
    case "host:saved":
      emit("saved", message.at);
      break;
    case "host:error":
      emit("error", { code: message.code, message: message.message });
      break;
    case "host:fullscreen":
      emit("fullscreen", !!message.on);
      break;
    default:
      break;
  }
}

window.addEventListener("message", (event) => {
  // Origine opaque ("null") côté iframe sandboxée : inutilisable pour
  // authentifier. On s'assure seulement que le message vient de la parente.
  if (event.source !== window.parent) return;
  handleHostMessage(event.data);
});

const TrkPlugin = {
  ready() {
    post({ type: "plugin:ready", apiVersion: API_VERSION });
    if (!readyPromise) {
      readyPromise = new Promise((resolve) => {
        if (state.ready) resolve({ type: "host:init" });
        else readyResolvers.push(resolve);
      });
    }
    return readyPromise;
  },
  get id() {
    return state.id;
  },
  get lang() {
    return state.lang;
  },
  get capabilities() {
    return state.capabilities.slice();
  },
  t(key, fallback) {
    if (Object.prototype.hasOwnProperty.call(state.dict, key)) return state.dict[key];
    return fallback !== undefined ? fallback : key;
  },
  doc() {
    return state.doc;
  },
  save(patch) {
    guarded("doc", { type: "plugin:doc:save", patch: patch });
  },
  markDirty(dirty) {
    guarded("doc", { type: "plugin:dirty", dirty: !!dirty });
  },
  tasks() {
    return state.snapshot ? state.snapshot.tasks : [];
  },
  projects() {
    return state.snapshot ? state.snapshot.projects : [];
  },
  refreshTasks() {
    guarded("tasks:read", { type: "plugin:snapshot:refresh" });
  },
  revealTask(id) {
    guarded("task:reveal", { type: "plugin:task:reveal", id: id });
  },
  toast(message) {
    guarded("toast", { type: "plugin:toast", message: message });
  },
  saveFile(file) {
    if (!file || (!file.base64 && !file.text)) {
      console.warn("[TrkPlugin] saveFile requiert `base64` ou `text`", file);
      return;
    }
    guarded("file:save", { type: "plugin:file:save", name: file.name, mime: file.mime, base64: file.base64, text: file.text });
  },
  requestFullscreen(on) {
    guarded("fullscreen", { type: "plugin:fullscreen", on: !!on });
  },
  on(event, cb) {
    if (!listeners[event]) return () => {};
    listeners[event].push(cb);
    return () => {
      const idx = listeners[event].indexOf(cb);
      if (idx !== -1) listeners[event].splice(idx, 1);
    };
  },
  applyTheme,
};

export default TrkPlugin;
