import { Section } from '../../GameRules';

export default function UrRules() {
  return (
    <>
      <div className="text-center pb-1">
        <div className="text-2xl mb-1">🏛️</div>
        <p className="font-bold" style={{ color: '#F0D090' }}>
          Royal Game of Ur
        </p>
        <p className="text-xs mt-1" style={{ color: '#7A6A50' }}>
          Race game — ~2500 BCE Mesopotamia
        </p>
      </div>
      <Section title="Goal">
        <p>Be the first to move all 7 of your pieces off the far end of the board.</p>
      </Section>
      <Section title="Movement">
        <p>
          Roll 4 tetrahedral dice (0–4). Move any one piece forward that many squares along your
          path. Pieces enter from off the board and exit after passing the last square.
        </p>
      </Section>
      <Section title="Special Squares">
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong>Rosettes (⭐)</strong> — Landing here grants an extra turn and makes your piece
            safe from capture.
          </li>
          <li>
            <strong>Shared section</strong> — Both paths merge in the middle. You can capture enemy
            pieces here (except on rosettes).
          </li>
        </ul>
      </Section>
      <Section title="Winning">
        <p>
          Move a piece off the board by rolling the exact number needed. First player to move all 7
          pieces off wins.
        </p>
      </Section>
    </>
  );
}
