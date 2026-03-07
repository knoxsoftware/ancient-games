# Egyptian Theme Toggle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a runtime toggle between the Classic and Lapis & Gold Egyptian themes, persisted in localStorage, with a toggle button in the session lobby.

**Architecture:** A `data-theme="egyptian"` attribute on `<html>` drives all styling via CSS overrides in `index.css`. A thin `theme.ts` service manages localStorage persistence and applies the attribute before React mounts (no flash). The lobby adds a small toggle button to its existing top-right actions row.

**Tech Stack:** React 18, Tailwind CSS, Vite, TypeScript

---

### Task 1: Create the theme service

**Files:**
- Create: `frontend/src/services/theme.ts`

There are no tests for this (it directly manipulates `document` and `localStorage` — DOM side effects; not worth mocking). Implement directly.

**Step 1: Create the file**

```ts
const STORAGE_KEY = 'theme';
const EGYPTIAN = 'egyptian';

export type Theme = 'classic' | 'egyptian';

function applyTheme(theme: Theme) {
  if (theme === EGYPTIAN) {
    document.documentElement.dataset.theme = EGYPTIAN;
  } else {
    delete document.documentElement.dataset.theme;
  }
}

export function getTheme(): Theme {
  return (localStorage.getItem(STORAGE_KEY) as Theme) ?? 'classic';
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === EGYPTIAN ? 'classic' : EGYPTIAN;
  localStorage.setItem(STORAGE_KEY, next);
  applyTheme(next);
  return next;
}

// Apply immediately on module load (before React mounts)
applyTheme(getTheme());
```

**Step 2: Import it in `main.tsx` before `index.css`**

In `frontend/src/main.tsx`, add one import line so the theme is applied before React renders:

```ts
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './services/theme';   // ← add this line
import './index.css';
```

**Step 3: Verify no TypeScript errors**

```bash
npm run build:frontend 2>&1 | head -30
```

Expected: clean build (or only pre-existing warnings).

**Step 4: Commit**

```bash
git add frontend/src/services/theme.ts frontend/src/main.tsx
git commit -m "feat(theme): add theme service with localStorage persistence"
```

---

### Task 2: Add Egyptian CSS overrides to index.css

**Files:**
- Modify: `frontend/src/index.css`

Add the following block at the **end** of `frontend/src/index.css`. This block overrides Tailwind utility classes and component classes when `[data-theme="egyptian"]` is present on `<html>`.

**Step 1: Append the block**

```css
/* ── Egyptian (Lapis & Gold) theme overrides ─────────────────────────── */
[data-theme="egyptian"] body {
  background-color: #030710;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Cpath d='M12 2L22 12L12 22L2 12Z' fill='none' stroke='%23C9A030' stroke-width='0.35' stroke-opacity='0.18'/%3E%3C/svg%3E");
  background-size: 24px 24px;
}

/* Gray → lapis blue-black */
[data-theme="egyptian"] .bg-gray-50  { background-color: #eef1f7; }
[data-theme="egyptian"] .bg-gray-100 { background-color: #d4dbe9; }
[data-theme="egyptian"] .bg-gray-200 { background-color: #b0bdd1; }
[data-theme="egyptian"] .bg-gray-300 { background-color: #8a9bb8; }
[data-theme="egyptian"] .bg-gray-400 { background-color: #6a7fa0; }
[data-theme="egyptian"] .bg-gray-500 { background-color: #4e6285; }
[data-theme="egyptian"] .bg-gray-600 { background-color: #354d6e; }
[data-theme="egyptian"] .bg-gray-700 { background-color: #1e3354; }
[data-theme="egyptian"] .bg-gray-800 { background-color: #0e1f3a; }
[data-theme="egyptian"] .bg-gray-900 { background-color: #060e1f; }
[data-theme="egyptian"] .bg-gray-950 { background-color: #030710; }

[data-theme="egyptian"] .text-gray-300 { color: #8a9bb8; }
[data-theme="egyptian"] .text-gray-400 { color: #6a7fa0; }
[data-theme="egyptian"] .text-gray-500 { color: #4e6285; }

[data-theme="egyptian"] .border-gray-600 { border-color: #354d6e; }
[data-theme="egyptian"] .border-gray-700 { border-color: #1e3354; }

/* Utility opacity variants used in the lobby */
[data-theme="egyptian"] .bg-gray-700\/50 { background-color: rgba(30,51,84,0.5); }
[data-theme="egyptian"] .bg-gray-700\/30 { background-color: rgba(30,51,84,0.3); }
[data-theme="egyptian"] .bg-gray-700\/20 { background-color: rgba(30,51,84,0.2); }
[data-theme="egyptian"] .bg-gray-700\/40 { background-color: rgba(30,51,84,0.4); }

/* Primary → gold */
[data-theme="egyptian"] .bg-primary-600 { background-color: #B8960C; }
[data-theme="egyptian"] .bg-primary-700 { background-color: #9A7D0A; }
[data-theme="egyptian"] .hover\:bg-primary-700:hover { background-color: #9A7D0A; }
[data-theme="egyptian"] .hover\:bg-primary-500:hover { background-color: #D4AF37; }
[data-theme="egyptian"] .text-primary-400 { color: #f9d76b; }
[data-theme="egyptian"] .text-primary-600 { color: #B8960C; }
[data-theme="egyptian"] .border-primary-600 { border-color: #B8960C; }
[data-theme="egyptian"] .hover\:bg-primary-600:hover { background-color: #B8960C; }
[data-theme="egyptian"] .focus\:ring-primary-500:focus { --tw-ring-color: #D4AF37; }

/* Secondary → Egyptian turquoise */
[data-theme="egyptian"] .bg-secondary-600 { background-color: #00A89C; }
[data-theme="egyptian"] .bg-secondary-700 { background-color: #008F85; }
[data-theme="egyptian"] .hover\:bg-secondary-700:hover { background-color: #008F85; }

/* Component class overrides */
[data-theme="egyptian"] .card {
  background-color: #0e1f3a;
  border-color: #1e3354;
}

[data-theme="egyptian"] .input {
  background-color: #0e1f3a;
  border-color: #354d6e;
  color: #eef1f7;
}
[data-theme="egyptian"] .input::placeholder { color: #4e6285; }

[data-theme="egyptian"] .btn-primary {
  background-color: #B8960C;
  color: #030710;
}
[data-theme="egyptian"] .btn-primary:hover { background-color: #D4AF37; }

[data-theme="egyptian"] .btn-outline {
  border-color: #D4AF37;
  color: #f9d76b;
}
[data-theme="egyptian"] .btn-outline:hover {
  background-color: #B8960C;
  color: #030710;
}

/* my-turn-pulse: green → gold */
[data-theme="egyptian"] .my-turn-pulse {
  animation: my-turn-pulse-gold 2s ease-in-out infinite;
}
@keyframes my-turn-pulse-gold {
  0%, 100% {
    box-shadow: 0 0 8px rgba(212,175,55,0.25), inset 0 0 8px rgba(212,175,55,0.06);
    border-color: rgba(212,175,55,0.35);
  }
  50% {
    box-shadow: 0 0 20px rgba(212,175,55,0.55), inset 0 0 14px rgba(212,175,55,0.14);
    border-color: rgba(212,175,55,0.7);
  }
}
```

