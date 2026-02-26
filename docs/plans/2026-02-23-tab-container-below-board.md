# Tab Container Below Board Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move the tab bar and tab content to below the board in GameRoom, and make the tab content fill remaining vertical space.

**Architecture:** Pure JSX reorder in `GameRoom.tsx`. The outer container becomes a flex column that fills the screen; the tab section gets `flex-1 min-h-48` so it expands naturally below the board. No logic, socket, or component changes required.

**Tech Stack:** React 18, Tailwind CSS, TypeScript

---

### Task 1: Reorder layout and update tab content height in GameRoom.tsx

**Files:**
- Modify: `frontend/src/components/GameRoom.tsx`

**Step 1: Make the outer container a full-height flex column**

Find the outermost `<div>` of the game room content (the one that wraps header through board, around line 635). It currently has classes like `max-w-lg mx-auto px-2 py-4` or similar. Add `flex flex-col min-h-screen` (or `h-screen overflow-hidden`) to it so child flex items can expand.

**Step 2: Move the tab bar and tab content block below the board**

Current order (approx lines 678–990):
1. Tab bar (`{/* Tab bar */}`, line ~678)
2. Tab content (`{/* Tab content */}`, line ~712)
3. Game action strip (`{/* Persistent game action strip */}`, line ~950)
4. Board (`{/* Board */}`, line ~965)

New order:
1. Game action strip
2. Board
3. Tab bar
4. Tab content

Cut the two JSX blocks for "Tab bar" and "Tab content" (from the `{/* Tab bar */}` comment through the closing `</div>` of tab content at line ~948) and paste them after the closing `</Suspense>` of the board section.

**Step 3: Change tab content height from fixed to flex-fill**

The tab content wrapper div currently has class `h-64 overflow-y-auto mb-4` (line ~713). Change it to:

```tsx
<div className="flex-1 min-h-48 overflow-y-auto mb-4">
```

**Step 4: Verify in browser**

Run `npm run dev:frontend` and `npm run dev:backend` in separate terminals. Open a game room and confirm:
- Board appears above the tab bar
- Tab content expands to fill space below the board
- Tab content has a usable minimum height on a small viewport
- All tabs (Game, Chat, Room, History, Bracket) still work correctly
- Game action strip appears directly above the board

**Step 5: Commit**

```bash
git add frontend/src/components/GameRoom.tsx
git commit -m "feat: move tab container below board, fill remaining height"
```
