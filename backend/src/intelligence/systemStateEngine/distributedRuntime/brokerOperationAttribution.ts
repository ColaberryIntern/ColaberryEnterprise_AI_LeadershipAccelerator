/**
 * brokerOperationAttribution — Phase 21. Bounded ring buffer of
 * `BrokerOperationAttribution` rows per (organization_id, namespace).
 *
 * Every put/get/listKeys/listValues/delete/listOrganizations/ping call
 * appends one row. Consumed by the partition coordinator to compute
 * `PartitionIsolationTier` and by the topology + visibility surfaces.
 */

import type {
  BrokerAdapterKind, BrokerOperationAttribution, BrokerOperationOutcome,
} from './distributedRuntimeTypes';
import { MAX_OPERATION_ATTRIBUTIONS_PER_NAMESPACE } from './distributedRuntimeTypes';

interface RingBuffer {
  rows: BrokerOperationAttribution[];
}

const buffers = new Map<string, RingBuffer>();
let opsPublishedCount = 0;
let opsFallbackCount = 0;
let opsIsolatedCount = 0;

function bufferKey(organization_id: string, namespace: string): string {
  return `${organization_id}::${namespace}`;
}

export interface RecordAttributionInput {
  readonly operation: BrokerOperationAttribution['operation'];
  readonly adapter_kind: BrokerAdapterKind;
  readonly namespace: string;
  readonly organization_id: string;
  readonly latency_ms: number;
  readonly outcome: BrokerOperationOutcome;
  readonly fallback_reason?: string;
}

export function recordAttribution(input: RecordAttributionInput): BrokerOperationAttribution {
  const row: BrokerOperationAttribution = {
    operation: input.operation,
    adapter_kind: input.adapter_kind,
    namespace: input.namespace,
    organization_id: input.organization_id,
    latency_ms: input.latency_ms,
    outcome: input.outcome,
    fallback_reason: input.fallback_reason,
    observed_at: new Date().toISOString(),
  };

  const k = bufferKey(input.organization_id, input.namespace);
  let buf = buffers.get(k);
  if (!buf) {
    buf = { rows: [] };
    buffers.set(k, buf);
  }
  buf.rows.push(row);
  if (buf.rows.length > MAX_OPERATION_ATTRIBUTIONS_PER_NAMESPACE) buf.rows.shift();

  opsPublishedCount++;
  if (row.outcome === 'fallback') opsFallbackCount++;
  if (row.outcome === 'isolated') opsIsolatedCount++;
  return row;
}

export function listAttributions(
  organization_id: string,
  namespace: string,
): ReadonlyArray<BrokerOperationAttribution> {
  return buffers.get(bufferKey(organization_id, namespace))?.rows ?? [];
}

export function listAttributionsForOrg(
  organization_id: string,
): ReadonlyArray<BrokerOperationAttribution> {
  const out: BrokerOperationAttribution[] = [];
  for (const [k, buf] of buffers.entries()) {
    if (k.startsWith(`${organization_id}::`)) out.push(...buf.rows);
  }
  // newest-first
  return out.sort((a, b) => b.observed_at.localeCompare(a.observed_at));
}

export function getAttributionStats(): {
  ops_published: number;
  ops_fallback: number;
  ops_isolated: number;
  buffers_active: number;
} {
  return {
    ops_published: opsPublishedCount,
    ops_fallback: opsFallbackCount,
    ops_isolated: opsIsolatedCount,
    buffers_active: buffers.size,
  };
}

export function _resetAttributionForTests(): void {
  buffers.clear();
  opsPublishedCount = 0;
  opsFallbackCount = 0;
  opsIsolatedCount = 0;
}
