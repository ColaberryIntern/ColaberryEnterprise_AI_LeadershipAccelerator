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
export interface BoardRow { rank: number; name: string; score: number; you: boolean }
export interface Board { week_start: string; rows: BoardRow[] }

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
export const fetchGameBoard = (game: GameId) => call<Board>('get', `/scores?game=${encodeURIComponent(game)}`);
