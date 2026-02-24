# Yahoo Games 2001 Light Mode — Design

**Date:** 2026-02-23
**Status:** Approved

## Overview

Add a toggleable "Yahoo Games 2001" light mode to the Ancient Games frontend. The theme recreates the visual aesthetic of Yahoo Games circa 2001: off-white/beige backgrounds, Yahoo purple header bars, flat beveled buttons, Arial/Helvetica fonts, squared corners, and classic web blue links. Game boards are excluded — only the UI shell gets themed.

## Approach

CSS custom properties on `[data-theme="yahoo"]` applied to `<html>`. A `ThemeContext` holds the active theme and persists it to `localStorage`. Existing `.card`, `.btn*`, `.input` component classes in `index.css` are refactored to use CSS variables. No game board code is touched.

## Color Palette

| Token | Dark (current) | Yahoo 2001 |
|---|---|---|
| `--bg-page` | `#111827` (gray-900) | `#f0f0ee` |
| `--bg-panel` | `#1f2937` (gray-800) | `#ffffff` |
| `--bg-input` | `#374151` (gray-700) | `#ffffff` |
| `--border` | `#374151` (gray-700) | `#cccccc` |
| `--border-input` | `#4b5563` (gray-600) | `#999999` |
| `--text-primary` | `#f3f4f6` | `#000000` |
| `--text-secondary` | `#9ca3af` (gray-400) | `#666666` |
| `--text-muted` | `#4b5563` (gray-600) | `#999999` |
| `--text-link` | primary-400 | `#3300cc` |
| `--btn-default-bg` | `#374151` | `#dddddd` |
| `--btn-default-border` | `#4b5563` | `#999999` |
| `--btn-primary-bg` | primary-600 | `#400090` |
| `--btn-primary-hover` | primary-700 | `#5a00b0` |
| `--accent-highlight` | primary-500/20 | `#ffff99` |
| `--error-bg` | red-500/20 | `#fff0f0` |
| `--error-border` | red-500 | `#cc0000` |
| `--error-text` | red-200 | `#cc0000` |

## Typography

- Font family: `Arial, Helvetica, sans-serif` (overrides any modern system font stack)
- `.card` border-radius: `0px` (squared, classic)
- `.btn` border-radius: `0px`
- `.input` border-radius: `0px`

## Components

### New files

- `frontend/src/contexts/ThemeContext.tsx` — React context with `theme: 'dark' | 'yahoo'`, `toggleTheme()`, persists to `localStorage`
- `frontend/src/components/ThemeToggle.tsx` — button that switches themes; label reads "☀ Classic" or "🌙 Dark"

### Modified files

- `frontend/src/index.css` — add `[data-theme="yahoo"]` block with all CSS custom properties; update `.card`, `.btn*`, `.input` to use vars
- `frontend/src/main.tsx` (or `App.tsx`) — wrap tree with `ThemeProvider`; render `ThemeToggle` as fixed overlay (non-GameRoom pages)
- `frontend/src/components/GameRoom.tsx` — render `ThemeToggle` inline to the right of the `?` rules button in the header; remove fixed overlay from GameRoom
- `frontend/src/components/Home.tsx` — replace hardcoded `text-gray-400`, `bg-gray-800`, `border-gray-*` with semantic CSS var-based classes
- `frontend/src/components/ChatPanel.tsx` — same hardcoded color replacement
- `frontend/src/components/MoveLog.tsx` — same
- `frontend/src/components/GameRules.tsx` — same
- `frontend/src/components/GameControls.tsx` — same
- `frontend/src/components/GameEndModal.tsx` — same
- `frontend/src/components/lobby/SessionLobby.tsx` — same
- `frontend/src/components/tournament/TournamentBracket.tsx` — same

### Game boards (not modified)

`UrBoard`, `SenetBoard`, `MorrisBoard`, `WolvesAndRavensBoard`, `RockPaperScissorsBoard`, `StellarSiegeBoard` — all board rendering logic and inline styles are left untouched.

## Toggle Placement

- **GameRoom:** Inline in the header flex row, immediately to the right of the `?` rules button
- **All other pages (Home, lobby, tournament):** Fixed position, `top-4 right-4`, `z-50`

## Persistence

Theme stored in `localStorage` under key `ancient-games-theme`. Defaults to `'dark'` if not set.

## Testing

Manual verification: toggle on Home, GameRoom, lobby, tournament bracket, chat, move log, rules panel, end-game modal. Confirm game boards are visually unchanged in both modes.
