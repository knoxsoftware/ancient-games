import { GameEngine } from '../GameEngine';
import { BoardState, Move, Player, PiecePosition } from '@ancient-games/shared';

/**
 * Mancala (Kalah variant)
 *
 * Board positions (14 total):
 *   0-5   : Player 0's pits (left to right)
 *   6     : Player 0's store (Kalah)
 *   7-12  : Player 1's pits (right to left from P1's perspective)
 *   13    : Player 1's store (Kalah)
 *
 * PiecePosition encoding:
 *   playerNumber = owner of that position (0 for 0-6, 1 for 7-13)
 *   pieceIndex   = position index (0-13)
 *   position     = number of seeds in that pit
 *
 * Sowing order (counter-clockwise): 0→1→…→5→6→7→…→12→13→0→…
 *   Player 0 skips position 13 (opponent's store)
 *   Player 1 skips position 6  (opponent's store)
 *
 * Move encoding:
 *   move.from / move.pieceIndex = pit index to sow from (0-12)
 *   move.to = unused (set to 0)
 *
 * Special rules:
 *   Extra turn: last seed lands in own store
 *   Capture: last seed lands in own previously-empty pit while opposite pit is non-empty
 *   Game end: when one side's pits are all empty; remaining seeds go to other player's store
 */
export class MancalaGame extends GameEngine {
  gameType = 'mancala' as const;
  playerCount = 2;

  private readonly SEEDS_PER_PIT = 4;
  private readonly TOTAL_POSITIONS = 14;
  private readonly P0_STORE = 6;
  private readonly P1_STORE = 13;

  initializeBoard(): BoardState {
    const pieces: PiecePosition[] = [];
    for (let i = 0; i < this.TOTAL_POSITIONS; i++) {
      const isStore = i === this.P0_STORE || i === this.P1_STORE;
      pieces.push({
        playerNumber: i <= this.P0_STORE ? 0 : 1,
        pieceIndex: i,
        position: isStore ? 0 : this.SEEDS_PER_PIT,
      });
    }
    return {
      pieces,
      currentTurn: Math.floor(Math.random() * 2),
      diceRoll: null,
      lastMove: null,
    };
  }

  rollDice(): number {
    // No dice in Mancala — always 1 to satisfy the roll requirement
    return 1;
  }

  /** Read seed count at a position index from the pieces array */
  private getSeeds(pieces: PiecePosition[], pos: number): number {
    return pieces.find((p) => p.pieceIndex === pos)?.position ?? 0;
  }

  /** Return a new pieces array with the seed count at pos set to count */
  private setSeeds(pieces: PiecePosition[], pos: number, count: number): PiecePosition[] {
    return pieces.map((p) => (p.pieceIndex === pos ? { ...p, position: count } : p));
  }

  /** The store index for a given player */
  private storeFor(playerNumber: number): number {
    return playerNumber === 0 ? this.P0_STORE : this.P1_STORE;
  }

  /** The opponent's store index for a given player */
  private opponentStore(playerNumber: number): number {
    return playerNumber === 0 ? this.P1_STORE : this.P0_STORE;
  }

  /** Whether a position index belongs to a player's pits (not store) */
  private isOwnPit(pos: number, playerNumber: number): boolean {
    if (playerNumber === 0) return pos >= 0 && pos <= 5;
    return pos >= 7 && pos <= 12;
  }

  /** Capture opposite pit index (only valid for non-store positions) */
  private oppositePit(pos: number): number {
    return 12 - pos;
  }

  /**
   * Simulate sowing from a pit. Returns:
   *   pieces: updated board
   *   lastPos: final position where last seed landed
   *   extraTurn: whether player earns another turn
   *   captureOccurred: whether a capture happened
   */
  private simulateSow(
    pieces: PiecePosition[],
    fromPos: number,
    playerNumber: number,
  ): { pieces: PiecePosition[]; lastPos: number; extraTurn: boolean; captureOccurred: boolean } {
    let newPieces = pieces.map((p) => ({ ...p }));
    let seeds = this.getSeeds(newPieces, fromPos);
    newPieces = this.setSeeds(newPieces, fromPos, 0);

    const skipPos = this.opponentStore(playerNumber);
    let pos = fromPos;
    while (seeds > 0) {
      pos = (pos + 1) % this.TOTAL_POSITIONS;
      if (pos === skipPos) continue;
      newPieces = this.setSeeds(newPieces, pos, this.getSeeds(newPieces, pos) + 1);
      seeds--;
    }

    const extraTurn = pos === this.storeFor(playerNumber);

    // Capture: last seed in own previously-empty pit, opposite has seeds
    let captureOccurred = false;
    if (
      this.isOwnPit(pos, playerNumber) &&
      this.getSeeds(newPieces, pos) === 1 // was empty before this seed landed
    ) {
      const opp = this.oppositePit(pos);
      const oppSeeds = this.getSeeds(newPieces, opp);
      if (oppSeeds > 0) {
        const store = this.storeFor(playerNumber);
        const storeSeeds = this.getSeeds(newPieces, store);
        newPieces = this.setSeeds(newPieces, store, storeSeeds + 1 + oppSeeds);
        newPieces = this.setSeeds(newPieces, pos, 0);
        newPieces = this.setSeeds(newPieces, opp, 0);
        captureOccurred = true;
      }
    }

    return { pieces: newPieces, lastPos: pos, extraTurn, captureOccurred };
  }

