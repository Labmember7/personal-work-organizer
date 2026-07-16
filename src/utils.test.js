import { describe, it, expect } from "vitest";
import {
  statusOf, prioOf, taskMinutes, liveTaskMinutes, formatDuration,
  parseDurationInput, projectColor, STATUSES, PRIORITIES,
  isValidBackupData, normalizeBackupData, buildBackupPayload, taskMatchesQuery,
  focusMinutes, DAY_WORK_CAP_MINUTES,
  isDoneStatus, isTaskDone, isSimpleTask, statusesForTask, SIMPLE_STATUSES, uid,
} from "./utils";

describe("statuts terminés et familles de statuts", () => {
  it("isDoneStatus reconnaît les deux familles", () => {
    expect(isDoneStatus("termine")).toBe(true);
    expect(isDoneStatus("done")).toBe(true);
    expect(isDoneStatus("revue")).toBe(false);
    expect(isDoneStatus(undefined)).toBe(false);
  });
  it("isTaskDone lit le statut de la tâche", () => {
    expect(isTaskDone({ statut: "termine" })).toBe(true);
    expect(isTaskDone({ statut: "todo" })).toBe(false);
  });
  it("statusesForTask suit le type de tâche", () => {
    expect(statusesForTask({ type: "simple" })).toBe(SIMPLE_STATUSES);
    expect(statusesForTask({ type: "standard" })).toBe(STATUSES);
    expect(statusesForTask({})).toBe(STATUSES);
    expect(isSimpleTask({ type: "simple" })).toBe(true);
  });
});

describe("uid", () => {
  it("rend des chaînes uniques", () => {
    const ids = new Set(Array.from({ length: 100 }, () => uid()));
    expect(ids.size).toBe(100);
    for (const id of ids) expect(typeof id).toBe("string");
  });
});

describe("focusMinutes", () => {
  const at = (iso) => new Date(iso).getTime();
  it("returns elapsed minutes within a single day", () => {
    expect(focusMinutes(at("2026-07-15T09:00:00"), at("2026-07-15T10:30:00"))).toBe(90);
  });
  it("caps a single day at 8h", () => {
    expect(focusMinutes(at("2026-07-15T00:00:00"), at("2026-07-15T23:59:00"))).toBe(DAY_WORK_CAP_MINUTES);
  });
  it("caps each calendar day separately across a closed period", () => {
    // 14h le 13, journée pleine le 14, 1h le 15 → 8h + 8h + 1h
    expect(focusMinutes(at("2026-07-13T10:00:00"), at("2026-07-15T01:00:00"))).toBe(2 * DAY_WORK_CAP_MINUTES + 60);
  });
  it("returns 0 for missing or inverted bounds", () => {
    expect(focusMinutes(null, Date.now())).toBe(0);
    expect(focusMinutes(at("2026-07-15T10:00:00"), at("2026-07-15T09:00:00"))).toBe(0);
  });
});

describe("taskMatchesQuery", () => {
  const task = { titre: "Corriger l'écran", description: "Bug affichage", projet: "API-REST", assigne: "Bacem" };
  it("matches regardless of case and accents", () => {
    expect(taskMatchesQuery(task, "ECRAN")).toBe(true);
  });
  it("matches across fields with multiple terms", () => {
    expect(taskMatchesQuery(task, "bacem bug")).toBe(true);
  });
  it("rejects when one term matches nothing", () => {
    expect(taskMatchesQuery(task, "ecran inconnu")).toBe(false);
  });
  it("accepts empty query", () => {
    expect(taskMatchesQuery(task, "  ")).toBe(true);
  });
});

describe("statusOf", () => {
  it("finds a known status", () => {
    expect(statusOf("termine").label).toBe("Terminé");
  });
  it("falls back to the first status for unknown id", () => {
    expect(statusOf("nope")).toBe(STATUSES[0]);
  });
});

describe("prioOf", () => {
  it("finds a known priority", () => {
    expect(prioOf("critique").label).toBe("Critique");
  });
  it("falls back to moyenne for unknown id", () => {
    expect(prioOf("nope")).toBe(PRIORITIES[2]);
  });
});

