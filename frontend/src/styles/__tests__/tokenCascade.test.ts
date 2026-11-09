import fs from 'fs';
import path from 'path';

/**
 * The three-layer token cascade, and the fact that NO SINGLE FILE IS THE TOKEN
 * AUTHORITY AT RUNTIME.
 *
 * `global.css` imports `tokens.css`, which declares 101 custom properties on
 * `:root`. `brand-bridge.css` then redefines 21 of those SAME properties, also on
 * `:root`, and `index.tsx` imports it AFTER `global.css`. Same selector, same
 * specificity, later source order - so for those 21 names the bridge is what the
 * browser paints, and it re-points each one at `src/colaberry/tokens/*.css`.
 *
 * WHY THIS FILE EXISTS. The repository asserted the opposite in two places at
 * once, and nothing failed:
 *
 *   - `.claude/skills/baseline-ui/SKILL.md` said "tokens.css - the design tokens.
 *     This is the source of truth", and listed `--color-primary-light` as
 *     `#C20E1E`. The browser paints `#FD5760`. A 2026-08-25 correction to that
 *     file had made it worse, by telling readers to trust the source file over
 *     the summary - which is exactly the move that produces the wrong colour
 *     when two source files declare the same property.
 *   - The `design_token_drift_audit` capability record listed "tokens.css
 *     remaining the single token authority" as a dependency, and told the agent
 *     to "parse tokens.css to build the authoritative token set" as step one of
 *     its workflow. An audit built that way reports the wrong expected value for
 *     19 of the 21 and calls correct code a violation.
 *
 * Both were prose. Prose does not fail a build, so this file does.
 *
 * RESOLUTION IS `:root`-ONLY, ON PURPOSE. `colors.css` carries a
 * `[data-theme="dark"]` block that redeclares many of the same names. Resolving
 * across the whole file would mix a dark value into a light answer and still
 * produce a plausible hex.
 */

const STYLES = path.join(__dirname, '..');
const COLABERRY_TOKENS = path.join(__dirname, '..', '..', 'colaberry', 'tokens');
const INDEX_TSX = path.join(__dirname, '..', '..', 'index.tsx');

const read = (p: string): string => fs.readFileSync(p, 'utf8');

/** The FIRST `:root { ... }` block only - never a theme override block. */
function rootBlock(css: string): string {
  const start = css.indexOf(':root');
  if (start < 0) return '';
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return open < 0 || close < 0 ? '' : css.slice(open + 1, close);
}

function declarations(css: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let m = re.exec(css);
  while (m) {
    if (!out.has(m[1])) out.set(m[1], m[2].trim());
    m = re.exec(css);
  }
  return out;
}

/** Every `:root` declaration across the colaberry token layer. */
function colaberryLayer(): Map<string, string> {
  const merged = new Map<string, string>();
  for (const f of fs.readdirSync(COLABERRY_TOKENS).filter((n) => n.endsWith('.css'))) {
    for (const [k, v] of declarations(rootBlock(read(path.join(COLABERRY_TOKENS, f))))) {
      if (!merged.has(k)) merged.set(k, v);
    }
  }
  return merged;
}

/** Follow `var(--x)` to a literal. Returns null for a chain that dangles. */
function resolve(value: string, layer: Map<string, string>): string | null {
  let v = value;
  for (let hops = 0; hops < 8; hops += 1) {
    const m = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(v.trim());
    if (!m) return v.trim();
    const next = layer.get(m[1]);
    if (next === undefined) return null;
    v = next;
  }
  return null;
}

const tokensCss = declarations(rootBlock(read(path.join(STYLES, 'tokens.css'))));
const bridgeCss = declarations(rootBlock(read(path.join(STYLES, 'brand-bridge.css'))));
const layer = colaberryLayer();
const contested = [...bridgeCss.keys()].filter((k) => tokensCss.has(k)).sort();

