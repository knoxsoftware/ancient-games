export const POWER_UP_DISPLAY: Record<string, { name: string; description: string; emoji: string }> = {
  double_roll: { name: 'Loaded Dice', description: 'Once: roll twice, take the higher result', emoji: '🎲' },
  ghost_piece: { name: 'Ghost Piece', description: 'Your first-moved piece cannot be captured', emoji: '👻' },
  safe_passage: { name: 'Ward', description: 'Your pieces cannot be captured — 3 uses', emoji: '🛡️' },
  reroll: { name: 'Fickle Fate', description: 'Once: reroll after seeing your dice result', emoji: '🔄' },
  extra_move: { name: 'Surge', description: 'Once: move a second piece with the same roll', emoji: '⚡' },
  slow_curse: { name: 'Hex', description: "Once: skip your opponent's next turn", emoji: '🌑' },
};

export const EVENT_DISPLAY: Record<string, { name: string; description: string; emoji: string }> = {
  board_flip: { name: 'Reversal', description: 'Move one of your pieces backward by 1', emoji: '↩️' },
  piece_swap: { name: 'Transposition', description: "Swap one of your pieces with opponent's", emoji: '🔀' },
  opponent_setback: { name: 'Stumble', description: "Opponent's most-advanced piece goes back 2", emoji: '💫' },
  extra_turn: { name: 'Fortune', description: 'Take an extra turn immediately', emoji: '⭐' },
  rosette_shift: { name: 'Shifting Stars', description: 'A shared square becomes a rosette', emoji: '✨' },
  dice_curse: { name: 'Loaded Against', description: "Opponent's next roll is halved", emoji: '🎭' },
  free_entry: { name: 'Rush', description: 'Place one off-board piece at start', emoji: '🚀' },
  barrier: { name: 'Blockade', description: 'A shared square is impassable for 3 turns', emoji: '🚧' },
};
