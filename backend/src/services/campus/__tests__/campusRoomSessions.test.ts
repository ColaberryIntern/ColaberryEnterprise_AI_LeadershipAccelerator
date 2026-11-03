/**
 * The scheduled-session window: when the timetable claims a room, and when it must not.
 *
 * WHAT THESE TESTS ARE REALLY GUARDING. The schedule used to drive nothing, so there was
 * no wrong answer to produce. Now it decides whether a room appears on the campus at all
 * (`campusHallway`'s keep-filter) and what its door says — which means a wrong window is
 * worse than none: it sends someone to a room at a time nothing is happening, which is
 * the class of defect the whole campus-rooms repair started from.
 *
 * Two of them matter more than the rest:
 *  - the unreadable-time case, because `convertTo24h` answers '10:00' for anything it
 *    cannot parse, and a caller that decides something must not inherit that default;
 *  - the DST pair, because the same "9:00 AM" is 15:00Z in November and 14:00Z in July,
 *    and a naive parse has already caused a production incident on this exact data.
 *
 * The instants below are measured, not reasoned: 2026-11-02 is a Monday in CST (UTC-6),
 * 2026-07-06 is a Monday in CDT (UTC-5).
 */

import {
  roomSessionWindows, SESSION_MINUTES, LEAD_MINUTES, type ScheduledMeeting,
} from '../campusRoomSessions';
import { centralWeekdayName, isReadableClockTime } from '../../centralDate';

/** Monday 9:00 AM Central, the real intern standup. */
const STANDUP: ScheduledMeeting = { day: 'monday', time: '9:00 AM', title: 'Intern standup', room_id: 'room-interns' };
/** Tuesday 10:00 AM Central, a real public session. */
const PUBLIC_TUE: ScheduledMeeting = { day: 'tuesday', time: '10:00 AM', title: 'AI Session', room_id: 'room-public' };

const at = (iso: string) => new Date(iso);
const MON_9AM_CST = '2026-11-02T15:00:00.000Z';
const MON_10AM_CST = '2026-11-02T16:00:00.000Z';

describe('centralWeekdayName', () => {
  it('names the weekday of a Central date key', () => {
    expect(centralWeekdayName('2026-11-02')).toBe('monday');
    expect(centralWeekdayName('2026-11-01')).toBe('sunday');
    expect(centralWeekdayName('2026-07-06')).toBe('monday');
  });

  it('returns empty rather than a confident wrong weekday for a non-date', () => {
    for (const bad of ['', 'monday', '2026-11-2', 'not-a-date', '2026-13-45']) {
      expect(centralWeekdayName(bad)).toBe('');
    }
  });
});

describe('isReadableClockTime', () => {
  it.each(['9:00 AM', '09:00', '09:00:00', '6:30 PM', '23:59'])('accepts %p', (t) => {
    expect(isReadableClockTime(t)).toBe(true);
  });

  it.each(['9am', 'noon', '', '9', '25:00:00 nope'])('rejects %p', (t) => {
    expect(isReadableClockTime(t)).toBe(false);
  });

  it('rejects a non-string instead of coercing it', () => {
    expect(isReadableClockTime(undefined)).toBe(false);
    expect(isReadableClockTime(900)).toBe(false);
  });
});

describe('roomSessionWindows — the window', () => {
  it('claims the room while the session is running', () => {
    const got = roomSessionWindows([STANDUP], at('2026-11-02T15:30:00Z'));
    expect(got.get('room-interns')).toEqual({
      title: 'Intern standup',
      start_at: MON_9AM_CST,
      end_at: MON_10AM_CST,
      in_progress: true,
    });
  });

  it('claims it at the exact start instant', () => {
    expect(roomSessionWindows([STANDUP], at(MON_9AM_CST)).get('room-interns')?.in_progress).toBe(true);
  });

  it('claims it during the lead window, marked NOT yet in progress', () => {
    const got = roomSessionWindows([STANDUP], at('2026-11-02T14:50:00Z')).get('room-interns');
    expect(got?.in_progress).toBe(false);
    expect(got?.start_at).toBe(MON_9AM_CST);
  });

  it('claims it at the exact instant the lead window opens', () => {
    expect(roomSessionWindows([STANDUP], at('2026-11-02T14:45:00Z')).has('room-interns')).toBe(true);
  });

  it('does NOT claim it one minute before the lead window', () => {
    expect(roomSessionWindows([STANDUP], at('2026-11-02T14:44:00Z')).size).toBe(0);
  });

  it('releases the room at the end instant — half-open, so 10:00 is free', () => {
    // A session finishing at 10:00 must not hold the room at 10:00, for the same reason
    // the booking ranges are '[)': back-to-back sessions would otherwise collide.
    expect(roomSessionWindows([STANDUP], at(MON_10AM_CST)).size).toBe(0);
  });

  it('still claims it one minute before the end', () => {
    expect(roomSessionWindows([STANDUP], at('2026-11-02T15:59:00Z')).has('room-interns')).toBe(true);
  });
});

