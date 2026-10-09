/**
 * P3-T5 — effort and automation measures that cannot be made to flatter.
 *
 * Unlike T2, T3 and T4, this one is not enforcing an instruction that already existed: there is
 * no effort-share or automation-share calculation anywhere in this repo. The only adjacent thing
 * is the `effortCoverageDisclosed` boolean I added in Phase 2, which this feeds.
 *
 * THE DATA DOES NOT SUPPORT A FREQUENCY-WEIGHTED TOTAL, AND THAT CHANGED THE DESIGN.
 * The plan's criterion was "a task repeating 20x/month contributes 20x its unit effort". But
 * `FactoryTask.frequency` is `string | null` holding free text — "per case", "daily" — and it is
 * **never parsed numerically anywhere** in the factory or lifecycle code. "Per case" has no number
 * in it without a case volume nobody has stated. Inferring a multiplier from that text is exactly
 * the kind of guess this phase refuses, so a numeric `occurrencesPerMonth` must be DECLARED, and a
 * task that has only free text is **unassessed** — it lowers coverage instead of being invented
 * into the total.
 *
 * WHAT MAKES A MEASURE HONEST HERE:
 *   - Every percentage is returned WITH its denominator. A share without one is a claim with no
 *     scale, and "85%" over three assessed tasks out of forty is not the same statement as 85%
 *     over forty.
 *   - A zero denominator yields `null`, never `0`. "Nothing assessed" and "assessed and found to
 *     be zero" are different facts, and `0%` says the second.
 *   - `ai_with_approval` splits: execution minutes count as AI, approval minutes count as HUMAN.
 *     Otherwise the single classification that most needs scrutiny would be the one that hides the
 *     review burden inside an automation score.
 *   - `deterministic_software` is reported SEPARATELY and is never inside the AI share. A cron job
 *     is not artificial intelligence, and rolling it in is the cheapest way to inflate a number.
 *   - 85% is a TARGET. Below it is a disclosure requirement, not a failure and never a safety
 *     override.
 *
 * NO DATABASE. Pure arithmetic over values.
 */

import type { EffortBasis } from '../../factory/contracts/factoryContract';
import { EXECUTION_CLASSES, type ExecutionClass } from './allocation';

/** The automation target. A target, not a threshold: see `AutomationMeasure.belowTarget`. */
export const AI_SHARE_TARGET = 0.85;

/** One task's assessed effort. Everything needed to place it in a total, or to exclude it. */
export interface EffortAssessment {
  taskId: string;
  executionClass: ExecutionClass;
  /** Minutes for ONE occurrence. Always minutes: a unit field would invite silent coercion. */
  minutesPerOccurrence: number | null;
  basis: EffortBasis;
  /**
   * Declared occurrences per month. `null` means undeclared, which makes the task unassessed.
   *
   * Not derived from `FactoryTask.frequency`, which is free text and carries no number.
   */
  occurrencesPerMonth: number | null;
  /**
   * Human approval minutes per occurrence, for `ai_with_approval`.
   *
   * `null` on an `ai_with_approval` task is itself a gap: the class asserts a human approves, so
   * the review cost exists and omitting it would let the AI share absorb it.
   */
  approvalMinutesPerOccurrence?: number | null;
}

export const EFFORT_CODES = [
  'EFFORT_UNASSESSED',
  'EFFORT_BASIS_UNKNOWN',
  'EFFORT_NEGATIVE',
  'APPROVAL_EFFORT_MISSING',
  'EFFORT_DUPLICATE_TASK',
  'IMPOSSIBLE_SHARE',
  'BELOW_TARGET_UNEXPLAINED',
] as const;
export type EffortCode = (typeof EFFORT_CODES)[number];

export interface EffortIssue {
  code: EffortCode;
  subject: string;
  message: string;
}

/** A share plus the scale it was computed over. Neither is meaningful alone. */
export interface Share {
  /** `null` when the denominator is zero: nothing assessed, as distinct from assessed zero. */
  fraction: number | null;
  numeratorMinutes: number;
  denominatorMinutes: number;
}

