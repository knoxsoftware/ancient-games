# Chat Panel Theming + Egyptian Default Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Egyptian (parchment/light) theme the default and fully theme ChatPanel using CSS custom properties.

**Architecture:** CSS variables defined in `:root` (classic dark values) and overridden under `[data-theme="egyptian"]` (light parchment values). `ChatPanel.tsx` inline styles reference `var(--chat-*)` instead of hardcoded colors. No React re-renders needed on theme change.

**Tech Stack:** React 18, Tailwind CSS, CSS custom properties, TypeScript

---

### Task 1: Make Egyptian the default theme

**Files:**
- Modify: `frontend/src/services/theme.ts:16`

**Step 1: Change the default fallback**

In `theme.ts`, change line 16 from:
```ts
return stored === EGYPTIAN ? EGYPTIAN : 'classic';
```
to:
```ts
return stored === 'classic' ? 'classic' : EGYPTIAN;
```

This means: only use classic if explicitly stored as 'classic'. Everything else (including new visitors with nothing in localStorage) gets Egyptian.

**Step 2: Verify in browser**

Run `npm run dev:frontend` and open `http://localhost:5173` in a fresh private/incognito window (no localStorage). Confirm the parchment background loads immediately.

**Step 3: Commit**

```bash
git add frontend/src/services/theme.ts
git commit -m "feat(theme): make Egyptian parchment the default theme"
```

---

### Task 2: Add CSS variables for ChatPanel (classic dark values)

**Files:**
- Modify: `frontend/src/index.css` (append after line 276)

**Step 1: Append CSS variable definitions**

Add to the bottom of `frontend/src/index.css`:

