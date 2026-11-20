import React, { useEffect, useMemo, useRef, useState } from "react";
import { Coffee, Flame, Maximize2, Minus, Pause, Play, X } from "lucide-react";
import { desktopPet } from "../../services/desktopPet";
import { FullBodyPet } from "../../components/DynamicIsland/FullBodyPet.jsx";
import { createUnthrottledInterval } from "../../lib/timerWorker.js";
import { isLightTheme } from "../../lib/themes";
import "./desktopPet.css";

function formatSeconds(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Actions flottantes du compagnon, ordonnées comme une barre système
 * (réduire, restaurer, fermer) et révélées uniquement au survol / focus.
 */
function PetControls({ isHeadDock = false, cloudReduced, onToggleCloud, onRestore, onClose }) {
  const controls = [
    {
      key: "reduce",
      className: "reduce",
      label: "Réduire la pensée",
      pressed: cloudReduced,
      onClick: onToggleCloud,
      icon: <Minus size={10} strokeWidth={2.5} />,
    },
    {
      key: "restore",
      className: "restore",
      label: "Agrandir la fenêtre principale",
      onClick: onRestore,
      icon: <Maximize2 size={9.5} strokeWidth={2.4} />,
    },
    {
      key: "close",
      className: "close",
      label: "Fermer le compagnon",
      onClick: onClose,
      icon: <X size={10} strokeWidth={2.5} />,
    },
  ];

  return (
    <div className={"trk-cloud-controls" + (isHeadDock ? " is-head-dock" : "")}>
      {controls.map((ctrl) => (
        <button
          key={ctrl.key}
          type="button"
          className={"trk-cloud-ear-btn " + ctrl.className}
          onMouseUp={(e) => {
            e.currentTarget.blur();
          }}
          onClick={(e) => {
            e.stopPropagation();
            e.currentTarget.blur();
            ctrl.onClick();
          }}
          aria-label={ctrl.label}
          aria-pressed={ctrl.pressed}
        >
          {ctrl.icon}
        </button>
      ))}
    </div>
  );
}

export function DesktopPetWindow() {
  const [petState, setPetState] = useState(null);
  const [isVisible, setIsVisible] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [cloudReduced, setCloudReduced] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const suppressClickUntilRef = useRef(0);
  const cleanupDragRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    return () => {
      cleanupDragRef.current?.();
    };
  }, []);

  useEffect(() => {
    const clearHover = () => {
      setIsHovered(false);
      if (document.activeElement?.closest?.(".trk-cloud-controls")) {
        document.activeElement.blur();
      }
    };
    const onMouseOut = (e) => {
      if (!e.relatedTarget) clearHover();
    };
    const onVisibility = () => {
      if (document.hidden) clearHover();
    };
    window.addEventListener("blur", clearHover);
    window.addEventListener("mouseout", onMouseOut);
    document.addEventListener("mouseleave", clearHover);
    document.documentElement.addEventListener("mouseleave", clearHover);
    document.documentElement.addEventListener("pointerleave", clearHover);
    document.addEventListener("visibilitychange", onVisibility);
    const unlistenPointerLeft = desktopPet.onPointerLeft?.(clearHover);
    return () => {
      window.removeEventListener("blur", clearHover);
      window.removeEventListener("mouseout", onMouseOut);
      document.removeEventListener("mouseleave", clearHover);
      document.documentElement.removeEventListener("mouseleave", clearHover);
      document.documentElement.removeEventListener("pointerleave", clearHover);
      document.removeEventListener("visibilitychange", onVisibility);
      unlistenPointerLeft?.();
    };
  }, []);

  // Filet de sécurité OS : interroge la fenêtre sous le curseur tant que le survol est actif
  useEffect(() => {
    if (!isHovered || !isVisible || !desktopPet.isCursorInside) return undefined;
    let active = true;
    const timer = setInterval(() => {
      desktopPet
        .isCursorInside()
        .then((inside) => {
          if (active && !inside) {
            setIsHovered(false);
            if (document.activeElement?.closest?.(".trk-cloud-controls")) {
              document.activeElement.blur();
            }
          }
        })
        .catch(() => {});
    }, 250);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [isHovered, isVisible]);

  useEffect(() => {
    const unlistenState = desktopPet.onState((incomingState) => {
      setPetState(incomingState);
    });
    const unlistenVisibility = desktopPet.onVisibilityChanged?.((vis) => {
      setIsVisible(Boolean(vis));
      if (!vis) setIsHovered(false);
    });

    desktopPet.notifyReady();
    return () => {
      unlistenState?.();
      unlistenVisibility?.();
    };
  }, []);

  const hasLiveTicker =
    isVisible && (Boolean(petState?.focusStartedAt) || Boolean(petState?.pomo?.isRunning));

  useEffect(() => {
    if (!hasLiveTicker) return undefined;
    setNow(Date.now());
    const ticker = createUnthrottledInterval(() => setNow(Date.now()), 1000);
    return () => ticker.clear();
  }, [hasLiveTicker]);

  const hasFocusTask = Boolean(petState?.focus);
  const hasPomoState = Boolean(petState?.pomo);
  const layoutModeKey = `${cloudReduced ? "r" : "e"}|${hasFocusTask ? 1 : 0}|${hasPomoState ? 1 : 0}|${petState?.focus?.title || ""}`;

  // Synchronise la fenêtre native avec la hitbox utile sans recréer l'observer à chaque seconde
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !isVisible) return undefined;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        desktopPet.syncBounds?.(Math.ceil(rect.width), Math.ceil(rect.height));
      }
    };

    measure();

    if (typeof ResizeObserver === "function") {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    return undefined;
  }, [isVisible, layoutModeKey]);

  const elapsedStr = useMemo(() => {
    if (!petState?.focusStartedAt) return null;
    return formatSeconds((now - petState.focusStartedAt) / 1000);
  }, [petState?.focusStartedAt, now]);

  const pomo = petState?.pomo;
  const pomoRemainingStr = useMemo(() => {
    if (!pomo) return null;
    if (pomo.isRunning && pomo.endsAt) {
      const remainingSec = Math.max(0, Math.ceil((pomo.endsAt - now) / 1000));
      return formatSeconds(remainingSec);
    }
    return formatSeconds(pomo.timeLeft || 0);
  }, [pomo, now]);

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;

    if (
      e.target.closest("button") ||
      e.target.closest(".trk-cloud-ear-btn") ||
      e.target.closest(".trk-cloud-pomo-play")
    ) {
      return;
    }

    const startX = e.screenX;
    const startY = e.screenY;
    const startTime = performance.now();
    let hasMoved = false;

    const cleanup = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("blur", onWindowBlur);
      cleanupDragRef.current = null;
      setIsDragging(false);
    };
    cleanupDragRef.current = cleanup;

    const onMouseMove = (moveEvt) => {
      if (!hasMoved) {
        const dist = Math.hypot(moveEvt.screenX - startX, moveEvt.screenY - startY);
        if (dist <= 4) return;
        hasMoved = true;
        setIsDragging(true);
        setIsHovered(false);
        desktopPet.startNativeDrag(startX, startY);
      }
      desktopPet.updateDrag?.(moveEvt.screenX, moveEvt.screenY);
    };

    const onMouseUp = (upEvt) => {
      if (hasMoved) {
        desktopPet.endDrag?.();
      }
      cleanup();

      const duration = performance.now() - startTime;
      const totalDist = Math.hypot(upEvt.screenX - startX, upEvt.screenY - startY);

      if (hasMoved || totalDist > 4 || duration >= 220) {
        suppressClickUntilRef.current = performance.now() + 350;
      } else {
        suppressClickUntilRef.current = 0;
      }
    };

    const onWindowBlur = () => {
      if (hasMoved) {
        desktopPet.endDrag?.();
      }
      cleanup();
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("blur", onWindowBlur);
  };

  const handleToggleHud = (e) => {
    e.stopPropagation();
    if (performance.now() < suppressClickUntilRef.current) {
      suppressClickUntilRef.current = 0;
      return;
    }
    setCloudReduced((prev) => !prev);
  };

  const handleAvatarDoubleClick = (e) => {
    e.stopPropagation();
    if (performance.now() < suppressClickUntilRef.current) {
      suppressClickUntilRef.current = 0;
      return;
    }
    desktopPet.restoreMain();
  };

  const handleAvatarKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setCloudReduced((prev) => !prev);
    }
  };

  const pomoPhase = pomo?.phase || "focus";
  const pomoRunning = Boolean(pomo?.isRunning);
  const hasTimers = Boolean(elapsedStr) || Boolean(pomoRemainingStr);
  const isCompactTimerPill = !hasFocusTask && Boolean(pomoRemainingStr);
  const isStandbyPill = !hasFocusTask && !pomoRemainingStr;
  const showReducedLivePill =
    cloudReduced && (Boolean(elapsedStr) || (pomoRunning && Boolean(pomoRemainingStr)));

  const petAccent = petState?.petDna?.palette?.neon || "#00F5D4";
  const petGlow = petState?.petDna?.palette?.glow || "#5EEAD4";

  const toggleCloud = () => setCloudReduced((prev) => !prev);
  const restoreMainWindow = () => desktopPet.restoreMain();
  const dismissCompanion = () => desktopPet.sendAction({ type: "dismiss" });

  return (
    <div
      className={
        "trk-desktop-pet-window " +
        (isLightTheme(petState?.theme) ? "light" : "dark") +
        (isDragging ? " trk-is-dragging" : "")
      }
      style={{ "--pet-accent": petAccent, "--pet-glow": petGlow }}
      data-testid="desktop-pet-window"
    >
      <div
        ref={containerRef}
        className={
          "trk-desktop-pet-container" +
          (cloudReduced ? " is-reduced" : "") +
          (isHovered && !isDragging ? " is-hovered" : "")
        }
        onMouseEnter={() => {
          if (!isDragging) setIsHovered(true);
        }}
        onMouseMove={() => {
          if (!isDragging && !isHovered) setIsHovered(true);
        }}
        onMouseLeave={() => setIsHovered(false)}
        onPointerLeave={() => setIsHovered(false)}
        onMouseDown={handleMouseDown}
      >
        {/* Bulle adaptative au-dessus du compagnon */}
        {!cloudReduced && (
          <div className="trk-thought-stream">
            <div
              className={
                "trk-pixel-cloud" +
                (isCompactTimerPill
                  ? " is-compact-pill " + pomoPhase + (pomoRunning ? " running" : "")
                  : hasFocusTask
                    ? " is-task-card"
                    : " is-standby")
              }
            >
              <PetControls
                cloudReduced={cloudReduced}
                onToggleCloud={toggleCloud}
                onRestore={restoreMainWindow}
                onClose={dismissCompanion}
              />

              {/* Cas 1 : Pomodoro seul -> capsule horizontale parfaitement ajustée */}
              {isCompactTimerPill && (
                <div className="trk-cloud-compact-row">
                  <span className={"trk-cloud-phase-chip " + pomoPhase}>
                    {pomoPhase === "rest" ? <Coffee size={10} /> : <Flame size={10} />}
                    <span>{pomoPhase === "rest" ? "Rest" : "Focus"}</span>
                  </span>

                  <span className="trk-cloud-pomo-time trk-mono">{pomoRemainingStr}</span>

                  <button
                    type="button"
                    className={"trk-cloud-pomo-play " + pomoPhase + (pomoRunning ? " running" : "")}
                    onClick={(e) => {
                      e.stopPropagation();
                      desktopPet.sendAction({ type: "togglePomo" });
                    }}
                    aria-label={pomoRunning ? "Pause Pomodoro" : "Reprendre Pomodoro"}
                  >
                    {pomoRunning ? <Pause size={9} /> : <Play size={9} />}
                  </button>
                </div>
              )}

              {/* Cas 2 : Tâche en focus -> carte centrée en 2 niveaux */}
              {hasFocusTask && (
                <>
                  <div className="trk-cloud-task-title">
                    <span className="trk-cloud-task-full">
                      &gt;_ {petState.focus.title}
                    </span>
                  </div>

                  {hasTimers && (
                    <div className="trk-cloud-timers">
                      {elapsedStr && (
                        <span className="trk-cloud-timer-chip focus">
                          <Flame size={10} />
                          <span>{elapsedStr}</span>
                        </span>
                      )}

                      {pomoRemainingStr && (
                        <span
                          className={
                            "trk-cloud-timer-chip pomo " +
                            pomoPhase +
                            (pomoRunning ? " running" : "")
                          }
                        >
                          <span className="trk-cloud-pomo-dot" aria-hidden="true" />
                          <span>{pomoRemainingStr}</span>
                          <button
                            type="button"
                            className="trk-cloud-pomo-play"
                            onClick={(e) => {
                              e.stopPropagation();
                              desktopPet.sendAction({ type: "togglePomo" });
                            }}
                            aria-label={pomoRunning ? "Pause Pomodoro" : "Reprendre Pomodoro"}
                          >
                            {pomoRunning ? <Pause size={8} /> : <Play size={8} />}
                          </button>
                        </span>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Cas 3 : Veille -> micro-capsule nommée */}
              {isStandbyPill && (
                <div className="trk-cloud-standby-row">
                  <span className="trk-cloud-standby-dot" aria-hidden="true" />
                  <span className="trk-cloud-task-full">
                    &gt;_ {petState?.petDna?.name || "Nova"}
                  </span>
                </div>
              )}
            </div>

            <div className="trk-thought-bubbles-trail" aria-hidden="true">
              <div className="trk-thought-bubble-dot top" />
              <div className="trk-thought-bubble-dot bottom" />
            </div>
          </div>
        )}

        {/* Contrôles au-dessus de la tête quand la bulle de pensée est réduite */}
        {cloudReduced && (
          <PetControls
            isHeadDock
            cloudReduced={cloudReduced}
            onToggleCloud={toggleCloud}
            onRestore={restoreMainWindow}
            onClose={dismissCompanion}
          />
        )}

        {/* Mini-pilule discrète quand le HUD est réduit mais un timer tourne */}
        {showReducedLivePill && (
          <div
            className={"trk-cloud-mini-pill " + (pomoRunning ? pomoPhase : "focus")}
            onClick={handleToggleHud}
            role="button"
            tabIndex={0}
            onKeyDown={handleAvatarKeyDown}
            aria-label="Afficher la pensée"
          >
            <span className="trk-cloud-mini-dot" aria-hidden="true" />
            <span className="trk-mono">
              {pomoRunning && pomoRemainingStr ? pomoRemainingStr : elapsedStr}
            </span>
          </div>
        )}

        {/* Compagnon flottant fidèle à la Dynamic Island, sans tooltip natif */}
        <div
          className="trk-desktop-pet-avatar"
          onClick={handleToggleHud}
          onDoubleClick={handleAvatarDoubleClick}
          onKeyDown={handleAvatarKeyDown}
          aria-label="Double-clic : agrandir l'application · Clic : afficher/masquer la pensée · Glisser pour déplacer"
          role="button"
          tabIndex={0}
        >
          <FullBodyPet
            dna={petState?.petDna}
            mood={petState?.mood || "normal"}
            size={72}
            showNativeTooltip={false}
            active={isVisible}
          />
        </div>
      </div>
    </div>
  );
}
