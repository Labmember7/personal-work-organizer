import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist/", "release/", "node_modules/"] },

  // Renderer (React) : JS/JSX/TS/TSX de src/.
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: { react, "react-hooks": reactHooks },
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // JSX moderne : pas besoin de React en scope ni de PropTypes ici.
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      // Le contenu du MarkdownEditor passe par DOMPurify (lib/markdown.ts).
      "react/no-danger": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrors: "none" }],
      // Aurait attrapé le bug de closure périmée de la zone de focus (B1).
      "react-hooks/exhaustive-deps": "warn",
      // Règles « React Compiler » du plugin v7 : le motif volontaire
      // « latest ref » (ref.current = valeur pendant le rendu, lue plus tard
      // dans un callback) et les setState de synchronisation dans les effets
      // sont assumés ici — on garde ces règles en simple avertissement.
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/incompatible-library": "warn",
    },
  },

  // Processus principal Electron : CommonJS + Node.
  {
    files: ["main.js", "preload.js", "electron/**/*.js"],
    ignores: ["electron/**/*.test.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      sourceType: "commonjs",
      globals: globals.node,
    },
  },

  // Tests du processus principal : ESM (exécutés par Vitest).
  {
    files: ["electron/**/*.test.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      sourceType: "module",
      globals: globals.node,
    },
  },

  // Fichiers de test : globals vitest via imports explicites, rien à ajouter.

  // Désactive les règles de formatage en conflit avec Prettier.
  prettier
);
