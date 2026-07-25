import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Clock, Flame, HelpCircle, Minus, Target, X } from "lucide-react";
import { useLang } from "../../i18n.jsx";
import {
  statusOf, statusesForTask, isSimpleTask, focusMinutes, formatDuration, projectColor, prioOf,
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

// ── Tracés de la surface de l'eau (mode marmite) ──
// Échantillonnage d'une somme de trois sinusoïdes de périodes 200/100/66,6
// unités : le motif se répète donc tous les 200 u, et comme le tracé couvre
// 400 u affichés sur 200 % de large, l'animation de défilement (-50 %) boucle
// sans couture tout en ayant l'air irrégulier (pas une vague « sinus » lisible).
// viewBox 0 0 400 68 étirée sur 34 px de haut : 1 u = 0,5 px, ligne de
// flottaison moyenne à y=28 u (14 px), crêtes/creux dans ±16 u (±8 px).
const WAVE_SURFACE =
  "M0,35.9L5,35.8L10,34.7L15,32.8L20,30.6L25,28.7L30,27.6L35,27.7L40,29.1L45,31.8L50,35.4L55,39.4L60,43.2L65,46.2L70,47.8L75,47.7L80,46L85,42.7L90,38.4L95,33.4L100,28.4L105,23.8L110,19.9L115,17L120,14.9L125,13.6L130,12.8L135,12.4L140,12.1L145,12.1L150,12.3L155,13L160,14.2L165,16.1L170,18.7L175,22L180,25.6L185,29.2L190,32.4L195,34.7L200,35.9L205,35.8L210,34.7L215,32.8L220,30.6L225,28.7L230,27.6L235,27.7L240,29.1L245,31.8L250,35.4L255,39.4L260,43.2L265,46.2L270,47.8L275,47.7L280,46L285,42.7L290,38.4L295,33.4L300,28.4L305,23.8L310,19.9L315,17L320,14.9L325,13.6L330,12.8L335,12.4L340,12.1L345,12.1L350,12.3L355,13L360,14.2L365,16.1L370,18.7L375,22L380,25.6L385,29.2L390,32.4L395,34.7L400,35.9";
// Même tracé refermé vers le bas : c'est LA masse d'eau. Le liseré de crête
// réutilise WAVE_SURFACE avec la même animation, donc il reste collé à la
// surface au pixel près au lieu de flotter au-dessus d'elle.
const WAVE_BODY = `${WAVE_SURFACE}L400,68L0,68Z`;

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
  const pr = task ? prioOf(task.priorite) : null;
  const seq = task ? statusesForTask(task) : [];
  const nextSt = task
    ? seq[Math.min(seq.findIndex((s) => s.id === task.statut) + 1, seq.length - 1)]
    : null;
  const elapsed = task && startedAt ? focusMinutes(startedAt, now) : 0;
  // Intensité du mijotage (mode sticky) : accélère avec le temps passé en
  // focus. Sans effet hors mode sticky (classe posée inconditionnellement).
  const boilTier = elapsed >= 20 ? 3 : elapsed >= 5 ? 2 : 1;

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
        (task ? ` occupied trk-boil-${boilTier}` : "") +
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
          {/* UN SEUL volume d'eau : la vague SVG dessine la surface (34 px de
              bande) et .trk-pot-body prend la suite EXACTEMENT sous elle, sans
              recouvrement et avec la même couleur au raccord — d'où l'absence de
              couture. Les deux sont portés par .trk-pot-volume, qui houle
              verticalement d'un bloc : la surface monte et descend sans jamais
              décoller du corps de l'eau. */}
          {task && (
            <div className="trk-pot-water" aria-hidden="true">
              <div className="trk-pot-volume">
                <svg className="trk-wave-svg" viewBox="0 0 400 68" preserveAspectRatio="none" focusable="false">
                  <defs>
                    <linearGradient id="trk-water-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop className="trk-water-stop-hi" offset="0" />
                      <stop className="trk-water-stop-lo" offset="1" />
                    </linearGradient>
                  </defs>
                  <path className="trk-wave-fill" d={WAVE_BODY} />
                  <path className="trk-wave-crest" d={WAVE_SURFACE} />
                </svg>
                <span className="trk-pot-body" />
              </div>
              <span className="trk-bubble b1" />
              <span className="trk-bubble b2" />
              <span className="trk-bubble b3" />
              <span className="trk-bubble b4" />
              <span className="trk-bubble b5" />
            </div>
          )}
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
            {/* Groupe de contrôles, calé dans le coin haut-droit : réduire puis
                fermer, dans l'ordre d'une barre de fenêtre (le destructif en
                dernier, le plus loin du reste du bandeau).
                « Retirer la tâche » est remonté du pied de la carte vers le
                bandeau, pour que la carte ne porte plus qu'une seule action
                (avancer / terminer) et que « sortir de la marmite » soit au
                niveau de la marmite, pas de la tâche. */}
            <span className="trk-focus-head-btns">
              <button
                type="button"
                className="trk-icon-btn trk-focus-reduce-btn"
                onClick={() => setReduced(true)}
                title={t("focus_reduce")}
                aria-label={t("focus_reduce")}
              >
                <Minus size={12} />
              </button>
              {task && (
                <button
                  type="button"
                  className="trk-icon-btn trk-focus-release-btn"
                  onClick={onRelease}
                  title={t("focus_release")}
                  aria-label={t("focus_release")}
                >
                  <X size={12} />
                </button>
              )}
            </span>
          </div>
          {task ? (
            <div
              key={enterKey}
              className="trk-focus-card"
              style={{ "--rail-color": pr.color, "--note-color": projectColor(task.projet) }}
            >
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
              </div>
            </div>
          ) : (
            <div className="trk-focus-empty">
              <div className="trk-focus-empty-ring"><Flame size={18} /></div>
              <p>{t("focus_zone_empty")}</p>
              <span>{t("focus_zone_hint")}</span>
            </div>
          )}
          {/* Nappe d'eau AVANT-PLAN (mode sticky) : rendue après la carte, donc
              peinte par-dessus — c'est elle qui donne la sensation d'immersion
              (voile teinté + caustiques + bulles qui passent devant la tâche).
              Volontairement très peu opaque : le contraste du texte submergé
              est garanti par le verre de la carte, pas par cette nappe. */}
          {task && (
            <div className="trk-pot-water-front" aria-hidden="true">
              <span className="trk-pot-caustics" />
              <span className="trk-bubble trk-bubble-front f1" />
              <span className="trk-bubble trk-bubble-front f2" />
              <span className="trk-bubble trk-bubble-front f3" />
            </div>
          )}
        </div>
      </div>
      {/* Habillage marmite (mode sticky uniquement, piloté par CSS) : posé en
          frère de .trk-focus-shell (qui a overflow:hidden) pour ne jamais être
          rogné, purement décoratif, ne porte jamais de texte. */}
      <div className="trk-pot-frame" aria-hidden="true">
        <span className="trk-pot-rim" />
        <span className="trk-pot-handle trk-pot-handle-l" />
        <span className="trk-pot-handle trk-pot-handle-r" />
        <span className="trk-pot-leg trk-pot-leg-l" />
        <span className="trk-pot-leg trk-pot-leg-r" />
      </div>
      {task && (
        <div className="trk-pot-fire" aria-hidden="true">
          <span className="trk-flame trk-flame-back" />
          <span className="trk-flame trk-flame-mid" />
          <span className="trk-flame trk-flame-core" />
        </div>
      )}
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

