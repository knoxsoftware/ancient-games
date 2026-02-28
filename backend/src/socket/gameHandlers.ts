import { Server, Socket } from 'socket.io';
import { nanoid } from 'nanoid';
import { SessionService } from '../services/SessionService';
import { PushService } from '../services/PushService';
import { BotService } from '../ai/BotService';
import { GameRegistry } from '../games/GameRegistry';
import { UrRoguelikeGame } from '../games/ur-roguelike/UrRoguelikeGame';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  GameState,
  Session,
  HistoricalMove,
  getGameTitle,
  Player,
} from '@ancient-games/shared';

const socketToSession = new Map<string, { sessionCode: string; playerId: string }>();

function getRoundLabel(format: string, roundIndex: number, totalRounds: number): string {
  if (format === 'round-robin') return `Round ${roundIndex + 1}`;
  const remaining = totalRounds - roundIndex;
  if (remaining === 1) return 'Final';
  if (remaining === 2) return 'Semi-final';
  if (remaining === 3) return 'Quarter-final';
  return `Round of ${Math.pow(2, remaining)}`;
}

function relayGameStateToHub(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  session: Session,
  gameState: GameState,
) {
  if (session.tournamentHubCode && session.tournamentMatchId) {
    io.to(session.tournamentHubCode).emit('tournament:match-game-state', {
      matchId: session.tournamentMatchId,
      gameState,
      sessionCode: session.sessionCode,
    });
  }
}

