# AI Opponents Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add bot players to game sessions that use Expectiminimax for Ur, with optional Ollama chat commentary in character.

**Architecture:** `BotService` is a backend singleton that listens for game events and drives bot turns by calling the same `SessionService` methods and emitting to `io` directly — no fake socket connection needed. Bots occupy real `Player` seats with `isBot: true`. `OllamaService` is called async after notable moves to generate chat commentary.

**Tech Stack:** TypeScript, Node.js, Socket.io (server-side emit), Ollama HTTP API (`http://localhost:11434`), React + Tailwind (lobby UI), Vitest (tests).

---

## Key File Paths (read these before starting)

- `shared/types/game.ts` — `Player`, `Session`, `BoardState`, `Move` types
- `backend/src/games/GameEngine.ts` — abstract engine interface
- `backend/src/games/ur/UrGame.ts` — Ur engine (positions 0–13, rosettes at 2/6/13, -1=off, 99=finished)
- `backend/src/socket/gameHandlers.ts` — all game socket events; you will add `notifyBotTurn` calls here
- `backend/src/routes/sessions.ts` — REST routes; add `add-bot` endpoint here
- `backend/src/services/SessionService.ts` — add `addBotPlayer` method here
- `backend/src/server.ts` — instantiate `BotService` here
- `frontend/src/components/lobby/SessionLobby.tsx` — add "Add Bot" UI here
- `frontend/src/services/api.ts` — add `addBot` API call here

---

## Task 1: Extend shared types

**Files:**
- Modify: `shared/types/game.ts`

**Context:** `Player` needs `isBot`, `botDifficulty`, and `botPersona` optional fields. `Session` needs `botConfig`. These flow through to MongoDB automatically via Mongoose's flexible schema.

**Step 1: Add the types**

In `shared/types/game.ts`, add to the `Player` interface (after `awayAt`):

```ts
isBot?: boolean;
botDifficulty?: 'easy' | 'medium' | 'hard' | 'harder' | 'hardest';
botPersona?: string;
```

Add a new `BotDifficulty` export type for convenience:

```ts
export type BotDifficulty = 'easy' | 'medium' | 'hard' | 'harder' | 'hardest';
```

