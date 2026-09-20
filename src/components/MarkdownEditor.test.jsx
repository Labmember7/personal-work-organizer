// @vitest-environment jsdom
import React, { useState } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../i18n/index";
import { MarkdownEditor } from "./MarkdownEditor.jsx";

afterEach(cleanup);

function Harness({ initial = "", initialMode = "text" }) {
  const [value, setValue] = useState(initial);
  const [mode, setMode] = useState(initialMode);
  return (
    <>
      <div data-testid="value">{value}</div>
      <MarkdownEditor
        id="desc"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        mode={mode}
        onModeChange={setMode}
        placeholder=""
      />
    </>
  );
}

const renderEditor = (initial = "", initialMode = "text") => render(
  <LanguageProvider>
    <Harness initial={initial} initialMode={initialMode} />
  </LanguageProvider>
);

const renderRichEditor = (initial = "") => renderEditor(initial, "formatted");

const source = () => screen.getByTestId("value").textContent;
const richArea = () => document.querySelector(".trk-md-formatted");

describe("MarkdownEditor mode Formaté", () => {
  it("affiche la source Markdown en contenu riche", () => {
    renderRichEditor("# Titre\n\n- [ ] a faire");
    const area = richArea();
    expect(area.querySelector("h1").textContent).toBe("Titre");
    expect(area.querySelector('li[data-checked] input[type="checkbox"]')).toBeTruthy();
  });

  it("applique une mise en forme depuis la barre d'outils et met à jour la source", () => {
    renderRichEditor("faire le point");
    fireEvent.click(screen.getByTitle("Liste à puces (Ctrl+Shift+8)"));
    expect(source()).toBe("- faire le point");
    expect(richArea().querySelector("ul li")).toBeTruthy();
  });

  it("bascule un paragraphe en liste de tâches puis le rebascule", () => {
    renderRichEditor("faire le point");
    const checklist = screen.getByTitle("Liste de tâches (Ctrl+Shift+4)");

    fireEvent.click(checklist);
    expect(source()).toBe("- [ ] faire le point");

    fireEvent.click(checklist);
    expect(source()).toBe("faire le point");
    expect(richArea().querySelector('input[type="checkbox"]')).toBeNull();
  });

  it("allume le bouton correspondant à la mise en forme sous le curseur", () => {
    renderRichEditor("# Titre");
    fireEvent.click(screen.getByTitle("Style de bloc"));
    expect(screen.getByTitle("Titre 1 (Ctrl+Shift+1)").className).toContain("active");
    expect(screen.getByTitle("Paragraphe (Ctrl+Shift+0)").className).not.toContain("active");
  });

  it("retire liste et citation avec l'option Paragraphe", () => {
    renderRichEditor("> citation");
    fireEvent.click(screen.getByTitle("Style de bloc"));
    fireEvent.click(screen.getByText("Paragraphe"));
    expect(source()).toBe("citation");
  });
});

describe("MarkdownEditor raccourcis clavier", () => {
  it("crée une liste de tâches avec Ctrl+Shift+4 (touche reconnue par sa position)", () => {
    renderRichEditor("acheter du pain");
    fireEvent.keyDown(richArea(), { key: "4", code: "Digit4", ctrlKey: true, shiftKey: true });
    expect(source()).toBe("- [ ] acheter du pain");
  });

  it("n'intercepte pas Ctrl+Alt (AltGr) qui sert à taper #, [ ou | en AZERTY", () => {
    renderRichEditor("texte");
    fireEvent.keyDown(richArea(), { key: "3", code: "Digit3", ctrlKey: true, shiftKey: true, altKey: true });
    expect(source()).toBe("texte");
  });

  it("n'applique pas deux fois un raccourci déjà traité par l'éditeur", () => {
    renderRichEditor("texte");
    // Ctrl+B est géré par Tiptap lui-même : l'évènement remonte avec
    // defaultPrevented, la table de raccourcis de la barre d'outils doit
    // l'ignorer (sinon le gras serait posé puis retiré).
    const event = new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true, cancelable: true });
    event.preventDefault();
    fireEvent(richArea(), event);
    expect(source()).toBe("texte");
  });
});

describe("MarkdownEditor undo/redo", () => {
  it("annule puis rétablit une action de la barre d'outils", () => {
    renderRichEditor("hello");
    expect(screen.getByTitle("Annuler (Ctrl+Z)").disabled).toBe(true);

    fireEvent.click(screen.getByTitle("Liste à puces (Ctrl+Shift+8)"));
    expect(source()).toBe("- hello");
    expect(screen.getByTitle("Annuler (Ctrl+Z)").disabled).toBe(false);

    fireEvent.click(screen.getByTitle("Annuler (Ctrl+Z)"));
    expect(source()).toBe("hello");

    fireEvent.click(screen.getByTitle("Rétablir (Ctrl+Y)"));
    expect(source()).toBe("- hello");
  });
});

describe("MarkdownEditor insertion d'un lien", () => {
  it("insère le lien saisi dans le popover d'URL", () => {
    renderRichEditor("");
    fireEvent.click(screen.getByTitle("Lien (Ctrl+K)"));
    const input = screen.getByLabelText("Entrer l'URL");
    fireEvent.change(input, { target: { value: "https://example.com" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(source()).toBe("[texte](https://example.com)");
    expect(screen.queryByLabelText("Entrer l'URL")).toBeNull();
  });
});

describe("MarkdownEditor bascule de mode", () => {
  it("n'active la barre de mise en forme qu'en mode Formaté", () => {
    renderEditor("hello");
    expect(screen.getByTitle("Gras (Ctrl+B)").disabled).toBe(true);

    fireEvent.click(screen.getByText("Formaté"));
    expect(screen.getByTitle("Gras (Ctrl+B)").disabled).toBe(false);
  });

  it("reprend l'édition faite dans la source Markdown au retour en mode Formaté", () => {
    renderEditor("hello");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "# Titre" } });

    fireEvent.click(screen.getByText("Formaté"));
    expect(richArea().querySelector("h1").textContent).toBe("Titre");

    fireEvent.click(screen.getByText("Texte"));
    expect(screen.getByRole("textbox").value).toBe("# Titre");
  });
});
