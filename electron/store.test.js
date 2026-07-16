import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createStore } = require("./store.js");

let dir;
let file;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "trk-store-"));
  file = path.join(dir, "store.json");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("electron/store (écritures sûres)", () => {
  it("écrit après flush et relit les valeurs (objets stockés tels quels)", () => {
    const store = createStore(() => file);
    store.set("clef", { tasks: [{ id: "1" }], projects: ["Alpha"] });
    store.flush();
    const onDisk = JSON.parse(fs.readFileSync(file, "utf-8"));
    expect(onDisk.clef.projects).toEqual(["Alpha"]);
    expect(store.get("clef").tasks).toHaveLength(1);
  });

  it("regroupe les écritures : rien sur le disque avant le debounce", () => {
    const store = createStore(() => file);
    store.set("a", 1);
    store.set("b", 2);
    expect(fs.existsSync(file)).toBe(false);
    store.flush();
    expect(JSON.parse(fs.readFileSync(file, "utf-8"))).toEqual({ a: 1, b: 2 });
  });

  it("garde une copie .bak de la version précédente", () => {
    const store = createStore(() => file);
    store.set("v", 1);
    store.flush();
    store.set("v", 2);
    store.flush();
    expect(JSON.parse(fs.readFileSync(file, "utf-8")).v).toBe(2);
    expect(JSON.parse(fs.readFileSync(file + ".bak", "utf-8")).v).toBe(1);
  });

  it("se replie sur le .bak si le fichier principal est corrompu", () => {
    fs.writeFileSync(file + ".bak", JSON.stringify({ sauve: true }), "utf-8");
    fs.writeFileSync(file, "{ corrompu", "utf-8");
    const store = createStore(() => file);
    expect(store.get("sauve")).toBe(true);
  });

  it("delete retire la clé et signale son existence", () => {
    const store = createStore(() => file);
    store.set("x", 1);
    expect(store.delete("x")).toBe(true);
    expect(store.delete("x")).toBe(false);
    store.flush();
    expect(JSON.parse(fs.readFileSync(file, "utf-8"))).toEqual({});
  });

  it("liste les clés par préfixe", () => {
    const store = createStore(() => file);
    store.set("app:a", 1);
    store.set("app:b", 2);
    store.set("autre", 3);
    expect(store.keys("app:").sort()).toEqual(["app:a", "app:b"]);
    expect(store.keys().length).toBe(3);
  });
});
