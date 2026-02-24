import { Section } from '../../GameRules';

export default function WolvesAndRavensRules() {
  return (
    <>
      <div className="text-center pb-1">
        <div className="text-2xl mb-1">🐺&nbsp;&nbsp;🐦‍⬛</div>
        <p className="font-bold" style={{ color: '#F0D090' }}>
          Wolves &amp; Ravens
        </p>
        <p className="text-xs mt-1" style={{ color: '#7A6A50' }}>
          Asymmetric hunt — 2 players, 7×7 board
        </p>
      </div>

      <Section title="Setup">
        <p>
          The <strong style={{ color: '#D4A017' }}>Wolf</strong> (amber piece) starts at the center
          of the board. Eight <strong style={{ color: '#9090C0' }}>Ravens</strong> (dark pieces)
          start at the four corners and four mid-edges. The wolf player goes first.
        </p>
      </Section>

      <Section title="Wolf's Turn">
        <ol className="list-decimal list-inside space-y-1">
          <li>Roll the die (1–6).</li>
          <li>
            Move the wolf up to that many squares in any straight line — orthogonal or diagonal.
          </li>
          <li>
            The wolf <strong>cannot jump</strong> over pieces; ravens block the path.
          </li>
          <li>
            Landing on a raven <strong>captures</strong> it — the raven is removed from the board.
          </li>
        </ol>
      </Section>

      <Section title="Ravens' Turn">
        <ol className="list-decimal list-inside space-y-1">
          <li>Roll the die (1–6). This becomes the number of individual raven moves.</li>
          <li>
            Each move: pick any raven and slide it exactly one square in any direction (including
            diagonal).
          </li>
          <li>Ravens may not land on the wolf or on each other.</li>
          <li>
            You may use fewer moves than rolled — click <em>Done Moving</em> to end your turn early.
          </li>
        </ol>
      </Section>

      <Section title="Winning">
        <ul className="space-y-2">
          <li>
            <strong style={{ color: '#D4A017' }}>Wolf wins</strong> by capturing 5 ravens.
          </li>
          <li>
            <strong style={{ color: '#9090C0' }}>Ravens win</strong> by surrounding the wolf —
            occupying all orthogonal neighbors (up, down, left, right) of the wolf simultaneously.
            <span className="block text-xs mt-1" style={{ color: '#6A5A40' }}>
              Tip: if the wolf is at the edge it has fewer neighbors, making it easier to surround —
              but harder to escape.
            </span>
          </li>
        </ul>
      </Section>

      <Section title="Strategy Tips">
        <ul className="list-disc list-inside space-y-1 text-xs" style={{ color: '#8A7A58' }}>
          <li>
            <strong style={{ color: '#C0A060' }}>Wolf:</strong> Use high rolls to sweep diagonally
            across the board and pick off isolated ravens. Avoid cornering yourself.
          </li>
          <li>
            <strong style={{ color: '#8080B0' }}>Ravens:</strong> Coordinate your flock to funnel
            the wolf toward an edge. Use each move of a high roll to tighten the net.
          </li>
          <li>
            The wolf's threat glow turns red when three or more orthogonal neighbors are blocked —
            danger is near.
          </li>
        </ul>
      </Section>
    </>
  );
}
