/**
 * INPACT™ — the six needs an agent has, from *Trust Before Intelligence* by Ram
 * Katamaraja.
 *
 * CANONICAL SOURCE: `github.com/colaberry/trust-before-intelligence-book`, read from
 * `manuscript/` at `main` (never `archive/`, which holds superseded drafts). Chapter 2 is
 * the INPACT chapter; Chapter 7 covers GOALS™.
 *
 * THE SCALES ARE THE BOOK'S, NOT OURS. Master plan §Gate 5 says "do not invent scores if
 * the book does not define them" — the book defines them precisely, so the risk was never
 * inventing a score, it was inventing a *different* one and quietly diverging from the
 * framework Colaberry sells:
 *
 *   INPACT — six dimensions, each scored **1–6**, 36-point maximum, reported on a
 *            100-point scale for executive communication.
 *   GOALS  — five dimensions, each scored **1–5** on a named maturity ladder,
 *            25-point maximum.
 *
 * STORE THE RAW DIMENSION SCORES, DERIVE THE HEADLINE. The 100-point figure is a
 * presentation concern; persisting it as the record makes the underlying assessment
 * unauditable.
 *
 * Pure and dependency-free.
 */

// ── INPACT™ ──────────────────────────────────────────────────────────────────────────

export type InpactDimension =
  | 'instant'
  | 'natural'
  | 'permitted'
  | 'adaptive'
  | 'contextual'
  | 'transparent';

export const INPACT_DIMENSIONS: readonly InpactDimension[] = [
  'instant',
  'natural',
  'permitted',
  'adaptive',
  'contextual',
  'transparent',
];

/** The book's framing for each need. Chapter 2, Part 3. */
export const INPACT_MEANINGS: Record<InpactDimension, string> = {
  instant: 'Instant — speed builds confidence',
  natural: 'Natural — understanding builds connection',
  permitted: 'Permitted — authorization builds safety',
  adaptive: 'Adaptive — learning builds reliability',
  contextual: 'Contextual — integration builds completeness',
  transparent: 'Transparent — explainability builds confidence',
};

export const INPACT_MIN_SCORE = 1;
export const INPACT_MAX_SCORE = 6;
/** Six dimensions × 6 points. */
export const INPACT_MAX_TOTAL = INPACT_DIMENSIONS.length * INPACT_MAX_SCORE;

export type InpactScores = Partial<Record<InpactDimension, number>>;

export function isValidInpactScore(score: unknown): score is number {
  return (
    typeof score === 'number' &&
    Number.isInteger(score) &&
    score >= INPACT_MIN_SCORE &&
    score <= INPACT_MAX_SCORE
  );
}

/**
 * The 100-point headline the book uses for executive communication.
 *
 * Returns null unless **every** dimension is scored. A partial assessment reported as a
 * number invites comparison with a complete one, and the book's worked example (28/100
 * rising to 86/100) is explicitly a full six-dimension assessment.
 */
export function inpactHeadlineScore(scores: InpactScores): number | null {
  const values = INPACT_DIMENSIONS.map((d) => scores[d]);
  if (!values.every(isValidInpactScore)) return null;
  const total = (values as number[]).reduce((a, b) => a + b, 0);
  return Math.round((total / INPACT_MAX_TOTAL) * 100);
}

/** Dimensions not yet scored. The honest answer to "how far through are we?". */
export function unscoredInpactDimensions(scores: InpactScores): InpactDimension[] {
  return INPACT_DIMENSIONS.filter((d) => !isValidInpactScore(scores[d]));
}

/**
 * The book's dependency order (Chapter 2, "Which Need to Fix First?").
 *
 * THIS IS A BUILD CONSTRAINT, NOT ADVICE. From the book: "Authorization cannot evaluate
 * stale data. Adaptive systems cannot learn from batch updates." A plan that schedules an
 * Adaptive capability before Instant exists is not ambitious, it is invalid.
 */
export const INPACT_PHASES: readonly (readonly InpactDimension[])[] = [
  ['instant'],
  ['natural', 'permitted'],
  ['contextual'],
  ['adaptive', 'transparent'],
];

/** 1-based build phase a dimension belongs to. */
export function inpactPhase(dimension: InpactDimension): number {
  return INPACT_PHASES.findIndex((phase) => phase.includes(dimension)) + 1;
}

export interface InpactOrderingViolation {
  dimension: InpactDimension;
  requiresFirst: InpactDimension[];
  reason: string;
}

/**
 * Check a proposed build order against the dependency phases.
 *
 * Every dimension in an earlier phase must appear before any dimension of a later one.
 * Returns violations rather than throwing, so the traceability gate can report all of
 * them at once instead of one per run.
 */
export function findInpactOrderingViolations(
  order: readonly InpactDimension[],
): InpactOrderingViolation[] {
  const violations: InpactOrderingViolation[] = [];
  const seen: InpactDimension[] = [];

  for (const dimension of order) {
    const phase = inpactPhase(dimension);
    const missing = INPACT_PHASES.slice(0, phase - 1)
      .flat()
      .filter((earlier) => !seen.includes(earlier));

    if (missing.length > 0) {
      violations.push({
        dimension,
        requiresFirst: missing,
        reason: `phase_${phase}_before_phase_${inpactPhase(missing[0])}`,
      });
    }
    seen.push(dimension);
  }

  return violations;
}

