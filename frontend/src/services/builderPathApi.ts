import api from '../utils/api';

/**
 * The builder-path board: where every builder is, and what is waiting on the owner.
 *
 * ## Two routes, two audiences, and conflating them is the mistake to avoid
 *
 *   - `GET /api/admin/builder-path-board`          all ten domains. `requireAdmin`.
 *   - `GET /api/admin/agent-domain-candidates-mine` the caller's own. `requireSection('dashboard')`.
 *
 * `agent-domains-mine`'s own header states the principle both follow: *"Section access decides
 * whether you may ask; ownership decides what comes back."* This module serves the first, which is
 * the owner's question, so nothing here should ever be rendered on a builder's page.
 *
 * ## Every figure comes from the API
 *
 * No count, no domain name and no gap number is written into this file or the page that reads it,
 * and a test asserts that by reading the page's source. The numbers in this programme have moved
 * repeatedly, and every time the stale copy was in prose nobody re-derived.
 */

export interface BoardCandidate {
  id: string;
  domain_key: string;
  title: string;
  source: string;
  product_state: string;
  stage: string;
  turn: 'builder' | 'owner' | 'nobody';
  /** The one sentence saying what the person whose turn it is does next. Never empty. */
  action: string;
  /** Why the builder cannot move, or null when they can. */
  blocked_reason: string | null;
}

export interface BoardBuilder {
  domain_key: string;
  candidates: BoardCandidate[];
  waiting_on_you: number;
  theirs_to_move: number;
  cleared_the_gate: number;
  gate_size: number;
  /** The API's own sentence. An empty list is explained, never left to look like a stall. */
  note: string;
}

export interface ScreenGap {
  domain_key: string;
  feature_key: string;
  label: string;
  state: string;
  product_route_note: string | null;
}

export interface GapGroup {
  product_area: string;
  /** Features whose endpoints exist and whose screen nobody built. The owner's queue. */
  screens_owed: ScreenGap[];
  /** Candidates the product cannot do at all. The builder's scope sheets, not the owner's. */
  scope_sheets_owed: BoardCandidate[];
  total: number;
}

export interface BuilderPathBoardResponse {
  builders: BoardBuilder[];
  gap_board: GapGroup[];
  summary: {
    domains: number;
    candidates: number;
    waiting_on_you: number;
    screens_owed: number;
    scope_sheets_owed: number;
  };
  reason: string;
}

export async function fetchBuilderPathBoard(): Promise<BuilderPathBoardResponse> {
  const { data } = await api.get<BuilderPathBoardResponse>('/api/admin/builder-path-board');
  return data;
}

/** The server's message when it supplies one, so a failure is never rendered as an empty board. */
export function errorMessage(e: unknown, fallback: string): string {
  const r = e as { response?: { data?: { error?: string } }; message?: string };
  return r?.response?.data?.error || r?.message || fallback;
}
