import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VisualProofContent } from '../VisualProofTab';

/**
 * Ticket Board Honesty fix (2026-08-16, session CC-20260816-q4mz) — Visual Proof tab's
 * 3-state render. Follows the established frontend-test convention in this repo
 * (`renderToStaticMarkup`, no `@testing-library/react` installed — see
 * `WorkGraphTab.smoke.test.tsx`). `VisualProofContent` (named export, pure/
 * presentational) is exercised directly for exactly the 3 states this fix requires:
 * real evidence present, "not applicable for this ticket type", and "no evidence
 * captured yet" (only when the category genuinely expects one).
 */

function artifact(id: string, artifact_type = 'screenshot', overrides: Partial<Parameters<typeof VisualProofContent>[0]['evidence'][0]> = {}) {
  return {
    id,
    artifact_type,
    storage_ref: null,
    title: null,
    captured_at: null,
    created_at: '2026-08-12T15:00:00Z',
    ...overrides,
  };
}

describe('VisualProofContent — real evidence present', () => {
  it('renders the evidence cards, regardless of expectation value', () => {
    const html = renderToStaticMarkup(
      <VisualProofContent evidence={[artifact('ev-1')]} expectation="not_applicable" />,
    );
    expect(html).toContain('screenshot');
    expect(html).not.toContain('Not applicable');
    expect(html).not.toContain('No visual evidence captured yet');
  });
});

describe('VisualProofContent — empty, not_applicable', () => {
  it('renders "Not applicable for this ticket type." — not the old generic dead text', () => {
    const html = renderToStaticMarkup(<VisualProofContent evidence={[]} expectation="not_applicable" />);
    expect(html).toContain('Not applicable for this ticket type.');
    expect(html).not.toContain('No visual evidence captured yet');
  });
});

describe('VisualProofContent — empty, expected', () => {
  it('renders "No visual evidence captured yet for this ticket." — a real, flaggable gap for a category that should have one', () => {
    const html = renderToStaticMarkup(<VisualProofContent evidence={[]} expectation="expected" />);
    expect(html).toContain('No visual evidence captured yet for this ticket.');
    expect(html).not.toContain('Not applicable');
  });
});
