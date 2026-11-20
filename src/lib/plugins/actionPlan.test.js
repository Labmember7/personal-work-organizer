import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  addWorkHours,
  computeSchedule,
  formatDuration,
  parseDurationHours,
  toIsoDate,
  toMermaidGantt,
} from "../../../plugins/action-plan/engine/schedule.js";
import { computeMindmapLayout } from "../../../plugins/action-plan/engine/layout.js";
import { parseManifestV2 } from "./manifest2";

describe("Action Plan — Duration parsing & formatting", () => {
  it("parses minutes, hours, days, weeks, and compound durations", () => {
    expect(parseDurationHours("30m", 8)).toBe(0.5);
    expect(parseDurationHours("45min", 8)).toBe(0.75);
    expect(parseDurationHours("2.5h", 8)).toBe(2.5);
    expect(parseDurationHours("1.5d", 8)).toBe(12);
    expect(parseDurationHours("2j", 8)).toBe(16);
    expect(parseDurationHours("1w", 8)).toBe(40);
    expect(parseDurationHours("1d 4h", 8)).toBe(12);
    expect(parseDurationHours("6", 8)).toBe(6);
    expect(parseDurationHours("invalid", 8)).toBeNull();
  });

  it("formats hours cleanly in EN and FR", () => {
    expect(formatDuration(0, 8, "en")).toBe("0h");
    expect(formatDuration(0.5, 8, "en")).toBe("30m");
    expect(formatDuration(0.5, 8, "fr")).toBe("30min");
    expect(formatDuration(4, 8, "en")).toBe("4h");
    expect(formatDuration(8, 8, "en")).toBe("1d");
    expect(formatDuration(8, 8, "fr")).toBe("1j");
    expect(formatDuration(12, 8, "en")).toBe("1.5d");
  });
});

describe("Action Plan — Work Calendar Math", () => {
  it("skips weekends when advancing work hours", () => {
    // 2026-11-20 is a Friday
    const fri = addWorkHours("2026-11-20", 8, { hoursPerDay: 8, skipWeekends: true });
    expect(toIsoDate(fri)).toBe("2026-11-23"); // Monday
  });

  it("includes weekends when skipWeekends is false", () => {
    const sat = addWorkHours("2026-11-20", 8, { hoursPerDay: 8, skipWeekends: false });
    expect(toIsoDate(sat)).toBe("2026-11-21"); // Saturday
  });
});

