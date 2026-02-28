import { Section } from '../../GameRules';

export default function GoRules() {
  return (
    <>
      <div className="text-center pb-1">
        <div className="text-2xl mb-1">⚫</div>
        <p className="font-bold" style={{ color: '#F0D090' }}>
          Go (Weiqi)
        </p>
        <p className="text-xs mt-1" style={{ color: '#7A6A50' }}>
          9×9 board · Chinese rules · Komi 6.5
        </p>
      </div>
      <Section title="Objective">
        Surround more territory than your opponent. The player with the most territory + stones on
        the board at the end of the game wins. White receives 6.5 points (komi) to compensate for
        Black moving first.
      </Section>
      <Section title="Placement">
        Players alternate placing one stone per turn on any empty intersection. Black always goes
        first. Stones never move after placement.
      </Section>
      <Section title="Captures">
        A stone or group of stones is captured when all adjacent intersections (liberties) are
        occupied by the opponent. Captured stones are removed from the board.
      </Section>
      <Section title="Ko Rule">
        You may not play in a position that would recreate the immediately previous board state
        (prevents infinite loops). The forbidden intersection is highlighted with an orange square.
      </Section>
      <Section title="Passing & End">
        A player may pass their turn at any time. When both players pass consecutively, the game
        ends and the board is scored. Dead groups are counted as captures. The player with the
        higher score wins.
      </Section>
    </>
  );
}
