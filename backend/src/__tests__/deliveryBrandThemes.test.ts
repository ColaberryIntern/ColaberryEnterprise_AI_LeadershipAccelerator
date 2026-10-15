import * as fs from 'fs';
import * as path from 'path';

/**
 * The client surface's AI Flotation theme must equal the design system it claims to be.
 *
 * WHY THIS EXISTS. `frontend/src/theme/deliveryBrandThemes.ts` carries a copy of the
 * Forge light tokens. It is a copy on purpose: `frontend/` importing from `apps/` is the
 * exact edge `scripts/validate-app-boundaries.js` forbids, so the alternative to
 * duplication is a boundary violation, not a shared import.
 *
 * A copy nobody checks is a copy that drifts. The failure would be quiet and ugly - the
 * public site in one rust and the client portal in a slightly different one, with both
 * calling themselves the brand. So the copy is pinned to its source here.
 *
 * If this fails, the CSS file is the source of truth and the TypeScript is the copy. Fix
 * the copy. Do not edit the expectation.
 *
 * Reads both files with `fs` rather than importing them, so it adds no module coupling
 * and cannot trip the extraction boundary validator itself.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
// tokens/colors.css, not design/colors.css. The design system is vendored from its own
// repository by backend/src/scripts/syncDesignSystems.js, which reproduces that
// repository's own layout rather than a flattened copy, so the tokens live one level down.
const DESIGN_TOKENS = path.join(
  REPO_ROOT, 'apps', 'ai-flotation-public', 'src', 'assets', 'design', 'tokens', 'colors.css',
);
const THEME_REGISTRY = path.join(REPO_ROOT, 'frontend', 'src', 'theme', 'deliveryBrandThemes.ts');

/** The `:root` block only - never `[data-theme="dark"]` or `[data-variant="harbor"]`. */
function forgeLightTokens(css: string): Record<string, string> {
  const root = /:root\s*\{([^}]*)\}/.exec(css);
  if (!root) throw new Error('no :root block in colors.css');
  const tokens: Record<string, string> = {};
  // Digits are part of a token name: the Forge tokens have none, but the Colaberry ramp is
  // `--red-500` / `--neutral-900`, and a name class of `[a-z-]` silently matched none of them.
  // Strictly broader, so it cannot change what the AI Flotation comparison already saw.
  for (const [, name, value] of root[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    tokens[name] = value.trim();
  }
  return tokens;
}

function registryTokens(ts: string, key: string): Record<string, string> {
  const block = new RegExp(`'${key}':\\s*\\{([^}]*)\\}`).exec(ts);
  if (!block) throw new Error(`no '${key}' entry in the theme registry`);
  const tokens: Record<string, string> = {};
  // `[a-z0-9-]`, matching `forgeLightTokens` above, and for the same reason. A name class
  // without digits SKIPS a token silently rather than failing: a `--accent-2` added to the
  // registry would simply not be compared, and this test would keep passing while the copy
  // drifted. No token here carries a digit today, so this changes nothing now - it removes
  // the trap before someone falls into it.
  for (const [, name, value] of block[1].matchAll(/'(--[a-z0-9-]+)':\s*'([^']+)'/g)) {
    tokens[name] = value;
  }
  return tokens;
}

