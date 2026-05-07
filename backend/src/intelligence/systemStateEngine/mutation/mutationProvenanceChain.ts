/**
 * mutationProvenanceChain — pure helpers for assembling the cognition
 * lineage that caused a mutation. The chain answers "what cognition
 * led to this mutation?" — foundational for operational causality
 * replay (Phase 16+).
 *
 * Strictly pure. No DB writes. The directMutationEngine attaches the
 * resulting chain to a MutationEnvelope before persisting.
 */

import type {
  MutationProvenanceChain,
  MutationProvenanceEntry,
} from './mutationTypes';

const MAX_CHAIN_LENGTH = 8;     // bounds memory + audit-payload size

export interface AppendOpts {
  readonly source: MutationProvenanceEntry['source'];
  readonly summary: string;
  readonly source_id?: string;
  readonly severity?: 'info' | 'warning' | 'error';
}

export function emptyProvenance(): MutationProvenanceChain {
  return { entries: [], inherited_severity: 'info' };
}

export function appendProvenance(
  chain: MutationProvenanceChain,
  opts: AppendOpts,
): MutationProvenanceChain {
  const entry: MutationProvenanceEntry = {
    source: opts.source,
    summary: opts.summary.slice(0, 240),
    source_id: opts.source_id,
    recorded_at: new Date().toISOString(),
  };
  const next = [...chain.entries, entry].slice(-MAX_CHAIN_LENGTH);
  const inherited = escalateSeverity(chain.inherited_severity, opts.severity ?? 'info');
  return { entries: next, inherited_severity: inherited };
}

/**
 * Compose a chain from an array of partial entries. Convenience for
 * the engines that already have an ordered list of cognition steps.
 */
export function composeChain(
  steps: ReadonlyArray<AppendOpts>,
): MutationProvenanceChain {
  return steps.reduce<MutationProvenanceChain>(
    (chain, step) => appendProvenance(chain, step),
    emptyProvenance(),
  );
}

/**
 * Severity escalation table: error wins, then warning, then info.
 */
function escalateSeverity(
  current: 'info' | 'warning' | 'error',
  incoming: 'info' | 'warning' | 'error',
): 'info' | 'warning' | 'error' {
  if (current === 'error' || incoming === 'error') return 'error';
  if (current === 'warning' || incoming === 'warning') return 'warning';
  return 'info';
}

/**
 * Quick accessor — last summary in the chain. Used for human-facing
 * audit row payloads ("triggered by: …").
 */
export function lastTrigger(chain: MutationProvenanceChain): string | null {
  if (chain.entries.length === 0) return null;
  return chain.entries[chain.entries.length - 1].summary;
}

/**
 * Compact one-line representation for replay UIs.
 */
export function describeChain(chain: MutationProvenanceChain): string {
  if (chain.entries.length === 0) return '(no provenance)';
  return chain.entries.map(e => `${e.source}:${e.summary}`).join(' → ');
}

export const _MAX_PROVENANCE_LENGTH_FOR_TESTS = MAX_CHAIN_LENGTH;
