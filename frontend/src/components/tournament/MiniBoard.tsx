import React, { lazy, Suspense, useRef, useState, useEffect } from 'react';
import type { Session, GameState, GameType } from '@ancient-games/shared';

const boardComponents: Record<GameType, React.LazyExoticComponent<React.ComponentType<any>>> = {
  ur: lazy(() => import('../games/ur/UrBoard')),
  senet: lazy(() => import('../games/senet/SenetBoard')),
  morris: lazy(() => import('../games/morris/MorrisBoard')),
  'wolves-and-ravens': lazy(() => import('../games/wolves-and-ravens/WolvesAndRavensBoard')),
  'rock-paper-scissors': lazy(() => import('../games/rock-paper-scissors/RockPaperScissorsBoard')),
  'stellar-siege': lazy(() => import('../games/stellar-siege/StellarSiegeBoard')),
  'fox-and-geese': lazy(() => import('../games/fox-and-geese/FoxAndGeeseBoard')),
  mancala: lazy(() => import('../games/mancala/MancalaBoard')),
  go: lazy(() => import('../games/go/GoBoard')),
  'ur-roguelike': lazy(() => import('../games/ur-roguelike/UrRoguelikeBoard')),
  bombermage: lazy(() => import('../games/bombermage/BombermageBoard')),
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
  const [outerHeight, setOuterHeight] = useState(100);

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
      const s = outerW / innerW;
      setScale(s);
      setOuterHeight(Math.round(innerH * s));
    });
    observer.observe(innerRef.current);
    observer.observe(outerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={outerRef}
      className="relative w-full overflow-hidden"
      style={{ height: outerHeight, cursor: onClick ? 'pointer' : undefined }}
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
            boardOnly={true}
          />
        </Suspense>
      </div>
    </div>
  );
}
