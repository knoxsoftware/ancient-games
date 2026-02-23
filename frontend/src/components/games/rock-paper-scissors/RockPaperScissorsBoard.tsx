import { memo, useEffect, useRef, useState } from 'react';
import { Session, GameState } from '@ancient-games/shared';
import { socketService } from '../../../services/socket';

interface RockPaperScissorsBoardProps {
  session: Session;
  gameState: GameState;
  playerId: string;
  isMyTurn: boolean;
}

// Position encoding:
//   -1  = not yet chosen
//   10  = sealed Rock (chosen, hidden from opponent)
//   11  = sealed Paper
//   12  = sealed Scissors
//   1   = revealed Rock
//   2   = revealed Paper
//   3   = revealed Scissors

const WEAPONS = [
  { value: 1, emoji: '🪨', label: 'Rock' },
  { value: 2, emoji: '📄', label: 'Paper' },
  { value: 3, emoji: '✂️', label: 'Scissors' },
] as const;

function weaponEmoji(position: number): string {
  const val = position > 9 ? position - 9 : position;
  return WEAPONS.find((w) => w.value === val)?.emoji ?? '?';
}

function weaponLabel(position: number): string {
  const val = position > 9 ? position - 9 : position;
  return WEAPONS.find((w) => w.value === val)?.label ?? '???';
}

function getRoundResult(p0Pos: number, p1Pos: number): string | null {
  if (p0Pos < 1 || p0Pos > 3 || p1Pos < 1 || p1Pos > 3) return null;
  if (p0Pos === p1Pos) return 'draw';
  if ((p0Pos === 1 && p1Pos === 3) || (p0Pos === 3 && p1Pos === 2) || (p0Pos === 2 && p1Pos === 1))
    return 'p0';
  return 'p1';
}

