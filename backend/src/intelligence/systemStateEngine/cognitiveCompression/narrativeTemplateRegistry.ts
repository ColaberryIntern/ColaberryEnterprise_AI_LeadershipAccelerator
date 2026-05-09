/**
 * narrativeTemplateRegistry — Phase 24. Static, compile-time registry
 * of every template the compression engine may render.
 *
 * Architectural commitment:
 *   - Compile-time only. No runtime template mutation, no self-evolving
 *     templates, no probabilistic phrase expansion.
 *   - Each template takes a typed `vars` shape and produces a deterministic
 *     string. Same vars → same output. Verifiable via SHA-256 hash.
 *   - Output length capped at MAX_RENDERED_TEXT_CHARS=600.
 */

import { createHash } from 'crypto';
import { MAX_RENDERED_TEXT_CHARS } from './cognitiveCompressionTypes';

/** Every template's render function takes a typed vars object. */
type TemplateRenderFn = (vars: Record<string, string | number>) => string;

interface TemplateSpec {
  readonly template_id: string;
  readonly description: string;
  readonly required_vars: ReadonlyArray<string>;
  readonly render: TemplateRenderFn;
}

const TEMPLATES: TemplateSpec[] = [
  // ── Execution / worker lifecycle ────────────────────────────────
  {
    template_id: 'exec.worker.completed.v1',
    description: 'A bounded execution worker completed successfully.',
    required_vars: ['worker_id', 'kind', 'started_at', 'completed_at', 'duration_ms'],
    render: v => `Worker ${v.worker_id} (kind=${v.kind}) ran from ${v.started_at} to ${v.completed_at} (${v.duration_ms}ms) and completed successfully.`,
  },
  {
    template_id: 'exec.worker.failed.v1',
    description: 'A bounded execution worker failed.',
    required_vars: ['worker_id', 'kind', 'started_at', 'failed_at', 'failure_reason'],
    render: v => `Worker ${v.worker_id} (kind=${v.kind}) started at ${v.started_at} and failed at ${v.failed_at}: ${v.failure_reason}.`,
  },
  {
    template_id: 'exec.worker.interrupted.v1',
    description: 'A worker was interrupted (heartbeat timeout or process boot).',
    required_vars: ['worker_id', 'kind', 'started_at', 'interrupted_at', 'note'],
    render: v => `Worker ${v.worker_id} (kind=${v.kind}) started at ${v.started_at} was interrupted at ${v.interrupted_at}: ${v.note}.`,
  },
  {
    template_id: 'exec.worker.rolled_back.v1',
    description: 'A worker was rolled back via the rollback execution coordinator.',
    required_vars: ['worker_id', 'kind', 'rollback_chain_id'],
    render: v => `Worker ${v.worker_id} (kind=${v.kind}) was rolled back via chain ${v.rollback_chain_id}.`,
  },
  {
    template_id: 'exec.governance.rejected.v1',
    description: 'A worker registration was rejected by the governance supervisor.',
    required_vars: ['worker_id', 'kind', 'rule_violated', 'reason'],
    render: v => `Registration of worker ${v.worker_id} (kind=${v.kind}) was rejected by the governance supervisor: rule ${v.rule_violated} — ${v.reason}.`,
  },

  // ── Broker / partition isolation (Phase 21) ──────────────────────
  {
    template_id: 'broker.isolated.v1',
    description: 'A broker namespace was isolated automatically.',
    required_vars: ['namespace', 'organization_id', 'reason', 'isolated_since', 'consecutive_failures'],
    render: v => `Broker namespace ${v.namespace} for org ${v.organization_id} was isolated at ${v.isolated_since} (reason: ${v.reason}; consecutive_failures: ${v.consecutive_failures}).`,
  },
  {
    template_id: 'broker.quarantined.v1',
    description: 'A broker namespace was operator-quarantined.',
    required_vars: ['namespace', 'organization_id', 'isolated_since'],
    render: v => `Broker namespace ${v.namespace} for org ${v.organization_id} was operator-quarantined at ${v.isolated_since}; serves no ops until explicitly lifted.`,
  },
  {
    template_id: 'broker.partition.tier.v1',
    description: 'A partition tier classification.',
    required_vars: ['organization_id', 'tier', 'health_score', 'recent_ops_count', 'recent_failure_count'],
    render: v => `Partition ${v.organization_id} is currently ${v.tier} with health ${v.health_score}/100 across ${v.recent_ops_count} recent ops (${v.recent_failure_count} failures).`,
  },

  // ── Topology (Phase 22) ──────────────────────────────────────────
  {
    template_id: 'topology.fragmentation.v1',
    description: 'A partition\'s topology fragmentation tier.',
    required_vars: ['organization_id', 'tier', 'fragmentation_pressure_score', 'active_isolation_count', 'isolated_root_count'],
    render: v => `Topology for org ${v.organization_id} is ${v.tier} (pressure ${v.fragmentation_pressure_score}/100) with ${v.active_isolation_count} active isolation(s) including ${v.isolated_root_count} root namespace(s).`,
  },
  {
    template_id: 'topology.propagation.v1',
    description: 'A topology propagation walk.',
    required_vars: ['origin', 'impacted_count', 'dependency_depth', 'reason'],
    render: v => `Propagation from ${v.origin} reached ${v.impacted_count} downstream namespace(s) at depth ${v.dependency_depth}: ${v.reason}.`,
  },
  {
    template_id: 'topology.stabilization.v1',
    description: 'A stabilization influence after recovery.',
    required_vars: ['origin', 'stabilized_count', 'recovery_kind'],
    render: v => `Recovery of ${v.origin} via ${v.recovery_kind} stabilized ${v.stabilized_count} downstream namespace(s).`,
  },
  {
    template_id: 'topology.forecast.v1',
    description: 'Single-step heuristic forecast.',
    required_vars: ['organization_id', 'current_tier', 'forecast_tier', 'horizon_minutes', 'confidence_low', 'confidence_high'],
    render: v => `Forecast for org ${v.organization_id}: ${v.current_tier} → ${v.forecast_tier} within ${v.horizon_minutes}min (confidence ${v.confidence_low}–${v.confidence_high}).`,
  },

  // ── Continuity (Phase 21 + 23) ──────────────────────────────────
  {
    template_id: 'continuity.replay.v1',
    description: 'A continuity replay summary.',
    required_vars: ['adapter_kind', 'keys_replayed', 'namespaces_visited', 'time_elapsed_ms', 'outcome'],
    render: v => `Continuity replay (${v.adapter_kind}) visited ${v.namespaces_visited} namespace(s), replayed ${v.keys_replayed} key(s) in ${v.time_elapsed_ms}ms — outcome ${v.outcome}.`,
  },
  {
    template_id: 'continuity.boot.flipped.v1',
    description: 'Workers flipped to interrupted at process boot.',
    required_vars: ['count'],
    render: v => `${v.count} worker(s) were flipped from pending/running to interrupted at process boot. None were auto-resumed; operator review required.`,
  },
  {
    template_id: 'continuity.stalled.v1',
    description: 'Stalled worker detection.',
    required_vars: ['count'],
    render: v => `${v.count} worker(s) are currently stalled (heartbeat past timeout). Operator may force a continuity replay.`,
  },

  // ── Rollback (Phase 15 + 23) ────────────────────────────────────
  {
    template_id: 'rollback.aggregated.v1',
    description: 'An aggregated rollback execution plan.',
    required_vars: ['plan_id', 'organization_id', 'trigger', 'step_count', 'phase_count'],
    render: v => `Rollback plan ${v.plan_id} for org ${v.organization_id} (trigger: ${v.trigger}) aggregates ${v.step_count} step(s) across ${v.phase_count} phase(s); every step is operator-required.`,
  },
  {
    template_id: 'rollback.continuity.bounds.v1',
    description: 'A rollback continuity bounds row.',
    required_vars: ['rollback_chain_id', 'source_phase', 'steps_replayed', 'time_elapsed_ms', 'outcome'],
    render: v => `Rollback ${v.rollback_chain_id} (source ${v.source_phase}) replayed ${v.steps_replayed} step(s) in ${v.time_elapsed_ms}ms — outcome ${v.outcome}.`,
  },

  // ── Causality (Phase 16) ────────────────────────────────────────
  {
    template_id: 'causal.chain.summary.v1',
    description: 'A causal chain summary across phases.',
    required_vars: ['chain_length', 'origin_phase', 'origin_id', 'terminal_phase', 'terminal_id'],
    render: v => `Causal chain of ${v.chain_length} step(s): began at ${v.origin_phase}/${v.origin_id} and terminated at ${v.terminal_phase}/${v.terminal_id}.`,
  },

  // ── Trust + cognitive load ──────────────────────────────────────
  {
    template_id: 'trust.band.v1',
    description: 'A single trust band score with inherited drivers.',
    required_vars: ['label', 'score', 'inherited_from_phase', 'driver_count'],
    render: v => `${v.label}: ${v.score}/100 (inherited from ${v.inherited_from_phase}; ${v.driver_count} uncertainty driver(s)).`,
  },
  {
    template_id: 'cognitive.load.summary.v1',
    description: 'A cognitive load tier summary.',
    required_vars: ['tier', 'load_score', 'top_driver'],
    render: v => `Operational cognitive load is ${v.tier} (${v.load_score}/100). Primary driver: ${v.top_driver}.`,
  },

  // ── Operator guidance ───────────────────────────────────────────
  {
    template_id: 'guidance.item.v1',
    description: 'A single operator guidance item.',
    required_vars: ['action_kind', 'urgency_score', 'ranked_by_rule', 'target_summary'],
    render: v => `[urgency ${v.urgency_score}/100] ${v.action_kind} on ${v.target_summary} — ranked by ${v.ranked_by_rule}.`,
  },

  // ── Generic fallback ────────────────────────────────────────────
  {
    template_id: 'generic.attribution.v1',
    description: 'Generic single-attribution rendering.',
    required_vars: ['source_phase', 'source_id', 'fragment'],
    render: v => `[${v.source_phase}] ${v.source_id}: ${v.fragment}`,
  },
];

const REGISTRY = new Map<string, TemplateSpec>(TEMPLATES.map(t => [t.template_id, t]));

export function listTemplateIds(): ReadonlyArray<string> {
  return [...REGISTRY.keys()].sort();
}

export function getTemplateSpec(template_id: string): TemplateSpec | undefined {
  return REGISTRY.get(template_id);
}

/**
 * Render a template deterministically. Returns null when the template
 * doesn't exist or required vars are missing — never falls back to a
 * synthetic phrase.
 */
export function renderTemplate(template_id: string, vars: Record<string, string | number>): { text: string; deterministic_hash: string } | null {
  const spec = REGISTRY.get(template_id);
  if (!spec) return null;
  for (const required of spec.required_vars) {
    if (!(required in vars)) return null;
  }
  const text = spec.render(vars).slice(0, MAX_RENDERED_TEXT_CHARS);
  const deterministic_hash = createHash('sha256').update(`${template_id}::${text}`).digest('hex').slice(0, 16);
  return { text, deterministic_hash };
}

export const _TEMPLATE_COUNT_FOR_TESTS = TEMPLATES.length;
