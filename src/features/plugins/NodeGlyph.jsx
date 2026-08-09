import React from "react";

// Glyphe signature de la section Plugins : trois nœuds reliés à une racine.
// Choisi pour ce qu'il représente vraiment ici, pas comme décoration : un
// plugin est un module qui se greffe sur l'app (une branche de plus), et le
// seul plugin livré (la carte mentale) est littéralement fait de nœuds
// reliés. Le même glyphe sert pour l'état vide et l'attente de chargement.
export function NodeGlyph({ pulse = false }) {
  return (
    <svg
      className={"trk-node-glyph" + (pulse ? " trk-node-glyph-pulse" : "")}
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <path d="M20 21 L10 32 M20 21 L30 32 M20 21 L20 8" stroke="var(--border)" strokeWidth="1.5" />
      <circle cx="20" cy="8" r="4.5" fill="var(--accent)" />
      <circle cx="10" cy="32" r="4" fill="var(--panel-alt)" stroke="var(--border)" strokeWidth="1.5" />
      <circle cx="30" cy="32" r="4" fill="var(--panel-alt)" stroke="var(--border)" strokeWidth="1.5" />
    </svg>
  );
}
