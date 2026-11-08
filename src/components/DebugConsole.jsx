import React, { useEffect, useRef, useState } from "react";
import { AnimatedNumber } from "./AnimatedNumber.jsx";
import { Bug, ChevronUp, Trash2 } from "lucide-react";
import { useLang } from "../i18n.jsx";
import { clearLog, installHostConsoleCapture, subscribeLog } from "../lib/debugLog";
import { useOutsideClick } from "../hooks/useOutsideClick";

// Bandeau de débogage, toujours monté en haut de l'app (cf. App.jsx), au-dessus
// de tout le reste (plein écran plugin compris) : le seul endroit où voir en
// direct la console de l'hôte ET celle d'un plugin (relayée via la capacité
// "debug", cf. usePluginHost/plugin:log) sans ouvrir les devtools et sans
// avoir à deviner dans quel contexte (fenêtre principale ou iframe sandboxée)
// chercher. Outil de diagnostic : pas de traduction soignée au-delà du
// minimum, replié par défaut pour ne jamais gêner l'usage normal de l'app.
//
// Habillage « Dynamic Island » : une seule pilule noire qui se MORPHE (taille,
// rayon) entre l'état compact et le panneau ouvert, avec un ressort ; le
// contenu fond/flou en décalé. Un nouveau log fait « respirer » la pilule.
export function DebugConsole() {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState([]);
  const [filter, setFilter] = useState("");
  const [pulse, setPulse] = useState(0);
  const bodyRef = useRef(null);
  const containerRef = useRef(null);
  const lastLen = useRef(0);

  useOutsideClick(containerRef, () => setOpen(false), open);

  useEffect(() => {
    installHostConsoleCapture();
    return subscribeLog(setEntries);
  }, []);

  useEffect(() => {
    if (entries.length > lastLen.current && !open) setPulse((p) => p + 1);
    lastLen.current = entries.length;
  }, [entries, open]);

  useEffect(() => {
    if (open && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [entries, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? entries.filter((e) => e.source.toLowerCase().includes(needle) || e.text.toLowerCase().includes(needle))
    : entries;
  const last = entries[entries.length - 1];
  const level = entries.some((e) => e.level === "error") ? "error" : entries.some((e) => e.level === "warn") ? "warn" : "ok";

  return (
    <div ref={containerRef} className={"trk-debug-console trk-island" + (open ? " open" : "")}>
      <div key={pulse} className={"trk-island-shell" + (pulse ? " pulse" : "")}>
        <button
          type="button"
          className="trk-debug-toggle trk-island-compact"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          tabIndex={open ? -1 : 0}
        >
          <span className={"trk-island-dot " + level} />
          <Bug size={12} />
          <span className="trk-island-label">{t("debug_console_title")}</span>
          {entries.length > 0 && (
            <span className="trk-debug-count">
              <AnimatedNumber value={entries.length} />
            </span>
          )}
        </button>

        <div className="trk-debug-panel trk-island-expanded" aria-hidden={!open}>
          <div className="trk-debug-toolbar">
            <span className={"trk-island-dot " + level} />
            <Bug size={13} className="trk-island-icon" />
            <input
              className="trk-debug-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("debug_console_filter_placeholder")}
              tabIndex={open ? 0 : -1}
            />
            <button type="button" className="trk-island-btn" onClick={clearLog} title={t("debug_console_clear")} tabIndex={open ? 0 : -1}>
              <Trash2 size={13} />
            </button>
            <button type="button" className="trk-island-btn" onClick={() => setOpen(false)} title={t("close")} tabIndex={open ? 0 : -1}>
              <ChevronUp size={14} />
            </button>
          </div>
          <div className="trk-debug-body" ref={bodyRef}>
            {shown.length === 0 && <div className="trk-debug-empty">{t("debug_console_empty")}</div>}
            {shown.map((e) => (
              <div key={e.id} className={"trk-debug-line trk-debug-" + e.level}>
                <span className="trk-debug-time">{e.at.slice(11, 19)}</span>
                <span className="trk-debug-source">{e.source}</span>
                <span className="trk-debug-text">{e.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {!open && last && <span className="trk-sr-only" aria-live="polite">{last.text}</span>}
    </div>
  );
}
