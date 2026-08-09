import React, { useEffect, useMemo, useState } from "react";
import * as LucideIcons from "lucide-react";
import { AlertTriangle, Puzzle, X } from "lucide-react";
import { useLang, pluginDict } from "../../i18n.jsx";
import { HelpTip } from "../../tips.jsx";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { pushLog } from "../../lib/debugLog";
import { localized, scopesOf } from "../../lib/plugins/manifest";
import { projectSnapshot, themeSnapshot } from "../../lib/plugins/projection";
import { discoverPlugins } from "../../services/plugins";
import { NodeGlyph } from "./NodeGlyph.jsx";
import { PluginDocBar } from "./PluginDocBar.jsx";
import { PluginFrame } from "./PluginFrame.jsx";
import { usePluginDocs } from "./usePluginDocs";
import { usePluginHost } from "./usePluginHost";

const LOAD_ERROR_KEYS = {
  "no-manifest": "plugin_error_no_manifest",
  "invalid-manifest": "plugin_error_invalid_manifest",
  "api-too-new": "plugin_error_api_too_new",
  unreadable: "plugin_error_unreadable",
};

// Icône du plugin : celle déclarée dans son manifeste (nom lucide-react),
// repli sur Puzzle si absente ou inconnue — un plugin ne doit jamais rester
// sans icône, même écrit avant l'ajout d'une icône à la bibliothèque.
function iconFor(name) {
  return (name && LucideIcons[name]) || Puzzle;
}

