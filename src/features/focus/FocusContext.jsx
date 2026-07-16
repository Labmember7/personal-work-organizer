import React, { createContext, useContext, useMemo, useState, useEffect } from "react";
import { liveTaskMinutes } from "../../utils";
import { useInterval } from "../../hooks/useInterval";

// Contexte de la session de focus : identifiant de la tâche focalisée et
// horodatage de début. Permet aux affichages de temps (badges, popovers,
// cartes kanban) de calculer leur temps « en direct » localement, sans que
// l'App entière ne re-rende toutes les 10 s (chaque consommateur a son
// propre tick, actif seulement pour la tâche focalisée).
const FocusCtx = createContext({ focusId: null, focusStartedAt: null });

export function FocusProvider({ focusId, focusStartedAt, children }) {
  const value = useMemo(() => ({ focusId, focusStartedAt }), [focusId, focusStartedAt]);
  return <FocusCtx.Provider value={value}>{children}</FocusCtx.Provider>;
}

export function useFocusInfo() {
  return useContext(FocusCtx);
}

// Temps logué de la tâche + temps de focus en cours, rafraîchi toutes les
// 10 s uniquement si cette tâche est celle en focus.
export function useLiveMinutes(task) {
  const { focusId, focusStartedAt } = useFocusInfo();
  const isFocused = !!(task && focusId === task.id && focusStartedAt);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (isFocused) setNow(Date.now());
  }, [isFocused, focusStartedAt]);
  useInterval(() => setNow(Date.now()), isFocused ? 10000 : null);
  return liveTaskMinutes(task, focusId, focusStartedAt, now);
}
