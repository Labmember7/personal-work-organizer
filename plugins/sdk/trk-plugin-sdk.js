// SDK des plugins TrkPlugin.
//
// Injecté EN LIGNE par `wrapPluginHtml` (electron/plugins.js), jamais chargé
// comme sous-ressource (la CSP servie avec un document de plugin n'autorise
// que `script-src 'unsafe-inline'`). Ce fichier vit à part pour rester
// lisible et testable en isolation, mais il est concaténé au moment de
// servir le plugin — pas de <script src> vers lui dans le HTML final.
//
// Portée volontairement minimale : pas de build, pas de dépendance, du JS
// compatible avec un moteur d'iframe sandboxée (ES2015 suffit).
(function () {
  "use strict";

  var NS = "trk.plugin";
  var API_VERSION = 1;

  var state = {
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

  var listeners = { doc: [], snapshot: [], theme: [], lang: [], saved: [], error: [], fullscreen: [] };
  // Commandes contribuées : l'hôte envoie `host:command` quand l'utilisateur
  // clique le bouton de la barre d'outils de la vue ; le plugin s'est abonné
  // via `trk.commands.on(id, cb)`.
  var commandListeners = {};
  var readyResolvers = [];
  var readyPromise = null;

  // L'identifiant du plugin n'est pas connu avant que le DOM ait fini de
  // parser sa propre balise manifeste — ce script est injecté AVANT elle
  // dans le document. On le lit donc à la demande plutôt qu'au chargement,
  // et on le met en cache dès qu'il est résolu.
  function readOwnId() {
    if (state.id) return state.id;
    var tag = document.getElementById("trk-plugin");
    if (!tag) return null;
    try {
      var manifest = JSON.parse(tag.textContent || "");
      if (typeof manifest.id === "string" && manifest.id) return manifest.id;
    } catch (e) {
      // Manifeste illisible : rien à en tirer ici, sa validation vit côté hôte.
    }
    return null;
  }

  function hasCapability(cap) {
    return state.capabilities.indexOf(cap) !== -1;
  }

  function post(message) {
    var id = readOwnId();
    if (!id) {
      console.warn("[TrkPlugin] identifiant introuvable (balise #trk-plugin absente) : message ignoré", message);
      return;
    }
    window.parent.postMessage({ ns: NS, protocol: API_VERSION, pluginId: id, message: message }, "*");
  }

  // N'émet rien pour une capacité non accordée : un avertissement console
  // suffit, l'hôte l'aurait filtré de toute façon (cf. lib/plugins/bridge.ts).
  function guarded(cap, message) {
    if (cap && !hasCapability(cap)) {
      console.warn('[TrkPlugin] capacité "' + cap + '" non accordée : message ignoré', message);
      return;
    }
    post(message);
  }

  // Relais console -> hôte (capacité "debug"). Une iframe sandboxée n'a pas
  // de devtools facilement accessibles depuis l'app : c'est le seul moyen de
  // voir les logs d'un plugin en cours d'usage. `forwarding` coupe court à
  // toute boucle si `guarded()`/`post()` eux-mêmes journalisent (ex. capacité
  // refusée, identifiant introuvable) pendant qu'on relaie déjà un appel.
  var nativeConsole = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  var forwarding = false;
  function stringifyArg(a) {
    if (typeof a === "string") return a;
    if (a instanceof Error) return a.stack || a.name + ": " + a.message;
    try {
      var s = JSON.stringify(a);
      return s === undefined ? String(a) : s;
    } catch (e) {
      return String(a);
    }
  }
  function forwardLog(level, args) {
    if (forwarding) return;
    forwarding = true;
    try {
      var text = Array.prototype.map.call(args, stringifyArg).join(" ");
      if (text.length > 2000) text = text.slice(0, 2000) + "…";
      guarded("debug", { type: "plugin:log", level: level, args: [text] });
    } finally {
      forwarding = false;
    }
  }
  ["log", "info", "warn", "error"].forEach(function (level) {
    var orig = nativeConsole[level];
    console[level] = function () {
      orig.apply(console, arguments);
      forwardLog(level, arguments);
    };
  });
  window.addEventListener("error", function (e) {
    forwardLog("error", [e.message + " (" + e.filename + ":" + e.lineno + ")"]);
  });
  window.addEventListener("unhandledrejection", function (e) {
    forwardLog("error", ["Unhandled rejection: " + stringifyArg(e.reason)]);
  });

  function emit(event, payload) {
    var cbs = listeners[event];
    if (!cbs) return;
    for (var i = 0; i < cbs.length; i++) {
      try {
        cbs[i](payload);
      } catch (e) {
        console.error("[TrkPlugin] erreur dans un écouteur '" + event + "'", e);
      }
    }
  }

  function applyTheme(theme) {
    if (!theme || !theme.tokens) return;
    var root = document.documentElement;
    for (var name in theme.tokens) {
      if (Object.prototype.hasOwnProperty.call(theme.tokens, name)) {
        root.style.setProperty(name, theme.tokens[name]);
      }
    }
    root.classList.toggle("trk-plugin-dark", !!theme.dark);
    root.classList.toggle("trk-plugin-light", !theme.dark);
  }

  function handleHostMessage(raw) {
    if (!raw || raw.ns !== NS || raw.protocol !== API_VERSION) return;
    var message = raw.message;
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
        for (var i = 0; i < readyResolvers.length; i++) readyResolvers[i](message);
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
          // L'hôte a coupé (ou forcé) le plein écran de son côté : on aligne
          // notre propre affichage sans renvoyer de `requestFullscreen`, sous
          // peine de boucle. Un plugin qui n'écoute pas cet événement garde
          // simplement un bouton désynchronisé, rien de plus grave.
          emit("fullscreen", !!message.on);
          break;
        case "host:command":
          if (message.id && commandListeners[message.id]) {
            commandListeners[message.id].forEach(function (cb) {
              try {
                cb(message.args);
              } catch (e) {
                console.error("[TrkPlugin] erreur dans un gestionnaire de commande '" + message.id + "'", e);
              }
            });
          }
          break;
      default:
        break;
    }
  }

  window.addEventListener("message", function (event) {
    // Origine opaque ("null") côté iframe sandboxée : inutilisable pour
    // authentifier. On s'assure seulement que le message vient de la
    // fenêtre parente (l'hôte a la même vérification dans l'autre sens).
    if (event.source !== window.parent) return;
    handleHostMessage(event.data);
  });

  var TrkPlugin = {
    /** Signale que le plugin est prêt. Rend une promesse résolue au premier `host:init`. */
    ready: function () {
      post({ type: "plugin:ready", apiVersion: API_VERSION });
      if (!readyPromise) {
        readyPromise = new Promise(function (resolve) {
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
    /** Libellé de l'hôte par clé ; rend `fallback` (ou `key`) si absent du dictionnaire. */
    t: function (key, fallback) {
      if (Object.prototype.hasOwnProperty.call(state.dict, key)) return state.dict[key];
      return fallback !== undefined ? fallback : key;
    },
    doc: function () {
      return state.doc;
    },
    save: function (patch) {
      guarded("doc", { type: "plugin:doc:save", patch: patch });
    },
    markDirty: function (dirty) {
      guarded("doc", { type: "plugin:dirty", dirty: !!dirty });
    },
    tasks: function () {
      return state.snapshot ? state.snapshot.tasks : [];
    },
    projects: function () {
      return state.snapshot ? state.snapshot.projects : [];
    },
    refreshTasks: function () {
      guarded("tasks:read", { type: "plugin:snapshot:refresh" });
    },
    revealTask: function (id) {
      guarded("task:reveal", { type: "plugin:task:reveal", id: id });
    },
    toast: function (message) {
      guarded("toast", { type: "plugin:toast", message: message });
    },
    saveFile: function (file) {
      if (!file || (!file.base64 && !file.text)) {
        console.warn("[TrkPlugin] saveFile requiert `base64` ou `text`", file);
        return;
      }
      guarded("file:save", { type: "plugin:file:save", name: file.name, mime: file.mime, base64: file.base64, text: file.text });
    },
    /** Demande à l'hôte que le cadre du plugin recouvre (ou libère) toute la fenêtre. */
    requestFullscreen: function (on) {
      guarded("fullscreen", { type: "plugin:fullscreen", on: !!on });
    },
    /** `event` : "doc" | "snapshot" | "theme" | "lang" | "saved" | "error" | "fullscreen". Rend une fonction de désabonnement. */
    on: function (event, cb) {
      if (!listeners[event]) return function () {};
      listeners[event].push(cb);
      return function () {
        var idx = listeners[event].indexOf(cb);
        if (idx !== -1) listeners[event].splice(idx, 1);
      };
    },
    /** Pose les jetons de l'hôte en variables CSS sur `:root`. Appelé automatiquement à chaque thème reçu. */
    applyTheme: applyTheme,
    /** Commandes contribuées (`contributes.commands`). `on(id, cb)` abonne un
     * gestionnaire déclenché quand l'utilisateur clique le bouton de la barre
     * d'outils ; renvoie une fonction de désabonnement. `enable(id, on)` signale
     * à l'hôte l'activation de la commande (désactive le bouton sinon). */
    commands: {
      on: function (id, cb) {
        if (!commandListeners[id]) commandListeners[id] = [];
        commandListeners[id].push(cb);
        return function () {
          var arr = commandListeners[id];
          if (!arr) return;
          var idx = arr.indexOf(cb);
          if (idx !== -1) arr.splice(idx, 1);
        };
      },
      enable: function (id, on) {
        guarded("commands", { type: "plugin:command:enable", id: id, enabled: !!on });
      },
    },
  };

  window.TrkPlugin = TrkPlugin;
})();
