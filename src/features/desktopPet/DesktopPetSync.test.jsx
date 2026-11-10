// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { DesktopPetSync } from "./DesktopPetSync.jsx";
import { desktopPet } from "../../services/desktopPet";

vi.mock("../../services/desktopPet", () => {
  let minListener = null;
  let actionListener = null;
  return {
    desktopPetSupported: () => true,
    desktopPet: {
      show: vi.fn(),
      hide: vi.fn(),
      sendState: vi.fn(),
      onMainMinimizedChanged: vi.fn((cb) => {
        minListener = cb;
        return () => { minListener = null; };
      }),
      onReady: vi.fn(() => () => {}),
      onAction: vi.fn((cb) => {
        actionListener = cb;
        return () => { actionListener = null; };
      }),
      __triggerMinimized: (val) => minListener?.(val),
      __triggerAction: (act) => actionListener?.(act),
    },
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DesktopPetSync", () => {
  it("shows pet window when main window is minimized and a task is in focus", () => {
    const focusTask = { id: "1", titre: "Focusing", projet: "Core" };
    const pomodoro = { isPomoActive: false, isRunning: false };

    render(
      <DesktopPetSync
        focusTask={focusTask}
        focusStartedAt={Date.now()}
        pomodoro={pomodoro}
        petDna={{}}
        theme="dark"
      />
    );

    // Initialement non minimisé -> pet caché
    expect(desktopPet.show).not.toHaveBeenCalled();

    // Minimise la fenêtre principale
    act(() => {
      desktopPet.__triggerMinimized(true);
    });

    expect(desktopPet.show).toHaveBeenCalled();
    expect(desktopPet.sendState).toHaveBeenCalledWith(
      expect.objectContaining({
        focus: { title: "Focusing", project: "Core" },
      })
    );
  });

  it("hides pet window when main window is restored", () => {
    const focusTask = { id: "1", titre: "Focusing", projet: "Core" };
    const pomodoro = { isPomoActive: false, isRunning: false };

    render(
      <DesktopPetSync
        focusTask={focusTask}
        focusStartedAt={Date.now()}
        pomodoro={pomodoro}
        petDna={{}}
        theme="dark"
      />
    );

    act(() => {
      desktopPet.__triggerMinimized(true);
    });
    expect(desktopPet.show).toHaveBeenCalled();

    act(() => {
      desktopPet.__triggerMinimized(false);
    });
    expect(desktopPet.hide).toHaveBeenCalled();
  });

  it("does not show pet window when enabled is false", () => {
    const focusTask = { id: "1", titre: "Focusing", projet: "Core" };
    const pomodoro = { isPomoActive: false, isRunning: false };

    render(
      <DesktopPetSync
        enabled={false}
        focusTask={focusTask}
        focusStartedAt={Date.now()}
        pomodoro={pomodoro}
        petDna={{}}
        theme="dark"
      />
    );

    act(() => {
      desktopPet.__triggerMinimized(true);
    });
    expect(desktopPet.show).not.toHaveBeenCalled();
  });

  it("reappears when dismissed, normal window restored, and then minimized again", () => {
    const focusTask = { id: "1", titre: "Focusing", projet: "Core" };
    const pomodoro = { isPomoActive: false, isRunning: false };

    render(
      <DesktopPetSync
        enabled={true}
        focusTask={focusTask}
        focusStartedAt={Date.now()}
        pomodoro={pomodoro}
        petDna={{}}
        theme="dark"
      />
    );

    // 1. Première minimisation -> pet affiché
    act(() => {
      desktopPet.__triggerMinimized(true);
    });
    expect(desktopPet.show).toHaveBeenCalledTimes(1);

    // 2. L'utilisateur ferme la fenêtre flottante du pet (action: dismiss)
    act(() => {
      desktopPet.__triggerAction({ type: "dismiss" });
    });
    expect(desktopPet.hide).toHaveBeenCalled();

    // 3. L'utilisateur rouvre la fenêtre normale de l'application
    act(() => {
      desktopPet.__triggerMinimized(false);
    });

    // 4. L'utilisateur minimise à nouveau la fenêtre normale
    act(() => {
      desktopPet.__triggerMinimized(true);
    });

    // Le pet réapparaît correctement !
    expect(desktopPet.show).toHaveBeenCalledTimes(2);
  });
});

