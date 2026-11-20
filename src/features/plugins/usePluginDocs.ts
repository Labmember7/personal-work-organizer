// CRUD des documents d'un plugin : un document = une clé du store
// (`plugin-doc:<pluginId>:<docId>`). Écriture debouncée (~400 ms), flushée au
// changement de document actif et au démontage, pour qu'une frappe juste
// avant de fermer la vue Plugins ne se perde pas derrière le debounce.

import { useEffect, useRef, useState } from "react";
import { applyPatch, createDocument, DOC_KEY_PREFIX, docStorageKey, normalizeDocument, summaryOf } from "../../lib/plugins/document";
import type { PluginDocPatch, PluginDocScope, PluginDocSummary, PluginDocument } from "../../lib/plugins/types";
import { deleteValue, listKeys, loadValue, saveValue } from "../../services/storage";

const SAVE_DEBOUNCE_MS = 400;

// Cache mémoire par pluginId : évite de relire séquentiellement le stockage et
// supprime le flash "Chargement..." lors des bascules entre plugins ou onglets.
const docsMemoryCache = new Map<string, Record<string, PluginDocument>>();
const activeIdMemoryCache = new Map<string, string | null>();

function pickInitialActiveId(pluginId: string | null, map: Record<string, PluginDocument>): string | null {
  if (!pluginId) return null;
  const remembered = activeIdMemoryCache.get(pluginId);
  if (remembered && map[remembered]) return remembered;
  const sorted = Object.values(map).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return sorted[0]?.id ?? null;
}

export interface PluginDocsStore {
  loading: boolean;
  docs: PluginDocSummary[];
  activeId: string | null;
  activeDoc: PluginDocument | null;
  selectDoc: (id: string | null) => void;
  createDoc: (title: string, scope: PluginDocScope) => PluginDocument;
  renameDoc: (id: string, title: string) => void;
  deleteDoc: (id: string) => void;
  saveActive: (patch: PluginDocPatch) => void;
  saving: boolean;
  saveError: boolean;
}

