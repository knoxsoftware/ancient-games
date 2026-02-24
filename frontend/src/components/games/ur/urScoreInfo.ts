import { PiecePosition } from '@ancient-games/shared';

export function getScoreInfo(pieces: PiecePosition[], seatIndex: number): string | null {
  const escaped = pieces.filter((p) => p.playerNumber === seatIndex && p.position === 99).length;
  const waiting = pieces.filter((p) => p.playerNumber === seatIndex && p.position === -1).length;
  return `${escaped}/7 escaped · ${waiting} waiting`;
}
