import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from "react";
import fr from "./fr";
import en from "./en";
import { plural } from "./plural";

export const LANG_STORAGE_KEY = "suivi-travaux-lang";

export type Lang = "fr" | "en";
type Dict = Record<string, string>;
export type Translate = (key: string) => string;

const dict: Record<Lang, Dict> = { fr, en };
const LOCALES: Record<Lang, string> = { fr: "fr-FR", en: "en-US" };

interface LangContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Translate;
  locale: string;
}

const LangContext = createContext<LangContextValue | null>(null);

const isLang = (v: string | null): v is Lang => v === "fr" || v === "en";

const dictFor = (lang: string): Dict => (isLang(lang) ? dict[lang] : dict.fr);

// Interpole un gabarit du dictionnaire : "{n} tâche{s}" + {n: 2, s: "s"}.
const format = (template: string, vars: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""));

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Toute valeur hors fr/en (stockage corrompu ou modifié à la main) ferait
  // planter t() au premier rendu : on ne garde que les langues connues.
  const [lang, setLang] = useState<Lang>(() => {
    try {
      const stored = localStorage.getItem(LANG_STORAGE_KEY);
      return isLang(stored) ? stored : "fr";
    } catch (e) {
      return "fr";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch (e) {
      // stockage indisponible, la langue reste appliquée pour la session
    }
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback<Translate>(
    (key) => dict[lang][key] ?? dict.fr[key] ?? key,
    [lang]
  );

  // Valeur mémoïsée : sans ça, chaque rendu du provider recréait { t, ... }
  // et re-rendait tous les consommateurs de useLang.
  const value = useMemo<LangContextValue>(
    () => ({ lang, setLang, t, locale: LOCALES[lang] }),
    [lang, t]
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang doit être utilisé sous <LanguageProvider>");
  return ctx;
}

// ── Libellés composés : gabarits du dictionnaire + suffixe pluriel commun ──

export const newTaskLabel = (t: Translate, editingId: string | null): string =>
  editingId ? t("edit_task") : t("new_task");

export const doneOfTotal = (lang: string, done: number, total: number): string =>
  format(dictFor(lang).done_of_total!, { done, total });

export const tasksTotalLabel = (lang: string, n: number): string =>
  format(dictFor(lang).tasks_total!, { n, s: plural(lang, n) });

export const allProjectsLabel = (lang: string, n: number): string =>
  format(dictFor(lang).all_projects!, { n });

export const selectedCountLabel = (lang: string, n: number): string =>
  format(dictFor(lang).selected_count!, { n, s: plural(lang, n) });

export const pageOfLabel = (lang: string, page: number, total: number): string =>
  format(dictFor(lang).page_of!, { page, total });

export const statusCountLabel = (t: Translate, lang: string, n: number): string => {
  if (n === 0) return t("all_statuses");
  return format(dictFor(lang).status_count!, { n, s: plural(lang, n, lang === "fr" ? "s" : "es") });
};
