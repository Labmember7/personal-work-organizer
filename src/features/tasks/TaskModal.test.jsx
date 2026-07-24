// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../../i18n/index";
import { TaskModal } from "./TaskModal.jsx";

afterEach(cleanup);

const newDraft = () => ({
  id: null,
  type: "standard",
  projet: "Alpha",
  titre: "",
  description: "",
  priorite: "moyenne",
  statut: "analyser",
  assigne: "",
  dateDebut: "2026-07-16",
  echeance: "",
  timeLogs: [],
});

const renderModal = (props = {}) => {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  render(
    <LanguageProvider>
      <TaskModal
        initial={props.initial ?? newDraft()}
        storeTask={props.storeTask ?? null}
        projects={["Alpha", "Beta"]}
        onSubmit={onSubmit}
        onClose={onClose}
        timeLogOps={{ addTimeLog: vi.fn(), editTimeLog: vi.fn(), deleteTimeLog: vi.fn() }}
      />
    </LanguageProvider>
  );
  return { onSubmit, onClose };
};

describe("TaskModal", () => {
  it("crée une tâche : saisie du titre puis soumission", () => {
    const { onSubmit, onClose } = renderModal();
    fireEvent.change(screen.getByPlaceholderText("Ex : Corriger la numérotation des slides"), {
      target: { value: "Nouvelle tâche" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ titre: "Nouvelle tâche", projet: "Alpha" });
    expect(onClose).toHaveBeenCalled();
  });

  it("refuse la soumission sans titre", () => {
    const { onSubmit } = renderModal();
    fireEvent.submit(screen.getByRole("dialog").querySelector("form"));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("ferme directement quand le brouillon est intact", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getAllByRole("button", { name: "Annuler" })[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("demande confirmation quand le brouillon est modifié", () => {
    const { onClose } = renderModal();
    fireEvent.change(screen.getByPlaceholderText("Ex : Corriger la numérotation des slides"), {
      target: { value: "Modifié" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Annuler" })[0]);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("Modifications non enregistrées")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Abandonner" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("en édition, permet de changer le type et réinitialise le statut vers le nouveau flux", () => {
    const initial = { ...newDraft(), id: "t1", titre: "Tâche", statut: "revue" };
    const { onSubmit } = renderModal({ initial });
    fireEvent.click(screen.getByRole("button", { name: /Simple/ }));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ type: "simple", statut: "todo" });
  });

  it("en édition, garde les timeLogs du store (pas ceux du brouillon)", () => {
    const initial = { ...newDraft(), id: "t1", titre: "Tâche", timeLogs: [] };
    const storeTask = {
      ...initial,
      timeLogs: [{ id: "l1", minutes: 30, note: "note du store", date: "2026-07-15" }],
    };
    renderModal({ initial, storeTask });
    expect(screen.getByText(/note du store/)).toBeTruthy();
  });
});
