import { Server, Socket } from 'socket.io';
import { nanoid } from 'nanoid';
import { SessionService } from '../services/SessionService';
import { PushService } from '../services/PushService';
import { GameRegistry } from '../games/GameRegistry';
import { ClientToServerEvents, ServerToClientEvents, GameState, Session, HistoricalMove } from '@ancient-games/shared';

function gameTitle(gameType: string): string {
  if (gameType === 'ur') return 'Royal Game of Ur';
  if (gameType === 'morris') return "Nine Men's Morris";
  if (gameType === 'wolves-and-ravens') return 'Wolves & Ravens';
  return 'Senet';
}

export function registerGameHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  sessionService: SessionService,
  pushService: PushService
) {
  // Join a session room
  socket.on('session:join', async ({ sessionCode, playerId }) => {
    try {
      const session = await sessionService.getSession(sessionCode);
      if (!session) {
        socket.emit('session:error', { message: 'Session not found' });
        return;
      }

      // Detect first-ever socket connection (socketId is 'temp' until then)
      const joiningPlayer = session.players.find(p => p.id === playerId);
      const joiningSpectator = !joiningPlayer ? session.spectators.find(s => s.id === playerId) : undefined;
      const isFirstConnect = (joiningPlayer?.socketId === 'temp') || (joiningSpectator?.socketId === 'temp');

      // Update socket ID for reconnections (checks players then spectators)
      await sessionService.updatePlayerSocketId(sessionCode, playerId, socket.id);

      // Join the room
      socket.join(sessionCode);

      // Notify everyone in the room
      io.to(sessionCode).emit('session:updated', session);

      // Send move and chat history to this socket only
      socket.emit('game:history', session.gameState.moveHistory ?? []);
      socket.emit('chat:history', session.chatHistory ?? []);

      // Push notification when a new player first connects to the lobby (not spectators)
      if (isFirstConnect && joiningPlayer) {
        for (const other of session.players) {
          if (other.id !== playerId) {
            await pushService.sendNotification(other.id, {
              title: 'Player joined!',
              body: `${joiningPlayer.displayName} joined your ${gameTitle(session.gameType)} lobby`,
              url: `/session/${sessionCode}`,
            });
          }
        }
      }
    } catch (error) {
      socket.emit('session:error', { message: (error as Error).message });
    }
  });

  // Leave a session
  socket.on('session:leave', async ({ sessionCode, playerId }) => {
    try {
      // Try removing as player first, fall back to spectator
      const currentSession = await sessionService.getSession(sessionCode);
      const isPlayer = currentSession?.players.some(p => p.id === playerId) ?? false;

      let session: typeof currentSession;
      if (isPlayer) {
        session = await sessionService.removePlayer(sessionCode, playerId);
      } else {
        session = await sessionService.removeSpectator(sessionCode, playerId);
      }

      socket.leave(sessionCode);

      if (session) {
        io.to(sessionCode).emit('session:player-left', session);
      }
    } catch (error) {
      socket.emit('session:error', { message: (error as Error).message });
    }
  });

  // Player stands up and becomes a spectator
  socket.on('session:stand-up', async ({ sessionCode, playerId }) => {
    try {
      const session = await sessionService.playerToSpectator(sessionCode, playerId);
      if (session) {
        io.to(sessionCode).emit('session:updated', session);
      }
    } catch (error) {
      socket.emit('session:error', { message: (error as Error).message });
    }
  });

  // Spectator takes an open seat
  socket.on('session:take-seat', async ({ sessionCode, playerId }) => {
    try {
      const session = await sessionService.spectatorToPlayer(sessionCode, playerId);
      if (session) {
        io.to(sessionCode).emit('session:updated', session);
      }
    } catch (error) {
      socket.emit('session:error', { message: (error as Error).message });
    }
  });

  // Toggle ready status
  socket.on('session:ready', async ({ sessionCode, playerId, ready }) => {
    try {
      const session = await sessionService.updatePlayerReady(sessionCode, playerId, ready);
      if (session) {
        io.to(sessionCode).emit('session:updated', session);

        // Push notification to other lobby players about ready status change
        const player = session.players.find(p => p.id === playerId);
        if (player) {
          const statusText = ready ? `${player.displayName} is ready!` : `${player.displayName} is not ready`;
          for (const other of session.players) {
            if (other.id !== playerId) {
              await pushService.sendNotification(other.id, {
                title: statusText,
                body: `${gameTitle(session.gameType)} lobby`,
                url: `/session/${sessionCode}`,
              });
            }
          }
        }
      }
    } catch (error) {
      socket.emit('session:error', { message: (error as Error).message });
    }
  });

  // Start the game
  socket.on('game:start', async ({ sessionCode, playerId }) => {
    try {
      const session = await sessionService.startGame(sessionCode, playerId);
      if (session) {
        io.to(sessionCode).emit('game:started', session);
      }
    } catch (error) {
      socket.emit('game:error', { message: (error as Error).message });
    }
  });

  // Roll dice
  socket.on('game:roll-dice', async ({ sessionCode, playerId }) => {
    try {
      const session = await sessionService.getSession(sessionCode);
      if (!session) {
        socket.emit('game:error', { message: 'Session not found' });
        return;
      }

      const player = session.players.find(p => p.id === playerId);
      if (!player) {
        socket.emit('game:error', { message: 'Player not found' });
        return;
      }

      if (session.gameState.currentTurn !== player.playerNumber) {
        socket.emit('game:error', { message: 'Not your turn' });
        return;
      }

      if (session.gameState.board.diceRoll !== null) {
        socket.emit('game:error', { message: 'Dice already rolled' });
        return;
      }

      const gameEngine = GameRegistry.getGame(session.gameType);
      const roll = gameEngine.rollDice();

      session.gameState.board.diceRoll = roll;
      await sessionService.updateGameState(sessionCode, session.gameState);

      const canMove = gameEngine.canMove(session.gameState.board, player.playerNumber, roll);

      io.to(sessionCode).emit('game:dice-rolled', {
        playerNumber: player.playerNumber,
        roll,
        canMove,
      });

      // Check if player can move with this roll
      if (!canMove) {
        // No valid moves, skip turn
        const nextTurn = (session.gameState.currentTurn + 1) % 2;
        session.gameState.board.diceRoll = null;
        session.gameState.board.currentTurn = nextTurn;
        session.gameState.currentTurn = nextTurn;

        // Record skip in history
        if (!session.gameState.moveHistory) session.gameState.moveHistory = [];
        session.gameState.moveHistory.push({
          move: { playerId, pieceIndex: -1, from: -2, to: -2, diceRoll: roll },
          playerNumber: player.playerNumber,
          wasCapture: false,
          isSkip: true,
          timestamp: Date.now(),
        } as HistoricalMove);

        await sessionService.updateGameState(sessionCode, session.gameState);

        io.to(sessionCode).emit('game:turn-changed', {
          currentTurn: session.gameState.currentTurn,
        });

        // Notify the next player — the current player had no valid moves
        const nextPlayer = session.players.find(p => p.playerNumber === nextTurn);
        if (nextPlayer) {
          await pushService.sendNotification(nextPlayer.id, {
            title: 'Your turn!',
            body: `${player.displayName} had no moves in ${gameTitle(session.gameType)}`,
            url: `/game/${sessionCode}`,
          });
        }
      }

      io.to(sessionCode).emit('game:state-updated', session.gameState);
    } catch (error) {
      socket.emit('game:error', { message: (error as Error).message });
    }
  });

  // Make a move
  socket.on('game:move', async ({ sessionCode, playerId, move }) => {
    try {
      const session = await sessionService.getSession(sessionCode);
      if (!session) {
        socket.emit('game:error', { message: 'Session not found' });
        return;
      }

      const player = session.players.find(p => p.id === playerId);
      if (!player) {
        socket.emit('game:error', { message: 'Player not found' });
        return;
      }

      if (session.gameState.currentTurn !== player.playerNumber) {
        socket.emit('game:error', { message: 'Not your turn' });
        return;
      }

      const gameEngine = GameRegistry.getGame(session.gameType);

      // Validate move
      if (!gameEngine.validateMove(session.gameState.board, move, player)) {
        socket.emit('game:error', { message: 'Invalid move' });
        return;
      }

      // Capture detection: check if an opponent piece occupies the destination
      const isCapturablePosition = session.gameType !== 'ur' || (move.to >= 4 && move.to <= 11);
      const wasCapture =
        move.to !== 99 &&
        isCapturablePosition &&
        session.gameState.board.pieces.some(
          (p) => p.playerNumber !== player.playerNumber && p.position === move.to
        );

      // Apply move
      const newBoard = gameEngine.applyMove(session.gameState.board, move);
      session.gameState.board = newBoard;
      session.gameState.currentTurn = newBoard.currentTurn;

      // Check win condition
      const winner = gameEngine.checkWinCondition(newBoard);
      if (winner !== null) {
        session.gameState.winner = winner;
        session.gameState.finished = true;
      }

      // Record move in history
      if (!session.gameState.moveHistory) session.gameState.moveHistory = [];
      session.gameState.moveHistory.push({
        move,
        playerNumber: player.playerNumber,
        wasCapture,
        timestamp: Date.now(),
      } as HistoricalMove);

      await sessionService.updateGameState(sessionCode, session.gameState);

      // Notify all players
      io.to(sessionCode).emit('game:move-made', {
        move,
        gameState: session.gameState,
      });

      if (winner !== null) {
        io.to(sessionCode).emit('game:ended', {
          winner,
          gameState: session.gameState,
        });
      } else {
        io.to(sessionCode).emit('game:turn-changed', {
          currentTurn: session.gameState.currentTurn,
        });

        // Push notification to the player whose turn it now is
        const nextPlayer = session.players.find(
          p => p.playerNumber === session.gameState.currentTurn
        );
        if (nextPlayer && nextPlayer.id !== playerId) {
          await pushService.sendNotification(nextPlayer.id, {
            title: 'Your turn!',
            body: `${player.displayName} made a move in ${gameTitle(session.gameType)}`,
            url: `/game/${sessionCode}`,
          });
        }
      }
    } catch (error) {
      socket.emit('game:error', { message: (error as Error).message });
    }
  });

  // Skip turn (when no valid moves)
  socket.on('game:skip-turn', async ({ sessionCode, playerId }) => {
    try {
      const session = await sessionService.getSession(sessionCode);
      if (!session) {
        socket.emit('game:error', { message: 'Session not found' });
        return;
      }

      const player = session.players.find(p => p.id === playerId);
      if (!player) {
        socket.emit('game:error', { message: 'Player not found' });
        return;
      }

      if (session.gameState.currentTurn !== player.playerNumber) {
        socket.emit('game:error', { message: 'Not your turn' });
        return;
      }

      const nextTurn = (session.gameState.currentTurn + 1) % 2;
      session.gameState.board.diceRoll = null;
      session.gameState.board.currentTurn = nextTurn;
      session.gameState.currentTurn = nextTurn;
      await sessionService.updateGameState(sessionCode, session.gameState);

      io.to(sessionCode).emit('game:turn-changed', {
        currentTurn: session.gameState.currentTurn,
      });

      io.to(sessionCode).emit('game:state-updated', session.gameState);
    } catch (error) {
      socket.emit('game:error', { message: (error as Error).message });
    }
  });

  // Rematch — reset game state for the same two players
  socket.on('game:rematch', async ({ sessionCode, playerId }) => {
    try {
      const session = await sessionService.getSession(sessionCode);
      if (!session) {
        socket.emit('game:error', { message: 'Session not found' });
        return;
      }

      const player = session.players.find(p => p.id === playerId);
      if (!player) {
        socket.emit('game:error', { message: 'Player not found' });
        return;
      }

      if (session.status !== 'finished') {
        // Already restarted by the other player; client will receive game:restarted
        return;
      }

      const newSession = await sessionService.restartGame(sessionCode);
      if (newSession) {
        io.to(sessionCode).emit('game:restarted', newSession);
      }
    } catch (error) {
      socket.emit('game:error', { message: (error as Error).message });
    }
  });

  // Chat message
  socket.on('chat:send', async ({ sessionCode, playerId, text }) => {
    try {
      const session = await sessionService.getSession(sessionCode);
      if (!session) return;

      const player = session.players.find(p => p.id === playerId);
      const spectator = !player ? session.spectators.find(s => s.id === playerId) : undefined;
      const sender = player ?? spectator;
      if (!sender) return;

      const trimmed = text.trim().slice(0, 500);
      if (!trimmed) return;

      const message = {
        id: nanoid(),
        playerId,
        displayName: sender.displayName,
        text: trimmed,
        timestamp: Date.now(),
        isSpectator: !!spectator,
      };

      await sessionService.addChatMessage(sessionCode, message);
      io.to(sessionCode).emit('chat:message', message);
    } catch (error) {
      socket.emit('session:error', { message: (error as Error).message });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    // Socket rooms will be automatically cleaned up
    console.log('Client disconnected:', socket.id);
  });
}
