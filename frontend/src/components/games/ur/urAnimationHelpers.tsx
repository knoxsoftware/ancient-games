import React from 'react';
import { UrPiece } from './UrBoard';

export const renderPiece = (playerNumber: number, size: number): React.ReactNode => (
  <UrPiece playerNumber={playerNumber} size={size} />
);

export const getExitSelector = (playerNumber: number): string =>
  `[data-cell="ur-p${playerNumber}-13"]`;
