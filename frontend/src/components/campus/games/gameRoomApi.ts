import axios from 'axios';
import { getParticipantToken } from '../../../utils/participantToken';
import type { GameId } from './engine/gameRules';

/**
 * Client for the Game Room (Colaberry Campus C10). Own requests with the token attached and a 10 s timeout, no redirect interceptor
 * (same rule as the campus clients). Every failure throws a GameApiError carrying the HTTP status and the server's error_class, so the
 * page can tell "pilot off", "cap reached" and "run expired" from a network or server failure. The client never sends a duration.
 */
export const GAME_API_TIMEOUT_MS = 10_000;
export interface GameTime { used_s: number; cap_s: number; left_s: number; resets_at: string }
/** C35: rows also carry who the person is (only for people you may see by name; others read "Colaberry learner"). */
export interface BoardRow {
  rank: number; name: string; score: number; you: boolean;
  display_name?: string; avatar_url?: string | null; rung_name?: string | null; cohort_name?: string | null;
}
/** At most ten rows; `me` is your best and rank even outside them (null: no score yet). */
export interface Board { week_start: string; rows: BoardRow[]; me?: { best: number; rank: number } | null }
export type BoardScope = 'cohort' | 'all';
export type BoardPeriod = 'week' | 'all';
export interface RecentHigh { kind: 'best' | 'top'; name: string; enrollment_id: string; game: GameId; score: number; at: string }
export interface GameSummary {
  week_start: string;
  your_week: { played: number; best_game: GameId | null; best_score: number | null; best_rank: number | null };
  champions: Array<{ game: GameId; name: string | null; avatar_url: string | null; score: number | null }>;
  recent: RecentHigh[];
}
export interface PlayingNow { count: number; people: Array<{ name: string; game: GameId }> }

export class GameApiError extends Error {
  constructor(message: string, readonly status: number, readonly error_class: string) { super(message); this.name = 'GameApiError'; }
}

const base = () => `${process.env.REACT_APP_API_URL || ''}/api/portal/game-room`;
const headers = () => { const t = getParticipantToken(); return t ? { Authorization: `Bearer ${t}` } : {}; };

async function call<T>(method: 'get' | 'post', path: string, body?: unknown): Promise<T> {
  try {
    const cfg = { headers: headers(), timeout: GAME_API_TIMEOUT_MS };
    const { data } = method === 'get' ? await axios.get<T>(base() + path, cfg) : await axios.post<T>(base() + path, body, cfg);
    return data;
  } catch (err) {
    const e = err as { response?: { status?: number; data?: { error?: string; error_class?: string } }; code?: string };
    const status = e.response?.status ?? 0;
    const cls = e.response?.data?.error_class ?? (e.code === 'ECONNABORTED' ? 'Timeout' : status ? 'HttpError' : 'NetworkError');
    throw new GameApiError(e.response?.data?.error ?? 'The Game Room did not answer.', status, cls);
  }
}

export const fetchGameTime = () => call<GameTime>('get', '/time');
export const startGameRun = (game: GameId) => call<{ run_id: string; left_s: number }>('post', '/start', { game });
export const beatGameRun = (runId: string) => call<{ left_s: number }>('post', '/beat', { run_id: runId });
export const submitGameScore = (runId: string, score: number) => call<{ score: number; seconds_used: number; replayed: boolean }>('post', '/scores', { run_id: runId, score });
export const fetchGameBoard = (game: GameId, scope: BoardScope = 'cohort', period: BoardPeriod = 'week') =>
  call<Board>('get', `/scores?game=${encodeURIComponent(game)}&scope=${scope}&period=${period}`);
// C35 (v8 G4)
export const fetchGameSummary = () => call<GameSummary>('get', '/summary');
export const fetchPlayingNow = () => call<PlayingNow>('get', '/playing');
export const challengeFriend = (to: string, game: GameId, score: number) => call<{ sent: boolean; reason: 'sent' | 'already_challenged' }>('post', '/challenge', { to, game, score });
