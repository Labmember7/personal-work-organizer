// Pont « pet flottant du bureau » : relie la fenêtre principale et la petite
// fenêtre transparente toujours-au-premier-plan qui affiche le compagnon
// quand l'app est réduite avec une tâche en focus ou un timer en cours.
//
// Deux runtimes de bureau sont supportés (Tauri et Electron) ; en navigateur
// simple tout est no-op (pas de seconde fenêtre possible).
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
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

interface ElectronPetBridge {
  show(): Promise<void>;
  hide(): Promise<void>;
  restoreMain(): Promise<void>;
  moveBy(dx: number, dy: number): void;
  sendState(state: PetState): void;
  getState(): Promise<PetState | null>;
  onState(cb: (state: PetState) => void): Unlisten;
  sendAction(action: PetAction): void;
  onAction(cb: (action: PetAction) => void): Unlisten;
  notifyReady(): void;
  onReady(cb: () => void): Unlisten;
  onMainMinimizedChanged(cb: (minimized: boolean) => void): Unlisten;
}

declare global {
  interface Window {
    petBridge?: ElectronPetBridge;
  }
}

export const PET_WINDOW_HASH = "#pet";

/** Vrai dans la fenêtre du pet (même bundle, chargé avec le hash #pet). */
export function isPetWindow(): boolean {
  return typeof window !== "undefined" && window.location.hash === PET_WINDOW_HASH;
}

const electron = (): ElectronPetBridge | undefined =>
  typeof window !== "undefined" ? window.petBridge : undefined;

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
  return isTauri() || !!electron();
}

export const desktopPet = {
  show(): Promise<void> {
    if (isTauri()) return invoke<void>("pet_show").catch(() => {});
    return electron()?.show() ?? Promise.resolve();
  },
  hide(): Promise<void> {
    if (isTauri()) return invoke<void>("pet_hide").catch(() => {});
    return electron()?.hide() ?? Promise.resolve();
  },
  /** Ramène la fenêtre principale au premier plan et masque le pet. */
  restoreMain(): Promise<void> {
    if (isTauri()) return invoke<void>("pet_restore_main").catch(() => {});
    return electron()?.restoreMain() ?? Promise.resolve();
  },
  sendState(state: PetState): void {
    if (isTauri()) emit("pet:state", state).catch(() => {});
    else electron()?.sendState(state);
  },
  getState(): Promise<PetState | null> {
    return electron()?.getState() ?? Promise.resolve(null);
  },
  onState(cb: (state: PetState) => void): Unlisten {
    if (isTauri()) return tauriListen<PetState>("pet:state", cb);
    return electron()?.onState(cb) ?? noop;
  },
  sendAction(action: PetAction): void {
    if (isTauri()) emit("pet:action", action).catch(() => {});
    else electron()?.sendAction(action);
  },
  onAction(cb: (action: PetAction) => void): Unlisten {
    if (isTauri()) return tauriListen<PetAction>("pet:action", cb);
    return electron()?.onAction(cb) ?? noop;
  },
  /** La fenêtre du pet signale qu'elle est prête à recevoir l'état. */
  notifyReady(): void {
    if (isTauri()) emit("pet:ready", null).catch(() => {});
    else electron()?.notifyReady();
  },
  onReady(cb: () => void): Unlisten {
    if (isTauri()) return tauriListen<null>("pet:ready", () => cb());
    return electron()?.onReady(cb) ?? noop;
  },
  onMainMinimizedChanged(cb: (minimized: boolean) => void): Unlisten {
    if (isTauri()) return tauriListen<boolean>("main:minimized-changed", cb);
    return electron()?.onMainMinimizedChanged(cb) ?? noop;
  },
  /**
   * Démarre le déplacement de la fenêtre du pet. Tauri : drag natif.
   * Electron : renvoie un gestionnaire de mouvement relatif (moveBy).
   */
  startNativeDrag(): boolean {
    if (isTauri()) {
      getCurrentWindow().startDragging().catch(() => {});
      return true;
    }
    return false;
  },
  moveBy(dx: number, dy: number): void {
    electron()?.moveBy(dx, dy);
  },
};

