import { LANDING_PAGE_THEMES, themeForLandingPage, LandingPageTheme } from '../landingPageTheme';
import {
  auditInverseBand, contrastRatio, describeMiss, liftForContrast, relativeLuminance,
  resolveToken, stylesheetFallback,
} from '../landingPageContrast';
import { STYLES } from '../landingPageStyles';

/**
 * The inverse band is readable for every brand, and stays readable when a brand is added.
 *
 * WHAT THIS CAUGHT. Measured 2026-10-22 across all five brands: four pairs failed AA. CPN's
 * eyebrow was 2.67:1 where 4.5 is required, AI Flotation's 3.23:1, and Enterprise's heading
 * highlight 2.92:1 where 3 is required. Every one of them rendered - the words were on the page,
 * in the brand's own colour, on a dark ground, invisible. Nothing errored and nothing logged,
 * which is exactly why this is arithmetic in a test rather than something anyone would spot.
 *
 * Also corrected here: a note in an earlier session claimed twelve misses on Training and six on
 * AI Flotation. Measured, Training passes every pair. Counting beats remembering.
 */

const BRANDS = Object.keys(LANDING_PAGE_THEMES);

/**
 * `contrastRatio` and `relativeLuminance` return `number | null` on purpose - null means "that
 * was not a colour", which is a different answer from any ratio. These unwrap it for the cases
 * that are asserting arithmetic, so a null fails loudly as a null rather than being cast into a
 * number and compared. The null-handling cases below call the functions directly.
 */
function ratio(a: string, b: string): number {
  const r = contrastRatio(a, b);
  if (r === null) throw new Error(`expected a measurable pair, got null for ${a} on ${b}`);
  return r;
}

function lum(hex: string): number {
  const l = relativeLuminance(hex);
  if (l === null) throw new Error(`expected a colour, got null for ${hex}`);
  return l;
}

