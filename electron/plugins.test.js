import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { extractManifestBlock as extractManifestBlockTs } from "../src/lib/plugins/manifest";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { extractManifestBlock, resolvePluginDirs, listPlugins, readPluginHtml, wrapPluginHtml, PLUGIN_CSP } = require("./plugins.js");

const MANIFEST_HTML = `<!doctype html>
<html><head>
<script type="application/json" id="trk-plugin">
{ "id": "mindmap", "version": "1.0.0", "apiVersion": 1, "name": { "fr": "Carte mentale" }, "capabilities": ["doc"] }
</script>
</head><body></body></html>`;

let baseDir; // dossier "user", à côté de l'exécutable
let appDir; // dossier "builtin", à côté de main.js

beforeEach(() => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "trk-plugins-user-"));
  appDir = fs.mkdtempSync(path.join(os.tmpdir(), "trk-plugins-builtin-"));
});

afterEach(() => {
  fs.rmSync(baseDir, { recursive: true, force: true });
  fs.rmSync(appDir, { recursive: true, force: true });
});

describe("resolvePluginDirs", () => {
  it("rend builtin (appDir) puis user (baseDir)", () => {
    expect(resolvePluginDirs(baseDir, appDir)).toEqual([
      { dir: path.join(appDir, "plugins"), origin: "builtin" },
      { dir: path.join(baseDir, "plugins"), origin: "user" },
    ]);
  });
});

describe("listPlugins", () => {
  it("découvre les deux racines", () => {
    const dirs = resolvePluginDirs(baseDir, appDir);
    fs.mkdirSync(dirs[0].dir, { recursive: true });
    fs.mkdirSync(dirs[1].dir, { recursive: true });
    fs.writeFileSync(path.join(dirs[0].dir, "mindmap.html"), MANIFEST_HTML, "utf-8");
    fs.writeFileSync(path.join(dirs[1].dir, "extra.html"), MANIFEST_HTML, "utf-8");

    const entries = listPlugins(dirs);
    expect(entries.map((e) => `${e.origin}:${e.file}`).sort()).toEqual(["builtin:mindmap.html", "user:extra.html"]);
    expect(entries[0].manifestJson).toContain("mindmap");
  });

  it("ne casse pas si un dossier est absent", () => {
    const dirs = resolvePluginDirs(baseDir, appDir); // aucun des deux n'existe
    expect(listPlugins(dirs)).toEqual([]);
  });

  it("signale un fichier sans manifeste sans faire échouer les autres", () => {
    const dirs = resolvePluginDirs(baseDir, appDir);
    fs.mkdirSync(dirs[1].dir, { recursive: true });
    fs.writeFileSync(path.join(dirs[1].dir, "sans-manifeste.html"), "<html></html>", "utf-8");
    fs.writeFileSync(path.join(dirs[1].dir, "ok.html"), MANIFEST_HTML, "utf-8");

    const entries = listPlugins(dirs);
    const bad = entries.find((e) => e.file === "sans-manifeste.html");
    const good = entries.find((e) => e.file === "ok.html");
    expect(bad.error).toBe("no-manifest");
    expect(good.error).toBeUndefined();
  });
});

describe("readPluginHtml", () => {
  it("un fichier user du même nom écrase le builtin", () => {
    const dirs = resolvePluginDirs(baseDir, appDir);
    fs.mkdirSync(dirs[0].dir, { recursive: true });
    fs.mkdirSync(dirs[1].dir, { recursive: true });
    fs.writeFileSync(path.join(dirs[0].dir, "mindmap.html"), "builtin", "utf-8");
    fs.writeFileSync(path.join(dirs[1].dir, "mindmap.html"), "user", "utf-8");

    expect(readPluginHtml(dirs, "mindmap.html").html).toBe("user");
  });

  it("refuse un nom de fichier qui traverse les répertoires", () => {
    const dirs = resolvePluginDirs(baseDir, appDir);
    expect(readPluginHtml(dirs, "../../etc/passwd")).toBeNull();
    expect(readPluginHtml(dirs, "sous/dossier.html")).toBeNull();
  });

  it("rend null si le fichier n'existe dans aucune racine", () => {
    const dirs = resolvePluginDirs(baseDir, appDir);
    expect(readPluginHtml(dirs, "absent.html")).toBeNull();
  });
});

describe("extractManifestBlock", () => {
  it("extrait le bloc JSON", () => {
    expect(extractManifestBlock(MANIFEST_HTML)).toContain('"id": "mindmap"');
  });

  it("rend null si la balise est absente", () => {
    expect(extractManifestBlock("<html></html>")).toBeNull();
  });
});

describe("wrapPluginHtml", () => {
  it("injecte le SDK et le charset avant le HTML du plugin", () => {
    const wrapped = wrapPluginHtml(MANIFEST_HTML, "window.TrkPlugin = {};");
    expect(wrapped).toContain('<meta charset="utf-8">');
    expect(wrapped).toContain("window.TrkPlugin = {};");
    expect(wrapped.indexOf("TrkPlugin")).toBeLessThan(wrapped.indexOf("trk-plugin"));
  });
});

describe("PLUGIN_CSP", () => {
  it("interdit le réseau et n'autorise pas bypassCSP", () => {
    expect(PLUGIN_CSP).toContain("connect-src 'none'");
    expect(PLUGIN_CSP).toContain("default-src 'none'");
  });
});

// Non-régression : la regex de electron/plugins.js et extractManifestBlock de
// src/lib/plugins/manifest.ts doivent toujours donner le même résultat, sur
// le plugin réellement livré avec l'app. Un écart romprait la découverte
// (main.js) ou la validation (renderer) sans que rien ne le signale.
describe("non-régression : même regex que src/lib/plugins/manifest.ts", () => {
  it("donne le même résultat sur plugins/mindmap.html", () => {
    const file = path.join(__dirname, "..", "plugins", "mindmap.html");
    const html = fs.readFileSync(file, "utf-8");
    expect(extractManifestBlock(html)).toBe(extractManifestBlockTs(html));
    expect(extractManifestBlock(html)).not.toBeNull();
  });
});
