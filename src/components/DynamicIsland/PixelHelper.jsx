import React, { useEffect, useMemo, useRef, useState } from "react";
import { getOrCreatePetDna } from "../../lib/petGenerator";

// Compagnon Cyber-Bot 2.5D Haute Définition pour la Dynamic Island.
// Châssis chanfreiné symétrique 36x36, ombrage anodisé 3 tons, modules latéraux
// épurés et visière OLED encastrée avec suivi du regard lissé au pixel près.

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
  });

  useEffect(() => {
    const now = Date.now();
    animState.current.lastBlink = now;
    animState.current.lastInteraction = now;
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

    const render = (time) => {
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

      const pal = petDna?.palette || {};
      const COLOR_CHASSIS_DARK = pal.chassisDark || "#060C18";
      const COLOR_CHASSIS_MID = pal.chassisMid || "#0E1A2E";
      const COLOR_CHASSIS_LIGHT = pal.chassisLight || "#1A2E4D";
      const COLOR_RIM = pal.rim || "#93C5FD";
      const COLOR_NEON = pal.neon || "#00F5D4";
      const COLOR_GLOW = pal.glow || "#5EEAD4";
      const COLOR_VISOR_BG = "#03060C";
      const COLOR_PUPIL = pal.pupil || "#002B36";
      const COLOR_ANTENNA = pal.antenna || "#FF2E93";
      const COLOR_CHEEK = pal.cheek || "#FF3385";
      const COLOR_ACCENT_LIGHT = pal.accentLight || "#38BDF8";
      const COLOR_ACCENT_DARK = pal.accentDark || "#0284C7";

      const antennaType = petDna?.antennaType || "pulse_beacon";
      const earType = petDna?.earType || "equalizer";
      const eyeShape = petDna?.eyeShape || "classic_square";

      // ── A. Antenne / Coiffe Symétrique ──
      if (antennaType === "cat_ears") {
        fillBox(9, 4, 3, 4, COLOR_CHASSIS_MID);
        fillBox(10, 3, 2, 2, COLOR_CHASSIS_LIGHT);
        px(10, 2, COLOR_RIM);
        fillBox(10, 5, 1, 2, COLOR_ANTENNA);

        fillBox(24, 4, 3, 4, COLOR_CHASSIS_MID);
        fillBox(24, 3, 2, 2, COLOR_CHASSIS_LIGHT);
        px(25, 2, COLOR_RIM);
        fillBox(25, 5, 1, 2, COLOR_ANTENNA);
      } else if (antennaType === "cyber_horns") {
        fillBox(11, 4, 2, 4, COLOR_CHASSIS_LIGHT);
        fillBox(10, 2, 2, 3, COLOR_ANTENNA);
        px(9, 2, COLOR_RIM);

        fillBox(23, 4, 2, 4, COLOR_CHASSIS_LIGHT);
        fillBox(24, 2, 2, 3, COLOR_ANTENNA);
        px(26, 2, COLOR_RIM);
      } else if (antennaType === "halo_ring") {
        const haloY = reduceMotion ? 0 : Math.sin(time * 0.003) * 0.6;
        const hy = Math.round(3 + haloY);
        fillBox(12, hy, 12, 1, COLOR_NEON);
        px(11, hy + 1, COLOR_ANTENNA);
        px(24, hy + 1, COLOR_ANTENNA);
        fillBox(13, hy - 1, 10, 1, "rgba(255, 255, 255, 0.35)");
      } else if (antennaType === "dual_antennae") {
        const glowAlpha = reduceMotion ? 0.85 : Math.sin(time * 0.004) * 0.2 + 0.8;
        fillBox(13, 3, 1, 5, "#475569");
        px(13, 2, COLOR_ANTENNA);
        px(13, 1, `rgba(255, 255, 255, ${glowAlpha})`);

        fillBox(22, 3, 1, 5, "#475569");
        px(22, 2, COLOR_ANTENNA);
        px(22, 1, `rgba(255, 255, 255, ${glowAlpha})`);
      } else {
        const pulseAlpha = reduceMotion ? 0.85 : Math.sin(time * 0.004) * 0.2 + 0.8;
        fillBox(17, 3, 2, 2, COLOR_ANTENNA);
        px(17, 2, `rgba(255, 255, 255, ${pulseAlpha})`);
        fillBox(17, 5, 2, 3, "#334155");
        fillBox(16, 7, 4, 1, "#475569");
      }

      // ── B. Modules Latéraux Calmes & Symétriques ──
      if (earType === "cyber_wings") {
        fillBox(4, 15, 3, 4, COLOR_CHASSIS_LIGHT);
        fillBox(3, 14, 2, 2, COLOR_NEON);
        px(2, 13, COLOR_RIM);
        fillBox(5, 19, 2, 2, COLOR_ACCENT_DARK);

        fillBox(29, 15, 3, 4, COLOR_CHASSIS_LIGHT);
        fillBox(31, 14, 2, 2, COLOR_NEON);
        px(33, 13, COLOR_RIM);
        fillBox(29, 19, 2, 2, COLOR_ACCENT_DARK);
      } else if (earType === "audio_pods") {
        fillBox(4, 15, 3, 6, COLOR_CHASSIS_DARK);
        fillBox(5, 16, 2, 4, COLOR_ANTENNA);
        px(5, 17, "#FFFFFF");

        fillBox(29, 15, 3, 6, COLOR_CHASSIS_DARK);
        fillBox(29, 16, 2, 4, COLOR_ANTENNA);
        px(30, 17, "#FFFFFF");
      } else if (earType === "armor_fins") {
        fillBox(4, 13, 3, 9, COLOR_CHASSIS_LIGHT);
        fillBox(3, 15, 2, 6, COLOR_NEON);
        px(3, 14, COLOR_RIM);

        fillBox(29, 13, 3, 9, COLOR_CHASSIS_LIGHT);
        fillBox(31, 15, 2, 6, COLOR_NEON);
        px(32, 14, COLOR_RIM);
      } else {
        // Pods égaliseurs calmes et équilibrés
        fillBox(4, 14, 3, 8, COLOR_CHASSIS_DARK);
        fillBox(5, 15, 2, 6, COLOR_CHASSIS_LIGHT);
        fillBox(4, 16, 1, 4, COLOR_NEON);

        fillBox(29, 14, 3, 8, COLOR_CHASSIS_DARK);
        fillBox(29, 15, 2, 6, COLOR_CHASSIS_LIGHT);
        fillBox(31, 16, 1, 4, COLOR_NEON);
      }

      // ── C. Châssis Principal Chanfreiné (22x19 aux coins arrondis symétriques) ──
      // Contour / ombrage anodisé 3 tons
      fillBox(10, 8, 16, 1, COLOR_RIM);
      fillBox(9, 9, 18, 1, COLOR_CHASSIS_LIGHT);
      fillBox(8, 10, 20, 1, COLOR_CHASSIS_LIGHT);
      fillBox(7, 11, 22, 13, COLOR_CHASSIS_MID);
      fillBox(8, 24, 20, 1, COLOR_CHASSIS_DARK);
      fillBox(9, 25, 18, 1, COLOR_CHASSIS_DARK);
      fillBox(10, 26, 16, 1, "#020610");

      // Filets latéraux symétriques subtils + pip néon
      fillBox(7, 12, 1, 11, COLOR_CHASSIS_LIGHT);
      fillBox(28, 12, 1, 11, COLOR_CHASSIS_LIGHT);
      fillBox(7, 16, 1, 3, COLOR_NEON);
      fillBox(28, 16, 1, 3, COLOR_NEON);

      if (petDna?.hasForeheadGem) {
        fillBox(17, 9, 2, 2, COLOR_ANTENNA);
        px(17, 9, "#FFFFFF");
      }

      // ── D. Visière OLED Encastrée aux coins doux ──
      fillBox(10, 12, 16, 11, COLOR_VISOR_BG);
      fillBox(9, 13, 18, 9, COLOR_VISOR_BG);
      fillBox(10, 12, 16, 1, "rgba(255, 255, 255, 0.16)");
      fillBox(10, 22, 16, 1, "rgba(255, 255, 255, 0.06)");

      // ── E. Joues LED discrètes ──
      fillBox(10, 20, 2, 1, COLOR_CHEEK);
      fillBox(24, 20, 2, 1, COLOR_CHEEK);

      // ── F. Rendu des Yeux (coordonnées arrondies au pixel près) ──
      const eyeX = Math.round(s.currentGazeX);
      const eyeY = Math.round(s.currentGazeY);

      if (currentMood === "focused") {
        const leftX = 11 + eyeX;
        const leftY = 15 + eyeY;
        const rightX = 21 + eyeX;
        const rightY = 15 + eyeY;

        fillBox(leftX, leftY - 1, 3, 1, COLOR_ACCENT_LIGHT);
        fillBox(rightX + 1, rightY - 1, 3, 1, COLOR_ACCENT_LIGHT);

        fillBox(leftX, leftY, 4, 3, COLOR_NEON);
        fillBox(leftX + 1, leftY + 1, 2, 2, COLOR_PUPIL);
        px(leftX + 2, leftY + 1, "#FFFFFF");

        fillBox(rightX, rightY, 4, 3, COLOR_NEON);
        fillBox(rightX + 1, rightY + 1, 2, 2, COLOR_PUPIL);
        px(rightX + 1, rightY + 1, "#FFFFFF");
      } else if (currentMood === "sleepy") {
        fillBox(12, 17, 4, 1, COLOR_NEON);
        fillBox(20, 17, 4, 1, COLOR_NEON);
        if (!reduceMotion) {
          const zProg = (time * 0.001) % 2;
          if (zProg < 1.2) {
            px(26, Math.floor(9 - zProg * 4), COLOR_RIM);
            px(27, Math.floor(8 - zProg * 4), COLOR_RIM);
          }
        }
      } else if (currentMood === "visor") {
        fillBox(10, 14, 16, 5, "rgba(245, 158, 11, 0.35)");
        fillBox(9, 15, 18, 3, "#F59E0B");
        const lx = 10 + Math.floor(s.scanPos);
        fillBox(lx, 14, 2, 5, "#FEF3C7");
      } else if (currentMood === "eating") {
        fillBox(12, 15, 4, 3, COLOR_NEON);
        fillBox(20, 15, 4, 3, COLOR_NEON);
        if (s.munchFrame % 2 === 0) {
          fillBox(16, 20, 4, 2, COLOR_ANTENNA);
        } else {
          fillBox(16, 21, 4, 1, COLOR_ANTENNA);
        }
      } else if (currentMood === "radar") {
        fillBox(12, 15, 4, 4, COLOR_NEON);
        fillBox(20, 15, 4, 4, COLOR_NEON);
        px(13, 16, COLOR_VISOR_BG);
        px(21, 16, COLOR_VISOR_BG);
      } else if (currentMood === "happy" || isHovered) {
        px(12, 17, COLOR_NEON);
        px(13, 16, COLOR_NEON);
        px(14, 16, COLOR_NEON);
        px(15, 17, COLOR_NEON);

        px(20, 17, COLOR_NEON);
        px(21, 16, COLOR_NEON);
        px(22, 16, COLOR_NEON);
        px(23, 17, COLOR_NEON);
      } else if (currentMood === "love") {
        const heartColor = reduceMotion || Math.sin(time * 0.008) > 0 ? COLOR_ANTENNA : COLOR_CHEEK;
        fillBox(12, 16, 4, 2, heartColor);
        px(13, 18, heartColor);
        px(14, 18, heartColor);
        fillBox(20, 16, 4, 2, heartColor);
        px(21, 18, heartColor);
        px(22, 18, heartColor);
      } else if (s.blinkProgress > 0.4) {
        fillBox(12, 17, 4, 1, COLOR_GLOW);
        fillBox(20, 17, 4, 1, COLOR_GLOW);
      } else {
        const leftX = 12 + eyeX;
        const leftY = 15 + eyeY;
        const rightX = 20 + eyeX;
        const rightY = 15 + eyeY;

        if (eyeShape === "visor_strip") {
          fillBox(leftX, leftY + 1, 4, 2, COLOR_NEON);
          fillBox(rightX, rightY + 1, 4, 2, COLOR_NEON);
          px(leftX + 1, leftY + 1, "#FFFFFF");
          px(rightX + 1, rightY + 1, "#FFFFFF");
        } else if (eyeShape === "soft_corners") {
          fillBox(leftX, leftY + 1, 4, 2, COLOR_NEON);
          fillBox(leftX + 1, leftY, 2, 4, COLOR_NEON);
          fillBox(leftX + 1, leftY + 1, 2, 2, COLOR_PUPIL);
          px(leftX + 1, leftY + 1, "#FFFFFF");

          fillBox(rightX, rightY + 1, 4, 2, COLOR_NEON);
          fillBox(rightX + 1, rightY, 2, 4, COLOR_NEON);
          fillBox(rightX + 1, rightY + 1, 2, 2, COLOR_PUPIL);
          px(rightX + 1, rightY + 1, "#FFFFFF");
        } else {
          fillBox(leftX, leftY, 4, 4, COLOR_NEON);
          fillBox(leftX + 1, leftY + 1, 2, 2, COLOR_PUPIL);
          px(leftX + 1, leftY + 1, "#FFFFFF");

          fillBox(rightX, rightY, 4, 4, COLOR_NEON);
          fillBox(rightX + 1, rightY + 1, 2, 2, COLOR_PUPIL);
          px(rightX + 1, rightY + 1, "#FFFFFF");
        }
      }

      rafId = requestAnimationFrame(render);
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
