import { findLiveMeeting, parseTimeToMinutes } from '../meetingLive';
import type { RequiredMeeting } from '../../../../services/internshipApi';

const meetings: RequiredMeeting[] = [
  { day: 'Monday', kind: 'standup', time: '9:00 AM', timezone: 'CT', audience: 'interns_only', title: 'Intern standup', room_slug: 'ai-internship-standup' },
  { day: 'Friday', kind: 'session', time: '9:00 AM', timezone: 'CT', audience: 'public', title: 'AI Friday Trends', room_slug: 'colaberry-ai-sessions' },
];

// Central is UTC-5 in September (CDT), so 14:00Z = 9:00 CT.
const at = (iso: string) => new Date(iso);

describe('parseTimeToMinutes', () => {
  it('parses AM/PM to minutes past midnight', () => {
    expect(parseTimeToMinutes('9:00 AM')).toBe(540);
    expect(parseTimeToMinutes('12:00 PM')).toBe(720);
    expect(parseTimeToMinutes('12:30 AM')).toBe(30);
    expect(parseTimeToMinutes('1:15 PM')).toBe(795);
  });
  it('returns null for junk or missing', () => {
    expect(parseTimeToMinutes(undefined)).toBeNull();
    expect(parseTimeToMinutes('noon')).toBeNull();
  });
});

describe('findLiveMeeting', () => {
  it('flags the Monday standup live at its start time (CT)', () => {
    // 2026-09-14 is a Monday; 14:00Z = 9:00 CDT.
    const live = findLiveMeeting(meetings, at('2026-09-14T14:00:00.000Z'));
    expect(live?.title).toBe('Intern standup');
    expect(live?.room_slug).toBe('ai-internship-standup');
  });

  it('still live 30 minutes in, but not two hours later', () => {
    expect(findLiveMeeting(meetings, at('2026-09-14T14:30:00.000Z'))?.title).toBe('Intern standup');
    expect(findLiveMeeting(meetings, at('2026-09-14T16:00:00.000Z'))).toBeNull();
  });

  it('is null before the meeting starts', () => {
    expect(findLiveMeeting(meetings, at('2026-09-14T13:30:00.000Z'))).toBeNull();
  });

  it('is null on a day with no meeting', () => {
    // 2026-09-15 is a Tuesday; these two meetings are Mon and Fri.
    expect(findLiveMeeting(meetings, at('2026-09-15T14:00:00.000Z'))).toBeNull();
  });

  it('matches the right meeting on Friday', () => {
    // 2026-09-18 is a Friday.
    expect(findLiveMeeting(meetings, at('2026-09-18T14:00:00.000Z'))?.title).toBe('AI Friday Trends');
  });
});
