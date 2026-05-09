/**
 * operationalNarrativeBuilder — Phase 24. Top-level composer that
 * turns Phase 13-23 typed payloads into deterministic
 * `OperationalNarrative` objects.
 *
 * Architectural commitment:
 *   - No LLM, no inference, no synthesis.
 *   - Every block carries source_attributions[] — empty list refuses
 *     generation.
 *   - Density tier is derived from rendered_block_count + source count.
 */

import { randomUUID } from 'crypto';
import type {
  OperationalNarrative, OperationalNarrativeKind, OperationalNarrativeTier,
  NarrativeBlock, NarrativeCitation, NarrativeCompressionBounds,
  NarrativeConfidenceBounds, NarrativeDeterminismAttribution,
} from './cognitiveCompressionTypes';
import {
  MAX_BLOCKS_PER_NARRATIVE, MAX_CITATIONS_PER_BLOCK,
  MAX_NARRATIVES_PER_PARTITION,
  COMPRESSION_RATIO_DENSE_THRESHOLD, COMPRESSION_RATIO_EXECUTIVE_THRESHOLD,
} from './cognitiveCompressionTypes';
import { renderTemplate } from './narrativeTemplateRegistry';
import { publishCognitiveEvent } from '../realtime/cognitiveEventBus';

interface PartitionStore {
  narratives: OperationalNarrative[];
  recent_24h: number[];
}

const partitions = new Map<string, PartitionStore>();

function ensure(organization_id: string): PartitionStore {
  let s = partitions.get(organization_id);
  if (!s) {
    s = { narratives: [], recent_24h: [] };
    partitions.set(organization_id, s);
  }
  return s;
}

function pruneRecent(store: PartitionStore, now: number): void {
  const cutoff = now - 24 * 60 * 60_000;
  while (store.recent_24h.length > 0 && store.recent_24h[0] < cutoff) {
    store.recent_24h.shift();
  }
}

// ─── Block construction ─────────────────────────────────────────────

export interface BlockInput {
  readonly template_id: string;
  readonly vars: Record<string, string | number>;
  readonly source_attributions: ReadonlyArray<NarrativeCitation>;
  readonly selection_rule: string;
  readonly confidence?: NarrativeConfidenceBounds;
}

/**
 * Build a single narrative block. Returns null if (a) source_attributions
 * is empty (no citations → no narrative), (b) the template doesn't exist,
 * or (c) required vars are missing. Never falls back to synthetic text.
 */
export function buildBlock(input: BlockInput): NarrativeBlock | null {
  if (input.source_attributions.length === 0) return null;
  const citations = input.source_attributions.slice(0, MAX_CITATIONS_PER_BLOCK);
  const rendered = renderTemplate(input.template_id, input.vars);
  if (!rendered) return null;
  const determinism: NarrativeDeterminismAttribution = {
    template_id: input.template_id,
    selection_rule: input.selection_rule,
    rendered_from: citations.map(c => c.source_id),
    deterministic_hash: rendered.deterministic_hash,
    replayable: true,
  };
  return {
    block_id: `nblock_${randomUUID().slice(0, 8)}`,
    template_id: input.template_id,
    rendered_text: rendered.text,
    source_attributions: citations,
    determinism,
    confidence: input.confidence,
  };
}

// ─── Narrative construction ─────────────────────────────────────────

export interface BuildNarrativeInput {
  readonly organization_id: string;
  readonly kind: OperationalNarrativeKind;
  readonly source_event_count: number;        // total events available before compression
  readonly blocks: ReadonlyArray<NarrativeBlock | null>;
  readonly aggregate_confidence?: NarrativeConfidenceBounds;
  readonly bounded_reason?: string;
}

/**
 * Build an `OperationalNarrative` from already-constructed blocks.
 * Null blocks (failed-citation rendering) are filtered out and counted
 * as omitted_low_priority_events. Returns null when ALL blocks are null
 * (no narrative possible without citations).
 */
