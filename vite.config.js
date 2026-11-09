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
  "img-src 'self' data: blob: app-image:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  // `default-src 'self'` couvrirait sinon `frame-src`, ce qui bloquerait
  // l'iframe des plugins (scheme dédié, cf. ARCHITECTURE.md).
  "frame-src 'self' app-plugin:",
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
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("recharts") || id.includes("d3-")) {
              return "vendor-charts";
            }
            if (id.includes("@tiptap") || id.includes("prosemirror")) {
              return "vendor-editor";
            }
            if (id.includes("lucide-react")) {
              return "vendor-icons";
            }
            if (id.includes("dompurify") || id.includes("turndown") || id.includes("marked")) {
              return "vendor-markdown";
            }
            return "vendor";
          }
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
});
