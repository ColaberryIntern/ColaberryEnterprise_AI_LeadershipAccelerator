import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DecisionsHistory } from '../DecisionsTab';

/**
 * Ticket Board Honesty fix (2026-08-16, session CC-20260816-q4mz) — Decisions tab's
 * History section 3-state render. Follows the established frontend-test convention
 * (`renderToStaticMarkup`, no `@testing-library/react` — see
 * `WorkGraphTab.smoke.test.tsx`). `DecisionsHistory` (named export, pure/
 * presentational) is exercised directly for the 3 states this fix requires.
 */

function decision(id: string, decision_type: 'approve' | 'reject' | 'override' | 'note' = 'approve') {
  return {
    id,
    ticket_id: 'tk-1',
    decision_type,
    actor_type: 'human',
    actor_id: 'ali',
    rationale: null,
    linked_evidence_ids: null,
    created_at: '2026-08-12T15:00:00Z',
  };
}

describe('DecisionsHistory — real decisions present', () => {
  it('renders the decision rows, regardless of expectation value', () => {
    const html = renderToStaticMarkup(
      <DecisionsHistory decisions={[decision('d-1')]} expectation="not_applicable" />,
    );
    expect(html).toContain('approve');
    expect(html).not.toContain('Not applicable');
    expect(html).not.toContain('No decisions recorded yet');
  });
});

describe('DecisionsHistory — empty, not_applicable', () => {
  it('renders "Not applicable for this ticket type." — not the old generic dead text', () => {
    const html = renderToStaticMarkup(<DecisionsHistory decisions={[]} expectation="not_applicable" />);
    expect(html).toContain('Not applicable for this ticket type.');
    expect(html).not.toContain('No decisions recorded yet');
  });
});

describe('DecisionsHistory — empty, expected', () => {
  it('renders "No decisions recorded yet." — a real, flaggable gap for a category that should have one', () => {
    const html = renderToStaticMarkup(<DecisionsHistory decisions={[]} expectation="expected" />);
    expect(html).toContain('No decisions recorded yet.');
    expect(html).not.toContain('Not applicable');
  });
});
