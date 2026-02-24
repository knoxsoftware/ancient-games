import { GameType, PiecePosition } from '@ancient-games/shared';
import { getScoreInfo as urScore } from '../components/games/ur/urScoreInfo';
import { getScoreInfo as senetScore } from '../components/games/senet/senetScoreInfo';
import { getScoreInfo as morrisScore } from '../components/games/morris/morrisScoreInfo';
import { getScoreInfo as stellarScore } from '../components/games/stellar-siege/stellarSiegeScoreInfo';
import { getScoreInfo as wolvesScore } from '../components/games/wolves-and-ravens/wolvesAndRavensScoreInfo';

const registry: Partial<
  Record<GameType, (pieces: PiecePosition[], seatIndex: number) => string | null>
> = {
  ur: urScore,
  senet: senetScore,
  morris: morrisScore,
  'stellar-siege': stellarScore,
  'wolves-and-ravens': wolvesScore,
};

export function getScoreInfo(
  gameType: GameType,
  pieces: PiecePosition[],
  seatIndex: number,
): string | null {
  return registry[gameType]?.(pieces, seatIndex) ?? null;
}
