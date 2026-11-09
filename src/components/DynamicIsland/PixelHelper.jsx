import React, { useEffect, useMemo, useRef, useState } from "react";
import { getOrCreatePetDna } from "../../lib/petGenerator";

// Compagnon Cyber-Bot 2.5D Haute Définition pour la Dynamic Island.
// Rendu pixel-art RAZOR-SHARP (100% net, zéro flou) :
// - Canvas calibré sur window.devicePixelRatio natif pour écrans Retina / High-DPI.
// - Grille haute définition 36x36 avec projection géométrique directe au pixel physique.
// - Traits procéduraux uniques par utilisateur (palette, oreilles, antenne, yeux).
// - Yeux digitaux expressifs, suivi de curseur fluide et animations d'humeur.

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

  // Résolution du profil génétique persistant
  const petDna = useMemo(() => {
    return dna || getOrCreatePetDna();
  }, [dna]);

  // État d'animation interpolé
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

  // Synchronise le mood externe
  useEffect(() => {
    setCurrentMood(mood);
    animState.current.lastInteraction = Date.now();
  }, [mood]);

  // Écouteur de mouvement de souris global pour le suivi du regard (rAF + cache position)
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

        // Décalage du regard dans la grille pixel (-2.2 à +2.2 pixels)
        const maxOffset = 2.2;
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

  // Détection d'inactivité -> mode endormi après 30s
  useEffect(() => {
    const timer = setInterval(() => {
      const idleTime = Date.now() - animState.current.lastInteraction;
      if (idleTime > 30000 && currentMood === "normal") {
        setCurrentMood("sleepy");
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [currentMood]);

  // Boucle de rendu haute définition 60fps
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let rafId;

    const render = (time) => {
      const s = animState.current;

      // 1. Calcul DPR pour rendu pixel parfait sur tous les écrans
      const dpr = typeof window !== "undefined" ? Math.max(1, window.devicePixelRatio || 1) : 1;
      const physicalSize = Math.round(size * dpr);

      if (canvas.width !== physicalSize || canvas.height !== physicalSize) {
        canvas.width = physicalSize;
        canvas.height = physicalSize;
      }

      const pxScale = physicalSize / GRID_SIZE;

      // 2. Interpolation fluide du regard
      s.currentGazeX += (s.targetGazeX - s.currentGazeX) * 0.16;
      s.currentGazeY += (s.targetGazeY - s.currentGazeY) * 0.16;

      // Scanline et mastication
      s.scanPos = (time * 0.024) % 18;
      s.munchFrame = Math.floor(time * 0.008) % 4;

      // 3. Gestion des clignements d'yeux naturels
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

      // 4. Nettoyage et désactivation du lissage pour un pixel art net
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, physicalSize, physicalSize);

      // Primitives de dessin alignées sur les pixels physiques (zéro flou)
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

      // ── Palette dynamique dérivée de l'ADN ──
      const pal = petDna?.palette || {};
      const COLOR_CHASSIS_DARK = pal.chassisDark || "#050B14";
      const COLOR_CHASSIS_MID = pal.chassisMid || "#0A1424";
      const COLOR_CHASSIS_LIGHT = pal.chassisLight || "#162842";
      const COLOR_RIM = pal.rim || "#93C5FD";
      const COLOR_NEON = pal.neon || "#00F5D4";
      const COLOR_GLOW = pal.glow || "#5EEAD4";
      const COLOR_VISOR_BG = "#020408";
      const COLOR_PUPIL = pal.pupil || "#002B36";
      const COLOR_ANTENNA = pal.antenna || "#FF2E93";
      const COLOR_CHEEK = pal.cheek || "#FF3385";
      const COLOR_ACCENT_LIGHT = pal.accentLight || "#38BDF8";
      const COLOR_ACCENT_DARK = pal.accentDark || "#0284C7";

      const antennaType = petDna?.antennaType || "pulse_beacon";
      const earType = petDna?.earType || "equalizer";
      const eyeShape = petDna?.eyeShape || "classic_square";

      // ── A. Dessin de l'Antenne / Coiffe Procédurale ──
      if (antennaType === "cat_ears") {
        // Oreilles félines cybernétiques
        // Oreille gauche
        fillBox(9, 4, 3, 4, COLOR_CHASSIS_MID);
        fillBox(10, 3, 2, 2, COLOR_CHASSIS_LIGHT);
        px(10, 2, COLOR_RIM);
        fillBox(10, 5, 1, 2, COLOR_ANTENNA);

        // Oreille droite
        fillBox(24, 4, 3, 4, COLOR_CHASSIS_MID);
        fillBox(24, 3, 2, 2, COLOR_CHASSIS_LIGHT);
        px(25, 2, COLOR_RIM);
        fillBox(25, 5, 1, 2, COLOR_ANTENNA);
      } else if (antennaType === "cyber_horns") {
        // Cornes holographiques recourbées
        fillBox(11, 4, 2, 4, COLOR_CHASSIS_LIGHT);
        fillBox(10, 2, 2, 3, COLOR_ANTENNA);
        px(9, 2, COLOR_RIM);

        fillBox(23, 4, 2, 4, COLOR_CHASSIS_LIGHT);
        fillBox(24, 2, 2, 3, COLOR_ANTENNA);
        px(26, 2, COLOR_RIM);
      } else if (antennaType === "halo_ring") {
        // Anneau énergétique flottant (légère oscillation zénithale)
        const haloY = Math.sin(time * 0.005) * 0.8;
        const hy = Math.round(3 + haloY);
        fillBox(12, hy, 12, 1, COLOR_NEON);
        px(11, hy + 1, COLOR_ANTENNA);
        px(24, hy + 1, COLOR_ANTENNA);
        fillBox(13, hy - 1, 10, 1, "rgba(255, 255, 255, 0.4)");
      } else if (antennaType === "dual_antennae") {
        // Deux tiges fines de communication
        const pulse = Math.sin(time * 0.008) * 0.3 + 0.7;
        fillBox(13, 3, 1, 5, "#475569");
        px(13, 2, COLOR_ANTENNA);
        px(13, 1, `rgba(255, 255, 255, ${pulse})`);

        fillBox(22, 3, 1, 5, "#475569");
        px(22, 2, COLOR_ANTENNA);
        px(22, 1, `rgba(255, 255, 255, ${pulse})`);
      } else {
        // Balise centrale par défaut (pulse_beacon)
        const antennaPulse = Math.sin(time * 0.007) * 0.3 + 0.7;
        fillBox(17, 3, 2, 2, COLOR_ANTENNA);
        px(16, 3, `rgba(255, 46, 147, ${antennaPulse * 0.7})`);
        px(19, 3, `rgba(255, 46, 147, ${antennaPulse * 0.7})`);
        px(17, 2, `rgba(255, 255, 255, ${antennaPulse * 0.85})`);
        fillBox(17, 5, 2, 4, "#334155");
        px(17, 4, "#94A3B8");
      }

      // ── B. Modules Cybernétiques Latéraux (Oreilles) Procéduraux ──
      if (earType === "cyber_wings") {
        // Ailettes cybernétiques profilées
        // Gauche
        fillBox(3, 15, 4, 3, COLOR_CHASSIS_MID);
        fillBox(2, 14, 3, 2, COLOR_NEON);
        px(1, 13, COLOR_RIM);
        fillBox(4, 18, 3, 2, COLOR_ACCENT_DARK);

        // Droite
        fillBox(29, 15, 4, 3, COLOR_CHASSIS_MID);
        fillBox(31, 14, 3, 2, COLOR_NEON);
        px(34, 13, COLOR_RIM);
        fillBox(29, 18, 3, 2, COLOR_ACCENT_DARK);
      } else if (earType === "audio_pods") {
        // Capsules rondes réceptrices
        // Gauche
        fillBox(4, 15, 3, 6, COLOR_CHASSIS_DARK);
        fillBox(5, 16, 2, 4, COLOR_ANTENNA);
        px(5, 17, "#FFFFFF");

        // Droite
        fillBox(29, 15, 3, 6, COLOR_CHASSIS_DARK);
        fillBox(29, 16, 2, 4, COLOR_ANTENNA);
        px(30, 17, "#FFFFFF");
      } else if (earType === "armor_fins") {
        // Ailerons d'armure biseautés
        // Gauche
        fillBox(4, 13, 3, 9, COLOR_CHASSIS_LIGHT);
        fillBox(3, 15, 2, 6, COLOR_NEON);
        px(3, 14, COLOR_RIM);

        // Droite
        fillBox(29, 13, 3, 9, COLOR_CHASSIS_LIGHT);
        fillBox(31, 15, 2, 6, COLOR_NEON);
        px(32, 14, COLOR_RIM);
      } else {
        // Égaliseur audio interactif par défaut (equalizer)
        // Gauche
        fillBox(4, 15, 3, 8, COLOR_NEON);
        fillBox(5, 14, 2, 10, COLOR_CHASSIS_DARK);
        fillBox(6, 16, 1, 6, COLOR_ACCENT_LIGHT);
        const eqLeft = Math.floor(Math.sin(time * 0.01) * 2 + 3);
        fillBox(4, 20 - eqLeft, 1, eqLeft, COLOR_NEON);

        // Droite
        fillBox(29, 15, 3, 8, COLOR_NEON);
        fillBox(29, 14, 2, 10, COLOR_CHASSIS_DARK);
        fillBox(29, 16, 1, 6, COLOR_ACCENT_LIGHT);
        const eqRight = Math.floor(Math.cos(time * 0.01) * 2 + 3);
        fillBox(31, 20 - eqRight, 1, eqRight, COLOR_NEON);
      }

      // ── C. Châssis Principal de la Tête (forme beveled 24x17) ──
      // Bord supérieur spéculaire
      fillBox(10, 8, 16, 1, COLOR_RIM);
      fillBox(8, 9, 20, 1, COLOR_CHASSIS_LIGHT);
      fillBox(7, 10, 22, 1, COLOR_NEON);

      // Volume du casque
      fillBox(7, 11, 22, 14, COLOR_CHASSIS_MID);
      fillBox(8, 25, 20, 1, COLOR_CHASSIS_DARK);
      fillBox(9, 26, 18, 1, "#020610");

      // Contours latéraux néon
      fillBox(7, 11, 1, 13, COLOR_NEON);
      fillBox(28, 11, 1, 13, COLOR_ACCENT_DARK);

      // Forehead gem (si actif dans l'ADN)
      if (petDna?.hasForeheadGem) {
        fillBox(17, 9, 2, 2, COLOR_ANTENNA);
        px(17, 9, "#FFFFFF");
      }

      // ── D. Visière OLED ──
      fillBox(9, 12, 18, 11, COLOR_VISOR_BG);
      // Reflet supérieur de verre continu
      fillBox(10, 12, 16, 1, "rgba(255, 255, 255, 0.16)");

      // ── E. Joues LED lumineuses ──
      fillBox(10, 20, 2, 1, COLOR_CHEEK);
      fillBox(24, 20, 2, 1, COLOR_CHEEK);

      // ── F. Rendu des Yeux selon l'humeur ──
      const eyeX = s.currentGazeX;
      const eyeY = s.currentGazeY;

      if (currentMood === "focused") {
        // Mode concentration intense : regard vif et perçant
        const leftX = 11 + eyeX;
        const leftY = 15 + eyeY;
        const rightX = 21 + eyeX;
        const rightY = 15 + eyeY;

        // Sourcils cybernétiques
        px(leftX, leftY - 1, COLOR_ACCENT_LIGHT);
        px(leftX + 1, leftY - 1, COLOR_ACCENT_LIGHT);
        px(leftX + 2, leftY - 1, COLOR_ACCENT_LIGHT);
        px(rightX + 1, rightY - 1, COLOR_ACCENT_LIGHT);
        px(rightX + 2, rightY - 1, COLOR_ACCENT_LIGHT);
        px(rightX + 3, rightY - 1, COLOR_ACCENT_LIGHT);

        // Yeux 4x3 vifs
        fillBox(leftX, leftY, 4, 3, COLOR_NEON);
        fillBox(leftX + 1, leftY + 1, 2, 2, COLOR_PUPIL);
        px(leftX + 2, leftY + 1, "#FFFFFF");

        fillBox(rightX, rightY, 4, 3, COLOR_NEON);
        fillBox(rightX + 1, rightY + 1, 2, 2, COLOR_PUPIL);
        px(rightX + 1, rightY + 1, "#FFFFFF");
      } else if (currentMood === "sleepy") {
        // Mode veille : fentes calmes _ _ avec Zzz
        fillBox(12, 17, 4, 1, COLOR_NEON);
        fillBox(20, 17, 4, 1, COLOR_NEON);
        const zProg = (time * 0.001) % 2;
        if (zProg < 1.2) {
          px(26, Math.floor(9 - zProg * 4), COLOR_RIM);
          px(27, Math.floor(8 - zProg * 4), COLOR_RIM);
        }
      } else if (currentMood === "visor") {
        // Mode visière laser tactique
        fillBox(9, 14, 18, 5, "rgba(245, 158, 11, 0.4)");
        fillBox(9, 15, 18, 3, "#F59E0B");
        const lx = 9 + Math.floor(s.scanPos);
        fillBox(lx, 14, 2, 5, "#FEF3C7");
      } else if (currentMood === "eating") {
        // Mode recharge énergétique
        fillBox(12, 15, 4, 3, COLOR_NEON);
        fillBox(20, 15, 4, 3, COLOR_NEON);
        if (s.munchFrame % 2 === 0) {
          fillBox(16, 20, 4, 2, COLOR_ANTENNA);
        } else {
          fillBox(16, 21, 4, 1, COLOR_ANTENNA);
        }
      } else if (currentMood === "radar") {
        // Mode mire radar
        fillBox(12, 15, 4, 4, COLOR_NEON);
        fillBox(20, 15, 4, 4, COLOR_NEON);
        px(13, 16, COLOR_VISOR_BG);
        px(21, 16, COLOR_VISOR_BG);
      } else if (currentMood === "happy" || isHovered) {
        // Mode joyeux : yeux arqués ^ ^
        px(12, 17, COLOR_NEON);
        px(13, 16, COLOR_NEON);
        px(14, 16, COLOR_NEON);
        px(15, 17, COLOR_NEON);

        px(20, 17, COLOR_NEON);
        px(21, 16, COLOR_NEON);
        px(22, 16, COLOR_NEON);
        px(23, 17, COLOR_NEON);
      } else if (currentMood === "love") {
        // Cœurs battants dans les yeux
        const heartColor = Math.sin(time * 0.01) > 0 ? COLOR_ANTENNA : COLOR_CHEEK;
        fillBox(12, 16, 4, 2, heartColor);
        px(13, 18, heartColor);
        px(14, 18, heartColor);
        fillBox(20, 16, 4, 2, heartColor);
        px(21, 18, heartColor);
        px(22, 18, heartColor);
      } else if (s.blinkProgress > 0.4) {
        // Clignement d'œil ultra-propre
        fillBox(12, 17, 4, 1, COLOR_GLOW);
        fillBox(20, 17, 4, 1, COLOR_GLOW);
      } else {
        // Mode normal selon la morphologie oculaire
        const leftX = 12 + eyeX;
        const leftY = 15 + eyeY;
        const rightX = 20 + eyeX;
        const rightY = 15 + eyeY;

        if (eyeShape === "visor_strip") {
          // Double fente visière cyber
          fillBox(leftX, leftY + 1, 4, 2, COLOR_NEON);
          fillBox(rightX, rightY + 1, 4, 2, COLOR_NEON);
          px(leftX + 1, leftY + 1, "#FFFFFF");
          px(rightX + 1, rightY + 1, "#FFFFFF");
        } else if (eyeShape === "soft_corners") {
          // Yeux doux biseautés
          fillBox(leftX, leftY + 1, 4, 2, COLOR_NEON);
          fillBox(leftX + 1, leftY, 2, 4, COLOR_NEON);
          fillBox(leftX + 1, leftY + 1, 2, 2, COLOR_PUPIL);
          px(leftX + 1, leftY + 1, "#FFFFFF");

          fillBox(rightX, rightY + 1, 4, 2, COLOR_NEON);
          fillBox(rightX + 1, rightY, 2, 4, COLOR_NEON);
          fillBox(rightX + 1, rightY + 1, 2, 2, COLOR_PUPIL);
          px(rightX + 1, rightY + 1, "#FFFFFF");
        } else {
          // Classic square 4x4
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
