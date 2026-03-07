# Egyptian Theme (Lapis & Gold) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Retheme the entire Ancient Games platform with a Lapis & Gold Egyptian aesthetic: deep blue-black backgrounds, gold primary, Egyptian turquoise secondary, and a subtle geometric diamond texture.

**Architecture:** Override Tailwind's `gray` palette to blue-tinted darks, replace primary/secondary palettes with gold/turquoise, and add a repeating SVG diamond pattern texture to the body in `index.css`. All existing `gray-*` utility classes in components automatically adopt the new palette — no component-level changes needed except for the `my-turn-pulse` animation (currently green → gold).

**Tech Stack:** Tailwind CSS (tailwind.config.js), PostCSS, React 18, Vite

---

### Task 1: Replace Tailwind color palettes

**Files:**
- Modify: `frontend/tailwind.config.js`

**Step 1: Replace the entire file content**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Override gray → blue-black lapis tones (applied everywhere gray-* is used)
        gray: {
          50:  '#eef1f7',
          100: '#d4dbe9',
          200: '#b0bdd1',
          300: '#8a9bb8',
          400: '#6a7fa0',
          500: '#4e6285',
          600: '#354d6e',
          700: '#1e3354',
          800: '#0e1f3a',
          900: '#060e1f',
          950: '#030710',
        },
        primary: {
          50:  '#fef9e7',
          100: '#fdf0c3',
          200: '#fbe497',
          300: '#f9d76b',
          400: '#f7cc46',
          500: '#D4AF37',
          600: '#B8960C',
          700: '#9A7D0A',
          800: '#7D6408',
          900: '#5E4B05',
        },
        secondary: {
          50:  '#e0f7f5',
          100: '#b3ece7',
          200: '#80dfd9',
          300: '#4dd2ca',
          400: '#26c7be',
          500: '#00BCB4',
          600: '#00A89C',
          700: '#008F85',
          800: '#00776E',
          900: '#005550',
        },
      },
    },
  },
  plugins: [],
};
```

**Step 2: Verify dev server compiles cleanly**

```bash
npm run dev:frontend
```

Expected: No compilation errors. Site should now show blue-black backgrounds (dark navy instead of neutral gray) everywhere `gray-*` classes were used.

**Step 3: Commit**

```bash
git add frontend/tailwind.config.js
git commit -m "feat(theme): replace gray/primary/secondary palettes with Egyptian lapis & gold"
```

---

### Task 2: Update global CSS — body texture + component classes

**Files:**
- Modify: `frontend/src/index.css`

**Step 1: Replace the `@layer base` body rule and `.card`/`.input`/`.btn-outline` component classes**

In `index.css`, find and replace the `@layer base` block:

```css
@layer base {
  body {
    @apply bg-gray-950 text-gray-100 min-h-screen;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Cpath d='M12 2L22 12L12 22L2 12Z' fill='none' stroke='%23C9A030' stroke-width='0.35' stroke-opacity='0.18'/%3E%3C/svg%3E");
    background-size: 24px 24px;
  }

  * {
    @apply touch-manipulation;
  }
}
```

And replace the `@layer components` block:

```css
@layer components {
  .btn {
    @apply px-4 py-2 rounded-lg font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed;
  }

  .btn-primary {
    @apply bg-primary-600 hover:bg-primary-500 text-gray-950 shadow-lg active:scale-95;
  }

  .btn-secondary {
    @apply bg-secondary-700 hover:bg-secondary-600 text-white shadow-lg active:scale-95;
  }

  .btn-outline {
    @apply border-2 border-primary-500 text-primary-400 hover:bg-primary-600 hover:text-gray-950 active:scale-95;
  }

  .card {
    @apply bg-gray-900 rounded-xl shadow-2xl p-6 border border-gray-700;
  }

  .input {
    @apply bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent;
  }
}
```

Note: `bg-gray-950` is the new deepest background (`#030710`). `.btn-primary` text becomes `text-gray-950` (near-black on gold) for high contrast.

**Step 2: Update `my-turn-pulse` animation — green → gold**

Find the `my-turn-pulse` keyframes and replace:

```css
@keyframes my-turn-pulse {
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

**Step 3: Verify visually**

Run `npm run dev:frontend` and open the app. Check:
- Body has visible (subtle) diamond tile pattern
- "My turn" pulse on game board is gold, not green
- Buttons: primary buttons show gold background with dark text (high contrast)
- Cards and inputs use the blue-navy palette

**Step 4: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat(theme): add Egyptian diamond texture, gold pulse animation, high-contrast buttons"
```

---

### Task 3: Polish — Home page title gradient

**Files:**
- Modify: `frontend/src/components/Home.tsx`

The title currently uses `from-primary-400 to-secondary-400`. With the new palettes this still works, but explicitly check the rendered gradient reads gold → turquoise. If it looks good, no change needed.

If it looks washed out, update line ~91:

```tsx
<h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-primary-400 via-primary-300 to-secondary-400 bg-clip-text text-transparent">
```

**Step 1: Check visually in browser** — no code change unless gradient looks poor.

**Step 2: Commit if changed**

```bash
git add frontend/src/components/Home.tsx
git commit -m "fix(theme): sharpen Home title gradient for lapis & gold palette"
```

---

### Task 4: Senet board enhancement (bonus — same session)

The SenetBoard already has good Egyptian piece shapes, but its board frame color (`#7A5628` brown) now clashes with the blue-black platform. Consider updating the board frame to use a dark lapis tone with gold border.

**Files:**
- Modify: `frontend/src/components/games/senet/SenetBoard.tsx`

Find the board wrapper `<div>` around line 395–400:

```tsx
// Change:
background: 'linear-gradient(160deg, #7A5628 0%, #9A7040 50%, #7A5628 100%)',
borderColor: '#4A3010',

// To:
background: 'linear-gradient(160deg, #0A1628 0%, #0E2040 50%, #0A1628 100%)',
borderColor: '#8A6C1A',
```

Also update the turn-around indicator color and legend border from `#4A3010` / `#C4A870` to `#1E3354` / `#C9A030`.

**Step 1: Apply the changes**

**Step 2: Check board still renders correctly with pieces visible**

**Step 3: Commit**

```bash
git add frontend/src/components/games/senet/SenetBoard.tsx
git commit -m "feat(senet): align board frame to lapis & gold platform theme"
```