// ── The 7-Layer Architecture ─────────────────────────────────────────────────────────

/**
 * Canonical names, verified against Chapters 4–6. The master plan's shorthand is correct
 * but shorter for layers 1 and 2 — use the book's names, because "Storage" and
 * "Multi-Modal Storage" read as the same thing to us and as a discrepancy to a client
 * who has read the book.
 */
export type TrustLayer =
  | 'multi_modal_storage'
  | 'real_time_data'
  | 'semantic'
  | 'intelligence'
  | 'governance'
  | 'observability'
  | 'orchestration';

/** Index + 1 is the layer number. Layer 1 is the foundation. */
export const TRUST_LAYERS: readonly TrustLayer[] = [
  'multi_modal_storage',
  'real_time_data',
  'semantic',
  'intelligence',
  'governance',
  'observability',
  'orchestration',
];

export const TRUST_LAYER_NAMES: Record<TrustLayer, string> = {
  multi_modal_storage: 'Layer 1: Multi-Modal Storage',
  real_time_data: 'Layer 2: Real-Time Data',
  semantic: 'Layer 3: Semantic',
  intelligence: 'Layer 4: Intelligence',
  governance: 'Layer 5: Governance',
  observability: 'Layer 6: Observability',
  orchestration: 'Layer 7: Orchestration',
};

export function trustLayerNumber(layer: TrustLayer): number {
  return TRUST_LAYERS.indexOf(layer) + 1;
}

// ── GOALS™ ───────────────────────────────────────────────────────────────────────────

export type GoalsDimension =
  | 'governance'
  | 'observability'
  | 'availability'
  | 'lexicon'
  | 'solid';

export const GOALS_DIMENSIONS: readonly GoalsDimension[] = [
  'governance',
  'observability',
  'availability',
  'lexicon',
  'solid',
];

/** Chapter 7, Table 1. */
export const GOALS_MEANINGS: Record<GoalsDimension, string> = {
  governance: 'Governance: Security, Compliance & Control',
  observability: 'Observability: Monitoring, Cost & Maintainability',
  availability: 'Availability: Speed, Freshness & Scale',
  lexicon: 'Lexicon: Semantic Understanding & Accuracy',
  solid: 'Solid: Data Quality & Integrity',
};

export const GOALS_MIN_SCORE = 1;
export const GOALS_MAX_SCORE = 5;
export const GOALS_MAX_TOTAL = GOALS_DIMENSIONS.length * GOALS_MAX_SCORE;

/** The book's maturity ladder. "Operational excellence isn't binary." */
export const GOALS_MATURITY: Record<number, string> = {
  1: 'Absent — no formal capability',
  2: 'Basic — minimal implementation, reactive',
  3: 'Developing — structured but incomplete',
  4: 'Proficient — comprehensive, mostly automated',
  5: 'Advanced — full automation with continuous improvement',
};

export type GoalsScores = Partial<Record<GoalsDimension, number>>;

export function isValidGoalsScore(score: unknown): score is number {
  return (
    typeof score === 'number' &&
    Number.isInteger(score) &&
    score >= GOALS_MIN_SCORE &&
    score <= GOALS_MAX_SCORE
  );
}

/**
 * GOALS total out of 25.
 *
 * Deliberately NOT an average. From the book: "These aren't five independent dimensions —
 * they're interconnected like vital organs. Weakness in one cascades to the others." An
 * average hides exactly the single-dimension collapse the framework exists to catch,
 * which is why `goalsGateFailures()` below gates per dimension and this total is for
 * display only.
 */
export function goalsTotal(scores: GoalsScores): number | null {
  const values = GOALS_DIMENSIONS.map((d) => scores[d]);
  if (!values.every(isValidGoalsScore)) return null;
  return (values as number[]).reduce((a, b) => a + b, 0);
}

export interface GoalsThreshold {
  /** Minimum score required in every dimension. */
  minimumAll: number;
  /** Higher minimums for specific dimensions, e.g. Governance for clinical AI. */
  overrides?: Partial<Record<GoalsDimension, number>>;
}

export interface GoalsGateFailure {
  dimension: GoalsDimension;
  required: number;
  actual: number | null;
}

/**
 * Which dimensions fall below a threshold — the per-dimension gate a DeliveryProfile
 * applies (Gate 13).
 *
 * The book ties these to regulation: healthcare clinical AI requires 4/5 minimum in all
 * dimensions and 5/5 in Governance, citing the EU AI Act (Regulation 2024/1689,
 * Articles 9–15) and NIST's AI Risk Management Framework. Meeting a threshold is NOT a
 * compliance certification and must never be presented as one (master plan §Gate 13:
 * "do not claim universal compliance").
 *
 * An unscored dimension is a failure, not a pass. `not scored` is not `meets the bar`.
 */
export function goalsGateFailures(
  scores: GoalsScores,
  threshold: GoalsThreshold,
): GoalsGateFailure[] {
  return GOALS_DIMENSIONS.map((dimension) => {
    const required = threshold.overrides?.[dimension] ?? threshold.minimumAll;
    const raw = scores[dimension];
    const actual = isValidGoalsScore(raw) ? raw : null;
    return { dimension, required, actual };
  }).filter((f) => f.actual === null || f.actual < f.required);
}
