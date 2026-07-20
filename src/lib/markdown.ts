import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ breaks: true, gfm: true });

// Autorise le scheme app-image: (images collées, servies par le protocole
// privilégié de main.js) en plus du set par défaut de DOMPurify.
const ALLOWED_URI_REGEXP =
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|app-image):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i;

// Rendu markdown -> HTML assaini, utilisé pour l'aperçu de la description
// d'une tâche. C'est LA frontière XSS de l'app : le contenu peut provenir
// d'un import JSON externe, tout passe par DOMPurify.
export const renderMarkdown = (text: unknown): string =>
  DOMPurify.sanitize(marked.parse(String(text || "")) as string, { ALLOWED_URI_REGEXP });
