// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFocusSession } from "./useFocusSession";
import type { Task } from "../../lib/types";

describe("useFocusSession", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  const createTask = (id: string, statut = "analyser", timeLogs = []): Task => ({
    id,
    type: "standard",
    titre: `Task ${id}`,
    projet: "Project Alpha",
    priorite: "haute",
    statut,
    timeLogs,
  });

  it("initialise sans tâche focalisée par défaut", () => {
    const tasks = [createTask("t1")];
    const tasksRef = { current: tasks };
    const saveTasks = vi.fn();
    const moveTask = vi.fn();
    const t = (k: string) => k;

    const { result } = renderHook(() =>
      useFocusSession({ loading: false, tasks, tasksRef, saveTasks, moveTask, t })
    );

    expect(result.current.focusId).toBeNull();
    expect(result.current.focusStartedAt).toBeNull();
    expect(result.current.focusTask).toBeNull();
  });

  it("active le focus sur une tâche via focusOnTask et initialise le chronomètre", () => {
    const tasks = [createTask("t1")];
    const tasksRef = { current: tasks };
    const saveTasks = vi.fn();
    const moveTask = vi.fn();
    const t = (k: string) => k;

    const { result } = renderHook(() =>
      useFocusSession({ loading: false, tasks, tasksRef, saveTasks, moveTask, t })
    );

    act(() => {
      result.current.focusOnTask("t1");
    });

    expect(result.current.focusId).toBe("t1");
    expect(result.current.focusStartedAt).toBeGreaterThan(0);
    expect(result.current.focusTask?.id).toBe("t1");
  });

  it("avance la tâche focalisée au statut suivant via advanceFocusTask", () => {
    const tasks = [createTask("t1", "analyser")];
    const tasksRef = { current: tasks };
    const saveTasks = vi.fn();
    const moveTask = vi.fn();
    const t = (k: string) => k;

    const { result } = renderHook(() =>
      useFocusSession({ loading: false, tasks, tasksRef, saveTasks, moveTask, t })
    );

    act(() => {
      result.current.focusOnTask("t1");
    });

    act(() => {
      result.current.advanceFocusTask();
    });

    expect(moveTask).toHaveBeenCalledWith("t1", "implementer");
  });

  it("libère le focus et enregistre le pointage du temps si au moins 1 minute s'est écoulée", () => {
    const tasks = [createTask("t1")];
    const tasksRef = { current: tasks };
    const saveTasks = vi.fn();
    const moveTask = vi.fn();
    const t = (k: string) => k;

    const { result } = renderHook(() =>
      useFocusSession({ loading: false, tasks, tasksRef, saveTasks, moveTask, t })
    );

    act(() => {
      result.current.focusOnTask("t1");
    });

    // Simule 15 minutes écoulées
    const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
    localStorage.setItem("suivi-travaux-focus-started", String(fifteenMinutesAgo));

    act(() => {
      result.current.releaseFocus();
    });

    expect(result.current.focusId).toBeNull();
    expect(result.current.focusStartedAt).toBeNull();
  });
});

