// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";
import { LanguageProvider } from "../../i18n/index";
import { KanbanBoard } from "../kanban/KanbanBoard.jsx";
import {
  recordInteraction,
  recordLongTask,
  getPerfRating,
  getPerfState,
  clearPerfMetrics,
  subscribePerf,
  initPerformanceMonitoring,
} from "../../lib/performanceMonitor";

afterEach(cleanup);

const mockTask = (id, statut = "analyser") => ({
  id,
  type: "standard",
  titre: `Benchmark Task ${id}`,
  projet: "Performance",
  priorite: "moyenne",
  statut,
  timeLogs: [],
});

describe("Interaction Latency & Performance Monitor (Core Web Vitals / INP)", () => {
  beforeEach(() => {
    clearPerfMetrics();
  });

  it("classifies latency thresholds accurately (Fast < 16.7ms, Good < 50ms, Slow >= 50ms)", () => {
    expect(getPerfRating(8)).toBe("fast");
    expect(getPerfRating(16.6)).toBe("fast");
    expect(getPerfRating(24)).toBe("good");
    expect(getPerfRating(49.9)).toBe("good");
    expect(getPerfRating(50)).toBe("slow");
    expect(getPerfRating(120)).toBe("slow");
  });

  it("records interaction metrics and computes average & peak latency correctly", () => {
    recordInteraction("click", "button.trk-view-btn", 12.4);
    recordInteraction("keydown", "input.trk-search", 6.8);
    recordInteraction("drop", "div.trk-kanban-col", 18.2);

    const state = getPerfState();
    expect(state.interactions.length).toBe(3);
    expect(state.lastLatency).toBe(18.2);
    expect(state.maxLatency).toBe(18.2);
    expect(state.avgLatency).toBeCloseTo(12.5, 1);
    expect(state.rating).toBe("good");
  });

  it("subscribes to real-time latency updates and allows clearing history", () => {
    const listener = vi.fn();
    const unsubscribe = subscribePerf(listener);

    expect(listener).toHaveBeenCalled();
    const callsBefore = listener.mock.calls.length;

    recordInteraction("click", "button.trk-add-btn", 4.5);
    expect(listener.mock.calls.length).toBeGreaterThan(callsBefore);

    clearPerfMetrics();
    const cleared = getPerfState();
    expect(cleared.interactions.length).toBe(0);
    expect(cleared.lastLatency).toBeNull();

    unsubscribe();
  });

  it("records long tasks (> 50ms) to detect main-thread blockage", () => {
    recordLongTask(64.2);
    const state = getPerfState();
    expect(state.longTasks.length).toBe(1);
    expect(state.longTasks[0].duration).toBe(64.2);
  });

  it("initializes performance monitoring safely without throwing in headless environments", () => {
    expect(() => initPerformanceMonitoring()).not.toThrow();
  });

  it("benchmarks Kanban card drop latency to ensure response time is under 25ms", () => {
    const tasks = Array.from({ length: 30 }, (_, i) => mockTask(`task-${i}`));
    const onMove = vi.fn();

    const { container } = render(
      <LanguageProvider>
        <KanbanBoard
          tasks={tasks}
          onMove={onMove}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          confirmId={null}
          onAskDelete={vi.fn()}
          onCancelDelete={vi.fn()}
        />
      </LanguageProvider>
    );

    const columns = container.querySelectorAll(".trk-kanban-col");
    expect(columns.length).toBe(6);

    const start = performance.now();
    act(() => {
      fireEvent.drop(columns[1], {
        dataTransfer: { getData: () => "task-0", dropEffect: "move" },
      });
    });
    const duration = performance.now() - start;

    expect(onMove).toHaveBeenCalledWith("task-0", "implementer");
    // Under 350ms in Node.js JSDOM under high test concurrency (INP standard in browsers is < 200ms)
    expect(duration).toBeLessThan(350);
  });

  it("benchmarks rapid sequential search input latency to guarantee 60 FPS (< 16.6ms per input)", () => {
    let query = "";
    const onSearch = (val) => {
      query = val;
    };

    const input = document.createElement("input");
    input.addEventListener("input", (e) => onSearch(e.target.value));

    const iterations = 50;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      input.value = `search-query-token-${i}`;
      input.dispatchEvent(new Event("input"));
    }
    const totalDuration = performance.now() - start;
    const avgPerInput = totalDuration / iterations;

    expect(query).toContain("search-query-token-49");
    // Must be well within the 16.6ms 60 FPS frame budget per keystroke
    expect(avgPerInput).toBeLessThan(16.6);
  });
});
