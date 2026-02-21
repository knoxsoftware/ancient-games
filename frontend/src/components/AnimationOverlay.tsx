import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Move } from '@ancient-games/shared';
import { UrPiece } from './games/ur/UrBoard';
import { ConePiece, SpoolPiece } from './games/senet/SenetBoard';

const DURATION = 420; // ms

export interface AnimationState {
  move: Move;
  playerNumber: number;
  gameType: 'ur' | 'senet';
  id: number;
}

function getCellRect(
  gameType: 'ur' | 'senet',
  position: number,
  playerNumber: number
): DOMRect | null {
  let selector: string;
  if (gameType === 'ur') {
    if (position === -1) selector = `[data-cell="ur-offboard-${playerNumber}"]`;
    else if (position === 99) return null; // fade-out at source
    else if (position >= 4 && position <= 11) selector = `[data-cell="ur-shared-${position}"]`;
    else selector = `[data-cell="ur-p${playerNumber}-${position}"]`;
  } else {
    if (position < 0 || position >= 30) return null;
    selector = `[data-cell="senet-pos-${position}"]`;
  }
  const el = document.querySelector(selector);
  return el ? el.getBoundingClientRect() : null;
}

export function AnimationOverlay({
  animation,
  onComplete,
}: {
  animation: AnimationState;
  onComplete: () => void;
}) {
  const [style, setStyle] = useState<React.CSSProperties>({ opacity: 0 });

  useEffect(() => {
    const { move, playerNumber, gameType } = animation;
    const PIECE_SIZE = gameType === 'ur' ? 28 : 24;
    const fromRect = getCellRect(gameType, move.from, playerNumber);
    const toRect = getCellRect(gameType, move.to, playerNumber);

    if (!fromRect && !toRect) { onComplete(); return; }

    const center = (r: DOMRect) => ({
      x: r.left + r.width / 2 - PIECE_SIZE / 2,
      y: r.top + r.height / 2 - PIECE_SIZE / 2,
    });

    const base: React.CSSProperties = {
      position: 'fixed',
      width: PIECE_SIZE,
      height: gameType === 'senet' ? Math.round(PIECE_SIZE * 1.25) : PIECE_SIZE,
      pointerEvents: 'none',
      zIndex: 9999,
      willChange: 'transform',
    };

    if (!fromRect) {
      // No source: fade in at destination
      const { x, y } = center(toRect!);
      setStyle({ ...base, left: x, top: y, opacity: 0, transition: `opacity ${DURATION}ms ease-out` });
      requestAnimationFrame(() => setStyle(s => ({ ...s, opacity: 1 })));
    } else if (!toRect) {
      // No destination (exiting board): fade out at source
      const { x, y } = center(fromRect);
      setStyle({ ...base, left: x, top: y, opacity: 1, transition: `opacity ${DURATION}ms ease-out` });
      requestAnimationFrame(() => setStyle(s => ({ ...s, opacity: 0 })));
    } else {
      // Slide from source to destination
      const from = center(fromRect);
      const to = center(toRect);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      setStyle({ ...base, left: from.x, top: from.y, opacity: 1, transform: 'translate(0,0)', transition: 'none' });
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setStyle(s => ({
          ...s,
          transform: `translate(${dx}px,${dy}px)`,
          transition: `transform ${DURATION}ms cubic-bezier(0.4,0,0.2,1)`,
        }));
      }));
    }

    const timer = setTimeout(onComplete, DURATION + 50);
    return () => clearTimeout(timer);
  }, [animation.id]);

  const { playerNumber, gameType } = animation;
  const piece =
    gameType === 'ur' ? (
      <UrPiece playerNumber={playerNumber} size={28} />
    ) : playerNumber === 0 ? (
      <ConePiece size={24} />
    ) : (
      <SpoolPiece size={24} />
    );

  return createPortal(
    <div style={style} aria-hidden="true">{piece}</div>,
    document.body
  );
}
