/**
 * govAiVetting: runs the AI checks on a solicitation ZIP with no clicks and saves the result, so the second-check visit
 * opens with it already there. Started when extraction completes; a daily catch-up retries and backfills.
 *
 * ADVISORY. It never establishes a requirement, approves, or assigns, and writes only to gov_ai_vettings.
 *
 * Failure design:
 * - What can fail: the model, the catalog read, the extraction, or an unreadable file.
 * - Retry: `attempts` increments at CLAIM, so a process that dies mid-run still uses one. Capped at MAX_ATTEMPTS; the
 *   daily catch-up is the retry cadence. The AI client adds its own single retry.
 * - Exhausted: completed as inconclusive with `error_class`, which shows as "Needs your read". Never hidden.
 * - Not retried, because retrying can't help: no stored ZIP record, or a ZIP with no readable requirements.
 * - Not handled: a wrong but well-formed verdict. That's why a person reads every star, and hidden rows are restorable.
 *
 * `any` here means raw Sequelize rows and the extraction's stored JSON, which have no typed shape to read them through.
 */
import { QueryTypes } from 'sequelize';
import { FLAGS } from '../../config/featureFlags';
import GovAiVetting from '../../models/GovAiVetting';
import { decideVerdict } from './govAiVerdict';

export const MAX_ATTEMPTS = 3;
export const STALE_MINUTES = 30;
export const BACKFILL_PER_DAY = 10;
const CATCHUP_SLOT_KEY = 'gov_ai_vetting_catchup_log';

/** A failure that a retry can't fix: finish now rather than spending the remaining attempts. */
class TerminalVettingError extends Error {
  constructor(public errorClass: string, message: string) { super(message); this.name = 'TerminalVettingError'; }
}

function log(event: string, outcome: 'success' | 'failure' | 'partial', context: Record<string, unknown>, errorClass?: string): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(), level: outcome === 'failure' ? 'error' : 'info', service: 'backend', event, outcome,
    ...(errorClass ? { error_class: errorClass } : {}), context,
  }));
}

export interface VettingKey { tenantId: string; qualificationKey: string; sha256: string }

/**
 * Upsert the row when a ZIP arrives, so it reads as analyzing from upload onward. Re-uploading known bytes only moves
 * last_uploaded_at, so A, B, A reads A again and doesn't pay for a second AI run.
 */
export async function ensureVettingRow(k: VettingKey): Promise<void> {
  const { sequelize } = await import('../../config/database');
  await sequelize.query(
    `INSERT INTO gov_ai_vettings (id, tenant_id, qualification_key, sha256, status, attempts, last_uploaded_at, created_at, updated_at)
     VALUES (gen_random_uuid(), :tenantId, :qualificationKey, :sha256, 'queued', 0, NOW(), NOW(), NOW())
     ON CONFLICT (tenant_id, qualification_key, sha256) DO UPDATE SET last_uploaded_at = NOW(),
       error_class = CASE WHEN gov_ai_vettings.status = 'queued' THEN NULL ELSE gov_ai_vettings.error_class END`,
    { replacements: { ...k } });
}

/** Extraction failed, so no checks will run until the daily catch-up. Recorded so the screen can say that, not "running". */
export async function noteExtractionFailed(k: VettingKey): Promise<void> {
  await GovAiVetting.update(
    { error_class: 'extraction_failed', updated_at: new Date() } as any,
    { where: { tenant_id: k.tenantId, qualification_key: k.qualificationKey, sha256: k.sha256, status: 'queued' } },
  );
}

/** Atomically take a row. Exactly one caller wins, and the attempt is counted now. Null when there's nothing to take. */
export async function claimVetting(k: VettingKey): Promise<{ id: string; attempts: number } | null> {
  const { sequelize } = await import('../../config/database');
  const rows: any[] = await sequelize.query(
    `UPDATE gov_ai_vettings SET status = 'running', attempts = attempts + 1, updated_at = NOW()
      WHERE tenant_id = :tenantId AND qualification_key = :qualificationKey AND sha256 = :sha256
        AND attempts < :max
        AND (status = 'queued' OR (status = 'running' AND updated_at < NOW() - make_interval(mins => :stale)))
      RETURNING id, attempts`,
    { replacements: { ...k, max: MAX_ATTEMPTS, stale: STALE_MINUTES }, type: QueryTypes.SELECT });
  return Array.isArray(rows) && rows[0] ? { id: String(rows[0].id), attempts: Number(rows[0].attempts) } : null;
}

