import type { JourneyProgramKind, ScoreDimension, ScoreFactor, ScoreVector } from '../governor/types';
import { dimensionsFor, type ScoreDimensionSpec } from './dimensions';

/**
 * Score one subject against its programme's dimensions (§5.3, §5.4; T306).
 *
 * ─── PURE, AND EVERY POINT NAMES WHERE IT CAME FROM ─────────────────────────
 *
 * No I/O, no model client, no clock of its own: the caller reads the signals and
 * passes them in. Every dimension that scores carries at least one
 * `ScoreFactor` with a human-readable label, following
 * `inbox/opportunityScoringService.ts`, because §5.3 forbids collapsing the
 * dimensions "into an unexplained score" — a summary may rank work only when its
 * components and their reasons are visible.
 *
 * ─── THERE IS NO ZERO DEFAULT ANYWHERE IN THIS FILE ─────────────────────────
 *
 * A dimension with no source is `null`. A sourced dimension whose input is
 * missing for THIS subject is also `null` — an industry nobody recorded is not
 * an industry that scores badly. A test scans this file's own text for `?? 0`
 * and `|| 0`, because that is the shape the mistake takes.
 *
 * ─── THE SUMMARY IS NULL FAR MORE OFTEN THAN IT IS A NUMBER ─────────────────
 *
 * It is the weighted mean over the dimensions that HAVE a source, and it is
 * `null` if any one of them came back null. With three sourced dimensions per
 * programme, a subject missing a declared timeline has no summary at all. That
 * is the specified behaviour: a partial summary would be a number whose meaning
 * changed per subject, which is worse than no number.
 */

/** What the caller must read for a subject. Nothing here is invented. */
export interface SubjectSignals {
  /**
   * The populated `leads` columns. Every field is optional because every field
   * is genuinely absent for some real lead, and absence must reach the scorer as
   * absence rather than as a substituted value.
   */
  lead: {
    industry?: string | null;
    annual_revenue?: number | string | null;
    employee_count?: number | string | null;
    company_size?: string | null;
    technology_stack?: string | string[] | null;
    evaluating_90_days?: boolean | string | null;
    maturity_score?: number | string | null;
    estimated_roi?: number | string | null;
    departments_impacted?: string | string[] | null;
    selected_systems?: string | string[] | null;
  } | null;
  /** Counted inbound signals. `null` when the caller did not read them at all. */
  observed: { page_events: number; behavioral_signals: number } | null;
  /**
   * Which questions were actually PUT to this subject.
   *
   * `leads.evaluating_90_days` is `NOT NULL DEFAULT false`, so the column cannot
   * distinguish "answered no" from "never asked" — and reading the default as an
   * answer is the defect attempt 1 shipped. Nothing in the repo records the
   * asking today, so a caller that does not know leaves this undefined and the
   * dimension stays null. This is the seam for a source that can answer it.
   */
  asked?: { evaluating_90_days?: boolean };
  /**
   * Recorded, NEVER scored. Four writers with disjoint vocabularies
   * (`lead_temperature`), an in-place overwrite with no history
   * (`opportunity_scores`), and a competing offer vocabulary
   * (`recommended_offer`). They appear as labelled factors on the vector so a
   * reviewer can see them, and they move no dimension's value.
   */
  labels?: {
    lead_temperature?: string | null;
    opportunity_score?: number | null;
    recommended_offer?: string | null;
  };
  computed_at: Date | null;
}

type Scored = {
  value: number | null;
  factors: ScoreFactor[];
  /** Why the value is null, when "the caller read nothing" is not the reason. */
  nullReason?: string;
};

const clamp = (n: number, cap: number): number => Math.max(0, Math.min(cap, Math.round(n)));

/**
 * A number from a column that may arrive as a string, or not at all.
 *
 * THE TRAP THIS GUARDS, which shipped in attempt 1: stripping non-digits from
 * `'confidential'` leaves `''`, and `Number('')` is **0**. So a text value in a
 * `VARCHAR` revenue column became a measured zero and scored points for "Annual
 * revenue recorded". A digit-stripped string that holds no digits is not a
 * number, and this now says so.
 */
