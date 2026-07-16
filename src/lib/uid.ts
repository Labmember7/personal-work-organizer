/** Identifiant unique (UUID natif, repli horodatage+aléa). */
export const uid = (): string =>
  crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