```css
/* ── ChatPanel theme tokens ──────────────────────────────────────────── */
:root {
  /* Panel shell */
  --chat-bg: rgba(8, 5, 0, 0.6);
  --chat-border: #2A1E0E;

  /* Header / status bar */
  --chat-header-bg: rgba(20, 12, 0, 0.4);
  --chat-spectator-bg: rgba(20, 12, 0, 0.3);

  /* Seat cards */
  --chat-seat-empty-bg: rgba(8, 5, 0, 0.4);
  --chat-seat-empty-border: rgba(42, 30, 14, 0.6);
  --chat-seat-active-other-border: rgba(196, 160, 48, 0.45);
  --chat-seat-me-bg: rgba(34, 197, 94, 0.06);
  --chat-seat-other-bg: rgba(196, 160, 48, 0.08);

  /* Spectator badge */
  --chat-spectator-badge-bg: rgba(42, 30, 14, 0.5);
  --chat-spectator-badge-border: rgba(42, 30, 14, 0.8);
  --chat-spectator-badge-text: #6A5A40;
  --chat-spectator-me-text: #A09070;

  /* Player name colors */
  --chat-name-me: #A8D8A0;
  --chat-name-other: #C8A850;
  --chat-name-idle: #6A5A40;
  --chat-name-me-suffix: #6A9A60;
  --chat-name-idle-suffix: #4A3A28;
  --chat-score-me: #6A9A60;
  --chat-score-other: #9A7A30;
  --chat-score-idle: #4A3A28;
  --chat-seat-empty-text: #3A2A1A;

  /* Feed area */
  --chat-no-messages: #5A4A38;

  /* Move log entries */
  --chat-move-text: #6A5A40;
  --chat-move-replay-text: #F0E6C8;
  --chat-move-replay-bg: rgba(196, 168, 107, 0.12);
  --chat-move-icon: #3A2A1A;

  /* Chat bubbles */
  --chat-sender-me: #E8C870;
  --chat-sender-other: #A09070;
  --chat-spectator-label: #5A4A38;
  --chat-bubble-me-bg: rgba(196, 160, 48, 0.15);
  --chat-bubble-me-border: rgba(196, 160, 48, 0.3);
  --chat-bubble-other-bg: rgba(42, 30, 14, 0.6);
  --chat-bubble-other-border: rgba(42, 30, 14, 0.8);
  --chat-bubble-dm-bg: rgba(80, 60, 120, 0.2);
  --chat-bubble-dm-border: rgba(120, 80, 180, 0.3);
  --chat-bubble-text: #D4C8A8;
  --chat-timestamp: #5A4A38;

  /* Destination select */
  --chat-select-bg: rgba(42, 30, 14, 0.5);
  --chat-select-border: rgba(42, 30, 14, 0.8);
  --chat-select-text: #A09070;

  /* Input */
  --chat-input-bg: rgba(42, 30, 14, 0.5);
  --chat-input-border: rgba(42, 30, 14, 0.8);
  --chat-input-text: #D4C8A8;

  /* Reactions toggle button */
  --chat-reactions-btn-bg: rgba(42, 30, 14, 0.5);
  --chat-reactions-btn-border: rgba(42, 30, 14, 0.8);
  --chat-reactions-btn-text: #6A5A40;
  --chat-reactions-btn-active-bg: rgba(196, 160, 48, 0.18);
  --chat-reactions-btn-active-border: rgba(196, 160, 48, 0.5);
  --chat-reactions-btn-active-text: #E8C870;

  /* Reactions popover */
  --chat-popover-bg: rgba(18, 12, 4, 0.97);
  --chat-popover-border: #3A2810;
  --chat-popover-item-text: #C4B890;
  --chat-popover-item-hover-bg: rgba(196, 160, 48, 0.12);
  --chat-popover-item-hover-text: #E8C870;

  /* Send button */
  --chat-send-active-bg: rgba(196, 160, 48, 0.25);
  --chat-send-active-border: rgba(196, 160, 48, 0.3);
  --chat-send-active-text: #E8C870;
  --chat-send-idle-bg: rgba(42, 30, 14, 0.4);
  --chat-send-idle-text: #5A4A38;

  /* Boot button */
  --chat-boot-bg: rgba(239, 68, 68, 0.15);
  --chat-boot-border: rgba(239, 68, 68, 0.4);
  --chat-boot-text: #FCA5A5;
}

/* ── Egyptian overrides for ChatPanel ───────────────────────────────── */
[data-theme="egyptian"] {
  /* Panel shell */
  --chat-bg: rgba(240, 232, 208, 0.85);
  --chat-border: #C8A870;

  /* Header / status bar */
  --chat-header-bg: rgba(220, 200, 160, 0.5);
  --chat-spectator-bg: rgba(220, 200, 160, 0.35);

  /* Seat cards */
  --chat-seat-empty-bg: rgba(240, 232, 208, 0.5);
  --chat-seat-empty-border: rgba(180, 140, 80, 0.5);
  --chat-seat-active-other-border: rgba(138, 106, 0, 0.55);
  --chat-seat-me-bg: rgba(34, 120, 60, 0.08);
  --chat-seat-other-bg: rgba(138, 106, 0, 0.10);

  /* Spectator badge */
  --chat-spectator-badge-bg: rgba(200, 170, 100, 0.3);
  --chat-spectator-badge-border: rgba(180, 140, 80, 0.6);
  --chat-spectator-badge-text: #6A5020;
  --chat-spectator-me-text: #4A3010;

  /* Player name colors */
  --chat-name-me: #1A6A2A;
  --chat-name-other: #6A5000;
  --chat-name-idle: #5A4020;
  --chat-name-me-suffix: #2A8A3A;
  --chat-name-idle-suffix: #8A7050;
  --chat-score-me: #1A6A2A;
  --chat-score-other: #6A5000;
  --chat-score-idle: #8A7050;
  --chat-seat-empty-text: #A08860;

  /* Feed area */
  --chat-no-messages: #8A7050;

  /* Move log entries */
  --chat-move-text: #7A6040;
  --chat-move-replay-text: #1A0C04;
  --chat-move-replay-bg: rgba(138, 106, 0, 0.12);
  --chat-move-icon: #A08860;

  /* Chat bubbles */
  --chat-sender-me: #1A6A2A;
  --chat-sender-other: #4A3010;
  --chat-spectator-label: #8A7050;
  --chat-bubble-me-bg: rgba(34, 120, 60, 0.12);
  --chat-bubble-me-border: rgba(34, 120, 60, 0.3);
  --chat-bubble-other-bg: rgba(200, 170, 100, 0.35);
  --chat-bubble-other-border: rgba(180, 140, 80, 0.5);
  --chat-bubble-dm-bg: rgba(80, 60, 120, 0.12);
  --chat-bubble-dm-border: rgba(120, 80, 180, 0.25);
  --chat-bubble-text: #1A0C04;
  --chat-timestamp: #8A7050;

  /* Destination select */
  --chat-select-bg: rgba(200, 170, 100, 0.25);
  --chat-select-border: rgba(180, 140, 80, 0.5);
  --chat-select-text: #4A3010;

  /* Input */
  --chat-input-bg: rgba(240, 232, 208, 0.7);
  --chat-input-border: rgba(180, 140, 80, 0.5);
  --chat-input-text: #1A0C04;

  /* Reactions toggle button */
  --chat-reactions-btn-bg: rgba(200, 170, 100, 0.25);
  --chat-reactions-btn-border: rgba(180, 140, 80, 0.5);
  --chat-reactions-btn-text: #4A3010;
  --chat-reactions-btn-active-bg: rgba(138, 106, 0, 0.2);
  --chat-reactions-btn-active-border: rgba(138, 106, 0, 0.5);
  --chat-reactions-btn-active-text: #6A5000;

  /* Reactions popover */
  --chat-popover-bg: rgba(240, 232, 208, 0.98);
  --chat-popover-border: #C8A870;
  --chat-popover-item-text: #4A3010;
  --chat-popover-item-hover-bg: rgba(138, 106, 0, 0.12);
  --chat-popover-item-hover-text: #2A1800;

  /* Send button */
  --chat-send-active-bg: rgba(138, 106, 0, 0.2);
  --chat-send-active-border: rgba(138, 106, 0, 0.4);
  --chat-send-active-text: #4A3000;
  --chat-send-idle-bg: rgba(200, 170, 100, 0.2);
  --chat-send-idle-text: #A08860;

  /* Boot button stays red, just slightly adjusted */
  --chat-boot-bg: rgba(180, 40, 40, 0.12);
  --chat-boot-border: rgba(180, 40, 40, 0.35);
  --chat-boot-text: #B02020;
}
```

