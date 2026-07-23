/**
 * kitStoryVisuals.ts — Story Mode slide renderers: single-statement "Cinematic
 * Hook" and two-column "Before/After" transformation. Code-rendered (typography,
 * color, layout) rather than image-based — the deck has no image/asset pipeline,
 * and this stays consistent with that (see PROGRESS.md PR #700/#716 scope notes).
 */
import { KitSlide } from './kitSpec';
import { esc } from './kitRenderUtils';

export function hookHtml(slide: KitSlide): string {
  return (
    '<div class="khook">' +
    `<h1 class="khook-line">${esc(slide.title)}</h1>` +
    (slide.body ? `<p class="khook-cap">${esc(slide.body)}</p>` : '') +
    '</div>'
  );
}

export function beforeAfterHtml(slide: KitSlide): string {
  const ba = slide.beforeAfter;
  if (!ba) return '';
  const col = (items: string[], label: string, cls: string) =>
    `<div class="kba-col ${cls}"><div class="kba-head">${esc(label)}</div>` +
    `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>`;
  return (
    `<h2 class="ktitle">${esc(slide.title)}</h2>` +
    '<div class="kba-grid">' +
    col(ba.before, '😩 Before', 'kba-before') +
    col(ba.after, '🚀 After', 'kba-after') +
    '</div>'
  );
}
