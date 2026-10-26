/**
 * C20: booking a call with admissions from the campus, against the in-memory calendar (never Google).
 *  - offers the next seven business days only; books once; the same request again returns the same booking (created:false);
 *  - a second, different time while one is booked is ALREADY_BOOKED (with the booking, so the sheet can offer Reschedule);
 *  - a time not offered (taken, past, off-grid) is SLOT_TAKEN;
 *  - the invite goes to the learner (or the test inbox) and the calendar owner only, carries the topic, the note is capped;
 *  - cancel removes only this learner's call; another learner's event id reads as not found;
 *  - two inserts that raced for one learner settle to one event (the earliest created);
 *  - an unreachable calendar throws (the route turns it into 503) and nothing is claimed.
 */
import {
  admissionsSlots, bookAdmissionsCall, cancelAdmissionsCall, upcomingAdmissionsCall, AdmissionsConflict, BOOKING_BUSINESS_DAYS, NOTE_MAX,
  CAMPUS_ENROLLMENT_PROP, type AdmissionsCalendarPort,
} from '../campusAdmissionsCall';
import { memoryAdmissionsCalendar } from '../campusAdmissionsMemoryCalendar';

// Monday 2026-10-26 08:00 Central (13:00Z): the first offered slot is 12:30 Central the same day (4-hour lead, 30-minute grid).
const NOW = new Date('2026-10-26T13:00:00Z');
const who = { enrollmentId: 'enr-1', name: 'Ada Learner', email: 'ada@example.test' };
const other = { enrollmentId: 'enr-2', name: 'Bo Learner', email: 'bo@example.test' };

async function firstSlot(port: AdmissionsCalendarPort, n = 0): Promise<string> {
  const s = await admissionsSlots(port);
  return s.dates.flatMap((d) => d.slots)[n].start;
}

describe('the offered times', () => {
  it('are the next seven business days, Central, after the lead time', async () => {
    const port = memoryAdmissionsCalendar(() => NOW);
    const s = await admissionsSlots(port);
    expect(s.timezone).toBe('America/Chicago');
    expect(s.dates).toHaveLength(BOOKING_BUSINESS_DAYS);
    expect(s.dates.map((d) => new Date(`${d.date}T12:00:00Z`).getUTCDay()).every((d) => d >= 1 && d <= 5)).toBe(true);
    expect(s.dates[0].slots[0].start).toBe('2026-10-26T17:30:00.000Z'); // 12:30 CDT
  });
});

