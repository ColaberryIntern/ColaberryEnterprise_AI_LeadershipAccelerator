import { createHash } from 'crypto';

// Deterministic text normalization shared by discovery, matching, and
// grouping. No AI/network calls — pure functions, easy to unit test and
// safe to run against untrusted email/Basecamp content.

const SUBJECT_PREFIX_RE = /^\s*(re|fwd|fw|aw|wg)\s*:\s*/i;

// Strips Re:/Fwd:/Fw:/Aw:/Wg: prefixes (repeated, e.g. "Re: Fwd: Re:"),
// collapses punctuation/whitespace, lowercases. Used both to build the
// "same_normalized_subject" match signal and to dedupe subject variants
// during topic expansion.
export function normalizeSubject(subject: string | null | undefined): string {
  if (!subject) return '';
  let s = subject.trim();
  // eslint-disable-next-line no-constant-condition
  while (SUBJECT_PREFIX_RE.test(s)) {
    s = s.replace(SUBJECT_PREFIX_RE, '');
  }
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeEmailAddress(address: string | null | undefined): string {
  if (!address) return '';
  const match = address.match(/<([^>]+)>/);
  const raw = (match ? match[1] : address).trim().toLowerCase();
  return raw;
}

export function domainOf(address: string | null | undefined): string | null {
  const normalized = normalizeEmailAddress(address);
  const at = normalized.lastIndexOf('@');
  return at === -1 ? null : normalized.slice(at + 1);
}

// Stable dedup key for InboxCaseItem.source_hash — one source item can never
// be duplicated into the same case even across repeated discovery runs.
export function computeSourceHash(provider: string, sourceId: string): string {
  return createHash('sha256').update(`${provider}::${sourceId}`).digest('hex');
}

// Extracts Basecamp URLs and bare recording IDs referenced in free text
// (email bodies). Basecamp URLs take the shape
// https://3.basecamp.com/<account>/buckets/<project>/<type>/<id> or the API
// host https://3.basecampapi.com/... — both recognized. A bare numeric
// recording id pattern is NOT extracted on its own (too many false
// positives against phone numbers / dates); only full URLs count as an
// "exact_basecamp_url"/"exact_basecamp_recording_id" strong signal.
const BASECAMP_URL_RE = /https?:\/\/(?:3\.basecamp\.com|3\.basecampapi\.com)\/(\d+)\/buckets\/(\d+)\/([a-z_]+)\/(\d+)[^\s"'<>)]*/gi;

export interface BasecampReference {
  url: string;
  accountId: string;
  projectId: string;
  recordingType: string;
  recordingId: string;
}

export function extractBasecampReferences(text: string | null | undefined): BasecampReference[] {
  if (!text) return [];
  const found: BasecampReference[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  BASECAMP_URL_RE.lastIndex = 0;
  while ((m = BASECAMP_URL_RE.exec(text)) !== null) {
    const url = m[0];
    if (!seen.has(url)) {
      seen.add(url);
      found.push({ url, accountId: m[1], projectId: m[2], recordingType: m[3], recordingId: m[4] });
    }
  }
  return found;
}

// Simple bag-of-words overlap used as a bounded, deterministic stand-in for
// semantic similarity (this repo has no embedding/vector infra). Returns
// 0-1. Intentionally capped low downstream (see matchScoring.ts) so it can
// never alone push a candidate past the auto-include threshold, per root
// directive section 5 ("Do not use semantic similarity as the only reason
// to include or archive an item.").
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'is', 'are', 'was', 'were',
  'this', 'that', 'with', 'as', 'at', 'by', 'from', 'it', 'be', 'we', 'you', 'i', 'your', 'our',
]);

function tokenize(text: string): Set<string> {
  return new Set(
    normalizeSubject(text)
      .split(' ')
      .filter((t) => t.length > 2 && !STOPWORDS.has(t))
  );
}

export function termOverlapScore(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
