import React from "react";
import { useLang } from "../i18n.jsx";

// Bascule FR / EN de l'en-tête.
export function LangSwitch() {
  const { lang, setLang } = useLang();
  return (
    <div className="trk-lang-switch">
      {["fr", "en"].map((l) => (
        <button
          key={l}
          type="button"
          className={"trk-lang-btn" + (lang === l ? " active" : "")}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
