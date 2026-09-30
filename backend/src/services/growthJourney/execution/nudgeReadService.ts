import { Op } from 'sequelize';
import { GrowthJourneyInAppNudge } from '../../../models';
import { recordJourneyEvent } from '../ledger';

/**
 * The learner's side of the in-app channel (Phase 5 T514): what the portal
 * dashboard reads, and the one action a learner has on a nudge.
 *
 * ─── THE LEARNER SEES FOUR FIELDS ───────────────────────────────────────────
 *
 * `id`, `title`, `href`, `purpose` - never the row. A nudge row also carries
 * the tenant, the brand, the programme, the execution receipt and three
 * timestamps; none of that is the learner's, and a response shaped as the row
 * would leak the journey's internals to a browser. `title` and `href` were
 * copied at execution time from the decision's APPROVED content asset (T510),
 * so what is shown is what a human approved.
 *
 * ─── SHOWN ONCE, DISMISSED ONCE, OWN ROWS ONLY ──────────────────────────────
 *
 * A live nudge is one not dismissed and not past its `expires_at`. Listing
 * stamps `shown_at` on the rows that have none - once, the first time the
 * learner's dashboard renders it - unless the viewer is an admin "viewing as
 * member" (`readOnly`), whose look must leave no trace. Dismissing is one
 * conditional update on the caller's own `enrollment_id` with `dismissed_at`
 * null, so another learner's id, a made-up id and a second dismiss are all one
 * answer: `not_found`, and nothing changes. Each action that takes is one
 * ledger row on the execution receipt, ids only.
 */

export interface LearnerNudge {
  id: string;
  title: string;
  href: string | null;
  purpose: string | null;
}

export const LEARNER_NUDGE_FIELDS: ReadonlyArray<keyof LearnerNudge> = ['id', 'title', 'href', 'purpose'];

interface NudgeRow {
  get(k: string): unknown;
}

const view = (row: NudgeRow): LearnerNudge => ({
  id: String(row.get('id')),
  title: String(row.get('title')),
  href: (row.get('href') as string | null) ?? null,
  purpose: (row.get('purpose') as string | null) ?? null,
});

const scopeOf = (row: NudgeRow) => ({ tenant_id: String(row.get('tenant_id')), brand_id: String(row.get('brand_id')) });

/** One ledger row on the execution receipt for a learner's action on its nudge: ids only. */
async function recordNudgeAction(row: NudgeRow, action: 'shown' | 'dismissed', enrollmentId: string): Promise<void> {
  await recordJourneyEvent(`growth_journey.execution.nudge_${action}`, 'growth_journey_execution', String(row.get('execution_id')), scopeOf(row), {
    nudge_id: String(row.get('id')), enrollment_id: enrollmentId,
  });
}

/** The enrolment's live nudges, oldest first, as the learner may see them; `shown_at` stamped once unless read-only. */
export async function listLearnerNudges(args: { enrollmentId: string; asOf: Date; readOnly?: boolean }): Promise<LearnerNudge[]> {
  const rows = (await GrowthJourneyInAppNudge.findAll({
    where: { enrollment_id: args.enrollmentId, dismissed_at: null, [Op.or]: [{ expires_at: null }, { expires_at: { [Op.gt]: args.asOf } }] },
    order: [['created_at', 'ASC']],
  })) as unknown as NudgeRow[];
  if (!args.readOnly) {
    const unseen = rows.filter((r) => !r.get('shown_at'));
    if (unseen.length > 0) {
      await GrowthJourneyInAppNudge.update({ shown_at: args.asOf }, { where: { id: { [Op.in]: unseen.map((r) => String(r.get('id'))) }, shown_at: null } });
      for (const r of unseen) await recordNudgeAction(r, 'shown', args.enrollmentId);
    }
  }
  return rows.map(view);
}

export type DismissResult = 'dismissed' | 'not_found';

/** Dismiss the caller's own live nudge; anything else is `not_found` and nothing changes. */
export async function dismissLearnerNudge(args: { enrollmentId: string; nudgeId: string; asOf: Date }): Promise<DismissResult> {
  // The ownership rule lives here, in the one write: the row must be the caller's and still live.
  const [moved] = await GrowthJourneyInAppNudge.update({ dismissed_at: args.asOf }, { where: { id: args.nudgeId, enrollment_id: args.enrollmentId, dismissed_at: null } });
  if (moved === 0) return 'not_found';
  const row = (await GrowthJourneyInAppNudge.findOne({ where: { id: args.nudgeId } })) as unknown as NudgeRow | null;
  if (row) await recordNudgeAction(row, 'dismissed', args.enrollmentId);
  return 'dismissed';
}
