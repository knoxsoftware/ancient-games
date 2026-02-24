import { PiecePosition } from '@ancient-games/shared';

export function getScoreInfo(pieces: PiecePosition[], seatIndex: number): string | null {
  const unplaced = pieces.filter((p) => p.playerNumber === seatIndex && p.position === -1).length;
  const captured = pieces.filter((p) => p.playerNumber === seatIndex && p.position === 99).length;
  const onBoard = 9 - unplaced - captured;
  return unplaced > 0
    ? `${onBoard} on board · ${unplaced} to place`
    : `${onBoard} on board · ${captured} lost`;
}