describe("taskMinutes", () => {
  it("sums minutes across time logs", () => {
    const task = { timeLogs: [{ minutes: 30 }, { minutes: 45 }] };
    expect(taskMinutes(task)).toBe(75);
  });
  it("returns 0 when there are no time logs", () => {
    expect(taskMinutes({})).toBe(0);
  });
});

describe("liveTaskMinutes", () => {
  const at = (iso) => new Date(iso).getTime();
  it("adds the running focus session on top of logged minutes for the focused task", () => {
    const task = { id: "t1", timeLogs: [{ minutes: 30 }] };
    const startedAt = at("2026-07-15T09:00:00");
    const now = at("2026-07-15T09:20:00");
    expect(liveTaskMinutes(task, "t1", startedAt, now)).toBe(50);
  });
  it("ignores the running session for a task that isn't focused", () => {
    const task = { id: "t2", timeLogs: [{ minutes: 30 }] };
    expect(liveTaskMinutes(task, "t1", at("2026-07-15T09:00:00"), at("2026-07-15T09:20:00"))).toBe(30);
  });
  it("returns plain logged minutes when no focus session is active", () => {
    const task = { id: "t1", timeLogs: [{ minutes: 30 }] };
    expect(liveTaskMinutes(task, null, null, Date.now())).toBe(30);
  });
});

describe("formatDuration", () => {
  it("formats 0 as 0m", () => {
    expect(formatDuration(0)).toBe("0m");
  });
  it("formats minutes only", () => {
    expect(formatDuration(45)).toBe("45m");
  });
  it("formats hours only", () => {
    expect(formatDuration(120)).toBe("2h");
  });
  it("formats hours and minutes", () => {
    expect(formatDuration(90)).toBe("1h30");
  });
  it("complète les minutes à deux chiffres", () => {
    expect(formatDuration(65)).toBe("1h05");
    expect(formatDuration(601)).toBe("10h01");
  });
});

describe("parseDurationInput", () => {
  it("parses h:mm format", () => {
    expect(parseDurationInput("1:30")).toBe(90);
  });
  it("parses Nh format", () => {
    expect(parseDurationInput("2h")).toBe(120);
  });
  it("parses Nh Mm format", () => {
    expect(parseDurationInput("1h30")).toBe(90);
  });
  it("parses decimal hours", () => {
    expect(parseDurationInput("1.5h")).toBe(90);
  });
  it("parses decimal hours with a comma (saisie française)", () => {
    expect(parseDurationInput("1,5h")).toBe(90);
    expect(parseDurationInput("0,25h")).toBe(15);
  });
  it("parses minutes with m suffix", () => {
    expect(parseDurationInput("45m")).toBe(45);
  });
  it("parses a bare number as minutes", () => {
    expect(parseDurationInput("90")).toBe(90);
  });
  it("returns null for empty input", () => {
    expect(parseDurationInput("  ")).toBeNull();
  });
  it("returns null for unrecognized format", () => {
    expect(parseDurationInput("abc")).toBeNull();
  });
});

