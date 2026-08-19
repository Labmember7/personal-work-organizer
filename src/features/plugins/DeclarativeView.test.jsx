import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DeclarativeView } from "./DeclarativeView.jsx";

describe("DeclarativeView (panneaux de tâche)", () => {
  it("rend une ligne fournie via `rows` (panneau de tâche)", () => {
    const spec = {
      layout: { columns: [{ label: "Titre", value: "task.titre" }] },
      empty: "vide",
    };
    const html = renderToStaticMarkup(
      <DeclarativeView spec={spec} lang="fr" rows={[{ task: { titre: "Ma tâche" }, settings: {} }]} />,
    );
    expect(html).toContain("Ma tâche");
  });

  it("expose la variable `settings` aux expressions de colonnes", () => {
    const spec = {
      layout: { columns: [{ label: "Courbe", value: "settings.curve", as: "badge" }] },
      empty: "vide",
    };
    const html = renderToStaticMarkup(
      <DeclarativeView spec={spec} lang="fr" rows={[{ settings: { curve: "bezier" } }]} />,
    );
    expect(html).toContain("bezier");
  });

  it("affiche le message vide sans lignes", () => {
    const spec = { layout: { columns: [{ label: "X", value: "task.titre" }] }, empty: "Rien à voir" };
    const html = renderToStaticMarkup(<DeclarativeView spec={spec} lang="fr" rows={[]} />);
    expect(html).toContain("Rien à voir");
  });
});
