import { ExternalPublication, PlatformDeliveryEvent, PublishingJob } from '../../models';
import type { Actor } from '../content/contentWorkflowService';
import { WorkflowError } from '../content/contentWorkflowService';
import type { PublishingJobState } from './publishingQueueQuery';
import { reconcileItemStatus } from './publishingWorker';

/**
 * publishingReceiptService — what a person does to the queue and its receipts.
 *
 *   completeHandoff  - a handoff publication becomes LIVE when the operator pastes the real
 *                      post URL back. The placeholder external id is replaced by the real
 *                      one; the placeholder was never a claim that anything was posted.
 *   retryJob         - manual retry from the dead-letter queue: back to 'pending', attempts
 *                      preserved so the history is honest, dead-letter fields cleared.
 *   cancelJob        - manual cancel: terminal, with who and why in the event trail.
 *
 * All three write a platform_delivery_events row with direction 'internal', because a
 * human touching the queue is an event the timeline has to show alongside the machine's.
 */

async function internalEvent(job: PublishingJob | null, provider: string, eventType: string, message: string, payload: Record<string, unknown>): Promise<void> {
  await PlatformDeliveryEvent.create({
    publishing_job_id: job?.id ?? null,
    provider,
    direction: 'internal',
    event_type: eventType,
    http_status: null,
    provider_code: null,
    message: message.slice(0, 1000),
    payload_redacted: payload,
    correlation_id: job?.id ?? null,
    occurred_at: new Date(),
  } as any);
}

export async function completeHandoff(
  publicationId: string,
  input: { externalId: string; permalink: string | null },
  actor: Actor,
): Promise<ExternalPublication> {
  const pub = await ExternalPublication.findByPk(publicationId);
  if (!pub) throw new WorkflowError('Publication not found', 404, 'NotFound');
  if (pub.current_status !== 'handoff_pending') {
    throw new WorkflowError(`This publication is ${pub.current_status}, not awaiting a handoff.`, 409, 'NotHandoffPending');
  }
  const externalId = input.externalId.trim();
  if (externalId === '' || externalId.startsWith('handoff:')) {
    throw new WorkflowError('Provide the provider\'s own post id or URL, not the placeholder.', 400, 'ValidationError');
  }
  // The (provider, external_id) unique index makes a second completion with the same real id
  // a conflict rather than a duplicate record.
  const clash = await ExternalPublication.findOne({ where: { provider: pub.provider, external_id: externalId } });
  if (clash && clash.id !== pub.id) {
    throw new WorkflowError('That post id is already recorded against another publication.', 409, 'DuplicateExternalId');
  }
  const now = new Date();
  await pub.update({
    external_id: externalId,
    permalink: input.permalink,
    published_at: now,
    current_status: 'live',
    last_checked_at: now,
    metadata: { ...(pub.metadata ?? {}), handoff_completed_by: actor.email ?? actor.adminId ?? null, handoff_completed_at: now.toISOString(), placeholder_external_id: pub.external_id },
  });
  const job = pub.publishing_job_id ? await PublishingJob.findByPk(pub.publishing_job_id) : null;
  await internalEvent(job, pub.provider, 'handoff_completed', `Handoff completed by ${actor.email ?? 'unknown'}.`, { publication_id: pub.id, external_id: externalId });
  // The post is live now; let the item follow (published, or partially_published if a
  // sibling failed).
  if (job && pub.content_item_id) await reconcileItemStatus(pub.content_item_id, job.scheduled_occurrence, now);
  return pub;
}

export async function retryJob(jobId: string, actor: Actor): Promise<PublishingJob> {
  const job = await PublishingJob.findByPk(jobId);
  if (!job) throw new WorkflowError('Job not found', 404, 'NotFound');
  const state = job.state as PublishingJobState;
  if (state !== 'dead_lettered' && state !== 'failed') {
    throw new WorkflowError(`Only failed or dead-lettered jobs can be retried; this one is ${state}.`, 409, 'NotRetryable');
  }
  await job.update({
    state: 'pending' as PublishingJobState,
    next_retry_at: null,
    dead_lettered_at: null,
    dead_letter_reason: null,
    // One more attempt than before, so a job retried by hand cannot dead-letter on the
    // very next failure and look like the retry did nothing.
    max_attempts: Math.max(job.max_attempts, job.attempts + 1),
    claimed_by: null,
    claimed_at: null,
  });
  await internalEvent(job, job.provider, 'manual_retry', `Retried by ${actor.email ?? 'unknown'}.`, { attempts_so_far: job.attempts });
  return job;
}

export async function cancelJob(jobId: string, actor: Actor, reason: string | null): Promise<PublishingJob> {
  const job = await PublishingJob.findByPk(jobId);
  if (!job) throw new WorkflowError('Job not found', 404, 'NotFound');
  const state = job.state as PublishingJobState;
  if (state === 'published' || state === 'cancelled') {
    throw new WorkflowError(`A ${state} job cannot be cancelled.`, 409, 'NotCancellable');
  }
  await job.update({ state: 'cancelled' as PublishingJobState, claimed_by: null, claimed_at: null, next_retry_at: null });
  await internalEvent(job, job.provider, 'manual_cancel', `Cancelled by ${actor.email ?? 'unknown'}${reason ? `: ${reason}` : ''}.`, { previous_state: state });
  return job;
}
