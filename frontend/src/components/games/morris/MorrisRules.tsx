import { Section } from '../../GameRules';

export default function MorrisRules() {
  return (
    <>
      <div className="text-center pb-1">
        <div className="text-2xl mb-1">⬡</div>
        <p className="font-bold" style={{ color: '#F0D090' }}>Nine Men's Morris</p>
        <p className="text-xs mt-1" style={{ color: '#7A6A50' }}>Strategy game — Medieval Europe</p>
      </div>
      <Section title="Goal">
        <p>Reduce your opponent to fewer than 3 pieces or leave them with no legal moves.</p>
      </Section>
      <Section title="Phase 1 — Placement">
        <p>Players take turns placing one piece on any empty intersection (9 pieces each). Forming a mill (3 in a row) immediately lets you remove one opponent piece not in a mill.</p>
      </Section>
      <Section title="Phase 2 — Movement">
        <p>Move one piece to an adjacent empty intersection. Forming a mill again lets you remove an opponent piece.</p>
      </Section>
      <Section title="Phase 3 — Flying">
        <p>When a player is reduced to exactly 3 pieces, they may move to any empty intersection ("fly").</p>
      </Section>
      <Section title="Mills">
        <p>Three pieces in a row along any of the 12 lines on the board. Breaking and reforming the same mill is allowed.</p>
      </Section>
    </>
  );
}
