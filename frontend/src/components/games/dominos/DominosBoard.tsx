import { useState } from 'react';
import { Session, GameState, DominoTile, PlayedDomino } from '@ancient-games/shared';
import { socketService } from '../../../services/socket';

interface Props {
  session: Session;
  gameState: GameState;
  playerId: string;
  isMyTurn: boolean;
  hand: DominoTile[];
}

// Standard pip positions for 0-6 (each entry is list of [cx, cy] within a half-tile 0..1 space)
const PIP_POSITIONS: [number, number][][] = [
  [], // 0
  [[0.5, 0.5]], // 1
  [[0.25, 0.25], [0.75, 0.75]], // 2
  [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]], // 3
  [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]], // 4
  [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]], // 5
  [[0.25, 0.2], [0.75, 0.2], [0.25, 0.5], [0.75, 0.5], [0.25, 0.8], [0.75, 0.8]], // 6
];

const TILE_W = 56; // width of one tile (two halves)
const TILE_H = 28; // height
const HALF_W = 28;
const R = 2.5; // pip radius

function Pips({ value, x, y, w, h, color }: { value: number; x: number; y: number; w: number; h: number; color: string }) {
  const positions = PIP_POSITIONS[value] ?? [];
  return (
    <>
      {positions.map(([px, py], i) => (
        <circle
          key={i}
          cx={x + px * w}
          cy={y + py * h}
          r={R}
          fill={color}
        />
      ))}
    </>
  );
}

interface TileSvgProps {
  tile: DominoTile;
  flipped: boolean;
  x: number;
  y: number;
  isDouble?: boolean; // render rotated 90°
  highlight?: 'selected' | 'valid' | 'last';
  onClick?: () => void;
  faceDown?: boolean;
  dimmed?: boolean;
}

function TileSvg({ tile, flipped, x, y, isDouble = false, highlight, onClick, faceDown = false, dimmed = false }: TileSvgProps) {
  const leftVal = flipped ? tile.high : tile.low;
  const rightVal = flipped ? tile.low : tile.high;

  const borderColor =
    highlight === 'selected' ? '#F0E840' :
    highlight === 'valid' ? '#40C870' :
    highlight === 'last' ? '#C4A030' :
    '#3A2A14';

  const bgColor = dimmed ? 'rgba(20,10,0,0.5)' : '#1E1208';
  const pipColor = dimmed ? '#5A4A38' : '#E8D8B0';

  const transform = isDouble ? `rotate(90, ${x + TILE_W / 2}, ${y + TILE_H / 2})` : undefined;

  return (
    <g transform={transform} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <rect
        x={x} y={y} width={TILE_W} height={TILE_H} rx={4}
        fill={bgColor}
        stroke={borderColor}
        strokeWidth={highlight ? 2 : 1}
      />
      {/* Divider line */}
      <line
        x1={x + HALF_W} y1={y + 4}
        x2={x + HALF_W} y2={y + TILE_H - 4}
        stroke={borderColor} strokeWidth={0.5}
      />
      {faceDown ? (
        // Hatching pattern for face-down tiles
        <rect x={x + 3} y={y + 3} width={TILE_W - 6} height={TILE_H - 6} rx={2} fill="rgba(60,40,20,0.4)" />
      ) : (
        <>
          <Pips value={leftVal} x={x + 2} y={y + 2} w={HALF_W - 4} h={TILE_H - 4} color={pipColor} />
          <Pips value={rightVal} x={x + HALF_W + 2} y={y + 2} w={HALF_W - 4} h={TILE_H - 4} color={pipColor} />
        </>
      )}
      {highlight === 'selected' && (
        <rect
          x={x - 2} y={y - 2} width={TILE_W + 4} height={TILE_H + 4} rx={5}
          fill="none" stroke="#F0E840" strokeWidth={2.5} strokeDasharray="4 2"
        />
      )}
    </g>
  );
}

function getChainEnds(chain: PlayedDomino[]): [number | null, number | null] {
  if (chain.length === 0) return [null, null];
  const left = chain[0];
  const right = chain[chain.length - 1];
  const leftVal = left.flipped ? left.tile.high : left.tile.low;
  const rightVal = right.flipped ? right.tile.low : right.tile.high;
  return [leftVal, rightVal];
}

