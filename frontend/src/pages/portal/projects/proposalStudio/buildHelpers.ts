import type { GovProposalDocument, StudentGovProjectView } from '../../../../services/govProjectPortalApi';

/**
 * buildHelpers — PURE logic for the Build-all button (T17), per-document stage pills + Build-it (T17/T18), the
 * real-stage contract chip (T22), and the jurisdiction-only library picker (T18/D9). No React, no I/O — table-tested.
 */

/** A live (non-pricing, non-superseded) document is one the agent can build/judge toward the bar. */
export function isLiveDoc(d: GovProposalDocument): boolean {
  return !!d && d.key !== 'pricing' && !d.superseded;
}

/** Build-all shows only when at least one live document has not been started. */
export function anyNotStarted(docs: GovProposalDocument[] | null | undefined): boolean {
  return (Array.isArray(docs) ? docs : []).some((d) => isLiveDoc(d) && d.status === 'not_started');
}

/** The human stage label for a document (the Document-set Stage column + overview pills). */
export function docStageLabel(d: GovProposalDocument): string {
  if (d.superseded) return 'No longer required';
  if (d.latest?.passes) return 'Passing';
  switch (d.status) {
    case 'not_started': return 'Not started';
    case 'drafting': return 'Building';
    case 'drafted': return 'Drafted';
    case 'changes_requested': return 'Changes requested';
    case 'accepted': return 'Accepted';
    default: return 'In progress';
  }
}

/** The real pursuit-stage label for the contract bar (T22), derived from the projection rather than hardcoded. */
export function pursuitStageLabel(view: Pick<StudentGovProjectView, 'buildSummary' | 'proposalReadiness'>): string {
  const ready = view?.proposalReadiness?.pct ?? 0;
  if (ready >= 95) return 'Ready to submit';
  const roll = view?.buildSummary?.rollup;
  if (roll && roll.total > 0 && roll.verified < roll.total) return 'Build in progress';
  return 'Proposal production';
}

/**
 * The pre-award ASSESSMENT stage views whose pipe chips, in the ADMIN contract view, open the real Gov Qualification
 * Workspace (steps 1-4: Snapshot / Solicitation / Fit / Decide — they map 1:1 to the workspace's `?tab=` keys). Build
 * and later stay on the contract's own views: once assigned, "Build" is the actual build work, not the pre-award plan.
 */
export const QUALIFICATION_STAGE_VIEWS: readonly string[] = ['snapshot', 'solicitation', 'fit', 'decide'];

/** True when a Studio view is an assessment stage that the admin contract view routes to the Qualification Workspace. */
export function viewOpensQualification(v: string): boolean {
  return QUALIFICATION_STAGE_VIEWS.includes(v);
}

export interface LibraryItem { key: string; label: string; group: 'State forms' | 'Sections' | 'Resumes' | 'References'; }

/**
 * The library picker's items (T18, fixes D9): the solicitation's applicable forms ONLY when a state rulebook loaded
 * for the detected jurisdiction (so a non-Texas bid never shows Texas forms), plus the always-available generic
 * section/resume/reference library. Deterministic from the projection.
 */
export function libraryPickerItems(view: Pick<StudentGovProjectView, 'blueprint'>): LibraryItem[] {
  const items: LibraryItem[] = [];
  const bp = view?.blueprint;
  if (bp && bp.stateFormsStatus?.loaded) {
    for (const f of bp.forms || []) {
      if (f.disposition === 'not_required') continue; // only applicable forms
      items.push({ key: `form:${f.key}`, label: f.label, group: 'State forms' });
    }
  }
  items.push({ key: 'section:cover_letter', label: 'Cover letter / transmittal', group: 'Sections' });
  items.push({ key: 'section:past_performance', label: 'Past performance reference', group: 'Sections' });
  items.push({ key: 'resume:key_personnel', label: 'Key-personnel resume', group: 'Resumes' });
  items.push({ key: 'reference:project', label: 'Reference project sheet', group: 'References' });
  return items;
}

/**
 * Gold-gate eligibility (T20): the package Go is offered only when there is at least one scored (non-pricing,
 * non-superseded) document and EVERY one passes; otherwise the not-yet-passing documents are the blockers.
 */
export function goldEligibility(docs: GovProposalDocument[] | null | undefined): { eligible: boolean; blockers: string[] } {
  const scored = (Array.isArray(docs) ? docs : []).filter((d) => isLiveDoc(d));
  const blockers = scored.filter((d) => !d.latest?.passes).map((d) => d.title);
  return { eligible: scored.length > 0 && blockers.length === 0, blockers };
}
