import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// CSP stricte injectée uniquement au build : tout est embarqué (scripts,
// styles, polices), aucune ressource distante n'est autorisée. Pas de CSP en
// dev, le client Vite (HMR) injecte des scripts inline qu'elle bloquerait.
// 'unsafe-inline' sur style-src reste requis (styles inline React/Recharts).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
].join("; ");

const injectCsp = () => ({
  name: "inject-csp",
  apply: "build",
  transformIndexHtml(html) {
    return html.replace(
      "<meta charset=\"UTF-8\" />",
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`
    );
  },
});

export default defineConfig({
  plugins: [react(), injectCsp()],
  base: "./",
});
