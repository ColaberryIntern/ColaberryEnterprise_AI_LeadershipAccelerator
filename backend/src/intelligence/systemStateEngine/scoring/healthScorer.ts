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
}

export function scoreHealth(
  cap: EngineCapabilityInput,
  projectFileTree: ReadonlyArray<string>,
): HealthBreakdown {
  const reasons: string[] = [];
  const backendCount = (cap.linked_backend_services || []).length;
  const frontendCount = (cap.linked_frontend_components || []).length;
  const agentCount = (cap.linked_agents || []).length;

  const hasBackend = backendCount > 0;
  const hasFrontend = frontendCount > 0 || !!cap.frontend_route;
  const hasAgents = agentCount > 0;

  // determinism: backend presence with low agent ratio = more deterministic
  let determinism = 0;
  if (hasBackend) {
    const ratio = backendCount / Math.max(1, backendCount + agentCount);
    determinism = Math.round(ratio * 100);
    reasons.push(`determinism: ${determinism} (${backendCount} backend / ${agentCount} agent files)`);
  }

  // reliability: rough — high if backend has many files (suggests proper structure)
  let reliability = 0;
  if (hasBackend) {
    reliability = Math.min(100, backendCount * 15);
    reasons.push(`reliability: ${reliability} (heuristic from backend file count)`);
  }

  // observability: project-wide signal — does the repo have monitoring/logging files
  const observabilityFiles = projectFileTree.filter(f =>
    /(monitor|metric|log|logger|telemetr|tracer?|trac(e|ing)|observ|alerts?)/i.test(f)
    && /\.(ts|tsx|js|jsx|py|go|rs|java)$/.test(f)
  ).length;
  const observability = Math.min(100, observabilityFiles * 5);
  reasons.push(`observability: ${observability} (${observabilityFiles} matching files in project)`);

  // ux_exposure: frontend presence + frontend_route
  let ux_exposure = 0;
  if (hasFrontend) {
    ux_exposure = cap.frontend_route ? 80 : 40;
    if (frontendCount > 3) ux_exposure = Math.min(100, ux_exposure + 20);
    reasons.push(`ux_exposure: ${ux_exposure} (route ${cap.frontend_route ? 'set' : 'not set'}, ${frontendCount} components)`);
  }

  // automation: agent layer presence
  const automation = hasAgents ? Math.min(100, 40 + agentCount * 10) : 0;
  if (hasAgents) reasons.push(`automation: ${automation} (${agentCount} agent files)`);

  // production_readiness: composite of all-layers + repo-level deploy artifacts
  const hasDeployArtifacts = projectFileTree.some(f => /Dockerfile|docker-compose|\.github\/workflows/i.test(f));
  let production_readiness = 0;
  if (hasBackend) production_readiness += 30;
  if (hasFrontend) production_readiness += 30;
  if (hasAgents) production_readiness += 20;
  if (hasDeployArtifacts) production_readiness += 20;
  production_readiness = Math.min(100, production_readiness);
  reasons.push(`production_readiness: ${production_readiness} (deploy artifacts: ${hasDeployArtifacts})`);

  // Final composite — equal weighting across 6 dimensions
  const score = Math.round(
    (determinism + reliability + observability + ux_exposure + automation + production_readiness) / 6
  );

  return {
    score: clamp(score),
    determinism: clamp(determinism),
    reliability: clamp(reliability),
    observability: clamp(observability),
    ux_exposure: clamp(ux_exposure),
    automation: clamp(automation),
    production_readiness: clamp(production_readiness),
    reasons,
  };
}

function clamp(n: number): Score0to100 {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
