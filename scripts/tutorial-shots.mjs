// Captures d'écran du guide de démarrage (une par étape de TUTORIAL_STEPS).
// À relancer quand l'UI bouge, sinon le guide illustre une version périmée.
//
//   npm run dev                                   # serveur Vite sur :5173
//   node scripts/tutorial-shots.mjs fr /tmp/shots-fr
//   node scripts/tutorial-shots.mjs en /tmp/shots-en
//   node scripts/tutorial-encode.mjs /tmp/shots-fr src/assets/tutorial/fr 1200 0.78
//   node scripts/tutorial-encode.mjs /tmp/shots-en src/assets/tutorial/en 1200 0.78
//
// Playwright n'est pas une dépendance du projet : `npx playwright@1.62 ...` ou
// un lien vers une installation existante suffit (les navigateurs doivent être
// installés, cf. `npx playwright install chromium`).
//
// Le jeu de données est factice et injecté dans localStorage : les captures ne
// contiennent jamais de vraies données de travail.
//
// Usage: node tutorial-shots.mjs <fr|en> <outDir>
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const LANG = process.argv[2] || "fr";
const OUT = process.argv[3];
const URL = process.env.APP_URL || "http://localhost:5173";

const today = new Date();
const plus = (n) => {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

// Volontairement des tâches du quotidien : le guide doit parler à tout le monde,
// pas seulement à un développeur.
const FR = {
  projects: ["Maison", "Vacances d'été", "Santé & sport", "Administratif", "Anniversaire"],
  notes: ["Premier essai", "Deuxième passage", "À deux, c'est plus rapide"],
  tasks: [
    ["Trier les cartons du garage", 0, "revue", "critique", "Garder, donner, jeter — trois piles."],
    ["Repeindre la chambre", 0, "implementer", "haute", "Deux couches, teinte claire."],
    ["Changer l'ampoule du couloir", 0, "analyser", "moyenne", ""],
    ["Réserver les billets de train", 1, "integrer", "haute", "Aller-retour, places côté fenêtre."],
    ["Faire les valises", 1, "termine", "moyenne", ""],
    ["Trouver un logement sur place", 1, "valider", "basse", ""],
    ["Reprendre la course à pied", 2, "implementer", "moyenne", ""],
    ["Rendez-vous chez le dentiste", 2, "analyser", "haute", ""],
    ["Louer une voiture", 1, "analyser", "basse", ""],
    ["Renouveler le passeport", 3, "implementer", "moyenne", ""],
    ["Déclaration d'impôts", 3, "valider", "haute", ""],
    ["Commander le gâteau", 4, "revue", "basse", ""],
  ],
};

const EN = {
  projects: ["Home", "Summer holiday", "Health & sport", "Paperwork", "Birthday"],
  notes: ["First pass", "Second pass", "Faster with help"],
  tasks: [
    ["Sort the boxes in the garage", 0, "revue", "critique", "Keep, give away, throw out — three piles."],
    ["Repaint the bedroom", 0, "implementer", "haute", "Two coats, light shade."],
    ["Replace the hallway bulb", 0, "analyser", "moyenne", ""],
    ["Book the train tickets", 1, "integrer", "haute", "Return trip, window seats."],
    ["Pack the suitcases", 1, "termine", "moyenne", ""],
    ["Find a place to stay", 1, "valider", "basse", ""],
    ["Start running again", 2, "implementer", "moyenne", ""],
    ["Dentist appointment", 2, "analyser", "haute", ""],
    ["Rent a car", 1, "analyser", "basse", ""],
    ["Renew the passport", 3, "implementer", "moyenne", ""],
    ["Tax return", 3, "valider", "haute", ""],
    ["Order the cake", 4, "revue", "basse", ""],
  ],
};

const D = LANG === "en" ? EN : FR;
const ASSIGNEES = ["Camille", "Alex", "Sam"];

const tasks = D.tasks.map(([titre, p, statut, priorite, description], i) => ({
  id: `demo-${i + 1}`,
  type: "standard",
  titre,
  projet: D.projects[p],
  description,
  priorite,
  statut,
  assigne: ASSIGNEES[i % 3],
  dateDebut: plus(-12 + i),
  echeance: plus(2 + i * 3),
  timeLogs:
    i < 5
      ? [
          { id: `tl-${i}-1`, minutes: 90 + i * 15, note: D.notes[i % 3], date: plus(-3) },
          { id: `tl-${i}-2`, minutes: 45, note: D.notes[(i + 1) % 3], date: plus(-1) },
        ]
      : [],
}));

const seed = {
  "trk-store:suivi-travaux-data": JSON.stringify({ tasks, projects: D.projects }),
  "suivi-travaux-tutorial-seen": "1",
  "suivi-travaux-lang": LANG,
  "suivi-travaux-theme": "dark",
  "suivi-travaux-celebrations": "on",
  "suivi-travaux-sticky-mode": "0",
  // Une tâche « sur le feu » depuis 42 min, pour la zone de focus.
  "suivi-travaux-focus": "demo-1",
  "suivi-travaux-focus-started": String(Date.now() - 42 * 60 * 1000),
};

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1120, height: 800 },
  deviceScaleFactor: 2,
});
await page.addInitScript((s) => {
  for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
}, seed);
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForSelector(".trk-header");
await page.waitForTimeout(1500); // polices + animations d'entrée

const box = async (sel) => {
  const b = await page.locator(sel).first().boundingBox();
  if (!b) throw new Error(`introuvable : ${sel}`);
  return b;
};

