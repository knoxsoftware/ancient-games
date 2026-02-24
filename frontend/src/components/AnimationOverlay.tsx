import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Move, GameType } from '@ancient-games/shared';

const DURATION = 420; // ms

export interface AnimationState {
  move: Move;
  playerNumber: number;
  gameType: GameType;
  id: number;
  renderPiece: (playerNumber: number, size: number) => React.ReactNode;
  getExitSelector: (playerNumber: number) => string;
}

// Returns a virtual DOMRect just off the edge of the last board cell in the
// direction the piece is travelling, used as the exit destination.
function getExitRect(anim: AnimationState): DOMRect | null {
  const selector = anim.getExitSelector(anim.playerNumber);
  const el = document.querySelector(selector);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  // Ur end lane runs right->left (pos 12 col 7, pos 13 col 6), so exit goes left.
  // Senet row 2 runs left->right, so exit goes right.
  const offsetX = anim.gameType === 'ur' ? -rect.width * 1.5 : rect.width * 1.5;
  return new DOMRect(rect.left + offsetX, rect.top, rect.width, rect.height);
}

function getCellRect(anim: AnimationState, position: number): DOMRect | null {
  const { gameType, playerNumber } = anim;
  let selector: string;
  if (gameType === 'ur') {
    if (position === -1) selector = `[data-cell="ur-offboard-${playerNumber}"]`;
    else if (position === 99) return getExitRect(anim);
    else if (position >= 4 && position <= 11) selector = `[data-cell="ur-shared-${position}"]`;
    else selector = `[data-cell="ur-p${playerNumber}-${position}"]`;
  } else {
    if (position === 99) return getExitRect(anim);
    if (position < 0 || position >= 30) return null;
    selector = `[data-cell="senet-pos-${position}"]`;
  }
  const el = document.querySelector(selector);
  return el ? el.getBoundingClientRect() : null;
}

// Returns the ordered list of board positions the piece travels through,
// not including `from`, including `to` (and the virtual exit pos 99 if exiting).
function getPathPositions(gameType: GameType, from: number, to: number): number[] {
  // Entering from off-board: animate directly to destination in one step
  if (from === -1) return [to];
  const maxBoard = gameType === 'ur' ? 13 : 29;
  const boardEnd = to === 99 ? maxBoard : to;
  const steps: number[] = [];
  for (let p = from + 1; p <= boardEnd; p++) steps.push(p);
  // Append virtual exit position so the piece slides off the board edge
  if (to === 99) steps.push(99);
  return steps;
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
    const { move, gameType } = animation;
    const PIECE_SIZE = gameType === 'ur' ? 28 : 24;

    const base: React.CSSProperties = {
      position: 'fixed',
      width: PIECE_SIZE,
      height: gameType === 'senet' ? Math.round(PIECE_SIZE * 1.25) : PIECE_SIZE,
      pointerEvents: 'none',
      zIndex: 9999,
    };

    const centerOf = (r: DOMRect) => ({
      x: r.left + r.width / 2 - PIECE_SIZE / 2,
      y: r.top + r.height / 2 - PIECE_SIZE / 2,
    });

    const fromRect = getCellRect(animation, move.from);

    if (!fromRect) {
      // No source rect (shouldn't happen in practice): fade-in at destination
      const toRect = getCellRect(animation, move.to);
      if (!toRect) {
        onComplete();
        return;
      }
      const { x, y } = centerOf(toRect);
      setStyle({
        ...base,
        left: x,
        top: y,
        opacity: 0,
        transition: `opacity ${DURATION}ms ease-out`,
      });
      requestAnimationFrame(() => setStyle((s) => ({ ...s, opacity: 1 })));
      const timer = setTimeout(onComplete, DURATION + 50);
      return () => clearTimeout(timer);
    }

    // Build the list of intermediate positions and collect their centers
    const pathPositions = getPathPositions(gameType, move.from, move.to);
    const validSteps: Array<{ x: number; y: number }> = [];
    for (const pos of pathPositions) {
      const rect = getCellRect(animation, pos);
      if (rect) validSteps.push(centerOf(rect));
    }

    if (validSteps.length === 0) {
      // No reachable destination rects: fade-out at source
      const src = centerOf(fromRect);
      setStyle({
        ...base,
        left: src.x,
        top: src.y,
        opacity: 1,
        transition: `opacity ${DURATION}ms ease-out`,
      });
      requestAnimationFrame(() => setStyle((s) => ({ ...s, opacity: 0 })));
      const timer = setTimeout(onComplete, DURATION + 50);
      return () => clearTimeout(timer);
    }

    // Per-step duration: shorter steps for longer paths, minimum 80 ms
    const stepDuration = Math.max(80, DURATION / validSteps.length);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;
    let stepIdx = 0;

    // Place piece at the source with no transition
    const start = centerOf(fromRect);
    setStyle({ ...base, left: start.x, top: start.y, opacity: 1, transition: 'none' });

    const runStep = () => {
      if (cancelled) return;

      if (stepIdx >= validSteps.length) {
        // All board steps complete
        if (move.to === 99) {
          // Fade out at the virtual exit position
          const last = validSteps[validSteps.length - 1];
          setStyle((s) => ({ ...s, left: last.x, top: last.y, transition: 'none' }));
          requestAnimationFrame(() => {
            if (!cancelled) {
              setStyle((s) => ({
                ...s,
                opacity: 0,
                transition: `opacity ${stepDuration}ms ease-out`,
              }));
            }
          });
          timers.push(setTimeout(onComplete, stepDuration + 50));
        } else {
          onComplete();
        }
        return;
      }

      const { x: nextX, y: nextY } = validSteps[stepIdx];
      stepIdx++;

      setStyle((s) => ({
        ...s,
        left: nextX,
        top: nextY,
        transition: `left ${stepDuration}ms linear, top ${stepDuration}ms linear`,
      }));

      timers.push(setTimeout(runStep, stepDuration));
    };

    // Start after initial render so the browser paints the source position first
    requestAnimationFrame(() => {
      if (!cancelled) runStep();
    });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [animation.id]);

  const piece = animation.renderPiece(
    animation.playerNumber,
    animation.gameType === 'ur' ? 28 : 24,
  );

  return createPortal(
    <div style={style} aria-hidden="true">
      {piece}
    </div>,
    document.body,
  );
}