describe('roomSessionWindows — DST is not optional', () => {
  it('resolves the SAME "9:00 AM" to 15:00Z in CST and 14:00Z in CDT', () => {
    const winter = roomSessionWindows([STANDUP], at('2026-11-02T15:10:00Z')).get('room-interns');
    const summer = roomSessionWindows([STANDUP], at('2026-07-06T14:10:00Z')).get('room-interns');
    expect(winter?.start_at).toBe('2026-11-02T15:00:00.000Z');
    expect(summer?.start_at).toBe('2026-07-06T14:00:00.000Z');
  });

  it('does not claim the room an hour off in summer', () => {
    // 15:10Z in July is 10:10 Central — the standup ended at 10:00. A naive parse that
    // ignored DST would still report it running.
    expect(roomSessionWindows([STANDUP], at('2026-07-06T15:10:00Z')).size).toBe(0);
  });
});

describe('roomSessionWindows — what it refuses to invent', () => {
  it('produces NO window for a time it cannot read, rather than one at 10:00', () => {
    // The trap. `convertTo24h('9am')` returns '10:00', so a caller that did not check
    // would announce a 10:00 Central session that is not in anyone's timetable.
    const broken: ScheduledMeeting = { ...STANDUP, time: '9am' };
    expect(roomSessionWindows([broken], at(MON_10AM_CST)).size).toBe(0);
    expect(roomSessionWindows([broken], at('2026-11-02T16:30:00Z')).size).toBe(0);
  });

  it('skips a meeting with no room, because binding to a room is the point', () => {
    for (const roomId of [null, '', '   ']) {
      const unbound: ScheduledMeeting = { ...STANDUP, room_id: roomId };
      expect(roomSessionWindows([unbound], at('2026-11-02T15:30:00Z')).size).toBe(0);
    }
  });

  it('does not claim a room on the wrong weekday', () => {
    // Tuesday's session, asked about on Monday.
    expect(roomSessionWindows([PUBLIC_TUE], at('2026-11-02T16:10:00Z')).size).toBe(0);
  });

  it('matches the CAPITALISED day names production actually stores', () => {
    // Measured against production on 2026-11-02: the stored timetable reads "Monday",
    // "Tuesday", "Wednesday", "Friday" — capitalised — while every other fixture in
    // this file is lowercase because that is what `sessionsFor` hands over. Both paths
    // have to work: this module is reachable with raw `required_meetings` too, and
    // without this test, deleting the `.toLowerCase()` passes the whole suite and
    // silently stops matching every real meeting.
    const asStored: ScheduledMeeting = { day: 'Monday', time: '9:00 AM', title: 'Intern standup', room_id: 'room-interns' };
    expect(roomSessionWindows([asStored], at('2026-11-02T15:30:00Z')).get('room-interns')?.in_progress).toBe(true);
  });

  it('tolerates a day with stray whitespace', () => {
    const padded: ScheduledMeeting = { ...STANDUP, day: '  monday  ' };
    expect(roomSessionWindows([padded], at('2026-11-02T15:30:00Z')).has('room-interns')).toBe(true);
  });

  it('binds three meetings that share ONE room on different days', () => {
    // The real shape of production: Tue/Wed/Fri all run in Colaberry AI Sessions. Only
    // the day being asked about may claim it.
    const shared = (day: string): ScheduledMeeting => ({ day, time: '10:00 AM', title: 'AI Session', room_id: 'room-public' });
    const tuesday = at('2026-11-03T16:10:00Z');
    const got = roomSessionWindows([shared('Tuesday'), shared('Wednesday'), shared('Friday')], tuesday);
    expect(got.size).toBe(1);
    expect(got.get('room-public')?.start_at).toBe('2026-11-03T16:00:00.000Z');
  });

  it('returns nothing for an unparsable now rather than throwing', () => {
    expect(roomSessionWindows([STANDUP], new Date('not-a-date')).size).toBe(0);
  });

  it('returns nothing for an empty timetable', () => {
    expect(roomSessionWindows([], at(MON_9AM_CST)).size).toBe(0);
  });

  it('falls back to "Session" for a blank title rather than an empty label', () => {
    const untitled: ScheduledMeeting = { ...STANDUP, title: '   ' };
    expect(roomSessionWindows([untitled], at('2026-11-02T15:30:00Z')).get('room-interns')?.title)
      .toBe('Session');
  });
});