export function registerGameHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  sessionService: SessionService,
  pushService: PushService,
  botService: BotService,
) {
  // Join a session room
  socket.on('session:join', async ({ sessionCode, playerId }) => {
    try {
      const session = await sessionService.getSession(sessionCode);
      if (!session) {
        socket.emit('session:error', { message: 'Session not found' });
        return;
      }

      const joiningPlayer = session.players.find((p) => p.id === playerId);
      let joiningSpectator = !joiningPlayer
        ? session.spectators.find((s) => s.id === playerId)
        : undefined;
      const isFirstConnect =
        joiningPlayer?.socketId === 'temp' || joiningSpectator?.socketId === 'temp';

      // Register socket→session mapping
      socketToSession.set(socket.id, { sessionCode, playerId });

      // Reconnecting player: mark active and reclaim seat if they were booted while away
      const cur = await sessionService.getSession(sessionCode);
      if (cur) {
        const asSpec = cur.spectators.find((s) => s.id === playerId);
        if (asSpec && (asSpec as any).originalSeatNumber != null) {
          const seatFree = !cur.players.some(
            (p) => p.playerNumber === (asSpec as any).originalSeatNumber,
          );
          if (seatFree) {
            await sessionService.spectatorToPlayer(
              sessionCode,
              playerId,
              (asSpec as any).originalSeatNumber,
            );
          }
        } else {
          // Still seated but was away — mark active again
          const asPlayer = cur.players.find((p) => p.id === playerId);
          if (asPlayer && (asPlayer as any).status === 'away') {
            await sessionService.updatePresenceStatus(sessionCode, playerId, 'active');
          }
        }
      }

      // Auto-add hub participants as spectators in tournament match sessions
      if (!joiningPlayer && !joiningSpectator && session.tournamentHubCode) {
        const hubSession = await sessionService.getSession(session.tournamentHubCode);
        if (hubSession) {
          const hubIdentity =
            hubSession.players.find((p) => p.id === playerId) ??
            hubSession.spectators.find((s) => s.id === playerId);
          if (hubIdentity) {
            await sessionService.addSpectatorWithId(
              sessionCode,
              playerId,
              hubIdentity.displayName,
              socket.id,
            );
            joiningSpectator = {
              id: playerId,
              displayName: hubIdentity.displayName,
              socketId: socket.id,
              status: 'active',
            };
          }
        }
      }

      await sessionService.updatePlayerSocketId(sessionCode, playerId, socket.id);

      // Leave any previously joined session rooms before joining the new one,
      // so stale events from old sessions don't bleed into new sessions.
      for (const room of Array.from(socket.rooms)) {
        if (room !== socket.id) socket.leave(room);
      }

      socket.join(sessionCode);

      // If this is a tournament match session, also join the hub room and update hub socketId
      if (session.tournamentHubCode) {
        socket.join(session.tournamentHubCode);
        await sessionService.updatePlayerSocketId(session.tournamentHubCode, playerId, socket.id);
      }

      // Re-fetch after potential auto-add so session:updated reflects the new spectator
      const freshSession = (await sessionService.getSession(sessionCode)) ?? session;

      io.to(sessionCode).emit('session:updated', freshSession);

      // If rejoining a tournament hub session and there's an active match for this player,
      // re-send tournament:match-ready in case they missed it due to a broken connection.
      if (!session.tournamentHubCode && freshSession.tournamentState) {
        const ts = freshSession.tournamentState;
        const activeMatch = ts.rounds.flat().find(
          (m) =>
            m.status === 'in_progress' &&
            m.currentSessionCode &&
            (m.player1Id === playerId || m.player2Id === playerId),
        );
        if (activeMatch) {
          const opponentId =
            activeMatch.player1Id === playerId ? activeMatch.player2Id : activeMatch.player1Id;
          const opponent = ts.participants.find((p) => p.id === opponentId);
          if (opponent) {
            const roundLabel = getRoundLabel(ts.format, activeMatch.roundIndex, ts.rounds.length);
            socket.emit('tournament:match-ready', {
              matchSessionCode: activeMatch.currentSessionCode!,
              opponentName: opponent.displayName,
              roundLabel,
            });
          }
        }
      }

      // Send current game state directly to the joining client only
      socket.emit('game:state-updated', freshSession.gameState);

      socket.emit('game:history', freshSession.gameState.moveHistory ?? []);
      socket.emit('chat:history', freshSession.chatHistory ?? []);

      if (isFirstConnect && joiningPlayer) {
        for (const other of freshSession.players) {
          if (other.id !== playerId) {
            await pushService.sendNotification(other.id, {
              title: 'Player joined!',
              body: `${joiningPlayer.displayName} joined your ${getGameTitle(session.gameType)} lobby`,
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
      const isPlayer = currentSession?.players.some((p) => p.id === playerId) ?? false;

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

  // Set lobby format (host only) — also auto-promotes spectators to players for tournament formats
  socket.on('session:set-format', async ({ sessionCode, playerId, format }) => {
    try {
      const session = await sessionService.setLobbyFormat(sessionCode, playerId, format);
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
      const currentSession = await sessionService.getSession(sessionCode);
      if (!currentSession) {
        socket.emit('session:error', { message: 'Session not found' });
        return;
      }
      const maxPlayers = (currentSession.lobbyFormat ?? 'single') === 'single' ? 2 : 8;
      if (currentSession.players.length >= maxPlayers) {
        socket.emit('session:error', { message: 'No seats available' });
        return;
      }
      const session = await sessionService.spectatorToPlayer(sessionCode, playerId);
      if (session) {
        io.to(sessionCode).emit('session:updated', session);
      }
    } catch (error) {
      socket.emit('session:error', { message: (error as Error).message });
    }
  });

  // Host forces a seated player to become a spectator
  socket.on('session:host-stand-up', async ({ sessionCode, playerId, targetPlayerId }) => {
    try {
      const currentSession = await sessionService.getSession(sessionCode);
      if (!currentSession) {
        socket.emit('session:error', { message: 'Session not found' });
        return;
      }
      if (currentSession.hostId !== playerId) {
        socket.emit('session:error', { message: 'Only the host can move players' });
        return;
      }
      const session = await sessionService.playerToSpectator(sessionCode, targetPlayerId);
      if (session) {
        io.to(sessionCode).emit('session:updated', session);
      }
    } catch (error) {
      socket.emit('session:error', { message: (error as Error).message });
    }
  });

  // Host forces a spectator to take a seat
  socket.on('session:host-take-seat', async ({ sessionCode, playerId, targetPlayerId }) => {
    try {
      const currentSession = await sessionService.getSession(sessionCode);
      if (!currentSession) {
        socket.emit('session:error', { message: 'Session not found' });
        return;
      }
      if (currentSession.hostId !== playerId) {
        socket.emit('session:error', { message: 'Only the host can move players' });
        return;
      }
      const maxPlayers = (currentSession.lobbyFormat ?? 'single') === 'single' ? 2 : 8;
      if (currentSession.players.length >= maxPlayers) {
        socket.emit('session:error', { message: 'No seats available' });
        return;
      }
      const session = await sessionService.spectatorToPlayer(sessionCode, targetPlayerId);
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

        const player = session.players.find((p) => p.id === playerId);
        if (player) {
          const statusText = ready
            ? `${player.displayName} is ready!`
            : `${player.displayName} is not ready`;
          for (const other of session.players) {
            if (other.id !== playerId) {
              await pushService.sendNotification(other.id, {
                title: statusText,
                body: `${getGameTitle(session.gameType)} lobby`,
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
          tournamentFormat,
        );

        io.to(sessionCode).emit('tournament:updated', hubSession);

        const ts = hubSession.tournamentState!;
        for (const ms of matchSessions) {
          const p1 = ts.participants.find((p) => p.id === ms.player1Id);
          const p2 = ts.participants.find((p) => p.id === ms.player2Id);
          const roundLabel = getRoundLabel(tournamentFormat, 0, ts.rounds.length);

          const p1Player = hubSession.players.find((p) => p.id === ms.player1Id);
          const p2Player = hubSession.players.find((p) => p.id === ms.player2Id);

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

        // Note: initial game states are relayed via relayGameStateToHub when each match's
        // game:start fires (Task 2 relay). No gameState exists at tournament creation time.
      } else {
        const session = await sessionService.startGame(sessionCode, playerId);
        if (session) {
          io.to(sessionCode).emit('game:started', session);
          relayGameStateToHub(io, session, session.gameState!);

          // If first player is a bot, kick off their turn
          const startingBot = session.players.find(
            (p) => p.isBot && p.playerNumber === session.gameState.currentTurn,
          );
          if (startingBot) {
            botService.notifyBotTurn(sessionCode, startingBot.id).catch(() => {});
          }

          const hasBotPersona = session.players.some((p) => p.isBot && p.botPersona);
          if (hasBotPersona) {
            botService.notifyBotGameStart(sessionCode).catch(() => {});
          }
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

      const player = session.players.find((p) => p.id === playerId);
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
      relayGameStateToHub(io, session, session.gameState!);

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

        const nextPlayer = session.players.find((p) => p.playerNumber === nextTurn);
        if (nextPlayer) {
          if (!nextPlayer.isBot) {
            await pushService.sendNotification(nextPlayer.id, {
              title: 'Your turn!',
              body: `${player.displayName} had no moves in ${getGameTitle(session.gameType)}`,
              url: `/game/${sessionCode}`,
            });
          } else {
            botService.notifyBotTurn(sessionCode, nextPlayer.id).catch(() => {});
          }
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

      const player = session.players.find((p) => p.id === playerId);
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

      const wasCapture = gameEngine.isCaptureMove(session.gameState.board, move);

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
        wasCapture,
      });
      relayGameStateToHub(io, session, session.gameState!);

      if (newBoard.pendingEventResult) {
        io.to(sessionCode).emit('game:event-triggered', {
          sessionCode,
          eventId: newBoard.pendingEventResult.eventId,
          description: newBoard.pendingEventResult.description,
          affectedPieceIndices: newBoard.pendingEventResult.affectedPieceIndices,
        });
      }

      if (winner !== null) {
        io.to(sessionCode).emit('game:ended', {
          winner,
          gameState: session.gameState,
        });

        const hasBotPersona = session.players.some((p) => p.isBot && p.botPersona);
        if (hasBotPersona) {
          botService.notifyBotGameEnd(sessionCode, winner).catch(() => {});
        }

        // Handle tournament game ended
        if (session.tournamentHubCode) {
          try {
            const tournResult = await sessionService.handleTournamentGameEnded(sessionCode, winner);
            const hubSession = tournResult.hubSession;
            const ts = hubSession.tournamentState!;

            io.to(session.tournamentHubCode).emit('tournament:updated', hubSession);

            if (tournResult.seriesContinued && tournResult.seriesNextSessionCode) {
              const nextCode = tournResult.seriesNextSessionCode;
              const match = ts.rounds.flat().find((m) => m.currentSessionCode === nextCode);
              const roundLabel = getRoundLabel(ts.format, match?.roundIndex ?? 0, ts.rounds.length);
              const p1Id = match?.player1Id ?? session.players[0].id;
              const p2Id = match?.player2Id ?? session.players[1].id;
              const p1 = ts.participants.find((p) => p.id === p1Id);
              const p2 = ts.participants.find((p) => p.id === p2Id);

              const p1Sock = hubSession.players.find((p) => p.id === p1Id);
              const p2Sock = hubSession.players.find((p) => p.id === p2Id);
              if (p1Sock && p2)
                io.to(p1Sock.socketId).emit('tournament:match-ready', {
                  matchSessionCode: nextCode,
                  opponentName: p2.displayName,
                  roundLabel,
                });
              if (p2Sock && p1)
                io.to(p2Sock.socketId).emit('tournament:match-ready', {
                  matchSessionCode: nextCode,
                  opponentName: p1.displayName,
                  roundLabel,
                });
            }

            if (tournResult.matchFinished) {
              if (tournResult.eliminatedPlayerId) {
                const elimSock = hubSession.players.find(
                  (p) => p.id === tournResult.eliminatedPlayerId,
                );
                if (elimSock) {
                  io.to(elimSock.socketId).emit('tournament:eliminated', {
                    tournamentCode: session.tournamentHubCode,
                  });
                }
              }

              for (const nm of tournResult.nextRoundMatches) {
                const p1 = ts.participants.find((p) => p.id === nm.player1Id);
                const p2 = ts.participants.find((p) => p.id === nm.player2Id);
                const nextMatch = ts.rounds
                  .flat()
                  .find((m) => m.currentSessionCode === nm.sessionCode);
                const roundLabel = getRoundLabel(
                  ts.format,
                  nextMatch?.roundIndex ?? 0,
                  ts.rounds.length,
                );

                const p1Sock = hubSession.players.find((p) => p.id === nm.player1Id);
                const p2Sock = hubSession.players.find((p) => p.id === nm.player2Id);
                if (p1Sock && p2)
                  io.to(p1Sock.socketId).emit('tournament:match-ready', {
                    matchSessionCode: nm.sessionCode,
                    opponentName: p2.displayName,
                    roundLabel,
                  });
                if (p2Sock && p1)
                  io.to(p2Sock.socketId).emit('tournament:match-ready', {
                    matchSessionCode: nm.sessionCode,
                    opponentName: p1.displayName,
                    roundLabel,
                  });
              }
            }

            if (tournResult.tournamentFinished && ts.winnerId) {
              const winnerParticipant = ts.participants.find((p) => p.id === ts.winnerId);
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
          (p) => p.playerNumber === session.gameState.currentTurn,
        );
        if (nextPlayer && nextPlayer.id !== playerId) {
          if (nextPlayer.isBot) {
            botService.notifyBotTurn(sessionCode, nextPlayer.id).catch(() => {});
          } else {
            await pushService.sendNotification(nextPlayer.id, {
              title: 'Your turn!',
              body: `${player.displayName} made a move in ${getGameTitle(session.gameType)}`,
              url: `/game/${sessionCode}`,
            });
          }
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

      const player = session.players.find((p) => p.id === playerId);
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
      relayGameStateToHub(io, session, session.gameState!);

      // If next player is a bot, kick off their turn
      const nextBot = session.players.find(
        (p) => p.isBot && p.playerNumber === nextTurn,
      );
      if (nextBot) {
        botService.notifyBotTurn(sessionCode, nextBot.id).catch(() => {});
      }
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

      const player = session.players.find((p) => p.id === playerId);
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

        // If first player is a bot, kick off their turn
        const startingBot = newSession.players.find(
          (p) => p.isBot && p.playerNumber === newSession.gameState.currentTurn,
        );
        if (startingBot) {
          botService.notifyBotTurn(sessionCode, startingBot.id).catch(() => {});
        }
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

      const player = session.players.find((p) => p.id === playerId);
      const spectator = !player ? session.spectators.find((s) => s.id === playerId) : undefined;
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
        const target =
          session.players.find((p) => p.id === scope.toPlayerId) ??
          session.spectators.find((s) => s.id === scope.toPlayerId);
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

  // Draft pick (ur-roguelike)
  socket.on('game:draft-pick', async ({ sessionCode, playerId, powerId }) => {
    try {
      const session = await sessionService.getSession(sessionCode);
      if (!session) return;

      const player = session.players.find((p: Player) => p.id === playerId);
      if (!player) return;

      const engine = GameRegistry.getGame(session.gameType);
      if (typeof (engine as UrRoguelikeGame).applyDraftPick !== 'function') return;

      const gameState = session.gameState as GameState;
      const newBoard = (engine as UrRoguelikeGame).applyDraftPick(
        gameState.board,
        player.playerNumber,
        powerId,
      );

      session.gameState = { ...gameState, board: newBoard };
      await sessionService.updateGameState(sessionCode, session.gameState);

      io.to(sessionCode).emit('game:state-updated', session.gameState);
    } catch (error) {
      socket.emit('game:error', { message: (error as Error).message });
    }
  });

  // Use power (ur-roguelike: slow_curse)
  socket.on('game:use-power', async ({ sessionCode, playerId, powerId }) => {
    try {
      const session = await sessionService.getSession(sessionCode);
      if (!session) return;

      const player = session.players.find((p: Player) => p.id === playerId);
      if (!player) return;

      const engine = GameRegistry.getGame(session.gameType) as UrRoguelikeGame;
      const gameState = session.gameState as GameState;
      let newBoard = gameState.board;

      if (powerId === 'slow_curse' && typeof engine.applySlowCurse === 'function') {
        newBoard = engine.applySlowCurse(newBoard, player.playerNumber);
      }

      session.gameState = { ...gameState, board: newBoard };
      await sessionService.updateGameState(sessionCode, session.gameState);
      io.to(sessionCode).emit('game:state-updated', session.gameState);
    } catch (error) {
      socket.emit('game:error', { message: (error as Error).message });
    }
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    console.log('Client disconnected:', socket.id);
    const mapping = socketToSession.get(socket.id);
    if (!mapping) return;
    socketToSession.delete(socket.id);
    const { sessionCode, playerId } = mapping;

    try {
      const session = await sessionService.getSession(sessionCode);
      if (!session) return;
      const isSeatedPlayer = session.players.some((p) => p.id === playerId);
      if (!isSeatedPlayer) return;

      // Don't mark lobby players as away — they reconnect seamlessly and
      // marking them away would cause them to appear "re-added" on reconnect.
      if (session.status === 'lobby') return;

      const updated = await sessionService.updatePresenceStatus(sessionCode, playerId, 'away');
      if (updated) io.to(sessionCode).emit('session:updated', updated);
    } catch (err) {
      console.error('Disconnect handler failed:', err);
    }
  });

  // Boot a disconnected player (seated players only)
  socket.on('session:boot-player', async ({ sessionCode, playerId, targetPlayerId }) => {
    try {
      const session = await sessionService.getSession(sessionCode);
      if (!session) return;

      const requester = session.players.find((p) => p.id === playerId);
      if (!requester) return; // only seated players can boot

      const target = session.players.find((p) => p.id === targetPlayerId);
      if (!target || (target as any).status !== 'away') return; // target must be away

      const updated = await sessionService.playerToSpectator(sessionCode, targetPlayerId, {
        storeOriginalSeat: true,
      });
      if (updated) io.to(sessionCode).emit('session:updated', updated);
    } catch (err) {
      console.error('session:boot-player handler failed:', err);
    }
  });

  // Presence: player went away (tab hidden)
  socket.on('player:away', async ({ sessionCode, playerId }) => {
    try {
      const updated = await sessionService.updatePresenceStatus(sessionCode, playerId, 'away');
      if (updated) io.to(sessionCode).emit('session:updated', updated);
    } catch (err) {
      console.error('player:away handler failed:', err);
    }
  });

  // Presence: player returned (tab visible)
  socket.on('player:active', async ({ sessionCode, playerId }) => {
    try {
      const updated = await sessionService.updatePresenceStatus(sessionCode, playerId, 'active');
      if (updated) io.to(sessionCode).emit('session:updated', updated);
    } catch (err) {
      console.error('player:active handler failed:', err);
    }
  });
}
