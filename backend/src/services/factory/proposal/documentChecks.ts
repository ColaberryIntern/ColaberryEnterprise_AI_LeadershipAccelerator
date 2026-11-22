/**
 * documentChecks — the DETERMINISTIC half of the Proposal Studio six-check scorer (P3), plus the pure pass rule.
 * These three checks and `passes` are pure functions (no I/O, no LLM) so they are directly unit-testable:
 *   - coverage: every mapped requirement is cited by a section anchor (build-track requirements are NOT in the
 *     denominator — they are not submittals, so they can't be "uncovered"; hazard 3.2).
 *   - format: the real PDF page count is within the blueprint's page limit (over = FATAL), a file name is set.
 *   - fact: no open/filler gap and no unresolved [PLACEHOLDER: …] marker.
 * The AI checks (evaluator/proof/clarity) live in documentChecksAI.ts and are merged by runDocumentChecks.
 *
 * FATAL set (blocks export whatever the score): over page limit, a price leak (a currency amount in a non-pricing
 * document — reuses submissionPackage.containsCurrencyAmount), a missing required form, a missing required signature.
 */
import { containsCurrencyAmount } from './submissionPackage';
import { weightedTotal, CHECK_FLOOR, PASS_THRESHOLD } from './proposalReviewConfig';
import type { CheckKey, CheckScores, CheckFinding, CheckRunResult } from './proposalReviewTypes';

export interface DocumentCheckInput {
  /** The whole document content (for marker + price-leak + heading scans). */
  contentHtml: string | null;
  /** The document's sections: sectionKey (= requirement canonical id) + authored content. */
  sections: Array<{ sectionKey: string; contentHtml?: string }>;
  /** The canonical requirement ids this document must cover (already excludes scope/build — see deriveProposalDocuments). */
  requirementIds: string[];
  /** Build-track (scope) requirement ids to EXCLUDE from the coverage denominator even if passed in (hazard 3.2). */
  buildRequirementIds?: string[];
  /** Open/filler gaps on the document (from gov_proposal_document_gaps). */
  gaps?: Array<{ resolution: 'open' | 'answered' | 'filler' }>;
  /** Section L page limit from the blueprint (null = none). */
  pageLimit?: number | null;
  /** The blueprint-dictated file name (null = none set yet). */
  fileName?: string | null;
  /** The REAL page count from renderProposalPdf (null = not rendered). */
  pageCount?: number | null;
  /** True when this is the pricing document (a currency amount is expected, not a leak). */
  isPricingDoc?: boolean;
  /** Required forms the blueprint names that are NOT yet present/attached. */
  missingRequiredForms?: string[];
  /** Required signatures that are not yet on file. */
  missingRequiredSignatures?: string[];
}

const hasAnchor = (contentHtml: string | null, id: string): boolean =>
  typeof contentHtml === 'string' && contentHtml.includes(`data-req="${id}"`);

/** Strip tags to plain text for the substance heuristics. Pure. */
const plain = (html: string | null | undefined): string =>
  String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();

/** The minimum informative length (plain-text chars) an answer must have before it can count as substantive. A
 *  one-line "we comply" is well under this; a real method answer runs far past it. */
export const MIN_SUBSTANTIVE_CHARS = 160;

/** Pure boilerplate detector: compliance filler that asserts conformance without saying HOW. Used only to LABEL a
 *  non-substantive answer precisely in the finding; the substance test itself is length + concreteness below. */
const BOILERPLATE_RE = /\b(we\s+(will\s+)?comply|in\s+(full\s+)?compliance|fully\s+compliant|the\s+(firm|company|team|proposer|offeror)\s+(understands|acknowledges|will\s+comply)|we\s+(understand|acknowledge|confirm|affirm|attest)|as\s+(required|requested|specified|stated)|meets?\s+(all\s+)?(the\s+)?requirements?|noted\s+and\s+understood|will\s+be\s+provided\s+as\s+required)\b/i;
export function isBoilerplateAnswer(html: string | null | undefined): boolean {
  const t = plain(html);
  return t !== '' && BOILERPLATE_RE.test(t) && !hasConcreteDetail(t);
}

/** Concreteness signal: a substantive government-proposal answer names specifics — numbers, dates, or concrete
 *  method/technology/deliverable nouns — rather than restating the requirement and asserting conformance. Pure. */
const SPECIFIC_RE = /\b(API|SLA|GIS|SSO|RBAC|ETL|CMMS|WOMS|UUID|JSON|SOC\s*2|ISO|FedRAMP|integration|interface|migration|workflow|architecture|schema|endpoint|database|dashboard|encryption|backup|disaster\s+recovery|role|milestone|sprint|phase|week|day|month|timeline|acceptance\s+test|training|ticket|work\s+order|asset|permit|inspection|audit|uptime|response\s+time|deliverable|resume|reference|warranty|support\s+tier)\b/i;
function hasConcreteDetail(plainText: string): boolean {
  return /\d/.test(plainText) || SPECIFIC_RE.test(plainText);
}

