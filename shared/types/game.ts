export type GameType = 'ur' | 'senet' | 'morris' | 'wolves-and-ravens' | 'dominos';

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

export interface DominoTile {
  id: number;   // 0-27
  high: number; // 0-6
  low: number;  // 0-6, always <= high
}

export interface PlayedDomino {
  tile: DominoTile;
  side: 'initial' | 'left' | 'right'; // which end of chain it was added to
  flipped: boolean;  // true = display as [low|high], false = [high|low]
  playerNumber: number;
}

export interface DominoPrivateState {
  playerNumber: number;
  hand: DominoTile[];
}

export interface BoardState {
  pieces: PiecePosition[];
  currentTurn: number;
  diceRoll: number | null;
  lastMove: Move | null;
  // Dominos public state
  dominoChain?: PlayedDomino[];
  dominoHandSizes?: number[];
  dominoBoneyardSize?: number;
  // Dominos server-only state (stripped before all broadcasts)
  dominoHands?: DominoTile[][];
  dominoBoneyard?: DominoTile[];
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
