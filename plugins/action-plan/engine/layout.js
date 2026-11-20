// Pure Mindmap layout and smooth curve routing engine.
// Supports both Balanced (Left/Right around root) and Rightward Flow (Left -> Right) layouts.

export const NODE_WIDTHS = [276, 248, 256];
export const PAD_X = 14;
export const PAD_Y = 11;
export const LINE_H = 17.5;
export const GAP_Y = 16;
export const GAP_X = 68;
export const ROOT_BUS = 48;

const wrapCache = new Map();

/**
 * Measure and wrap text into lines using an optional Canvas 2D context
 * (falls back to character-width heuristic in headless test environments).
 */
export function wrapText(text, maxWidth, font, measureCtx) {
  const key = `${maxWidth}|${font}|${text}`;
  if (wrapCache.has(key)) return wrapCache.get(key);

  const measure = measureCtx
    ? (s) => {
        measureCtx.font = font;
        return measureCtx.measureText(s).width;
      }
    : (s) => s.length * 7.2;

  const out = [];
  const paragraphs = String(text || "").split("\n");
  for (const para of paragraphs) {
    const words = para.split(" ");
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (measure(test) > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    out.push(line);
  }
  if (wrapCache.size > 2000) wrapCache.clear();
  wrapCache.set(key, out);
  return out;
}

/**
 * Compute mindmap layout for the entire tree.
 * Returns `{ positions: Map<id, { x, y, w, h, lines, fs, fw, dir, depth, phaseId }>, rootBus }`.
 */
export function computeMindmapLayout(root, opts = {}) {
  const {
    folded = new Set(),
    mode = "balanced", // "balanced" | "right"
    visibleFilter = () => true,
    measureCtx = null,
    fontFamily = "Inter, system-ui, sans-serif",
  } = opts;

  const positions = new Map();

  function getKids(node, depth) {
    if (folded.has(node.id)) return [];
    return (node.children || []).filter((c) => visibleFilter(c, depth + 1));
  }

  function sizeNode(node, depth) {
    const w = node.w0 || NODE_WIDTHS[Math.min(depth, 2)];
    const fs = depth === 0 ? 15 : depth === 1 ? 13.5 : 12.5;
    const fw = depth <= 1 ? 650 : 520;
    const font = `${fw} ${fs}px ${fontFamily}`;
    const maxW = w - PAD_X * 2 - (depth >= 2 ? 22 : 12);
    const lines = wrapText(node.label || "—", maxW, font, measureCtx);
    const hasMeta = depth === 0 ? 22 : depth === 1 ? 22 : 24;
    const h = Math.max(depth === 0 ? 64 : 52, lines.length * LINE_H + PAD_Y * 2 + hasMeta);
    return { w, h, lines, fs, fw };
  }

  const subHeights = new Map();

  function measureSubtree(node, depth) {
    const sz = sizeNode(node, depth);
    positions.set(node.id, { ...sz, x: 0, y: 0, dir: 1, depth });
    const kids = getKids(node, depth);
    if (kids.length === 0) {
      subHeights.set(node.id, sz.h);
      return sz.h;
    }
    let total = 0;
    for (const k of kids) total += measureSubtree(k, depth + 1);
    total += GAP_Y * (kids.length - 1);
    const sub = Math.max(sz.h, total);
    subHeights.set(node.id, sub);
    return sub;
  }

  function placeChildren(node, depth, dir, phaseId) {
    const pPos = positions.get(node.id);
    const kids = getKids(node, depth);
    if (!kids.length) return;
    let total = 0;
    for (const k of kids) total += subHeights.get(k.id);
    total += GAP_Y * (kids.length - 1);

    let y = pPos.y - total / 2;
    for (const k of kids) {
      const kPos = positions.get(k.id);
      const sub = subHeights.get(k.id);
      kPos.dir = dir;
      kPos.phaseId = phaseId;
      kPos.y = y + sub / 2;
      kPos.x = dir > 0 ? pPos.x + pPos.w + GAP_X : pPos.x - GAP_X - kPos.w;
      y += sub + GAP_Y;
      placeChildren(k, depth + 1, dir, phaseId);
    }
  }

  function applyManualOffset(node, depth, accX, accY) {
    const pos = positions.get(node.id);
    if (!pos) return;
    const dx = accX + (Number(node.dx) || 0);
    const dy = accY + (Number(node.dy) || 0);
    pos.x += dx;
    pos.y += dy;
    for (const k of getKids(node, depth)) {
      applyManualOffset(k, depth + 1, dx, dy);
    }
  }

  const rootSz = sizeNode(root, 0);
  positions.set(root.id, {
    ...rootSz,
    x: -rootSz.w / 2,
    y: 0,
    dir: 1,
    depth: 0,
    phaseId: null,
  });

  const phases = getKids(root, 0);
  for (const ph of phases) measureSubtree(ph, 1);

  const leftPhases = mode === "right" ? [] : phases.filter((p) => p.side === "L");
  const rightPhases = mode === "right" ? phases : phases.filter((p) => p.side !== "L");

  const rootPos = positions.get(root.id);
  const groups = [
    { items: rightPhases, dir: 1 },
    { items: leftPhases, dir: -1 },
  ];

  for (const { items, dir } of groups) {
    if (!items.length) continue;
    let total = 0;
    for (const ph of items) total += subHeights.get(ph.id);
    total += GAP_Y * 2.2 * (items.length - 1);
    let y = -total / 2;
    for (const ph of items) {
      const pPos = positions.get(ph.id);
      const sub = subHeights.get(ph.id);
      pPos.dir = dir;
      pPos.phaseId = ph.id;
      pPos.y = y + sub / 2;
      pPos.x = dir > 0
        ? rootPos.x + rootPos.w + ROOT_BUS + GAP_X
        : rootPos.x - ROOT_BUS - GAP_X - pPos.w;
      y += sub + GAP_Y * 2.2;
      placeChildren(ph, 1, dir, ph.id);
    }
  }

  for (const ph of phases) applyManualOffset(ph, 1, 0, 0);

  return {
    positions,
    leftPhases,
    rightPhases,
  };
}

/**
 * Smooth organic cubic Bezier for tree branch connectors (parent -> child).
 */
export function branchCurvePath(px, py, cx, cy) {
  const dx = Math.abs(cx - px);
  const c1x = px + (cx >= px ? 1 : -1) * Math.max(28, dx * 0.48);
  const c2x = cx - (cx >= px ? 1 : -1) * Math.max(28, dx * 0.48);
  return `M${px.toFixed(1)},${py.toFixed(1)} C${c1x.toFixed(1)},${py.toFixed(1)} ${c2x.toFixed(1)},${cy.toFixed(1)} ${cx.toFixed(1)},${cy.toFixed(1)}`;
}

/**
 * Smart dependency connector curve between two action cards on the mindmap.
 * - Same-column siblings: arcs cleanly outside the right edge of the cards.
 * - Long cross-tree links: arches gracefully above/below intermediate cards.
 */
export function dependencyCurvePath(srcPos, dstPos) {
  const sameCol = Math.abs(srcPos.x - dstPos.x) < 48;
  if (sameCol) {
    // Route along the outside right edge so it never overlaps card text/assignee
    const goingDown = srcPos.y <= dstPos.y;
    const x1 = srcPos.x + srcPos.w;
    const y1 = srcPos.y + (goingDown ? 8 : -8);
    const x2 = dstPos.x + dstPos.w;
    const y2 = dstPos.y + (goingDown ? -8 : 8);
    const bulge = Math.min(46, Math.max(24, Math.abs(y2 - y1) * 0.34));
    return {
      path: `M${x1.toFixed(1)},${y1.toFixed(1)} C${(x1 + bulge).toFixed(1)},${y1.toFixed(1)} ${(x2 + bulge).toFixed(1)},${y2.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`,
      midX: x1 + bulge * 0.78,
      midY: (y1 + y2) / 2,
    };
  }

  const leftToRight = srcPos.x + srcPos.w / 2 <= dstPos.x + dstPos.w / 2;
  const x1 = leftToRight ? srcPos.x + srcPos.w : srcPos.x;
  const y1 = srcPos.y;
  const x2 = leftToRight ? dstPos.x : dstPos.x + dstPos.w;
  const y2 = dstPos.y;
  const dx = Math.abs(x2 - x1);
  const dist = Math.hypot(x2 - x1, y2 - y1);

  // Long cross-tree jump (likely spans across the central root/phases): arch cleanly outside
  if (dx > 340) {
    const avgY = (y1 + y2) / 2;
    const archDir = avgY <= 0 ? -1 : 1;
    const lift = Math.min(140, Math.max(68, dx * 0.18)) * archDir;
    const c1x = x1 + (leftToRight ? 1 : -1) * dx * 0.28;
    const c2x = x2 - (leftToRight ? 1 : -1) * dx * 0.28;
    const cy = (archDir < 0 ? Math.min(y1, y2) : Math.max(y1, y2)) + lift;
    return {
      path: `M${x1.toFixed(1)},${y1.toFixed(1)} C${c1x.toFixed(1)},${cy.toFixed(1)} ${c2x.toFixed(1)},${cy.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`,
      midX: (x1 + x2) / 2,
      midY: 0.125 * y1 + 0.75 * cy + 0.125 * y2,
    };
  }

  const k = Math.max(34, Math.min(110, dist * 0.34));
  const dir = leftToRight ? 1 : -1;
  return {
    path: `M${x1.toFixed(1)},${y1.toFixed(1)} C${(x1 + dir * k).toFixed(1)},${y1.toFixed(1)} ${(x2 - dir * k).toFixed(1)},${y2.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`,
    midX: (x1 + x2) / 2,
    midY: (y1 + y2) / 2,
  };
}