/** Complete rows that used every attempt and are stuck, including a process that died during its last attempt. */
export async function finalizeExhausted(): Promise<void> {
  const { sequelize } = await import('../../config/database');
  await sequelize.query(
    `UPDATE gov_ai_vettings
        SET status = 'completed', verdict = 'inconclusive', error_class = 'attempts_exhausted',
            reason = 'The AI checks could not finish on this ZIP. Please read it yourself.', completed_at = NOW(), updated_at = NOW()
      WHERE attempts >= :max AND (status = 'queued' OR (status = 'running' AND updated_at < NOW() - make_interval(mins => :stale)))`,
    { replacements: { max: MAX_ATTEMPTS, stale: STALE_MINUTES } });
}

/** The extraction payload for these bytes: the completed job's, else extracted now from the stored ZIP. */
async function loadCandidates(k: VettingKey): Promise<any[]> {
  const { default: GovExtractionJob } = await import('../../models/GovExtractionJob');
  const job: any = await GovExtractionJob.findOne({
    where: { tenant_id: k.tenantId, qualification_key: k.qualificationKey, sha256: k.sha256, status: 'completed' },
    order: [['completed_at', 'DESC']],
  });
  if (job?.result_json) return Array.isArray(job.result_json.candidates) ? job.result_json.candidates : [];

  const { default: GovSourceBundle } = await import('../../models/GovSourceBundle');
  const bundle: any = await GovSourceBundle.findOne({ where: { tenant_id: k.tenantId, qualification_key: k.qualificationKey, sha256: k.sha256 } });
  if (!bundle) throw new TerminalVettingError('zip_bytes_missing', 'The ZIP was not kept, so it could not be read. Please upload it again.');
  const { extractBundlePayload } = await import('./proposal/govExtractionJobService');
  const payload = await extractBundlePayload(k.tenantId, k.qualificationKey, bundle.id); // an unreadable file throws: retried
  // Saved as a completed job, so the workspace finds these requirements on return, with no second upload. Best-effort: the
  // verdict is still worth having without it.
  try {
    await GovExtractionJob.create({
      tenant_id: k.tenantId, qualification_key: k.qualificationKey, source_bundle_id: bundle.id, sha256: k.sha256,
      status: 'completed', result_json: payload, completed_at: new Date(),
    } as any);
  } catch (err: any) {
    log('gov_ai_vetting_payload_save_failed', 'partial', { key: k.qualificationKey, message: err?.message }, err?.constructor?.name);
  }
  return payload.candidates;
}

/** The opportunity fields worth keeping if the row later leaves the feed. Live feed row first, never the old snapshot. */
async function loadOpportunitySnapshot(k: VettingKey): Promise<Record<string, unknown>> {
  const uuid = k.qualificationKey.replace(/^gws:/, '');
  const { default: GovQualification } = await import('../../models/GovQualification');
  const { resolveGovCloseDate } = await import('./govPipeline');
  const rec: any = await GovQualification.findOne({
    where: { tenant_id: k.tenantId, canonical_opportunity_id: k.qualificationKey, status: 'active' }, order: [['version', 'DESC']],
  });
  const plain = rec?.get ? rec.get() : rec;
  const provenance = plain?.requirements_json?.provenance ?? {};
  const base: Record<string, unknown> = { uuid, title: provenance.title ?? null, agency: provenance.agency ?? null, closeDate: plain ? resolveGovCloseDate(plain) : null };
  try {
    const { fetchBestFitOpportunities } = await import('./opportunities/oppPulseClient');
    const feed = await fetchBestFitOpportunities();
    const row = feed.source === 'live' ? feed.opportunities.find((o) => o.uuid === uuid) : undefined;
    if (row) {
      return {
        uuid, title: row.title, agency: row.agency, closeDate: row.closeDate, fitScore: row.fitScore, priorityScore: row.priorityScore,
        estimatedValue: row.estimatedValue, category: row.category ?? null, sourceUrl: row.sourceUrl,
      };
    }
  } catch (err: any) {
    log('gov_ai_vetting_snapshot_feed_failed', 'partial', { key: k.qualificationKey }, err?.constructor?.name);
  }
  return base;
}