**Step 2: Verify dev server compiles cleanly**

```bash
npm run dev:frontend &
sleep 3 && curl -s http://localhost:5173 | head -5
```

Expected: HTML response (no compilation error).

**Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat(theme): add Egyptian lapis & gold CSS overrides"
```

---

### Task 3: Add theme toggle button to SessionLobby

**Files:**
- Modify: `frontend/src/components/lobby/SessionLobby.tsx`

**Step 1: Import theme utilities at the top of the file**

Add after the existing imports:

```ts
import { getTheme, toggleTheme, type Theme } from '../../services/theme';
```

**Step 2: Add theme state inside the component**

Add this line with the other `useState` declarations near the top of `SessionLobby()`:

```ts
const [theme, setTheme] = useState<Theme>(getTheme);
```

**Step 3: Add the toggle handler**

Add this function alongside the other handlers (e.g. after `handleLeave`):

```ts
const handleThemeToggle = () => {
  setTheme(toggleTheme());
};
```

**Step 4: Add the button in the normal lobby view**

In the normal lobby return (around line 663), the top-right `<div className="flex items-center gap-2">` already contains the feedback button and Leave button. Add the theme toggle button **before** the feedback button:

```tsx
<button
  onClick={handleThemeToggle}
  className="w-8 h-8 rounded-full flex items-center justify-center text-base transition-colors"
  style={{
    background: 'rgba(196,160,48,0.12)',
    border: '1.5px solid rgba(196,160,48,0.35)',
    color: '#C4A030',
  }}
  title={theme === 'egyptian' ? 'Switch to Classic theme' : 'Switch to Egyptian theme'}
>
  {theme === 'egyptian' ? '◈' : '☽'}
</button>
```

**Step 5: Add the same button in the tournament view**

The tournament view (around line 547) has an identical `<div className="flex items-center gap-2">`. Add the same button there too.

**Step 6: Verify TypeScript compiles**

```bash
npm run build:frontend 2>&1 | grep -E 'error|warning' | head -20
```

Expected: No new errors.

**Step 7: Commit**

```bash
git add frontend/src/components/lobby/SessionLobby.tsx
git commit -m "feat(lobby): add Egyptian/Classic theme toggle button"
```

---

### Task 4: Manual smoke test

Start the dev server and verify:

```bash
npm run dev:frontend
```

Open `http://localhost:5173` in a browser. Create or join a session to reach the lobby.

**Checklist:**
- [ ] Toggle button visible in top-right of lobby (☽ initially)
- [ ] Clicking it changes the site to blue-black backgrounds with gold accents
- [ ] Button now shows ◈
- [ ] Refreshing the page preserves the Egyptian theme (localStorage)
- [ ] Clicking again restores the Classic theme
- [ ] `my-turn-pulse` is gold in Egyptian mode (visible during an active game)
- [ ] Body has subtle diamond tile pattern in Egyptian mode
