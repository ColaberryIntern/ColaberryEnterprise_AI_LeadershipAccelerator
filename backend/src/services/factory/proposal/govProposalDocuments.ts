/**
 * govProposalDocuments — DERIVE the solicitation-named documents a bid must submit, from the established
 * requirements. There is no stored list of required documents anywhere (the dossier tracks the solicitation's own
 * ingested files, not the bidder's submittals), so we derive it: each requirement that is a SUBMITTAL obligation is
 * routed to the named document it belongs to (Cover Letter, Technical Proposal, Price/Cost Proposal, Past
 * Performance, HUB Plan, Reps & Certs, …), and the requirements become the points that document must cover.
 *
 * This is the PROPOSAL half of the cockpit v2: one task per named DOCUMENT (the AI drafts each → PDF → reviewer
 * accepts), NOT one task per requirement and NOT the 8 generic FAR volumes. A `scope` requirement is NOT a
 * submittal — it is BUILD work — so it never becomes a proposal document. Pure + deterministic + total: same
 * requirements in, same documents out, which is what makes it unit-testable.
 *
 * TRUST BOUNDARY: a document may be `adminOnly` (pricing), which the student-safe projection drops — an intern
 * never sees or works the price document (pricing is the admin's decision), exactly as the per-requirement view
 * already drops pricing.
 */
import { classifyRequirementCategory } from './govRequirementItems';
import type { ResponseFigure } from './responseSlots';
import type { ProposalBlueprint } from './proposalBlueprintTypes';

/** How a document was derived (P2). `derived` = routed from a requirement (the P1 default); `form` = a required
 *  form named by the blueprint / Texas engine; `generated` = we generate it (Compliance Matrix); `build` = the
 *  Pilot Demonstration Exhibit backed by the verified build. The GovProposalDocument model aliases this. */
export type ProposalDocType = 'derived' | 'form' | 'generated' | 'build';

export interface ProposalDocumentRule {
  key: string;
  title: string;
  order: number;
  /** A missing one is usually a non-responsive rejection — surfaced as a hard gate (advisory). */
  gate: boolean;
  /** Pricing is admin-only; the student-safe projection drops it. */
  adminOnly: boolean;
  pattern: RegExp;
}

// Specific documents first; the first matching rule wins. Titles are the names a proposal manager recognizes.
export const DOCUMENT_RULES: ProposalDocumentRule[] = [
  { key: 'cover_letter', title: 'Cover Letter / Transmittal', order: 1, gate: false, adminOnly: false, pattern: /\b(cover\s+letter|transmittal\s+letter|letter\s+of\s+transmittal)\b/i },
  { key: 'execution_offer', title: 'Execution of Offer & Signature Forms', order: 2, gate: true, adminOnly: false, pattern: /\b(execution\s+of\s+offer|SF[-\s]?33|SF[-\s]?1449|standard\s+form\s+33|signature\s+(?:page|of\s+(?:an?\s+)?authorized)|signed\s+(?:and\s+dated|offer|proposal))\b/i },
  { key: 'reps_certs', title: 'Representations & Certifications', order: 3, gate: true, adminOnly: false, pattern: /\b(representations?\s+and\s+certifications?|reps?\s+and\s+certs?|SAM\.gov|E-?Verify|section\s+889|conflict\s+of\s+interest|non[-\s]?collusion|debarment|suspension|W-?9|form\s+1295|lobbying|good\s+standing)\b/i },
  { key: 'pricing', title: 'Price / Cost Proposal', order: 4, gate: true, adminOnly: true, pattern: /\b(pricing\s+(?:sheet|schedule|form|proposal|page|table)|price\s+(?:proposal|schedule|sheet|form)|cost\s+proposal|fee\s+schedule|cost\s+(?:breakdown|element|sheet)|not[-\s]?to[-\s]?exceed|unit\s+price|hourly\s+rate|total\s+(?:bid|proposed)\s+price)\b/i },
  // Specific-signal documents are matched BEFORE the broader experience/management ones (a "HUB plan references"
  // line must file under the HUB plan, not Past Performance). `order` keeps the DISPLAY in proposal-volume order.
  { key: 'socioeconomic', title: 'HUB / Small Business Subcontracting Plan', order: 7, gate: true, adminOnly: false, pattern: /\b(hub\s+subcontract|subcontracting\s+plan|historically\s+underutilized|\bHUB\b|\bDBE\b|\bMBE\b|\bWBE\b|\bSBE\b|small\s+business\s+(?:plan|participation|subcontracting|goal)|minority[-\s]?owned|wom[ae]n[-\s]?owned)\b/i },
  { key: 'financial', title: 'Financial Responsibility & Insurance', order: 8, gate: false, adminOnly: false, pattern: /\b(financial\s+statement|audited\s+financial|certificate\s+of\s+insurance|proof\s+of\s+insurance|insurance\s+(?:coverage|requirement|certificate)|general\s+liability\s+insurance|bonding\s+capacity|performance\s+bond|payment\s+bond|surety|dun\s*&?\s*bradstreet|\bD&B\b)\b/i },
  { key: 'past_performance', title: 'Past Performance & References', order: 5, gate: false, adminOnly: false, pattern: /\b(past\s+performance|\breferences\b|corporate\s+experience|similar\s+(?:contracts?|projects?|scope|engagements?)|prior\s+(?:contracts?|experience|projects?)|\bCPARS\b)\b/i },
  { key: 'management', title: 'Management & Staffing Plan', order: 6, gate: false, adminOnly: false, pattern: /\b(key\s+personnel|r[eé]sum[eé]s?|staffing\s+(?:plan|profile)|project\s+manager|organization(?:al)?\s+chart|management\s+(?:plan|approach|structure)|transition\s+plan|implementation\s+plan|personnel\s+qualif)\b/i },
  { key: 'compliance_matrix', title: 'Compliance Matrix', order: 9, gate: false, adminOnly: false, pattern: /\b(compliance\s+matrix|requirements?\s+(?:traceability|compliance)\s+matrix|cross[-\s]?reference\s+matrix)\b/i },
  { key: 'terms', title: 'Terms & Conditions Response', order: 10, gate: false, adminOnly: false, pattern: /\b(terms\s+and\s+conditions|exceptions?\s+to\s+the\s+(?:terms|conditions|contract|clause))\b/i },
  // Default: the solution narrative. A submittal obligation that matches nothing specific is a technical response.
  { key: 'technical', title: 'Technical Proposal', order: 11, gate: false, adminOnly: false, pattern: /.*/ },
];

