import api from '../utils/api';

// challengeApi — frontend client for the public two-door Challenge surfaces.
// Owns the env read (REACT_APP_CHALLENGE_ID) and the axios call so page
// components never touch process.env directly (frontend/CLAUDE.md rule) and
// never call fetch from a component. The leaderboard is a public render surface:
// every failure path here degrades to a typed empty result, never a throw, so
// the page can fall back to its sample rows and never look broken pre-migration.

// Mirrors the backend LeaderboardRow contract in
// backend/src/controllers/challengeController.ts. Renaming a field here is a
// breaking contract change — keep it in lockstep with that file.
export type LeaderboardTier = 'bronze' | 'silver' | 'gold';

export interface ApiLeaderboardRow {
  rank: number;
  challenge_participant_id: string;
  enrollment_id: string;
  full_name: string;
  company: string;
  score: number;
  projects_shipped: number;
  cert_earned: boolean;
  tier: LeaderboardTier;
}

export interface ApiLeaderboardResponse {
  challenge_id: string;
  scope: 'company' | 'global';
  count: number;
  rows: ApiLeaderboardRow[];
}

export type LeaderboardScope = 'global' | 'company';

// The active season's challenge id is environment config, not source. Until the
// migration lands and the id is provisioned per environment this is undefined,
// which the page reads as "stay on sample data".
export function getActiveChallengeId(): string | undefined {
  const id = process.env.REACT_APP_CHALLENGE_ID;
  return id && id.trim() ? id.trim() : undefined;
}

// Narrow an unknown axios payload to the response contract without trusting it.
// A 200 with the wrong shape (e.g. a proxy error page) must not crash the page.
function isLeaderboardResponse(data: unknown): data is ApiLeaderboardResponse {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return Array.isArray(d.rows);
}

export interface FetchLeaderboardResult {
  // ok=false means "fall back to sample rows": missing config, network/HTTP
  // error, malformed payload, or a genuinely empty board pre-migration. The
  // caller does not need to know which — it just renders the sample set.
  ok: boolean;
  rows: ApiLeaderboardRow[];
}

const EMPTY: FetchLeaderboardResult = { ok: false, rows: [] };

// GET /api/challenge/leaderboard via the shared axios client. Never throws.
export async function fetchLeaderboard(
  scope: LeaderboardScope = 'global',
  signal?: AbortSignal,
): Promise<FetchLeaderboardResult> {
  const challengeId = getActiveChallengeId();
  if (!challengeId) return EMPTY; // not provisioned yet → sample data

  try {
    const res = await api.get('/api/challenge/leaderboard', {
      params: { challenge_id: challengeId, scope },
      signal,
      timeout: 15000,
    });
    if (!isLeaderboardResponse(res.data)) return EMPTY;
    const rows = res.data.rows;
    return rows.length > 0 ? { ok: true, rows } : EMPTY;
  } catch {
    // Aborted requests and all transport/HTTP errors degrade to fallback. The
    // shared client's interceptor already surfaces a toast for real errors; the
    // page just stays on sample rows.
    return EMPTY;
  }
}
