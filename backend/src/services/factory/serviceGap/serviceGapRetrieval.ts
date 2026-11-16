/**
 * serviceGapRetrieval - the deterministic half of the Gap Detector. PURE: no I/O, no clock, no model.
 *
 *   - `evidenceText`      the case study as the model will read it (and the input to its fingerprint);
 *   - `thinEvidence`      when there is too little source to judge, so the detector abstains WITHOUT calling a model
 *                         (never guess a service from a title alone);
 *   - `retrieveCandidates` broad catalog retrieval: every non-retired service is scored on token overlap and the top
 *                         MAX_CANDIDATES go to the model. Not "the six best keyword hits": with today's catalog
 *                         (~20 non-retired) the model sees most of it;
 *   - fingerprints        sha256 of the evidence text and of the catalog, which make the analysis idempotent and let
 *                         the UI say "stale" when either side has changed;
 *   - `nameSimilarity`    token Jaccard on service names, for duplicate-risk and synonym guards.
 */
import crypto from 'crypto';
import type { CaseStudyEvidence, CatalogService } from './serviceGapTypes';

export const MAX_CANDIDATES = 12;
/** Below this many characters of substantive text (summary/problem/approach/outcomes/capabilities), abstain. */
export const MIN_SUBSTANTIVE_CHARS = 160;

const STOP = new Set(('and the for with from into that this our your their are was were has have had not but via per its '
  + 'using use used based across over under than then them they who what when where which while will would can could '
  + 'services service solution solutions system systems platform data project projects program client clients '
  + 'company companies team teams work new more most also').split(' '));

/** Lowercase word tokens of 3+ letters, minus stopwords, with a naive plural strip. */
export function tokens(text: string | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const raw of String(text ?? '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOP.has(raw) || /^\d+$/.test(raw)) continue;
    out.add(raw.length > 4 && raw.endsWith('s') && !raw.endsWith('ss') ? raw.slice(0, -1) : raw);
  }
  return out;
}

const join = (xs: Array<string | null | undefined>): string => xs.filter((x) => x && x.trim()).join('\n');

/** The substantive part only (not the title): what the thin-evidence rule measures. */
function substantive(cs: CaseStudyEvidence): string {
  const a = cs.analysis;
  return join([cs.canonicalSummary, a?.summary, a?.problem, a?.approach, ...(a?.outcomes ?? []), ...(a?.capabilities ?? [])]);
}

/** The case study as the model reads it. Deterministic order, so the fingerprint is stable. */
export function evidenceText(cs: CaseStudyEvidence): string {
  const a = cs.analysis;
  return join([
    `Title: ${cs.title}`,
    `Source: ${cs.sourceKind === 'outside' ? 'outside document (claims, unverified)' : 'built inside this platform'}; status ${cs.status}`,
    cs.industry && `Industry: ${cs.industry}`,
    cs.primaryCapability && `Primary capability: ${cs.primaryCapability}`,
    cs.canonicalSummary && `Summary: ${cs.canonicalSummary}`,
    a?.summary && `Document summary: ${a.summary}`,
    a?.problem && `Problem: ${a.problem}`,
    a?.approach && `Approach: ${a.approach}`,
    a?.outcomes.length ? `Stated outcomes: ${a.outcomes.join('; ')}` : null,
    a?.capabilities.length ? `Capabilities shown: ${a.capabilities.join('; ')}` : null,
    a?.techStack.length ? `Tech named: ${a.techStack.join(', ')}` : null,
    a?.keywords.length ? `Keywords: ${a.keywords.join(', ')}` : null,
  ]);
}

/** Null when there is enough to judge; otherwise the reason code and the details that are missing. */
export function thinEvidence(cs: CaseStudyEvidence): { reasonCode: string; missing: string[] } | null {
  if (cs.sourceKind === 'outside' && !cs.analysis) {
    return { reasonCode: 'extraction_failed', missing: ['The document could not be read. Re-import it or enter the problem, approach and outcomes by hand.'] };
  }
  if (substantive(cs).replace(/\s+/g, ' ').trim().length < MIN_SUBSTANTIVE_CHARS) {
    return { reasonCode: 'thin_source', missing: ['A short description of the problem solved', 'What was delivered', 'Any stated outcome'] };
  }
  return null;
}

/** 0-100: share of the service's distinctive tokens found in the case study, boosted by whole-keyword hits. */
export function retrievalScore(caseTokens: Set<string>, caseLower: string, s: CatalogService): number {
  const svc = tokens(join([s.name, s.name, s.category, s.description, ...s.keywords]));
  if (!svc.size) return 0;
  let hit = 0;
  svc.forEach((t) => { if (caseTokens.has(t)) hit += 1; });
  const tokenShare = hit / Math.min(svc.size, 25);
  const kwHits = s.keywords.filter((k) => k.trim().length >= 3 && caseLower.includes(k.trim().toLowerCase())).length;
  return Math.min(100, Math.round(tokenShare * 70 + Math.min(kwHits, 6) * 5));
}

/** Non-retired services, strongest first, capped. Ties break on name so the order is deterministic. */
export function retrieveCandidates(cs: CaseStudyEvidence, catalog: CatalogService[], max = MAX_CANDIDATES): Array<CatalogService & { retrievalScore: number }> {
  const text = evidenceText(cs);
  const caseTokens = tokens(text);
  const lower = text.toLowerCase();
  return catalog
    .filter((s) => s.status !== 'retired')
    .map((s) => ({ ...s, retrievalScore: retrievalScore(caseTokens, lower, s) }))
    .sort((a, b) => b.retrievalScore - a.retrievalScore || a.name.localeCompare(b.name))
    .slice(0, max);
}

const sha = (s: string): string => crypto.createHash('sha256').update(s).digest('hex');

export function caseStudyFingerprint(cs: CaseStudyEvidence): string { return sha(evidenceText(cs)); }

/** Changes whenever any service's name, status, category, description or keywords change, or one is added/removed. */
export function catalogFingerprint(catalog: CatalogService[]): string {
  const rows = [...catalog].sort((a, b) => a.id.localeCompare(b.id))
    .map((s) => [s.id, s.name, s.status, s.category ?? '', s.description ?? '', [...s.keywords].sort().join(',')].join('|'));
  return sha(rows.join('\n'));
}

/** Token Jaccard of two service names, 0..1. "AI Governance & Assurance" vs "AI Assurance and Governance" = 1. */
export function nameSimilarity(a: string, b: string): number {
  const x = tokens(a); const y = tokens(b);
  if (!x.size || !y.size) return 0;
  let inter = 0;
  x.forEach((t) => { if (y.has(t)) inter += 1; });
  return inter / (x.size + y.size - inter);
}

export const normalizeName = (s: string): string => Array.from(tokens(s)).sort().join(' ');
