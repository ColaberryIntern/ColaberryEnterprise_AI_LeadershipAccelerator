/**
 * migrateSlotsToDocuments — the PURE core of the P1 one-off migration that moves the response-slot model's authored
 * content, figures and gaps onto the NAMED DOCUMENTS (which become the single proposal model). No I/O: the script
 * `scripts/migrateProposalSlotsToDocumentSections.ts` wraps this with DB reads/writes and a dry-run.
 *
 * THE KEY BRIDGE (P0 hazard): a response slot identifies its requirement by `ContractRequirement.id` (a UUID),
 * while a document section identifies it by `canonical_req_id` (TEXT). `deriveResponseSlots` keys on
 * `id ?? canonicalReqId ?? canonical_req_id`; `deriveProposalDocuments` keys on `canonical_req_id ?? canonicalReqId
 * ?? id`. So this builds an explicit slot-key → canonical-key map per requirement and routes each response through
 * it — never a string join on one key.
 *
 * NO SILENT LOSS (P0 hazard 2): a `scope` requirement has a slot but NO document (it is build work). Its authored
 * content is reported in `unmatched`, not dropped, so the script logs it for build-track handling rather than
 * discarding a human's writing.
 *
 * IDEMPOTENT: a pure function of its inputs — same slots in, same plan out. The script applies section patches by
 * SET (keyed by sectionKey) and gap rows ON CONFLICT by `sourceGapId`, so re-running changes nothing.
 */
import { deriveProposalDocuments, type ProposalDocument } from './govProposalDocuments';
import type { ResponseFigure, ResponseGap } from './responseSlots';

export interface MigrationRequirement {
  id?: string;
  canonical_req_id?: string;
  canonicalReqId?: string;
  statement?: string;
  text?: string;
  kind?: string;
}

export interface MigrationResponse {
  requirementId: string;
  content?: string;
  figures?: ResponseFigure[];
  gaps?: ResponseGap[];
}

export interface SectionPatch {
  docKey: string;
  sectionKey: string;
  contentHtml?: string;
  figures?: ResponseFigure[];
}

export interface GapRow {
  docKey: string;
  sectionKey: string;
  question: string;
  suggestions: string[];
  resolution: 'open' | 'answered' | 'filler';
  answer: string | null;
  sourceGapId: string;
}

export interface MigrationPlan {
  documents: ProposalDocument[];
  sectionPatches: SectionPatch[];
  gapRows: GapRow[];
  /** requirementIds whose response carried content/gaps but routes to no document (scope/build work). Never lost. */
  unmatched: string[];
}

/** The key `deriveResponseSlots` assigns a slot — matches that function's precedence exactly. */
function slotKeyOf(r: MigrationRequirement): string {
  return String(r.id ?? r.canonicalReqId ?? r.canonical_req_id ?? '').trim();
}
/** The key `deriveProposalDocuments` routes a requirement by — matches that function's precedence exactly. */
function docKeyOf(r: MigrationRequirement): string {
  return String(r.canonical_req_id ?? r.canonicalReqId ?? r.id ?? '').trim();
}

/** Plan the slot→document migration for one project. Pure + total (garbage in ⇒ empty plan). */
export function planSlotMigration(requirements: MigrationRequirement[], responses: MigrationResponse[]): MigrationPlan {
  const reqs = Array.isArray(requirements) ? requirements : [];
  const resps = Array.isArray(responses) ? responses : [];

  const documents = deriveProposalDocuments(reqs);
  // canonical section key → the document it lives in.
  const canonicalToDoc = new Map<string, string>();
  for (const doc of documents) for (const s of doc.sections) canonicalToDoc.set(s.sectionKey, doc.key);
  // slot requirementId → canonical key (the explicit bridge).
  const slotToCanonical = new Map<string, string>();
  for (const r of reqs) {
    const sk = slotKeyOf(r);
    if (sk) slotToCanonical.set(sk, docKeyOf(r));
  }

  const sectionPatches: SectionPatch[] = [];
  const gapRows: GapRow[] = [];
  const unmatched: string[] = [];

  for (const resp of resps) {
    if (!resp || !resp.requirementId) continue;
    const canonical = slotToCanonical.get(String(resp.requirementId).trim());
    const docKey = canonical ? canonicalToDoc.get(canonical) : undefined;
    const hasContent = typeof resp.content === 'string' && resp.content.trim() !== '';
    const figures = Array.isArray(resp.figures) ? resp.figures : [];
    const gaps = Array.isArray(resp.gaps) ? resp.gaps : [];

    if (!canonical || !docKey) {
      if (hasContent || figures.length || gaps.length) unmatched.push(String(resp.requirementId));
      continue;
    }
    if (hasContent || figures.length) {
      sectionPatches.push({
        docKey,
        sectionKey: canonical,
        ...(hasContent ? { contentHtml: resp.content } : {}),
        ...(figures.length ? { figures } : {}),
      });
    }
    for (const g of gaps) {
      if (!g || !g.id) continue;
      gapRows.push({
        docKey,
        sectionKey: canonical,
        question: String(g.question ?? ''),
        suggestions: Array.isArray(g.suggestions) ? g.suggestions : [],
        resolution: g.resolution === 'answered' || g.resolution === 'filler' ? g.resolution : 'open',
        answer: typeof g.answer === 'string' ? g.answer : null,
        sourceGapId: String(g.id),
      });
    }
  }

  return { documents, sectionPatches, gapRows, unmatched };
}

/** Apply section patches to a document's sections by `sectionKey` (SET, so re-applying is a no-op). Pure. */
export function applySectionPatches(
  sections: ProposalDocument['sections'],
  patches: SectionPatch[],
): ProposalDocument['sections'] {
  const byKey = new Map<string, SectionPatch>();
  for (const p of patches) byKey.set(p.sectionKey, p);
  return (Array.isArray(sections) ? sections : []).map((s) => {
    const p = byKey.get(s.sectionKey);
    if (!p) return s;
    return {
      ...s,
      ...(p.contentHtml !== undefined ? { contentHtml: p.contentHtml } : {}),
      ...(p.figures !== undefined ? { figures: p.figures } : {}),
    };
  });
}
