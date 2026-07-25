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

describe("useTasks archiveTask/unarchiveTask", () => {
  it("marque une tâche comme archivée sans la supprimer", async () => {
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.saveTasks([
        { id: "t1", titre: "T1", projet: "Alpha", statut: "analyser" },
      ]);
    });
    act(() => result.current.archiveTask("t1"));

    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].archived).toBe(true);
  });

  it("restaure une tâche archivée avec unarchiveTask", async () => {
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.saveTasks([
        { id: "t1", titre: "T1", projet: "Alpha", statut: "analyser", archived: true },
      ]);
    });
    act(() => result.current.unarchiveTask("t1"));

    expect(result.current.tasks[0].archived).toBe(false);
  });

  it("l'archivage peut être annulé avec undo", async () => {
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.saveTasks([
        { id: "t1", titre: "T1", projet: "Alpha", statut: "analyser" },
      ]);
    });
    act(() => result.current.archiveTask("t1"));
    expect(result.current.tasks[0].archived).toBe(true);

    act(() => result.current.undo());
    expect(result.current.tasks[0].archived).toBeFalsy();
  });
});

describe("useTasks undo/redo", () => {
  it("restaure l'état précédent puis peut le rétablir", async () => {
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.saveTasks([{ id: "t1", titre: "T1", projet: "Alpha", statut: "analyser" }]);
    });
    act(() => {
      result.current.saveTasks([{ id: "t1", titre: "T1 modifiée", projet: "Alpha", statut: "analyser" }]);
    });

    expect(result.current.tasks[0].titre).toBe("T1 modifiée");
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);

    act(() => result.current.undo());
    expect(result.current.tasks[0].titre).toBe("T1");
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(result.current.tasks[0].titre).toBe("T1 modifiée");
    expect(result.current.canRedo).toBe(false);
  });

  it("une nouvelle action après un undo efface la pile de redo", async () => {
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.saveTasks([{ id: "t1", titre: "A", projet: "Alpha", statut: "analyser" }]));
    act(() => result.current.saveTasks([{ id: "t1", titre: "B", projet: "Alpha", statut: "analyser" }]));
    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.saveTasks([{ id: "t1", titre: "C", projet: "Alpha", statut: "analyser" }]));
    expect(result.current.canRedo).toBe(false);
    expect(result.current.tasks[0].titre).toBe("C");
  });

  it("undo/redo sans historique ne fait rien", async () => {
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    act(() => result.current.undo());
    act(() => result.current.redo());
    expect(result.current.tasks).toEqual([]);
  });
});
