import { Server } from 'socket.io';
import { nanoid } from 'nanoid';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  HistoricalMove,
  getGameTitle,
} from '@ancient-games/shared';
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

        // Check if next player is also a bot
        const nextBot = fresh.players.find(
          (p) => p.isBot && p.playerNumber === nextTurn,
        );
        if (nextBot) {
          setTimeout(() => this.notifyBotTurn(sessionCode, nextBot.id), 500);
        }
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

        // If next player is also a bot, trigger their turn
        const nextBot = fresh.players.find(
          (p) => p.isBot && p.playerNumber === fresh.gameState.currentTurn,
        );
        if (nextBot) {
          setTimeout(() => this.notifyBotTurn(sessionCode, nextBot.id), 500);
        }
      }

      // Ollama commentary for notable moves
      const notable = wasCapture || landedRosette || scored;
      if (notable && fresh.botConfig?.ollamaEnabled) {
        this.generateAndSendComment(
          sessionCode,
          bot,
          fresh.gameType,
          move,
          wasCapture,
          landedRosette,
          scored,
        ).catch(() => {});
      }
    } catch (err) {
      console.error('[BotService] notifyBotTurn error:', err);
    }
  }

  private getAiEngine(gameType: string) {
    if (gameType === 'ur') return new ExpectiminiMaxEngine(new UrGame());
    return null;
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
