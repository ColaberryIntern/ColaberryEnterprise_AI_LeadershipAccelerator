/**
 * PROGRESS.md Service
 *
 * Reads PROGRESS.md from the user's repo and parses checked items as
 * the source of truth for completed work. The recommendation engine
 * uses this to filter out enhancement options whose targets are
 * already documented as done — closing the gap between what the user
 * has actually built and what our heuristics think they've built.
 *
 * Per CLAUDE.md project rules, PROGRESS.md tracks completed work in
 * the `- [x]` checkbox format. We parse those lines, normalize them,
 * and expose a substring-matchable set.
 */

import { readFileFromRepo } from './githubService';

export interface ProgressLedger {
  /** Raw PROGRESS.md content. Empty string when the file is absent. */
  raw: string;
  /** Lowercased, trimmed text of every checked `[x]` line. */
  completed: string[];
  /** Whether the file existed in the repo. */
  found: boolean;
}

const EMPTY: ProgressLedger = { raw: '', completed: [], found: false };

// Common locations to look for PROGRESS.md in priority order.
const CANDIDATE_PATHS = ['PROGRESS.md', 'progress.md', 'docs/PROGRESS.md', 'docs/progress.md'];

// In-memory cache so multiple BPs in the same request don't refetch.
const CACHE = new Map<string, { ledger: ProgressLedger; expires: number }>();
const TTL_MS = 60_000; // 1 minute — keeps repeat enrichCapability calls fast

export async function getProgressLedger(enrollmentId: string): Promise<ProgressLedger> {
  const cached = CACHE.get(enrollmentId);
  if (cached && cached.expires > Date.now()) return cached.ledger;

  let raw = '';
  for (const path of CANDIDATE_PATHS) {
    try {
      const content = await readFileFromRepo(enrollmentId, path);
      if (content && content.length > 0) { raw = content; break; }
    } catch { /* try next path */ }
  }

  if (!raw) {
    CACHE.set(enrollmentId, { ledger: EMPTY, expires: Date.now() + TTL_MS });
    return EMPTY;
  }

  const completed: string[] = [];
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*[-*]\s*\[\s*x\s*\]\s*(.+)/i);
    if (m) {
      const text = m[1].trim().toLowerCase();
      if (text.length > 3) completed.push(text);
    }
  }

  const ledger: ProgressLedger = { raw, completed, found: true };
  CACHE.set(enrollmentId, { ledger, expires: Date.now() + TTL_MS });
  return ledger;
}

/**
 * Decide whether a recommendation label is already covered by a checked
 * PROGRESS.md item. We use a loose token-overlap match — at least 60% of
 * the meaningful tokens (3+ chars, not stopwords) in the label must
 * appear in a single completed line.
 */
export function isCoveredByProgress(label: string, ledger: ProgressLedger): boolean {
  if (!ledger.found || ledger.completed.length === 0) return false;
  const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'add', 'build', 'create', 'improve', 'a', 'an', 'to', 'of', 'in', 'on', 'this']);
  const labelTokens = (label || '').toLowerCase().split(/\W+/).filter(t => t.length >= 3 && !STOPWORDS.has(t));
  if (labelTokens.length === 0) return false;
  for (const line of ledger.completed) {
    const matches = labelTokens.filter(t => line.includes(t)).length;
    if (matches / labelTokens.length >= 0.6) return true;
  }
  return false;
}
