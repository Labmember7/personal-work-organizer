// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../../i18n/index";
import { KanbanBoard } from "./KanbanBoard.jsx";

afterEach(cleanup);

const task = (id, statut) => ({
  id,
  type: "standard",
  titre: `Tâche ${id}`,
  projet: "Alpha",
  priorite: "moyenne",
  statut,
  timeLogs: [],
});

const renderBoard = (tasks) => {
  const onMove = vi.fn();
  const utils = render(
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
  return { onMove, ...utils };
};

describe("KanbanBoard (déplacement par drop)", () => {
  it("déplace la tâche déposée vers le statut de la colonne", () => {
    const { onMove, container } = renderBoard([task("t1", "analyser")]);
    const columns = container.querySelectorAll(".trk-kanban-col");
    expect(columns.length).toBe(6);
    fireEvent.drop(columns[1], {
      dataTransfer: { getData: () => "t1", dropEffect: "move" },
    });
    expect(onMove).toHaveBeenCalledWith("t1", "implementer");
  });

  it("rend une colonne par statut avec la tâche dans la bonne colonne", () => {
    const { container } = renderBoard([task("t1", "revue")]);
    const columns = container.querySelectorAll(".trk-kanban-col");
    expect(columns[2].textContent).toContain("Tâche t1");
    expect(columns[0].textContent).not.toContain("Tâche t1");
  });

  it("transmet les coordonnées d'origine du drop pour déclencher la célébration instantanée au bon endroit", () => {
    const { onMove, container } = renderBoard([task("t1", "analyser")]);
    const columns = container.querySelectorAll(".trk-kanban-col");
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true });
    Object.assign(dropEvent, {
      clientX: 420,
      clientY: 280,
      dataTransfer: { getData: () => "t1", dropEffect: "move" },
    });
    columns[5].dispatchEvent(dropEvent);
    expect(onMove).toHaveBeenCalledWith("t1", "termine", { x: 420, y: 280 });
  });

  it("en mode sticky, colle la note à l'endroit exact où elle est déposée dans la colonne", () => {
    localStorage.clear();
    const onMove = vi.fn();
    const { container } = render(
      <LanguageProvider>
        <KanbanBoard
          tasks={[task("t1", "analyser")]}
          stickyMode
          onMove={onMove}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          confirmId={null}
          onAskDelete={vi.fn()}
          onCancelDelete={vi.fn()}
        />
      </LanguageProvider>
    );

    const col = container.querySelectorAll(".trk-kanban-col")[0];
    const body = col.querySelector(".trk-kanban-col-body");
    vi.spyOn(body, "getBoundingClientRect").mockReturnValue({
      left: 100,
      top: 100,
      right: 600,
      bottom: 600,
      width: 500,
      height: 500,
      x: 100,
      y: 100,
      toJSON: () => {},
    });

    const dropEvent = new Event("drop", { bubbles: true, cancelable: true });
    Object.assign(dropEvent, {
      clientX: 460,
      clientY: 320,
      dataTransfer: { getData: () => "t1", dropEffect: "move" },
    });
    fireEvent(col, dropEvent);

    const card = col.querySelector(".trk-kanban-card");
    expect(card?.classList.contains("trk-sticky-placed")).toBe(true);
    expect(parseFloat(card?.style.getPropertyValue("--sticky-x") || "0")).toBeGreaterThan(0.5);
    expect(parseInt(card?.style.getPropertyValue("--sticky-y") || "0", 10)).toBeGreaterThan(100);
  });
});
