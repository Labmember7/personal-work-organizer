#!/usr/bin/env node
/**
 * CLI de développement TrkPlugin (Phase 6).
 * Charge le validateur TypeScript via l'API SSR de Vite (transforme le TS à la
 * volée) puis l'exécute sous Node.
 * Usage:
 *   node scripts/trk-plugin.mjs validate <dossier-plugin>
 *   node scripts/trk-plugin.mjs init <dossier> [id]
 */
import { createServer } from "vite";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function loadValidator() {
  const server = await createServer({
    root,
    configFile: false,
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  try {
    return await server.ssrLoadModule("src/lib/plugins/validate.ts");
  } finally {
    await server.close();
  }
}

function fsReader(dir) {
  return {
    read: (rel) => {
      const full = join(dir, rel);
      return existsSync(full) ? readFileSync(full, "utf-8") : null;
    },
    exists: (rel) => existsSync(join(dir, rel)),
  };
}

async function cmdValidate(argv) {
  const dir = argv[0];
  if (!dir) {
    console.error("usage: trk-plugin validate <dossier-plugin>");
    return 2;
  }
  const abs = resolve(process.cwd(), dir);
  if (!existsSync(join(abs, "manifest.json"))) {
    console.error(`manifest.json introuvable dans ${abs}`);
    return 1;
  }
  const mod = await loadValidator();
  const { read, exists } = fsReader(abs);
  const res = mod.validatePluginFolder(abs, read, exists);
  const lines = mod.formatDiagnostics(res);
  if (res.ok) {
    console.log(`OK : aucun problème détecté dans ${abs}`);
    return 0;
  }
  console.error(`ECHEC : ${lines.length} diagnostic(s)`);
  for (const l of lines) console.error("  " + l);
  return 1;
}

async function cmdInit(argv) {
  const dir = argv[0];
  const id = argv[1] || "mon-plugin";
  if (!dir) {
    console.error("usage: trk-plugin init <dossier> [id]");
    return 2;
  }
  const abs = resolve(process.cwd(), dir);
  mkdirSync(join(abs, "views"), { recursive: true });

  const manifest = {
    $schema: "schema/trk-manifest-2.json",
    format: "trk.extension/2",
    id,
    version: "0.1.0",
    engines: { api: 2 },
    name: { fr: "Mon plugin", en: "My plugin" },
    description: { fr: "Description.", en: "Description." },
    contributes: {
      views: [{ id: "main", title: { fr: "Vue", en: "View" }, kind: "declarative", spec: "views/main.trkv" }],
    },
  };
  const view = {
    $schema: "schema/trk-view-1.json",
    spec: "trk.view/1",
    layout: { type: "table", columns: [{ value: "title" }, { value: "count(refs)", as: "badge" }] },
  };
  writeFileSync(join(abs, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf-8");
  writeFileSync(join(abs, "views/main.trkv"), JSON.stringify(view, null, 2) + "\n", "utf-8");
  console.log(`Squelette créé dans ${abs} (id="${id}")`);

  const mod = await loadValidator();
  const { read, exists } = fsReader(abs);
  const res = mod.validatePluginFolder(abs, read, exists);
  if (!res.ok) {
    console.error("Le squelette généré n'est pas valide :");
    for (const l of mod.formatDiagnostics(res)) console.error("  " + l);
  }
  return 0;
}

async function main() {
  const [, , command, ...argv] = process.argv;
  if (command === "validate") return await cmdValidate(argv);
  if (command === "init") return await cmdInit(argv);
  console.error("Commandes: validate <dir> | init <dir> [id]");
  return 2;
}

main()
  .then((code) => process.exit(code ?? 0))
  .catch((e) => {
    console.error(e instanceof Error ? e.stack || e.message : String(e));
    process.exit(1);
  });
