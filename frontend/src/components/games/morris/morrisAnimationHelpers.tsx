import React from 'react';

const PLAYER_COLOR = ['#3B82F6', '#EF4444']; // blue / red — mirrors MorrisBoard

export const renderPiece = (playerNumber: number, size: number): React.ReactNode => (
  <svg
    viewBox="0 0 26 26"
    width={size}
    height={size}
    style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}
  >
    <circle
      cx={13}
      cy={13}
      r={11}
      fill={PLAYER_COLOR[playerNumber]}
      stroke="rgba(255,255,255,0.25)"
      strokeWidth={1.5}
    />
  </svg>
);

// Morris has no exit cell — returning a non-matching selector causes the
// AnimationOverlay to fade the piece out at the source (correct for captures).
export const getExitSelector = (_playerNumber: number): string =>
  '[data-morris-exit-nonexistent]';
