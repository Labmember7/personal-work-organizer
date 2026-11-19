import React, { useEffect, useMemo, useRef, useState } from "react";
import { getOrCreatePetDna } from "../../lib/petGenerator";
import { drawPetHead, drawQuirkEffects, pickNextQuirk } from "../../lib/petAnimation";

// Compagnon Cyber-Bot 2.5D Haute Définition pour la Dynamic Island.
// Partage le moteur `petAnimation` avec FullBodyPet pour une parité visuelle
// et comportementale exacte (couleurs, morphologie ADN et animations de caractère).

const GRID_SIZE = 36;

export function PixelHelper({
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

  const petDna = useMemo(() => {
    return dna || getOrCreatePetDna();
  }, [dna]);

  const animState = useRef({
    targetGazeX: 0,
    targetGazeY: 0,
    currentGazeX: 0,
    currentGazeY: 0,
    blinkProgress: 0,
    isBlinking: false,
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

  useEffect(() => {
    let cachedCenter = null;
    let rafId = null;

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
      const state = animState.current;
      state.lastInteraction = Date.now();
      const clientX = e.clientX;
      const clientY = e.clientY;

      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!cachedCenter) updateCenter();
        if (!cachedCenter) return;

        const deltaX = clientX - cachedCenter.x;
        const deltaY = clientY - cachedCenter.y;
        const dist = Math.hypot(deltaX, deltaY);

        if (dist < 4) {
          state.targetGazeX = 0;
          state.targetGazeY = 0;
          return;
        }

        const maxOffset = 2.0;
        const factor = Math.min(1, dist / 240);
        state.targetGazeX = (deltaX / dist) * maxOffset * factor;
        state.targetGazeY = (deltaY / dist) * maxOffset * factor;
      });
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updateCenter);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const idleTime = Date.now() - animState.current.lastInteraction;
      if (idleTime > 30000 && currentMood === "normal") {
        setCurrentMood("sleepy");
      }
    }, 3000);
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

    let rafId;
    let lastDraw = 0;
    const FRAME_MS = 48; // ~20 FPS suffisant pour le pixel-art 36×36 (divise le CPU par 3)

    const render = (time) => {
      rafId = requestAnimationFrame(render);
      if (typeof document !== "undefined" && document.hidden) return;
      if (lastDraw && time - lastDraw < FRAME_MS) return;
      lastDraw = time;

      const s = animState.current;

      const dpr = typeof window !== "undefined" ? Math.max(1, window.devicePixelRatio || 1) : 1;
      const physicalSize = Math.round(size * dpr);

      if (canvas.width !== physicalSize || canvas.height !== physicalSize) {
        canvas.width = physicalSize;
        canvas.height = physicalSize;
      }

      const pxScale = physicalSize / GRID_SIZE;

      s.currentGazeX += (s.targetGazeX - s.currentGazeX) * 0.16;
      s.currentGazeY += (s.targetGazeY - s.currentGazeY) * 0.16;

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

      // Déclenchement aléatoire de l'animation de caractère selon l'ADN
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
      });

      if (s.activeQuirk && !reduceMotion) {
        drawQuirkEffects(px, fillBox, 0, hopY, petDna, s.activeQuirk, quirkProgress, false);
      }
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [currentMood, isHovered, size, petDna]);

  const handleClick = (e) => {
    animState.current.lastInteraction = Date.now();
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
}
