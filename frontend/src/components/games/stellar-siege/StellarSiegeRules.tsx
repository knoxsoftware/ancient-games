import { Section } from '../../GameRules';

export default function StellarSiegeRules() {
  return (
    <>
      <div className="text-center pb-1">
        <div className="text-2xl mb-1">🚀&nbsp;&nbsp;👾</div>
        <p className="font-bold" style={{ color: '#F0D090' }}>
          Stellar Siege
        </p>
        <p className="text-xs mt-1" style={{ color: '#7A6A50' }}>
          Asymmetric defense — 6×6 grid, 2 players
        </p>
      </div>

      <Section title="Setup">
        <p>
          Roles are assigned randomly. The <strong style={{ color: '#80DFFF' }}>Defender</strong>{' '}
          controls a single cannon starting at the center of the base row (bottom). The{' '}
          <strong style={{ color: '#7FFF5A' }}>Invader</strong> commands 6 aliens starting in the
          top row, one per column. The Defender moves first.
        </p>
      </Section>

      <Section title="Defender's Turn">
        <ol className="list-decimal list-inside space-y-1">
          <li>Roll the die (1–4). This is your movement range.</li>
          <li>Click any column within that many steps of your current position.</li>
          <li>
            Your cannon slides there and <strong>auto-fires upward</strong>, instantly destroying
            the alien closest to the base in that column (if any).
          </li>
          <li>You may stay in the same column to fire again at the next alien there.</li>
        </ol>
      </Section>

      <Section title="Invader's Turn">
        <ol className="list-decimal list-inside space-y-1">
          <li>Roll the die (1–4).</li>
          <li>Select any alive alien and advance it exactly 1 row down.</li>
          <li>You may also drift sideways by up to (roll − 1) columns in the same move.</li>
          <li>Aliens cannot share a cell.</li>
        </ol>
      </Section>

      <Section title="Winning">
        <ul className="space-y-2">
          <li>
            <strong style={{ color: '#80DFFF' }}>Defender wins</strong> by destroying all 6 aliens
            before any reach the base row.
          </li>
          <li>
            <strong style={{ color: '#7FFF5A' }}>Invader wins</strong> the moment any alien enters
            the base row (the bottom row with the dashed blue line).
          </li>
        </ul>
      </Section>

      <Section title="Strategy Tips">
        <ul className="list-disc list-inside space-y-1 text-xs" style={{ color: '#8A7A58' }}>
          <li>
            <strong style={{ color: '#70CCEE' }}>Defender:</strong> Prioritize the closest alien. A
            low roll may not reach far columns — plan your position in advance.
          </li>
          <li>
            <strong style={{ color: '#5AEE5A' }}>Invader:</strong> Spread aliens wide to stretch the
            cannon's range. Use high rolls to drift toward uncovered columns.
          </li>
          <li>
            The faint blue column band shows the cannon's current aim. Stay aware of it as the
            Invader.
          </li>
        </ul>
      </Section>
    </>
  );
}
