import fs from 'fs';
import path from 'path';
import {
  EXTENDED_PALETTES, LANDING_PAGE_THEMES, NEUTRAL_THEME, themeCssVars, themeForLandingPage,
} from '../landingPageTheme';

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
    // `[a-z0-9-]` and not `[a-z-]`: --accent-2 and --accent-3 carry digits, and a class that
    // excluded them silently skipped two real tokens rather than failing - the count check
    // above is what surfaced it.
    const tokenMatch = line.match(/^\s*'(--[a-z0-9-]+)':\s*'(#[0-9A-Fa-f]{3,8})'/);
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
    // Positive control: each parsed theme must carry the full SHARED token set, which is eight.
    //
    // It was briefly 13 here. The renderer v2 work needed five more tokens and they were added
    // to the frontend registry to get them - but that file is a copy of a vendored design system,
    // and the AI Flotation system defines eight tokens and no second brand colour, so two of the
    // five had to be invented to fill the shape. `deliveryBrandThemes.test.ts` rejected them,
    // correctly. The extended five now live in `landingPageTheme.ts`, sourced or derived per
    // brand; see the `the extended palette` block below.
    //
    // If the regex drifts and starts matching nothing, this fails instead of the comparison
    // below passing on two empties.
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
  it.each(['ai-flotation', 'training'])('%s is branded and carries its eight base tokens', (key) => {
    const { theme, branded } = themeForLandingPage(key);
    expect(branded).toBe(true);
    expect(theme).toMatchObject(LANDING_PAGE_THEMES[key]);
  });

  it('training renders the Colaberry cherry red, not the neutral navy', () => {
    // Pinned to the value, not merely to "branded": the whole point of adding this palette was
    // that Colaberry pages were painting #1A365D, a colour from nobody's brand.
    expect(themeForLandingPage('training').theme['--accent']).toBe('#FB2832');
    expect(themeForLandingPage('training').theme['--accent']).not.toBe(NEUTRAL_THEME['--accent']);
  });

  it('cpn renders its own green, not the neutral navy it used to', () => {
    // Regression pin for 2026-10-13. CPN's design system was vendored at apps/cpn-public the
    // whole time and never read, so a CPN landing page rendered #1A365D - a colour from nobody's
    // brand - and that is what Ali saw when he built one.
    const r = themeForLandingPage('cpn');
    expect(r.branded).toBe(true);
    expect(r.theme['--accent']).toBe('#1D6A4C');
    expect(r.theme['--accent']).not.toBe(NEUTRAL_THEME['--accent']);
  });

  it('every seeded theme key is now branded - none falls through to neutral', () => {
    // Every one of the five design systems at github.com/aleemcolaberry is wired as of
    // 2026-10-13, so the neutral theme is no longer any brand's resting state - it is only what
    // an UNKNOWN key gets, which the test below covers. If a sixth brand is seeded without a
    // palette this fails, which is the reminder to wire it rather than ship it navy.
    ['ai-flotation', 'training', 'cpn', 'enterprise', 'refactored'].forEach((key) => {
      expect([key, themeForLandingPage(key).branded]).toEqual([key, true]);
    });
  });

  it.each([null, undefined, ''])('%p falls back to neutral instead of throwing', (key) => {
    expect(themeForLandingPage(key as string | null | undefined).branded).toBe(false);
  });
});

/**
 * The extended five have a DIFFERENT source of truth from the eight, which is the whole reason
 * they were moved out of the frontend registry - so they get their own pin rather than riding
 * along on the parity check above.
 */
