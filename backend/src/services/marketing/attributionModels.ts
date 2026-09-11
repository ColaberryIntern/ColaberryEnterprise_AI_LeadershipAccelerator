/**
 * attributionModels — who gets credit for a lead, under three models, with the arithmetic
 * checked rather than trusted.
 *
 * THE RULE THIS FILE EXISTS FOR: credit per lead sums to exactly 1.0, and when it does not,
 * the mismatch is SURFACED, never normalised away. Normalising is the tempting fix - divide
 * everything by the sum and the chart adds up again - and it is the wrong one, because a sum
 * that is not 1.0 means the model has a bug, and rescaling hides the bug while keeping the
 * wrong answer. A chart that adds to 100% built on a model that gave 90% is a chart nobody
 * will ever question.
 *
 * HONEST BUCKETS. A lead whose every touch was direct is credited to `direct`. A lead with no
 * touch inside the attribution window is credited to `unknown`. Neither is dropped, and neither
 * is quietly folded into some other source, because dropping them would make the remaining
 * sources look responsible for leads they never touched.
 *
 * Pure. No I/O. Touchpoints come in, credits go out.
 */

export interface Touchpoint {
  /** ISO timestamp of the visit or interaction. */
  occurredAt: string;
  /** utm_source, referrer domain, or the literal 'direct'. */
  source: string;
  medium?: string | null;
  campaign?: string | null;
  isDirect: boolean;
}

export type AttributionModel = 'first_touch' | 'last_non_direct' | 'linear';

export const ATTRIBUTION_MODELS: readonly AttributionModel[] = ['first_touch', 'last_non_direct', 'linear'];

export const DIRECT = 'direct';
export const UNKNOWN = 'unknown';

/** Anything further from 1.0 than this is a real mismatch, not float noise. */
export const CREDIT_TOLERANCE = 1e-6;

export interface LeadCredit {
  leadId: string;
  model: AttributionModel | 'custom';
  /** source -> share. Exactly what the model produced - never rescaled. */
  credits: Record<string, number>;
  sum: number;
  /** Set when the credits do not sum to 1 within tolerance. The credits above are left as-is. */
  warning: string | null;
  /** Touchpoints that were inside the window and therefore eligible. */
  eligibleTouchpoints: number;
}

/**
 * A model is a function from eligible touchpoints to a credit map. The three built-ins are
 * below; a caller may also pass its own, which is how the sum-check is proven to fire (a
 * deliberately broken model in the tests) rather than merely asserted.
 */
export type CreditFn = (touchpoints: Touchpoint[]) => Record<string, number>;

function keyOf(tp: Touchpoint): string {
  return tp.isDirect ? DIRECT : tp.source || UNKNOWN;
}

const firstTouch: CreditFn = (tps) => ({ [keyOf(tps[0])]: 1 });

const lastNonDirect: CreditFn = (tps) => {
  // Walk back from the most recent. A lead who only ever arrived directly is credited to
  // DIRECT - an honest bucket - rather than to the last thing that happened to be non-direct
  // outside the window, or to nothing.
  for (let i = tps.length - 1; i >= 0; i -= 1) {
    if (!tps[i].isDirect) return { [keyOf(tps[i])]: 1 };
  }
  return { [DIRECT]: 1 };
};

const linear: CreditFn = (tps) => {
  const share = 1 / tps.length;
  const out: Record<string, number> = {};
  for (const tp of tps) {
    const k = keyOf(tp);
    out[k] = (out[k] ?? 0) + share;
  }
  return out;
};

const BUILT_IN: Record<AttributionModel, CreditFn> = {
  first_touch: firstTouch,
  last_non_direct: lastNonDirect,
  linear,
};

/**
 * Does this credit map add to 1?
 *
 * Exported and tested on its own, because it is the guard the whole file rests on. Returns the
 * warning text or null; it never touches the credits.
 */
export function checkCreditSum(credits: Record<string, number>): { sum: number; warning: string | null } {
  const sum = Object.values(credits).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > CREDIT_TOLERANCE) {
    return {
      sum,
      warning:
        `Credit sums to ${sum.toFixed(4)}, not 1.0. This is a model defect and has NOT been ` +
        'normalised away - the shares shown are exactly what the model produced.',
    };
  }
  return { sum, warning: null };
}

/**
 * Attribute one lead.
 *
 * `conversionAt` anchors the window: only touchpoints within `windowDays` BEFORE it are
 * eligible, so a visit from a year ago does not claim credit for a lead who converted last
 * week. Eligible touchpoints are ordered oldest-first before the model sees them, so
 * first/last mean what they say regardless of input order.
 */
export function attributeLead(
  leadId: string,
  touchpoints: readonly Touchpoint[],
  model: AttributionModel | CreditFn,
  windowDays: number,
  conversionAt: string,
): LeadCredit {
  const end = Date.parse(conversionAt);
  const start = end - windowDays * 86_400_000;

  const eligible = touchpoints
    .filter((tp) => {
      const t = Date.parse(tp.occurredAt);
      return !Number.isNaN(t) && t >= start && t <= end;
    })
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));

  const modelName = typeof model === 'string' ? model : 'custom';
  const fn = typeof model === 'string' ? BUILT_IN[model] : model;

  // No eligible touch at all: the honest answer is UNKNOWN, not "drop the lead". Dropping it
  // would make the leads that DO have touches look like the whole population.
  const credits = eligible.length === 0 ? { [UNKNOWN]: 1 } : fn(eligible);
  const { sum, warning } = checkCreditSum(credits);

  return { leadId, model: modelName, credits, sum, warning, eligibleTouchpoints: eligible.length };
}

export interface AttributionAggregate {
  model: AttributionModel | 'custom';
  /** source -> total credit across all leads. Sums to leads count when every lead is clean. */
  bySource: Record<string, number>;
  leads: number;
  /** Leads whose credit did not sum to 1. Surfaced, never hidden by the aggregate. */
  leadsWithWarnings: number;
  warnings: string[];
}

/**
 * Sum per-lead credits into a per-source total.
 *
 * A lead with a warning is still INCLUDED - excluding it would make the aggregate add up
 * while hiding that a model misbehaved on some of the population. The warning count and the
 * messages travel with the aggregate so the page can show them next to the chart.
 */
export function aggregateCredits(leadCredits: readonly LeadCredit[]): AttributionAggregate {
  const bySource: Record<string, number> = {};
  const warnings: string[] = [];
  let leadsWithWarnings = 0;
  const model = leadCredits[0]?.model ?? 'linear';

  for (const lc of leadCredits) {
    for (const [source, share] of Object.entries(lc.credits)) {
      bySource[source] = (bySource[source] ?? 0) + share;
    }
    if (lc.warning) {
      leadsWithWarnings += 1;
      if (warnings.length < 5) warnings.push(`${lc.leadId}: ${lc.warning}`);
    }
  }

  return { model, bySource, leads: leadCredits.length, leadsWithWarnings, warnings };
}
