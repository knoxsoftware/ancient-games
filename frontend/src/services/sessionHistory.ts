import { GameType, TournamentFormat } from '@ancient-games/shared';

export interface SessionHistoryEntry {
  sessionCode: string;
  gameType: GameType;
  playerName: string;
  lobbyFormat?: TournamentFormat | 'single';
  joinedAt: number;
}

const KEY = 'v1:sessionHistory';
const MAX_ENTRIES = 10;

function load(): SessionHistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

function save(entries: SessionHistoryEntry[]): void {
  localStorage.setItem(KEY, JSON.stringify(entries));
}

export const sessionHistory = {
  addSession(entry: SessionHistoryEntry): void {
    const entries = load().filter((e) => e.sessionCode !== entry.sessionCode);
    entries.unshift(entry);
    save(entries.slice(0, MAX_ENTRIES));
  },

  getSessions(): SessionHistoryEntry[] {
    return load();
  },

  removeSession(sessionCode: string): void {
    save(load().filter((e) => e.sessionCode !== sessionCode));
  },
};