describe("Action Plan — CPM Scheduling Engine", () => {
  it("computes ES, EF, LS, LF, slack, and Critical Path accurately", () => {
    const plan = {
      id: "root",
      label: "Release",
      startDate: "2026-11-23",
      hoursPerDay: 8,
      skipWeekends: true,
      children: [
        {
          id: "p1",
          label: "Phase 1",
          color: "#35A7A0",
          children: [
            { id: "a", label: "Spec", estHours: 4, stat: "done", deps: [], children: [] },
            { id: "b", label: "Backend", estHours: 12, stat: "doing", deps: [{ id: "a", type: "FS", lag: 0 }], children: [] },
            { id: "c", label: "Docs", estHours: 4, stat: "todo", deps: [{ id: "a", type: "FS", lag: 0 }], children: [] },
            { id: "d", label: "Deploy", estHours: 4, stat: "todo", deps: [{ id: "b", type: "FS", lag: 2 }, { id: "c", type: "FS", lag: 0 }], children: [] },
          ],
        },
      ],
    };

    const sched = computeSchedule(plan);
    expect(sched.cycleIds).toHaveLength(0);
    // Critical path: a (0..4) -> b (4..16) + 2h lag -> d (18..22)
    expect(sched.projectSpan).toBe(22);
    expect(sched.totalEffort).toBe(24);

    const ia = sched.items.get("a");
    const ib = sched.items.get("b");
    const ic = sched.items.get("c");
    const id = sched.items.get("d");

    expect(ia.es).toBe(0);
    expect(ia.ef).toBe(4);
    expect(ia.isCritical).toBe(true);

    expect(ib.es).toBe(4);
    expect(ib.ef).toBe(16);
    expect(ib.isCritical).toBe(true);

    expect(ic.es).toBe(4);
    expect(ic.ef).toBe(8);
    expect(ic.slack).toBe(10);
    expect(ic.isCritical).toBe(false);

    expect(id.es).toBe(18);
    expect(id.ef).toBe(22);
    expect(id.isCritical).toBe(true);
    expect(sched.progress).toBe(25);
  });

  it("supports SS and FF dependencies as well as autoSequence phases", () => {
    const plan = {
      id: "root",
      label: "Seq Test",
      startDate: "2026-11-23",
      hoursPerDay: 8,
      children: [
        {
          id: "p1",
          label: "Auto Seq",
          autoSequence: true,
          children: [
            { id: "s1", label: "Step 1", estHours: 4, deps: [], children: [] },
            { id: "s2", label: "Step 2", estHours: 6, deps: [], children: [] },
          ],
        },
        {
          id: "p2",
          label: "Parallel SS",
          autoSequence: false,
          children: [
            { id: "s3", label: "Overlap", estHours: 4, deps: [{ id: "s2", type: "SS", lag: 2 }], children: [] },
          ],
        },
      ],
    };

    const sched = computeSchedule(plan);
    expect(sched.items.get("s1").ef).toBe(4);
    expect(sched.items.get("s2").es).toBe(4);
    expect(sched.items.get("s2").ef).toBe(10);
    expect(sched.items.get("s3").es).toBe(6);
    expect(sched.items.get("s3").ef).toBe(10);
  });

  it("detects circular dependencies safely without infinite recursion", () => {
    const plan = {
      id: "root",
      label: "Cycle",
      children: [
        {
          id: "p1",
          label: "Phase",
          children: [
            { id: "x", label: "X", estHours: 4, deps: [{ id: "y", type: "FS", lag: 0 }], children: [] },
            { id: "y", label: "Y", estHours: 4, deps: [{ id: "x", type: "FS", lag: 0 }], children: [] },
          ],
        },
      ],
    };
    const sched = computeSchedule(plan);
    expect(sched.cycleIds).toEqual(expect.arrayContaining(["x", "y"]));
    expect(sched.items.get("x").inCycle).toBe(true);
  });

  it("handles empty plans gracefully", () => {
    const sched = computeSchedule({ id: "root", label: "Empty", children: [] });
    expect(sched.actionCount).toBe(0);
    expect(sched.projectSpan).toBe(0);
    expect(sched.progress).toBe(0);
  });

  it("exports valid Mermaid Gantt syntax", () => {
    const plan = {
      id: "root",
      label: "Launch Plan",
      startDate: "2026-11-23",
      hoursPerDay: 8,
      skipWeekends: true,
      children: [
        {
          id: "p1",
          label: "Build",
          children: [
            { id: "a1", label: "Core", estHours: 8, stat: "done", deps: [], children: [] },
          ],
        },
      ],
    };
    const sched = computeSchedule(plan);
    const mmd = toMermaidGantt(plan, sched);
    expect(mmd).toContain("gantt");
    expect(mmd).toContain("title Launch Plan");
    expect(mmd).toContain("excludes weekends");
    expect(mmd).toContain("section Build");
    expect(mmd).toContain("Core :done, crit, a1, 2026-11-23, 1d");
  });
});

describe("Action Plan — Mindmap Layout & Manifest V2", () => {
  it("computes positions for balanced and rightward layouts and respects folded nodes", () => {
    const plan = {
      id: "root",
      label: "Root",
      children: [
        { id: "pL", label: "Left", side: "L", children: [{ id: "aL", label: "A", children: [] }] },
        { id: "pR", label: "Right", side: "R", children: [{ id: "aR", label: "B", children: [] }] },
      ],
    };
    const bal = computeMindmapLayout(plan, { mode: "balanced" });
    expect(bal.positions.get("pL").x).toBeLessThan(bal.positions.get("root").x);
    expect(bal.positions.get("pR").x).toBeGreaterThan(bal.positions.get("root").x);

    const folded = computeMindmapLayout(plan, { mode: "right", folded: new Set(["pR"]) });
    expect(folded.positions.has("aR")).toBe(false);
    expect(folded.positions.get("pL").x).toBeGreaterThan(folded.positions.get("root").x);
  });

  it("has a valid trk.extension/2 manifest.json", () => {
    const raw = readFileSync(resolve(process.cwd(), "plugins/action-plan/manifest.json"), "utf-8");
    const res = parseManifestV2(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.manifest.id).toBe("action-plan");
      expect(res.manifest.contributes?.views?.[0]?.kind).toBe("app");
    }
  });
});
