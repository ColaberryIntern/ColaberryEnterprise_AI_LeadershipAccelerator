import { planTarget, ValidationError } from '../targetMath';
import { buildTodaySample } from '../todayFixture';
import { TodayPayload } from '../todaySchema';

const NOW = new Date('2026-11-30T15:00:00.000Z');

describe('AO2.1 planTarget (kit SPEC 4.11)', () => {
  it('happy: the demo scenario (150 target, 2 paid, 34 days, 8%) gives 148 / 5 a day / 1,850 prospects', () => {
    expect(planTarget(150, 2, 34, 0.08)).toEqual({ remaining: 148, daily_required: 5, prospects_needed: 1850 });
  });
  it('boundary: target met or exceeded leaves nothing remaining, never negative', () => {
    expect(planTarget(10, 10, 5, 0.1)).toEqual({ remaining: 0, daily_required: 0, prospects_needed: 0 });
    expect(planTarget(10, 12, 5, 0.1).remaining).toBe(0);
  });
  it('boundary: the last day needs the whole remainder; a rate of 1 needs exactly the remainder', () => {
    expect(planTarget(20, 5, 1, 1)).toEqual({ remaining: 15, daily_required: 15, prospects_needed: 15 });
  });
  it('rounds up, and is not fooled by binary fractions', () => {
    expect(planTarget(100, 0, 3, 0.3)).toEqual({ remaining: 100, daily_required: 34, prospects_needed: 334 });
    expect(planTarget(150, 2, 34, 0.08).prospects_needed).toBe(1850);
  });
  it('failure: a rate of 0, above 1, zero days or a fractional target is refused, not computed', () => {
    expect(() => planTarget(150, 2, 34, 0)).toThrow(ValidationError);
    expect(() => planTarget(150, 2, 34, 1.5)).toThrow(ValidationError);
    expect(() => planTarget(150, 2, 0, 0.08)).toThrow(ValidationError);
    expect(() => planTarget(150.5, 2, 34, 0.08)).toThrow(ValidationError);
    expect(() => planTarget(150, -1, 34, 0.08)).toThrow(ValidationError);
  });
});

describe('AO2.1 the Today sample', () => {
  const today = buildTodaySample(NOW);

  it('satisfies the Zod contract and says it is a sample', () => {
    expect(TodayPayload.safeParse(today).success).toBe(true);
    expect(today.sample).toBe(true);
    expect(today.generated_at).toBe(NOW.toISOString());
  });

  it('section counts are derived from the queue and add up to it (2, 1, 2, 4, 1, 1)', () => {
    const counts = Object.fromEntries(today.sections.map((s) => [s.id, s.count]));
    expect(counts).toEqual({ admissions: 2, communications: 1, students: 2, payments: 4, compliance: 1, events: 1 });
    expect(today.sections.reduce((a, s) => a + s.count, 0)).toBe(today.queue.length);
  });

  it('the briefing counts the items due today and names the first one', () => {
    expect(today.briefing.headline).toBe('7 things need you today.');
    expect(today.briefing.start_with).toBe('Cancelled contract, active student: Renee Okafor');
  });

  it('every queue item carries the systems it checked and a pull time no fresher than its stalest system', () => {
    const synced = new Map(today.systems.map((s) => [s.id, s.synced_at]));
    for (const q of today.queue) {
      expect(q.systems_checked.length).toBeGreaterThan(0);
      const oldest = q.systems_checked.map((id) => synced.get(id) as string).sort()[0];
      expect(q.pulled_at).toBe(oldest);
    }
  });

  it('a down system is carried onto every item that depends on it, and only those', () => {
    expect(today.systems.find((s) => s.id === 'zendesk')?.status).toBe('down');
    for (const q of today.queue) {
      expect(q.down_systems).toEqual(q.systems_checked.includes('zendesk') ? ['zendesk'] : []);
    }
    expect(today.queue.filter((q) => q.down_systems.length).map((q) => q.id)).toEqual(['q-ticket']);
  });

  it('students link by an obviously sample ref; groups have none', () => {
    for (const q of today.queue) {
      if (q.subject.kind === 'student') expect(q.subject.ref).toMatch(/^sample-/);
      else expect(q.subject.ref).toBeNull();
    }
  });

  it('is deterministic for the same clock (idempotent build)', () => {
    expect(buildTodaySample(NOW)).toEqual(today);
  });

  it('lists all eight systems and the five permission levels, with level 4 authorizing nothing yet', () => {
    expect(today.systems.map((s) => s.id)).toEqual(['ghl', 'app_colaberry', 'retool', 'tfc', 'paysimple', 'gmail', 'zendesk', 'sheets']);
    expect(today.may_do.map((m) => m.level)).toEqual([1, 2, 3, 4, 5]);
    expect(today.may_do[3].rule).toMatch(/None authorized/);
  });

  it('the contract rejects a malformed payload (a figure without its source, a rate above 1)', () => {
    const { source: _s, ...noSource } = today.target;
    expect(TodayPayload.safeParse({ ...today, target: noSource }).success).toBe(false);
    expect(TodayPayload.safeParse({ ...today, target: { ...today.target, assumed_rate: 1.2 } }).success).toBe(false);
    expect(TodayPayload.safeParse({ ...today, queue: [{ ...today.queue[0], systems_checked: [] }] }).success).toBe(false);
  });
});
