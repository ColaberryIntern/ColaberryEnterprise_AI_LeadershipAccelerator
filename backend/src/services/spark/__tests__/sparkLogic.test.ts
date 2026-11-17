// Spark Hour scheduling rules (Ali, 2026-11-16): midday hours both are free, 3 weekdays + 1 weekend,
// change the time but never the choice, and anything missed carries to the next day.
import * as L from '../sparkLogic';
import { SURVEY, DAILY, dailyFor } from '../sparkContent';

const TUE_7AM = { date: '2026-11-17', time: '07:00' };
const MON = '2026-11-16';

describe('dates', () => {
  test('monday of a week, weekday checks, and Central time', () => {
    expect(L.mondayOf('2026-11-19')).toBe(MON);
    expect(L.mondayOf('2026-11-22')).toBe(MON); // Sunday belongs to the week that started Monday
    expect(L.isWeekday('2026-11-21')).toBe(false);
    expect(L.ctNow(new Date('2026-11-17T18:30:00Z'))).toEqual({ date: '2026-11-17', time: '12:30' });
    expect(L.prettyTime('12:30')).toBe('12:30 PM');
  });
});

describe('free time', () => {
  const busy: L.Busy[] = [
    { date: '2026-11-18', start: '09:00', end: '11:30' }, // Ali
    { date: '2026-11-18', start: '13:00', end: '14:00' }, // Addie
  ];
  test('only the gaps where both are free, inside the midday window', () => {
    expect(L.freeWindows('2026-11-18', busy)).toEqual([[690, 780], [840, 930]]);
  });
  test('a slot needs a full hour and is never in the past', () => {
    const c = L.candidateSlots(['2026-11-16', '2026-11-18'], busy, TUE_7AM);
    expect(c.every((s) => s.date === '2026-11-18')).toBe(true);
    expect(c[0]).toEqual({ date: '2026-11-18', start: '11:30', maxEnd: '13:00' });
  });
  test('today counts only with 90 minutes of notice', () => {
    expect(L.isAhead('2026-11-17', '12:00', { date: '2026-11-17', time: '10:00' })).toBe(true);
    expect(L.isAhead('2026-11-17', '12:00', { date: '2026-11-17', time: '11:00' })).toBe(false);
  });
});

describe('picking the week', () => {
  test('three different weekdays, spread out when possible', () => {
    const c = L.candidateSlots(L.weekDates(MON), [], TUE_7AM);
    const p = L.pickWeekdaySlots(c, 3);
    expect(p.map((s) => s.date)).toEqual(['2026-11-17', '2026-11-19', '2026-11-20']);
    expect(p.every((s) => s.start === '11:30' || s.start === '12:00')).toBe(true);
  });
  test('one weekend option that is not busy', () => {
    const w = L.weekendSlots(MON, [{ date: '2026-11-21', start: '18:00', end: '22:00' }], TUE_7AM);
    expect(w[0]).toEqual({ date: '2026-11-21', start: '10:00', maxEnd: '13:00' });
  });
});

describe('the model can suggest, the code enforces the limits', () => {
  const slot: L.Slot = { date: '2026-11-18', start: '12:00', maxEnd: '13:00' };
  test('an outing that does not fit in the free time is refused', () => {
    expect(L.shapeItem('x', 'weekday', slot, { place: 'out', title: 'Arboretum', driveMinutesEachWay: 15 })).toBeNull();
  });
  test('an outing with a long drive is refused even with room', () => {
    expect(L.shapeItem('x', 'weekday', { ...slot, maxEnd: '13:30' }, { place: 'out', title: 'Far away', driveMinutesEachWay: 40 })).toBeNull();
  });
  test('home is an hour, out is 90 minutes, and dashes are cleaned', () => {
    expect(L.shapeItem('x', 'weekday', slot, { place: 'home', title: 'Cook-off', plan: 'Cook — then eat' })).toMatchObject({ end: '13:00', place: 'home', plan: 'Cook, then eat', driveMinutes: 0 });
    expect(L.shapeItem('x', 'weekday', { ...slot, maxEnd: '13:30' }, { place: 'out', title: 'Garden', driveMinutesEachWay: 15 })).toMatchObject({ end: '13:30', place: 'out' });
  });
});

describe('changing the time', () => {
  const cands = L.candidateSlots(L.weekDates(MON), [], TUE_7AM);
  const a = L.shapeItem('a', 'weekday', { date: '2026-11-18', start: '12:00', maxEnd: '13:30' }, { place: 'home', title: 'A' }) as L.PlanItem;
  const b = L.shapeItem('b', 'weekday', { date: '2026-11-19', start: '12:00', maxEnd: '13:30' }, { place: 'home', title: 'B' }) as L.PlanItem;
  test('moves to another free time the same day first, never onto another Spark\'s day', () => {
    const s = L.nextSlot(a, [a, b], cands, []) as L.Slot;
    expect(s.date).toBe('2026-11-18');
    expect(s.start).not.toBe('12:00');
  });
  test('times already tried are skipped', () => {
    const tried = { ...a, tried: cands.filter((c) => c.date === '2026-11-18').map((c) => `${c.date} ${c.start}`) };
    const s = L.nextSlot(tried, [tried, b], cands, []) as L.Slot;
    expect(s.date).not.toBe('2026-11-18');
    expect(s.date).not.toBe('2026-11-19');
  });
  test('an outing only fits a slot with 90 minutes', () => {
    const out = { ...a, place: 'out' as const };
    expect(L.fitsSlot(out, { date: '2026-11-18', start: '14:30', maxEnd: '15:30' })).toBe(false);
    expect(L.fitsSlot(a, { date: '2026-11-18', start: '14:30', maxEnd: '15:30' })).toBe(true);
  });
});

describe('carry-over', () => {
  test('missed daily questions roll forward through the week, starting from the program start', () => {
    expect(L.pendingDays('2026-11-17', [])).toEqual(['2026-11-17']);
    expect(L.pendingDays('2026-11-19', ['2026-11-18'])).toEqual(['2026-11-17', '2026-11-19']);
    expect(L.pendingDays('2026-11-24', [])).toEqual(['2026-11-23', '2026-11-24']); // a new week starts fresh
  });
  test('each weekday gets its own 3 questions', () => {
    expect(L.weekdayIndex('2026-11-17')).toBe(0);
    expect(L.weekdayIndex('2026-11-23')).toBe(4);
    expect(dailyFor(0).map((q) => q.id)).toEqual(['d001', 'd002', 'd003']);
    expect(dailyFor(1)[0].id).toBe('d004');
  });
});

describe('questions', () => {
  test('20 survey questions, unique ids, choices have options', () => {
    expect(SURVEY).toHaveLength(20);
    const ids = [...SURVEY, ...DAILY].map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...SURVEY, ...DAILY].filter((q) => q.type !== 'open').every((q) => (q.options || []).length >= 2)).toBe(true);
  });
});
