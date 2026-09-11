import { ContentItem, ContentVariant, ContentItemMedia, MediaAsset, ExternalPublication, PlatformDeliveryEvent, PublishingJob } from '../../models';
import type { ContentItemStatus } from '../../models/ContentItem';
import { isKillSwitchActive } from '../launchSafety';
import { transition } from '../content/contentWorkflow';
import { isProviderKey, makeAdapterFactory, transportFromEnv, type AdapterFactory } from './adapterRegistry';
import { dueJobsWhere, nextRetryDelayMs, shouldDeadLetter, type PublishingJobState } from './publishingQueueQuery';
import { ProviderPublishError, type PublishPayload, type PublishReceipt, type SocialProviderAdapter } from './socialProviderAdapter';

/**
 * publishingWorker — takes due jobs off the queue, hands each to an adapter, records what
 * came back. Spec section 9's publishing requirements, in one place.
 *
 * THE KILL SWITCH IS CHECKED TWICE. Once before anything is claimed, and again immediately
 * before each external action. A batch that started under a green switch can outlive the
 * moment somebody flips it, and the second check is what makes "pause globally" mean now
 * rather than "after this batch". When it trips mid-batch the current job's claim is
 * released - back to the state it was found in, attempts untouched - so a pause is free.
 * It routes through `launchSafety.isKillSwitchActive()` because that is the one switch the
 * operations team already knows how to throw. Note that function fails OPEN (a settings read
 * error reads as "not active"); that is its contract for every agent in the repo and is not
 * changed here, but it is a stated limitation of this worker rather than a hidden one.
 *
 * FAILURES ARE CLASSIFIED BEFORE THEY ARE RETRIED. `ProviderPublishError.permanent` (or a
 * permanent validation result) goes straight to the dead-letter state with its reason - a
 * validation or permission failure will fail identically on every retry and burning attempts
 * on it only delays the human who has to fix it. Everything else backs off exponentially with
 * jitter (T005's `nextRetryDelayMs`) until `max_attempts`, then dead-letters.
 *
 * DUPLICATES ARE PREVENTED AT THREE LAYERS: the claim is an optimistic conditional update
 * (a second worker finds zero rows); the adapter is given the job's idempotency key; and the
 * publication row is `findOrCreate` on (provider, external_id), the unique index T005 put
 * there for exactly the ambiguous-timeout case.
 */

/** Statuses from which a job may publish. Anything else means the item moved on without its jobs. */
const PUBLISHABLE_STATUSES: readonly ContentItemStatus[] = ['scheduled', 'publishing', 'partially_published', 'publish_failed'];

export interface WorkerDeps {
  now: () => Date;
  killSwitch: () => Promise<boolean>;
  adapterFor: AdapterFactory;
  workerId: string;
  batchSize: number;
  random: () => number;
}

export interface WorkerRunResult {
  halted: boolean;
  haltReason: string | null;
  claimed: number;
  published: number;
  failed: number;
  retried: number;
  deadLettered: number;
  skipped: number;
}

export function defaultWorkerDeps(overrides: Partial<WorkerDeps> = {}): WorkerDeps {
  return {
    now: () => new Date(),
    killSwitch: isKillSwitchActive,
    adapterFor: makeAdapterFactory(transportFromEnv()),
    workerId: `publishing-${process.pid}`,
    batchSize: 25,
    random: Math.random,
    ...overrides,
  };
}

function log(level: 'info' | 'warn' | 'error', event: string, context: Record<string, unknown>, correlationId: string | null = null): void {
  const line = { timestamp: new Date().toISOString(), level, service: 'publishing-worker', event, correlation_id: correlationId, context };
  (level === 'error' ? console.error : console.log)(JSON.stringify(line));
}

