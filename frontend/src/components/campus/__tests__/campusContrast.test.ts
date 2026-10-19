import fs from 'fs';
import path from 'path';

/**
 * C11 contrast, from the REAL stylesheets (WCAG 1.4.3 text 4.5:1, 1.4.11 graphics 3:1).
 *
 * jsdom has no paint, so axe cannot compute contrast (campusA11y.test.tsx pins that). This test resolves the actual token
 * values instead: it reads the CSS files, follows var() chains, composites rgba over the surface beneath, and checks every
 * campus text-on-fill pair in FOUR contexts: the portal shell (.te-shell, TodayShell.css) and the legacy pages (.cm-scope
 * onto colaberry/tokens/colors.css), each in light and [data-theme="dark"]. The pair list is maintained here: a new pair
 * of campus colors belongs in PAIRS.
 */
const SRC = path.join(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

type Vars = Record<string, string>;
const declarations = (body: string): Vars =>
  Object.fromEntries(Array.from(body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)).map((m) => [m[1], m[2].trim()]));
/** The body of the first rule whose selector list exactly matches `selector`. */
function block(css: string, selector: string): Vars {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
  const m = css.match(new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`));
  return m ? declarations(m[1]) : {};
}

const COLORS = read('colaberry/tokens/colors.css');
const SHELL = read('pages/portal/today/TodayShell.css');
const SCOPE = read('components/campus/campusBanner.css');
const TOKENS = read('components/campus/campusTokens.css');
const RUNGS = read('styles/rungTones.css');

export type Ctx = { scope: 'shell' | 'legacy'; dark: boolean };
export const CONTEXTS: Ctx[] = [
  { scope: 'shell', dark: false }, { scope: 'shell', dark: true }, { scope: 'legacy', dark: false }, { scope: 'legacy', dark: true },
];

/** Merged custom properties for a context, lowest priority first (later layers override earlier). */
export function varsFor(ctx: Ctx): Vars {
  const layers: Vars[] = [block(COLORS, ':root'), ctx.dark ? block(COLORS, '[data-theme="dark"]') : {},
    block(TOKENS, ':root'), ctx.dark ? block(TOKENS, '[data-theme="dark"]') : {}];
  if (ctx.scope === 'shell') layers.push(block(SHELL, '.te-shell'), ctx.dark ? block(SHELL, '[data-theme="dark"] .te-shell') : {});
  else layers.push(block(SCOPE, '.cm-scope'));
  return Object.assign({}, ...layers);
}

type RGBA = [number, number, number, number];
export function parseColor(v: string): RGBA {
  const s = v.trim();
  let m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)).concat(1) as RGBA;
  m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) return m[1].split('').map((c) => parseInt(c + c, 16)).concat(1) as RGBA;
  m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) { const p = m[1].split(',').map((x) => parseFloat(x)); return [p[0], p[1], p[2], p[3] ?? 1]; }
  throw new Error(`unparsed color: ${v}`);
}
export function resolve(value: string, vars: Vars, depth = 0): string {
  if (depth > 20) throw new Error(`var() loop at ${value}`);
  const m = value.trim().match(/^var\((--[\w-]+)\)$/);
  if (!m) return value.trim();
  const next = vars[m[1]];
  if (next === undefined) throw new Error(`undefined token ${m[1]}`);
  return resolve(next, vars, depth + 1);
}
const over = (top: RGBA, under: RGBA): RGBA => {
  const a = top[3];
  return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1) as RGBA;
};
const lum = ([r, g, b]: RGBA) => {
  const c = [r, g, b].map((x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export function ratio(fg: RGBA, bg: RGBA): number {
  const a = lum(fg), b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** fg on bg, where bg may itself be translucent over `base` (a tint over the card surface). */
function contrast(vars: Vars, fg: string, bg: string, base = '--surface'): number {
  const baseC = parseColor(resolve(`var(${base})`, vars));
  const bgC = over(parseColor(resolve(`var(${bg})`, vars)), baseC);
  const fgC = over(parseColor(resolve(`var(${fg})`, vars)), bgC);
  return ratio(fgC, bgC);
}

const TEXT = 4.5, GRAPHIC = 3;
// [what, foreground token, background token, minimum]
const PAIRS: [string, string, string, number][] = [
  ['primary button', '--cm-on-accent', '--cm-accent', TEXT],
  ['primary button hover', '--cm-on-accent', '--cm-accent-hover', TEXT],
  ['secondary button', '--strong', '--surface', TEXT],
  ['link on a card', '--cm-link', '--surface', TEXT],
  ['link on the page', '--cm-link', '--page', TEXT],
  ['link on a sunken panel', '--cm-link', '--sunken', TEXT],
  ['ON AIR badge', '--cm-on-accent', '--cm-accent', TEXT],
  ['head-count chip', '--cm-on-accent', '--cm-live', TEXT],
  ['plan stop number / AI staff tag / picked game', '--cm-on-accent', '--cm-info', TEXT],
  ['"On air:" on the live strip', '--cm-cherry-text', '--sunken', TEXT],
  ['active phone tab', '--cm-cherry-text', '--surface', TEXT],
  ['tour tag: preview / demo', '--cm-on-warn', '--amber', TEXT],
  ['tour tag: locked, active nav item', '--surface', '--strong', TEXT],
  ['body text', '--body', '--surface', TEXT],
  ['muted text on a card', '--muted', '--surface', TEXT],
  ['muted text on a sunken panel / map chip', '--muted', '--sunken', TEXT],
  ['building label on the map', '--strong', '--sunken', TEXT],
  ['focus ring on a card', '--berry', '--surface', GRAPHIC],
  ['focus ring on the page', '--berry', '--page', GRAPHIC],
  ['focus ring on the map ground (buildings, gate, tokens)', '--berry', '--sunken', GRAPHIC],
  ['your pin on the map', '--cherry', '--sunken', GRAPHIC],
];

describe('the resolver measures what it claims', () => {
  it('known ratios: black on white is 21, white on brand cherry is 3.85 (the defect C11 fixed)', () => {
    expect(ratio(parseColor('#000000'), parseColor('#FFFFFF'))).toBeCloseTo(21, 1);
    expect(ratio(parseColor('#FFFFFF'), parseColor('#FB2832'))).toBeCloseTo(3.85, 1);
  });
  it('composites translucency: a 10% tint barely moves the background', () => {
    expect(over(parseColor('rgba(0,0,0,.1)'), parseColor('#FFFFFF'))[0]).toBeCloseTo(229.5, 0);
  });
  it('follows var() chains in each context and finds the dark overrides', () => {
    expect(resolve('var(--surface)', varsFor({ scope: 'shell', dark: false }))).toMatch(/^#fff/i);
    expect(resolve('var(--surface)', varsFor({ scope: 'shell', dark: true }))).toBe('#1E1E1E');
    expect(resolve('var(--surface)', varsFor({ scope: 'legacy', dark: true }))).toBe('#1A1A1A');
    expect(resolve('var(--cm-link)', varsFor({ scope: 'legacy', dark: true }))).toBe('#A6C5D5');
  });
  it('mutation control: the pre-C11 button (white on brand cherry) and dark text on berry FAIL this test', () => {
    const v = varsFor({ scope: 'shell', dark: true });
    expect(contrast(v, '--surface', '--berry')).toBeLessThan(TEXT); // old route stops / AI tag in dark mode
    expect(contrast(varsFor({ scope: 'shell', dark: false }), '--surface', '--cherry')).toBeLessThan(TEXT); // old .cm-btn
    expect(contrast(v, '--berry', '--surface')).toBeLessThan(TEXT); // old dark-mode links
  });
});

describe.each(CONTEXTS.map((c) => [`${c.scope} ${c.dark ? 'dark' : 'light'}`, c] as const))('campus pairs: %s', (_n, ctx) => {
  const vars = varsFor(ctx);
  it.each(PAIRS)('%s', (_what, fg, bg, min) => {
    const r = contrast(vars, fg, bg);
    expect({ ratio: Math.round(r * 100) / 100, ok: r >= min }).toEqual({ ratio: Math.round(r * 100) / 100, ok: true });
  });
});

describe('level (rung) tones', () => {
  const TONES = ['aware-1', 'aware-2', 'enabled-1', 'enabled-2', 'builder-1', 'builder-2', 'builder-3', 'builder-4', 'architect', 'senior'];
  const toneVars = (tone: string, dark: boolean): Vars => ({
    ...block(RUNGS, `.rung-${tone}`), ...(dark ? block(RUNGS, `[data-theme="dark"] .rung-${tone}`) : {}),
  });
  describe.each(CONTEXTS.map((c) => [`${c.scope} ${c.dark ? 'dark' : 'light'}`, c] as const))('%s', (_n, ctx) => {
    const dark = ctx.dark;
    const shell = varsFor(ctx);
    it.each(TONES)('%s: pill text on its tint holds 4.5:1, the ring holds 3:1', (tone) => {
      const vars = { ...shell, ...toneVars(tone, dark) };
      const pill = contrast(vars, '--rung-fg', '--rung-bg');
      const ring = contrast(vars, '--rung-solid', '--surface');
      expect({ tone, pill: pill >= TEXT, ring: ring >= GRAPHIC }).toEqual({ tone, pill: true, ring: true });
    });
  });
});
