# Yahoo Games 2001 Light Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a toggleable "Yahoo Games 2001" light mode to the Ancient Games frontend, affecting only the UI shell (not game boards), with a persistent toggle in the top-right corner.

**Architecture:** `ThemeContext` holds `theme: 'dark' | 'yahoo'` and sets `data-theme="yahoo"` on `<html>`. CSS custom properties under `[data-theme="yahoo"]` restyle Tailwind component classes (`.card`, `.btn*`, `.input`, `body`). Inline-styled components (ChatPanel, MoveLog, GameRules, GameEndModal, parts of SessionLobby) use `useTheme()` to conditionally apply Yahoo-themed inline style values.

**Tech Stack:** React 18, Tailwind CSS, CSS custom properties, localStorage

---

## Key color reference

| Semantic name | Dark value | Yahoo 2001 value |
|---|---|---|
| page bg | `#111827` | `#f0f0ee` |
| panel bg | `#1f2937` | `#ffffff` |
| border | `#374151` | `#cccccc` |
| input bg | `#374151` | `#ffffff` |
| input border | `#4b5563` | `#999999` |
| text primary | `#f3f4f6` | `#000000` |
| text secondary | `#9ca3af` | `#666666` |
| text muted | `#4b5563` | `#999999` |
| btn default bg | `#374151` | `#dddddd` |
| btn default border | `#4b5563` | `#999999` |
| btn primary bg | `#f69a12` (primary-600) | `#400090` |
| btn primary hover | `#f48f0e` (primary-700) | `#5a00b0` |
| chat bg | `rgba(8,5,0,0.6)` | `#ffffff` |
| chat border | `#2A1E0E` | `#cccccc` |
| chat text | `#D4C8A8` | `#000000` |
| chat my name | `#E8C870` | `#400090` |
| chat other name | `#A09070` | `#666666` |
| chat timestamp | `#5A4A38` | `#999999` |
| chat my msg bg | `rgba(196,160,48,0.15)` | `#ffffcc` |
| chat my msg border | `rgba(196,160,48,0.3)` | `#cccc99` |
| chat other msg bg | `rgba(42,30,14,0.6)` | `#f0f0ee` |
| chat other msg border | `rgba(42,30,14,0.8)` | `#cccccc` |
| move log bg | `rgba(8,5,0,0.6)` | `#ffffff` |
| move log border | `#2A1E0E` | `#cccccc` |
| move log header text | `#907A60` | `#666666` |
| move log row text | `#A09070` | `#333333` |
| move log active row | `rgba(196,168,107,0.12)` | `#ffffcc` |
| modal bg | `#1A1008` | `#ffffff` |
| modal border | `rgba(196,160,48,0.3)` | `#400090` |
| modal title (winner) | `#E8C870` | `#400090` |
| modal subtitle | `#8A7A60` | `#666666` |
| rules bg | `rgba(8,5,0,0.7)` | `#ffffff` |
| rules border | `rgba(42,30,14,0.8)` | `#cccccc` |
| rules text | `#C0A870` | `#000000` |
| rules section heading | `#E8C870` | `#400090` |
| notice bg | `rgba(20,12,0,0.92)` | `rgba(64,0,144,0.92)` |
| notice border | `rgba(196,168,107,0.5)` | `rgba(255,255,255,0.4)` |
| notice text | `#F0E6C8` | `#ffffff` |
| format selected bg | `rgba(196,160,48,0.12)` | `#ffffcc` |
| format selected border | `rgba(196,160,48,0.5)` | `#400090` |
| format selected text | `#E8C870` | `#400090` |
| format unselected bg | `rgba(8,5,0,0.5)` | `#ffffff` |
| format unselected border | `rgba(42,30,14,0.8)` | `#cccccc` |
| format unselected text | `#8A7A60` | `#666666` |
| bracket connector | `rgba(138,122,96,0.35)` | `rgba(64,0,144,0.3)` |
| bracket round label | `#B09A70` | `#400090` |
| bracket round border | `rgba(138,122,96,0.25)` | `rgba(64,0,144,0.25)` |

---

### Task 1: ThemeContext

**Files:**
- Create: `frontend/src/contexts/ThemeContext.tsx`

