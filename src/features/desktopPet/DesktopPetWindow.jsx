import React, { useEffect, useMemo, useRef, useState } from "react";
import { Flame, Maximize2, Minus, Pause, Play, X } from "lucide-react";
import { desktopPet } from "../../services/desktopPet";
import { FullBodyPet } from "../../components/DynamicIsland/FullBodyPet.jsx";
import { createUnthrottledInterval } from "../../lib/timerWorker.js";
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

export function DesktopPetWindow() {
  const [petState, setPetState] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [cloudReduced, setCloudReduced] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const suppressClickUntilRef = useRef(0);
  const cleanupDragRef = useRef(null);

  useEffect(() => {
    return () => {
      cleanupDragRef.current?.();
    };
  }, []);

  useEffect(() => {
    desktopPet.getState?.().then((cached) => {
      if (cached) setPetState(cached);
    });

    const unlisten = desktopPet.onState((incomingState) => {
      setPetState(incomingState);
    });

    desktopPet.notifyReady();
    return unlisten;
  }, []);

  useEffect(() => {
    const ticker = createUnthrottledInterval(() => setNow(Date.now()), 500);
    return () => ticker.clear();
  }, []);

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
    let lastX = startX;
    let lastY = startY;

    const cleanup = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      cleanupDragRef.current = null;
      setIsDragging(false);
    };
    cleanupDragRef.current = cleanup;

    const onMouseMove = (moveEvt) => {
      const dist = Math.hypot(moveEvt.screenX - startX, moveEvt.screenY - startY);
      if (!hasMoved) {
        if (dist > 4) {
          hasMoved = true;
          setIsDragging(true);
          if (desktopPet.startNativeDrag()) {
            cleanup();
            return;
          }
        } else {
          return;
        }
      }

      const dx = moveEvt.screenX - lastX;
      const dy = moveEvt.screenY - lastY;
      lastX = moveEvt.screenX;
      lastY = moveEvt.screenY;
      desktopPet.moveBy(dx, dy);
    };

    const onMouseUp = (upEvt) => {
      cleanup();

      const duration = performance.now() - startTime;
      const totalDist = Math.hypot(upEvt.screenX - startX, upEvt.screenY - startY);

      if (hasMoved || totalDist > 4 || duration >= 220) {
        suppressClickUntilRef.current = performance.now() + 350;
      } else {
        suppressClickUntilRef.current = 0;
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
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

  const pomoPhase = petState?.pomo?.phase || "focus";
  const pomoRunning = Boolean(petState?.pomo?.isRunning);
  const headerLabel = petState?.focus
    ? `>_ ${petState.focus.title}`
    : petState?.pomo
      ? `>_ ${pomoPhase === "rest" ? "Rest" : "Focus"}`
      : `>_ ${petState?.petDna?.name || "Nova"}`;

  const hasTimers = Boolean(elapsedStr) || Boolean(pomoRemainingStr);
  const showReducedLivePill = cloudReduced && (Boolean(elapsedStr) || (pomoRunning && Boolean(pomoRemainingStr)));

  return (
    <div
      className={
        "trk-desktop-pet-window " +
        (petState?.theme === "light" ? "light" : "dark") +
        (isDragging ? " trk-is-dragging" : "")
      }
      data-testid="desktop-pet-window"
    >
      <div
        className="trk-desktop-pet-container"
        onMouseDown={handleMouseDown}
      >
        {/* HUD glassmorphique compact au-dessus du compagnon */}
        {!cloudReduced && (
          <div className="trk-thought-stream">
            <div className="trk-pixel-cloud">
              <div className="trk-cloud-header">
                <div
                  className="trk-cloud-task-title"
                  title={petState?.focus?.title || (petState?.pomo ? "Pomodoro" : petState?.petDna?.name || "Nova")}
                >
                  <span className="trk-cloud-task-full">{headerLabel}</span>
                </div>

                <div className="trk-cloud-controls">
                  <button
                    type="button"
                    className="trk-cloud-ear-btn restore"
                    onClick={(e) => {
                      e.stopPropagation();
                      desktopPet.restoreMain();
                    }}
                    title="Restore window"
                    aria-label="Agrandir la fenêtre principale"
                  >
                    <Maximize2 size={9} strokeWidth={2.4} />
                  </button>

                  <button
                    type="button"
                    className="trk-cloud-ear-btn reduce"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCloudReduced(true);
                    }}
                    title="Collapse HUD"
                    aria-label="Réduire la pensée"
                  >
                    <Minus size={9} strokeWidth={2.5} />
                  </button>

                  <button
                    type="button"
                    className="trk-cloud-ear-btn close"
                    onClick={(e) => {
                      e.stopPropagation();
                      desktopPet.sendAction({ type: "dismiss" });
                    }}
                    title="Hide companion"
                    aria-label="Fermer le compagnon"
                  >
                    <X size={9} strokeWidth={2.5} />
                  </button>
                </div>
              </div>

              {hasTimers && (
                <div className="trk-cloud-timers">
                  {elapsedStr && (
                    <span className="trk-cloud-timer-chip focus" title="Focus elapsed">
                      <Flame size={10} />
                      <span>{elapsedStr}</span>
                    </span>
                  )}

                  {pomoRemainingStr && (
                    <span
                      className={"trk-cloud-timer-chip pomo " + pomoPhase + (pomoRunning ? " running" : "")}
                      title="Pomodoro"
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
                        title={pomoRunning ? "Pause" : "Start"}
                        aria-label={pomoRunning ? "Pause Pomodoro" : "Reprendre Pomodoro"}
                      >
                        {pomoRunning ? <Pause size={8} /> : <Play size={8} />}
                      </button>
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="trk-thought-bubbles-trail" aria-hidden="true">
              <div className="trk-thought-bubble-dot top" />
              <div className="trk-thought-bubble-dot bottom" />
            </div>
          </div>
        )}

        {/* Mini-pilule discrète quand le HUD est réduit mais un timer tourne */}
        {showReducedLivePill && (
          <div
            className={"trk-cloud-mini-pill " + (pomoRunning ? pomoPhase : "focus")}
            onClick={handleToggleHud}
            role="button"
            tabIndex={0}
            onKeyDown={handleAvatarKeyDown}
            title="Show controls"
          >
            <span className="trk-cloud-mini-dot" aria-hidden="true" />
            <span className="trk-mono">
              {pomoRunning && pomoRemainingStr ? pomoRemainingStr : elapsedStr}
            </span>
          </div>
        )}

        {/* Compagnon flottant transparent */}
        <div
          className="trk-desktop-pet-avatar"
          onClick={handleToggleHud}
          onDoubleClick={handleAvatarDoubleClick}
          onKeyDown={handleAvatarKeyDown}
          title="Double-clic : agrandir l'application · Clic : afficher/masquer la pensée · Glisser pour déplacer"
          role="button"
          tabIndex={0}
        >
          <FullBodyPet
            dna={petState?.petDna}
            mood={petState?.mood || "normal"}
            size={74}
          />
        </div>
      </div>
    </div>
  );
}
