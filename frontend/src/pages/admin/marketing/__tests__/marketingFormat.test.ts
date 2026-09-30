import {
  formatMoneyOrUnavailable,
  formatRatioOrUnavailable,
  formatSpend,
} from '../marketingFormat';

/**
 * The `$0` regression, pinned.
 *
 * This suite exists because of a specific escape. The backend was changed so revenue returns
 * `null` when it cannot be computed. Four consumers needed updating; three were. The fourth
 * was the campaign detail modal:
 *
 *     { label: 'Revenue', value: fmt$(roi.revenue || 0) }
 *
 * `null || 0` is `0`, so the page rendered a confident **$0** for the one value the change was
 * about. Three separate gates missed it: `tsc` (the state was `useState<any>`), the backend
 * suite (it grepped source text for a deleted constant), and the frontend suite (it tested the
 * trust badge, not the money). A rendering-shaped assertion is the only kind that catches it,
 * which is why the formatting decision was extracted into a pure module.
 *
 * The regex assertions below deliberately match on OUTPUT rather than on a returned flag: the
 * bug produced a correct-looking string, so the string is what has to be checked.
 */

describe('formatMoneyOrUnavailable — unknown must never render as a number', () => {
  it.each([null, undefined])('renders %p as Unavailable, never as $0', (input) => {
    const out = formatMoneyOrUnavailable(input as null | undefined);
    expect(out.text).toMatch(/Unavailable/);
    // The exact assertion the acceptance criterion names.
    expect(out.text).not.toMatch(/\$\s*0/);
    expect(out.unavailable).toBe(true);
  });

  it('renders a REAL zero as $0, because a measured zero is a fact', () => {
    // The distinction that makes the whole thing worth doing. If unknown and zero both rendered
    // as "Unavailable", a campaign that genuinely earned nothing would be indistinguishable
    // from one we cannot measure - the same collapse, pointing the other way.
    const out = formatMoneyOrUnavailable(0);
    expect(out.text).toBe('$0');
    expect(out.unavailable).toBe(false);
  });

  it('formats real amounts with separators', () => {
    expect(formatMoneyOrUnavailable(45000).text).toBe('$45,000');
    expect(formatMoneyOrUnavailable(1234.6).text).toBe('$1,235');
  });

  it('treats NaN as unknown rather than printing "$NaN"', () => {
    expect(formatMoneyOrUnavailable(Number.NaN).text).toMatch(/Unavailable/);
  });

  it('reproduces the original defect when the old expression is used', () => {
    // Demonstrates the assertion above can actually fail: this is precisely what the page did.
    const oldBehaviour = (n: number | null) => `$${(n || 0).toLocaleString()}`;
    expect(oldBehaviour(null)).toMatch(/\$\s*0/);
    expect(formatMoneyOrUnavailable(null).text).not.toMatch(/\$\s*0/);
  });
});

describe('formatSpend — the creation default is not a measurement', () => {
  it('reports zero spend as Not tracked, not as $0', () => {
    // `campaigns.budget_spent` is set to 0 at creation and never incremented anywhere in the
    // codebase, so a rendered $0 is the default being read as a measurement of zero spend.
    const out = formatSpend(0);
    expect(out.text).toMatch(/Not tracked/);
    expect(out.text).not.toMatch(/\$\s*0/);
    expect(out.unavailable).toBe(true);
  });

  it.each([null, undefined])('reports %p as Not tracked', (input) => {
    expect(formatSpend(input as null | undefined).unavailable).toBe(true);
  });

  it('displays a real spend figure normally, so it narrows itself once data exists', () => {
    // The property that stops this becoming permanent: the moment a connector or a human
    // writes a real number, it renders as a number with no code change.
    const out = formatSpend(2500);
    expect(out.text).toBe('$2,500');
    expect(out.unavailable).toBe(false);
  });
});

describe('formatRatioOrUnavailable — ROI must not drift into 0%', () => {
  it.each([null, undefined])('renders %p as Unavailable, never 0%%', (input) => {
    const out = formatRatioOrUnavailable(input as null | undefined);
    expect(out.text).toMatch(/Unavailable/);
    expect(out.text).not.toMatch(/0\s*%/);
  });

  it('renders a real ratio with a sign', () => {
    expect(formatRatioOrUnavailable(1.5).text).toBe('+150%');
    expect(formatRatioOrUnavailable(-0.25).text).toBe('-25%');
  });

  it('renders a genuine break-even as 0%', () => {
    // Same fact-versus-absence distinction as the money case.
    expect(formatRatioOrUnavailable(0).text).toBe('0%');
    expect(formatRatioOrUnavailable(0).unavailable).toBe(false);
  });
});
