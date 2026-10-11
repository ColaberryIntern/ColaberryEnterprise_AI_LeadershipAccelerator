import {
  extractMetricClaims, isSupported, checkGrounding, normalizeNumber, describeUnsupported,
} from '../presentationGrounding';

/**
 * The rule: a student must never present a number they did not supply.
 *
 * The assembled prompt is built from the project tree — titles, statuses, an
 * organisation name — and contains NO figures. So a percentage in a generated deck
 * came from the model, not from the student, and they would be telling an employer
 * something they never typed.
 *
 * The second rule, which is what makes the first usable: a guard that flags
 * everything is a guard nobody reads. Slide numbers and agenda timings are not claims.
 */

const SOURCES = [
  'Our dispatcher handles 1,200 deliveries a week across three depots.',
  'Manual routing took 4 hours per day before the system.',
];

describe('it finds the figures a deck asserts', () => {
  it('catches percentages, money, multipliers and counted units', () => {
    const html = `
      <section><h1>Results</h1>
        <p>Cut dispatch time by 42%.</p>
        <p>Saved $18,000 in the first quarter.</p>
        <p>Routing is 3x faster.</p>
        <p>Handles 1,200 deliveries a week.</p>
      </section>`;
    const got = extractMetricClaims(html).map((c) => c.normalized).sort();
    expect(got).toEqual(['1200', '18000', '3', '42'].sort());
  });

  it('gives enough context for a human to judge the figure', () => {
    const [claim] = extractMetricClaims('<p>Cut dispatch time by 42% in week one.</p>');
    expect(claim.context).toContain('dispatch time');
    expect(claim.text).toBe('42%');
  });

  it('compares on the number, not the formatting', () => {
    expect(normalizeNumber('$1,200')).toBe('1200');
    expect(normalizeNumber('1200')).toBe('1200');
    expect(normalizeNumber('42.0%')).toBe('42');
  });
});

/**
 * THE FALSE-POSITIVE RULE. Every item here is a number in a real deck that claims
 * nothing. Flagging them trains the student to dismiss the whole panel, and then the
 * one fabricated KPI goes through with it.
 */
describe('it does NOT flag numbers that assert nothing', () => {
  it('ignores markup, styles and scripts', () => {
    const html = `
      <div style="width: 640px; color: #336699" data-index="7">
        <script>const x = 99;</script>
        <style>.a { margin: 12px }</style>
        <p>Nothing to see.</p>
      </div>`;
    expect(extractMetricClaims(html)).toEqual([]);
  });

  it('ignores slide and step numbering', () => {
    const html = '<p>Slide 3 of 7</p><p>Step 2: show the guardrail</p><p>Section 4</p>';
    expect(extractMetricClaims(html)).toEqual([]);
  });

  it('ignores a bare year', () => {
    expect(extractMetricClaims('<p>Founded 2019. Rebuilt in 2026.</p>')).toEqual([]);
  });

  it('ignores an agenda timing, which is structure rather than a result', () => {
    const html = '<p>Agenda: 2 minutes on the problem, 5 minutes live.</p>';
    expect(extractMetricClaims(html)).toEqual([]);
  });

  it('a deck with no figures at all is clean', () => {
    const r = checkGrounding('<section><p>We route couriers automatically.</p></section>', SOURCES);
    expect(r).toMatchObject({ claims: [], unsupported: [], clean: true });
  });
});

describe('a figure the student supplied is supported', () => {
  it('accepts a number that appears in their own writing, whatever the formatting', () => {
    const html = '<p>Handles 1200 deliveries a week.</p>';
    const r = checkGrounding(html, SOURCES);
    expect(r.clean).toBe(true);
    expect(r.unsupported).toEqual([]);
  });

  it('accepts a figure written with a comma in the source and without in the deck', () => {
    const claim = extractMetricClaims('<p>1200 orders</p>')[0];
    expect(isSupported(claim, ['we process 1,200 orders'])).toBe(true);
  });

  it('reads through markup in the source as well', () => {
    const claim = extractMetricClaims('<p>4 hours saved</p>')[0];
    expect(isSupported(claim, ['<p>Manual routing took <b>4</b> hours.</p>'])).toBe(true);
  });
});

