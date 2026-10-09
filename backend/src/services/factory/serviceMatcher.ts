/**
 * serviceMatcher — a PURE, deterministic opportunity→services matcher. No LLM, no DB, no IO: it takes the
 * opportunity's signals + the service catalog and returns a ranked, explainable list of suggested services.
 *
 * It is ADVISORY ONLY: it writes nothing and gates nothing. Every match is a SUGGESTION TO CONFIRM, never a
 * verified company fit — the rationale names exactly what overlapped so a human can check it. Totality: it never
 * throws; malformed fields are coerced/ignored and an empty catalog yields an empty result.
 *
 * Scoring (deterministic): NAICS exact-code overlap is the strongest signal, an exact-ish category match is a
 * boost, and each matched keyword adds one. Keyword matching is case-insensitive substring against the combined
 * opportunity text (title + category + summary + requirements). Category uses label containment (not free-text
 * substring) so a short label like "AI" can't match inside an unrelated word.
 */

export interface MatchSignals {
  category?: string | null;
  title?: string | null;
  summary?: string | null;
  requirements?: Array<string | null | undefined> | null;
  naics?: Array<string | null | undefined> | null;
}

export interface MatcherServiceInput {
  id: string;
  name: string;
  category?: string | null;
  keywords?: Array<string | null | undefined> | null;
  naicsCodes?: Array<string | null | undefined> | null;
}

export type MatchStrength = 'strong' | 'moderate' | 'weak';

export interface ServiceMatch {
  id: string;
  name: string;
  category: string | null;
  score: number;
  strength: MatchStrength;
  /** Human-readable, names the exact overlaps. For display next to the "suggested — confirm" label. */
  reason: string;
  matchedKeywords: string[];
  categoryMatched: boolean;
  matchedNaics: string[];
}

const MAX_MATCHES = 6;
const MAX_KEYWORDS_SHOWN = 6;
const W_NAICS = 10;
const W_CATEGORY = 3;
const W_KEYWORD = 1;
const MIN_KEYWORD_LEN = 2;

const lc = (v: unknown): string => (typeof v === 'string' ? v.toLowerCase() : '');
const cleanArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((s) => s.trim()) : [];
/** Whole words of a lowercased string — so a short category label like "ai" can't match inside "training". */
const words = (s: string): string[] => s.split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Rank the catalog against an opportunity's signals. Returns only services with a positive score, highest first
 * (name-tiebroken), capped. Empty when nothing overlaps.
 */
export function matchServicesToOpportunity(
  signals: MatchSignals | null | undefined,
  services: MatcherServiceInput[] | null | undefined,
  opts?: { max?: number },
): ServiceMatch[] {
  const max = Math.max(1, opts?.max ?? MAX_MATCHES);
  const s = signals || {};
  const sigCategory = lc(s.category);
  const reqText = cleanArr(s.requirements).map((r) => r.toLowerCase()).join(' ');
  const combined = [lc(s.title), sigCategory, lc(s.summary), reqText].join(' ');
  const sigCategoryWords = new Set(words(sigCategory));
  const sigNaics = new Set(cleanArr(s.naics));
  const list = Array.isArray(services) ? services : [];

  const matches: ServiceMatch[] = [];
  for (const svc of list) {
    if (!svc || typeof svc.id !== 'string' || typeof svc.name !== 'string') continue;

    const matchedKeywords = cleanArr(svc.keywords)
      .filter((kw) => kw.length >= MIN_KEYWORD_LEN && combined.includes(kw.toLowerCase()));

    const svcCat = lc(svc.category);
    const svcCatWords = words(svcCat);
    // Whole-word containment: the service's category label matches when it equals the opportunity's category, or
    // every word of it appears as a whole word in the opportunity's category (so "AI" never matches "trAIning").
    const categoryMatched = !!svcCat && !!sigCategory
      && (svcCat === sigCategory || (svcCatWords.length > 0 && svcCatWords.every((w) => sigCategoryWords.has(w))));

    const matchedNaics = cleanArr(svc.naicsCodes).filter((n) => sigNaics.has(n));

    const score = matchedNaics.length * W_NAICS + (categoryMatched ? W_CATEGORY : 0) + matchedKeywords.length * W_KEYWORD;
    if (score <= 0) continue;

    const shownKeywords = matchedKeywords.slice(0, MAX_KEYWORDS_SHOWN);
    const strength: MatchStrength = score >= W_NAICS ? 'strong' : score >= W_CATEGORY ? 'moderate' : 'weak';

    const parts: string[] = [];
    if (matchedNaics.length) parts.push(`NAICS ${matchedNaics.join(', ')}`);
    if (categoryMatched) parts.push(`category ${svc.category ?? ''}`.trim());
    if (shownKeywords.length) parts.push(`keywords: ${shownKeywords.join(', ')}`);
    const reason = parts.length ? `Matches on ${parts.join('; ')}` : 'Potential match';

    matches.push({
      id: svc.id, name: svc.name, category: svc.category ?? null, score, strength, reason,
      matchedKeywords: shownKeywords, categoryMatched, matchedNaics,
    });
  }

  matches.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return matches.slice(0, max);
}
