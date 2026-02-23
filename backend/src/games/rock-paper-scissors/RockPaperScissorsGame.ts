import { GameEngine } from '../GameEngine';
import { BoardState, Move, Player, PiecePosition } from '@ancient-games/shared';

/**
 * Rock Paper Scissors Implementation
 *
 * Turn-based with sealed choices: P0 chooses first (choice hidden from P1),
 * then P1 chooses. After P1 commits, both choices are revealed and the round resolves.
 *
 * Position encoding for choice pieces (pieceIndex=0):
 *   -1  = not yet chosen this round
 *   10  = sealed Rock    (chosen but not revealed to opponent)
 *   11  = sealed Paper
 *   12  = sealed Scissors
 *   1   = revealed Rock
 *   2   = revealed Paper
 *   3   = revealed Scissors
 *
 * Score pieces (pieceIndex=1):
 *   position = number of rounds won
 *
 * Win condition: first to 1 round won (single battle; draws replay).
 */
export class RockPaperScissorsGame extends GameEngine {
  gameType = 'rock-paper-scissors' as const;
  playerCount = 2;

  private readonly WINS_NEEDED = 1;

  // Rock=1 beats Scissors=3, Scissors=3 beats Paper=2, Paper=2 beats Rock=1
  private getRoundWinner(p0Choice: number, p1Choice: number): number | null {
    if (p0Choice === p1Choice) return null; // draw
    if (
      (p0Choice === 1 && p1Choice === 3) || // rock beats scissors
      (p0Choice === 3 && p1Choice === 2) || // scissors beats paper
      (p0Choice === 2 && p1Choice === 1)    // paper beats rock
    ) {
      return 0;
    }
    return 1;
  }

  initializeBoard(): BoardState {
    const pieces: PiecePosition[] = [
      // Choice pieces
      { playerNumber: 0, pieceIndex: 0, position: -1 },
      { playerNumber: 1, pieceIndex: 0, position: -1 },
      // Score pieces
      { playerNumber: 0, pieceIndex: 1, position: 0 },
      { playerNumber: 1, pieceIndex: 1, position: 0 },
    ];
    return {
      pieces,
      currentTurn: 0,
      diceRoll: null,
      lastMove: null,
    };
  }

  rollDice(): number {
    // No dice in RPS — always returns 1 as a required trigger
    return 1;
  }

  validateMove(board: BoardState, move: Move, player: Player): boolean {
    if (board.diceRoll === null) return false;
    if (player.playerNumber !== board.currentTurn) return false;
    if (move.to < 1 || move.to > 3) return false;
    return true;
  }

  applyMove(board: BoardState, move: Move): BoardState {
    const newPieces = board.pieces.map(p => ({ ...p }));

    const p0ChoiceIdx = newPieces.findIndex(p => p.playerNumber === 0 && p.pieceIndex === 0);
    const p1ChoiceIdx = newPieces.findIndex(p => p.playerNumber === 1 && p.pieceIndex === 0);
    const p0Pos = newPieces[p0ChoiceIdx].position;
    const p1Pos = newPieces[p1ChoiceIdx].position;

    if (board.currentTurn === 0) {
      // If both choices from last round are in revealed state (1–3), start a fresh round
      if (p0Pos >= 1 && p0Pos <= 3 && p1Pos >= 1 && p1Pos <= 3) {
        newPieces[p0ChoiceIdx] = { ...newPieces[p0ChoiceIdx], position: -1 };
        newPieces[p1ChoiceIdx] = { ...newPieces[p1ChoiceIdx], position: -1 };
      }
      // Store P0's sealed choice (10=rock, 11=paper, 12=scissors)
      newPieces[p0ChoiceIdx] = { ...newPieces[p0ChoiceIdx], position: 9 + move.to };

      return {
        ...board,
        pieces: newPieces,
        currentTurn: 1,
        diceRoll: null,
        lastMove: move,
      };
    } else {
      // P1's turn — store sealed choice, then resolve the round
      newPieces[p1ChoiceIdx] = { ...newPieces[p1ChoiceIdx], position: 9 + move.to };

      // Decode sealed choices to actual values (1/2/3)
      const p0Choice = newPieces[p0ChoiceIdx].position - 9; // 1, 2, or 3
      const p1Choice = move.to; // 1, 2, or 3

      // Reveal both choices
      newPieces[p0ChoiceIdx] = { ...newPieces[p0ChoiceIdx], position: p0Choice };
      newPieces[p1ChoiceIdx] = { ...newPieces[p1ChoiceIdx], position: p1Choice };

      // Update score
      const roundWinner = this.getRoundWinner(p0Choice, p1Choice);
      if (roundWinner !== null) {
        const scoreIdx = newPieces.findIndex(p => p.playerNumber === roundWinner && p.pieceIndex === 1);
        newPieces[scoreIdx] = { ...newPieces[scoreIdx], position: newPieces[scoreIdx].position + 1 };
      }

      return {
        ...board,
        pieces: newPieces,
        currentTurn: 0,
        diceRoll: null,
        lastMove: move,
      };
    }
  }

  checkWinCondition(board: BoardState): number | null {
    for (let playerNumber = 0; playerNumber < 2; playerNumber++) {
      const scorePiece = board.pieces.find(p => p.playerNumber === playerNumber && p.pieceIndex === 1);
      if (scorePiece && scorePiece.position >= this.WINS_NEEDED) return playerNumber;
    }
    return null;
  }

  getValidMoves(board: BoardState, playerNumber: number, diceRoll: number): Move[] {
    if (playerNumber !== board.currentTurn) return [];
    return [
      { playerId: '', pieceIndex: 0, from: -1, to: 1, diceRoll },
      { playerId: '', pieceIndex: 0, from: -1, to: 2, diceRoll },
      { playerId: '', pieceIndex: 0, from: -1, to: 3, diceRoll },
    ];
  }

  canMove(board: BoardState, playerNumber: number, diceRoll: number): boolean {
    return this.getValidMoves(board, playerNumber, diceRoll).length > 0;
  }

  isCaptureMove(_board: BoardState, _move: Move): boolean {
    return false;
  }
}