function numeric(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const text = String(raw).trim();
  if (text === '') return null;
  const digits = text.replace(/[^0-9.\-]/g, '');
  if (digits === '' || digits === '-' || digits === '.') return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

/**
 * A list from a column that may arrive as a string, an array, or not at all.
 *
 * AN EMPTY ARRAY IS NOT A LIST. `[]` is truthy, so attempt 1 awarded an empty
 * JSONB array the same points as a populated one and labelled it "0
 * technologies named" — and the advisory mapper really does store `[]` when the
 * advisor sends nothing. Empty in, `null` out: nothing to score, and the
 * dimension says so through its gap instead of through a fabricated factor.
 */
function list(raw: unknown): string[] | null {
  const items = Array.isArray(raw)
    ? raw.map((x) => String(x).trim())
    : typeof raw === 'string'
      ? raw.split(',').map((x) => x.trim())
      : [];
  // `'null'`/`'undefined'` come from stringifying a hole, and a value opening
  // with `[` or `{` is JSON that reached here as raw text — the verifier's probe
  // scored `technology_stack: '[]'` as "1 technologies named" and flipped `fit`
  // from null to 10, which is a fabricated measurement and this file's subject.
  const kept = items.filter(
    (x) => x !== '' && x !== 'null' && x !== 'undefined' && !x.startsWith('[') && !x.startsWith('{'),
  );
  return kept.length > 0 ? kept : null;
}

/* ── the three sourced business dimensions ─────────────────────────────────── */

/** Firmographics. Null unless at least one of them is actually recorded. */
function scoreFit(signals: SubjectSignals, spec: ScoreDimensionSpec): Scored {
  const lead = signals.lead;
  if (!lead) return { value: null, factors: [] };
  const factors: ScoreFactor[] = [];

  if (lead.industry) {
    factors.push({ factor: 'industry', label: `Industry recorded: ${lead.industry}`, points: 20 });
  }
  const employees = numeric(lead.employee_count);
  if (employees !== null) {
    const points = employees >= 200 ? 30 : employees >= 50 ? 20 : 10;
    factors.push({
      factor: 'employee_count',
      label: `${employees} employees`,
      points,
      detail: 'larger organisations carry more of the work this offer does',
    });
  } else if (lead.company_size) {
    factors.push({ factor: 'company_size', label: `Company size: ${lead.company_size}`, points: 15 });
  }
  const revenue = numeric(lead.annual_revenue);
  if (revenue !== null) {
    factors.push({ factor: 'annual_revenue', label: 'Annual revenue recorded', points: revenue >= 10_000_000 ? 20 : 10 });
  }
  const stack = list(lead.technology_stack);
  if (stack) {
    factors.push({ factor: 'technology_stack', label: `${stack.length} technologies named`, points: 10 });
  }
  const departments = list(lead.departments_impacted);
  if (departments) {
    factors.push({
      factor: 'departments_impacted',
      label: `${departments.length} departments impacted`,
      points: 10,
      detail: 'self-declared breadth, recorded as fit rather than as authority',
    });
  }
  const roi = numeric(lead.estimated_roi);
  if (roi !== null) {
    factors.push({
      factor: 'estimated_roi',
      label: 'An expected return was estimated',
      points: 10,
      detail: 'a declared expectation, which is why it sits here and not in budget readiness',
    });
  }

  // Nothing recorded at all is UNKNOWN, not a low score.
  if (factors.length === 0) return { value: null, factors: [] };
  return { value: clamp(factors.reduce((sum, f) => sum + f.points, 0), spec.cap), factors };
}

/** Observed inbound behaviour. Null when the caller read no signals. */
function scoreIntent(signals: SubjectSignals, spec: ScoreDimensionSpec): Scored {
  const observed = signals.observed;
  if (!observed) return { value: null, factors: [] };
  const factors: ScoreFactor[] = [
    {
      factor: 'page_events',
      label: `${observed.page_events} page events`,
      points: Math.min(50, observed.page_events * 5),
    },
    {
      factor: 'behavioral_signals',
      label: `${observed.behavioral_signals} behavioural signals`,
      points: Math.min(50, observed.behavioral_signals * 10),
    },
  ];
  const declared = list(signals.lead?.selected_systems);
  if (declared) {
    factors.push({
      factor: 'selected_systems',
      label: `${declared.length} systems named by the visitor`,
      points: 10,
      detail: 'declared intent, which outranks observed intent under §7.1',
    });
  }
  return { value: clamp(factors.reduce((sum, f) => sum + f.points, 0), spec.cap), factors };
}

/**
 * A declared timeline — and only a POSITIVE answer is one.
 *
 * `leads.evaluating_90_days` is `allowNull: false, defaultValue: false`, so
 * `false` is what the column holds for every lead nobody asked. Attempt 1 read
 * it as an answer and labelled it "Not evaluating within 90 days": a column
 * default rendered as a declared measurement, on the one dimension both
 * programmes depend on.
 *
 * So `true` scores, and `false` is `null` with its own gap — unless the caller
 * can say the question was actually put, which `asked.evaluating_90_days`
 * exists for. Nothing in the repo records that today; the parameter is the seam
 * for whatever does, and a caller that cannot answer it must not pretend.
 *
 * The consequence is worth stating: almost every subject now has no urgency and
 * therefore no summary. That is the true state of the data, and a summary built
 * on a column default would have been a number about nobody.
 */
function scoreUrgency(signals: SubjectSignals, spec: ScoreDimensionSpec): Scored {
  const raw = signals.lead?.evaluating_90_days;
  const positive = raw === true || String(raw).toLowerCase() === 'true' || String(raw) === '1';
  if (positive) {
    return {
      value: spec.cap,
      factors: [
        {
          factor: 'evaluating_90_days',
          label: 'Evaluating within 90 days',
          points: spec.cap,
          detail: 'the only declared-timeline field on a lead, and the only value of it that is an answer',
        },
      ],
    };
  }

  // The negative needs BOTH the confirmation and the row it was read from: a
  // caller that never loaded the lead cannot know the answer was negative, and
  // the verifier found that hole by passing `asked` with `lead: null`.
  const fieldPresent = signals.lead !== null && signals.lead.evaluating_90_days !== undefined;
  if (signals.asked?.evaluating_90_days === true && fieldPresent) {
    return {
      value: 10,
      factors: [
        {
          factor: 'evaluating_90_days',
          label: 'Asked, and not evaluating within 90 days',
          points: 10,
          detail: 'the caller confirmed the question was put, so the negative IS an answer',
        },
      ],
    };
  }

  return {
    value: null,
    factors: [],
    nullReason: 'default_not_distinguishable_from_unasked',
  };
}

/* ── the three sourced consulting dimensions ───────────────────────────────── */

/** The systems they named, against what a consulting engagement can take on. */
function scoreSolutionFit(signals: SubjectSignals, spec: ScoreDimensionSpec): Scored {
  const systems = list(signals.lead?.selected_systems);
  const stack = list(signals.lead?.technology_stack);
  if (!systems && !stack) return { value: null, factors: [] };
  const factors: ScoreFactor[] = [];
  if (systems) {
    factors.push({
      factor: 'selected_systems',
      label: `${systems.length} systems selected: ${systems.slice(0, 3).join(', ')}`,
      points: Math.min(60, systems.length * 20),
    });
  }
  if (stack) {
    factors.push({
      factor: 'technology_stack',
      label: `${stack.length} technologies in the existing stack`,
      points: Math.min(40, stack.length * 10),
    });
  }
  return { value: clamp(factors.reduce((sum, f) => sum + f.points, 0), spec.cap), factors };
}

/**
 * AI-derived maturity. Null when nothing wrote it.
 *
 * `leads.maturity_score` is written by the advisory sync as
 * `Math.round(recommendation.confidence * 100)`, so this is a model's
 * confidence, not the lead's own answer. It is used as a RANKING input, which
 * AI is allowed to be, and the factor says where it came from so a reviewer is
 * never misled into reading it as a declaration.
 */
function scoreTechnicalFeasibility(signals: SubjectSignals, spec: ScoreDimensionSpec): Scored {
  const maturity = numeric(signals.lead?.maturity_score);
  if (maturity === null) return { value: null, factors: [] };
  const factors: ScoreFactor[] = [
    {
      factor: 'maturity_score',
      label: `Advisory AI maturity ${maturity}`,
      points: clamp(maturity <= 10 ? maturity * 10 : maturity, spec.cap),
      detail:
        'written by the advisory sync as recommendation.confidence * 100 - a model’s confidence, not the lead’s own answer',
    },
  ];
  const stack = list(signals.lead?.technology_stack);
  if (stack) {
    factors.push({ factor: 'technology_stack', label: `${stack.length} technologies named`, points: 0, detail: 'context only' });
  }
  return { value: clamp(factors[0].points, spec.cap), factors };
}

const SCORERS: Record<string, (s: SubjectSignals, spec: ScoreDimensionSpec) => Scored> = {
  fit: scoreFit,
  intent: scoreIntent,
  urgency: scoreUrgency,
  solution_fit: scoreSolutionFit,
  technical_feasibility: scoreTechnicalFeasibility,
};

/** The three repo scores that are recorded and never scored, as visible factors. */
function labelFactors(signals: SubjectSignals): ScoreFactor[] {
  const labels = signals.labels ?? {};
  const out: ScoreFactor[] = [];
  if (labels.lead_temperature) {
    out.push({
      factor: 'lead_temperature',
      label: `Recorded temperature: ${labels.lead_temperature}`,
      points: 0,
      detail: 'four writers with disjoint vocabularies — recorded, never scored',
    });
  }
  if (labels.opportunity_score !== null && labels.opportunity_score !== undefined) {
    out.push({
      factor: 'opportunity_score',
      label: `Recorded opportunity score: ${labels.opportunity_score}`,
      points: 0,
      detail: 'overwritten in place with no history — recorded, never scored',
    });
  }
  if (labels.recommended_offer) {
    out.push({
      factor: 'recommended_offer',
      label: `Router recommendation: ${labels.recommended_offer}`,
      points: 0,
      detail: 'a competing offer vocabulary — recorded, never scored',
    });
  }
  return out;
}

export function scoreSubject(signals: SubjectSignals, program: JourneyProgramKind): ScoreVector {
  const specs = dimensionsFor(program);

  // A learner journey scores through Explorer's own three learner scores. A set
  // of dimensions here would be a second learner scorer.
  if (specs.length === 0) {
    return {
      dimensions: [],
      summary: null,
      gaps: [`no_dimensions_for_program:${program}`],
      available: false,
      computed_at: signals.computed_at,
    };
  }

  const dimensions: ScoreDimension[] = [];
  const gaps: string[] = [];

  for (const spec of specs) {
    if (spec.source === 'none') {
      dimensions.push({ key: spec.key, label: spec.label, value: null, source: 'none', factors: [] });
      gaps.push(`${spec.key}:no_source`);
      continue;
    }
    const scorer = SCORERS[spec.key];
    if (!scorer) {
      // A declared source with no scorer is a registry bug, and it is reported as
      // a gap rather than as a zero.
      dimensions.push({ key: spec.key, label: spec.label, value: null, source: spec.source, factors: [] });
      gaps.push(`${spec.key}:no_scorer`);
      continue;
    }
    const scored = scorer(signals, spec);
    dimensions.push({
      key: spec.key,
      label: spec.label,
      value: scored.value,
      source: spec.source,
      factors: scored.factors,
    });
    if (scored.value === null) gaps.push(`${spec.key}:${scored.nullReason ?? 'no_value_for_subject'}`);
  }

  const labels = labelFactors(signals);
  if (labels.length > 0) {
    // Attached to the vector as a dimension that can never score: visible to a
    // reviewer, worth nothing to the summary, and impossible to mistake for a
    // measurement because its source says so.
    dimensions.push({
      key: 'recorded_signals',
      label: 'Recorded signals (never scored)',
      value: null,
      source: 'none',
      factors: labels,
    });
  }

  const contributing = specs.filter((s) => s.source !== 'none');
  const values = contributing.map((s) => dimensions.find((d) => d.key === s.key)?.value ?? null);
  const anyMissing = values.some((v) => v === null);
  const weight = contributing.reduce((sum, s) => sum + s.weight, 0);

  let summary: number | null = null;
  if (!anyMissing && weight > 0) {
    let total = 0;
    contributing.forEach((s, i) => {
      const value = values[i];
      if (value !== null) total += value * s.weight;
    });
    summary = Math.round(total / weight);
  }

  return {
    dimensions,
    summary,
    gaps,
    // True when at least one dimension actually scored: the subject has SOME
    // measurable surface, even if the summary is null.
    available: dimensions.some((d) => d.value !== null),
    computed_at: signals.computed_at,
  };
}
