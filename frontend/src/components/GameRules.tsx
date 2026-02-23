import { GameType } from '@ancient-games/shared';

interface GameRulesProps {
  gameType: GameType;
}

export default function GameRules({ gameType }: GameRulesProps) {
  return (
    <div
      className="rounded-xl p-5 text-sm leading-relaxed space-y-5"
      style={{
        background: 'rgba(8,5,0,0.7)',
        border: '1px solid rgba(42,30,14,0.8)',
        color: '#C0A870',
      }}
    >
      {gameType === 'wolves-and-ravens' && <WolvesAndRavensRules />}
      {gameType === 'ur' && <UrRules />}
      {gameType === 'senet' && <SenetRules />}
      {gameType === 'morris' && <MorrisRules />}
      {gameType === 'rock-paper-scissors' && <RockPaperScissorsRules />}
      {gameType === 'stellar-siege' && <StellarSiegeRules />}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-bold mb-2 text-sm tracking-wide" style={{ color: '#E8C870' }}>
        {title}
      </h3>
      <div style={{ color: '#A09070' }}>{children}</div>
    </div>
  );
}

function WolvesAndRavensRules() {
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

function UrRules() {
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

function SenetRules() {
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

function MorrisRules() {
  return (
    <>
      <div className="text-center pb-1">
        <div className="text-2xl mb-1">⬡</div>
        <p className="font-bold" style={{ color: '#F0D090' }}>
          Nine Men's Morris
        </p>
        <p className="text-xs mt-1" style={{ color: '#7A6A50' }}>
          Strategy game — Medieval Europe
        </p>
      </div>
      <Section title="Goal">
        <p>Reduce your opponent to fewer than 3 pieces or leave them with no legal moves.</p>
      </Section>
      <Section title="Phase 1 — Placement">
        <p>
          Players take turns placing one piece on any empty intersection (9 pieces each). Forming a
          mill (3 in a row) immediately lets you remove one opponent piece not in a mill.
        </p>
      </Section>
      <Section title="Phase 2 — Movement">
        <p>
          Move one piece to an adjacent empty intersection. Forming a mill again lets you remove an
          opponent piece.
        </p>
      </Section>
      <Section title="Phase 3 — Flying">
        <p>
          When a player is reduced to exactly 3 pieces, they may move to any empty intersection
          ("fly").
        </p>
      </Section>
      <Section title="Mills">
        <p>
          Three pieces in a row along any of the 12 lines on the board. Breaking and reforming the
          same mill is allowed.
        </p>
      </Section>
    </>
  );
}

function StellarSiegeRules() {
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

function RockPaperScissorsRules() {
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
