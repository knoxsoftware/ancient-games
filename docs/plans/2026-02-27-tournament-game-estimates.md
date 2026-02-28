# Tournament Game Estimates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show estimated game counts and bye rounds for each tournament format in the lobby, visible to both the host (format selector cards) and non-hosts (format display line).

**Architecture:** Add a pure helper function `getTournamentInfo(format, playerCount)` inside `SessionLobby.tsx` that computes the description string dynamically. Replace the static `opt.desc` in the host selector cards and enrich the non-host display line with the same helper. No new files, no backend changes.

**Tech Stack:** React 18, TypeScript, Tailwind CSS / inline styles (existing patterns in `SessionLobby.tsx`)

---

### Task 1: Add the `getTournamentInfo` helper

**Files:**
- Modify: `frontend/src/components/lobby/SessionLobby.tsx` (add helper before the component, after `FORMAT_OPTIONS`)

**Step 1: Add the helper function**

Insert this function after the `FORMAT_OPTIONS` array (line ~20 in the file):

```typescript
function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Returns the base description for a format, enriched with game count
 * and bye estimates when playerCount >= 2.
 */
function getTournamentInfo(format: TournamentFormat | 'single', playerCount: number): string {
  const baseDesc: Record<TournamentFormat | 'single', string> = {
    single: '1 game, 2 players only',
    bo1: 'Elimination, 1 game per match',
    bo3: 'Elimination, first to 2 wins',
    bo5: 'Elimination, first to 3 wins',
    bo7: 'Elimination, first to 4 wins',
    'round-robin': 'Everyone plays everyone',
  };

  const base = baseDesc[format];

  if (playerCount < 2 || format === 'single') return base;

  if (format === 'round-robin') {
    const games = (playerCount * (playerCount - 1)) / 2;
    return `${base} · ${games} game${games !== 1 ? 's' : ''}`;
  }

  // Bracket formats
  const matches = playerCount - 1;
  const byes = nextPowerOf2(playerCount) - playerCount;

  const maxPerMatch: Record<TournamentFormat, number> = {
    bo1: 1,
    bo3: 3,
    bo5: 5,
    bo7: 7,
    'round-robin': 1,
  };
  const max = maxPerMatch[format as TournamentFormat];
  const min = Math.ceil(max / 2);

  const minGames = matches * min;
  const maxGames = matches * max;
  const gameStr =
    minGames === maxGames
      ? `${minGames} game${minGames !== 1 ? 's' : ''}`
      : `~${minGames}–${maxGames} games`;

  const byeStr = byes > 0 ? ` · ${byes} bye${byes !== 1 ? 's' : ''}` : '';

  return `${base} · ${gameStr}${byeStr}`;
}
```

**Step 2: Verify TypeScript compiles**

```bash
npm run build:backend 2>&1 | tail -5
# (frontend only needs tsc for type check)
cd frontend && npx tsc --noEmit 2>&1 | tail -10
```

Expected: no errors.

**Step 3: Commit**

```bash
git add frontend/src/components/lobby/SessionLobby.tsx
git commit -m "feat: add getTournamentInfo helper for game count estimates"
```

---

### Task 2: Use helper in the host format selector cards

**Files:**
- Modify: `frontend/src/components/lobby/SessionLobby.tsx` (~line 814)

**Step 1: Replace `opt.desc` with dynamic description**

Find this block in the host format selector (inside the `.map` over `FORMAT_OPTIONS`):

```tsx
<div className="text-xs mt-0.5 opacity-70">{opt.desc}</div>
```

Replace with:

```tsx
<div className="text-xs mt-0.5 opacity-70">
  {getTournamentInfo(opt.value, session.players.length)}
</div>
```

**Step 2: Verify in browser**

- Start the dev server: `npm run dev:frontend` and `npm run dev:backend`
- Create a lobby, add 2–5 players, switch between formats
- Selector cards should show game estimates that update as players join

**Step 3: Commit**

```bash
git add frontend/src/components/lobby/SessionLobby.tsx
git commit -m "feat: show game estimates in host format selector cards"
```

---

### Task 3: Enrich the non-host format display line

**Files:**
- Modify: `frontend/src/components/lobby/SessionLobby.tsx` (~line 829)

**Step 1: Find the non-host display block**

```tsx
{!isHost && (
  <div className="mb-6 text-sm" style={{ color: '#6A5A40' }}>
    Format: {FORMAT_OPTIONS.find((o) => o.value === format)?.label ?? 'Single Match'} —
    waiting for host to start
  </div>
)}
```

**Step 2: Replace with enriched version**

```tsx
{!isHost && (
  <div className="mb-6 text-sm" style={{ color: '#6A5A40' }}>
    Format: {FORMAT_OPTIONS.find((o) => o.value === format)?.label ?? 'Single Match'}
    {' '}—{' '}
    <span className="opacity-70">{getTournamentInfo(format, session.players.length)}</span>
    {' '}— waiting for host to start
  </div>
)}
```

**Step 3: Verify in browser**

- Open the lobby as a non-host
- Confirm format label + description + game estimate shows correctly

**Step 4: Commit**

```bash
git add frontend/src/components/lobby/SessionLobby.tsx
git commit -m "feat: show game estimates in non-host format display"
```

---

### Task 4: Edge case check

Manually verify these cases work correctly:

| Players | Format | Expected |
|---------|--------|----------|
| 1 | bo3 | Base desc only (no estimates — < 2 players) |
| 2 | bo1 | `Elimination, 1 game per match · 1 game` (no byes: 2 is a power of 2) |
| 3 | bo3 | `Elimination, first to 2 wins · ~4–6 games · 1 bye` |
| 4 | bo5 | `Elimination, first to 3 wins · ~9–15 games` (no byes: 4 is a power of 2) |
| 5 | bo7 | `Elimination, first to 4 wins · ~16–28 games · 3 byes` |
| 4 | round-robin | `Everyone plays everyone · 6 games` |
| 2 | single | `1 game, 2 players only` (no enrichment for single) |

If any case looks wrong, fix `getTournamentInfo` logic before proceeding.

**Commit after any fixes:**

```bash
git add frontend/src/components/lobby/SessionLobby.tsx
git commit -m "fix: correct tournament game estimate edge cases"
```
