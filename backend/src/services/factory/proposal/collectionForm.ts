/**
 * collectionForm - the Sharath collection form (M4-T1).
 *
 * Turns a gov project's open Needs-You list into ONE formatted HTML request document (overview +
 * details + questions) that the intern sends to Sharath (the internal lead) to fill, and ingests the
 * returned answers back into the proposal.
 *
 * Reuse, not reinvention:
 *   - the needs come from `collectProjectNeeds` (the one DB-backed, deduped, aggregated list);
 *   - each returned answer is written back through `resolveProjectNeed`, which is the tested,
 *     idempotent path that closes the gap, writes facts/records into the tenant company library, and
 *     propagates the answer to sibling bids.
 *
 * DRAFT-ONLY: this module produces an HTML document and ingests answers. It never sends anything.
 * The email that carries the form is drafted and held for Ali's approval elsewhere, and (per the
 * Story) carries the [Gov Proposal] subject tag so Sharath's replies are recognized.
 */
import type { HumanNeed } from './proposalReviewTypes';
import { collectProjectNeeds } from './collectProjectNeeds';
import { resolveProjectNeed } from './resolveProjectNeed';
import type { NeedSubmission, ResolveActor } from './resolveNeed';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface CollectionFormMeta {
  /** Human project / pursuit name for the heading. */
  projectName?: string;
  /** Who the request is for (default: the internal lead). */
  recipientName?: string;
}

/** One answer coming back from the filled form. */
export interface CollectionAnswer {
  key: string;
  submission: NeedSubmission;
}

export interface CollectionIngestResult {
  total: number;
  resolved: number;
  failed: number;
  results: Array<{ key: string; status: number }>;
}

/** Render one need as a question block with an answer placeholder. */
function needBlock(n: HumanNeed, i: number): string {
  const example = n.suggestions && n.suggestions.length
    ? `<div class="eg">Example: ${esc(n.suggestions[0])}</div>`
    : '';
  // A grouped record asks for several fields as one unit.
  const fields = n.kind === 'record' && n.recordFields && n.recordFields.length
    ? `<div class="fields">${n.recordFields.map((f) => `<div class="field"><span>${esc(f)}:</span> <span class="blank"></span></div>`).join('')}</div>`
    : '<div class="answer"><span>Your answer:</span> <span class="blank"></span></div>';
  const fmt = n.format ? `<div class="fmt">Format: ${esc(n.format)}</div>` : '';
  return `<li class="need">
    <div class="ask">${i}. ${esc(n.ask)}</div>
    <div class="why">Why we need it: ${esc(n.why)}</div>
    ${fmt}${example}${fields}
  </li>`;
}

/**
 * Render the collection form as a self-contained HTML document. Pure: given the needs it always
 * produces the same document. An empty needs list yields a short "nothing outstanding" note rather
 * than an empty request.
 */
export function renderCollectionFormHtml(needs: HumanNeed[], meta: CollectionFormMeta = {}): string {
  const project = esc(meta.projectName || 'this pursuit');
  const recipient = esc(meta.recipientName || 'team');
  const safeNeeds = Array.isArray(needs) ? needs : [];
  const body = safeNeeds.length
    ? `<p>To finish the proposal for <b>${project}</b> we need the following from you. Please answer each item inline and send it back. If something does not apply, say so - do not leave it blank.</p>
       <ol class="needs">${safeNeeds.map((n, idx) => needBlock(n, idx + 1)).join('')}</ol>`
    : `<p>There is nothing outstanding for <b>${project}</b> right now. No information request is needed.</p>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>Information Request - ${project}</title>
<style>
  body{font:14px/1.6 "Segoe UI",system-ui,Arial,sans-serif;color:#1f2937;max-width:720px;margin:28px auto;padding:0 20px}
  .draft{background:#fff8ec;border:1px solid #f0dcb4;border-radius:8px;padding:8px 12px;color:#6a4e16;font-size:12.5px;margin-bottom:16px}
  h1{font-size:20px;color:#15325b;margin:0 0 4px}
  .sub{color:#5e6b84;font-size:12.5px;margin-bottom:14px}
  ol.needs{padding-left:0;list-style:none;counter-reset:n}
  li.need{border:1px solid #e2e8f2;border-radius:8px;padding:12px 14px;margin-bottom:10px}
  .ask{font-weight:700;color:#15325b}
  .why{color:#45526d;font-size:12.8px;margin-top:3px}
  .fmt{color:#5e6b84;font-size:11.8px;margin-top:3px}
  .eg{color:#1f9d87;font-size:11.8px;margin-top:3px}
  .answer,.field{margin-top:8px;font-size:12.8px}
  .blank{display:inline-block;border-bottom:1px solid #94a3b8;min-width:260px;height:14px}
  .fields .field{margin-top:4px}
</style></head><body>
  <div class="draft">DRAFT - held for Ali's approval before it is sent. Nothing here is sent automatically.</div>
  <h1>Information Request</h1>
  <div class="sub">For: ${recipient} &middot; Pursuit: ${project}</div>
  ${body}
</body></html>`;
}

/**
 * Build the collection form for a gov project from its live open needs. Returns the HTML (a DRAFT)
 * and the needs it was built from. Does not send anything.
 */
export async function buildSharathCollectionForm(
  deliveryProjectId: string,
  meta: CollectionFormMeta = {},
): Promise<{ html: string; needs: HumanNeed[]; needCount: number }> {
  const needs = await collectProjectNeeds(deliveryProjectId);
  return { html: renderCollectionFormHtml(needs, meta), needs, needCount: needs.length };
}

/**
 * Ingest answers returned from a filled collection form. Each answer is written back through the
 * existing idempotent resolveProjectNeed path (closes the gap, writes to the tenant library,
 * propagates to sibling bids). Returns a per-answer summary; a bad answer never aborts the rest.
 */
export async function ingestCollectionAnswers(
  deliveryProjectId: string,
  answers: CollectionAnswer[],
  actor: ResolveActor,
): Promise<CollectionIngestResult> {
  const list = Array.isArray(answers) ? answers : [];
  const results: Array<{ key: string; status: number }> = [];
  for (const a of list) {
    try {
      const r = await resolveProjectNeed(deliveryProjectId, a.key, a.submission, actor);
      results.push({ key: a.key, status: r.status });
    } catch {
      results.push({ key: a.key, status: 500 });
    }
  }
  const resolved = results.filter((r) => r.status >= 200 && r.status < 300).length;
  return { total: results.length, resolved, failed: results.length - resolved, results };
}