export function buildOperationalNarrative(input: BuildNarrativeInput): OperationalNarrative | null {
  const validBlocks = input.blocks
    .filter((b): b is NarrativeBlock => b !== null)
    .slice(0, MAX_BLOCKS_PER_NARRATIVE);
  if (validBlocks.length === 0) return null;
  const omitted = input.blocks.length - validBlocks.length;
  const sourceCount = Math.max(input.source_event_count, validBlocks.length);
  const compression_ratio = sourceCount === 0 ? 1 : Math.min(1, validBlocks.length / sourceCount);

  const tier: OperationalNarrativeTier = classifyTier(validBlocks.length, compression_ratio);

  const compression: NarrativeCompressionBounds = {
    source_event_count: sourceCount,
    rendered_block_count: validBlocks.length,
    omitted_low_priority_events: Math.max(0, sourceCount - validBlocks.length),
    compression_ratio,
    bounded_reason: input.bounded_reason ?? (omitted > 0 ? 'low_priority_events_omitted' : undefined),
  };

  const narrative: OperationalNarrative = {
    narrative_id: `narr_${randomUUID()}`,
    organization_id: input.organization_id,
    kind: input.kind,
    tier,
    blocks: validBlocks,
    compression,
    aggregate_confidence: input.aggregate_confidence,
    built_at: new Date().toISOString(),
  };

  const store = ensure(input.organization_id);
  store.narratives.push(narrative);
  if (store.narratives.length > MAX_NARRATIVES_PER_PARTITION) store.narratives.shift();
  store.recent_24h.push(Date.now());
  pruneRecent(store, Date.now());

  try {
    publishCognitiveEvent({
      kind: 'narrative.generated',
      project_id: 'system',
      severity: 'info',
      payload: {
        narrative_id: narrative.narrative_id,
        organization_id: input.organization_id,
        kind: input.kind,
        tier,
        block_count: validBlocks.length,
      },
    });
  } catch { /* noop */ }

  return narrative;
}

function classifyTier(block_count: number, compression_ratio: number): OperationalNarrativeTier {
  if (block_count <= 1) return 'atomic';
  if (compression_ratio <= COMPRESSION_RATIO_EXECUTIVE_THRESHOLD) return 'executive';
  if (compression_ratio <= COMPRESSION_RATIO_DENSE_THRESHOLD || block_count >= 6) return 'compressed';
  return 'summarized';
}

// ─── Confidence aggregation (inherited only) ────────────────────────

/**
 * Aggregate multiple inherited confidence bounds. Default rule is
 * `min_low_max_high` — the widest band — to honestly reflect uncertainty
 * across sources. Never narrows.
 */
export function aggregateInheritedConfidence(
  sources: ReadonlyArray<NarrativeConfidenceBounds>,
  primary_source_id: string,
  primary_phase: NarrativeConfidenceBounds['inherited_from_phase'],
  rule: 'min_low_max_high' | 'narrowest_band' = 'min_low_max_high',
): NarrativeConfidenceBounds | undefined {
  if (sources.length === 0) return undefined;
  if (sources.length === 1) {
    return { ...sources[0], aggregation_rule: 'single_source' };
  }
  if (rule === 'narrowest_band') {
    const ranked = [...sources].sort((a, b) => (a.high - a.low) - (b.high - b.low));
    return { ...ranked[0], aggregation_rule: 'narrowest_band' };
  }
  // min_low_max_high: widest band → most honest about uncertainty.
  let low = 100;
  let high = 0;
  const drivers = new Set<string>();
  for (const s of sources) {
    low = Math.min(low, s.low);
    high = Math.max(high, s.high);
    for (const d of s.drivers) drivers.add(d);
  }
  return {
    low,
    high,
    drivers: Array.from(drivers),
    inherited_from_source_id: primary_source_id,
    inherited_from_phase: primary_phase,
    aggregation_rule: 'min_low_max_high',
  };
}

// ─── Read APIs ──────────────────────────────────────────────────────

export function listNarratives(organization_id: string): ReadonlyArray<OperationalNarrative> {
  return [...(partitions.get(organization_id)?.narratives ?? [])].reverse();
}

export function recentNarrativeCount24h(organization_id?: string): number {
  pruneRecent(ensure(organization_id ?? '_aggregate'), Date.now());
  if (organization_id) return ensure(organization_id).recent_24h.length;
  let total = 0;
  for (const store of partitions.values()) {
    pruneRecent(store, Date.now());
    total += store.recent_24h.length;
  }
  return total;
}

export function _resetNarrativeBuilderForTests(): void {
  partitions.clear();
}
