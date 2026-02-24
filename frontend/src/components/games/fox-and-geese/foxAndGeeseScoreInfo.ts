import { PiecePosition } from '@ancient-games/shared';

export function getScoreInfo(pieces: PiecePosition[], seatIndex: number): string | null {
  if (seatIndex === 0) {
    const active = pieces.filter((p) => p.playerNumber === 0 && p.position !== 99).length;
    const captured = pieces.filter((p) => p.playerNumber === 0 && p.position === 99).length;
    return `${active} geese · ${captured} captured`;
  } else {
    const active = pieces.filter((p) => p.playerNumber === 0 && p.position !== 99).length;
    return `${active} geese remain`;
  }
}
