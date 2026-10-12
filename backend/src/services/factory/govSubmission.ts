/**
 * govSubmission — the submission lifecycle + outcome for a gov delivery project (P5).
 *
 * THE RAILS:
 *  - export is readiness-gated (every response approved + coverage sufficient + nothing blocking) — you cannot
 *    package a proposal whose answers are not signed off.
 *  - EXPORTED ≠ SUBMITTED: a receipt can be recorded only AFTER an export (status `exported`), and acknowledgement
 *    only after an external submission. These are MANUAL operator acts — there is no external submission here.
 *  - recordOutcome never fabricates: the candidates are deterministic, born PRIVATE ('candidate'/'suggested',
 *    published:false), and written only as JSONB on this row — never to the published case_studies / live
 *    service_offerings systems.
 *
 * One row per delivery project (UNIQUE); a re-run upserts in place.
 */
import GovSubmission, { type GovSubmissionAttributes, type SubmissionStatus, type SubmissionOutcome } from '../../models/GovSubmission';
import { evaluateSubmissionReadiness, buildSubmissionManifest, buildOutcomeCandidates } from './proposal/submissionPackage';
import type { ResponseSlot } from './proposal/responseSlots';

export interface SubmissionView {
  status: SubmissionStatus;
  outcome: SubmissionOutcome;
  exportManifest: any | null;
  exportedAt: string | null;
  externalRef: string | null;
  externallySubmittedAt: string | null;
  acknowledgedRef: string | null;
  acknowledgedAt: string | null;
  outcomeNote: string | null;
  outcomeRecordedAt: string | null;
  caseStudyCandidate: any | null;
  serviceCapabilityCandidate: any | null;
}

export class SubmissionError extends Error {
  constructor(message: string, readonly reason: string, readonly blocking: string[] = []) { super(message); this.name = 'SubmissionError'; }
}

const DEFAULT_VIEW: SubmissionView = {
  status: 'preparing', outcome: 'pending', exportManifest: null, exportedAt: null, externalRef: null,
  externallySubmittedAt: null, acknowledgedRef: null, acknowledgedAt: null, outcomeNote: null,
  outcomeRecordedAt: null, caseStudyCandidate: null, serviceCapabilityCandidate: null,
};

const iso = (d: Date | null | undefined): string | null => (d ? new Date(d).toISOString() : null);

function toView(row: GovSubmissionAttributes): SubmissionView {
  return {
    status: row.status,
    outcome: row.outcome,
    exportManifest: row.export_manifest ?? null,
    exportedAt: iso(row.exported_at),
    externalRef: row.external_ref ?? null,
    externallySubmittedAt: iso(row.externally_submitted_at),
    acknowledgedRef: row.acknowledged_ref ?? null,
    acknowledgedAt: iso(row.acknowledged_at),
    outcomeNote: row.outcome_note ?? null,
    outcomeRecordedAt: iso(row.outcome_recorded_at),
    caseStudyCandidate: row.case_study_candidate ?? null,
    serviceCapabilityCandidate: row.service_capability_candidate ?? null,
  };
}

async function findRow(deliveryProjectId: string): Promise<any> {
  return GovSubmission.findOne({ where: { delivery_project_id: deliveryProjectId } });
}

/** Upsert the submission row with `patch`, race-safe, and return the view. */
async function upsertView(deliveryProjectId: string, patch: Partial<GovSubmissionAttributes>): Promise<SubmissionView> {
  const existing = await findRow(deliveryProjectId);
  if (existing) {
    await existing.update({ ...patch, updated_at: new Date() });
    return toView(existing.get({ plain: true }) as GovSubmissionAttributes);
  }
  try {
    const row = await GovSubmission.create({ delivery_project_id: deliveryProjectId, status: 'preparing', outcome: 'pending', ...patch } as GovSubmissionAttributes);
    return toView(row.get({ plain: true }) as GovSubmissionAttributes);
  } catch (err) {
    const raced = await findRow(deliveryProjectId);
    if (!raced) throw err;
    await raced.update({ ...patch, updated_at: new Date() });
    return toView(raced.get({ plain: true }) as GovSubmissionAttributes);
  }
}

/** The submission state for a project, or the default `preparing`/`pending` view when none is stored yet. */
export async function getSubmission(deliveryProjectId: string): Promise<SubmissionView> {
  if (!deliveryProjectId) return { ...DEFAULT_VIEW };
  const row = await findRow(deliveryProjectId);
  return row ? toView(row.get({ plain: true }) as GovSubmissionAttributes) : { ...DEFAULT_VIEW };
}

