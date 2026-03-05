import { Session, GameState, GameType } from '@ancient-games/shared';
import { HistoryEntry } from './MoveLog';
import UrControls from './games/ur/UrControls';
import SenetControls from './games/senet/SenetControls';
import WolvesAndRavensControls from './games/wolves-and-ravens/WolvesAndRavensControls';
import StellarSiegeControls from './games/stellar-siege/StellarSiegeControls';
import BombermageControls from './games/bombermage/BombermageControls';

export interface GameControlsProps {
  session: Session;
  gameState: GameState;
  playerId: string;
  isMyTurn: boolean;
  lastMove?: HistoryEntry;
}

export const controlsComponents: Partial<Record<GameType, React.ComponentType<GameControlsProps>>> = {
  ur: UrControls,
  'ur-roguelike': UrControls,
  senet: SenetControls,
  'wolves-and-ravens': WolvesAndRavensControls,
  'stellar-siege': StellarSiegeControls,
  bombermage: BombermageControls,
};

export default function GameControls(props: GameControlsProps) {
  const ControlsComponent = controlsComponents[props.session.gameType];
  if (!ControlsComponent) return null;
  return <ControlsComponent {...props} />;
}
