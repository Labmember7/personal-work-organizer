// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useTasks } from "./useTasks";

afterEach(() => localStorage.clear());

describe("useTasks moveTask (conversion de type entre tableaux kanban)", () => {
  it("convertit une tâche standard en simple quand déposée sur un statut du flux simple", async () => {
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.saveTasks([
        { id: "t1", type: "standard", titre: "T1", projet: "Alpha", statut: "analyser" },
      ]);
    });
    act(() => result.current.moveTask("t1", "doing"));

    const t = result.current.tasks.find((x) => x.id === "t1");
    expect(t.type).toBe("simple");
    expect(t.statut).toBe("doing");
  });

  it("convertit une tâche simple en standard quand déposée sur un statut du flux workflow", async () => {
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.saveTasks([
        { id: "t2", type: "simple", titre: "T2", projet: "Alpha", statut: "todo" },
      ]);
    });
    act(() => result.current.moveTask("t2", "valider"));

    const t = result.current.tasks.find((x) => x.id === "t2");
    expect(t.type).toBe("standard");
    expect(t.statut).toBe("valider");
  });

  it("ignore un statut qui n'existe dans aucun des deux flux", async () => {
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.saveTasks([
        { id: "t3", type: "standard", titre: "T3", projet: "Alpha", statut: "analyser" },
      ]);
    });
    act(() => result.current.moveTask("t3", "bogus"));

    const t = result.current.tasks.find((x) => x.id === "t3");
    expect(t.type).toBe("standard");
    expect(t.statut).toBe("analyser");
  });
});
