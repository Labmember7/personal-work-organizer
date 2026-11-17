import React, { useEffect, useMemo, useRef, useState } from "react";
import { getOrCreatePetDna } from "../../lib/petGenerator";
import { playHapticTick } from "../../lib/audioFx";

// Compagnon Cyber-Agent 2.5D Pixel-Art Cloud Mascot (Full-Body).
// Silhouette sculptée rangée par rangée pour des courbes propres sans crénelage,
// visière OLED encastrée avec reflet verre, et ombrage 3 tons harmonieux.

const VIRTUAL_W = 52;
const VIRTUAL_H = 64;

const CHIBI_BODY_TONES = {
  "cyber-cyan": { outline: "#0B1124", body: "#5179F6", highlight: "#82A4FF", shadow: "#3456C5" },
  "solar-amber": { outline: "#1C1006", body: "#F59E0B", highlight: "#FCD34D", shadow: "#B45309" },
  "void-phantom": { outline: "#140A24", body: "#8B5CF6", highlight: "#C4B5FD", shadow: "#6D28D9" },
  "matrix-emerald": { outline: "#051B11", body: "#10B981", highlight: "#6EE7B7", shadow: "#047857" },
  "glacier-frost": { outline: "#071728", body: "#38BDF8", highlight: "#BAE6FD", shadow: "#0284C7" },
  "crimson-ruby": { outline: "#1E070D", body: "#F43F5E", highlight: "#FDA4AF", shadow: "#BE123C" },
  "sunset-synthwave": { outline: "#180A26", body: "#EC4899", highlight: "#F9A8D4", shadow: "#BE185D" },
  "quantum-ghost": { outline: "#081C21", body: "#14B8A6", highlight: "#99F6E4", shadow: "#0F766E" },
};

function resolveBodyTones(pal) {
  if (pal?.id && CHIBI_BODY_TONES[pal.id]) {
    return CHIBI_BODY_TONES[pal.id];
  }
  return {
    outline: pal?.chassisDark || "#0B1124",
    body: pal?.accentLight || "#5179F6",
    highlight: pal?.rim || "#82A4FF",
    shadow: pal?.accentDark || "#3456C5",
  };
}

