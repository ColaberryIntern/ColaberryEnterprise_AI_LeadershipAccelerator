import { sequelize } from '../../config/database';
import { PREP_SKILLS } from '../../db/ensureCareerPrepSchema';
import { buildPlan, type Plan, type PlanKind } from './planBuilder';
import { loadPrepData } from './prepData';
import { readingsFor } from './prepViews';

/**
 * Career Prep v27, CP4.1: store and read plans (prep_plans). The SERVER builds the plan (planBuilder),
 * never the client. One active plan per interview: a new plan marks the previous active one
 * 'abandoned' in the same transaction, so a double click cannot leave two active plans.
 * Every function takes the enrollment from the caller (the session token).
 */
export interface StoredPlan { id: string; interviewId: string; plan: Plan }
export class NotYoursError extends Error { constructor() { super('interview not found'); this.name = 'NotFoundError'; } }

const LABEL = new Map(PREP_SKILLS.map((s) => [s.key, s.label]));

export async function createPlan(enrollmentId: string, input: { interviewId: string; kind: PlanKind; minutes?: 10 | 20 | 45; focusSkill?: string }, now = new Date()): Promise<StoredPlan> {
  const data = await loadPrepData(enrollmentId, now);
  const iv = data.interviews.find((i) => i.id === input.interviewId);
  if (!iv) throw new NotYoursError();
  const weakest = readingsFor(data, now).filter((r) => r.score !== null).sort((a, b) => (a.score as number) - (b.score as number))
    .map((r) => ({ key: r.skill, label: LABEL.get(r.skill) ?? r.skill }));
  const focus = input.focusSkill && LABEL.has(input.focusSkill) ? { key: input.focusSkill, label: LABEL.get(input.focusSkill) as string } : undefined;
  const plan = buildPlan({ kind: input.kind, now, interview: { startsAt: iv.startsAt, practiceUntil: iv.practiceUntil }, weakest, minutes: input.minutes, focus });
  const id = await sequelize.transaction(async (t) => {
    await sequelize.query(`UPDATE prep_plans SET status = 'abandoned' WHERE enrollment_id = :e AND interview_id = :i AND status = 'active'`,
      { replacements: { e: enrollmentId, i: iv.id }, transaction: t });
    const [rows] = await sequelize.query(
      `INSERT INTO prep_plans (enrollment_id, interview_id, kind, minutes, focus_skill, days) VALUES (:e, :i, :k, :m, :f, CAST(:d AS JSONB)) RETURNING id`,
      { replacements: { e: enrollmentId, i: iv.id, k: plan.kind, m: plan.minutes, f: focus?.key ?? null, d: JSON.stringify(plan.days) }, transaction: t },
    );
    return String((rows as Array<{ id: string }>)[0].id);
  });
  return { id, interviewId: iv.id, plan };
}

export async function activePlan(enrollmentId: string, interviewId: string): Promise<StoredPlan | null> {
  const [rows] = await sequelize.query(
    `SELECT id, interview_id, kind, minutes, days FROM prep_plans WHERE enrollment_id = :e AND interview_id = :i AND status = 'active'
      ORDER BY created_at DESC LIMIT 1`,
    { replacements: { e: enrollmentId, i: interviewId } },
  );
  const r = (rows as Array<Record<string, unknown>>)[0];
  if (!r) return null;
  return { id: String(r.id), interviewId: String(r.interview_id), plan: { kind: r.kind as PlanKind, minutes: Number(r.minutes), days: r.days as Plan['days'] } };
}
