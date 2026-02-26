# AI Opponent Design

**Date:** 2026-02-26
**Scope:** Ur (first pass); extensible to all games

## Overview

Add bot players that can occupy seats in a game session alongside human players. Bots use Expectiminimax (Ur) or Minimax (deterministic games) for move selection. An optional Ollama integration provides in-character chat commentary on notable moments.

## Data Model

### Player type extension (`shared/types/`)

```ts
interface Player {
  // ...existing fields...
  isBot?: boolean;
  botDifficulty?: 'easy' | 'medium' | 'hard' | 'harder' | 'hardest';
  botPersona?: string; // display name for the bot, e.g. "Ancient Strategist"
}
```

### Session type extension

```ts
interface Session {
  // ...existing fields...
  botConfig?: {
    ollamaModel?: string;   // e.g. "llama3.2:1b"
    ollamaEnabled: boolean;
  };
}
```

### New REST endpoint

`POST /api/sessions/:code/add-bot`
- Auth: host only (checked via `hostId`)
- Body: `{ difficulty: Difficulty, persona?: string }`
- Creates a bot player with a nanoid, adds to session `players` with `isBot: true`
- Returns updated session

## AI Engine Layer

### File structure

```
backend/src/ai/
  AiEngine.ts               # abstract interface
  ExpectiminiMaxEngine.ts   # for stochastic games (Ur, Senet)
  MinimaxEngine.ts          # for deterministic games (Morris, W&R, Fox & Geese, Stellar Siege)
  OllamaService.ts          # chat commentary via HTTP to local Ollama
  BotService.ts             # orchestrator — manages bot turns, wires everything together
```

### AiEngine interface

```ts
interface AiEngine {
  selectMove(board: BoardState, playerNumber: number, diceRoll: number, difficulty: Difficulty): Move;
}
```

### Difficulty → search depth mapping

| Difficulty | Depth | Notes                                    |
|------------|-------|------------------------------------------|
| Easy       | 1     | + 20% chance of random move              |
| Medium     | 2     |                                          |
| Hard       | 3     |                                          |
| Harder     | 4     |                                          |
| Hardest    | 5     |                                          |

### ExpectiminiMax (Ur)

Dice probabilities (4 binary tetrahedral dice, binomial):

| Roll | Probability |
|------|-------------|
| 0    | 1/16        |
| 1    | 4/16        |
| 2    | 6/16        |
| 3    | 4/16        |
| 4    | 1/16        |

**Evaluation function** (from bot's perspective):

- **Advancement score:** sum of piece positions (0 = off, 1–14 = on board, 15 = finished). Finished pieces score maximum.
- **Rosette bonus:** +1.5 per piece on a rosette (safe + extra turn potential)
- **Capture threat bonus:** +2 for each opponent piece in capture range
- **Safety penalty:** -1.5 for each own piece in opponent's capture range (shared section only, not on rosette)

### BotService

- Singleton instantiated in `server.ts` with access to `io` and `sessionService`
- Receives `notifyBotTurn(sessionCode, botPlayerId, board)` from `gameHandlers.ts` after:
  1. `game:move` resolves and `newBoard.currentTurn` belongs to a bot
  2. `game:dice-rolled` resolves with `canMove: true` and current player is a bot
- Bot turn sequence:
  1. Wait 500–1500ms (randomized thinking delay)
  2. Call `gameEngine.rollDice()`
  3. Update board state via `sessionService`
  4. Emit `game:dice-rolled` to session room
  5. If `canMove`: call `AiEngine.selectMove()`, emit `game:move` to session room
  6. If `!canMove`: emit `game:turn-changed`
  7. Check for notable move → async Ollama call → `chat:send`

## Ollama Integration

### OllamaService

- Calls `http://localhost:11434/api/generate` (standard Ollama HTTP API)
- 3-second timeout; gracefully no-ops if Ollama is unreachable
- Prompt template:

```
You are {persona}, an ancient game master playing The Royal Game of Ur.
You just made this move: {moveDescription}.
Board state: {briefBoardSummary}.
React in 1-2 sentences, in character. Be terse and confident.
```

### Commentary triggers

- Piece captures an opponent
- Piece lands on a rosette
- Piece exits the board (scores)
- Human player sends a chat message @-mentioning the bot's display name

### Chat delivery

- Message sent as the bot player's ID and display name via the existing `chat:send` pathway
- Stored in session `chatHistory` like any other message

## Lobby UI

- **"Add Bot" button** appears for the host below the seated player list
- Clicking opens an inline form:
  - Difficulty dropdown: Easy / Medium / Hard / Harder / Hardest
  - Optional persona name input (defaults to "Bot")
  - Ollama model input (optional, defaults to `llama3.2:1b`)
  - Ollama enabled toggle
- Bot appears in the player list with a robot icon badge
- Session-level "AI commentary: on/off" indicator shown if `ollamaEnabled`
- Host can remove a bot player (same as kicking a human to spectator, then removing)

## Scope

- **First pass:** Ur only (ExpectiminiMax)
- **Future:** Minimax for Morris, Wolves & Ravens, Fox & Geese, Stellar Siege

## Out of scope

- Rock Paper Scissors (trivially random; no strategic depth)
- Senet (deferred — similar to Ur but lower priority)
- AI vs AI sessions
- Cloud-hosted LLMs (Ollama local only for now)
