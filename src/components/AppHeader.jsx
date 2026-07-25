import React from "react";
import { Download, HelpCircle, Moon, PartyPopper, Redo2, Sun, Undo2, Upload } from "lucide-react";
import { useLang, doneOfTotal, tasksTotalLabel } from "../i18n.jsx";
import { Gauge } from "./Gauge.jsx";
import { LangSwitch } from "./LangSwitch.jsx";
import { HelpTip } from "../tips.jsx";

// En-tête : marque, jauge d'avancement global et actions générales
// (import/export, tutoriel, célébrations, thème, langue, undo/redo).
export function AppHeader({
  globalProgress, doneCount, totalTasks,
  onImport, onExport, ioBusy,
  onOpenTutorial,
  celebrationsOn, onToggleCelebrations,
  theme, onToggleTheme,
  canUndo, canRedo, onUndo, onRedo,
}) {
  const { t, lang } = useLang();
  return (
    <div className="trk-header">
      <div className="trk-header-brand">
        <div className="trk-eyebrow">{t("eyebrow")}</div>
        <h1 className="trk-title">{t("app_title")}</h1>
      </div>
      <div className="trk-gauge-block">
        <Gauge value={globalProgress} />
        <div className="trk-gauge-caption">
          <strong>{doneOfTotal(lang, doneCount, totalTasks)}</strong>
          <span>{tasksTotalLabel(lang, totalTasks)} <HelpTip tipKey="progress" /></span>
        </div>
      </div>
      <div className="trk-header-actions">
        <div className="trk-io-group">
          <button
            type="button"
            className="trk-io-btn"
            onClick={onImport}
            disabled={ioBusy}
            title={t("import_data")}
          >
            <Upload size={14} /> {t("import_data")}
          </button>
          <button
            type="button"
            className="trk-io-btn"
            onClick={onExport}
            disabled={ioBusy}
            title={t("export_data")}
          >
            <Download size={14} /> {t("export_data")}
          </button>
          <HelpTip tipKey="backup" />
        </div>
        <button
          type="button"
          className="trk-theme-btn"
          onClick={onUndo}
          disabled={!canUndo}
          title={t("undo")}
          aria-label={t("undo")}
        >
          <Undo2 size={14} />
        </button>
        <button
          type="button"
          className="trk-theme-btn"
          onClick={onRedo}
          disabled={!canRedo}
          title={t("redo")}
          aria-label={t("redo")}
        >
          <Redo2 size={14} />
        </button>
        <button
          type="button"
          className="trk-theme-btn"
          onClick={onOpenTutorial}
          title={t("help_tutorial")}
          aria-label={t("help_tutorial")}
        >
          <HelpCircle size={14} />
        </button>
        <button
          type="button"
          className={"trk-theme-btn" + (celebrationsOn ? "" : " trk-celeb-off")}
          onClick={onToggleCelebrations}
          title={celebrationsOn ? t("celebrations_disable") : t("celebrations_enable")}
          aria-label={celebrationsOn ? t("celebrations_disable") : t("celebrations_enable")}
          aria-pressed={celebrationsOn}
        >
          <PartyPopper size={14} />
        </button>
        <button
          type="button"
          className="trk-theme-btn"
          onClick={onToggleTheme}
          title={theme === "dark" ? t("theme_light") : t("theme_dark")}
          aria-label={theme === "dark" ? t("theme_light") : t("theme_dark")}
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <LangSwitch />
      </div>
    </div>
  );
}