const pad = (b, p = 10, over = {}) => ({
  x: Math.max(0, b.x - p),
  y: Math.max(0, b.y - p),
  width: b.width + p * 2,
  height: b.height + p * 2,
  ...over,
});

const clipShot = async (name, clip) => {
  await page.screenshot({
    path: `${OUT}/${name}.png`,
    clip: {
      x: Math.max(0, clip.x),
      y: Math.max(0, clip.y),
      width: Math.min(clip.width, 1120 - Math.max(0, clip.x)),
      height: Math.min(clip.height, 800 - Math.max(0, clip.y)),
    },
    animations: "disabled",
  });
  console.log("✓", name);
};

// ── 1. welcome : la fenêtre entière ──────────────────────────────────────────
await clipShot("welcome", { x: 0, y: 0, width: 1120, height: 560 });

// ── 8. backup : le bloc import/export de l'en-tête ───────────────────────────
{
  const b = await box(".trk-header-actions");
  await clipShot("backup", pad(b, 14));
}

// ── 2. projects : la barre latérale, coupée juste sous le dernier projet ─────
{
  const b = await box(".trk-sidebar");
  const cards = page.locator(".trk-sidebar .trk-project-card");
  // Trois projets suffisent : la colonne reste lisible dans la modale du guide.
  const lastBox = await cards.nth(2).boundingBox();
  await clipShot("projects", {
    x: b.x - 8,
    y: b.y - 8,
    width: b.width + 16,
    height: lastBox.y + lastBox.height - b.y + 26,
  });
}

// ── 3. tasks : barre d'outils + les deux premières lignes ────────────────────
{
  const b = await box(".trk-main");
  const row2 = await page.locator(".trk-task-list .trk-task-row").nth(1).boundingBox();
  await clipShot("tasks", {
    x: b.x - 8,
    y: b.y - 8,
    width: b.width + 16,
    height: row2.y + row2.height - b.y + 16,
  });
}

// ── 6. time : popover de pointage du temps sur une ligne ─────────────────────
{
  const row = page.locator(".trk-task-list .trk-task-row").nth(1);
  await row.locator(".trk-time-badge").click();
  await page.waitForSelector(".trk-timelog-panel");
  await page.waitForTimeout(400);
  const rb = await row.boundingBox();
  const pb = await box(".trk-timelog-panel");
  const x = Math.min(rb.x, pb.x) - 8;
  const y = Math.min(rb.y, pb.y) - 8;
  await clipShot("time", {
    x,
    y,
    width: Math.max(rb.x + rb.width, pb.x + pb.width) - x + 8,
    height: Math.max(rb.y + rb.height, pb.y + pb.height) - y + 8,
  });
  await page.keyboard.press("Escape");
  await page.locator(".trk-title").click();
  await page.waitForTimeout(200);
}

// ── 5. focus : la marmite avec une tâche qui mijote ──────────────────────────
{
  const b = await box(".trk-focus-zone");
  await clipShot("focus", pad(b, 12));
}

// ── 7. charts : les cartes de graphiques (marmite repliée pour ne pas les
//      masquer) ───────────────────────────────────────────────────────────────
{
  await page.locator(".trk-focus-reduce-btn").click();
  await page.waitForTimeout(400);
  await page.locator(".trk-charts").first().scrollIntoViewIfNeeded();
  // Souris hors des graphiques : sinon recharts laisse une infobulle collée.
  await page.mouse.move(4, 4);
  await page.waitForTimeout(900);
  const b = await box(".trk-charts");
  // Trois cartes seulement : la pastille repliée de la marmite flotte sur la
  // quatrième, en bas à droite de la fenêtre.
  const card3 = await page.locator(".trk-charts .trk-chart-card").nth(2).boundingBox();
  await clipShot("charts", {
    x: b.x - 8,
    y: b.y - 8,
    width: card3 ? card3.x + card3.width - b.x + 16 : b.width + 16,
    height: Math.min(b.height + 16, 340),
  });
}

// ── 4. views : la vue kanban (deux cartes de haut) ───────────────────────────
{
  await page.locator(".trk-view-btn").nth(1).click();
  await page.waitForSelector(".trk-kanban");
  await page.locator(".trk-toolbar").scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  const b = await box(".trk-kanban");
  const card2 = await page
    .locator(".trk-kanban-col")
    .first()
    .locator(".trk-kanban-card")
    .nth(1)
    .boundingBox();
  await clipShot("views", {
    x: b.x - 8,
    y: b.y - 8,
    width: Math.min(b.width + 16, 760),
    height: card2 ? card2.y + card2.height - b.y + 16 : 340,
  });
}

// ── 8. themes : mode post-it activé, avec les boutons d'apparence ────────────
{
  await page.locator(".trk-view-btn").first().click(); // retour en vue liste
  await page.waitForSelector(".trk-task-list");
  // 2e bloc de boutons = apparence ; 2e bouton = la punaise (mode post-it).
  await page.locator(".trk-btn-group").nth(1).locator(".trk-theme-btn").nth(1).click();
  await page.waitForTimeout(900);
  await page.locator(".trk-header").scrollIntoViewIfNeeded();
  await page.mouse.move(4, 4);
  await page.waitForTimeout(600);
  const header = await box(".trk-header");
  const main = await box(".trk-main");
  const row2 = await page.locator(".trk-task-list .trk-task-row").nth(1).boundingBox();
  await clipShot("themes", {
    x: main.x - 8,
    y: header.y - 10,
    width: 1120 - (main.x - 8),
    height: row2.y + row2.height - header.y + 20,
  });
}

await browser.close();
console.log("→", OUT);
