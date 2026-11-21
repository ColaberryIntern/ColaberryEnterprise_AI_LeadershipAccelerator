const mockUpdate = jest.fn();
const mockGetSlots = jest.fn();
const mockFind = jest.fn();
const mockFree = jest.fn();
const mockInsert = jest.fn();
const mockDefault = jest.fn(() => ({ kind: 'default', calendarId: 'ali@colaberry.com', ownerEmail: 'ali@colaberry.com' }));
const mockAdmissions = jest.fn(() => ({ kind: 'admissions', calendarId: 'roselen@colaberry.com', ownerEmail: 'roselen@colaberry.com' }));
const mockOverrides = jest.fn();
const mockVoice = jest.fn();
const mockCallable = jest.fn();

jest.mock('../../../models/EnterpriseIntake', () => ({ __esModule: true, default: { update: (...a: any[]) => mockUpdate(...a) } }));
jest.mock('../../calendarService', () => ({
  getAvailableSlots: (...a: any[]) => mockGetSlots(...a),
  findEventsByPrivateProperty: (...a: any[]) => mockFind(...a),
  isSlotFree: (...a: any[]) => mockFree(...a),
  insertCampusEvent: (...a: any[]) => mockInsert(...a),
}));
jest.mock('../../calendarTarget', () => ({ defaultCalendar: () => mockDefault(), admissionsCalendar: () => mockAdmissions() }));
jest.mock('../../settingsService', () => ({ getTestOverrides: () => mockOverrides() }));
jest.mock('../enterpriseIntakeService', () => ({ voiceConfigured: () => mockVoice(), callable: (i: any) => mockCallable(i) }));
const mockMeetingSoon = jest.fn();
const mockBriefSoon = jest.fn();
jest.mock('../enterpriseIntakeMeetingPost', () => ({ postMeetingSoon: (id: string) => mockMeetingSoon(id) }));
jest.mock('../enterpriseIntakeAliBrief', () => ({ aliBriefSoon: (id: string) => mockBriefSoon(id) }));

import {
  isHoliday,
  bookMeeting,
  earliestMeetingStart,
  filterSlots,
  isBookableShape,
  listMeetingSlots,
  meetingAnchor,
  ScheduleRefused,
  CalendarUnavailable,
  setInterviewPlan,
} from '../enterpriseIntakeSchedule';

const iso = (d: Date) => d.toISOString();

