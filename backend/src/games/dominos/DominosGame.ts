import { BoardState, Move, Player, GameType, DominoTile, PlayedDomino } from '@ancient-games/shared';
import { GameEngine } from '../GameEngine';

function generateTiles(): DominoTile[] {
  const tiles: DominoTile[] = [];
  let id = 0;
  for (let high = 0; high <= 6; high++) {
    for (let low = 0; low <= high; low++) {
      tiles.push({ id, high, low });
      id++;
    }
  }
  return tiles;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// leftEnd: the outward pip value at the left end of the chain
function leftEnd(chain: PlayedDomino[]): number {
  const d = chain[0];
  // flipped=true: display [low|high], so leftmost pip is low... wait
  // Actually we defined flipped as: the tile was placed so the matching end faces outward.
  // For a left-end tile: leftEnd = flipped ? tile.high : tile.low
  // This is because when flipped=true and placed on left end, the outward (left) value = tile.high
  return d.flipped ? d.tile.high : d.tile.low;
}

// rightEnd: the outward pip value at the right end of the chain
function rightEnd(chain: PlayedDomino[]): number {
  const d = chain[chain.length - 1];
  // For a right-end tile: rightEnd = flipped ? tile.low : tile.high
  // When flipped=true and placed on right end, the outward (right) value = tile.low
  return d.flipped ? d.tile.low : d.tile.high;
}

function pipSum(hand: DominoTile[]): number {
  return hand.reduce((s, t) => s + t.high + t.low, 0);
}

export class DominosGame extends GameEngine {
  gameType: GameType = 'dominos';
  playerCount = 2;

  initializeBoard(): BoardState {
    const allTiles = shuffle(generateTiles());
    const hand0 = allTiles.slice(0, 7);
    const hand1 = allTiles.slice(7, 14);
    const boneyard = allTiles.slice(14);

    // Starting player: holder of highest double; fallback player 0
    let startingPlayer = 0;
    let highestDouble = -1;
    for (let p = 0; p <= 1; p++) {
      const hand = p === 0 ? hand0 : hand1;
      for (const t of hand) {
        if (t.high === t.low && t.high > highestDouble) {
          highestDouble = t.high;
          startingPlayer = p;
        }
      }
    }

    return {
      pieces: [],
      currentTurn: startingPlayer,
      diceRoll: null,
      lastMove: null,
      dominoChain: [],
      dominoHandSizes: [7, 7],
      dominoBoneyardSize: 14,
      dominoHands: [hand0, hand1],
      dominoBoneyard: boneyard,
    };
  }

  rollDice(): number {
    return 1; // dominos has no dice
  }

  validateMove(board: BoardState, move: Move, player: Player): boolean {
    const hands = board.dominoHands;
    const boneyard = board.dominoBoneyard;
    const chain = board.dominoChain ?? [];

    if (!hands) return false;
    const hand = hands[player.playerNumber];

    // Draw move
    if (move.pieceIndex === -1 && move.from === -1 && move.to === -1) {
      if (!boneyard || boneyard.length === 0) return false;
      // Only valid if player has no playable tiles
      return this._playableMoves(hand, chain).length === 0;
    }

    // Play move: tile must be in hand
    const tile = hand.find(t => t.id === move.pieceIndex);
    if (!tile) return false;

    // Empty chain: any tile is valid (played to right by convention)
    if (chain.length === 0) return true;

    const lv = leftEnd(chain);
    const rv = rightEnd(chain);

    if (move.to === 0) {
      return tile.high === lv || tile.low === lv;
    } else {
      return tile.high === rv || tile.low === rv;
    }
  }

  applyMove(board: BoardState, move: Move): BoardState {
    const hands = (board.dominoHands ?? []).map(h => [...h]);
    const boneyard = [...(board.dominoBoneyard ?? [])];
    const chain = [...(board.dominoChain ?? [])];
    const currentTurn = board.currentTurn;

    // Draw move: pop tile from boneyard, give to current player; turn stays the same
    if (move.pieceIndex === -1 && move.from === -1 && move.to === -1) {
      const drawn = boneyard.pop()!;
      hands[currentTurn].push(drawn);
      return {
        ...board,
        dominoHands: hands,
        dominoBoneyard: boneyard,
        dominoHandSizes: [hands[0].length, hands[1].length],
        dominoBoneyardSize: boneyard.length,
        diceRoll: null,
        lastMove: move,
        // currentTurn unchanged — player must keep acting
      };
    }

    // Play move
    const hand = hands[currentTurn];
    const tileIdx = hand.findIndex(t => t.id === move.pieceIndex);
    const tile = hand.splice(tileIdx, 1)[0];

    if (chain.length === 0) {
      // First tile played; orient as-is (high on right, low on left)
      chain.push({ tile, side: 'initial', flipped: false, playerNumber: currentTurn });
    } else if (move.to === 0) {
      // Play to left end: the outward (leftmost) pip must match leftEnd(chain)
      const lv = leftEnd(chain);
      // leftEnd of new tile = flipped ? tile.high : tile.low
      // We want that to equal lv, so: flipped = (tile.high === lv)
      const flipped = tile.high === lv;
      chain.unshift({ tile, side: 'left', flipped, playerNumber: currentTurn });
    } else {
      // Play to right end: the outward (rightmost) pip must match rightEnd(chain)
      const rv = rightEnd(chain);
      // rightEnd of new tile = flipped ? tile.low : tile.high
      // We want that to equal rv, so: flipped = (tile.low === rv)
      const flipped = tile.low === rv;
      chain.push({ tile, side: 'right', flipped, playerNumber: currentTurn });
    }

    const nextTurn = (currentTurn + 1) % 2;

    return {
      ...board,
      dominoChain: chain,
      dominoHands: hands,
      dominoBoneyard: boneyard,
      dominoHandSizes: [hands[0].length, hands[1].length],
      dominoBoneyardSize: boneyard.length,
      currentTurn: nextTurn,
      diceRoll: null,
      lastMove: move,
    };
  }

  checkWinCondition(board: BoardState): number | null {
    const hands = board.dominoHands;
    if (!hands) return null;

    if (hands[0].length === 0) return 0;
    if (hands[1].length === 0) return 1;

    // Blocked game: boneyard empty and neither player has a valid play
    const chain = board.dominoChain ?? [];
    if ((board.dominoBoneyardSize ?? 0) === 0) {
      const p0Can = this._playableMoves(hands[0], chain).length > 0;
      const p1Can = this._playableMoves(hands[1], chain).length > 0;
      if (!p0Can && !p1Can) {
        const sum0 = pipSum(hands[0]);
        const sum1 = pipSum(hands[1]);
        return sum0 <= sum1 ? 0 : 1;
      }
    }

    return null;
  }

  getValidMoves(board: BoardState, playerNumber: number, _diceRoll: number): Move[] {
    const hands = board.dominoHands;
    if (!hands) return [];
    const hand = hands[playerNumber];
    const chain = board.dominoChain ?? [];
    const boneyard = board.dominoBoneyard ?? [];

    const playable = this._playableMoves(hand, chain);
    if (playable.length > 0) return playable;

    if (boneyard.length > 0) {
      return [{ playerId: '', pieceIndex: -1, from: -1, to: -1 }];
    }

    return [];
  }

  canMove(board: BoardState, playerNumber: number, _diceRoll: number): boolean {
    const hands = board.dominoHands;
    if (!hands) return false;
    const hand = hands[playerNumber];
    const chain = board.dominoChain ?? [];
    const boneyard = board.dominoBoneyard ?? [];

    return this._playableMoves(hand, chain).length > 0 || boneyard.length > 0;
  }

  private _playableMoves(hand: DominoTile[], chain: PlayedDomino[]): Move[] {
    if (chain.length === 0) {
      // Any tile is playable; use right-end convention for the first tile
      return hand.map(t => ({ playerId: '', pieceIndex: t.id, from: t.id, to: 1 }));
    }

    const lv = leftEnd(chain);
    const rv = rightEnd(chain);
    const moves: Move[] = [];

    for (const tile of hand) {
      const matchLeft = tile.high === lv || tile.low === lv;
      const matchRight = tile.high === rv || tile.low === rv;
      if (matchLeft) moves.push({ playerId: '', pieceIndex: tile.id, from: tile.id, to: 0 });
      if (matchRight) moves.push({ playerId: '', pieceIndex: tile.id, from: tile.id, to: 1 });
    }

    return moves;
  }
}
