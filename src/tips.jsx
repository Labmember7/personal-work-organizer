import React, { useState, useEffect, useRef } from "react";
import {
  HelpCircle, X, ChevronLeft, ChevronRight, Lightbulb,
  Sparkles, FolderPlus, ClipboardList, Columns3, Target, Clock,
  BarChart3, Download,
} from "lucide-react";
import { useLang } from "./i18n.jsx";
import { useOutsideClick } from "./hooks/useOutsideClick";
import { useEscapeKey } from "./hooks/useEscapeKey";

export const TUTORIAL_STORAGE_KEY = "suivi-travaux-tutorial-seen";

// Bouton « ? » : ouvre une bulle d'aide qui explique la section en mots simples.
// Positionnée en fixed (calculée depuis le bouton) pour ne jamais être rognée
// par un conteneur en overflow.
export function HelpTip({ tipKey }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const popRef = useRef(null);

  const POP_W = 264;

  const toggle = (e) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      let left = r.left + r.width / 2 - POP_W / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - POP_W - 8));
      setPos({ top: r.bottom + 8, left });
    }
    setOpen((o) => !o);
  };

  useEscapeKey(() => setOpen(false), open);
  useOutsideClick([popRef, btnRef], () => setOpen(false), open);

  // La bulle est positionnée en fixed depuis le bouton : tout défilement ou
  // redimensionnement invalide sa position, on la referme simplement.
  useEffect(() => {
    if (!open) return;
    const onScroll = () => setOpen(false);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  return (
    <span className="trk-help-wrap" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        type="button"
        className={"trk-help-btn" + (open ? " active" : "")}
        onClick={toggle}
        title={t("help_label")}
        aria-label={`${t("help_label")} — ${t(`tip_${tipKey}_title`)}`}
        aria-expanded={open}
      >
        <HelpCircle size={12} />
      </button>
      {open && (
        <div
          ref={popRef}
          className="trk-help-pop"
          style={{ top: pos.top, left: pos.left, width: POP_W }}
          role="dialog"
          aria-label={t(`tip_${tipKey}_title`)}
        >
          <div className="trk-help-pop-head">
            <Lightbulb size={12} />
            <span>{t(`tip_${tipKey}_title`)}</span>
            <button
              type="button"
              className="trk-help-pop-close"
              onClick={() => setOpen(false)}
              aria-label={t("close")}
            >
              <X size={12} />
            </button>
          </div>
          <p className="trk-help-pop-body">{t(`tip_${tipKey}_body`)}</p>
        </div>
      )}
    </span>
  );
}

const TUTORIAL_STEPS = [
  { key: "welcome", icon: Sparkles },
  { key: "projects", icon: FolderPlus },
  { key: "tasks", icon: ClipboardList },
  { key: "views", icon: Columns3 },
  { key: "focus", icon: Target },
  { key: "time", icon: Clock },
  { key: "charts", icon: BarChart3 },
  { key: "backup", icon: Download },
];

// Guide de démarrage : s'affiche à la première ouverture, rejouable depuis
// le bouton « ? » de l'en-tête.
export function Tutorial({ open, onClose }) {
  const { t } = useLang();
  const [step, setStep] = useState(0);
  const total = TUTORIAL_STEPS.length;
  const last = step === total - 1;

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setStep((s) => Math.min(s + 1, total - 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(s - 1, 0));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, total]);

  if (!open) return null;

  const { key, icon: Icon } = TUTORIAL_STEPS[step];

  return (
    <div className="trk-modal-overlay" onClick={onClose}>
      <div
        className="trk-modal trk-tuto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t("tuto_title")}
      >
        <div className="trk-modal-header">
          <span className="trk-modal-title">{t("tuto_title")}</span>
          <button className="trk-icon-btn" onClick={onClose} aria-label={t("close")}>
            <X size={16} />
          </button>
        </div>

        <div className="trk-tuto-body" key={key}>
          <div className="trk-tuto-icon">
            <Icon size={26} />
          </div>
          <h3 className="trk-tuto-step-title">{t(`tuto_${key}_title`)}</h3>
          <p className="trk-tuto-step-body">{t(`tuto_${key}_body`)}</p>
        </div>

        <div className="trk-tuto-dots" role="tablist" aria-label={t("tuto_title")}>
          {TUTORIAL_STEPS.map((s, i) => (
            <button
              key={s.key}
              type="button"
              className={"trk-tuto-dot" + (i === step ? " active" : "")}
              onClick={() => setStep(i)}
              aria-label={t(`tuto_${s.key}_title`)}
              aria-current={i === step}
            />
          ))}
        </div>

        <div className="trk-tuto-actions">
          <button type="button" className="trk-tuto-skip" onClick={onClose}>
            {t("tuto_skip")}
          </button>
          <div className="trk-tuto-nav">
            {step > 0 && (
              <button
                type="button"
                className="trk-btn-secondary"
                onClick={() => setStep((s) => s - 1)}
              >
                <ChevronLeft size={13} /> {t("tuto_prev")}
              </button>
            )}
            <button
              type="button"
              className="trk-btn-primary"
              onClick={() => (last ? onClose() : setStep((s) => s + 1))}
            >
              {last ? t("tuto_done") : t("tuto_next")}
              {!last && <ChevronRight size={13} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
