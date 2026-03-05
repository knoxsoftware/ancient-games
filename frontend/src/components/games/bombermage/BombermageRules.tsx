import { Section } from '../../GameRules';

export default function BombermageRules() {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <Section title="Objective">
        <p>Eliminate your opponent with bombs. Last player standing wins.</p>
      </Section>
      <Section title="Turn Structure">
        <ol className="list-decimal list-inside space-y-1">
          <li>Roll dice (1–6) to receive Action Points (AP)</li>
          <li>Spend AP: Move 1 square (1 AP) or Place a bomb (2 AP)</li>
          <li>Click End Turn when done, or turn auto-ends when AP reaches 0</li>
          <li>Bombs detonate after 3 total player turns</li>
        </ol>
      </Section>
      <Section title="The Map">
        <p>Dark pillars are indestructible. Crates can be destroyed by bomb blasts. Powerups are hidden inside crates — walk over them to collect.</p>
      </Section>
      <Section title="Bombs">
        <p>Bombs blast in a + pattern. The countdown badge shows turns until detonation. Blasts stop at indestructible pillars and destroy the first crate they hit.</p>
      </Section>
      <Section title="Powerups">
        <ul className="space-y-1">
          <li>🔥 <strong>Blast Radius</strong> — extends your bomb cross by 1</li>
          <li>💣 <strong>Extra Bomb</strong> — place an additional bomb simultaneously</li>
          <li>👟 <strong>Kick Bomb</strong> — spend 1 AP to slide a placed bomb (stops at walls)</li>
          <li>⚡ <strong>Manual Detonation</strong> — trigger one bomb early for free</li>
          <li>💨 <strong>Speed Boost</strong> — +1 AP on your next 3 turns</li>
          <li>🛡️ <strong>Shield</strong> — survive one blast</li>
        </ul>
      </Section>
    </div>
  );
}