describe('the token cascade - what actually renders', () => {
  it('resolves a known chain, which is the control for every assertion below', () => {
    // If the resolver were broken, "resolves to a literal" would fail everywhere
    // and "no dangling chain" would pass vacuously. So prove it works first.
    expect(resolve('var(--red-500)', layer)).toBe('#FB2832');
    expect(resolve('var(--surface-page)', layer)).toBe('#FFFFFF');
    expect(resolve('#123456', layer)).toBe('#123456');
    // and prove it reports a miss rather than inventing one
    expect(resolve('var(--token-that-does-not-exist)', layer)).toBeNull();
  });

  it('loads brand-bridge.css AFTER global.css, which is why the bridge wins', () => {
    const idx = read(INDEX_TSX);
    const global = idx.indexOf("styles/global.css");
    const bridge = idx.indexOf("styles/brand-bridge.css");
    expect(global).toBeGreaterThan(-1);
    expect(bridge).toBeGreaterThan(-1);
    // Reordering these two silently changes 21 token values on every page in the
    // product, with nothing on screen saying so.
    expect(bridge).toBeGreaterThan(global);
  });

  it('has a contested set, so no one file can be quoted as the token authority', () => {
    expect(contested.length).toBeGreaterThan(0);
    // Pinned so that ADDING an override has to be acknowledged here rather than
    // landing silently.
    expect(contested).toEqual([
      '--color-accent', '--color-bg', '--color-bg-alt', '--color-border',
      '--color-danger', '--color-danger-bg', '--color-info', '--color-info-bg',
      '--color-muted', '--color-primary', '--color-primary-light',
      '--color-secondary', '--color-success', '--color-success-bg',
      '--color-text', '--color-text-light', '--color-warning',
      '--color-warning-bg', '--font-body', '--font-heading', '--font-mono',
    ]);
  });

  it('resolves every contested token to a real literal, with no dangling var()', () => {
    // A bridge entry re-pointed at a name the colaberry layer does not declare
    // resolves to nothing. The rule then applies no value at all, which reviews
    // clean and renders wrong.
    const dangling = contested.filter((k) => resolve(bridgeCss.get(k) as string, layer) === null);
    expect(dangling).toEqual([]);
  });

  it('pins the rendered colour of the tokens the UI reference quotes', () => {
    // These are the values `baseline-ui` must publish. Nine of them are NOT what
    // tokens.css says, which is the whole point of this file.
    const rendered = (k: string): string | null => resolve(bridgeCss.get(k) as string, layer);
    expect(rendered('--color-primary')).toBe('#FB2832');
    expect(rendered('--color-primary-light')).toBe('#FD5760');
    expect(rendered('--color-secondary')).toBe('#E5121D');
    expect(rendered('--color-accent')).toBe('#5BA63C');
    expect(rendered('--color-bg')).toBe('#FFFFFF');
    expect(rendered('--color-bg-alt')).toBe('#F8F8F7');
    expect(rendered('--color-text')).toBe('#2B2B2B');
    expect(rendered('--color-text-light')).toBe('#6B6B6B');
    expect(rendered('--color-border')).toBe('#E4E4E3');
  });

  it('shows tokens.css disagreeing on all but two, so quoting it alone is wrong', () => {
    // Compared case-insensitively, because the browser is. tokens.css writes
    // `#ffffff` where the colaberry layer writes `#FFFFFF`; that is the same white,
    // and counting it as drift would overstate the problem by one.
    const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const disagree = contested.filter(
      (k) => norm(resolve(bridgeCss.get(k) as string, layer) ?? '') !== norm(tokensCss.get(k) as string),
    );
    // Only --color-primary and --color-bg survive the cascade unchanged. If this
    // count drops, the cascade was flattened and baseline-ui should be simplified
    // to match; if it rises, a new value drifted.
    expect(disagree).toHaveLength(19);
    expect(disagree).not.toContain('--color-primary');
    expect(disagree).not.toContain('--color-bg');
  });

  it('renders Roboto, not the Segoe UI stack tokens.css declares', () => {
    const body = resolve(bridgeCss.get('--font-body') as string, layer) as string;
    expect(body).toContain('Roboto');
    expect((tokensCss.get('--font-body') as string)).toContain('Segoe UI');
    expect(body.indexOf('Roboto')).toBeLessThan(body.indexOf('Segoe UI'));
  });

  it('collapses --color-muted onto --color-text-light, removing a documented contrast', () => {
    // tokens.css gives these two different values (#9ca3af vs #718096). At runtime
    // they are the same grey, so any design that relies on the step between them
    // has no step. Recorded here because it reads like a bug when first met.
    const muted = resolve(bridgeCss.get('--color-muted') as string, layer);
    const light = resolve(bridgeCss.get('--color-text-light') as string, layer);
    expect(muted).toBe(light);
    expect(tokensCss.get('--color-muted')).not.toBe(tokensCss.get('--color-text-light'));
  });
});
