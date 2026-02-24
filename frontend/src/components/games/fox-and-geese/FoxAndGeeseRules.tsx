import { Section } from '../../GameRules';

export default function FoxAndGeeseRules() {
  return (
    <>
      <div className="text-center pb-1">
        <div className="text-2xl mb-1">🦊</div>
        <p className="font-bold" style={{ color: '#F0D090' }}>
          Fox &amp; Geese
        </p>
        <p className="text-xs mt-1" style={{ color: '#7A6A50' }}>
          An ancient hunt game of pursuit and entrapment
        </p>
      </div>
      <Section title="Objective">
        <p><strong>Geese</strong> win by surrounding the Fox so it cannot move.</p>
        <p className="mt-1"><strong>Fox</strong> wins by capturing enough Geese that they cannot surround it (fewer than 4 remain).</p>
      </Section>
      <Section title="Setup">
        <p>13 Geese start in the top 2 rows. The Fox starts at the center of the board. Geese move first.</p>
      </Section>
      <Section title="Movement">
        <p><strong>Geese</strong> move one square at a time to an adjacent empty square, but only forward (toward the Fox's starting side) or sideways — never backward.</p>
        <p className="mt-1"><strong>Fox</strong> moves one square to any adjacent empty square in any direction.</p>
      </Section>
      <Section title="Captures">
        <p>The Fox can capture a Goose by jumping over it to the empty square directly beyond — like checkers. Captured Geese are removed from the board.</p>
        <p className="mt-1">Geese cannot capture the Fox.</p>
      </Section>
    </>
  );
}
