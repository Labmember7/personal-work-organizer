import React, { useEffect, useMemo, useRef, useState } from "react";
import { getOrCreatePetDna } from "../../lib/petGenerator";
import {
  drawPetHead,
  drawQuirkEffects,
  pickNextQuirk,
  resolveHeadPalette,
} from "../../lib/petAnimation";

// Compagnon Cyber-Bot 2.5D Haute Définition pour la Dynamic Island.
// Rendu piloté par la demande : 0 rAF / 0% CPU au repos, réveillé uniquement
// lors d'un mouvement du regard, d'un clignement, d'un quirk ou d'une humeur animée.

const GRID_SIZE = 36;
const FRAME_MS = 50; // ~20 FPS suffisant pour le pixel-art 36×36

export const PixelHelper = React.memo(function PixelHelper({
  size = 38,
  className = "",
  mood = "normal", // "normal" | "happy" | "focused" | "love" | "sleepy" | "visor" | "eating" | "radar"
  onClick,
  bubbleOut = false,
  dna = null,
}) {
  const canvasRef = useRef(null);
  const [currentMood, setCurrentMood] = useState(mood);
  const [isHovered, setIsHovered] = useState(false);

  const petDna = useMemo(() => dna || getOrCreatePetDna(), [dna]);
  const palette = useMemo(() => resolveHeadPalette(petDna), [petDna]);
  const wakeRef = useRef(null);

  const animState = useRef({
    targetGazeX: 0,
    targetGazeY: 0,
    currentGazeX: 0,
    currentGazeY: 0,
    blinkProgress: 0,
    isBlinking: false,
    blinkStartTime: 0,
    lastBlink: 0,
    nextBlinkInterval: 3000,
    lastInteraction: 0,
    scanPos: 0,
    munchFrame: 0,
    activeQuirk: null,
    quirkStart: 0,
    quirkDuration: 0,
    lastQuirk: null,
    nextQuirkAt: 0,
  });

  useEffect(() => {
    const now = Date.now();
    animState.current.lastBlink = now;
    animState.current.lastInteraction = now;
    animState.current.nextQuirkAt = now + 3500 + Math.random() * 2500;
  }, []);

  useEffect(() => {
    setCurrentMood(mood);
    animState.current.lastInteraction = Date.now();
  }, [mood]);

  // Suivi du curseur sans boucle rAF permanente : ne réveille le rendu que
  // lorsque la cible du regard bouge réellement.
  useEffect(() => {
    let cachedCenter = null;
    let moveQueued = false;
    let lastClientX = 0;
    let lastClientY = 0;

    const updateCenter = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      cachedCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    };

    updateCenter();
    window.addEventListener("resize", updateCenter, { passive: true });

    const onMouseMove = (e) => {
      if (typeof document !== "undefined" && document.hidden) return;
      animState.current.lastInteraction = Date.now();
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      if (moveQueued) return;
      moveQueued = true;
      requestAnimationFrame(() => {
        moveQueued = false;
        if (!cachedCenter) updateCenter();
        if (!cachedCenter) return;

        const state = animState.current;
        const deltaX = lastClientX - cachedCenter.x;
        const deltaY = lastClientY - cachedCenter.y;
        const dist = Math.hypot(deltaX, deltaY);

        let nextX = 0;
        let nextY = 0;
        if (dist >= 4) {
          const maxOffset = 2.0;
          const factor = Math.min(1, dist / 240);
          nextX = (deltaX / dist) * maxOffset * factor;
          nextY = (deltaY / dist) * maxOffset * factor;
        }
        if (Math.abs(nextX - state.targetGazeX) > 0.05 || Math.abs(nextY - state.targetGazeY) > 0.05) {
          state.targetGazeX = nextX;
          state.targetGazeY = nextY;
          wakeRef.current?.();
        }
      });
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    return () => {
      window.removeEventListener("resize", updateCenter);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, []);

  useEffect(() => {
    if (currentMood !== "normal") return undefined;
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      const idleTime = Date.now() - animState.current.lastInteraction;
      if (idleTime > 30000) {
        setCurrentMood("sleepy");
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [currentMood]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    const continuousMood =
      !reduceMotion &&
      (currentMood === "visor" ||
        currentMood === "eating" ||
        currentMood === "love" ||
        currentMood === "sleepy");

    let rafId = null;
    let sleepTimerId = null;
    let lastDraw = 0;
    let pxScale = 1;

    const px = (x, y, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(
        Math.floor(x * pxScale),
        Math.floor(y * pxScale),
        Math.ceil(pxScale),
        Math.ceil(pxScale)
      );
    };

    const fillBox = (x, y, w, h, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(
        Math.floor(x * pxScale),
        Math.floor(y * pxScale),
        Math.ceil(w * pxScale),
        Math.ceil(h * pxScale)
      );
    };

    const stopLoop = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (sleepTimerId !== null) {
        clearTimeout(sleepTimerId);
        sleepTimerId = null;
      }
    };

    const scheduleNextWake = (now) => {
      if (reduceMotion || (typeof document !== "undefined" && document.hidden)) return;
      const s = animState.current;
      let delay = Infinity;
      if (currentMood !== "sleepy") {
        const untilBlink = Math.max(80, s.lastBlink + s.nextBlinkInterval - now);
        delay = Math.min(delay, untilBlink);
      }
      if (currentMood !== "sleepy" && currentMood !== "visor" && currentMood !== "eating") {
        const untilQuirk = Math.max(80, s.nextQuirkAt - now);
        delay = Math.min(delay, untilQuirk);
      }
      if (Number.isFinite(delay) && sleepTimerId === null) {
        sleepTimerId = setTimeout(() => {
          sleepTimerId = null;
          startLoop();
        }, delay);
      }
    };

    const drawFrame = (time) => {
      const s = animState.current;
      const dpr = typeof window !== "undefined" ? Math.max(1, window.devicePixelRatio || 1) : 1;
      const physicalSize = Math.round(size * dpr);

      if (canvas.width !== physicalSize || canvas.height !== physicalSize) {
        canvas.width = physicalSize;
        canvas.height = physicalSize;
      }
      pxScale = physicalSize / GRID_SIZE;

      const dx = s.targetGazeX - s.currentGazeX;
      const dy = s.targetGazeY - s.currentGazeY;
      const gazeMoving = Math.abs(dx) > 0.04 || Math.abs(dy) > 0.04;
      if (gazeMoving) {
        s.currentGazeX += dx * 0.24;
        s.currentGazeY += dy * 0.24;
      } else {
        s.currentGazeX = s.targetGazeX;
        s.currentGazeY = s.targetGazeY;
      }

      s.scanPos = reduceMotion ? 8 : (time * 0.018) % 16;
      s.munchFrame = reduceMotion ? 0 : Math.floor(time * 0.006) % 4;

      const now = Date.now();
      if (!s.isBlinking && now - s.lastBlink > s.nextBlinkInterval && currentMood !== "sleepy") {
        s.isBlinking = true;
        s.blinkStartTime = now;
      }
      if (s.isBlinking) {
        const elapsed = now - s.blinkStartTime;
        if (elapsed < 65) {
          s.blinkProgress = elapsed / 65;
        } else if (elapsed < 130) {
          s.blinkProgress = 1 - (elapsed - 65) / 65;
        } else {
          s.isBlinking = false;
          s.blinkProgress = 0;
          s.lastBlink = now;
          s.nextBlinkInterval = 2800 + Math.random() * 2600;
        }
      }

      if (!reduceMotion && currentMood !== "sleepy" && currentMood !== "visor" && currentMood !== "eating") {
        if (!s.activeQuirk && now >= s.nextQuirkAt) {
          const picked = pickNextQuirk(petDna, s.lastQuirk);
          s.activeQuirk = picked.type;
          s.quirkDuration = picked.duration;
          s.quirkStart = now;
          s.lastQuirk = picked.type;
        }
      } else if (s.activeQuirk) {
        s.activeQuirk = null;
      }

      let quirkProgress = 0;
      if (s.activeQuirk) {
        quirkProgress = (now - s.quirkStart) / s.quirkDuration;
        if (quirkProgress >= 1) {
          s.activeQuirk = null;
          quirkProgress = 0;
          s.nextQuirkAt = now + 5000 + Math.random() * 3500;
        }
      }

      const hopY =
        !reduceMotion && s.activeQuirk === "sparkle_hop"
          ? -Math.round(Math.abs(Math.sin(quirkProgress * Math.PI * 2)) * 1.4)
          : !reduceMotion && s.activeQuirk === "star_orbit"
            ? -Math.round(Math.sin(quirkProgress * Math.PI) * 1.2)
            : 0;

      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, physicalSize, physicalSize);

      drawPetHead(px, fillBox, 0, hopY, petDna, {
        time,
        currentMood,
        isHovered,
        blinkProgress: s.blinkProgress,
        eyeX: s.currentGazeX,
        eyeY: s.currentGazeY,
        scanPos: s.scanPos,
        munchFrame: s.munchFrame,
        activeQuirk: s.activeQuirk,
        quirkProgress,
        reduceMotion,
        palette,
      });

      if (s.activeQuirk && !reduceMotion) {
        drawQuirkEffects(px, fillBox, 0, hopY, petDna, s.activeQuirk, quirkProgress, false, palette);
      }

      const needsMoreFrames =
        !reduceMotion &&
        (continuousMood || gazeMoving || s.isBlinking || Boolean(s.activeQuirk));

      if (needsMoreFrames) {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = null;
        scheduleNextWake(now);
      }
    };

    const tick = (time) => {
      if (typeof document !== "undefined" && document.hidden) {
        rafId = null;
        return;
      }
      if (lastDraw && time - lastDraw < FRAME_MS) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      lastDraw = time;
      drawFrame(time);
    };

    const startLoop = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (sleepTimerId !== null) {
        clearTimeout(sleepTimerId);
        sleepTimerId = null;
      }
      if (rafId === null) {
        lastDraw = 0;
        rafId = requestAnimationFrame(tick);
      }
    };

    wakeRef.current = startLoop;

    const onVisibility = () => {
      if (document.hidden) stopLoop();
      else startLoop();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    // Premier rendu immédiat
    drawFrame(typeof performance !== "undefined" ? performance.now() : 0);

    return () => {
      wakeRef.current = null;
      stopLoop();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [currentMood, isHovered, size, petDna, palette]);

  const handleClick = (e) => {
    animState.current.lastInteraction = Date.now();
    wakeRef.current?.();
    onClick?.(e);
  };

  const displayName = petDna?.name || "Nova";
  const displayArchetype = petDna?.archetype || "Cyber Companion";

  return (
    <div
      className={
        "trk-pixel-helper-pod" +
        (bubbleOut ? " trk-bubble-out" : "") +
        (className ? " " + className : "")
      }
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={`${displayName} · ${displayArchetype} (Click to open Companion Deck)`}
      style={{
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        userSelect: "none",
        position: "relative",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: size,
          height: size,
          imageRendering: "pixelated",
          display: "block",
        }}
      />
    </div>
  );
});
