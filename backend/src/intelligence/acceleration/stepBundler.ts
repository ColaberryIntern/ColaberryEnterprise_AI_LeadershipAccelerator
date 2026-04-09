/**
 * Step Bundler — identifies groups of execution steps that can safely
 * run in parallel based on dependency analysis. Uses golden path
 * parallelization data when available.
 */
import { ExecutionAction } from '../nextBestActionEngine';
import { GoldenPath } from './goldenPaths';

export interface StepBundle {
  bundle_id: string;
  steps: string[];
  labels: string[];
  can_parallelize: boolean;
  estimated_total_minutes: number;
}

// Steps that must NEVER run in parallel (sequential dependencies)
const SEQUENTIAL_PAIRS = new Set([
  'implement_requirements:verify_requirements',
  'build_backend:add_database',
  'build_backend:add_frontend',
  'build_backend:add_agents',
]);

// Steps that CAN safely run in parallel (independent layers)
const PARALLEL_GROUPS: string[][] = [
  ['add_database', 'add_frontend', 'add_agents'],
  ['improve_reliability', 'add_monitoring'],
  ['enhance_agents', 'add_monitoring'],
];

function canRunTogether(stepA: string, stepB: string): boolean {
  // Check if any sequential pair matches
  const pairKey1 = `${stepA}:${stepB}`;
  const pairKey2 = `${stepB}:${stepA}`;
  if (SEQUENTIAL_PAIRS.has(pairKey1) || SEQUENTIAL_PAIRS.has(pairKey2)) return false;

  // Check if any parallel group contains both
  return PARALLEL_GROUPS.some(group => group.includes(stepA) && group.includes(stepB));
}

/**
 * Identify bundles of steps that can run in parallel.
 * Returns individual steps plus any identified parallel bundles.
 */
export function identifyBundles(
  executionPlan: ExecutionAction[],
  goldenPath?: GoldenPath,
  maxBundleSize: number = 3
): StepBundle[] {
  const bundles: StepBundle[] = [];
  const used = new Set<string>();

  // If golden path is available, use its parallelization data
  if (goldenPath) {
    for (const gpStep of goldenPath.steps) {
      if (used.has(gpStep.key)) continue;
      if (gpStep.can_parallelize_with.length > 0) {
        const parallelKeys = gpStep.can_parallelize_with
          .filter(k => !used.has(k) && executionPlan.some(s => s.key === k && !s.blocked))
          .slice(0, maxBundleSize - 1);

        if (parallelKeys.length > 0 && executionPlan.some(s => s.key === gpStep.key && !s.blocked)) {
          const allKeys = [gpStep.key, ...parallelKeys];
          const allLabels = allKeys.map(k => executionPlan.find(s => s.key === k)?.label || k);
          bundles.push({
            bundle_id: `bundle_${allKeys.join('_')}`,
            steps: allKeys,
            labels: allLabels,
            can_parallelize: true,
            estimated_total_minutes: gpStep.estimated_minutes, // parallel = time of longest
          });
          allKeys.forEach(k => used.add(k));
        }
      }
    }
  }

  // For remaining steps, check static parallel groups
  for (const action of executionPlan) {
    if (used.has(action.key) || action.blocked) continue;

    const parallelCandidates = executionPlan
      .filter(s => !used.has(s.key) && !s.blocked && s.key !== action.key && canRunTogether(action.key, s.key))
      .slice(0, maxBundleSize - 1);

    if (parallelCandidates.length > 0) {
      const allKeys = [action.key, ...parallelCandidates.map(s => s.key)];
      const allLabels = [action.label, ...parallelCandidates.map(s => s.label)];
      bundles.push({
        bundle_id: `bundle_${allKeys.join('_')}`,
        steps: allKeys,
        labels: allLabels,
        can_parallelize: true,
        estimated_total_minutes: 30, // estimate for parallel group
      });
      allKeys.forEach(k => used.add(k));
    } else {
      // Single step — not parallelizable
      bundles.push({
        bundle_id: `single_${action.key}`,
        steps: [action.key],
        labels: [action.label],
        can_parallelize: false,
        estimated_total_minutes: 25, // default estimate
      });
      used.add(action.key);
    }
  }

  return bundles;
}
