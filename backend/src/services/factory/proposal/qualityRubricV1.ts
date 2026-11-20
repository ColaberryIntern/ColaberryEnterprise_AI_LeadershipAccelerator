/**
 * qualityRubricV1 — the OFFICIAL internal quality rubric, VERSION 1.0, as immutable versioned configuration (spec
 * "THE OFFICIAL INTERNAL QUALITY RUBRIC"). Eight weighted dimensions summing to 100; the overall score is
 * SUM(weight * dimension_score / 100) rounded to one decimal. This is the INTERNAL rubric, deliberately distinct from
 * any published agency scoring — it never claims to be the buyer's rubric or a win probability.
 *
 * Honesty rails baked into computeRubricScore:
 *   - An UNKNOWN dimension (an input we genuinely do not have — e.g. pricing not provided) scores 0 and is flagged
 *     `unknown`; it is NEVER omitted from the denominator. You cannot raise the total by not evaluating a dimension.
 *   - The overall is PROVISIONAL whenever a hard gate blocks (passed in), and a provisional score may never be
 *     presented as a final >=92. No dimension earns points for section headings or bare compliance claims.
 */

export const RUBRIC_VERSION = '1.0';
/** Bumped whenever the scoring code (not the rubric weights) changes, so a quality-run record is reproducible. */
export const CHECKER_VERSION = '2026.11.20';

export type RubricDimensionKey =
  | 'mandatory_compliance'
  | 'technical_responsiveness'
  | 'implementation_delivery'
  | 'evidence_past_performance'
  | 'pricing_commercial'
  | 'buyer_differentiation'
  | 'risk_security_support'
  | 'presentation_clarity';

export interface RubricDimension {
  key: RubricDimensionKey;
  label: string;
  weight: number;
  /** What a 90-100 answer requires, verbatim from the spec rubric (for the report + evaluator prompts). */
  excellent: string;
}

export const RUBRIC_V1: readonly RubricDimension[] = [
  { key: 'mandatory_compliance', label: 'Mandatory submission compliance', weight: 20, excellent: 'All forms, signatures, instructions, amendments, references, pricing files, page/file constraints and dates validated; none unknown.' },
  { key: 'technical_responsiveness', label: 'Technical responsiveness', weight: 20, excellent: 'Every substantive requirement answered with an actual method, mapping, workflow and verifiable support; zero significant contradictions.' },
  { key: 'implementation_delivery', label: 'Implementation & delivery', weight: 15, excellent: 'Specific timeline, roles, milestones, integration/migration plan, training, testing, acceptance and realistic dependencies.' },
  { key: 'evidence_past_performance', label: 'Evidence & past performance', weight: 15, excellent: 'Appropriate approved government references, demonstrable product proof and verifiable claims mapped to requirements.' },
  { key: 'pricing_commercial', label: 'Pricing & commercial completeness', weight: 10, excellent: 'Real authorized pricing, assumptions, totals, workbook consistency, technical/commercial alignment, risk allowances.' },
  { key: 'buyer_differentiation', label: 'Buyer differentiation', weight: 10, excellent: 'Buyer-specific problem/benefit/proof narrative, competitive distinctions where supported; little generic boilerplate.' },
  { key: 'risk_security_support', label: 'Risk, security & support', weight: 5, excellent: 'Applicable safeguards, security/data-handling commitments, support SLAs, operational and implementation risks, owners.' },
  { key: 'presentation_clarity', label: 'Presentation & clarity', weight: 5, excellent: 'Correct format, coherent ordering, skimmable visuals, tables, diagrams, clean writing, navigation and readable PDFs.' },
] as const;

/** The gate target: >=92 AND all hard gates pass. */
export const RUBRIC_TARGET = 92;

export type Confidence = 'low' | 'medium' | 'high';

export interface DimensionEvidence {
  /** 0-100, or null when the dimension could not be assessed from available evidence. */
  score: number | null;
  confidence: Confidence;
  /** True when the input needed is genuinely absent (scores 0, flagged, never silently omitted). */
  unknown?: boolean;
  /** Source-linked citations backing the score (document/section/quote), for the report. */
  citations?: string[];
}

export interface ScoredDimension extends RubricDimension {
  score: number;
  confidence: Confidence;
  unknown: boolean;
  citations: string[];
  /** This dimension's contribution to the weighted total (weight * score / 100). */
  weighted: number;
}

export interface RubricScore {
  rubricVersion: string;
  checkerVersion: string;
  dimensions: ScoredDimension[];
  /** SUM(weight * score / 100), one decimal. */
  weightedScore: number;
  /** True while any hard gate blocks — the score may NOT be presented as a final >=92. */
  provisional: boolean;
  /** Clears the numeric bar AND is not provisional. */
  meetsTarget: boolean;
}

const clamp100 = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

/**
 * PURE: compute the rubric score from per-dimension evidence + whether a hard gate is blocking. Missing/unknown
 * dimensions score 0 (never dropped). `provisional` is forced true whenever a hard gate blocks.
 */
export function computeRubricScore(
  evidence: Partial<Record<RubricDimensionKey, DimensionEvidence>>,
  opts: { provisional: boolean },
): RubricScore {
  const dimensions: ScoredDimension[] = RUBRIC_V1.map((d) => {
    const ev = evidence[d.key];
    const unknown = !ev || ev.unknown === true || ev.score == null;
    const score = unknown ? 0 : clamp100(ev!.score as number);
    const weighted = Math.round((d.weight * score) / 100 * 100) / 100;
    return { ...d, score, confidence: ev?.confidence ?? 'low', unknown, citations: ev?.citations ?? [], weighted };
  });
  const weightedScore = Math.round(dimensions.reduce((a, d) => a + (d.weight * d.score) / 100, 0) * 10) / 10;
  const provisional = opts.provisional === true;
  return { rubricVersion: RUBRIC_VERSION, checkerVersion: CHECKER_VERSION, dimensions, weightedScore, provisional, meetsTarget: !provisional && weightedScore >= RUBRIC_TARGET };
}

/** The immutable, auditable record of one quality run (spec R0). Serialized alongside the proposal; no secrets. */
export interface QualityRunRecord {
  runId: string;
  rubricVersion: string;
  checkerVersion: string;
  modelId: string;
  sourceBundleHash: string | null;
  proposalVersionIds: string[];
  score: RubricScore;
  blockers: string[];
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  costUsd?: number | null;
  judgeRunIds?: string[];
}

/** Guard: the rubric weights MUST sum to 100 (enforced by test; exported for an assertion at startup if wanted). */
export function rubricWeightTotal(): number {
  return RUBRIC_V1.reduce((a, d) => a + d.weight, 0);
}
