// Spark Hour scheduling rules (Ali, 2026-11-16): midday hours both are free, 3 weekdays + 1 weekend,
// change the time but never the choice, and anything missed carries to the next day.
import * as L from '../sparkLogic';
import { SURVEY, DAILY, dailyFor, GAMES, WAGER, gameForDay } from '../sparkContent';

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
  test('a 9-to-5 work calendar still gets 3 weekday Sparks, in the evening (Ali, 2026-11-18)', () => {
    const work: L.Busy[] = L.weekDates(MON).filter(L.isWeekday).map((date) => ({ date, start: '08:00', end: '17:00' }));
    work.push({ date: '2026-11-20', start: '18:00', end: '19:00' }); // Friday dinner plans
    const p = L.pickWeekdaySlots(L.candidateSlots(L.weekDates(MON), work, TUE_7AM), 3);
    expect(p.length).toBe(3);
    expect(p.every((s) => L.toMin(s.start) >= L.toMin(L.EVENING_FROM))).toBe(true);
    const fri = L.candidateSlots(['2026-11-20'], work, TUE_7AM);
    expect(fri.every((s) => L.toMin(s.start) >= L.toMin('19:00'))).toBe(true);
  });
  test('midday still wins over the evening when it is open', () => {
    const c = L.candidateSlots(['2026-11-18'], [], TUE_7AM);
    expect(L.toMin(c[0].start)).toBeLessThan(L.toMin(L.MIDDAY_TO));
    expect(c.some((s) => s.start === '19:00')).toBe(true);
  });
  test('mid-week: only the days still ahead count', () => {
    const work: L.Busy[] = L.weekDates(MON).filter(L.isWeekday).map((date) => ({ date, start: '08:00', end: '17:00' }));
    const p = L.pickWeekdaySlots(L.candidateSlots(L.weekDates(MON), work, { date: '2026-11-18', time: '06:37' }), 3);
    expect(p.map((s) => s.date)).toEqual(['2026-11-18', '2026-11-19', '2026-11-20']);
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

describe('game of the day', () => {
  test('the winner is the best score; a tie means both; skipping is a loss; nobody played means no winner', () => {
    expect(L.decideWinner(90, 80)).toEqual(['a']);
    expect(L.decideWinner(80, 90)).toEqual(['b']);
    expect(L.decideWinner(80, 80)).toEqual(['a', 'b']);
    expect(L.decideWinner(0, null)).toEqual(['a']);
    expect(L.decideWinner(null, 5)).toEqual(['b']);
    expect(L.decideWinner(null, null)).toEqual([]);
  });
  test('Monday reveals Friday', () => {
    expect(L.prevWeekday('2026-11-23')).toBe('2026-11-20');
    expect(L.prevWeekday('2026-11-18')).toBe('2026-11-17');
  });
  test('only ready games rotate, one per weekday, and every game has a cap', () => {
    const ready = GAMES.filter((g) => g.ready);
    expect(GAMES).toHaveLength(20);
    expect(gameForDay(0).id).toBe(ready[0].id);
    expect(gameForDay(ready.length).id).toBe(ready[0].id);
    expect(GAMES.every((g) => g.maxScore > 0)).toBe(true);
  });
  test('every wager prize group has options to rank', () => {
    expect(Object.keys(WAGER)).toHaveLength(5);
    expect(Object.values(WAGER).every((o) => o.length >= 3)).toBe(true);
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

describe('checking what was read from a calendar photo (Ali, 2026-11-18: "that does not sound right")', () => {
  // The real first read of Addie's work calendar: back-to-back hours 9 to 5, most of them twice.
  const hrs = (date: string, from: number, to: number): L.Busy[] => Array.from({ length: to - from }, (_, i) => ({ date, start: `${String(from + i).padStart(2, '0')}:00`, end: `${String(from + i + 1).padStart(2, '0')}:00` }));
  const grid = [...hrs('2026-11-17', 9, 17), ...hrs('2026-11-17', 9, 12)];
  test('a solid run of one-hour blocks is flagged as the hour grid', () => {
    expect(L.looksLikeGrid(grid, '2026-11-17')).toBe(true);
    expect(L.mergeBusy(grid, '2026-11-17')).toEqual([[540, 1020]]);
  });
  test('a real meeting day is not flagged', () => {
    const real: L.Busy[] = [
      { date: '2026-11-17', start: '09:00', end: '10:00' }, { date: '2026-11-17', start: '10:00', end: '11:00' },
      { date: '2026-11-17', start: '13:00', end: '14:30' }, { date: '2026-11-17', start: '15:00', end: '16:00' },
    ];
    expect(L.looksLikeGrid(real, '2026-11-17')).toBe(false);
    expect(L.looksLikeGrid([{ date: '2026-11-17', start: '08:00', end: '17:00' }], '2026-11-17')).toBe(false); // one real all-day block is the person's call
  });
  test('tapping a wrong range removes every block under it, only on that day', () => {
    const left = L.removeRange([...grid, ...hrs('2026-11-18', 9, 10)], '2026-11-17', '09:00', '17:00');
    expect(left).toEqual([{ date: '2026-11-18', start: '09:00', end: '10:00' }]);
  });
});

describe('never the same prize twice (Ali, 2026-11-19: "avoid doing the same prize")', () => {
  test('a love note in a pocket is the same prize as a love note hidden somewhere', () => {
    expect(L.similarPrize('A handwritten love note, hidden somewhere', 'A handwritten love note, hidden in your coat pocket for a surprise discovery')).toBe(true);
    expect(L.similarPrize('A love letter', 'Love letters under your pillow')).toBe(true);
  });
  test('different prizes are not', () => {
    expect(L.similarPrize('A handwritten love note, hidden somewhere', 'A 15-minute back rub with the lavender lotion')).toBe(false);
    expect(L.similarPrize('A playlist made just for me', 'A 10-minute portrait of me (any skill level)')).toBe(false);
  });
});

describe('planning while a calendar photo is still coming (Ali, 2026-11-19: "I was expecting to have our planned week")', () => {
  test('assumed work hours put the weekday Sparks in the evening', () => {
    const p = L.pickWeekdaySlots(L.candidateSlots(L.weekDates(MON), L.assumedWorkHours(MON), TUE_7AM), 3);
    expect(p.length).toBe(3);
    expect(p.every((s) => L.toMin(s.start) >= L.toMin(L.EVENING_FROM))).toBe(true);
  });
});
