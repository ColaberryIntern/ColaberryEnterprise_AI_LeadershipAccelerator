import { StudentPointsEvent } from '../models';

/**
 * Canonical earn events + their default point values. Guests start at 0 and earn
 * minimal points through engagement. Keep values small and meaningful; this is
 * the single source of truth for what each action is worth.
 */
export const POINT_EVENTS: Record<string, number> = {
  account_created: 0,        // marker only — a free account starts at 0 points
  profile_completed: 25,
  open_house_rsvp: 10,
  open_house_attended: 50,
  project_dna_completed: 40,
  first_task_complete: 20,
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
    created_at: r.created_at,
    metadata: r.metadata,
  }));
  const total = events.reduce((sum, e) => sum + (e.points || 0), 0);
  return { total, events };
}
