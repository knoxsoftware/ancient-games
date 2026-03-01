# Egyptian Theme Toggle — Design

**Date:** 2026-03-01
**Goal:** Add a runtime toggle between the current Classic theme and the Lapis & Gold Egyptian theme, with persistence in localStorage. The toggle button lives in the session lobby.

## Architecture

A `data-theme` attribute on `<html>` drives all styling changes. No React context or state management is needed — theme is a document-level concern, not a component-level one.

A single module (`frontend/src/services/theme.ts`) owns the toggle logic:
- Reads `localStorage('theme')` on import and applies to `document.documentElement.dataset.theme`
- Exports `toggleTheme()` and `getTheme()`

On app startup, `main.tsx` imports this module so the attribute is set before React renders, preventing a flash of the wrong theme.

## CSS Changes (`index.css`)

Add a `[data-theme="egyptian"]` block that overrides the Tailwind utility classes used across the app:

- `gray-*` shades → lapis blue-blacks (values from the Egyptian theme plan)
- `primary-*` → gold tones (D4AF37 family)
- `secondary-*` → Egyptian turquoise (00BCB4 family)
- `.card`, `.input`, `.btn-primary`, `.btn-outline`, `.btn-secondary` — override via higher specificity
- `body` — add the repeating SVG diamond texture, deepen background to `#030710`
- `my-turn-pulse` animation — swap green RGBA → gold RGBA

The default `@layer components` block stays unchanged. The `[data-theme="egyptian"]` block's higher specificity (attribute + class) overrides it without `!important`.

## Toggle Button (SessionLobby)

Added to the existing top-right action row in both the normal lobby view and the tournament view, next to the feedback ✉ button. Small circular button matching the feedback button's style. Label: `☽` for Egyptian theme active, `◈` for Classic active. `title` attribute shows the full name.

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/index.css` | Add `[data-theme="egyptian"]` override block |
| `frontend/src/services/theme.ts` | New — toggle logic, localStorage persistence |
| `frontend/src/main.tsx` | Import theme service to apply theme before mount |
| `frontend/src/components/lobby/SessionLobby.tsx` | Add theme toggle button to top-right actions |

## Non-Goals

- No Tailwind config changes (colors stay build-time; overrides are runtime CSS)
- No theme toggle on other pages (lobby only, per spec)
- No server-side theme persistence
