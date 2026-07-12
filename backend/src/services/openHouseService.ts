import { Op } from 'sequelize';
import { Enrollment, Cohort, OpenHouseEvent } from '../models';
import { award, hasAwarded } from './pointsService';
import { getNextPublicEvent, isKnownPublicEvent } from './publicEventsService';
import type { FirstClassView, OnboardingSchedule } from './openHouseTypes';

export type { OpenHouseView, FirstClassView, OnboardingSchedule } from './openHouseTypes';

/**
 * Pick the soonest still-upcoming, scheduled open house (pure). Past and
 * non-scheduled (cancelled/completed) events are ignored. Retained as a pure
 * helper for the Postgres-seeded event shape; the live schedule now sources its
 * next event from CCPP via `publicEventsService`.
 */
export function selectNextOpenHouse<T extends { starts_at: Date | string; status: string }>(
  events: T[],
  now: Date,
): T | null {
  const upcoming = events
    .filter((e) => e.status === 'scheduled' && new Date(e.starts_at).getTime() > now.getTime())
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  return upcoming[0] || null;
}

/**
 * True for demo / test / sandbox cohorts (pure). These are fixtures and must
 * never be shown to a prospect as the "next class". Guards the guest branch of
 * the onboarding schedule against e.g. the "Timeline Demo Cohort".
 */
export function isDemoCohortName(name: string | null | undefined): boolean {
  const n = (name || '').toLowerCase();
  return n.includes('demo') || n.includes('test') || n.includes('sandbox');
}

/** Raw cohort scheduling fields the frontend needs to render a live countdown. */
function firstClassFromCohort(cohort: any, source: FirstClassView['source']): FirstClassView | null {
  if (!cohort || !cohort.start_date) return null;
  return {
    start_date: cohort.start_date,
    core_day: cohort.core_day ?? null,
    core_time: cohort.core_time ?? null,
    timezone: cohort.timezone ?? null,
    cohort_name: cohort.name ?? null,
    source,
  };
}

/**
 * Everything the Today / onboarding surface needs: the next open house (+ my
 * RSVP state) and the countdown target for the first class. Members get their
 * own cohort's first class; guests (no cohort) get the next open cohort's start.
 * The frontend renders the live countdown from these fields.
 */
export async function getOnboardingSchedule(enrollmentId: string): Promise<OnboardingSchedule> {
  const now = new Date();

  const enrollment = await Enrollment.findByPk(enrollmentId, {
    include: [{ model: Cohort, as: 'cohort' }],
  });

  // Next event = soonest live public Open House from the CCPP Eventbrite pipeline
  // (publicEventsService caches and falls back to the seeded Postgres table).
  const next = await getNextPublicEvent();
  const myRsvp = next ? await hasAwarded(enrollmentId, `open_house_rsvp:${next.id}`) : false;

  let firstClass: FirstClassView | null = null;
  const ownCohort = enrollment ? (enrollment as any).get?.('cohort') : null;
  if (ownCohort) {
    firstClass = firstClassFromCohort(ownCohort, 'my_cohort');
  } else {
    // Guests get the next open cohort's start date — but never a demo/test
    // fixture cohort, so fetch a small window and skip fixtures.
    const today = now.toISOString().slice(0, 10);
    const openCohorts = await Cohort.findAll({
      where: { status: 'open', start_date: { [Op.gte]: today } },
      order: [['start_date', 'ASC']],
      limit: 5,
    });
    const nextOpen = openCohorts.find((c: any) => !isDemoCohortName(c.name)) || null;
    firstClass = firstClassFromCohort(nextOpen, 'next_open_cohort');
  }

  return {
    next_open_house: next,
    my_rsvp: myRsvp,
    first_class: firstClass,
  };
}

/**
 * RSVP an enrollment to an open house and award `open_house_rsvp` points.
 * Idempotent — the points award is keyed on `open_house_rsvp:<eventId>`, so a
 * repeat RSVP is a no-op (no double points).
 */
export async function rsvpToOpenHouse(
  enrollmentId: string,
  eventId: string,
): Promise<{ ok: boolean; reason?: string; awarded?: boolean; points?: number }> {
  // The event may live in the seeded Postgres table OR be a CCPP-sourced public
  // event (Eventbrite id). Validate against both before awarding so we never
  // award points for an arbitrary id.
  const event = await OpenHouseEvent.findByPk(eventId);
  const known = !!event || (await isKnownPublicEvent(eventId));
  if (!known) return { ok: false, reason: 'not_found' };

  const res = await award(enrollmentId, {
    eventType: 'open_house_rsvp',
    eventKey: `open_house_rsvp:${eventId}`,
    metadata: { open_house_event_id: eventId },
  });
  return { ok: true, awarded: res.awarded, points: res.points };
}
