// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');
import { SIZES, photoSlots, type ThumbSize } from './templateLayout';
import { renderOverlaySvg, renderTemplateSvg, type TemplateId, type TemplateText } from './templateSvg';

/**
 * Rasterise a template (CH4.2): the SVG becomes a PNG with sharp, then each picture is cropped to
 * fill its slot (cover, centred) and composited in. Deterministic: the same template,
 * size, text and picture bytes give the same PNG bytes on the same machine.
 */
export interface RenderedThumb { size: ThumbSize; png: Buffer; width: number; height: number; truncated: boolean }

const GAP = 6; // a hairline between pictures, in the template's background colour

export async function renderTemplate(id: TemplateId, size: ThumbSize, text: TemplateText, photos: Buffer[]): Promise<RenderedThumb> {
  const { w, h } = SIZES[size];
  const shown = photos.slice(0, 3);
  const { svg, photoArea, truncated } = renderTemplateSvg(id, size, text, shown.length);
  const layers: Array<{ input: Buffer; left: number; top: number }> = [];
  if (photoArea) {
    const slots = photoSlots(photoArea, shown.length);
    for (let i = 0; i < slots.length; i += 1) {
      const s = slots[i];
      const inner = { x: s.x + (i > 0 ? GAP : 0), w: s.w - (i > 0 ? GAP : 0) };
      // Centred cover crop. sharp's "attention" strategy was tried first and chose the high-contrast
      // lettering inside a promo photo over the speaker's face; centred is predictable for portraits.
      const input = await sharp(shown[i]).rotate().resize(inner.w, s.h, { fit: 'cover', position: 'centre' }).png().toBuffer();
      layers.push({ input, left: inner.x, top: s.y });
    }
  }
  const png: Buffer = await sharp(Buffer.from(svg)).composite(layers).png({ compressionLevel: 9 }).toBuffer();
  return { size, png, width: w, height: h, truncated };
}

/**
 * AI art with code-drawn text (CH4.3 overlay mode): the generated scene fills the canvas (centre
 * cover crop), then the exact text layer is composited on top. One generation yields every size.
 */
export async function renderOverlay(art: Buffer, theme: 'berry_night' | 'clean_white', size: ThumbSize, text: TemplateText): Promise<RenderedThumb> {
  const { w, h } = SIZES[size];
  const { svg, truncated } = renderOverlaySvg(theme, size, text);
  const base = await sharp(art).resize(w, h, { fit: 'cover', position: size === '1x1' ? 'right' : 'centre' }).png().toBuffer();
  const png: Buffer = await sharp(base).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).png({ compressionLevel: 9 }).toBuffer();
  return { size, png, width: w, height: h, truncated };
}

export async function renderOverlayAllSizes(art: Buffer, theme: 'berry_night' | 'clean_white', text: TemplateText): Promise<RenderedThumb[]> {
  const out: RenderedThumb[] = [];
  for (const size of Object.keys(SIZES) as ThumbSize[]) out.push(await renderOverlay(art, theme, size, text));
  return out;
}

/** All three sizes for one template. */
export async function renderAllSizes(id: TemplateId, text: TemplateText, photos: Buffer[]): Promise<RenderedThumb[]> {
  const out: RenderedThumb[] = [];
  for (const size of Object.keys(SIZES) as ThumbSize[]) out.push(await renderTemplate(id, size, text, photos));
  return out;
}
