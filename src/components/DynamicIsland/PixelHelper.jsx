import React, { useEffect, useRef, useState } from "react";

// Compagnon Cyber-Bot 2.5D Haute Définition ("Nova HD") pour la Dynamic Island.
// Rendu pixel-art RAZOR-SHARP (100% net, zéro flou) :
// - Canvas calibré sur window.devicePixelRatio natif pour écrans Retina / High-DPI.
// - Grille haute définition 36x36 avec projection géométrique directe au pixel physique.
// - Suppression des filtres CSS floutants sur le canvas (glow déporté sur le pod).
// - Yeux digitaux expressifs, suivi de curseur fluide et animations d'humeur.

const GRID_SIZE = 36;

export function PixelHelper({
  size = 38,
  className = "",
  mood = "normal", // "normal" | "happy" | "focused" | "love" | "sleepy" | "visor" | "eating" | "radar"
  onClick,
  bubbleOut = false,
}) {
  const canvasRef = useRef(null);
  const [currentMood, setCurrentMood] = useState(mood);
  const [isHovered, setIsHovered] = useState(false);

  // État d'animation interpolé
  const animState = useRef({
    targetGazeX: 0,
    targetGazeY: 0,
    currentGazeX: 0,
    currentGazeY: 0,
    blinkProgress: 0,
    isBlinking: false,
    lastBlink: Date.now(),
    nextBlinkInterval: 3000,
    lastInteraction: Date.now(),
    scanPos: 0,
    munchFrame: 0,
  });

  // Synchronise le mood externe
  useEffect(() => {
    setCurrentMood(mood);
    animState.current.lastInteraction = Date.now();
  }, [mood]);

  // Écouteur de mouvement de souris global pour le suivi du regard
  useEffect(() => {
    const onMouseMove = (e) => {
      const state = animState.current;
      state.lastInteraction = Date.now();
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const deltaX = e.clientX - centerX;
      const deltaY = e.clientY - centerY;
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
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMouseMove);
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

      // ── Palette Cyber-Bot HD ──
      const COLOR_CHASSIS_DARK = "#050B14";   // Coque sombre profonde
      const COLOR_CHASSIS_MID = "#0A1424";    // Teinte principale titane
      const COLOR_CHASSIS_LIGHT = "#162842";  // Éclairage zénithal
      const COLOR_RIM = "#93C5FD";            // Reflet spéculaire
      const COLOR_NEON = "#00F5D4";           // Liseré cyan néon
      const COLOR_CYAN_GLOW = "#5EEAD4";      // Lueur vive
      const COLOR_VISOR_BG = "#020408";       // Écran OLED noir
      const COLOR_PUPIL = "#002B36";          // Pupille sombre
      const COLOR_ANTENNA = "#FF2E93";        // Balise rose fluo
      const COLOR_CHEEK = "#FF3385";          // Joues LED

      // ── A. Antenne centrale & Balise de transmission ──
      const antennaPulse = Math.sin(time * 0.007) * 0.3 + 0.7;
      fillBox(17, 3, 2, 2, COLOR_ANTENNA);
      px(16, 3, `rgba(255, 46, 147, ${antennaPulse * 0.7})`);
      px(19, 3, `rgba(255, 46, 147, ${antennaPulse * 0.7})`);
      px(17, 2, `rgba(255, 255, 255, ${antennaPulse * 0.85})`);
      fillBox(17, 5, 2, 4, "#334155");
      px(17, 4, "#94A3B8");

      // ── B. Écouteurs / Modules cybernétiques latéraux ──
      // Gauche
      fillBox(4, 15, 3, 8, COLOR_NEON);
      fillBox(5, 14, 2, 10, COLOR_CHASSIS_DARK);
      fillBox(6, 16, 1, 6, "#38BDF8");
      // Barregraphe audio LED oreille gauche
      const eqLeft = Math.floor(Math.sin(time * 0.01) * 2 + 3);
      fillBox(4, 20 - eqLeft, 1, eqLeft, "#00F5D4");

      // Droite
      fillBox(29, 15, 3, 8, COLOR_NEON);
      fillBox(29, 14, 2, 10, COLOR_CHASSIS_DARK);
      fillBox(29, 16, 1, 6, "#38BDF8");
      // Barregraphe audio LED oreille droite
      const eqRight = Math.floor(Math.cos(time * 0.01) * 2 + 3);
      fillBox(31, 20 - eqRight, 1, eqRight, "#00F5D4");

      // ── C. Châssis principal de la tête (forme beveled 24x17) ──
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
      fillBox(28, 11, 1, 13, "#0284C7");

      // ── D. Visière OLED ──
      fillBox(9, 12, 18, 11, COLOR_VISOR_BG);
      // Reflet supérieur de verre continu
      fillBox(10, 12, 16, 1, "rgba(255, 255, 255, 0.16)");

      // ── E. Joues LED lumineuses ──
      fillBox(10, 20, 2, 1, COLOR_CHEEK);
      fillBox(24, 20, 2, 1, COLOR_CHEEK);

      // ── F. Rendu des yeux selon l'humeur ──
      const eyeX = s.currentGazeX;
      const eyeY = s.currentGazeY;

      if (currentMood === "focused") {
        // Mode concentration intense : regard vif et perçant
        const leftX = 11 + eyeX;
        const leftY = 15 + eyeY;
        const rightX = 21 + eyeX;
        const rightY = 15 + eyeY;

        // Sourcils cybernétiques
        px(leftX, leftY - 1, "#38BDF8");
        px(leftX + 1, leftY - 1, "#38BDF8");
        px(leftX + 2, leftY - 1, "#38BDF8");
        px(rightX + 1, rightY - 1, "#38BDF8");
        px(rightX + 2, rightY - 1, "#38BDF8");
        px(rightX + 3, rightY - 1, "#38BDF8");

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
          px(26, Math.floor(9 - zProg * 4), "#93C5FD");
          px(27, Math.floor(8 - zProg * 4), "#93C5FD");
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
          fillBox(16, 20, 4, 2, "#FF2E93");
        } else {
          fillBox(16, 21, 4, 1, "#FF2E93");
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
        const heartColor = Math.sin(time * 0.01) > 0 ? "#FF2E93" : "#FF6584";
        fillBox(12, 16, 4, 2, heartColor);
        px(13, 18, heartColor);
        px(14, 18, heartColor);
        fillBox(20, 16, 4, 2, heartColor);
        px(21, 18, heartColor);
        px(22, 18, heartColor);
      } else if (s.blinkProgress > 0.4) {
        // Clignement d'œil ultra-propre
        fillBox(12, 17, 4, 1, COLOR_CYAN_GLOW);
        fillBox(20, 17, 4, 1, COLOR_CYAN_GLOW);
      } else {
        // Mode normal : grands yeux numériques 4x4 avec reflet blanc et pupille glissante
        const leftX = 12 + eyeX;
        const leftY = 15 + eyeY;
        const rightX = 20 + eyeX;
        const rightY = 15 + eyeY;

        fillBox(leftX, leftY, 4, 4, COLOR_NEON);
        fillBox(leftX + 1, leftY + 1, 2, 2, COLOR_PUPIL);
        px(leftX + 1, leftY + 1, "#FFFFFF");

        fillBox(rightX, rightY, 4, 4, COLOR_NEON);
        fillBox(rightX + 1, rightY + 1, 2, 2, COLOR_PUPIL);
        px(rightX + 1, rightY + 1, "#FFFFFF");
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [currentMood, isHovered, size]);

  const handleClick = (e) => {
    animState.current.lastInteraction = Date.now();
    onClick?.(e);
  };

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
      title="Cyber Companion Nova (Click for Companion Deck)"
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