export interface AutomationMeasure {
  /** AI-executed minutes over total assessed minutes. Approval minutes are NOT in the numerator. */
  aiShare: Share;
  /** Reported separately. Deterministic software is not AI and is never folded into aiShare. */
  deterministicShare: Share;
  /** Human minutes, including the approval minutes of every `ai_with_approval` task. */
  humanShare: Share;
  /** Tasks that contributed, over tasks offered. The denominator every percentage above needs. */
  coverage: { assessedTasks: number; totalTasks: number };
  /**
   * `null` when `aiShare.fraction` is null — an unmeasurable share is not "below target", and
   * saying it is would manufacture a finding out of missing data.
   */
  belowTarget: boolean | null;
  issues: EffortIssue[];
}

/** Below-target disclosure. Required only when `belowTarget` is true. */
export interface TargetAcceptance {
  rationale: string;
  acceptedBy: string;
}

const AI_EXECUTED: ReadonlySet<ExecutionClass> = new Set<ExecutionClass>([
  'ai_autonomous',
  'ai_with_approval',
]);

function share(numerator: number, denominator: number): Share {
  return {
    fraction: denominator === 0 ? null : numerator / denominator,
    numeratorMinutes: numerator,
    denominatorMinutes: denominator,
  };
}

/**
 * Whether one assessment can contribute to a total.
 *
 * Returns the reason rather than a boolean, so the caller can report WHY a task was excluded
 * instead of silently narrowing the denominator — which is how coverage quietly becomes 3/40
 * while the percentage keeps looking confident.
 */
function exclusionReason(a: EffortAssessment): EffortIssue | null {
  if (!(EXECUTION_CLASSES as ReadonlyArray<string>).includes(a.executionClass)) {
    return { code: 'EFFORT_UNASSESSED', subject: a.taskId, message: `task ${a.taskId} has execution class '${String(a.executionClass)}', which is not one of the four; it cannot be placed in a total.` };
  }
  if (a.basis === 'UNKNOWN') {
    return { code: 'EFFORT_BASIS_UNKNOWN', subject: a.taskId, message: `task ${a.taskId} has basis UNKNOWN, so its minutes are not evidence. Excluded from the total and counted against coverage, per the EFFORT_EVIDENCE rule factoryValidate already applies.` };
  }
  if (a.minutesPerOccurrence === null) {
    return { code: 'EFFORT_UNASSESSED', subject: a.taskId, message: `task ${a.taskId} has no minutes, so it contributes nothing and reduces coverage.` };
  }
  if (a.occurrencesPerMonth === null) {
    return { code: 'EFFORT_UNASSESSED', subject: a.taskId, message: `task ${a.taskId} has no declared occurrences per month. FactoryTask.frequency is free text ("per case") and carries no number, so a monthly total cannot be computed without a declaration — and guessing one is how an invented multiplier becomes a headline figure.` };
  }
  // approvalMinutesPerOccurrence is in this guard because it was LEFT OUT of it, and the
  // omission was the one field whose entire reason for existing is to stop the hybrid class
  // flattering itself. A negative approval value produced a 300% AI share, a negative human
  // share, ZERO issues and belowTarget: false - which reads as "target met".
  if (a.minutesPerOccurrence < 0
    || a.occurrencesPerMonth < 0
    || (a.approvalMinutesPerOccurrence ?? 0) < 0) {
    return { code: 'EFFORT_NEGATIVE', subject: a.taskId, message: `task ${a.taskId} has a negative quantity. Negative effort is not a saving; it is a data error, and averaging it away would shift every share above.` };
  }
  if (a.executionClass === 'ai_with_approval'
    && (a.approvalMinutesPerOccurrence === null || a.approvalMinutesPerOccurrence === undefined)) {
    return { code: 'APPROVAL_EFFORT_MISSING', subject: a.taskId, message: `task ${a.taskId} is 'ai_with_approval' but states no approval minutes. The class asserts a human approves, so that cost exists; omitting it would let the AI share absorb the review burden.` };
  }
  return null;
}

/**
 * Compute the automation measures.
 *
 * Returns issues alongside the numbers rather than throwing: a reviewer needs to see both the
 * share and what it excludes, and an exception would show neither.
 */
