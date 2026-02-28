import { Section } from '../../GameRules';
import { POWER_UP_DISPLAY, EVENT_DISPLAY } from './roguelikeConstants';

export default function UrRoguelikeRules() {
  return (
    <div className="space-y-4 text-sm">
      <Section title="Ur: Cursed Paths">
        <p>
          Standard Ur rules apply. Before the race, each player drafts one power-up. Three event
          squares on the shared track trigger random effects when landed on.
        </p>
      </Section>
      <Section title="Power-ups (draft one)">
        <ul className="space-y-1">
          {Object.entries(POWER_UP_DISPLAY).map(([id, info]) => (
            <li key={id}>
              <span style={{ color: '#E8C870' }}>
                {info.emoji} {info.name}:
              </span>{' '}
              {info.description}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Events (landing on ⚗️ squares)">
        <ul className="space-y-1">
          {Object.entries(EVENT_DISPLAY).map(([id, info]) => (
            <li key={id}>
              <span style={{ color: '#E8C870' }}>
                {info.emoji} {info.name}:
              </span>{' '}
              {info.description}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
