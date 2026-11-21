/**
 * Thumbnail template geometry and text fitting (CH4.2). Pure: no sharp, no I/O, so the rules that
 * keep a long title inside its box are tested without rendering.
 *
 * Fonts: librsvg (inside sharp) cannot load web fonts, so templates name fonts that exist on the
 * production image (Debian bookworm: Liberation Sans, DejaVu Sans; checked with fc-list on
 * 2026-11-20), then Arial for a Windows dev render. Widths below are estimates for a bold sans; the
 * fit keeps a safety margin so a slightly wider fallback font still fits.
 */
export type ThumbSize = '16x9' | '1x1' | '3x1';
export const SIZES: Record<ThumbSize, { w: number; h: number }> = {
  '16x9': { w: 1600, h: 900 },
  '1x1': { w: 1080, h: 1080 },
  '3x1': { w: 1500, h: 500 },
};
export const FONT_STACK = "'Liberation Sans', 'DejaVu Sans', Arial, Helvetica, sans-serif";

/** Server-side copies of frontend/src/colaberry/tokens/colors.css (a PNG cannot read CSS variables). */
export const PALETTE = {
  cherry: '#FB2832', cherryDeep: '#C20E1E', cherryDark: '#E5121D', cherryWash: '#FFF0F1',
  berry: '#367895', berryNight: '#1A3947', berryDeep: '#20485C',
  leaf: '#77BB4A', leafLight: '#A2D375',
  white: '#FFFFFF', ink: '#1A1A1A', inkSoft: '#6B6B6B', night: '#0F0F0F', paper: '#F1F1F0',
} as const;

export interface Box { x: number; y: number; w: number; h: number }

/**
 * Advance widths of a BOLD sans in 1/1000 em: the Helvetica-Bold metrics that Arial Bold and Liberation
 * Sans Bold are drawn to match (Liberation is metric-compatible with Arial by design). CH4.2 attempt 1
 * used a flat 0.6 em, which bold capitals exceed (W = 0.944, M = 0.833), so all-caps headlines ran
 * under the photo. Unknown characters count as 0.72 em, and every width carries a 6% margin for
 * DejaVu, the wider fallback.
 */
const BOLD_ADVANCE: Record<string, number> = {
  ' ': 278, '!': 333, '"': 474, '#': 556, $: 556, '%': 889, '&': 722, "'": 238, '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  ':': 333, ';': 333, '<': 584, '=': 584, '>': 584, '?': 611, '@': 975, '[': 333, '\\': 278, ']': 333, '_': 556, '\u00B7': 278,
  A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556, K: 722, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667,
  T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278, k: 556, l: 278, m: 889, n: 611, o: 611, p: 611, q: 611, r: 389, s: 556,
  t: 333, u: 611, v: 556, w: 778, x: 556, y: 556, z: 500,
};
for (const d of '0123456789') BOLD_ADVANCE[d] = 556;
const UNKNOWN_ADVANCE = 720;
const MARGIN = 1.06;

export function estimateWidth(text: string, fontSize: number): number {
  let units = 0;
  for (const ch of text) units += BOLD_ADVANCE[ch] ?? UNKNOWN_ADVANCE;
  return (units / 1000) * fontSize * MARGIN;
}

/** Split one word that is wider than the line into pieces that each fit. */
function splitWord(word: string, fontSize: number, maxWidth: number): string[] {
  const pieces: string[] = [];
  let piece = '';
  for (const ch of word) {
    if (piece && estimateWidth(piece + ch, fontSize) > maxWidth) { pieces.push(piece); piece = ch; } else piece += ch;
  }
  if (piece) pieces.push(piece);
  return pieces;
}

/** Greedy word wrap on measured widths. A word wider than the line is split, so nothing can overflow sideways. */
export function wrap(text: string, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const raw of text.trim().split(/\s+/).filter(Boolean)) {
    for (const word of estimateWidth(raw, fontSize) > maxWidth ? splitWord(raw, fontSize, maxWidth) : [raw]) {
      const next = line ? `${line} ${word}` : word;
      if (estimateWidth(next, fontSize) <= maxWidth) line = next;
      else { if (line) lines.push(line); line = word; }
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Shorten a line until it and "..." fit the width. */
function ellipsize(line: string, fontSize: number, maxWidth: number): string {
  let s = line;
  while (s.length > 1 && estimateWidth(`${s.trimEnd()}...`, fontSize) > maxWidth) s = s.slice(0, -1);
  return `${s.trimEnd()}...`;
}

export interface FittedText { lines: string[]; fontSize: number; lineHeight: number; truncated: boolean }

/**
 * The largest font size, from `maxSize` down to `minSize`, at which the text fits the box in at most
 * `maxLines`. If even `minSize` needs more lines, the last kept line ends with an ellipsis and
 * `truncated` is true, so the caller can tell the organizer the headline was shortened.
 */
export function fitText(text: string, box: Box, opts: { maxSize: number; minSize: number; maxLines: number; leading?: number }): FittedText {
  const leading = opts.leading ?? 1.12;
  for (let size = opts.maxSize; size >= opts.minSize; size -= 2) {
    const lines = wrap(text, size, box.w);
    if (lines.length <= opts.maxLines && lines.length * size * leading <= box.h) return { lines, fontSize: size, lineHeight: size * leading, truncated: false };
  }
  const size = opts.minSize;
  const all = wrap(text, size, box.w);
  const keep = Math.max(1, Math.min(opts.maxLines, Math.floor(box.h / (size * leading))));
  const lines = all.slice(0, keep);
  if (all.length > keep) lines[keep - 1] = ellipsize(lines[keep - 1], size, box.w);
  return { lines, fontSize: size, lineHeight: size * leading, truncated: all.length > keep };
}

/** Where text and pictures go for a size: pictures beside the text on wide sizes, above it on the square. */
export function regions(size: ThumbSize, photoCount: number): { text: Box; photos: Box | null } {
  const { w, h } = SIZES[size];
  const pad = Math.round(Math.min(w, h) * 0.08);
  if (photoCount === 0) return { text: { x: pad, y: pad, w: w - 2 * pad, h: h - 2 * pad }, photos: null };
  if (size === '1x1') {
    const photoH = Math.round(h * 0.46);
    return { photos: { x: 0, y: 0, w, h: photoH }, text: { x: pad, y: photoH + pad * 0.6, w: w - 2 * pad, h: h - photoH - pad * 1.6 } };
  }
  const share = size === '3x1' ? 0.36 : 0.44;
  const photoW = Math.round(w * share);
  return { photos: { x: w - photoW, y: 0, w: photoW, h }, text: { x: pad, y: pad, w: w - photoW - 2 * pad, h: h - 2 * pad } };
}

/** Split the picture region into side-by-side slots, one per picture (up to 3 shown). */
export function photoSlots(area: Box, count: number): Box[] {
  const n = Math.min(3, Math.max(0, count));
  if (n === 0) return [];
  const sw = Math.floor(area.w / n);
  return Array.from({ length: n }, (_, i) => ({ x: area.x + i * sw, y: area.y, w: i === n - 1 ? area.w - i * sw : sw, h: area.h }));
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