export function FullBodyPet({
  size = 110,
  className = "",
  mood = "normal", // "normal" | "happy" | "focused" | "love" | "sleepy" | "visor" | "radar" | "eating"
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
        y: rect.top + rect.height / 3,
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

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

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

      // Rebond interactif au clic
      if (s.bouncing) {
        const bounceElapsed = Date.now() - s.bounceStartTime;
        if (bounceElapsed < 300) {
          const p = bounceElapsed / 300;
          s.bounceProgress = Math.sin(p * Math.PI) * -5;
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

      const hoverSpeed = currentMood === "focused" ? 0.0038 : 0.0026;
      const hoverAmp = reduceMotion ? 0 : currentMood === "sleepy" ? 0.6 : 1.15;
      const hoverY = Math.sin(time * hoverSpeed) * hoverAmp + (reduceMotion ? 0 : s.bounceProgress);

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

      const pal = petDna?.palette || {};
      const tones = resolveBodyTones(pal);
      const COLOR_OUTLINE = tones.outline;
      const COLOR_BODY = tones.body;
      const COLOR_HIGHLIGHT = tones.highlight;
      const COLOR_SHADOW = tones.shadow;
      const COLOR_VISOR_BG = "#070B18";
      const COLOR_EYE = pal.neon || "#00F5FF";
      const COLOR_CHEST_GLYPH = "#FFFFFF";
      const COLOR_CHEEK = pal.cheek || "#FF4D8D";

      // ── 0. Ombre portée douce au sol ──
      const shadowY = 58;
      const shadowScale = 1 - (hoverY + 1.5) * 0.045;
      const shadowW = Math.max(16, Math.round(22 * shadowScale));
      const shadowX = 26 - Math.round(shadowW / 2);
      fillBox(shadowX, shadowY + 1, shadowW, 2, "rgba(0, 0, 0, 0.28)");
      fillBox(shadowX + 3, shadowY + 1, Math.max(10, shadowW - 6), 2, "rgba(0, 0, 0, 0.42)");

      const baseY = Math.round(7 + hoverY);

      // ── 1. Jambes & Pieds arrondis ──
      const drawFoot = (fx) => {
        fillBox(fx, baseY + 38, 6, 9, COLOR_OUTLINE);
        fillBox(fx + 1, baseY + 47, 4, 1, COLOR_OUTLINE);
        fillBox(fx + 1, baseY + 39, 4, 7, COLOR_BODY);
        fillBox(fx + 1, baseY + 39, 4, 2, COLOR_SHADOW);
        fillBox(fx + 1, baseY + 45, 4, 1, COLOR_HIGHLIGHT);
      };
      drawFoot(18);
      drawFoot(28);

      // ── 2. Torse compact arrondi ──
      fillBox(17, baseY + 26, 18, 14, COLOR_OUTLINE);
      fillBox(16, baseY + 27, 20, 12, COLOR_OUTLINE);
      fillBox(17, baseY + 27, 18, 12, COLOR_BODY);
      fillBox(18, baseY + 27, 16, 1, COLOR_SHADOW); // Ombre portée sous la tête
      fillBox(18, baseY + 37, 16, 2, COLOR_SHADOW);
      fillBox(18, baseY + 28, 16, 1, COLOR_HIGHLIGHT);

      // ── 3. Glyphe Terminal >_ sur la poitrine ──
      px(22, baseY + 31, COLOR_CHEST_GLYPH);
      px(23, baseY + 32, COLOR_CHEST_GLYPH);
      px(24, baseY + 33, COLOR_CHEST_GLYPH);
      px(23, baseY + 34, COLOR_CHEST_GLYPH);
      px(22, baseY + 35, COLOR_CHEST_GLYPH);
      fillBox(26, baseY + 35, 4, 1, COLOR_CHEST_GLYPH);
      fillBox(26, baseY + 34, 4, 1, COLOR_EYE);

      // ── 4. Bras articulés doux ──
      const armSway = reduceMotion ? 0 : Math.sin(time * 0.0028) * 1.1;

      const drawArm = (ax, ay, raised = false, glowTip = false) => {
        fillBox(ax + 1, ay, 4, 10, COLOR_OUTLINE);
        fillBox(ax, ay + 1, 6, 8, COLOR_OUTLINE);
        fillBox(ax + 1, ay + 1, 4, 8, COLOR_BODY);
        fillBox(ax + 1, raised ? ay + 1 : ay + 2, 4, 1, COLOR_HIGHLIGHT);
        fillBox(ax + 1, ay + 7, 4, 2, glowTip ? COLOR_EYE : COLOR_SHADOW);
      };

      if (currentMood === "happy" || bounceActive) {
        drawArm(10, baseY + 21, true);
        drawArm(36, baseY + 21, true);
      } else if (currentMood === "focused") {
        const typeOffset = reduceMotion ? 0 : Math.round(Math.sin(time * 0.014) * 0.9);
        drawArm(10, baseY + 27 + typeOffset, false, true);
        drawArm(36, baseY + 27 - typeOffset, false, true);
      } else {
        drawArm(10, baseY + 27 + Math.round(armSway));
        drawArm(36, baseY + 27 - Math.round(armSway));
      }

      // ── 5. Tête Nuage Sculptée (silhouette symétrique rangée par rangée) ──
      // Contour externe lisse
      const headOutlineRows = [
        [0, 21, 30],
        [1, 18, 33],
        [2, 13, 38],
        [3, 11, 40],
        [4, 10, 41],
        [5, 9, 42],
        [6, 9, 42],
        [7, 9, 42],
        [8, 8, 43],
        [9, 8, 43],
        [10, 8, 43],
        [11, 8, 43],
        [12, 8, 43],
        [13, 8, 43],
        [14, 8, 43],
        [15, 8, 43],
        [16, 8, 43],
        [17, 8, 43],
        [18, 8, 43],
        [19, 9, 42],
        [20, 9, 42],
        [21, 10, 41],
        [22, 11, 40],
        [23, 13, 38],
        [24, 16, 35],
      ];
      for (const [dy, x1, x2] of headOutlineRows) {
        fillBox(x1, baseY + dy, x2 - x1 + 1, 1, COLOR_OUTLINE);
      }

      // Remplissage intérieur avec courbes lisses
      const headBodyRows = [
        [1, 21, 30, COLOR_HIGHLIGHT],
        [2, 18, 33, COLOR_HIGHLIGHT],
        [3, 13, 38, COLOR_HIGHLIGHT],
        [4, 12, 39, COLOR_BODY],
        [5, 11, 40, COLOR_BODY],
        [6, 10, 41, COLOR_BODY],
        [7, 10, 41, COLOR_BODY],
        [8, 9, 42, COLOR_BODY],
        [9, 9, 42, COLOR_BODY],
        [10, 9, 42, COLOR_BODY],
        [11, 9, 42, COLOR_BODY],
        [12, 9, 42, COLOR_BODY],
        [13, 9, 42, COLOR_BODY],
        [14, 9, 42, COLOR_BODY],
        [15, 9, 42, COLOR_BODY],
        [16, 9, 42, COLOR_BODY],
        [17, 9, 42, COLOR_BODY],
        [18, 9, 42, COLOR_BODY],
        [19, 10, 41, COLOR_BODY],
        [20, 10, 41, COLOR_BODY],
        [21, 11, 40, COLOR_BODY],
        [22, 12, 39, COLOR_SHADOW],
        [23, 16, 35, COLOR_SHADOW],
      ];
      for (const [dy, x1, x2, col] of headBodyRows) {
        fillBox(x1, baseY + dy, x2 - x1 + 1, 1, col);
      }
      // Reflets latéraux doux sur les joues
      fillBox(10, baseY + 10, 1, 6, COLOR_HIGHLIGHT);
      fillBox(41, baseY + 10, 1, 6, COLOR_HIGHLIGHT);

      // ── 6. Visière OLED Encastrée aux coins chanfreinés ──
      const vx = 13;
      const vy = baseY + 8;
      const vw = 26;
      const vh = 13;

      // Cadre externe de visière
      fillBox(vx + 1, vy - 1, vw - 2, vh + 2, COLOR_OUTLINE);
      fillBox(vx - 1, vy + 1, vw + 2, vh - 2, COLOR_OUTLINE);
      fillBox(vx, vy, vw, vh, COLOR_OUTLINE);

      // Écran OLED interne (coins arrondis 1px)
      fillBox(vx + 1, vy, vw - 2, vh, COLOR_VISOR_BG);
      fillBox(vx, vy + 1, vw, vh - 2, COLOR_VISOR_BG);

      // Reflet supérieur discret & liseré inférieur
      fillBox(vx + 2, vy, vw - 4, 1, "rgba(255, 255, 255, 0.16)");
      fillBox(vx + 2, vy + vh - 1, vw - 4, 1, "rgba(255, 255, 255, 0.06)");

      // ── 7. Expressions d'Yeux Pixels Lumineux ──
      const eyeX = Math.round(s.currentGazeX);
      const eyeY = Math.round(s.currentGazeY);
      const lx = 17 + eyeX;
      const ly = vy + 4 + eyeY;
      const rx = 28 + eyeX;
      const ry = vy + 4 + eyeY;

      if (currentMood === "sleepy") {
        // Yeux fermés zen ˘ ˘
        px(lx, ly + 1, COLOR_EYE);
        px(lx + 1, ly + 2, COLOR_EYE);
        px(lx + 2, ly + 2, COLOR_EYE);
        px(lx + 3, ly + 1, COLOR_EYE);

        px(rx, ry + 1, COLOR_EYE);
        px(rx + 1, ry + 2, COLOR_EYE);
        px(rx + 2, ry + 2, COLOR_EYE);
        px(rx + 3, ry + 1, COLOR_EYE);

        if (!reduceMotion) {
          const zProg = (time * 0.001) % 2.4;
          if (zProg < 1.3) {
            px(38, Math.floor(baseY - zProg * 3), COLOR_HIGHLIGHT);
            px(39, Math.floor(baseY - 1 - zProg * 3), COLOR_HIGHLIGHT);
          }
        }
      } else if (s.blinkProgress > 0.3) {
        fillBox(lx, ly + 2, 4, 1, COLOR_EYE);
        fillBox(rx, ry + 2, 4, 1, COLOR_EYE);
      } else if (currentMood === "happy" || bounceActive || isHovered) {
        // Yeux joyeux en arc (^ ^)
        px(lx + 1, ly + 1, COLOR_EYE);
        px(lx + 2, ly + 1, COLOR_EYE);
        px(lx, ly + 2, COLOR_EYE);
        px(lx + 3, ly + 2, COLOR_EYE);

        px(rx + 1, ry + 1, COLOR_EYE);
        px(rx + 2, ry + 1, COLOR_EYE);
        px(rx, ry + 2, COLOR_EYE);
        px(rx + 3, ry + 2, COLOR_EYE);

        fillBox(lx, ly + 4, 3, 1, COLOR_CHEEK);
        fillBox(rx + 1, ry + 4, 3, 1, COLOR_CHEEK);
      } else if (currentMood === "love") {
        fillBox(lx, ly + 1, 2, 2, COLOR_CHEEK);
        fillBox(lx + 2, ly + 1, 2, 2, COLOR_CHEEK);
        fillBox(lx + 1, ly + 3, 2, 1, COLOR_CHEEK);
        fillBox(rx, ry + 1, 2, 2, COLOR_CHEEK);
        fillBox(rx + 2, ry + 1, 2, 2, COLOR_CHEEK);
        fillBox(rx + 1, ry + 3, 2, 1, COLOR_CHEEK);
      } else if (currentMood === "focused") {
        // Mode focus : > _ avec curseur doux
        px(lx, ly, COLOR_EYE);
        px(lx + 1, ly + 1, COLOR_EYE);
        px(lx + 2, ly + 2, "#FFFFFF");
        px(lx + 1, ly + 3, COLOR_EYE);
        px(lx, ly + 4, COLOR_EYE);

        const cursorPulse = reduceMotion || Math.sin(time * 0.006) > -0.35;
        fillBox(rx, ry + 3, 5, 2, cursorPulse ? COLOR_EYE : "rgba(0, 245, 255, 0.35)");
        if (cursorPulse) fillBox(rx + 1, ry + 3, 3, 1, "#FFFFFF");
      } else {
        // Mode normal : > -
        px(lx, ly, COLOR_EYE);
        px(lx + 1, ly + 1, COLOR_EYE);
        px(lx + 2, ly + 2, "#FFFFFF");
        px(lx + 1, ly + 3, COLOR_EYE);
        px(lx, ly + 4, COLOR_EYE);

        fillBox(rx, ry + 2, 5, 2, COLOR_EYE);
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
