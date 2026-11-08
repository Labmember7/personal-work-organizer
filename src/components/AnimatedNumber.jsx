import React, { useEffect, useRef, useState } from "react";

// Animation des nombres affichés : quand la valeur change, chaque nombre
// contenu dans le texte défile de l'ancienne à la nouvelle valeur (easing
// doux), avec un léger "pop" visuel. Fonctionne aussi bien avec un nombre
// brut qu'avec un texte formaté ("1h 20m", "3/10", "42 %", "5 tâches") :
// tant que la structure du texte (hors chiffres) reste la même, les nombres
// sont interpolés un à un ; sinon le nouveau texte s'affiche directement.

const NUM_RE = /-?\d+(?:[.,]\d+)?/g;

function tokenize(text) {
  const nums = [];
  const skeleton = text.replace(NUM_RE, (m) => {
    nums.push(m);
    return "\u0000";
  });
  return { skeleton, nums };
}

function parse(n) {
  return parseFloat(n.replace(",", "."));
}

function decimalsOf(n) {
  const m = n.match(/[.,](\d+)/);
  return m ? m[1].length : 0;
}

function render(skeleton, values, templates) {
  let i = 0;
  return skeleton.replace(/\u0000/g, () => {
    const tpl = templates[i];
    const v = values[i++];
    const dec = decimalsOf(tpl);
    let s = v.toFixed(dec);
    if (tpl.includes(",")) s = s.replace(".", ",");
    // Conserve les zéros de tête ("05" dans un minuteur).
    const intLen = tpl.replace(/^-/, "").split(/[.,]/)[0].length;
    if (intLen > 1 && /^-?0/.test(tpl)) {
      const neg = s.startsWith("-");
      const [int, frac] = s.replace("-", "").split(/[.,]/);
      s = (neg ? "-" : "") + int.padStart(intLen, "0") + (frac !== undefined ? (tpl.includes(",") ? "," : ".") + frac : "");
    }
    return s;
  });
}

const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function AnimatedNumber({ value, format, duration = 650, className = "", pop = true, as: Tag = "span" }) {
  const text = format ? format(value) : String(value ?? "");
  const [display, setDisplay] = useState(text);
  const [bump, setBump] = useState(0);
  const prevRef = useRef(text);
  const rafRef = useRef(0);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = text;
    if (prev === text) return;
    cancelAnimationFrame(rafRef.current);

    const a = tokenize(prev);
    const b = tokenize(text);
    if (reduceMotion() || a.skeleton !== b.skeleton || a.nums.length !== b.nums.length || !b.nums.length) {
      setDisplay(text);
      setBump((n) => n + 1);
      return;
    }
    const from = a.nums.map(parse);
    const to = b.nums.map(parse);
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - t, 3);
      if (t >= 1) {
        setDisplay(text);
        return;
      }
      setDisplay(render(b.skeleton, from.map((f, i) => f + (to[i] - f) * e), b.nums));
      rafRef.current = requestAnimationFrame(tick);
    };
    setBump((n) => n + 1);
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [text, duration]);

  return (
    <Tag key={pop ? bump : 0} className={"trk-anum" + (pop && bump ? " trk-anum-bump" : "") + (className ? " " + className : "")}>
      {display}
    </Tag>
  );
}
