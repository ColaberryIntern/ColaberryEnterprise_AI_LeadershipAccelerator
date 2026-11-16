/**
 * The WCAG contrast resolver, lifted out of `campusContrast.test.ts` so more than one suite can
 * use it. AF12.6, step 1.
 *
 * ## Why it had to move
 *
 * jsdom has no paint, so axe cannot compute contrast at all. The only honest way to check it in
 * this repo is to read the real stylesheets, follow the `var()` chains the browser follows, and
 * do the arithmetic. `campusContrast.test.ts` built exactly that and then used it on
 * `components/campus/**` and nothing else, which is why a 3.85:1 action button survived in the
 * rest of the product with a green build. The maths was never the missing piece; the reach was.
 *
 * Nothing here is campus-specific. The pair lists, the contexts and the stylesheet choices stay
 * with each suite, because those ARE the thing each suite is asserting.
 *
 * ## This directory is excluded from the jest run on purpose
 *
 * `testEnv/` holds helpers that live under `__tests__` and contain no test of their own. CI runs
 * `react-scripts test --testPathIgnorePatterns "/testEnv/"` so jest does not fail them for being
 * empty. Putting a `describe` in this file would therefore make it silently never run.
 *
 * ## The one thing to be careful with
 *
 * `resolveVar` THROWS on a token that does not exist, and that is deliberate. An earlier
 * resolver elsewhere in the repo returns `null` for a dangling chain, which is right when the
 * question is "does anything dangle" and wrong here: a contrast check that quietly skips the pair
 * it could not resolve reports a clean sheet for a stylesheet it never read. Use
 * `resolveVarOrNull` when a miss is a legitimate answer.
 */
import fs from 'fs';

/** Straight RGBA. Alpha is 0..1, channels are 0..255. */
export type RGBA = [number, number, number, number];

/** WCAG 1.4.3: normal-size text. 18.66px bold or 24px normal would be 3:1, and almost nothing
 * in this product's action buttons is that large, so this is the threshold that applies. */
export const AA_TEXT = 4.5;
/** WCAG 1.4.11: icons, focus rings and other non-text. */
export const AA_GRAPHIC = 3;

/** Strip comments so a hex inside `/* ... *\/` cannot be read as a declaration. */
export const readCss = (absPath: string): string =>
  fs.readFileSync(absPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

export type Vars = Record<string, string>;

/** Every `--name: value;` in a rule body, first declaration winning. */
export function declarations(body: string): Vars {
  const out: Vars = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (!(m[1] in out)) out[m[1]] = m[2].trim();
  }
  return out;
}

/**
 * The body of the FIRST rule whose selector list matches `selector` exactly.
 *
 * First, not merged: `colors.css` carries a `[data-theme="dark"]` block redeclaring many of the
 * same names, and resolving across the whole file would mix a dark value into a light answer and
 * still produce a plausible hex.
 */
export function ruleBlock(css: string, selector: string): Vars {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
  const m = css.match(new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`));
  return m ? declarations(m[1]) : {};
}

/** Shorthand for the common case. */
export const rootVars = (css: string): Vars => ruleBlock(css, ':root');

/** A declaration's value from the first rule matching `selector`, or null. */
export function declarationValue(css: string, selector: string, prop: string): string | null {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
  const m = css.match(new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`));
  if (!m) return null;
  const d = m[1].match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;}]+)`, 'i'));
  return d ? d[1].replace(/!important/i, '').trim() : null;
}

/** Follow a `var()` chain to a literal. THROWS on a missing token or a loop. */
export function resolveVar(value: string, vars: Vars, depth = 0): string {
  if (depth > 20) throw new Error(`var() loop at ${value}`);
  const m = value.trim().match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (!m) return value.trim();
  const next = vars[m[1]];
  if (next === undefined) throw new Error(`undefined token ${m[1]}`);
  return resolveVar(next, vars, depth + 1);
}

/** As `resolveVar`, but a dangling chain is `null` rather than a throw. */
export function resolveVarOrNull(value: string, vars: Vars, depth = 0): string | null {
  try {
    return resolveVar(value, vars, depth);
  } catch {
    return null;
  }
}

export function parseColor(v: string): RGBA {
  const s = v.trim();
  let m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)).concat(1) as RGBA;
  m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) return m[1].split('').map((c) => parseInt(c + c, 16)).concat(1) as RGBA;
  m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(',').map((x) => parseFloat(x));
    return [p[0], p[1], p[2], p[3] ?? 1];
  }
  throw new Error(`unparsed color: ${v}`);
}

/** Composite a translucent colour over an opaque one. */
export const over = (top: RGBA, under: RGBA): RGBA => {
  const a = top[3];
  return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1) as RGBA;
};

/** WCAG relative luminance. */
export const luminance = ([r, g, b]: RGBA): number => {
  const c = [r, g, b].map((x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

/** WCAG contrast ratio. Order-independent: (lighter + .05) / (darker + .05). */
export function contrastRatio(fg: RGBA, bg: RGBA): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Ratio between two literal colour strings, with no token resolution. */
export const ratioOf = (fg: string, bg: string): number =>
  contrastRatio(parseColor(fg), parseColor(bg));

/**
 * `fg` on `bg`, where `bg` may itself be translucent over `base` (a tint over a card surface).
 * Every argument is a token name or a literal; tokens are resolved against `vars`.
 */
export function contrastOver(vars: Vars, fg: string, bg: string, base: string): number {
  const baseC = parseColor(resolveVar(base, vars));
  const bgC = over(parseColor(resolveVar(bg, vars)), baseC);
  const fgC = over(parseColor(resolveVar(fg, vars)), bgC);
  return contrastRatio(fgC, bgC);
}

/** Rounded to two places, which is the precision a pinned inventory can actually hold steady. */
export const round2 = (n: number): number => Math.round(n * 100) / 100;
