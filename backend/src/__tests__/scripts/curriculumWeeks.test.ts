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

describe('pre-launch staggered schedule', () => {
  it('Intensive 1 due 2026-06-19 … Intensive 4 due 2026-07-10', () => {
    expect(cur.weekDueDate(1)).toBe('2026-06-19');
    expect(cur.weekDueDate(3)).toBe('2026-06-19');
    expect(cur.weekDueDate(4)).toBe('2026-06-26');
    expect(cur.weekDueDate(7)).toBe('2026-07-03');
    expect(cur.weekDueDate(12)).toBe('2026-07-10');
  });

  it('every week is built BEFORE the 2026-07-13 kickoff', () => {
    for (const w of cur.WEEKS) {
      expect(cur.weekDueDate(w.week) < cur.KICKOFF).toBe(true);
    }
  });

  it('staggered: each intensive later than the last; weeks in an intensive share a date', () => {
    const [i1, i2, i3, i4] = [1, 4, 7, 10].map((n) => cur.weekDueDate(n));
    expect(i1 < i2 && i2 < i3 && i3 < i4).toBe(true);
    expect(cur.weekDueDate(1)).toBe(cur.weekDueDate(3)); // same intensive, same date
    expect(cur.weekDueDate(3)).not.toBe(cur.weekDueDate(4)); // intensive boundary
  });

  it('all deadlines are Fridays (weekdays)', () => {
    for (const w of cur.WEEKS) expect(utcDay(cur.weekDueDate(w.week))).toBe(5);
  });

  it('teaching Mondays unchanged (delivery still 7/13 → 9/28)', () => {
    expect(cur.weekTeachingMonday(1)).toBe('2026-07-13');
    expect(cur.weekTeachingMonday(12)).toBe('2026-09-28');
  });
});

describe('sign-off ownership', () => {
  const signoff = () => cur.COMPONENTS.find((c: any) => c.key === 'signoff');

  it('Ali co-signs Intensive 1 (Weeks 1-3); Swati signs solo from Week 4', () => {
    for (const w of cur.WEEKS) {
      const owners = signoff().owners(w);
      if (w.intensive === 1) {
        expect(owners).toEqual(['swati', 'ali']);
      } else {
        expect(owners).toEqual(['swati']);
      }
    }
  });

  it("the sign-off description notes Ali co-signs only for Weeks 1-3", () => {
    expect(signoff().description(cur.WEEKS[0])).toContain('Ali co-signs');
    expect(signoff().description(cur.WEEKS[3])).not.toContain('Ali co-signs');
  });
});

describe('Anthropic Skilljar mapping', () => {
  it('every week carries an anthropic course mapping', () => {
    for (const w of cur.WEEKS) {
      expect(w.anthropic).toBeDefined();
      expect(typeof w.anthropic.course).toBe('string');
      expect(w.anthropic.course.length).toBeGreaterThan(0);
    }
  });

  it('weeks 4/9/10/11 are Colaberry-original (no Skilljar URL); the rest link out', () => {
    const original = cur.WEEKS.filter((w: any) => w.anthropic.url === null).map((w: any) => w.week);
    expect(original).toEqual([4, 9, 10, 11]);
    const linked = cur.WEEKS.filter((w: any) => w.anthropic.url !== null);
    for (const w of linked) {
      expect(w.anthropic.url).toMatch(/^https:\/\//);
    }
  });

  it("the Anthropic component description names the week's specific course", () => {
    const anthropic = cur.COMPONENTS.find((c: any) => c.key === 'anthropic');
    const w1 = cur.WEEKS[0];
    const html = anthropic.description(w1);
    expect(html).toContain('Claude Code 101');
    expect(html).toContain(w1.anthropic.url);
    // Colaberry-original week renders without a link.
    const w4 = cur.WEEKS[3];
    expect(anthropic.description(w4)).toContain('Colaberry-original');
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