describe("projectColor", () => {
  it("is deterministic for the same name", () => {
    expect(projectColor("Alpha")).toBe(projectColor("Alpha"));
  });
  it("returns a value from the palette", () => {
    expect(projectColor("Alpha")).toMatch(/^#[0-9A-F]{6}$/i);
  });
});

describe("isValidBackupData", () => {
  it("accepts an object with tasks and projects arrays", () => {
    expect(isValidBackupData({ tasks: [], projects: [] })).toBe(true);
  });
  it("accepts tasks carrying at least a title and a project", () => {
    expect(
      isValidBackupData({ tasks: [{ id: "1", titre: "Test", projet: "Alpha" }], projects: ["Alpha"] })
    ).toBe(true);
  });
  it("rejects tasks missing titre or projet (would crash search/sort)", () => {
    expect(isValidBackupData({ tasks: [{ id: "1" }], projects: ["Alpha"] })).toBe(false);
    expect(isValidBackupData({ tasks: [{ titre: "Test" }], projects: [] })).toBe(false);
    expect(isValidBackupData({ tasks: [{ titre: "Test", projet: "  " }], projects: [] })).toBe(false);
  });
  it("rejects non-string project entries", () => {
    expect(isValidBackupData({ tasks: [], projects: [42] })).toBe(false);
  });
  it("rejects null or undefined", () => {
    expect(isValidBackupData(null)).toBe(false);
    expect(isValidBackupData(undefined)).toBe(false);
  });
  it("rejects a plain object without the expected shape", () => {
    expect(isValidBackupData({})).toBe(false);
  });
  it("rejects when tasks is missing or not an array", () => {
    expect(isValidBackupData({ projects: [] })).toBe(false);
    expect(isValidBackupData({ tasks: "nope", projects: [] })).toBe(false);
  });
  it("rejects when projects is missing or not an array", () => {
    expect(isValidBackupData({ tasks: [] })).toBe(false);
    expect(isValidBackupData({ tasks: [], projects: "nope" })).toBe(false);
  });
  it("rejects an unrelated JSON shape (e.g. a single task object)", () => {
    expect(isValidBackupData({ id: "1", titre: "Test" })).toBe(false);
  });
});

describe("normalizeBackupData", () => {
  it("adds projects referenced by tasks but absent from the projects list", () => {
    const { projects } = normalizeBackupData({
      tasks: [{ titre: "T", projet: "Orphelin" }],
      projects: ["Alpha"],
    });
    expect(projects).toEqual(["Alpha", "Orphelin"]);
  });
  it("deduplicates and drops blank project names", () => {
    const { projects } = normalizeBackupData({
      tasks: [{ titre: "T", projet: "Alpha" }],
      projects: ["Alpha", "  ", "Alpha"],
    });
    expect(projects).toEqual(["Alpha"]);
  });
  it("fills missing fields with safe defaults", () => {
    const { tasks } = normalizeBackupData({
      tasks: [{ titre: "T", projet: "Alpha" }],
      projects: ["Alpha"],
    });
    const task = tasks[0];
    expect(task.id).toEqual(expect.any(String));
    expect(task.type).toBe("standard");
    expect(task.statut).toBe("analyser");
    expect(task.priorite).toBe("moyenne");
    expect(task.description).toBe("");
    expect(task.timeLogs).toEqual([]);
  });
  it("resets unknown statut/priorite instead of crashing later", () => {
    const { tasks } = normalizeBackupData({
      tasks: [{ titre: "T", projet: "Alpha", type: "simple", statut: "nope", priorite: "nope" }],
      projects: [],
    });
    expect(tasks[0].statut).toBe("todo");
    expect(tasks[0].priorite).toBe("moyenne");
  });
  it("keeps valid statut for the task's own status family", () => {
    const { tasks } = normalizeBackupData({
      tasks: [{ titre: "T", projet: "Alpha", statut: "revue", priorite: "haute" }],
      projects: [],
    });
    expect(tasks[0].statut).toBe("revue");
    expect(tasks[0].priorite).toBe("haute");
  });
  it("drops malformed time logs and normalizes valid ones", () => {
    const { tasks } = normalizeBackupData({
      tasks: [{
        titre: "T", projet: "Alpha",
        timeLogs: [{ minutes: 30, note: "ok", date: "2026-07-01" }, { note: "sans durée" }, null],
      }],
      projects: [],
    });
    expect(tasks[0].timeLogs).toHaveLength(1);
    expect(tasks[0].timeLogs[0]).toMatchObject({ minutes: 30, note: "ok", date: "2026-07-01" });
    expect(tasks[0].timeLogs[0].id).toEqual(expect.any(String));
  });
});

describe("buildBackupPayload", () => {
  it("wraps tasks and projects with an ISO export timestamp", () => {
    const tasks = [{ id: "1" }];
    const projects = ["Alpha"];
    const payload = buildBackupPayload(tasks, projects);
    expect(payload.tasks).toBe(tasks);
    expect(payload.projects).toBe(projects);
    expect(() => new Date(payload.exportedAt).toISOString()).not.toThrow();
    expect(new Date(payload.exportedAt).toISOString()).toBe(payload.exportedAt);
  });
});
