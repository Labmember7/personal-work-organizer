import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const OUT = "docs/screenshots";
const URL = process.env.APP_URL || "http://localhost:5173";

const today = new Date();
const plus = (n) => {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

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

const ASSIGNEES = ["Camille", "Alex", "Sam"];
const tasks = FR.tasks.map(([titre, p, statut, priorite, description], i) => ({
  id: `demo-${i + 1}`,
  type: "standard",
  titre,
  projet: FR.projects[p],
  description,
  priorite,
  statut,
  assigne: ASSIGNEES[i % 3],
  dateDebut: plus(-12 + i),
  echeance: plus(2 + i * 3),
  timeLogs:
    i < 5
      ? [
          { id: `tl-${i}-1`, minutes: 90 + i * 15, note: FR.notes[i % 3], date: plus(-3) },
          { id: `tl-${i}-2`, minutes: 45, note: FR.notes[(i + 1) % 3], date: plus(-1) },
        ]
      : [],
}));

const seed = {
  "trk-store:suivi-travaux-data": JSON.stringify({ tasks, projects: FR.projects }),
  "suivi-travaux-tutorial-seen": "1",
  "suivi-travaux-lang": "fr",
  "suivi-travaux-theme": "dark",
  "suivi-travaux-celebrations": "on",
  "suivi-travaux-sticky-mode": "0",
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
await page.waitForTimeout(1500);

const box = async (sel) => {
  const b = await page.locator(sel).first().boundingBox();
  if (!b) throw new Error(`introuvable : ${sel}`);
  return b;
};

// 1. Dashboard (overview showing Dynamic Island at top + board)
await page.screenshot({
  path: `${OUT}/dashboard.png`,
  clip: { x: 0, y: 0, width: 1120, height: 560 },
  animations: "disabled",
});
console.log("✓ dashboard.png");

// 2. Dynamic Island expanded
const islandContainer = page.locator(".trk-island-container").first();
if (await islandContainer.count()) {
  await islandContainer.click();
  await page.waitForTimeout(600);
  // Switch to pet tab to show the Cybernetic Pet!
  const petTab = page.locator(".trk-island-tab").nth(1);
  if (await petTab.count()) {
    await petTab.click();
    await page.waitForTimeout(500);
  }
  const islandBox = await islandContainer.boundingBox();
  if (islandBox) {
    await page.screenshot({
      path: `${OUT}/dynamic-island.png`,
      clip: {
        x: Math.max(0, islandBox.x - 16),
        y: Math.max(0, islandBox.y - 12),
        width: Math.min(islandBox.width + 32, 1120),
        height: Math.min(islandBox.height + 24, 800),
      },
      animations: "disabled",
    });
    console.log("✓ dynamic-island.png");
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
}

// 3. Task list view (switch to list mode)
const listBtn = page.locator(".trk-view-switch button").filter({ hasText: "Liste" });
if (await listBtn.count()) {
  await listBtn.click();
  await page.waitForSelector(".trk-task-list");
  await page.waitForTimeout(500);
  const mainB = await box(".trk-main");
  const row2 = await page.locator(".trk-task-list .trk-task-row").nth(1).boundingBox();
  await page.screenshot({
    path: `${OUT}/tasks.png`,
    clip: {
      x: mainB.x - 8,
      y: mainB.y - 8,
      width: mainB.width + 16,
      height: row2 ? row2.y + row2.height - mainB.y + 16 : 300,
    },
    animations: "disabled",
  });
  console.log("✓ tasks.png");
}

// 4. Kanban view
const kanbanBtn = page.locator(".trk-view-switch button").filter({ hasText: "Kanban" });
if (await kanbanBtn.count()) {
  await kanbanBtn.click();
  await page.waitForSelector(".trk-kanban");
  await page.waitForTimeout(500);
  const b = await box(".trk-kanban");
  await page.screenshot({
    path: `${OUT}/kanban.png`,
    clip: {
      x: b.x - 8,
      y: b.y - 8,
      width: Math.min(b.width + 16, 760),
      height: 356,
    },
    animations: "disabled",
  });
  console.log("✓ kanban.png");
}

// 5. Charts view
{
  await page.locator(".trk-charts").first().scrollIntoViewIfNeeded();
  await page.mouse.move(4, 4);
  await page.waitForTimeout(500);
  const b = await box(".trk-charts");
  const card3 = await page.locator(".trk-charts .trk-chart-card").nth(2).boundingBox();
  await page.screenshot({
    path: `${OUT}/charts.png`,
    clip: {
      x: b.x - 8,
      y: b.y - 8,
      width: card3 ? card3.x + card3.width - b.x + 16 : b.width + 16,
      height: Math.min(b.height + 16, 340),
    },
    animations: "disabled",
  });
  console.log("✓ charts.png");
}

// 6. Sticky note mode
{
  const pinBtn = page.locator(".trk-theme-btn:has(svg.lucide-pin)").first();
  if (await pinBtn.count()) {
    await pinBtn.click();
    await page.waitForTimeout(800);
    await page.locator(".trk-header").scrollIntoViewIfNeeded();
    await page.mouse.move(4, 4);
    await page.waitForTimeout(500);
    const header = await box(".trk-header");
    const main = await box(".trk-main");
    await page.screenshot({
      path: `${OUT}/sticky.png`,
      clip: {
        x: main.x - 8,
        y: header.y - 10,
        width: 1120 - (main.x - 8),
        height: 379,
      },
      animations: "disabled",
    });
    console.log("✓ sticky.png");
    // Turn sticky off
    const unpinBtn = page.locator(".trk-theme-btn:has(svg.lucide-pin-off)").first();
    if (await unpinBtn.count()) await unpinBtn.click();
    await page.waitForTimeout(300);
  }
}

// 7. Plugins section
const pluginsBtn = page.locator(".trk-view-switch button").filter({ hasText: "Plugins" });
if (await pluginsBtn.count()) {
  await pluginsBtn.click();
  await page.waitForTimeout(800);
  const mainB = await box(".trk-main");
  await page.screenshot({
    path: `${OUT}/plugins.png`,
    clip: {
      x: mainB.x - 8,
      y: mainB.y - 8,
      width: mainB.width + 16,
      height: 480,
    },
    animations: "disabled",
  });
  console.log("✓ plugins.png");
}

await browser.close();
console.log("All screenshots captured successfully in", OUT);
