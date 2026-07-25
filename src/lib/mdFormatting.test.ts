import { describe, it, expect } from "vitest";
import {
  toggleWrap,
  toggleHeading,
  setParagraph,
  toggleQuote,
  toggleBulletList,
  toggleOrderedList,
  toggleChecklist,
  wrapStyle,
  insertLink,
  insertImage,
  insertDivider,
  wrapCodeBlock,
  insertTable,
} from "./mdFormatting";

describe("toggleWrap (gras, italique, barré, code en ligne)", () => {
  it("entoure la sélection du marqueur", () => {
    const r = toggleWrap("hello world", 6, 11, "**", "bold");
    expect(r.text).toBe("hello **world**");
  });

  it("insère un texte de remplacement quand rien n'est sélectionné", () => {
    const r = toggleWrap("", 0, 0, "**", "bold text");
    expect(r.text).toBe("**bold text**");
    expect(r.text.slice(r.start, r.end)).toBe("bold text");
  });

  it("retire le marqueur si la sélection l'inclut déjà (bascule off)", () => {
    const r = toggleWrap("hello **world**", 6, 15, "**", "bold");
    expect(r.text).toBe("hello world");
  });

  it("retire le marqueur si le curseur est juste à l'intérieur (bascule off)", () => {
    const r = toggleWrap("**world**", 2, 7, "**", "bold");
    expect(r.text).toBe("world");
  });
});

describe("toggleHeading", () => {
  it("ajoute le préfixe de titre", () => {
    const r = toggleHeading("Some text", 0, 4, 2);
    expect(r.text).toBe("## Some text");
  });

  it("retire le préfixe si déjà au bon niveau", () => {
    const r = toggleHeading("## Some text", 0, 4, 2);
    expect(r.text).toBe("Some text");
  });

  it("remplace un titre de niveau 1 par un niveau 3", () => {
    const r = toggleHeading("# Title", 0, 5, 3);
    expect(r.text).toBe("### Title");
  });
});

describe("setParagraph", () => {
  it("retire le préfixe de titre", () => {
    const r = setParagraph("## Some text", 0, 4);
    expect(r.text).toBe("Some text");
  });

  it("n'a aucun effet sur du texte déjà simple", () => {
    const r = setParagraph("Some text", 0, 4);
    expect(r.text).toBe("Some text");
  });

  it("s'applique ligne par ligne sur une sélection multi-lignes", () => {
    const value = "# One\n## Two";
    const r = setParagraph(value, 0, value.length);
    expect(r.text).toBe("One\nTwo");
  });
});

describe("toggleQuote / toggleBulletList / toggleOrderedList / toggleChecklist", () => {
  it("cite chaque ligne sélectionnée", () => {
    const r = toggleQuote("line one\nline two", 0, 17);
    expect(r.text).toBe("> line one\n> line two");
  });

  it("convertit une liste à puces en liste numérotée", () => {
    const value = "- first\n- second";
    const r = toggleOrderedList(value, 0, value.length);
    expect(r.text).toBe("1. first\n2. second");
  });

  it("bascule une checklist off si déjà appliquée", () => {
    const value = "- [ ] task one\n- [ ] task two";
    const r = toggleChecklist(value, 0, value.length);
    expect(r.text).toBe("task one\ntask two");
  });

  it("ignore les lignes vides du bloc sélectionné", () => {
    const value = "one\n\ntwo";
    const r = toggleBulletList(value, 0, value.length);
    expect(r.text).toBe("- one\n\n- two");
  });
});