async function recordEvent(job: PublishingJob, direction: 'request' | 'response' | 'internal', eventType: string, fields: {
  httpStatus?: number | null; providerCode?: string | null; message?: string | null; payload?: Record<string, unknown>;
}, now: Date): Promise<void> {
  await PlatformDeliveryEvent.create({
    publishing_job_id: job.id,
    provider: job.provider,
    direction,
    event_type: eventType,
    http_status: fields.httpStatus ?? null,
    provider_code: fields.providerCode ?? null,
    message: fields.message ? fields.message.slice(0, 1000) : null,
    payload_redacted: fields.payload ?? {},
    correlation_id: job.id,
    occurred_at: now,
  } as any);
}

async function buildPayload(job: PublishingJob, item: ContentItem, variant: ContentVariant | null): Promise<PublishPayload> {
  const media = await ContentItemMedia.findAll({ where: { content_item_id: item.id }, order: [['position', 'ASC']] });
  const refs: string[] = [];
  for (const m of media) {
    const asset = await MediaAsset.findByPk(m.media_asset_id);
    refs.push(asset?.storage_key ?? m.media_asset_id);
  }
  return {
    jobId: job.id,
    provider: job.provider as PublishPayload['provider'],
    contentItemId: item.id,
    variantId: variant?.id ?? null,
    accountId: job.channel_account_id ?? null,
    text: variant?.body ?? item.canonical_body ?? '',
    mediaRefs: refs,
    linkUrl: variant?.link_url ?? null,
    disclosureText: variant?.disclosure_text ?? null,
    scheduledFor: new Date(job.publish_at).toISOString(),
    contentRevision: job.content_revision,
  };
}

async function permanentFailure(job: PublishingJob, message: string, errorClass: string, now: Date): Promise<void> {
  await job.update({
    state: 'failed' as PublishingJobState,
    attempts: job.attempts + 1,
    last_error: message.slice(0, 2000),
    last_error_class: errorClass,
    dead_lettered_at: now,
    dead_letter_reason: `permanent: ${errorClass}`.slice(0, 200),
    claimed_by: null,
  });
  await recordEvent(job, 'internal', 'publish_failed_permanent', { message, providerCode: errorClass }, now);
}

async function transientFailure(job: PublishingJob, message: string, errorClass: string, now: Date, random: () => number): Promise<'retried' | 'deadLettered'> {
  const attempts = job.attempts + 1;
  if (shouldDeadLetter({ attempts, max_attempts: job.max_attempts })) {
    await job.update({
      state: 'dead_lettered' as PublishingJobState, attempts, last_error: message.slice(0, 2000), last_error_class: errorClass,
      dead_lettered_at: now, dead_letter_reason: `exhausted ${attempts} attempts: ${errorClass}`.slice(0, 200), claimed_by: null,
    });
    await recordEvent(job, 'internal', 'publish_dead_lettered', { message, providerCode: errorClass }, now);
    return 'deadLettered';
  }
  const delay = nextRetryDelayMs(attempts, random);
  await job.update({
    state: 'retrying' as PublishingJobState, attempts, last_error: message.slice(0, 2000), last_error_class: errorClass,
    next_retry_at: new Date(now.getTime() + delay), claimed_by: null,
  });
  await recordEvent(job, 'internal', 'publish_retry_scheduled', { message, providerCode: errorClass, payload: { delay_ms: delay, attempt: attempts } }, now);
  return 'retried';
}

