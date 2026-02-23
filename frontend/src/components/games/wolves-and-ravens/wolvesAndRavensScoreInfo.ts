import { PiecePosition } from '@ancient-games/shared';

export function getScoreInfo(pieces: PiecePosition[], seatIndex: number): string | null {
  const wolfPN = pieces.filter(p => p.playerNumber === 0).length === 1 ? 0 : 1;
  const ravenPN = 1 - wolfPN;
  if (seatIndex === wolfPN) {
    const caught = pieces.filter(p => p.playerNumber === ravenPN && p.position === 99).length;
    return `Wolf · ${caught} ravens caught`;
  } else {
    const alive = pieces.filter(p => p.playerNumber === ravenPN && p.position !== 99).length;
    return `Ravens · ${alive} alive`;
  }
}
