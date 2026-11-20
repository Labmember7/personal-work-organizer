// Pont « pet flottant du bureau » : relie la fenêtre principale et la petite
// fenêtre transparente toujours-au-premier-plan qui affiche le compagnon
// quand l'app est réduite avec une tâche en focus ou un timer en cours.
//
// Fonctionne via Tauri ; en navigateur simple (`vite dev`), tout est no-op
// (pas de seconde fenêtre possible).
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { isTauri } from "./tauriBridge";

export interface PetFocusInfo {
  title: string;
  project: string;
}

export interface PetPomoInfo {
  phase: "focus" | "rest";
  timeLeft: number; // secondes restantes au moment de l'envoi
  total: number; // durée totale de la phase (s)
  isRunning: boolean;
  endsAt: number | null; // horodatage de fin si en cours
}

export interface PetState {
  petDna: unknown;
  theme: string;
  mood: string;
  focus: PetFocusInfo | null;
  focusStartedAt: number | null;
  pomo: PetPomoInfo | null;
}

export type PetAction = { type: "togglePomo" } | { type: "dismiss" };

type Unlisten = () => void;

export const PET_WINDOW_HASH = "#pet";

/** Vrai dans la fenêtre du pet (entrée dédiée pet.html ou fallback #pet). */
export function isPetWindow(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.location.hash === PET_WINDOW_HASH ||
    window.location.pathname.endsWith("/pet.html")
  );
}

// Abonnement Tauri synchrone côté appelant : `listen` est asynchrone, on
// retourne un désabonnement qui fonctionne même s'il est appelé avant la
// résolution de la promesse.
function tauriListen<T>(event: string, cb: (payload: T) => void): Unlisten {
  let un: Unlisten | null = null;
  let cancelled = false;
  listen<T>(event, (e) => cb(e.payload))
    .then((u) => {
      if (cancelled) u();
      else un = u;
    })
    .catch(() => {});
  return () => {
    cancelled = true;
    un?.();
  };
}

const noop: Unlisten = () => {};

export function desktopPetSupported(): boolean {
  return isTauri();
}

export const desktopPet = {
  show(): Promise<void> {
    if (isTauri()) return invoke<void>("pet_show").catch(() => {});
    return Promise.resolve();
  },
  hide(): Promise<void> {
    if (isTauri()) return invoke<void>("pet_hide").catch(() => {});
    return Promise.resolve();
  },
  /** Détruit immédiatement la WebView du compagnon (libère la RAM lorsque désactivé). */
  destroy(): Promise<void> {
    if (isTauri()) return invoke<void>("pet_destroy").catch(() => {});
    return Promise.resolve();
  },
  /** Ramène la fenêtre principale au premier plan et masque le pet. */
  restoreMain(): Promise<void> {
    if (isTauri()) return invoke<void>("pet_restore_main").catch(() => {});
    return Promise.resolve();
  },
  sendState(state: PetState): void {
    if (isTauri()) emit("pet:state", state).catch(() => {});
  },
  onState(cb: (state: PetState) => void): Unlisten {
    if (isTauri()) return tauriListen<PetState>("pet:state", cb);
    return noop;
  },
  sendAction(action: PetAction): void {
    if (isTauri()) emit("pet:action", action).catch(() => {});
  },
  onAction(cb: (action: PetAction) => void): Unlisten {
    if (isTauri()) return tauriListen<PetAction>("pet:action", cb);
    return noop;
  },
  /** La fenêtre du pet signale qu'elle est prête à recevoir l'état. */
  notifyReady(): void {
    if (isTauri()) emit("pet:ready", null).catch(() => {});
  },
  onReady(cb: () => void): Unlisten {
    if (isTauri()) return tauriListen<null>("pet:ready", () => cb());
    return noop;
  },
  onMainMinimizedChanged(cb: (minimized: boolean) => void): Unlisten {
    if (isTauri()) return tauriListen<boolean>("main:minimized-changed", cb);
    return noop;
  },
  /** Adapte la fenêtre du pet à sa hitbox réelle sans décaler l'ancrage au sol. */
  syncBounds(width: number, height: number): void {
    if (isTauri()) {
      invoke<void>("pet_sync_bounds", { width, height }).catch(() => {});
    }
  },
  /** Démarre le déplacement manuel du pet (évite les aperçus d'ancrage aux bords de l'écran). */
  startNativeDrag(screenX = 0, screenY = 0): boolean {
    if (isTauri()) {
      invoke<void>("pet_start_drag", { screenX, screenY }).catch(() => {});
      return true;
    }
    return false;
  },
  updateDrag(screenX: number, screenY: number): void {
    if (isTauri()) {
      invoke<void>("pet_update_drag", { screenX, screenY }).catch(() => {});
    }
  },
  endDrag(): void {
    if (isTauri()) {
      invoke<void>("pet_end_drag").catch(() => {});
    }
  },
  isCursorInside(): Promise<boolean> {
    if (isTauri()) {
      return invoke<boolean>("pet_is_cursor_inside").catch(() => false);
    }
    return Promise.resolve(true);
  },
  onPointerLeft(cb: () => void): Unlisten {
    if (isTauri()) return tauriListen<null>("pet:pointer-left", () => cb());
    return noop;
  },
  onVisibilityChanged(cb: (visible: boolean) => void): Unlisten {
    if (isTauri()) return tauriListen<boolean>("pet:visibility", cb);
    return noop;
  },
};

