import { describe, it, expect } from "vitest";
import {
  statusOf, prioOf, taskMinutes, formatDuration,
  parseDurationInput, projectColor, STATUSES, PRIORITIES,
  isValidBackupData, buildBackupPayload, taskMatchesQuery,
} from "./utils";

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
  it("accepts non-empty arrays", () => {
    expect(isValidBackupData({ tasks: [{ id: "1" }], projects: ["Alpha"] })).toBe(true);
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
