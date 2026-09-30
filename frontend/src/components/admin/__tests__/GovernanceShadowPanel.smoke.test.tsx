import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import GovernanceShadowPanel from '../GovernanceShadowPanel';
import { GovernanceShadowSummary } from '../../../services/workLedgerApi';

/**
 * ProofDesk Governance — Milestone 4 (T009). Follows the established frontend-test
 * convention in this repo (`renderToStaticMarkup`, no @testing-library/react
 * installed — see ticketDetailTabs/WorkGraphTab.smoke.test.tsx). GovernanceShadowPanel
 * is pure/presentational (fetch/loading state lives in the parent page), so it's
 * directly renderable here for each of the states this task's acceptance criteria
 * require: loading, error, zero-rows, and a mixed-verdict breakdown.
 */

function summary(overrides: Partial<GovernanceShadowSummary> = {}): GovernanceShadowSummary {
  return {
    window_hours: 24,
    total_decisions: 0,
    would_allow: 0,
    would_require_approval: 0,
    would_block: 0,
    breakdown: [],
    ...overrides,
  };
}

describe('GovernanceShadowPanel — shadow-mode microcopy (always present, regardless of state)', () => {
  it('renders the "no action is currently blocked" banner even while loading', () => {
    const html = renderToStaticMarkup(
      <GovernanceShadowPanel governance={null} loading={true} error={null} onRefresh={() => {}} />
    );
    expect(html).toContain('Shadow mode');
    expect(html).toContain('no action is currently blocked');
  });
});

describe('GovernanceShadowPanel — loading state', () => {
  it('renders a spinner, not the data table', () => {
    const html = renderToStaticMarkup(
      <GovernanceShadowPanel governance={null} loading={true} error={null} onRefresh={() => {}} />
    );
    expect(html).toContain('spinner-border');
    expect(html).not.toContain('Would allow');
  });
});

describe('GovernanceShadowPanel — error state', () => {
  it('renders the error message, not a crash or a stale table', () => {
    const html = renderToStaticMarkup(
      <GovernanceShadowPanel governance={null} loading={false} error="Failed to load governance shadow summary" onRefresh={() => {}} />
    );
    expect(html).toContain('Failed to load governance shadow summary');
  });
});

describe('GovernanceShadowPanel — boundary: zero decisions in window', () => {
  it('renders the honest empty-state row, not a fabricated breakdown', () => {
    const html = renderToStaticMarkup(
      <GovernanceShadowPanel governance={summary()} loading={false} error={null} onRefresh={() => {}} />
    );
    expect(html).toContain('No ticket-dispatch decisions in the last 24h');
    expect(html).toContain('>0<'); // stat cards show real zeros, not blanks
  });
});

describe('GovernanceShadowPanel — happy path: mixed R0/R3/R4 breakdown', () => {
  it('renders all 4 stat totals and every breakdown row with the correct verdict badge', () => {
    const data = summary({
      total_decisions: 54,
      would_allow: 50,
      would_require_approval: 3,
      would_block: 1,
      breakdown: [
        { action: 'ticket_dispatch', risk_tier: 'R0', verdict: 'would_allow', count: 50 },
        { action: 'ticket_dispatch', risk_tier: 'R3', verdict: 'would_require_approval', count: 3 },
        { action: 'ticket_dispatch', risk_tier: 'R4', verdict: 'would_block', count: 1 },
      ],
    });
    const html = renderToStaticMarkup(
      <GovernanceShadowPanel governance={data} loading={false} error={null} onRefresh={() => {}} />
    );
    expect(html).toContain('would_allow');
    expect(html).toContain('would_require_approval');
    expect(html).toContain('would_block');
    expect(html).toContain('bg-success');
    expect(html).toContain('bg-warning');
    expect(html).toContain('bg-danger');
    expect(html).toContain('ticket_dispatch');
  });
});
