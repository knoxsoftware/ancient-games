import React from 'react';
import { ConePiece, SpoolPiece } from './SenetBoard';

export const renderPiece = (playerNumber: number, size: number): React.ReactNode =>
  playerNumber === 0 ? <ConePiece size={size} /> : <SpoolPiece size={size} />;

export const getExitSelector = (): string => '[data-cell="senet-pos-29"]';
