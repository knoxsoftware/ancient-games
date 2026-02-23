import { PiecePosition } from '@ancient-games/shared';

export function getScoreInfo(pieces: PiecePosition[], seatIndex: number): string | null {
  const defenderPN = pieces.filter(p => p.playerNumber === 0).length === 1 ? 0 : 1;
  const invaderPN = 1 - defenderPN;
  if (seatIndex === defenderPN) {
    const shotDown = pieces.filter(p => p.playerNumber === invaderPN && p.position === 99).length;
    return `Defender · ${shotDown}/6 shot down`;
  } else {
    const alive = pieces.filter(p => p.playerNumber === invaderPN && p.position !== 99).length;
    return `Invaders · ${alive}/6 remaining`;
  }
}
