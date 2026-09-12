/**
 * The rules a student reads before the round trip must be the server's rules.
 *
 * `acceptanceProblem` exists so a student sees "one line must start with Trust"
 * while typing, not after a 422. That is only worth anything if it agrees with
 * `addStorySchema` and `buildStoryRevision` on the backend: 3 to 7 lines, exactly
 * one Trust line, nothing shorter than 8 characters. These pin the agreement.
 */
import { parseAcceptance, acceptanceProblem, describeRefusal } from '../AddStoryPanel';

const ok = [
  'Given a roster, when I click export, then a CSV downloads',
  'Given an empty roster, when I click export, then I am told there is nothing to export',
  'Trust: the export is logged with who asked and when',
];

describe('parseAcceptance — one criterion per line', () => {
  it('splits on either newline flavour, trims, and drops blanks', () => {
    expect(parseAcceptance('a line here\r\n\n  another line  \n')).toEqual(['a line here', 'another line']);
  });
  it('returns nothing for nothing', () => {
    expect(parseAcceptance('   \n\n')).toEqual([]);
  });
});

describe('acceptanceProblem — the same bar the server holds', () => {
  it('passes a set the server would accept', () => {
    expect(acceptanceProblem(ok)).toBeNull();
  });

  it('needs at least 3 lines and says how many are there', () => {
    expect(acceptanceProblem(ok.slice(0, 2))).toBe('2 of at least 3 acceptance lines');
  });

  it('refuses more than 7', () => {
    const eight = [...ok, ...new Array(5).fill('Given x, when y, then z happens')];
    expect(acceptanceProblem(eight)).toMatch(/^8 lines/);
  });

  it('insists on exactly one Trust line — zero and two both fail', () => {
    expect(acceptanceProblem(ok.filter((l) => !/^trust/i.test(l)).concat('Given p, when q, then r'))).toMatch(/must start with "Trust"/);
    expect(acceptanceProblem([...ok, 'Trust: a second one'])).toMatch(/exactly one line/);
  });

  it('matches "Trust" case-insensitively and as a word, like the server regex', () => {
    expect(acceptanceProblem([ok[0], ok[1], 'TRUST — every call is traced'])).toBeNull();
    // "Trusted" is not a Trust line: \b after "trust" must fail on the "e".
    expect(acceptanceProblem([ok[0], ok[1], 'Trusted users can export'])).toMatch(/must start with "Trust"/);
  });

  it('names a line too short to be a criterion', () => {
    expect(acceptanceProblem([ok[0], ok[2], 'short'])).toBe('"short" is too short to be a criterion');
  });
});

describe('describeRefusal — a refusal a student can act on', () => {
  it('turns gate violations into lines, not a blob', () => {
    const d = describeRefusal({
      status: 422, error_class: 'GateBlocked', message: 'the revised plan fails the publish gate',
      details: { violations: [{ rule: 'dangling_release', message: 'STORY-016 names unknown release r9' }] },
    });
    expect(d.headline).toMatch(/would not pass/);
    expect(d.lines).toEqual(['STORY-016 names unknown release r9']);
  });

  it('does not blame the student for a plan that predates a gate rule', () => {
    const d = describeRefusal({ status: 422, error_class: 'PlanPredatesGate', message: 'x', details: { violations: [] } });
    expect(d.headline).toMatch(/not your story/i);
  });

  it('passes a named rule through in the server\'s own words', () => {
    const d = describeRefusal({ status: 422, error_class: 'NoTrustLine', message: 'one acceptance line must start with "Trust"', details: null });
    expect(d.headline).toBe('one acceptance line must start with "Trust"');
    expect(d.lines).toEqual([]);
  });

  it('falls back to something rather than nothing on an unknown class', () => {
    const d = describeRefusal({ status: 500, error_class: null, message: '', details: null });
    expect(d.headline.length).toBeGreaterThan(0);
  });
});
