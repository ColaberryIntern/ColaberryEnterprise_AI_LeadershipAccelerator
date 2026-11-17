import api from '../utils/api';

/**
 * AF11.10 — the five-column board, as a client.
 *
 * One read and no writes, matching the API. Every column is DERIVED from records that already
 * exist, so there is deliberately no "move this card" call: a card moves when the record that
 * gates it changes, and a board that could move a card independently would be the second source
 * of truth the whole design refuses.
 */

export type BoardColumn =
  | 'scoping' | 'your_desk' | 'being_built' | 'builder_validates' | 'agent_has_it';

export interface BoardCard {
  change_request_id: string;
  domain_key: string;
  title: string;
  column: BoardColumn | 'unknown';
  /** A name, or "You", or "nobody". Never a status chip. */
  held_by: string;
  /** Why they are holding it, in words: "tool request, undecided". */
  holding_because: string;
  held_hours: number | null;
  /**
   * ALWAYS NULL today. Nothing records how often an agent has used a tool it holds, so the board
   * shows "not recorded" rather than zero: a working tool must not read as an unused one.
   */
  runs: number | null;
  placed_because: string;
}

export interface Board {
  columns: Array<{ key: BoardColumn | 'unknown'; cards: BoardCard[] }>;
  /** Cards the records could not place. Surfaced, never hidden. */
  unknown: BoardCard[];
  /** An empty column two, as a fact rather than an array length to eyeball. */
  nobody_is_waiting_on_you: boolean;
}

export interface UndecidedChangeRequest {
  id: string;
  title: string;
  domain_key: string;
  requested_by_identity: string;
  requested_at: string | null;
  waiting_hours: number | null;
}

export async function fetchCapabilityBoard(domainKey?: string): Promise<{
  board: Board;
  undecided_change_requests: UndecidedChangeRequest[];
}> {
  const { data } = await api.get<{
    board: Board;
    undecided_change_requests: UndecidedChangeRequest[];
  }>('/api/admin/agent-domain-capability-board', {
    params: domainKey ? { domain_key: domainKey } : undefined,
  });
  return data;
}

/** "2 days", "4 hours", or null. Mirrors `ageInWords` in the backend module. */
export function ageInWords(hours: number | null): string | null {
  if (hours === null) return null;
  if (hours < 1) return 'under an hour';
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`;
  return `${Math.floor(hours / 24)} days`;
}
