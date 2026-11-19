import React, { useEffect, useMemo, useState } from "react";
import { useLang } from "../../i18n.jsx";

// Formatters Intl mis en cache (évite d'allouer un Intl.DateTimeFormat chaque seconde)
const DATE_FORMATTERS = {
  fr: new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" }),
  en: new Intl.DateTimeFormat("en-US", { weekday: "short", day: "numeric", month: "short" }),
};
const MONTH_DAY_FORMATTERS = {
  fr: new Intl.DateTimeFormat("fr-FR", { month: "short", day: "numeric" }),
  en: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }),
};
const WEEKDAY_FORMATTERS = {
  fr: new Intl.DateTimeFormat("fr-FR", { weekday: "long" }),
  en: new Intl.DateTimeFormat("en-US", { weekday: "long" }),
};

// Tuile Flip mécanique individuelle avec volet 3D et cadrage parfait (zéro décalage vertical)
export const FlipDigit = React.memo(function FlipDigit({ value, size = "compact" }) {
  const [currentVal, setCurrentVal] = useState(value);
  const [prevVal, setPrevVal] = useState(value);
  const [isFlipping, setIsFlipping] = useState(false);

  useEffect(() => {
    if (value !== currentVal) {
      setPrevVal(currentVal);
      setCurrentVal(value);
      setIsFlipping(true);
      const timer = setTimeout(() => {
        setIsFlipping(false);
      }, 450);
      return () => clearTimeout(timer);
    }
  }, [value, currentVal]);

  return (
    <div className={`trk-flip-tile ${size}`}>
      <div className="trk-flip-tile-divider" />

      <div className="trk-flip-tile-half top">
        <span className="trk-flip-num">{currentVal}</span>
      </div>

      <div className="trk-flip-tile-half bottom">
        <span className="trk-flip-num">{isFlipping ? prevVal : currentVal}</span>
      </div>

      {isFlipping && (
        <>
          <div className="trk-flip-tile-flap flap-top">
            <span className="trk-flip-num">{prevVal}</span>
            <div className="trk-flip-shadow shadow-top" />
          </div>
          <div className="trk-flip-tile-flap flap-bottom">
            <span className="trk-flip-num">{currentVal}</span>
            <div className="trk-flip-shadow shadow-bottom" />
          </div>
        </>
      )}
    </div>
  );
});

// Horloge compacte ultra-nette pour l'encoche (gauche), mise en veille fenêtre cachée
export const DigitalClock = React.memo(function DigitalClock({ className = "" }) {
  const { lang } = useLang();
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      setTime(new Date());
    };
    const timer = setInterval(tick, 1000);
    const onVis = () => {
      if (!document.hidden) setTime(new Date());
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const hours24 = String(time.getHours()).padStart(2, "0");
  const minutes = String(time.getMinutes()).padStart(2, "0");
  const seconds = String(time.getSeconds()).padStart(2, "0");
  const dayKey = `${time.getFullYear()}-${time.getMonth()}-${time.getDate()}`;

  const dateStr = useMemo(
    () => (DATE_FORMATTERS[lang] || DATE_FORMATTERS.fr).format(time),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang, dayKey]
  );

  return (
    <div
      className={"trk-clean-flip-clock " + className}
      title={`${dateStr} · ${hours24}:${minutes}:${seconds}`}
    >
      <FlipDigit value={hours24} size="compact" />
      <span className="trk-flip-colon">:</span>
      <FlipDigit value={minutes} size="compact" />
      <span className="trk-flip-sec-badge trk-mono">{seconds}</span>
    </div>
  );
});

// Grande Horloge Flip mécanique complète (design haut de gamme avec date, jour, AM/PM et secondes)
export const LargeFlipClock = React.memo(function LargeFlipClock() {
  const { lang } = useLang();
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const rawHours = time.getHours();
  const isPM = rawHours >= 12;
  const hours12 = rawHours % 12 || 12;
  const hoursStr = String(hours12).padStart(2, "0");
  const minutesStr = String(time.getMinutes()).padStart(2, "0");
  const secondsStr = String(time.getSeconds()).padStart(2, "0");
  const ampm = isPM ? "PM" : "AM";
  const dayKey = `${time.getFullYear()}-${time.getMonth()}-${time.getDate()}`;

  const monthDay = useMemo(
    () => (MONTH_DAY_FORMATTERS[lang] || MONTH_DAY_FORMATTERS.fr).format(time),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang, dayKey]
  );

  const weekday = useMemo(
    () => (WEEKDAY_FORMATTERS[lang] || WEEKDAY_FORMATTERS.fr).format(time),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang, dayKey]
  );

  return (
    <div className="trk-large-flip-clock">
      <div className="trk-large-flip-card">
        <span className="trk-large-card-label top-left">{monthDay}</span>
        <FlipDigit value={hoursStr} size="large" />
        <span className="trk-large-card-label bottom-left trk-mono">{ampm}</span>
      </div>

      <div className="trk-large-flip-sep" aria-hidden="true">
        <span />
        <span />
      </div>

      <div className="trk-large-flip-card">
        <span className="trk-large-card-label top-right">{weekday}</span>
        <FlipDigit value={minutesStr} size="large" />
        <span className="trk-large-card-label bottom-right trk-mono">{secondsStr}</span>
      </div>
    </div>
  );
});
