/**
 * healthScorer — quality score across six dimensions, normalized to 0-100.
 *
 * Replaces the legacy six-dimension quality scoring buried in enrichCapability.
 * Same dimensions, but normalized to a single 0-100 output and explicit per-
 * dimension breakdown.
 *
 * Dimensions (each 0-100):
 *   determinism            — backend logic that's reproducible (less LLM, more rules)
 *   reliability            — error handling, retry logic, idempotency
 *   observability          — logging, metrics, tracing
 *   ux_exposure            — frontend coverage / accessibility / responsiveness
 *   automation             — agent / worker presence
 *   production_readiness   — composite readiness (deploy artifacts, config, secrets)
 *
 * Kind-aware (2026-05-19): not every dimension applies to every cap. A
 * Page has no determinism (no backend logic). An agent has no ux_exposure
 * (no UI). A component has only ux_exposure + reliability. Score averages
 * over APPLICABLE dimensions only — caps aren't penalized for dimensions
 * that don't make sense for what they are.
 */
import type { EngineCapabilityInput, Score0to100 } from '../types/systemState.types';

export interface HealthBreakdown {
  readonly score: Score0to100;
  readonly determinism: Score0to100;
  readonly reliability: Score0to100;
  readonly observability: Score0to100;
  readonly ux_exposure: Score0to100;
  readonly automation: Score0to100;
  readonly production_readiness: Score0to100;
  readonly reasons: ReadonlyArray<string>;
  /**
   * Names of dimensions that contributed to the final score for this kind.
   * Dimensions NOT in this list were skipped as N/A for the cap's kind.
   */
  readonly applicable_dimensions: ReadonlyArray<string>;
}

type DimensionKey = 'determinism' | 'reliability' | 'observability' | 'ux_exposure' | 'automation' | 'production_readiness';

/**
 * Which dimensions apply to each cap kind. Dimensions not in the list
 * are N/A — they don't contribute to the average. Conservative defaults:
 * if a kind isn't recognized, treat all dimensions as applicable.
 */
function getKindApplicableDimensions(kind: string | undefined): DimensionKey[] {
  switch (kind) {
    case 'page':
      // Pages: UX-driven, deploy as part of frontend bundle. No backend logic
      // (no determinism), no agent (no automation).
      return ['ux_exposure', 'reliability', 'observability', 'production_readiness'];
    case 'agent':
      // Agents: backend code that runs autonomously. No UI surface.
      return ['determinism', 'reliability', 'observability', 'automation', 'production_readiness'];
    case 'component':
      // Components: UI widgets embedded in pages. Just need to be reliable
      // and exposed correctly. No backend, no agents, no observability of
      // their own.
      return ['ux_exposure', 'reliability'];
    case 'service':
    default:
      return ['determinism', 'reliability', 'observability', 'ux_exposure', 'automation', 'production_readiness'];
  }
}

/**
 * Apply evidence-based gating on top of kind-based applicability.
 * Added 2026-05-19 after the operator audit showed 90% false-positive
 * rate on heuristic reliability + automation tasks.
 *
 *   reliability is skipped if code_evidence.reliability_signal === 'na'
 *     (pure-function service has nothing to wrap)
 *   automation is skipped if code_evidence.automation_applicable === false
 *     (CRUD admin etc. don't need agents)
 *
 * When code_evidence is absent, only kind-based gating applies (legacy
 * behavior).
 */
function getApplicableDimensions(cap: EngineCapabilityInput): DimensionKey[] {
  const kindApplicable = getKindApplicableDimensions(cap.kind);
  if (!cap.code_evidence) return kindApplicable;
  return kindApplicable.filter(d => {
    if (d === 'reliability' && cap.code_evidence!.reliability_signal === 'na') return false;
    if (d === 'automation' && !cap.code_evidence!.automation_applicable) return false;
    return true;
  });
}

