// Pure CPM (Critical Path Method) scheduling engine, duration parser/formatter,
// work-calendar date projection, cycle detection, and Mermaid Gantt generator.
// Zero DOM dependencies — 100% unit-testable in Node / Vitest.

/**
 * Parse a human duration string into hours.
 * Supports: "30m", "1.5h", "2d", "1w", "2d 4h", or plain numbers (treated as hours).
 * @param {string|number} input
 * @param {number} [hoursPerDay=8]
 * @returns {number|null} hours (>= 0), or null if unparseable
 */
export function parseDurationHours(input, hoursPerDay = 8) {
  if (typeof input === "number" && Number.isFinite(input) && input >= 0) {
    return Math.round(input * 100) / 100;
  }
  const raw = String(input ?? "").trim().toLowerCase().replace(/,/g, ".");
  if (!raw) return null;

  // Plain numeric value -> hours
  if (/^\d+(\.\d+)?$/.test(raw)) {
    return Math.round(parseFloat(raw) * 100) / 100;
  }

  const hpd = Math.max(1, Number(hoursPerDay) || 8);
  const tokenRe = /(\d+(?:\.\d+)?)\s*(w|sem|s|d|j|h|hr|hrs|m|min)\b/g;
  let total = 0;
  let matched = false;
  let match;
  while ((match = tokenRe.exec(raw)) !== null) {
    matched = true;
    const val = parseFloat(match[1]);
    const unit = match[2];
    if (unit === "w" || unit === "sem" || unit === "s") total += val * hpd * 5;
    else if (unit === "d" || unit === "j") total += val * hpd;
    else if (unit === "h" || unit === "hr" || unit === "hrs") total += val;
    else if (unit === "m" || unit === "min") total += val / 60;
  }
  if (!matched) return null;
  return Math.round(total * 100) / 100;
}

/**
 * Format a duration in hours into a crisp, human-readable compact label.
 * @param {number} hours
 * @param {number} [hoursPerDay=8]
 * @param {string} [lang="en"]
 * @returns {string}
 */
export function formatDuration(hours, hoursPerDay = 8, lang = "en") {
  const h = Math.max(0, Number(hours) || 0);
  const hpd = Math.max(1, Number(hoursPerDay) || 8);
  const dUnit = lang === "fr" ? "j" : "d";
  const mUnit = lang === "fr" ? "min" : "m";

  if (h === 0) return `0h`;
  if (h < 1) {
    const mins = Math.round(h * 60);
    return `${mins}${mUnit}`;
  }
  if (h < hpd) {
    const rounded = Math.round(h * 10) / 10;
    return `${rounded}h`;
  }
  const days = h / hpd;
  const wholeDays = Math.floor(days);
  const remHours = Math.round((h - wholeDays * hpd) * 10) / 10;
  if (remHours <= 0.05) {
    return `${wholeDays}${dUnit}`;
  }
  if (Math.abs(days - Math.round(days * 2) / 2) < 0.05) {
    return `${Math.round(days * 2) / 2}${dUnit}`;
  }
  return `${wholeDays}${dUnit} ${remHours}h`;
}

/**
 * Parse an ISO date string "YYYY-MM-DD" as local midnight Date.
 * @param {string} iso
 * @returns {Date}
 */
export function parseIsoDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0);
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 9, 0, 0, 0);
}

/**
 * Format a Date to "YYYY-MM-DD".
 */
export function toIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Format a Date to a short readable label ("Nov 24" / "24 nov.").
 */
export function formatShortDate(date, lang = "en") {
  try {
    return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-US", {
      day: "numeric",
      month: "short",
    }).format(date);
  } catch {
    return toIsoDate(date);
  }
}

/**
 * Advance a start Date by `workHours` taking into account `hoursPerDay` and `skipWeekends`.
 * Returns a Date representing the calendar timestamp of that work-hour offset.
 * @param {string|Date} startDate
 * @param {number} workHours
 * @param {{ hoursPerDay?: number, skipWeekends?: boolean }} [cal]
 * @returns {Date}
 */
