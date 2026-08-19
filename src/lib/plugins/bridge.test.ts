import { describe, it, expect } from "vitest";
import { PLUGIN_API_VERSION, PLUGIN_MESSAGE_NS } from "./types";
import { capabilityFor, decodeHostMessage, decodePluginMessage, encode } from "./bridge";

describe("encode", () => {
  it("pose ns et protocol", () => {
    const env = encode("mindmap", { type: "plugin:ready", apiVersion: 1 });
    expect(env).toEqual({
      ns: PLUGIN_MESSAGE_NS,
      protocol: PLUGIN_API_VERSION,
      pluginId: "mindmap",
      message: { type: "plugin:ready", apiVersion: 1 },
    });
  });
});

describe("decodeHostMessage", () => {
  it("accepte un message hôte valide", () => {
    const env = encode("mindmap", { type: "host:saved", at: "2026-01-01T00:00:00.000Z" });
    expect(decodeHostMessage(env)).toEqual({ type: "host:saved", at: "2026-01-01T00:00:00.000Z" });
  });

  it("rejette un mauvais ns ou un mauvais protocol", () => {
    expect(decodeHostMessage({ ns: "autre.ns", protocol: 1, pluginId: "mindmap", message: { type: "host:saved" } })).toBeNull();
    expect(decodeHostMessage({ ns: PLUGIN_MESSAGE_NS, protocol: 999, pluginId: "mindmap", message: { type: "host:saved" } })).toBeNull();
  });
});

describe("decodePluginMessage", () => {
  const caps = ["doc", "task:reveal", "toast"] as const;

  it("accepte un message valide et autorisé", () => {
    const env = encode("mindmap", { type: "plugin:toast", message: "Sauvegardé" });
    expect(decodePluginMessage(env, "mindmap", caps)).toEqual({ type: "plugin:toast", message: "Sauvegardé" });
  });

  it("rejette un mauvais ns", () => {
    const env = { ns: "autre.ns", protocol: PLUGIN_API_VERSION, pluginId: "mindmap", message: { type: "plugin:ready", apiVersion: 1 } };
    expect(decodePluginMessage(env, "mindmap", caps)).toBeNull();
  });

  it("rejette un mauvais protocol", () => {
    const env = { ns: PLUGIN_MESSAGE_NS, protocol: 999, pluginId: "mindmap", message: { type: "plugin:ready", apiVersion: 1 } };
    expect(decodePluginMessage(env, "mindmap", caps)).toBeNull();
  });

  it("rejette un pluginId qui ne correspond pas à l'iframe authentifiée", () => {
    const env = encode("autre-plugin", { type: "plugin:ready", apiVersion: 1 });
    expect(decodePluginMessage(env, "mindmap", caps)).toBeNull();
  });

  it("rejette un type de message inconnu", () => {
    const env = { ns: PLUGIN_MESSAGE_NS, protocol: PLUGIN_API_VERSION, pluginId: "mindmap", message: { type: "plugin:inconnu" } };
    expect(decodePluginMessage(env, "mindmap", caps)).toBeNull();
  });

  it("rejette une capacité non accordée", () => {
    const env = encode("mindmap", { type: "plugin:file:save", name: "x.json", mime: "application/json", text: "{}" });
    // "file:save" n'est pas dans `caps`.
    expect(decodePluginMessage(env, "mindmap", caps)).toBeNull();
  });

  it("rejette un message malformé pour son type", () => {
    const env = { ns: PLUGIN_MESSAGE_NS, protocol: PLUGIN_API_VERSION, pluginId: "mindmap", message: { type: "plugin:toast" } };
    expect(decodePluginMessage(env, "mindmap", caps)).toBeNull();
  });

  it("accepte plugin:fullscreen avec la capacité accordée", () => {
    const withFull = ["fullscreen"] as const;
    const env = encode("mindmap", { type: "plugin:fullscreen", on: true });
    expect(decodePluginMessage(env, "mindmap", withFull)).toEqual({ type: "plugin:fullscreen", on: true });
  });

  it("rejette plugin:fullscreen sans la capacité, ou avec un `on` non booléen", () => {
    const env = encode("mindmap", { type: "plugin:fullscreen", on: true });
    expect(decodePluginMessage(env, "mindmap", caps)).toBeNull();
    const malformed = { ns: PLUGIN_MESSAGE_NS, protocol: PLUGIN_API_VERSION, pluginId: "mindmap", message: { type: "plugin:fullscreen", on: "oui" } };
    expect(decodePluginMessage(malformed, "mindmap", ["fullscreen"] as const)).toBeNull();
  });

  it("accepte plugin:log avec la capacité debug", () => {
    const env = encode("mindmap", { type: "plugin:log", level: "warn", args: ["quelque chose"] });
    expect(decodePluginMessage(env, "mindmap", ["debug"] as const)).toEqual({
      type: "plugin:log",
      level: "warn",
      args: ["quelque chose"],
    });
  });

  it("rejette plugin:log sans la capacité, avec un niveau inconnu, ou des `args` non textuels", () => {
    const env = encode("mindmap", { type: "plugin:log", level: "warn", args: ["x"] });
    expect(decodePluginMessage(env, "mindmap", caps)).toBeNull();
    const badLevel = { ns: PLUGIN_MESSAGE_NS, protocol: PLUGIN_API_VERSION, pluginId: "mindmap", message: { type: "plugin:log", level: "debug", args: ["x"] } };
    expect(decodePluginMessage(badLevel, "mindmap", ["debug"] as const)).toBeNull();
    const badArgs = { ns: PLUGIN_MESSAGE_NS, protocol: PLUGIN_API_VERSION, pluginId: "mindmap", message: { type: "plugin:log", level: "log", args: [1] } };
    expect(decodePluginMessage(badArgs, "mindmap", ["debug"] as const)).toBeNull();
  });

  it("accepte plugin:command:enable avec la capacité commands", () => {
    const env = encode("demo", { type: "plugin:command:enable", id: "demo.hello", enabled: true });
    expect(decodePluginMessage(env, "demo", ["commands"] as const)).toEqual({
      type: "plugin:command:enable",
      id: "demo.hello",
      enabled: true,
    });
  });

  it("rejette plugin:command:enable sans la capacité commands", () => {
    const env = encode("demo", { type: "plugin:command:enable", id: "demo.hello", enabled: true });
    expect(decodePluginMessage(env, "demo", caps)).toBeNull();
  });
});

describe("capabilityFor", () => {
  it("associe chaque type à sa capacité", () => {
    expect(capabilityFor("plugin:doc:save")).toBe("doc");
    expect(capabilityFor("plugin:task:reveal")).toBe("task:reveal");
    expect(capabilityFor("plugin:ready")).toBeNull();
  });
});