/**
 * The solicitation's own words for a requirement. With AI extraction on, `text` is a plain-language rewrite, and a quote that
 * only matches a rewrite isn't "found in the solicitation". So the model reads these words and its quote is checked against them.
 */
const sourceText = (c: any): string => String((typeof c?.extractedText === 'string' && c.extractedText) || c?.text || '');

async function runChecks(k: VettingKey): Promise<Partial<GovAiVetting>> {
  const candidates = await loadCandidates(k);
  const requirements = candidates
    .map((c: any) => ({ id: String(c?.id ?? ''), text: sourceText(c) }))
    .filter((r: { id: string; text: string }) => r.id && r.text);
  const opportunity = await loadOpportunitySnapshot(k);
  if (requirements.length === 0) throw new TerminalVettingError('no_requirements_extracted', 'No requirements could be read from this ZIP. Please read it yourself.');

  const title = (opportunity.title as string | null) ?? null;
  const buyer = (opportunity.agency as string | null) ?? null;
  // SV2.2: same wrapper as the Fit route, so the saved fit_json, go/no-go and coverage all see identical capabilities
  // (evidence on have, possibleProof on gaps, the flagged unproven-have downgrade).
  const { assessCapabilityFitWithProof } = await import('./govCapabilityFitWithProof');
  const { fit, services } = await assessCapabilityFitWithProof({ tenantId: k.tenantId, requirements, title, buyer });
  if (fit.error) throw new Error(fit.error); // a failed fit is a failure to retry, never 0% coverage

  const { generateGoNoGo } = await import('./govAiGoNoGo');
  const goNoGo = await generateGoNoGo({ requirements, capabilities: fit.capabilities, title, buyer });
  if (goNoGo.error) throw new Error(goNoGo.error);

  // Non-fatal: a verdict is still worth saving without these, and their buttons remain in the workspace.
  const { generateProposalSummary, generateClarificationQuestions } = await import('./govBidNarrative');
  const summary = await generateProposalSummary({ requirements, title, buyer });
  const questions = await generateClarificationQuestions({ requirements, title, buyer });

  const requirementTexts = requirements.map((r: { text: string }) => r.text);
  const decided = decideVerdict({ ai: goNoGo, capabilities: fit.capabilities, catalogSize: services.length, requirementTexts });
  return {
    error_class: null, // an earlier try may have failed: this one finished
    verdict: decided.verdict, reason: decided.reason, reason_quote: decided.quote, coverage_pct: decided.coveragePct,
    fit_json: fit, summary_json: summary.error ? null : summary, questions_json: questions.error ? null : questions, opportunity_json: opportunity,
  };
}

/** Claim, run, save. Never throws: a failure is recorded on the row. Returns whether this call did the run. */
export async function runVetting(k: VettingKey): Promise<boolean> {
  const claim = await claimVetting(k);
  if (!claim) return false;
  const started = Date.now();
  const finish = (fields: Partial<GovAiVetting>) => GovAiVetting.update(
    { ...fields, status: 'completed', completed_at: new Date(), updated_at: new Date() } as any,
    { where: { id: claim.id } },
  );
  try {
    await finish(await runChecks(k));
    log('gov_ai_vetting_completed', 'success', { key: k.qualificationKey, duration_ms: Date.now() - started, attempts: claim.attempts });
  } catch (err: any) {
    const errorClass = err instanceof TerminalVettingError ? err.errorClass : (err?.constructor?.name ?? 'Error');
    log('gov_ai_vetting_failed', 'failure', { key: k.qualificationKey, attempts: claim.attempts, message: err?.message }, errorClass);
    try {
      if (err instanceof TerminalVettingError) {
        await finish({ verdict: 'inconclusive', reason: err.message, error_class: errorClass });
      } else if (claim.attempts >= MAX_ATTEMPTS) {
        await finish({ verdict: 'inconclusive', reason: 'The AI checks could not finish on this ZIP. Please read it yourself.', error_class: errorClass });
      } else {
        await GovAiVetting.update({ status: 'queued', error_class: errorClass, updated_at: new Date() } as any, { where: { id: claim.id } });
      }
    } catch (saveErr: any) {
      // The row stays running, so the stale reclaim and finalizeExhausted recover it.
      log('gov_ai_vetting_save_failed', 'failure', { key: k.qualificationKey, message: saveErr?.message }, saveErr?.constructor?.name);
    }
  }
  return true;
}

