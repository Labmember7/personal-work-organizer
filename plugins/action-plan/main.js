import trk from "/@trk/sdk.js";
import { getLang, setLang, t } from "./engine/i18n.js";
import {
  computeSchedule,
  flattenPlan,
  formatDuration,
  formatShortDate,
  parseDurationHours,
  toIsoDate,
  toMermaidGantt,
} from "./engine/schedule.js";
import {
  branchCurvePath,
  computeMindmapLayout,
  dependencyCurvePath,
  LINE_H,
  PAD_X,
  PAD_Y,
} from "./engine/layout.js";
import { GanttController } from "./engine/gantt.js";

/* ============================================================================
   Constants & Helpers
   ============================================================================ */
const PALETTE = ["#35A7A0", "#7C6CF0", "#3D9BE9", "#E08A3C", "#D9536B", "#4CAF6D", "#B563C9"];
const STAT_ORDER = ["todo", "doing", "done", "blocked"];
const PRIO_ORDER = ["P0", "P1", "P2", ""];
const FONT_SANS = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
const FONT_MONO = "ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const uid = () => "a" + Math.random().toString(36).slice(2, 8);
const measureCtx = document.createElement("canvas").getContext("2d");

function hexAlpha(hex, alpha) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return `rgba(128,128,128,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function cssVar(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function statColor(stat) {
  if (stat === "done") return cssVar("--ok", "#4CAF6D");
  if (stat === "doing") return cssVar("--warn", "#E08A3C");
  if (stat === "blocked") return cssVar("--danger", "#D64545");
  return cssVar("--text-dim", "#8B95A1");
}

/* ============================================================================
   Starter Sample & Blank Templates
   ============================================================================ */
function createSamplePlan() {
  const fr = getLang() === "fr";
  const today = toIsoDate(new Date());
  const a1 = "act_scope", a2 = "act_arch", a3 = "act_ux", a4 = "act_core", a5 = "act_ui", a6 = "act_qa", a7 = "act_launch";
  return {
    id: "root",
    label: fr ? "Lancement Produit V1" : "Product Launch V1",
    startDate: today,
    hoursPerDay: 8,
    skipWeekends: true,
    layoutMode: "balanced",
    children: [
      {
        id: "ph_discover",
        label: fr ? "1. Cadrage & Design" : "1. Discovery & Design",
        color: PALETTE[0],
        side: "L",
        autoSequence: false,
        children: [
          { id: a1, label: fr ? "Définir le périmètre & KPI" : "Define scope & KPIs", estHours: 6, stat: "done", prio: "P0", owner: "Alex", deps: [], children: [] },
          { id: a2, label: fr ? "Architecture technique" : "Technical architecture", estHours: 8, stat: "doing", prio: "P0", owner: "Sam", deps: [{ id: a1, type: "FS", lag: 0 }], children: [] },
          { id: a3, label: fr ? "Maquettes UI & prototype" : "UI mockups & prototype", estHours: 12, stat: "doing", prio: "P1", owner: "Maya", deps: [{ id: a1, type: "FS", lag: 0 }], children: [] },
        ],
      },
      {
        id: "ph_build",
        label: fr ? "2. Développement" : "2. Implementation",
        color: PALETTE[1],
        side: "R",
        autoSequence: false,
        children: [
          { id: a4, label: fr ? "Moteur & API principale" : "Core engine & API", estHours: 16, stat: "todo", prio: "P0", owner: "Sam", deps: [{ id: a2, type: "FS", lag: 0 }], children: [] },
          { id: a5, label: fr ? "Interface interactive" : "Interactive frontend", estHours: 14, stat: "todo", prio: "P0", owner: "Maya", deps: [{ id: a3, type: "FS", lag: 0 }, { id: a4, type: "SS", lag: 4 }], children: [] },
        ],
      },
      {
        id: "ph_ship",
        label: fr ? "3. Validation & Mise en ligne" : "3. QA & Release",
        color: PALETTE[3],
        side: "R",
        autoSequence: false,
        children: [
          { id: a6, label: fr ? "Tests E2E & performance" : "E2E & performance testing", estHours: 8, stat: "todo", prio: "P0", owner: "Alex", deps: [{ id: a4, type: "FS", lag: 0 }, { id: a5, type: "FS", lag: 0 }], children: [] },
          { id: a7, label: fr ? "Déploiement & annonce" : "Deployment & release notes", estHours: 4, stat: "todo", prio: "P1", owner: "Team", deps: [{ id: a6, type: "FS", lag: 0 }], children: [] },
        ],
      },
    ],
  };
}

function createBlankPlan() {
  return {
    id: "root",
    label: t("new_root_label"),
    startDate: toIsoDate(new Date()),
    hoursPerDay: 8,
    skipWeekends: true,
    layoutMode: "balanced",
    children: [
      {
        id: uid(),
        label: t("new_phase_label") + " 1",
        color: PALETTE[0],
        side: "R",
        autoSequence: false,
        children: [
          {
            id: uid(),
            label: t("new_action_label") + " 1",
            estHours: 4,
            stat: "todo",
            prio: "P1",
            deps: [],
            children: [],
          },
        ],
      },
    ],
  };
}

/* ============================================================================
   Application State
   ============================================================================ */
let PLAN = createSamplePlan();
let SCHEDULE = computeSchedule(PLAN);
let FLAT = flattenPlan(PLAN);
let LAYOUT = null;
let HOST_TASKS = new Map();
let IS_DARK = true;

const UI = {
  view: "map", // "map" | "split" | "gantt"
  selectedId: null,
  showCritical: true,
  showDeps: true,
  folded: new Set(),
  search: "",
  searchHits: new Set(),
  vx: 0,
  vy: 0,
  k: 1,
  wiringFrom: null,
  fullscreen: false,
};

const HISTORY = { past: [], future: [], base: null };
const HIST_MAX = 80;

function clonePlan(obj = PLAN) {
  return JSON.parse(JSON.stringify(obj));
}

function resetHistory() {
  HISTORY.past.length = 0;
  HISTORY.future.length = 0;
  HISTORY.base = clonePlan();
  updateHistoryButtons();
}

function commitChange(mergeKey = null) {
  const now = Date.now();
  const top = HISTORY.past[HISTORY.past.length - 1];
  if (mergeKey && top && top.key === mergeKey && now - top.t < 1200) {
    top.t = now;
  } else {
    HISTORY.past.push({ snap: HISTORY.base, key: mergeKey, t: now });
    if (HISTORY.past.length > HIST_MAX) HISTORY.past.shift();
  }
  HISTORY.future.length = 0;
  HISTORY.base = clonePlan();
  updateHistoryButtons();
  scheduleSave();
}

function undo() {
  const prev = HISTORY.past.pop();
  if (!prev) return;
  HISTORY.future.push({ snap: clonePlan(), key: prev.key, t: Date.now() });
  PLAN = JSON.parse(JSON.stringify(prev.snap));
  HISTORY.base = clonePlan();
  if (UI.selectedId && !findEntry(UI.selectedId)) UI.selectedId = null;
  updateHistoryButtons();
  scheduleSave();
  renderAll();
}

function redo() {
  const next = HISTORY.future.pop();
  if (!next) return;
  HISTORY.past.push({ snap: clonePlan(), key: next.key, t: Date.now() });
  PLAN = JSON.parse(JSON.stringify(next.snap));
  HISTORY.base = clonePlan();
  if (UI.selectedId && !findEntry(UI.selectedId)) UI.selectedId = null;
  updateHistoryButtons();
  scheduleSave();
  renderAll();
}

function updateHistoryButtons() {
  $("btnUndo").disabled = HISTORY.past.length === 0;
  $("btnRedo").disabled = HISTORY.future.length === 0;
}

/* ============================================================================
   Host Persistence (Debounced)
   ============================================================================ */
let saveTimer = null;
function scheduleSave() {
  try {
    trk.markDirty(true);
  } catch {
    // Standalone preview outside host
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      trk.save({
        data: {
          plan: clonePlan(),
          ui: {
            view: UI.view,
            showCritical: UI.showCritical,
            showDeps: UI.showDeps,
            folded: [...UI.folded],
          },
        },
      });
    } catch {
      // Ignore outside host
    }
  }, 320);
}

/* ============================================================================
   Tree Lookup & Mutations
   ============================================================================ */
function findEntry(id) {
  return FLAT.byId.get(id) || null;
}

function findNode(id) {
  return FLAT.byId.get(id)?.node || null;
}

function findParentNode(id) {
  const e = FLAT.byId.get(id);
  return e && e.parentId ? FLAT.byId.get(e.parentId)?.node || null : null;
}

function wouldCreateCycle(srcId, dstId) {
  // Adding edge srcId -> dstId creates a cycle if dstId already reaches srcId
  const seen = new Set();
  const stack = [srcId];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === dstId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const n = findNode(cur);
    for (const d of n?.deps || []) {
      const pid = typeof d === "string" ? d : d.id;
      if (pid) stack.push(pid);
    }
  }
  return false;
}

function addChildNode(parentId) {
  const parentEntry = findEntry(parentId) || FLAT.byId.get(PLAN.id);
  if (!parentEntry) return null;
  const parent = parentEntry.node;
  const isPhase = parentEntry.depth === 0;
  const newNode = isPhase
    ? {
        id: uid(),
        label: t("new_phase_label"),
        color: PALETTE[(parent.children || []).length % PALETTE.length],
        side:
          (parent.children || []).filter((c) => c.side === "L").length * 2 <
          (parent.children || []).length
            ? "L"
            : "R",
        autoSequence: false,
        children: [],
      }
    : {
        id: uid(),
        label: t("new_action_label"),
        estHours: 4,
        stat: "todo",
        prio: "P1",
        deps: [],
        children: [],
      };

  parent.children = parent.children || [];
  parent.children.push(newNode);
  UI.folded.delete(parent.id);
  UI.selectedId = newNode.id;
  commitChange();
  renderAll();
  setTimeout(() => openInlineEditor(newNode.id), 30);
  return newNode;
}

function addSiblingNode(refId, chainSequence = false) {
  const entry = findEntry(refId);
  if (!entry || entry.depth === 0) return addChildNode(PLAN.id);
  const parent = findParentNode(refId);
  if (!parent) return null;

  const isPhase = entry.depth === 1;
  const newNode = isPhase
    ? {
        id: uid(),
        label: t("new_phase_label"),
        color: PALETTE[(parent.children || []).length % PALETTE.length],
        side: entry.node.side || "R",
        autoSequence: false,
        children: [],
      }
    : {
        id: uid(),
        label: t("new_action_label"),
        estHours: Number(entry.node.estHours) || 4,
        stat: "todo",
        prio: entry.node.prio || "P1",
        deps: chainSequence ? [{ id: entry.id, type: "FS", lag: 0 }] : [],
        children: [],
      };

  const idx = parent.children.indexOf(entry.node);
  parent.children.splice(idx + 1, 0, newNode);
  UI.selectedId = newNode.id;
  commitChange();
  renderAll();
  setTimeout(() => openInlineEditor(newNode.id), 30);
  return newNode;
}

function addDependency(srcId, dstId, type = "FS", lag = 0) {
  if (!srcId || !dstId || srcId === dstId) {
    showPill(t("pill_link_self"));
    return false;
  }
  const srcE = findEntry(srcId);
  const dstE = findEntry(dstId);
  if (!srcE || !dstE || srcE.depth < 2 || dstE.depth < 2) return false;

  dstE.node.deps = dstE.node.deps || [];
  if (dstE.node.deps.some((d) => (typeof d === "string" ? d : d.id) === srcId)) {
    showPill(t("pill_link_exists"));
    return false;
  }
  if (wouldCreateCycle(srcId, dstId)) {
    showPill(t("pill_link_cycle"));
    return false;
  }
  dstE.node.deps.push({ id: srcId, type, lag });
  commitChange();
  renderAll();
  showPill(t("pill_linked", { a: srcE.node.label, b: dstE.node.label }), t("btn_undo"), undo);
  return true;
}

function removeDependency(dstId, srcId) {
  const dst = findNode(dstId);
  if (!dst || !Array.isArray(dst.deps)) return;
  dst.deps = dst.deps.filter((d) => (typeof d === "string" ? d : d.id) !== srcId);
  commitChange();
  renderAll();
}

function deleteNode(id) {
  const entry = findEntry(id);
  if (!entry || entry.depth === 0) return;
  const parent = findParentNode(id);
  if (!parent) return;

  // Collect all IDs being removed to clean up dangling deps
  const removed = new Set();
  const collect = (n) => {
    removed.add(n.id);
    for (const c of n.children || []) collect(c);
  };
  collect(entry.node);

  parent.children = parent.children.filter((c) => c.id !== id);
  const scrubDeps = (n) => {
    if (Array.isArray(n.deps)) {
      n.deps = n.deps.filter((d) => !removed.has(typeof d === "string" ? d : d.id));
    }
    for (const c of n.children || []) scrubDeps(c);
  };
  scrubDeps(PLAN);

  if (removed.has(UI.selectedId)) UI.selectedId = null;
  commitChange();
  renderAll();
  showPill(t("pill_deleted", { name: entry.node.label }), t("btn_undo"), undo);
}

function duplicateNode(id) {
  const entry = findEntry(id);
  if (!entry || entry.depth === 0) return;
  const parent = findParentNode(id);
  if (!parent) return;

  const copy = JSON.parse(JSON.stringify(entry.node));
  const remap = new Map();
  const reid = (n) => {
    const nid = uid();
    remap.set(n.id, nid);
    n.id = nid;
    for (const c of n.children || []) reid(c);
  };
  reid(copy);
  const fixDeps = (n) => {
    if (Array.isArray(n.deps)) {
      n.deps = n.deps.map((d) => {
        const oid = typeof d === "string" ? d : d.id;
        return remap.has(oid) ? { ...(typeof d === "object" ? d : { type: "FS", lag: 0 }), id: remap.get(oid) } : d;
      });
    }
    for (const c of n.children || []) fixDeps(c);
  };
  fixDeps(copy);

  const idx = parent.children.indexOf(entry.node);
  parent.children.splice(idx + 1, 0, copy);
  UI.selectedId = copy.id;
  commitChange();
  renderAll();
  showPill(t("pill_duplicated", { name: copy.label }), t("btn_undo"), undo);
}

function moveSibling(id, delta) {
  const entry = findEntry(id);
  if (!entry || entry.depth === 0) return;
  const parent = findParentNode(id);
  if (!parent) return;
  const arr = parent.children;
  const idx = arr.indexOf(entry.node);
  const next = idx + delta;
  if (next < 0 || next >= arr.length) return;
  arr.splice(idx, 1);
  arr.splice(next, 0, entry.node);
  commitChange();
  renderAll();
}

function cycleStatus(id) {
  const node = findNode(id);
  if (!node) return;
  const cur = STAT_ORDER.indexOf(node.stat || "todo");
  node.stat = STAT_ORDER[(cur + 1) % STAT_ORDER.length];
  commitChange();
  renderAll();
}

/* ============================================================================
   Gantt Controller Instance
   ============================================================================ */
const gantt = new GanttController($("paneGantt"), {
  onSelect: (id) => selectNode(id),
  onStatusToggle: (id) => cycleStatus(id),
  onScaleChange: () => renderGantt(),
  onTogglePhaseFold: () => renderGantt(),
  onUpdateDuration: (id, hours) => {
    const node = findNode(id);
    if (!node) return;
    node.estHours = hours;
    recomputeAndRenderViews();
    if (UI.selectedId === id) renderInspector();
  },
  onUpdateOffset: (id, offset) => {
    const node = findNode(id);
    if (!node) return;
    node.startOffset = offset;
    recomputeAndRenderViews();
    if (UI.selectedId === id) renderInspector();
  },
  onCommitDrag: () => {
    commitChange();
  },
});

/* ============================================================================
   Rendering Pipeline
   ============================================================================ */
function recompute() {
  FLAT = flattenPlan(PLAN);
  SCHEDULE = computeSchedule(PLAN);
  updateSearchHits();
}

function updateSearchHits() {
  UI.searchHits.clear();
  const q = UI.search.trim().toLowerCase();
  if (!q) {
    $("searchCount").textContent = "";
    return;
  }
  for (const e of FLAT.nodes) {
    const hay = `${e.node.label || ""} ${e.node.owner || ""} ${e.node.note || ""}`.toLowerCase();
    if (hay.includes(q)) UI.searchHits.add(e.id);
  }
  $("searchCount").textContent = String(UI.searchHits.size);
}

function renderKPIs() {
  const lang = getLang();
  const hpd = SCHEDULE.calendar.hoursPerDay;
  $("brandTitle").textContent = PLAN.label || t("app_title");
  $("brandSub").textContent = `${SCHEDULE.actionCount} ${lang === "fr" ? "actions" : "actions"} · ${formatDuration(SCHEDULE.projectSpan, hpd, lang)}`;

  $("kpiSpan").textContent = formatDuration(SCHEDULE.projectSpan, hpd, lang);
  $("kpiEffort").textContent = formatDuration(SCHEDULE.totalEffort, hpd, lang);
  $("kpiEnd").textContent = SCHEDULE.actionCount
    ? formatShortDate(SCHEDULE.projectEndDate, lang)
    : "—";
  $("kpiCrit").textContent = String(SCHEDULE.criticalIds.size);
  $("kpiProg").textContent = `${SCHEDULE.progress}%`;
  $("kpiProgBar").style.width = `${SCHEDULE.progress}%`;

  const cycleEl = $("cycleBanner");
  if (SCHEDULE.cycleIds.length > 0) {
    const names = SCHEDULE.cycleIds
      .slice(0, 3)
      .map((id) => findNode(id)?.label || id)
      .join(", ");
    cycleEl.textContent = "⚠ " + t("warn_cycle", { items: names });
    cycleEl.hidden = false;
  } else {
    cycleEl.hidden = true;
  }

  // Update contextual toolbar buttons
  const selE = UI.selectedId ? findEntry(UI.selectedId) : null;
  $("btnAddQuickLabel").textContent =
    selE && selE.depth >= 1 ? t("btn_add_action") : t("btn_add_phase");
  $("btnAddSeq").disabled = !selE || selE.depth < 2;
}

function renderMindmap() {
  if (UI.view === "gantt") return;
  const lang = getLang();
  const hpd = SCHEDULE.calendar.hoursPerDay;

  LAYOUT = computeMindmapLayout(PLAN, {
    folded: UI.folded,
    mode: PLAN.layoutMode || "balanced",
    measureCtx,
    fontFamily: FONT_SANS,
  });

  const { positions } = LAYOUT;
  const accent = cssVar("--accent", "#35A7A0");
  const warn = cssVar("--warn", "#E08A3C");
  const danger = cssVar("--danger", "#D64545");
  const textC = cssVar("--text", "#E8EBEE");
  const dimC = cssVar("--text-dim", "#8B95A1");
  const panelC = cssVar("--panel", "#181E26");
  const bgC = cssVar("--bg", "#10141A");
  const borderC = cssVar("--border", "#2A323D");

  let branchEdges = "";
  let depEdges = "";
  let nodesSvg = "";

  // 1) Tree structural branches
  for (const e of FLAT.nodes) {
    if (e.depth === 0 || !positions.has(e.id)) continue;
    const pos = positions.get(e.id);
    const pPos = positions.get(e.parentId);
    if (!pPos) continue;
    const col = e.phaseColor || accent;
    const dir = pos.dir || 1;
    const px = dir > 0 ? pPos.x + pPos.w : pPos.x;
    const cx = dir > 0 ? pos.x : pos.x + pos.w;
    const d = branchCurvePath(px, pPos.y, cx, pos.y);
    branchEdges += `<path d="${d}" fill="none" stroke="${hexAlpha(col, e.depth === 1 ? 0.72 : 0.45)}" stroke-width="${e.depth === 1 ? 2.2 : 1.5}" stroke-linecap="round" />`;
  }

  // 2) Dependency edges (explicit + implicit sequence)
  if (UI.showDeps) {
    for (const item of SCHEDULE.orderedItems) {
      const dstPos = positions.get(item.id);
      if (!dstPos) continue;
      for (const pred of item.preds) {
        const srcPos = positions.get(pred.id);
        if (!srcPos) continue;
        const srcItem = SCHEDULE.items.get(pred.id);
        const isCrit = UI.showCritical && item.isCritical && srcItem?.isCritical;
        const isFocus = UI.selectedId && (UI.selectedId === item.id || UI.selectedId === pred.id);
        const col = isCrit ? warn : isFocus ? accent : (srcItem?.phaseColor || dimC);
        const { path, midX, midY } = dependencyCurvePath(srcPos, dstPos);
        const marker = isCrit ? "url(#mm-ar-crit)" : isFocus ? "url(#mm-ar-acc)" : "url(#mm-ar)";
        const strokeOp = isCrit ? 0.95 : isFocus ? 0.95 : 0.52;

        depEdges += `<path d="${path}" fill="none" stroke="transparent" stroke-width="12" data-dep="${esc(item.id)}|${esc(pred.id)}" style="cursor:pointer" />`;
        depEdges += `<path d="${path}" fill="none" stroke="${col}" stroke-opacity="${strokeOp}" stroke-width="${isCrit || isFocus ? 2 : 1.35}" stroke-dasharray="${pred.implicit ? "3 3" : "6 3"}" marker-end="${marker}" pointer-events="none" />`;

        if (pred.type !== "FS" || pred.lag > 0) {
          const badgeTxt = `${pred.type}${pred.lag > 0 ? `+${formatDuration(pred.lag, hpd, lang)}` : ""}`;
          depEdges += `<g transform="translate(${midX.toFixed(1)},${midY.toFixed(1)})" pointer-events="none">
            <rect x="-18" y="-8" width="36" height="16" rx="5" fill="${panelC}" stroke="${col}" stroke-width="1" />
            <text y="3.5" text-anchor="middle" font-family="${FONT_MONO}" font-size="8.5" font-weight="650" fill="${col}">${esc(badgeTxt)}</text>
          </g>`;
        }
      }
    }
  }

  // 3) Render Nodes
  for (const e of FLAT.nodes) {
    const pos = positions.get(e.id);
    if (!pos) continue;
    const node = e.node;
    const isRoot = e.depth === 0;
    const isPhase = e.depth === 1;
    const isAction = e.depth >= 2;
    const col = isRoot ? accent : (e.phaseColor || accent);
    const isSel = UI.selectedId === e.id;
    const isHit = UI.searchHits.has(e.id);
    const sched = isAction ? SCHEDULE.items.get(e.id) : null;
    const pSum = isPhase ? SCHEDULE.phases.get(e.id) : null;
    const isCrit = UI.showCritical && sched?.isCritical;
    const isCycle = sched?.inCycle;

    const topY = pos.y - pos.h / 2;
    const r = isRoot ? 14 : isPhase ? 12 : 11;
    const fill = isRoot
      ? hexAlpha(col, IS_DARK ? 0.22 : 0.16)
      : isPhase
      ? hexAlpha(col, IS_DARK ? 0.17 : 0.12)
      : panelC;
    const stroke = isCycle
      ? danger
      : isCrit
      ? warn
      : isSel
      ? col
      : hexAlpha(col, IS_DARK ? 0.42 : 0.5);

    let g = `<g class="mm-node${isSel ? " is-sel" : ""}" data-id="${esc(e.id)}" transform="translate(${pos.x.toFixed(1)},${topY.toFixed(1)})">`;

    // Selection or Critical aura
    if (isSel) {
      g += `<rect x="-4" y="-4" width="${pos.w + 8}" height="${pos.h + 8}" rx="${r + 3}" fill="none" stroke="${hexAlpha(col, 0.34)}" stroke-width="2.5" />`;
    } else if (isHit) {
      g += `<rect x="-3" y="-3" width="${pos.w + 6}" height="${pos.h + 6}" rx="${r + 2}" fill="none" stroke="${accent}" stroke-width="1.8" stroke-dasharray="5 3" />`;
    }

    // Main Card Body
    g += `<rect class="mm-box" width="${pos.w}" height="${pos.h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${isSel || isCrit ? 2 : 1.15}" />`;

    // Left accent spine on actions & phases
    if (!isRoot) {
      g += `<rect x="0" y="6" width="3.5" height="${pos.h - 12}" rx="2" fill="${isCrit ? warn : col}" />`;
    }

    // Status interactive dot for Actions
    if (isAction) {
      const sc = statColor(node.stat);
      g += `<g data-stat="${esc(e.id)}" style="cursor:pointer">
        <circle cx="${PAD_X + 5}" cy="${PAD_Y + 7}" r="9" fill="transparent" />
        <circle cx="${PAD_X + 5}" cy="${PAD_Y + 7}" r="4.8" fill="${node.stat === "done" || node.stat === "blocked" ? sc : "transparent"}" stroke="${sc}" stroke-width="1.7" />
      </g>`;
    }

    // Title lines
    const tx = isAction ? PAD_X + 17 : PAD_X;
    let ty = PAD_Y + 11.5;
    for (const line of pos.lines) {
      const doneStyle = isAction && node.stat === "done" ? ' text-decoration="line-through" opacity="0.62"' : "";
      g += `<text x="${tx}" y="${ty.toFixed(1)}" font-family="${FONT_SANS}" font-size="${pos.fs}" font-weight="${pos.fw}" fill="${textC}"${doneStyle}>${esc(line)}</text>`;
      ty += LINE_H;
    }

    // Bottom Metadata Row
    const my = pos.h - 9;
    if (isRoot) {
      const spanTxt = formatDuration(SCHEDULE.projectSpan, hpd, lang);
      const endTxt = SCHEDULE.actionCount ? formatShortDate(SCHEDULE.projectEndDate, lang) : "—";
      g += `<text x="${PAD_X}" y="${my}" font-family="${FONT_MONO}" font-size="10" fill="${dimC}">${esc(spanTxt)} · ${esc(endTxt)} · ${SCHEDULE.progress}%</text>`;
    } else if (isPhase && pSum) {
      const effTxt = formatDuration(pSum.effort, hpd, lang);
      const seqTag = node.autoSequence ? " · SEQ →" : "";
      g += `<text x="${PAD_X}" y="${my}" font-family="${FONT_MONO}" font-size="10" fill="${dimC}">${pSum.doneCount}/${pSum.count} · ${esc(effTxt)}${seqTag}</text>`;
    } else if (isAction && sched) {
      // Duration Pill (highlight)
      const durTxt = formatDuration(sched.duration, hpd, lang);
      const pillW = Math.max(34, durTxt.length * 6.8 + 14);
      g += `<rect x="${PAD_X}" y="${my - 11.5}" width="${pillW}" height="15" rx="5" fill="${hexAlpha(isCrit ? warn : col, IS_DARK ? 0.22 : 0.16)}" />`;
      g += `<text x="${PAD_X + pillW / 2}" y="${my - 1}" text-anchor="middle" font-family="${FONT_MONO}" font-size="9.5" font-weight="650" fill="${isCrit ? warn : textC}">${esc(durTxt)}</text>`;

      let mx = PAD_X + pillW + 6;
      if (node.prio) {
        g += `<rect x="${mx}" y="${my - 11.5}" width="22" height="15" rx="4" fill="${hexAlpha(borderC, 0.55)}" />`;
        g += `<text x="${mx + 11}" y="${my - 1}" text-anchor="middle" font-family="${FONT_MONO}" font-size="9" font-weight="700" fill="${textC}">${esc(node.prio)}</text>`;
        mx += 27;
      }

      // Scheduled start date snippet
      const dTxt = formatShortDate(sched.startDate, lang);
      g += `<text x="${mx}" y="${my - 1}" font-family="${FONT_MONO}" font-size="9.5" fill="${dimC}">${esc(dTxt)}</text>`;

      if (node.owner) {
        g += `<text x="${pos.w - PAD_X}" y="${my - 1}" text-anchor="end" font-family="${FONT_SANS}" font-size="10" fill="${dimC}">${esc(node.owner)}</text>`;
      }
    }

    // Folded children badge
    const kidCount = (node.children || []).length;
    if (kidCount > 0 && UI.folded.has(e.id)) {
      const fx = pos.dir > 0 ? pos.w + 12 : -12;
      g += `<g data-fold="${esc(e.id)}" style="cursor:pointer">
        <circle cx="${fx}" cy="${pos.h / 2}" r="9.5" fill="${panelC}" stroke="${col}" stroke-width="1.5" />
        <text x="${fx}" y="${pos.h / 2 + 3.5}" text-anchor="middle" font-family="${FONT_MONO}" font-size="9.5" font-weight="700" fill="${col}">${kidCount}</text>
      </g>`;
    }

    // Quick-action handles on hover/select
    const qx = pos.dir > 0 ? pos.w + 13 : -13;
    g += `<g class="mm-quick">`;
    // (+) Add child / phase
    g += `<g data-qadd="${esc(e.id)}">
      <circle cx="${qx}" cy="${pos.h / 2 - (isAction ? 12 : 0)}" r="9" fill="${panelC}" stroke="${col}" stroke-width="1.4" />
      <text x="${qx}" y="${pos.h / 2 - (isAction ? 12 : 0) + 4}" text-anchor="middle" font-size="13" font-weight="700" fill="${col}">+</text>
    </g>`;

    if (isAction) {
      // (→) Next in sequence + Drag-to-connect dependency port
      g += `<g class="mm-port" data-port="${esc(e.id)}">
        <circle cx="${qx}" cy="${pos.h / 2 + 12}" r="9" fill="${panelC}" stroke="${accent}" stroke-width="1.4" />
        <text x="${qx}" y="${pos.h / 2 + 15.5}" text-anchor="middle" font-size="11" font-weight="700" fill="${accent}">→</text>
      </g>`;
    }
    g += `</g>`;

    // Host linked task indicator (top-right)
    if (node.hostTaskId) {
      const ht = HOST_TASKS.get(node.hostTaskId);
      const tc = ht ? ht.statutColor : danger;
      g += `<g transform="translate(${pos.w - 4}, 4)">
        <circle r="5.5" fill="${bgC}" stroke="${tc}" stroke-width="1.6" />
        <circle r="2.2" fill="${tc}" />
      </g>`;
    }

    g += `</g>`;
    nodesSvg += g;
  }

  $("mapScene").innerHTML = `
    <defs>
      <marker id="mm-ar" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
        <path d="M0,1.2 L7,4 L0,6.8 z" fill="${dimC}" />
      </marker>
      <marker id="mm-ar-acc" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
        <path d="M0,1.2 L7,4 L0,6.8 z" fill="${accent}" />
      </marker>
      <marker id="mm-ar-crit" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6.5" markerHeight="6.5" orient="auto">
        <path d="M0,1.2 L7,4 L0,6.8 z" fill="${warn}" />
      </marker>
    </defs>
    <g>${branchEdges}</g>
    <g>${depEdges}</g>
    <g>${nodesSvg}</g>
    <g id="wireGhost"></g>
  `;
  clearTimeout(wheelSettleTimer);
  wheelSettleTimer = null;
  resetGpuLayer();
  applyMapTransform();
}

let lastShownPct = -1;
let wheelBase = null;
let wheelSettleTimer = null;

function resetGpuLayer() {
  const svg = $("mapSvg");
  if (svg) {
    svg.style.transform = "";
    svg.style.transformOrigin = "";
  }
  wheelBase = null;
}

function applyMapTransform() {
  $("mapScene").setAttribute("transform", `translate(${UI.vx.toFixed(1)},${UI.vy.toFixed(1)}) scale(${UI.k.toFixed(3)})`);
  const pct = Math.round(UI.k * 100);
  if (pct !== lastShownPct) {
    lastShownPct = pct;
    $("zPct").textContent = `${pct}%`;
  }
}

function applyZoomGpuFrame() {
  if (!wheelBase) {
    applyMapTransform();
    return;
  }
  const relK = UI.k / wheelBase.k;
  const tx = UI.vx - wheelBase.vx * relK;
  const ty = UI.vy - wheelBase.vy * relK;
  const svg = $("mapSvg");
  svg.style.transformOrigin = "0 0";
  svg.style.transform = `translate3d(${tx.toFixed(2)}px,${ty.toFixed(2)}px,0) scale(${relK.toFixed(4)})`;
  const pct = Math.round(UI.k * 100);
  if (pct !== lastShownPct) {
    lastShownPct = pct;
    $("zPct").textContent = `${pct}%`;
  }
}

function fitMap() {
  if (UI.view === "gantt") return;
  renderMindmap();
  const scene = $("mapScene");
  const box = scene.getBBox();
  const rect = $("paneMap").getBoundingClientRect();
  if (!box.width || !box.height || !rect.width || !rect.height) return;
  const inspW = $("inspector").classList.contains("open") && UI.view === "map" && window.innerWidth > 860 ? 344 : 0;
  const availW = Math.max(200, rect.width - inspW - 72);
  const availH = Math.max(180, rect.height - 72);
  UI.k = Math.max(0.32, Math.min(1.12, Math.min(availW / box.width, availH / box.height)));
  UI.vx = (rect.width - inspW) / 2 - (box.x + box.width / 2) * UI.k;
  UI.vy = rect.height / 2 - (box.y + box.height / 2) * UI.k;
  clearTimeout(wheelSettleTimer);
  wheelSettleTimer = null;
  resetGpuLayer();
  applyMapTransform();
}

function zoomMap(factor, cx = null, cy = null) {
  const pane = $("paneMap");
  const mx = cx ?? pane.clientWidth / 2;
  const my = cy ?? pane.clientHeight / 2;
  const nextK = Math.max(0.28, Math.min(2.2, UI.k * factor));
  if (nextK === UI.k) return;
  if (!wheelBase) {
    wheelBase = { vx: UI.vx, vy: UI.vy, k: UI.k };
  }
  UI.vx = mx - ((mx - UI.vx) * nextK) / UI.k;
  UI.vy = my - ((my - UI.vy) * nextK) / UI.k;
  UI.k = nextK;
  scheduleFrameRender(applyZoomGpuFrame);
  clearTimeout(wheelSettleTimer);
  wheelSettleTimer = setTimeout(() => {
    wheelSettleTimer = null;
    resetGpuLayer();
    applyMapTransform();
  }, 110);
}

function renderGantt() {
  if (UI.view === "map") return;
  const q = UI.search.trim().toLowerCase();
  const filterFn = (it) => {
    if (!q) return true;
    return `${it.label || ""} ${it.owner || ""}`.toLowerCase().includes(q);
  };
  gantt.render(PLAN, SCHEDULE, {
    selectedId: UI.selectedId,
    showCritical: UI.showCritical,
    showDeps: UI.showDeps,
    filterFn,
    dark: IS_DARK,
  });
}

function recomputeAndRenderViews() {
  recompute();
  renderKPIs();
  renderMindmap();
  renderGantt();
}

function renderAll() {
  recomputeAndRenderViews();
  renderInspector();
}

/* ============================================================================
   Inspector Drawer
   ============================================================================ */
function selectNode(id, openDrawer = true) {
  UI.selectedId = id;
  if (openDrawer && id) $("inspector").classList.add("open");
  if (!id) $("inspector").classList.remove("open");
  renderKPIs();
  renderMindmap();
  renderGantt();
  renderInspector();
}

function renderInspector() {
  const drawer = $("inspector");
  if (!UI.selectedId) {
    drawer.classList.remove("open");
    return;
  }
  const entry = findEntry(UI.selectedId);
  if (!entry) {
    drawer.classList.remove("open");
    return;
  }

  const node = entry.node;
  const isRoot = entry.depth === 0;
  const isPhase = entry.depth === 1;
  const isAction = entry.depth >= 2;
  const col = isRoot ? cssVar("--accent", "#35A7A0") : (entry.phaseColor || cssVar("--accent", "#35A7A0"));
  const lang = getLang();
  const hpd = SCHEDULE.calendar.hoursPerDay;

  $("inspStripe").style.background = col;
  $("inspKind").textContent = isRoot ? t("insp_root") : isPhase ? t("insp_phase") : `${entry.phaseLabel || t("insp_action")}`;
  $("inspTitle").textContent = node.label || "—";

  let html = "";

  // Title field
  html += `<div class="fld">
    <label for="fLabel">${esc(t("insp_title"))}</label>
    <input id="fLabel" type="text" value="${esc(node.label || "")}" />
  </div>`;

  if (isPhase) {
    // Phase Color Swatches
    html += `<div class="fld">
      <label>${esc(t("insp_color"))}</label>
      <div class="color-row">
        ${PALETTE.map(
          (c) => `<button type="button" class="color-swatch${(node.color || "").toLowerCase() === c.toLowerCase() ? " on" : ""}" data-pcolor="${c}" style="background:${c}" aria-label="${c}"></button>`
        ).join("")}
      </div>
    </div>`;

    // Side & Auto-sequence
    html += `<div class="fld">
      <label>${esc(t("insp_side"))}</label>
      <div class="chip-row">
        <button type="button" class="chip${node.side !== "L" ? " on" : ""}" data-pside="R">${esc(t("side_right"))}</button>
        <button type="button" class="chip${node.side === "L" ? " on" : ""}" data-pside="L">${esc(t("side_left"))}</button>
      </div>
    </div>`;

    html += `<label class="pop-check" style="padding:4px 0">
      <input type="checkbox" id="fAutoSeq"${node.autoSequence ? " checked" : ""} />
      <span>${esc(t("insp_auto_seq"))}</span>
    </label>
    <div class="fld-hint">${esc(t("insp_auto_seq_hint"))}</div>`;
  }

  if (isAction) {
    const sched = SCHEDULE.items.get(node.id);
    const durVal = formatDuration(Number(node.estHours ?? 4), hpd, lang);

    // Duration & Manual Offset
    html += `<div class="fld-row">
      <div class="fld">
        <label for="fDur">${esc(t("insp_duration"))}</label>
        <input id="fDur" type="text" value="${esc(durVal)}" placeholder="2h, 1.5d" />
      </div>
      <div class="fld">
        <label for="fOwner">${esc(t("insp_owner"))}</label>
        <input id="fOwner" type="text" value="${esc(node.owner || "")}" placeholder="${esc(t("insp_owner_placeholder"))}" />
      </div>
    </div>
    <div class="fld-hint">${esc(t("insp_duration_hint"))}</div>`;

    // Status Chips
    html += `<div class="fld">
      <label>${esc(t("insp_status"))}</label>
      <div class="chip-row">
        ${STAT_ORDER.map(
          (st) => `<button type="button" class="chip${(node.stat || "todo") === st ? " on" : ""}" data-setstat="${st}">
            <span class="chip-dot" style="background:${statColor(st)}"></span>${esc(t("stat_" + st))}
          </button>`
        ).join("")}
      </div>
    </div>`;

    // Priority Chips
    html += `<div class="fld">
      <label>${esc(t("insp_priority"))}</label>
      <div class="chip-row">
        ${PRIO_ORDER.map(
          (pr) => `<button type="button" class="chip${(node.prio || "") === pr ? " on" : ""}" data-setprio="${pr}">${pr || "—"}</button>`
        ).join("")}
      </div>
    </div>`;

    // Computed CPM Schedule Card
    if (sched) {
      html += `<div class="insp-sec"><span>${esc(t("insp_schedule"))}</span><i></i></div>
      <div class="sched-card">
        <div class="sched-cell"><span>${esc(t("insp_es"))}</span><strong>${esc(formatShortDate(sched.startDate, lang))} (${sched.es}h)</strong></div>
        <div class="sched-cell"><span>${esc(t("insp_ef"))}</span><strong>${esc(formatShortDate(sched.endDate, lang))} (${sched.ef}h)</strong></div>
        <div class="sched-cell"><span>${esc(t("insp_slack"))}</span><strong>${esc(formatDuration(sched.slack, hpd, lang))}</strong></div>
        <div class="sched-cell"><span>${esc(t("insp_start_offset"))}</span><strong>${node.startOffset ? `+${node.startOffset}h` : t("insp_start_offset_reset")} ${node.startOffset ? `<button type="button" id="btnResetOffset" style="border:0;background:none;color:var(--accent);cursor:pointer;font-size:10px;padding:0 4px">↺</button>` : ""}</strong></div>
        <div class="sched-badge ${sched.isCritical ? "crit" : "float"}">
          ${sched.isCritical ? "⚡ " + esc(t("insp_critical_yes")) : "✓ " + esc(t("insp_critical_no"))}
        </div>
      </div>`;
    }

    // Dependencies Section
    const explicitDeps = (node.deps || []).map((d) =>
      typeof d === "string" ? { id: d, type: "FS", lag: 0 } : { id: d.id, type: d.type || "FS", lag: Number(d.lag) || 0 }
    );
    const existingIds = new Set(explicitDeps.map((d) => d.id));
    const candidates = SCHEDULE.orderedItems.filter((it) => it.id !== node.id && !existingIds.has(it.id));

    html += `<div class="insp-sec"><span>${esc(t("insp_deps"))}</span><i></i></div>`;
    if (explicitDeps.length === 0) {
      html += `<div class="fld-hint">${esc(t("insp_deps_empty"))}</div>`;
    } else {
      html += `<div class="dep-list">`;
      for (const d of explicitDeps) {
        const predNode = findNode(d.id);
        if (!predNode) continue;
        html += `<div class="dep-item" data-dep-id="${esc(d.id)}">
          <span class="dep-item-name" title="${esc(predNode.label)}">${esc(predNode.label)}</span>
          <select class="dep-type-sel" aria-label="Dependency type">
            <option value="FS"${d.type === "FS" ? " selected" : ""}>FS</option>
            <option value="SS"${d.type === "SS" ? " selected" : ""}>SS</option>
            <option value="FF"${d.type === "FF" ? " selected" : ""}>FF</option>
          </select>
          <input class="dep-lag-inp" type="number" step="1" min="0" value="${d.lag}" title="${esc(t("insp_dep_lag"))} (h)" />
          <button type="button" class="dep-rm" data-rmdep="${esc(d.id)}" aria-label="Remove">×</button>
        </div>`;
      }
      html += `</div>`;
    }

    if (candidates.length > 0) {
      html += `<div class="fld">
        <select id="fAddDep">
          <option value="">+ ${esc(t("insp_deps_add"))}</option>
          ${candidates.map((c) => `<option value="${esc(c.id)}">${esc(c.entry.phaseLabel ? `[${c.entry.phaseLabel}] ` : "")}${esc(c.label)}</option>`).join("")}
        </select>
      </div>`;
    }

    // Host Task Read-Only Link
    if (HOST_TASKS.size > 0) {
      html += `<div class="insp-sec"><span>${esc(t("insp_host_task"))}</span><i></i></div>
      <div class="fld">
        <select id="fHostTask">
          <option value="">${esc(t("insp_host_task_none"))}</option>
          ${[...HOST_TASKS.values()]
            .slice(0, 120)
            .map((ht) => `<option value="${esc(ht.id)}"${node.hostTaskId === ht.id ? " selected" : ""}>${esc(ht.titre)}</option>`)
            .join("")}
        </select>
        ${node.hostTaskId ? `<button type="button" class="btn" id="btnRevealHostTask" style="margin-top:6px">${esc(t("insp_host_task_open"))} ↗</button>` : ""}
      </div>`;
    }
  }

  // Notes
  html += `<div class="fld">
    <label for="fNote">${esc(t("insp_notes"))}</label>
    <textarea id="fNote" placeholder="${esc(t("insp_notes_placeholder"))}">${esc(node.note || "")}</textarea>
  </div>`;

  // Quick Actions Footer
  html += `<div class="insp-sec"><span>${esc(t("insp_actions_bar"))}</span><i></i></div>
  <div class="insp-actions">
    <button type="button" class="btn" id="iaAddChild">+ ${esc(isRoot ? t("btn_add_phase") : t("act_add_child"))}</button>
    ${isAction ? `<button type="button" class="btn" id="iaAddSeq">→ ${esc(t("act_add_next"))}</button>` : ""}
    ${!isRoot ? `<button type="button" class="btn" id="iaDup">${esc(t("act_duplicate"))}</button>` : ""}
    ${!isRoot ? `<button type="button" class="btn btn-danger" id="iaDel">${esc(t("act_delete"))}</button>` : ""}
  </div>`;

  const body = $("inspBody");
  body.innerHTML = html;

  // Bind Inspector Inputs
  $("fLabel")?.addEventListener("input", (e) => {
    node.label = e.target.value;
    $("inspTitle").textContent = node.label || "—";
    commitChange("label:" + node.id);
    recomputeAndRenderViews();
  });

  $("fDur")?.addEventListener("change", (e) => {
    const parsed = parseDurationHours(e.target.value, hpd);
    if (parsed !== null) {
      node.estHours = parsed;
      e.target.value = formatDuration(parsed, hpd, lang);
      commitChange();
      renderAll();
    } else {
      e.target.value = formatDuration(Number(node.estHours ?? 4), hpd, lang);
    }
  });

  $("fOwner")?.addEventListener("input", (e) => {
    node.owner = e.target.value;
    commitChange("owner:" + node.id);
    recomputeAndRenderViews();
  });

  $("fNote")?.addEventListener("input", (e) => {
    node.note = e.target.value;
    commitChange("note:" + node.id);
  });

  $("fAutoSeq")?.addEventListener("change", (e) => {
    node.autoSequence = e.target.checked;
    commitChange();
    renderAll();
  });

  $("btnResetOffset")?.addEventListener("click", () => {
    delete node.startOffset;
    commitChange();
    renderAll();
  });

  body.querySelectorAll("[data-pcolor]").forEach((b) =>
    b.addEventListener("click", () => {
      node.color = b.dataset.pcolor;
      commitChange();
      renderAll();
    })
  );

  body.querySelectorAll("[data-pside]").forEach((b) =>
    b.addEventListener("click", () => {
      node.side = b.dataset.pside;
      commitChange();
      renderAll();
    })
  );

  body.querySelectorAll("[data-setstat]").forEach((b) =>
    b.addEventListener("click", () => {
      node.stat = b.dataset.setstat;
      commitChange();
      renderAll();
    })
  );

  body.querySelectorAll("[data-setprio]").forEach((b) =>
    b.addEventListener("click", () => {
      node.prio = b.dataset.setprio || undefined;
      commitChange();
      renderAll();
    })
  );

  $("fAddDep")?.addEventListener("change", (e) => {
    if (e.target.value) {
      addDependency(e.target.value, node.id);
      e.target.value = "";
    }
  });

  body.querySelectorAll(".dep-item").forEach((row) => {
    const depId = row.dataset.depId;
    row.querySelector(".dep-type-sel")?.addEventListener("change", (e) => {
      const target = (node.deps || []).find((d) => (typeof d === "string" ? d : d.id) === depId);
      if (target && typeof target === "object") {
        target.type = e.target.value;
        commitChange();
        renderAll();
      }
    });
    row.querySelector(".dep-lag-inp")?.addEventListener("change", (e) => {
      const target = (node.deps || []).find((d) => (typeof d === "string" ? d : d.id) === depId);
      if (target && typeof target === "object") {
        target.lag = Math.max(0, Number(e.target.value) || 0);
        commitChange();
        renderAll();
      }
    });
    row.querySelector("[data-rmdep]")?.addEventListener("click", () => removeDependency(node.id, depId));
  });

  $("fHostTask")?.addEventListener("change", (e) => {
    node.hostTaskId = e.target.value || undefined;
    commitChange();
    renderAll();
  });

  $("btnRevealHostTask")?.addEventListener("click", () => {
    if (node.hostTaskId) trk.revealTask(node.hostTaskId);
  });

  $("iaAddChild")?.addEventListener("click", () => addChildNode(node.id));
  $("iaAddSeq")?.addEventListener("click", () => addSiblingNode(node.id, true));
  $("iaDup")?.addEventListener("click", () => duplicateNode(node.id));
  $("iaDel")?.addEventListener("click", () => deleteNode(node.id));
}

/* ============================================================================
   Inline Canvas Title Editor
   ============================================================================ */
let editingNodeId = null;
function openInlineEditor(id) {
  if (UI.view === "gantt") return;
  const pos = LAYOUT?.positions.get(id);
  const node = findNode(id);
  if (!pos || !node) return;
  const inp = $("inlineEditor");
  editingNodeId = id;
  inp.value = node.label || "";
  inp.hidden = false;

  const left = UI.vx + pos.x * UI.k;
  const top = UI.vy + (pos.y - pos.h / 2) * UI.k;
  inp.style.left = `${Math.max(8, left)}px`;
  inp.style.top = `${Math.max(8, top)}px`;
  inp.style.width = `${Math.max(160, pos.w * UI.k)}px`;
  inp.focus();
  inp.select();
}

function closeInlineEditor(save = true) {
  const inp = $("inlineEditor");
  if (inp.hidden || !editingNodeId) return;
  const node = findNode(editingNodeId);
  const nextVal = inp.value.trim();
  inp.hidden = true;
  editingNodeId = null;
  if (save && node && nextVal && nextVal !== node.label) {
    node.label = nextVal;
    commitChange();
    renderAll();
  }
}

$("inlineEditor").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    closeInlineEditor(true);
  } else if (e.key === "Escape") {
    e.preventDefault();
    closeInlineEditor(false);
  }
});
$("inlineEditor").addEventListener("blur", () => closeInlineEditor(true));

/* ============================================================================
   Mindmap Pointer Interactions (Pan, Zoom, Drag Node, Drag-to-Connect Port)
   ============================================================================ */
let mapDrag = null;
let lastClick = { id: null, t: 0 };
let rafRenderId = null;
let rafRenderTask = null;

function scheduleFrameRender(fn) {
  rafRenderTask = fn;
  if (rafRenderId !== null) return;
  rafRenderId = requestAnimationFrame(() => {
    rafRenderId = null;
    const task = rafRenderTask;
    rafRenderTask = null;
    if (task) task();
  });
}

function cancelFrameRender() {
  if (rafRenderId !== null) {
    cancelAnimationFrame(rafRenderId);
    rafRenderId = null;
  }
  rafRenderTask = null;
}

function flushFrameRender() {
  if (rafRenderId !== null) {
    cancelAnimationFrame(rafRenderId);
    rafRenderId = null;
  }
  const task = rafRenderTask;
  rafRenderTask = null;
  if (task) task();
}

function collectDragElements(node) {
  const els = [];
  const scene = $("mapScene");
  const walkSub = (n) => {
    const pos = LAYOUT?.positions.get(n.id);
    const el = scene?.querySelector(`.mm-node[data-id="${n.id}"]`);
    if (pos && el) {
      els.push({ el, baseX: pos.x, baseTopY: pos.y - pos.h / 2 });
    }
    for (const c of n.children || []) walkSub(c);
  };
  if (node) walkSub(node);
  return els;
}

$("mapSvg").addEventListener("pointerdown", (e) => {
  if (e.button === 2) return; // Context menu handled separately
  if (wheelBase) {
    clearTimeout(wheelSettleTimer);
    wheelSettleTimer = null;
    cancelFrameRender();
    resetGpuLayer();
    applyMapTransform();
  }
  closeContextMenu();
  closePopovers();
  closeInlineEditor(true);

  const statEl = e.target.closest("[data-stat]");
  if (statEl) {
    e.stopPropagation();
    cycleStatus(statEl.dataset.stat);
    return;
  }

  const foldEl = e.target.closest("[data-fold]");
  if (foldEl) {
    e.stopPropagation();
    const id = foldEl.dataset.fold;
    if (UI.folded.has(id)) UI.folded.delete(id);
    else UI.folded.add(id);
    renderMindmap();
    scheduleSave();
    return;
  }

  const qAddEl = e.target.closest("[data-qadd]");
  if (qAddEl) {
    e.stopPropagation();
    addChildNode(qAddEl.dataset.qadd);
    return;
  }

  // Drag from → port to connect dependency, OR click → port to add next sequential action!
  const portEl = e.target.closest("[data-port]");
  if (portEl) {
    e.stopPropagation();
    const srcId = portEl.dataset.port;
    const rect = cachedPaneRect || refreshPaneRect();
    mapDrag = {
      kind: "wire",
      srcId,
      startX: e.clientX,
      startY: e.clientY,
      curX: (e.clientX - rect.left - UI.vx) / UI.k,
      curY: (e.clientY - rect.top - UI.vy) / UI.k,
      moved: false,
    };
    $("paneMap").classList.add("wiring");
    return;
  }

  // Click on existing dependency edge -> offer quick removal via context menu
  const depEl = e.target.closest("[data-dep]");
  if (depEl) {
    e.stopPropagation();
    const [dstId, srcId] = depEl.dataset.dep.split("|");
    openDepContextMenu(srcId, dstId, e.clientX, e.clientY);
    return;
  }

  // Click / Drag on a Node
  const nodeEl = e.target.closest(".mm-node");
  if (nodeEl) {
    const id = nodeEl.dataset.id;
    if (UI.wiringFrom) {
      addDependency(UI.wiringFrom, id);
      cancelWiring();
      return;
    }
    const entry = findEntry(id);
    mapDrag = {
      kind: "node",
      id,
      isRoot: entry?.depth === 0,
      startX: e.clientX,
      startY: e.clientY,
      origDx: Number(entry?.node.dx) || 0,
      origDy: Number(entry?.node.dy) || 0,
      dragEls: entry && entry.depth > 0 ? collectDragElements(entry.node) : [],
      moved: false,
    };
    return;
  }

  // Background Pan
  if (UI.wiringFrom) cancelWiring();
  mapDrag = {
    kind: "pan",
    startX: e.clientX,
    startY: e.clientY,
    origVx: UI.vx,
    origVy: UI.vy,
    curDx: 0,
    curDy: 0,
    moved: false,
  };
  $("paneMap").classList.add("panning");
});

window.addEventListener("pointermove", (e) => {
  if (!mapDrag) return;
  const dx = e.clientX - mapDrag.startX;
  const dy = e.clientY - mapDrag.startY;
  if (Math.hypot(dx, dy) > 6) mapDrag.moved = true;

  if (mapDrag.kind === "pan") {
    UI.vx = mapDrag.origVx + dx;
    UI.vy = mapDrag.origVy + dy;
    mapDrag.curDx = dx;
    mapDrag.curDy = dy;
    scheduleFrameRender(() => {
      if (!mapDrag || mapDrag.kind !== "pan") return;
      const svg = $("mapSvg");
      svg.style.transformOrigin = "0 0";
      svg.style.transform = `translate3d(${mapDrag.curDx.toFixed(1)}px,${mapDrag.curDy.toFixed(1)}px,0)`;
    });
  } else if (mapDrag.kind === "node" && mapDrag.moved && !mapDrag.isRoot) {
    const node = findNode(mapDrag.id);
    if (node) {
      const stepX = Math.round(dx / UI.k);
      const stepY = Math.round(dy / UI.k);
      node.dx = mapDrag.origDx + stepX;
      node.dy = mapDrag.origDy + stepY;
      scheduleFrameRender(() => {
        for (const item of mapDrag?.dragEls || []) {
          item.el.setAttribute(
            "transform",
            `translate(${(item.baseX + stepX).toFixed(1)},${(item.baseTopY + stepY).toFixed(1)})`
          );
        }
      });
    }
  } else if (mapDrag.kind === "wire" && mapDrag.moved) {
    const rect = cachedPaneRect || refreshPaneRect();
    const sx = (e.clientX - rect.left - UI.vx) / UI.k;
    const sy = (e.clientY - rect.top - UI.vy) / UI.k;
    const srcPos = LAYOUT?.positions.get(mapDrag.srcId);
    if (srcPos) {
      const x1 = srcPos.dir > 0 ? srcPos.x + srcPos.w : srcPos.x;
      const y1 = srcPos.y;
      scheduleFrameRender(() => {
        const ghost = $("wireGhost");
        if (!ghost) return;
        const d = branchCurvePath(x1, y1, sx, sy);
        ghost.innerHTML = `<path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-dasharray="6 4" marker-end="url(#mm-ar-acc)" pointer-events="none" />`;
      });
    }
  }
});

window.addEventListener("pointerup", (e) => {
  if (!mapDrag) return;
  const d = mapDrag;
  mapDrag = null;
  cancelFrameRender();
  $("paneMap").classList.remove("panning", "wiring");
  const ghost = $("wireGhost");
  if (ghost) ghost.innerHTML = "";

  if (d.kind === "pan") {
    resetGpuLayer();
    if (d.moved) {
      applyMapTransform();
    } else {
      selectNode(null);
    }
  } else if (d.kind === "node") {
    if (d.moved && !d.isRoot) {
      renderMindmap();
      commitChange();
    } else if (!d.moved) {
      const now = Date.now();
      if (lastClick.id === d.id && now - lastClick.t < 320) {
        selectNode(d.id, true);
        openInlineEditor(d.id);
        lastClick = { id: null, t: 0 };
      } else {
        selectNode(d.id, true);
        lastClick = { id: d.id, t: now };
      }
    }
  } else if (d.kind === "wire") {
    if (!d.moved) {
      // Quick click on → handle: create next action in sequence!
      addSiblingNode(d.srcId, true);
    } else {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const targetNode = el?.closest?.(".mm-node");
      if (targetNode && targetNode.dataset.id !== d.srcId) {
        addDependency(d.srcId, targetNode.dataset.id);
      }
    }
  }
});

let cachedPaneRect = null;
const refreshPaneRect = () => {
  cachedPaneRect = $("paneMap").getBoundingClientRect();
  return cachedPaneRect;
};
$("paneMap").addEventListener("pointerenter", refreshPaneRect);
window.addEventListener("resize", () => {
  cachedPaneRect = null;
});

$("paneMap").addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const rect = cachedPaneRect || refreshPaneRect();
    const clampedDelta = Math.max(-80, Math.min(80, e.deltaY));
    const factor = Math.exp(-clampedDelta * 0.0025);
    zoomMap(factor, e.clientX - rect.left, e.clientY - rect.top);
  },
  { passive: false }
);

function startWiring(srcId) {
  UI.wiringFrom = srcId;
  $("paneMap").classList.add("wiring");
  showPill(t("pill_wiring"));
}

function cancelWiring() {
  UI.wiringFrom = null;
  $("paneMap").classList.remove("wiring");
}

/* ============================================================================
   Context Menu
   ============================================================================ */
let ctxItems = [];

function closeContextMenu() {
  $("ctx").classList.remove("open");
  ctxItems = [];
}

function showContextMenu(x, y, headKind, headName, accentColor, items) {
  ctxItems = [];
  const el = $("ctx");
  el.style.borderLeftColor = accentColor || cssVar("--accent", "#35A7A0");
  let html = "";
  if (headKind || headName) {
    html += `<div class="ctx-head">
      ${headKind ? `<div class="ctx-kind">${esc(headKind)}</div>` : ""}
      ${headName ? `<div class="ctx-name">${esc(headName)}</div>` : ""}
    </div>`;
  }
  for (const it of items) {
    if (it === null) {
      html += `<div class="ctx-sep"></div>`;
      continue;
    }
    const idx = ctxItems.length;
    ctxItems.push(it);
    html += `<button type="button" class="ctx-item${it.danger ? " danger" : ""}" data-ci="${idx}"${it.disabled ? " disabled" : ""}>
      <span>${esc(it.label)}</span>
      ${it.key ? `<span class="ctx-key">${esc(it.key)}</span>` : ""}
    </button>`;
  }
  el.innerHTML = html;
  el.classList.add("open");
  const r = el.getBoundingClientRect();
  el.style.left = `${Math.max(8, Math.min(x, window.innerWidth - r.width - 8))}px`;
  el.style.top = `${Math.max(8, Math.min(y, window.innerHeight - r.height - 8))}px`;
}

$("ctx").addEventListener("click", (e) => {
  const b = e.target.closest("[data-ci]");
  if (!b || b.disabled) return;
  const it = ctxItems[Number(b.dataset.ci)];
  closeContextMenu();
  it?.run?.();
});

function openDepContextMenu(srcId, dstId, x, y) {
  const src = findNode(srcId);
  const dst = findNode(dstId);
  if (!src || !dst) return;
  showContextMenu(x, y, t("btn_deps"), `${src.label} → ${dst.label}`, cssVar("--accent", "#35A7A0"), [
    {
      label: t("act_delete"),
      danger: true,
      run: () => removeDependency(dstId, srcId),
    },
  ]);
}

$("mapSvg").addEventListener("contextmenu", (e) => {
  e.preventDefault();
  const nodeEl = e.target.closest(".mm-node");
  if (nodeEl) {
    const id = nodeEl.dataset.id;
    const entry = findEntry(id);
    if (!entry) return;
    const isRoot = entry.depth === 0;
    const isAction = entry.depth >= 2;
    const hasKids = (entry.node.children || []).length > 0;
    const folded = UI.folded.has(id);
    const col = isRoot ? cssVar("--accent", "#35A7A0") : entry.phaseColor;

    const items = [
      { label: isRoot ? t("act_new_phase") : t("act_add_child"), key: "Tab", run: () => addChildNode(id) },
    ];
    if (isAction) {
      items.push({ label: t("act_add_next"), key: "Shift+Enter", run: () => addSiblingNode(id, true) });
      items.push({ label: t("act_connect"), run: () => startWiring(id) });
    }
    if (!isRoot) {
      items.push({ label: t("act_duplicate"), key: "Ctrl+D", run: () => duplicateNode(id) });
    }
    items.push(null);
    items.push({ label: t("act_rename"), key: "F2", run: () => openInlineEditor(id) });
    if (hasKids) {
      items.push({
        label: folded ? t("act_unfold") : t("act_fold"),
        run: () => {
          if (folded) UI.folded.delete(id);
          else UI.folded.add(id);
          renderMindmap();
          scheduleSave();
        },
      });
    }
    if (!isRoot) {
      const parent = findParentNode(id);
      const idx = parent ? parent.children.indexOf(entry.node) : 0;
      items.push({ label: t("act_move_up"), disabled: idx <= 0, run: () => moveSibling(id, -1) });
      items.push({ label: t("act_move_down"), disabled: !parent || idx >= parent.children.length - 1, run: () => moveSibling(id, 1) });
      items.push(null);
      items.push({ label: t("act_delete"), key: "Del", danger: true, run: () => deleteNode(id) });
    }
    showContextMenu(e.clientX, e.clientY, isRoot ? t("insp_root") : entry.depth === 1 ? t("insp_phase") : t("insp_action"), entry.node.label, col, items);
    return;
  }

  // Canvas context menu
  showContextMenu(e.clientX, e.clientY, null, null, null, [
    { label: t("act_new_phase"), run: () => addChildNode(PLAN.id) },
    { label: t("btn_fit"), key: "0", run: fitMap },
    {
      label: t("act_auto_layout"),
      run: () => {
        for (const en of FLAT.nodes) {
          delete en.node.dx;
          delete en.node.dy;
        }
        commitChange();
        fitMap();
      },
    },
    null,
    { label: t("btn_undo"), key: "Ctrl+Z", disabled: !HISTORY.past.length, run: undo },
    { label: t("btn_redo"), key: "Ctrl+Shift+Z", disabled: !HISTORY.future.length, run: redo },
  ]);
});

/* ============================================================================
   View Switching & Split Divider
   ============================================================================ */
function setView(view) {
  UI.view = view;
  cachedPaneRect = null;
  const ws = $("workspace");
  ws.classList.remove("mode-map", "mode-split", "mode-gantt");
  ws.classList.add(`mode-${view}`);
  document.querySelectorAll("[data-view]").forEach((b) => {
    const on = b.dataset.view === view;
    b.classList.toggle("on", on);
    b.setAttribute("aria-selected", String(on));
  });
  renderMindmap();
  renderGantt();
  if (view !== "gantt") setTimeout(fitMap, 20);
  scheduleSave();
}

let splitDrag = null;
$("splitter").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  splitDrag = true;
  $("splitter").classList.add("dragging");
  document.body.style.cursor = "col-resize";
});

window.addEventListener("pointermove", (e) => {
  if (!splitDrag) return;
  const wsRect = $("workspace").getBoundingClientRect();
  const pct = Math.max(25, Math.min(75, ((e.clientX - wsRect.left) / wsRect.width) * 100));
  $("paneMap").style.flex = `0 0 ${pct}%`;
  scheduleFrameRender(renderGantt);
});

window.addEventListener("pointerup", () => {
  if (!splitDrag) return;
  flushFrameRender();
  cachedPaneRect = null;
  splitDrag = false;
  $("splitter").classList.remove("dragging");
  document.body.style.cursor = "";
});

/* ============================================================================
   Exports & Imports (SVG, PNG, Mermaid, JSON)
   ============================================================================ */
function exportGanttSvg() {
  if (UI.view === "map") setView("gantt");
  setTimeout(() => {
    const res = gantt.exportStandaloneSvg();
    if (!res) return;
    trk.saveFile({
      name: `${(PLAN.label || "action-plan").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-gantt.svg`,
      mime: "image/svg+xml",
      text: res.svg,
    });
  }, 40);
}

function exportGanttPng() {
  if (UI.view === "map") setView("gantt");
  setTimeout(() => {
    const res = gantt.exportStandaloneSvg();
    if (!res) return;
    const img = new Image();
    const blob = new Blob([res.svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = res.width * scale;
      canvas.height = res.height * scale;
      const ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL("image/png");
      const base64 = dataUrl.split(",")[1];
      trk.saveFile({
        name: `${(PLAN.label || "action-plan").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-gantt.png`,
        mime: "image/png",
        base64,
      });
    };
    img.src = url;
  }, 40);
}

function copyMermaid() {
  const code = toMermaidGantt(PLAN, SCHEDULE);
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(code).then(() => showPill(t("pill_mermaid_copied")));
  } else {
    trk.saveFile({ name: "action-plan-gantt.mmd", mime: "text/plain", text: code });
  }
}

function exportJson() {
  trk.saveFile({
    name: `${(PLAN.label || "action-plan").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`,
    mime: "application/json",
    text: JSON.stringify(PLAN, null, 2),
  });
}

/* ============================================================================
   UI Controls, Popovers, Status Pill & Keyboard Shortcuts
   ============================================================================ */
let pillTimer = null;
function showPill(text, btnLabel = null, btnAction = null) {
  const pill = $("pill");
  $("pillText").textContent = text;
  const btn = $("pillBtn");
  if (btnLabel && btnAction) {
    btn.textContent = btnLabel;
    btn.hidden = false;
    btn.onclick = () => {
      pill.classList.remove("show");
      btnAction();
    };
  } else {
    btn.hidden = true;
  }
  pill.classList.add("show");
  clearTimeout(pillTimer);
  pillTimer = setTimeout(() => pill.classList.remove("show"), btnLabel ? 4200 : 2600);
}

function closePopovers() {
  document.querySelectorAll(".pop.open").forEach((p) => p.classList.remove("open"));
  $("btnCal").setAttribute("aria-expanded", "false");
  $("btnExport").setAttribute("aria-expanded", "false");
}

function togglePopover(btnId, popId) {
  const pop = $(popId);
  const wasOpen = pop.classList.contains("open");
  closePopovers();
  if (!wasOpen) {
    pop.classList.add("open");
    $(btnId).setAttribute("aria-expanded", "true");
  }
}

function syncCalendarInputs() {
  $("calStartDate").value = PLAN.startDate || toIsoDate(new Date());
  $("calHoursDay").value = String(PLAN.hoursPerDay || 8);
  $("calSkipWeekends").checked = PLAN.skipWeekends !== false;
  $("calLayoutDir").value = PLAN.layoutMode || "balanced";
}

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  $("qSearch").placeholder = t("search_placeholder");
  renderShortcutsModal();
}

function renderShortcutsModal() {
  const rows = [
    [t("sc_child"), ["Tab"]],
    [t("sc_sibling"), ["Enter"]],
    [t("sc_sequence"), ["Shift", "Enter"]],
    [t("sc_rename"), ["F2 / DblClick"]],
    [t("sc_delete"), ["Delete"]],
    [t("sc_undo"), ["Ctrl+Z / Ctrl+Shift+Z"]],
    [t("sc_views"), ["1", "2", "3"]],
    [t("sc_critical"), ["C"]],
    [t("sc_fit"), ["0"]],
    [t("sc_connect"), ["→ Drag"]],
  ];
  $("shortcutsList").innerHTML = rows
    .map(
      ([label, keys]) => `<div class="sc-row">
        <span>${esc(label)}</span>
        <span class="sc-keys">${keys.map((k) => `<span class="ctx-key">${esc(k)}</span>`).join("")}</span>
      </div>`
    )
    .join("");
}

// Toolbar Event Listeners
document.querySelectorAll("[data-view]").forEach((b) =>
  b.addEventListener("click", () => setView(b.dataset.view))
);

$("btnAddQuick").addEventListener("click", () => addChildNode(UI.selectedId || PLAN.id));
$("btnAddSeq").addEventListener("click", () => {
  if (UI.selectedId) addSiblingNode(UI.selectedId, true);
});

$("btnCritical").addEventListener("click", () => {
  UI.showCritical = !UI.showCritical;
  $("btnCritical").classList.toggle("on", UI.showCritical);
  $("btnCritical").setAttribute("aria-pressed", String(UI.showCritical));
  renderMindmap();
  renderGantt();
  scheduleSave();
});

$("btnDeps").addEventListener("click", () => {
  UI.showDeps = !UI.showDeps;
  $("btnDeps").classList.toggle("on", UI.showDeps);
  $("btnDeps").setAttribute("aria-pressed", String(UI.showDeps));
  renderMindmap();
  renderGantt();
  scheduleSave();
});

$("qSearch").addEventListener("input", (e) => {
  UI.search = e.target.value;
  updateSearchHits();
  renderMindmap();
  renderGantt();
});

$("btnUndo").addEventListener("click", undo);
$("btnRedo").addEventListener("click", redo);
$("btnFit").addEventListener("click", fitMap);
$("zIn").addEventListener("click", () => zoomMap(1.18));
$("zOut").addEventListener("click", () => zoomMap(0.84));
$("zFit").addEventListener("click", fitMap);
$("inspClose").addEventListener("click", () => selectNode(null));

$("btnCal").addEventListener("click", (e) => {
  e.stopPropagation();
  syncCalendarInputs();
  togglePopover("btnCal", "popCal");
});
$("btnExport").addEventListener("click", (e) => {
  e.stopPropagation();
  togglePopover("btnExport", "popExport");
});

$("calStartDate").addEventListener("change", (e) => {
  PLAN.startDate = e.target.value;
  commitChange();
  renderAll();
});
$("calHoursDay").addEventListener("change", (e) => {
  PLAN.hoursPerDay = Math.max(1, Math.min(24, Number(e.target.value) || 8));
  commitChange();
  renderAll();
});
$("calSkipWeekends").addEventListener("change", (e) => {
  PLAN.skipWeekends = e.target.checked;
  commitChange();
  renderAll();
});
$("calLayoutDir").addEventListener("change", (e) => {
  PLAN.layoutMode = e.target.value;
  commitChange();
  fitMap();
});

$("actExpGanttSvg").addEventListener("click", () => { closePopovers(); exportGanttSvg(); });
$("actExpGanttPng").addEventListener("click", () => { closePopovers(); exportGanttPng(); });
$("actExpMermaid").addEventListener("click", () => { closePopovers(); copyMermaid(); });
$("actExpJson").addEventListener("click", () => { closePopovers(); exportJson(); });
$("actImpJson").addEventListener("click", () => { closePopovers(); $("fileImport").click(); });
$("actLoadSample").addEventListener("click", () => {
  closePopovers();
  PLAN = createSamplePlan();
  UI.selectedId = null;
  resetHistory();
  scheduleSave();
  renderAll();
  fitMap();
});
$("actBlankPlan").addEventListener("click", () => {
  closePopovers();
  PLAN = createBlankPlan();
  UI.selectedId = null;
  resetHistory();
  scheduleSave();
  renderAll();
  fitMap();
});

$("fileImport").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!parsed || typeof parsed !== "object" || !parsed.id) throw new Error("bad");
      PLAN = parsed;
      UI.selectedId = null;
      resetHistory();
      scheduleSave();
      renderAll();
      fitMap();
      showPill(t("pill_imported"));
    } catch {
      showPill(t("pill_import_err"));
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

$("btnHelp").addEventListener("click", () => { $("helpModal").hidden = false; });
$("helpClose").addEventListener("click", () => { $("helpModal").hidden = true; });
$("helpModal").addEventListener("click", (e) => {
  if (e.target === $("helpModal")) $("helpModal").hidden = true;
});

$("btnFull").addEventListener("click", () => {
  UI.fullscreen = !UI.fullscreen;
  trk.requestFullscreen(UI.fullscreen);
});

window.addEventListener("pointerdown", (e) => {
  if (!e.target.closest(".pop-host")) closePopovers();
  if (!e.target.closest("#ctx")) closeContextMenu();
});

window.addEventListener("resize", () => {
  renderGantt();
});

// Global Keyboard Shortcuts
window.addEventListener("keydown", (e) => {
  const tag = document.activeElement?.tagName;
  const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

  if (e.key === "Escape") {
    if (UI.wiringFrom) { cancelWiring(); return; }
    if (!$("helpModal").hidden) { $("helpModal").hidden = true; return; }
    closeContextMenu();
    closePopovers();
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    if (inInput) return;
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
    return;
  }

  if (inInput) return;

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d" && UI.selectedId) {
    e.preventDefault();
    duplicateNode(UI.selectedId);
  } else if (e.key === "Tab" && UI.selectedId) {
    e.preventDefault();
    addChildNode(UI.selectedId);
  } else if (e.key === "Enter" && UI.selectedId) {
    e.preventDefault();
    addSiblingNode(UI.selectedId, e.shiftKey);
  } else if (e.key === "F2" && UI.selectedId) {
    e.preventDefault();
    openInlineEditor(UI.selectedId);
  } else if ((e.key === "Delete" || e.key === "Backspace") && UI.selectedId) {
    e.preventDefault();
    deleteNode(UI.selectedId);
  } else if (e.key === "1") {
    setView("map");
  } else if (e.key === "2") {
    setView("split");
  } else if (e.key === "3") {
    setView("gantt");
  } else if (e.key === "0") {
    fitMap();
  } else if (e.key.toLowerCase() === "c") {
    $("btnCritical").click();
  } else if (e.key === "?") {
    $("helpModal").hidden = !$("helpModal").hidden;
  }
});

/* ============================================================================
   Host SDK Lifecycle Integration
   ============================================================================ */
let activeDocId = null;

function loadDoc(doc, force = false) {
  const nextId = doc?.id ?? null;
  // Ignore host:doc echoes triggered by our own trk.save() on the same document
  if (!force && nextId && nextId === activeDocId) return;
  activeDocId = nextId;

  const saved = doc?.data;
  if (saved && saved.plan && saved.plan.id) {
    PLAN = JSON.parse(JSON.stringify(saved.plan));
    if (saved.ui) {
      UI.showCritical = saved.ui.showCritical !== false;
      UI.showDeps = saved.ui.showDeps !== false;
      UI.folded = new Set(Array.isArray(saved.ui.folded) ? saved.ui.folded : []);
      if (saved.ui.view) UI.view = saved.ui.view;
    }
  } else {
    PLAN = createSamplePlan();
  }
  $("btnCritical").classList.toggle("on", UI.showCritical);
  $("btnDeps").classList.toggle("on", UI.showDeps);
  UI.selectedId = null;
  resetHistory();
  setView(UI.view);
  renderAll();
  setTimeout(fitMap, 40);
}

function loadSnapshot(snap) {
  HOST_TASKS.clear();
  for (const tk of snap?.tasks || []) {
    HOST_TASKS.set(tk.id, tk);
  }
  renderMindmap();
  if (UI.selectedId) renderInspector();
}

function applyThemeState(theme) {
  IS_DARK = theme ? theme.dark !== false : true;
  renderMindmap();
  renderGantt();
}

// Initial standalone render (before host:init)
applyI18n();
resetHistory();
renderAll();
setTimeout(fitMap, 40);

// Connect to Host SDK
trk.ready().then((init) => {
  if (init?.lang) {
    setLang(init.lang);
    applyI18n();
  }
  if (init?.theme) applyThemeState(init.theme);
  if (init?.snapshot) loadSnapshot(init.snapshot);
  if (init?.doc) loadDoc(init.doc, true);
});

trk.on("doc", (doc) => loadDoc(doc));
trk.on("snapshot", (snap) => loadSnapshot(snap));
trk.on("theme", (theme) => applyThemeState(theme));
trk.on("lang", ({ lang }) => {
  setLang(lang);
  applyI18n();
  renderAll();
});
trk.on("fullscreen", (on) => {
  UI.fullscreen = !!on;
});
