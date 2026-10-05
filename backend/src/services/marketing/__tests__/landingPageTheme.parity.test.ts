import fs from 'fs';
import path from 'path';
import { LANDING_PAGE_THEMES, NEUTRAL_THEME, themeCssVars, themeForLandingPage } from '../landingPageTheme';

/**
 * The backend palette is a COPY. This is the test that keeps it honest.
 *
 * `frontend/src/theme/deliveryBrandThemes.ts` is the source of truth, and the backend cannot
 * import it (`scripts/validate-app-boundaries.js` forbids crossing that line). So the values are
 * duplicated, and the duplication is pinned here exactly the way the frontend file pins its own
 * copy of the CSS: parse the other file, compare every value, and fail on any disagreement.
 *
 * If this test fails, the frontend file wins. Change the backend copy, not the expectation.
 */

const FRONTEND_THEME_FILE = path.resolve(
  __dirname, '..', '..', '..', '..', '..', 'frontend', 'src', 'theme', 'deliveryBrandThemes.ts',
);

/** Pull the `THEMES` object out of the frontend file by reading its `'--token': '#hex'` pairs. */
function parseFrontendThemes(source: string): Record<string, Record<string, string>> {
  const start = source.indexOf('const THEMES');
  if (start === -1) throw new Error('THEMES not found in the frontend theme file');
  // From `const THEMES` to the closing `};` of the object literal.
  const body = source.slice(start, source.indexOf('\n};', start));

  const out: Record<string, Record<string, string>> = {};
  let current: string | null = null;
  for (const line of body.split('\n')) {
    const keyMatch = line.match(/^\s*'([a-z0-9-]+)':\s*\{\s*$/);
    if (keyMatch) { current = keyMatch[1]; out[current] = {}; continue; }
    const tokenMatch = line.match(/^\s*'(--[a-z-]+)':\s*'(#[0-9A-Fa-f]{3,8})'/);
    if (tokenMatch && current) out[current][tokenMatch[1]] = tokenMatch[2];
  }
  return out;
}

describe('the frontend registry is readable, which this whole test depends on', () => {
  it('the file is where it is expected to be', () => {
    expect(fs.existsSync(FRONTEND_THEME_FILE)).toBe(true);
  });

  it('the parser actually finds themes - a silently empty parse would make every check below vacuous', () => {
    const parsed = parseFrontendThemes(fs.readFileSync(FRONTEND_THEME_FILE, 'utf8'));
    expect(Object.keys(parsed).length).toBeGreaterThan(0);
    // Positive control: each parsed theme must have the full 8-token set. If the regex drifts and
    // starts matching nothing, this fails instead of the comparison below passing on two empties.
    expect(Object.entries(parsed).map(([key, tokens]) => [key, Object.keys(tokens).length]))
      .toEqual(Object.keys(parsed).map((key) => [key, 8]));
  });
});

describe('the backend copy matches the frontend source of truth', () => {
  const parsed = parseFrontendThemes(fs.readFileSync(FRONTEND_THEME_FILE, 'utf8'));

  it('covers exactly the same theme keys - no extra brand themed here that is not themed there', () => {
    expect(Object.keys(LANDING_PAGE_THEMES).sort()).toEqual(Object.keys(parsed).sort());
  });

  it.each(Object.keys(parsed))('%s has identical tokens', (key) => {
    expect(LANDING_PAGE_THEMES[key]).toEqual(parsed[key]);
  });
});

describe('resolution always yields something paintable', () => {
  it.each(['ai-flotation', 'training'])('%s is branded', (key) => {
    expect(themeForLandingPage(key)).toEqual({ theme: LANDING_PAGE_THEMES[key], branded: true });
  });

  it('training renders the Colaberry cherry red, not the neutral navy', () => {
    // Pinned to the value, not merely to "branded": the whole point of adding this palette was
    // that Colaberry pages were painting #1A365D, a colour from nobody's brand.
    expect(themeForLandingPage('training').theme['--accent']).toBe('#FB2832');
    expect(themeForLandingPage('training').theme['--accent']).not.toBe(NEUTRAL_THEME['--accent']);
  });

  it.each(['enterprise', 'cpn', 'refactored'])(
    '%s has no agreed palette yet, so it renders neutral rather than guessed',
    (key) => {
      const r = themeForLandingPage(key);
      expect(r.branded).toBe(false);
      expect(r.theme).toBe(NEUTRAL_THEME);
    },
  );

  it.each([null, undefined, ''])('%p falls back to neutral instead of throwing', (key) => {
    expect(themeForLandingPage(key as string | null | undefined).branded).toBe(false);
  });
});

describe('the CSS block', () => {
  it('emits one custom property per token', () => {
    const css = themeCssVars(NEUTRAL_THEME);
    expect(css.split('\n')).toHaveLength(Object.keys(NEUTRAL_THEME).length);
    expect(css).toContain('--accent: #1A365D;');
  });

  it('drops anything that is not a hex colour, so a bad token cannot reach a stylesheet', () => {
    const css = themeCssVars({ ...NEUTRAL_THEME, '--accent': 'red; } body { display:none' } as never);
    expect(css).not.toContain('display:none');
    // `--accent:` with the colon, not the bare prefix: `--accent-contrast` and `--accent-soft`
    // are legitimate tokens that both contain the substring and must still be emitted.
    expect(css).not.toContain('--accent:');
    expect(css).toContain('--accent-contrast:');
    expect(css).toContain('--accent-soft:');
    // The one bad token is dropped; every other one survives.
    expect(css.split('\n')).toHaveLength(Object.keys(NEUTRAL_THEME).length - 1);
  });
});