export function addWorkHours(startDate, workHours, cal = {}) {
  const hpd = Math.max(1, Number(cal.hoursPerDay) || 8);
  const skipWeekends = cal.skipWeekends !== false;
  const base = startDate instanceof Date ? new Date(startDate.getTime()) : parseIsoDate(startDate);
  base.setHours(9, 0, 0, 0);

  // If starting on a weekend and skipWeekends is enabled, snap forward to Monday.
  if (skipWeekends) {
    while (base.getDay() === 0 || base.getDay() === 6) {
      base.setDate(base.getDate() + 1);
    }
  }

  let remaining = Math.max(0, Number(workHours) || 0);
  const wholeDays = Math.floor(remaining / hpd);
  const remHours = remaining - wholeDays * hpd;

  let added = 0;
  while (added < wholeDays) {
    base.setDate(base.getDate() + 1);
    if (skipWeekends && (base.getDay() === 0 || base.getDay() === 6)) continue;
    added++;
  }

  if (remHours > 0) {
    const mins = Math.round(remHours * 60);
    base.setMinutes(base.getMinutes() + mins);
  }
  return base;
}

/**
 * Traverse tree and build flat index + depth/parent/branch metadata without mutating input.
 */
export function flattenPlan(root) {
  const nodes = [];
  const byId = new Map();
  const phases = [];

  function walk(node, parent, depth, phase) {
    if (!node || !node.id) return;
    const myPhase = depth === 1 ? node : phase;
    const entry = {
      node,
      id: node.id,
      parentId: parent ? parent.id : null,
      depth,
      phaseId: myPhase ? myPhase.id : null,
      phaseColor: myPhase?.color || null,
      phaseLabel: myPhase?.label || "",
      order: nodes.length,
    };
    nodes.push(entry);
    byId.set(node.id, entry);
    if (depth === 1) phases.push(entry);
    const children = Array.isArray(node.children) ? node.children : [];
    for (const child of children) {
      walk(child, node, depth + 1, myPhase);
    }
  }

  walk(root, null, 0, null);
  return { nodes, byId, phases };
}

/**
 * Normalize dependency entry to `{ id, type, lag }`.
 * Supported types: "FS" (Finish-to-Start), "SS" (Start-to-Start), "FF" (Finish-to-Finish).
 */
export function normalizeDep(d) {
  if (typeof d === "string") return { id: d, type: "FS", lag: 0 };
  if (!d || typeof d.id !== "string") return null;
  const type = d.type === "SS" || d.type === "FF" ? d.type : "FS";
  const lag = Number.isFinite(Number(d.lag)) ? Number(d.lag) : 0;
  return { id: d.id, type, lag };
}

/**
 * Compute full CPM schedule for an action plan tree.
 *
 * Actionable items are all nodes with `depth >= 2`.
 * Phases (`depth === 1`) roll up their descendant actions (min ES, max EF, sum effort).
 * If a phase has `autoSequence: true`, its direct children automatically gain an implicit
 * FS dependency on their preceding sibling (in addition to any explicit `deps`).
 *
 * @param {object} root - Plan root node
 * @param {{ startDate?: string, hoursPerDay?: number, skipWeekends?: boolean }} [calendar]
 */