/** After a job settles, derive the item's status from ALL its jobs for this occurrence. */
export async function reconcileItemStatus(itemId: string, occurrence: string, now: Date): Promise<ContentItemStatus | null> {
  const item = await ContentItem.findByPk(itemId);
  if (!item) return null;
  const jobs = await PublishingJob.findAll({ where: { content_item_id: itemId, scheduled_occurrence: occurrence } });
  if (jobs.length === 0) return item.status;
  const states = jobs.map((j) => j.state as PublishingJobState);
  const done = (s: PublishingJobState) => s === 'published' || s === 'failed' || s === 'dead_lettered' || s === 'cancelled';
  if (!states.every(done)) return item.status; // still in flight
  // A handoff receipt is a job done and a post NOT yet live. The item stays `publishing`
  // until a person completes the handoff (publishingReceiptService re-runs this).
  const pendingHandoffs = await ExternalPublication.count({ where: { content_item_id: itemId, current_status: 'handoff_pending' } });
  if (pendingHandoffs > 0) return item.status;
  const published = states.filter((s) => s === 'published').length;
  const target: ContentItemStatus = published === states.length ? 'published' : published === 0 ? 'publish_failed' : 'partially_published';
  if (item.status === target) return target;
  const r = transition(item.status, target);
  if (!r.ok) {
    log('warn', 'reconcile_illegal_transition', { from: item.status, to: target, reason: r.reason }, itemId);
    return item.status;
  }
  await item.update(target === 'published' ? { status: target, published_at: now } : { status: target });
  return target;
}

async function releaseClaim(job: PublishingJob, previous: PublishingJobState): Promise<void> {
  await job.update({ state: previous, claimed_by: null, claimed_at: null });
}

async function publishOne(job: PublishingJob, adapter: SocialProviderAdapter, deps: WorkerDeps): Promise<'published' | 'failed' | 'retried' | 'deadLettered'> {
  const now = deps.now();
  const item = await ContentItem.findByPk(job.content_item_id);
  if (!item) {
    await permanentFailure(job, 'Content item no longer exists.', 'MissingContent', now);
    return 'failed';
  }
  // Two guards before anything leaves. recordEdit cancels queued jobs when approved copy is
  // edited, so these should never fire - which is exactly why they exist: the worker is the
  // last line before an external action, and it does not trust the path that led here.
  if (job.content_revision !== (item.revision ?? 1)) {
    await permanentFailure(job, `Content changed since this job was queued (revision ${job.content_revision} -> ${item.revision}). Re-schedule the current revision.`, 'StaleRevision', now);
    return 'failed';
  }
  if (!PUBLISHABLE_STATUSES.includes(item.status)) {
    await permanentFailure(job, `Item is ${item.status}, not publishable.`, 'ItemNotPublishable', now);
    return 'failed';
  }

  const variant = job.content_variant_id ? await ContentVariant.findByPk(job.content_variant_id) : null;

  if (item.status === 'scheduled' || item.status === 'partially_published' || item.status === 'publish_failed') {
    const r = transition(item.status, 'publishing');
    if (r.ok) await item.update({ status: 'publishing' });
  }
  await job.update({ state: 'publishing' as PublishingJobState });

  const payload = await buildPayload(job, item, variant);
  await recordEvent(job, 'request', 'publish_attempt', { payload: { attempt: job.attempts + 1, text_chars: payload.text.length, media_count: payload.mediaRefs.length, has_link: payload.linkUrl !== null } }, now);

  const verdict = await adapter.validate(payload);
  if (!verdict.ok) {
    const message = verdict.reasons.join(' ');
    if (verdict.permanent) { await permanentFailure(job, message, 'ProviderValidationError', now); return 'failed'; }
    return transientFailure(job, message, 'ProviderValidationError', now, deps.random);
  }

  let receipt: PublishReceipt;
  try {
    receipt = await adapter.publish(payload, job.idempotency_key);
  } catch (err) {
    const e = err as Error & { permanent?: boolean; providerCode?: string | null; httpStatus?: number | null };
    const errorClass = err instanceof ProviderPublishError ? (e.providerCode ?? e.name) : (e?.name ?? 'Error');
    await recordEvent(job, 'response', 'publish_error', { httpStatus: e?.httpStatus ?? null, providerCode: e?.providerCode ?? null, message: String(e?.message ?? err) }, now);
    if (err instanceof ProviderPublishError && err.permanent) { await permanentFailure(job, err.message, errorClass, now); return 'failed'; }
    return transientFailure(job, String(e?.message ?? err), errorClass, now, deps.random);
  }

  // The reconciliation guard: (provider, external_id) is unique. A retry after an ambiguous
  // timeout that DID land finds the existing row instead of creating a second post record.
  const [publication, created] = await ExternalPublication.findOrCreate({
    where: { provider: job.provider, external_id: receipt.externalId },
    defaults: {
      publishing_job_id: job.id,
      tenant_id: job.tenant_id,
      brand_id: job.brand_id,
      content_item_id: job.content_item_id,
      provider: job.provider,
      external_id: receipt.externalId,
      permalink: receipt.permalink,
      published_at: receipt.mode === 'handoff' ? null : new Date(receipt.publishedAt),
      current_status: receipt.mode === 'handoff' ? 'handoff_pending' : 'live',
      metadata: { mode: receipt.mode, ...receipt.requestMetadata },
    } as any,
  });
  await recordEvent(job, 'response', created ? 'publish_recorded' : 'publish_reconciled_existing', {
    httpStatus: receipt.httpStatus, providerCode: receipt.providerCode,
    payload: { external_id: receipt.externalId, mode: receipt.mode, publication_id: publication.id },
  }, now);
  await job.update({ state: 'published' as PublishingJobState, claimed_by: null });
  return 'published';
}

