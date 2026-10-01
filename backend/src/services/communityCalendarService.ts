import { Op } from 'sequelize';
import LiveSession from '../models/LiveSession';
import OpenHouseEvent from '../models/OpenHouseEvent';
import CommunityEvent from '../models/CommunityEvent';
import { resolveCohortId } from './communityService';
import { classInstant } from './centralDate';

// The private convertTo24h that used to live here is gone, and so is the naive
// `new Date(date + "T" + time)` it fed. Both were the bug centralDate.classInstant
// exists to prevent, and this file had BOTH halves of it:
//
//   1. live_sessions stores Central wall-clock TEXT with no timezone. Parsing it
//      without an offset in a UTC container read 6:30 PM Central as 18:30Z — five
//      to six hours early. Root-caused 2026-07-23, when an Orientation was
//      auto-marked 'completed' hours before its real start and blocked check-in.
//   2. The local regex did not tolerate the trailing seconds a Sequelize TIME
//      column returns ("18:30:00"), so such a value fell through to the '10:00'
//      default and the event silently moved to 10am.
//
// classInstant takes the RAW stored string and normalizes internally, precisely so
// a caller cannot skip the conversion step — which is how the bug nearly regressed
// while being fixed. Do not reintroduce a local parser here.

export type CalendarEventSource = 'live_session' | 'open_house' | 'community_event';

export interface CalendarEvent {
  id: string;
  source: CalendarEventSource;
  title: string;
  event_type: string;
  starts_at: Date;
  ends_at: Date | null;
  meeting_link: string | null;
}

function liveSessionStartsAt(session: LiveSession): Date {
  return classInstant(session.session_date, session.start_time);
}

function liveSessionEndsAt(session: LiveSession): Date {
  return classInstant(session.session_date, session.end_time);
}

// Merges the three real event sources into one sorted feed (REQ-C6). No new
// events table — LiveSession (cohort-scoped Mon/Thu sessions) and
// OpenHouseEvent (cohort-agnostic) are already the authoritative sources;
// CommunityEvent (migrated, previously unused) covers anything ad-hoc like
// office hours that doesn't fit either of those.
export async function getUpcomingEvents(enrollmentId: string, now: Date = new Date()): Promise<CalendarEvent[]> {
  const cohortId = await resolveCohortId(enrollmentId);
  const todayStr = now.toISOString().split('T')[0];

  const [liveSessions, openHouses, communityEvents] = await Promise.all([
    LiveSession.findAll({
      where: { cohort_id: cohortId, status: { [Op.in]: ['scheduled', 'live'] }, session_date: { [Op.gte]: todayStr } },
    }),
    OpenHouseEvent.findAll({
      where: { status: 'scheduled', starts_at: { [Op.gte]: now } },
    }),
    CommunityEvent.findAll({
      where: { cohort_id: cohortId, starts_at: { [Op.gte]: now } },
    }),
  ]);

  const events: CalendarEvent[] = [
    ...liveSessions.map((s): CalendarEvent => ({
      id: s.id,
      source: 'live_session',
      title: s.title,
      event_type: s.session_type,
      starts_at: liveSessionStartsAt(s),
      ends_at: liveSessionEndsAt(s),
      meeting_link: s.meeting_link ?? null,
    })),
    ...openHouses.map((o): CalendarEvent => ({
      id: o.id,
      source: 'open_house',
      title: o.title,
      event_type: 'open_house',
      starts_at: o.starts_at,
      ends_at: null,
      meeting_link: o.meeting_link,
    })),
    ...communityEvents.map((e): CalendarEvent => ({
      id: e.id,
      source: 'community_event',
      title: e.title,
      event_type: e.event_type,
      starts_at: e.starts_at,
      ends_at: e.ends_at,
      meeting_link: e.location_url,
    })),
  ];

  return events
    .filter((e) => e.starts_at >= now)
    .sort((a, b) => a.starts_at.getTime() - b.starts_at.getTime());
}