describe('roomSessionWindows — midnight, which the current timetable never hits', () => {
  it('keeps a session that started before midnight and is still running', () => {
    // Sunday 23:30 Central, asked about at 00:10 Monday Central (06:10Z).
    const late: ScheduledMeeting = { day: 'sunday', time: '11:30 PM', title: 'Late sync', room_id: 'room-late' };
    const got = roomSessionWindows([late], at('2026-11-02T06:10:00Z')).get('room-late');
    expect(got?.in_progress).toBe(true);
    expect(got?.start_at).toBe('2026-11-02T05:30:00.000Z');
  });

  it('opens a lead window that reaches back across midnight', () => {
    // Tuesday 00:05 Central = 06:05Z Tuesday; asked at 23:55 Monday Central = 05:55Z Tue.
    const early: ScheduledMeeting = { day: 'tuesday', time: '12:05 AM', title: 'Early sync', room_id: 'room-early' };
    const got = roomSessionWindows([early], at('2026-11-03T05:55:00Z')).get('room-early');
    expect(got?.in_progress).toBe(false);
    expect(got?.start_at).toBe('2026-11-03T06:05:00.000Z');
  });
});

describe('roomSessionWindows — more than one claim on a room', () => {
  const running: ScheduledMeeting = { day: 'monday', time: '9:00 AM', title: 'Running', room_id: 'shared' };
  const soon: ScheduledMeeting = { day: 'monday', time: '10:00 AM', title: 'Soon', room_id: 'shared' };

  it('prefers the session already running over the one about to start', () => {
    // 15:50Z = 9:50 Central: the 9:00 is running, the 10:00 is inside its lead window.
    const got = roomSessionWindows([soon, running], at('2026-11-02T15:50:00Z')).get('shared');
    expect(got?.title).toBe('Running');
    expect(got?.in_progress).toBe(true);
  });

  it('is order-independent', () => {
    const a = roomSessionWindows([soon, running], at('2026-11-02T15:50:00Z')).get('shared');
    const b = roomSessionWindows([running, soon], at('2026-11-02T15:50:00Z')).get('shared');
    expect(a).toEqual(b);
  });

  it('prefers the earlier start when neither has begun', () => {
    const early: ScheduledMeeting = { day: 'monday', time: '4:00 PM', title: 'Early', room_id: 'shared' };
    const later: ScheduledMeeting = { day: 'monday', time: '4:10 PM', title: 'Later', room_id: 'shared' };
    // 21:50Z = 15:50 Central: both are inside their lead windows, neither started.
    const got = roomSessionWindows([later, early], at('2026-11-02T21:50:00Z')).get('shared');
    expect(got?.title).toBe('Early');
    expect(got?.in_progress).toBe(false);
  });

  it('keeps separate rooms separate', () => {
    const tueNow = at('2026-11-03T16:10:00Z');  // Tuesday 10:10 Central
    const got = roomSessionWindows([STANDUP, PUBLIC_TUE], tueNow);
    expect(got.has('room-public')).toBe(true);
    expect(got.has('room-interns')).toBe(false);
  });
});

describe('roomSessionWindows — the tunable parts', () => {
  it('honours a caller-supplied duration', () => {
    // 30 minutes: the room is free at 9:30 Central (15:30Z), which the 60-minute
    // default still holds.
    expect(roomSessionWindows([STANDUP], at('2026-11-02T15:30:00Z'), { sessionMinutes: 30 }).size).toBe(0);
    expect(roomSessionWindows([STANDUP], at('2026-11-02T15:30:00Z')).size).toBe(1);
  });

  it('honours a caller-supplied lead', () => {
    expect(roomSessionWindows([STANDUP], at('2026-11-02T14:30:00Z'), { leadMinutes: 45 }).size).toBe(1);
    expect(roomSessionWindows([STANDUP], at('2026-11-02T14:30:00Z')).size).toBe(0);
  });

  it('states its defaults, so a change to them is a visible decision', () => {
    expect(SESSION_MINUTES).toBe(60);
    expect(LEAD_MINUTES).toBe(15);
  });
});
