/**
 * R23 Phase 5 — how enterprise inquiries break down across the three plans.
 *
 * ── WHY THIS IS ITS OWN MODULE ───────────────────────────────────────────────────────────
 *
 * `enterpriseFlow.ts` is 628 lines, past this repo's 500-line hard ceiling, and CLAUDE.md's
 * composition rule is explicit about what that means: "When a file or function exceeds the
 * hard ceiling, the next change to it MUST split it before adding new code." This phase adds
 * a bucket to the plan breakdown, so the breakdown comes out.
 *
 * It earns the split twice over. The counting is pure — rows in, counts and copy out, no
 * database, no clock, no classification registry — so it can be tested exhaustively at the
 * unit tier, which is where the test pyramid wants assertions about arithmetic. The same
 * logic inside the flow builder could only be reached through a mocked query, which is how
 * `enterpriseSuspect` came to be its own module in Phase 4 for the same reason.
 *
 * ── WHY IT RETURNS DESCRIPTORS AND NOT FunnelStage ───────────────────────────────────────
 *
 * The stage builder in `enterpriseFlow` supplies the default "this stage counts people, not
 * dollars" Money and the default classification. Rebuilding a FunnelStage here would mean a
 * second copy of that default sitting in a second file, free to disagree with the first;
 * importing the builder back out of `enterpriseFlow` would make the two modules circular,
 * which the composition rule names as the smell of a missing third module. So this module
 * returns what only it knows — the key, the label, the count and the definition — and the
 * flow maps them through the one stage builder that already exists.
 */
import {
  ENTERPRISE_PLANS,
  EnterprisePlanKey,
  SERVICE_NOT_SURE,
  SERVICE_NOT_SURE_LABEL,
  attributionOf,
} from './enterprisePlans';

/** One plan-breakdown row, as `enterpriseFlow`'s own `stage()` needs it. */
export interface PlanStageDescriptor {
  key: string;
  label: string;
  count: number;
  definition: string;
}

export interface PlanBreakdown {
  /** How many inquiries asked for each plan. Absent keys mean zero, never unknown. */
  byPlan: ReadonlyMap<EnterprisePlanKey, number>;
  /** They answered, and the answer was that they had not decided. */
  notSure: number;
  /** No answer at all: rows taken before the form required one. */
  unrecorded: number;
  /** Text matching no plan and no disclaimer. A human should read these. */
  unreadable: number;
  /** The funnel rows, in the site's own plan order, then not-sure, then the gap. */
  stages: PlanStageDescriptor[];
  /**
   * What a reader of the board must be told, one sentence per distinct problem. Empty when
   * every row is attributed, so the caller adds nothing rather than adding a reassurance.
   */
  caveats: string[];
}

/** The one sentence that keeps a plan count from being read as cumulative reach. */
const NOT_CUMULATIVE = 'Counts inquiries asking for this plan, not cumulative reach.';

export function planBreakdown(
  rows: ReadonlyArray<{ service: string | null }>,
): PlanBreakdown {
  const byPlan = new Map<EnterprisePlanKey, number>();
  let notSure = 0;
  let unrecorded = 0;
  let unreadable = 0;

  for (const row of rows) {
    const attribution = attributionOf(row.service);
    if (attribution === SERVICE_NOT_SURE) notSure += 1;
    else if (attribution === 'unrecorded') unrecorded += 1;
    else if (attribution === 'unreadable') unreadable += 1;
    else byPlan.set(attribution, (byPlan.get(attribution) ?? 0) + 1);
  }

  const stages: PlanStageDescriptor[] = ENTERPRISE_PLANS.map((plan) => ({
    key: `plan_${plan.key}`,
    label: plan.label,
    count: byPlan.get(plan.key) ?? 0,
    // "open-text" rather than the usual two-word term for it: this string is COPY, and the
    // TWC 807.172(d) ratchet over backend/src correctly cannot tell that term from
    // advertising. It caught the same phrase on this module's predecessor's first CI run.
    definition:
      `${plan.means} ${NOT_CUMULATIVE} Read off the service field the W28 form now requires, `
      + 'and from the open-text answers rows taken before that carry.',
  }));

  // A stage of its own, NOT folded into the gap below it.
  //
  // Before this phase the form let the question be skipped and "not sure" was counted as
  // unreadable text, so one number meant three things. A prospect who says they have not
  // decided has answered the question; filing that under "Plan not recorded" would report
  // our own measurement gap and their honest answer as the same fact, and they lead to
  // different actions. Shown at zero too, because a zero here is a measurement and a missing
  // row is not.
  stages.push({
    key: 'plan_not_sure',
    label: SERVICE_NOT_SURE_LABEL,
    count: notSure,
    definition:
      `${notSure} inquiry(ies) chose "${SERVICE_NOT_SURE_LABEL}" on the form. This is a recorded answer, `
      + 'not a gap: on first contact a buyer often does not know which of the three shapes '
      + 'they want, and the intake interview is what settles it. Counted apart from the '
      + 'plans so it never inflates one, and apart from the unattributed row below so our '
      + 'own gap is never padded with their answer.',
  });

  stages.push({
    key: 'plan_unattributed',
    label: 'Plan not recorded',
    count: unrecorded + unreadable,
    definition:
      `${unrecorded} inquiry(ies) carry no service answer and ${unreadable} carry text `
      + 'matching none of the three plans. The W28 form has required one of the three plans '
      + 'or "Not sure yet" since R23 Phase 5, so an empty answer here is a row taken before '
      + 'that and cannot be attributed after the fact. Shown beside the plans so the gap is '
      + 'visible rather than quietly excluded.',
  });

  const caveats: string[] = [];
  if (unrecorded > 0) {
    caveats.push(
      `${unrecorded} enterprise inquiry(ies) carry no service answer at all. The W28 form `
      + 'has required one since R23 Phase 5, so these were taken before that and cannot be '
      + 'attributed to a plan without asking the prospect again.',
    );
  }
  if (unreadable > 0) {
    caveats.push(
      `${unreadable} enterprise inquiry(ies) carry a service answer matching none of the `
      + 'three plans and no "not sure" phrasing. The form cannot now produce one of these, '
      + 'so it arrived another way and is worth reading rather than counting.',
    );
  }

  return { byPlan, notSure, unrecorded, unreadable, stages, caveats };
}
