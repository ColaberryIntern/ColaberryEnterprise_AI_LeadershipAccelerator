import { STYLES } from './landingPageStyles';

/**
 * WCAG contrast for the colours the inverse band actually puts on top of each other.
 *
 * WHY THE INVERSE BAND SPECIFICALLY. `.band--inverse` repaints a section dark and then draws two
 * brand colours on that dark ground: `--accent-2` for the eyebrow and `--accent` for the
 * highlighted words in a heading. For a brand whose accent is light that is fine. For a brand
 * whose accent is DARK - a deep rust, a deep red - it is dark-on-dark, and the text is there but
 * nobody can read it. Nothing failed, nothing logged, and the page looked designed.
 *
 * WHY THE FALLBACKS ARE PARSED OUT OF THE STYLESHEET. Each rule is written
 * `var(--contrast-bg,#1A1A1A)`, so a brand that declares no surfaces still renders on #1A1A1A.
 * An audit that restated those literals would be a second copy of them, and the failure mode of
 * a second copy is that it agrees with the first until somebody edits one. So the numbers come
 * from `STYLES` itself: if the stylesheet changes its ground, this measures the new ground.
 *
 * THRESHOLDS ARE WCAG 2.1 AA: 4.5:1 for body-sized text, 3:1 for large text (the highlighted
 * words inside an h1/h2 are large by definition). These are the same thresholds
 * `/fixing-accessibility` applies to the admin app; a public marketing page is held to no less.
 */

export interface ContrastPair {
  /** What a reader would call the thing, not the token name. */
  what: string;
  fgToken: string;
  bgToken: string;
  fg: string;
  bg: string;
  /** WCAG AA minimum for this text size. */
  min: number;
  ratio: number;
  passes: boolean;
}

/** 8-bit channel to linear, per WCAG 2.1. */
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const body = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [
    parseInt(body.slice(0, 2), 16),
    parseInt(body.slice(2, 4), 16),
    parseInt(body.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance, or null for anything that is not a hex colour. */
export function relativeLuminance(hex: string): number | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Contrast ratio between two colours, 1 to 21.
 *
 * Returns null rather than a number when either colour cannot be read, so an unparseable token
 * surfaces as "could not measure" instead of silently scoring 1:1 and reading as a failure, or
 * 21:1 and reading as a pass.
 */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The literal a rule falls back to when a brand declares no value for a token.
 *
 * Read from the stylesheet, which is the thing that renders. Returns null when no rule carries a
 * fallback for that token, which is itself worth knowing - a token with neither a brand value nor
 * a fallback resolves to nothing at all.
 */
export function stylesheetFallback(token: string): string | null {
  const pattern = new RegExp(`var\\(${token.replace(/-/g, '\\-')}\\s*,\\s*(#[0-9A-Fa-f]{3,6})\\)`);
  return pattern.exec(STYLES)?.[1] ?? null;
}

/** A token's effective value for a brand: its own, else whatever the stylesheet falls back to. */
export function resolveToken(theme: Readonly<Record<string, string>>, token: string): string | null {
  return theme[token] ?? stylesheetFallback(token);
}

/**
 * Every foreground/background pair `.band--inverse` creates, with the size-appropriate minimum.
 *
 * Each entry corresponds to a real rule in `landingPageStyles.ts`; the comment names it so a
 * reviewer can check the pair against the rule rather than taking this list on trust.
 */
const INVERSE_BAND_PAIRS: ReadonlyArray<{ what: string; fg: string; bg: string; min: number }> = [
  // .band--inverse{background:var(--contrast-bg);color:var(--contrast-fg)}
  { what: 'body text on the dark band', fg: '--contrast-fg', bg: '--contrast-bg', min: 4.5 },
  // .band--inverse .eyebrow{color:var(--accent-2-on-dark,var(--accent-2));opacity:1}
  { what: 'the eyebrow above a heading', fg: '--accent-2-on-dark', bg: '--contrast-bg', min: 4.5 },
  // .band--inverse h1 .hl,...{color:var(--accent-on-dark,var(--accent))} - large text
  { what: 'the highlighted words in a heading', fg: '--accent-on-dark', bg: '--contrast-bg', min: 3 },
  // .band--inverse .panel{background:var(--contrast-raised)}
  { what: 'body text on a raised panel', fg: '--contrast-fg', bg: '--contrast-raised', min: 4.5 },
  // .band--inverse .panel-title{color:var(--contrast-muted)}
  { what: 'a panel title', fg: '--contrast-muted', bg: '--contrast-raised', min: 4.5 },
];

/** Measure one brand's inverse band. Pairs that cannot be measured are reported, not skipped. */
export function auditInverseBand(theme: Readonly<Record<string, string>>): ContrastPair[] {
  return INVERSE_BAND_PAIRS.map(({ what, fg, bg, min }) => {
    const fgValue = resolveToken(theme, fg) ?? '';
    const bgValue = resolveToken(theme, bg) ?? '';
    const ratio = contrastRatio(fgValue, bgValue);
    return {
      what,
      fgToken: fg,
      bgToken: bg,
      fg: fgValue,
      bg: bgValue,
      min,
      ratio: ratio ?? 0,
      passes: ratio !== null && ratio >= min,
    };
  });
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0').toUpperCase()).join('')}`;
}

/**
 * The same colour, lifted toward white only as far as it takes to become readable on `bg`.
 *
 * WHY DERIVE RATHER THAN PICK. These accents are the brands' real documented colours - CPN's
 * #1D6A4C, AI Flotation's #BA430E - and they are correct everywhere except on a dark ground.
 * Hand-picking a replacement would put an invented hex in a file whose whole discipline is that
 * nothing in it is invented. Blending toward white is a derivation: it is reproducible from the
 * brand's own value, it keeps the hue, and if the brand ever changes its accent this follows.
 *
 * MINIMAL BY CONSTRUCTION. It stops at the first step that clears the threshold, so a colour
 * that already passes is returned UNCHANGED and the brands that are fine today render
 * byte-identically. That is the property that keeps the blast radius at the three brands that
 * actually fail.
 *
 * Returns the original when the inputs cannot be read, and white when even white would not pass,
 * which cannot happen against a dark ground but is not worth being clever about.
 */
export function liftForContrast(fg: string, bg: string, min: number, steps = 100): string {
  const from = parseHex(fg);
  const to = parseHex(bg);
  if (!from || !to) return fg;

  const current = contrastRatio(fg, bg);
  if (current !== null && current >= min) return fg;

  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const blended: [number, number, number] = [
      from[0] + (255 - from[0]) * t,
      from[1] + (255 - from[1]) * t,
      from[2] + (255 - from[2]) * t,
    ];
    const hex = toHex(blended);
    const ratio = contrastRatio(hex, bg);
    if (ratio !== null && ratio >= min) return hex;
  }
  return '#FFFFFF';
}

/** One line per failure, in words a designer can act on. */
export function describeMiss(brand: string, pair: ContrastPair): string {
  return `${brand}: ${pair.what} is ${pair.ratio.toFixed(2)}:1 `
    + `(${pair.fgToken} ${pair.fg} on ${pair.bgToken} ${pair.bg}), needs ${pair.min}:1`;
}
