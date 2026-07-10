import { Op } from 'sequelize';
import { Enrollment, Cohort, OpenHouseEvent } from '../models';
import { award, hasAwarded } from './pointsService';

export interface OpenHouseView {
  id: string;
  title: string;
  description: string | null;
  starts_at: Date;
  timezone: string;
  registration_url: string | null;
  meeting_link: string | null;
}

export interface FirstClassView {
  start_date: string;
  core_day: string | null;
  core_time: string | null;
  timezone: string | null;
  cohort_name: string | null;
  source: 'my_cohort' | 'next_open_cohort';
}

export interface OnboardingSchedule {
  next_open_house: OpenHouseView | null;
  my_rsvp: boolean;
  first_class: FirstClassView | null;
}

/**
 * Pick the soonest still-upcoming, scheduled open house (pure). Past and
 * non-scheduled (cancelled/completed) events are ignored.
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

function toView(e: OpenHouseEvent): OpenHouseView {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    starts_at: e.starts_at,
    timezone: e.timezone,
    registration_url: e.registration_url,
    meeting_link: e.meeting_link,
  };
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

  const events = await OpenHouseEvent.findAll({ where: { status: 'scheduled' } });
  const next = selectNextOpenHouse(events, now);
  const myRsvp = next ? await hasAwarded(enrollmentId, `open_house_rsvp:${next.id}`) : false;

  let firstClass: FirstClassView | null = null;
  const ownCohort = enrollment ? (enrollment as any).get?.('cohort') : null;
  if (ownCohort) {
    firstClass = firstClassFromCohort(ownCohort, 'my_cohort');
  } else {
    const today = now.toISOString().slice(0, 10);
    const nextOpen = await Cohort.findOne({
      where: { status: 'open', start_date: { [Op.gte]: today } },
      order: [['start_date', 'ASC']],
    });
    firstClass = firstClassFromCohort(nextOpen, 'next_open_cohort');
  }

  return {
    next_open_house: next ? toView(next) : null,
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
  const event = await OpenHouseEvent.findByPk(eventId);
  if (!event) return { ok: false, reason: 'not_found' };

  const res = await award(enrollmentId, {
    eventType: 'open_house_rsvp',
    eventKey: `open_house_rsvp:${eventId}`,
    metadata: { open_house_event_id: eventId },
  });
  return { ok: true, awarded: res.awarded, points: res.points };
}
