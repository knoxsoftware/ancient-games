import { Section } from '../../GameRules';

export default function MancalaRules() {
  return (
    <>
      <div className="text-center pb-1">
        <div className="text-2xl mb-1">🪷</div>
        <p className="font-bold" style={{ color: '#F0D090' }}>
          Mancala
        </p>
        <p className="text-xs mt-1" style={{ color: '#7A6A50' }}>
          Kalah variant · 2–6000+ years old
        </p>
      </div>

      <Section title="Objective">
        Capture more seeds than your opponent. The game ends when all pits on one side are empty.
        The player with the most seeds in their store wins.
      </Section>

      <Section title="Setup">
        Each of the 6 pits on your side starts with 4 seeds. Your store (Kalah) starts empty.
      </Section>

      <Section title="Your Turn">
        <ul className="space-y-1 list-disc list-inside">
          <li>Choose any of your non-empty pits.</li>
          <li>
            Pick up all seeds from that pit and distribute them one by one into each pit going
            counter-clockwise (rightward on your row, then into your store, then into opponent pits,
            then back).
          </li>
          <li>
            <span style={{ color: '#E8C870' }}>Skip your opponent's store</span> — never drop a
            seed there.
          </li>
        </ul>
      </Section>

      <Section title="Extra Turn">
        If the last seed you drop lands in <span style={{ color: '#E8C870' }}>your store</span>,
        you get another turn immediately.
      </Section>

      <Section title="Capture">
        If your last seed lands in an <span style={{ color: '#E8C870' }}>empty pit on your side</span>{' '}
        and the directly opposite pit has seeds, you capture{' '}
        <span style={{ color: '#E8C870' }}>both pits</span> into your store.
      </Section>

      <Section title="Game End">
        When all pits on one side are empty, the opponent collects all remaining seeds on their side
        into their store. Most seeds wins.
      </Section>
    </>
  );
}