/** PURE: is this requirement purely a SUBMISSION INSTRUCTION — it governs only HOW/WHEN/WHERE/FORMAT the proposal is
 *  submitted (email vs portal, copies, file type, page/font limits, deadlines, labeling) rather than any technical or
 *  functional capability? Such a requirement belongs in the compliance matrix; a technical response must NOT draft a
 *  method/workflow/acceptance-test for it (the independent-review failure: submission instructions written up as
 *  technical strategy). A requirement that mentions a submission mechanic BUT also names a technical capability is NOT
 *  classified here as submission-only. */
const SUBMISSION_RE = /\b(submit|submission|submittal|shall be submitted|electronic\s+copy|pdf\s+copy|number of copies|one \(1\) (electronic|pdf|hard)|hard cop(y|ies)|email to|deliver(ed)? to|no later than|due (date|by)|deadline|page limit|page count|font size|margin|cover letter|table of contents|sealed|envelope|label(ed|ing)|file naming|portal|bonfire|upload)\b/i;
const TECH_CAPABILITY_RE = /\b(GIS|ArcGIS|work order|integration|interface|API|SCADA|offline|SWPPP|stormwater|asset|permit|inspection|dashboard|report|workflow|migration|SSO|RBAC|mobile|field|sync|schema|database|preventive|preventative|maintenance|SLA|uptime|security|encryption|audit\s+trail|role)\b/i;
export function isSubmissionInstructionRequirement(statement: string | null | undefined): boolean {
  const t = plain(statement);
  if (!t) return false;
  return SUBMISSION_RE.test(t) && !TECH_CAPABILITY_RE.test(t);
}

/** PURE: is this requirement a NON-TECHNICAL administrative clause the proposer does not answer with solution content —
 *  the buyer's own EVALUATION process (a review panel, how proposals are scored/ranked), a PROCUREMENT/CONTRACTUAL
 *  mechanic (entering a written agreement, negotiation, right to reject), or a residual SUBMISSION rule the narrower
 *  submission-instruction test misses ("no late response / modification will be accepted", "no facsimile")? These
 *  describe what the CITY does, not what the solution does, so they must not consume technical-response space or count
 *  toward technical coverage (R2 export: REQ-013/014/015 review-panel scoring appeared as technical answers). The
 *  PROPOSER_SOLUTION guard keeps a genuine proposer-facing narrative ask (REQ-010 "Describe ... the Proposer's
 *  understanding of the project") in the technical response. NOT a submission-mechanics test — that is above. */
const EVALUATION_RE = /\b(review\s+panel|evaluation\s+(?:committee|panel|team|factors?|criteri)|will\s+be\s+(?:reviewed|evaluated|scored|ranked)|average\s+of\s+all\s+(?:reviews|scores)|final\s+score|scoring\s+(?:method|criteri)|points?\s+(?:will\s+be|awarded|possible)|best\s+value)\b/i;
const PROCUREMENT_RE = /\b(written\s+agreement|enter\s+into\s+(?:a|an)\s+(?:contract|agreement)|negotiat|city\s+(?:manager|attorney)|successful\s+proposer\s+will\s+be\s+required|no\s+guaranty|right\s+to\s+(?:reject|accept|waive)|sole\s+(?:discretion|and\s+absolute))\b/i;
const RESIDUAL_SUBMISSION_RE = /\b(no\s+late|will\s+not\s+be\s+accepted|facsimile|telegraphic|modification,?\s+or\s+amendment|clarification\s+or\s+additional\s+information)\b/i;
// Proposal packaging/format rules (which pieces to include, how to order and sign them) — the proposer follows them
// but does not answer them with solution content.
const FORMAT_RE = /\b(introductory\s+letter|following\s+elements|signed\s+by\s+an\s+authorized|organize[d]?\s+(?:their|the)?\s*proposals?\s+into|proposal\s+format|distinct\s+sections|(?:letter\s+)?(?:should\s+be\s+)?addressed\s+to)\b/i;
const PROPOSER_SOLUTION_RE = /\b(describ|the\s+system\s+(?:shall|must|will|should)|our\s+(?:solution|approach|platform)|understanding\s+of\s+the\s+(?:proposed\s+)?project|approach\s+to|methodolog|workflow|architecture|propos(?:ed|al)\s+solution|technical\s+approach)\b/i;
export function isNonTechnicalAdministrativeRequirement(statement: string | null | undefined): boolean {
  const t = plain(statement);
  if (!t) return false;
  if (PROPOSER_SOLUTION_RE.test(t)) return false; // a genuine solution/narrative ask stays in the technical response
  return EVALUATION_RE.test(t) || PROCUREMENT_RE.test(t) || RESIDUAL_SUBMISSION_RE.test(t) || FORMAT_RE.test(t);
}