export async function runDueJobs(overrides: Partial<WorkerDeps> = {}): Promise<WorkerRunResult> {
  const deps = defaultWorkerDeps(overrides);
  const result: WorkerRunResult = { halted: false, haltReason: null, claimed: 0, published: 0, failed: 0, retried: 0, deadLettered: 0, skipped: 0 };

  if (await deps.killSwitch()) {
    result.halted = true;
    result.haltReason = 'kill_switch_active';
    log('warn', 'publishing_halted', { reason: result.haltReason, stage: 'before_claim' });
    return result;
  }

  const now = deps.now();
  const due = await PublishingJob.findAll({ where: dueJobsWhere(now), order: [['publish_at', 'ASC']], limit: deps.batchSize });

  for (const job of due) {
    const previous = job.state as PublishingJobState;
    const [claimedRows] = await PublishingJob.update(
      { state: 'claimed', claimed_by: deps.workerId, claimed_at: now },
      { where: { id: job.id, state: previous } },
    );
    if (claimedRows === 0) { result.skipped += 1; continue; } // another worker got it
    result.claimed += 1;
    job.set({ state: 'claimed', claimed_by: deps.workerId, claimed_at: now });

    // Second check, right before the external action. A pause must mean now.
    if (await deps.killSwitch()) {
      await releaseClaim(job, previous);
      result.claimed -= 1;
      result.skipped += 1;
      result.halted = true;
      result.haltReason = 'kill_switch_active';
      log('warn', 'publishing_halted', { reason: result.haltReason, stage: 'before_publish', released_job: job.id }, job.id);
      break;
    }

    if (!isProviderKey(job.provider)) {
      await permanentFailure(job, `Unknown provider "${job.provider}".`, 'UnknownProvider', now);
      result.failed += 1;
      await reconcileItemStatus(job.content_item_id, job.scheduled_occurrence, now);
      continue;
    }

    let adapter: SocialProviderAdapter;
    try {
      adapter = deps.adapterFor(job.provider);
    } catch (err) {
      const e = err as ProviderPublishError;
      await permanentFailure(job, e.message, e.providerCode ?? e.name, now);
      result.failed += 1;
      await reconcileItemStatus(job.content_item_id, job.scheduled_occurrence, now);
      continue;
    }

    const outcome = await publishOne(job, adapter, deps);
    result[outcome] += 1;
    log(outcome === 'published' ? 'info' : 'warn', `job_${outcome}`, { provider: job.provider, item: job.content_item_id, attempts: job.attempts }, job.id);
    await reconcileItemStatus(job.content_item_id, job.scheduled_occurrence, deps.now());
  }

  return result;
}
