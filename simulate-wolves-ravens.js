const BOARD_SIZE = 7;
const TOTAL_CELLS = BOARD_SIZE * BOARD_SIZE;
const WOLF_WIN_CAPTURES = 5;
const RAVEN_STARTS = [0, 3, 6, 21, 27, 42, 45, 48];
const WOLF_START = 24;

const DIRECTIONS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1], // orthogonal
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1], // diagonal
];

function posToRC(pos) {
  return [Math.floor(pos / BOARD_SIZE), pos % BOARD_SIZE];
}

function rcToPos(row, col) {
  return row * BOARD_SIZE + col;
}

class WolvesAndRavensSimulator {
  getWolfPN(pieces) {
    return pieces.filter((p) => p.playerNumber === 0).length === 1 ? 0 : 1;
  }

  initializeBoard() {
    const wolfPN = Math.floor(Math.random() * 2);
    const ravenPN = 1 - wolfPN;

    const pieces = [
      { playerNumber: wolfPN, pieceIndex: 0, position: WOLF_START },
      ...RAVEN_STARTS.map((pos, i) => ({
        playerNumber: ravenPN,
        pieceIndex: i,
        position: pos,
      })),
    ];

    return {
      pieces,
      currentTurn: wolfPN,
      diceRoll: null,
      lastMove: null,
    };
  }

  rollDice() {
    return Math.floor(Math.random() * 6) + 1;
  }

  validateMove(board, move) {
    const { pieceIndex, from, to } = move;
    const playerNumber = board.currentTurn;
    const wolfPN = this.getWolfPN(board.pieces);
    const ravenPN = 1 - wolfPN;

    if (to < 0 || to >= TOTAL_CELLS) return false;

    const piece = board.pieces.find(
      (p) => p.playerNumber === playerNumber && p.pieceIndex === pieceIndex,
    );
    if (!piece || piece.position !== from) return false;

    const [fromRow, fromCol] = posToRC(from);
    const [toRow, toCol] = posToRC(to);

    if (playerNumber === wolfPN) {
      const dr = toRow - fromRow;
      const dc = toCol - fromCol;
      if (dr === 0 && dc === 0) return false;
      if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return false;

      const dist = Math.max(Math.abs(dr), Math.abs(dc));
      if (dist > (board.diceRoll || 0)) return false;

      const stepRow = dr === 0 ? 0 : dr / Math.abs(dr);
      const stepCol = dc === 0 ? 0 : dc / Math.abs(dc);

      for (let step = 1; step < dist; step++) {
        const intermediate = rcToPos(fromRow + step * stepRow, fromCol + step * stepCol);
        if (board.pieces.some((p) => p.position === intermediate)) return false;
      }

      if (board.pieces.some((p) => p.playerNumber === wolfPN && p.position === to)) return false;

      return true;
    } else {
      if ((board.diceRoll || 0) <= 0) return false;
      if (Math.max(Math.abs(toRow - fromRow), Math.abs(toCol - fromCol)) !== 1) return false;
      if (board.pieces.some((p) => p.position === to)) return false;
      return true;
    }
  }

  applyMove(board, move) {
    const newPieces = board.pieces.map((p) => ({ ...p }));
    const wolfPN = this.getWolfPN(board.pieces);
    const ravenPN = 1 - wolfPN;

    const movingPiece = newPieces.find(
      (p) => p.playerNumber === board.currentTurn && p.pieceIndex === move.pieceIndex,
    );
    if (!movingPiece) return board;

    if (board.currentTurn === wolfPN) {
      const capturedRaven = newPieces.find(
        (p) => p.playerNumber === ravenPN && p.position === move.to,
      );
      if (capturedRaven) capturedRaven.position = 99;
      movingPiece.position = move.to;
      return { pieces: newPieces, currentTurn: ravenPN, diceRoll: null, lastMove: move };
    } else {
      movingPiece.position = move.to;
      const remaining = (board.diceRoll || 1) - 1;

      if (remaining <= 0) {
        return { pieces: newPieces, currentTurn: wolfPN, diceRoll: null, lastMove: move };
      }
      return { pieces: newPieces, currentTurn: ravenPN, diceRoll: remaining, lastMove: move };
    }
  }

