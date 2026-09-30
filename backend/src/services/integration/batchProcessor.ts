/**
 * Batch processor — STORY-004.
 *
 * Was blocked on 2026-07-10 (see the STORY-004 decision record): full
 * batch-sync execution needed STORY-002 (push/write-back) and STORY-003
 * (real-time sync) to exist first, and this repo had no live codebase to
 * attach it to yet. Both now exist and are merged, so this builds the real
 * thing.
 *
 * Design note (the ticket's own "or similar" latitude, same as STORY-001's
 * native-fetch and STORY-003's EventEmitter substitutions): the ticket
 * suggests "a job queue library like Bull or Agenda." Those need a
 * persistent broker (Redis/MongoDB) for cross-restart durability and
 * horizontal scaling -- real requirements for a production job queue, but
 * not for this demo. `ioredis` exists in this repo's dependencies, but it's
 * already scoped to an unrelated subsystem (the distributed AI
 * systemStateEngine's cognitive bus) -- reusing it here would be
 * inappropriate coupling, not code reuse. There's also no existing
 * Bull/Agenda pattern anywhere in this codebase; the established pattern
 * for batch/background work here is a plain in-process async loop
 * (optionally cron-triggered), which is what this is.
 *
 * This is a thin wrapper, not a reimplementation: each batch is handed to
 * runLegacyErpPushAgent() (STORY-002), which already does the ABAC
 * approval-gate, per-item audit logging, and per-item compensating
 * rollback. "Batch rollback" (the ticket's build step 6) is therefore
 * already covered per-item; this layer adds what STORY-002 doesn't have --
 * chunking a large volume into paced batches, and one audit log entry per
 * batch summarizing that chunk's outcome.
 */
import { env } from '../../config/env';
import AuditLog from '../../models/AuditLog';
import { runLegacyErpPushAgent } from './legacyErpIntegrationAgent';
import type { AgentExecutionResult } from '../agents/types';
import type { ErpUpdateRequest } from './types';

export interface BatchProcessResult extends AgentExecutionResult {
  batches_processed: number;
  batch_size: number;
}

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

async function writeBatchAuditLog(
  batchNumber: number,
  totalBatches: number,
  batchSize: number,
  result: AgentExecutionResult,
): Promise<void> {
  await AuditLog.create({
    action: 'erp_batch_processed',
    entity_type: 'legacy_erp_module',
    entity_id: null,
    admin_user_id: null,
    ip_address: null,
    old_values: null,
    new_values: {
      batch_number: batchNumber,
      total_batches: totalBatches,
      batch_size: batchSize,
      entities_processed: result.entities_processed ?? 0,
      error_count: result.errors.length,
      outcome: result.errors.length === 0 ? 'success' : 'partial_failure',
    },
  });
}

export interface BatchProcessOptions {
  batchSize?: number;
  betweenBatchDelayMs?: number;
}

/**
 * Process a large volume of updates in paced batches. A failure within one
 * batch does not abort the remaining batches -- large-volume sync jobs
 * should report what succeeded/failed rather than halt entirely on the
 * first bad record (each item's own rollback is handled by pushUpdate()).
 */
export async function runLegacyErpBatchAgent(
  updates: ErpUpdateRequest[],
  options: BatchProcessOptions = {},
): Promise<BatchProcessResult> {
  const startTime = Date.now();
  const batchSize = options.batchSize ?? env.vaErpBatchSize;
  const delayMs = options.betweenBatchDelayMs ?? env.vaErpBatchDelayMs;
  const batches = chunk(updates, batchSize);

  const actions: AgentExecutionResult['actions_taken'] = [];
  const errors: string[] = [];
  let entitiesProcessed = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const result = await runLegacyErpPushAgent(batch);

    actions.push(...result.actions_taken);
    errors.push(...result.errors);
    entitiesProcessed += result.entities_processed ?? 0;

    await writeBatchAuditLog(i + 1, batches.length, batch.length, result);

    if (i < batches.length - 1 && delayMs > 0) {
      await new Promise<void>(resolve => setTimeout(resolve, delayMs));
    }
  }

  return {
    agent_name: 'LegacyErpIntegrationAgent',
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - startTime,
    entities_processed: entitiesProcessed,
    batches_processed: batches.length,
    batch_size: batchSize,
  };
}
