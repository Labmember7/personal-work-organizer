// Petit pub-sub pour la console de débogage embarquée (`DebugConsole`).
// Deux sources s'y déversent : la console de l'hôte lui-même (patchée une
// seule fois, `installHostConsoleCapture`) et les plugins (relayés via
// `usePluginHost`/`plugin:log`, capacité "debug"). Volontairement sans état
// React : plusieurs sections de l'app (Tâches, Graphiques, Plugins) montent
// et démontent leurs composants, alors qu'un seul journal doit survivre au
// changement de vue.

export type LogLevel = "log" | "info" | "warn" | "error";

export interface LogEntry {
  id: number;
  at: string;
  source: string;
  level: LogLevel;
  text: string;
}

const MAX_ENTRIES = 500;
let seq = 0;
const buffer: LogEntry[] = [];
const subscribers = new Set<(entries: LogEntry[]) => void>();

function notify(): void {
  const snapshot = buffer.slice();
  subscribers.forEach((cb) => cb(snapshot));
}

function stringifyPart(part: unknown): string {
  if (typeof part === "string") return part;
  if (part instanceof Error) return part.stack || `${part.name}: ${part.message}`;
  try {
    const s = JSON.stringify(part);
    return s === undefined ? String(part) : s;
  } catch {
    return String(part);
  }
}

export function pushLog(source: string, level: LogLevel, ...parts: unknown[]): void {
  const text = parts.map(stringifyPart).join(" ");
  buffer.push({ id: ++seq, at: new Date().toISOString(), source, level, text });
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
  notify();
}

export function clearLog(): void {
  buffer.length = 0;
  notify();
}

/** S'abonne aux entrées (appelé immédiatement avec l'état courant). Rend un désabonnement. */
export function subscribeLog(cb: (entries: LogEntry[]) => void): () => void {
  subscribers.add(cb);
  cb(buffer.slice());
  return () => {
    subscribers.delete(cb);
  };
}

let hostCaptureInstalled = false;

/**
 * Patch `console.log/info/warn/error` et les erreurs non interceptées de la
 * fenêtre hôte pour qu'elles alimentent aussi ce journal. Idempotent : sûr à
 * appeler depuis plusieurs montages de `DebugConsole`.
 */
export function installHostConsoleCapture(): void {
  if (hostCaptureInstalled) return;
  hostCaptureInstalled = true;

  (["log", "info", "warn", "error"] as const).forEach((level) => {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      orig(...args);
      pushLog("host", level, ...args);
    };
  });

  window.addEventListener("error", (e) => {
    pushLog("host", "error", e.message, `${e.filename}:${e.lineno}`);
  });
  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    pushLog("host", "error", "Unhandled rejection:", e.reason);
  });
}
