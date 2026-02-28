const COLS = 6;
const ROWS = 6;
const TOTAL = COLS * ROWS;
const ALIEN_COUNT = 6;

function posToRC(pos) {
  return [Math.floor(pos / COLS), pos % COLS];
}

function rcToPos(row, col) {
  return row * COLS + col;
}

function getDefenderPN(pieces) {
  return pieces.filter((p) => p.playerNumber === 0).length === 1 ? 0 : 1;
}

class StellarSiegeSimulator {
  initializeBoard() {
    const defenderPN = Math.floor(Math.random() * 2);
    const invaderPN = 1 - defenderPN;

    const pieces = [
      { playerNumber: defenderPN, pieceIndex: 0, position: rcToPos(5, 3) },
      ...Array.from({ length: ALIEN_COUNT }, (_, i) => ({
        playerNumber: invaderPN,
        pieceIndex: i,
        position: rcToPos(0, i),
      })),
    ];

    return {
      pieces,
      currentTurn: defenderPN,
      diceRoll: null,
      lastMove: null,
    };
  }

  rollDice() {
    return Math.floor(Math.random() * 4) + 1;
  }

  validateMove(board, move) {
    const { pieceIndex, from, to } = move;
    const playerNumber = board.currentTurn;
    const defenderPN = getDefenderPN(board.pieces);
    const invaderPN = 1 - defenderPN;

    if (playerNumber !== board.currentTurn) return false;
    if (board.diceRoll === null) return false;
    if (to < 0 || to >= TOTAL) return false;

    const piece = board.pieces.find(
      (p) => p.playerNumber === playerNumber && p.pieceIndex === pieceIndex,
    );
    if (!piece || piece.position !== from) return false;

    if (playerNumber === defenderPN) {
      const [fromRow, fromCol] = posToRC(from);
      const [toRow, toCol] = posToRC(to);
      if (fromRow !== 5 || toRow !== 5) return false;
      if (Math.abs(toCol - fromCol) > board.diceRoll) return false;
      return true;
    } else {
      const [fromRow, fromCol] = posToRC(from);
      const [toRow, toCol] = posToRC(to);
      if (toRow !== fromRow + 1) return false;
      if (toCol < 0 || toCol >= COLS) return false;
      if (Math.abs(toCol - fromCol) > board.diceRoll - 1) return false;
      if (board.pieces.some((p) => p.playerNumber === invaderPN && p.position === to)) return false;
      return true;
    }
  }

  applyMove(board, move) {
    const newPieces = board.pieces.map((p) => ({ ...p }));
    const defenderPN = getDefenderPN(board.pieces);
    const invaderPN = 1 - defenderPN;

    if (board.currentTurn === defenderPN) {
      const cannon = newPieces.find((p) => p.playerNumber === defenderPN && p.pieceIndex === 0);
      if (!cannon) return board;
      cannon.position = move.to;

      const [, destCol] = posToRC(move.to);
      let maxRow = -1;
      let targetIdx = -1;
      for (let i = 0; i < newPieces.length; i++) {
        const p = newPieces[i];
        if (p.playerNumber === invaderPN && p.position !== 99) {
          const [r, c] = posToRC(p.position);
          if (c === destCol && r > maxRow) {
            maxRow = r;
            targetIdx = i;
          }
        }
      }
      if (targetIdx !== -1) {
        newPieces[targetIdx] = { ...newPieces[targetIdx], position: 99 };
      }

      return {
        ...board,
        pieces: newPieces,
        currentTurn: invaderPN,
        diceRoll: null,
        lastMove: move,
      };
    } else {
      const alienIdx = newPieces.findIndex(
        (p) => p.playerNumber === invaderPN && p.pieceIndex === move.pieceIndex,
      );
      if (alienIdx === -1) return board;
      newPieces[alienIdx] = { ...newPieces[alienIdx], position: move.to };

      return {
        ...board,
        pieces: newPieces,
        currentTurn: defenderPN,
        diceRoll: null,
        lastMove: move,
      };
    }
  }

  checkWinCondition(board) {
    const defenderPN = getDefenderPN(board.pieces);
    const invaderPN = 1 - defenderPN;

    const invaded = board.pieces.some(
      (p) => p.playerNumber === invaderPN && p.position !== 99 && posToRC(p.position)[0] >= 5,
    );
    if (invaded) return invaderPN;

    const allDestroyed = board.pieces
      .filter((p) => p.playerNumber === invaderPN)
      .every((p) => p.position === 99);
    if (allDestroyed) return defenderPN;

    return null;
  }

