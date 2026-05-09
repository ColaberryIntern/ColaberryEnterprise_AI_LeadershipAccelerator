/**
 * runtimeTopologyTracker — Phase 21. Builds a structured payload that
 * describes the current runtime topology (1 broker, N partitions in v1).
 *
 * Forward-shaped: the `brokers[]` array has 1 entry today; future
 * multi-broker deployments populate it without contract change.
 */

import type { DistributedRuntimeTopology } from './distributedRuntimeTypes';
import {
  getNodeId, getActiveAdapterKind, getConnectionStatus, getActiveRedisAdapter,
} from './distributedBrokerRuntime';
import { listAttributionsForOrg, getAttributionStats } from './brokerOperationAttribution';
import { partitionCount, activeNamespaces } from './runtimePartitionCoordinator';
import { getActiveAdapter } from './distributedBrokerRuntime';

export async function buildRuntimeTopology(): Promise<DistributedRuntimeTopology> {
  const adapter_kind = getActiveAdapterKind();
  const connection_status = getConnectionStatus();
  const node_id = getNodeId();
  const partition_count = await partitionCount();
  const namespaces = await activeNamespaces();

  // Last successful op timestamp across all attributions.
  let last_successful_op_at: string | null = null;
  const orgs = await getActiveAdapter().listOrganizations();
  for (const org of orgs) {
    const ops = listAttributionsForOrg(org);
    const lastSuccess = ops.find(op => op.outcome === 'success');
    if (lastSuccess && (!last_successful_op_at || lastSuccess.observed_at > last_successful_op_at)) {
      last_successful_op_at = lastSuccess.observed_at;
    }
  }

  const stats = getAttributionStats();
  const notes: string[] = [];
  if (adapter_kind === 'redis') {
    const redis = getActiveRedisAdapter();
    notes.push(redis?.isConnected() ? 'redis_connected' : 'redis_unconnected');
  }
  if (stats.ops_fallback > 0) notes.push(`${stats.ops_fallback}_fallback_ops_lifetime`);
  if (stats.ops_isolated > 0) notes.push(`${stats.ops_isolated}_isolated_ops_lifetime`);

  return {
    node_id,
    brokers: [
      {
        broker_id: `${node_id}/${adapter_kind}`,
        adapter_kind,
        connection_status,
        last_successful_op_at,
        partition_count,
        active_namespaces: namespaces,
        notes,
      },
    ],
    partition_count,
    total_namespaces: namespaces.length,
    // Forward-shaped: empty in v1, future multi-broker setups will fill.
    synchronization_dependencies: [],
    built_at: new Date().toISOString(),
  };
}
