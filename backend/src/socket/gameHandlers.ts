import { Server, Socket } from 'socket.io';
import { SessionService } from '../services/SessionService';
import { GameRegistry } from '../games/GameRegistry';
import { ClientToServerEvents, ServerToClientEvents } from '@ancient-games/shared';

export function registerGameHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  sessionService: SessionService
) {
  // Join a session room
  socket.on('session:join', async ({ sessionCode, playerId }) => {
    try {
      const session = await sessionService.getSession(sessionCode);
      if (!session) {
        socket.emit('session:error', { message: 'Session not found' });
        return;
      }

      // Update socket ID for reconnections
      await sessionService.updatePlayerSocketId(sessionCode, playerId, socket.id);

      // Join the room
      socket.join(sessionCode);

      // Notify everyone in the room
      io.to(sessionCode).emit('session:updated', session);
    } catch (error) {
      socket.emit('session:error', { message: (error as Error).message });
    }
  });

  // Leave a session
  socket.on('session:leave', async ({ sessionCode, playerId }) => {
    try {
      const session = await sessionService.removePlayer(sessionCode, playerId);
      socket.leave(sessionCode);

      if (session) {
        io.to(sessionCode).emit('session:player-left', session);
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
        await sessionService.updateGameState(sessionCode, session.gameState);

        io.to(sessionCode).emit('game:turn-changed', {
          currentTurn: session.gameState.currentTurn,
        });
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

  // Handle disconnection
  socket.on('disconnect', () => {
    // Socket rooms will be automatically cleaned up
    console.log('Client disconnected:', socket.id);
  });
}