function intake(over: Record<string, any> = {}): any {
  const row: any = {
    id: '11111111-2222-3333-4444-555555555555',
    full_name: 'Pat Doe',
    email: 'pat@acme.com',
    company: 'Acme',
    phone: '+15555550100',
    call_consent: true,
    interviewed_at: null,
    interview_mode: null,
    interview_scheduled_for: null,
    meeting_start: null,
    meeting_end: null,
    meeting_link: null,
    ...over,
  };
  row.update = jest.fn(async (v: any) => Object.assign(row, v));
  return row;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdate.mockResolvedValue([1]);
  mockOverrides.mockResolvedValue({ enabled: false });
  mockFind.mockResolvedValue([]);
  mockFree.mockResolvedValue(true);
  mockVoice.mockReturnValue(false);
  mockCallable.mockReturnValue(true);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('earliestMeetingStart: next business day, Central time', () => {
  it.each([
    ['Friday afternoon -> Monday', '2026-11-20T21:00:00Z', '2026-11-23T06:00:00.000Z'],
    ['Saturday -> Monday', '2026-11-21T18:00:00Z', '2026-11-23T06:00:00.000Z'],
    ['Sunday -> Monday', '2026-11-22T18:00:00Z', '2026-11-23T06:00:00.000Z'],
    ['Thursday 11:30 PM CT -> Friday', '2026-11-20T05:30:00Z', '2026-11-20T06:00:00.000Z'],
    ['Sunday 9 PM CT (already Monday in UTC) -> Monday', '2026-11-23T03:00:00Z', '2026-11-23T06:00:00.000Z'],
    ['spring forward: Friday -> Monday at CDT midnight', '2027-03-12T18:00:00Z', '2027-03-15T05:00:00.000Z'],
    ['fall back: Friday (CDT) -> Monday at CST midnight', '2026-10-30T17:00:00Z', '2026-11-02T06:00:00.000Z'],
  ])('%s', (_label, at, want) => {
    expect(iso(earliestMeetingStart(new Date(at)))).toBe(want);
  });
});

describe('holidays (live check: Thanksgiving was bookable)', () => {
  it.each([
    [2026, 11, 26, true], [2026, 11, 27, true], [2027, 11, 25, true], [2027, 11, 26, true],
    [2026, 12, 25, true], [2026, 12, 24, true], [2027, 1, 1, true], [2027, 5, 31, true], [2027, 9, 6, true], [2027, 7, 4, true],
    [2026, 11, 23, false], [2026, 11, 25, false], [2027, 5, 24, false],
  ])('%i-%i-%i holiday %s', (y, m, d, want) => expect(isHoliday(y as number, m as number, d as number)).toBe(want));

  it('the day before Thanksgiving goes to the Monday after', () => {
    expect(earliestMeetingStart(new Date('2026-11-25T18:00:00Z')).toISOString()).toBe('2026-11-30T06:00:00.000Z');
  });

  it('slots on holidays are not offered, and cannot be booked', () => {
    const avail = { timezone: 'America/Chicago', dates: [
      { date: '2026-11-26', slots: [{ start: '2026-11-26T15:00:00-06:00', end: '2026-11-26T15:30:00-06:00' }] },
      { date: '2026-11-30', slots: [{ start: '2026-11-30T15:00:00-06:00', end: '2026-11-30T15:30:00-06:00' }] },
    ] };
    expect(filterSlots(avail, new Date('2026-11-23T06:00:00Z')).map((d) => d.date)).toEqual(['2026-11-30']);
    expect(isBookableShape(new Date('2026-11-27T15:00:00Z'))).toBe(false);
  });
});

describe('meetingAnchor', () => {
  const now = new Date('2026-11-21T15:00:00Z');
  it('is the interview when it is done', () => {
    expect(iso(meetingAnchor(intake({ interviewed_at: new Date('2026-11-19T15:00:00Z') }), now))).toBe('2026-11-19T15:00:00.000Z');
  });
  it('is the scheduled time when later', () => {
    expect(iso(meetingAnchor(intake({ interview_mode: 'later', interview_scheduled_for: new Date('2026-11-24T15:00:00Z') }), now))).toBe('2026-11-24T15:00:00.000Z');
  });
  it('is now otherwise', () => {
    expect(meetingAnchor(intake(), now)).toBe(now);
  });
});

describe('isBookableShape', () => {
  it.each([
    ['Mon 9:00 CT', '2026-11-23T15:00:00Z', true],
    ['Mon 4:30 PM CT', '2026-11-23T22:30:00Z', true],
    ['Mon 5:00 PM CT', '2026-11-23T23:00:00Z', false],
    ['Mon 10:15 CT', '2026-11-23T16:15:00Z', false],
    ['Sat 10:00 CT', '2026-11-21T16:00:00Z', false],
  ])('%s', (_l, at, ok) => expect(isBookableShape(new Date(at))).toBe(ok));
});

describe('slots', () => {
  const avail = {
    timezone: 'America/Chicago',
    dates: [
      { date: '2026-11-21', slots: [{ start: '2026-11-21T09:00:00-06:00', end: '2026-11-21T09:30:00-06:00' }] },
      { date: '2026-11-23', slots: [{ start: '2026-11-23T09:00:00-06:00', end: '2026-11-23T09:30:00-06:00' }] },
    ],
  };
  it('drops everything before the earliest start, and empty days', () => {
    expect(filterSlots(avail, new Date('2026-11-23T06:00:00Z'))).toEqual([avail.dates[1]]);
  });
  it('reads ALI\'S calendar (default target), never admissions', async () => {
    mockGetSlots.mockResolvedValue(avail);
    const out = await listMeetingSlots(intake(), new Date('2026-11-20T21:00:00Z'));
    expect(mockGetSlots).toHaveBeenCalledWith(21, expect.objectContaining({ kind: 'default', calendarId: 'ali@colaberry.com' }));
    expect(mockAdmissions).not.toHaveBeenCalled();
    expect(out.earliest).toBe('2026-11-23T06:00:00.000Z');
    expect(out.dates).toHaveLength(1);
  });
  it('a calendar failure is CalendarUnavailable', async () => {
    mockGetSlots.mockRejectedValue(new Error('boom'));
    await expect(listMeetingSlots(intake())).rejects.toBeInstanceOf(CalendarUnavailable);
  });
});

describe('setInterviewPlan', () => {
  const now = new Date('2026-11-21T15:00:00Z');
  it('later stores the time and resets the reminder', async () => {
    const i = intake();
    const out = await setInterviewPlan(i, { mode: 'later', at: '2026-11-24T15:00:00Z' }, now);
    expect(out).toEqual({ mode: 'later', at: '2026-11-24T15:00:00.000Z', via: 'chat' });
    expect(i.update).toHaveBeenCalledWith(expect.objectContaining({ interview_mode: 'later', interview_reminder_sent_at: null, interview_reminder_attempts: 0 }));
  });
  it('later needs a time, 30 minutes to 14 days out', async () => {
    await expect(setInterviewPlan(intake(), { mode: 'later' }, now)).rejects.toMatchObject({ code: 'time_required' });
    await expect(setInterviewPlan(intake(), { mode: 'later', at: '2026-11-21T15:10:00Z' }, now)).rejects.toMatchObject({ code: 'too_soon' });
    await expect(setInterviewPlan(intake(), { mode: 'later', at: '2026-12-10T15:00:00Z' }, now)).rejects.toMatchObject({ code: 'too_far' });
  });
  it('refuses once interviewed', async () => {
    await expect(setInterviewPlan(intake({ interviewed_at: now }), { mode: 'now' }, now)).rejects.toMatchObject({ code: 'already_interviewed' });
  });
  it('refuses a later time that would put the booked meeting less than a business day after it', async () => {
    const i = intake({ meeting_start: new Date('2026-11-24T15:00:00Z') });
    await expect(setInterviewPlan(i, { mode: 'later', at: '2026-11-24T14:00:00Z' }, now)).rejects.toMatchObject({ code: 'meeting_too_soon' });
  });
  it('a call is only kept when voice is configured and they may be called', async () => {
    expect((await setInterviewPlan(intake(), { mode: 'now', via: 'call' }, now)).via).toBe('chat');
    mockVoice.mockReturnValue(true);
    expect((await setInterviewPlan(intake(), { mode: 'now', via: 'call' }, now)).via).toBe('call');
  });
});

describe('bookMeeting', () => {
  const now = new Date('2026-11-20T21:00:00Z'); // Friday afternoon CT
  const monday9 = '2026-11-23T15:00:00.000Z';
  const ev = { eventId: 'ev1', startTime: monday9, endTime: '2026-11-23T15:30:00.000Z', meetLink: 'https://meet.google.com/x', props: {}, created: '' };

  it('books on Ali\'s calendar with the client and Ali invited, tagged, with a stable request id', async () => {
    mockInsert.mockResolvedValue(ev);
    const i = intake();
    const out = await bookMeeting(i, monday9, now);
    expect(out.status).toBe('booked');
    expect(out.meeting).toEqual({ start: monday9, end: '2026-11-23T15:30:00.000Z', link: 'https://meet.google.com/x' });
    const [input, target] = mockInsert.mock.calls[0];
    expect(target).toMatchObject({ kind: 'default', calendarId: 'ali@colaberry.com' });
    expect(mockAdmissions).not.toHaveBeenCalled();
    expect(input.attendees).toEqual([{ email: 'pat@acme.com', displayName: 'Pat Doe' }, { email: 'ali@colaberry.com' }]);
    expect(input.privateProps).toEqual({ enterprise_intake_id: i.id });
    expect(input.requestId).toBe(`ent-${i.id}-${new Date(monday9).getTime()}`);
    expect(i.update).toHaveBeenCalledWith(expect.objectContaining({ meeting_event_id: 'ev1' }));
  });

  it("after booking, posts the meeting to Basecamp and tries Ali's brief", async () => {
    mockInsert.mockResolvedValue(ev);
    const i = intake();
    await bookMeeting(i, monday9, now);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(mockMeetingSoon).toHaveBeenCalledWith(i.id);
    expect(mockBriefSoon).toHaveBeenCalledWith(i.id);
  });

  it('test mode invites the test inbox instead of the client', async () => {
    mockOverrides.mockResolvedValue({ enabled: true, email: 'test@colaberry.com' });
    mockInsert.mockResolvedValue(ev);
    await bookMeeting(intake(), monday9, now);
    expect(mockInsert.mock.calls[0][0].attendees[0].email).toBe('test@colaberry.com');
  });

  it('refuses a time before the next business day', async () => {
    await expect(bookMeeting(intake(), '2026-11-20T22:00:00.000Z', now)).rejects.toMatchObject({ code: 'too_soon' });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('refuses a time the calendar would not offer', async () => {
    await expect(bookMeeting(intake(), '2026-11-23T16:15:00.000Z', now)).rejects.toMatchObject({ code: 'not_offered' });
  });

  it('the claim only lands on an unbooked row whose claim is empty or stale (2 minutes)', async () => {
    mockInsert.mockResolvedValue(ev);
    const { Op } = jest.requireActual('sequelize');
    await bookMeeting(intake(), monday9, now);
    const [values, opts] = mockUpdate.mock.calls[0];
    expect(values).toEqual({ meeting_booking_at: now });
    expect(opts.where.id).toBe('11111111-2222-3333-4444-555555555555');
    expect(opts.where.meeting_start).toBeNull();
    const or = opts.where[Op.or];
    expect(or[0]).toEqual({ meeting_booking_at: null });
    expect(or[1].meeting_booking_at[Op.lt].getTime()).toBe(now.getTime() - 2 * 60 * 1000);
    // and the claim is cleared after booking
    expect(mockUpdate).toHaveBeenLastCalledWith({ meeting_booking_at: null }, { where: { id: '11111111-2222-3333-4444-555555555555' } });
  });

  it('refuses a start beyond the 21 days the calendar offers', async () => {
    await expect(bookMeeting(intake(), '2026-12-14T15:00:00.000Z', now)).rejects.toMatchObject({ code: 'not_offered' });
  });

  it('a second click while one is in flight books nothing', async () => {
    mockUpdate.mockResolvedValueOnce([0]);
    await expect(bookMeeting(intake(), monday9, now)).rejects.toMatchObject({ code: 'busy' });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('already booked returns the meeting, no second event', async () => {
    const out = await bookMeeting(intake({ meeting_start: new Date(monday9), meeting_end: new Date('2026-11-23T15:30:00Z') }), monday9, now);
    expect(out.status).toBe('already_booked');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('adopts an event a lost response already created, instead of inserting', async () => {
    mockFind.mockResolvedValue([ev]);
    const out = await bookMeeting(intake(), monday9, now);
    expect(out.status).toBe('booked');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('a taken slot is refused and the claim released', async () => {
    mockFree.mockResolvedValue(false);
    await expect(bookMeeting(intake(), monday9, now)).rejects.toMatchObject({ code: 'slot_taken' });
    expect(mockUpdate).toHaveBeenLastCalledWith({ meeting_booking_at: null }, expect.anything());
  });

  it('a calendar failure is CalendarUnavailable and the claim is released', async () => {
    mockInsert.mockRejectedValue(new Error('Google 500'));
    await expect(bookMeeting(intake(), monday9, now)).rejects.toBeInstanceOf(CalendarUnavailable);
    expect(mockUpdate).toHaveBeenLastCalledWith({ meeting_booking_at: null }, expect.anything());
  });

  it('ScheduleRefused carries an http status', () => {
    expect(new ScheduleRefused('x', 'y').http).toBe(409);
  });
});
