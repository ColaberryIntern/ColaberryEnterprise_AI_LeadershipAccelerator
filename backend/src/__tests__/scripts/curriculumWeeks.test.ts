/**
 * Curriculum build-tracker data + schedule.
 *
 * Proves the 12-week structure, the lean 5-item component template, and the
 * build-ahead schedule (each week due the Friday before its teaching Monday,
 * strictly ordered, all weekdays). Pure data module (no I/O) — unit-tests
 * without Basecamp. BUILD-BREAK-HARDEN: covers boundaries (W1/W12) + ordering.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const cur = require('../../scripts/lib/curriculumWeeks');

function utcDay(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
}

describe('curriculumWeeks data', () => {
  it('has exactly 12 weeks numbered 1..12 in order', () => {
    expect(cur.WEEKS).toHaveLength(12);
    cur.WEEKS.forEach((w: any, i: number) => {
      expect(w.week).toBe(i + 1);
    });
  });

  it('every week has a non-empty theme and a valid intensive (1..4)', () => {
    for (const w of cur.WEEKS) {
      expect(typeof w.theme).toBe('string');
      expect(w.theme.length).toBeGreaterThan(0);
      expect([1, 2, 3, 4]).toContain(w.intensive);
    }
  });

  it('intensives partition the weeks W1-3 / W4-6 / W7-9 / W10-12', () => {
    const byWeek = (n: number) => cur.WEEKS.find((w: any) => w.week === n).intensive;
    expect([1, 2, 3].map(byWeek)).toEqual([1, 1, 1]);
    expect([4, 5, 6].map(byWeek)).toEqual([2, 2, 2]);
    expect([7, 8, 9].map(byWeek)).toEqual([3, 3, 3]);
    expect([10, 11, 12].map(byWeek)).toEqual([4, 4, 4]);
  });
});

describe('component template', () => {
  it('is the lean 5-item checklist', () => {
    expect(cur.COMPONENTS).toHaveLength(5);
    expect(cur.COMPONENTS.map((c: any) => c.key)).toEqual([
      'anthropic',
      'lab',
      'assessment',
      'notebooklm',
      'signoff',
    ]);
  });

  it('Kes owns only the Anthropic-mapping item; Swati owns the rest', () => {
    const kes = cur.COMPONENTS.filter((c: any) => c.owner === 'kes');
    expect(kes).toHaveLength(1);
    expect(kes[0].key).toBe('anthropic');
    expect(cur.COMPONENTS.filter((c: any) => c.owner === 'swati')).toHaveLength(4);
  });

  it('every component renders a non-empty HTML description per week', () => {
    for (const w of cur.WEEKS) {
      for (const c of cur.COMPONENTS) {
        const html = typeof c.description === 'function' ? c.description(w) : c.description;
        expect(typeof html).toBe('string');
        expect(html).toContain('<div>');
        expect(html.length).toBeGreaterThan(20);
      }
    }
  });
});

describe('build-ahead schedule', () => {
  it('Week 1 is due 2026-07-10 and Week 12 is due 2026-09-25', () => {
    expect(cur.weekDueDate(1)).toBe('2026-07-10');
    expect(cur.weekDueDate(12)).toBe('2026-09-25');
  });

  it('teaching Mondays start on the 2026-07-13 kickoff and step by 7 days', () => {
    expect(cur.weekTeachingMonday(1)).toBe('2026-07-13');
    expect(cur.weekTeachingMonday(12)).toBe('2026-09-28');
    expect(utcDay(cur.weekTeachingMonday(1))).toBe(1); // Monday
  });

  it('every due date is a Friday (weekday) and lands before its teaching Monday', () => {
    for (const w of cur.WEEKS) {
      const due = cur.weekDueDate(w.week);
      expect(utcDay(due)).toBe(5); // Friday
      expect(due < cur.weekTeachingMonday(w.week)).toBe(true);
    }
  });

  it('due dates are strictly increasing across the 12 weeks', () => {
    const dues = cur.WEEKS.map((w: any) => cur.weekDueDate(w.week));
    for (let i = 1; i < dues.length; i++) {
      expect(dues[i] > dues[i - 1]).toBe(true);
    }
  });
});

describe('groupName', () => {
  it('zero-pads the week and includes intensive + theme', () => {
    const w1 = cur.WEEKS[0];
    const name = cur.groupName(w1);
    expect(name).toContain('Week 01');
    expect(name).toContain('Intensive 1');
    expect(name).toContain(w1.theme);
  });
});