// La vue « Plugins » : découverte des fichiers .html de `plugins/`, sélection
// du plugin puis de son document, et le pont vers l'iframe sandboxée. Toute
// la mutation des tâches reste hors de portée : ce module ne fait que lire
// et afficher (cf. PLUGIN_PLAN.md, § Deux décisions arbitrées).
export function PluginsSection({ tasks, projects, theme, randomSeed, onRevealTask, onToast }) {
  const { t, lang } = useLang();
  const [discovering, setDiscovering] = useState(true);
  const [plugins, setPlugins] = useState([]);
  const [loadErrors, setLoadErrors] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await discoverPlugins();
      if (cancelled) return;
      setPlugins(result.plugins);
      setLoadErrors(result.errors);
      setDiscovering(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activePlugin = plugins.find((p) => p.manifest.id === selectedId) ?? plugins[0] ?? null;
  const pluginId = activePlugin?.manifest.id ?? null;

  const docsStore = usePluginDocs(pluginId, activePlugin?.manifest.version);
  const scopes = activePlugin ? scopesOf(activePlugin.manifest) : ["global", "project"];

  // Un plugin "singleton" (une carte, pas une liste) n'a pas d'affordance
  // pour créer son propre document : l'hôte lui en garantit un.
  useEffect(() => {
    if (activePlugin?.manifest.singleton && !docsStore.loading && docsStore.docs.length === 0) {
      docsStore.createDoc(localized(activePlugin.manifest.name, lang), { kind: "global" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlugin, docsStore.loading, docsStore.docs.length]);

  const snapshot = useMemo(() => projectSnapshot(tasks, projects), [tasks, projects]);

  const [hostTheme, setHostTheme] = useState(() => themeSnapshot(theme, theme !== "light"));
  useEffect(() => {
    // Le prochain rendu a déjà posé la classe de thème sur .trk-app : les
    // jetons calculés ici sont ceux du nouveau thème, pas de l'ancien.
    setHostTheme(themeSnapshot(theme, theme !== "light", document.querySelector(".trk-app")));
  }, [theme, randomSeed]);

  const dict = useMemo(() => pluginDict(lang), [lang]);

  const host = usePluginHost({
    plugin: activePlugin,
    doc: docsStore.activeDoc,
    snapshot,
    theme: hostTheme,
    lang,
    dict,
    onDocPatch: docsStore.saveActive,
    onRevealTask,
    onToast,
    onFullscreen: setFullscreen,
    onLog: (pid, level, args) => pushLog("plugin:" + pid, level, ...args),
  });

  // Sortie plein écran côté hôte (bouton visible pendant le plein écran, ou
  // Échap) : symétrique de la demande du plugin (`plugin:fullscreen`), pour
  // que l'utilisateur ne dépende jamais uniquement du bouton interne du
  // plugin — cf. ChartCard.useEscapeKey pour le même motif sur les graphiques.
  // On notifie aussi le plugin (`host:fullscreen`) pour que son propre bouton
  // reste synchronisé même s'il n'a pas initié la sortie lui-même.
  const exitFullscreen = () => {
    setFullscreen(false);
    host.post({ type: "host:fullscreen", on: false });
  };
  useEscapeKey(exitFullscreen, fullscreen);

  if (discovering) return <div className="trk-loading">{t("loading")}</div>;

  if (plugins.length === 0) {
    return (
      <div className="trk-empty trk-empty-rich trk-plugins-empty">
        <NodeGlyph />
        <p>{t("plugin_none_installed")}</p>
        <code className="trk-plugin-path-hint">plugins/*.html</code>
        {loadErrors.length > 0 && (
          <ul className="trk-plugin-errors">
            {loadErrors.map((err) => (
              <li key={`${err.origin}:${err.file}`}>
                <AlertTriangle size={12} />
                <span>
                  <strong>{err.file}</strong> — {t(LOAD_ERROR_KEYS[err.reason] ?? "plugin_error_invalid_manifest")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const ActiveIcon = iconFor(activePlugin?.manifest.icon);

  return (
    <div className="trk-plugins">
      {!fullscreen && (
        <div className="trk-plugins-head">
          {plugins.length > 1 ? (
            <div className="trk-view-switch trk-plugin-switch">
              {plugins.map((p) => {
                const Icon = iconFor(p.manifest.icon);
                return (
                  <button
                    key={p.manifest.id}
                    type="button"
                    className={"trk-view-btn" + (p.manifest.id === pluginId ? " active" : "")}
                    onClick={() => setSelectedId(p.manifest.id)}
                    title={localized(p.manifest.name, lang)}
                    aria-pressed={p.manifest.id === pluginId}
                  >
                    <Icon size={14} /> <span className="trk-view-label">{localized(p.manifest.name, lang)}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="trk-plugins-title">
              <ActiveIcon size={15} />
              <span>{localized(activePlugin?.manifest.name, lang)}</span>
            </div>
          )}
          <HelpTip tipKey="plugins" />
          {loadErrors.length > 0 && (
            <span className="trk-plugin-errors-badge" title={loadErrors.map((e) => e.file).join(", ")}>
              <AlertTriangle size={12} /> {loadErrors.length}
            </span>
          )}
        </div>
      )}

      {/* En plein écran, le cadre du plugin ET tout ce qui doit rester
          cliquable (barre de documents, sortie) vivent dans le MÊME élément
          `position: fixed` — même motif que ChartCard/.trk-modal-overlay,
          qui imbrique son en-tête au lieu de le laisser en frère. Un frère
          statique se ferait simplement recouvrir par le cadre fixe. */}
      <div className={"trk-plugin-body" + (fullscreen ? " trk-plugin-body--fullscreen" : "")}>
        {fullscreen && (
          <div className="trk-plugin-fullscreen-bar">
            <div className="trk-plugin-fullscreen-title">
              <ActiveIcon size={14} />
              <span>{localized(activePlugin?.manifest.name, lang)}</span>
            </div>
            <button
              type="button"
              className="trk-icon-btn"
              onClick={exitFullscreen}
              title={t("plugin_fullscreen_exit")}
              aria-label={t("plugin_fullscreen_exit")}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {!activePlugin?.manifest.singleton && (
          <PluginDocBar
            docs={docsStore.docs}
            activeId={docsStore.activeId}
            onSelect={docsStore.selectDoc}
            projects={projects}
            scopes={scopes}
            onCreate={docsStore.createDoc}
            onRename={docsStore.renameDoc}
            onDelete={docsStore.deleteDoc}
          />
        )}

        {docsStore.loading || !activePlugin ? (
          <div className="trk-loading">{t("loading")}</div>
        ) : docsStore.activeDoc ? (
          <PluginFrame
            iframeRef={host.iframeRef}
            ready={host.ready}
            src={activePlugin.url}
            title={localized(activePlugin.manifest.name, lang)}
            reloadKey={reloadKey}
            onReload={() => setReloadKey((k) => k + 1)}
            fullscreen={fullscreen}
          />
        ) : (
          <div className="trk-empty trk-empty-rich trk-plugins-empty">
            <NodeGlyph />
            <p>{t("plugin_doc_none_hint")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
