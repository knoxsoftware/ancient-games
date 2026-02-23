import { Session, GameState, GameType } from '@ancient-games/shared';
import { HistoryEntry } from './MoveLog';
import UrControls from './games/ur/UrControls';
import SenetControls from './games/senet/SenetControls';
import MorrisControls from './games/morris/MorrisControls';
import WolvesAndRavensControls from './games/wolves-and-ravens/WolvesAndRavensControls';
import StellarSiegeControls from './games/stellar-siege/StellarSiegeControls';

export interface GameControlsProps {
  session: Session;
  gameState: GameState;
  playerId: string;
  isMyTurn: boolean;
  lastMove?: HistoryEntry;
}

const controlsComponents: Partial<Record<GameType, React.ComponentType<GameControlsProps>>> = {
  ur: UrControls,
  senet: SenetControls,
  morris: MorrisControls,
  'wolves-and-ravens': WolvesAndRavensControls,
  'stellar-siege': StellarSiegeControls,
};

export default function GameControls(props: GameControlsProps) {
  const ControlsComponent = controlsComponents[props.session.gameType];
  if (!ControlsComponent) return null;
  return <ControlsComponent {...props} />;
}
