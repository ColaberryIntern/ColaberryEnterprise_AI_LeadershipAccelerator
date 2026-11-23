/**
 * ShiftFill v5c (2026-11-22): what the cold Command Center build found in the
 * plan data itself, each confirmed against v5's plan.json before fixing.
 *  1. Outline buttons stored bare ("Something arrives", "Flag it for me") read
 *     as placeholders on the Command Center.
 *  2. A story told the student to integrate with "the temp agencies' APIs",
 *     which nothing the student wrote says exist.
 *  3. A release opened with a story due on Christmas Day.
 */
import { itemsFromIntake, outlineStatement } from '../intakeTruth';
import { buildReleaseStoriesPrompt } from '../stagedGeneration';
import { buildSchedule } from '../buildSchedule';
import { isHoliday, isWorkingDay, toWorkingDay } from '../scheduleHolidays';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (x: Date) => x.toISOString().slice(0, 10);

describe('an outline button is stored as the sentence the student meant', () => {
  it('says a picked trigger as a sentence', () => {
    expect(outlineStatement('What makes it start', 'Something arrives')).toBe('It starts when something arrives.');
    expect(outlineStatement('What makes it start', 'A time of day')).toBe('It runs at a set time of day.');
  });

  it('puts the question back in front of a picked answer', () => {
    expect(outlineStatement("When it isn't sure, it should", 'Flag it for me'))
      .toBe("When it isn't sure, it should flag it for me.");
    expect(outlineStatement("Before I'd let it run on its own, I'd need it to",
      'Tell me in plain words why it decided that; Send me a summary at the end of the day'))
      .toBe("Before I'd let it run on its own, I'd need it to tell me in plain words why it decided that and send me a summary at the end of the day.");
  });

  it('leaves free text the student typed exactly as written', () => {
    expect(outlineStatement('What makes it start', 'A hygienist texts in sick')).toBe('A hygienist texts in sick');
    expect(outlineStatement('What good would look like', 'Filled in 30 minutes')).toBe('Filled in 30 minutes');
  });

  it('stores the sentence, quotes the whole line, and still skips the model repeating the button', () => {
    const idea = "What makes it start: Something arrives\nWhen it isn't sure, it should: Flag it for me";
    const { items } = itemsFromIntake({
      idea, answers: [], covered: [{ angle: 'TRIGGER AND RHYTHM', evidence: 'Something arrives' }],
    } as never);
    expect(items.map((i) => i.value)).toEqual([
      'It starts when something arrives.',
      "When it isn't sure, it should flag it for me.",
    ]);
    expect(items[0].source_quote).toBe('What makes it start: Something arrives');
  });

  it('is idempotent', () => {
    const idea = 'What makes it start: Something arrives';
    expect(itemsFromIntake({ idea } as never).items).toEqual(itemsFromIntake({ idea } as never).items);
  });
});

describe('a story never invents an integration', () => {
  it('tells the story writer to reach outside parties only through a named tool', () => {
    const prompt = buildReleaseStoriesPrompt(
      { brief: 'Dana offers shifts to two temp agencies.', document: '' },
      { key: 'r1', name: 'r1', goal: 'g', demo: 'd', week_start: 1, week_end: 1 },
      [], [], null,
    );
    expect(prompt).toMatch(/Never invent an API, portal or system the inputs do not name/);
  });
});

describe('no story is due on a weekend or a major holiday', () => {
  it('knows the four holidays, Thanksgiving included', () => {
    expect(['2026-12-25', '2027-01-01', '2027-07-04', '2026-11-26', '2027-11-25'].every((s) => isHoliday(d(s)))).toBe(true);
    expect(['2026-12-24', '2026-11-27', '2026-11-19', '2027-07-05'].some((s) => isHoliday(d(s)))).toBe(false);
  });

  it('moves a day off to the working day before it, or after when before is outside the window', () => {
    expect(iso(toWorkingDay(d('2026-12-25')))).toBe('2026-12-24');
    // Friday holiday with no room before: past the weekend to Monday.
    expect(iso(toWorkingDay(d('2027-01-01'), d('2027-01-01')))).toBe('2027-01-04');
    expect(iso(toWorkingDay(d('2026-12-10'), d('2026-12-01')))).toBe('2026-12-10');
  });

  it('moves weekends too (ShiftFill v8 STORY-008 fell on Saturday 2027-01-09)', () => {
    expect(iso(toWorkingDay(d('2027-01-09'), d('2026-11-30')))).toBe('2027-01-08');
    expect(iso(toWorkingDay(d('2027-01-10')))).toBe('2027-01-08');
    // Sunday July 4 2027: Saturday is no better, so Friday the 2nd.
    expect(iso(toWorkingDay(d('2027-07-04')))).toBe('2027-07-02');
    expect(iso(toWorkingDay(d('2027-01-09'), d('2027-01-09')))).toBe('2027-01-11');
    expect(isWorkingDay(d('2027-01-08'))).toBe(true);
    expect(isWorkingDay(d('2027-01-09'))).toBe(false);
  });

  it('never dates a story on a weekend or holiday, whatever day the plan is published', () => {
    // v5's shape: five one-week releases, 13 stories.
    const releases = [0, 1, 2, 3, 4].map((i) => ({ key: `r${i}`, name: `R${i}`, week_start: i + 1, week_end: i + 1 }));
    const storiesByRelease = new Map<string, string[]>();
    let n = 0;
    [4, 3, 2, 2, 2].forEach((c, i) => storiesByRelease.set(`r${i}`, Array.from({ length: c }, () => `S${++n}`)));
    const cohortStart = d('2026-09-03');
    let checked = 0;
    for (let day = 0; day < 400; day += 1) {
      const asOf = new Date(cohortStart.getTime() + day * 86_400_000);
      for (const roadmapAfterDemo of [false, true]) {
        const s = buildSchedule({ window: { cohortStart, asOf }, releases, storiesByRelease, roadmapAfterDemo });
        for (const t of s.tasks) {
          expect(isWorkingDay(t.dueOn)).toBe(true);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(10_000);
  });
});