export function scoreHealth(
  cap: EngineCapabilityInput,
  projectFileTree: ReadonlyArray<string>,
): HealthBreakdown {
  const reasons: string[] = [];
  const kind = cap.kind || 'service';
  const applicable = getApplicableDimensions(cap);
  const applicableSet = new Set<DimensionKey>(applicable);
  if (cap.code_evidence) {
    reasons.push(`code-evidence: reliability=${cap.code_evidence.reliability_signal}, automation_applicable=${cap.code_evidence.automation_applicable} (${cap.code_evidence.evidence_files_read} files read)`);
  }

  const backendCount = (cap.linked_backend_services || []).length;
  const frontendCount = (cap.linked_frontend_components || []).length;
  const agentCount = (cap.linked_agents || []).length;

  const hasBackend = backendCount > 0;
  const hasFrontend = frontendCount > 0 || !!cap.frontend_route;
  const hasAgents = agentCount > 0;

  // determinism: backend presence with low agent ratio = more deterministic
  let determinism = 0;
  if (applicableSet.has('determinism') && hasBackend) {
    const ratio = backendCount / Math.max(1, backendCount + agentCount);
    determinism = Math.round(ratio * 100);
    reasons.push(`determinism: ${determinism} (${backendCount} backend / ${agentCount} agent files)`);
  }

  // reliability: prefer evidence-based scoring (try/catch density) when
  // code_evidence is present. Falls back to file-count heuristic for legacy.
  let reliability = 0;
  if (applicableSet.has('reliability')) {
    const sig = cap.code_evidence?.reliability_signal;
    if (sig === 'high')   { reliability = 90; reasons.push(`reliability: 90 (evidence: high try/catch density)`); }
    else if (sig === 'medium') { reliability = 65; reasons.push(`reliability: 65 (evidence: medium try/catch density)`); }
    else if (sig === 'low') { reliability = 30; reasons.push(`reliability: 30 (evidence: low try/catch density — hardening helps)`); }
    // sig === 'na' wouldn't reach here (gate filters it out)
    else if (hasBackend) {
      // legacy fallback when no code evidence available
      reliability = Math.min(100, backendCount * 15);
      reasons.push(`reliability: ${reliability} (heuristic from backend file count — no code evidence)`);
    } else if (kind === 'page' || kind === 'component') {
      reliability = (cap.frontend_route ? 50 : 0) + Math.min(50, frontendCount * 20);
      reasons.push(`reliability: ${reliability} (page/component frontend signals)`);
    }
  }

  // observability: project-wide signal — does the repo have monitoring/logging files
  let observability = 0;
  if (applicableSet.has('observability')) {
    const observabilityFiles = projectFileTree.filter(f =>
      /(monitor|metric|log|logger|telemetr|tracer?|trac(e|ing)|observ|alerts?)/i.test(f)
      && /\.(ts|tsx|js|jsx|py|go|rs|java)$/.test(f)
    ).length;
    observability = Math.min(100, observabilityFiles * 5);
    reasons.push(`observability: ${observability} (${observabilityFiles} matching files in project)`);
  }

  // ux_exposure: frontend presence + frontend_route
  let ux_exposure = 0;
  if (applicableSet.has('ux_exposure') && hasFrontend) {
    ux_exposure = cap.frontend_route ? 80 : 40;
    if (frontendCount > 3) ux_exposure = Math.min(100, ux_exposure + 20);
    reasons.push(`ux_exposure: ${ux_exposure} (route ${cap.frontend_route ? 'set' : 'not set'}, ${frontendCount} components)`);
  }

  // automation: agent layer presence
  let automation = 0;
  if (applicableSet.has('automation')) {
    automation = hasAgents ? Math.min(100, 40 + agentCount * 10) : 0;
    if (hasAgents) reasons.push(`automation: ${automation} (${agentCount} agent files)`);
  }

  // production_readiness: composite of all-layers + repo-level deploy artifacts
  let production_readiness = 0;
  if (applicableSet.has('production_readiness')) {
    const hasDeployArtifacts = projectFileTree.some(f => /Dockerfile|docker-compose|\.github\/workflows/i.test(f));
    // For services: backend + frontend + agents + deploy
    // For pages/components: frontend + deploy
    // For agents: backend + agents + deploy
    if (kind === 'page' || kind === 'component') {
      if (hasFrontend) production_readiness += 60;
      if (hasDeployArtifacts) production_readiness += 40;
    } else if (kind === 'agent') {
      if (hasBackend) production_readiness += 40;
      if (hasAgents) production_readiness += 40;
      if (hasDeployArtifacts) production_readiness += 20;
    } else {
      // service
      if (hasBackend) production_readiness += 30;
      if (hasFrontend) production_readiness += 30;
      if (hasAgents) production_readiness += 20;
      if (hasDeployArtifacts) production_readiness += 20;
    }
    production_readiness = Math.min(100, production_readiness);
    reasons.push(`production_readiness: ${production_readiness} (deploy artifacts: ${hasDeployArtifacts})`);
  }

  // Final composite — average over APPLICABLE dimensions only.
  // Each dimension's value is 0-100; sum and divide by applicable count.
  const allValues: Record<DimensionKey, number> = {
    determinism, reliability, observability, ux_exposure, automation, production_readiness,
  };
  const applicableValues = applicable.map(d => allValues[d]);
  const score = applicableValues.length === 0
    ? 0
    : Math.round(applicableValues.reduce((s, v) => s + v, 0) / applicableValues.length);

  reasons.push(`kind=${kind}, applicable dimensions: [${applicable.join(', ')}]`);

  return {
    score: clamp(score),
    determinism: clamp(determinism),
    reliability: clamp(reliability),
    observability: clamp(observability),
    ux_exposure: clamp(ux_exposure),
    automation: clamp(automation),
    production_readiness: clamp(production_readiness),
    reasons,
    applicable_dimensions: Object.freeze([...applicable]),
  };
}

function clamp(n: number): Score0to100 {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
