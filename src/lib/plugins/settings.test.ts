import { describe, it, expect } from "vitest";
import { defaultSettings, mergeSettings } from "./settings";
import type { SettingDef } from "./types";

const defs: Record<string, SettingDef> = {
  "demo.curve": { type: "enum", values: ["elbow", "bezier"], default: "elbow", label: "Courbe" },
  "demo.ms": { type: "number", default: 300, min: 0, max: 5000 },
  "demo.on": { type: "boolean", default: true },
};

describe("settings (contributes.settings)", () => {
  it("defaultSettings renvoie les valeurs par défaut", () => {
    expect(defaultSettings(defs)).toEqual({ "demo.curve": "elbow", "demo.ms": 300, "demo.on": true });
  });

  it("mergeSettings surcharge par le stockage", () => {
    const merged = mergeSettings(defs, { "demo.curve": "bezier", "demo.ms": 120 });
    expect(merged).toEqual({ "demo.curve": "bezier", "demo.ms": 120, "demo.on": true });
  });

  it("mergeSettings ignore les clés hors manifeste", () => {
    const merged = mergeSettings(defs, { "demo.curve": "bezier", "inconnu": 1 });
    expect(merged).toEqual({ "demo.curve": "bezier", "demo.ms": 300, "demo.on": true });
  });

  it("mergeSettings sans définition renvoie {} ", () => {
    expect(mergeSettings(undefined, { a: 1 })).toEqual({});
  });
});
