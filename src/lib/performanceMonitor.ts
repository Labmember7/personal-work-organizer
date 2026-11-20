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
  if (subscribers.size === 0) return;
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
  // lorsque l'outil de performance est activement ouvert/abonné.
  if (subscribers.size > 0 && rounded > 50 && INP_ACTION_TYPES.has(type.toLowerCase())) {
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

  if (subscribers.size > 0) {
    pushLog("perf", "warn", `🚨 Main thread blocked for ${rounded}ms (Long Task)`);
  }
  notify();
}

export function clearPerfMetrics(): void {
  interactions.length = 0;
  longTasks.length = 0;
  lastLatency = null;
  notify();
}

let fpsRafId: number | null = null;
let observersActive = false;
let eventObserver: PerformanceObserver | null = null;
let longTaskObserver: PerformanceObserver | null = null;
let fallbackMonitorHandler: ((e: Event) => void) | null = null;
const FALLBACK_EVENTS = ["click", "keydown", "drop", "dragend"] as const;

function stopFpsSampler(): void {
  if (fpsRafId !== null && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(fpsRafId);
    fpsRafId = null;
  }
}

function startFpsSampler(): void {
  if (fpsRafId !== null || typeof requestAnimationFrame !== "function") return;
  let frames = 0;
  let lastTime = performance.now();
  const sampleFps = () => {
    if (subscribers.size === 0) {
      fpsRafId = null;
      return;
    }
    frames++;
    const now = performance.now();
    if (now - lastTime >= 1000) {
      currentFps = Math.min(120, Math.round((frames * 1000) / (now - lastTime)));
      frames = 0;
      lastTime = now;
      notify();
    }
    fpsRafId = requestAnimationFrame(sampleFps);
  };
  fpsRafId = requestAnimationFrame(sampleFps);
}

function startObservers(): void {
  if (observersActive || typeof window === "undefined") return;
  observersActive = true;

  if (typeof PerformanceObserver !== "undefined") {
    try {
      eventObserver = new PerformanceObserver((list) => {
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
        durationThreshold: 8,
      } as PerformanceObserverInit);
    } catch {
      eventObserver = null;
    }

    try {
      longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          recordLongTask(entry.duration);
        }
      });
      longTaskObserver.observe({ entryTypes: ["longtask"] });
    } catch {
      longTaskObserver = null;
    }
  }

  const hasNativeEventTiming = typeof PerformanceObserver !== "undefined" &&
    Array.isArray(PerformanceObserver.supportedEntryTypes) &&
    PerformanceObserver.supportedEntryTypes.includes("event");

  if (!hasNativeEventTiming) {
    fallbackMonitorHandler = (e: Event) => {
      const start = performance.now();
      const type = e.type;
      const targetEl = e.target as HTMLElement | null;
      const targetDesc = targetEl
        ? `${targetEl.tagName.toLowerCase()}${targetEl.className ? `.${String(targetEl.className).split(" ")[0]}` : ""}`
        : "window";

      queueMicrotask(() => {
        const duration = performance.now() - start;
        if (duration >= 2) {
          recordInteraction(type, targetDesc, duration);
        }
      });
    };

    FALLBACK_EVENTS.forEach((evt) => {
      window.addEventListener(evt, fallbackMonitorHandler!, { passive: true, capture: true });
    });
  }
}

function stopObservers(): void {
  if (!observersActive) return;
  observersActive = false;

  if (eventObserver) {
    eventObserver.disconnect();
    eventObserver = null;
  }
  if (longTaskObserver) {
    longTaskObserver.disconnect();
    longTaskObserver = null;
  }
  if (fallbackMonitorHandler && typeof window !== "undefined") {
    FALLBACK_EVENTS.forEach((evt) => {
      window.removeEventListener(evt, fallbackMonitorHandler!, { capture: true });
    });
    fallbackMonitorHandler = null;
  }
}

export function subscribePerf(cb: (state: PerfState) => void): () => void {
  subscribers.add(cb);
  cb(getPerfState());
  if (installed) {
    startFpsSampler();
    startObservers();
  }
  return () => {
    subscribers.delete(cb);
    if (subscribers.size === 0) {
      stopFpsSampler();
      stopObservers();
    }
  };
}

/**
 * Prépare la surveillance de performance à la demande : les PerformanceObserver,
 * écouteurs et l'échantillonneur FPS RAF ne tournent que lorsqu'un panneau de
 * performance est activement ouvert/abonné.
 */
export function initPerformanceMonitoring(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  if (subscribers.size > 0) {
    startFpsSampler();
    startObservers();
  }
}