  checkWinCondition(board) {
    const wolfPN = this.getWolfPN(board.pieces);
    const ravenPN = 1 - wolfPN;

    const captured = board.pieces.filter(
      (p) => p.playerNumber === ravenPN && p.position === 99,
    ).length;
    if (captured >= WOLF_WIN_CAPTURES) return wolfPN;

    const wolf = board.pieces.find((p) => p.playerNumber === wolfPN);
    if (!wolf) return ravenPN;

    const [wr, wc] = posToRC(wolf.position);
    const neighbors = [];
    if (wr > 0) neighbors.push(rcToPos(wr - 1, wc));
    if (wr < BOARD_SIZE - 1) neighbors.push(rcToPos(wr + 1, wc));
    if (wc > 0) neighbors.push(rcToPos(wr, wc - 1));
    if (wc < BOARD_SIZE - 1) neighbors.push(rcToPos(wr, wc + 1));

    if (neighbors.length === 0) return null;

    const surrounded = neighbors.every((pos) =>
      board.pieces.some((p) => p.playerNumber === ravenPN && p.position === pos),
    );
    if (surrounded) return ravenPN;

    return null;
  }

  getValidMoves(board, playerNumber, diceRoll) {
    const moves = [];
    const wolfPN = this.getWolfPN(board.pieces);
    const ravenPN = 1 - wolfPN;

    if (playerNumber === wolfPN) {
      const wolf = board.pieces.find((p) => p.playerNumber === wolfPN);
      if (!wolf) return [];

      const [wr, wc] = posToRC(wolf.position);

      for (const [dr, dc] of DIRECTIONS) {
        for (let dist = 1; dist <= diceRoll; dist++) {
          const toRow = wr + dr * dist;
          const toCol = wc + dc * dist;
          if (toRow < 0 || toRow >= BOARD_SIZE || toCol < 0 || toCol >= BOARD_SIZE) break;

          const to = rcToPos(toRow, toCol);

          let blocked = false;
          for (let step = 1; step < dist; step++) {
            const inter = rcToPos(wr + dr * step, wc + dc * step);
            if (board.pieces.some((p) => p.position === inter)) {
              blocked = true;
              break;
            }
          }
          if (blocked) break;

          if (!board.pieces.some((p) => p.playerNumber === wolfPN && p.position === to)) {
            moves.push({
              playerId: '',
              pieceIndex: 0,
              from: wolf.position,
              to,
              diceRoll,
            });
          }
        }
      }
    } else {
      const aliveRavens = board.pieces.filter(
        (p) => p.playerNumber === ravenPN && p.position >= 0 && p.position < TOTAL_CELLS,
      );

      for (const raven of aliveRavens) {
        const [fr, fc] = posToRC(raven.position);
        for (const [dr, dc] of DIRECTIONS) {
          const toRow = fr + dr;
          const toCol = fc + dc;
          if (toRow < 0 || toRow >= BOARD_SIZE || toCol < 0 || toCol >= BOARD_SIZE) continue;
          const to = rcToPos(toRow, toCol);
          if (board.pieces.some((p) => p.position === to)) continue;
          moves.push({
            playerId: '',
            pieceIndex: raven.pieceIndex,
            from: raven.position,
            to,
            diceRoll,
          });
        }
      }
    }

    return moves;
  }

  canMove(board, playerNumber, diceRoll) {
    return this.getValidMoves(board, playerNumber, diceRoll).length > 0;
  }

  getRandomMove(board, playerNumber, diceRoll) {
    const moves = this.getValidMoves(board, playerNumber, diceRoll);
    if (moves.length === 0) return null;
    return moves[Math.floor(Math.random() * moves.length)];
  }

