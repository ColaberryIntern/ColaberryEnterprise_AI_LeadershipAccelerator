import { deriveCountdown, deriveMvpSchedule, derivePreSubmissionGantt, shipByDate, workingDaysBetween, usFederalHolidays } from './govCountdown';

const utc = (y: number, m0: number, d: number) => new Date(Date.UTC(y, m0, d));

describe('govCountdown working-day mirror', () => {
  it('matches the backend federal-holiday + working-day math', () => {
    expect(usFederalHolidays(2026).has('2026-07-03')).toBe(true); // Independence observed Fri
    expect(usFederalHolidays(2026).size).toBe(11);
    expect(workingDaysBetween(utc(2026, 9, 19), utc(2026, 9, 26))).toBe(5); // a clean Mon-Mon week
    expect(workingDaysBetween(utc(2026, 10, 23), utc(2026, 10, 30))).toBe(4); // Thanksgiving week
  });

  it('ship-by is the day before the deadline, never earlier than now', () => {
    expect(shipByDate(utc(2026, 10, 30), utc(2026, 9, 19))).toEqual(utc(2026, 10, 29));
    expect(shipByDate(null, utc(2026, 9, 19))).toBeNull();
    expect(shipByDate(utc(2026, 9, 19), utc(2026, 9, 25))).toEqual(utc(2026, 9, 25)); // clamped to now
  });
});

describe('deriveCountdown (deterministic)', () => {
  const now = utc(2026, 9, 19); // Mon 2026-10-19

  it('renders "-" (null) with a reason when the deadline or plan is missing', () => {
    expect(deriveCountdown({ now, deadline: null, remainingStoryCount: 3, humanBlockedCount: 0 }).probability).toBeNull();
    expect(deriveCountdown({ now, deadline: null, remainingStoryCount: 3, humanBlockedCount: 0 }).reason).toBe('no submission deadline');
    expect(deriveCountdown({ now, deadline: utc(2026, 11, 1), remainingStoryCount: null, humanBlockedCount: 0 }).reason).toBe('no build plan yet');
  });

  it('computes the ship-by and a high probability with ample slack', () => {
    const c = deriveCountdown({ now, deadline: utc(2026, 11, 1), remainingStoryCount: 1, humanBlockedCount: 0 });
    expect(c.shipBy).toBe('2026-11-30'); // deadline is Dec 1 2026, so ship-by is the day before
    expect(c.remainingBuildDays).toBe(2); // 1 story * 2 working days
    expect(c.probability).toBe(95);       // lots of working days vs 2 needed
  });

  it('drops to the low band when the remaining work dwarfs the window', () => {
    const c = deriveCountdown({ now, deadline: utc(2026, 10, 2), remainingStoryCount: 50, humanBlockedCount: 0 });
    expect(c.remainingBuildDays).toBe(100);
    expect(c.probability).toBe(5);
  });

  it('95 when there is nothing left to build', () => {
    expect(deriveCountdown({ now, deadline: utc(2026, 11, 1), remainingStoryCount: 0, humanBlockedCount: 0 }).probability).toBe(95);
  });

  it('human-blocked items add latency and are reproducible', () => {
    const a = deriveCountdown({ now, deadline: utc(2026, 10, 16), remainingStoryCount: 5, humanBlockedCount: 2 });
    const b = deriveCountdown({ now, deadline: utc(2026, 10, 16), remainingStoryCount: 5, humanBlockedCount: 2 });
    expect(a).toEqual(b); // pure
    expect(a.effectiveNeeded).toBe(5 * 2 + 2 * 2); // remainingBuildDays 10 + blocked 2*2
  });
});

describe('deriveMvpSchedule (back-planned, working-day aware)', () => {
  const now = utc(2026, 9, 19); // Mon 2026-10-19

  it('is "-" (null) when the deadline or plan is missing', () => {
    expect(deriveMvpSchedule({ now, deadline: null, mvpStoryCount: 3 }).feasible).toBeNull();
    expect(deriveMvpSchedule({ now, deadline: null, mvpStoryCount: 3 }).headline).toBe('No submission deadline');
    expect(deriveMvpSchedule({ now, deadline: utc(2027, 0, 4), mvpStoryCount: null }).headline).toBe('No build plan yet');
  });

  it('is feasible with a far deadline + small MVP, naming the demo-ready date', () => {
    const s = deriveMvpSchedule({ now, deadline: utc(2027, 0, 4), mvpStoryCount: 2 });
    expect(s.mvpBuildDays).toBe(4);
    expect(s.mvpDemoReadyBy).toBe('2026-10-23'); // Mon + 4 working days -> Fri Oct 23
    expect(s.feasible).toBe(true);
    expect(s.headline).toContain('MVP demo-ready by 2026-10-23');
  });

  it('is infeasible when the work cannot fit before the deadline', () => {
    const s = deriveMvpSchedule({ now, deadline: utc(2026, 9, 23), mvpStoryCount: 10 }); // Oct 23 deadline, 20 build days
    expect(s.feasible).toBe(false);
    expect(s.headline).toContain('will not be demo-ready');
  });

  it('is reproducible (pure)', () => {
    const a = deriveMvpSchedule({ now, deadline: utc(2026, 11, 1), mvpStoryCount: 3 });
    const b = deriveMvpSchedule({ now, deadline: utc(2026, 11, 1), mvpStoryCount: 3 });
    expect(a).toEqual(b);
  });
});

describe('derivePreSubmissionGantt (fixed now->deadline axis)', () => {
  const now = utc(2026, 9, 19); // Mon 2026-10-19

  it('feasible: a build bar + a draft/ship buffer bar, anchored today=0 and deadline=100', () => {
    const g = derivePreSubmissionGantt({ now, deadline: utc(2027, 0, 4), mvpStoryCount: 2 });
    expect(g.feasible).toBe(true);
    const build = g.bars.find((b) => b.key === 'build')!;
    const buffer = g.bars.find((b) => b.key === 'buffer')!;
    expect(build.tone).toBe('critical');          // fits -> not red
    expect(build.leftPct).toBe(0);                 // the build starts today
    expect(buffer.tone).toBe('buffer');
    const today = g.markers.find((m) => m.key === 'now')!;
    const deadline = g.markers.find((m) => m.key === 'deadline')!;
    expect(today.leftPct).toBe(0);
    expect(deadline.leftPct).toBe(100);            // the deadline is always the right edge
    expect(g.markers.map((m) => m.key)).toEqual(['now', 'latest', 'ship', 'deadline']);
    // every position stays on the axis
    expect(g.bars.every((b) => b.leftPct >= 0 && b.leftPct + b.widthPct <= 100.01)).toBe(true);
  });

  it('infeasible: the build bar is flagged overflow (red)', () => {
    const g = derivePreSubmissionGantt({ now, deadline: utc(2026, 9, 23), mvpStoryCount: 10 });
    expect(g.feasible).toBe(false);
    expect(g.bars.find((b) => b.key === 'build')!.tone).toBe('overflow');
  });

  it('is total: empty bars/markers but keeps the headline when the deadline is missing', () => {
    const g = derivePreSubmissionGantt({ now, deadline: null, mvpStoryCount: 3 });
    expect(g.bars).toEqual([]);
    expect(g.markers).toEqual([]);
    expect(g.headline).toBe('No submission deadline');
  });

  it('is reproducible (pure)', () => {
    const a = derivePreSubmissionGantt({ now, deadline: utc(2026, 11, 1), mvpStoryCount: 3 });
    const b = derivePreSubmissionGantt({ now, deadline: utc(2026, 11, 1), mvpStoryCount: 3 });
    expect(a).toEqual(b);
  });
});