export interface ExportSubmissionInput {
  deliveryProjectId: string;
  projectName: string;
  slots: ResponseSlot[];
  coverageSufficient: boolean;
  canApproveBid: boolean;
}

/** Assemble + mark the package exported. Readiness-gated: refuses unless every response is approved + covered. */
export async function exportSubmission(input: ExportSubmissionInput): Promise<SubmissionView> {
  if (!input.deliveryProjectId) throw new SubmissionError('Missing project identifier.', 'bad_input');
  const readiness = evaluateSubmissionReadiness(input.slots, input.coverageSufficient, input.canApproveBid);
  if (!readiness.ready) throw new SubmissionError('The proposal is not ready to export.', 'not_ready', readiness.blocking);
  const exportedAt = new Date();
  const manifest = buildSubmissionManifest(String(input.projectName || 'Government proposal'), input.slots, exportedAt.toISOString());
  return upsertView(input.deliveryProjectId, { status: 'exported', export_manifest: manifest, exported_at: exportedAt });
}

/** Record the MANUAL external-submission receipt. EXPORTED ≠ SUBMITTED: refuses unless the package was exported. */
export async function recordSubmissionReceipt(deliveryProjectId: string, externalRef: string): Promise<SubmissionView> {
  if (!deliveryProjectId) throw new SubmissionError('Missing project identifier.', 'bad_input');
  const ref = String(externalRef ?? '').trim();
  if (!ref) throw new SubmissionError('A submission receipt reference is required.', 'no_ref');
  const row = await findRow(deliveryProjectId);
  const status: SubmissionStatus = row ? (row.get({ plain: true }) as GovSubmissionAttributes).status : 'preparing';
  if (status !== 'exported') throw new SubmissionError('Export the package before recording an external submission.', 'not_exported');
  return upsertView(deliveryProjectId, { status: 'externally_submitted', external_ref: ref, externally_submitted_at: new Date() });
}

/** Record the agency's acknowledgement. Refuses unless an external submission was recorded first. */
export async function acknowledgeSubmission(deliveryProjectId: string, acknowledgedRef: string): Promise<SubmissionView> {
  if (!deliveryProjectId) throw new SubmissionError('Missing project identifier.', 'bad_input');
  const row = await findRow(deliveryProjectId);
  const status: SubmissionStatus = row ? (row.get({ plain: true }) as GovSubmissionAttributes).status : 'preparing';
  if (status !== 'externally_submitted') throw new SubmissionError('Record the external submission before acknowledgement.', 'not_submitted');
  return upsertView(deliveryProjectId, { status: 'acknowledged', acknowledged_ref: String(acknowledgedRef ?? '').trim() || null, acknowledged_at: new Date() });
}

/** Reopen to `preparing` (e.g. after a material amendment reopened responses, or to re-export). */
export async function reopenSubmission(deliveryProjectId: string): Promise<SubmissionView> {
  if (!deliveryProjectId) throw new SubmissionError('Missing project identifier.', 'bad_input');
  return upsertView(deliveryProjectId, { status: 'preparing' });
}

export interface RecordOutcomeInput {
  deliveryProjectId: string;
  projectName: string;
  outcome: SubmissionOutcome;
  note?: string | null;
  slots: ResponseSlot[];
}

const OUTCOMES: SubmissionOutcome[] = ['pending', 'won', 'lost', 'withdrawn', 'no_bid', 'unknown'];

/**
 * Record the win/loss outcome. For a `won` or `lost` outcome it also generates the PRIVATE reusable candidates (a
 * case-study candidate + a service-capability candidate) — deterministic, never published. Other outcomes record
 * the status only. Recording an outcome NEVER changes a past approval.
 */
export async function recordOutcome(input: RecordOutcomeInput): Promise<SubmissionView> {
  if (!input.deliveryProjectId) throw new SubmissionError('Missing project identifier.', 'bad_input');
  if (!OUTCOMES.includes(input.outcome)) throw new SubmissionError('Invalid outcome.', 'bad_outcome');
  const now = new Date();
  const patch: Partial<GovSubmissionAttributes> = {
    outcome: input.outcome,
    outcome_note: String(input.note ?? '').trim() || null,
    outcome_recorded_at: now,
  };
  if (input.outcome === 'won' || input.outcome === 'lost') {
    const c = buildOutcomeCandidates(String(input.projectName || 'Government pursuit'), input.outcome, input.note ?? null, input.slots, now.toISOString());
    patch.case_study_candidate = c.caseStudyCandidate;
    patch.service_capability_candidate = c.serviceCapabilityCandidate;
  }
  return upsertView(input.deliveryProjectId, patch);
}