export function measureAutomation(
  assessments: ReadonlyArray<EffortAssessment>,
): AutomationMeasure {
  const issues: EffortIssue[] = [];
  const seen = new Set<string>();

  let aiMinutes = 0;
  let humanMinutes = 0;
  let deterministicMinutes = 0;
  let assessedTasks = 0;

  for (const a of assessments) {
    if (seen.has(a.taskId)) {
      issues.push({ code: 'EFFORT_DUPLICATE_TASK', subject: a.taskId, message: `task ${a.taskId} is assessed more than once; one task counted twice inflates whichever share it lands in.` });
      continue;
    }
    seen.add(a.taskId);

    const excluded = exclusionReason(a);
    if (excluded) { issues.push(excluded); continue; }

    const occ = a.occurrencesPerMonth as number;
    const exec = (a.minutesPerOccurrence as number) * occ;
    assessedTasks += 1;

    if (a.executionClass === 'deterministic_software') {
      deterministicMinutes += exec;
    } else if (AI_EXECUTED.has(a.executionClass)) {
      aiMinutes += exec;
      // The approval cost is HUMAN time, counted on the human side of the same task.
      humanMinutes += (a.approvalMinutesPerOccurrence ?? 0) * occ;
    } else {
      humanMinutes += exec;
    }
  }

  const total = aiMinutes + humanMinutes + deterministicMinutes;
  const aiShare = share(aiMinutes, total);
  const deterministicShare = share(deterministicMinutes, total);
  const humanShare = share(humanMinutes, total);

  // A SELF-CHECK, because the input guards above are exactly what failed once.
  //
  // Any share outside 0..1 is arithmetically impossible for non-negative minutes, so if one
  // appears the bug is in this module rather than in the data - and an impossible number
  // that renders as a confident percentage is worse than a refusal. This closes the CLASS
  // of defect the approval-minutes gap was one instance of, rather than only that instance.
  for (const [name, sh] of [
    ['aiShare', aiShare],
    ['deterministicShare', deterministicShare],
    ['humanShare', humanShare],
  ] as Array<[string, Share]>) {
    if (sh.fraction !== null && (sh.fraction < 0 || sh.fraction > 1)) {
      issues.push({
        code: 'IMPOSSIBLE_SHARE',
        subject: name,
        message: `${name} computed to ${sh.fraction}, which is outside 0..1 and therefore `
          + 'impossible for non-negative minutes. This is a defect in the measure, not a '
          + 'property of the project: treat the figure as unusable rather than reporting it.',
      });
    }
  }

  return {
    aiShare,
    deterministicShare,
    humanShare,
    coverage: { assessedTasks, totalTasks: assessments.length },
    belowTarget: aiShare.fraction === null ? null : aiShare.fraction < AI_SHARE_TARGET,
    issues,
  };
}

/**
 * Check the below-target disclosure.
 *
 * Only required when the measure is actually below target. An unmeasurable share (`belowTarget`
 * null) does not require a rationale, because there is nothing yet to explain — demanding one
 * would turn missing data into a fabricated justification.
 */
export function checkTargetDisclosure(
  measure: AutomationMeasure,
  acceptance: TargetAcceptance | null,
): EffortIssue[] {
  if (measure.belowTarget !== true) return [];
  if (acceptance && acceptance.rationale.trim() !== '' && acceptance.acceptedBy.trim() !== '') {
    return [];
  }
  // WITH its scale. An earlier version emitted a bare "50%" here - in the one module whose
  // argument is that a percentage without a denominator is the dangerous kind.
  const pct = Math.round((measure.aiShare.fraction as number) * 100);
  const scale = renderShare(measure.aiShare, measure.coverage);
  return [{
    code: 'BELOW_TARGET_UNEXPLAINED',
    subject: `${pct}%`,
    message: `the AI share is ${scale}, against a ${Math.round(AI_SHARE_TARGET * 100)}% target, with no `
      + 'rationale and no recorded owner acceptance. Below target is a disclosure requirement, not a '
      + 'failure — but an undisclosed shortfall is how a target quietly becomes a threshold nobody '
      + 'admits missing.',
  }];
}

/**
 * Render a share for a human, always with its scale.
 *
 * The only sanctioned way to turn a `Share` into text. A bare percentage is a claim without a
 * denominator, and this phase's whole argument is that those are the dangerous kind.
 */
export function renderShare(s: Share, coverage: AutomationMeasure['coverage']): string {
  if (s.fraction === null) {
    return `not assessed (0 of ${coverage.totalTasks} tasks carried usable effort data)`;
  }
  return `${Math.round(s.fraction * 100)}% of ${s.denominatorMinutes} assessed minutes/month, `
    + `across ${coverage.assessedTasks} of ${coverage.totalTasks} tasks`;
}
