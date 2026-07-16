import React from "react";
import { Minus, Copy, ChevronsUpDown, X } from "lucide-react";
import { useLang } from "../i18n.jsx";

// Barre de titre custom (la fenêtre est frame: false) : zone de drag +
// boutons réduire / agrandir / fermer branchés sur l'IPC window:*.
export function TitleBar({ maximized }) {
  const { t } = useLang();
  const hasControls = typeof window !== "undefined" && !!window.windowControls;

  if (!hasControls) return null;

  return (
    <div className="trk-titlebar">
      <div className="trk-titlebar-drag">
        <span className="trk-titlebar-title">{t("titlebar_title")}</span>
      </div>
      <div className="trk-traffic-lights">
        <button
          className="trk-traffic-btn trk-traffic-minimize"
          onClick={() => window.windowControls.minimize()}
          title={t("minimize")}
        >
          <Minus size={8} strokeWidth={3} className="trk-traffic-glyph" />
        </button>
        <button
          className="trk-traffic-btn trk-traffic-maximize"
          onClick={() => window.windowControls.toggleMaximize()}
          title={maximized ? t("restore") : t("maximize")}
        >
          {maximized ? (
            <Copy size={7} strokeWidth={3} className="trk-traffic-glyph" />
          ) : (
            <ChevronsUpDown size={8} strokeWidth={3} className="trk-traffic-glyph" />
          )}
        </button>
        <button
          className="trk-traffic-btn trk-traffic-close"
          onClick={() => window.windowControls.close()}
          title={t("close")}
        >
          <X size={8} strokeWidth={3} className="trk-traffic-glyph" />
        </button>
      </div>
    </div>
  );
}