  getWolfAggressiveMove(board, wolfPN, diceRoll) {
    const moves = this.getValidMoves(board, wolfPN, diceRoll);
    if (moves.length === 0) return null;

    const ravenPN = 1 - wolfPN;
    for (const move of moves) {
      if (board.pieces.some((p) => p.playerNumber === ravenPN && p.position === move.to)) {
        return move;
      }
    }

    const wolf = board.pieces.find((p) => p.playerNumber === wolfPN);
    if (!wolf) return moves[0];

    const ravens = board.pieces.filter(
      (p) => p.playerNumber === ravenPN && p.position < TOTAL_CELLS,
    );
    if (ravens.length === 0) return moves[0];

    let bestMove = moves[0];
    let bestDist = Infinity;

    for (const move of moves) {
      let minRavenDist = Infinity;
      for (const raven of ravens) {
        const [mr, mc] = posToRC(move.to);
        const [rr, rc] = posToRC(raven.position);
        const dist = Math.abs(mr - rr) + Math.abs(mc - rc);
        minRavenDist = Math.min(minRavenDist, dist);
      }
      if (minRavenDist < bestDist) {
        bestDist = minRavenDist;
        bestMove = move;
      }
    }

    return bestMove;
  }

  getWolfDefensiveMove(board, wolfPN, diceRoll) {
    const moves = this.getValidMoves(board, wolfPN, diceRoll);
    if (moves.length === 0) return null;

    const ravenPN = 1 - wolfPN;
    for (const move of moves) {
      if (board.pieces.some((p) => p.playerNumber === ravenPN && p.position === move.to)) {
        return move;
      }
    }

    let bestMove = moves[0];
    let bestDist = Infinity;

    for (const move of moves) {
      const [r, c] = posToRC(move.to);
      const centerDist = Math.abs(r - 3) + Math.abs(c - 3);
      if (centerDist < bestDist) {
        bestDist = centerDist;
        bestMove = move;
      }
    }

    return bestMove;
  }

  getRavensAggressiveMove(board, ravenPN, diceRoll) {
    const moves = this.getValidMoves(board, ravenPN, diceRoll);
    if (moves.length === 0) return null;

    const wolfPN = 1 - ravenPN;
    const wolf = board.pieces.find((p) => p.playerNumber === wolfPN);
    if (!wolf) return moves[0];

    const [wr, wc] = posToRC(wolf.position);
    let bestMove = moves[0];
    let bestDist = Infinity;

    for (const move of moves) {
      const [mr, mc] = posToRC(move.to);
      const dist = Math.abs(mr - wr) + Math.abs(mc - wc);
      if (dist < bestDist) {
        bestDist = dist;
        bestMove = move;
      }
    }

    return bestMove;
  }

  getRavensDefensiveMove(board, ravenPN, diceRoll) {
    const moves = this.getValidMoves(board, ravenPN, diceRoll);
    if (moves.length === 0) return null;

    let bestMove = moves[0];
    let bestScore = -Infinity;

    for (const move of moves) {
      let minRavenDist = Infinity;
      const otherRavens = board.pieces.filter(
        (p) =>
          p.playerNumber === ravenPN &&
          p.pieceIndex !== move.pieceIndex &&
          p.position < TOTAL_CELLS,
      );

      for (const raven of otherRavens) {
        const [mr, mc] = posToRC(move.to);
        const [rr, rc] = posToRC(raven.position);
        const dist = Math.abs(mr - rr) + Math.abs(mc - rc);
        minRavenDist = Math.min(minRavenDist, dist);
      }

      if (minRavenDist > bestScore) {
        bestScore = minRavenDist;
        bestMove = move;
      }
    }

    return bestMove;
  }