describe("combinaison titre / liste / citation (un seul marqueur de bloc à la fois)", () => {
  // Chaque bascule ne retirait avant que son propre marqueur : passer d'un
  // titre à une liste (ou l'inverse) laissait l'ancien marqueur en texte
  // littéral ("- # Title"), que marked ne reconnaît plus comme un titre -
  // d'où l'impression qu'"annuler/rétablir" perd le titre pour ne garder
  // qu'un paragraphe.
  it("un titre suivi d'une liste à puces ne laisse pas le marqueur # en texte", () => {
    const r1 = toggleHeading("Title", 0, 5, 1);
    const r2 = toggleBulletList(r1.text, 0, r1.text.length);
    expect(r2.text).toBe("- Title");
  });

  it("une liste à puces suivie d'un titre ne laisse pas le marqueur - en texte", () => {
    const r1 = toggleBulletList("Title", 0, 5);
    const r2 = toggleHeading(r1.text, 0, r1.text.length, 1);
    expect(r2.text).toBe("# Title");
  });

  it("citation -> titre -> checklist ne cumule aucun marqueur littéral", () => {
    const r1 = toggleQuote("Title", 0, 5);
    const r2 = toggleHeading(r1.text, 0, r1.text.length, 2);
    const r3 = toggleChecklist(r2.text, 0, r2.text.length);
    expect(r3.text).toBe("- [ ] Title");
  });

  it("une liste numérotée repassée en paragraphe retire bien son marqueur", () => {
    const r1 = toggleOrderedList("Title", 0, 5);
    const r2 = setParagraph(r1.text, 0, r1.text.length);
    expect(r2.text).toBe("Title");
  });
});

describe("wrapStyle (couleur, police)", () => {
  it("entoure la sélection d'un span avec le style donné", () => {
    const r = wrapStyle("hello world", 6, 11, "color:#ff0000", "text");
    expect(r.text).toBe('hello <span style="color:#ff0000">world</span>');
  });

  it("utilise le texte de remplacement si rien n'est sélectionné", () => {
    const r = wrapStyle("", 0, 0, "font-family:Georgia,serif", "styled text");
    expect(r.text).toBe('<span style="font-family:Georgia,serif">styled text</span>');
  });

  it("met à jour le span existant au lieu d'en imbriquer un nouveau (même sélection, même propriété)", () => {
    const first = wrapStyle("hello world", 6, 11, "color:#ff0000", "text");
    const second = wrapStyle(first.text, first.start, first.end, "color:#0000ff", "text");
    expect(second.text).toBe('hello <span style="color:#0000ff">world</span>');
  });

  it("imbrique un nouveau span si la propriété diffère (couleur puis police)", () => {
    const first = wrapStyle("hello world", 6, 11, "color:#ff0000", "text");
    const second = wrapStyle(first.text, first.start, first.end, "font-family:Georgia,serif", "text");
    expect(second.text).toBe(
      'hello <span style="color:#ff0000"><span style="font-family:Georgia,serif">world</span></span>'
    );
  });
});

describe("insertLink / insertImage", () => {
  it("utilise la sélection comme libellé et sélectionne l'url", () => {
    const r = insertLink("check this out", 6, 14, "text", "url");
    expect(r.text).toBe("check [this out](url)");
    expect(r.text.slice(r.start, r.end)).toBe("url");
  });

  it("insère un lien vide et sélectionne le libellé si rien n'est sélectionné", () => {
    const r = insertLink("", 0, 0, "text", "url");
    expect(r.text).toBe("[text](url)");
    expect(r.text.slice(r.start, r.end)).toBe("text");
  });

  it("insère une image avec alt et url", () => {
    const r = insertImage("", 0, 0, "alt text", "url");
    expect(r.text).toBe("![alt text](url)");
    expect(r.text.slice(r.start, r.end)).toBe("alt text");
  });
});

describe("insertDivider / wrapCodeBlock / insertTable", () => {
  it("sépare la règle horizontale du texte environnant", () => {
    const r = insertDivider("before", 6, 6);
    expect(r.text).toBe("before\n\n---");
  });

  it("n'ajoute pas de saut de ligne superflu si déjà présent", () => {
    const r = insertDivider("before\n\n", 8, 8);
    expect(r.text).toBe("before\n\n---");
  });

  it("entoure la sélection de trois backticks", () => {
    const r = wrapCodeBlock("", 0, 0, "code");
    expect(r.text).toBe("```\ncode\n```");
    expect(r.text.slice(r.start, r.end)).toBe("code");
  });

  it("insère un tableau 2x2 avec en-têtes sélectionnés", () => {
    const r = insertTable("", 0, 0, "Header", "Cell");
    expect(r.text).toBe("| Header | Header |\n| --- | --- |\n| Cell | Cell |");
    expect(r.text.slice(r.start, r.end)).toBe("Header");
  });
});