/** Called when extraction finishes. Fire-and-forget, flag-gated, gws: only, and its failure can't touch the job. */
export function startGovAiVetting(k: VettingKey): void {
  if (!FLAGS.govAiVetting || !k.qualificationKey.startsWith('gws:')) return;
  runVetting(k).catch((err: any) => log('gov_ai_vetting_start_failed', 'failure', { key: k.qualificationKey, message: err?.message }, err?.constructor?.name));
}

/** The saved result for a workspace visit: the newest ZIP's row, plus what its extraction found. Null before any upload. */
export async function loadAiVettingView(tenantId: string, qualificationKey: string): Promise<Record<string, unknown> | null> {
  const row: any = await GovAiVetting.findOne({
    where: { tenant_id: tenantId, qualification_key: qualificationKey }, order: [['last_uploaded_at', 'DESC']],
  });
  if (!row) return null;
  const { default: GovExtractionJob } = await import('../../models/GovExtractionJob');
  const job: any = await GovExtractionJob.findOne({
    where: { tenant_id: tenantId, qualification_key: qualificationKey, sha256: row.sha256, status: 'completed' },
    order: [['completed_at', 'DESC']],
  });
  const payload = job?.result_json;
  return {
    aiEnabled: FLAGS.govAiVetting, status: row.status, verdict: row.verdict ?? null, reason: row.reason ?? null, quote: row.reason_quote ?? null,
    coveragePct: row.coverage_pct ?? null, errorClass: row.error_class ?? null,
    fit: row.fit_json ?? null, summary: row.summary_json ?? null, questions: row.questions_json ?? null,
    // The feed-sourced opportunity snapshot taken when the ZIP was vetted — it carries the proposal close date +
    // priority that a decoupled (ZIP-uploaded) pursuit never captured on its own source_snapshot. The projection and
    // the pipeline fall back to this so the deadline/days-left auto-populate instead of forcing a manual due date.
    opportunity: row.opportunity_json ?? null,
    extraction: Array.isArray(payload?.candidates) && payload.candidates.length > 0
      ? { candidates: payload.candidates, items: payload.items ?? null, files: payload.files ?? null, extraction: payload.extraction ?? null }
      : null,
  };
}

/** The daily catch-up: finish stuck rows, retry queued and stale ones, then backfill up to BACKFILL_PER_DAY older ZIPs. */
export async function runGovAiVettingCatchup(): Promise<{ skipped?: string; retried: number; backfilled: number }> {
  const nil = { retried: 0, backfilled: 0 };
  if (!FLAGS.govAiVetting) return { ...nil, skipped: 'disabled' };
  const { claimDailySlot } = await import('./opportunities/govDailySlot');
  if (!(await claimDailySlot(CATCHUP_SLOT_KEY))) return { ...nil, skipped: 'already_ran_today' };

  await finalizeExhausted();
  const { sequelize } = await import('../../config/database');
  const pending: any[] = await sequelize.query(
    `SELECT tenant_id, qualification_key, sha256 FROM gov_ai_vettings
      WHERE attempts < :max AND (status = 'queued' OR (status = 'running' AND updated_at < NOW() - make_interval(mins => :stale)))
      ORDER BY last_uploaded_at DESC`,
    { replacements: { max: MAX_ATTEMPTS, stale: STALE_MINUTES }, type: QueryTypes.SELECT });
  let retried = 0;
  for (const p of pending) {
    if (await runVetting({ tenantId: p.tenant_id, qualificationKey: p.qualification_key, sha256: p.sha256 })) retried += 1;
  }
  const backfilled = await backfillOlderZips();
  await finalizeExhausted();
  return { retried, backfilled };
}

/**
 * Which bids the live feed lists now, and which an intern already has (nothing to decide, so no model call). Each read is
 * best-effort: on failure the backfill falls back to its plain order, which only delays a row by a day.
 */
