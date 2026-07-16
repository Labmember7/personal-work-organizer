import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ breaks: true, gfm: true });

// Rendu markdown -> HTML assaini, utilisé pour l'aperçu de la description
// d'une tâche. C'est LA frontière XSS de l'app : le contenu peut provenir
// d'un import JSON externe, tout passe par DOMPurify.
export const renderMarkdown = (text: unknown): string =>
  DOMPurify.sanitize(marked.parse(String(text || "")) as string);
