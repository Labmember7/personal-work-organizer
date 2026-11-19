import React, { useRef, useState } from "react";
import {
  Dices, Download, HelpCircle, Palette, PartyPopper, Pin,
  Redo2, SlidersHorizontal, Undo2, Upload,
} from "lucide-react";
import { useLang } from "../i18n.jsx";
import { Gauge } from "./Gauge.jsx";
import { LangSwitch } from "./LangSwitch.jsx";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { THEMES, getThemeMeta } from "../lib/themes";

// En-tête épuré : marque, sculpture de progression adaptée au thème, historique et préférences.
export const AppHeader = React.memo(function AppHeader({
  globalProgress, doneCount, inProgressCount = 0, totalTasks,
  onImport, onExport, ioBusy,
  onOpenTutorial,
  celebrationsOn, onToggleCelebrations,
  theme, randomSeed = 0, onToggleTheme, onSelectTheme,
  stickyMode, onToggleStickyMode,
  canUndo, canRedo, onUndo, onRedo,
}) {
  const { t } = useLang();
  const [prefsOpen, setPrefsOpen] = useState(false);
  const btnRef = useRef(null);
  const popRef = useRef(null);

  useEscapeKey(() => setPrefsOpen(false), prefsOpen);
  useOutsideClick([popRef, btnRef], () => setPrefsOpen(false), prefsOpen);

  const currentMeta = getThemeMeta(theme);

  return (
    <div className="trk-header">
      <div className="trk-header-brand">
        <div className="trk-eyebrow">{t("eyebrow")}</div>
        <h1 className="trk-title">{t("app_title")}</h1>
      </div>

      <div className="trk-gauge-block">
        <Gauge
          value={globalProgress}
          doneCount={doneCount}
          inProgressCount={inProgressCount}
          totalTasks={totalTasks}
          theme={theme}
          randomSeed={randomSeed}
        />
      </div>

      <div className="trk-header-actions">
        <div className="trk-btn-group" role="group" aria-label={t("group_history")}>
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
        </div>

        <button
          type="button"
          className="trk-theme-btn"
          onClick={onToggleTheme}
          title={`${t("theme_cycle")} (${t(currentMeta.labelKey)})`}
          aria-label={`${t("theme_cycle")} (${t(currentMeta.labelKey)})`}
        >
          {theme === "random" ? <Dices size={14} /> : <Palette size={14} />}
        </button>

        <div className="trk-prefs-wrap">
          <button
            ref={btnRef}
            type="button"
            className={"trk-theme-btn trk-prefs-btn" + (prefsOpen ? " active" : "")}
            onClick={() => setPrefsOpen((o) => !o)}
            title={t("prefs_label")}
            aria-label={t("prefs_label")}
            aria-expanded={prefsOpen}
          >
            <SlidersHorizontal size={14} />
          </button>

          {prefsOpen && (
            <div
              ref={popRef}
              className="trk-prefs-popover"
              role="dialog"
              aria-label={t("prefs_label")}
            >
              <div className="trk-prefs-section">
                <div className="trk-prefs-section-title">{t("prefs_theme")}</div>
                <div className="trk-theme-grid" role="radiogroup" aria-label={t("prefs_theme")}>
                  {THEMES.map((item) => {
                    const active = theme === item.id;
                    const isRandom = item.id === "random";
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        className={
                          "trk-theme-card" +
                          (active ? " active" : "") +
                          (isRandom ? " is-wide" : "")
                        }
                        onClick={() => {
                          if (onSelectTheme) onSelectTheme(item.id);
                          else onToggleTheme();
                        }}
                      >
                        <span
                          className="trk-theme-swatch"
                          style={{ background: item.swatchBg }}
                          aria-hidden="true"
                        >
                          {isRandom ? (
                            <Dices size={12} color={item.swatchAccent} />
                          ) : (
                            <>
                              <span
                                className="trk-theme-swatch-dot"
                                style={{ background: item.swatchAccent }}
                              />
                              <span
                                className="trk-theme-swatch-sub"
                                style={{ background: item.swatchSecondary }}
                              />
                            </>
                          )}
                        </span>
                        <span className="trk-theme-card-text">
                          <span className="trk-theme-card-name">{t(item.labelKey)}</span>
                          <span className="trk-theme-card-sculp">{t(item.sculptureKey)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  className="trk-prefs-row"
                  onClick={onToggleStickyMode}
                  aria-pressed={stickyMode}
                >
                  <span className="trk-prefs-row-label">
                    <Pin size={14} />
                    <span>{t("prefs_sticky")}</span>
                  </span>
                  <span className={"trk-switch" + (stickyMode ? " on" : "")} aria-hidden="true">
                    <span className="trk-switch-thumb" />
                  </span>
                </button>

                <button
                  type="button"
                  className="trk-prefs-row"
                  onClick={onToggleCelebrations}
                  aria-pressed={celebrationsOn}
                >
                  <span className="trk-prefs-row-label">
                    <PartyPopper size={14} />
                    <span>{t("prefs_celebrations")}</span>
                  </span>
                  <span className={"trk-switch" + (celebrationsOn ? " on" : "")} aria-hidden="true">
                    <span className="trk-switch-thumb" />
                  </span>
                </button>
              </div>

              <div className="trk-prefs-divider" />

              <div className="trk-prefs-section">
                <div className="trk-prefs-lang-row">
                  <span className="trk-prefs-section-title">{t("prefs_language")}</span>
                  <LangSwitch />
                </div>
              </div>

              <div className="trk-prefs-divider" />

              <div className="trk-prefs-section">
                <div className="trk-prefs-section-title">{t("prefs_data")}</div>
                <div className="trk-prefs-data-actions">
                  <button
                    type="button"
                    className="trk-prefs-data-btn"
                    onClick={() => {
                      setPrefsOpen(false);
                      onImport();
                    }}
                    disabled={ioBusy}
                  >
                    <Upload size={14} />
                    <span>{t("import_data")}</span>
                  </button>
                  <button
                    type="button"
                    className="trk-prefs-data-btn"
                    onClick={() => {
                      setPrefsOpen(false);
                      onExport();
                    }}
                    disabled={ioBusy}
                  >
                    <Download size={14} />
                    <span>{t("export_data")}</span>
                  </button>
                </div>
              </div>

              <div className="trk-prefs-divider" />

              <div className="trk-prefs-section">
                <button
                  type="button"
                  className="trk-prefs-row"
                  onClick={() => {
                    setPrefsOpen(false);
                    onOpenTutorial();
                  }}
                >
                  <span className="trk-prefs-row-label">
                    <HelpCircle size={14} />
                    <span>{t("prefs_help")}</span>
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
