import { Section } from '../../GameRules';

export default function SenetRules() {
  return (
    <>
      <div className="text-center pb-1">
        <div className="text-2xl mb-1">🏺</div>
        <p className="font-bold" style={{ color: '#F0D090' }}>
          Senet
        </p>
        <p className="text-xs mt-1" style={{ color: '#7A6A50' }}>
          Race game — ~3500 BCE Egypt
        </p>
      </div>
      <Section title="Goal">
        <p>
          Be the first to move all 5 of your pieces off the far end of the 30-square S-shaped board.
        </p>
      </Section>
      <Section title="Movement">
        <p>
          Roll 4 stick dice (1–5, where all-face-up = 5). Move one piece forward. Rolling 1, 4, or 5
          grants an extra turn. You can swap places with an unprotected opponent piece.
        </p>
      </Section>
      <Section title="Special Squares">
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong>Square 26 (Water)</strong> — Sends your piece back to square 15.
          </li>
          <li>
            <strong>Squares 27–29</strong> — Require exact rolls to exit from each.
          </li>
          <li>
            <strong>Square 25 (Beauty)</strong> — Requires an exact roll to leave.
          </li>
        </ul>
      </Section>
      <Section title="Winning">
        <p>
          Move all your pieces safely off square 30. Pieces that land on the Water square are sent
          back.
        </p>
      </Section>
    </>
  );
}
