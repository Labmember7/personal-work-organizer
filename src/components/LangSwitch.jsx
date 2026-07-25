import React from "react";
import { useLang } from "../i18n.jsx";

// Bascule FR / EN de l'en-tête. `inGroup` la rend segment d'un
// .trk-btn-group : elle abandonne alors sa propre coque (cadre, fond).
export function LangSwitch({ inGroup = false }) {
  const { lang, setLang } = useLang();
  return (
    <div className={"trk-lang-switch" + (inGroup ? " trk-lang-switch-plain" : "")}>
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
