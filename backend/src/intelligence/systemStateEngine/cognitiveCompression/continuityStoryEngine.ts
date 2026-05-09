/**
 * continuityStoryEngine — Phase 24. Generates `ContinuityNarrative`
 * from Phase 21 + Phase 23 continuity replay state.
 *
 * Architectural commitment:
 *   - VISIBILITY ONLY. Never auto-resumes any worker. Never re-fires
 *     replays. Just renders existing continuity state into deterministic
 *     blocks.
 */

import type { ContinuityNarrative, NarrativeCitation } from './cognitiveCompressionTypes';
import { listRecentReplays as listRuntimeReplays } from '../distributedRuntime/runtimeContinuityReplay';
import { buildExecutionContinuityReplay } from '../executionSubstrate/executionContinuityTracker';
import { listEnvelopesByState } from '../executionSubstrate/executionRuntimeCoordinator';
import { buildBlock, buildOperationalNarrative } from './operationalNarrativeBuilder';
import { publishCognitiveEvent } from '../realtime/cognitiveEventBus';

export interface BuildContinuityNarrativeInput {
  readonly organization_id: string;
}

export function buildContinuityNarrative(input: BuildContinuityNarrativeInput): ContinuityNarrative | null {
  const blocks: any[] = [];
  let source_event_count = 0;

  // Phase 21 continuity replays (most recent)
  const runtimeReplays = listRuntimeReplays().slice(0, 3);
  source_event_count += runtimeReplays.length;
  for (const r of runtimeReplays) {
    const cite: NarrativeCitation = {
      source_kind: 'runtime_continuity_replay',
      source_id: r.replay_id,
      source_phase: 'phase_21_runtime',
      recorded_at: r.completed_at,
      fragment_quoted: `${r.bounds.adapter_kind} replay ${r.bounds.replay_outcome}`,
    };
    blocks.push(buildBlock({
      template_id: 'continuity.replay.v1',
      vars: {
        adapter_kind: r.bounds.adapter_kind,
        keys_replayed: r.bounds.keys_replayed,
        namespaces_visited: r.bounds.namespaces_visited,
        time_elapsed_ms: r.bounds.time_elapsed_ms,
        outcome: r.bounds.replay_outcome,
      },
      source_attributions: [cite],
      selection_rule: 'recent_runtime_continuity_replay',
    }));
  }

  // Phase 23 execution continuity (interrupted_on_boot + stalled)
  const execContinuity = buildExecutionContinuityReplay({ organization_id: input.organization_id });
  source_event_count += execContinuity.entries.length;
  if (execContinuity.interrupted_on_boot.length > 0) {
    const sample = execContinuity.interrupted_on_boot[0];
    const cite: NarrativeCitation = {
      source_kind: 'execution_continuity_replay',
      source_id: execContinuity.replay_id,
      source_phase: 'phase_23_execution_substrate',
      recorded_at: execContinuity.built_at,
      fragment_quoted: `${execContinuity.interrupted_on_boot.length} workers flipped at boot`,
    };
    void sample;
    blocks.push(buildBlock({
      template_id: 'continuity.boot.flipped.v1',
      vars: { count: execContinuity.interrupted_on_boot.length },
      source_attributions: [cite],
      selection_rule: 'execution_interrupted_on_boot',
    }));
  }
  if (execContinuity.stalled_workers.length > 0) {
    const cite: NarrativeCitation = {
      source_kind: 'execution_continuity_replay',
      source_id: execContinuity.replay_id,
      source_phase: 'phase_23_execution_substrate',
      recorded_at: execContinuity.built_at,
      fragment_quoted: `${execContinuity.stalled_workers.length} stalled workers`,
    };
    blocks.push(buildBlock({
      template_id: 'continuity.stalled.v1',
      vars: { count: execContinuity.stalled_workers.length },
      source_attributions: [cite],
      selection_rule: 'execution_stalled_workers',
    }));
  }

  if (blocks.length === 0) return null;

  const narrative = buildOperationalNarrative({
    organization_id: input.organization_id,
    kind: 'continuity_restoration',
    source_event_count,
    blocks,
  });
  if (!narrative) return null;

  const interrupted_worker_count = execContinuity.interrupted_on_boot.length
    + listEnvelopesByState(input.organization_id, 'interrupted').length;
  const stalled_worker_count = execContinuity.stalled_workers.length;
  const restored_worker_count = listEnvelopesByState(input.organization_id, 'completed').length;

  try {
    publishCognitiveEvent({
      kind: 'continuity.restored',
      project_id: 'system',
      severity: 'info',
      payload: {
        narrative_id: narrative.narrative_id,
        organization_id: input.organization_id,
        interrupted_worker_count,
        stalled_worker_count,
      },
    });
  } catch { /* noop */ }

  return {
    narrative,
    interrupted_worker_count,
    stalled_worker_count,
    restored_worker_count,
    built_at: new Date().toISOString(),
  };
}
