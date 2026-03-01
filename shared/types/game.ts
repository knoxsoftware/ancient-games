export type GameType =
  | 'ur'
  | 'senet'
  | 'morris'
  | 'wolves-and-ravens'
  | 'rock-paper-scissors'
  | 'stellar-siege'
  | 'fox-and-geese'
  | 'mancala'
  | 'go'
  | 'ur-roguelike';

export interface GameManifest {
  type: GameType;
  title: string;
  emoji: string;
  description: string;
  playerColors: [string, string];
  supportsAnimation?: boolean;
  supportsHistory?: boolean;
  disabled?: boolean;
  aiGenerated?: boolean;
}

export const GAME_MANIFESTS: Record<GameType, GameManifest> = {
  ur: {
    type: 'ur',
    title: 'Royal Game of Ur',
    emoji: '\u{1F3DB}\uFE0F',
    description: '2 players',
    playerColors: ['#2F6BAD', '#7A4A22'],
    supportsAnimation: true,
    supportsHistory: true,
  },
  senet: {
    type: 'senet',
    title: 'Senet',
    emoji: '\u{1F3FA}',
    description: '2 players',
    playerColors: ['#C4A870', '#3A1A00'],
    supportsAnimation: true,
    supportsHistory: true,
  },
  morris: {
    type: 'morris',
    title: "Nine Men's Morris",
    emoji: '\u2B21',
    description: '2 players',
    playerColors: ['#3B82F6', '#EF4444'],
    supportsAnimation: true,
    supportsHistory: true,
  },
  'wolves-and-ravens': {
    type: 'wolves-and-ravens',
    title: 'Wolves & Ravens',
    emoji: '\u{1F43A}',
    description: 'Asymmetric hunt',
    playerColors: ['#C4900A', '#4A4A80'],
    supportsHistory: true,
    aiGenerated: true,
  },
  'rock-paper-scissors': {
    type: 'rock-paper-scissors',
    title: 'Rock Paper Scissors',
    emoji: '\u2702\uFE0F',
    description: 'Single battle',
    playerColors: ['#6B7280', '#6B7280'],
  },
  'stellar-siege': {
    type: 'stellar-siege',
    title: 'Stellar Siege',
    emoji: '\u{1F680}',
    description: 'Asymmetric defense',
    playerColors: ['#80DFFF', '#7FFF5A'],
    disabled: false,
    aiGenerated: true,
  },
  'fox-and-geese': {
    type: 'fox-and-geese',
    title: 'Fox & Geese',
    emoji: '\u{1F98A}',
    description: 'Asymmetric hunt',
    playerColors: ['#9CA3AF', '#F59E0B'],
    supportsHistory: true,
  },
  mancala: {
    type: 'mancala',
    title: 'Mancala',
    emoji: '\u{1FAB7}',
    description: '2 players',
    playerColors: ['#C0622A', '#4A7A9B'],
    supportsHistory: true,
  },
  go: {
    type: 'go',
    title: 'Go',
    emoji: '\u26AB',
    description: '2 players · 9×9',
    playerColors: ['#1A1A1A', '#F5F5F0'],
    supportsHistory: true,
  },
  'ur-roguelike': {
    type: 'ur-roguelike',
    title: 'Ur: Cursed Paths',
    emoji: '🎲',
    description: '2 players · roguelike',
    playerColors: ['#2F6BAD', '#7A4A22'],
    supportsAnimation: true,
  },
};

export function getGameTitle(gameType: GameType): string {
  return GAME_MANIFESTS[gameType].title;
}

export type TournamentFormat = 'bo1' | 'bo3' | 'bo5' | 'bo7' | 'round-robin';

export interface TournamentParticipant {
  id: string;
  displayName: string;
  seed: number;
  eliminated: boolean;
}

export interface TournamentMatch {
  matchId: string;
  roundIndex: number;
  matchIndex: number;
  player1Id: string | null;
  player2Id: string | null;
  player1Wins: number;
  player2Wins: number;
  winnerId: string | null;
  currentSessionCode: string | null;
  status: 'pending' | 'in_progress' | 'finished' | 'bye';
}

export interface TournamentStanding {
  playerId: string;
  wins: number;
  losses: number;
  matchesPlayed: number;
}

export interface TournamentState {
  format: TournamentFormat;
  rounds: TournamentMatch[][];
  currentRound: number;
  participants: TournamentParticipant[];
  standings?: TournamentStanding[];
  winnerId: string | null;
}

export type BotDifficulty = 'easy' | 'medium' | 'hard' | 'harder' | 'hardest';

export interface Player {
  id: string;
  displayName: string;
  socketId: string;
  ready: boolean;
  playerNumber: number; // 0 or 1
  status: 'active' | 'away';
  awayAt?: number; // unix ms timestamp set when player disconnects
  isBot?: boolean;
  botDifficulty?: BotDifficulty;
  botPersona?: string;
}

export interface Spectator {
  id: string;
  displayName: string;
  socketId: string;
  status: 'active' | 'away';
  originalSeatNumber?: number; // set only when auto-converted on disconnect
}

export interface Move {
  playerId: string;
  pieceIndex: number;
  from: number;
  to: number;
  diceRoll?: number;
}

export interface Modifier {
  id: string;
  owner: number | 'global';
  remainingUses: number | null; // null = permanent for the game
  params?: Record<string, unknown>;
}

export interface BoardState {
  pieces: PiecePosition[];
  currentTurn: number;
  diceRoll: number | null;
  lastMove: Move | null;
  // Roguelike extensions (only present for ur-roguelike)
  modifiers?: Modifier[];
  eventSquares?: number[];
  draftPhase?: boolean;
  draftOffers?: { player: number; options: string[] }[];
  pendingEventResult?: { eventId: string; description: string; affectedPieceIndices?: number[] } | null;
  skipNextTurn?: number | null; // playerNumber whose next turn is skipped
  barrierSquares?: { position: number; turnsRemaining: number }[];
  extraTurnFor?: number | null; // playerNumber who gets an extra turn
  extraMovePendingFor?: number | null; // playerNumber who gets an extra move (Surge power)
  extraRosettes?: number[]; // additional rosette positions added by rosette_shift event
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
  isCaptureMove(board: BoardState, move: Move): boolean;
}