describe('booking', () => {
  it('books once; the same request again returns the same booking without a second event', async () => {
    const port = memoryAdmissionsCalendar(() => NOW);
    const slot = await firstSlot(port);
    const a = await bookAdmissionsCall(port, who, { slotStart: slot, topic: 'payment' }, NOW);
    const b = await bookAdmissionsCall(port, who, { slotStart: slot, topic: 'payment' }, NOW);
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.booking.eventId).toBe(a.booking.eventId);
    expect(port.events).toHaveLength(1);
    expect(a.booking.topic).toBe('payment');
    expect(await upcomingAdmissionsCall(port, who.enrollmentId, NOW)).toEqual(a.booking);
  });

  it('a different time while booked is ALREADY_BOOKED and carries the existing booking', async () => {
    const port = memoryAdmissionsCalendar(() => NOW);
    const first = (await bookAdmissionsCall(port, who, { slotStart: await firstSlot(port), topic: 'cohort' }, NOW)).booking;
    const err = await bookAdmissionsCall(port, who, { slotStart: await firstSlot(port, 3), topic: 'cohort' }, NOW).catch((e) => e);
    expect(err).toBeInstanceOf(AdmissionsConflict);
    expect(err.reason).toBe('ALREADY_BOOKED');
    expect(err.statusCode).toBe(409);
    expect(err.booking.eventId).toBe(first.eventId);
    expect(port.events).toHaveLength(1);
  });

  it('a time not offered is SLOT_TAKEN: taken by someone else, in the past, or off the grid', async () => {
    const port = memoryAdmissionsCalendar(() => NOW);
    const slot = await firstSlot(port);
    await bookAdmissionsCall(port, other, { slotStart: slot, topic: 'other' }, NOW);
    for (const t of [slot, '2026-10-20T15:00:00Z', '2026-10-27T15:10:00Z', '2026-10-31T15:00:00Z']) {
      const err = await bookAdmissionsCall(port, who, { slotStart: t, topic: 'other' }, NOW).catch((e) => e);
      expect(err.reason).toBe('SLOT_TAKEN');
    }
    expect(port.events).toHaveLength(1);
  });

  it('invites the learner and the calendar owner only, tags the event, caps the note', async () => {
    const port = memoryAdmissionsCalendar(() => NOW);
    const insert = jest.spyOn(port, 'insertCampusEvent');
    await bookAdmissionsCall(port, who, { slotStart: await firstSlot(port), topic: 'enroll', note: 'x'.repeat(NOTE_MAX + 50) }, NOW);
    const input = insert.mock.calls[0][0];
    expect(input.attendees).toEqual([{ email: 'ada@example.test', displayName: 'Ada Learner' }, { email: 'admissions-owner@example.test' }]);
    expect(input.summary).toBe('Admissions call: Ada Learner');
    expect(input.summary).not.toMatch(/Strategy/);
    expect(input.privateProps).toEqual({ [CAMPUS_ENROLLMENT_PROP]: 'enr-1', campus_topic: 'enroll' });
    expect(input.description).toContain('Topic: Enrollment & next steps');
    expect(input.description).toContain('x'.repeat(NOTE_MAX));
    expect(input.description).not.toContain('x'.repeat(NOTE_MAX + 1));
  });

  it('in test mode the learner invite goes to the test inbox', async () => {
    const port = { ...memoryAdmissionsCalendar(() => NOW), testRedirect: async () => 'qa@example.test' };
    const insert = jest.spyOn(port, 'insertCampusEvent');
    await bookAdmissionsCall(port, who, { slotStart: await firstSlot(port), topic: 'other' }, NOW);
    expect(insert.mock.calls[0][0].attendees[0].email).toBe('qa@example.test');
  });

  it('two inserts that raced for one learner settle to the earliest-created event', async () => {
    const port = memoryAdmissionsCalendar(() => NOW);
    const slot = await firstSlot(port);
    // the race: a second insert for the same learner lands between this request's lookup and its settle
    const realInsert = port.insertCampusEvent.bind(port);
    let raced = false;
    port.insertCampusEvent = async (input) => {
      if (!raced) { raced = true; await realInsert({ ...input, slotStart: new Date(new Date(slot).getTime() + 3_600_000) }); }
      return realInsert(input);
    };
    const r = await bookAdmissionsCall(port, who, { slotStart: slot, topic: 'other' }, NOW);
    expect(port.events).toHaveLength(1);
    expect(r.booking.eventId).toBe(port.events[0].eventId);
  });

  it('an unreachable calendar throws and claims nothing', async () => {
    const port = memoryAdmissionsCalendar(() => NOW);
    port.findEventsByPrivateProperty = async () => { throw new Error('ETIMEDOUT'); };
    await expect(bookAdmissionsCall(port, who, { slotStart: '2026-10-27T15:00:00Z', topic: 'other' }, NOW)).rejects.toThrow('ETIMEDOUT');
    expect(port.events).toHaveLength(0);
  });
});

describe('cancel (Reschedule = cancel, then book)', () => {
  it("cancels this learner's call, and another learner's event id reads as not found", async () => {
    const port = memoryAdmissionsCalendar(() => NOW);
    const mine = (await bookAdmissionsCall(port, who, { slotStart: await firstSlot(port), topic: 'other' }, NOW)).booking;
    const theirs = (await bookAdmissionsCall(port, other, { slotStart: await firstSlot(port, 2), topic: 'other' }, NOW)).booking;
    const err = await cancelAdmissionsCall(port, who.enrollmentId, theirs.eventId, NOW).catch((e) => e);
    expect(err.statusCode).toBe(404);
    await cancelAdmissionsCall(port, who.enrollmentId, mine.eventId, NOW);
    expect(port.events.map((e) => e.eventId)).toEqual([theirs.eventId]);
    expect(await upcomingAdmissionsCall(port, who.enrollmentId, NOW)).toBeNull();
    // after cancelling, a new time books
    expect((await bookAdmissionsCall(port, who, { slotStart: await firstSlot(port, 5), topic: 'other' }, NOW)).created).toBe(true);
  });
});
