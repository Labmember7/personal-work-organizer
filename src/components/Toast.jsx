import React from "react";
import { AlertTriangle, Check } from "lucide-react";

// Notification éphémère en bas d'écran (succès ou erreur).
export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div
      className={"trk-toast" + (toast.type === "error" ? " trk-toast-error" : "")}
      role="status"
      aria-live="polite"
    >
      {toast.type === "error" ? <AlertTriangle size={14} /> : <Check size={14} />} {toast.text}
    </div>
  );
}
