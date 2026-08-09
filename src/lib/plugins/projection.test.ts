// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import type { Task } from "../types";
import { projectSnapshot, projectTask, themeSnapshot } from "./projection";

const baseTask: Task = { id: "t1", titre: "Tâche", projet: "Acme" };

describe("projectTask", () => {
  it("résout libellés et couleurs via statuses.ts", () => {
    const p = projectTask({ ...baseTask, statut: "termine", priorite: "haute" });
    expect(p.statutLabel).toBe("Terminé");
    expect(p.prioriteLabel).toBe("Haute");
    expect(p.weight).toBe(100);
  });

  it("somme les minutes pointées", () => {
    const p = projectTask({
      ...baseTask,
      timeLogs: [{ id: "l1", minutes: 30, note: "", date: "2026-01-01" }, { id: "l2", minutes: 15, note: "", date: "2026-01-02" }],
    });
    expect(p.minutes).toBe(45);
  });

  it("marque une tâche archivée et terminée", () => {
    const p = projectTask({ ...baseTask, statut: "termine", archived: true });
    expect(p.done).toBe(true);
    expect(p.archived).toBe(true);
  });

  it("marque une tâche simple 'done' comme terminée", () => {
    const p = projectTask({ ...baseTask, type: "simple", statut: "done" });
    expect(p.done).toBe(true);
  });

  it("n'a pas de minutes si aucun pointage", () => {
    expect(projectTask(baseTask).minutes).toBe(0);
  });
});

describe("projectSnapshot", () => {
  it("projette toutes les tâches et copie la liste des projets", () => {
    const snap = projectSnapshot([baseTask], ["Acme", "Autre"]);
    expect(snap.tasks).toHaveLength(1);
    expect(snap.projects).toEqual(["Acme", "Autre"]);
  });
});

describe("themeSnapshot", () => {
  it("rend le repli statique sans élément DOM", () => {
    const theme = themeSnapshot("dark", true);
    expect(theme.name).toBe("dark");
    expect(theme.dark).toBe(true);
    expect(theme.tokens["--accent"]).toBe("#35A7A0");
  });

  it("lit les jetons calculés sur l'élément fourni", () => {
    const el = document.createElement("div");
    el.style.setProperty("--accent", "#ABCDEF");
    document.body.appendChild(el);
    const theme = themeSnapshot("light", false, el);
    expect(theme.tokens["--accent"]).toBe("#ABCDEF");
    document.body.removeChild(el);
  });
});
