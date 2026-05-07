/**
 * operationalEpidemiologyEngine — Phase 16. Honest framing per the
 * stress-test: this is **temporal+spatial clustering of contradictions
 * and mutations**, NOT an SIR epidemiology model. It outputs an
 * `OperationalEpidemiologyMap` per project with a per-anchor
 * `OperationalSpreadClassification`.
 *
 * Inputs come from the lineage graph + propagation profile + Phase 15
 * containment + automation-mode signals. Outputs are pure data.
 */

import type {
  OperationalLineageGraph, ContradictionPropagationProfile,
  OperationalEpidemiologyMap, OperationalSpreadClassification,
  LineageNode,
} from './causalityTypes';
import { descendantsOf } from './mutationLineageGraph';
import { PROPAGATION_TEMPORAL_WINDOW_MS } from './causalityTypes';

export interface BuildEpidemiologyInput {
  readonly graph: OperationalLineageGraph;
  readonly propagation: ContradictionPropagationProfile;
  readonly already_contained_subjects?: ReadonlyArray<string>;
  readonly frozen_subjects?: ReadonlyArray<string>;
  readonly prior_window_subjects?: ReadonlyArray<string>;
  readonly now_ms?: number;
}

export function buildOperationalEpidemiologyMap(input: BuildEpidemiologyInput): OperationalEpidemiologyMap {
  const now = input.now_ms ?? Date.now();
  const windowStart = now - PROPAGATION_TEMPORAL_WINDOW_MS;

  const alreadyContained = new Set(input.already_contained_subjects ?? []);
  const frozen = new Set(input.frozen_subjects ?? []);
  const priorSubjects = new Set(input.prior_window_subjects ?? []);

  // Group nodes by subject; only those with a non-null subject_id participate.
  const bySubject = new Map<string, LineageNode[]>();
  for (const node of input.graph.nodes) {
    if (!node.subject_id) continue;
    const arr = bySubject.get(node.subject_id) || [];
    arr.push(node);
    bySubject.set(node.subject_id, arr);
  }

  type ClassifiedEntry = OperationalEpidemiologyMap['classified_spreads'][number];
  const classified: ClassifiedEntry[] = [];
  for (const [subject, nodes] of bySubject.entries()) {
    const descendantSubjects = new Set<string>();
    let mutationCount = 0;
    let contradictionCount = 0;
    let worstSeverity: 'info' | 'warning' | 'error' = 'info';
    for (const n of nodes) {
      if (n.kind === 'mutation') mutationCount++;
      else if (n.kind === 'contradiction') contradictionCount++;
      // Look at descendants to discover affected sibling subjects.
      const desc = descendantsOf(input.graph, n.node_id);
      for (const d of desc) {
        if (d.subject_id && d.subject_id !== subject) descendantSubjects.add(d.subject_id);
      }
      if (n.severity === 'error') worstSeverity = 'error';
      else if (n.severity === 'warning' && worstSeverity !== 'error') worstSeverity = 'warning';
    }

    let classification: OperationalSpreadClassification;
    if (frozen.has(subject)) classification = 'suppressed';
    else if (alreadyContained.has(subject)) classification = 'isolated';
    else if (priorSubjects.has(subject)) classification = 'recurrent';
    else if (descendantSubjects.size >= 3) classification = 'cascading';
    else if (descendantSubjects.size >= 1) classification = 'branching';
    else classification = 'localized';

    classified.push({
      anchor_subject: subject,
      classification,
      affected_subjects: Array.from(descendantSubjects).slice(0, 20),
      contradiction_count: contradictionCount,
      mutation_count: mutationCount,
      worst_severity: worstSeverity,
    });
  }

  // Diffusion score: how many distinct subjects were touched in the window.
  const touchedSubjects = new Set<string>();
  for (const n of input.graph.nodes) {
    if (n.subject_id && Date.parse(n.timestamp) >= windowStart) touchedSubjects.add(n.subject_id);
  }
  const totalSubjects = bySubject.size;
  const diffusion_score = totalSubjects === 0 ? 0 : Math.round((touchedSubjects.size / totalSubjects) * 100);

  return {
    project_id: input.graph.project_id,
    window_start: new Date(windowStart).toISOString(),
    window_end: new Date(now).toISOString(),
    classified_spreads: classified.sort((a: ClassifiedEntry, b: ClassifiedEntry) => b.contradiction_count - a.contradiction_count),
    diffusion_score,
    built_at: new Date(now).toISOString(),
  };
}

export const _PROPAGATION_TEMPORAL_WINDOW_MS_FOR_EPIDEMIOLOGY_TESTS = PROPAGATION_TEMPORAL_WINDOW_MS;
