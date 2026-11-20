// Interactive Gantt Diagram Renderer & Direct-Manipulation Controller.
// Renders a crisp, high-craft synchronized hierarchy + SVG timeline with:
// - Phase summary brackets & rollup durations
// - Interactive horizontal bar drag (reschedule manual startOffset)
// - Interactive right-edge bar resize (edit estimated duration live!)
// - Dependency arrows (FS, SS, FF) with Critical Path highlighting
// - Hours / Days / Weeks / Fit zoom scales + weekend shading
// - Clean standalone SVG & PNG export

import { addWorkHours, formatDuration, formatShortDate } from "./schedule.js";
import { getLang, t } from "./i18n.js";

const ROW_H = 38;
const PHASE_ROW_H = 34;
const HEADER_H = 44;

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export class GanttController {
  constructor(containerEl, callbacks) {
    this.el = containerEl;
    this.cb = callbacks; // { onSelect, onStatusToggle, onUpdateDuration, onUpdateOffset, onTogglePhaseFold }
    this.scale = "days"; // "hours" | "days" | "weeks" | "fit"
    this.foldedPhases = new Set();
    this.dragState = null;
    this.lastRender = null;
    this._dragRaf = null;
    this._pendingDragUpdate = null;

    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    window.addEventListener("pointermove", this._onPointerMove);
    window.addEventListener("pointerup", this._onPointerUp);
  }

  setScale(scale) {
    this.scale = scale;
  }

  /**
   * Build the flat list of visible rows (Phase headers + child Actions).
   */
  _buildRows(root, schedule, filterFn) {
    const rows = [];
    const phases = Array.isArray(root?.children) ? root.children : [];
    for (const ph of phases) {
      const pSummary = schedule.phases.get(ph.id);
      const pItems = schedule.orderedItems.filter((it) => it.phaseId === ph.id && filterFn(it));
      if (pItems.length === 0 && (ph.children || []).length > 0 && !filterFn({ phaseId: ph.id })) {
        continue;
      }
      rows.push({
        kind: "phase",
        id: ph.id,
        node: ph,
        summary: pSummary,
        color: ph.color || "#3FBFA8",
        folded: this.foldedPhases.has(ph.id),
        height: PHASE_ROW_H,
      });
      if (!this.foldedPhases.has(ph.id)) {
        for (const it of pItems) {
          rows.push({
            kind: "action",
            id: it.id,
            item: it,
            color: it.phaseColor || ph.color || "#3FBFA8",
            height: ROW_H,
          });
        }
      }
    }
    return rows;
  }

  _computePxPerHour(schedule, timelineWidth) {
    const hpd = schedule.calendar.hoursPerDay;
    const spanHours = Math.max(hpd * 3, schedule.projectSpan + hpd * 1.5);
    if (this.scale === "hours") return 28;
    if (this.scale === "days") return Math.max(10, Math.round(76 / hpd * 10) / 10);
    if (this.scale === "weeks") return Math.max(4, Math.round(28 / hpd * 10) / 10);
    // "fit"
    const avail = Math.max(360, timelineWidth - 48);
    return Math.max(3.5, Math.min(40, avail / spanHours));
  }

  render(root, schedule, opts = {}) {
    const {
      selectedId = null,
      showCritical = true,
      showDeps = true,
      filterFn = () => true,
      dark = true,
    } = opts;
    const lang = getLang();
    const hpd = schedule.calendar.hoursPerDay;

    const rows = this._buildRows(root, schedule, filterFn);
    if (schedule.actionCount === 0) {
      this.el.innerHTML = `
        <div class="gantt-empty">
          <div class="gantt-empty-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="8" height="4" rx="1.5"/>
              <rect x="8" y="10" width="10" height="4" rx="1.5"/>
              <rect x="13" y="16" width="8" height="4" rx="1.5"/>
            </svg>
          </div>
          <p>${esc(t("gantt_empty"))}</p>
        </div>`;
      return;
    }

    const rect = this.el.getBoundingClientRect();
    const tableW = Math.min(300, Math.max(220, Math.round(rect.width * 0.3)));
    const timelineViewportW = Math.max(320, rect.width - tableW);
    const pxPerHour = this._computePxPerHour(schedule, timelineViewportW);

    const totalHours = Math.max(
      hpd * 5,
      Math.ceil((schedule.projectSpan + hpd * 1.5) / hpd) * hpd
    );
    const canvasW = Math.max(timelineViewportW, Math.round(totalHours * pxPerHour) + 80);

    // Compute Y positions for each row
    let curY = 0;
    const rowY = new Map();
    for (const r of rows) {
      r.y = curY;
      rowY.set(r.id, r);
      curY += r.height;
    }
    const bodyH = Math.max(240, curY + 24);

    // Build time ruler ticks
    const numDays = Math.ceil(totalHours / hpd);
    let gridLines = "";
    let rulerCells = "";
    const stepDays = this.scale === "weeks" ? 5 : 1;

    for (let d = 0; d <= numDays; d++) {
      const x = Math.round(d * hpd * pxPerHour) + 16;
      const dateObj = addWorkHours(schedule.calendar.startDate, d * hpd, schedule.calendar);
      const isWeekStart = d % 5 === 0;
      const showLabel = this.scale === "hours" || d % stepDays === 0;

      if (showLabel && d < numDays) {
        const w = Math.round(stepDays * hpd * pxPerHour);
        const dayLabel = formatShortDate(dateObj, lang);
        const subLabel = this.scale === "hours" ? `J${d + 1}` : `D${d + 1}`;
        rulerCells += `<div class="g-tick${isWeekStart ? " g-tick-major" : ""}" style="left:${x}px;width:${w}px">
          <span class="g-tick-date">${esc(dayLabel)}</span>
          <span class="g-tick-sub">${lang === "fr" ? `J${d + 1}` : subLabel}</span>
        </div>`;
      }

      gridLines += `<line x1="${x}" y1="0" x2="${x}" y2="${bodyH}" stroke="var(--border)" stroke-opacity="${isWeekStart ? (dark ? "0.65" : "0.75") : (dark ? "0.28" : "0.38")}" stroke-width="${isWeekStart ? "1" : "0.8"}" />`;
    }

    // Horizontal row stripes
    let rowStripes = "";
    for (const r of rows) {
      const isSel = r.id === selectedId;
      if (isSel) {
        rowStripes += `<rect x="0" y="${r.y}" width="${canvasW}" height="${r.height}" fill="var(--accent)" fill-opacity="0.10" />`;
      } else if (r.kind === "phase") {
        rowStripes += `<rect x="0" y="${r.y}" width="${canvasW}" height="${r.height}" fill="var(--panel-alt)" fill-opacity="0.48" />`;
      }
      rowStripes += `<line x1="0" y1="${r.y + r.height}" x2="${canvasW}" y2="${r.y + r.height}" stroke="var(--border)" stroke-opacity="0.32" stroke-width="0.8" />`;
    }

    // Start marker line
    const startX = 16;
    const startLine = `<line x1="${startX}" y1="0" x2="${startX}" y2="${bodyH}" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.8" />`;

    // Dependency arrows (drawn underneath bars so bars stay crisp)
    let depPaths = "";
    if (showDeps) {
      for (const r of rows) {
        if (r.kind !== "action") continue;
        const dst = r.item;
        const dstX = startX + dst.es * pxPerHour;
        const dstMidY = r.y + r.height / 2;

        for (const p of dst.preds) {
          const srcRow = rowY.get(p.id);
          if (!srcRow || srcRow.kind !== "action") continue;
          const src = srcRow.item;
          const srcX = p.type === "SS" ? startX + src.es * pxPerHour : startX + src.ef * pxPerHour;
          const srcMidY = srcRow.y + srcRow.height / 2;
          const targetX = p.type === "FF" ? startX + dst.ef * pxPerHour : dstX;

          const isCritEdge = showCritical && src.isCritical && dst.isCritical;
          const isFocusEdge = selectedId && (src.id === selectedId || dst.id === selectedId);
          const stroke = isCritEdge
            ? "var(--warn)"
            : isFocusEdge
            ? "var(--accent)"
            : "var(--text-dim)";
          const strokeOpacity = isCritEdge ? 0.92 : isFocusEdge ? 0.95 : 0.45;
          const strokeW = isCritEdge || isFocusEdge ? 1.8 : 1.15;

          const path = this._orthogonalArrow(srcX, srcMidY, targetX, dstMidY);
          const marker = isCritEdge ? "url(#g-ar-crit)" : isFocusEdge ? "url(#g-ar-acc)" : "url(#g-ar)";
          depPaths += `<path d="${path}" fill="none" stroke="${stroke}" stroke-opacity="${strokeOpacity}" stroke-width="${strokeW}" ${p.implicit ? 'stroke-dasharray="4 3"' : ""} marker-end="${marker}" />`;
        }
      }
    }

    // Bars (Phase rollups + Action bars)
    let barsSvg = "";
    for (const r of rows) {
      if (r.kind === "phase") {
        const s = r.summary;
        if (!s || s.count === 0) continue;
        const bx = startX + s.es * pxPerHour;
        const bw = Math.max(12, (s.ef - s.es) * pxPerHour);
        const by = r.y + 11;
        const bh = 10;
        const progW = Math.round((bw * s.progress) / 100);
        barsSvg += `<g class="g-phase-bar" data-id="${esc(r.id)}">
          <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="4" fill="${r.color}" fill-opacity="0.26" stroke="${r.color}" stroke-width="1.2" />
          ${progW > 0 ? `<rect x="${bx}" y="${by}" width="${progW}" height="${bh}" rx="4" fill="${r.color}" fill-opacity="0.72" />` : ""}
          <path d="M${bx},${by + bh - 1} L${bx},${by + bh + 4} L${bx + 5},${by + bh - 1} Z" fill="${r.color}" />
          <path d="M${bx + bw},${by + bh - 1} L${bx + bw},${by + bh + 4} L${bx + bw - 5},${by + bh - 1} Z" fill="${r.color}" />
        </g>`;
      } else {
        const it = r.item;
        const bx = startX + it.es * pxPerHour;
        const bw = Math.max(18, it.duration * pxPerHour);
        const by = r.y + 7;
        const bh = r.height - 14;
        const isSel = it.id === selectedId;
        const isCrit = showCritical && it.isCritical;
        const isDone = it.stat === "done";
        const isBlocked = it.stat === "blocked";
        const fillOp = isDone ? 0.45 : isCrit ? 0.92 : 0.78;
        const durText = formatDuration(it.duration, hpd, lang);

        // Optional slack ghost bar when critical path mode is on and item has slack
        let slackBar = "";
        if (showCritical && it.slack > 0.1 && !it.inCycle) {
          const sw = Math.min(canvasW - (bx + bw) - 8, it.slack * pxPerHour);
          if (sw > 4) {
            slackBar = `<rect x="${bx + bw}" y="${by + bh / 2 - 2}" width="${sw}" height="4" rx="2" fill="var(--text-dim)" fill-opacity="0.24" stroke="var(--text-dim)" stroke-opacity="0.35" stroke-dasharray="3 2" stroke-width="0.8" />`;
          }
        }

        const labelInside = bw > 64;
        const durInside = bw > 112;
        const hasOutgoing = it.succs && it.succs.length > 0;
        const maxChars = Math.max(4, Math.floor((bw - (durInside ? 52 : 16)) / 6.8));
        const shortTitle =
          it.label.length > maxChars ? it.label.slice(0, maxChars - 1) + "…" : it.label;
        const extX = bx + bw + (hasOutgoing ? 18 : 7);

        barsSvg += `<g class="g-bar${isSel ? " is-sel" : ""}${isCrit ? " is-crit" : ""}" data-id="${esc(it.id)}">
          ${slackBar}
          ${isSel ? `<rect x="${bx - 3}" y="${by - 3}" width="${bw + 6}" height="${bh + 6}" rx="9" fill="none" stroke="var(--accent)" stroke-width="1.8" opacity="0.85" />` : ""}
          <rect class="g-bar-body" data-drag="${esc(it.id)}" x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="7"
            fill="${isBlocked ? "var(--danger)" : r.color}" fill-opacity="${fillOp}"
            stroke="${isCrit ? "var(--warn)" : isSel ? "var(--text)" : r.color}"
            stroke-width="${isCrit ? "1.8" : "1"}" />
          ${isDone ? `<line x1="${bx + 6}" y1="${by + bh / 2}" x2="${bx + bw - 6}" y2="${by + bh / 2}" stroke="var(--bg)" stroke-width="1.4" stroke-opacity="0.55" pointer-events="none" />` : ""}
          ${
            labelInside
              ? `<text x="${bx + 9}" y="${by + bh / 2 + 4}" font-size="11" font-weight="600" fill="#ffffff" style="text-shadow:0 1px 2px rgba(0,0,0,0.45)" pointer-events="none">${esc(shortTitle)}</text>`
              : `<text x="${extX}" y="${by + bh / 2 + 4}" font-size="11" font-weight="500" fill="var(--text)" pointer-events="none">${esc(it.label)} <tspan fill="var(--text-dim)" font-size="10">(${esc(durText)})</tspan></text>`
          }
          ${
            durInside
              ? `<text x="${bx + bw - 10}" y="${by + bh / 2 + 3.5}" text-anchor="end" font-size="9.5" font-weight="600" font-family="var(--mono)" fill="rgba(255,255,255,0.88)" pointer-events="none">${esc(durText)}</text>`
              : labelInside
              ? `<text x="${extX}" y="${by + bh / 2 + 3.5}" font-size="10" font-family="var(--mono)" fill="var(--text-dim)" pointer-events="none">${esc(durText)}</text>`
              : ""
          }
          <rect class="g-resize-handle" data-resize="${esc(it.id)}" x="${bx + bw - 6}" y="${by + 2}" width="9" height="${bh - 4}" rx="3" fill="transparent" />
        </g>`;
      }
    }

    // Build Left Table Rows
    let leftRowsHtml = "";
    for (const r of rows) {
      const isSel = r.id === selectedId;
      if (r.kind === "phase") {
        const s = r.summary;
        leftRowsHtml += `<div class="g-row g-row-phase${isSel ? " is-sel" : ""}" data-id="${esc(r.id)}" style="height:${r.height}px">
          <button type="button" class="g-fold-btn" data-gfold="${esc(r.id)}" aria-label="Toggle phase">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="transform:rotate(${r.folded ? "-90deg" : "0deg"})"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <span class="g-phase-dot" style="background:${r.color}"></span>
          <span class="g-row-title">${esc(r.node.label)}</span>
          <span class="g-row-dur">${s ? esc(formatDuration(s.effort, hpd, lang)) : "0h"}</span>
        </div>`;
      } else {
        const it = r.item;
        const isCrit = showCritical && it.isCritical;
        leftRowsHtml += `<div class="g-row g-row-action${isSel ? " is-sel" : ""}${it.stat === "done" ? " is-done" : ""}" data-id="${esc(it.id)}" style="height:${r.height}px">
          <button type="button" class="g-stat-dot g-stat-${esc(it.stat)}" data-gstat="${esc(it.id)}" title="${esc(t("stat_" + it.stat))}"></button>
          <span class="g-row-title" title="${esc(it.label)}">${esc(it.label)}</span>
          ${isCrit ? `<span class="g-crit-pip" title="${esc(t("insp_critical_yes"))}"></span>` : ""}
          <span class="g-row-dur">${esc(formatDuration(it.duration, hpd, lang))}</span>
        </div>`;
      }
    }

    const svgHtml = `<svg id="ganttSvg" width="${canvasW}" height="${bodyH}" viewBox="0 0 ${canvasW} ${bodyH}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="g-ar" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,1.2 L7,4 L0,6.8 z" fill="var(--text-dim)" opacity="0.65"/>
        </marker>
        <marker id="g-ar-acc" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,1.2 L7,4 L0,6.8 z" fill="var(--accent)"/>
        </marker>
        <marker id="g-ar-crit" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6.5" markerHeight="6.5" orient="auto">
          <path d="M0,1.2 L7,4 L0,6.8 z" fill="var(--warn)"/>
        </marker>
      </defs>
      <g>${rowStripes}</g>
      <g>${gridLines}</g>
      ${startLine}
      <g>${depPaths}</g>
      <g>${barsSvg}</g>
    </svg>`;

    // Preserve scroll positions across re-renders
    const prevScrollLeft = this.el.querySelector(".g-timeline-scroll")?.scrollLeft || 0;
    const prevScrollTop = this.el.querySelector(".g-body-scroll")?.scrollTop || 0;

    this.el.innerHTML = `
      <div class="gantt-shell">
        <div class="gantt-toolbar">
          <div class="gantt-scale-seg" role="group">
            ${["hours", "days", "weeks", "fit"]
              .map(
                (sc) =>
                  `<button type="button" class="g-scale-btn${this.scale === sc ? " on" : ""}" data-gscale="${sc}">${esc(t("gantt_scale_" + sc))}</button>`
              )
              .join("")}
          </div>
          <span class="gantt-hint">${esc(t("gantt_drag_hint"))}</span>
        </div>
        <div class="g-body-scroll">
          <div class="g-left-col" style="width:${tableW}px">
            <div class="g-left-head" style="height:${HEADER_H}px">
              <span>${esc(t("gantt_col_task"))}</span>
              <span>${esc(t("gantt_col_dur"))}</span>
            </div>
            <div class="g-left-rows">${leftRowsHtml}</div>
          </div>
          <div class="g-timeline-scroll">
            <div class="g-ruler" style="width:${canvasW}px;height:${HEADER_H}px">${rulerCells}</div>
            <div class="g-svg-wrap" style="width:${canvasW}px;height:${bodyH}px">${svgHtml}</div>
          </div>
        </div>
      </div>`;

    const tlScroll = this.el.querySelector(".g-timeline-scroll");
    const bodyScroll = this.el.querySelector(".g-body-scroll");
    if (tlScroll) tlScroll.scrollLeft = prevScrollLeft;
    if (bodyScroll) bodyScroll.scrollTop = prevScrollTop;

    this.lastRender = { pxPerHour, hpd, schedule, canvasW, bodyH, rows };
    this._bindEvents();
  }

  _orthogonalArrow(x1, y1, x2, y2) {
    const gap = 10;
    if (x2 >= x1 + gap) {
      const mx = x1 + Math.min(18, (x2 - x1) / 2);
      return `M${x1.toFixed(1)},${y1.toFixed(1)} L${mx.toFixed(1)},${y1.toFixed(1)} L${mx.toFixed(1)},${y2.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)}`;
    }
    const midY = y1 + (y2 >= y1 ? 14 : -14);
    return `M${x1.toFixed(1)},${y1.toFixed(1)} L${(x1 + 10).toFixed(1)},${y1.toFixed(1)} L${(x1 + 10).toFixed(1)},${midY.toFixed(1)} L${(x2 - 12).toFixed(1)},${midY.toFixed(1)} L${(x2 - 12).toFixed(1)},${y2.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)}`;
  }

  _bindEvents() {
    this.el.querySelectorAll("[data-gscale]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.scale = btn.dataset.gscale;
        this.cb.onScaleChange?.(this.scale);
      });
    });

    this.el.querySelectorAll("[data-gfold]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.gfold;
        if (this.foldedPhases.has(id)) this.foldedPhases.delete(id);
        else this.foldedPhases.add(id);
        this.cb.onTogglePhaseFold?.();
      });
    });

    this.el.querySelectorAll("[data-gstat]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.cb.onStatusToggle?.(btn.dataset.gstat);
      });
    });

    this.el.querySelectorAll(".g-row").forEach((row) => {
      row.addEventListener("click", () => {
        this.cb.onSelect?.(row.dataset.id);
      });
    });

    const svgEl = this.el.querySelector("#ganttSvg");
    if (!svgEl) return;

    svgEl.addEventListener("pointerdown", (e) => {
      const resizeEl = e.target.closest("[data-resize]");
      if (resizeEl && this.lastRender) {
        e.preventDefault();
        const id = resizeEl.dataset.resize;
        const item = this.lastRender.schedule.items.get(id);
        if (!item) return;
        this.dragState = {
          mode: "resize",
          id,
          startX: e.clientX,
          origDur: item.duration,
          pxPerHour: this.lastRender.pxPerHour,
          moved: false,
        };
        document.body.style.cursor = "ew-resize";
        return;
      }

      const dragEl = e.target.closest("[data-drag]");
      if (dragEl && this.lastRender) {
        e.preventDefault();
        const id = dragEl.dataset.drag;
        const item = this.lastRender.schedule.items.get(id);
        if (!item) return;
        this.dragState = {
          mode: "move",
          id,
          startX: e.clientX,
          origEs: item.es,
          pxPerHour: this.lastRender.pxPerHour,
          moved: false,
        };
        document.body.style.cursor = "grabbing";
        return;
      }

      const phaseBar = e.target.closest(".g-phase-bar");
      if (phaseBar) {
        this.cb.onSelect?.(phaseBar.dataset.id);
      }
    });
  }

  _flushPendingDrag() {
    if (this._dragRaf !== null) {
      cancelAnimationFrame(this._dragRaf);
      this._dragRaf = null;
    }
    const u = this._pendingDragUpdate;
    this._pendingDragUpdate = null;
    if (!u) return;
    if (u.kind === "resize") {
      this.cb.onUpdateDuration?.(u.id, u.val, false);
    } else if (u.kind === "move") {
      this.cb.onUpdateOffset?.(u.id, u.val, false);
    }
  }

  _onPointerMove(e) {
    if (!this.dragState) return;
    const dx = e.clientX - this.dragState.startX;
    if (Math.abs(dx) > 3) this.dragState.moved = true;
    if (!this.dragState.moved) return;

    const deltaHours = dx / this.dragState.pxPerHour;
    const snap = this.scale === "hours" ? 0.5 : 1;

    if (this.dragState.mode === "resize") {
      const nextDur = Math.max(0.5, Math.round((this.dragState.origDur + deltaHours) / snap) * snap);
      this._pendingDragUpdate = { kind: "resize", id: this.dragState.id, val: nextDur };
    } else if (this.dragState.mode === "move") {
      const nextOffset = Math.max(0, Math.round((this.dragState.origEs + deltaHours) / snap) * snap);
      this._pendingDragUpdate = { kind: "move", id: this.dragState.id, val: nextOffset };
    }

    if (this._dragRaf === null) {
      this._dragRaf = requestAnimationFrame(() => {
        this._dragRaf = null;
        this._flushPendingDrag();
      });
    }
  }

  _onPointerUp() {
    if (!this.dragState) return;
    this._flushPendingDrag();
    const ds = this.dragState;
    this.dragState = null;
    document.body.style.cursor = "";
    if (!ds.moved) {
      this.cb.onSelect?.(ds.id);
    } else if (ds.mode === "resize") {
      this.cb.onCommitDrag?.("resize");
    } else if (ds.mode === "move") {
      this.cb.onCommitDrag?.("move");
    }
  }

  /**
   * Build a self-contained SVG string with resolved CSS variables for clean export.
   */
  exportStandaloneSvg() {
    const svgEl = this.el.querySelector("#ganttSvg");
    if (!svgEl) return null;
    const cs = getComputedStyle(document.documentElement);
    const bg = cs.getPropertyValue("--bg").trim() || "#10141A";
    const text = cs.getPropertyValue("--text").trim() || "#E8EBEE";
    const dim = cs.getPropertyValue("--text-dim").trim() || "#8B95A1";
    const border = cs.getPropertyValue("--border").trim() || "#2A323D";
    const accent = cs.getPropertyValue("--accent").trim() || "#35A7A0";
    const warn = cs.getPropertyValue("--warn").trim() || "#E08A3C";
    const danger = cs.getPropertyValue("--danger").trim() || "#D64545";
    const panelAlt = cs.getPropertyValue("--panel-alt").trim() || "#1D2430";

    const clone = svgEl.cloneNode(true);
    const w = Number(clone.getAttribute("width")) || 800;
    const h = Number(clone.getAttribute("height")) || 400;

    // Prepend solid background rect
    const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bgRect.setAttribute("x", "0");
    bgRect.setAttribute("y", "0");
    bgRect.setAttribute("width", String(w));
    bgRect.setAttribute("height", String(h));
    bgRect.setAttribute("fill", bg);
    clone.insertBefore(bgRect, clone.firstChild);

    let markup = new XMLSerializer().serializeToString(clone);
    const vars = {
      "var(--bg)": bg,
      "var(--text)": text,
      "var(--text-dim)": dim,
      "var(--border)": border,
      "var(--accent)": accent,
      "var(--warn)": warn,
      "var(--danger)": danger,
      "var(--panel-alt)": panelAlt,
      "var(--mono)": "ui-monospace, Menlo, Consolas, monospace",
    };
    for (const [k, v] of Object.entries(vars)) {
      markup = markup.replaceAll(k, v);
    }
    return { svg: markup, width: w, height: h };
  }
}
