// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { DesktopPetWindow } from "./DesktopPetWindow.jsx";
import { desktopPet } from "../../services/desktopPet";

vi.mock("../../services/desktopPet", () => {
  let stateListener = null;
  return {
    desktopPet: {
      onState: vi.fn((cb) => {
        stateListener = cb;
        return () => { stateListener = null; };
      }),
      notifyReady: vi.fn(),
      restoreMain: vi.fn(),
      sendAction: vi.fn(),
      startNativeDrag: vi.fn(() => false),
      moveBy: vi.fn(),
      __triggerState: (st) => stateListener?.(st),
    },
    isPetWindow: () => true,
  };
});

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    imageSmoothingEnabled: false,
  }));
});

afterEach(() => {
  cleanup();
});

describe("DesktopPetWindow", () => {
  it("renders pet window and listens to state changes", () => {
    render(<DesktopPetWindow />);
    expect(desktopPet.notifyReady).toHaveBeenCalled();

    act(() => {
      desktopPet.__triggerState({
        theme: "dark",
        mood: "focused",
        focus: { title: "Test Focus Task", project: "Project Alpha" },
        focusStartedAt: Date.now() - 30000,
        pomo: {
          phase: "focus",
          timeLeft: 1450,
          total: 1500,
          isRunning: true,
          endsAt: Date.now() + 1450000,
        },
      });
    });

    expect(screen.getByText(">_ Test Focus Task")).toBeTruthy();
  });

  it("triggers restoreMain when clicking restore button or double-clicking avatar", () => {
    render(<DesktopPetWindow />);

    act(() => {
      desktopPet.__triggerState({
        theme: "dark",
        mood: "normal",
        focus: { title: "Review PR", project: "Frontend" },
      });
    });

    const restoreBtn = screen.getByLabelText("Agrandir la fenêtre principale");
    fireEvent.click(restoreBtn);
    expect(desktopPet.restoreMain).toHaveBeenCalledTimes(1);

    const avatar = screen.getByRole("button", { name: /Double-clic/i });
    fireEvent.doubleClick(avatar);
    expect(desktopPet.restoreMain).toHaveBeenCalledTimes(2);
  });

  it("reduces the thought cloud on reduce button click and re-shows on pet avatar click", () => {
    render(<DesktopPetWindow />);

    act(() => {
      desktopPet.__triggerState({
        theme: "dark",
        mood: "normal",
        focus: { title: "Review PR", project: "Frontend" },
      });
    });

    // La bulle est initialement présente
    expect(screen.getByText(">_ Review PR")).toBeTruthy();

    // Clic sur le bouton de réduction
    const reduceBtn = screen.getByLabelText("Réduire la pensée");
    fireEvent.click(reduceBtn);

    // La pensée est maintenant masquée (réduite)
    expect(screen.queryByText(">_ Review PR")).toBeNull();

    // Clic sur l'avatar du pet pour la réafficher
    const avatar = screen.getByRole("button", { name: /Double-clic/i });
    fireEvent.click(avatar);

    // La bulle est de nouveau visible !
    expect(screen.getByText(">_ Review PR")).toBeTruthy();
  });

  it("drags the window when dragging from the pet avatar body and suppresses click after drag", () => {
    render(<DesktopPetWindow />);

    act(() => {
      desktopPet.__triggerState({
        theme: "dark",
        mood: "normal",
        focus: { title: "Review PR", project: "Frontend" },
      });
    });

    const avatar = screen.getByRole("button", { name: /Double-clic/i });

    // Clic enfoncé sur l'avatar du pet
    fireEvent.mouseDown(avatar, { button: 0, screenX: 100, screenY: 100 });

    // Mouvement de la souris > 4px déclenche le drag
    fireEvent.mouseMove(window, { screenX: 125, screenY: 140 });
    expect(desktopPet.moveBy).toHaveBeenCalledWith(25, 40);

    // Mouvement continu
    fireEvent.mouseMove(window, { screenX: 130, screenY: 145 });
    expect(desktopPet.moveBy).toHaveBeenCalledWith(5, 5);

    // Relâchement de la souris
    fireEvent.mouseUp(window, { screenX: 130, screenY: 145 });

    // Le clic suivant (émis par le navigateur à la fin d'un drag) est supprimé
    fireEvent.click(avatar);

    // La bulle de pensée n'a PAS été basculée par erreur
    expect(screen.getByText(">_ Review PR")).toBeTruthy();
  });

  it("suppresses avatar clicks when mouse click is held (>= 220ms)", () => {
    render(<DesktopPetWindow />);

    act(() => {
      desktopPet.__triggerState({
        theme: "dark",
        mood: "normal",
        focus: { title: "Review PR", project: "Frontend" },
      });
    });

    const avatar = screen.getByRole("button", { name: /Double-clic/i });

    // Simule un clic maintenu (held mouse click)
    const originalNow = performance.now;
    let fakeTime = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => fakeTime);

    // MouseDown à t=1000
    fireEvent.mouseDown(avatar, { button: 0, screenX: 100, screenY: 100 });

    // 300ms s'écoulent sans bouger la souris (held click)
    fakeTime = 1350;

    // MouseUp à t=1350 (durée = 350ms >= 220ms)
    fireEvent.mouseUp(window, { screenX: 100, screenY: 100 });

    // Le navigateur émet le clic
    fakeTime = 1355;
    fireEvent.click(avatar);

    // La bulle est TOUJOURS visible (le clic maintenu n'a pas basculé l'état)
    expect(screen.getByText(">_ Review PR")).toBeTruthy();

    performance.now = originalNow;
  });

  it("executes avatar click when mouse click is instant (< 220ms)", () => {
    render(<DesktopPetWindow />);

    act(() => {
      desktopPet.__triggerState({
        theme: "dark",
        mood: "normal",
        focus: { title: "Review PR", project: "Frontend" },
      });
    });

    const avatar = screen.getByRole("button", { name: /Double-clic/i });

    const originalNow = performance.now;
    let fakeTime = 2000;
    vi.spyOn(performance, "now").mockImplementation(() => fakeTime);

    // MouseDown à t=2000
    fireEvent.mouseDown(avatar, { button: 0, screenX: 100, screenY: 100 });

    // 80ms s'écoulent (clic rapide/instantané)
    fakeTime = 2080;
    fireEvent.mouseUp(window, { screenX: 100, screenY: 100 });

    fakeTime = 2082;
    fireEvent.click(avatar);

    // Le clic instantané a basculé et masqué la bulle
    expect(screen.queryByText(">_ Review PR")).toBeNull();

    performance.now = originalNow;
  });

  it("toggles thought cloud with keyboard Enter/Space for accessibility", () => {
    render(<DesktopPetWindow />);

    act(() => {
      desktopPet.__triggerState({
        theme: "dark",
        mood: "normal",
        focus: { title: "Review PR", project: "Frontend" },
      });
    });

    const avatar = screen.getByRole("button", { name: /Double-clic/i });
    expect(screen.getByText(">_ Review PR")).toBeTruthy();

    fireEvent.keyDown(avatar, { key: "Enter" });
    expect(screen.queryByText(">_ Review PR")).toBeNull();

    fireEvent.keyDown(avatar, { key: " " });
    expect(screen.getByText(">_ Review PR")).toBeTruthy();
  });

  it("sends dismiss action when clicking close button and togglePomo when clicking play/pause", () => {
    render(<DesktopPetWindow />);

    act(() => {
      desktopPet.__triggerState({
        theme: "dark",
        mood: "focused",
        focus: { title: "Review PR", project: "Frontend" },
        pomo: {
          phase: "focus",
          timeLeft: 1200,
          total: 1500,
          isRunning: true,
          endsAt: Date.now() + 1200000,
        },
      });
    });

    const closeBtn = screen.getByLabelText("Fermer le compagnon");
    fireEvent.click(closeBtn);
    expect(desktopPet.sendAction).toHaveBeenCalledWith({ type: "dismiss" });

    const pomoToggleBtn = screen.getByLabelText("Pause Pomodoro");
    fireEvent.click(pomoToggleBtn);
    expect(desktopPet.sendAction).toHaveBeenCalledWith({ type: "togglePomo" });
  });
});

