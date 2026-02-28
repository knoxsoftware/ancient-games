import { PiecePosition } from '@ancient-games/shared';

// pieceIndex 6 = P0 store, pieceIndex 13 = P1 store
// pieceIndex 0-5 = P0 pits, 7-12 = P1 pits
export function getScoreInfo(pieces: PiecePosition[], seatIndex: number): string | null {
  const storeIndex = seatIndex === 0 ? 6 : 13;
  const pitIndices = seatIndex === 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12];

  const storePiece = pieces.find((p) => p.pieceIndex === storeIndex);
  const inStore = storePiece?.position ?? 0;

  const inPits = pitIndices.reduce((sum, i) => {
    const p = pieces.find((piece) => piece.pieceIndex === i);
    return sum + (p?.position ?? 0);
  }, 0);

  return `${inStore} in store · ${inPits} in pits`;
}
