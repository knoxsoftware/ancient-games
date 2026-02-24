import { PiecePosition } from '@ancient-games/shared';

export function getScoreInfo(pieces: PiecePosition[], seatIndex: number): string | null {
  const escaped = pieces.filter((p) => p.playerNumber === seatIndex && p.position === 99).length;
  const onBoard = pieces.filter(
    (p) => p.playerNumber === seatIndex && p.position >= 0 && p.position < 99,
  ).length;
  return `${escaped}/5 escaped · ${onBoard} on board`;
}
