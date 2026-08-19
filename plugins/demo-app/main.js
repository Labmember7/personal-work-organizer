// Plugin d'exemple du tier `app` (v2). Démontre le chargement isolé : module
// ES servi par l'hôte, sandbox `allow-scripts allow-same-origin`, CSP
// `script-src 'self'` (aucun `unsafe-inline`), et pont `postMessage`.
import trk from "trk:sdk";

function render() {
  const tasks = trk.tasks();
  document.getElementById("title").textContent = trk.t("demo_title", "Tâches");
  document.getElementById("count").textContent = tasks.length + " tâche(s) dans la projection";
}

(async () => {
  await trk.ready();
  render();
  trk.on("snapshot", render);
  document.getElementById("refresh").addEventListener("click", () => trk.refreshTasks());
})();
