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
});
