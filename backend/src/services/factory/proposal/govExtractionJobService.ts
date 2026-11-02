/**
 * govExtractionJobService — run the gov-qualification requirements extraction as a BACKGROUND job.
 *
 * Why: the solicitation ZIP used to be extracted synchronously inside the upload request. extractProposal opens
 * the archive and does per-PDF text extraction with no fixed bound, so a large Bonfire bundle blew past the
 * ~100s Cloudflare edge timeout and "never finished". The upload now stores the bytes (govSourceBundleStore) and
 * enqueues a job here; this worker runs the same extractor and writes the SAME response payload the frontend
 * already consumes ({ candidates, items, fileCount, files, extraction }) into result_json for polling.
 *
 * Mirrors the kick-off-then-poll pattern in services/requirementsGenerationService.ts. Idempotent: re-uploading
 * the same bytes while a job is in flight reuses it (dedup on tenant + qualification + sha256 + in-flight status),
 * so a double-click or an immediate retry never spawns a second extraction. Fire-and-forget; failures are
 * recorded on the row (status 'failed' + error_message), never thrown past the worker.
 */
import fs from 'fs/promises';
import GovExtractionJob from '../../../models/GovExtractionJob';
import { loadGovSourceBundleScoped } from './govSourceBundleStore';

export interface ExtractionResultPayload {
  candidates: any[];
  items: any;
  fileCount: number;
  files: any;
  extraction: any;
}

/**
 * PURE. Shape the extractor output into the exact response payload the frontend consumes — identical to the old
 * synchronous handler so the UI's result-consumption is unchanged. Kept separate so it can be unit-tested without
 * a DB, the filesystem, or the extractor.
 */
export function toExtractionResult(
  requirements: any[],
  items: any,
  result: { fileCount: number; files: any },
  aiMeta: any,
): ExtractionResultPayload {
  const candidates = (requirements || []).map((r: any) => ({
    id: r.canonicalReqId,
    text: r.statement,
    extractedText: r.extractedText,
    sourceDocument: r.sourceDocument,
    section: r.section,
    kind: r.kind,
    priority: r.priority,
  }));
  return { candidates, items, fileCount: result.fileCount, files: result.files, extraction: aiMeta };
}

export interface StartExtractionInput {
  tenantId: string;
  qualificationKey: string;
  sourceBundleId: string;
  sha256: string;
}

/**
 * Enqueue an extraction job and return its id immediately (well under the edge timeout). Reuses an in-flight job
 * for the same bytes instead of starting a second one. The heavy work runs in executeExtractionJob, fire-and-forget.
 */
export async function startGovExtraction(input: StartExtractionInput): Promise<{ jobId: string }> {
  const existing = await GovExtractionJob.findOne({
    where: {
      tenant_id: input.tenantId,
      qualification_key: input.qualificationKey,
      sha256: input.sha256,
      status: ['queued', 'running'],
    },
  });
  if (existing) return { jobId: existing.id };

  const job = await GovExtractionJob.create({
    tenant_id: input.tenantId,
    qualification_key: input.qualificationKey,
    source_bundle_id: input.sourceBundleId,
    sha256: input.sha256,
    status: 'queued',
  });

  executeExtractionJob(job.id).catch((err: any) => {
    console.error(`[GovExtract] Job ${job.id} unhandled error:`, err?.message);
  });

  return { jobId: job.id };
}

/** The background worker. Loads the stored ZIP, runs the extractor, and records the payload or the failure. */
async function executeExtractionJob(jobId: string): Promise<void> {
  const job = await GovExtractionJob.findByPk(jobId);
  if (!job) return;
  try {
    await job.update({ status: 'running' });

    const bundle = await loadGovSourceBundleScoped(job.tenant_id, job.qualification_key, job.source_bundle_id);
    if (!bundle) throw new Error('Source bundle is missing from the store.');
    const buffer = await fs.readFile(bundle.path);

    const { extractProposal } = await import('./proposalExtractor');
    const { buildRequirementItems } = await import('./govRequirementItems');
    const { applyAiComprehension } = await import('./govRequirementExtractAI');

    const result = await extractProposal(buffer);
    const { requirements, aiMeta } = await applyAiComprehension(result);
    const items = buildRequirementItems(requirements, result.dossier);
    const payload = toExtractionResult(requirements, items, result, aiMeta);

    await job.update({ status: 'completed', result_json: payload, completed_at: new Date() });
  } catch (err: any) {
    console.error(`[GovExtract] Job ${jobId} failed:`, err?.message);
    await job.update({ status: 'failed', error_message: err?.message || 'Extraction failed.', completed_at: new Date() });
  }
}

export type GovExtractionStatus =
  | { status: 'queued' | 'running' }
  | { status: 'completed'; result: ExtractionResultPayload }
  | { status: 'failed'; error: string };

/**
 * Status for polling, SCOPED to the job's tenant AND qualification. Null covers "no such job", "not this
 * tenant's" and "not this qualification's" alike, so the route answers 404 for all three and a job id reveals
 * nothing about another tenant's or qualification's extraction.
 */
export async function getGovExtractionStatus(
  jobId: string,
  tenantId: string,
  qualificationKey: string,
): Promise<GovExtractionStatus | null> {
  const job = await GovExtractionJob.findOne({
    where: { id: jobId, tenant_id: tenantId, qualification_key: qualificationKey },
  });
  if (!job) return null;
  if (job.status === 'completed') return { status: 'completed', result: (job.result_json || {}) as ExtractionResultPayload };
  if (job.status === 'failed') return { status: 'failed', error: job.error_message || 'Extraction failed.' };
  return { status: job.status as 'queued' | 'running' };
}
