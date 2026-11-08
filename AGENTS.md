# Workspace Engineering & Design Rules

## 1. UI/UX Craftsmanship & Anti-AI-Slop Policy
- **No AI Slop**: Avoid generic, unpolished UI elements (e.g. browser default tooltips, square unstyled inputs, unpadded containers, washed-out grey-on-dark text).
- **Apple & Linear Polish**: Use deliberate corner radii (6px, 10px, 14px, 18px, 24px), smooth spring curves (`cubic-bezier(0.32, 1.25, 0.32, 1)`), tactile `:active` states, specular rim highlights, and tabular numbers for counters.
- **Theme Contrast**: Every component must look intentional and maintain ≥ 4.5:1 text contrast in both Dark and Light themes.
- **Accessibility**: Include `@media (prefers-reduced-motion: reduce)` fallbacks and proper keyboard focus rings (`:focus-visible`).

## 2. Mandatory Verification Protocol (Never Mark Done Without Proof)
Before reporting any coding task as complete:
1. Run automated tests: `npx vitest run` (ensure all tests pass with 0 failures).
2. Run production build: `npx vite build` (ensure clean exit with code 0).
3. Inspect edge cases (empty states, overflow boundaries, dark/light theme contrast).

