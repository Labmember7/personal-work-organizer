// CRUD des documents d'un plugin : un document = une clé du store
// (`plugin-doc:<pluginId>:<docId>`). Écriture debouncée (~400 ms), flushée au
// changement de document actif et au démontage, pour qu'une frappe juste
// avant de fermer la vue Plugins ne se perde pas derrière le debounce.

import { useEffect, useRef, useState } from "react";
import { applyPatch, createDocument, DOC_KEY_PREFIX, docStorageKey, normalizeDocument, summaryOf } from "../../lib/plugins/document";
import type { PluginDocPatch, PluginDocScope, PluginDocSummary, PluginDocument } from "../../lib/plugins/types";
import { deleteValue, listKeys, loadValue, saveValue } from "../../services/storage";

const SAVE_DEBOUNCE_MS = 400;

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
  const [loading, setLoading] = useState(true);
  const [byId, setById] = useState<Record<string, PluginDocument>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  // Refs "dernière valeur" pour le flush au démontage et le debounce, qui ne
  // doivent jamais lire un état de rendu périmé (cf. useTasks.ts).
  const byIdRef = useRef(byId);
  byIdRef.current = byId;
  const pendingIdRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!pluginId) {
      setById({});
      setActiveId(null);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const keys = await listKeys(`${DOC_KEY_PREFIX}${pluginId}:`);
      const loaded: Record<string, PluginDocument> = {};
      for (const key of keys) {
        const raw = await loadValue<unknown>(key);
        if (raw === null) continue;
        const doc = normalizeDocument(raw, pluginId);
        if (doc) loaded[doc.id] = doc;
      }
      if (cancelled) return;
      setById(loaded);
      const sorted = Object.values(loaded).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      setActiveId(sorted[0]?.id ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [pluginId]);

  const flush = (id: string | null) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!id || !pluginId) return;
    const doc = byIdRef.current[id];
    if (!doc) return;
    setSaving(true);
    saveValue(docStorageKey(pluginId, id), doc)
      .then((ok) => setSaveError(!ok))
      .catch(() => setSaveError(true))
      .finally(() => setSaving(false));
  };

  useEffect(() => {
    return () => flush(pendingIdRef.current);
    // Flush au démontage uniquement : `flush` lit toujours l'état courant via
    // byIdRef, pas besoin de le relancer à chaque changement de dépendance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scheduleSave = (id: string) => {
    pendingIdRef.current = id;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flush(id), SAVE_DEBOUNCE_MS);
  };

  const selectDoc = (id: string | null) => {
    flush(pendingIdRef.current);
    pendingIdRef.current = null;
    setActiveId(id);
  };

  const createDoc = (title: string, scope: PluginDocScope): PluginDocument => {
    if (!pluginId) throw new Error("createDoc appelé sans plugin sélectionné");
    const doc = createDocument({ pluginId, pluginVersion, title, scope, dataVersion: 1, data: null });
    setById((prev) => ({ ...prev, [doc.id]: doc }));
    setActiveId(doc.id);
    scheduleSave(doc.id);
    return doc;
  };

  const renameDoc = (id: string, title: string) => {
    setById((prev) => {
      const doc = prev[id];
      if (!doc) return prev;
      return { ...prev, [id]: applyPatch(doc, { data: doc.data, title }) };
    });
    scheduleSave(id);
  };

  const deleteDoc = (id: string) => {
    if (timerRef.current && pendingIdRef.current === id) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      pendingIdRef.current = null;
    }
    setById((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setActiveId((current) => (current === id ? null : current));
    if (pluginId) void deleteValue(docStorageKey(pluginId, id));
  };

  const saveActive = (patch: PluginDocPatch) => {
    if (!activeId) return;
    setById((prev) => {
      const doc = prev[activeId];
      if (!doc) return prev;
      return { ...prev, [activeId]: applyPatch(doc, patch) };
    });
    scheduleSave(activeId);
  };

  const docs = Object.values(byId)
    .map(summaryOf)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return {
    loading,
    docs,
    activeId,
    activeDoc: activeId ? byId[activeId] ?? null : null,
    selectDoc,
    createDoc,
    renameDoc,
    deleteDoc,
    saveActive,
    saving,
    saveError,
  };
}
