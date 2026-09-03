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
const DESIGN_TOKENS = path.join(
  REPO_ROOT, 'apps', 'ai-flotation-public', 'src', 'assets', 'design', 'colors.css',
);
const THEME_REGISTRY = path.join(REPO_ROOT, 'frontend', 'src', 'theme', 'deliveryBrandThemes.ts');

/** The `:root` block only - never `[data-theme="dark"]` or `[data-variant="harbor"]`. */
function forgeLightTokens(css: string): Record<string, string> {
  const root = /:root\s*\{([^}]*)\}/.exec(css);
  if (!root) throw new Error('no :root block in colors.css');
  const tokens: Record<string, string> = {};
  for (const [, name, value] of root[1].matchAll(/(--[a-z-]+)\s*:\s*([^;]+);/g)) {
    tokens[name] = value.trim();
  }
  return tokens;
}

function registryTokens(ts: string, key: string): Record<string, string> {
  const block = new RegExp(`'${key}':\\s*\\{([^}]*)\\}`).exec(ts);
  if (!block) throw new Error(`no '${key}' entry in the theme registry`);
  const tokens: Record<string, string> = {};
  for (const [, name, value] of block[1].matchAll(/'(--[a-z-]+)':\s*'([^']+)'/g)) {
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
    // Five theme keys are seeded - enterprise, training, cpn, ai-flotation, refactored -
    // and only one has a design system. A guessed palette in front of a real client is
    // worse than the neutral surface, so the others must stay absent until their tokens
    // land the way this one did.
    const keys = [...ts.matchAll(/^\s{2}'([a-z-]+)':\s*\{/gm)].map((m) => m[1]);
    expect(keys).toEqual(['ai-flotation']);
  });
});