  simulateGame(wolfStrategy, ravenStrategy, maxTurns = 500) {
    let board = this.initializeBoard();
    const wolfPN = this.getWolfPN(board.pieces);
    const ravenPN = 1 - wolfPN;

    for (let turn = 0; turn < maxTurns; turn++) {
      const winner = this.checkWinCondition(board);
      if (winner !== null) {
        return winner;
      }

      const dice = this.rollDice();
      const playerNumber = board.currentTurn;
      board.diceRoll = dice;

      if (!this.canMove(board, playerNumber, dice)) {
        board.currentTurn = playerNumber === wolfPN ? ravenPN : wolfPN;
        board.diceRoll = null;
        continue;
      }

      let move = null;

      if (playerNumber === wolfPN) {
        switch (wolfStrategy) {
          case 'aggressive':
            move = this.getWolfAggressiveMove(board, wolfPN, dice);
            break;
          case 'defensive':
            move = this.getWolfDefensiveMove(board, wolfPN, dice);
            break;
          case 'random':
            move = this.getRandomMove(board, playerNumber, dice);
            break;
        }
      } else {
        switch (ravenStrategy) {
          case 'aggressive':
            move = this.getRavensAggressiveMove(board, ravenPN, dice);
            break;
          case 'defensive':
            move = this.getRavensDefensiveMove(board, ravenPN, dice);
            break;
          case 'random':
            move = this.getRandomMove(board, playerNumber, dice);
            break;
        }
      }

      if (move) {
        board = this.applyMove(board, move);
      }
    }

    return null;
  }
}

const strategies = ['aggressive', 'defensive', 'random'];
const results = {};

const simulator = new WolvesAndRavensSimulator();
const gamesPerMatchup = 10000;

console.log('🎮 Simulating Wolves & Ravens Balance Test\n');
console.log(`Games per strategy matchup: ${gamesPerMatchup}`);
console.log(`Total games: ${strategies.length * strategies.length * gamesPerMatchup}\n`);

for (const wolfStrat of strategies) {
  for (const ravenStrat of strategies) {
    const key = `Wolf(${wolfStrat}) vs Ravens(${ravenStrat})`;
    let wolfWins = 0;
    let ravenWins = 0;
    let draws = 0;

    for (let i = 0; i < gamesPerMatchup; i++) {
      const board = simulator.initializeBoard();
      const initialWolfPN = simulator.getWolfPN(board.pieces);
      const winner = simulator.simulateGame(wolfStrat, ravenStrat);

      if (winner === null) {
        draws++;
      } else if (winner === initialWolfPN) {
        wolfWins++;
      } else {
        ravenWins++;
      }
    }

    results[key] = { wolfWins, ravenWins, draws };
    const wolfRate = ((wolfWins / gamesPerMatchup) * 100).toFixed(1);
    const ravenRate = ((ravenWins / gamesPerMatchup) * 100).toFixed(1);
    console.log(`${key}: Wolf ${wolfRate}% | Ravens ${ravenRate}% | Draws ${draws}`);
  }
}

console.log('\n📊 Overall Analysis\n');

const allWolfWins = Object.values(results).reduce((sum, r) => sum + r.wolfWins, 0);
const allRavenWins = Object.values(results).reduce((sum, r) => sum + r.ravenWins, 0);
const allDraws = Object.values(results).reduce((sum, r) => sum + r.draws, 0);
const totalGames = allWolfWins + allRavenWins + allDraws;

console.log(`Total Wolf Wins: ${allWolfWins} (${((allWolfWins / totalGames) * 100).toFixed(1)}%)`);
console.log(
  `Total Raven Wins: ${allRavenWins} (${((allRavenWins / totalGames) * 100).toFixed(1)}%)`,
);
console.log(`Draws: ${allDraws} (${((allDraws / totalGames) * 100).toFixed(1)}%)`);

const difference = allWolfWins - allRavenWins;
const imbalance = Math.abs(difference / totalGames) * 100;

console.log(`\n⚖️  Balance Assessment:`);
if (imbalance < 5) {
  console.log(`✅ Balanced (${imbalance.toFixed(1)}% difference)`);
} else if (imbalance < 10) {
  console.log(`⚠️  Slight imbalance (${imbalance.toFixed(1)}% difference)`);
} else {
  console.log(`❌ Significant imbalance (${imbalance.toFixed(1)}% difference)`);
  if (allWolfWins > allRavenWins) {
    console.log(`   → Wolf is overpowered`);
  } else {
    console.log(`   → Ravens are overpowered`);
  }
}
