/**
 * thumbnailService — automatic thumbnail generation for AI Components. Produces a
 * deterministic branded SVG (data URI) from the component's identity + render
 * band, so every component has a real thumbnail with no external image API and
 * no placeholder. Sources supported: 'template' (this, default/always available)
 * and 'custom' (author-supplied url/data-uri); 'ai' (image model) + 'screenshot'
 * are pluggable follow-ons that write the same `thumbnail_url` field.
 */
import CurriculumTypeDefinition from '../../models/CurriculumTypeDefinition';

// deterministic palette per render_band (Colaberry Design E family)
const BAND_COLORS: Record<string, [string, string]> = {
  media: ['#367895', '#2E6A86'], live_class: ['#FB2832', '#C20E1E'], event: ['#FB2832', '#B5710A'],
  overview: ['#2E6A86', '#367895'], deepdive: ['#2E6A86', '#367895'], quiz: ['#5BA63C', '#3C7A26'],
  survey: ['#E8920C', '#FB2832'], warmup: ['#E8920C', '#B5710A'], promptlab: ['#367895', '#5BA63C'],
  task: ['#367895', '#5BA63C'], artifact: ['#367895', '#5BA63C'], reflection: ['#8256B5', '#5B3E86'],
  discussion: ['#367895', '#2E6A86'], milestone: ['#5BA63C', '#3C7A26'],
};

function colorsFor(band?: string | null): [string, string] {
  return BAND_COLORS[band || 'overview'] || ['#367895', '#2E6A86'];
}

/** PURE — build a branded SVG thumbnail as a data URI. Deterministic per component. */
export function templateThumbnail(c: { label: string; render_band?: string | null; difficulty?: string | null }): string {
  const [c1, c2] = colorsFor(c.render_band);
  const initials = (c.label || '?').split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');
  const band = (c.render_band || '').replace(/_/g, ' ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
    <rect width="320" height="180" rx="14" fill="url(#g)"/>
    <circle cx="256" cy="42" r="70" fill="#ffffff" opacity="0.08"/>
    <text x="24" y="96" font-family="Quicksand,Arial,sans-serif" font-size="52" font-weight="700" fill="#ffffff">${initials}</text>
    <text x="24" y="132" font-family="Roboto,Arial,sans-serif" font-size="15" fill="#ffffff" opacity="0.9">${escapeXml(c.label).slice(0, 26)}</text>
    <text x="24" y="154" font-family="Roboto Mono,monospace" font-size="11" fill="#ffffff" opacity="0.7">${escapeXml(band)} · ${escapeXml(c.difficulty || 'core')}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}
function escapeXml(s: string): string { return String(s ?? '').replace(/[<>&]/g, (m) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[m] as string)); }

/** Generate + persist a thumbnail for one component (source: template|custom). */
export async function generateThumbnail(slug: string, source: 'template' | 'custom' = 'template', customUrl?: string) {
  const c = await CurriculumTypeDefinition.findOne({ where: { slug } });
  if (!c) throw Object.assign(new Error(`Component "${slug}" not found`), { status: 404 });
  const url = source === 'custom' && customUrl ? customUrl : templateThumbnail(c.toJSON() as any);
  await c.update({ thumbnail_url: url });
  return { slug, source, thumbnail_url: url };
}

/** Backfill thumbnails for all components missing one. */
export async function backfillThumbnails(force = false): Promise<{ generated: number }> {
  const rows = await CurriculumTypeDefinition.findAll();
  let generated = 0;
  for (const c of rows) {
    if (force || !c.thumbnail_url) { await c.update({ thumbnail_url: templateThumbnail(c.toJSON() as any) }); generated += 1; }
  }
  return { generated };
}
