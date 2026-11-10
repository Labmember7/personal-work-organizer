import React from "react";
import { createRoot } from "react-dom/client";
// Polices embarquées localement : l'app (AppImage portable) doit rester
// utilisable hors ligne, sans requête vers Google Fonts au démarrage.
// Sous-ensembles latin + latin-ext uniquement (suffisants pour le français).
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-700.css";
import "@fontsource/space-grotesk/latin-ext-500.css";
import "@fontsource/space-grotesk/latin-ext-700.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-ext-400.css";
import "@fontsource/inter/latin-ext-500.css";
import "@fontsource/inter/latin-ext-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-ext-400.css";
import "@fontsource/ibm-plex-mono/latin-ext-500.css";
import "@fontsource/patrick-hand/latin-400.css";
import "@fontsource/patrick-hand/latin-ext-400.css";
import "./styles/index.css";
import App from "./App.jsx";
import { LanguageProvider } from "./i18n.jsx";
import { initTauriBridge } from "./services/tauriBridge";
import { initPerformanceMonitoring } from "./lib/performanceMonitor";
import { isPetWindow } from "./services/desktopPet";
import { DesktopPetWindow } from "./features/desktopPet/DesktopPetWindow.jsx";

initTauriBridge();
initPerformanceMonitoring();

if (isPetWindow()) {
  document.documentElement.classList.add("pet-window-mode");
  createRoot(document.getElementById("root")).render(
    <LanguageProvider>
      <DesktopPetWindow />
    </LanguageProvider>
  );
} else {
  createRoot(document.getElementById("root")).render(
    <LanguageProvider>
      <App />
    </LanguageProvider>
  );
}