**Step 1: Create the context file**

```tsx
import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'yahoo';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('ancient-games-theme');
    return stored === 'yahoo' ? 'yahoo' : 'dark';
  });

  useEffect(() => {
    const html = document.documentElement;
    if (theme === 'yahoo') {
      html.setAttribute('data-theme', 'yahoo');
    } else {
      html.removeAttribute('data-theme');
    }
    localStorage.setItem('ancient-games-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'yahoo' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
```

**Step 2: Verify no tests exist for this yet (none expected)**

Run: `npm test --workspace=backend`
Expected: All tests pass (this is frontend-only, backend tests unaffected)

**Step 3: Commit**

```bash
git add frontend/src/contexts/ThemeContext.tsx
git commit -m "feat: add ThemeContext with dark/yahoo theme toggle"
```

---

### Task 2: ThemeToggle component

**Files:**
- Create: `frontend/src/components/ThemeToggle.tsx`

**Step 1: Create the component**

```tsx
import { useTheme } from '../contexts/ThemeContext';

interface ThemeToggleProps {
  /**
   * When true, renders as a fixed overlay (top-right corner).
   * When false, renders inline (for use inside a flex row).
   */
  fixed?: boolean;
}

export default function ThemeToggle({ fixed = false }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isYahoo = theme === 'yahoo';

  const button = (
    <button
      onClick={toggleTheme}
      title={isYahoo ? 'Switch to dark mode' : 'Switch to Yahoo Games classic mode'}
      style={{
        fontFamily: isYahoo ? 'Arial, Helvetica, sans-serif' : undefined,
        fontSize: '12px',
        padding: '3px 8px',
        border: isYahoo ? '1px solid #999999' : '1px solid rgba(196,168,107,0.4)',
        borderRadius: isYahoo ? '0' : '6px',
        background: isYahoo ? '#dddddd' : 'rgba(196,168,107,0.1)',
        color: isYahoo ? '#000000' : '#C4A030',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        lineHeight: '1.4',
      }}
    >
      {isYahoo ? '🌙 Dark' : '☀ Classic'}
    </button>
  );

  if (!fixed) return button;

  return (
    <div style={{ position: 'fixed', top: '16px', right: '16px', zIndex: 50 }}>
      {button}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/ThemeToggle.tsx
git commit -m "feat: add ThemeToggle button component"
```

---

### Task 3: CSS custom properties + component class updates

**Files:**
- Modify: `frontend/src/index.css`
- Modify: `frontend/tailwind.config.js`

**Step 1: Update `tailwind.config.js` to add `darkMode: 'selector'`**

No changes needed to tailwind config — we're using CSS custom properties + `[data-theme]` selector, not Tailwind's dark mode.

**Step 2: Update `index.css` — add CSS custom property definitions and update component classes**

The current `@layer base` sets `body { @apply bg-gray-900 text-gray-100 }`. We need to change the body rule to use CSS vars and add the Yahoo override block.

Find in `frontend/src/index.css`:
```css
@layer base {
  body {
    @apply bg-gray-900 text-gray-100 min-h-screen;
  }
```

Replace with:
```css
:root {
  --bg-page: #111827;
  --bg-panel: #1f2937;
  --bg-input: #374151;
  --border: #374151;
  --border-input: #4b5563;
  --text-primary: #f3f4f6;
  --text-secondary: #9ca3af;
  --text-muted: #4b5563;
  --radius-card: 0.75rem;
  --radius-btn: 0.5rem;
  --radius-input: 0.5rem;
  --btn-primary-bg: #f69a12;
  --btn-primary-hover: #f48f0e;
  --btn-secondary-bg: #399bbd;
  --btn-secondary-hover: #3191b5;
  --btn-outline-border: #f69a12;
  --btn-outline-color: #f69a12;
}

[data-theme="yahoo"] {
  --bg-page: #f0f0ee;
  --bg-panel: #ffffff;
  --bg-input: #ffffff;
  --border: #cccccc;
  --border-input: #999999;
  --text-primary: #000000;
  --text-secondary: #666666;
  --text-muted: #999999;
  --radius-card: 0px;
  --radius-btn: 0px;
  --radius-input: 0px;
  --btn-primary-bg: #400090;
  --btn-primary-hover: #5a00b0;
  --btn-secondary-bg: #400090;
  --btn-secondary-hover: #5a00b0;
  --btn-outline-border: #400090;
  --btn-outline-color: #400090;
}

@layer base {
  body {
    background-color: var(--bg-page);
    color: var(--text-primary);
    @apply min-h-screen;
  }

  [data-theme="yahoo"] body,
  [data-theme="yahoo"] {
    font-family: Arial, Helvetica, sans-serif;
  }
```

