import { describe, it, expect } from "vitest";
import type { PluginSource, PluginManifest, TaskColumnContrib } from "./types";
import type { Task } from "../types";
import { collectTaskColumns, evalColumnValue, collectTaskPanels } from "./contrib";

function plugin(manifest: Partial<PluginManifest> & { id: string; version: string }): PluginSource {
  return {
    manifest: manifest as PluginManifest,
    format: 2,
    root: "/x",
    url: "",
    origin: "builtin",
    file: "/x/manifest.json",
  } as PluginSource;
}

const task = {
  id: "t1",
  titre: "T",
  projet: "p",
  priorite: "normale",
  statut: "a_faire",
  timeLogs: [{ minutes: 5 }, { minutes: 3 }],
} as unknown as Task;

describe("collectTaskColumns", () => {
  it("récolte les colonnes contribuées par les plugins v2", () => {
    const plugins = [
      plugin({ id: "a", version: "1", taskColumns: [{ id: "a.c", label: "C", value: "task.minutes" }] }),
      plugin({ id: "b", version: "1" }),
    ];
    const cols = collectTaskColumns(plugins);
    expect(cols).toHaveLength(1);
    expect(cols[0]?.id).toBe("a.c");
  });

  it("renvoie [] sans colonnes", () => {
    expect(collectTaskColumns([plugin({ id: "a", version: "1" })])).toEqual([]);
  });
});

describe("collectTaskPanels", () => {
  it("récolte les panneaux avec leur spec embarquée (declarative)", () => {
    const p = plugin({
      id: "mindmap",
      version: "1",
      taskPanels: [{ id: "mindmap.related", kind: "declarative", spec: "views/related.trkv", title: "Sur la carte" }],
    });
    p.panelSpecs = { "mindmap.related": '{"layout":{"columns":[]}}' };
    const panels = collectTaskPanels([p]);
    expect(panels).toHaveLength(1);
    expect(panels[0]?.pluginId).toBe("mindmap");
    expect(panels[0]?.specJson).toBe('{"layout":{"columns":[]}}');
  });

  it("associe undefined au spec pour un panneau sans spec embarquée", () => {
    const p = plugin({ id: "a", version: "1", taskPanels: [{ id: "a.p", kind: "app", entry: "p.html" }] });
    const panels = collectTaskPanels([p]);
    expect(panels[0]?.specJson).toBeUndefined();
    expect(panels[0]?.panel.kind).toBe("app");
  });
});

describe("evalColumnValue", () => {
  it("évalue la valeur contre la projection en lecture seule de la tâche", () => {
    const col: TaskColumnContrib = { id: "demo.minutes", label: "Min", value: "task.minutes" };
    expect(evalColumnValue(col, task, "fr")).toBe("8");
  });

  it("renvoie '' si l'expression est vide ou invalide", () => {
    expect(evalColumnValue({ id: "x", label: "X", value: "" }, task, "fr")).toBe("");
    expect(evalColumnValue({ id: "x", label: "X", value: "task.inconnu.quoi" }, task, "fr")).toBe("");
  });
});
