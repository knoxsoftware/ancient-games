import { GameEngine } from './GameEngine';
import { UrGame } from './ur/UrGame';
import { SenetGame } from './senet/SenetGame';
import { MorrisGame } from './morris/MorrisGame';
import { WolvesAndRavensGame } from './wolves-and-ravens/WolvesAndRavensGame';
import { GameType } from '@ancient-games/shared';

export class GameRegistry {
  private static games: Map<GameType, GameEngine> = new Map<GameType, GameEngine>([
    ['ur', new UrGame() as GameEngine],
    ['senet', new SenetGame() as GameEngine],
    ['morris', new MorrisGame() as GameEngine],
    ['wolves-and-ravens', new WolvesAndRavensGame() as GameEngine],
  ]);

  static getGame(gameType: GameType): GameEngine {
    const game = this.games.get(gameType);
    if (!game) {
      throw new Error(`Game type "${gameType}" not found`);
    }
    return game;
  }

  static getAllGameTypes(): GameType[] {
    return Array.from(this.games.keys());
  }
}
