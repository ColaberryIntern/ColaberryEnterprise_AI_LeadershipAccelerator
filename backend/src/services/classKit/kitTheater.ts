/**
 * kitTheater.ts — "Live Decision Theater": the full-screen poll upgrade. Renders
 * the static skeleton server-side (question, answer tiles, instructor controls);
 * kitDeckScript.ts fills in the live voted-count + reveal animation client-side
 * and enforces the vote lock server-side (sessionLiveStateService.recordPollResponse).
 *
 * Markup is scoped with classes, not IDs, so a deck with multiple theater slides
 * doesn't collide — the script looks up elements within `.kslide.active` only.
 */
import { KitSlide } from './kitSpec';
import { esc } from './kitRenderUtils';

export function theaterHtml(slide: KitSlide): string {
  const it = slide.interaction;
  if (!it) return '';
  const tiles = it.options
    .map((o, idx) => {
      const letter = String.fromCharCode(65 + idx);
      return (
        `<div class="ktheater-tile" data-idx="${idx}"><div class="fill"></div>` +
        `<span class="label">${letter}. ${esc(o)}</span><span class="pct"></span></div>`
      );
    })
    .join('');
  return (
    '<div class="ktheater">' +
    '<span class="ktheater-badge voting" data-role="badge">🗳️ Voting open</span>' +
    '<div class="ktheater-count" data-role="count">0 voted</div>' +
    `<h2 class="ktheater-q">${esc(it.q)}</h2>` +
    `<div class="ktheater-tiles" data-role="tiles">${tiles}</div>` +
    '<div class="ktheater-controls">' +
    '<button class="ktheater-btn" data-action="lock" type="button">🔒 Lock Vote</button>' +
    '<button class="ktheater-btn primary" data-action="reveal" type="button" style="display:none">🎉 Reveal Results</button>' +
    '<button class="ktheater-btn" data-action="reopen" type="button" style="display:none">↩ Reopen Vote</button>' +
    '</div>' +
    (it.reveal ? `<div class="ktheater-explain" data-role="explain" style="display:none">${esc(it.reveal)}</div>` : '') +
    '</div>'
  );
}
