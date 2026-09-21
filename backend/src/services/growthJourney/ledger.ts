import { classifyError } from '../../utils/errorClassifier';
import { redactForLogs } from '../../utils/piiRedaction';
import { logEvent } from '../ledgerService';

/**
 * The Growth Journey ledger adapter (Phase 4 T410): every journey event is one
 * `event_ledger` row with its tenant and brand, and a ledger failure never
 * fails the domain write it follows.
 *
 * ─── ONE DOOR, TWO RULES ────────────────────────────────────────────────────
 *
 * 1. The payload is ids, counts and vocabulary literals. A string that carries
 *    an address anyway (the shared `@` rule the writers refuse on) goes through
 *    `redactForLogs` on the way out and is reported by path, value by value -
 *    a Date stays a Date, a number a number, and an id is left alone (the
 *    redactor's phone pattern would otherwise eat the digits of a UUID) -
 *    because the ledger is read by people and an address that slipped into a
 *    reason would otherwise sit there for good.
 * 2. The write is best-effort by contract. The row the caller just created is
 *    the source of truth; the ledger describes it. So a ledger that is down
 *    is one warning line (through the redactor, with the error class) and a
 *    `{ recorded: false }` answer, never a throw - a classification, a
 *    decision, a handoff move, an outcome all land whether or not the ledger
 *    took the note. Callers that must know pass the answer on; none blocks.
 *
 * A replay is not a write: the hooked services call this only when the row
 * was created, so the same domain event replayed is not two ledger rows.
 *
 * Event names: `growth_journey.<entity>.<what>` - classification recorded |
 * overridden | review_requested, transition recorded, decision recorded,
 * handoff created | assigned | accepted | dispositioned | returned_to_ai |
 * released | expired, integration <writer> | refused, outcome recorded.
 */

export type JourneyEntityType =
  | 'growth_journey_classification'
  | 'growth_journey_transition'
  | 'growth_journey_decision'
  | 'growth_journey_handoff'
  | 'growth_journey_outcome'
  | 'growth_journey_execution';

export interface JourneyScope {
  tenant_id: string;
  brand_id: string;
}

export type JourneyLedgerResult = { recorded: true } | { recorded: false; error_class: string };

export const JOURNEY_ACTOR = 'growth_journey';

/** An address-like string (the writers' `@` rule) through the redactor, its path collected; everything else untouched. */
export function redactPayload(value: unknown, path = 'payload', hits: string[] = []): unknown {
  if (typeof value === 'string') {
    if (!value.includes('@')) return value;
    hits.push(path);
    return redactForLogs(value);
  }
  if (Array.isArray(value)) return value.map((v, i) => redactPayload(v, `${path}[${i}]`, hits));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redactPayload(v, `${path}.${k}`, hits)]));
  }
  return value;
}

export async function recordJourneyEvent(
  type: string,
  entity: JourneyEntityType,
  entityId: string,
  scope: JourneyScope,
  payload: Record<string, unknown>,
  actor: string = JOURNEY_ACTOR,
): Promise<JourneyLedgerResult> {
  const hits: string[] = [];
  const safe = redactPayload(payload, 'payload', hits);
  if (hits.length > 0) {
    console.warn(redactForLogs(JSON.stringify({ service: 'growth-journey', level: 'warn', outcome: 'partial', event: 'growth_journey.ledger.payload_redacted', event_type: type, entity_type: entity, entity_id: entityId, paths: hits })));
  }
  try {
    await logEvent(type, actor, entity, entityId, safe, { tenant_id: scope.tenant_id, brand_id: scope.brand_id });
    return { recorded: true };
  } catch (err: unknown) {
    const error_class = classifyError(err);
    console.warn(redactForLogs(JSON.stringify({
      service: 'growth-journey', level: 'warn', outcome: 'failure', event: 'growth_journey.ledger.write_failed',
      event_type: type, entity_type: entity, entity_id: entityId, tenant_id: scope.tenant_id, brand_id: scope.brand_id, error_class,
    })));
    return { recorded: false, error_class };
  }
}
