// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import {
  CelebrationOverlay,
  MiniCelebration,
  pickCelebration,
  playMiniSound,
  prewarmCelebration,
} from "./celebration.jsx";
import * as audioFx from "./lib/audioFx";

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Celebration Engine (Instant Task Done Optimization)", () => {
  it("picks a valid celebration variant and message", () => {
    const celeb = pickCelebration();
    expect(celeb).toBeDefined();
    expect(typeof celeb.variant).toBe("string");
    expect(typeof celeb.msg).toBe("number");
  });

  it("plays task done sound instantly via playMiniSound", () => {
    const spy = vi.spyOn(audioFx, "playTaskDoneSound").mockImplementation(() => {});
    playMiniSound();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("renders MiniCelebration canvas and triggers playTaskDoneSound on mount", () => {
    const soundSpy = vi.spyOn(audioFx, "playTaskDoneSound").mockImplementation(() => {});
    const onDone = vi.fn();

    const { container } = render(
      <MiniCelebration origin={{ x: 500, y: 300 }} onDone={onDone} />
    );

    expect(soundSpy).toHaveBeenCalledTimes(1);
    expect(container.querySelector("canvas")).toBeTruthy();
    expect(container.querySelector("style")).toBeNull();
  });

  it("renders CelebrationOverlay without inline <style> recalc and supports prewarmCelebration", () => {
    expect(() => prewarmCelebration()).not.toThrow();
    const onDone = vi.fn();
    const { container } = render(
      <CelebrationOverlay
        variant="confetti"
        legendary={false}
        title="All done!"
        subtitle="Great job"
        onDone={onDone}
      />
    );

    expect(container.querySelector("canvas")).toBeTruthy();
    expect(container.querySelector("style")).toBeNull();
    expect(container.textContent).toContain("All done!");
  });
});

