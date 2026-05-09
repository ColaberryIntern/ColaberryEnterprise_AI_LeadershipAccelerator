/**
 * federationLineageTracker — Phase 19. Read-only propagation trace
 * from source projects → archetypes → consumer projects.
 *
 * Architectural commitment (per the Phase 19 stress-test):
 *   - READ-ONLY. Consumers do NOT mutate source archetypes / trust /
 *     governance state. NO write-back loops.
 *   - Tracks `FederationConsumptionAttribution` entries so operators can
 *     see HOW federated intelligence influenced their local governance.
 */

import type {
  FederationLineageGraph, FederationLineageNode, FederationLineageEdge,
  FederationConsumptionAttribution,
} from './federationTypes';
import { MAX_LINEAGE_ENTRIES_PER_ARCHETYPE } from './federationTypes';

interface LineageState {
  /** Map archetype_signature → { source projects, consumer projects } */
  per_archetype: Map<string, { sources: Set<string>; consumers: Map<string, FederationConsumptionAttribution[]> }>;
}

const orgLineage = new Map<string, LineageState>();

function getOrgLineage(organization_id: string): LineageState {
  let s = orgLineage.get(organization_id);
  if (!s) {
    s = { per_archetype: new Map() };
    orgLineage.set(organization_id, s);
  }
  return s;
}

export interface RecordSourceInput {
  readonly organization_id: string;
  readonly source_project_id: string;
  readonly archetype_signature: string;
}

export function recordSource(input: RecordSourceInput): void {
  const s = getOrgLineage(input.organization_id);
  const entry = s.per_archetype.get(input.archetype_signature) ?? { sources: new Set<string>(), consumers: new Map<string, FederationConsumptionAttribution[]>() };
  entry.sources.add(input.source_project_id);
  s.per_archetype.set(input.archetype_signature, entry);
}

export interface RecordConsumptionInput {
  readonly organization_id: string;
  readonly attribution: FederationConsumptionAttribution;
}

export function recordConsumption(input: RecordConsumptionInput): void {
  const s = getOrgLineage(input.organization_id);
  const entry = s.per_archetype.get(input.attribution.archetype_signature) ?? { sources: new Set<string>(), consumers: new Map<string, FederationConsumptionAttribution[]>() };
  const existing = entry.consumers.get(input.attribution.consumer_project) ?? [];
  existing.push(input.attribution);
  // Bounded — keep at most MAX_LINEAGE_ENTRIES_PER_ARCHETYPE per consumer
  if (existing.length > MAX_LINEAGE_ENTRIES_PER_ARCHETYPE) existing.shift();
  entry.consumers.set(input.attribution.consumer_project, existing);
  s.per_archetype.set(input.attribution.archetype_signature, entry);
}

export interface ReadLineageInput {
  readonly organization_id: string;
}

export function readFederationLineage(input: ReadLineageInput): FederationLineageGraph {
  const s = orgLineage.get(input.organization_id);
  if (!s) {
    return {
      organization_id: input.organization_id,
      nodes: [], edges: [],
      archetype_count: 0, source_project_count: 0, consumer_project_count: 0,
      built_at: new Date().toISOString(),
    };
  }

  const nodes: FederationLineageNode[] = [];
  const edges: FederationLineageEdge[] = [];
  const sourceIds = new Set<string>();
  const consumerIds = new Set<string>();

  for (const [signature, entry] of s.per_archetype.entries()) {
    nodes.push({
      node_id: `archetype:${signature}`,
      kind: 'archetype',
      label: signature,
      metadata: {
        source_count: entry.sources.size,
        consumer_count: entry.consumers.size,
      },
    });

    // Source nodes + edges
    for (const src of entry.sources) {
      sourceIds.add(src);
      const sourceNodeId = `source:${src}`;
      if (!nodes.some(n => n.node_id === sourceNodeId)) {
        nodes.push({ node_id: sourceNodeId, kind: 'source_project', label: src, metadata: {} });
      }
      edges.push({
        from: sourceNodeId,
        to: `archetype:${signature}`,
        relation: 'shared',
        recorded_at: new Date().toISOString(),
      });
    }

    // Consumer nodes + edges with attribution metadata
    for (const [consumer, attributions] of entry.consumers.entries()) {
      consumerIds.add(consumer);
      const consumerNodeId = `consumer:${consumer}`;
      if (!nodes.some(n => n.node_id === consumerNodeId)) {
        nodes.push({
          node_id: consumerNodeId,
          kind: 'consumer_project',
          label: consumer,
          metadata: { attribution_count: attributions.length },
        });
      }
      const lastAttribution = attributions[attributions.length - 1];
      edges.push({
        from: `archetype:${signature}`,
        to: consumerNodeId,
        relation: lastAttribution.applied_locally ? 'consumed' : 'surfaced_to',
        recorded_at: lastAttribution.recorded_at,
      });
    }
  }

  return {
    organization_id: input.organization_id,
    nodes,
    edges,
    archetype_count: s.per_archetype.size,
    source_project_count: sourceIds.size,
    consumer_project_count: consumerIds.size,
    built_at: new Date().toISOString(),
  };
}

/** Read all consumption attributions for a given archetype within an
 *  organization — operator can audit which projects consumed it and
 *  what they did with it. */
export function readConsumptionAttributions(organization_id: string, archetype_signature: string): ReadonlyArray<FederationConsumptionAttribution> {
  const s = orgLineage.get(organization_id);
  if (!s) return [];
  const entry = s.per_archetype.get(archetype_signature);
  if (!entry) return [];
  const out: FederationConsumptionAttribution[] = [];
  for (const list of entry.consumers.values()) out.push(...list);
  return out.sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
}

export function _resetFederationLineage(): void {
  orgLineage.clear();
}

export const _MAX_LINEAGE_ENTRIES_PER_ARCHETYPE_FOR_TESTS = MAX_LINEAGE_ENTRIES_PER_ARCHETYPE;
