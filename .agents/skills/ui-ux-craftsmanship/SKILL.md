---
name: ui-ux-craftsmanship
description: Professional UI/UX craftsmanship standard that prevents AI slop, enforces modern Apple/Linear-level design polish, and ensures tactile, accessible interfaces.
---

# UI/UX Craftsmanship & Anti-AI-Slop Standard

Use this skill whenever creating, modifying, or reviewing user interfaces, components, animations, and visual styling.

## 1. What is "AI Slop" in UI/UX & How to Avoid It

| AI Slop Anti-Pattern | Craftsmanship Standard |
| :--- | :--- |
| **Ugly Native Fallbacks** (e.g. default browser HTML5 grey validation tooltips) | Custom, beautiful micro-components (neomorphic error bubbles, floating toasts) matching the design system. |
| **Dead/Flat Buttons** without pressed/active states | Tactile tactile depth: hover elevation, pressed inset/scale (`:active`), focused `:focus-visible` rings. |
| **Washed-out / Inverted Contrast on Hover** | Color contrast verified in all states (light & dark). Text never drops below 4.5:1 ratio against its immediate background. |
| **Jumping Numbers / Layout Shifts** | `font-variant-numeric: tabular-nums` for timers, stats, and counters; smooth digit interpolation instead of jarring jumps. |
| **Linear, Robotic Animations** (`linear` or generic `ease`) | Natural spring physics (e.g. Apple's `cubic-bezier(0.32, 1.25, 0.32, 1)`) with overshoot and decay. |
| **Over-reliance on generic grey borders** | Soft depth via ambient occlusion shadows, subtle specular top highlights (`inset 0 1px 0.5px rgba(255,255,255,0.18)`), or tonal contrast. |
| **Ignoring Motion Accessibility** | Always provide `@media (prefers-reduced-motion: reduce)` fallbacks disabling disorienting motion. |

## 2. Design System Tokens & Rhythm
- **Spacing Scale**: Strict multiples of 4px / 8px (4, 8, 12, 16, 20, 24, 32px).
- **Corner Radii Hierarchy**:
  - Small pills / badges: 6px – 10px
  - Inputs / buttons: 10px – 14px
  - Cards / modals: 16px – 24px
  - Island / notch containers: 20px (compact) to 28px (expanded)
- **Visual Depth (Neomorphism & Soft UI)**:
  - Raised surfaces: Light reflection top-left, deep diffuse shadow bottom-right.
  - Inset / Sunken surfaces (inputs, tracks, active toggles): Inset shadows top-left and bottom-right.
  - Hardware Accents: Specular border highlights (`inset 0 1px 0 rgba(255,255,255,0.15)`).

## 3. Micro-Interactions & State Matrix
Every UI control must have clear styling for all states:
1. **Idle / Rest**: Sits naturally in the hierarchy without drawing excessive attention.
2. **Hover**: Smooth lift or soft highlight; cursor: pointer; label text contrast guaranteed.
3. **Active / Pressed**: Subtle depression (`transform: scale(0.97)` or inset shadow).
4. **Focused**: `:focus-visible` outline for keyboard navigators, matching `--accent`.
5. **Disabled**: Reduced opacity (0.4 - 0.5), `cursor: default`, pointer events handled.
6. **Error / Invalid**: Gentle shake animation (`trk-shake`), border highlight, and clear tooltip with pointing tip.

