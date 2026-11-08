import React, { useEffect, useState } from "react";
import { useLang } from "../../i18n.jsx";

// Tuile Flip mécanique individuelle avec volet 3D et cadrage parfait (zéro décalage vertical)
export function FlipDigit({ value, size = "compact" }) {
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
      {/* Ligne médiane de rainure mécanique */}
      <div className="trk-flip-tile-divider" />

      {/* Demi-tuile supérieure statique */}
      <div className="trk-flip-tile-half top">
        <span className="trk-flip-num">{currentVal}</span>
      </div>

      {/* Demi-tuile inférieure statique */}
      <div className="trk-flip-tile-half bottom">
        <span className="trk-flip-num">{isFlipping ? prevVal : currentVal}</span>
      </div>

      {/* Volets 3D en rotation mécanique */}
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
}

// Horloge compacte ultra-nette pour l'encoche (gauche)
export function DigitalClock({ className = "" }) {
  const { lang } = useLang();
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hours24 = String(time.getHours()).padStart(2, "0");
  const minutes = String(time.getMinutes()).padStart(2, "0");
  const seconds = String(time.getSeconds()).padStart(2, "0");

  const dateStr = time.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <div
      className={"trk-clean-flip-clock " + className}
      title={`${dateStr} · ${hours24}:${minutes}:${seconds}`}
    >
      {/* Tuile Heures */}
      <FlipDigit value={hours24} size="compact" />

      {/* Deux points séparateurs */}
      <span className="trk-flip-colon">:</span>

      {/* Tuile Minutes */}
      <FlipDigit value={minutes} size="compact" />

      {/* Micro-secondes nettes */}
      <span className="trk-flip-sec-badge trk-mono">{seconds}</span>
    </div>
  );
}

// Grande Horloge Flip mécanique complète (design haut de gamme avec date, jour, AM/PM et secondes)
export function LargeFlipClock() {
  const { lang } = useLang();
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const rawHours = time.getHours();
  const isPM = rawHours >= 12;
  const hours12 = rawHours % 12 || 12;
  const hoursStr = String(hours12).padStart(2, "0");
  const minutesStr = String(time.getMinutes()).padStart(2, "0");
  const secondsStr = String(time.getSeconds()).padStart(2, "0");
  const ampm = isPM ? "PM" : "AM";

  const monthDay = time.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
    month: "short",
    day: "numeric",
  });

  const weekday = time.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
    weekday: "long",
  });

  return (
    <div className="trk-large-flip-clock">
      {/* Carte Heures avec Mois/Jour (haut-gauche) et AM/PM (bas-gauche) */}
      <div className="trk-large-flip-card">
        <span className="trk-large-card-label top-left">{monthDay}</span>
        <FlipDigit value={hoursStr} size="large" />
        <span className="trk-large-card-label bottom-left trk-mono">{ampm}</span>
      </div>

      {/* Séparateur mécanique subtil */}
      <div className="trk-large-flip-sep" aria-hidden="true">
        <span />
        <span />
      </div>

      {/* Carte Minutes avec Jour (haut-droite) et Secondes (bas-droite) */}
      <div className="trk-large-flip-card">
        <span className="trk-large-card-label top-right">{weekday}</span>
        <FlipDigit value={minutesStr} size="large" />
        <span className="trk-large-card-label bottom-right trk-mono">{secondsStr}</span>
      </div>
    </div>
  );
}
