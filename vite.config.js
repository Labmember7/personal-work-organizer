import { resolve } from "node:path";
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

// Les webviews Tauri (WebKitGTK, WKWebView, WebView2) supportent tous WOFF2 :
// supprimer le repli .woff évite d'embarquer 16 fichiers de police doublons.
const stripLegacyWoff = () => ({
  name: "strip-legacy-woff",
  enforce: "pre",
  transform(code, id) {
    if (!id.includes("@fontsource") || !id.endsWith(".css")) return null;
    const next = code.replace(/,\s*url\([^)]+\.woff\)\s*format\(['"]woff['"]\)/g, "");
    return next === code ? null : { code: next, map: null };
  },
});

export default defineConfig({
  plugins: [react(), injectCsp(), stripLegacyWoff()],
  base: "./",
  optimizeDeps: {
    // Limite la pré-analyse Vite aux deux entrées de l'app (évite de scanner
    // plugins/**/index.html dont l'importmap "trk:sdk" est servi à l'exécution).
    entries: ["index.html", "pet.html"],
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        pet: resolve(__dirname, "pet.html"),
      },
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("recharts") || id.includes("d3-")) {
              return "vendor-charts";
            }
            if (id.includes("@tiptap") || id.includes("prosemirror")) {
              return "vendor-editor";
            }
            if (id.includes("dompurify") || id.includes("turndown") || id.includes("marked")) {
              return "vendor-markdown";
            }
            if (id.includes("react-dom") || id.includes("react/")) {
              return "vendor-react";
            }
          }
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
});
