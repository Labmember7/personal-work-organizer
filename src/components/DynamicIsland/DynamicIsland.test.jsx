// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../../i18n/index";
import { DynamicIsland } from "./DynamicIsland.jsx";

beforeEach(() => {
  vi.useFakeTimers();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    imageSmoothingEnabled: false,
  }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderIsland(props = {}) {
  return render(
    <LanguageProvider>
      <DynamicIsland focusSession={{}} {...props} />
    </LanguageProvider>
  );
}

describe("DynamicIsland", () => {
  it("renders compact view with digital clock, Nova center bot, and debug button by default", () => {
    const { container } = renderIsland();
    expect(container.querySelector(".trk-clean-flip-clock")).toBeTruthy();
    expect(container.querySelector(".trk-island-center-bot")).toBeTruthy();
    expect(container.querySelector(".trk-island-compact-debug")).toBeTruthy();
  });

  it("opens Pomodoro Timer modal when clicking Timer in expanded mode and persists timer in background when closed", () => {
    const { container } = renderIsland();

    // Click clock to open island
    const clockTrigger = container.querySelector(".trk-island-triad-left");
    fireEvent.click(clockTrigger);

    // Switch to Focus & Rest subtab
    const pomoSubtab = screen.getByText("Focus & Rest");
    fireEvent.click(pomoSubtab);

    // Start the Pomodoro timer
    const startBtn = screen.getByText("Start Focus");
    fireEvent.click(startBtn);

    // Advance 5 seconds while open
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getAllByText("24:55").length).toBeGreaterThan(0);

    // Collapse the island
    const closeBtn = screen.getByLabelText("Collapse Island");
    fireEvent.click(closeBtn);

    // Advance 10 more seconds in the background while collapsed
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    // Verify the live Pomodoro pill is displayed in the compact Dynamic Island with 24:45
    const pomoPill = container.querySelector(".trk-island-pomo-pill");
    expect(pomoPill).toBeTruthy();
    expect(pomoPill.textContent).toContain("24:45");
  });

  it("displays both Pomodoro timer and Focus task live pills without overlap when both are active", () => {
    const focusTask = {
      id: "t1",
      titre: "Architecture Review",
      projet: "Core",
      priorite: "haute",
      timeLogs: [],
    };
    const { container } = renderIsland({
      focusSession: {
        focusTask,
        focusStartedAt: Date.now() - 65000,
      },
    });

    // Open island via focus pill
    const focusPill = container.querySelector(".trk-island-focus-pill");
    expect(focusPill).toBeTruthy();
    fireEvent.click(focusPill);

    // Switch to Timer tab and start Pomodoro
    const timerTab = screen.getByRole("tab", { name: /Timer/i });
    fireEvent.click(timerTab);
    fireEvent.click(screen.getByText("Focus & Rest"));
    fireEvent.click(screen.getByText("Start Focus"));

    // Close island
    fireEvent.click(screen.getByLabelText("Collapse Island"));

    // Both pills should be rendered in compact triad right
    expect(container.querySelector(".trk-island-pomo-pill")).toBeTruthy();
    expect(container.querySelector(".trk-island-focus-pill")).toBeTruthy();
    expect(container.querySelector(".trk-dynamic-island.is-dual-live")).toBeTruthy();
  });

  it("preserves spatial layout and play/pause controls on hover without teleporting timer to left", () => {
    const focusTask = {
      id: "t1",
      titre: "Architecture Review",
      projet: "Core",
      priorite: "haute",
      timeLogs: [],
    };
    const { container } = renderIsland({
      focusSession: {
        focusTask,
        focusStartedAt: Date.now() - 65000,
      },
    });

    // Start pomodoro
    const focusPill = container.querySelector(".trk-island-focus-pill");
    fireEvent.click(focusPill);
    const timerTab = screen.getByRole("tab", { name: /Timer/i });
    fireEvent.click(timerTab);
    fireEvent.click(screen.getByText("Focus & Rest"));
    fireEvent.click(screen.getByText("Start Focus"));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    fireEvent.click(screen.getByLabelText("Collapse Island"));

    // Check pre-hover state
    const island = container.querySelector(".trk-dynamic-island");
    expect(island.querySelector(".trk-island-triad-right .trk-island-pomo-pill")).toBeTruthy();
    expect(island.querySelector(".trk-island-triad-left .trk-clean-flip-clock")).toBeTruthy();

    // Trigger hover on island
    fireEvent.mouseEnter(island);
    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Verify hovered class is applied
    expect(island.classList.contains("hovered")).toBe(true);

    // Verify Pomodoro pill remains strictly on the right (NOT in triad-left)
    const rightPomoPill = island.querySelector(".trk-island-triad-right .trk-island-pomo-pill");
    expect(rightPomoPill).toBeTruthy();
    expect(island.querySelector(".trk-island-triad-left .trk-island-pomo-pill")).toBeNull();

    // Verify play/pause mini toggle is still present on hover
    const pauseBtn = rightPomoPill.querySelector(".trk-island-pomo-mini-toggle");
    expect(pauseBtn).toBeTruthy();

    // Verify clicking pause works directly while hovered
    fireEvent.click(pauseBtn);
    const updatedPomoPill = island.querySelector(".trk-island-triad-right .trk-island-pomo-pill");
    expect(updatedPomoPill.classList.contains("paused")).toBe(true);

    // Verify task title is visible on hover
    expect(island.querySelector(".trk-island-compact-title").textContent).toBe("Architecture Review");
  });

  it("renders uniquely generated pet with custom DNA and supports DNA re-rolling", () => {
    localStorage.clear();
    const { container } = renderIsland();

    // Click center bot to open pet deck
    const bot = container.querySelector(".trk-island-center-bot");
    expect(bot).toBeTruthy();
    fireEvent.click(bot.querySelector(".trk-pixel-helper-pod"));

    // Verify modal opened in pet mode
    expect(container.querySelector(".trk-island-pet-deck")).toBeTruthy();

    // Check that title has custom generated pet name and archetype
    const titleEl = container.querySelector(".trk-island-pet-hero-title h3");
    expect(titleEl).toBeTruthy();
    const initialName = titleEl.textContent;
    expect(initialName.length).toBeGreaterThan(0);

    const subtitleEl = container.querySelector(".trk-island-pet-subtitle");
    expect(subtitleEl).toBeTruthy();
    expect(subtitleEl.textContent.length).toBeGreaterThan(0);

    // Verify Palette telemetry
    expect(container.textContent).toContain("Palette");

    // Click Re-roll DNA button
    const rerollBtn = screen.getByTitle("Synthesize new unique companion DNA & traits");
    expect(rerollBtn).toBeTruthy();
    fireEvent.click(rerollBtn);

    // Verify new pet is generated and persisted in localStorage
    const storedDna = JSON.parse(localStorage.getItem("suivi_travaux_pet_dna"));
    expect(storedDna).toBeDefined();
    expect(typeof storedDna.name).toBe("string");
  });
});
