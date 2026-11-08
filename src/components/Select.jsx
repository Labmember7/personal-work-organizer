import React, { Children, isValidElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

// Liste déroulante sur mesure, remplaçant le <select> natif : même API
// (enfants <option>, value, onChange(e) avec e.target.value, disabled), donc
// les appels existants n'ont qu'à changer de balise. Le panneau est rendu en
// portail dans le .trk-app le plus proche (pour hériter des tokens du thème)
// en position fixe : il n'est donc jamais rogné par un overflow parent.

function flattenOptions(children) {
  const out = [];
  Children.toArray(children).forEach((child) => {
    if (!isValidElement(child)) return;
    if (child.type === "option") {
      out.push({
        value: String(child.props.value ?? ""),
        label: child.props.children,
        disabled: !!child.props.disabled,
      });
    } else if (child.props?.children) {
      out.push(...flattenOptions(child.props.children));
    }
  });
  return out;
}

export function Select({
  value,
  onChange,
  children,
  className = "",
  disabled = false,
  prefix,
  "aria-label": ariaLabel,
  title,
}) {
  const options = flattenOptions(children);
  const current = String(value ?? "");
  const selected = options.find((o) => o.value === current) ?? options[0];
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  const host = btnRef.current?.closest(".trk-app") ?? (typeof document !== "undefined" ? document.body : null);

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const spaceBelow = window.innerHeight - r.bottom;
    const up = spaceBelow < 220 && r.top > spaceBelow;
    setPos({
      left: r.left,
      minWidth: r.width,
      top: up ? undefined : r.bottom + 8,
      bottom: up ? window.innerHeight - r.top + 8 : undefined,
      up,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onWin = () => place();
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    return () => {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const commit = (opt) => {
    if (!opt || opt.disabled) return;
    setOpen(false);
    btnRef.current?.focus();
    if (opt.value !== current) onChange?.({ target: { value: opt.value } });
  };

  const openList = () => {
    if (disabled) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === current)));
    setOpen(true);
  };

  const move = (dir) => {
    if (!options.length) return;
    let i = active;
    for (let n = 0; n < options.length; n++) {
      i = (i + dir + options.length) % options.length;
      if (!options[i].disabled) break;
    }
    setActive(i);
  };

  const onKeyDown = (e) => {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(options.length - 1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); commit(options[active]); }
    else if (e.key === "Escape" || e.key === "Tab") { setOpen(false); }
  };

  useEffect(() => {
    if (!open || active < 0) return;
    panelRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={"trk-select trk-cselect " + className + (open ? " open" : "")}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={title}
      >
        <span className="trk-cselect-value">
          {prefix && <span className="trk-cselect-prefix">{prefix}</span>}
          {selected?.label}
        </span>
        <ChevronDown size={14} className="trk-cselect-chevron" />
      </button>
      {open && pos && host &&
        createPortal(
          <div
            ref={panelRef}
            className={"trk-cselect-panel" + (pos.up ? " up" : "")}
            role="listbox"
            style={{ left: pos.left, top: pos.top, bottom: pos.bottom, minWidth: pos.minWidth }}
          >
            {options.map((o, i) => (
              <div
                key={o.value + i}
                data-idx={i}
                role="option"
                aria-selected={o.value === current}
                aria-disabled={o.disabled}
                className={
                  "trk-cselect-option" +
                  (o.value === current ? " selected" : "") +
                  (i === active ? " active" : "") +
                  (o.disabled ? " disabled" : "")
                }
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(o)}
              >
                <span className="trk-cselect-option-label">{o.label}</span>
                {o.value === current && <Check size={13} className="trk-cselect-check" />}
              </div>
            ))}
          </div>,
          host,
        )}
    </>
  );
}

