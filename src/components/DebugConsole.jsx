import React, { useEffect, useRef, useState } from "react";
import { Bug, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useLang } from "../i18n.jsx";
import { clearLog, installHostConsoleCapture, subscribeLog } from "../lib/debugLog";

// Bandeau de débogage, toujours monté en haut de l'app (cf. App.jsx), au-dessus
// de tout le reste (plein écran plugin compris) : le seul endroit où voir en
// direct la console de l'hôte ET celle d'un plugin (relayée via la capacité
// "debug", cf. usePluginHost/plugin:log) sans ouvrir les devtools et sans
// avoir à deviner dans quel contexte (fenêtre principale ou iframe sandboxée)
// chercher. Outil de diagnostic : pas de traduction soignée au-delà du
// minimum, pas d'animation, replié par défaut pour ne jamais gêner l'usage
// normal de l'app.
export function DebugConsole() {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState([]);
  const [filter, setFilter] = useState("");
  const bodyRef = useRef(null);

  useEffect(() => {
    installHostConsoleCapture();
    return subscribeLog(setEntries);
  }, []);

  useEffect(() => {
    if (open && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [entries, open]);

  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? entries.filter((e) => e.source.toLowerCase().includes(needle) || e.text.toLowerCase().includes(needle))
    : entries;

  return (
    <div className={"trk-debug-console" + (open ? " open" : "")}>
      <button type="button" className="trk-debug-toggle" onClick={() => setOpen((o) => !o)}>
        <Bug size={12} />
        <span>{t("debug_console_title")}</span>
        {entries.length > 0 && <span className="trk-debug-count">{entries.length}</span>}
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && (
        <div className="trk-debug-panel">
          <div className="trk-debug-toolbar">
            <input
              className="trk-debug-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("debug_console_filter_placeholder")}
            />
            <button type="button" className="trk-icon-btn" onClick={clearLog} title={t("debug_console_clear")}>
              <Trash2 size={13} />
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
      )}
    </div>
  );
}
