/**
 * govProposalReviewRunStore — persistence for review-cycle runs (Proposal Studio B.5). A run row makes the otherwise
 * fire-and-forget `runReviewCycle` observable: the route creates a run (status `running`), the cycle bumps
 * iterations + last_message and finishes with a terminal status, and the UI polls `getRun` to show progress.
 *
 * RAIL: at most ONE active (`running`) run per document. `activeRunForDoc` is checked before a new run starts; the
 * route returns 409 when a run is already active. The batch `latestRunsForDocs` feeds the projection's per-doc
 * `cycle` summary without an N+1.
 */
import GovProposalReviewRun, { type GovProposalReviewRunAttributes, type GovProposalReviewRunStatus } from '../../../models/GovProposalReviewRun';

export interface ReviewRunView {
  id: string;
  documentId: string;
  status: GovProposalReviewRunStatus;
  iterations: number;
  lastMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

const TERMINAL: GovProposalReviewRunStatus[] = ['passed', 'blocked', 'failed', 'done'];

function toView(row: GovProposalReviewRunAttributes): ReviewRunView {
  return {
    id: String(row.id),
    documentId: row.document_id,
    status: row.status,
    iterations: row.iterations ?? 0,
    lastMessage: row.last_message ?? null,
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
  };
}

/** Start a new run for a document (status `running`, iterations 0). Returns the new run id. */
export async function createRun(documentId: string): Promise<{ id: string }> {
  const row: any = await GovProposalReviewRun.create({
    document_id: documentId, status: 'running', iterations: 0, last_message: null, result_json: null, finished_at: null,
  } as any);
  return { id: String(row.id) };
}

export interface ReviewRunPatch {
  status?: GovProposalReviewRunStatus;
  iterations?: number;
  lastMessage?: string | null;
  resultJson?: unknown | null;
  finishedAt?: Date | null;
}

/** Update a run's progress / terminal state. A terminal status stamps `finished_at` when one is not supplied. */
export async function updateRun(id: string, patch: ReviewRunPatch): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (patch.status !== undefined) fields.status = patch.status;
  if (patch.iterations !== undefined) fields.iterations = patch.iterations;
  if (patch.lastMessage !== undefined) fields.last_message = patch.lastMessage;
  if (patch.resultJson !== undefined) fields.result_json = patch.resultJson;
  if (patch.finishedAt !== undefined) fields.finished_at = patch.finishedAt;
  else if (patch.status && TERMINAL.includes(patch.status)) fields.finished_at = new Date();
  if (Object.keys(fields).length === 0) return;
  await GovProposalReviewRun.update(fields as any, { where: { id } });
}

export async function getRun(id: string): Promise<ReviewRunView | null> {
  const row: any = await GovProposalReviewRun.findByPk(id);
  return row ? toView(row.get({ plain: true }) as GovProposalReviewRunAttributes) : null;
}

/** The active (`running`) run for a document, or null. Used to enforce one-active-run-per-document (409 otherwise). */
export async function activeRunForDoc(documentId: string): Promise<ReviewRunView | null> {
  const row: any = await GovProposalReviewRun.findOne({ where: { document_id: documentId, status: 'running' }, order: [['started_at', 'DESC']] });
  return row ? toView(row.get({ plain: true }) as GovProposalReviewRunAttributes) : null;
}

/** The most recent run for a document (any status), or null — the projection's per-doc `cycle` summary. */
export async function latestRunForDoc(documentId: string): Promise<ReviewRunView | null> {
  const row: any = await GovProposalReviewRun.findOne({ where: { document_id: documentId }, order: [['started_at', 'DESC']] });
  return row ? toView(row.get({ plain: true }) as GovProposalReviewRunAttributes) : null;
}

/** Batch: the most recent run per document for a set of document ids (one query, grouped in memory — no N+1). */
export async function latestRunsForDocs(documentIds: string[]): Promise<Map<string, ReviewRunView>> {
  const out = new Map<string, ReviewRunView>();
  const ids = (Array.isArray(documentIds) ? documentIds : []).filter(Boolean);
  if (ids.length === 0) return out;
  const rows: any[] = await GovProposalReviewRun.findAll({ where: { document_id: ids }, order: [['started_at', 'DESC']] });
  for (const r of rows) {
    const v = toView(r.get({ plain: true }) as GovProposalReviewRunAttributes);
    if (!out.has(v.documentId)) out.set(v.documentId, v); // rows are newest-first, so the first per doc is the latest
  }
  return out;
}