**Step 2: Verify CSS loads without errors**

Run `npm run dev:frontend` — browser console should show no CSS errors.

**Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat(theme): add CSS custom properties for ChatPanel theming"
```

---

### Task 3: Update ChatPanel.tsx to use CSS variables

**Files:**
- Modify: `frontend/src/components/ChatPanel.tsx`

Replace every hardcoded color in inline `style` props with the corresponding `var(--chat-*)`. Go through the file top-to-bottom:

**Step 1: Panel shell (line ~156-162)**

```tsx
<div
  className="rounded-xl border flex flex-col"
  style={{
    background: 'var(--chat-bg)',
    borderColor: 'var(--chat-border)',
    height: '100%',
  }}
>
```

**Step 2: Game Status Bar header div (line ~165-168)**

```tsx
style={{ borderColor: 'var(--chat-border)', background: 'var(--chat-header-bg)' }}
```

**Step 3: Seat card div (line ~183-195)**

```tsx
style={{
  background: isActiveMe
    ? 'var(--chat-seat-me-bg)'
    : isActiveOther
      ? 'var(--chat-seat-other-bg)'
      : 'var(--chat-seat-empty-bg)',
  borderColor: isActiveOther
    ? 'var(--chat-seat-active-other-border)'
    : isActiveMe
      ? undefined
      : 'var(--chat-seat-empty-border)',
}}
```

**Step 4: Player name span (line ~206)**

```tsx
style={{ color: isActiveMe ? 'var(--chat-name-me)' : isActiveOther ? 'var(--chat-name-other)' : 'var(--chat-name-idle)' }}
```

**Step 5: "(you)" suffix span (line ~208-210)**

```tsx
style={{ color: isActiveMe ? 'var(--chat-name-me-suffix)' : 'var(--chat-name-idle-suffix)' }}
```

**Step 6: Score span (line ~213)**

```tsx
style={{ color: isActiveMe ? 'var(--chat-score-me)' : isActiveOther ? 'var(--chat-score-other)' : 'var(--chat-score-idle)' }}
```

**Step 7: Boot button (line ~221-226)**

```tsx
style={{
  background: 'var(--chat-boot-bg)',
  border: '1px solid var(--chat-boot-border)',
  color: 'var(--chat-boot-text)',
}}
```

**Step 8: "Take Seat" button color (line ~234)**

```tsx
style={{ color: 'var(--chat-name-me)' }}
```

**Step 9: "Empty" span (line ~240)**

```tsx
style={{ color: 'var(--chat-seat-empty-text)' }}
```

**Step 10: Spectators row div (line ~251-253)**

```tsx
style={{ borderColor: 'var(--chat-border)', background: 'var(--chat-spectator-bg)' }}
```

**Step 11: Spectator badge span (line ~258-264)**

```tsx
style={{
  background: 'var(--chat-spectator-badge-bg)',
  border: '1px solid var(--chat-spectator-badge-border)',
  color: s.id === currentPlayerId ? 'var(--chat-spectator-me-text)' : 'var(--chat-spectator-badge-text)',
}}
```

**Step 12: "No messages" div (line ~277)**

```tsx
style={{ color: 'var(--chat-no-messages)' }}
```

**Step 13: Move log replay button (line ~291-296)**

```tsx
style={{
  background: isReplaying ? 'var(--chat-move-replay-bg)' : 'transparent',
  fontSize: '11px',
  color: isReplaying ? 'var(--chat-move-replay-text)' : 'var(--chat-move-text)',
}}
```

**Step 14: Move replay icon span (line ~300)**

```tsx
style={{ color: 'var(--chat-move-icon)', fontSize: '10px' }}
```

**Step 15: Sender name span (line ~319-322)**

```tsx
style={{ color: isMe ? 'var(--chat-sender-me)' : 'var(--chat-sender-other)' }}
```

**Step 16: "spectating" label span (line ~325-328)**

```tsx
style={{ color: 'var(--chat-spectator-label)', fontSize: '10px' }}
```

**Step 17: Timestamp span (line ~350)**

```tsx
style={{ color: 'var(--chat-timestamp)', fontSize: '10px' }}
```

**Step 18: Message bubble div (line ~354-374)**

```tsx
style={{
  background:
    msg.chatScope === 'dm'
      ? 'var(--chat-bubble-dm-bg)'
      : isMe
        ? 'var(--chat-bubble-me-bg)'
        : 'var(--chat-bubble-other-bg)',
  border: `1px solid ${
    msg.chatScope === 'dm'
      ? 'var(--chat-bubble-dm-border)'
      : isMe
        ? 'var(--chat-bubble-me-border)'
        : 'var(--chat-bubble-other-border)'
  }`,
  color: 'var(--chat-bubble-text)',
}}
```

**Step 19: Destination select (line ~387-391)**

```tsx
style={{
  background: 'var(--chat-select-bg)',
  border: '1px solid var(--chat-select-border)',
  color: 'var(--chat-select-text)',
}}
```

**Step 20: Form border-t (line ~403-407)**

```tsx
style={{ borderColor: 'var(--chat-border)' }}
```

**Step 21: Reactions popover div (line ~412-419)**

```tsx
style={{
  background: 'var(--chat-popover-bg)',
  border: '1px solid var(--chat-popover-border)',
  boxShadow: '0 -4px 16px rgba(0,0,0,0.3)',
  minWidth: '10rem',
}}
```

**Step 22: Reaction item buttons (line ~420-438)**

```tsx
style={{ color: 'var(--chat-popover-item-text)' }}
onMouseEnter={(e) => {
  (e.currentTarget as HTMLButtonElement).style.background = 'var(--chat-popover-item-hover-bg)';
  (e.currentTarget as HTMLButtonElement).style.color = 'var(--chat-popover-item-hover-text)';
}}
onMouseLeave={(e) => {
  (e.currentTarget as HTMLButtonElement).style.background = '';
  (e.currentTarget as HTMLButtonElement).style.color = 'var(--chat-popover-item-text)';
}}
```

**Step 23: Reactions toggle button (line ~442-458)**

```tsx
style={{
  background: showReactions ? 'var(--chat-reactions-btn-active-bg)' : 'var(--chat-reactions-btn-bg)',
  border: `1px solid ${showReactions ? 'var(--chat-reactions-btn-active-border)' : 'var(--chat-reactions-btn-border)'}`,
  color: showReactions ? 'var(--chat-reactions-btn-active-text)' : 'var(--chat-reactions-btn-text)',
}}
```

**Step 24: Text input (line ~460-470)**

```tsx
style={{
  background: 'var(--chat-input-bg)',
  border: '1px solid var(--chat-input-border)',
  color: 'var(--chat-input-text)',
}}
```

**Step 25: Send button (line ~473-484)**

```tsx
style={{
  background: draft.trim() ? 'var(--chat-send-active-bg)' : 'var(--chat-send-idle-bg)',
  border: '1px solid var(--chat-send-active-border)',
  color: draft.trim() ? 'var(--chat-send-active-text)' : 'var(--chat-send-idle-text)',
  cursor: draft.trim() ? 'pointer' : 'default',
}}
```

**Step 26: Verify visually in browser**

- Toggle between classic and Egyptian — chat panel colors should switch cleanly
- Check both themes: dark (classic) and parchment (Egyptian)
- Check message bubbles, player names, reactions popover, input field

**Step 27: Commit**

```bash
git add frontend/src/components/ChatPanel.tsx
git commit -m "feat(theme): apply CSS variable theming to ChatPanel"
```
