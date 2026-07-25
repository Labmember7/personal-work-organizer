import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

interface Codec<T> {
  /** Chaîne brute (ou null si absente) -> valeur d'état. */
  read?: (raw: string | null) => T;
  /** Valeur d'état -> chaîne à stocker ; null/undefined supprime la clé. */
  write?: (value: T) => string | null | undefined;
}

// useState persisté dans localStorage, tolérant aux stockages indisponibles
// (mode privé, quota) : la valeur reste alors appliquée pour la session.
// Par défaut : lecture de la chaîne telle quelle (ou defaultValue si
// absente), écriture de la valeur elle-même.
export function useLocalStorageState<T>(
  key: string,
  defaultValue: T,
  { read, write }: Codec<T> = {}
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (read) return read(raw);
      return raw !== null ? (raw as unknown as T) : defaultValue;
    } catch (e) {
      return defaultValue;
    }
  });

  // `write` est presque toujours une lambda que l'appelant recrée à chaque
  // rendu (codec passé en littéral) : la garder dans les dépendances de
  // l'effet relançait une écriture localStorage SYNCHRONE à chaque rendu du
  // composant, pas seulement quand la valeur change. La ref donne toujours la
  // dernière version sans réveiller l'effet.
  const writeRef = useRef(write);
  writeRef.current = write;

  useEffect(() => {
    try {
      const encode = writeRef.current;
      const raw = encode ? encode(value) : (value as unknown as string);
      if (raw === null || raw === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, raw);
    } catch (e) {
      // stockage indisponible : l'état reste appliqué pour la session
    }
  }, [key, value]);

  return [value, setValue];
}
