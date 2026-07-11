import { describe, it, expect } from "vitest";
import {
  statusOf, prioOf, taskMinutes, formatDuration,
  parseDurationInput, projectColor, STATUSES, PRIORITIES,
} from "./utils";

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