**Step 3: Update `.card`, `.btn`, `.input` component classes in `@layer components`**

Find the entire `@layer components` block and replace it:

```css
@layer components {
  .btn {
    padding: 0.5rem 1rem;
    border-radius: var(--radius-btn);
    font-weight: 600;
    transition: all 0.2s;
    @apply disabled:opacity-50 disabled:cursor-not-allowed;
  }

  .btn-primary {
    background-color: var(--btn-primary-bg);
    color: #ffffff;
    @apply shadow-lg active:scale-95;
  }
  .btn-primary:hover:not(:disabled) {
    background-color: var(--btn-primary-hover);
  }

  .btn-secondary {
    background-color: var(--btn-secondary-bg);
    color: #ffffff;
    @apply shadow-lg active:scale-95;
  }
  .btn-secondary:hover:not(:disabled) {
    background-color: var(--btn-secondary-hover);
  }

  .btn-outline {
    border: 2px solid var(--btn-outline-border);
    color: var(--btn-outline-color);
    background: transparent;
    @apply active:scale-95;
  }
  .btn-outline:hover:not(:disabled) {
    background-color: var(--btn-outline-border);
    color: #ffffff;
  }

  .card {
    background-color: var(--bg-panel);
    border-radius: var(--radius-card);
    border: 1px solid var(--border);
    @apply shadow-2xl p-6;
  }

  .input {
    background-color: var(--bg-input);
    border: 1px solid var(--border-input);
    border-radius: var(--radius-input);
    color: var(--text-primary);
    @apply px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent;
  }
  .input::placeholder {
    color: var(--text-secondary);
  }
}
```

**Step 4: Start the dev server and verify dark mode still looks correct**

Run in a terminal: `npm run dev:frontend`

Visual check: Open http://localhost:5173 and verify the site still looks as before (dark mode default).

