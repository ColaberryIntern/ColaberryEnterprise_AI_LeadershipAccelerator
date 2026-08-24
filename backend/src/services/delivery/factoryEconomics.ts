/**
 * factoryEconomics — what a delivery costs, and the one internal ratio. PURE, no I/O.
 *
 * Master plan §Gate 12 asks for six measures and one derived metric:
 *
 *   > Support internal metric: `verified throughput / human judgment effort`
 *   > **Do not market externally until methodology is validated.**
 *
 * ## Why the validation state lives in code
 *
 * "Do not market externally until validated" is a sentence in a plan. Plans are read once.
 * The ratio, once it exists and produces a flattering number, will be put on a slide by
 * someone who never read the plan — that is not cynicism, it is how every internal metric
 * escapes.
 *
 * So the validation state is a **value this module exports**, every computed ratio carries
 * it, and `assertPublishable` refuses to clear it while it is `unvalidated`. A number that
 * cannot be separated from its own caveat is much harder to misquote than a number with a
 * caveat in a document somewhere.
 *
 * ## Why the denominator is judgment, not time
 *
 * `human_judgment_effort` counts the decisions a person had to make and review, not the
 * hours they were present. A time denominator would make the ratio improve when people
 * work faster, which measures pace. A judgment denominator makes it improve when the
 * system needs fewer human decisions per unit of verified output — which is the actual
 * claim being tested, and is also the version that does not reward overwork.
 */

/** The six measures from master plan §Gate 12. */
export type EconomicMeasure =
  | 'execution_cost'
  | 'human_review_effort'
  | 'elapsed_delivery_time'
  | 'rework'
  | 'verified_throughput'
  | 'acceptance';

export const ECONOMIC_MEASURES: readonly EconomicMeasure[] = [
  'execution_cost',
  'human_review_effort',
  'elapsed_delivery_time',
  'rework',
  'verified_throughput',
  'acceptance',
];

export const MEASURE_MEANING: Record<EconomicMeasure, string> = {
  execution_cost: 'What the machine side of delivery cost, in currency.',
  human_review_effort: 'Human decisions made and reviewed — count, not hours.',
  elapsed_delivery_time: 'Wall-clock time from contract to acceptance.',
  rework: 'Work returned after review.',
  verified_throughput: 'Stories that passed their quality gate and were accepted.',
  acceptance: 'Client acceptances obtained, including accepted-with-exceptions.',
};

/**
 * Whether the methodology behind the internal ratio has been validated.
 *
 * **This is `unvalidated` and must stay that way until a real delivery has run.** Changing
 * it is a deliberate act with a code review attached, which is the point.
 */
export type MetricValidationState = 'unvalidated' | 'internally_validated';

export const THROUGHPUT_RATIO_VALIDATION: MetricValidationState = 'unvalidated';

export interface EconomicInputs {
  /** Stories that passed their quality gate AND were accepted. */
  verifiedThroughput: number;
  /**
   * Count of human judgment acts: decisions made, reviews performed, approvals given.
   * Deliberately NOT hours. See the module header.
   */
  humanJudgmentEffort: number;
  executionCostCents?: number;
  elapsedDeliveryHours?: number;
  reworkCount?: number;
  acceptanceCount?: number;
}

export interface ThroughputRatio {
  /** verified throughput / human judgment effort. Null when the denominator is zero. */
  value: number | null;
  validation: MetricValidationState;
  /** Travels with the number so it cannot be quoted alone. */
  caveat: string;
  /** True only when there is enough data for the ratio to mean anything. */
  interpretable: boolean;
}

/** Below this many verified stories the ratio is arithmetic, not evidence. */
export const MIN_THROUGHPUT_FOR_INTERPRETATION = 10;

const CAVEAT =
  'Internal, unvalidated. This ratio has not been checked against a completed delivery ' +
  'and must not be used externally or in marketing (master plan §Gate 12).';

/**
 * Compute the internal ratio.
 *
 * Returns `null` rather than `0` or `Infinity` when the denominator is zero. Zero human
 * judgment effort does not mean infinite efficiency, it means nobody has reviewed
 * anything yet — and `Infinity` rendered on a dashboard is exactly the kind of number that
 * gets screenshotted.
 */
export function computeThroughputRatio(inputs: EconomicInputs): ThroughputRatio {
  const { verifiedThroughput, humanJudgmentEffort } = inputs;

  const value =
    humanJudgmentEffort > 0 ? verifiedThroughput / humanJudgmentEffort : null;

  return {
    value,
    validation: THROUGHPUT_RATIO_VALIDATION,
    caveat: CAVEAT,
    interpretable:
      value !== null && verifiedThroughput >= MIN_THROUGHPUT_FOR_INTERPRETATION,
  };
}

export interface PublicationRefusal {
  rule: string;
  detail: string;
}

export type PublicationAudience = 'internal' | 'client' | 'external';

/**
 * Refuse to publish an unvalidated metric outside the team.
 *
 * Client and external audiences are both blocked while the methodology is unvalidated. A
 * client is not "internal" — a number shown to a client becomes a claim about what they
 * are buying, and an unvalidated efficiency ratio is not a claim we can support.
 */
export function assertPublishable(
  ratio: ThroughputRatio,
  audience: PublicationAudience,
): PublicationRefusal[] {
  const refusals: PublicationRefusal[] = [];

  if (audience === 'internal') return refusals;

  if (ratio.validation === 'unvalidated') {
    refusals.push({
      rule: 'methodology_unvalidated',
      detail:
        `Cannot publish the throughput ratio to a '${audience}' audience while the ` +
        'methodology is unvalidated (master plan §Gate 12).',
    });
  }

  if (!ratio.interpretable) {
    refusals.push({
      rule: 'insufficient_data',
      detail:
        `The ratio needs at least ${MIN_THROUGHPUT_FOR_INTERPRETATION} verified stories ` +
        'before it is evidence rather than arithmetic.',
    });
  }

  return refusals;
}

export interface EconomicsReport {
  measures: Partial<Record<EconomicMeasure, number>>;
  ratio: ThroughputRatio;
  /** Reworked share of verified throughput. Null when nothing has been verified. */
  reworkRate: number | null;
}

/**
 * Assemble the economics for one project or portfolio.
 *
 * Every field is optional on the way in and omitted on the way out when absent — an
 * absent measure must not render as `0`, because zero cost and unmeasured cost are
 * different facts and a dashboard cannot tell them apart once they look the same.
 */
export function buildEconomicsReport(inputs: EconomicInputs): EconomicsReport {
  const measures: Partial<Record<EconomicMeasure, number>> = {
    verified_throughput: inputs.verifiedThroughput,
    human_review_effort: inputs.humanJudgmentEffort,
  };

  if (inputs.executionCostCents !== undefined) {
    measures.execution_cost = inputs.executionCostCents;
  }
  if (inputs.elapsedDeliveryHours !== undefined) {
    measures.elapsed_delivery_time = inputs.elapsedDeliveryHours;
  }
  if (inputs.reworkCount !== undefined) measures.rework = inputs.reworkCount;
  if (inputs.acceptanceCount !== undefined) measures.acceptance = inputs.acceptanceCount;

  const reworkRate =
    inputs.reworkCount !== undefined && inputs.verifiedThroughput > 0
      ? inputs.reworkCount / inputs.verifiedThroughput
      : null;

  return { measures, ratio: computeThroughputRatio(inputs), reworkRate };
}