describe('the extended palette', () => {
  const EXTENDED = ['--accent-2', '--accent-3', '--accent-deep', '--bg-cool', '--bg-warm'];
  const COLABERRY_TOKENS = path.resolve(
    __dirname, '..', '..', '..', '..', '..', 'frontend', 'src', 'colaberry', 'tokens', 'colors.css',
  );

  /** The `:root` ramp from the Colaberry style guide, by token name. */
  function ramp(): Record<string, string> {
    const css = fs.readFileSync(COLABERRY_TOKENS, 'utf8');
    const root = /:root\s*\{([^}]*)\}/.exec(css);
    if (!root) throw new Error('no :root block in the Colaberry tokens');
    const out: Record<string, string> = {};
    // `[a-z0-9-]`, not `[a-z-]`: the ramp is --red-500 / --neutral-900, and a name class
    // without digits silently matches none of them.
    for (const [, name, value] of root[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      out[name] = value.trim();
    }
    return out;
  }

  it('the ramp parsed, otherwise every check below is vacuous', () => {
    expect(ramp()['--red-500']).toBeDefined();
    expect(Object.keys(ramp()).length).toBeGreaterThan(20);
  });

  it.each([
    ['--accent-2', '--green-600'],
    ['--accent-3', '--blue-500'],
    ['--accent-deep', '--red-700'],
    ['--bg-cool', '--blue-50'],
    ['--bg-warm', '--neutral-50'],
  ])('training\'s %s is the style guide\'s %s, not a near-miss of it', (token, rampToken) => {
    expect(EXTENDED_PALETTES.training[token as keyof typeof EXTENDED_PALETTES.training].toUpperCase())
      .toEqual(ramp()[rampToken].toUpperCase());
  });

  it('enterprise sources its second and third colours from its own system', () => {
    // Its colors.css publishes --brand-leaf and --brand-berry alongside the eight, so these are
    // sourced rather than derived. Pinned to the vendored file: a near-miss of a brand colour
    // across four brands' pages is exactly the drift this suite exists to catch.
    const css = fs.readFileSync(path.resolve(
      __dirname, '..', '..', '..', '..', '..', 'apps', 'colaberry-enterprise-design', 'src', 'assets', 'design', 'tokens', 'colors.css',
    ), 'utf8');
    const root = /:root\s*\{([^}]*)\}/.exec(css);
    expect(root).not.toBeNull();
    const src: Record<string, string> = {};
    for (const [, n, v] of root![1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) src[n] = v.trim();

    expect(src['--brand-leaf']).toBeDefined();
    expect(EXTENDED_PALETTES.enterprise['--accent-2'].toUpperCase()).toEqual(src['--brand-leaf'].toUpperCase());
    expect(EXTENDED_PALETTES.enterprise['--accent-3'].toUpperCase()).toEqual(src['--brand-berry'].toUpperCase());
    expect(EXTENDED_PALETTES.enterprise['--bg-cool'].toUpperCase()).toEqual(src['--accent-soft'].toUpperCase());
  });

  it('a brand with no agreed extended palette derives one from its own eight', () => {
    // AI Flotation's vendored system has one accent and no second brand colour. Deriving keeps
    // such a page single-accent in its OWN colours; the alternative that shipped briefly was two
    // invented hexes in a file that claims to contain none.
    const { theme } = themeForLandingPage('ai-flotation');
    const base = LANDING_PAGE_THEMES['ai-flotation'];
    expect(EXTENDED_PALETTES['ai-flotation']).toBeUndefined();
    expect(theme['--accent-2']).toBe(base['--accent']);
    expect(theme['--accent-3']).toBe(base['--fg-muted']);
    expect(theme['--bg-warm']).toBe(base['--bg']);
    // Colaberry's green and blue must not appear on a page for another brand.
    expect([theme['--accent-2'], theme['--accent-3']]).not.toContain('#5BA63C');
    expect([theme['--accent-2'], theme['--accent-3']]).not.toContain('#367895');
  });

  it.each(['ai-flotation', 'training'])(
    '%s resolves every token, so no stylesheet rule reads an undefined custom property',
    (key) => {
      const { theme } = themeForLandingPage(key);
      EXTENDED.forEach((t) => expect(theme[t as keyof typeof theme]).toMatch(/^#[0-9A-Fa-f]{3,8}$/));

      // Thirteen until 2026-10-22, when the inverse band gained two DERIVED accents. They are
      // counted here rather than exempted, because the point of this assertion is that nothing
      // joins the resolved theme by accident: a new token should fail this test once, on
      // purpose, and then be added deliberately.
      const derivedForDarkBand = ['--accent-on-dark', '--accent-2-on-dark'];
      derivedForDarkBand.forEach((t) => {
        expect(theme[t as keyof typeof theme]).toMatch(/^#[0-9A-Fa-f]{3,8}$/);
      });
      expect(Object.keys(theme)).toHaveLength(13 + derivedForDarkBand.length);
    },
  );
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
