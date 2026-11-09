// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../../i18n/index";
import { FocusProvider } from "../focus/FocusContext.jsx";
import { TaskRow } from "./TaskRow.jsx";

afterEach(cleanup);

const sampleTask = {
  id: "task-abc",
  type: "standard",
  titre: "Écrire les tests unitaires",
  projet: "Core",
  priorite: "critique",
  statut: "analyser",
  timeLogs: [{ id: "l1", minutes: 30, note: "Session 1", date: "2026-11-09" }],
};

const renderTaskRow = (task = sampleTask) => {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const onArchive = vi.fn();
  const onAskDelete = vi.fn();

  const utils = render(
    <LanguageProvider>
      <FocusProvider focusId={null} focusStartedAt={null}>
        <TaskRow
          task={task}
          onEdit={onEdit}
          onDelete={onDelete}
          onArchive={onArchive}
          confirmId={null}
          confirmAction={null}
          onAskDelete={onAskDelete}
          onCancelConfirm={vi.fn()}
          timeLogOps={{
            addTimeLog: vi.fn(),
            updateTimeLog: vi.fn(),
            deleteTimeLog: vi.fn(),
          }}
        />
      </FocusProvider>
    </LanguageProvider>
  );

  return { onEdit, onDelete, onArchive, ...utils };
};

describe("TaskRow (Draggable & Task Tracking)", () => {
  it("est draggable et initialise dataTransfer au démarrage du drag", () => {
    const { container } = renderTaskRow();
    const row = container.querySelector(".trk-task-row");
    expect(row).toBeTruthy();
    expect(row?.getAttribute("draggable")).toBe("true");

    const setData = vi.fn();
    const eventData = {
      dataTransfer: {
        setData,
        effectAllowed: "",
      },
    };

    fireEvent.dragStart(row, eventData);
    expect(setData).toHaveBeenCalledWith("text/plain", "task-abc");
    expect(eventData.dataTransfer.effectAllowed).toBe("move");
  });

  it("affiche les métadonnées et le temps pointé", () => {
    const { container } = renderTaskRow();
    expect(container.textContent).toContain("Écrire les tests unitaires");
    expect(container.textContent).toContain("Core");
    expect(container.textContent).toContain("Critique");
    expect(container.textContent).toContain("30m");
  });

  it("appelle onEdit lors du clic sur le bouton d'édition", () => {
    const { onEdit, container } = renderTaskRow();
    const editBtn = container.querySelector('button[title*="Modifier"], button[title*="Edit"]');
    expect(editBtn).toBeTruthy();
    fireEvent.click(editBtn);
    expect(onEdit).toHaveBeenCalledWith(sampleTask);
  });
});

