import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

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

  useEffect(() => {
    try {
      const raw = write ? write(value) : (value as unknown as string);
      if (raw === null || raw === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, raw);
    } catch (e) {
      // stockage indisponible : l'état reste appliqué pour la session
    }
  }, [key, value, write]);

  return [value, setValue];
}
