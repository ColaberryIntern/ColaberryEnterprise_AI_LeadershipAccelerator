/**
 * continuityTransferEngine — Phase 32. Read-only references to
 * Phase 27/29/30/31 entities the from-operator wants to surface
 * for the to-operator.
 *
 * Architectural commitment:
 *   - `grants_authority: false` typed-as-literal — bundle is purely
 *     informational. Phase 27/28/29 gates run independently on every
 *     subsequent action.
 *   - `read_only: true` + `engine_never_ranks: true` typed-as-literal.
 *   - Cross-organization isolation absolute.
 *   - Bundles are append-only; once built, immutable.
 */

import { randomUUID, createHash } from 'crypto';
import type {
  ContinuityTransferBundle,
} from './operatorContinuityTypes';
import {
  MAX_TRANSFER_BUNDLES_PER_PARTITION, MAX_REFERENCES_PER_BUNDLE,
} from './operatorContinuityTypes';

interface PartitionStore {
  bundles: ContinuityTransferBundle[];
}

const partitions = new Map<string, PartitionStore>();

function ensure(organization_id: string): PartitionStore {
  let s = partitions.get(organization_id);
  if (!s) { s = { bundles: [] }; partitions.set(organization_id, s); }
  return s;
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export interface BuildTransferBundleInput {
  readonly organization_id: string;
  readonly from_operator_id: string;
  readonly to_operator_id: string;
  readonly phase_27_envelope_ids?: ReadonlyArray<string>;
  readonly phase_29_archetype_ids?: ReadonlyArray<string>;
  readonly phase_30_comparison_ids?: ReadonlyArray<string>;
  readonly phase_31_session_ids?: ReadonlyArray<string>;
  readonly phase_31_event_ids?: ReadonlyArray<string>;
}

export interface BuildTransferBundleResult {
  readonly built: boolean;
  readonly bundle?: ContinuityTransferBundle;
  readonly reason?: string;
}

export function buildContinuityTransferBundle(
  input: BuildTransferBundleInput,
): BuildTransferBundleResult {
  if (!input.organization_id) return { built: false, reason: 'organization_id_required' };
  if (!input.from_operator_id) return { built: false, reason: 'from_operator_id_required' };
  if (!input.to_operator_id) return { built: false, reason: 'to_operator_id_required' };
  if (input.from_operator_id === input.to_operator_id) {
    return { built: false, reason: 'self_transfer_forbidden' };
  }

  const env = input.phase_27_envelope_ids ?? [];
  const arch = input.phase_29_archetype_ids ?? [];
  const cmp = input.phase_30_comparison_ids ?? [];
  const sess = input.phase_31_session_ids ?? [];
  const evt = input.phase_31_event_ids ?? [];
  const total_refs = env.length + arch.length + cmp.length + sess.length + evt.length;
  if (total_refs > MAX_REFERENCES_PER_BUNDLE) {
    return { built: false, reason: `reference_cap_exceeded (max ${MAX_REFERENCES_PER_BUNDLE})` };
  }

  const transfer_bundle_id = `bundle_${randomUUID()}`;
  const built_at = new Date().toISOString();
  const transfer_hash = deterministicHash(
    `transfer::${transfer_bundle_id}::${input.organization_id}::${input.from_operator_id}::${input.to_operator_id}::${env.join(',')}::${arch.join(',')}::${cmp.join(',')}::${sess.join(',')}::${evt.join(',')}`,
  );

  const bundle: ContinuityTransferBundle = {
    transfer_bundle_id,
    organization_id: input.organization_id,
    from_operator_id: input.from_operator_id,
    to_operator_id: input.to_operator_id,
    built_at,
    references: {
      phase_27_envelope_ids: env,
      phase_29_archetype_ids: arch,
      phase_30_comparison_ids: cmp,
      phase_31_session_ids: sess,
      phase_31_event_ids: evt,
    },
    grants_authority: false,
    read_only: true,
    engine_never_ranks: true,
    transfer_hash,
  };

  const store = ensure(input.organization_id);
  store.bundles.push(bundle);
  if (store.bundles.length > MAX_TRANSFER_BUNDLES_PER_PARTITION) store.bundles.shift();

  return { built: true, bundle };
}

export function listTransferBundles(
  organization_id: string,
): ReadonlyArray<ContinuityTransferBundle> {
  return [...(partitions.get(organization_id)?.bundles ?? [])].reverse();
}

export function getTransferBundle(
  organization_id: string, transfer_bundle_id: string,
): ContinuityTransferBundle | null {
  return partitions.get(organization_id)?.bundles.find(b => b.transfer_bundle_id === transfer_bundle_id) ?? null;
}

export function recentTransferBundleCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const arr = partitions.get(o)?.bundles ?? [];
    total += arr.filter(b => Date.parse(b.built_at) >= cutoff).length;
  }
  return total;
}

export function _resetTransferEngineForTests(): void {
  partitions.clear();
}
