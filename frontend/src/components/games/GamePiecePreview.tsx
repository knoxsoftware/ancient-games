import { useId } from 'react';
import { GameType } from '@ancient-games/shared';
import { UrPiece } from './ur/UrBoard';
import { ConePiece, SpoolPiece } from './senet/SenetBoard';

interface GamePiecePreviewProps {
  gameType: GameType;
  playerNumber: 0 | 1;
  size?: number;
}

function MorrisPiecePreview({ playerNumber, size }: { playerNumber: 0 | 1; size: number }) {
  const color = playerNumber === 0 ? '#3B82F6' : '#EF4444';
  return (
    <svg viewBox="0 0 16 16" width={size} height={size}>
      <circle
        cx="8"
        cy="8"
        r="6"
        fill={color}
        style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.7))' }}
      />
    </svg>
  );
}

function WolvesAndRavensPiecePreview({
  playerNumber,
  size,
}: {
  playerNumber: 0 | 1;
  size: number;
}) {
  const uid = useId();
  if (playerNumber === 0) {
    // Wolf: gold gradient
    const gradId = `wolf-prev-${uid}`;
    return (
      <svg viewBox="0 0 40 40" width={size} height={size}>
        <defs>
          <radialGradient id={gradId} cx="40%" cy="35%" r="60%">
            <stop offset="0%" stopColor="#F0B820" />
            <stop offset="100%" stopColor="#9A6008" />
          </radialGradient>
        </defs>
        <circle
          cx="20"
          cy="20"
          r="17"
          fill={`url(#${gradId})`}
          stroke="#E8B020"
          strokeWidth="2"
          style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}
        />
        <text x="20" y="26" textAnchor="middle" fontSize="16" fontWeight="bold" fill="#3A2000">
          W
        </text>
      </svg>
    );
  }
  // Raven: dark gradient
  const gradId = `raven-prev-${uid}`;
  return (
    <svg viewBox="0 0 30 30" width={size} height={size}>
      <defs>
        <radialGradient id={gradId} cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#2A2A48" />
          <stop offset="100%" stopColor="#0A0A18" />
        </radialGradient>
      </defs>
      <circle
        cx="15"
        cy="15"
        r="12"
        fill={`url(#${gradId})`}
        stroke="rgba(160,160,200,0.45)"
        strokeWidth="1.5"
        style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}
      />
      <circle cx="15" cy="15" r="3.5" fill="rgba(200,200,240,0.5)" />
    </svg>
  );
}

function StellarSiegePiecePreview({ playerNumber, size }: { playerNumber: 0 | 1; size: number }) {
  const uid = useId();
  if (playerNumber === 0) {
    // Cannon: cyan
    const gradId = `cannon-prev-${uid}`;
    return (
      <svg viewBox="0 0 40 40" width={size} height={size}>
        <defs>
          <radialGradient id={gradId} cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#80EEFF" />
            <stop offset="100%" stopColor="#0070A0" />
          </radialGradient>
        </defs>
        {/* Base */}
        <rect
          x="12"
          y="28"
          width="16"
          height="8"
          rx="2"
          fill="#005578"
          stroke="rgba(0,200,255,0.5)"
          strokeWidth="1"
        />
        {/* Barrel */}
        <rect
          x="16"
          y="16"
          width="8"
          height="14"
          rx="2"
          fill="#00A0C8"
          stroke="rgba(0,220,255,0.6)"
          strokeWidth="1"
        />
        {/* Tip */}
        <polygon
          points="20,6 28,16 12,16"
          fill={`url(#${gradId})`}
          stroke="#40E8FF"
          strokeWidth="1.5"
          style={{ filter: 'drop-shadow(0 0 4px rgba(0,200,255,0.6))' }}
        />
      </svg>
    );
  }
  // Alien: green
  const gradId = `alien-prev-${uid}`;
  return (
    <svg viewBox="0 0 30 36" width={size} height={size}>
      <defs>
        <radialGradient id={gradId} cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#0A2A0A" />
          <stop offset="100%" stopColor="#010801" />
        </radialGradient>
      </defs>
      {/* Antennae */}
      <line x1="9" y1="10" x2="5" y2="2" stroke="rgba(57,255,20,0.55)" strokeWidth="1.5" />
      <circle cx="5" cy="2" r="2" fill="#39FF14" />
      <line x1="21" y1="10" x2="25" y2="2" stroke="rgba(57,255,20,0.55)" strokeWidth="1.5" />
      <circle cx="25" cy="2" r="2" fill="#39FF14" />
      {/* Body */}
      <circle
        cx="15"
        cy="18"
        r="13"
        fill={`url(#${gradId})`}
        stroke="rgba(57,255,20,0.65)"
        strokeWidth="1.8"
        style={{ filter: 'drop-shadow(0 0 4px rgba(57,255,20,0.4))' }}
      />
      {/* Eyes */}
      <circle cx="10" cy="17" r="3" fill="#39FF14" />
      <circle cx="20" cy="17" r="3" fill="#39FF14" />
    </svg>
  );
}

export function GamePiecePreview({ gameType, playerNumber, size = 20 }: GamePiecePreviewProps) {
  switch (gameType) {
    case 'ur':
      return <UrPiece playerNumber={playerNumber} size={size} />;
    case 'senet':
      return playerNumber === 0 ? <ConePiece size={size} /> : <SpoolPiece size={size} />;
    case 'morris':
      return <MorrisPiecePreview playerNumber={playerNumber} size={size} />;
    case 'wolves-and-ravens':
      return <WolvesAndRavensPiecePreview playerNumber={playerNumber} size={size} />;
    case 'stellar-siege':
      return <StellarSiegePiecePreview playerNumber={playerNumber} size={size} />;
    case 'rock-paper-scissors':
      return null;
    default:
      return null;
  }
}