// `pluginId` accepte `null` : la vue Plugins appelle ce hook inconditionnellement
// (règle des Hooks), même quand aucun plugin n'est encore sélectionné.
export function usePluginDocs(pluginId: string | null, pluginVersion?: string): PluginDocsStore {
  const cachedInit = pluginId ? docsMemoryCache.get(pluginId) : undefined;
  const [loading, setLoading] = useState(() => Boolean(pluginId && !cachedInit));
  const [loadedPluginId, setLoadedPluginId] = useState<string | null>(() =>
    pluginId && cachedInit ? pluginId : null
  );
  const [byId, setById] = useState<Record<string, PluginDocument>>(() => cachedInit ?? {});
  const [activeId, setActiveId] = useState<string | null>(() =>
    cachedInit ? pickInitialActiveId(pluginId, cachedInit) : null
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  // Refs "dernière valeur" pour le flush au démontage et le debounce, qui ne
  // doivent jamais lire un état de rendu périmé (cf. useTasks.ts).
  const byIdRef = useRef(byId);
  if (loadedPluginId === pluginId) {
    byIdRef.current = byId;
  }
  const pendingRef = useRef<{ pluginId: string; docId: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = (target: { pluginId: string; docId: string } | null) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!target) return;
    const { pluginId: targetPluginId, docId: targetDocId } = target;
    const doc =
      docsMemoryCache.get(targetPluginId)?.[targetDocId] ??
      (targetPluginId === pluginId ? byIdRef.current[targetDocId] : undefined);
    if (!doc) return;
    if (pendingRef.current?.pluginId === targetPluginId && pendingRef.current?.docId === targetDocId) {
      pendingRef.current = null;
    }
    setSaving(true);
    saveValue(docStorageKey(targetPluginId, targetDocId), doc)
      .then((ok) => setSaveError(!ok))
      .catch(() => setSaveError(true))
      .finally(() => setSaving(false));
  };

  useEffect(() => {
    if (pendingRef.current && pendingRef.current.pluginId !== pluginId) {
      flush(pendingRef.current);
    }
    if (!pluginId) {
      byIdRef.current = {};
      setById({});
      setActiveId(null);
      setLoadedPluginId(null);
      setLoading(false);
      return undefined;
    }
    const mem = docsMemoryCache.get(pluginId);
    if (mem) {
      const nextActive = pickInitialActiveId(pluginId, mem);
      activeIdMemoryCache.set(pluginId, nextActive);
      byIdRef.current = mem;
      setById(mem);
      setActiveId(nextActive);
      setLoadedPluginId(pluginId);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const keys = await listKeys(`${DOC_KEY_PREFIX}${pluginId}:`);
      const raws = await Promise.all(keys.map((key) => loadValue<unknown>(key)));
      const loaded: Record<string, PluginDocument> = {};
      for (const raw of raws) {
        if (raw === null) continue;
        const doc = normalizeDocument(raw, pluginId);
        if (doc) loaded[doc.id] = doc;
      }
      if (cancelled) return;
      docsMemoryCache.set(pluginId, loaded);
      const nextActive = pickInitialActiveId(pluginId, loaded);
      activeIdMemoryCache.set(pluginId, nextActive);
      byIdRef.current = loaded;
      setById(loaded);
      setActiveId(nextActive);
      setLoadedPluginId(pluginId);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pluginId]);

  useEffect(() => {
    return () => flush(pendingRef.current);
    // Flush au démontage uniquement : `flush` lit toujours l'état courant via
    // le cache mémoire / byIdRef, pas besoin de le relancer à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scheduleSave = (targetPluginId: string, targetDocId: string) => {
    pendingRef.current = { pluginId: targetPluginId, docId: targetDocId };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flush({ pluginId: targetPluginId, docId: targetDocId }), SAVE_DEBOUNCE_MS);
  };

  // Résolution synchrone pendant la frame de transition de `pluginId` :
  // empêche tout flash du document du plugin précédent ou d'un spinner inutile.
  const synced = loadedPluginId === pluginId;
  const memFallback = !synced && pluginId ? docsMemoryCache.get(pluginId) : undefined;
  const effectiveLoading = synced ? loading : Boolean(pluginId && !memFallback);
  const effectiveById = synced ? byId : (memFallback ?? {});
  const effectiveActiveId = synced
    ? activeId
    : memFallback
      ? pickInitialActiveId(pluginId, memFallback)
      : null;

  const selectDoc = (id: string | null) => {
    flush(pendingRef.current);
    if (pluginId) activeIdMemoryCache.set(pluginId, id);
    setActiveId(id);
  };

  const createDoc = (title: string, scope: PluginDocScope): PluginDocument => {
    if (!pluginId) throw new Error("createDoc appelé sans plugin sélectionné");
    const doc = createDocument({ pluginId, pluginVersion, title, scope, dataVersion: 1, data: null });
    const base = docsMemoryCache.get(pluginId) ?? (synced ? byIdRef.current : {});
    const next = { ...base, [doc.id]: doc };
    docsMemoryCache.set(pluginId, next);
    activeIdMemoryCache.set(pluginId, doc.id);
    byIdRef.current = next;
    setById(next);
    setActiveId(doc.id);
    setLoadedPluginId(pluginId);
    setLoading(false);
    scheduleSave(pluginId, doc.id);
    return doc;
  };

  const renameDoc = (id: string, title: string) => {
    if (!pluginId) return;
    const base = docsMemoryCache.get(pluginId) ?? byIdRef.current;
    const doc = base[id];
    if (!doc) return;
    const next = { ...base, [id]: applyPatch(doc, { data: doc.data, title }) };
    docsMemoryCache.set(pluginId, next);
    byIdRef.current = next;
    setById(next);
    scheduleSave(pluginId, id);
  };

  const deleteDoc = (id: string) => {
    if (!pluginId) return;
    if (timerRef.current && pendingRef.current?.pluginId === pluginId && pendingRef.current?.docId === id) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      pendingRef.current = null;
    }
    const base = docsMemoryCache.get(pluginId) ?? byIdRef.current;
    if (!(id in base)) return;
    const next = { ...base };
    delete next[id];
    docsMemoryCache.set(pluginId, next);
    byIdRef.current = next;
    setById(next);
    const nextActive = effectiveActiveId === id ? pickInitialActiveId(pluginId, next) : effectiveActiveId;
    activeIdMemoryCache.set(pluginId, nextActive);
    setActiveId(nextActive);
    void deleteValue(docStorageKey(pluginId, id));
  };

  const saveActive = (patch: PluginDocPatch) => {
    const targetDocId = effectiveActiveId;
    if (!pluginId || !targetDocId) return;
    const base = docsMemoryCache.get(pluginId) ?? byIdRef.current;
    const doc = base[targetDocId];
    if (!doc) return;
    const updated = applyPatch(doc, patch);
    const next = { ...base, [targetDocId]: updated };
    docsMemoryCache.set(pluginId, next);
    byIdRef.current = next;
    // Les patchs de données (`patch.data` uniquement) mettent à jour le cache et
    // planifient l'écriture disque sans re-rendre React ni renvoyer un écho `host:doc`
    // complet vers l'iframe à chaque interaction.
    if (patch.title !== undefined) {
      setById(next);
    }
    scheduleSave(pluginId, targetDocId);
  };

  const docs = Object.values(effectiveById)
    .map(summaryOf)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return {
    loading: effectiveLoading,
    docs,
    activeId: effectiveActiveId,
    activeDoc: effectiveActiveId ? effectiveById[effectiveActiveId] ?? null : null,
    selectDoc,
    createDoc,
    renameDoc,
    deleteDoc,
    saveActive,
    saving,
    saveError,
  };
}
