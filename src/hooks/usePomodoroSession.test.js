// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePomodoroSession } from "./usePomodoroSession";
import { PRESETS } from "../components/DynamicIsland/PomodoroTimer.jsx";

describe("usePomodoroSession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initializes with default 25/5 preset and focus phase", () => {
    const { result } = renderHook(() => usePomodoroSession());
    expect(result.current.preset.id).toBe("25-5");
    expect(result.current.phase).toBe("focus");
    expect(result.current.timeLeft).toBe(25 * 60);
    expect(result.current.timeFormatted).toBe("25:00");
    expect(result.current.isRunning).toBe(false);
  });

  it("decrements time when running and transitions phases", () => {
    const onMoodChange = vi.fn();
    const { result } = renderHook(() => usePomodoroSession({ onMoodChange }));

    act(() => {
      result.current.togglePlay();
    });
    expect(result.current.isRunning).toBe(true);

    // Advance 10 seconds
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(result.current.timeLeft).toBe(25 * 60 - 10);
    expect(result.current.timeFormatted).toBe("24:50");

    // Advance until end of focus phase
    act(() => {
      vi.advanceTimersByTime((25 * 60 - 10) * 1000);
    });

    expect(result.current.phase).toBe("rest");
    expect(result.current.timeLeft).toBe(5 * 60);
    expect(onMoodChange).toHaveBeenCalledWith("happy");
  });

  it("allows selecting preset, skipping phase, and resetting", () => {
    const { result } = renderHook(() => usePomodoroSession());

    act(() => {
      result.current.selectPreset(PRESETS[1]); // 50/10
    });
    expect(result.current.preset.id).toBe("50-10");
    expect(result.current.timeLeft).toBe(50 * 60);

    act(() => {
      result.current.skipPhase();
    });
    expect(result.current.phase).toBe("rest");
    expect(result.current.timeLeft).toBe(10 * 60);

    act(() => {
      result.current.reset();
    });
    expect(result.current.phase).toBe("focus");
    expect(result.current.timeLeft).toBe(50 * 60);
    expect(result.current.isRunning).toBe(false);
  });
});

