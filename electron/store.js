const fs = require("fs");

// Store clé/valeur JSON avec écritures sûres :
// - cache mémoire : une seule lecture disque, pas de relecture à chaque set ;
// - écritures regroupées (debounce) : les rafales de saisie ne réécrivent
//   pas le fichier à chaque frappe ;
// - écriture atomique (fichier temporaire + rename) : un crash ou une
//   coupure de courant ne peut pas laisser un store.json tronqué ;
// - store.json.bak : copie de la dernière version saine, utilisée en
//   secours si le fichier principal est illisible.

const WRITE_DELAY_MS = 200;

function createStore(getFile) {
  let cache = null;
  let timer = null;
  let dirty = false;

  function load() {
    if (cache) return cache;
    const file = getFile();
    for (const candidate of [file, file + ".bak"]) {
      try {
        if (fs.existsSync(candidate)) {
          cache = JSON.parse(fs.readFileSync(candidate, "utf-8"));
          return cache;
        }
      } catch {
        // fichier corrompu : on tente la sauvegarde .bak
      }
    }
    cache = {};
    return cache;
  }

  function writeNow() {
    const file = getFile();
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), "utf-8");
    try {
      if (fs.existsSync(file)) fs.copyFileSync(file, file + ".bak");
    } catch {
      // pas de .bak possible, l'écriture principale reste prioritaire
    }
    fs.renameSync(tmp, file);
    dirty = false;
  }

  function scheduleWrite() {
    dirty = true;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      try {
        writeNow();
      } catch {
        // disque indisponible : dirty reste vrai, retenté au prochain set/flush
      }
    }, WRITE_DELAY_MS);
  }

  return {
    get(key) {
      const store = load();
      return key in store ? store[key] : undefined;
    },
    set(key, value) {
      const store = load();
      store[key] = value;
      scheduleWrite();
    },
    delete(key) {
      const store = load();
      const existed = key in store;
      delete store[key];
      if (existed) scheduleWrite();
      return existed;
    },
    keys(prefix) {
      return Object.keys(load()).filter((k) => !prefix || k.startsWith(prefix));
    },
    // À appeler avant la fermeture de l'app : force l'écriture en attente.
    flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (dirty) writeNow();
    },
  };
}

module.exports = { createStore };
