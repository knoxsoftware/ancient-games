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

function getRoundLabel(format: string, roundIndex: number, totalRounds: number): string {
  if (format === 'round-robin') return `Round ${roundIndex + 1}`;
  const remaining = totalRounds - roundIndex;
  if (remaining === 1) return 'Final';
  if (remaining === 2) return 'Semi-final';
  if (remaining === 3) return 'Quarter-final';
  return `Round of ${Math.pow(2, remaining)}`;
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

      const joiningPlayer = session.players.find(p => p.id === playerId);
      const joiningSpectator = !joiningPlayer ? session.spectators.find(s => s.id === playerId) : undefined;
      const isFirstConnect = (joiningPlayer?.socketId === 'temp') || (joiningSpectator?.socketId === 'temp');

      await sessionService.updatePlayerSocketId(sessionCode, playerId, socket.id);

      socket.join(sessionCode);

      // If this is a tournament match session, also join the hub room and update hub socketId
      if (session.tournamentHubCode) {
        socket.join(session.tournamentHubCode);
        await sessionService.updatePlayerSocketId(session.tournamentHubCode, playerId, socket.id);
      }

      io.to(sessionCode).emit('session:updated', session);

      socket.emit('game:history', session.gameState.moveHistory ?? []);
      socket.emit('chat:history', session.chatHistory ?? []);

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

  // Start the game (or tournament)
  socket.on('game:start', async ({ sessionCode, playerId, tournamentFormat }) => {
    try {
      if (tournamentFormat) {
        const { hubSession, matchSessions } = await sessionService.startTournament(
          sessionCode,
          playerId,
          tournamentFormat
        );

        io.to(sessionCode).emit('tournament:updated', hubSession);

        const ts = hubSession.tournamentState!;
        for (const ms of matchSessions) {
          const p1 = ts.participants.find(p => p.id === ms.player1Id);
          const p2 = ts.participants.find(p => p.id === ms.player2Id);
          const roundLabel = getRoundLabel(tournamentFormat, 0, ts.rounds.length);

          const p1Player = hubSession.players.find(p => p.id === ms.player1Id);
          const p2Player = hubSession.players.find(p => p.id === ms.player2Id);

          if (p1Player && p2) {
            io.to(p1Player.socketId).emit('tournament:match-ready', {
              matchSessionCode: ms.sessionCode,
              opponentName: p2.displayName,
              roundLabel,
            });
          }
          if (p2Player && p1) {
            io.to(p2Player.socketId).emit('tournament:match-ready', {
              matchSessionCode: ms.sessionCode,
              opponentName: p1.displayName,
              roundLabel,
            });
          }
        }
      } else {
        const session = await sessionService.startGame(sessionCode, playerId);
        if (session) {
          io.to(sessionCode).emit('game:started', session);
        }
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

      if (!canMove) {
        const nextTurn = (session.gameState.currentTurn + 1) % 2;
        session.gameState.board.diceRoll = null;
        session.gameState.board.currentTurn = nextTurn;
        session.gameState.currentTurn = nextTurn;

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

      if (!gameEngine.validateMove(session.gameState.board, move, player)) {
        socket.emit('game:error', { message: 'Invalid move' });
        return;
      }

      const isCapturablePosition = session.gameType !== 'ur' || (move.to >= 4 && move.to <= 11);
      const wasCapture =
        move.to !== 99 &&
        isCapturablePosition &&
        session.gameState.board.pieces.some(
          (p) => p.playerNumber !== player.playerNumber && p.position === move.to
        );

      const newBoard = gameEngine.applyMove(session.gameState.board, move);
      session.gameState.board = newBoard;
      session.gameState.currentTurn = newBoard.currentTurn;

      const winner = gameEngine.checkWinCondition(newBoard);
      if (winner !== null) {
        session.gameState.winner = winner;
        session.gameState.finished = true;
      }

      if (!session.gameState.moveHistory) session.gameState.moveHistory = [];
      session.gameState.moveHistory.push({
        move,
        playerNumber: player.playerNumber,
        wasCapture,
        timestamp: Date.now(),
      } as HistoricalMove);

      await sessionService.updateGameState(sessionCode, session.gameState);

      io.to(sessionCode).emit('game:move-made', {
        move,
        gameState: session.gameState,
      });

      if (winner !== null) {
        io.to(sessionCode).emit('game:ended', {
          winner,
          gameState: session.gameState,
        });

        // Handle tournament game ended
        if (session.tournamentHubCode) {
          try {
            const tournResult = await sessionService.handleTournamentGameEnded(sessionCode, winner);
            const hubSession = tournResult.hubSession;
            const ts = hubSession.tournamentState!;

            io.to(session.tournamentHubCode).emit('tournament:updated', hubSession);

            if (tournResult.seriesContinued && tournResult.seriesNextSessionCode) {
              const nextCode = tournResult.seriesNextSessionCode;
              const match = ts.rounds.flat().find(m => m.currentSessionCode === nextCode);
              const roundLabel = getRoundLabel(ts.format, match?.roundIndex ?? 0, ts.rounds.length);
              const p1Id = match?.player1Id ?? session.players[0].id;
              const p2Id = match?.player2Id ?? session.players[1].id;
              const p1 = ts.participants.find(p => p.id === p1Id);
              const p2 = ts.participants.find(p => p.id === p2Id);

              const p1Sock = hubSession.players.find(p => p.id === p1Id);
              const p2Sock = hubSession.players.find(p => p.id === p2Id);
              if (p1Sock && p2) io.to(p1Sock.socketId).emit('tournament:match-ready', {
                matchSessionCode: nextCode,
                opponentName: p2.displayName,
                roundLabel,
              });
              if (p2Sock && p1) io.to(p2Sock.socketId).emit('tournament:match-ready', {
                matchSessionCode: nextCode,
                opponentName: p1.displayName,
                roundLabel,
              });
            }

            if (tournResult.matchFinished) {
              if (tournResult.eliminatedPlayerId) {
                const elimSock = hubSession.players.find(p => p.id === tournResult.eliminatedPlayerId);
                if (elimSock) {
                  io.to(elimSock.socketId).emit('tournament:eliminated', {
                    tournamentCode: session.tournamentHubCode,
                  });
                }
              }

              for (const nm of tournResult.nextRoundMatches) {
                const p1 = ts.participants.find(p => p.id === nm.player1Id);
                const p2 = ts.participants.find(p => p.id === nm.player2Id);
                const nextMatch = ts.rounds.flat().find(m => m.currentSessionCode === nm.sessionCode);
                const roundLabel = getRoundLabel(ts.format, nextMatch?.roundIndex ?? 0, ts.rounds.length);

                const p1Sock = hubSession.players.find(p => p.id === nm.player1Id);
                const p2Sock = hubSession.players.find(p => p.id === nm.player2Id);
                if (p1Sock && p2) io.to(p1Sock.socketId).emit('tournament:match-ready', {
                  matchSessionCode: nm.sessionCode,
                  opponentName: p2.displayName,
                  roundLabel,
                });
                if (p2Sock && p1) io.to(p2Sock.socketId).emit('tournament:match-ready', {
                  matchSessionCode: nm.sessionCode,
                  opponentName: p1.displayName,
                  roundLabel,
                });
              }
            }

            if (tournResult.tournamentFinished && ts.winnerId) {
              const winnerParticipant = ts.participants.find(p => p.id === ts.winnerId);
              io.to(session.tournamentHubCode).emit('tournament:finished', {
                tournamentCode: session.tournamentHubCode,
                winnerId: ts.winnerId,
                winnerName: winnerParticipant?.displayName ?? 'Unknown',
              });
            }
          } catch (tournError) {
            console.error('Tournament game end handling failed:', tournError);
          }
        }
      } else {
        io.to(sessionCode).emit('game:turn-changed', {
          currentTurn: session.gameState.currentTurn,
        });

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

  // Rematch
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
  socket.on('chat:send', async ({ sessionCode, playerId, text, scope }) => {
    try {
      const session = await sessionService.getSession(sessionCode);
      if (!session) return;

      const player = session.players.find(p => p.id === playerId);
      const spectator = !player ? session.spectators.find(s => s.id === playerId) : undefined;
      const sender = player ?? spectator;
      if (!sender) return;

      const trimmed = text.trim().slice(0, 500);
      if (!trimmed) return;

      if (scope === 'tournament' && session.tournamentHubCode) {
        const message = {
          id: nanoid(),
          playerId,
          displayName: sender.displayName,
          text: trimmed,
          timestamp: Date.now(),
          isSpectator: !!spectator,
          chatScope: 'tournament' as const,
        };
        await sessionService.addChatMessage(session.tournamentHubCode, message);
        io.to(session.tournamentHubCode).emit('chat:message', message);
      } else if (scope && typeof scope === 'object' && 'toPlayerId' in scope) {
        // DM — ephemeral, not stored
        const target = session.players.find(p => p.id === scope.toPlayerId)
          ?? session.spectators.find(s => s.id === scope.toPlayerId);
        if (target && target.socketId !== 'temp') {
          const dmMessage = {
            id: nanoid(),
            playerId,
            displayName: sender.displayName,
            text: trimmed,
            timestamp: Date.now(),
            isSpectator: !!spectator,
            chatScope: 'dm' as const,
            toPlayerId: scope.toPlayerId,
          };
          io.to(target.socketId).emit('chat:message', dmMessage);
          socket.emit('chat:message', dmMessage);
        }
      } else {
        // Default: match/session chat
        const message = {
          id: nanoid(),
          playerId,
          displayName: sender.displayName,
          text: trimmed,
          timestamp: Date.now(),
          isSpectator: !!spectator,
          chatScope: session.tournamentHubCode ? ('match' as const) : undefined,
        };
        await sessionService.addChatMessage(sessionCode, message);
        io.to(sessionCode).emit('chat:message', message);
      }
    } catch (error) {
      socket.emit('session:error', { message: (error as Error).message });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
}