**Step 5: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat: add CSS custom properties for Yahoo theme, update component classes"
```

---

### Task 4: Wire ThemeProvider into App.tsx + add fixed ThemeToggle

**Files:**
- Modify: `frontend/src/App.tsx`

**Step 1: Read the current App.tsx** (already read above)

Current content:
```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './components/Home';
import SessionLobby from './components/lobby/SessionLobby';
import GameRoom from './components/GameRoom';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/session/:sessionCode" element={<SessionLobby />} />
          <Route path="/game/:sessionCode" element={<GameRoom />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
```

**Step 2: Update App.tsx**

Replace the entire file:

```tsx
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Home from './components/Home';
import SessionLobby from './components/lobby/SessionLobby';
import GameRoom from './components/GameRoom';
import { ThemeProvider } from './contexts/ThemeContext';
import ThemeToggle from './components/ThemeToggle';

function AppShell() {
  const location = useLocation();
  const isGameRoom = location.pathname.startsWith('/game/');

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-page)' }}>
      {/* Fixed toggle on all pages except GameRoom (GameRoom has it inline) */}
      {!isGameRoom && <ThemeToggle fixed />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/session/:sessionCode" element={<SessionLobby />} />
        <Route path="/game/:sessionCode" element={<GameRoom />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
```

Note: `useLocation` must be called inside `BrowserRouter`, so we split out `AppShell`.

**Step 3: Visual verify**

Toggle should appear top-right on Home page. Clicking it should change the page background to `#f0f0ee` and body font to Arial.

**Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: wrap app in ThemeProvider, add fixed ThemeToggle on non-game pages"
```

---

### Task 5: Update Home.tsx hardcoded Tailwind colors

**Files:**
- Modify: `frontend/src/components/Home.tsx`

**Step 1: Find all hardcoded gray utility classes in Home.tsx**

Occurrences to update (line numbers approximate — re-read file):
- `text-gray-400` → `style={{ color: 'var(--text-secondary)' }}` OR use a wrapper class
- `border-gray-600` → `style={{ borderColor: 'var(--border)' }}`
- `border-gray-500` (hover) → `style={{ borderColor: 'var(--border-input)' }}`
- `bg-primary-500/20` (selected game) → keep as-is for dark, add Yahoo override via CSS
- `text-gray-400` on description inside game buttons → `style={{ color: 'var(--text-secondary)' }}`
- `text-gray-600` (asterisk footnote) → `style={{ color: 'var(--text-muted)' }}`
- `text-gray-400 hover:text-white` (back button) → use inline style
- `bg-red-500/20 border border-red-500 rounded-lg p-3 text-red-200` (error) → add `[data-theme="yahoo"]` CSS override in `index.css` OR inline conditional

**Step 2: Update the key sections**

The subtitle `text-gray-400`:
```tsx
<p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
  Play ancient board games online with friends
</p>
```

The subtitle on "Start a new game session" cards:
```tsx
<p style={{ color: 'var(--text-secondary)' }}>Start a new game session</p>
```
```tsx
<p style={{ color: 'var(--text-secondary)' }}>Enter a session code</p>
```

The back button:
```tsx
<button
  onClick={() => { setMode(null); setError(''); }}
  className="mb-6 flex items-center gap-2"
  style={{ color: 'var(--text-secondary)' }}
>
  ← Back
</button>
```

The label color (already unstyled, inherits from body).

Game type button when unselected — border:
```tsx
className={`p-4 rounded-lg border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
  gameType === manifest.type
    ? 'border-primary-500 bg-primary-500/20'
    : ''
}`}
style={gameType !== manifest.type ? { borderColor: 'var(--border-input)' } : undefined}
```

Game description inside button:
```tsx
<div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
  {manifest.description}
</div>
```

AI-generated footnote:
```tsx
<div className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>* AI-generated game</div>
```

Error block — add to `index.css` under `[data-theme="yahoo"]`:
```css
[data-theme="yahoo"] .bg-red-500\/20 {
  background: #fff0f0;
}
[data-theme="yahoo"] .border-red-500 {
  border-color: #cc0000;
}
[data-theme="yahoo"] .text-red-200 {
  color: #cc0000;
}
```

**Step 3: Verify visually — toggle to Yahoo mode on Home page**

Check: background `#f0f0ee`, cards white with gray borders, squared corners, Arial font, buttons Yahoo purple.

**Step 4: Commit**

```bash
git add frontend/src/components/Home.tsx frontend/src/index.css
git commit -m "feat: update Home.tsx colors to use CSS vars for Yahoo theme"
```

---

### Task 6: Update SessionLobby.tsx

**Files:**
- Modify: `frontend/src/components/lobby/SessionLobby.tsx`

**Step 1: Import useTheme**

Add at the top:
```tsx
import { useTheme } from '../../contexts/ThemeContext';
```

And inside the component:
```tsx
const { theme } = useTheme();
const isYahoo = theme === 'yahoo';
```

**Step 2: Update Tailwind gray hardcodes**

Replace every `text-gray-400` with `style={{ color: 'var(--text-secondary)' }}`.
Replace `text-gray-300` with `style={{ color: 'var(--text-primary)' }}`.
Replace `bg-gray-700/50`, `bg-gray-700/40`, `bg-gray-700/30`, `bg-gray-700/20` with `style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }}`.

**Step 3: Update inline-styled sections with isYahoo**

Format selector buttons (currently use inline styles with dark amber/brown values):
```tsx
style={{
  background: format === opt.value
    ? (isYahoo ? '#ffffcc' : 'rgba(196,160,48,0.12)')
    : (isYahoo ? '#ffffff' : 'rgba(8,5,0,0.5)'),
  borderColor: format === opt.value
    ? (isYahoo ? '#400090' : 'rgba(196,160,48,0.5)')
    : (isYahoo ? '#cccccc' : 'rgba(42,30,14,0.8)'),
  color: format === opt.value
    ? (isYahoo ? '#400090' : '#E8C870')
    : (isYahoo ? '#666666' : '#8A7A60'),
}}
```

Format warning text:
```tsx
style={{ color: isYahoo ? '#cc6600' : '#E8A030' }}
```

Non-host format display:
```tsx
style={{ color: isYahoo ? '#666666' : '#6A5A40' }}
```

Notice toast:
```tsx
style={{
  background: isYahoo ? 'rgba(64,0,144,0.92)' : 'rgba(20,12,0,0.92)',
  border: isYahoo ? '1px solid rgba(255,255,255,0.4)' : '1px solid rgba(196,168,107,0.5)',
  color: isYahoo ? '#ffffff' : '#F0E6C8',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
  transform: 'translateX(-50%)',
}}
```

Mobile chat overlay background:
```tsx
className={`lg:hidden fixed inset-0 z-50 flex flex-col ${isYahoo ? 'bg-white' : 'bg-stone-900'}`}
```

Mobile chat overlay header/button:
```tsx
<span style={{ color: isYahoo ? '#400090' : undefined }} className={isYahoo ? '' : 'text-amber-200 font-semibold'}>
  Tournament Chat
</span>
<button onClick={() => setShowChat(false)} style={{ color: isYahoo ? '#666666' : undefined }} className={isYahoo ? '' : 'text-amber-200/50 text-xl'}>
  ✕
</button>
```

Chat FAB button:
```tsx
className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-xl ${isYahoo ? 'bg-purple-800 text-white' : 'bg-amber-700 text-white'}`}
```

Chat sidebar border:
```tsx
<div className="hidden lg:flex flex-col w-80 border-l" style={{ borderColor: isYahoo ? '#cccccc' : 'rgba(180,120,10,0.2)' }}>
```

**Step 4: Update `border-amber-900/20` class in SessionLobby**

The tournament chat overlay header border:
```tsx
<div className="flex items-center justify-between p-3 border-b" style={{ borderColor: isYahoo ? '#cccccc' : 'rgba(180,120,10,0.2)' }}>
```

**Step 5: Commit**

```bash
git add frontend/src/components/lobby/SessionLobby.tsx
git commit -m "feat: theme SessionLobby with Yahoo mode support"
```

---

### Task 7: Update ChatPanel.tsx

**Files:**
- Modify: `frontend/src/components/ChatPanel.tsx`

**Step 1: Import useTheme**

```tsx
import { useTheme } from '../contexts/ThemeContext';
```

In the function body (before return):
```tsx
const { theme } = useTheme();
const isYahoo = theme === 'yahoo';
```

**Step 2: Update the panel container**

```tsx
<div
  className="rounded-xl border flex flex-col"
  style={{
    background: isYahoo ? '#ffffff' : 'rgba(8,5,0,0.6)',
    borderColor: isYahoo ? '#cccccc' : '#2A1E0E',
    height: '100%',
    borderRadius: isYahoo ? '0' : undefined,
  }}
>
```

**Step 3: Update empty state**

```tsx
<div className="text-xs text-center py-8" style={{ color: isYahoo ? '#999999' : '#5A4A38' }}>
```

**Step 4: Update message rendering**

Name color:
```tsx
style={{ color: isMe ? (isYahoo ? '#400090' : '#E8C870') : (isYahoo ? '#666666' : '#A09070') }}
```

Spectator label:
```tsx
style={{ color: isYahoo ? '#999999' : '#5A4A38', fontSize: '10px' }}
```

Timestamp:
```tsx
style={{ color: isYahoo ? '#999999' : '#5A4A38', fontSize: '10px' }}
```

Message bubble:
```tsx
style={{
  background: msg.chatScope === 'dm'
    ? (isYahoo ? '#f0eeff' : 'rgba(80,60,120,0.2)')
    : isMe
      ? (isYahoo ? '#ffffcc' : 'rgba(196,160,48,0.15)')
      : (isYahoo ? '#f0f0ee' : 'rgba(42,30,14,0.6)'),
  border: `1px solid ${
    msg.chatScope === 'dm'
      ? (isYahoo ? '#c0a0ff' : 'rgba(120,80,180,0.3)')
      : isMe
        ? (isYahoo ? '#cccc99' : 'rgba(196,160,48,0.3)')
        : (isYahoo ? '#cccccc' : 'rgba(42,30,14,0.8)')
  }`,
  color: isYahoo ? '#000000' : '#D4C8A8',
  borderRadius: isYahoo ? '0' : undefined,
}}
```

**Step 5: Update destination selector border**

```tsx
<div className="px-3 pt-2 pb-1 border-t" style={{ borderColor: isYahoo ? '#cccccc' : '#2A1E0E' }}>
```

Select element:
```tsx
style={{
  background: isYahoo ? '#ffffff' : 'rgba(42,30,14,0.5)',
  border: isYahoo ? '1px solid #999999' : '1px solid rgba(42,30,14,0.8)',
  color: isYahoo ? '#000000' : '#A09070',
  borderRadius: isYahoo ? '0' : undefined,
}}
```

**Step 6: Update input form**

Form border:
```tsx
style={{ borderColor: isYahoo ? '#cccccc' : '#2A1E0E' }}
```

Input element:
```tsx
style={{
  background: isYahoo ? '#ffffff' : 'rgba(42,30,14,0.5)',
  border: isYahoo ? '1px solid #999999' : '1px solid rgba(42,30,14,0.8)',
  color: isYahoo ? '#000000' : '#D4C8A8',
  borderRadius: isYahoo ? '0' : undefined,
}}
```

Send button:
```tsx
style={{
  background: draft.trim()
    ? (isYahoo ? '#400090' : 'rgba(196,160,48,0.25)')
    : (isYahoo ? '#dddddd' : 'rgba(42,30,14,0.4)'),
  border: isYahoo ? '1px solid #999999' : '1px solid rgba(196,160,48,0.3)',
  color: draft.trim()
    ? (isYahoo ? '#ffffff' : '#E8C870')
    : (isYahoo ? '#999999' : '#5A4A38'),
  cursor: draft.trim() ? 'pointer' : 'default',
  borderRadius: isYahoo ? '0' : undefined,
}}
```

**Step 7: Commit**

```bash
git add frontend/src/components/ChatPanel.tsx
git commit -m "feat: theme ChatPanel with Yahoo mode support"
```

---

### Task 8: Update MoveLog.tsx

**Files:**
- Modify: `frontend/src/components/MoveLog.tsx`

**Step 1: Import useTheme**

```tsx
import { useTheme } from '../contexts/ThemeContext';
```

In the function body:
```tsx
const { theme } = useTheme();
const isYahoo = theme === 'yahoo';
```

**Step 2: Update container**

```tsx
<div
  className="rounded-xl border"
  style={{
    background: isYahoo ? '#ffffff' : 'rgba(8,5,0,0.6)',
    borderColor: isYahoo ? '#cccccc' : '#2A1E0E',
    borderRadius: isYahoo ? '0' : undefined,
  }}
>
```

**Step 3: Update header row**

```tsx
<div
  className="px-3 py-2 border-b text-xs font-semibold tracking-wide"
  style={{
    color: isYahoo ? '#666666' : '#907A60',
    borderColor: isYahoo ? '#cccccc' : '#2A1E0E',
  }}
>
```

**Step 4: Update empty state**

```tsx
<div className="px-3 py-4 text-xs text-center" style={{ color: isYahoo ? '#999999' : '#5A4A38' }}>
```

**Step 5: Update move row buttons**

```tsx
style={{
  background: isReplaying
    ? (isYahoo ? '#ffffcc' : 'rgba(196,168,107,0.12)')
    : 'transparent',
  borderBottom: isYahoo ? '1px solid #eeeeee' : '1px solid rgba(42,30,14,0.5)',
  fontSize: '11px',
  color: isReplaying
    ? (isYahoo ? '#000000' : '#F0E6C8')
    : (isYahoo ? '#333333' : '#A09070'),
}}
```

**Step 6: Commit**

```bash
git add frontend/src/components/MoveLog.tsx
git commit -m "feat: theme MoveLog with Yahoo mode support"
```

---

### Task 9: Update GameRules.tsx

**Files:**
- Modify: `frontend/src/components/GameRules.tsx`

**Step 1: Import useTheme**

```tsx
import { useTheme } from '../contexts/ThemeContext';
```

**Step 2: Update `Section` component** (exported helper)

```tsx
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  const isYahoo = theme === 'yahoo';
  return (
    <div>
      <h3
        className="font-bold mb-2 text-sm tracking-wide"
        style={{ color: isYahoo ? '#400090' : '#E8C870' }}
      >
        {title}
      </h3>
      <div style={{ color: isYahoo ? '#000000' : '#A09070' }}>{children}</div>
    </div>
  );
}
```

**Step 3: Update `GameRules` container**

```tsx
export default function GameRules({ gameType }: { gameType: GameType }) {
  const { theme } = useTheme();
  const isYahoo = theme === 'yahoo';
  const RulesComponent = rulesComponents[gameType];
  return (
    <div
      className="rounded-xl p-5 text-sm leading-relaxed space-y-5"
      style={{
        background: isYahoo ? '#ffffff' : 'rgba(8,5,0,0.7)',
        border: isYahoo ? '1px solid #cccccc' : '1px solid rgba(42,30,14,0.8)',
        color: isYahoo ? '#000000' : '#C0A870',
        borderRadius: isYahoo ? '0' : undefined,
      }}
    >
      <Suspense fallback={null}>
        <RulesComponent />
      </Suspense>
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add frontend/src/components/GameRules.tsx
git commit -m "feat: theme GameRules with Yahoo mode support"
```

---

### Task 10: Update GameEndModal.tsx

**Files:**
- Modify: `frontend/src/components/GameEndModal.tsx`

**Step 1: Import useTheme**

```tsx
import { useTheme } from '../contexts/ThemeContext';
```

In the component body (after the early returns):
```tsx
const { theme } = useTheme();
const isYahoo = theme === 'yahoo';
```

**Step 2: Update button styles in `renderButtons`**

The "Play Again" / "Next Game" / "Return to Bracket" primary button:
```tsx
style={{ background: isYahoo ? '#400090' : '#C4A030', color: isYahoo ? '#ffffff' : '#1A1008' }}
```

The "Leave" secondary button currently uses `bg-white/10 hover:bg-white/20 text-white border border-white/20`. In Yahoo mode this won't look right on a white bg. Replace with conditional className:
```tsx
className={`btn px-6 py-2 ${isYahoo ? 'btn-outline' : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'}`}
```

**Step 3: Update modal backdrop**

```tsx
style={{ background: isYahoo ? 'rgba(64,0,144,0.5)' : 'rgba(0,0,0,0.75)' }}
```

**Step 4: Update modal card**

```tsx
style={{
  background: isYahoo ? '#ffffff' : '#1A1008',
  border: isYahoo ? '2px solid #400090' : '1px solid rgba(196,160,48,0.3)',
  borderRadius: isYahoo ? '0' : undefined,
}}
```

**Step 5: Update title and subtitle**

```tsx
style={{ color: isWinner ? (isYahoo ? '#400090' : '#E8C870') : (isYahoo ? '#000000' : '#E8D8B0') }}
```

```tsx
<div className="text-sm mb-4" style={{ color: isYahoo ? '#666666' : '#8A7A60' }}>
```

**Step 6: Update series text badge**

```tsx
style={{
  background: isYahoo ? '#ffffcc' : 'rgba(196,160,48,0.08)',
  border: isYahoo ? '1px solid #cccc99' : '1px solid rgba(196,160,48,0.2)',
  color: isYahoo ? '#400090' : '#C4A030',
  borderRadius: isYahoo ? '0' : undefined,
}}
```

**Step 7: Commit**

```bash
git add frontend/src/components/GameEndModal.tsx
git commit -m "feat: theme GameEndModal with Yahoo mode support"
```

---

### Task 11: Update TournamentBracket.tsx + add ThemeToggle to GameRoom

**Files:**
- Modify: `frontend/src/components/tournament/TournamentBracket.tsx`
- Modify: `frontend/src/components/GameRoom.tsx`

#### Part A: TournamentBracket.tsx

**Step 1: Import useTheme in TournamentBracket**

```tsx
import { useTheme } from '../../contexts/ThemeContext';
```

In `EliminationBracket` component:
```tsx
const { theme } = useTheme();
const isYahoo = theme === 'yahoo';
```

**Step 2: Update SVG connector stroke**

```tsx
stroke={isYahoo ? 'rgba(64,0,144,0.3)' : 'rgba(138,122,96,0.35)'}
```

**Step 3: Update round label**

```tsx
style={{
  color: isYahoo ? '#400090' : '#B09A70',
  borderBottom: `1px solid ${isYahoo ? 'rgba(64,0,144,0.25)' : 'rgba(138,122,96,0.25)'}`,
  letterSpacing: '0.05em',
  textTransform: 'uppercase' as const,
  fontSize: '10px',
}}
```

Do the same for `RoundRobinBracket` if it exists (check the rest of the file and apply the same pattern there). Read from line 200 onward to check.

#### Part B: GameRoom.tsx — add ThemeToggle to header

**Step 1: Import ThemeToggle**

```tsx
import ThemeToggle from './ThemeToggle';
```

**Step 2: Update the header flex row**

Find (around line 628–641):
```tsx
<div className="flex items-center justify-between mb-4">
  <h1 className="text-2xl font-bold">{getGameTitle(session.gameType)}</h1>
  <button
    onClick={() => setShowRules(true)}
    className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-base transition-colors"
    style={{
      background: 'rgba(196,160,48,0.12)',
      border: '1.5px solid rgba(196,160,48,0.35)',
      color: '#C4A030',
    }}
    title="Rules"
  >
    ?
  </button>
</div>
```

Replace with:
```tsx
<div className="flex items-center justify-between mb-4">
  <h1 className="text-2xl font-bold">{getGameTitle(session.gameType)}</h1>
  <div className="flex items-center gap-2">
    <button
      onClick={() => setShowRules(true)}
      className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-base transition-colors"
      style={{
        background: 'rgba(196,160,48,0.12)',
        border: '1.5px solid rgba(196,160,48,0.35)',
        color: '#C4A030',
      }}
      title="Rules"
    >
      ?
    </button>
    <ThemeToggle />
  </div>
</div>
```

**Step 3: Commit**

```bash
git add frontend/src/components/tournament/TournamentBracket.tsx frontend/src/components/GameRoom.tsx
git commit -m "feat: theme TournamentBracket, add ThemeToggle to GameRoom header"
```

---

### Task 12: Final visual QA pass

**Step 1: Start the dev server**

Run: `npm run dev:frontend` and `npm run dev:backend` in separate terminals.

**Step 2: Verify dark mode (default)**

Open http://localhost:5173. Confirm the app looks identical to before — dark background, amber/gold accents, no regressions.

**Step 3: Toggle to Yahoo mode**

Click "☀ Classic" in the top-right corner. Verify:

- [ ] Home page: `#f0f0ee` background, white cards with gray borders, Arial font, squared corners, Yahoo purple buttons
- [ ] "Create Game" / "Join Game" cards: white bg, gray border, squared
- [ ] Game type selector: squared buttons, Yahoo purple when selected, `#ffffcc` highlight
- [ ] Lobby: white cards, gray borders, format selector Yahoo purple/yellow highlight
- [ ] GameRoom: ThemeToggle appears to the right of `?` button; game board visually unchanged
- [ ] Rules panel: white bg, purple section headings, black text
- [ ] Move log: white bg, gray borders, dark text
- [ ] Chat: white bg, purple "my" name, gray "other" name, beige/white message bubbles
- [ ] Game end modal: white card, purple border, purple winner title

**Step 4: Toggle back to dark mode**

Click "🌙 Dark". Confirm full return to dark theme.

**Step 5: Refresh with Yahoo mode active**

Set Yahoo mode, refresh page. Confirm Yahoo mode persists (from localStorage).

**Step 6: Run linter**

Run: `npm run lint`
Expected: No errors.

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: yahoo games light mode QA complete"
```

---

### Task 13: Final integration commit

**Step 1: Run all backend tests**

Run: `npm test`
Expected: All pass (frontend changes don't affect backend tests).

**Step 2: Create PR**

```bash
git push -u origin HEAD
```

Then create a PR targeting `main` with title: "feat: Yahoo Games 2001 light mode theme".
