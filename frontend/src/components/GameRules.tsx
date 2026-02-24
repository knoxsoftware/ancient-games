import { lazy, Suspense } from 'react';
import { GameType } from '@ancient-games/shared';
import { useTheme } from '../contexts/ThemeContext';

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  const isYahoo = theme === 'yahoo';
  return (
    <div>
      <h3
        className="font-bold mb-2 text-sm tracking-wide"
        style={{ color: isYahoo ? '#400090' : '#E8C870' }}
      >
        {title}
      </h3>
      <div style={{ color: isYahoo ? '#000000' : '#A09070' }}>{children}</div>
    </div>
  );
}

const rulesComponents: Record<GameType, React.LazyExoticComponent<React.ComponentType>> = {
  ur: lazy(() => import('./games/ur/UrRules')),
  senet: lazy(() => import('./games/senet/SenetRules')),
  morris: lazy(() => import('./games/morris/MorrisRules')),
  'wolves-and-ravens': lazy(() => import('./games/wolves-and-ravens/WolvesAndRavensRules')),
  'rock-paper-scissors': lazy(() => import('./games/rock-paper-scissors/RockPaperScissorsRules')),
  'stellar-siege': lazy(() => import('./games/stellar-siege/StellarSiegeRules')),
};

export default function GameRules({ gameType }: { gameType: GameType }) {
  const { theme } = useTheme();
  const isYahoo = theme === 'yahoo';
  const RulesComponent = rulesComponents[gameType];
  return (
    <div
      className="rounded-xl p-5 text-sm leading-relaxed space-y-5"
      style={{
        background: isYahoo ? '#ffffff' : 'rgba(8,5,0,0.7)',
        border: isYahoo ? '1px solid #cccccc' : '1px solid rgba(42,30,14,0.8)',
        color: isYahoo ? '#000000' : '#C0A870',
        borderRadius: isYahoo ? '0' : undefined,
      }}
    >
      <Suspense fallback={null}>
        <RulesComponent />
      </Suspense>
    </div>
  );
}