/** PURE: is this section a SUBSTANTIVE answer (not just present / not just boilerplate)? A requirement is only
 *  "covered" when its answer clears a minimum informative length AND names something concrete. This is the fix for
 *  the headline defect: a bare `data-req` anchor, any-nonempty-text, or a generic "we comply" no longer counts. */
export function isSubstantiveAnswer(html: string | null | undefined): boolean {
  const t = plain(html);
  return t.length >= MIN_SUBSTANTIVE_CHARS && hasConcreteDetail(t);
}

/** Coverage (SUBSTANTIVE): the fraction of the document's requirements that have a real, concrete answer — not a
 *  label, not an anchor, not boilerplate. Build-track requirements are removed from the denominator. Pure.
 *  The OLD structural notion survives as `checkLocationCoverage` so the two are reported separately (R2). */
export function checkCoverage(input: DocumentCheckInput): { score: number; findings: CheckFinding[] } {
  const exclude = new Set(input.buildRequirementIds ?? []);
  const denom = (input.requirementIds ?? []).filter((id) => !exclude.has(id));
  const sectionById = new Map((input.sections ?? []).map((s) => [s.sectionKey, s]));
  const findings: CheckFinding[] = [];
  if (denom.length === 0) return { score: 100, findings };
  let covered = 0;
  for (const id of denom) {
    const s = sectionById.get(id);
    const html = s?.contentHtml;
    const present = (typeof html === 'string' && html.trim() !== '') || hasAnchor(input.contentHtml, id);
    if (isSubstantiveAnswer(html)) { covered += 1; continue; }
    if (present) findings.push({ check: 'coverage', severity: 'major', message: `Requirement ${id} is addressed but the answer is ${isBoilerplateAnswer(html) ? 'generic compliance boilerplate' : 'too thin'} — it needs a concrete, specific response.`, sectionKey: id });
    else findings.push({ check: 'coverage', severity: 'major', message: `Requirement ${id} is not yet answered in a section.`, sectionKey: id });
  }
  return { score: Math.round((covered / denom.length) * 100), findings };
}

/** Location coverage (STRUCTURAL): the OLD rule — a requirement is "located" if its section has any nonempty text
 *  or a `data-req` anchor exists. Preserved as an INDEPENDENT signal (R2): it says WHERE a requirement is addressed,
 *  never that it is substantively satisfied. Reported alongside coverage, not inside the weighted pass score. Pure. */
export function checkLocationCoverage(input: DocumentCheckInput): { score: number } {
  const exclude = new Set(input.buildRequirementIds ?? []);
  const denom = (input.requirementIds ?? []).filter((id) => !exclude.has(id));
  const sectionById = new Map((input.sections ?? []).map((s) => [s.sectionKey, s]));
  if (denom.length === 0) return { score: 100 };
  let located = 0;
  for (const id of denom) {
    const s = sectionById.get(id);
    if ((s && typeof s.contentHtml === 'string' && s.contentHtml.trim() !== '') || hasAnchor(input.contentHtml, id)) located += 1;
  }
  return { score: Math.round((located / denom.length) * 100) };
}

/** Format: page count within the page limit (over = FATAL), a file name is set, body has headings. Pure. */
export function checkFormat(input: DocumentCheckInput): { score: number; findings: CheckFinding[] } {
  const findings: CheckFinding[] = [];
  let score = 100;
  if (typeof input.pageLimit === 'number' && typeof input.pageCount === 'number' && input.pageCount > input.pageLimit) {
    findings.push({ check: 'format', severity: 'fatal', message: `Over the ${input.pageLimit}-page limit (rendered ${input.pageCount}).` });
    score = 40;
  }
  if (!input.fileName) { findings.push({ check: 'format', severity: 'minor', message: 'No submission file name set.' }); score -= 5; }
  if (typeof input.contentHtml === 'string' && input.contentHtml.trim() !== '' && !/<h[1-3]\b/i.test(input.contentHtml)) {
    findings.push({ check: 'format', severity: 'minor', message: 'No section headings detected.' }); score -= 5;
  }
  // Price leak: a currency amount in a NON-pricing document is a fatal non-responsive mistake.
  if (!input.isPricingDoc && containsCurrencyAmount(input.contentHtml)) {
    findings.push({ check: 'format', severity: 'fatal', message: 'A price/currency amount appears in a non-pricing document (price must stay in the sealed cost file).' });
    score = Math.min(score, 40);
  }
  // Missing required forms / signatures are fatal (nonresponsive).
  for (const f of input.missingRequiredForms ?? []) findings.push({ check: 'format', severity: 'fatal', message: `Required form not attached: ${f}.` });
  for (const s of input.missingRequiredSignatures ?? []) findings.push({ check: 'format', severity: 'fatal', message: `Required signature missing: ${s}.` });
  return { score: Math.max(0, score), findings };
}

