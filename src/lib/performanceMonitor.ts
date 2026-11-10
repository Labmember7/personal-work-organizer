import { pushLog } from "./debugLog";

export interface InteractionMetric {
  id: number;
  type: string;
  target: string;
  duration: number; // in milliseconds
  timestamp: number;
  status: "fast" | "good" | "slow";
}

export interface LongTaskMetric {
  id: number;
  duration: number;
  timestamp: number;
}

export interface PerfState {
  fps: number;
  lastLatency: number | null;
  avgLatency: number;
  maxLatency: number;
  interactions: InteractionMetric[];
  longTasks: LongTaskMetric[];
  rating: "fast" | "good" | "slow";
}

let seq = 0;
const MAX_INTERACTIONS = 50;
const MAX_LONG_TASKS = 20;

const interactions: InteractionMetric[] = [];
const longTasks: LongTaskMetric[] = [];
let lastLatency: number | null = null;
let currentFps = 60;
let installed = false;

const subscribers = new Set<(state: PerfState) => void>();

function notify(): void {
  const state = getPerfState();
  subscribers.forEach((cb) => cb(state));
}

export function getPerfRating(ms: number | null): "fast" | "good" | "slow" {
  if (ms === null || ms < 16.7) return "fast";
  if (ms < 50) return "good";
  return "slow";
}

export function getPerfState(): PerfState {
  const durations = interactions.map((i) => i.duration);
  const avg = durations.length > 0 ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10 : 0;
  const max = durations.length > 0 ? Math.max(...durations) : 0;
  return {
    fps: currentFps,
    lastLatency,
    avgLatency: avg,
    maxLatency: max,
    interactions: interactions.slice(),
    longTasks: longTasks.slice(),
    rating: getPerfRating(lastLatency ?? avg),
  };
}

const INP_ACTION_TYPES = new Set([
  "click",
  "pointerup",
  "mouseup",
  "keydown",
  "keyup",
  "drop",
  "dragend",
]);

export function recordInteraction(type: string, targetName: string, durationMs: number): void {
  const rounded = Math.round(durationMs * 10) / 10;
  lastLatency = rounded;
  const metric: InteractionMetric = {
    id: ++seq,
    type,
    target: targetName,
    duration: rounded,
    timestamp: Date.now(),
    status: getPerfRating(rounded),
  };

  interactions.unshift(metric);
  if (interactions.length > MAX_INTERACTIONS) interactions.pop();

  // Seules les actions utilisateur directes (clics, touches, drop) émettent une alerte INP
  if (rounded > 50 && INP_ACTION_TYPES.has(type.toLowerCase())) {
    pushLog("perf", "warn", `⚠️ Slow interaction [${type}] on <${targetName}> took ${rounded}ms`);
  }

  notify();
}

export function recordLongTask(durationMs: number): void {
  const rounded = Math.round(durationMs * 10) / 10;
  longTasks.unshift({
    id: ++seq,
    duration: rounded,
    timestamp: Date.now(),
  });
  if (longTasks.length > MAX_LONG_TASKS) longTasks.pop();

  pushLog("perf", "warn", `🚨 Main thread blocked for ${rounded}ms (Long Task)`);
  notify();
}

export function clearPerfMetrics(): void {
  interactions.length = 0;
  longTasks.length = 0;
  lastLatency = null;
  notify();
}

export function subscribePerf(cb: (state: PerfState) => void): () => void {
  subscribers.add(cb);
  cb(getPerfState());
  return () => {
    subscribers.delete(cb);
  };
}

/**
 * Installe les observateurs de performance natifs (Event Timing API, Long Tasks API, FPS sampler).
 * Idempotent et sans danger dans les environnements où PerformanceObserver n'est pas supporté (ex: jsdom).
 */
export function initPerformanceMonitoring(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  // 1. FPS Tracker léger (échantillonne sur 1 seconde)
  let frames = 0;
  let lastTime = performance.now();
  const sampleFps = () => {
    frames++;
    const now = performance.now();
    if (now - lastTime >= 1000) {
      currentFps = Math.min(120, Math.round((frames * 1000) / (now - lastTime)));
      frames = 0;
      lastTime = now;
      notify();
    }
    requestAnimationFrame(sampleFps);
  };
  requestAnimationFrame(sampleFps);

  // 2. PerformanceObserver pour les interactions (INP / Event Timing)
  if (typeof PerformanceObserver !== "undefined") {
    try {
      const eventObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const type = entry.name || "event";
          if (type === "pointerdown" || type === "mousedown" || type === "dragover" || type === "dragenter" || type === "dragleave") continue;
          const target = (entry as unknown as { target?: { tagName?: string; className?: string } }).target?.tagName || type;
          recordInteraction(type, String(target), entry.duration);
        }
      });
      eventObserver.observe({
        type: "event",
        buffered: false,
        durationThreshold: 8, // Écoute toute interaction > 8ms
      } as PerformanceObserverInit);
    } catch {
      // Les types d'observateurs non supportés sont ignorés silencieusement
    }

    // 3. PerformanceObserver pour les Long Tasks (> 50ms bloquants)
    try {
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          recordLongTask(entry.duration);
        }
      });
      longTaskObserver.observe({ entryTypes: ["longtask"] });
    } catch {
      // Ignoré si non supporté
    }
  }

  // 4. Capture passive des clics / touches / drag pour mesurer le temps de réponse (secours ou complément)
  const hasNativeEventTiming = typeof PerformanceObserver !== "undefined" &&
    Array.isArray(PerformanceObserver.supportedEntryTypes) &&
    PerformanceObserver.supportedEntryTypes.includes("event");

  if (!hasNativeEventTiming) {
    const monitorEvent = (e: Event) => {
      const start = performance.now();
      const type = e.type;
      const targetEl = e.target as HTMLElement | null;
      const targetDesc = targetEl
        ? `${targetEl.tagName.toLowerCase()}${targetEl.className ? `.${String(targetEl.className).split(" ")[0]}` : ""}`
        : "window";

      // Mesure au microtask suivant (une fois le traitement d'événement terminé)
      queueMicrotask(() => {
        const duration = performance.now() - start;
        if (duration >= 2) {
          recordInteraction(type, targetDesc, duration);
        }
      });
    };

    ["click", "keydown", "drop", "dragend"].forEach((evt) => {
      window.addEventListener(evt, monitorEvent, { passive: true, capture: true });
    });
  }
}

