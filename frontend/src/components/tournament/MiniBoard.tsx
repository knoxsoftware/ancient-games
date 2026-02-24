import React, { lazy, Suspense, useRef, useState, useEffect } from 'react';
import type { Session, GameState, GameType } from '@ancient-games/shared';

const boardComponents: Record<GameType, React.LazyExoticComponent<React.ComponentType<any>>> = {
  ur: lazy(() => import('../games/ur/UrBoard')),
  senet: lazy(() => import('../games/senet/SenetBoard')),
  morris: lazy(() => import('../games/morris/MorrisBoard')),
  'wolves-and-ravens': lazy(() => import('../games/wolves-and-ravens/WolvesAndRavensBoard')),
  'rock-paper-scissors': lazy(() => import('../games/rock-paper-scissors/RockPaperScissorsBoard')),
  'stellar-siege': lazy(() => import('../games/stellar-siege/StellarSiegeBoard')),
};

interface MiniBoardProps {
  session: Session;
  gameState: GameState;
  onClick?: () => void;
}

export default function MiniBoard({ session, gameState, onClick }: MiniBoardProps) {
  const innerRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.25);

  const BoardComponent = boardComponents[session.gameType];

  useEffect(() => {
    if (!innerRef.current || !outerRef.current) return;
    const observer = new ResizeObserver(() => {
      const inner = innerRef.current;
      const outer = outerRef.current;
      if (!inner || !outer) return;
      const innerW = inner.scrollWidth;
      const innerH = inner.scrollHeight;
      if (innerW === 0 || innerH === 0) return;
      const outerW = outer.clientWidth;
      const outerH = outer.clientHeight;
      setScale(Math.min(outerW / innerW, outerH / innerH, 0.35));
    });
    observer.observe(innerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={outerRef}
      className="relative w-full overflow-hidden cursor-pointer"
      style={{ height: '120px' }}
      onClick={onClick}
    >
      <div
        ref={innerRef}
        className="absolute origin-top-left pointer-events-none"
        style={{ transform: `scale(${scale})` }}
      >
        <Suspense fallback={<div className="text-xs opacity-50">Loading…</div>}>
          <BoardComponent
            session={session}
            gameState={gameState}
            playerId=""
            isMyTurn={false}
            animatingPiece={null}
          />
        </Suspense>
      </div>
    </div>
  );
}
