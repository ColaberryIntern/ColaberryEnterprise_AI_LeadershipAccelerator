import { sequelize } from '../../config/database';
import { PREP_SKILLS } from '../../db/ensureCareerPrepSchema';
import { buildPlan, type Plan, type PlanKind } from './planBuilder';
import { loadPrepData } from './prepData';
import { readingsFor } from './prepViews';
import { centralDate } from './readiness';

/**
 * Career Prep v27, CP4.1: store and read plans (prep_plans). The SERVER builds the plan (planBuilder),
 * never the client.
 *
 * ONE ACTIVE PLAN PER INTERVIEW, guaranteed twice: a per-student advisory lock serialises the retire +
 * insert, and a partial unique index (prep_plans_one_active, ensureCareerPrepSchema) makes a second
 * active row impossible even if the lock were bypassed.
 * An interview that has already started cannot get a plan (PastInterviewError). Reading a plan checks the
 * interview is the student's own (else NotYoursError) and leaves out days that are already over.
 * Every function takes the enrollment from the caller (the session token).
 */
export interface StoredPlan { id: string; interviewId: string; plan: Plan }
export class NotYoursError extends Error { constructor() { super('interview not found'); this.name = 'NotFoundError'; } }
export class PastInterviewError extends Error { constructor() { super('interview already started'); this.name = 'ValidationError'; } }

const LABEL = new Map(PREP_SKILLS.map((s) => [s.key, s.label]));

export async function createPlan(enrollmentId: string, input: { interviewId: string; kind: PlanKind; minutes?: 10 | 20 | 45; focusSkill?: string }, now = new Date()): Promise<StoredPlan> {
  const data = await loadPrepData(enrollmentId, now);
  const iv = data.interviews.find((i) => i.id === input.interviewId);
  if (!iv) throw new NotYoursError();
  if (iv.startsAt && iv.startsAt.getTime() <= now.getTime()) throw new PastInterviewError();
  const weakest = readingsFor(data, now).filter((r) => r.score !== null).sort((a, b) => (a.score as number) - (b.score as number))
    .map((r) => ({ key: r.skill, label: LABEL.get(r.skill) ?? r.skill }));
  const focus = input.focusSkill && LABEL.has(input.focusSkill) ? { key: input.focusSkill, label: LABEL.get(input.focusSkill) as string } : undefined;
  const plan = buildPlan({ kind: input.kind, now, interview: { startsAt: iv.startsAt, practiceUntil: iv.practiceUntil }, weakest, minutes: input.minutes, focus });
  const id = await sequelize.transaction(async (t) => {
    await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:k))', { replacements: { k: `prep_plans:${enrollmentId}` }, transaction: t });
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

/** The interview's active plan with days already over left out; NotYoursError for someone else's interview. */
export async function activePlan(enrollmentId: string, interviewId: string, now = new Date()): Promise<StoredPlan | null> {
  const [own] = await sequelize.query('SELECT id FROM career_interviews WHERE id = :i AND enrollment_id = :e', { replacements: { i: interviewId, e: enrollmentId } });
  if (!(own as unknown[]).length) throw new NotYoursError();
  const [rows] = await sequelize.query(
    `SELECT id, interview_id, kind, minutes, days FROM prep_plans WHERE enrollment_id = :e AND interview_id = :i AND status = 'active'
      ORDER BY created_at DESC LIMIT 1`,
    { replacements: { e: enrollmentId, i: interviewId } },
  );
  const r = (rows as Array<Record<string, unknown>>)[0];
  if (!r) return null;
  const today = centralDate(now);
  const days = (r.days as Plan['days']).filter((d) => d.date >= today).map(({ date, segments }) => ({ date, segments }));
  return { id: String(r.id), interviewId: String(r.interview_id), plan: { kind: r.kind as PlanKind, minutes: Number(r.minutes), days } };
}
