/**
 * Schedule-gate tests for the Intern Delivery briefing cron.
 *
 * The VPS runs UTC and the crontab sets no CRON_TZ, so this script is what
 * decides whether a given tick is "15 minutes before the meeting". Getting it
 * wrong means the briefing lands after the call for half the year, which is the
 * kind of bug nobody reports and everybody works around.
 *
 * The crontab fires `45 13,14,15 * * 1,2`. These tests assert that across BOTH
 * daylight regimes exactly ONE of those three ticks matches, and that it is the
 * right one.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { centralNow, parseSlots, matchSlot, DEFAULT_SLOTS, DEFAULT_TOLERANCE_MIN } = require('../sendInternDeliveryScheduled');

const SLOTS = parseSlots(DEFAULT_SLOTS);
const TICK_HOURS_UTC = [13, 14, 15];

/** Which of the three cron ticks fire, for a given UTC date? */
function firingTicks(utcDateIso: string) {
  return TICK_HOURS_UTC
    .map((h) => {
      const at = new Date(`${utcDateIso}T${String(h).padStart(2, '0')}:45:00Z`);
      const ct = centralNow(at);
      return { utcHour: h, ct, slot: matchSlot(ct, SLOTS, DEFAULT_TOLERANCE_MIN) };
    })
    .filter((t) => t.slot);
}

describe('parseSlots', () => {
  it('parses the default Monday 08:45 / Tuesday 09:45 pair', () => {
    expect(SLOTS).toEqual([
      expect.objectContaining({ dayOfWeek: 1, hour: 8, minute: 45 }),
      expect.objectContaining({ dayOfWeek: 2, hour: 9, minute: 45 }),
    ]);
  });

  it('rejects a malformed slot rather than silently never firing', () => {
    expect(() => parseSlots('monday@9am')).toThrow(/Expected DAY@HH:MM/);
    expect(() => parseSlots('9@08:45')).toThrow(/Expected DAY@HH:MM/);
  });
});

describe('centralNow', () => {
  it('reads CDT (UTC-5) in summer', () => {
    // 2026-08-17 is a Monday, inside daylight saving.
    const ct = centralNow(new Date('2026-08-17T13:45:00Z'));
    expect(ct.dayName).toBe('Monday');
    expect(ct.hour).toBe(8);
    expect(ct.minute).toBe(45);
  });

  it('reads CST (UTC-6) in winter', () => {
    // 2027-01-11 is a Monday, outside daylight saving.
    const ct = centralNow(new Date('2027-01-11T14:45:00Z'));
    expect(ct.dayName).toBe('Monday');
    expect(ct.hour).toBe(8);
    expect(ct.minute).toBe(45);
  });
});

describe('the Monday slot fires exactly once', () => {
  it('in summer (CDT), on the 13:45 UTC tick', () => {
    const fired = firingTicks('2026-08-17');
    expect(fired).toHaveLength(1);
    expect(fired[0].utcHour).toBe(13);
    expect(fired[0].ct.hour).toBe(8);
  });

  it('in winter (CST), on the 14:45 UTC tick', () => {
    const fired = firingTicks('2027-01-11');
    expect(fired).toHaveLength(1);
    expect(fired[0].utcHour).toBe(14);
    expect(fired[0].ct.hour).toBe(8);
  });
});

describe('the Tuesday slot fires exactly once', () => {
  it('in summer (CDT), on the 14:45 UTC tick', () => {
    const fired = firingTicks('2026-08-18');
    expect(fired).toHaveLength(1);
    expect(fired[0].utcHour).toBe(14);
    expect(fired[0].ct.hour).toBe(9);
  });

  it('in winter (CST), on the 15:45 UTC tick', () => {
    const fired = firingTicks('2027-01-12');
    expect(fired).toHaveLength(1);
    expect(fired[0].utcHour).toBe(15);
    expect(fired[0].ct.hour).toBe(9);
  });
});

describe('the gate stays shut the rest of the time', () => {
  it('never fires on Wednesday through Sunday', () => {
    // 2026-08-19 Wed .. 2026-08-23 Sun
    for (const day of ['2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23']) {
      expect(firingTicks(day)).toHaveLength(0);
    }
  });

  it('does not fire at the other meeting time on the wrong day', () => {
    // Monday 09:45 CT is Tuesday's slot time, and must not fire on Monday.
    const ct = centralNow(new Date('2026-08-17T14:45:00Z'));
    expect(ct.dayName).toBe('Monday');
    expect(ct.hour).toBe(9);
    expect(matchSlot(ct, SLOTS, DEFAULT_TOLERANCE_MIN)).toBeNull();
  });

  it('tolerates a late cron tick but not an hour of lateness', () => {
    const onTime = centralNow(new Date('2026-08-17T13:45:00Z'));
    const late10 = centralNow(new Date('2026-08-17T13:55:00Z'));
    const late60 = centralNow(new Date('2026-08-17T14:45:00Z'));
    expect(matchSlot(onTime, SLOTS, DEFAULT_TOLERANCE_MIN)).not.toBeNull();
    expect(matchSlot(late10, SLOTS, DEFAULT_TOLERANCE_MIN)).not.toBeNull();
    expect(matchSlot(late60, SLOTS, DEFAULT_TOLERANCE_MIN)).toBeNull();
  });

  it('never fires before the slot, which would beat the meeting reminder', () => {
    const early = centralNow(new Date('2026-08-17T13:40:00Z')); // 08:40 CT
    expect(early.hour).toBe(8);
    expect(early.minute).toBe(40);
    expect(matchSlot(early, SLOTS, DEFAULT_TOLERANCE_MIN)).toBeNull();
  });
});
