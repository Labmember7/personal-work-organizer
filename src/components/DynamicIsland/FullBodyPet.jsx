import React, { useEffect, useMemo, useRef, useState } from "react";
import { getOrCreatePetDna } from "../../lib/petGenerator";
import { playAppleChime, playHapticTick } from "../../lib/audioFx";

// Compagnon Cyber-Agent 2.5D Pixel-Art Cloud Mascot (Full-Body).
// Modèle inspiré de l'agent Codex / Antigravity :
// - Tête en forme de nuage 2.5D avec lobes supérieurs et latéraux bien définis
// - Visière écran sombre avec yeux pixels cyan expressifs (> -, ˘ ˘, > _, ^ ^)
// - Torse bleu doux avec glyphe de terminal >_ lumineux sur la poitrine
// - Bras articulés et jambes/pieds mignons posés au sol avec ombre portée
// - Suivi du regard souris en temps réel, clignements naturels et rebond tactile au clic.

const VIRTUAL_W = 52;
const VIRTUAL_H = 64;

export function FullBodyPet({
  size = 110,
  className = "",
  mood = "normal", // "normal" | "happy" | "focused" | "love" | "sleepy" | "visor"
  onClick,
  dna = null,
}) {
  const canvasRef = useRef(null);
  const [currentMood, setCurrentMood] = useState(mood);
  const [isHovered, setIsHovered] = useState(false);
  const [bounceActive, setBounceActive] = useState(false);

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
    nextBlinkInterval: 3200,
    lastInteraction: 0,
    bounceProgress: 0,
    bouncing: false,
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

  // Suivi de curseur global fluide
  useEffect(() => {
    let cachedCenter = null;
    let rafId = null;

    const updateCenter = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      cachedCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 3, // Regard ancré au niveau de la tête
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
        const factor = Math.min(1, dist / 260);
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

  // Détection d'inactivité -> mode endormi après 45s
  useEffect(() => {
    const timer = setInterval(() => {
      const idleTime = Date.now() - animState.current.lastInteraction;
      if (idleTime > 45000 && currentMood === "normal") {
        setCurrentMood("sleepy");
      }
    }, 4000);
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

      const dpr = typeof window !== "undefined" ? Math.max(1, window.devicePixelRatio || 1) : 1;
      const aspect = VIRTUAL_H / VIRTUAL_W;
      const cssW = size;
      const cssH = Math.round(size * aspect);
      const physicalW = Math.round(cssW * dpr);
      const physicalH = Math.round(cssH * dpr);

      if (canvas.width !== physicalW || canvas.height !== physicalH) {
        canvas.width = physicalW;
        canvas.height = physicalH;
      }

      const pxScaleX = physicalW / VIRTUAL_W;
      const pxScaleY = physicalH / VIRTUAL_H;

      // Interpolation fluide du regard
      s.currentGazeX += (s.targetGazeX - s.currentGazeX) * 0.16;
      s.currentGazeY += (s.targetGazeY - s.currentGazeY) * 0.16;

      // Gestion du rebond interactif au clic
      if (s.bouncing) {
        const bounceElapsed = Date.now() - s.bounceStartTime;
        if (bounceElapsed < 320) {
          const p = bounceElapsed / 320;
          s.bounceProgress = Math.sin(p * Math.PI) * -6;
        } else {
          s.bouncing = false;
          s.bounceProgress = 0;
          setBounceActive(false);
        }
      }

      // Clignements d'yeux naturels
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

      // Physique de respiration douce
      const hoverSpeed = currentMood === "focused" ? 0.005 : 0.0035;
      const hoverAmp = currentMood === "sleepy" ? 1.0 : 1.5;
      const hoverY = Math.sin(time * hoverSpeed) * hoverAmp + s.bounceProgress;

      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, physicalW, physicalH);

      const px = (x, y, color) => {
        ctx.fillStyle = color;
        ctx.fillRect(
          Math.floor(x * pxScaleX),
          Math.floor(y * pxScaleY),
          Math.ceil(pxScaleX),
          Math.ceil(pxScaleY)
        );
      };

      const fillBox = (x, y, w, h, color) => {
        ctx.fillStyle = color;
        ctx.fillRect(
          Math.floor(x * pxScaleX),
          Math.floor(y * pxScaleY),
          Math.ceil(w * pxScaleX),
          Math.ceil(h * pxScaleY)
        );
      };

      // Palette dérivée de l'ADN ou palette officielle Codex Mascot
      const pal = petDna?.palette || {};
      const COLOR_OUTLINE = pal.chassisDark || "#0E152D";
      const COLOR_BODY = pal.chassisLight && pal.id !== "cyber-cyan" ? pal.chassisLight : "#5179F6";
      const COLOR_HIGHLIGHT = pal.rim && pal.id !== "cyber-cyan" ? pal.rim : "#7498FC";
      const COLOR_SHADOW = pal.chassisMid && pal.id !== "cyber-cyan" ? pal.chassisMid : "#3759C8";
      const COLOR_VISOR_BG = "#0D1328";
      const COLOR_CYAN = pal.neon || "#00F5FF";
      const COLOR_CHEST_GLYPH = "#FFFFFF";
      const COLOR_CHEEK = pal.cheek || "#FF3385";

      // ── 0. Ombre portée douce au sol ──
      const shadowY = 58;
      const shadowScale = 1 - (hoverY + 2.0) * 0.05;
      const shadowW = Math.max(16, Math.round(24 * shadowScale));
      const shadowH = 3;
      const shadowX = 26 - Math.round(shadowW / 2);
      fillBox(shadowX, shadowY, shadowW, shadowH, "rgba(0, 0, 0, 0.40)");
      fillBox(shadowX + 2, shadowY + 1, Math.max(10, shadowW - 4), 1, "rgba(0, 0, 0, 0.65)");

      // Origine verticale animée du corps
      const baseY = Math.round(6 + hoverY);

      // ── 1. Jambes & Pieds posés au sol ──
      // Jambe gauche
      fillBox(17, baseY + 38, 7, 12, COLOR_OUTLINE);
      fillBox(18, baseY + 39, 5, 10, COLOR_BODY);
      fillBox(18, baseY + 39, 5, 2, COLOR_HIGHLIGHT);
      fillBox(18, baseY + 46, 5, 3, COLOR_SHADOW);

      // Jambe droite
      fillBox(28, baseY + 38, 7, 12, COLOR_OUTLINE);
      fillBox(29, baseY + 39, 5, 10, COLOR_BODY);
      fillBox(29, baseY + 39, 5, 2, COLOR_HIGHLIGHT);
      fillBox(29, baseY + 46, 5, 3, COLOR_SHADOW);

      // Entrejambe
      fillBox(24, baseY + 44, 4, 6, "rgba(0, 0, 0, 0.15)");

      // ── 2. Torse arrondi bleu ──
      fillBox(15, baseY + 27, 22, 13, COLOR_OUTLINE);
      fillBox(16, baseY + 26, 20, 15, COLOR_OUTLINE);

      fillBox(16, baseY + 28, 20, 11, COLOR_BODY);
      fillBox(17, baseY + 27, 18, 13, COLOR_BODY);

      // Reflet supérieur du torse
      fillBox(18, baseY + 27, 16, 2, COLOR_HIGHLIGHT);
      // Ombre inférieure du torse
      fillBox(18, baseY + 38, 16, 2, COLOR_SHADOW);

      // ── 3. Glyphe Terminal >_ sur la poitrine ──
      // Glyphe > (flèche de commande)
      px(22, baseY + 31, COLOR_CHEST_GLYPH);
      px(23, baseY + 32, COLOR_CHEST_GLYPH);
      px(24, baseY + 33, COLOR_CHEST_GLYPH);
      px(23, baseY + 34, COLOR_CHEST_GLYPH);
      px(22, baseY + 35, COLOR_CHEST_GLYPH);

      // Glyphe _ (curseur horizontal)
      fillBox(26, baseY + 35, 4, 1, COLOR_CHEST_GLYPH);
      fillBox(26, baseY + 34, 4, 1, "rgba(0, 245, 255, 0.5)");

      // ── 4. Bras articulés mignons ──
      const armSway = Math.sin(time * 0.004) * 1.5;

      if (currentMood === "happy" || bounceActive) {
        // Bras levés en signe de victoire / joie
        fillBox(9, baseY + 20, 7, 10, COLOR_OUTLINE);
        fillBox(10, baseY + 21, 5, 8, COLOR_BODY);
        fillBox(10, baseY + 20, 5, 3, COLOR_HIGHLIGHT);

        fillBox(36, baseY + 20, 7, 10, COLOR_OUTLINE);
        fillBox(37, baseY + 21, 5, 8, COLOR_BODY);
        fillBox(37, baseY + 20, 5, 3, COLOR_HIGHLIGHT);
      } else if (currentMood === "focused") {
        // Bras en position de frappe au clavier / opération
        const typeOffset = Math.sin(time * 0.02) * 1.2;
        fillBox(10, baseY + 28 + Math.round(typeOffset), 6, 9, COLOR_OUTLINE);
        fillBox(11, baseY + 29 + Math.round(typeOffset), 4, 7, COLOR_BODY);
        fillBox(13, baseY + 33 + Math.round(typeOffset), 3, 3, COLOR_CYAN);

        fillBox(36, baseY + 28 - Math.round(typeOffset), 6, 9, COLOR_OUTLINE);
        fillBox(37, baseY + 29 - Math.round(typeOffset), 4, 7, COLOR_BODY);
        fillBox(36, baseY + 33 - Math.round(typeOffset), 3, 3, COLOR_CYAN);
      } else {
        // Bras détendus aux côtés avec léger balancement
        fillBox(9, baseY + 27 + Math.round(armSway), 7, 11, COLOR_OUTLINE);
        fillBox(10, baseY + 28 + Math.round(armSway), 5, 9, COLOR_BODY);
        fillBox(10, baseY + 34 + Math.round(armSway), 5, 3, COLOR_SHADOW);

        fillBox(36, baseY + 27 - Math.round(armSway), 7, 11, COLOR_OUTLINE);
        fillBox(37, baseY + 28 - Math.round(armSway), 5, 9, COLOR_BODY);
        fillBox(37, baseY + 34 - Math.round(armSway), 5, 3, COLOR_SHADOW);
      }

      // ── 5. Tête en Nuage 2.5D (Cloud Silhouette) ──
      // Silhouette extérieure (Contour noir/marine)
      // Dôme central supérieur
      fillBox(19, baseY + 2, 14, 18, COLOR_OUTLINE);
      fillBox(21, baseY, 10, 20, COLOR_OUTLINE);

      // Dôme supérieur gauche
      fillBox(11, baseY + 4, 12, 16, COLOR_OUTLINE);
      fillBox(13, baseY + 2, 8, 18, COLOR_OUTLINE);

      // Dôme supérieur droit
      fillBox(29, baseY + 4, 12, 16, COLOR_OUTLINE);
      fillBox(31, baseY + 2, 8, 18, COLOR_OUTLINE);

      // Joue gauche
      fillBox(7, baseY + 10, 14, 14, COLOR_OUTLINE);
      fillBox(9, baseY + 8, 10, 16, COLOR_OUTLINE);

      // Joue droite
      fillBox(31, baseY + 10, 14, 14, COLOR_OUTLINE);
      fillBox(33, baseY + 8, 10, 16, COLOR_OUTLINE);

      // Menton / Base de tête
      fillBox(14, baseY + 22, 24, 5, COLOR_OUTLINE);

      // ── Remplissage intérieur bleu nuage ──
      // Corps principal du nuage
      fillBox(12, baseY + 6, 28, 18, COLOR_BODY);
      fillBox(15, baseY + 3, 22, 22, COLOR_BODY);
      fillBox(20, baseY + 1, 12, 24, COLOR_BODY);
      fillBox(8, baseY + 11, 36, 12, COLOR_BODY);

      // Reflets supérieurs sur les lobes du nuage
      fillBox(21, baseY + 1, 10, 2, COLOR_HIGHLIGHT);
      fillBox(13, baseY + 3, 7, 2, COLOR_HIGHLIGHT);
      fillBox(32, baseY + 3, 7, 2, COLOR_HIGHLIGHT);
      fillBox(8, baseY + 11, 2, 6, COLOR_HIGHLIGHT);
      fillBox(42, baseY + 11, 2, 6, COLOR_HIGHLIGHT);

      // Ombres inférieures sur les lobes du nuage
      fillBox(16, baseY + 24, 20, 2, COLOR_SHADOW);
      fillBox(9, baseY + 21, 6, 2, COLOR_SHADOW);
      fillBox(37, baseY + 21, 6, 2, COLOR_SHADOW);

      // ── 6. Visière Écran Sombre OLED ──
      const vx = 14;
      const vy = baseY + 9;
      const vw = 24;
      const vh = 14;

      // Contour de la visière
      fillBox(vx - 1, vy, vw + 2, vh, COLOR_OUTLINE);
      fillBox(vx, vy - 1, vw, vh + 2, COLOR_OUTLINE);

      // Écran OLED
      fillBox(vx, vy, vw, vh, COLOR_VISOR_BG);

      // Reflet brillant sur le verre supérieur
      fillBox(vx + 2, vy, vw - 4, 1, "rgba(255, 255, 255, 0.22)");

      // ── 7. Expressions d'Yeux Pixels Cyan ──
      const eyeX = s.currentGazeX;
      const eyeY = s.currentGazeY;
      const lx = Math.round(17 + eyeX);
      const ly = Math.round(vy + 4 + eyeY);
      const rx = Math.round(27 + eyeX);
      const ry = Math.round(vy + 4 + eyeY);

      if (currentMood === "sleepy") {
        // Yeux fermés courbés zen ˘ ˘ (comme sur la Capture 1 de l'utilisateur)
        // Oeil gauche
        px(lx, ly + 2, COLOR_CYAN);
        px(lx + 1, ly + 3, COLOR_CYAN);
        px(lx + 2, ly + 3, COLOR_CYAN);
        px(lx + 3, ly + 2, COLOR_CYAN);
        px(lx + 4, ly + 1, COLOR_CYAN);

        // Oeil droit
        px(rx, ly + 1, COLOR_CYAN);
        px(rx + 1, ly + 2, COLOR_CYAN);
        px(rx + 2, ly + 3, COLOR_CYAN);
        px(rx + 3, ly + 3, COLOR_CYAN);
        px(rx + 4, ly + 2, COLOR_CYAN);

        // Zzz de sommeil occasionnels
        const zProg = (time * 0.001) % 2.5;
        if (zProg < 1.4) {
          px(37, Math.floor(baseY - zProg * 4), COLOR_HIGHLIGHT);
          px(38, Math.floor(baseY - 1 - zProg * 4), COLOR_HIGHLIGHT);
        }
      } else if (s.blinkProgress > 0.3) {
        // Clignement d'yeux naturel (- -)
        fillBox(lx, ly + 2, 5, 2, COLOR_CYAN);
        fillBox(rx, ry + 2, 5, 2, COLOR_CYAN);
      } else if (currentMood === "happy" || bounceActive) {
        // Yeux joyeux en arc (^ ^)
        px(lx + 1, ly + 1, COLOR_CYAN);
        px(lx + 2, ly + 1, COLOR_CYAN);
        px(lx, ly + 2, COLOR_CYAN);
        px(lx + 3, ly + 2, COLOR_CYAN);

        px(rx + 1, ry + 1, COLOR_CYAN);
        px(rx + 2, ry + 1, COLOR_CYAN);
        px(rx, ry + 2, COLOR_CYAN);
        px(rx + 3, ry + 2, COLOR_CYAN);

        // Pommettes roses LED
        fillBox(lx, ly + 4, 3, 1, COLOR_CHEEK);
        fillBox(rx + 1, ry + 4, 3, 1, COLOR_CHEEK);
      } else if (currentMood === "focused") {
        // Mode focus : > _ avec curseur clignotant
        // Oeil gauche : >
        px(lx, ly, COLOR_CYAN);
        px(lx + 1, ly + 1, COLOR_CYAN);
        px(lx + 2, ly + 2, "#FFFFFF");
        px(lx + 1, ly + 3, COLOR_CYAN);
        px(lx, ly + 4, COLOR_CYAN);

        // Oeil droit : curseur _ pulsant
        const cursorPulse = Math.sin(time * 0.01) > 0;
        if (cursorPulse) {
          fillBox(rx, ry + 3, 5, 2, COLOR_CYAN);
          fillBox(rx + 1, ry + 3, 3, 1, "#FFFFFF");
        } else {
          fillBox(rx, ry + 3, 5, 1, "rgba(0, 245, 255, 0.4)");
        }
      } else {
        // Mode normal : > - (comme sur la Capture 2 de l'utilisateur)
        // Oeil gauche : >
        px(lx, ly, COLOR_CYAN);
        px(lx + 1, ly + 1, COLOR_CYAN);
        px(lx + 2, ly + 2, "#FFFFFF");
        px(lx + 1, ly + 3, COLOR_CYAN);
        px(lx, ly + 4, COLOR_CYAN);

        // Oeil droit : -
        fillBox(rx, ry + 2, 5, 2, COLOR_CYAN);
        fillBox(rx + 1, ry + 2, 3, 1, "#FFFFFF");
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [currentMood, isHovered, size, petDna, bounceActive]);

  const handleClick = (e) => {
    animState.current.lastInteraction = Date.now();
    animState.current.bouncing = true;
    animState.current.bounceStartTime = Date.now();
    setBounceActive(true);
    playHapticTick();
    if (Math.random() > 0.5) playAppleChime();
    onClick?.(e);
  };

  const displayName = petDna?.name || "Nova";
  const displayArchetype = petDna?.archetype || "Cloud Agent";

  return (
    <div
      className={
        "trk-fullbody-pet-pod" +
        (bounceActive ? " trk-pet-bouncing" : "") +
        (className ? " " + className : "")
      }
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={`${displayName} · ${displayArchetype} (Click to interact)`}
      style={{
        width: size,
        height: Math.round(size * (VIRTUAL_H / VIRTUAL_W)),
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
          height: Math.round(size * (VIRTUAL_H / VIRTUAL_W)),
          imageRendering: "pixelated",
          display: "block",
        }}
      />
    </div>
  );
}
