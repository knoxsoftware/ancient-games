export type GameType = 'ur' | 'senet' | 'morris' | 'wolves-and-ravens';

export interface Player {
  id: string;
  displayName: string;
  socketId: string;
  ready: boolean;
  playerNumber: number; // 0 or 1
}

export interface Spectator {
  id: string;
  displayName: string;
  socketId: string;
}

export interface Move {
  playerId: string;
  pieceIndex: number;
  from: number;
  to: number;
  diceRoll?: number;
}

export interface BoardState {
  pieces: PiecePosition[];
  currentTurn: number;
  diceRoll: number | null;
  lastMove: Move | null;
}

export interface PiecePosition {
  playerNumber: number;
  pieceIndex: number;
  position: number; // -1 = not on board, 0-N = board positions, 99 = finished
}

export interface HistoricalMove {
  move: Move;
  playerNumber: number;
  wasCapture: boolean;
  isSkip?: boolean;
  timestamp: number;
}

export interface GameState {
  board: BoardState;
  currentTurn: number;
  winner: number | null;
  started: boolean;
  finished: boolean;
  moveHistory?: HistoricalMove[];
}

export interface GameEngine {
  gameType: GameType;
  playerCount: number;

  initializeBoard(): BoardState;
  rollDice(): number;
  validateMove(board: BoardState, move: Move, player: Player): boolean;
  applyMove(board: BoardState, move: Move): BoardState;
  checkWinCondition(board: BoardState): number | null;
  getValidMoves(board: BoardState, playerNumber: number, diceRoll: number): Move[];
  canMove(board: BoardState, playerNumber: number, diceRoll: number): boolean;
}