describe('the arithmetic', () => {
  it('matches the WCAG reference values', () => {
    // Black on white is the defined maximum, 21:1.
    expect(ratio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(ratio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    // #767676 on white is the canonical "just passes AA" grey, 4.54:1.
    expect(ratio('#767676', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#787878', '#FFFFFF')).toBeLessThan(4.5);
    // A dark grey on black fails, which is the shape of the real bug this catches.
    expect(ratio('#555555', '#000000')).toBeLessThan(4.5);
  });

  it('is symmetric - which colour is the text does not change the ratio', () => {
    expect(ratio('#1D6A4C', '#1A1A1A')).toBeCloseTo(ratio('#1A1A1A', '#1D6A4C'), 6);
  });

  it('accepts short hex and is case-insensitive', () => {
    expect(lum('#fff')).toBeCloseTo(lum('#FFFFFF'), 6);
    expect(lum('abc')).toBeCloseTo(lum('#AABBCC'), 6);
  });

  it('returns null rather than a number for something that is not a colour', () => {
    // A null surfaces as "could not measure". A 0 or a 21 would read as a verdict.
    expect(relativeLuminance('var(--accent)')).toBeNull();
    expect(relativeLuminance('')).toBeNull();
    expect(contrastRatio('#FFFFFF', 'rebeccapurple')).toBeNull();
  });
});

describe('the fallbacks come from the stylesheet, not from a second copy of it', () => {
  it('reads the literal the rule actually falls back to', () => {
    expect(stylesheetFallback('--contrast-bg')).toBe('#1A1A1A');
    expect(STYLES).toContain('var(--contrast-bg,#1A1A1A)');
  });

  it('prefers a brand value over the fallback', () => {
    expect(resolveToken({ '--contrast-bg': '#0A1016' }, '--contrast-bg')).toBe('#0A1016');
    expect(resolveToken({}, '--contrast-bg')).toBe('#1A1A1A');
  });

  it('reports null for a token no rule falls back to', () => {
    expect(stylesheetFallback('--no-such-token')).toBeNull();
  });
});

describe('lifting a colour only as far as it has to go', () => {
  it('leaves a colour that already passes exactly as it is', () => {
    // This is the property that keeps the passing brands rendering byte-identically.
    expect(liftForContrast('#FB2832', '#1A1A1A', 3)).toBe('#FB2832');
    expect(liftForContrast('#5CA7DA', '#0A1016', 4.5)).toBe('#5CA7DA');
  });

  it('lifts a failing colour until it just clears, and no further', () => {
    const lifted = liftForContrast('#1D6A4C', '#1A1A1A', 4.5);
    expect(lifted).not.toBe('#1D6A4C');
    expect(ratio(lifted, '#1A1A1A')).toBeGreaterThanOrEqual(4.5);
    // "No further": one step back down would fail. Proves it is minimal rather than just white.
    expect(lifted).not.toBe('#FFFFFF');
  });

  it('keeps the hue recognisable - it is the brand colour, lighter', () => {
    // CPN's green must still be greener than it is red or blue.
    const lifted = liftForContrast('#1D6A4C', '#1A1A1A', 4.5);
    const r = parseInt(lifted.slice(1, 3), 16);
    const g = parseInt(lifted.slice(3, 5), 16);
    const b = parseInt(lifted.slice(5, 7), 16);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it('is deterministic', () => {
    expect(liftForContrast('#BA430E', '#1A1A1A', 4.5)).toBe(liftForContrast('#BA430E', '#1A1A1A', 4.5));
  });

  it('returns the input unchanged when it cannot be read', () => {
    expect(liftForContrast('not-a-colour', '#1A1A1A', 4.5)).toBe('not-a-colour');
  });
});

/**
 * A theme as a plain token map.
 *
 * `LandingPageTheme` is a specific object type with optional members, not an index signature, so
 * `theme as Record<string, string>` is a conversion TypeScript rejects outright: the two types do
 * not overlap enough. `as unknown as` would silence it by asserting something false - that every
 * declared token is present and is a string, when `Partial<SurfacePalette>` says several may be
 * undefined.
 *
 * This drops the absent ones instead, which is both type-correct without any assertion about the
 * values and a truer description of what `auditInverseBand` receives.
 */
function tokens(theme: LandingPageTheme): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(theme)) if (typeof v === 'string') out[k] = v;
  return out;
}

describe('every brand, every pair on the inverse band', () => {
  it.each(BRANDS)('%s meets WCAG AA', (key) => {
    const { theme } = themeForLandingPage(key);
    const misses = auditInverseBand(tokens(theme))
      .filter((p) => !p.passes)
      .map((p) => describeMiss(key, p));
    expect(misses).toEqual([]);
  });

  it('measured something real rather than passing vacuously', () => {
    // The control. If `auditInverseBand` silently returned [] the test above would pass for
    // every brand forever, which is the failure mode of a green suite that checks nothing.
    const { theme } = themeForLandingPage('cpn');
    const pairs = auditInverseBand(tokens(theme));
    expect(pairs.length).toBeGreaterThanOrEqual(5);
    expect(pairs.every((p) => p.ratio > 1)).toBe(true);
  });

  it('still fails when a brand genuinely cannot be read', () => {
    // The other half of the control: a deliberately broken theme must NOT pass.
    const broken = { '--contrast-fg': '#1C1C1C', '--contrast-bg': '#1A1A1A' };
    const misses = auditInverseBand(broken).filter((p) => !p.passes);
    expect(misses.length).toBeGreaterThan(0);
  });
});

describe('the brands that were already fine did not move', () => {
  it.each(['training', 'refactored'])('%s keeps its own accent on the dark band', (key) => {
    const t = tokens(themeForLandingPage(key).theme);
    expect(t['--accent-on-dark']).toBe(t['--accent']);
    expect(t['--accent-2-on-dark']).toBe(t['--accent-2']);
  });

  it.each(['cpn', 'ai-flotation'])('%s gets a lifted eyebrow, because its own failed', (key) => {
    const t = tokens(themeForLandingPage(key).theme);
    expect(t['--accent-2-on-dark']).not.toBe(t['--accent-2']);
  });
});
