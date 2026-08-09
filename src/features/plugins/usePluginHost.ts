// Le pont hôte <-> plugin : authentifie les messages entrants (`event.source`),
// les décode via `lib/plugins/bridge.ts` avec les capacités du manifeste, et
// pousse `host:init` / `host:doc` / `host:snapshot` / `host:theme` / `host:lang`
// vers l'iframe. Deux messages n'ont pas de callback dédié : `file:save`
// (export natif, autonome) et `snapshot:refresh` (renvoie juste la dernière
// projection connue) sont traités entièrement ici.

import { useEffect, useRef, useState, type RefObject } from "react";
import { decodePluginMessage, encode } from "../../lib/plugins/bridge";
import { PLUGIN_API_VERSION, type HostMessage, type HostSnapshot, type HostTheme, type PluginDocPatch, type PluginDocument, type PluginMessage, type PluginSource } from "../../lib/plugins/types";
import { savePluginFile } from "../../services/plugins";

interface UsePluginHostOptions {
  plugin: PluginSource | null;
  doc: PluginDocument | null;
  snapshot: HostSnapshot | null;
  theme: HostTheme;
  lang: string;
  dict: Record<string, string>;
  onDocPatch: (patch: PluginDocPatch) => void;
  onRevealTask: (id: string) => void;
  onToast: (message: string) => void;
  onFullscreen: (on: boolean) => void;
  /** Relais diagnostic (capacité "debug") : console.log/warn/error du plugin. */
  onLog?: (pluginId: string, level: "log" | "info" | "warn" | "error", args: string[]) => void;
}

export interface PluginHost {
  iframeRef: RefObject<HTMLIFrameElement>;
  ready: boolean;
  post: (message: HostMessage) => void;
}

export function usePluginHost({
  plugin,
  doc,
  snapshot,
  theme,
  lang,
  dict,
  onDocPatch,
  onRevealTask,
  onToast,
  onFullscreen,
  onLog,
}: UsePluginHostOptions): PluginHost {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  // Refs "dernière valeur" : lues par le gestionnaire de messages (posé une
  // seule fois par plugin, cf. l'effet plus bas), jamais par une fermeture
  // périmée d'un rendu précédent.
  const docRef = useRef(doc);
  docRef.current = doc;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const langRef = useRef(lang);
  langRef.current = lang;
  const dictRef = useRef(dict);
  dictRef.current = dict;
  const onDocPatchRef = useRef(onDocPatch);
  onDocPatchRef.current = onDocPatch;
  const onRevealTaskRef = useRef(onRevealTask);
  onRevealTaskRef.current = onRevealTask;
  const onToastRef = useRef(onToast);
  onToastRef.current = onToast;
  const onFullscreenRef = useRef(onFullscreen);
  onFullscreenRef.current = onFullscreen;
  const onLogRef = useRef(onLog);
  onLogRef.current = onLog;

  const post = (message: HostMessage) => {
    if (!plugin) return;
    iframeRef.current?.contentWindow?.postMessage(encode(plugin.manifest.id, message), "*");
  };
  const postRef = useRef(post);
  postRef.current = post;

  // Un seul écouteur par plugin chargé : le remplacer à chaque changement de
  // doc/thème/langue perdrait un message en vol pendant la bascule.
  useEffect(() => {
    setReady(false);
    // Un changement (ou une disparition) de plugin abandonne l'iframe
    // précédente : le plein écran qu'elle avait demandé n'a plus de sens.
    onFullscreenRef.current(false);
    if (!plugin) return;

    const activePlugin = plugin; // capture non-null : `plugin` est un paramètre stable pour cet effet
    const pluginId = activePlugin.manifest.id;
    const capabilities = activePlugin.manifest.capabilities;

    function dispatch(message: PluginMessage) {
      switch (message.type) {
        case "plugin:ready":
          setReady(true);
          postRef.current({
            type: "host:init",
            apiVersion: PLUGIN_API_VERSION,
            plugin: { id: activePlugin.manifest.id, version: activePlugin.manifest.version },
            lang: langRef.current,
            dict: dictRef.current,
            theme: themeRef.current,
            capabilities,
            doc: docRef.current,
            snapshot: snapshotRef.current,
          });
          break;
        case "plugin:doc:save":
          onDocPatchRef.current(message.patch);
          break;
        case "plugin:dirty":
          // Purement informatif côté hôte pour l'instant (pas d'indicateur
          // "non enregistré" dans l'UI) : rien à faire.
          break;
        case "plugin:snapshot:refresh":
          if (snapshotRef.current) postRef.current({ type: "host:snapshot", snapshot: snapshotRef.current });
          break;
        case "plugin:task:reveal":
          onRevealTaskRef.current(message.id);
          break;
        case "plugin:toast":
          onToastRef.current(message.message);
          break;
        case "plugin:file:save":
          void savePluginFile({ name: message.name, mime: message.mime, base64: message.base64, text: message.text });
          break;
        case "plugin:fullscreen":
          onFullscreenRef.current(message.on);
          break;
        case "plugin:log":
          onLogRef.current?.(pluginId, message.level, message.args);
          break;
        default:
          break;
      }
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const message = decodePluginMessage(event.data, pluginId, capabilities);
      if (message) dispatch(message);
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [plugin]);

  // Un changement de document/snapshot/thème/langue APRÈS le premier
  // `host:init` est poussé explicitement — `host:init` ne le couvre qu'une
  // fois, à la connexion.
  useEffect(() => {
    if (ready) postRef.current({ type: "host:doc", doc });
  }, [ready, doc]);

  useEffect(() => {
    if (ready && snapshot) postRef.current({ type: "host:snapshot", snapshot });
  }, [ready, snapshot]);

  useEffect(() => {
    if (ready) postRef.current({ type: "host:theme", theme });
  }, [ready, theme]);

  useEffect(() => {
    if (ready) postRef.current({ type: "host:lang", lang, dict });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `dict` est un
    // nouvel objet à chaque rendu de l'hôte ; seul un changement de `lang`
    // doit déclencher l'envoi (cf. dictRef, toujours à jour dans host:init).
  }, [ready, lang]);

  return { iframeRef, ready, post };
}