function tileMatchesLeft(tile: DominoTile, leftVal: number): boolean {
  return tile.high === leftVal || tile.low === leftVal;
}

function tileMatchesRight(tile: DominoTile, rightVal: number): boolean {
  return tile.high === rightVal || tile.low === rightVal;
}

const TILES_PER_ROW = 8;
const ROW_H = TILE_H + 8;
const CHAIN_PAD_X = 8;

export default function DominosBoard({ session, gameState, playerId, isMyTurn, hand }: Props) {
  const [selectedTile, setSelectedTile] = useState<DominoTile | null>(null);

  const socket = socketService.getSocket();
  const sessionCode = session.sessionCode;

  const myPlayer = session.players.find(p => p.id === playerId);
  const myPlayerNumber = myPlayer?.playerNumber ?? -1;
  const opponentNumber = myPlayerNumber === 0 ? 1 : 0;
  const opponentPlayer = session.players.find(p => p.playerNumber === opponentNumber);

  const chain = gameState.board.dominoChain ?? [];
  const boneyardSize = gameState.board.dominoBoneyardSize ?? 0;
  const handSizes = gameState.board.dominoHandSizes ?? [0, 0];
  const opponentHandSize = handSizes[opponentNumber] ?? 0;

  const [leftVal, rightVal] = getChainEnds(chain);
  const chainIsEmpty = chain.length === 0;

  // Determine which tiles in hand can play where
  const canPlayLeft = (tile: DominoTile) =>
    chainIsEmpty || (leftVal !== null && tileMatchesLeft(tile, leftVal));
  const canPlayRight = (tile: DominoTile) =>
    chainIsEmpty || (rightVal !== null && tileMatchesRight(tile, rightVal));
  const canPlay = (tile: DominoTile) => canPlayLeft(tile) || canPlayRight(tile);

  const hasValidPlay = hand.some(canPlay);
  const canDraw = !hasValidPlay && boneyardSize > 0;
  const mustPass = !hasValidPlay && boneyardSize === 0;

  const emitMove = (pieceIndex: number, from: number, to: number) => {
    if (!socket || !isMyTurn) return;
    socket.emit('game:move', {
      sessionCode,
      playerId,
      move: { playerId, pieceIndex, from, to },
    });
    setSelectedTile(null);
  };

  const handleTileClick = (tile: DominoTile) => {
    if (!isMyTurn || !canPlay(tile)) return;

    const matchLeft = canPlayLeft(tile);
    const matchRight = canPlayRight(tile);

    if (chainIsEmpty) {
      // First move: play right end by convention
      emitMove(tile.id, tile.id, 1);
      return;
    }

    if (matchLeft && matchRight) {
      // Ambiguous: select tile and wait for end click
      setSelectedTile(prev => prev?.id === tile.id ? null : tile);
    } else if (matchLeft) {
      emitMove(tile.id, tile.id, 0);
    } else {
      emitMove(tile.id, tile.id, 1);
    }
  };

  const handleEndClick = (side: 0 | 1) => {
    if (!selectedTile) return;
    emitMove(selectedTile.id, selectedTile.id, side);
  };

  const handleDraw = () => {
    if (!isMyTurn || !canDraw) return;
    emitMove(-1, -1, -1);
  };

  const handlePass = () => {
    if (!isMyTurn || !mustPass) return;
    socket?.emit('game:skip-turn', { sessionCode, playerId });
  };

  // Chain layout: rows of TILES_PER_ROW tiles, snake direction
  const chainRows: { tiles: PlayedDomino[]; reversed: boolean }[] = [];
  for (let i = 0; i < chain.length; i += TILES_PER_ROW) {
    const rowTiles = chain.slice(i, i + TILES_PER_ROW);
    const reversed = Math.floor(i / TILES_PER_ROW) % 2 === 1;
    chainRows.push({ tiles: reversed ? [...rowTiles].reverse() : rowTiles, reversed });
  }

  const chainSvgW = TILES_PER_ROW * (TILE_W + 4) + CHAIN_PAD_X * 2;
  const chainSvgH = Math.max(1, chainRows.length) * ROW_H + 16;

  // Hand layout
  const HAND_GAP = 4;
  const handSvgW = Math.max(1, hand.length) * (TILE_W + HAND_GAP) + 8;
  const handSvgH = TILE_H + 16;

  const isMyTurnText = isMyTurn ? 'Your turn' : `${opponentPlayer?.displayName ?? 'Opponent'}'s turn`;
  const currentPlayerNumber = gameState.currentTurn;
  const isCurrentPlayerMe = currentPlayerNumber === myPlayerNumber;

  return (
    <div style={{ color: '#E8D8B0', fontFamily: 'inherit' }}>
      {/* Status bar */}
      <div
        className="flex items-center justify-between px-3 py-2 mb-3 rounded-lg text-sm"
        style={{ background: 'rgba(8,5,0,0.6)', border: '1px solid rgba(42,30,14,0.8)' }}
      >
        <span style={{ color: isCurrentPlayerMe ? '#E8C870' : '#8A7A60' }}>
          {isMyTurnText}
        </span>
        <div className="flex items-center gap-3 text-xs" style={{ color: '#8A7A60' }}>
          <span>{opponentPlayer?.displayName ?? 'Opponent'}: {opponentHandSize} tile{opponentHandSize !== 1 ? 's' : ''}</span>
          <span style={{ color: 'rgba(100,80,40,0.6)' }}>|</span>
          <span>Boneyard: {boneyardSize}</span>
        </div>
      </div>

      {/* Chain */}
      <div
        className="mb-3 rounded-lg overflow-x-auto"
        style={{ background: 'rgba(4,2,0,0.7)', border: '1px solid rgba(42,30,14,0.8)' }}
      >
        <div className="px-2 pt-2 pb-1">
          <div className="text-xs mb-1" style={{ color: '#5A4A38' }}>
            {chain.length === 0 ? 'Board is empty — play any tile to start' : 'Chain'}
            {chain.length > 0 && (
              <span className="ml-2" style={{ color: '#3A2A14' }}>
                ({chain.length} tile{chain.length !== 1 ? 's' : ''})
              </span>
            )}
          </div>
          <svg width={chainSvgW} height={chainSvgH} style={{ display: 'block', minWidth: chainSvgW }}>
            {chainRows.map(({ tiles, reversed }, rowIdx) => {
              const rowY = rowIdx * ROW_H + 4;
              return tiles.map((pd, colIdx) => {
                const chainIdx = rowIdx * TILES_PER_ROW + (reversed ? TILES_PER_ROW - 1 - colIdx : colIdx);
                const x = CHAIN_PAD_X + colIdx * (TILE_W + 4);
                const isLast = chainIdx === chain.length - 1;
                const isFirst = chainIdx === 0;
                const isDouble = pd.tile.high === pd.tile.low;
                return (
                  <TileSvg
                    key={pd.tile.id}
                    tile={pd.tile}
                    flipped={pd.flipped}
                    x={x}
                    y={rowY}
                    isDouble={isDouble}
                    highlight={isLast || isFirst ? 'last' : undefined}
                  />
                );
              });
            })}
          </svg>
        </div>

        {/* Chain ends indicator (when chain has tiles) */}
        {chain.length > 0 && (
          <div className="flex items-center justify-between px-3 py-1.5 border-t" style={{ borderColor: 'rgba(42,30,14,0.5)' }}>
            <button
              onClick={() => handleEndClick(0)}
              disabled={!selectedTile || !canPlayLeft(selectedTile)}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-all"
              style={{
                background: selectedTile && canPlayLeft(selectedTile) ? 'rgba(64,200,112,0.15)' : 'rgba(20,10,0,0.4)',
                border: `1px solid ${selectedTile && canPlayLeft(selectedTile) ? 'rgba(64,200,112,0.6)' : 'rgba(42,30,14,0.5)'}`,
                color: selectedTile && canPlayLeft(selectedTile) ? '#40C870' : '#5A4A38',
                cursor: selectedTile && canPlayLeft(selectedTile) ? 'pointer' : 'default',
              }}
            >
              <span style={{ fontSize: 10 }}>◄</span>
              <span>Left: {leftVal}</span>
            </button>
            <span className="text-xs" style={{ color: '#3A2A14' }}>
              {selectedTile ? 'Choose end' : 'Select a tile'}
            </span>
            <button
              onClick={() => handleEndClick(1)}
              disabled={!selectedTile || !canPlayRight(selectedTile)}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-all"
              style={{
                background: selectedTile && canPlayRight(selectedTile) ? 'rgba(64,200,112,0.15)' : 'rgba(20,10,0,0.4)',
                border: `1px solid ${selectedTile && canPlayRight(selectedTile) ? 'rgba(64,200,112,0.6)' : 'rgba(42,30,14,0.5)'}`,
                color: selectedTile && canPlayRight(selectedTile) ? '#40C870' : '#5A4A38',
                cursor: selectedTile && canPlayRight(selectedTile) ? 'pointer' : 'default',
              }}
            >
              <span>Right: {rightVal}</span>
              <span style={{ fontSize: 10 }}>►</span>
            </button>
          </div>
        )}
      </div>

      {/* My hand */}
      <div
        className="rounded-lg"
        style={{ background: 'rgba(8,5,0,0.6)', border: '1px solid rgba(42,30,14,0.8)' }}
      >
        <div className="px-3 pt-2 pb-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs" style={{ color: '#5A4A38' }}>
              Your hand ({hand.length} tile{hand.length !== 1 ? 's' : ''})
            </span>
            {isMyTurn && hasValidPlay && (
              <span className="text-xs" style={{ color: '#40C870' }}>
                Click a highlighted tile to play
              </span>
            )}
            {isMyTurn && canDraw && (
              <span className="text-xs" style={{ color: '#E8C870' }}>
                No valid plays — draw a tile
              </span>
            )}
            {isMyTurn && mustPass && (
              <span className="text-xs" style={{ color: '#C87040' }}>
                No moves and boneyard empty
              </span>
            )}
          </div>

          {hand.length === 0 ? (
            <div className="py-3 text-center text-xs" style={{ color: '#3A2A14' }}>
              Hand is empty
            </div>
          ) : (
            <div className="overflow-x-auto">
              <svg width={handSvgW} height={handSvgH} style={{ display: 'block', minWidth: handSvgW }}>
                {hand.map((tile, i) => {
                  const x = 4 + i * (TILE_W + HAND_GAP);
                  const y = 4;
                  const valid = isMyTurn && canPlay(tile);
                  const isSelected = selectedTile?.id === tile.id;
                  return (
                    <TileSvg
                      key={tile.id}
                      tile={tile}
                      flipped={false}
                      x={x}
                      y={y}
                      highlight={isSelected ? 'selected' : valid ? 'valid' : undefined}
                      dimmed={isMyTurn && !valid}
                      onClick={() => handleTileClick(tile)}
                    />
                  );
                })}
              </svg>
            </div>
          )}
        </div>

        {/* Action buttons */}
        {isMyTurn && (canDraw || mustPass) && (
          <div className="flex gap-2 px-3 pb-2">
            {canDraw && (
              <button
                onClick={handleDraw}
                className="flex-1 py-2 rounded text-sm font-semibold transition-all"
                style={{
                  background: 'rgba(196,160,48,0.15)',
                  border: '1px solid rgba(196,160,48,0.5)',
                  color: '#E8C870',
                }}
              >
                Draw Tile ({boneyardSize} left)
              </button>
            )}
            {mustPass && (
              <button
                onClick={handlePass}
                className="flex-1 py-2 rounded text-sm font-semibold transition-all"
                style={{
                  background: 'rgba(180,80,20,0.15)',
                  border: '1px solid rgba(180,80,20,0.5)',
                  color: '#C87040',
                }}
              >
                Pass Turn
              </button>
            )}
          </div>
        )}
      </div>

      {/* Opponent tiles (face-down) */}
      {opponentHandSize > 0 && (
        <div className="mt-3 overflow-x-auto">
          <svg
            width={Math.max(1, opponentHandSize) * (TILE_W + HAND_GAP) + 8}
            height={handSvgH}
            style={{ display: 'block', opacity: 0.5 }}
          >
            {Array.from({ length: opponentHandSize }, (_, i) => (
              <TileSvg
                key={i}
                tile={{ id: -1, high: 0, low: 0 }}
                flipped={false}
                x={4 + i * (TILE_W + HAND_GAP)}
                y={4}
                faceDown
              />
            ))}
          </svg>
        </div>
      )}
    </div>
  );
}
