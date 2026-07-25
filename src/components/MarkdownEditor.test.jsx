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

const renderEditor = (initial = "") => render(
  <LanguageProvider>
    <Harness initial={initial} />
  </LanguageProvider>
);

const renderFormattedEditor = (initial = "") => render(
  <LanguageProvider>
    <Harness initial={initial} initialMode="formatted" />
  </LanguageProvider>
);

const placeCaret = (node, offset) => {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
};

const select = (start, end) => {
  const el = screen.getByRole("textbox");
  el.focus();
  el.setSelectionRange(start, end);
  return el;
};

describe("MarkdownEditor undo/redo", () => {
  it("annule puis rétablit une action de la barre d'outils", () => {
    renderEditor("hello world");
    select(0, 5);

    expect(screen.getByTitle("Annuler (Ctrl+Z)").disabled).toBe(true);

    fireEvent.click(screen.getByTitle("Gras"));
    expect(screen.getByRole("textbox").value).toBe("**hello** world");
    expect(screen.getByTitle("Annuler (Ctrl+Z)").disabled).toBe(false);

    fireEvent.click(screen.getByTitle("Annuler (Ctrl+Z)"));
    expect(screen.getByRole("textbox").value).toBe("hello world");
    expect(screen.getByTitle("Rétablir (Ctrl+Y)").disabled).toBe(false);

    fireEvent.click(screen.getByTitle("Rétablir (Ctrl+Y)"));
    expect(screen.getByRole("textbox").value).toBe("**hello** world");
  });

  it("répond à Ctrl+Z / Ctrl+Y au clavier sans passer par le undo natif du navigateur", () => {
    renderEditor("hello world");
    select(0, 5);
    fireEvent.click(screen.getByTitle("Italique"));
    expect(screen.getByRole("textbox").value).toBe("*hello* world");

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "z", ctrlKey: true });
    expect(screen.getByRole("textbox").value).toBe("hello world");

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "y", ctrlKey: true });
    expect(screen.getByRole("textbox").value).toBe("*hello* world");
  });

  it("fusionne une rafale de frappe rapide en une seule entrée d'historique", () => {
    renderEditor("");
    const el = select(0, 0);
    fireEvent.change(el, { target: { value: "h" } });
    fireEvent.change(el, { target: { value: "he" } });
    fireEvent.change(el, { target: { value: "hel" } });

    fireEvent.click(screen.getByTitle("Annuler (Ctrl+Z)"));
    expect(screen.getByRole("textbox").value).toBe("");
    expect(screen.getByTitle("Annuler (Ctrl+Z)").disabled).toBe(true);
  });
});

describe("MarkdownEditor titres", () => {
  it("propose une option Paragraphe qui retire le marqueur de titre", () => {
    renderEditor("# Title");
    select(0, 7);
    fireEvent.click(screen.getByTitle("Titre 1"));
    fireEvent.click(screen.getByText("Paragraphe"));
    expect(screen.getByRole("textbox").value).toBe("Title");
  });
});

describe("MarkdownEditor couleur personnalisée", () => {
  it("n'applique la couleur qu'après confirmation", () => {
    renderEditor("hello");
    select(0, 5);
    fireEvent.click(screen.getByTitle("Couleur du texte"));

    fireEvent.change(screen.getByLabelText("Couleur personnalisée"), { target: { value: "#123456" } });
    expect(screen.getByRole("textbox").value).toBe("hello");

    fireEvent.click(screen.getByLabelText("Appliquer"));
    expect(screen.getByRole("textbox").value).toBe('<span style="color:#123456">hello</span>');
  });
});

describe("MarkdownEditor mode Formaté - Entrée près d'une image", () => {
  it("scinde le paragraphe quand le curseur est juste après une image", () => {
    renderFormattedEditor("![alt](x.png)");
    const el = screen.getByRole("textbox");
    const wrap = el.querySelector(".trk-img-resizable");
    expect(wrap).toBeTruthy();

    const p = wrap.parentElement;
    placeCaret(p, Array.prototype.indexOf.call(p.childNodes, wrap) + 1);
    fireEvent.keyDown(el, { key: "Enter" });

    expect(el.querySelectorAll("p").length).toBe(2);
    expect(el.querySelector("img")).toBeTruthy();
  });

  it("scinde le paragraphe quand le curseur est juste avant une image", () => {
    renderFormattedEditor("![alt](x.png)");
    const el = screen.getByRole("textbox");
    const wrap = el.querySelector(".trk-img-resizable");
    const p = wrap.parentElement;
    placeCaret(p, Array.prototype.indexOf.call(p.childNodes, wrap));
    fireEvent.keyDown(el, { key: "Enter" });

    expect(el.querySelectorAll("p").length).toBe(2);
    expect(el.querySelector("img")).toBeTruthy();
  });

  it("laisse Entrée natif s'exécuter loin d'une image (pas de scission manuelle)", () => {
    renderFormattedEditor("hello world");
    const el = screen.getByRole("textbox");
    const textNode = el.querySelector("p").firstChild;
    placeCaret(textNode, 5);
    const before = el.innerHTML;
    fireEvent.keyDown(el, { key: "Enter" });
    expect(el.innerHTML).toBe(before);
  });
});

describe("MarkdownEditor mode Formaté - undo/redo", () => {
  it("restaure exactement le texte d'origine avec Annuler puis Rétablir", () => {
    renderFormattedEditor("hello");
    const el = screen.getByRole("textbox");
    expect(el.querySelector("p").textContent).toBe("hello");

    el.innerHTML = "<p>hello world</p>";
    fireEvent.input(el);

    fireEvent.click(screen.getByTitle("Annuler (Ctrl+Z)"));
    expect(screen.getByRole("textbox").querySelector("p").textContent).toBe("hello");

    fireEvent.click(screen.getByTitle("Rétablir (Ctrl+Y)"));
    expect(screen.getByRole("textbox").querySelector("p").textContent).toBe("hello world");
  });

  it("ne dérive pas l'espacement d'une checklist en mode Formaté (round-trip Markdown -> HTML -> Markdown)", () => {
    const original = "- [ ] a faire\n- [x] fait";
    renderFormattedEditor(original);
    const el = screen.getByRole("textbox");

    // Une simple resynchronisation du Markdown depuis le HTML rendu (comme
    // après n'importe quelle frappe ou action de la barre d'outils) : sans
    // les règles Turndown dédiées (voir htmlToMarkdown.ts), Turndown réinsère
    // un espacement différent (`-   [ ]  a faire`) à chaque passage,
    // corrompant silencieusement le texte même sans undo/redo.
    fireEvent.input(el);
    expect(screen.getByTestId("value").textContent).toBe(original);

    fireEvent.click(screen.getByTitle("Annuler (Ctrl+Z)"));
    expect(screen.getByTestId("value").textContent).toBe(original);
  });
});
