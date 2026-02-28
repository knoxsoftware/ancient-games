# Ur: Cursed Paths — Roguelike Variant Design

Date: 2026-02-27

## Overview

A variant of the Royal Game of Ur (`ur-roguelike`) with roguelike features layered on top of the base rules. Players draft asymmetric power-ups before the race begins, and mid-game event squares trigger random effects when landed on. The base Ur race mechanics are unchanged.

## Game Flow

### Phase 1 — Draft

Before the first dice roll, each player is dealt 3 power-up options (drawn from a shuffled pool) and picks 1. The chosen power-up is added to that player's modifier list and is visible to both players.

Socket events:
- `game:draft-offer` (server → client): sent to each player with their 3 options
- `game:draft-pick` (client → server): player selects one option by ID

Draft completes when both players have picked. `draftPhase` flips to `false` and normal play begins.

### Phase 2 — Race

Standard Ur rules apply. Three squares on the shared track are randomly designated as **event squares** at game start (chosen from candidate positions 5, 7, 9 — randomized each game). Event squares are visible to both players.

When a piece lands on an event square:
- Server draws a random event from the event pool
- Applies the effect immediately
- Emits `game:event-triggered` with `{ eventId, description, affectedPieces }`
- The square reverts to a normal square (one-time trigger)

### Phase 3 — Win

Same as base Ur: first player to move all 7 pieces off the board wins.

---

## Modifier System

### Data Shape

Added to `BoardState`:

```ts
interface Modifier {
  id: string;
  owner: number | 'global';
  remainingUses: number | null; // null = permanent for the game
  params?: Record<string, unknown>;
}
```

New `BoardState` fields:
- `modifiers: Modifier[]`
- `eventSquares: number[]`
- `draftPhase: boolean`
- `draftOffers?: { player: number; options: string[] }[]`

---

## Power-Up Pool (Draft — Pick 1 of 3)

| ID | Name | Effect |
|---|---|---|
| `double_roll` | Loaded Dice | Once per game: roll twice, take the higher result |
| `ghost_piece` | Ghost Piece | One of your pieces is immune to capture for the entire game (applies to the first piece you move after drafting) |
| `safe_passage` | Ward | Your pieces on shared squares cannot be captured — 3 uses |
| `reroll` | Fickle Fate | Once per game: reroll after seeing your dice result |
| `extra_move` | Surge | Once per game: after moving, move a second piece using the same roll |
| `slow_curse` | Hex | Once per game: force opponent to skip their next turn |

---

## Event Pool (Mid-Game — Triggered by Landing on Event Squares)

| ID | Name | Effect |
|---|---|---|
| `board_flip` | Reversal | Current player may move any one of their pieces backward by 1 |
| `piece_swap` | Transposition | Swap the positions of one of your pieces and one of your opponent's pieces |
| `opponent_setback` | Stumble | Send the opponent's most-advanced piece back 2 squares |
| `extra_turn` | Fortune | Current player gets an extra turn immediately |
| `rosette_shift` | Shifting Stars | One random non-rosette shared square becomes a rosette for the rest of the game |
| `dice_curse` | Loaded Against | Opponent's next roll is halved (round down, minimum 1) |
| `free_entry` | Rush | Immediately place one off-board piece at position 0 |
| `barrier` | Blockade | A random shared square becomes impassable for 3 turns |

---

## Architecture

### Backend

- `backend/src/games/ur-roguelike/UrRoguelikeGame.ts` — extends `UrGame`; overrides `initializeBoard`, `applyMove`, `rollDice`; adds draft and event logic
- Register `ur-roguelike` in `GameRegistry.ts`
- Add `GameType` union entry and `GameManifest` entry in `shared/types/game.ts`
- New socket events added to `gameHandlers.ts`: `game:draft-offer`, `game:draft-pick`

Modifier effects applied inline:
- `rollDice` override checks for `double_roll` / `reroll` modifiers
- `applyMove` override checks for `ghost_piece`, `safe_passage`, `slow_curse`, `extra_move`, and event square triggers

### Frontend

- `frontend/src/components/games/ur-roguelike/UrRoguelikeBoard.tsx` — wraps base Ur board visually; adds draft overlay and event square indicators
- Draft phase: modal showing 3 power-up cards, player picks 1 (opponent sees a waiting state)
- Active modifiers: small badges on the player info panel
- Event squares: distinct glyph on board; triggered events show a toast/brief animation
- Register in `boardComponents` (GameRoom), `rulesComponents` (GameRules)

### State Flow

```
game:start → initializeBoard (draftPhase: true, eventSquares set, draftOffers generated)
  → game:draft-offer × 2
  → game:draft-pick × 2 → draftPhase: false
  → normal Ur socket flow (roll → move → …)
      └─ applyMove checks modifiers on every move
      └─ landing on eventSquare → draw event → apply → game:event-triggered
```

---

## Future Work (Tournaments)

In tournament mode, players could accumulate a small meta-progression currency (e.g. "relics") from wins that unlock additional power-ups in the draft pool across matches. This is explicitly out of scope for the initial implementation.