export function computeSchedule(root, calendar = {}) {
  const cal = {
    startDate: calendar.startDate || root?.startDate || toIsoDate(new Date()),
    hoursPerDay: Math.max(1, Number(calendar.hoursPerDay ?? root?.hoursPerDay) || 8),
    skipWeekends: (calendar.skipWeekends ?? root?.skipWeekends) !== false,
  };

  const { nodes, byId, phases } = flattenPlan(root);
  const actionEntries = nodes.filter((e) => e.depth >= 2);
  const actionIds = new Set(actionEntries.map((e) => e.id));

  // Build effective dependency edges: pred -> succ
  const preds = new Map(); // id -> Array<{ id, type, lag, implicit }>
  const succs = new Map(); // id -> Array<{ id, type, lag, implicit }>
  for (const e of actionEntries) {
    preds.set(e.id, []);
    succs.set(e.id, []);
  }

  // 1) Explicit dependencies
  for (const e of actionEntries) {
    const rawDeps = Array.isArray(e.node.deps) ? e.node.deps : [];
    const seen = new Set();
    for (const raw of rawDeps) {
      const dep = normalizeDep(raw);
      if (!dep || dep.id === e.id || !actionIds.has(dep.id) || seen.has(dep.id)) continue;
      seen.add(dep.id);
      const edge = { id: dep.id, type: dep.type, lag: dep.lag, implicit: false };
      preds.get(e.id).push(edge);
      succs.get(dep.id).push({ id: e.id, type: dep.type, lag: dep.lag, implicit: false });
    }
  }

  // 2) Implicit sequential dependencies for phases/parents with `autoSequence: true`
  for (const e of nodes) {
    if (e.depth >= 1 && e.node.autoSequence) {
      const kids = (e.node.children || []).filter((c) => actionIds.has(c.id));
      for (let i = 1; i < kids.length; i++) {
        const prevId = kids[i - 1].id;
        const currId = kids[i].id;
        const already = preds.get(currId).some((p) => p.id === prevId);
        if (!already) {
          preds.get(currId).push({ id: prevId, type: "FS", lag: 0, implicit: true });
          succs.get(prevId).push({ id: currId, type: "FS", lag: 0, implicit: true });
        }
      }
    }
  }

  // 3) Kahn's topological sort + cycle detection
  const inDeg = new Map();
  for (const e of actionEntries) {
    inDeg.set(e.id, preds.get(e.id).length);
  }
  const queue = [];
  for (const e of actionEntries) {
    if (inDeg.get(e.id) === 0) queue.push(e.id);
  }
  const topo = [];
  while (queue.length > 0) {
    const u = queue.shift();
    topo.push(u);
    for (const edge of succs.get(u)) {
      const nextDeg = inDeg.get(edge.id) - 1;
      inDeg.set(edge.id, nextDeg);
      if (nextDeg === 0) queue.push(edge.id);
    }
  }

  const cycleIds = [];
  if (topo.length < actionEntries.length) {
    const visited = new Set(topo);
    for (const e of actionEntries) {
      if (!visited.has(e.id)) {
        cycleIds.push(e.id);
        topo.push(e.id); // Still schedule best-effort so UI stays usable
      }
    }
  }
  const cycleSet = new Set(cycleIds);

  // Helper for duration in hours (default 4h if unset)
  const durationOf = (node) => {
    const val = Number(node.estHours);
    if (Number.isFinite(val) && val >= 0) return val;
    return 4;
  };

  // 4) Forward pass: Earliest Start (es) & Earliest Finish (ef)
  const items = new Map();
  for (const id of topo) {
    const entry = byId.get(id);
    const dur = durationOf(entry.node);
    const manualOffset = Number.isFinite(Number(entry.node.startOffset))
      ? Math.max(0, Number(entry.node.startOffset))
      : 0;

    let es = manualOffset;
    for (const p of preds.get(id)) {
      const pItem = items.get(p.id);
      if (!pItem) continue;
      let reqStart = 0;
      if (p.type === "FS") reqStart = pItem.ef + p.lag;
      else if (p.type === "SS") reqStart = pItem.es + p.lag;
      else if (p.type === "FF") reqStart = pItem.ef + p.lag - dur;
      if (reqStart > es) es = reqStart;
    }
    es = Math.max(0, Math.round(es * 100) / 100);
    const ef = Math.round((es + dur) * 100) / 100;

    items.set(id, {
      id,
      entry,
      label: entry.node.label || "",
      phaseId: entry.phaseId,
      phaseColor: entry.phaseColor,
      depth: entry.depth,
      duration: dur,
      es,
      ef,
      ls: es,
      lf: ef,
      slack: 0,
      isCritical: false,
      inCycle: cycleSet.has(id),
      startDate: addWorkHours(cal.startDate, es, cal),
      endDate: addWorkHours(cal.startDate, ef, cal),
      preds: preds.get(id),
      succs: succs.get(id),
      stat: entry.node.stat || "todo",
      prio: entry.node.prio || "",
      owner: entry.node.owner || "",
    });
  }

  // Project makespan (total span in work hours)
  let projectSpan = 0;
  let totalEffort = 0;
  let doneCount = 0;
  for (const item of items.values()) {
    if (item.ef > projectSpan) projectSpan = item.ef;
    totalEffort += item.duration;
    if (item.stat === "done") doneCount++;
  }
  projectSpan = Math.round(projectSpan * 100) / 100;
  totalEffort = Math.round(totalEffort * 100) / 100;

  // 5) Backward pass: Latest Finish (lf), Latest Start (ls), Slack, Critical Path
  if (cycleIds.length === 0) {
    for (let i = topo.length - 1; i >= 0; i--) {
      const id = topo[i];
      const item = items.get(id);
      let lf = projectSpan;
      for (const s of succs.get(id)) {
        const sItem = items.get(s.id);
        if (!sItem) continue;
        let maxFinish = projectSpan;
        if (s.type === "FS") maxFinish = sItem.ls - s.lag;
        else if (s.type === "SS") maxFinish = sItem.ls - s.lag + item.duration;
        else if (s.type === "FF") maxFinish = sItem.lf - s.lag;
        if (maxFinish < lf) lf = maxFinish;
      }
      lf = Math.round(lf * 100) / 100;
      const ls = Math.round((lf - item.duration) * 100) / 100;
      const slack = Math.max(0, Math.round((ls - item.es) * 100) / 100);
      item.lf = lf;
      item.ls = ls;
      item.slack = slack;
      item.isCritical = projectSpan > 0 && slack <= 0.01 && item.duration > 0;
    }
  }

  // 6) Phase rollups
  const phaseSummaries = new Map();
  for (const p of phases) {
    const pItems = [...items.values()].filter((it) => it.phaseId === p.id);
    if (pItems.length === 0) {
      phaseSummaries.set(p.id, {
        id: p.id,
        es: 0,
        ef: 0,
        effort: 0,
        count: 0,
        doneCount: 0,
        progress: 0,
        startDate: addWorkHours(cal.startDate, 0, cal),
        endDate: addWorkHours(cal.startDate, 0, cal),
      });
    } else {
      const es = Math.min(...pItems.map((it) => it.es));
      const ef = Math.max(...pItems.map((it) => it.ef));
      const effort = Math.round(pItems.reduce((s, it) => s + it.duration, 0) * 100) / 100;
      const pDone = pItems.filter((it) => it.stat === "done").length;
      phaseSummaries.set(p.id, {
        id: p.id,
        es,
        ef,
        effort,
        count: pItems.length,
        doneCount: pDone,
        progress: Math.round((pDone / pItems.length) * 100),
        startDate: addWorkHours(cal.startDate, es, cal),
        endDate: addWorkHours(cal.startDate, ef, cal),
      });
    }
  }

  const criticalIds = new Set(
    [...items.values()].filter((it) => it.isCritical).map((it) => it.id)
  );

  return {
    calendar: cal,
    items,
    phases: phaseSummaries,
    orderedItems: actionEntries.map((e) => items.get(e.id)).filter(Boolean),
    projectSpan,
    totalEffort,
    projectStartDate: addWorkHours(cal.startDate, 0, cal),
    projectEndDate: addWorkHours(cal.startDate, projectSpan, cal),
    actionCount: actionEntries.length,
    doneCount,
    progress: actionEntries.length ? Math.round((doneCount / actionEntries.length) * 100) : 0,
    criticalIds,
    cycleIds,
  };
}

