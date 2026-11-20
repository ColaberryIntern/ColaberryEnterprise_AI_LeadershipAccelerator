import { FONT_STACK, PALETTE, SIZES, escapeXml, estimateWidth, fitText, regions, type Box, type FittedText, type ThumbSize } from './templateLayout';

/**
 * The three branded templates from design 02 (CH4.2): bold cherry, berry night, clean white. Each
 * returns the background-and-text SVG for one size; pictures are composited into the reserved
 * region afterwards (templateRender.ts), so text and pictures never overlap. The text block (badge,
 * headline, supporting line) is measured first and then centred vertically, with the wordmark
 * pinned to the bottom, the way the training-site promo images sit.
 */
export type TemplateId = 'bold_cherry' | 'berry_night' | 'clean_white';
export const TEMPLATES: TemplateId[] = ['bold_cherry', 'berry_night', 'clean_white'];

export interface TemplateText { headline: string; supporting: string | null; badge: string | null }
export interface TemplateSvg { svg: string; photoArea: Box | null; truncated: boolean }

interface Theme { bg: string; bg2: string; head: string; sub: string; badgeBg: string; badgeFg: string; mark: string; accent: string | null }
const THEMES: Record<TemplateId, Theme> = {
  bold_cherry: { bg: PALETTE.cherry, bg2: PALETTE.cherryDeep, head: PALETTE.white, sub: PALETTE.white, badgeBg: PALETTE.white, badgeFg: PALETTE.cherryDark, mark: PALETTE.white, accent: null },
  berry_night: { bg: PALETTE.berryNight, bg2: PALETTE.night, head: PALETTE.white, sub: PALETTE.leafLight, badgeBg: PALETTE.leaf, badgeFg: PALETTE.night, mark: PALETTE.white, accent: PALETTE.leaf },
  clean_white: { bg: PALETTE.white, bg2: PALETTE.paper, head: PALETTE.ink, sub: PALETTE.inkSoft, badgeBg: PALETTE.cherryWash, badgeFg: PALETTE.cherryDark, mark: PALETTE.cherry, accent: PALETTE.cherry },
};

function textLines(lines: string[], x: number, firstBaseline: number, lineHeight: number, size: number, fill: string, weight: number): string {
  return lines.map((l, i) => `<text x="${x}" y="${Math.round(firstBaseline + i * lineHeight)}" font-family="${FONT_STACK}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(l)}</text>`).join('');
}

interface Block { badgeSize: number; badgeH: number; gap: number; head: FittedText; sub: FittedText | null; total: number }

/** Measure the badge, headline and supporting line for the space available. */
function measure(text: TemplateText, box: Box, unit: number, space: number): Block {
  const badgeSize = Math.round(unit * 0.036);
  const badgeH = text.badge ? Math.round(badgeSize * 1.9) : 0;
  const gap = Math.round(unit * 0.04);
  const headRoom = (space - badgeH - (text.badge ? gap : 0)) * (text.supporting ? 0.7 : 1);
  const head = fitText(text.headline, { ...box, h: headRoom }, { maxSize: Math.round(unit * 0.16), minSize: Math.round(unit * 0.05), maxLines: 3 });
  const headH = head.lines.length * head.lineHeight;
  const sub = text.supporting
    ? fitText(text.supporting, { ...box, h: Math.max(unit * 0.05, space - badgeH - headH - 2 * gap) }, { maxSize: Math.round(unit * 0.05), minSize: Math.round(unit * 0.028), maxLines: 2 })
    : null;
  const total = badgeH + (text.badge ? gap : 0) + headH + (sub ? gap * 0.6 + sub.lines.length * sub.lineHeight : 0);
  return { badgeSize, badgeH, gap, head, sub, total };
}

export function renderTemplateSvg(id: TemplateId, size: ThumbSize, text: TemplateText, photoCount: number): TemplateSvg {
  const { w, h } = SIZES[size];
  const t = THEMES[id];
  const { text: box, photos } = regions(size, photoCount);
  const unit = Math.min(w, h);
  const markSize = Math.round(unit * 0.032);
  const space = box.h - markSize * 2.2;
  const m = measure(text, box, unit, space);
  const parts: string[] = [
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.bg}"/><stop offset="1" stop-color="${t.bg2}"/></linearGradient></defs>`,
    `<rect width="${w}" height="${h}" fill="url(#bg)"/>`,
  ];
  if (t.accent) parts.push(`<rect x="${box.x - Math.round(unit * 0.03)}" y="${box.y}" width="${Math.max(6, Math.round(unit * 0.012))}" height="${box.h}" fill="${t.accent}"/>`);
  let y = box.y + Math.max(0, (space - m.total) / 2);
  if (text.badge) {
    // Measured, and shrunk if a long badge would not fit the text column.
    const pad = m.badgeSize * 0.8;
    const fs = Math.min(m.badgeSize, Math.floor(m.badgeSize * (box.w - 2 * pad) / Math.max(1, estimateWidth(text.badge, m.badgeSize))));
    const bw = Math.round(estimateWidth(text.badge, fs) + 2 * pad);
    parts.push(`<rect x="${box.x}" y="${Math.round(y)}" width="${bw}" height="${m.badgeH}" rx="${Math.round(m.badgeH / 2)}" fill="${t.badgeBg}"/>`);
    parts.push(textLines([text.badge], box.x + Math.round(pad), y + m.badgeH / 2 + fs * 0.36, 0, fs, t.badgeFg, 700));
    y += m.badgeH + m.gap;
  }
  parts.push(textLines(m.head.lines, box.x, y + m.head.fontSize * 0.92, m.head.lineHeight, m.head.fontSize, t.head, 800));
  y += m.head.lines.length * m.head.lineHeight + m.gap * 0.6;
  if (m.sub) parts.push(textLines(m.sub.lines, box.x, y + m.sub.fontSize, m.sub.lineHeight, m.sub.fontSize, t.sub, 500));
  parts.push(textLines(['colaberry'], box.x, box.y + box.h, 0, markSize, t.mark, 700));
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${parts.join('')}</svg>`,
    photoArea: photos,
    truncated: m.head.truncated || Boolean(m.sub?.truncated),
  };
}
