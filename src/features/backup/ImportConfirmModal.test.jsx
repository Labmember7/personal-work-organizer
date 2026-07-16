// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../../i18n/index";
import { ImportConfirmModal } from "./ImportConfirmModal.jsx";

afterEach(cleanup);

const pending = {
  tasks: [{ id: "1", titre: "T", projet: "Alpha" }],
  projects: ["Alpha", "Beta"],
};

const renderModal = (pendingImport = pending) => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <LanguageProvider>
      <ImportConfirmModal pendingImport={pendingImport} onConfirm={onConfirm} onCancel={onCancel} />
    </LanguageProvider>
  );
  return { onConfirm, onCancel };
};

describe("ImportConfirmModal", () => {
  it("ne rend rien sans import en attente", () => {
    const { onConfirm } = renderModal(null);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("affiche le nombre de tâches et de projets importés", () => {
    renderModal();
    expect(screen.getByText(/1 tâche\(s\) · 2 projet\(s\)/)).toBeTruthy();
  });

  it("confirme le remplacement", () => {
    const { onConfirm } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Remplacer" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("annule via Échap", () => {
    const { onCancel } = renderModal();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
