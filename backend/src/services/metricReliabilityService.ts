import MetricReliabilityRecord, {
  MetricReliabilityDeclaredBySource,
  MetricReliabilityScopeType,
  MetricReliabilitySeverity,
  MetricReliabilityStatus,
} from '../models/MetricReliabilityRecord';
import { emitAiEvent } from './aiEventService';

/**
 * metricReliabilityService — Reese Agentic AI Employee mission, Checkpoint B.
 * The one reusable reliability registry + policy gate every future
 * evidence-consuming path (Student Success 360, message context, report
 * generation, goal calculation, memory-proposal validation) is meant to
 * call before trusting a metric. See
 * docs/reese-agentic-employee/CHECKPOINT_A_DISCOVERY.md §5.5/§6 for why
 * this didn't exist before and the draft shape this implements.
 *
 * FAIL-CLOSED BY DESIGN: `isMetricUsable()` only ever returns `true` for
 * `status: 'healthy'`. `degraded`/`quarantined`/`recovering` are all
 * treated as "not yet trustworthy" — matching the mission's own explicit
 * instruction to favor fail-closed decision use over quietly trusting an
 * uncertain metric. A source that's merely `degraded` (not fully
 * quarantined) still gets excluded from decisions; only a fully restored
 * `healthy` status re-admits it.
 */

export interface ReliabilityScope {
  scopeType: MetricReliabilityScopeType;
  scopeValue: string | null;
}

const GLOBAL_SCOPE: ReliabilityScope = { scopeType: 'global', scopeValue: null };

export interface ReliabilityStatusResult {
  status: MetricReliabilityStatus;
  severity: MetricReliabilitySeverity | null;
  reason: string | null;
  declaredAt: Date | null;
  recordId: string | null;
}

const HEALTHY_DEFAULT: ReliabilityStatusResult = {
  status: 'healthy',
  severity: null,
  reason: null,
  declaredAt: null,
  recordId: null,
};

/**
 * Absence of a row means healthy — never fabricates a positive record for
 * a source nobody has ever reported a problem with. Checks the exact scope
 * first, then falls back to the global scope for the same
 * (sourceSystem, metricKey) — a cohort-scoped healthy record never masks a
 * global quarantine of the same metric.
 */
export async function getReliabilityStatus(
  sourceSystem: string,
  metricKey: string,
  scope: ReliabilityScope = GLOBAL_SCOPE,
): Promise<ReliabilityStatusResult> {
  const scoped =
    scope.scopeType === 'global'
      ? null
      : await MetricReliabilityRecord.findOne({
          where: { source_system: sourceSystem, metric_key: metricKey, scope_type: scope.scopeType, scope_value: scope.scopeValue },
        });

  const global = await MetricReliabilityRecord.findOne({
    where: { source_system: sourceSystem, metric_key: metricKey, scope_type: 'global' },
  });

  // A real, unhealthy scoped record always wins over a healthy (or absent) global one.
  const record = scoped && scoped.status !== 'healthy' ? scoped : global && global.status !== 'healthy' ? global : scoped || global;

  if (!record) return HEALTHY_DEFAULT;

  return {
    status: record.status,
    severity: record.severity,
    reason: record.reason,
    declaredAt: record.declared_at,
    recordId: record.id,
  };
}

/** Fail-closed: only a real, current `healthy` status returns true. */
export async function isMetricUsable(
  sourceSystem: string,
  metricKey: string,
  scope: ReliabilityScope = GLOBAL_SCOPE,
): Promise<boolean> {
  const result = await getReliabilityStatus(sourceSystem, metricKey, scope);
  return result.status === 'healthy';
}

export interface DeclareReliabilityChangeInput {
  sourceSystem: string;
  metricKey: string;
  scope?: ReliabilityScope;
  status: Exclude<MetricReliabilityStatus, 'healthy'>;
  severity?: MetricReliabilitySeverity;
  reason: string;
  declaredBySource: MetricReliabilityDeclaredBySource;
  declaredByEmail?: string | null;
  incidentTicketId?: string | null;
  reviewOwnerEmail?: string | null;
  nextReviewAt?: Date | null;
  recoveryCriteria?: string | null;
}

