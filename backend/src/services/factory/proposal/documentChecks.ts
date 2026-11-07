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

/** Coverage: fraction of the document's requirements that have authored content (a section with text, or a
 *  data-req anchor in the body). Build-track requirements are removed from the denominator. Pure. */
export function checkCoverage(input: DocumentCheckInput): { score: number; findings: CheckFinding[] } {
  const exclude = new Set(input.buildRequirementIds ?? []);
  const denom = (input.requirementIds ?? []).filter((id) => !exclude.has(id));
  const sectionById = new Map((input.sections ?? []).map((s) => [s.sectionKey, s]));
  const findings: CheckFinding[] = [];
  if (denom.length === 0) return { score: 100, findings };
  let covered = 0;
  for (const id of denom) {
    const s = sectionById.get(id);
    const ok = (s && typeof s.contentHtml === 'string' && s.contentHtml.trim() !== '') || hasAnchor(input.contentHtml, id);
    if (ok) covered += 1;
    else findings.push({ check: 'coverage', severity: 'major', message: `Requirement ${id} is not yet answered in a section.`, sectionKey: id });
  }
  return { score: Math.round((covered / denom.length) * 100), findings };
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
}

/**
 * Combine the deterministic checks with the (injected) AI check results into the full six-check verdict. When the AI
 * results are absent (no key / not run), the three AI checks score 0 with a `not_run` finding, so the document
 * cannot pass until they run — honest, never a fabricated green. Pure given its inputs.
 */
export function runDocumentChecks(input: DocumentCheckInput, ai?: AiCheckResults | null): CheckRunResult {
  const coverage = checkCoverage(input);
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
  return { scores, findings, fatal, passes: passes(scores, fatal, fact.openGaps), pageCount: input.pageCount ?? null };
}
