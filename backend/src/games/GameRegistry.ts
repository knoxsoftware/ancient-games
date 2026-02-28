import { GameEngine } from './GameEngine';
import { UrGame } from './ur/UrGame';
import { SenetGame } from './senet/SenetGame';
import { MorrisGame } from './morris/MorrisGame';
import { WolvesAndRavensGame } from './wolves-and-ravens/WolvesAndRavensGame';
import { RockPaperScissorsGame } from './rock-paper-scissors/RockPaperScissorsGame';
import { StellarSiegeGame } from './stellar-siege/StellarSiegeGame';
import { FoxAndGeeseGame } from './fox-and-geese/FoxAndGeeseGame';
import { MancalaGame } from './mancala/MancalaGame';
import { GoGame } from './go/GoGame';
import { UrRoguelikeGame } from './ur-roguelike/UrRoguelikeGame';
import { GameType } from '@ancient-games/shared';

export class GameRegistry {
  private static games: Map<GameType, GameEngine> = new Map<GameType, GameEngine>([
    ['ur', new UrGame() as GameEngine],
    ['senet', new SenetGame() as GameEngine],
    ['morris', new MorrisGame() as GameEngine],
    ['wolves-and-ravens', new WolvesAndRavensGame() as GameEngine],
    ['rock-paper-scissors', new RockPaperScissorsGame() as GameEngine],
    ['stellar-siege', new StellarSiegeGame() as GameEngine],
    ['fox-and-geese', new FoxAndGeeseGame() as GameEngine],
    ['mancala', new MancalaGame() as GameEngine],
    ['go', new GoGame() as GameEngine],
    ['ur-roguelike', new UrRoguelikeGame() as GameEngine],
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