async function backfillPriorities(tenantId: string): Promise<{ inFeed: Set<string>; assigned: Set<string> }> {
  const out = { inFeed: new Set<string>(), assigned: new Set<string>() };
  try {
    const { fetchBestFitOpportunities } = await import('./opportunities/oppPulseClient');
    const feed = await fetchBestFitOpportunities();
    if (feed.source === 'live') out.inFeed = new Set(feed.opportunities.map((o) => o.uuid));
  } catch (err: any) {
    log('gov_ai_vetting_backfill_feed_failed', 'partial', { message: err?.message }, err?.constructor?.name);
  }
  try {
    const { listGovPipeline, assignedOpportunityUuids } = await import('./govPipeline');
    out.assigned = assignedOpportunityUuids(await listGovPipeline(tenantId));
  } catch (err: any) {
    log('gov_ai_vetting_backfill_pipeline_failed', 'partial', { message: err?.message }, err?.constructor?.name);
  }
  return out;
}

async function backfillOlderZips(): Promise<number> {
  const { lookupGovContractsContainer } = await import('../../scripts/lib/factoryDemoContainer');
  const container: any = await lookupGovContractsContainer();
  if (!container) return 0;
  const tenantId = String(container.tenant.id);
  const { default: GovQualification } = await import('../../models/GovQualification');
  const { default: GovSourceBundle } = await import('../../models/GovSourceBundle');
  const { default: GovExtractionJob } = await import('../../models/GovExtractionJob');
  const { resolveGovCloseDate } = await import('./govPipeline');
  const rows: any[] = await GovQualification.findAll({
    where: { tenant_id: tenantId, status: 'active', superseded_by_id: null }, order: [['updated_at', 'DESC']],
  });
  const { inFeed, assigned } = await backfillPriorities(tenantId);
  const uuidOf = (rec: any): string => String(rec.canonical_opportunity_id ?? '').replace(/^gws:/, '');
  const recs = rows.map((row) => (row?.get ? row.get() : row)).filter((rec) => !assigned.has(uuidOf(rec)));
  // Bids on the board first, so the daily cap clears what the morning email shows before older records.
  const ordered = [...recs.filter((rec) => inFeed.has(uuidOf(rec))), ...recs.filter((rec) => !inFeed.has(uuidOf(rec)))];
  const today = new Date().toISOString().slice(0, 10);
  let done = 0;
  for (const rec of ordered) {
    if (done >= BACKFILL_PER_DAY) break;
    const key = String(rec.canonical_opportunity_id ?? '');
    if (!key.startsWith('gws:')) continue;
    const close = resolveGovCloseDate(rec);
    // A passed deadline isn't worth a model call, unless the live feed still lists it: Opportunity Pulse keeps only bids closing
    // 10+ days out, so a saved date that disagrees is the stale one, and skipping it would leave the row in the AI queue forever.
    if (!inFeed.has(uuidOf(rec)) && close && String(close).slice(0, 10) < today) continue;
    const docs: any[] = Array.isArray(rec.requirements_json?.reviewedDocuments) ? rec.requirements_json.reviewedDocuments : [];
    if (!docs.some((d) => d && d.method === 'solicitation_zip' && d.sha256)) continue;
    // The newest UPLOAD, not the attested ZIP, which can be older, and not the newest stored bundle: a re-upload of known
    // bytes reuses its bundle row, but each upload starts a job. A row made for anything older would count as the newest
    // upload and override the real one.
    const job: any = await GovExtractionJob.findOne({ where: { tenant_id: tenantId, qualification_key: key }, order: [['created_at', 'DESC']] });
    const bundle: any = job
      ? await GovSourceBundle.findOne({ where: { tenant_id: tenantId, qualification_key: key, sha256: job.sha256 } })
      : await GovSourceBundle.findOne({ where: { tenant_id: tenantId, qualification_key: key }, order: [['created_at', 'DESC']] });
    if (!bundle) continue;
    const sha256 = String(bundle.sha256);
    if (await GovAiVetting.findOne({ where: { tenant_id: tenantId, qualification_key: key, sha256 } })) continue;
    const k = { tenantId, qualificationKey: key, sha256 };
    await ensureVettingRow(k);
    await runVetting(k);
    done += 1;
  }
  return done;
}
