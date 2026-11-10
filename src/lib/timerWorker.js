// Utilitaire d'horloge haute précision insensible à la mise en arrière-plan
// Les navigateurs et Electron brident les setInterval de la fenêtre inactive.
// Un Web Worker dédié tourne sur son propre fil d'exécution et n'est JAMAIS bridé.

export function createUnthrottledInterval(callback, intervalMs = 250) {
  if (typeof window === "undefined") {
    const id = setInterval(callback, intervalMs);
    return { clear: () => clearInterval(id) };
  }

  // Tentative d'instanciation d'un Web Worker inline autonome via Blob URL
  try {
    const workerCode = `
      let timer = null;
      onmessage = function(e) {
        if (e.data === 'start') {
          if (timer) clearInterval(timer);
          timer = setInterval(function() { postMessage(0); }, ${intervalMs});
        } else if (e.data === 'stop') {
          if (timer) clearInterval(timer);
          timer = null;
        }
      };
    `;
    const blob = new Blob([workerCode], { type: "application/javascript" });
    const blobUrl = URL.createObjectURL(blob);
    const worker = new Worker(blobUrl);

    worker.onmessage = () => {
      callback();
    };

    worker.postMessage("start");

    return {
      clear: () => {
        try {
          worker.postMessage("stop");
          worker.terminate();
          URL.revokeObjectURL(blobUrl);
        } catch {
          // Worker déjà arrêté ou nettoyé
        }
      },
    };
  } catch {
    // Repli propre sur setInterval classique si les Web Workers sont restreints
    const intervalId = setInterval(callback, intervalMs);
    return {
      clear: () => clearInterval(intervalId),
    };
  }
}

