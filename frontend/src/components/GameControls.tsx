import { Session, GameState } from '@ancient-games/shared';
import { socketService } from '../services/socket';
import { TetraDice } from './games/ur/UrBoard';
import { ThrowingSticks } from './games/senet/SenetBoard';
import { HistoryEntry, describeMove } from './MoveLog';

interface GameControlsProps {
  session: Session;
  gameState: GameState;
  playerId: string;
  isMyTurn: boolean;
  lastMove?: HistoryEntry;
}

export default function GameControls({ session, gameState, playerId, isMyTurn, lastMove }: GameControlsProps) {
  const { gameType, sessionCode } = session;
  const diceRoll = gameState.board.diceRoll;
  const currentTurnName =
    session.players.find((p) => p.playerNumber === gameState.currentTurn)?.displayName ?? 'opponent';
  const myPN = session.players.find((p) => p.id === playerId)?.playerNumber ?? 0;

  const handleRollDice = () => {
    if (!isMyTurn || diceRoll !== null) return;
    socketService.getSocket()?.emit('game:roll-dice', { sessionCode, playerId });
  };

  const handleEndTurn = () => {
    socketService.getSocket()?.emit('game:skip-turn', { sessionCode, playerId });
  };

  if (gameType === 'morris') {
    return (
      <div className="p-3">
        <div
          className="rounded-lg p-3 text-sm text-center"
          style={{
            background: 'rgba(30,20,10,0.6)',
            border: '1px solid rgba(80,60,30,0.4)',
            color: isMyTurn ? '#F0E6C8' : '#8A7A60',
          }}
        >
          {isMyTurn ? 'Your turn — make your move on the board' : `Waiting for ${currentTurnName}…`}
        </div>
      </div>
    );
  }

  if (gameType === 'ur') {
    return (
      <div className="p-2 space-y-2">
        {lastMove && (
          <div className="flex items-center gap-1.5 px-1">
            <span
              className="flex-shrink-0 w-2 h-2 rounded-full"
              style={{ background: lastMove.playerNumber === 0 ? '#2F6BAD' : '#7A4A22' }}
            />
            <span className="text-xs font-mono truncate" style={{ color: '#907A60' }}>
              {describeMove(lastMove, session)}
            </span>
          </div>
        )}
        <div
          className="rounded-xl px-4 py-3 border"
          style={{ background: 'rgba(5,3,0,0.7)', borderColor: '#2A1E0E' }}
        >
          <div className="flex flex-col items-center justify-center min-h-[92px]">
            {diceRoll === null ? (
              isMyTurn ? (
                <button
                  onClick={handleRollDice}
                  disabled={gameState.finished}
                  className="w-full py-3 rounded-lg font-bold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: 'linear-gradient(135deg, #C4860A 0%, #7A5000 100%)',
                    color: '#F0EDE0',
                    border: '2px solid #C4860A',
                    fontSize: '1rem',
                    letterSpacing: '0.02em',
                  }}
                >
                  Roll the Dice
                </button>
              ) : (
                <div className="text-center text-sm" style={{ color: '#907A60' }}>
                  Waiting for <span style={{ color: '#F0EDE0' }}>{currentTurnName}</span> to roll…
                </div>
              )
            ) : (
              <div className="flex flex-col items-center gap-1">
                <TetraDice result={diceRoll} />
                <div className="text-2xl font-bold" style={{ color: '#F0EDE0' }}>
                  {diceRoll}
                </div>
                <div className="text-xs" style={{ color: '#907A60' }}>
                  {diceRoll === 0
                    ? 'No move — turn passes.'
                    : !isMyTurn
                    ? `Waiting for ${currentTurnName} to move…`
                    : 'Select a piece to move.'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (gameType === 'senet') {
    const extraTurn = [1, 4, 5].includes(diceRoll ?? -1);
    return (
      <div className="p-2 space-y-2">
        {lastMove && (
          <div className="flex items-center gap-1.5 px-1">
            <span
              className="flex-shrink-0 w-2 h-2 rounded-full"
              style={{ background: lastMove.playerNumber === 0 ? '#C4A870' : '#7A5030' }}
            />
            <span className="text-xs font-mono truncate" style={{ color: '#A09070' }}>
              {describeMove(lastMove, session)}
            </span>
          </div>
        )}
        <div
          className="rounded-xl px-4 py-3 border"
          style={{ background: 'rgba(8,4,0,0.65)', borderColor: '#3A2810' }}
        >
          <div className="flex flex-col items-center justify-center min-h-[120px]">
            {diceRoll === null ? (
              isMyTurn ? (
                <button
                  onClick={handleRollDice}
                  disabled={gameState.finished}
                  className="w-full py-3 rounded-lg font-bold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: 'linear-gradient(135deg, #C4860A 0%, #7A5000 100%)',
                    color: '#F5EDD5',
                    border: '2px solid #C4860A',
                    fontSize: '1rem',
                    letterSpacing: '0.02em',
                  }}
                >
                  Throw the Sticks
                </button>
              ) : (
                <div className="text-center text-sm" style={{ color: '#A09070' }}>
                  Waiting for <span style={{ color: '#F5EDD5' }}>{currentTurnName}</span> to throw…
                </div>
              )
            ) : (
              <div className="flex flex-col items-center gap-1">
                <ThrowingSticks result={diceRoll} />
                <div className="text-2xl font-bold mt-1" style={{ color: '#F5EDD5' }}>
                  {diceRoll}
                </div>
                <div className="text-xs" style={{ color: '#A09070' }}>
                  {extraTurn
                    ? 'Extra turn — select a piece.'
                    : !isMyTurn
                    ? `Waiting for ${currentTurnName} to move…`
                    : 'Select a piece to move.'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (gameType === 'wolves-and-ravens') {
    if (!isMyTurn || gameState.finished) {
      return (
        <div className="p-3">
          <div
            className="rounded-lg p-3 text-sm text-center"
            style={{ background: 'rgba(30,20,10,0.6)', border: '1px solid rgba(80,60,30,0.4)', color: '#8A7A60' }}
          >
            Waiting for {currentTurnName}…
          </div>
        </div>
      );
    }
    return (
      <div className="flex gap-3 items-center justify-center p-4">
        {diceRoll === null ? (
          <button onClick={handleRollDice} className="btn btn-primary px-8 py-2">
            Roll Dice
          </button>
        ) : myPN === 1 && diceRoll > 0 ? (
          <button
            onClick={handleEndTurn}
            className="btn btn-outline text-sm px-5 py-2"
            style={{ borderColor: 'rgba(100,200,100,0.4)', color: '#90D090' }}
          >
            Done&nbsp;Moving&nbsp;({diceRoll}&nbsp;left)
          </button>
        ) : null}
      </div>
    );
  }

  return null;
}
