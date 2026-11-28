/**
 * The daily pass that refreshes every Explorer contact's journey card (T208).
 *
 * Runs before 06:37 Central because that is when the Explorer call queue is
 * built and Rose and Taiwo read the card before dialing (Kes, 2026-11-25).
 *
 * THE CANARY IS THE POINT OF THIS FILE. A GHL write to a field that does not
 * exist in the destination sub-account returns HTTP 200 and stores nothing. A
 * pass that reported "952 written" on the strength of 952 such responses would
 * be worse than a pass that failed, because it would look like the feature was
 * working. So the FIRST successful write of every run is read back, and the run
 * aborts if the value is not there. One extra API call per run buys the right to
 * believe the other 951.
 *
 * IDEMPOTENCY: the same input produces the same card, and a card is a whole
 * replacement rather than an append, so running this twice leaves the same end
 * state. It is not deduplicated against the stored value because the card
 * carries its own "As of <date>" line and therefore changes daily anyway; a
 * read-before-write would double the API calls to save nothing.
 */
import { randomUUID } from 'crypto';
import { composeJourneySummary } from './journeySummaryComposer';
import { loadJourneyTargets } from './journeySummaryData';
import { verifyWriteLanded, resolveWriteTarget, writeJourneySummary } from './journeySummaryWriter';

export interface SyncOptions {
  /** Compose everything, write nothing. */
  dryRun?: boolean;
  /** Stop after this many contacts. Omit for the whole pool. */
  limit?: number;
  now?: Date;
}

export interface SyncResult {
  correlationId: string;
  considered: number;
  written: number;
  /** Composed to nothing: no interest, no history, no signals, no next step. */
  emptyCards: number;
  skippedNoRoute: number;
  skippedNoField: number;
  failed: number;
  /** Set when the run stopped early because the canary did not land. */
  abortedReason: string | null;
  durationMs: number;
}

function log(event: string, correlationId: string, outcome: string, context: Record<string, unknown>) {
  // Structured, stdout, no PII: lead ids and counts only, never emails, names or
  // card bodies, and never a key.
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'explorer-journey-summary',
    event,
    correlation_id: correlationId,
    outcome,
    context,
  }));
}

export async function runJourneySummarySync(options: SyncOptions = {}): Promise<SyncResult> {
  const correlationId = randomUUID();
  const startedAt = Date.now();
  const now = options.now ?? new Date();
  const dryRun = options.dryRun === true;

  const result: SyncResult = {
    correlationId,
    considered: 0,
    written: 0,
    emptyCards: 0,
    skippedNoRoute: 0,
    skippedNoField: 0,
    failed: 0,
    abortedReason: null,
    durationMs: 0,
  };

  const all = await loadJourneyTargets(now);
  const targets = options.limit ? all.slice(0, options.limit) : all;
  log('sync_started', correlationId, 'success', {
    pool: all.length, considered: targets.length, dry_run: dryRun,
  });

  let canaryDone = false;

  for (const target of targets) {
    result.considered += 1;
    const { text } = composeJourneySummary(target.input);

    if (!text) {
      result.emptyCards += 1;
      continue;
    }
    if (dryRun) continue;

    const outcome = await writeJourneySummary(target.ghlContactId, target.leadSource, text);

    if (outcome.status === 'skipped') {
      if (outcome.reason === 'no_route') result.skippedNoRoute += 1;
      else if (outcome.reason === 'no_field') result.skippedNoField += 1;
      else result.emptyCards += 1;
      continue;
    }

    if (outcome.status === 'failed') {
      result.failed += 1;
      log('write_failed', correlationId, 'failure', {
        lead_id: target.leadId, error_class: outcome.errorClass, detail: outcome.detail,
      });
      continue;
    }

    result.written += 1;

    // The canary: prove the very first write of this run actually persisted.
    if (!canaryDone) {
      canaryDone = true;
      const resolved = await resolveWriteTarget(target.leadSource);
      const landed = 'skip' in resolved
        ? false
        : await verifyWriteLanded(target.ghlContactId, resolved.field, text, resolved.apiKey);

      if (!landed) {
        result.abortedReason = 'canary_write_did_not_persist';
        log('sync_aborted', correlationId, 'failure', {
          lead_id: target.leadId,
          reason: 'the first write returned success but the value was not stored; '
            + 'the field is probably missing from this sub-account',
        });
        break;
      }
      log('canary_verified', correlationId, 'success', { lead_id: target.leadId });
    }
  }

  result.durationMs = Date.now() - startedAt;
  log('sync_finished', correlationId, result.abortedReason ? 'partial' : 'success', {
    considered: result.considered,
    written: result.written,
    empty_cards: result.emptyCards,
    skipped_no_route: result.skippedNoRoute,
    skipped_no_field: result.skippedNoField,
    failed: result.failed,
    aborted_reason: result.abortedReason,
    duration_ms: result.durationMs,
  });
  return result;
}
