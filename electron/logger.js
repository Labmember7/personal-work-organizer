const fs = require("fs");
const path = require("path");

// Journal de diagnostic : les lignes sont gardées en mémoire tant que le
// dossier de données n'est pas résolu, puis écrites dans data/debug.log
// (tronqué à chaque lancement : on ne garde que la dernière exécution).

// Le tampon est borné : si AUCUN dossier n'est accessible en écriture,
// attachFile échoue et rien ne vient jamais le vider. getDataDir n'a alors
// pas de valeur à mettre en cache et se relance (en journalisant) à chaque
// appel IPC — le tampon grossirait sans fin pendant toute la session.
const MAX_BUFFERED_LINES = 500;

function createLogger() {
  const buffer = [];
  let file = null;

  function format(arg) {
    if (arg instanceof Error) return `${arg.message}\n${arg.stack}`;
    if (typeof arg === "object") {
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }

  function log(...args) {
    const line = `[${new Date().toISOString()}] ${args.map(format).join(" ")}`;
    console.log(line);
    if (file) {
      try {
        fs.appendFileSync(file, line + "\n", "utf-8");
      } catch {
        // journal indisponible : on continue sans
      }
    } else {
      buffer.push(line);
      if (buffer.length > MAX_BUFFERED_LINES) buffer.shift();
    }
  }

  // Attache le fichier de log une fois le dossier connu, et vide le tampon.
  function attachFile(dir) {
    try {
      const target = path.join(dir, "debug.log");
      fs.writeFileSync(target, buffer.join("\n") + (buffer.length ? "\n" : ""), "utf-8");
      buffer.length = 0;
      file = target;
      return target;
    } catch {
      return null;
    }
  }

  return { log, attachFile, getFile: () => file };
}

module.exports = { createLogger };