/**
 * THE CASE THIS WHOLE MODULE EXISTS FOR: the model filled a slide that asked for a
 * metric with a number nobody gave it.
 */
describe('a fabricated KPI is flagged', () => {
  const FABRICATED = `
    <section><h1>Impact</h1>
      <p>Reduced delivery costs by 37%.</p>
      <p>Saved the business $240,000 annually.</p>
      <p>Handles 1,200 deliveries a week.</p>
    </section>`;

  it('flags the invented figures and leaves the real one alone', () => {
    const r = checkGrounding(FABRICATED, SOURCES);
    expect(r.clean).toBe(false);
    const flagged = r.unsupported.map((c) => c.normalized).sort();
    expect(flagged).toEqual(['240000', '37'].sort());
    // 1,200 came from the student, so it must NOT be flagged.
    expect(flagged).not.toContain('1200');
  });

  it('tells the student which figure, and what to do about it', () => {
    const r = checkGrounding(FABRICATED, SOURCES);
    const message = describeUnsupported(r.unsupported[0]);
    expect(message).toContain('does not appear in anything you wrote');
    expect(message).toMatch(/Confirm it|take it out/);
  });

  /**
   * The template text contains EXAMPLE figures ("cut processing time by 40%"). Passing
   * the prompt in as a source would make every fabrication look supported, because the
   * thing that asked for a number also contains one.
   */
  it('is not fooled by grounding against the prompt that asked for a number', () => {
    const deckWithExampleNumber = '<p>Cut processing time by 40%.</p>';
    const studentSources = ['We route couriers. No figures measured yet.'];
    expect(checkGrounding(deckWithExampleNumber, studentSources).clean).toBe(false);
    // And the inverse: if it WERE grounded against the template, it would pass.
    const templateText = 'Example: "cut processing time by 40%"';
    expect(checkGrounding(deckWithExampleNumber, [templateText]).clean).toBe(true);
  });

  it('flags everything when the student supplied nothing at all', () => {
    const r = checkGrounding('<p>Up 55% and 2x faster.</p>', []);
    expect(r.unsupported).toHaveLength(2);
  });

  it('reports each distinct figure once, however many times it appears', () => {
    const r = checkGrounding('<p>37% here.</p><p>And 37% again.</p>', SOURCES);
    expect(r.unsupported).toHaveLength(1);
  });
});

/**
 * Found by a mutation that removed the year filter and broke nothing.
 *
 * A bare "2019" is already excluded, because no pattern matches a bare integer. So the
 * filter could only ever fire on a year carrying a unit — and "2026 users" is precisely
 * the figure this guard exists to catch. It was dead for its intended case and harmful
 * for the one it actually hit.
 */
describe('a number that happens to look like a year is still a claim when it carries a unit', () => {
  it('flags "2026 users"', () => {
    const r = checkGrounding('<p>Serving 2026 users today.</p>', ['We have some users.']);
    expect(r.unsupported.map((c) => c.normalized)).toEqual(['2026']);
  });

  it('flags "$2019" as money', () => {
    const r = checkGrounding('<p>Saves $2019 a month.</p>', ['It saves money.']);
    expect(r.unsupported.map((c) => c.normalized)).toEqual(['2019']);
  });

  it('still ignores a bare year in prose, because a bare integer is not a claim', () => {
    expect(extractMetricClaims('<p>Founded 2019. Rebuilt in 2026.</p>')).toEqual([]);
  });

  it('supports a year-shaped figure the student did supply', () => {
    const r = checkGrounding('<p>2026 users.</p>', ['We onboarded 2026 users last quarter.']);
    expect(r.clean).toBe(true);
  });
});
