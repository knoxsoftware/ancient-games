import {
  GameEngine as IGameEngine,
  BoardState,
  Move,
  Player,
  GameType,
} from '@ancient-games/shared';

export abstract class GameEngine implements IGameEngine {
  abstract gameType: GameType;
  abstract playerCount: number;

  abstract initializeBoard(): BoardState;
  abstract rollDice(): number;
  abstract validateMove(board: BoardState, move: Move, player: Player): boolean;
  abstract applyMove(board: BoardState, move: Move): BoardState;
  abstract checkWinCondition(board: BoardState): number | null;
  abstract getValidMoves(board: BoardState, playerNumber: number, diceRoll: number): Move[];
  abstract canMove(board: BoardState, playerNumber: number, diceRoll: number): boolean;
  abstract isCaptureMove(board: BoardState, move: Move): boolean;

  /** Called after diceRoll is stored on the board. Override to apply game-specific side effects. */
  afterDiceRoll(board: BoardState, roll: number): BoardState {
    return board;
  }
}
