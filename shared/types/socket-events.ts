import { Session, GameState, Move } from './index';

// Client to Server events
export interface ClientToServerEvents {
  'session:join': (data: { sessionCode: string; playerId: string }) => void;
  'session:leave': (data: { sessionCode: string; playerId: string }) => void;
  'session:ready': (data: { sessionCode: string; playerId: string; ready: boolean }) => void;
  'game:start': (data: { sessionCode: string; playerId: string }) => void;
  'game:roll-dice': (data: { sessionCode: string; playerId: string }) => void;
  'game:move': (data: { sessionCode: string; playerId: string; move: Move }) => void;
  'game:skip-turn': (data: { sessionCode: string; playerId: string }) => void;
  'game:rematch': (data: { sessionCode: string; playerId: string }) => void;
  'chat:send': (data: { sessionCode: string; playerId: string; text: string }) => void;
  'session:stand-up': (data: { sessionCode: string; playerId: string }) => void;
  'session:take-seat': (data: { sessionCode: string; playerId: string }) => void;
}

// Server to Client events
export interface ServerToClientEvents {
  'session:updated': (session: Session) => void;
  'session:player-joined': (session: Session) => void;
  'session:player-left': (session: Session) => void;
  'session:error': (error: { message: string }) => void;
  'game:started': (session: Session) => void;
  'game:state-updated': (gameState: GameState) => void;
  'game:dice-rolled': (data: { playerNumber: number; roll: number; canMove: boolean }) => void;
  'game:move-made': (data: { move: Move; gameState: GameState }) => void;
  'game:turn-changed': (data: { currentTurn: number }) => void;
  'game:ended': (data: { winner: number; gameState: GameState }) => void;
  'game:error': (error: { message: string }) => void;
  'game:restarted': (session: Session) => void;
  'chat:message': (data: { playerId: string; displayName: string; text: string; timestamp: number; isSpectator?: boolean }) => void;
}
