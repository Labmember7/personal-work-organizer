import React, { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useLang } from "../../i18n.jsx";
import { NodeGlyph } from "./NodeGlyph.jsx";

const READY_TIMEOUT_MS = 5000;

// L'iframe du plugin. `allow=""` et `referrerPolicy="no-referrer"` retirent
// tout ce qu'un sandbox "allow-scripts" laisserait passer par ailleurs
// (caméra, géoloc, referrer vers le fichier hôte…) sans que le plugin en ait
// besoin. `reloadKey` force un remontage complet (nouvel iframe, nouvelle
// tentative de `plugin:ready`) sans dupliquer la logique de chargement.
export function PluginFrame({ iframeRef, ready, src, title, reloadKey, onReload, fullscreen, sandbox = "allow-scripts" }) {
  const { t } = useLang();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    setTimedOut(false);
    if (ready) return undefined;
    const timer = setTimeout(() => setTimedOut(true), READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [ready, reloadKey]);

  return (
    <div className={"trk-plugin-frame" + (fullscreen ? " trk-plugin-frame--fullscreen" : "")}>
      <iframe
        key={reloadKey}
        ref={iframeRef}
        src={src}
        title={title}
        className="trk-plugin-iframe"
        sandbox={sandbox}
        allow=""
        referrerPolicy="no-referrer"
      />
      {!ready && (
        <div className="trk-plugin-loading" role="status" aria-live="polite">
          <NodeGlyph pulse={!timedOut} />
          {timedOut ? (
            <>
              <p>{t("plugin_load_timeout")}</p>
              <button type="button" className="trk-btn-secondary" onClick={onReload}>
                <RefreshCw size={13} /> {t("plugin_reload")}
              </button>
            </>
          ) : (
            <p>{t("plugin_loading")}</p>
          )}
        </div>
      )}
    </div>
  );
}