const ruleFor = (statement: string): ProposalDocumentRule => DOCUMENT_RULES.find((d) => d.pattern.test(statement)) ?? DOCUMENT_RULES[DOCUMENT_RULES.length - 1];

export interface ProposalDocumentReq { canonicalReqId: string; statement: string; }

/**
 * A SECTION of a proposal document (P1 "documents are the source"). One section per requirement the
 * document covers: `sectionKey` is the requirement's canonical id, `requirementIds` the ids it answers
 * (one today; the shape allows a future merge), `plan` the optional `hot-button → feature → benefit →
 * proof → discriminator` section plan P5 fills in. The response-slot model's per-requirement content,
 * figures and gaps migrate INTO these sections (see migrateProposalSlotsToDocumentSections.ts).
 */
/** P5 structured section plan (hot-button → feature → benefit → proof → discriminator). Reviewer-editable; saving it
 *  writes a new human version so it stays auditable. (The legacy single-string `plan` below is kept for back-compat.) */
export interface SectionPlanFields {
  hotButton: string;
  feature: string;
  benefit: string;
  proof: string;
  discriminator: string;
}

export interface ProposalDocumentSection {
  sectionKey: string;
  heading: string;
  requirementIds: string[];
  order: number;
  plan?: string;
  /** P5: the structured section plan the reviewer fills in (B.7). */
  planFields?: SectionPlanFields;
  /** Authored section body — migrated from the response slot, then written by drafting (P5). Preserved across
   *  re-derivation (sync merges by `sectionKey`; derivation never clears it). */
  contentHtml?: string;
  /** Commit-bound figures migrated from the slot response. */
  figures?: ResponseFigure[];
}

export interface ProposalDocument {
  key: string;
  title: string;
  order: number;
  gate: boolean;
  adminOnly: boolean;
  /** The requirements this document must cover — the AI's grounding, and the reviewer's checklist. */
  requirements: ProposalDocumentReq[];
  /** One section per covered requirement, in coverage order. The document is the source of record (P1). */
  sections: ProposalDocumentSection[];
  /** P2: how this document was derived. `derived` unless the blueprint added it as a form/generated/build doc.
   *  Optional at the type level so pre-P2 literals still compile; deriveProposalDocuments always sets it. */
  docType?: ProposalDocType;
  /** P2: Section L page limit for this document's volume, from the blueprint; null when none applies. */
  pageLimit?: number | null;
  /** P2: deterministic submission file name (slug of the title), so the package can name files per the blueprint. */
  fileName?: string | null;
  /** P2: the blueprint version that produced this document's shape; null when derived without a blueprint (P1 path). */
  blueprintVersion?: number | null;
}

