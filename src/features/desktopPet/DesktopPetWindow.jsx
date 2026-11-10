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

  // Nettoyage sécurisé des listeners de drag si le composant est démonté
  useEffect(() => {
    return () => {
      cleanupDragRef.current?.();
    };
  }, []);

  // Abonnement aux états envoyés par la fenêtre principale & récupération synchrone
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

  // Tick haute précision via Web Worker (zéro ralentissement/gel en arrière-plan)
  useEffect(() => {
    const ticker = createUnthrottledInterval(() => setNow(Date.now()), 500);
    return () => ticker.clear();
  }, []);

  // Calcul du temps écoulé de focus
  const elapsedStr = useMemo(() => {
    if (!petState?.focusStartedAt) return null;
    return formatSeconds((now - petState.focusStartedAt) / 1000);
  }, [petState?.focusStartedAt, now]);

  // Calcul du temps restant Pomodoro (calibré sur endsAt si le timer tourne)
  const pomoRemainingStr = useMemo(() => {
    if (!petState?.pomo) return null;
    const p = petState.pomo;
    if (p.isRunning && p.endsAt) {
      const remainingSec = Math.max(0, Math.ceil((p.endsAt - now) / 1000));
      return formatSeconds(remainingSec);
    }
    return formatSeconds(p.timeLeft || 0);
  }, [petState?.pomo, now]);

  // Déplacement fluide et gestion tactile clic instantané vs clic maintenu (held)
  const handleMouseDown = (e) => {
    // Bouton gauche uniquement
    if (e.button !== 0) return;

    // Ne pas interférer avec les clics sur les boutons de commande
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

      // Si la souris a été déplacée (drag) OU maintenue enfoncée (>= 220ms) :
      // Ce n'est PAS un clic instantané. On supprime tout clic déclenché à la relache.
      if (hasMoved || totalDist > 4 || duration >= 220) {
        suppressClickUntilRef.current = performance.now() + 350;
      } else {
        suppressClickUntilRef.current = 0;
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleAvatarClick = (e) => {
    e.stopPropagation();
    // Ne réagir QUE pour un clic instantané (rejette les clics maintenus et drags)
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

  const hasActivity = Boolean(petState?.focus) || Boolean(petState?.pomo);

  return (
    <div
      className={
        "trk-desktop-pet-window " +
        (petState?.theme || "dark") +
        (isDragging ? " trk-is-dragging" : "")
      }
      data-testid="desktop-pet-window"
    >
      <div
        className="trk-desktop-pet-container"
        onMouseDown={handleMouseDown}
      >
        {/* Bulle de pensée 2.5D Pixel Cloud au-dessus de sa tête */}
        {hasActivity && !cloudReduced && (
          <div className="trk-thought-stream">
            <div className="trk-pixel-cloud">
              {/* Lobes supérieurs morphés dans le design du nuage : Expand, Reduce, Close */}
              <div className="trk-cloud-crest-row">
                <button
                  type="button"
                  className="trk-cloud-ear-btn restore"
                  onClick={(e) => {
                    e.stopPropagation();
                    desktopPet.restoreMain();
                  }}
                  title="Agrandir la fenêtre principale (Double-clic sur le pet)"
                  aria-label="Agrandir la fenêtre principale"
                >
                  <Maximize2 size={9} strokeWidth={2.6} />
                </button>

                <button
                  type="button"
                  className="trk-cloud-ear-btn reduce"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCloudReduced(true);
                  }}
                  title="Réduire la pensée (cliquez sur le pet pour la réafficher)"
                  aria-label="Réduire la pensée"
                >
                  <Minus size={9} strokeWidth={2.6} />
                </button>

                <button
                  type="button"
                  className="trk-cloud-ear-btn close"
                  onClick={(e) => {
                    e.stopPropagation();
                    desktopPet.sendAction({ type: "dismiss" });
                  }}
                  title="Fermer le compagnon flottant"
                  aria-label="Fermer le compagnon"
                >
                  <X size={9} strokeWidth={2.6} />
                </button>
              </div>

              {/* Contenu intérieur du nuage pixel */}
              <div className="trk-cloud-body">
                <div
                  className="trk-cloud-task-title"
                  title={petState?.focus?.title || "Focus actif"}
                >
                  <span className="trk-cloud-task-full">&gt;_ {petState?.focus ? petState.focus.title : "Session Focus"}</span>
                </div>

                <div className="trk-cloud-timers">
                  {elapsedStr && (
                    <span className="trk-cloud-timer-chip focus" title="Temps de focus écoulé">
                      <Flame size={10} />
                      <span>{elapsedStr}</span>
                    </span>
                  )}
                  {pomoRemainingStr && (
                    <span className="trk-cloud-timer-chip pomo" title="Pomodoro restant">
                      <span>{pomoRemainingStr}</span>
                      <button
                        type="button"
                        className="trk-cloud-pomo-play"
                        onClick={(e) => {
                          e.stopPropagation();
                          desktopPet.sendAction({ type: "togglePomo" });
                        }}
                        title={petState?.pomo?.isRunning ? "Pause Pomodoro" : "Reprendre Pomodoro"}
                        aria-label={petState?.pomo?.isRunning ? "Pause Pomodoro" : "Reprendre Pomodoro"}
                      >
                        {petState?.pomo?.isRunning ? <Pause size={8} /> : <Play size={8} />}
                      </button>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Bulles d'ascension de pensée reliant la tête au nuage */}
            <div className="trk-thought-bubbles-trail">
              <div className="trk-thought-bubble-dot top" />
              <div className="trk-thought-bubble-dot bottom" />
            </div>
          </div>
        )}

        {/* Corps complet animé du pet - sans fond - glisser pour déplacer, clic instantané pour afficher/masquer, double-clic pour agrandir */}
        <div
          className="trk-desktop-pet-avatar"
          onClick={handleAvatarClick}
          onDoubleClick={handleAvatarDoubleClick}
          onKeyDown={handleAvatarKeyDown}
          title="Double-clic : agrandir l'application · Clic : afficher/masquer la pensée · Glisser pour déplacer"
          role="button"
          tabIndex={0}
        >
          <FullBodyPet
            dna={petState?.petDna}
            mood={petState?.mood || "normal"}
            size={72}
          />
        </div>
      </div>
    </div>
  );
}
