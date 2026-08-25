import React from 'react';
import { CASE_STUDY_CONTROLS, CASE_STUDY_STATES, stateByKey } from './caseStudyDesk';

/**
 * CaseStudyStateTabs — spec §18's worklist states.
 *
 * Each tab issues its OWN list request; it is not a client-side re-slice of one
 * fetch, because "Archived" needs `includeArchived` and the others must not see
 * archived rows at all. The two states the API cannot answer (Needs Evidence,
 * Sync Issues) additionally carry a lens applied to the desk scan, and the hint
 * under the strip always names the basis of the current filter so nobody has to
 * infer what they are looking at.
 */

interface Props {
  active: string;
  onSelect: (key: string) => void;
  /** Per-state counts of what is actually on screen, never a guess. */
  visibleCount: number;
  total: number;
}

export default function CaseStudyStateTabs({
  active, onSelect, visibleCount, total,
}: Props): React.ReactElement {
  const current = stateByKey(active);
  return (
    <div data-testid={CASE_STUDY_CONTROLS['candidate states']} className="mb-3">
      <div className="btn-group flex-wrap" role="group" aria-label="Case Study states">
        {CASE_STUDY_STATES.map((state) => (
          <button
            key={state.key}
            type="button"
            data-testid={`cs-state-${state.key}`}
            aria-pressed={state.key === active}
            className={`btn btn-sm ${state.key === active ? 'btn-danger' : 'btn-outline-secondary'}`}
            onClick={() => onSelect(state.key)}
          >
            {state.label}
          </button>
        ))}
      </div>
      <p className="small text-muted mb-0 mt-2">
        {current.hint}
        {' '}
        Showing {visibleCount} of {total} record{total === 1 ? '' : 's'} returned for this state.
      </p>
    </div>
  );
}
