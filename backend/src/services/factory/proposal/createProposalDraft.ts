/**
 * createProposalDraft — the v3 create-path (§V2, T06): build a document's FIRST draft from nothing. It composes the
 * deterministic outline (T07) with grounded section-by-section drafting (T08): order the sections, draft each against
 * the shared grounding, assemble them, and guarantee D2 — every specific fact the drafter could not fill is left as a
 * visible [PLACEHOLDER: …] marker, so the check-path reconcile turns ALL of them into open needs and nothing is lost.
 *
 * The outline/assembly cores are PURE and table-tested; `createFirstProposalDraft` takes its drafter + save as
 * injected deps so it is unit-testable without the model or a DB. `runReviewCycle` wires the real services and runs
 * it in place of the old `no_document` dead-end.
 */
import { buildOutline, type OutlineSectionInput } from './buildOutline';
import { parsePlaceholderNeeds } from './placeholderNeeds';
import { gapsToNeeds } from './sectionDrafting';
import type { Grounding } from './proposalGrounding';

export interface DraftDocInput {
  docKey: string;
  title: string;
  requirementIds: string[];
  sections: Array<{ sectionKey: string; heading: string; requirementIds: string[]; order: number; plan?: string | null }>;
  pageLimit: number | null;
}

/**
 * PURE: the outline-section inputs for a document — its own sections when it has them, else one synthetic section per
 * requirement, else a single document-level section. Never empty, so the create-path always has something to draft.
 */
export function outlineSectionsForDoc(doc: DraftDocInput): OutlineSectionInput[] {
  const sections = Array.isArray(doc?.sections) ? doc.sections : [];
  if (sections.length) {
    return sections.map((s, i) => ({
      sectionKey: s.sectionKey,
      heading: s.heading,
      requirementIds: Array.isArray(s.requirementIds) ? s.requirementIds : [],
      order: typeof s.order === 'number' ? s.order : i,
    }));
  }
  const reqs = Array.isArray(doc?.requirementIds) ? doc.requirementIds : [];
  if (reqs.length) return reqs.map((id, i) => ({ sectionKey: id, heading: id, requirementIds: [id], order: i }));
  return [{ sectionKey: 'document', heading: doc?.title || doc?.docKey || 'Document', requirementIds: [], order: 0 }];
}

const safeMarker = (s: string): string => String(s ?? '').replace(/[\[\]]/g, '').trim();

/**
 * PURE: assemble the section HTMLs into one document draft, then ENFORCE D2 — for every structured gap the drafter
 * returned that is not already represented by a [PLACEHOLDER] marker in the content, append the marker, so the
 * check-path reconcile persists it as an open need. Same inputs ⇒ same output.
 */
export function assembleDraftHtml(
  sectionHtmls: string[],
  gaps: Array<{ question?: unknown; suggestions?: unknown }>,
  docKey: string,
): string {
  const body = (Array.isArray(sectionHtmls) ? sectionHtmls : []).map((h) => String(h ?? '').trim()).filter(Boolean).join('\n');
  const have = new Set(parsePlaceholderNeeds(body, docKey).map((n) => n.needKey));
  const missing = gapsToNeeds(gaps, docKey).filter((n) => !have.has(n.needKey));
  if (!missing.length) return body;
  const extra = missing.map((n) => `<p>[PLACEHOLDER: ${safeMarker(n.ask)}]</p>`).join('\n');
  return body ? `${body}\n${extra}` : extra;
}

export interface CreateFirstDraftDeps {
  doc: DraftDocInput;
  grounding: Grounding;
  /** Draft one section (the T08 AI wrapper, injected so the orchestration is testable without the model). */
  draftSection: (section: {
    heading: string;
    requirementIds: string[];
    pageBudget: number | null;
    plan?: string | null;
  }) => Promise<{ html: string; gaps: Array<{ question: string; suggestions: string[] }>; error?: string }>;
  /** Persist the assembled first version (bumps the document to `drafted`). */
  saveDraft: (html: string) => Promise<void>;
  /** Observable progress for the run row (outlining / drafting k/n). Best-effort. */
  onProgress?: (msg: string) => void;
}

/** Build + save the first draft. Returns the assembled HTML, or null when no section could be drafted (build failed). */
export async function createFirstProposalDraft(deps: CreateFirstDraftDeps): Promise<string | null> {
  const doc = deps.doc;
  deps.onProgress?.('Building the outline');
  const outline = buildOutline({ docKey: doc.docKey, pageLimit: doc.pageLimit, sections: outlineSectionsForDoc(doc) });
  const planByKey = new Map((Array.isArray(doc.sections) ? doc.sections : []).map((s) => [s.sectionKey, s.plan ?? null]));

  const htmls: string[] = [];
  const allGaps: Array<{ question: string; suggestions: string[] }> = [];
  const n = outline.sections.length;
  for (let k = 0; k < n; k++) {
    const s = outline.sections[k];
    deps.onProgress?.(`Drafting section ${k + 1}/${n}: ${s.heading}`);
    const r = await deps.draftSection({ heading: s.heading, requirementIds: s.requirementIds, pageBudget: s.pageBudget, plan: planByKey.get(s.sectionKey) ?? null });
    if (r?.html) htmls.push(r.html);
    for (const g of r?.gaps ?? []) allGaps.push(g);
  }
  if (!htmls.length) return null; // every section failed (e.g. no API key) ⇒ build failed, no empty draft saved

  const assembled = assembleDraftHtml(htmls, allGaps, doc.docKey);
  if (!assembled) return null;
  deps.onProgress?.('Saving the first draft');
  await deps.saveDraft(assembled);
  return assembled;
}
