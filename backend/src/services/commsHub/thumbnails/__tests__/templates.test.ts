// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');
import { createHash } from 'crypto';
import { SIZES, estimateWidth, fitText, photoSlots, regions, wrap, escapeXml, type ThumbSize } from '../templateLayout';
import { TEMPLATES, renderTemplateSvg } from '../templateSvg';
import { renderAllSizes, renderTemplate } from '../templateRender';

/** CH4.2 branded templates: text always fits its box, text and pictures never overlap, 9 PNGs, deterministic. */
const LONG = 'Forward Deployed AI Engineer Accelerator Open House and Info Session for Working Professionals Everywhere';
const SIZE_KEYS = Object.keys(SIZES) as ThumbSize[];

describe('CH4.2 text fitting (pure)', () => {
  it('wrap never produces a line wider than the box, even for one very long word', () => {
    for (const text of [LONG, 'Supercalifragilisticexpialidocious'.repeat(4), 'a']) {
      for (const width of [200, 600, 900]) {
        for (const line of wrap(text, 40, width)) expect(estimateWidth(line, 40)).toBeLessThanOrEqual(width);
      }
    }
  });

  it('fitText picks the largest size that fits; a short title stays big, a long one shrinks', () => {
    const box = { x: 0, y: 0, w: 800, h: 400 };
    const short = fitText('Demo Tuesday', box, { maxSize: 140, minSize: 40, maxLines: 3 });
    const long = fitText(LONG, box, { maxSize: 140, minSize: 40, maxLines: 3 });
    expect(short.fontSize).toBeGreaterThan(long.fontSize);
    for (const f of [short, long]) {
      expect(f.lines.length).toBeLessThanOrEqual(3);
      expect(f.lines.length * f.lineHeight).toBeLessThanOrEqual(box.h + 1);
      for (const l of f.lines) expect(estimateWidth(l, f.fontSize)).toBeLessThanOrEqual(box.w);
    }
  });

  it('when even the smallest size cannot fit, the text is shortened with ... and says so', () => {
    const f = fitText(LONG.repeat(3), { x: 0, y: 0, w: 300, h: 120 }, { maxSize: 60, minSize: 30, maxLines: 2 });
    expect(f.truncated).toBe(true);
    expect(f.lines[f.lines.length - 1].endsWith('...')).toBe(true);
    for (const l of f.lines) expect(estimateWidth(l, f.fontSize)).toBeLessThanOrEqual(300);
  });

  it('text is escaped, so a headline cannot inject SVG', () => {
    expect(escapeXml('<script>&"\'')).toBe('&lt;script&gt;&amp;&quot;&apos;');
    const { svg } = renderTemplateSvg('bold_cherry', '16x9', { headline: '<image href="x"/>', supporting: null, badge: null }, 0);
    expect(svg).not.toContain('<image');
  });
});

describe('CH4.2 layout: text and pictures never overlap', () => {
  it.each(SIZE_KEYS)('%s with 0 to 3 pictures', (size) => {
    const { w, h } = SIZES[size];
    for (let n = 0; n <= 3; n += 1) {
      const r = regions(size, n);
      expect(r.text.x + r.text.w).toBeLessThanOrEqual(w);
      expect(r.text.y + r.text.h).toBeLessThanOrEqual(h);
      if (n === 0) { expect(r.photos).toBeNull(); continue; }
      const p = r.photos!;
      const overlapX = r.text.x < p.x + p.w && p.x < r.text.x + r.text.w;
      const overlapY = r.text.y < p.y + p.h && p.y < r.text.y + r.text.h;
      expect(overlapX && overlapY).toBe(false);
      const slots = photoSlots(p, n);
      expect(slots).toHaveLength(n);
      expect(slots.reduce((s, x) => s + x.w, 0)).toBe(p.w);
    }
  });
});

describe('CH4.2 rendering (real sharp)', () => {
  const text = { headline: 'Demo Tuesday', supporting: 'Live builds. Real feedback.', badge: 'TUE · 6:00 PM CST' };
  let photo: Buffer;
  beforeAll(async () => { photo = await sharp({ create: { width: 600, height: 800, channels: 3, background: { r: 30, g: 90, b: 140 } } }).jpeg().toBuffer(); });

  it('3 templates x 3 sizes = 9 PNGs at exactly the stated dimensions', async () => {
    let count = 0;
    for (const t of TEMPLATES) {
      for (const r of await renderAllSizes(t, text, [photo])) {
        const meta = await sharp(r.png).metadata();
        expect(meta.format).toBe('png');
        expect([meta.width, meta.height]).toEqual([SIZES[r.size].w, SIZES[r.size].h]);
        count += 1;
      }
    }
    expect(count).toBe(9);
  }, 60_000);

  it('deterministic: the same inputs give the same bytes', async () => {
    const a = await renderTemplate('berry_night', '16x9', text, [photo]);
    const b = await renderTemplate('berry_night', '16x9', text, [photo]);
    const hash = (x: Buffer) => createHash('sha256').update(x).digest('hex');
    expect(hash(a.png)).toBe(hash(b.png));
  });

  it('the picture really lands in its region (the photo colour is there, the text side is the template colour)', async () => {
    const r = await renderTemplate('clean_white', '16x9', text, [photo]);
    const { data, info } = await sharp(r.png).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => { const i = (y * info.width + x) * info.channels; return [data[i], data[i + 1], data[i + 2]]; };
    expect(px(1500, 450)).toEqual([30, 90, 140]);
    const [rr, gg, bb] = px(20, 880);
    expect(rr + gg + bb).toBeGreaterThan(600); // near-white template background
  });

  it('a very long title still renders and reports that it was shortened', async () => {
    const r = await renderTemplate('bold_cherry', '1x1', { headline: LONG.repeat(2), supporting: null, badge: null }, []);
    expect(r.truncated).toBe(true);
  });
});
