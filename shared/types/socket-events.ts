import { Session, GameState, Move, HistoricalMove, ChatMessage } from './index';
import { TournamentFormat } from './game';

// Client to Server events
export interface ClientToServerEvents {
  'session:join': (data: { sessionCode: string; playerId: string }) => void;
  'session:leave': (data: { sessionCode: string; playerId: string }) => void;
  'session:ready': (data: { sessionCode: string; playerId: string; ready: boolean }) => void;
  'game:start': (data: {
    sessionCode: string;
    playerId: string;
    tournamentFormat?: TournamentFormat;
  }) => void;
  'game:roll-dice': (data: { sessionCode: string; playerId: string }) => void;
  'game:move': (data: { sessionCode: string; playerId: string; move: Move }) => void;
  'game:skip-turn': (data: { sessionCode: string; playerId: string }) => void;
  'game:rematch': (data: { sessionCode: string; playerId: string }) => void;
  'chat:send': (data: {
    sessionCode: string;
    playerId: string;
    text: string;
    scope?: 'tournament' | { toPlayerId: string };
  }) => void;
  'session:stand-up': (data: { sessionCode: string; playerId: string }) => void;
  'session:take-seat': (data: { sessionCode: string; playerId: string }) => void;
  'session:host-stand-up': (data: {
    sessionCode: string;
    playerId: string;
    targetPlayerId: string;
  }) => void;
  'session:host-take-seat': (data: {
    sessionCode: string;
    playerId: string;
    targetPlayerId: string;
  }) => void;
  'player:away': (data: { sessionCode: string; playerId: string }) => void;
  'player:active': (data: { sessionCode: string; playerId: string }) => void;
  'session:set-format': (data: {
    sessionCode: string;
    playerId: string;
    format: TournamentFormat | 'single';
  }) => void;
  'session:boot-player': (data: {
    sessionCode: string;
    playerId: string;
    targetPlayerId: string;
  }) => void;
  'game:draft-pick': (data: { sessionCode: string; playerId: string; powerId: string }) => void;
  'game:use-power': (data: { sessionCode: string; playerId: string; powerId: string }) => void;
}

// Server to Client events
export interface ServerToClientEvents {
  'session:updated': (session: Session) => void;
  'session:player-joined': (session: Session) => void;
  'session:player-left': (session: Session) => void;
  'session:error': (error: { message: string }) => void;
  'game:started': (session: Session) => void;
  'game:state-updated': (gameState: GameState) => void;
  'game:dice-rolled': (data: { playerNumber: number; roll: number; canMove: boolean; canReroll?: boolean }) => void;
  'game:move-made': (data: { move: Move; gameState: GameState; wasCapture: boolean }) => void;
  'game:turn-changed': (data: { currentTurn: number }) => void;
  'game:ended': (data: { winner: number; gameState: GameState }) => void;
  'game:error': (error: { message: string }) => void;
  'game:restarted': (session: Session) => void;
  'chat:message': (data: ChatMessage) => void;
  'game:history': (moves: HistoricalMove[]) => void;
  'chat:history': (messages: ChatMessage[]) => void;
  'tournament:updated': (session: Session) => void;
  'tournament:match-ready': (data: {
    matchSessionCode: string;
    opponentName: string;
    roundLabel: string;
  }) => void;
  'tournament:eliminated': (data: { tournamentCode: string }) => void;
  'tournament:finished': (data: {
    tournamentCode: string;
    winnerId: string;
    winnerName: string;
  }) => void;
  'tournament:match-game-state': (data: {
    matchId: string;
    gameState: GameState;
    sessionCode: string;
  }) => void;
  'game:draft-offer': (data: {
    sessionCode: string;
    playerNumber: number;
    options: string[];
  }) => void;
  'game:event-triggered': (data: {
    sessionCode: string;
    eventId: string;
    description: string;
    affectedPieceIndices?: number[];
  }) => void;
}
