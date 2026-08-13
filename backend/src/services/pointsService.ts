import StudentPointsEvent from '../models/StudentPointsEvent';
import { centralDateKey } from './centralDate';

/**
 * Canonical earn events + their default point values. Guests start at 0 and earn
 * minimal points through engagement. Keep values small and meaningful; this is
 * the single source of truth for what each action is worth.
 */
export const POINT_EVENTS: Record<string, number> = {
  account_created: 0,        // marker only — a free account starts at 0 points
  profile_completed: 25,
  referral_submitted: 25,    // "recommend a friend" onboarding step — one award per enrollment regardless of friend count
  open_house_rsvp: 10,
  open_house_attended: 50,
  project_dna_completed: 40,
  first_task_complete: 20,
  // Curriculum completion (the engagement points the HUD total sums). Amounts here
  // are fallbacks; per-type / per-card overrides live in points_config and are
  // resolved by cardPointsService before award() is called.
  card_complete: 5,
  survey_complete: 10,
  knowledge_check: 15,
  evaluation_passed: 20,
  lesson_complete: 10,
  deep_dive_field_guide: 100,   // one-time bonus for uploading a Deep Dive Field Guide built in Claude Code
  session_attended: 25,         // joining a live class session (once per session, present or late)
};

export interface AwardInput {
  eventType: string;
  eventKey?: string;   // defaults to eventType (once-only); pass a unique key for repeatable events
  points?: number;     // overrides the registry default
  metadata?: any;
}

export interface PointsSummary {
  total: number;
  events: Array<{ event_type: string; event_key: string; points: number; created_at: Date; metadata: any }>;
}

/** Resolve the points for an event (pure): explicit override, else registry, else 0. */
export function resolveEventPoints(eventType: string, override?: number): number {
  if (typeof override === 'number') return override;
  return POINT_EVENTS[eventType] ?? 0;
}

/**
 * Award points to an enrollment for an event. Idempotent per
 * (enrollment_id, event_key): re-awarding the same event is a no-op, so this is
 * safe on retries and repeated user actions. Returns whether points were newly
 * awarded and how many.
 */
export async function award(enrollmentId: string, input: AwardInput): Promise<{ awarded: boolean; points: number }> {
  const eventKey = input.eventKey || input.eventType;
  const points = resolveEventPoints(input.eventType, input.points);
  const [, created] = await StudentPointsEvent.findOrCreate({
    where: { enrollment_id: enrollmentId, event_key: eventKey },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sequelize creation attrs
    defaults: {
      enrollment_id: enrollmentId,
      event_type: input.eventType,
      event_key: eventKey,
      points,
      metadata: input.metadata ?? null,
    } as any,
  });
  return { awarded: created, points: created ? points : 0 };
}

/**
 * Remove a previously-awarded event (an action was undone — e.g. an unlike).
 * Idempotent: revoking an event that was never awarded, or already revoked, is a
 * no-op. Keyed the same as award(), so a toggleable action awards on and revokes
 * off the same (enrollment_id, event_key). Returns whether a row was removed.
 */
export async function revoke(enrollmentId: string, eventKey: string): Promise<{ revoked: boolean }> {
  const removed = await StudentPointsEvent.destroy({ where: { enrollment_id: enrollmentId, event_key: eventKey } });
  return { revoked: removed > 0 };
}

/** Whether a specific event has already been awarded to an enrollment (idempotency check). */
export async function hasAwarded(enrollmentId: string, eventKey: string): Promise<boolean> {
  const row = await StudentPointsEvent.findOne({ where: { enrollment_id: enrollmentId, event_key: eventKey } });
  return !!row;
}

/**
 * Sum the points an enrollment has banked TODAY (Central day) across a set of
 * event_types — the running category total a daily anti-cheat cap clamps
 * against (see progression/dailyCap). `todayKey` is the caller's Central date
 * key (from centralDateKey) so the day boundary matches the streak/HUD's notion
 * of "today" everywhere. Rows are filtered to today in JS via the same
 * central-date function rather than a tz-fragile SQL range. An empty type list
 * short-circuits to 0 (no query).
 */
export async function sumPointsTodayByEventTypes(
  enrollmentId: string,
  eventTypes: string[],
  todayKey: string,
): Promise<number> {
  if (eventTypes.length === 0) return 0;
  const rows = await StudentPointsEvent.findAll({
    where: { enrollment_id: enrollmentId, event_type: eventTypes },
    // Sequelize's auto-timestamp attribute is `createdAt` (camelCase) even
    // with `underscored: true` on the model — that option only renames the
    // DB COLUMN to created_at, not the JS attribute. Requesting the literal
    // string 'created_at' here is not a recognized model attribute, so
    // Sequelize silently drops it and every row comes back with no date at
    // all, which the bug below compounds.
    attributes: ['points', 'createdAt'],
  });
  let sum = 0;
  for (const r of rows as any[]) {
    const created = r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt);
    if (centralDateKey(created.getTime()) === todayKey) sum += r.points || 0;
  }
  return sum;
}

// ── Canonical level ladder (the ONE ladder; mirrors frontend onboardingApi.LEVELS).
// Every "level" shown anywhere — HUD, community profile, leaderboard badge —
// derives from a student's canonical points via this table.
export const LEVELS = [
  { level: 1, name: 'Apprentice', min: 0 },
  { level: 2, name: 'Builder', min: 150 },
  { level: 3, name: 'Architect', min: 400 },
  { level: 4, name: 'Principal', min: 900 },
] as const;

/** Canonical level for a points total (deterministic, pure). */
export function levelForPoints(points: number): { level: number; name: string } {
  let cur: { level: number; name: string; min: number } = LEVELS[0];
  for (const l of LEVELS) if (points >= l.min) cur = l;
  return { level: cur.level, name: cur.name };
}

/** Batch canonical totals for many enrollments (one query) → Map<enrollmentId, total>. */
export async function getTotalsForEnrollments(enrollmentIds: string[]): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (enrollmentIds.length === 0) return totals;
  const rows = await StudentPointsEvent.findAll({ where: { enrollment_id: enrollmentIds } });
  for (const r of rows as any[]) {
    totals.set(r.enrollment_id, (totals.get(r.enrollment_id) ?? 0) + (r.points || 0));
  }
  return totals;
}

/** Total points + full event history for an enrollment (newest first). */
export async function getPointsSummary(enrollmentId: string): Promise<PointsSummary> {
  const rows = await StudentPointsEvent.findAll({
    where: { enrollment_id: enrollmentId },
    order: [['created_at', 'DESC']],
  });
  const events = rows.map((r: any) => ({
    event_type: r.event_type,
    event_key: r.event_key,
    points: r.points,
    // Sequelize's auto-timestamp attribute is `createdAt` (camelCase) —
    // `underscored: true` on the model only renames the DB column to
    // created_at, not this JS property. Reading r.created_at silently
    // returned undefined on every row, which JSON.stringify then drops
    // from the API response entirely — every consumer (Schedule's
    // per-day point badges, the Points page's "Recent points" list) saw
    // no date at all and could never bucket/display these events by day.
    created_at: r.createdAt,
    metadata: r.metadata,
  }));
  const total = events.reduce((sum, e) => sum + (e.points || 0), 0);
  return { total, events };
}