function RockPaperScissorsBoard({
  session,
  gameState,
  playerId,
  isMyTurn,
}: RockPaperScissorsBoardProps) {
  const { board } = gameState;
  const [pendingChoice, setPendingChoice] = useState<number | null>(null);
  const pendingChoiceRef = useRef<number | null>(null);
  pendingChoiceRef.current = pendingChoice;

  const currentPlayer = session.players.find((p) => p.id === playerId);
  const myPlayerNumber = currentPlayer?.playerNumber ?? -1;
  const opponentPlayerNumber = 1 - myPlayerNumber;

  const myChoicePiece = board.pieces.find(
    (p) => p.playerNumber === myPlayerNumber && p.pieceIndex === 0,
  );
  const opponentChoicePiece = board.pieces.find(
    (p) => p.playerNumber === opponentPlayerNumber && p.pieceIndex === 0,
  );

  const myPosition = myChoicePiece?.position ?? -1;
  const opponentPosition = opponentChoicePiece?.position ?? -1;

  // Reveal opponent's choice only when both have chosen (round resolved: both in 1–3)
  const roundResolved =
    myPosition >= 1 && myPosition <= 3 && opponentPosition >= 1 && opponentPosition <= 3;
  const opponentChosen = opponentPosition !== -1; // opponent has committed (may be sealed)

  // Auto-move when diceRoll comes back after clicking a weapon
  useEffect(() => {
    if (board.diceRoll !== null && pendingChoiceRef.current !== null) {
      const s = socketService.getSocket();
      if (!s) return;
      s.emit('game:move', {
        sessionCode: session.sessionCode,
        playerId,
        move: {
          playerId,
          pieceIndex: 0,
          from: myPosition,
          to: pendingChoiceRef.current,
          diceRoll: board.diceRoll,
        },
      });
      setPendingChoice(null);
    }
  }, [board.diceRoll]);

  function handleChoose(choice: number) {
    if (!isMyTurn || board.diceRoll !== null || gameState.finished || pendingChoice !== null)
      return;
    const s = socketService.getSocket();
    if (!s) return;
    setPendingChoice(choice);
    s.emit('game:roll-dice', { sessionCode: session.sessionCode, playerId });
  }

  // Determine last round result for display
  const roundResult = roundResolved
    ? getRoundResult(
        myPlayerNumber === 0 ? myPosition : opponentPosition,
        myPlayerNumber === 0 ? opponentPosition : myPosition,
      )
    : null;

  const myWonRound = roundResult === (myPlayerNumber === 0 ? 'p0' : 'p1');
  const opponentWonRound = roundResult === (myPlayerNumber === 0 ? 'p1' : 'p0');

  const opponent = session.players.find((p) => p.id !== playerId);
  const isSpectator = !currentPlayer;

  return (
    <div className="flex flex-col items-center gap-6 p-4 select-none">
      {/* Players */}
      <div className="flex items-center gap-8 w-full max-w-sm justify-center">
        <div className="text-center">
          <div className="text-sm font-semibold truncate max-w-[90px]" style={{ color: '#E8D8B0' }}>
            {currentPlayer?.displayName ?? 'You'}
          </div>
        </div>

        <div className="text-lg font-bold" style={{ color: '#4A3A28' }}>
          vs
        </div>

        <div className="text-center">
          <div className="text-sm font-semibold truncate max-w-[90px]" style={{ color: '#E8D8B0' }}>
            {opponent?.displayName ?? 'Opponent'}
          </div>
        </div>
      </div>

      <div className="text-xs" style={{ color: '#5A4A38' }}>
        draw = replay · first win takes the match
      </div>

      {/* Round reveal area */}
      <div
        className="flex items-center justify-center gap-6 w-full max-w-sm rounded-xl py-5 px-4"
        style={{ background: 'rgba(8,5,0,0.5)', border: '1px solid rgba(42,30,14,0.8)' }}
      >
        {/* My choice */}
        <div className="flex flex-col items-center gap-1 flex-1">
          <div className="text-xs font-semibold mb-1" style={{ color: '#6A5A40' }}>
            You
          </div>
          <div
            className="text-5xl transition-all duration-300"
            style={{ opacity: myPosition === -1 && !pendingChoice ? 0.25 : 1 }}
          >
            {pendingChoice !== null
              ? WEAPONS.find((w) => w.value === pendingChoice)?.emoji
              : myPosition === -1
                ? '❔'
                : roundResolved
                  ? weaponEmoji(myPosition)
                  : myPosition >= 10
                    ? '🔒'
                    : weaponEmoji(myPosition)}
          </div>
          {roundResolved && (
            <div
              className="text-xs font-semibold mt-1"
              style={{ color: myWonRound ? '#4ADE80' : opponentWonRound ? '#F87171' : '#A09070' }}
            >
              {myWonRound ? 'Won!' : opponentWonRound ? 'Lost' : 'Draw'}
            </div>
          )}
        </div>

        <div className="text-2xl" style={{ color: '#3A2A18' }}>
          ⚔️
        </div>

        {/* Opponent's choice */}
        <div className="flex flex-col items-center gap-1 flex-1">
          <div className="text-xs font-semibold mb-1" style={{ color: '#6A5A40' }}>
            {opponent?.displayName ?? 'Opponent'}
          </div>
          <div
            className="text-5xl transition-all duration-300"
            style={{ opacity: opponentPosition === -1 ? 0.25 : 1 }}
          >
            {/* Hide opponent's choice until round resolves */}
            {opponentPosition === -1
              ? '❔'
              : roundResolved
                ? weaponEmoji(opponentPosition)
                : opponentChosen
                  ? '🔒'
                  : '❔'}
          </div>
          {roundResolved && (
            <div
              className="text-xs font-semibold mt-1"
              style={{ color: opponentWonRound ? '#4ADE80' : myWonRound ? '#F87171' : '#A09070' }}
            >
              {opponentWonRound ? 'Won!' : myWonRound ? 'Lost' : 'Draw'}
            </div>
          )}
        </div>
      </div>

      {/* Round result label */}
      {roundResolved && !gameState.finished && (
        <div
          className="text-sm font-semibold animate-pulse"
          style={{ color: myWonRound ? '#4ADE80' : opponentWonRound ? '#F87171' : '#E8C870' }}
        >
          {myWonRound
            ? `${weaponLabel(myPosition)} beats ${weaponLabel(opponentPosition)}!`
            : opponentWonRound
              ? `${weaponLabel(opponentPosition)} beats ${weaponLabel(myPosition)}!`
              : "It's a draw!"}
        </div>
      )}

      {/* Weapon selection or status */}
      {!gameState.finished && !isSpectator && (
        <div className="w-full max-w-sm">
          {isMyTurn && !pendingChoice ? (
            <div className="space-y-3">
              <div className="text-center text-sm font-semibold" style={{ color: '#E8C870' }}>
                {roundResolved ? 'Draw — choose again:' : 'Choose your weapon:'}
              </div>
              <div className="flex gap-3 justify-center">
                {WEAPONS.map(({ value, emoji, label }) => (
                  <button
                    key={value}
                    onClick={() => handleChoose(value)}
                    className="flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all"
                    style={{
                      background: 'rgba(12,8,0,0.7)',
                      borderColor: 'rgba(42,30,14,0.8)',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        'rgba(196,160,48,0.6)';
                      (e.currentTarget as HTMLButtonElement).style.background =
                        'rgba(196,160,48,0.1)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        'rgba(42,30,14,0.8)';
                      (e.currentTarget as HTMLButtonElement).style.background = 'rgba(12,8,0,0.7)';
                    }}
                  >
                    <span className="text-3xl">{emoji}</span>
                    <span className="text-xs" style={{ color: '#8A7A60' }}>
                      {label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : isMyTurn && pendingChoice ? (
            <div className="text-center text-sm" style={{ color: '#8A7A60' }}>
              Locking in {WEAPONS.find((w) => w.value === pendingChoice)?.emoji}...
            </div>
          ) : (
            <div className="text-center text-sm" style={{ color: '#5A4A38' }}>
              {opponentChosen && !roundResolved
                ? `${opponent?.displayName ?? 'Opponent'} has chosen — waiting for reveal...`
                : `Waiting for ${opponent?.displayName ?? 'opponent'} to choose...`}
            </div>
          )}
        </div>
      )}

      {isSpectator && !gameState.finished && (
        <div className="text-center text-sm" style={{ color: '#5A4A38' }}>
          Spectating
        </div>
      )}
    </div>
  );
}

export default memo(RockPaperScissorsBoard);
