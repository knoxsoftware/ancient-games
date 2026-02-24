import { Section } from '../../GameRules';

export default function RockPaperScissorsRules() {
  return (
    <>
      <div className="text-center pb-1">
        <div className="text-2xl mb-1">🪨&nbsp;📄&nbsp;✂️</div>
        <p className="font-bold" style={{ color: '#F0D090' }}>
          Rock Paper Scissors
        </p>
        <p className="text-xs mt-1" style={{ color: '#7A6A50' }}>
          Single battle — draw means replay until someone wins
        </p>
      </div>

      <Section title="Objective">
        <p>
          Win a single round. Both players secretly choose a weapon — choices are locked in before
          the reveal. Draws are replayed until there is a winner.
        </p>
      </Section>

      <Section title="How to Play">
        <ol className="list-decimal list-inside space-y-1">
          <li>
            On your turn, click <strong style={{ color: '#E8C870' }}>Rock</strong>,{' '}
            <strong style={{ color: '#E8C870' }}>Paper</strong>, or{' '}
            <strong style={{ color: '#E8C870' }}>Scissors</strong>.
          </li>
          <li>
            Your choice is sealed 🔒 — your opponent only sees that you've committed, not what you
            chose.
          </li>
          <li>
            Once both players have chosen, the round resolves and both choices are revealed
            simultaneously.
          </li>
          <li>The winner of the round scores a point. Draws score nothing.</li>
        </ol>
      </Section>

      <Section title="What Beats What">
        <ul className="space-y-1">
          <li>
            🪨 <strong>Rock</strong> crushes ✂️ Scissors
          </li>
          <li>
            ✂️ <strong>Scissors</strong> cuts 📄 Paper
          </li>
          <li>
            📄 <strong>Paper</strong> covers 🪨 Rock
          </li>
        </ul>
      </Section>
    </>
  );
}
