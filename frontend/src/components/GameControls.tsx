import { memo, useState, useEffect } from 'react';
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

// ── Shared helpers ────────────────────────────────────────────────────────────

function WaitingMessage({ name, style }: { name: string; style?: React.CSSProperties }) {
  return (
    <div className="p-3">
      <div className="rounded-lg p-3 text-sm text-center" style={style}>
        Waiting for {name}…
      </div>
    </div>
  );
}

// ── Per-game variant components ───────────────────────────────────────────────

function MorrisControls({
  isMyTurn,
  currentTurnName,
}: {
  isMyTurn: boolean;
  currentTurnName: string;
}) {
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

function UrControls({
  session,
  gameState,
  playerId,
  isMyTurn,
  lastMove,
  currentTurnName,
}: GameControlsProps & { currentTurnName: string }) {
  const { sessionCode } = session;
  const diceRoll = gameState.board.diceRoll;

  const handleRollDice = () => {
    if (!isMyTurn || diceRoll !== null) return;
    socketService.getSocket()?.emit('game:roll-dice', { sessionCode, playerId });
  };

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

function SenetControls({
  session,
  gameState,
  playerId,
  isMyTurn,
  lastMove,
  currentTurnName,
}: GameControlsProps & { currentTurnName: string }) {
  const { sessionCode } = session;
  const diceRoll = gameState.board.diceRoll;
  const extraTurn = [1, 4, 5].includes(diceRoll ?? -1);

  const handleRollDice = () => {
    if (!isMyTurn || diceRoll !== null) return;
    socketService.getSocket()?.emit('game:roll-dice', { sessionCode, playerId });
  };

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

function StellarSiegeControls({
  session,
  gameState,
  playerId,
  isMyTurn,
  currentTurnName,
  myPN,
}: GameControlsProps & { currentTurnName: string; myPN: number }) {
  const { sessionCode } = session;
  const diceRoll = gameState.board.diceRoll;
  const defenderPN =
    gameState.board.pieces.filter((p) => p.playerNumber === 0).length === 1 ? 0 : 1;
  const isDefender = myPN === defenderPN;

  if (!isMyTurn || gameState.finished) {
    return (
      <WaitingMessage
        name={currentTurnName}
        style={{
          background: 'rgba(0,10,25,0.7)',
          border: '1px solid rgba(0,50,100,0.4)',
          color: '#2A5070',
        }}
      />
    );
  }

  return (
    <div className="flex gap-3 items-center justify-center p-4">
      {diceRoll === null && (
        <button
          onClick={() =>
            socketService.getSocket()?.emit('game:roll-dice', { sessionCode, playerId })
          }
          className="px-8 py-2 rounded-lg font-bold transition-all active:scale-95"
          style={{
            background: isDefender
              ? 'linear-gradient(135deg, #0080B0 0%, #004060 100%)'
              : 'linear-gradient(135deg, #207020 0%, #0A3010 100%)',
            color: isDefender ? '#80DFFF' : '#7FFF5A',
            border: `1.5px solid ${isDefender ? 'rgba(0,180,255,0.5)' : 'rgba(57,255,20,0.4)'}`,
          }}
        >
          {isDefender ? '🎯 Fire' : '👾 Advance'}
        </button>
      )}
    </div>
  );
}

function WolvesAndRavensControls({
  session,
  gameState,
  playerId,
  isMyTurn,
  currentTurnName,
  myPN,
}: GameControlsProps & { currentTurnName: string; myPN: number }) {
  const { sessionCode } = session;
  const diceRoll = gameState.board.diceRoll;
  const ravenPN = gameState.board.pieces.filter((p) => p.playerNumber === 0).length === 1 ? 1 : 0;

  // Prevent accidental immediate clicks on the "Done Moving" button right after rolling
  const [skipReady, setSkipReady] = useState(false);
  useEffect(() => {
    if (diceRoll !== null && myPN === ravenPN && diceRoll > 0) {
      setSkipReady(false);
      const timer = setTimeout(() => setSkipReady(true), 1000);
      return () => clearTimeout(timer);
    }
    setSkipReady(false);
  }, [diceRoll, myPN, ravenPN]);

  if (!isMyTurn || gameState.finished) {
    return (
      <WaitingMessage
        name={currentTurnName}
        style={{
          background: 'rgba(30,20,10,0.6)',
          border: '1px solid rgba(80,60,30,0.4)',
          color: '#8A7A60',
        }}
      />
    );
  }

  return (
    <div className="flex gap-3 items-center justify-center p-4">
      {diceRoll === null ? (
        <button
          onClick={() =>
            socketService.getSocket()?.emit('game:roll-dice', { sessionCode, playerId })
          }
          className="btn btn-primary px-8 py-2"
        >
          Roll Dice
        </button>
      ) : myPN === ravenPN && diceRoll > 0 ? (
        <button
          onClick={() =>
            socketService.getSocket()?.emit('game:skip-turn', { sessionCode, playerId })
          }
          disabled={!skipReady}
          className="btn btn-outline text-sm px-5 py-2 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          style={{ borderColor: 'rgba(100,200,100,0.4)', color: '#90D090' }}
        >
          Done&nbsp;Moving&nbsp;({diceRoll}&nbsp;left)
        </button>
      ) : null}
    </div>
  );
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

function GameControls({ session, gameState, playerId, isMyTurn, lastMove }: GameControlsProps) {
  const { gameType } = session;
  const currentTurnName =
    session.players.find((p) => p.playerNumber === gameState.currentTurn)?.displayName ??
    'opponent';
  const myPN = session.players.find((p) => p.id === playerId)?.playerNumber ?? 0;

  if (gameType === 'morris')
    return <MorrisControls isMyTurn={isMyTurn} currentTurnName={currentTurnName} />;
  if (gameType === 'ur')
    return (
      <UrControls
        session={session}
        gameState={gameState}
        playerId={playerId}
        isMyTurn={isMyTurn}
        lastMove={lastMove}
        currentTurnName={currentTurnName}
      />
    );
  if (gameType === 'senet')
    return (
      <SenetControls
        session={session}
        gameState={gameState}
        playerId={playerId}
        isMyTurn={isMyTurn}
        lastMove={lastMove}
        currentTurnName={currentTurnName}
      />
    );
  if (gameType === 'stellar-siege')
    return (
      <StellarSiegeControls
        session={session}
        gameState={gameState}
        playerId={playerId}
        isMyTurn={isMyTurn}
        currentTurnName={currentTurnName}
        myPN={myPN}
      />
    );
  if (gameType === 'wolves-and-ravens')
    return (
      <WolvesAndRavensControls
        session={session}
        gameState={gameState}
        playerId={playerId}
        isMyTurn={isMyTurn}
        currentTurnName={currentTurnName}
        myPN={myPN}
      />
    );

  return null;
}

export default memo(GameControls);
