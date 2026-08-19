import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { extractManifestBlock as extractManifestBlockTs } from "../src/lib/plugins/manifest";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { extractManifestBlock, resolvePluginDirs, listPlugins, discoverFolders, readPluginResource, buildPluginCsp, readPluginHtml, wrapPluginHtml, PLUGIN_CSP } = require("./plugins.js");

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

  it("la CSP v2 n'a pas de unsafe-inline sur script-src (origine par plugin)", () => {
    const csp = buildPluginCsp(2);
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("script-src 'unsafe-inline'");
    expect(csp).toContain("connect-src 'self'");
  });

  it("la CSP v1 garde unsafe-inline (mono-fichier)", () => {
    expect(buildPluginCsp(1)).toContain("script-src 'unsafe-inline'");
  });
});

describe("discoverFolders", () => {
  it("découvre un dossier avec manifest.json et ignore un dossier sans", () => {
    const dirs = resolvePluginDirs(baseDir, appDir);
    fs.mkdirSync(dirs[0].dir, { recursive: true });
    fs.mkdirSync(path.join(dirs[0].dir, "myplugin"), { recursive: true });
    fs.writeFileSync(path.join(dirs[0].dir, "myplugin", "manifest.json"), JSON.stringify({ format: "trk.extension/2", id: "myplugin", version: "1.0.0", engines: { api: 2 } }), "utf-8");
    fs.mkdirSync(path.join(dirs[0].dir, "vide"), { recursive: true });

    const folders = discoverFolders(dirs);
    const found = folders.find((f) => f.id === "myplugin");
    expect(found).toBeDefined();
    expect(found.root).toBe(path.join(dirs[0].dir, "myplugin"));
    expect(found.manifestJson).toContain("myplugin");
    expect(found.specJson).toBeUndefined();
    expect(folders.some((f) => f.id === "vide")).toBe(false);
  });

  it("attaque la spec déclarative d'un dossier v2 sur l'entrée IPC", () => {
    const dirs = resolvePluginDirs(baseDir, appDir);
    fs.mkdirSync(dirs[0].dir, { recursive: true });
    const root = path.join(dirs[0].dir, "decl");
    fs.mkdirSync(path.join(root, "views"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "manifest.json"),
      JSON.stringify({
        format: "trk.extension/2",
        id: "decl",
        version: "1.0.0",
        engines: { api: 2 },
        contributes: { views: [{ kind: "declarative", spec: "views/charge.trkv" }] },
      }),
      "utf-8",
    );
    fs.writeFileSync(path.join(root, "views", "charge.trkv"), JSON.stringify({ spec: "trk.view/1", source: "tasks" }), "utf-8");

    const folders = discoverFolders(dirs);
    const found = folders.find((f) => f.id === "decl");
    expect(found).toBeDefined();
    expect(found.specJson).toContain("trk.view/1");
  });
});

describe("readPluginResource", () => {
  let root;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "trk-res-"));
    fs.mkdirSync(path.join(root, "sub"), { recursive: true });
    fs.writeFileSync(path.join(root, "sub", "hi.txt"), "bonjour", "utf-8");
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("sert un fichier dans la racine", () => {
    const res = readPluginResource(root, "sub/hi.txt");
    expect(res).not.toBeNull();
    expect(res.data.toString("utf-8")).toBe("bonjour");
  });

  it("refuse une traversée de répertoire (..)", () => {
    expect(readPluginResource(root, "../escape.txt")).toBeNull();
    expect(readPluginResource(root, "sub/../../etc/passwd")).toBeNull();
  });

  it("refuse un chemin absolu", () => {
    expect(readPluginResource(root, "/etc/passwd")).toBeNull();
    expect(readPluginResource(root, "C:\\\\windows\\system32\\x")).toBeNull();
  });

  it("refuse un chemin vide", () => {
    expect(readPluginResource(root, "")).toBeNull();
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
