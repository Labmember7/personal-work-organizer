import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ breaks: true, gfm: true });

// Autorise le scheme app-image: (images collées, servies par le protocole
// privilégié de main.js) en plus du set par défaut de DOMPurify.
const ALLOWED_URI_REGEXP =
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|app-image):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i;

// Cache LRU borné : évite de relancer marked + DOMPurify sur une description
// déjà rendue lors de la navigation entre tâches ou modales.
const MAX_MD_CACHE = 128;
const mdCache = new Map<string, string>();

// Rendu markdown -> HTML assaini, utilisé pour l'aperçu de la description
// d'une tâche. C'est LA frontière XSS de l'app : le contenu peut provenir
// d'un import JSON externe, tout passe par DOMPurify.
export const renderMarkdown = (text: unknown): string => {
  const src = String(text || "");
  if (!src) return "";
  const hit = mdCache.get(src);
  if (hit !== undefined) {
    mdCache.delete(src);
    mdCache.set(src, hit);
    return hit;
  }
  const html = DOMPurify.sanitize(marked.parse(src) as string, { ALLOWED_URI_REGEXP });
  if (mdCache.size >= MAX_MD_CACHE) {
    const oldest = mdCache.keys().next().value;
    if (oldest !== undefined) mdCache.delete(oldest);
  }
  mdCache.set(src, html);
  return html;
};
