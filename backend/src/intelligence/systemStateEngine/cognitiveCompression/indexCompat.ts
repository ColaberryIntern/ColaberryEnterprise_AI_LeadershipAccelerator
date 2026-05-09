/**
 * indexCompat — Phase 24 internal helper. Provides a stable re-export
 * point for cross-module helpers that the summary counters need but
 * that aren't worth re-exporting from the top-level engine index yet.
 */

import { listAllOrganizations } from '../executionSubstrate/executionRuntimeCoordinator';

export function listExecutionOrganizations(): ReadonlyArray<string> {
  return listAllOrganizations();
}
