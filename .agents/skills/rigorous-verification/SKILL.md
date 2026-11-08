---
name: rigorous-verification
description: Mandatory pre-completion verification protocol. Enforces zero assumptions, automated test execution, build checks, and edge-case inspection before marking any task as done.
---

# Rigorous Verification Protocol

Use this skill before declaring any task complete, closing an issue, or presenting final code to the user.

## Core Principle: Zero Assumptions
Never assume code works just because it was written without syntax errors. Every change must be verified against automated test suites and production build tools before reporting completion.

---

## The 4-Step Verification Gate

### Step 1: Automated Test Suite Execution
Execute the workspace test runner:
```bash
npx vitest run
```
- **Requirements**:
  - 100% of test files must pass.
  - Zero failed tests.
  - No unhandled Promise rejections or leaked timer loops.

### Step 2: Production Bundle Compilation
Validate that TypeScript, JSX, Rollup/Vite packaging, and CSS imports compile without error:
```bash
npx vite build
```
- **Requirements**:
  - Exits with code 0.
  - Zero syntax or import resolution errors.
  - All static assets and chunks resolve properly.

### Step 3: Edge Case Inspection
Review potential blind spots in the implementation:
- **Empty States**: What renders if the list, search, or data array is empty?
- **Extreme Inputs**: Extremely long titles, negative values, null/undefined properties.
- **Theme & Contrast Check**: Does the UI remain readable in Dark, Light, and Random theme modes?
- **Viewport Constraints**: Does any popover, modal, or dropdown clip outside the screen bounds?
- **Accessibility**: Does the keyboard navigation work? Are ARIA attributes present (`aria-expanded`, `aria-hidden`, `role="alert"`)?

### Step 4: Clean Workspace Hygiene
- Check `git status --short` to ensure no accidental debug scratch files or temporary artifacts were committed.
- Ensure all comments and documentation integrity remain intact.

