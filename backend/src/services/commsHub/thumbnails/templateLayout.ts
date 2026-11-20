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

/** Average advance of a bold sans glyph as a fraction of the font size, with a margin for wider fallbacks. */
const CHAR_EM = 0.6;

export function estimateWidth(text: string, fontSize: number): number {
  return [...text].length * fontSize * CHAR_EM;
}

/** Greedy word wrap. A single word longer than the line is split, so nothing can overflow sideways. */
export function wrap(text: string, fontSize: number, maxWidth: number): string[] {
  const perLine = Math.max(1, Math.floor(maxWidth / (fontSize * CHAR_EM)));
  const lines: string[] = [];
  let line = '';
  for (const raw of text.trim().split(/\s+/).filter(Boolean)) {
    const words = raw.length > perLine ? raw.match(new RegExp(`.{1,${perLine}}`, 'g')) ?? [raw] : [raw];
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length <= perLine) line = next;
      else { if (line) lines.push(line); line = word; }
    }
  }
  if (line) lines.push(line);
  return lines;
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
  if (all.length > keep) {
    const perLine = Math.floor(box.w / (size * CHAR_EM));
    lines[keep - 1] = `${lines[keep - 1].slice(0, Math.max(1, perLine - 3)).trimEnd()}...`;
  }
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
