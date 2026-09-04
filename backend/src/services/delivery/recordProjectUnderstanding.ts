/**
 * recordProjectUnderstanding — the step that makes the flow continue on its own.
 *
 * Up to now the extractor was a library nobody called. A call ended, the transcript landed
 * in the communication log, and there it stopped: the customer's own description of their
 * business sat in a text column that nothing read. This is what runs it.
 *
 * ## Why this cannot be allowed to throw
 *
 * It is invoked from the Synthflow webhook, whose job is to record that a call happened.
 * If extraction fails - the model is down, the key rotated, the response was junk - the
 * call itself still happened and that fact must still be recorded. So every failure here
 * returns a status; nothing propagates. The webhook's contract with the vendor is a 200,
 * and losing the call record because a downstream nicety failed would be a worse bug than
 * the one being reported.
 *
 * ## Why a failure is written down rather than logged and forgotten
 *
 * A lead with no understanding looks identical whether the call was never processed or the
 * extraction failed six times. Storing the failure - with its error class - is the only
 * thing that makes the difference visible, and it is the difference between "the pipeline
 * has not got to them yet" and "the pipeline is dropping people".
 *
 * ## Idempotency
 *
 * A webhook can be delivered twice. A second extraction would cost money again, return a
 * DIFFERENT answer (the model is not deterministic - the same 245-second call has produced
 * 8, 9 and 11 items across runs), and leave two conflicting understandings of one
 * conversation with nothing to say which is authoritative. The check here is the fast path;
 * the unique index on `(source, source_ref)` is the actual guarantee, because a check
 * followed by a write is a race and not a control.
 */

import ProjectUnderstandingRecord from '../../models/ProjectUnderstandingRecord';
import { confidenceProfile } from './projectUnderstanding';
import { extractUnderstanding, type ExtractionSource, type ExtractionFacts } from './projectUnderstandingExtractor';

export type RecordStatus = 'created' | 'deduplicated' | 'failed' | 'skipped';

export interface RecordResult {
  status: RecordStatus;
  id?: string;
  /** Present on `skipped` and `failed`; always says which, never just "no". */
  reason?: string;
  kept?: number;
  rejected?: number;
}

function isUniqueViolation(err: any): boolean {
  return err?.name === 'SequelizeUniqueConstraintError' || err?.parent?.code === '23505';
}

export async function recordUnderstandingFromConversation(params: {
  leadId?: number | null;
  source: ExtractionSource;
  /** call_id, thread id - whatever names this conversation in its own system. */
  sourceRef: string;
  conversation: string;
  facts?: ExtractionFacts;
}): Promise<RecordResult> {
  const sourceRef = (params.sourceRef || '').trim();
  const conversation = (params.conversation || '').trim();

  // Without a reference there is no idempotency key, and an extraction that cannot be
  // deduplicated will be re-run on every redelivery. Refusing is the cheaper mistake.
  if (!sourceRef) return { status: 'skipped', reason: 'no_source_ref' };
  if (!conversation) return { status: 'skipped', reason: 'empty_conversation' };

  try {
    const existing = await ProjectUnderstandingRecord.findOne({
      where: { source: params.source, source_ref: sourceRef },
    });
    if (existing) return { status: 'deduplicated', id: existing.id };
  } catch (err: any) {
    console.warn('[ProjectUnderstanding] dedup lookup failed:', err?.message);
    // Fall through: the unique index still protects us, and refusing to extract because
    // the read failed would drop a real conversation over a transient database blip.
  }

  const result = await extractUnderstanding({
    conversation,
    source: params.source,
    facts: params.facts,
    workflow: 'project-understanding',
  });

  try {
    if (!result.ok) {
      const row = await ProjectUnderstandingRecord.create({
        lead_id: params.leadId ?? null,
        source: params.source,
        source_ref: sourceRef,
        status: 'failed',
        error_class: result.error_class,
        error: result.error,
      } as any);
      return { status: 'failed', id: row.id, reason: result.error_class };
    }

    const { understanding, rejected, cost_usd, runtime_ms } = result;
    const row = await ProjectUnderstandingRecord.create({
      lead_id: params.leadId ?? null,
      source: params.source,
      source_ref: sourceRef,
      status: 'extracted',
      title: understanding.title,
      proposed_surfaces: understanding.proposed_surfaces,
      items: understanding.items,
      rejected,
      confidence: confidenceProfile(understanding),
      cost_usd,
      runtime_ms,
    } as any);

    return {
      status: 'created',
      id: row.id,
      kept: understanding.items.length,
      rejected: rejected.length,
    };
  } catch (err: any) {
    // The other delivery won the race. That is the index doing its job, not an error.
    if (isUniqueViolation(err)) return { status: 'deduplicated', reason: 'concurrent_delivery' };

    console.error('[ProjectUnderstanding] persist failed:', err?.message);
    return { status: 'failed', reason: 'persist_error' };
  }
}
