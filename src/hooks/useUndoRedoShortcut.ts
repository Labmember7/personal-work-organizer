import { useEffect, useRef } from "react";

interface Options {
  undo: () => void;
  redo: () => void;
}

// Raccourcis globaux Ctrl+Z (undo) / Ctrl+Y ou Ctrl+Shift+Z (redo).
// Un seul listener pour toute la durée de vie de l'app (refs pour lire les
// dernières callbacks) : pas de ré-abonnement à chaque rendu, pas de fuite.
// Ignoré quand le focus est dans un champ éditable, pour laisser le
// undo/redo natif du navigateur agir dans les inputs/textarea.
export function useUndoRedoShortcut({ undo, redo }: Options): void {
  const undoRef = useRef(undo);
  undoRef.current = undo;
  const redoRef = useRef(redo);
  redoRef.current = redo;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      const isUndo = key === "z" && !e.shiftKey;
      const isRedo = key === "y" || (key === "z" && e.shiftKey);
      if (!isUndo && !isRedo) return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;

      e.preventDefault();
      if (isUndo) undoRef.current();
      else redoRef.current();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
