/**
 * bpKeywordExtractor — derive a "refine cloud" keyword set from BP rows.
 *
 * Pure tokenization over BP names + linked-file basenames. View-scoped:
 * caller passes the BPs currently passing the text + layer filters so
 * the cloud shrinks as filters narrow, like Opportunity Pulse's
 * "click any word to narrow" panel.
 *
 *   tokens([cap]) → ['prompt', 'generation', 'service', ...]
 *   extractKeywords(caps, { topN: 20 }) → KeywordChip[] frequency-ranked
 */
import type { BPLike } from './bpDomainClassifier';

export interface KeywordChip {
  word: string;
  count: number;
  /** Relative weight 0..1 — drives font-size scaling on the cloud. */
  weight: number;
}

// Generic stop-words + project-noise tokens that would dominate the cloud
// without adding signal. Conservative — we'd rather show a marginal word
// than hide a real domain term.
const STOP_WORDS = new Set<string>([
  // articles, conjunctions, prepositions
  'the','and','for','with','from','this','that','will','can','any','all',
  'are','was','has','have','had','its','not','but','our','out','use','via',
  // generic system words that match too many BPs
  'system','service','services','project','projects','process','processes',
  'data','app','api','code','file','files','module','modules','engine',
  'manager','management','util','utils','helper','helpers','core','base',
  // very common file-name suffixes
  'ts','tsx','js','jsx','test','tests','spec','specs','index',
]);

const MIN_TOKEN_LEN = 3;

/**
 * Tokenize one BP into a deduplicated lowercase token list.
 * Pulls from: name, linked_backend_services basenames, linked_frontend_components
 * basenames, linked_agents basenames. CamelCase + snake_case + kebab-case
 * + path separators all split on token boundaries.
 */
export function tokensFromBp(bp: BPLike): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string) => {
    for (const tok of splitToTokens(raw)) {
      if (tok.length < MIN_TOKEN_LEN) continue;
      if (STOP_WORDS.has(tok)) continue;
      if (seen.has(tok)) continue;
      seen.add(tok);
      out.push(tok);
    }
  };
  push(bp.name);
  for (const p of bp.linked_backend_services || []) push(basename(p));
  for (const p of bp.linked_frontend_components || []) push(basename(p));
  for (const p of bp.linked_agents || []) push(basename(p));
  return out;
}

/**
 * Build the keyword cloud from the visible BP set.
 * - Frequency-sort, take topN, normalize weight 0..1 by max count.
 * - Tokens that match ALL visible BPs (e.g. "lead" when every BP is
 *   about leads) are dropped — they add no narrowing power.
 */
export function extractKeywords(bps: BPLike[], opts: { topN?: number } = {}): KeywordChip[] {
  const topN = opts.topN ?? 24;
  if (bps.length === 0) return [];

  const counts = new Map<string, number>();
  for (const bp of bps) {
    for (const tok of tokensFromBp(bp)) {
      counts.set(tok, (counts.get(tok) || 0) + 1);
    }
  }
  // A token present in every visible BP narrows nothing — drop it.
  // (Only suppress when there are 4+ visible BPs; otherwise the cloud
  // would go empty in tiny views.)
  if (bps.length >= 4) {
    for (const [tok, c] of counts) {
      if (c === bps.length) counts.delete(tok);
    }
  }

  const ranked = [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, topN);

  const maxCount = ranked[0]?.count || 1;
  return ranked.map(({ word, count }) => ({
    word,
    count,
    weight: count / maxCount,
  }));
}

/**
 * Test whether a BP matches a query string (case-insensitive substring).
 * Searches name + linked-file basenames + agent stems. Empty query → true.
 */
export function bpMatchesQuery(bp: BPLike, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  if (bp.name.toLowerCase().includes(needle)) return true;
  for (const p of bp.linked_backend_services || []) if (basename(p).toLowerCase().includes(needle)) return true;
  for (const p of bp.linked_frontend_components || []) if (basename(p).toLowerCase().includes(needle)) return true;
  for (const p of bp.linked_agents || []) if (basename(p).toLowerCase().includes(needle)) return true;
  if (bp.frontend_route && bp.frontend_route.toLowerCase().includes(needle)) return true;
  return false;
}

/**
 * Test whether a BP contains a specific keyword chip (token-exact match
 * against the token set). Stricter than substring match — the cloud
 * promises "click this WORD to filter," so "generation" should match
 * "Prompt Generation" but not "regeneration" (which would tokenize to
 * its own token).
 */
export function bpHasKeyword(bp: BPLike, kw: string): boolean {
  const target = kw.toLowerCase();
  for (const tok of tokensFromBp(bp)) {
    if (tok === target) return true;
  }
  return false;
}

// ─── internals ─────────────────────────────────────────────────────────

function basename(p: string): string {
  if (!p) return '';
  const slash = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  const tail = slash >= 0 ? p.slice(slash + 1) : p;
  const dot = tail.lastIndexOf('.');
  return dot > 0 ? tail.slice(0, dot) : tail;
}

function splitToTokens(raw: string): string[] {
  if (!raw) return [];
  // Split on whitespace, punctuation, and camelCase boundaries.
  return raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')   // camelCase → camel Case
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // HTTPServer → HTTP Server
    .split(/[\s_\-./\\:,;()[\]{}|"'`!?<>=+*&^%#@~]+/)
    .map(t => t.toLowerCase())
    .filter(Boolean);
}