/**
 * Generate clean Mermaid Gantt diagram syntax from the computed schedule.
 */
export function toMermaidGantt(root, schedule) {
  const safe = (s) => String(s || "").replace(/[:\n\r]/g, " ").trim() || "Untitled";
  const lines = [
    "gantt",
    `    title ${safe(root?.label || "Action Plan")}`,
    "    dateFormat YYYY-MM-DD",
    "    axisFormat %b %d",
  ];
  if (schedule.calendar.skipWeekends) {
    lines.push("    excludes weekends");
  }

  const phases = Array.isArray(root?.children) ? root.children : [];
  const hpd = schedule.calendar.hoursPerDay;

  for (const ph of phases) {
    const pItems = schedule.orderedItems.filter((it) => it.phaseId === ph.id);
    if (!pItems.length) continue;
    lines.push(`    section ${safe(ph.label)}`);
    for (const it of pItems) {
      const tags = [];
      if (it.stat === "done") tags.push("done");
      else if (it.stat === "doing") tags.push("active");
      if (it.isCritical) tags.push("crit");
      const tagStr = tags.length ? tags.join(", ") + ", " : "";
      const startIso = toIsoDate(it.startDate);
      const durDays = Math.max(1, Math.ceil(it.duration / hpd));
      const durStr = it.duration < hpd ? `${Math.max(1, Math.round(it.duration))}h` : `${durDays}d`;
      lines.push(`    ${safe(it.label)} :${tagStr}${it.id}, ${startIso}, ${durStr}`);
    }
  }
  return lines.join("\n");
}