/** A short, stable section heading from a requirement statement: first sentence/clause, capped. Pure. */
export function sectionHeading(statement: string): string {
  const s = String(statement ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return 'Requirement';
  const cut = s.split(/(?<=[.;:])\s/)[0];
  return (cut.length > 90 ? cut.slice(0, 87).trimEnd() + '…' : cut);
}

/**
 * Derive the named proposal documents from the established requirements. A `scope` requirement is build work, not a
 * submittal, so it is excluded. Every other requirement is routed to exactly one named document; a document with no
 * requirements is not created. Returned in proposal-volume order. Pure + total (garbage ⇒ []).
 */
export function deriveProposalDocuments(
  established: any[],
  blueprint?: ProposalBlueprint | null,
  opts?: { blueprintVersion?: number; allowSupplemental?: boolean },
): ProposalDocument[] {
  const byKey = new Map<string, ProposalDocument>();
  for (const r of Array.isArray(established) ? established : []) {
    if (!r) continue;
    const statement = String(r.statement ?? r.text ?? '').trim();
    const canonicalReqId = String(r.canonical_req_id ?? r.canonicalReqId ?? r.id ?? '').trim();
    if (!statement || !canonicalReqId) continue;
    const kind = String(r.kind ?? '').trim().toLowerCase();
    // A scope requirement is build work (solution_build), never a submittal document.
    if (kind !== 'pricing' && classifyRequirementCategory(statement) === 'scope') continue;
    // A pricing-kind requirement is always the price document, whatever its wording.
    const rule = kind === 'pricing' ? (DOCUMENT_RULES.find((d) => d.key === 'pricing') as ProposalDocumentRule) : ruleFor(statement);
    let doc = byKey.get(rule.key);
    if (!doc) { doc = { key: rule.key, title: rule.title, order: rule.order, gate: rule.gate, adminOnly: rule.adminOnly, requirements: [], sections: [], docType: 'derived', pageLimit: null, fileName: null, blueprintVersion: null }; byKey.set(rule.key, doc); }
    if (!doc.requirements.some((x) => x.canonicalReqId === canonicalReqId)) {
      doc.requirements.push({ canonicalReqId, statement });
      // One section per covered requirement (P1). Content/figures/gaps land here via migration + drafting.
      doc.sections.push({ sectionKey: canonicalReqId, heading: sectionHeading(statement), requirementIds: [canonicalReqId], order: doc.sections.length + 1 });
    }
  }
  const docs = [...byKey.values()];
  if (blueprint) enrichFromBlueprint(docs, blueprint, opts);
  return docs.sort((a, b) => a.order - b.order);
}

/** A deterministic submission file name from a document title: slug + .pdf (the price doc stays .xlsx). Pure. */
export function slugFileName(title: string, ext = 'pdf'): string {
  const slug = String(title ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'document';
  return `${slug}.${ext}`;
}

/** Required forms whose submittal is ALREADY a derived document — tag that document rather than duplicating it. */
const FORM_TO_EXISTING_DOC: Record<string, string> = { hsp: 'socioeconomic', execution_of_offer: 'execution_offer' };

/**
 * Layer the blueprint onto the derived documents (P2): stamp the blueprint version + a file name on every document,
 * assign the Section L page limit to the narrative (technical) volume, tag/add a document for each REQUIRED form,
 * ensure a generated Compliance Matrix, and add the build-backed Pilot Demonstration Exhibit unless supplemental
 * material is forbidden. Mutates `docs` in place. Pure w.r.t. its inputs (deterministic).
 */
function enrichFromBlueprint(docs: ProposalDocument[], blueprint: ProposalBlueprint, opts?: { blueprintVersion?: number; allowSupplemental?: boolean }): void {
  const version = opts?.blueprintVersion ?? null;
  const byKey = new Map(docs.map((d) => [d.key, d]));
  const ensure = (key: string, title: string, order: number, docType: ProposalDocType, gate: boolean, adminOnly = false): ProposalDocument => {
    let d = byKey.get(key);
    if (!d) { d = { key, title, order, gate, adminOnly, requirements: [], sections: [], docType, pageLimit: null, fileName: null, blueprintVersion: null }; byKey.set(key, d); docs.push(d); }
    d.docType = docType;
    return d;
  };

  // Page limit for the narrative volume (the technical document), from the first page_limit rule.
  const pageLimitRule = blueprint.rules.find((r) => r.key === 'page_limit');
  const pageLimit = pageLimitRule ? Number.parseInt(pageLimitRule.value, 10) : NaN;

  // Required forms (and at-award forms) → a form document. hsp/execution map onto existing derived docs.
  for (const form of blueprint.forms) {
    if (form.disposition !== 'required' && form.disposition !== 'at_award') continue;
    const existingKey = FORM_TO_EXISTING_DOC[form.key];
    if (existingKey) { ensure(existingKey, form.label, byKey.get(existingKey)?.order ?? 7, 'form', form.severity === 'fatal'); }
    else { ensure(`form_${form.key}`, form.label, 3, 'form', form.severity === 'fatal'); }
  }

  // Compliance Matrix (we generate it) and the build-backed Pilot Demonstration Exhibit.
  ensure('compliance_matrix', 'Compliance Matrix', 9, 'generated', false);
  if (opts?.allowSupplemental !== false) ensure('pilot_demo_exhibit', 'Pilot Demonstration Exhibit', 12, 'build', false);

  // Stamp blueprint version, file name, and the page limit (technical only) on every document.
  for (const d of docs) {
    d.blueprintVersion = version;
    d.fileName = slugFileName(d.title, d.key === 'pricing' ? 'xlsx' : 'pdf');
    if (d.key === 'technical' && Number.isFinite(pageLimit)) d.pageLimit = pageLimit;
  }
}
