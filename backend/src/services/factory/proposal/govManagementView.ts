/**
 * govManagementView (M5) - Ali's live management window for ONE gov proposal project, composed from pieces that
 * already exist rather than a parallel copy of them:
 *
 *  - RELEASES + per-story state  ->  getGovBuildSummary (the cockpit build view), with each release's PARKED state
 *    read from the build project's project_variables via isReleaseParked (M2 wrote the flag; this is its first reader).
 *  - SUBMISSION + POTENTIAL-WIN  ->  getSubmission (status + the M5 close date) joined with the human-priced value from
 *    gov_bid_values. Value is shown ONLY when a human recorded one; otherwise value-pending. Never fabricated.
 *  - DOSSIER summary             ->  getGovDossier (the M4 global cross-project library), reduced to counts.
 *  - COLLECTION FORM availability->  buildSharathCollectionForm's open-need count (the M4 engine), so the screen can
 *    offer "send the collection form" when there are open needs.
 *
 * Every tributary is fail-soft: one source failing leaves its field at a safe default rather than collapsing the
 * whole view, the same rule the projection and the Revenue Room funnel follow.
 */
import { getGovBuildSummary, type GovBuildReleaseSummary, type GovBuildRollup } from '../govBuildSummary';
import { isReleaseParked } from '../govReleaseLadder';
import { getSubmission, type SubmissionView } from '../govSubmission';
import { getGovDossier } from './govDossier';
import { buildSharathCollectionForm } from './collectionForm';
import { getLiveBidValues } from '../../revenueFlow/govBidValueService';

export interface ManagementRelease extends GovBuildReleaseSummary {
  /** True when this release is parked (R2 Full build-out until the proposal is won). The screen hides/gates it. */
  parked: boolean;
}

export interface ManagementPotentialWin {
  /** True once the proposal has been externally submitted (it is then a potential-win in the Revenue Room). */
  submitted: boolean;
  /** The solicitation close date (YYYY-MM-DD) carried on the submission, or null when none is recorded. */
  closeDate: string | null;
  /** The human-recorded value in cents, or null when nobody has priced it (value-pending - NEVER fabricated). */
  valueCents: number | null;
  /** True when a human has priced the bid. */
  priced: boolean;
}

export interface ManagementDossierSummary {
  tenantId: string | null;
  factCount: number;
  referenceCount: number;
  personnelCount: number;
}

export interface GovManagementView {
  deliveryProjectId: string;
  /** The linked build project id for the deep-link, or null when no build is linked. */
  studentProjectId: string | null;
  releases: ManagementRelease[];
  rollup: GovBuildRollup | null;
  submission: SubmissionView;
  potentialWin: ManagementPotentialWin;
  dossier: ManagementDossierSummary;
  /** Open human-need count from the M4 collection form; the screen offers to send the form when > 0. */
  openNeedCount: number;
  /** Whether the package is ready to export / re-export (submission is past the preparing state). */
  exportReady: boolean;
}

const EMPTY_ROLLUP: GovBuildRollup = { total: 0, verified: 0, complete: 0, inProgress: 0, blocked: 0, notStarted: 0, pct: 0 };

/** The live management view for a gov delivery project. Admin/management-scoped READ (no side effects). */
export async function getGovManagementView(deliveryProjectId: string): Promise<GovManagementView> {
  // Build releases + the linked build project (best-effort).
  let studentProjectId: string | null = null;
  let releaseSummaries: GovBuildReleaseSummary[] = [];
  let rollup: GovBuildRollup | null = null;
  try {
    const summary = await getGovBuildSummary(deliveryProjectId);
    if (summary) {
      studentProjectId = summary.studentProjectId;
      releaseSummaries = summary.releases;
      rollup = summary.rollup;
    }
  } catch { /* releases stay empty */ }

  // Parked state per release, from the build project's project_variables (isReleaseParked - M5 is its first reader).
  let projectVars: any = {};
  if (studentProjectId) {
    try {
      const { default: Project } = await import('../../../models/Project');
      const proj: any = await Project.findByPk(studentProjectId);
      projectVars = (proj && proj.project_variables && typeof proj.project_variables === 'object') ? proj.project_variables : {};
    } catch { /* no vars -> nothing parked */ }
  }
  const releases: ManagementRelease[] = releaseSummaries.map((r) => ({ ...r, parked: isReleaseParked(projectVars, r.key) }));

  // Submission + the M5 close date (fail-soft to the default preparing view).
  let submission: SubmissionView;
  try { submission = await getSubmission(deliveryProjectId); }
  catch { submission = await getSubmission(''); }

  // Potential-win: priced value from gov_bid_values when a human recorded one; otherwise value-pending.
  let valueCents: number | null = null;
  try {
    const live = await getLiveBidValues();
    const mine = live.find((v) => v.deliveryProjectId === deliveryProjectId) ?? null;
    valueCents = mine ? mine.proposalValueCents : null;
  } catch { valueCents = null; }
  const submitted = !!submission.externallySubmittedAt;
  const potentialWin: ManagementPotentialWin = {
    submitted,
    closeDate: submission.closeDate,
    valueCents,
    priced: valueCents != null,
  };

  // Dossier summary (M4 global library), reduced to counts.
  let dossier: ManagementDossierSummary = { tenantId: null, factCount: 0, referenceCount: 0, personnelCount: 0 };
  try {
    const d = await getGovDossier(deliveryProjectId);
    dossier = {
      tenantId: d.tenantId,
      factCount: Array.isArray(d.facts) ? d.facts.length : 0,
      referenceCount: Array.isArray((d as any).references) ? (d as any).references.length : 0,
      personnelCount: Array.isArray((d as any).personnel) ? (d as any).personnel.length : 0,
    };
  } catch { /* dossier stays zeroed */ }

  // Open-need count from the M4 collection form (so the screen can offer to send it).
  let openNeedCount = 0;
  try { openNeedCount = (await buildSharathCollectionForm(deliveryProjectId)).needCount; }
  catch { openNeedCount = 0; }

  return {
    deliveryProjectId,
    studentProjectId,
    releases,
    rollup: rollup ?? EMPTY_ROLLUP,
    submission,
    potentialWin,
    dossier,
    openNeedCount,
    exportReady: submission.status !== 'preparing',
  };
}
