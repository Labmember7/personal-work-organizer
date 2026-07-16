import { useEffect, useRef, type RefObject } from "react";

type Target = RefObject<Element | null> | (() => Element | null | undefined);

// Appelle onOutside quand un mousedown a lieu hors du ou des éléments visés.
// `refs` : une ref, une fonction () => élément, ou un tableau des deux
// (plusieurs cibles = popover + son bouton d'ancrage, par exemple).
// `enabled` évite d'écouter le document quand le popover est fermé.
export function useOutsideClick(
  refs: Target | Target[],
  onOutside: (e: MouseEvent) => void,
  enabled: boolean = true
): void {
  const onOutsideRef = useRef(onOutside);
  onOutsideRef.current = onOutside;
  const refsRef = useRef(refs);
  refsRef.current = refs;

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: MouseEvent) => {
      const current = refsRef.current;
      const targets = (Array.isArray(current) ? current : [current])
        .map((r) => (typeof r === "function" ? r() : r.current))
        .filter((el): el is Element => !!el);
      if (targets.length && !targets.some((el) => el.contains(e.target as Node))) {
        onOutsideRef.current(e);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [enabled]);
}
