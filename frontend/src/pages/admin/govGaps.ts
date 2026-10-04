/**
 * govGaps — a PURE, deterministic classifier that SURFACES (never decides) the requirements that could keep us
 * from winning a government award, for the decoupled Qualify workspace's "gaps / potential disqualifiers" panel.
 *
 * It reads only what the page already has — the reviewer-ESTABLISHED requirements, the server's requirement
 * evaluation (its `blocking` verdicts), and the advisory service matcher result — and emits advisory GapItems.
 * It NEVER fabricates a verdict: there is no verified pass/fail here; eligibility flags are a labeled keyword
 * heuristic (established requirements carry no dedicated eligibility field). No IO; total; never throws.
 *
 * This is a FOCUSED disqualifier lens, NOT a second copy of the requirements checklist. It surfaces only the
 * ELIGIBILITY/qualification GATES (the requirements that can disqualify a bid if we can't meet them). It does
 * NOT re-list the server's full blocking set — "Requirements by due stage" already shows every requirement and
 * its blocking state, so echoing them here showed the whole list twice. The server's blocking verdict is used
 * only to ANNOTATE an eligibility gate (and to surface an eligibility gate the server blocks for a non-evidence
 * reason), never to pull non-eligibility requirements into this panel.
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
 * Surface ONLY the ELIGIBILITY/qualification gates that could disqualify a bid — the requirements that
 * can keep us from winning if we can't meet them. A requirement is flagged when it reads as an eligibility
 * gate (heuristic over text/category) AND one of: it has NO evidence attached, OR NO matching capability in
 * Our Services, OR the server already blocks on it. The server's blocking set is used only to annotate these
 * gates (and to catch an eligibility gate blocked for a non-evidence reason), never to re-list the full
 * requirements checklist — that lives in "Requirements by due stage". ADVISORY ONLY: no pass/fail verdict.
 */
export function derivePotentialDisqualifiers(
  established: EstablishedRequirement[] | null | undefined,
  evaluation: EvaluationLike | null | undefined,
  matches: ServiceMatch[] | null | undefined,
): GapsResult {
  const est = Array.isArray(established) ? established : [];
  const ms = Array.isArray(matches) ? matches : [];
  const items: GapItem[] = [];

  // The server's blocking verdicts — used only to ANNOTATE eligibility gates (never to pull the full
  // requirements set into this panel; that duplicated "Requirements by due stage" line for line).
  const blockingReasonById = new Map<string, string>();
  const blocking = evaluation && Array.isArray(evaluation.blocking) ? evaluation.blocking : [];
  for (const b of blocking) blockingReasonById.set(String(b.id ?? ''), String(b.reason ?? ''));

  for (const r of est) {
    const id = String(r.id);
    if (!ELIGIBILITY_RE.test(`${r.text ?? ''} ${r.category ?? ''}`)) continue; // eligibility/qualification gates only
    const noEvidence = !(r.evidenceRef && r.evidenceRef.docId);
    const noCapability = !hasCapability(String(r.text ?? ''), ms);
    const isBlocking = blockingReasonById.has(id);
    if (!noEvidence && !noCapability && !isBlocking) continue; // evidenced, capable, and not blocking -> not a gap
    const parts: string[] = [];
    if (noEvidence) parts.push('no evidence attached');
    if (noCapability) parts.push('no matching capability in Our Services');
    if (isBlocking) parts.push(BLOCK_REASON[blockingReasonById.get(id) as string] ?? 'flagged blocking by the requirement evaluation');
    items.push({
      id, text: String(r.text ?? id),
      kind: isBlocking ? 'blocking' : 'eligibility_gap',
      reason: 'Eligibility/qualification gate to verify or resolve before bidding',
      basis: parts.join('; '),
    });
  }

  let empty: GapsResult['empty'] = null;
  if (est.length === 0) empty = 'no_requirements';
  else if (items.length === 0) empty = 'none_flagged';
  return { items, empty };
}
