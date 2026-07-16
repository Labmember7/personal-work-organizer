import { useEffect, useRef } from "react";

// Appelle onEscape à l'appui sur Échap (écouteur document, actif seulement
// quand `enabled` est vrai). Le callback est lu via une ref : il voit
// toujours l'état du dernier rendu sans ré-abonner l'écouteur.
export function useEscapeKey(onEscape: (e: KeyboardEvent) => void, enabled: boolean = true): void {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscapeRef.current(e);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [enabled]);
}
