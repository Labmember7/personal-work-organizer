import { useEffect, useRef } from "react";

// setInterval déclaratif : le callback est lu via une ref (toujours celui du
// dernier rendu), `delay = null` suspend l'intervalle sans le démonter.
export function useInterval(callback: () => void, delay: number | null | undefined): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (delay === null || delay === undefined) return;
    const iv = setInterval(() => callbackRef.current(), delay);
    return () => clearInterval(iv);
  }, [delay]);
}
