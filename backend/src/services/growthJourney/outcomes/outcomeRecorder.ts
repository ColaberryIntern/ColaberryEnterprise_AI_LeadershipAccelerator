import { GrowthJourneyOutcome } from '../../../models';
import type {
  GrowthJourneyOutcomeAttributes,
  GrowthJourneyOutcomeSource,
  GrowthJourneyOutcomeType,
} from '../../../models/GrowthJourneyOutcome';
import { isUniqueViolation } from '../../../utils/uniqueViolation';
import { recordJourneyEvent } from '../ledger';
import { findAddressLikeValue } from '../noAddress';

/**
 * The one outcome recorder (§6.1 `growth_journey_outcomes`; §13; Phase 4 T401).
 *
 * T405 (a handoff accepted or dispositioned), T406 (a pipeline stage advanced,
 * a project started) and T409 (the normaliser over the existing records) all
 * write outcomes THROUGH this function, so there is one place that knows the
 * table is append-only and one place that answers a replay.
 *
 * ─── ONE CREATE, AND A REPLAY LANDS ON THE EXISTING ROW ────────────────────
 *
 * `(source, source_ref)` is unique in the DDL. The same source record
 * normalised twice — a nightly sweep re-reading an `interaction_outcomes` row,
 * a disposition route retried — is one `create` that succeeds and one that
 * the index refuses; the refusal is answered by reading the row back
 * (`replayed: true`), never by updating it. There is no update path in this
 * module, and the append-only guard fails any growthJourney file that names
 * this model and carries an update or destroy call - which the guard reads
 * as raw text, comments included, so the two spellings are not written here.
 *
 * ─── NO ADDRESS IN THE METADATA ─────────────────────────────────────────────
 *
 * `metadata` is for ids, counts, stage names and timestamps. The contract's
 * standing check refuses a handoff packet that carries an `@`; the same rule
 * is applied here at the one writer, so a consumer cannot smuggle an address
 * into the outcome index by accident. A string value containing `@` anywhere
 * in the metadata is refused before the create.
 */

export interface RecordOutcomeInput {
  tenant_id: string;
  brand_id: string;
  subject_ref: string;
  lead_id?: number | null;
  outcome_type: GrowthJourneyOutcomeType;
  source: GrowthJourneyOutcomeSource;
  source_ref: string;
  occurred_at: Date;
  handoff_id?: string | null;
  decision_id?: string | null;
  value?: number | string | null;
  metadata?: Record<string, unknown> | null;
}

export interface RecordOutcomeResult {
  row: GrowthJourneyOutcome;
  replayed: boolean;
}

export class OutcomeMetadataRejectedError extends Error {
  readonly error_class = 'ContractViolation';
  constructor(readonly path: string) {
    super(`outcome metadata carries an address-like value at ${path}`);
    this.name = 'OutcomeMetadataRejectedError';
  }
}

/** The rule lives in `../noAddress` (shared with the handoff writer); re-exported so T402's callers and tests keep their import. */
export { findAddressLikeValue };

export async function recordOutcome(input: RecordOutcomeInput): Promise<RecordOutcomeResult> {
  const offending = findAddressLikeValue(input.metadata ?? null, 'metadata');
  if (offending) throw new OutcomeMetadataRejectedError(offending);

  const row: GrowthJourneyOutcomeAttributes = {
    tenant_id: input.tenant_id,
    brand_id: input.brand_id,
    subject_ref: input.subject_ref,
    lead_id: input.lead_id ?? null,
    handoff_id: input.handoff_id ?? null,
    decision_id: input.decision_id ?? null,
    outcome_type: input.outcome_type,
    source: input.source,
    source_ref: input.source_ref,
    occurred_at: input.occurred_at,
    value: input.value ?? null,
    metadata: input.metadata ?? null,
  };

  try {
    const created = await GrowthJourneyOutcome.create(row);
    // T410: one ledger row per outcome indexed (a replay is not a write); the metadata stays on the row.
    await recordJourneyEvent('growth_journey.outcome.recorded', 'growth_journey_outcome', created.id, { tenant_id: row.tenant_id, brand_id: row.brand_id }, {
      subject_ref: row.subject_ref, lead_id: row.lead_id, handoff_id: row.handoff_id, decision_id: row.decision_id,
      outcome_type: row.outcome_type, source: row.source, source_ref: row.source_ref, occurred_at: row.occurred_at,
    });
    return { row: created, replayed: false };
  } catch (err: unknown) {
    if (!isUniqueViolation(err)) throw err;
    const existing = await GrowthJourneyOutcome.findOne({
      where: { source: input.source, source_ref: input.source_ref },
    });
    if (!existing) throw err;
    return { row: existing, replayed: true };
  }
}
