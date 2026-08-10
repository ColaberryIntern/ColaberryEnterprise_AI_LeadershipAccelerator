/**
 * kitBuildBay.ts — renders a coding/prompt slide as a "Build Bay": the dark,
 * left-aligned Build Mode surface. Explicit paste target, Claude Code mode chip,
 * the copy-ready prompt, then YOU SHOULD SEE / STOP WHEN / IF YOU GET STUCK rows.
 *
 * Every field beyond the prompt text itself is optional (KitSlide.prompt extends
 * BuildBayMeta from classSessionPlan.ts) and simply omitted when not authored —
 * this must degrade gracefully across the hundreds of prompts written before
 * this model existed, not just the ones with full Build Bay metadata.
 */
import { KitSlide } from './kitSpec';
import { esc, promptHtml } from './kitRenderUtils';

const GENERIC_RESCUE = 'Tap 🆘 “I’m stuck” on your phone, or ask your neighbor — the instructor will circle back.';

function row(label: string, text: string, cls: string): string {
  return (
    `<div class="kbb-row kbb-row-${cls}">` +
    `<span class="kbb-row-label">${esc(label)}</span>` +
    `<span class="kbb-row-text">${esc(text)}</span></div>`
  );
}

/** `promptOf` is an optional "PROMPT N OF M" label computed by the caller
 * (kitSpec.ts knows the prompt's position in its segment; this module doesn't). */
export function buildBayHtml(slide: KitSlide, promptOf?: string): string {
  const p = slide.prompt;
  if (!p) return '';
  const paste = p.pasteWhere || 'Claude Code';
  // A 'review' block is code to READ, not to run — no paste target, and no
  // rescue row either (nobody can get stuck reading).
  const isReview = p.kind === 'review';
  const leadChip = isReview
    ? '<span class="kbb-chip kbb-chip-review">📖 REVIEW TOGETHER — <b>do not paste</b></span>'
    : `<span class="kbb-chip kbb-chip-paste">📋 PASTE INTO <b>${esc(paste)}</b></span>`;
  const chips = [
    promptOf ? `<span class="kbb-chip kbb-chip-n">${esc(promptOf)}</span>` : '',
    leadChip,
    p.ccMode ? `<span class="kbb-chip kbb-chip-mode">${esc(p.ccMode)}</span>` : '',
  ].join('');
  const rows = [
    p.expectedResult ? row(isReview ? '👀 WHAT TO POINT AT' : '👀 YOU SHOULD SEE', p.expectedResult, 'result') : '',
    p.stopCondition ? row('🛑 STOP WHEN', p.stopCondition, 'stop') : '',
    isReview ? '' : row('🆘 IF YOU GET STUCK', p.rescue || GENERIC_RESCUE, 'rescue'),
  ].join('');
  return (
    `<div class="kbb-chips">${chips}</div>` +
    promptHtml(p.label, p.prompt) +
    `<div class="kbb-rows">${rows}</div>`
  );
}
