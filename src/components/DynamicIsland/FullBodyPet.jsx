import React, { useEffect, useMemo, useRef, useState } from "react";
import { getOrCreatePetDna } from "../../lib/petGenerator";
import { playHapticTick } from "../../lib/audioFx";
import {
  drawPetHead,
  drawQuirkEffects,
  pickNextQuirk,
  resolveHeadPalette,
} from "../../lib/petAnimation";

// Compagnon Cyber-Agent 2.5D Pixel-Art Full-Body.
// Parité visuelle et chromatique totale avec PixelHelper (Dynamic Island) :
// même tête ADN, mêmes couleurs anodisées et animations de caractère uniques.

const VIRTUAL_W = 52;
const VIRTUAL_H = 64;

export function FullBodyPet({
  size = 110,
  className = "",
  mood = "normal", // "normal" | "happy" | "focused" | "love" | "sleepy" | "visor" | "radar" | "eating"
  onClick,
  dna = null,
  showNativeTooltip = true,
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
    animState.current.nextQuirkAt = now + 2600 + Math.random() * 2400;
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

      s.currentGazeX += (s.targetGazeX - s.currentGazeX) * 0.16;
      s.currentGazeY += (s.targetGazeY - s.currentGazeY) * 0.16;

      s.scanPos = reduceMotion ? 8 : (time * 0.018) % 16;
      s.munchFrame = reduceMotion ? 0 : Math.floor(time * 0.006) % 4;

      if (s.bouncing) {
        const bounceElapsed = Date.now() - s.bounceStartTime;
        if (bounceElapsed < 300) {
          const p = bounceElapsed / 300;
          s.bounceProgress = Math.sin(p * Math.PI) * -4.5;
        } else {
          s.bouncing = false;
          s.bounceProgress = 0;
          setBounceActive(false);
        }
      }

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

      // Déclenchement périodique de l'animation propre à l'ADN du compagnon
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

      const quirkLiftY =
        reduceMotion || !s.activeQuirk
          ? 0
          : s.activeQuirk === "sparkle_hop"
            ? -Math.abs(Math.sin(quirkProgress * Math.PI * 2)) * 2.4
            : s.activeQuirk === "star_orbit"
              ? -Math.sin(quirkProgress * Math.PI) * 2.0
              : s.activeQuirk === "plasma_surge"
                ? -Math.abs(Math.sin(quirkProgress * Math.PI * 3)) * 1.4
                : 0;

      const hoverSpeed = currentMood === "focused" ? 0.0036 : 0.0025;
      const hoverAmp = reduceMotion ? 0 : currentMood === "sleepy" ? 0.5 : 1.0;
      const hoverY =
        Math.sin(time * hoverSpeed) * hoverAmp +
        (reduceMotion ? 0 : s.bounceProgress + quirkLiftY);

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

      const c = resolveHeadPalette(petDna);

      // ── 0. Ombre portée douce au sol ──
      const shadowY = 56;
      const shadowScale = 1 - (hoverY + 1.5) * 0.045;
      const shadowW = Math.max(14, Math.round(20 * shadowScale));
      const shadowX = 26 - Math.round(shadowW / 2);
      fillBox(shadowX, shadowY, shadowW, 2, "rgba(0, 0, 0, 0.28)");
      fillBox(shadowX + 3, shadowY, Math.max(8, shadowW - 6), 2, "rgba(0, 0, 0, 0.45)");

      const baseY = Math.round(6 + hoverY);

      // ── 1. Pieds cybernétiques compacts avec semelle néon ──
      const drawFoot = (fx) => {
        fillBox(fx, baseY + 38, 5, 7, "#020610");
        fillBox(fx + 1, baseY + 39, 3, 5, c.chassisMid);
        fillBox(fx + 1, baseY + 39, 3, 1, c.chassisDark);
        fillBox(fx + 1, baseY + 43, 3, 1, c.neon);
      };
      drawFoot(19);
      drawFoot(28);

      // ── 2. Torse cybernétique anodisé assorti au châssis de la tête ──
      fillBox(18, baseY + 26, 16, 13, "#020610");
      fillBox(17, baseY + 27, 18, 11, "#020610");
      fillBox(18, baseY + 27, 16, 11, c.chassisMid);
      fillBox(19, baseY + 27, 14, 1, c.chassisDark); // Ombre sous la tête
      fillBox(19, baseY + 28, 14, 1, c.chassisLight); // Reflet supérieur
      fillBox(19, baseY + 36, 14, 2, c.chassisDark);
      fillBox(18, baseY + 30, 1, 5, c.neon);
      fillBox(33, baseY + 30, 1, 5, c.neon);

      // ── 3. Emblème Terminal >_ lumineux sur le torse ──
      px(22, baseY + 30, "#FFFFFF");
      px(23, baseY + 31, c.neon);
      px(24, baseY + 32, "#FFFFFF");
      px(23, baseY + 33, c.neon);
      px(22, baseY + 34, "#FFFFFF");
      fillBox(26, baseY + 34, 4, 1, c.neon);
      fillBox(26, baseY + 33, 4, 1, c.accentLight);

      // ── 4. Bras articulés assortis avec manchettes néon ──
      const armSway = reduceMotion ? 0 : Math.sin(time * 0.0028) * 1.0;

      const drawArm = (ax, ay, activeGlow = false) => {
        fillBox(ax + 1, ay, 3, 9, "#020610");
        fillBox(ax, ay + 1, 5, 7, "#020610");
        fillBox(ax + 1, ay + 1, 3, 7, c.chassisMid);
        fillBox(ax + 1, ay + 1, 3, 2, c.chassisLight);
        fillBox(ax + 1, ay + 6, 3, 2, activeGlow ? c.antenna : c.neon);
      };

      const armsUp =
        currentMood === "happy" ||
        bounceActive ||
        s.activeQuirk === "plasma_surge" ||
        s.activeQuirk === "sparkle_hop";

      if (armsUp) {
        drawArm(11, baseY + 22, true);
        drawArm(36, baseY + 22, true);
      } else if (currentMood === "focused") {
        const typeOffset = reduceMotion ? 0 : Math.round(Math.sin(time * 0.014) * 0.9);
        drawArm(11, baseY + 27 + typeOffset, true);
        drawArm(36, baseY + 27 - typeOffset, true);
      } else {
        drawArm(11, baseY + 27 + Math.round(armSway), false);
        drawArm(36, baseY + 27 - Math.round(armSway), false);
      }

      // ── 5. Tête identique à PixelHelper (parité ADN & couleurs) ──
      drawPetHead(px, fillBox, 8, baseY, petDna, {
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

      // ── 6. Particules / Effets de caractère ──
      if (s.activeQuirk && !reduceMotion) {
        drawQuirkEffects(px, fillBox, 8, baseY, petDna, s.activeQuirk, quirkProgress, true);
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [currentMood, isHovered, size, petDna, bounceActive]);

  const handleClick = (e) => {
    const now = Date.now();
    const s = animState.current;
    s.lastInteraction = now;
    s.bouncing = true;
    s.bounceStartTime = now;

    // Joue immédiatement une animation de caractère au clic
    const picked = pickNextQuirk(petDna, s.lastQuirk);
    s.activeQuirk = picked.type;
    s.quirkDuration = picked.duration;
    s.quirkStart = now;
    s.lastQuirk = picked.type;

    setBounceActive(true);
    playHapticTick();
    onClick?.(e);
  };

  const displayName = petDna?.name || "Nova";
  const displayArchetype = petDna?.archetype || "Cloud Agent";
  const labelText = `${displayName} · ${displayArchetype}`;

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
      title={showNativeTooltip ? `${labelText} (Click to interact)` : undefined}
      aria-label={!showNativeTooltip ? labelText : undefined}
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