Add to the `Session` interface (you'll need to find it in `shared/types/socket-events.ts` or wherever `Session` is defined — check `shared/types/`):

```ts
botConfig?: {
  ollamaEnabled: boolean;
  ollamaModel?: string;
};
```

**Step 2: Rebuild shared**

```bash
npm run build --workspace=shared
```

Expected: no errors.

**Step 3: Commit**

```bash
git add shared/types/game.ts
git commit -m "feat(shared): add bot player types to Player and Session"
```

---

## Task 2: Add `addBotPlayer` to SessionService

**Files:**
- Modify: `backend/src/services/SessionService.ts`

**Context:** Creates a bot player with a nanoid ID, adds it to the session's `players` array with `isBot: true`. Checks host permission and that there are fewer than 2 players currently (for single-match games).

**Step 1: Write the failing test**

In `backend/src/services/SessionService.test.ts` (create if doesn't exist, or add to existing):

```ts
describe('addBotPlayer', () => {
  it('adds a bot player to a session', async () => {
    // Create a session first (use existing test helpers or create via sessionService.createSession)
    // Then:
    const result = await sessionService.addBotPlayer(sessionCode, hostPlayerId, {
      difficulty: 'medium',
      persona: 'Ancient Strategist',
    });
    const bot = result.players.find((p) => p.isBot);
    expect(bot).toBeDefined();
    expect(bot?.botDifficulty).toBe('medium');
    expect(bot?.botPersona).toBe('Ancient Strategist');
    expect(bot?.displayName).toBe('Ancient Strategist');
    expect(bot?.playerNumber).toBe(1); // second seat
  });
});
```

**Step 2: Run to see it fail**

```bash
npm test --workspace=backend
```

Expected: test fails with "addBotPlayer is not a function".

**Step 3: Implement `addBotPlayer`**

In `SessionService.ts`, add this method (import `nanoid` from the existing import at top, and `BotDifficulty` from shared):

```ts
async addBotPlayer(
  sessionCode: string,
  requesterId: string,
  opts: { difficulty: BotDifficulty; persona?: string },
): Promise<Session> {
  const session = await this.getSession(sessionCode);
  if (!session) throw new Error('Session not found');
  if (session.hostId !== requesterId) throw new Error('Only the host can add bots');
  if (session.players.length >= 2) throw new Error('Session is full');

  const persona = opts.persona ?? 'Bot';
  const botId = nanoid(); // reuse existing nanoid from top of file
  const botPlayer: Player = {
    id: botId,
    displayName: persona,
    socketId: 'bot',
    ready: true,
    playerNumber: session.players.length, // 0 or 1
    status: 'active',
    isBot: true,
    botDifficulty: opts.difficulty,
    botPersona: persona,
  };

  await SessionModel.updateOne(
    { sessionCode },
    { $push: { players: botPlayer } },
  );

  return (await this.getSession(sessionCode))!;
}
```

**Step 4: Run tests**

```bash
npm test --workspace=backend
```

Expected: new test passes.

**Step 5: Commit**

```bash
git add backend/src/services/SessionService.ts
git commit -m "feat(backend): add addBotPlayer to SessionService"
```

---

## Task 3: Add REST endpoint `POST /api/sessions/:code/add-bot`

**Files:**
- Modify: `backend/src/routes/sessions.ts`

**Step 1: Add the route**

In `sessions.ts`, after the existing `GET /sessions/:sessionCode` route, add:

```ts
// Add a bot player (host only)
router.post('/sessions/:sessionCode/add-bot', async (req, res) => {
  try {
    const { sessionCode } = req.params;
    const { requesterId, difficulty, persona } = req.body;

    if (!requesterId || !difficulty) {
      return res.status(400).json({ error: 'requesterId and difficulty are required' });
    }

    const validDifficulties = ['easy', 'medium', 'hard', 'harder', 'hardest'];
    if (!validDifficulties.includes(difficulty)) {
      return res.status(400).json({ error: 'Invalid difficulty' });
    }

    const session = await sessionService.addBotPlayer(sessionCode, requesterId, {
      difficulty,
      persona,
    });

    res.json(session);
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('host') || msg.includes('full') ? 400 : 500;
    res.status(status).json({ error: msg });
  }
});
```

**Step 2: Manually test with curl**

```bash
# Start backend: npm run dev:backend
curl -X POST http://localhost:3000/api/sessions/TESTCODE/add-bot \
  -H "Content-Type: application/json" \
  -d '{"requesterId":"HOST_PLAYER_ID","difficulty":"medium","persona":"Ancient Strategist"}'
```

Expected: 200 with updated session JSON containing bot player.

**Step 3: Commit**

```bash
git add backend/src/routes/sessions.ts
git commit -m "feat(backend): add POST /sessions/:code/add-bot endpoint"
```

---

## Task 4: Implement `OllamaService`

**Files:**
- Create: `backend/src/ai/OllamaService.ts`

**Context:** Calls `http://localhost:11434/api/generate` with a 3-second timeout. Returns empty string if Ollama is unreachable. Used by BotService after notable moves.

**Step 1: Write the test**

Create `backend/src/ai/OllamaService.test.ts`:

```ts
import { OllamaService } from './OllamaService';

describe('OllamaService', () => {
  it('returns empty string when Ollama is unreachable', async () => {
    const svc = new OllamaService('http://localhost:19999'); // bad port
    const result = await svc.generateComment({
      persona: 'Test Bot',
      gameName: 'Royal Game of Ur',
      moveDescription: 'moved piece from position 3 to position 7',
      boardSummary: '3 pieces on board',
    });
    expect(result).toBe('');
  });
});
```

**Step 2: Run to see it fail**

```bash
npm test --workspace=backend -- OllamaService
```

Expected: fails — module not found.

**Step 3: Implement**

Create `backend/src/ai/OllamaService.ts`:

```ts
interface CommentContext {
  persona: string;
  gameName: string;
  moveDescription: string;
  boardSummary: string;
}

export class OllamaService {
  private baseUrl: string;
  private model: string;

  constructor(baseUrl = 'http://localhost:11434', model = 'llama3.2:1b') {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async generateComment(ctx: CommentContext): Promise<string> {
    const prompt = `You are ${ctx.persona}, an ancient game master playing ${ctx.gameName}.
You just made this move: ${ctx.moveDescription}.
Board state: ${ctx.boardSummary}.
React in 1-2 sentences, in character. Be terse and confident. No quotes.`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt, stream: false }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) return '';
      const data = await response.json() as { response?: string };
      return (data.response ?? '').trim();
    } catch {
      return '';
    }
  }
}
```

**Step 4: Run tests**

```bash
npm test --workspace=backend -- OllamaService
```

Expected: passes.

**Step 5: Commit**

```bash
git add backend/src/ai/OllamaService.ts backend/src/ai/OllamaService.test.ts
git commit -m "feat(backend): add OllamaService for bot chat commentary"
```

---

## Task 5: Implement `ExpectiminiMaxEngine` for Ur

**Files:**
- Create: `backend/src/ai/ExpectiminiMaxEngine.ts`
- Create: `backend/src/ai/ExpectiminiMaxEngine.test.ts`

**Context:** Ur dice probabilities: 0=1/16, 1=4/16, 2=6/16, 3=4/16, 4=1/16.
Evaluation function (from bot's POV as `playerNumber`):
- Sum of piece positions (0=off-board scores 0, position 1–14 scores position value, 99=finished scores 15)
- +1.5 for each own piece on a rosette (positions 2, 6, 13)
- -1.5 for each own piece in shared section (positions 4–11) not on rosette (capture risk)
- +2 for each opponent piece in shared section that the bot can capture this turn

Difficulty → depth: easy=1, medium=2, hard=3, harder=4, hardest=5.
Easy also picks a random move 20% of the time instead of best move.

**Step 1: Write failing tests**

Create `backend/src/ai/ExpectiminiMaxEngine.test.ts`:

```ts
import { ExpectiminiMaxEngine } from './ExpectiminiMaxEngine';
import { UrGame } from '../games/ur/UrGame';
import { BoardState } from '@ancient-games/shared';

const engine = new ExpectiminiMaxEngine(new UrGame());

function makeBoard(overrides: Partial<BoardState> = {}): BoardState {
  const base = new UrGame().initializeBoard();
  return { ...base, ...overrides };
}

describe('ExpectiminiMaxEngine', () => {
  it('returns a valid move from getValidMoves', () => {
    const game = new UrGame();
    const board = game.initializeBoard();
    // Give player 0 a dice roll of 2 with a piece off-board
    const testBoard = { ...board, diceRoll: 2, currentTurn: 0 };
    const moves = game.getValidMoves(testBoard, 0, 2);
    if (moves.length === 0) return; // nothing to assert if no moves

    const selected = engine.selectMove(testBoard, 0, 2, 'medium');
    expect(moves.some((m) => m.pieceIndex === selected.pieceIndex && m.to === selected.to)).toBe(true);
  });

  it('prefers a finishing move when available', () => {
    // Piece at position 13 (last position before exit), dice roll = 1 → to=99
    const pieces = [
      { playerNumber: 0, pieceIndex: 0, position: 13 },
      // All other pieces finished
      ...Array.from({ length: 6 }, (_, i) => ({ playerNumber: 0, pieceIndex: i + 1, position: 99 })),
      ...Array.from({ length: 7 }, (_, i) => ({ playerNumber: 1, pieceIndex: i, position: 99 })),
    ];
    const board: BoardState = { pieces, currentTurn: 0, diceRoll: 1, lastMove: null };
    const selected = engine.selectMove(board, 0, 1, 'hard');
    expect(selected.to).toBe(99);
  });
});
```

**Step 2: Run to see fail**

```bash
npm test --workspace=backend -- ExpectiminiMax
```

Expected: module not found.

**Step 3: Implement**

Create `backend/src/ai/ExpectiminiMaxEngine.ts`:

```ts
import { BoardState, Move, BotDifficulty } from '@ancient-games/shared';
import { UrGame } from '../games/ur/UrGame';

const DICE_PROBS = [1/16, 4/16, 6/16, 3/16, 4/16, 1/16]; // index = roll value (0–4, index 5 unused)
// Corrected: [0]=1/16, [1]=4/16, [2]=6/16, [3]=4/16, [4]=1/16
const UR_DICE_PROBS: number[] = [1/16, 4/16, 6/16, 4/16, 1/16];

const ROSETTES = new Set([2, 6, 13]);
const SHARED_START = 4;
const SHARED_END = 11;
const PATH_LENGTH = 14;

const DEPTH_MAP: Record<BotDifficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
  harder: 4,
  hardest: 5,
};

export class ExpectiminiMaxEngine {
  private game: UrGame;

  constructor(game: UrGame) {
    this.game = game;
  }

  selectMove(board: BoardState, playerNumber: number, diceRoll: number, difficulty: BotDifficulty): Move {
    const moves = this.game.getValidMoves(board, playerNumber, diceRoll);
    if (moves.length === 0) throw new Error('No valid moves');
    if (moves.length === 1) return moves[0];

    // Easy: 20% random
    if (difficulty === 'easy' && Math.random() < 0.2) {
      return moves[Math.floor(Math.random() * moves.length)];
    }

    const depth = DEPTH_MAP[difficulty];
    let bestMove = moves[0];
    let bestScore = -Infinity;

    for (const move of moves) {
      const newBoard = this.game.applyMove(board, move);
      const score = this.expectiminimax(newBoard, depth - 1, playerNumber, false);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove;
  }

  private expectiminimax(board: BoardState, depth: number, maxPlayer: number, isChance: boolean): number {
    const winner = this.game.checkWinCondition(board);
    if (winner !== null) return winner === maxPlayer ? 1000 : -1000;
    if (depth === 0) return this.evaluate(board, maxPlayer);

    if (isChance) {
      // Chance node: weight over all dice outcomes
      let expected = 0;
      for (let roll = 0; roll <= 4; roll++) {
        const prob = UR_DICE_PROBS[roll];
        if (roll === 0) {
          // Turn passes, no moves
          const nextPlayer = (board.currentTurn + 1) % 2;
          const nextBoard: BoardState = { ...board, currentTurn: nextPlayer, diceRoll: null };
          expected += prob * this.expectiminimax(nextBoard, depth - 1, maxPlayer, true);
          continue;
        }
        const boardWithRoll: BoardState = { ...board, diceRoll: roll };
        const moves = this.game.getValidMoves(boardWithRoll, board.currentTurn, roll);
        if (moves.length === 0) {
          const nextPlayer = (board.currentTurn + 1) % 2;
          const nextBoard: BoardState = { ...board, currentTurn: nextPlayer, diceRoll: null };
          expected += prob * this.expectiminimax(nextBoard, depth - 1, maxPlayer, true);
        } else {
          expected += prob * this.expectiminimax(boardWithRoll, depth - 1, maxPlayer, false);
        }
      }
      return expected;
    }

    // Max or Min node
    const isMax = board.currentTurn === maxPlayer;
    const diceRoll = board.diceRoll!;
    const moves = this.game.getValidMoves(board, board.currentTurn, diceRoll);

    if (moves.length === 0) return this.evaluate(board, maxPlayer);

    let best = isMax ? -Infinity : Infinity;
    for (const move of moves) {
      const newBoard = this.game.applyMove(board, move);
      // If landed on rosette, same player goes again → chance node for same player
      const score = this.expectiminimax(newBoard, depth - 1, maxPlayer, true);
      best = isMax ? Math.max(best, score) : Math.min(best, score);
    }
    return best;
  }

  private evaluate(board: BoardState, playerNumber: number): number {
    let score = 0;
    for (const piece of board.pieces) {
      const isOwn = piece.playerNumber === playerNumber;
      const pos = piece.position;
      const sign = isOwn ? 1 : -1;

      if (pos === -1) continue; // off board: 0
      if (pos === 99) { score += sign * 15; continue; } // finished

      score += sign * (pos + 1); // advancement

      if (ROSETTES.has(pos)) score += sign * 1.5; // rosette bonus
      else if (pos >= SHARED_START && pos <= SHARED_END) {
        if (!isOwn) score += 0.5; // opponent exposed to capture
        else score -= 0.5; // own piece at capture risk
      }
    }
    return score;
  }
}
```

**Step 4: Run tests**

```bash
npm test --workspace=backend -- ExpectiminiMax
```

Expected: both tests pass.

**Step 5: Commit**

```bash
git add backend/src/ai/ExpectiminiMaxEngine.ts backend/src/ai/ExpectiminiMaxEngine.test.ts
git commit -m "feat(backend): add ExpectiminiMaxEngine for Ur AI"
```

---

## Task 6: Implement `BotService`

**Files:**
- Create: `backend/src/ai/BotService.ts`

**Context:** The BotService is the orchestrator. When `notifyBotTurn` is called, it:
1. Delays 500–1500ms
2. Rolls dice via the game engine
3. Checks if the bot can move
4. If yes: selects a move via AI engine, applies it
5. Emits all the same socket events that `gameHandlers.ts` would emit for a human

It does NOT use a socket client — it calls `sessionService` directly and emits to `io.to(sessionCode)`.

**Step 1: Write tests**

Create `backend/src/ai/BotService.test.ts`:

```ts
import { BotService } from './BotService';

describe('BotService', () => {
  it('can be instantiated', () => {
    const mockIo = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) } as any;
    const mockSession = {} as any;
    const svc = new BotService(mockIo, mockSession);
    expect(svc).toBeDefined();
  });

  it('notifyBotTurn resolves without throwing for unknown session', async () => {
    const mockIo = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) } as any;
    const mockSessionService = {
      getSession: jest.fn().mockResolvedValue(null),
    } as any;
    const svc = new BotService(mockIo, mockSessionService);
    await expect(svc.notifyBotTurn('BADCODE', 'botid')).resolves.not.toThrow();
  });
});
```

**Step 2: Run to see fail**

```bash
npm test --workspace=backend -- BotService
```

**Step 3: Implement**

Create `backend/src/ai/BotService.ts`:

```ts
import { Server } from 'socket.io';
import { nanoid } from 'nanoid';
import { ClientToServerEvents, ServerToClientEvents, HistoricalMove, getGameTitle } from '@ancient-games/shared';
import { SessionService } from '../services/SessionService';
import { GameRegistry } from '../games/GameRegistry';
import { ExpectiminiMaxEngine } from './ExpectiminiMaxEngine';
import { OllamaService } from './OllamaService';
import { UrGame } from '../games/ur/UrGame';

const THINKING_MIN = 500;
const THINKING_MAX = 1500;

function thinkingDelay(): Promise<void> {
  const ms = THINKING_MIN + Math.random() * (THINKING_MAX - THINKING_MIN);
  return new Promise((r) => setTimeout(r, ms));
}

export class BotService {
  private io: Server<ClientToServerEvents, ServerToClientEvents>;
  private sessionService: SessionService;
  private ollama: OllamaService;

  constructor(
    io: Server<ClientToServerEvents, ServerToClientEvents>,
    sessionService: SessionService,
    ollamaUrl = 'http://localhost:11434',
  ) {
    this.io = io;
    this.sessionService = sessionService;
    this.ollama = new OllamaService(ollamaUrl);
  }

  async notifyBotTurn(sessionCode: string, botPlayerId: string): Promise<void> {
    try {
      const session = await this.sessionService.getSession(sessionCode);
      if (!session || !session.gameState) return;

      const bot = session.players.find((p) => p.id === botPlayerId && p.isBot);
      if (!bot) return;

      if (session.gameState.currentTurn !== bot.playerNumber) return;

      await thinkingDelay();

      // Re-fetch session after delay (state may have changed)
      const fresh = await this.sessionService.getSession(sessionCode);
      if (!fresh?.gameState || fresh.gameState.currentTurn !== bot.playerNumber) return;
      if (fresh.gameState.board.diceRoll !== null) return; // already rolled

      const gameEngine = GameRegistry.getGame(fresh.gameType);
      const roll = gameEngine.rollDice();

      fresh.gameState.board.diceRoll = roll;
      await this.sessionService.updateGameState(sessionCode, fresh.gameState);

      const canMove = gameEngine.canMove(fresh.gameState.board, bot.playerNumber, roll);

      this.io.to(sessionCode).emit('game:dice-rolled', {
        playerNumber: bot.playerNumber,
        roll,
        canMove,
      });

      if (!canMove) {
        const nextTurn = (fresh.gameState.currentTurn + 1) % 2;
        fresh.gameState.board.diceRoll = null;
        fresh.gameState.board.currentTurn = nextTurn;
        fresh.gameState.currentTurn = nextTurn;

        if (!fresh.gameState.moveHistory) fresh.gameState.moveHistory = [];
        fresh.gameState.moveHistory.push({
          move: { playerId: botPlayerId, pieceIndex: -1, from: -2, to: -2, diceRoll: roll },
          playerNumber: bot.playerNumber,
          wasCapture: false,
          isSkip: true,
          timestamp: Date.now(),
        } as HistoricalMove);

        await this.sessionService.updateGameState(sessionCode, fresh.gameState);
        this.io.to(sessionCode).emit('game:turn-changed', { currentTurn: nextTurn });
        this.io.to(sessionCode).emit('game:state-updated', fresh.gameState);
        return;
      }

      this.io.to(sessionCode).emit('game:state-updated', fresh.gameState);

      // Short extra pause before moving (feels more natural)
      await new Promise((r) => setTimeout(r, 300));

      // Select move
      const aiEngine = this.getAiEngine(fresh.gameType);
      if (!aiEngine) return;

      const moves = gameEngine.getValidMoves(fresh.gameState.board, bot.playerNumber, roll);
      if (moves.length === 0) return;

      const move = aiEngine.selectMove(
        fresh.gameState.board,
        bot.playerNumber,
        roll,
        bot.botDifficulty ?? 'medium',
      );

      const wasCapture = gameEngine.isCaptureMove(fresh.gameState.board, move);
      const landedRosette = [2, 6, 13].includes(move.to);
      const scored = move.to === 99;

      const newBoard = gameEngine.applyMove(fresh.gameState.board, move);
      fresh.gameState.board = newBoard;
      fresh.gameState.currentTurn = newBoard.currentTurn;

      const winner = gameEngine.checkWinCondition(newBoard);
      if (winner !== null) {
        fresh.gameState.winner = winner;
        fresh.gameState.finished = true;
      }

      if (!fresh.gameState.moveHistory) fresh.gameState.moveHistory = [];
      fresh.gameState.moveHistory.push({
        move: { ...move, playerId: botPlayerId },
        playerNumber: bot.playerNumber,
        wasCapture,
        timestamp: Date.now(),
      } as HistoricalMove);

      await this.sessionService.updateGameState(sessionCode, fresh.gameState);

      this.io.to(sessionCode).emit('game:move-made', {
        move: { ...move, playerId: botPlayerId },
        gameState: fresh.gameState,
        wasCapture,
      });

      if (winner !== null) {
        this.io.to(sessionCode).emit('game:ended', { winner, gameState: fresh.gameState });
      } else {
        this.io.to(sessionCode).emit('game:turn-changed', { currentTurn: fresh.gameState.currentTurn });
      }

      // Ollama commentary for notable moves
      const notable = wasCapture || landedRosette || scored;
      if (notable && fresh.botConfig?.ollamaEnabled) {
        this.generateAndSendComment(sessionCode, bot, fresh.gameType, move, wasCapture, landedRosette, scored).catch(
          () => {},
        );
      }

      // If next player is also a bot, trigger their turn
      if (winner === null) {
        const nextBot = fresh.players.find(
          (p) => p.isBot && p.playerNumber === fresh.gameState.currentTurn,
        );
        if (nextBot) {
          // Small gap before next bot acts
          setTimeout(() => this.notifyBotTurn(sessionCode, nextBot.id), 500);
        }
      }
    } catch (err) {
      console.error('[BotService] notifyBotTurn error:', err);
    }
  }

  private getAiEngine(gameType: string) {
    if (gameType === 'ur') return new ExpectiminiMaxEngine(new UrGame());
    return null; // Other games not yet implemented
  }

  private async generateAndSendComment(
    sessionCode: string,
    bot: any,
    gameType: string,
    move: any,
    wasCapture: boolean,
    landedRosette: boolean,
    scored: boolean,
  ): Promise<void> {
    const session = await this.sessionService.getSession(sessionCode);
    if (!session) return;

    let moveDesc = `moved piece from position ${move.from} to position ${move.to}`;
    if (wasCapture) moveDesc = `captured an opponent piece at position ${move.to}`;
    else if (scored) moveDesc = 'scored a piece off the board';
    else if (landedRosette) moveDesc = `landed on a rosette at position ${move.to}`;

    const onBoard = session.gameState.board.pieces.filter(
      (p) => p.playerNumber === bot.playerNumber && p.position !== -1 && p.position !== 99,
    ).length;
    const finished = session.gameState.board.pieces.filter(
      (p) => p.playerNumber === bot.playerNumber && p.position === 99,
    ).length;
    const boardSummary = `${onBoard} pieces on board, ${finished} finished`;

    const model = session.botConfig?.ollamaModel ?? 'llama3.2:1b';
    const ollamaWithModel = new OllamaService('http://localhost:11434', model);
    const comment = await ollamaWithModel.generateComment({
      persona: bot.botPersona ?? 'Bot',
      gameName: getGameTitle(gameType as any),
      moveDescription: moveDesc,
      boardSummary,
    });

    if (!comment) return;

    const message = {
      id: nanoid(),
      playerId: bot.id,
      displayName: bot.displayName,
      text: comment,
      timestamp: Date.now(),
      isSpectator: false,
    };

    await this.sessionService.addChatMessage(sessionCode, message);
    this.io.to(sessionCode).emit('chat:message', message);
  }
}
```

**Step 4: Run tests**

```bash
npm test --workspace=backend -- BotService
```

Expected: both tests pass.

**Step 5: Commit**

```bash
git add backend/src/ai/BotService.ts backend/src/ai/BotService.test.ts
git commit -m "feat(backend): add BotService orchestrator"
```

---

## Task 7: Wire BotService into server and gameHandlers

**Files:**
- Modify: `backend/src/server.ts`
- Modify: `backend/src/socket/gameHandlers.ts`

**Context:** `BotService` needs to be instantiated once in `server.ts` and passed to `registerGameHandlers`. In `gameHandlers.ts`, add `notifyBotTurn` calls after `game:move` and `game:dice-rolled` when the next player is a bot.

**Step 1: Update `server.ts`**

Find where `registerGameHandlers` is called (likely in a socket `connection` handler). Instantiate `BotService` before it:

```ts
import { BotService } from './ai/BotService';
// ...
const botService = new BotService(io, sessionService);
// Pass to registerGameHandlers:
registerGameHandlers(io, socket, sessionService, pushService, botService);
```

**Step 2: Update `registerGameHandlers` signature**

In `gameHandlers.ts`, add `botService: BotService` parameter:

```ts
export function registerGameHandlers(
  io: Server<...>,
  socket: Socket<...>,
  sessionService: SessionService,
  pushService: PushService,
  botService: BotService,
)
```

**Step 3: Add `notifyBotTurn` after `game:move` resolves**

In the `game:move` handler, after `io.to(sessionCode).emit('game:turn-changed', ...)` (the else branch where game hasn't ended), add:

```ts
// Trigger bot turn if next player is a bot
const nextBot = session.players.find(
  (p) => p.isBot && p.playerNumber === session.gameState.currentTurn,
);
if (nextBot) {
  botService.notifyBotTurn(sessionCode, nextBot.id).catch(() => {});
}
```

Also add after `game:ended` emission (bots don't need to move after game ends, so skip).

**Step 4: Add `notifyBotTurn` after `game:roll-dice` for bot-first-turn edge case**

In the `game:roll-dice` handler, this handles when a human rolls for themselves. Bots roll themselves via `BotService`, so no change needed there.

However, after `game:turn-changed` (the skip-turn path in `game:roll-dice`), also check:

```ts
const nextBotAfterSkip = session.players.find(
  (p) => p.isBot && p.playerNumber === nextTurn,
);
if (nextBotAfterSkip) {
  botService.notifyBotTurn(sessionCode, nextBotAfterSkip.id).catch(() => {});
}
```

**Step 5: Handle bot's turn at game start**

In the `game:start` handler, after `io.to(sessionCode).emit('game:started', session)`:

```ts
// If first player is a bot, kick off their turn
const startingBot = session.players.find(
  (p) => p.isBot && p.playerNumber === session.gameState.currentTurn,
);
if (startingBot) {
  botService.notifyBotTurn(sessionCode, startingBot.id).catch(() => {});
}
```

**Step 6: Build and check**

```bash
npm run build:backend
```

Expected: no TypeScript errors.

**Step 7: Commit**

```bash
git add backend/src/server.ts backend/src/socket/gameHandlers.ts
git commit -m "feat(backend): wire BotService into game socket handlers"
```

---

## Task 8: Add `addBot` to frontend API service

**Files:**
- Modify: `frontend/src/services/api.ts`

**Step 1: Find the api.ts file and read its pattern**

Read `frontend/src/services/api.ts` to see the existing fetch wrapper pattern.

**Step 2: Add `addBot`**

Following the existing pattern, add:

```ts
addBot: async (sessionCode: string, requesterId: string, difficulty: string, persona?: string) => {
  const res = await fetch(`/api/sessions/${sessionCode}/add-bot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requesterId, difficulty, persona }),
  });
  if (!res.ok) throw new Error((await res.json()).error);
  return res.json();
},
```

**Step 3: Commit**

```bash
git add frontend/src/services/api.ts
git commit -m "feat(frontend): add addBot API call"
```

---

## Task 9: Add "Add Bot" UI to SessionLobby

**Files:**
- Modify: `frontend/src/components/lobby/SessionLobby.tsx`

**Context:** Read the full `SessionLobby.tsx` to find where the player list is rendered and where the host controls (like the "Start Game" button) live. The "Add Bot" button should appear only for the host, only when `format === 'single'` (bots in tournaments are out of scope for this pass), and only when there are fewer than 2 players.

**Step 1: Add state for the add-bot form**

```tsx
const [showBotForm, setShowBotForm] = useState(false);
const [botDifficulty, setBotDifficulty] = useState<string>('medium');
const [botPersona, setBotPersona] = useState('Ancient Strategist');
const [botOllamaEnabled, setBotOllamaEnabled] = useState(false);
const [addingBot, setAddingBot] = useState(false);
```

**Step 2: Add the handler**

```tsx
const handleAddBot = async () => {
  if (!playerId || !sessionCode) return;
  setAddingBot(true);
  try {
    const updated = await api.addBot(sessionCode, playerId, botDifficulty, botPersona);
    setSession(updated);
    setShowBotForm(false);
  } catch (e) {
    setNotice((e as Error).message);
  } finally {
    setAddingBot(false);
  }
};
```

**Step 3: Add the UI**

Find where the host controls are rendered. After the player list and before the format selector (or wherever feels natural), add:

```tsx
{isHost && format === 'single' && (session?.players.length ?? 0) < 2 && (
  <div className="mt-3">
    {!showBotForm ? (
      <button
        onClick={() => setShowBotForm(true)}
        className="text-sm text-stone-400 hover:text-stone-200 border border-stone-600 hover:border-stone-400 rounded px-3 py-1.5 transition-colors"
      >
        + Add Bot Player
      </button>
    ) : (
      <div className="border border-stone-600 rounded-lg p-3 space-y-2">
        <p className="text-sm font-medium text-stone-300">Bot Settings</p>
        <div className="flex gap-2">
          <select
            value={botDifficulty}
            onChange={(e) => setBotDifficulty(e.target.value)}
            className="flex-1 bg-stone-800 border border-stone-600 rounded px-2 py-1 text-sm text-stone-200"
          >
            {['easy', 'medium', 'hard', 'harder', 'hardest'].map((d) => (
              <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
            ))}
          </select>
          <input
            value={botPersona}
            onChange={(e) => setBotPersona(e.target.value)}
            placeholder="Bot name"
            className="flex-1 bg-stone-800 border border-stone-600 rounded px-2 py-1 text-sm text-stone-200"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-stone-400">
          <input
            type="checkbox"
            checked={botOllamaEnabled}
            onChange={(e) => setBotOllamaEnabled(e.target.checked)}
            className="rounded"
          />
          Enable AI commentary (requires local Ollama)
        </label>
        <div className="flex gap-2">
          <button
            onClick={handleAddBot}
            disabled={addingBot}
            className="bg-amber-700 hover:bg-amber-600 text-white text-sm rounded px-3 py-1 disabled:opacity-50"
          >
            {addingBot ? 'Adding...' : 'Add Bot'}
          </button>
          <button
            onClick={() => setShowBotForm(false)}
            className="text-stone-400 hover:text-stone-200 text-sm px-3 py-1"
          >
            Cancel
          </button>
        </div>
      </div>
    )}
  </div>
)}
```

**Step 4: Show bot badge in player list**

Find where players are rendered in the player list. Where the player's `displayName` is shown, add a bot badge if `player.isBot`:

```tsx
{player.isBot && (
  <span className="text-xs bg-stone-700 text-stone-400 px-1.5 py-0.5 rounded ml-1">🤖 Bot</span>
)}
```

**Step 5: Build frontend**

```bash
npm run build:frontend
```

Expected: no TypeScript errors.

**Step 6: Commit**

```bash
git add frontend/src/components/lobby/SessionLobby.tsx frontend/src/services/api.ts
git commit -m "feat(frontend): add 'Add Bot' UI to SessionLobby"
```

---

## Task 10: Handle Ollama config on session creation

**Files:**
- Modify: `backend/src/services/SessionService.ts`
- Modify: `backend/src/routes/sessions.ts`

**Context:** When a bot is added with Ollama enabled, we need to store `botConfig` on the session. The simplest approach: `addBotPlayer` accepts an optional `ollamaEnabled` flag and updates `botConfig` on the session doc.

**Step 1: Update `addBotPlayer` in SessionService**

Add `ollamaEnabled?: boolean` to the opts parameter and update the MongoDB call:

```ts
async addBotPlayer(
  sessionCode: string,
  requesterId: string,
  opts: { difficulty: BotDifficulty; persona?: string; ollamaEnabled?: boolean; ollamaModel?: string },
): Promise<Session>
```

In the `updateOne` call, also set `botConfig` if ollamaEnabled:

```ts
await SessionModel.updateOne(
  { sessionCode },
  {
    $push: { players: botPlayer },
    ...(opts.ollamaEnabled !== undefined && {
      $set: {
        botConfig: {
          ollamaEnabled: opts.ollamaEnabled,
          ollamaModel: opts.ollamaModel ?? 'llama3.2:1b',
        },
      },
    }),
  },
);
```

**Step 2: Pass `ollamaEnabled` from the route**

In `sessions.ts` add-bot route, extract `ollamaEnabled` and `ollamaModel` from body and pass to `addBotPlayer`.

**Step 3: Pass `ollamaEnabled` from the frontend**

In `SessionLobby.tsx`, update `handleAddBot` to pass `botOllamaEnabled`:

In `api.ts`, update `addBot` to accept and send `ollamaEnabled`.

**Step 4: Build both packages**

```bash
npm run build
```

Expected: no errors.

**Step 5: Commit**

```bash
git add backend/src/services/SessionService.ts backend/src/routes/sessions.ts frontend/src/services/api.ts frontend/src/components/lobby/SessionLobby.tsx
git commit -m "feat: wire ollamaEnabled flag through add-bot flow"
```

---

## Task 11: Manual end-to-end test

**No code changes — verification only.**

**Step 1: Start the stack**

```bash
npm run dev:backend &
npm run dev:frontend &
```

**Step 2: Test the bot flow**

1. Open `http://localhost:5173` in browser
2. Create a new session for Royal Game of Ur
3. In the lobby, click "Add Bot Player"
4. Select difficulty "Medium", name "Ancient Strategist", leave Ollama off
5. Click "Add Bot" — verify bot appears in player list with 🤖 badge
6. Click "Start Game"
7. Verify bot takes its turn automatically after ~1 second (roll dice → move)
8. Play a few turns — verify turns alternate correctly between human and bot
9. Verify game ends normally when either player wins

**Step 3: Test with Ollama (optional)**

If Ollama is running locally with `llama3.2:1b` pulled:
1. Repeat above with "Enable AI commentary" checked
2. Make a capture or score a piece
3. Verify a chat message appears from the bot

**Step 4: Commit test verification note**

```bash
git commit --allow-empty -m "chore: verify AI bot e2e flow manually"
```

---

## Summary of new files

```
backend/src/ai/
  AiEngine.ts                  (optional interface, can skip if not needed)
  ExpectiminiMaxEngine.ts      Task 5
  ExpectiminiMaxEngine.test.ts Task 5
  OllamaService.ts             Task 4
  OllamaService.test.ts        Task 4
  BotService.ts                Task 6
  BotService.test.ts           Task 6
```

## Summary of modified files

```
shared/types/game.ts                              Task 1
backend/src/services/SessionService.ts            Tasks 2, 10
backend/src/routes/sessions.ts                    Tasks 3, 10
backend/src/server.ts                             Task 7
backend/src/socket/gameHandlers.ts                Task 7
frontend/src/services/api.ts                      Tasks 8, 10
frontend/src/components/lobby/SessionLobby.tsx    Tasks 9, 10
```
