import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Clock, Flame, HelpCircle, Minus, Target, X } from "lucide-react";
import { useLang } from "../../i18n.jsx";
import {
  statusOf, statusesForTask, isSimpleTask, focusMinutes, formatDuration, projectColor,
} from "../../utils";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import { useInterval } from "../../hooks/useInterval";

const FOCUS_REDUCED_STORAGE_KEY = "suivi-travaux-focus-reduced";

// Type MIME custom marquant un drag initié depuis la carte de la zone de focus.
export const FOCUS_DRAG_TYPE = "application/x-trk-focus";

// Image 1x1 transparente : masque le fantôme natif du drag, remplacé par
// la pilule « verre liquide » custom qui suit le curseur.
let emptyDragImage = null;
const getEmptyDragImage = () => {
  if (!emptyDragImage) {
    emptyDragImage = new Image();
    emptyDragImage.src =
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  }
  return emptyDragImage;
};

// Zone de focus : dock flottant qui accueille UNE tâche en cours (drag & drop).
// La tâche « cuit » (animations + pointage du temps) et sort automatiquement
// une fois terminée. Réductible en pastille compacte.
export function FocusZone({ task, leaving, enterKey, startedAt, onDropTask, onAdvance, onRelease, onEdit }) {
  const { t } = useLang();
  const [over, setOver] = useState(false);
  const [dragOut, setDragOut] = useState(false);
  const [dragHome, setDragHome] = useState(true);
  const [ghostPop, setGhostPop] = useState(false);
  const zoneRef = useRef(null);
  const ghostRef = useRef(null);
  const deformRef = useRef(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const dragTitleRef = useRef("");
  const popTimerRef = useRef(null);

  useEffect(() => () => clearTimeout(popTimerRef.current), []);

  // Pilote la goutte fantôme pendant le drag : elle court après le curseur
  // avec inertie (ressort) et s'étire dans le sens du déplacement, comme une
  // goutte d'eau. Uniquement des transforms via rAF, aucun re-render par frame.
  useEffect(() => {
    if (!dragOut) return;
    const onDragOver = (e) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener("dragover", onDragOver);
    // Rect figé au début du drag (la zone est fixe et non transformée) :
    // sert à signaler si le lâcher garderait la tâche (dedans) ou la
    // libérerait (dehors), sans getBoundingClientRect par frame.
    const zoneRect = zoneRef.current ? zoneRef.current.getBoundingClientRect() : null;
    let wasHome = null;
    let raf;
    let gx = pointerRef.current.x;
    let gy = pointerRef.current.y;
    let vx = 0;
    let vy = 0;
    const loop = () => {
      const { x, y } = pointerRef.current;
      if (zoneRect) {
        const home =
          x >= zoneRect.left && x <= zoneRect.right &&
          y >= zoneRect.top && y <= zoneRect.bottom;
        if (home !== wasHome) {
          wasHome = home;
          setDragHome(home);
        }
      }
      const nx = gx + (x - gx) * 0.22;
      const ny = gy + (y - gy) * 0.22;
      vx = vx * 0.78 + (nx - gx);
      vy = vy * 0.78 + (ny - gy);
      gx = nx;
      gy = ny;
      if (ghostRef.current) {
        ghostRef.current.style.transform = `translate3d(${gx.toFixed(1)}px, ${gy.toFixed(1)}px, 0)`;
      }
      if (deformRef.current) {
        const speed = Math.hypot(vx, vy);
        const stretch = Math.min(speed / 110, 0.18);
        const ang = ((Math.atan2(vy, vx) * 180) / Math.PI).toFixed(1);
        deformRef.current.style.transform =
          `rotate(${ang}deg) scale(${(1 + stretch).toFixed(3)}, ${(1 - stretch * 0.6).toFixed(3)}) rotate(${-ang}deg)`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      cancelAnimationFrame(raf);
    };
  }, [dragOut]);
  const [reduced, setReduced] = useLocalStorageState(FOCUS_REDUCED_STORAGE_KEY, false, {
    read: (raw) => raw === "1",
    write: (v) => (v ? "1" : "0"),
  });
  const [now, setNow] = useState(() => Date.now());

  // Rafraîchit l'affichage du temps de focus écoulé.
  useEffect(() => {
    if (task && startedAt) setNow(Date.now());
  }, [task && task.id, startedAt]);
  useInterval(() => setNow(Date.now()), task && startedAt ? 10000 : null);

  const st = task ? statusOf(task.statut) : null;
  const seq = task ? statusesForTask(task) : [];
  const nextSt = task
    ? seq[Math.min(seq.findIndex((s) => s.id === task.statut) + 1, seq.length - 1)]
    : null;
  const elapsed = task && startedAt ? focusMinutes(startedAt, now) : 0;

  const dndProps = {
    onDragOver: (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      // La tâche déjà focalisée peut être relâchée dans la zone (annulation)
      // sans déclencher le halo d'accueil.
      const isSelf = Array.from(e.dataTransfer.types).includes(FOCUS_DRAG_TYPE);
      if (!isSelf && !over) setOver(true);
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setOver(false);
    },
    onDrop: (e) => {
      e.preventDefault();
      setOver(false);
      const id = e.dataTransfer.getData("text/plain");
      if (id) {
        onDropTask(id);
        setReduced(false);
      }
    },
  };

  if (reduced) {
    return (
      <div
        className={
          "trk-focus-zone trk-focus-reduced" +
          (task ? " occupied" : "") +
          (over ? " over" : "")
        }
        {...dndProps}
        role="region"
        aria-label={t("focus_zone_title")}
      >
        <button
          type="button"
          className="trk-focus-mini"
          onClick={() => setReduced(false)}
          title={t("focus_expand")}
          aria-label={t("focus_expand")}
        >
          <Flame size={15} className={task ? "trk-focus-flame" : undefined} />
          {task && <span className="trk-mono">{formatDuration(elapsed)}</span>}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={zoneRef}
      className={
        "trk-focus-zone" +
        (task ? " occupied" : "") +
        (over ? " over" : "") +
        (leaving ? " leaving" : "") +
        (dragOut ? (dragHome ? " drag-out drag-home" : " drag-out drag-away") : "")
      }
      {...dndProps}
      role="region"
      aria-label={t("focus_zone_title")}
    >
      {task && (
        <div className="trk-focus-smoke" aria-hidden="true">
          <i /><i /><i /><i /><i /><i /><i />
        </div>
      )}
      <div className="trk-focus-shell">
        <div className="trk-focus-inner">
          <div className="trk-focus-head">
            <Target size={12} />
            <span>{t("focus_zone_title")}</span>
            <span className="trk-focus-help" tabIndex={0}>
              <HelpCircle size={11} />
              <span className="trk-focus-help-tip" role="tooltip">{t("focus_zone_tooltip")}</span>
            </span>
            {task && (
              <span className="trk-focus-cooking">
                <Flame size={11} className="trk-focus-flame" />
                {t("focus_cooking")}
                <span className="trk-focus-dots"><i /><i /><i /></span>
              </span>
            )}
            <button
              type="button"
              className="trk-icon-btn trk-focus-reduce-btn"
              onClick={() => setReduced(true)}
              title={t("focus_reduce")}
              aria-label={t("focus_reduce")}
            >
              <Minus size={12} />
            </button>
          </div>
          {task ? (
            <div key={enterKey} className="trk-focus-card">
              <button
                type="button"
                className="trk-focus-task-btn"
                onClick={() => onEdit(task)}
                title={t("edit_task")}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", task.id);
                  e.dataTransfer.setData(FOCUS_DRAG_TYPE, "1");
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setDragImage(getEmptyDragImage(), 0, 0);
                  pointerRef.current = { x: e.clientX, y: e.clientY };
                  dragTitleRef.current = task.titre;
                  clearTimeout(popTimerRef.current);
                  setGhostPop(false);
                  setDragHome(true);
                  setDragOut(true);
                }}
                onDragEnd={(e) => {
                  setDragOut(false);
                  // La goutte éclate sur place puis s'évapore.
                  setGhostPop(true);
                  clearTimeout(popTimerRef.current);
                  popTimerRef.current = setTimeout(() => setGhostPop(false), 500);
                  // Déposée hors de la zone = libération (équivalent du bouton X).
                  const zone = zoneRef.current;
                  if (!zone || (e.clientX === 0 && e.clientY === 0)) return;
                  const r = zone.getBoundingClientRect();
                  const inside =
                    e.clientX >= r.left && e.clientX <= r.right &&
                    e.clientY >= r.top && e.clientY <= r.bottom;
                  if (!inside) onRelease();
                }}
              >
                <p className="trk-focus-title">{task.titre}</p>
                <div className="trk-focus-meta">
                  <span className="trk-tag" style={{ "--pill-color": projectColor(task.projet) }}>{task.projet}</span>
                  <span className="trk-status-pill" style={{ "--pill-color": st.color }}>{t(`status_${st.id}`)}</span>
                  <span className="trk-focus-timer">
                    <Clock size={10} /> {formatDuration(elapsed)}
                  </span>
                </div>
              </button>
              <div className="trk-focus-actions">
                <button
                  type="button"
                  className="trk-focus-done-btn"
                  onClick={onAdvance}
                  title={isSimpleTask(task) ? t("focus_mark_done") : t("focus_advance")}
                >
                  {isSimpleTask(task) ? (
                    <><Check size={13} /> {t("focus_mark_done")}</>
                  ) : (
                    <>{t(`status_${nextSt.id}`)} <ArrowRight size={13} /></>
                  )}
                </button>
                <button type="button" className="trk-icon-btn" onClick={onRelease} title={t("focus_release")} aria-label={t("focus_release")}>
                  <X size={13} />
                </button>
              </div>
            </div>
          ) : (
            <div className="trk-focus-empty">
              <div className="trk-focus-empty-ring"><Flame size={18} /></div>
              <p>{t("focus_zone_empty")}</p>
              <span>{t("focus_zone_hint")}</span>
            </div>
          )}
        </div>
      </div>
      {(dragOut || ghostPop) && (
        <div
          ref={ghostRef}
          className={
            "trk-focus-ghost" +
            (dragHome ? " home" : " away") +
            (ghostPop ? " pop" : "")
          }
          style={{
            transform: `translate3d(${pointerRef.current.x}px, ${pointerRef.current.y}px, 0)`,
          }}
          aria-hidden="true"
        >
          <div ref={deformRef} className="trk-focus-ghost-deform">
            <div className="trk-focus-ghost-body">
              <Flame size={12} />
              <span>{dragTitleRef.current}</span>
            </div>
            <span className="trk-focus-ghost-drops">
              <i /><i /><i /><i /><i /><i />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