describe('the client surface theme matches the vendored design system', () => {
  const css = fs.readFileSync(DESIGN_TOKENS, 'utf8');
  const ts = fs.readFileSync(THEME_REGISTRY, 'utf8');

  it('every AI Flotation token equals its value in colors.css', () => {
    const source = forgeLightTokens(css);
    const copy = registryTokens(ts, 'ai-flotation');

    expect(Object.keys(copy).length).toBeGreaterThan(0);
    for (const [name, value] of Object.entries(copy)) {
      // Compared case-insensitively: CSS hex is case-blind, and a case difference is not
      // drift worth failing a build over.
      expect(`${name}=${value.toUpperCase()}`).toEqual(`${name}=${(source[name] ?? '').toUpperCase()}`);
    }
  });

  it('carries the accent that the whole identity turns on', () => {
    // Named explicitly rather than left to the loop. If the parser above ever silently
    // matches nothing, the loop passes vacuously and this does not.
    expect(registryTokens(ts, 'ai-flotation')['--accent'].toUpperCase()).toEqual('#BA430E');
    expect(forgeLightTokens(css)['--accent'].toUpperCase()).toEqual('#BA430E');
  });

  it('themes only the brands whose palette was actually agreed', () => {
    // ALL FIVE are wired as of 2026-10-13, which is the point of this assertion now: the rule
    // was never "do not theme brands", it was "do not INVENT a palette". Every one of these is
    // copied from that brand's own design system at github.com/aleemcolaberry.
    //
    // Three joined that day, and each had been available the whole time. `cpn` was vendored at
    // apps/cpn-public and never read. `enterprise` was never vendored at all - the sync registry
    // carried `target: null` - and FOUR brands resolve to it, so it was the largest single
    // source of navy pages. `refactored` needed the renderer's hardcoded light surfaces
    // tokenised first, because it is the only dark-first system.
    //
    // A new key must still arrive with a sourced palette, not a guessed one. That rule stands;
    // what changed is that nothing is left unsourced.
    const keys = [...ts.matchAll(/^\s{2}'([a-z-]+)':\s*\{/gm)].map((m) => m[1]);
    expect(keys.sort()).toEqual(['ai-flotation', 'cpn', 'enterprise', 'refactored', 'training']);
  });

  it('every Colaberry Enterprise token equals its value in the vendored system', () => {
    // Four brands resolve to this key - advisor, colaberry-enterprise, trustbeforeintelligence,
    // worldoftaxonomy - so it was the largest single source of unbranded surfaces. Its system
    // was never vendored here at all until 2026-10-13; the sync registry carried target: null.
    const css = fs.readFileSync(path.join(
      REPO_ROOT, 'apps', 'colaberry-enterprise-design', 'src', 'assets', 'design', 'tokens', 'colors.css',
    ), 'utf8');
    const source = forgeLightTokens(css);
    const copy = registryTokens(ts, 'enterprise');

    expect(Object.keys(copy).length).toBeGreaterThan(0);
    for (const [name, value] of Object.entries(copy)) {
      expect(`${name}=${value.toUpperCase()}`).toEqual(`${name}=${(source[name] ?? '').toUpperCase()}`);
    }
  });

  it('every CPN token equals its value in the vendored cpn design system', () => {
    // Same contract as AI Flotation above, same direction: the CSS is the source of truth and
    // the TypeScript is the copy.
    const cpnCss = fs.readFileSync(path.join(
      REPO_ROOT, 'apps', 'cpn-public', 'src', 'assets', 'design', 'tokens', 'colors.css',
    ), 'utf8');
    const source = forgeLightTokens(cpnCss);
    const copy = registryTokens(ts, 'cpn');

    expect(Object.keys(copy).length).toBeGreaterThan(0);
    for (const [name, value] of Object.entries(copy)) {
      expect(`${name}=${value.toUpperCase()}`).toEqual(`${name}=${(source[name] ?? '').toUpperCase()}`);
    }
  });

  it('every Refactored token equals its value in the vendored system', () => {
    // The only dark-first system: ground #0C141B, text #E8F0F6. Pinned like the rest - being a
    // dark brand is not an excuse for an unpinned copy.
    const refCss = fs.readFileSync(path.join(
      REPO_ROOT, 'apps', 'refactored-public', 'src', 'assets', 'design', 'tokens', 'colors.css',
    ), 'utf8');
    const source = forgeLightTokens(refCss);
    const copy = registryTokens(ts, 'refactored');

    expect(Object.keys(copy).length).toBeGreaterThan(0);
    for (const [name, value] of Object.entries(copy)) {
      expect(`${name}=${value.toUpperCase()}`).toEqual(`${name}=${(source[name] ?? '').toUpperCase()}`);
    }
    // Its ground really is darker than its text, which is what makes it the awkward one.
    expect(copy['--bg'].toUpperCase()).toEqual('#0C141B');
  });


  it('CPN carries its own green, and not another brand\'s accent', () => {
    // Named explicitly, so a parser that silently matched nothing cannot pass this.
    const cpn = registryTokens(ts, 'cpn');
    expect(cpn['--accent'].toUpperCase()).toEqual('#1D6A4C');
    expect(cpn['--accent']).not.toEqual(registryTokens(ts, 'training')['--accent']);
    expect(cpn['--accent']).not.toEqual(registryTokens(ts, 'ai-flotation')['--accent']);
  });

  /**
   * Colaberry's palette is sourced, not guessed - so it is pinned to its source too.
   *
   * `frontend/src/colaberry/tokens/colors.css` is headed "Built from the Colaberry School
   * Style Guide". Every token in the `training` theme is one of its named ramp values, and
   * each is pinned to the ramp token it came from rather than to a bare hex, so a drift in
   * the style guide fails here instead of leaving the landing pages on a stale red.
   */
  describe('the training theme is the Colaberry School Style Guide', () => {
    const COLABERRY_TOKENS = path.join(
      REPO_ROOT, 'frontend', 'src', 'colaberry', 'tokens', 'colors.css',
    );
    const ramp = forgeLightTokens(fs.readFileSync(COLABERRY_TOKENS, 'utf8'));
    const training = registryTokens(ts, 'training');

    it('the ramp parsed - otherwise every check below would be vacuous', () => {
      expect(ramp['--red-500']).toBeDefined();
      expect(Object.keys(training)).toHaveLength(8);
    });

    it.each([
      ['--accent', '--red-500'],
      ['--accent-soft', '--red-50'],
      ['--accent-contrast', '--neutral-0'],
      ['--bg', '--neutral-0'],
      ['--bg-elevated', '--neutral-50'],
      ['--fg', '--neutral-900'],
      ['--fg-muted', '--neutral-700'],
      ['--line', '--neutral-200'],
    ])('%s is the style guide\'s %s', (themeToken, rampToken) => {
      expect(training[themeToken].toUpperCase()).toEqual(ramp[rampToken].toUpperCase());
    });

    it('the accent is cherry red, named explicitly', () => {
      // Named rather than left to the table above, which would pass vacuously if the ramp
      // parser ever silently matched nothing.
      expect(training['--accent'].toUpperCase()).toEqual('#FB2832');
    });
  });
});