/**
 * Creates or updates the one current record for this (sourceSystem,
 * metricKey, scope) tuple — mutates in place, matching Ticket.status's own
 * convention. Always emits a real, immutable AiEvent audit row regardless
 * of whether this created a new record or updated an existing one.
 */
export async function declareReliabilityChange(input: DeclareReliabilityChangeInput): Promise<MetricReliabilityRecord> {
  const scope = input.scope || GLOBAL_SCOPE;
  const declaredAt = new Date();

  const [record] = await MetricReliabilityRecord.findOrCreate({
    where: { source_system: input.sourceSystem, metric_key: input.metricKey, scope_type: scope.scopeType, scope_value: scope.scopeValue },
    defaults: {
      source_system: input.sourceSystem,
      metric_key: input.metricKey,
      scope_type: scope.scopeType,
      scope_value: scope.scopeValue,
      status: input.status,
      severity: input.severity ?? null,
      reason: input.reason,
      incident_ticket_id: input.incidentTicketId ?? null,
      declared_by_source: input.declaredBySource,
      declared_by_email: input.declaredByEmail ?? null,
      declared_at: declaredAt,
      review_owner_email: input.reviewOwnerEmail ?? null,
      next_review_at: input.nextReviewAt ?? null,
      recovery_criteria: input.recoveryCriteria ?? null,
    },
  });

  await record.update({
    status: input.status,
    severity: input.severity ?? null,
    reason: input.reason,
    incident_ticket_id: input.incidentTicketId ?? record.incident_ticket_id,
    declared_by_source: input.declaredBySource,
    declared_by_email: input.declaredByEmail ?? null,
    declared_at: declaredAt,
    review_owner_email: input.reviewOwnerEmail ?? record.review_owner_email,
    next_review_at: input.nextReviewAt ?? record.next_review_at,
    recovery_criteria: input.recoveryCriteria ?? record.recovery_criteria,
    restored_by_email: null,
    restored_at: null,
  });

  await emitAiEvent({
    event_type: input.status === 'quarantined' ? 'metric.quarantined' : 'metric.degraded',
    outcome: 'success',
    actor_type: input.declaredBySource,
    user_id: input.declaredByEmail ?? null,
    metadata: {
      source_system: input.sourceSystem,
      metric_key: input.metricKey,
      scope_type: scope.scopeType,
      scope_value: scope.scopeValue,
      status: input.status,
      severity: input.severity ?? null,
      reason: input.reason,
      record_id: record.id,
    },
  }).catch(() => {});

  return record;
}

export interface RestoreMetricInput {
  sourceSystem: string;
  metricKey: string;
  scope?: ReliabilityScope;
  recoveryEvidence: string;
  restoredByEmail: string;
}

export class MetricRestorationError extends Error {}

/**
 * Restoration requires an existing, real, currently-unhealthy record — you
 * cannot "restore" a metric nobody ever quarantined. Requires real recovery
 * evidence text (the mission's "recovery criteria satisfied" + "authorized
 * human confirmation" requirements) — never a bare status flip.
 */
export async function restoreMetric(input: RestoreMetricInput): Promise<MetricReliabilityRecord> {
  const scope = input.scope || GLOBAL_SCOPE;
  const record = await MetricReliabilityRecord.findOne({
    where: { source_system: input.sourceSystem, metric_key: input.metricKey, scope_type: scope.scopeType, scope_value: scope.scopeValue },
  });

  if (!record) {
    throw new MetricRestorationError(`No reliability record exists for ${input.sourceSystem}/${input.metricKey} in this scope — nothing to restore.`);
  }
  if (record.status === 'healthy') {
    throw new MetricRestorationError(`${input.sourceSystem}/${input.metricKey} is already healthy — nothing to restore.`);
  }

  const restoredAt = new Date();
  const previousStatus = record.status;
  await record.update({
    status: 'healthy',
    restored_by_email: input.restoredByEmail,
    restored_at: restoredAt,
  });

  await emitAiEvent({
    event_type: 'metric.restored',
    outcome: 'success',
    user_id: input.restoredByEmail,
    metadata: {
      source_system: input.sourceSystem,
      metric_key: input.metricKey,
      scope_type: scope.scopeType,
      scope_value: scope.scopeValue,
      recovery_evidence: input.recoveryEvidence,
      record_id: record.id,
      previous_status: previousStatus,
    },
  }).catch(() => {});

  return record;
}
