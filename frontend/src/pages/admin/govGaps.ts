/**
 * govGaps — a PURE, deterministic classifier that SURFACES (never decides) the requirements that could keep us
 * from winning a government award, for the decoupled Qualify workspace's "gaps / potential disqualifiers" panel.
 *
 * It reads only what the page already has — the reviewer-ESTABLISHED requirements, the server's requirement
 * evaluation (its `blocking` verdicts), and the advisory service matcher result — and emits advisory GapItems.
 * It NEVER fabricates a verdict: there is no verified pass/fail here; eligibility flags are a labeled keyword
 * heuristic (established requirements carry no dedicated eligibility field), and blocking items are the server's
 * own verdict passed through verbatim. No IO; total; never throws.
 */
import type { EstablishedRequirement, ServiceMatch } from '../../services/factoryApi';

export interface RequirementEvalLike { id: string; reason?: string | null; }
export interface EvaluationLike { blocking?: RequirementEvalLike[]; }

export interface GapItem {
  id: string;
  text: string;
  kind: 'blocking' | 'eligibility_gap';
  reason: string;
  /** Plain statement of exactly what triggered the flag — never a verdict. */
  basis: string;
}
export interface GapsResult {
  items: GapItem[];
  empty: 'no_requirements' | 'none_flagged' | null;
}

const BLOCK_REASON: Record<string, string> = {
  applicability_unknown: 'Applicability unknown — must be resolved before a bid pursuit',
  not_applicable_unevidenced: 'Marked not applicable with no supporting evidence',
  submission_prerequisite_no_evidence: 'Binding submission requirement with no evidence on file',
};

/** Eligibility / qualification GATES — the kind of requirement that can disqualify a bid if we can't meet it.
 *  A conservative keyword heuristic over the requirement text/category (there is no dedicated eligibility field). */
const ELIGIBILITY_RE = /\b(eligib|qualif(?:y|ication|ied)|register(?:ed|ation)?|sam\.gov|set[- ]?aside|8\(a\)|hubzone|wosb|edwosb|sdvosb|vosb|small business|clearance|secret|ts\/sci|certified|certification|iso\s?\d{3,}|cmmi|licen[sc]e[d]?|bond(?:ing|ed)?|insurance|naics|duns|uei|cage code|past performance|references)\b/i;

const norm = (s: string | null | undefined): string => (s ?? '').toLowerCase();

/** Does any strong/moderate service match overlap this requirement's terms (so we plausibly HAVE the capability)? */
function hasCapability(reqText: string, matches: ServiceMatch[]): boolean {
  const t = norm(reqText);
  return matches.some((m) => {
    if (m.strength !== 'strong' && m.strength !== 'moderate') return false;
    const kws = Array.isArray(m.matchedKeywords) ? m.matchedKeywords : [];
    if (kws.some((k) => !!k && t.includes(norm(k)))) return true;
    const nameWords = norm(m.name).split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
    return nameWords.some((w) => t.includes(w));
  });
}

/**
 * Surface the requirements that could keep us from winning:
 *  - BLOCKING requirements from the server's evaluation (passed through verbatim); and
 *  - ELIGIBILITY/qualification requirements (heuristic) that have NO evidence attached OR NO matching capability
 *    in Our Services — gates to VERIFY OR RESOLVE before bidding.
 * ADVISORY ONLY: emits no pass/fail/"verified" verdict.
 */
export function derivePotentialDisqualifiers(
  established: EstablishedRequirement[] | null | undefined,
  evaluation: EvaluationLike | null | undefined,
  matches: ServiceMatch[] | null | undefined,
): GapsResult {
  const est = Array.isArray(established) ? established : [];
  const ms = Array.isArray(matches) ? matches : [];
  const items: GapItem[] = [];
  const seenBlocking = new Set<string>();
  const textById = new Map<string, string>();
  for (const r of est) textById.set(String(r.id), String(r.text ?? ''));

  // 1) Blocking requirements — reuse the server's evaluation verdict verbatim.
  const blocking = evaluation && Array.isArray(evaluation.blocking) ? evaluation.blocking : [];
  for (const b of blocking) {
    const id = String(b.id ?? '');
    if (seenBlocking.has(id)) continue;
    seenBlocking.add(id);
    items.push({
      id, text: textById.get(id) ?? id, kind: 'blocking',
      reason: BLOCK_REASON[String(b.reason)] ?? String(b.reason ?? 'blocks a bid pursuit'),
      basis: 'flagged blocking by the server requirement evaluation',
    });
  }

  // 2) Eligibility/qualification gates with no evidence OR no matching capability.
  for (const r of est) {
    const id = String(r.id);
    if (seenBlocking.has(id)) continue; // already surfaced as blocking
    if (!ELIGIBILITY_RE.test(`${r.text ?? ''} ${r.category ?? ''}`)) continue;
    const noEvidence = !(r.evidenceRef && r.evidenceRef.docId);
    const noCapability = !hasCapability(String(r.text ?? ''), ms);
    if (!noEvidence && !noCapability) continue; // evidenced AND a matching capability -> not flagged
    const parts: string[] = [];
    if (noEvidence) parts.push('no evidence attached');
    if (noCapability) parts.push('no matching capability in Our Services');
    items.push({
      id, text: String(r.text ?? id), kind: 'eligibility_gap',
      reason: 'Eligibility/qualification gate to verify or resolve before bidding',
      basis: parts.join('; '),
    });
  }

  let empty: GapsResult['empty'] = null;
  if (est.length === 0) empty = 'no_requirements';
  else if (items.length === 0) empty = 'none_flagged';
  return { items, empty };
}
