import { automatedTestFiles } from './automatedTestFiles';
import { deliveryElapsedDays } from './deliveryElapsedDays';
import { productionSystemsDeclared } from './productionSystemsDeclared';
import type { MetricDefinition } from './metricDefinition';

/**
 * Every metric definition the runner can execute.
 *
 * Stage 3 of `METRIC_PROVENANCE_PIPELINE.md` adds two more definitions with zero
 * new mechanism, and this list is where that claim gets tested: if adding
 * `production_systems_declared` needs anything beyond one entry here and one
 * module beside it, then the definition interface got the boundary wrong.
 *
 * IT HELD. D2 and D3 are one module each plus one line each here. No change to
 * `MetricDefinition`, `MetricRunContext`, `MetricComputation`, the runner, the
 * writer, the context assembler, the routes, or the panel — every one of which
 * works on any definition without knowing which. The panel's definition dropdown
 * populates from this list, so the two new metrics became runnable in the
 * product without a line of UI.
 */
export const METRIC_DEFINITIONS: readonly MetricDefinition[] = [
  deliveryElapsedDays,
  productionSystemsDeclared,
  automatedTestFiles,
];

/** The definition for a key, or null. Keys are stable and equal `metric_key`. */
export function findMetricDefinition(key: string): MetricDefinition | null {
  return METRIC_DEFINITIONS.find((d) => d.key === key) ?? null;
}

export const METRIC_DEFINITION_KEYS: readonly string[] = METRIC_DEFINITIONS.map((d) => d.key);