/** Fact: no open/filler gap and no unresolved [PLACEHOLDER: …] marker. A filler gap and an unresolved marker are
 *  fatal (they can never ship); an open gap is a major finding and is also returned as the open-gap count. Pure. */
export function checkFact(input: DocumentCheckInput): { score: number; findings: CheckFinding[]; openGaps: number } {
  const findings: CheckFinding[] = [];
  const gaps = input.gaps ?? [];
  const open = gaps.filter((g) => g && g.resolution === 'open').length;
  const filler = gaps.filter((g) => g && g.resolution === 'filler').length;
  const markers = typeof input.contentHtml === 'string' ? (input.contentHtml.match(/\[PLACEHOLDER:/gi) || []).length : 0;
  if (open) findings.push({ check: 'fact', severity: 'major', message: `${open} open question(s) await an answer.` });
  if (filler) findings.push({ check: 'fact', severity: 'fatal', message: `${filler} filler placeholder(s) must be replaced before submission.` });
  if (markers) findings.push({ check: 'fact', severity: 'fatal', message: `${markers} unresolved [PLACEHOLDER] marker(s) in the content.` });
  const score = open === 0 && filler === 0 && markers === 0 ? 100 : Math.max(0, 100 - (open * 10 + filler * 40 + markers * 40));
  return { score, findings, openGaps: open + markers };
}

/**
 * PURE pass rule: a version passes ONLY when the weighted total is >= 95, every single check is >= 85, there is no
 * fatal finding, and there is no open gap. Mirrors the PROMPT defaults (weights in proposalReviewConfig).
 */
export function passes(scores: CheckScores, fatal: CheckFinding[], openGaps: number): boolean {
  const everyFloor = (Object.keys(scores) as CheckKey[]).every((k) => (scores[k] ?? 0) >= CHECK_FLOOR);
  return weightedTotal(scores) >= PASS_THRESHOLD && everyFloor && (fatal?.length ?? 0) === 0 && (openGaps ?? 0) === 0;
}

/** The AI checks' scores + findings, computed by documentChecksAI.ts and injected so runDocumentChecks stays pure. */
export interface AiCheckResults {
  scores: Pick<CheckScores, 'evaluator' | 'proof' | 'clarity'>;
  findings: CheckFinding[];
  /** v3 T11: the per-judge run records (evaluator/proof/clarity), recorded on the scored version's judge_run_ids. */
  judgeRuns?: Array<{ judge: string; runId: string; model: string; at: string }>;
  /** Fraction of the document's plain text the judges actually read (1 = whole document, no truncation). T05. */
  coverageFootprint?: number;
  /** Checks that returned UNVERIFIED (e.g. proof found zero claims): scored 0, NEVER a silent pass. T06. */
  unverified?: Array<'evaluator' | 'proof' | 'clarity'>;
}

/**
 * Combine the deterministic checks with the (injected) AI check results into the full six-check verdict. When the AI
 * results are absent (no key / not run), the three AI checks score 0 with a `not_run` finding, so the document
 * cannot pass until they run — honest, never a fabricated green. Pure given its inputs.
 */
export function runDocumentChecks(input: DocumentCheckInput, ai?: AiCheckResults | null): CheckRunResult {
  const coverage = checkCoverage(input);
  const location = checkLocationCoverage(input);
  const format = checkFormat(input);
  const fact = checkFact(input);
  const aiScores = ai?.scores ?? { evaluator: 0, proof: 0, clarity: 0 };
  const aiFindings = ai ? ai.findings : [
    { check: 'evaluator' as CheckKey, severity: 'info' as const, message: 'Evaluator check has not run yet.' },
    { check: 'proof' as CheckKey, severity: 'info' as const, message: 'Proof check has not run yet.' },
    { check: 'clarity' as CheckKey, severity: 'info' as const, message: 'Clarity check has not run yet.' },
  ];
  const scores: CheckScores = {
    coverage: coverage.score, format: format.score, fact: fact.score,
    evaluator: aiScores.evaluator ?? 0, proof: aiScores.proof ?? 0, clarity: aiScores.clarity ?? 0,
  };
  const findings = [...coverage.findings, ...format.findings, ...fact.findings, ...aiFindings];
  const fatal = findings.filter((f) => f.severity === 'fatal');
  return {
    scores, findings, fatal, passes: passes(scores, fatal, fact.openGaps), pageCount: input.pageCount ?? null,
    locationCoverage: location.score,
    coverageFootprint: ai?.coverageFootprint,
    unverifiedChecks: ai?.unverified,
  };
}
