// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../../i18n/index";
import { FocusZone } from "./FocusZone.jsx";

afterEach(cleanup);

const sampleTask = {
  id: "task-123",
  type: "standard",
  titre: "Implémenter la synchronisation",
  projet: "Dev",
  priorite: "haute",
  statut: "analyser",
  timeLogs: [],
};

const renderZone = (props = {}) => {
  const onDropTask = vi.fn();
  const onAdvance = vi.fn();
  const onRelease = vi.fn();
  const onEdit = vi.fn();

  const utils = render(
    <LanguageProvider>
      <FocusZone
        task={null}
        leaving={false}
        enterKey={0}
        startedAt={null}
        onDropTask={onDropTask}
        onAdvance={onAdvance}
        onRelease={onRelease}
        onEdit={onEdit}
        {...props}
      />
    </LanguageProvider>
  );

  return { onDropTask, onAdvance, onRelease, onEdit, ...utils };
};

describe("FocusZone (Drag & Drop Task Tracking)", () => {
  it("accepte le drop d'une tâche pour démarrer le suivi de focus", () => {
    const { onDropTask, container } = renderZone();
    const zone = container.querySelector(".trk-focus-zone");
    expect(zone).toBeTruthy();

    fireEvent.dragOver(zone, {
      dataTransfer: { types: ["text/plain"], dropEffect: "move" },
    });
    expect(zone.classList.contains("over")).toBe(true);

    fireEvent.drop(zone, {
      dataTransfer: {
        types: ["text/plain"],
        getData: (type) => (type === "text/plain" ? "task-123" : ""),
      },
    });

    expect(onDropTask).toHaveBeenCalledWith("task-123");
  });

  it("affiche la tâche active avec le suivi du temps et permet d'avancer le statut", () => {
    const { onAdvance, container } = renderZone({
      task: sampleTask,
      startedAt: Date.now() - 5 * 60 * 1000,
    });

    const titleEl = container.querySelector(".trk-focus-title");
    expect(titleEl?.textContent).toContain("Implémenter la synchronisation");

    const advanceBtn = container.querySelector(".trk-focus-done-btn");
    expect(advanceBtn).toBeTruthy();
    fireEvent.click(advanceBtn);
    expect(onAdvance).toHaveBeenCalled();
  });

  it("ouvre l'édition au clic sur la tâche focalisée", () => {
    const { onEdit, container } = renderZone({
      task: sampleTask,
      startedAt: Date.now(),
    });

    const taskBtn = container.querySelector(".trk-focus-task-btn");
    expect(taskBtn).toBeTruthy();
    fireEvent.click(taskBtn);
    expect(onEdit).toHaveBeenCalledWith(sampleTask);
  });

  it("libère le focus au clic sur le bouton de fermeture", () => {
    const { onRelease, container } = renderZone({
      task: sampleTask,
      startedAt: Date.now(),
    });

    const releaseBtn = container.querySelector(".trk-focus-release-btn");
    expect(releaseBtn).toBeTruthy();
    fireEvent.click(releaseBtn);
    expect(onRelease).toHaveBeenCalled();
  });

  it("déclenche la goutte liquide en portail sur le body lors du drag de la tâche focalisée", () => {
    const { onRelease, container } = renderZone({
      task: sampleTask,
      startedAt: Date.now(),
    });

    const taskBtn = container.querySelector(".trk-focus-task-btn");
    expect(taskBtn).toBeTruthy();

    // Initie le drag de la tâche hors de la zone
    fireEvent.dragStart(taskBtn, {
      clientX: 500,
      clientY: 300,
      dataTransfer: {
        setData: vi.fn(),
        setDragImage: vi.fn(),
      },
    });

    // La goutte d'eau liquide est créée en portail directement dans document.body
    const ghost = document.body.querySelector(".trk-focus-ghost");
    expect(ghost).toBeTruthy();
    expect(ghost?.textContent).toContain("Implémenter la synchronisation");

    // Lâcher en dehors de la zone déclenche la libération
    fireEvent.dragEnd(taskBtn, { clientX: 100, clientY: 100 });
    expect(onRelease).toHaveBeenCalled();
  });
});