  getValidMoves(board, playerNumber, diceRoll) {
    const moves = [];
    const defenderPN = getDefenderPN(board.pieces);
    const invaderPN = 1 - defenderPN;

    if (playerNumber === defenderPN) {
      const cannon = board.pieces.find((p) => p.playerNumber === defenderPN && p.pieceIndex === 0);
      if (!cannon) return [];
      const [, fromCol] = posToRC(cannon.position);
      for (let newCol = 0; newCol < COLS; newCol++) {
        if (Math.abs(newCol - fromCol) <= diceRoll) {
          moves.push({
            playerId: '',
            pieceIndex: 0,
            from: cannon.position,
            to: rcToPos(5, newCol),
            diceRoll,
          });
        }
      }
    } else {
      const aliveAliens = board.pieces.filter(
        (p) => p.playerNumber === invaderPN && p.position !== 99,
      );
      for (const alien of aliveAliens) {
        const [fromRow, fromCol] = posToRC(alien.position);
        const newRow = fromRow + 1;
        if (newRow >= ROWS) continue;
        for (let dc = -(diceRoll - 1); dc <= diceRoll - 1; dc++) {
          const newCol = fromCol + dc;
          if (newCol < 0 || newCol >= COLS) continue;
          const to = rcToPos(newRow, newCol);
          if (board.pieces.some((p) => p.playerNumber === invaderPN && p.position === to)) continue;
          moves.push({
            playerId: '',
            pieceIndex: alien.pieceIndex,
            from: alien.position,
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

  simulateGame(maxTurns = 500) {
    let board = this.initializeBoard();
    const defenderPN = getDefenderPN(board.pieces);
    const invaderPN = 1 - defenderPN;

    for (let turn = 0; turn < maxTurns; turn++) {
      const winner = this.checkWinCondition(board);
      if (winner !== null) {
        return winner;
      }

      const dice = this.rollDice();
      const playerNumber = board.currentTurn;
      board.diceRoll = dice;

      if (!this.canMove(board, playerNumber, dice)) {
        board.currentTurn = playerNumber === defenderPN ? invaderPN : defenderPN;
        board.diceRoll = null;
        continue;
      }

      const move = this.getRandomMove(board, playerNumber, dice);
      if (move) {
        board = this.applyMove(board, move);
      }
    }

    return null;
  }
}

const SIMULATIONS = 100000;
const gamesPerBatch = 10000;

const simulator = new StellarSiegeSimulator();
let defenderWins = 0;
let invaderWins = 0;
let totalMoves = 0;
let totalGames = 0;

console.log(`🚀 Running ${SIMULATIONS.toLocaleString()} Stellar Siege simulations...\n`);

const startTime = Date.now();

for (let i = 0; i < SIMULATIONS; i++) {
  const board = simulator.initializeBoard();
  const defenderPN = getDefenderPN(board.pieces);
  const winner = simulator.simulateGame();

  if (winner === defenderPN) {
    defenderWins++;
  } else if (winner !== null) {
    invaderWins++;
  }

  totalGames++;

  if ((i + 1) % gamesPerBatch === 0) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✓ ${(i + 1).toLocaleString()} games completed (${elapsed}s)`);
  }
}

const elapsed = (Date.now() - startTime) / 1000;

console.log(`\n${'='.repeat(50)}`);
console.log(`📊 STELLAR SIEGE BALANCE ANALYSIS`);
console.log(`${'='.repeat(50)}\n`);

const defenderWinRate = ((defenderWins / totalGames) * 100).toFixed(2);
const invaderWinRate = ((invaderWins / totalGames) * 100).toFixed(2);

console.log(`Total Games: ${totalGames.toLocaleString()}`);
console.log(`Time: ${elapsed.toFixed(1)}s (${(SIMULATIONS / elapsed).toFixed(0)} games/sec)\n`);

console.log(`Defender Wins: ${defenderWins.toLocaleString()} (${defenderWinRate}%)`);
console.log(`Invader Wins:  ${invaderWins.toLocaleString()} (${invaderWinRate}%)\n`);

// Balance assessment
const defenderRate = Number(defenderWinRate);
if (Math.abs(defenderRate - 50) < 5) {
  console.log(`✅ BALANCED: Both sides have ~50% win rate`);
} else if (defenderRate > 55) {
  console.log(`⚠️  DEFENDER FAVORED: ${(defenderRate - 50).toFixed(1)}% above 50%`);
} else if (defenderRate < 45) {
  console.log(`⚠️  INVADER FAVORED: ${(50 - defenderRate).toFixed(1)}% below 50%`);
}

console.log(`\n${'='.repeat(50)}`);
