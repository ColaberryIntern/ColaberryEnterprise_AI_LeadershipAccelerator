import { Op } from 'sequelize';
import LiveSession from '../models/LiveSession';
import OpenHouseEvent from '../models/OpenHouseEvent';
import CommunityEvent from '../models/CommunityEvent';
import { resolveCohortId } from './communityService';

// Local copy of the "5:00 PM" -> "17:00" conversion (acceleratorService.ts
// has the same logic, but importing that service here would transitively
// pull in the entire models barrel via its own imports — not worth the
// coupling for an 8-line parser).
function convertTo24h(timeStr: string): string {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return '10:00';
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const period = match[3]?.toUpperCase();
  if (period === 'PM' && hours < 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return `${hours.toString().padStart(2, '0')}:${minutes}`;
}

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
  return new Date(`${session.session_date}T${convertTo24h(session.start_time)}:00`);
}

function liveSessionEndsAt(session: LiveSession): Date {
  return new Date(`${session.session_date}T${convertTo24h(session.end_time)}:00`);
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