  /** Check if the game is over and collect remaining seeds if so */
  private collectRemainingIfDone(pieces: PiecePosition[]): PiecePosition[] {
    let newPieces = pieces.map((p) => ({ ...p }));
    const p0Empty = [0, 1, 2, 3, 4, 5].every((i) => this.getSeeds(newPieces, i) === 0);
    const p1Empty = [7, 8, 9, 10, 11, 12].every((i) => this.getSeeds(newPieces, i) === 0);

    if (p0Empty) {
      let total = 0;
      for (const i of [7, 8, 9, 10, 11, 12]) {
        total += this.getSeeds(newPieces, i);
        newPieces = this.setSeeds(newPieces, i, 0);
      }
      newPieces = this.setSeeds(newPieces, this.P1_STORE, this.getSeeds(newPieces, this.P1_STORE) + total);
    } else if (p1Empty) {
      let total = 0;
      for (const i of [0, 1, 2, 3, 4, 5]) {
        total += this.getSeeds(newPieces, i);
        newPieces = this.setSeeds(newPieces, i, 0);
      }
      newPieces = this.setSeeds(newPieces, this.P0_STORE, this.getSeeds(newPieces, this.P0_STORE) + total);
    }

    return newPieces;
  }

  validateMove(board: BoardState, move: Move, player: Player): boolean {
    if (board.diceRoll === null) return false;
    if (player.playerNumber !== board.currentTurn) return false;
    const pit = move.from;
    if (!this.isOwnPit(pit, player.playerNumber)) return false;
    return this.getSeeds(board.pieces, pit) > 0;
  }

  applyMove(board: BoardState, move: Move): BoardState {
    const { pieces, lastPos, extraTurn, captureOccurred: _captureOccurred } = this.simulateSow(
      board.pieces,
      move.from,
      board.currentTurn,
    );

    const finalPieces = this.collectRemainingIfDone(pieces);
    const nextTurn = extraTurn ? board.currentTurn : (board.currentTurn + 1) % 2;

    return {
      ...board,
      pieces: finalPieces,
      currentTurn: nextTurn,
      diceRoll: null,
      lastMove: { ...move, to: lastPos },
    };
  }

  checkWinCondition(board: BoardState): number | null {
    const p0Empty = [0, 1, 2, 3, 4, 5].every((i) => this.getSeeds(board.pieces, i) === 0);
    const p1Empty = [7, 8, 9, 10, 11, 12].every((i) => this.getSeeds(board.pieces, i) === 0);
    if (!p0Empty && !p1Empty) return null;

    const p0Store = this.getSeeds(board.pieces, this.P0_STORE);
    const p1Store = this.getSeeds(board.pieces, this.P1_STORE);
    if (p0Store > p1Store) return 0;
    if (p1Store > p0Store) return 1;
    // Tie — return the player with fewest seeds (or just player 0 as tiebreaker)
    return 0;
  }

  getValidMoves(board: BoardState, playerNumber: number, _diceRoll: number): Move[] {
    const pits = playerNumber === 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12];
    return pits
      .filter((i) => this.getSeeds(board.pieces, i) > 0)
      .map((i) => ({ playerId: '', pieceIndex: i, from: i, to: 0 }));
  }

  canMove(board: BoardState, playerNumber: number, diceRoll: number): boolean {
    return this.getValidMoves(board, playerNumber, diceRoll).length > 0;
  }

  isCaptureMove(board: BoardState, move: Move): boolean {
    const { captureOccurred } = this.simulateSow(board.pieces, move.from, board.currentTurn);
    return captureOccurred;
  }
}
