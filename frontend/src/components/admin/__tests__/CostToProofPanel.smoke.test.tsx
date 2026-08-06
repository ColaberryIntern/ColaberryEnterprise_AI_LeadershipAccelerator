import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CostToProofPanel from '../CostToProofPanel';
import { CostToProofEntry } from '../../../services/workLedgerApi';

// ProofDesk Outcomes & Learning — Milestone 5 (T010). Matches
// GovernanceShadowPanel.smoke.test.tsx's convention.

describe('CostToProofPanel — honesty banner (always present, regardless of state)', () => {
  it('renders the "dollar cost is not tracked yet" disclosure even while loading', () => {
    const html = renderToStaticMarkup(<CostToProofPanel entries={null} loading={true} error={null} onRefresh={() => {}} />);
    expect(html).toContain('Dollar cost is not tracked yet');
  });
});

describe('CostToProofPanel — loading state', () => {
  it('renders a spinner, not the data table', () => {
    const html = renderToStaticMarkup(<CostToProofPanel entries={null} loading={true} error={null} onRefresh={() => {}} />);
    expect(html).toContain('spinner-border');
    expect(html).not.toContain('Verified count');
  });
});

describe('CostToProofPanel — error state', () => {
  it('renders the error message, not a crash or a stale table', () => {
    const html = renderToStaticMarkup(
      <CostToProofPanel entries={null} loading={false} error="Failed to load cost-to-proof stats" onRefresh={() => {}} />,
    );
    expect(html).toContain('Failed to load cost-to-proof stats');
  });
});

describe('CostToProofPanel — boundary: no verified work units', () => {
  it('renders the honest empty-state message', () => {
    const html = renderToStaticMarkup(<CostToProofPanel entries={[]} loading={false} error={null} onRefresh={() => {}} />);
    expect(html).toContain('No verified (done) work units yet');
  });
});

describe('CostToProofPanel — happy path: mixed sufficient/insufficient data', () => {
  it('renders formatted durations for sufficient data and an insufficient-data badge otherwise', () => {
    const entries: CostToProofEntry[] = [
      {
        capability: 'curriculum.qa_check',
        verified_count: 2,
        avg_duration_to_proof_ms: 2000,
        status: 'sufficient_data',
        cost_usd_note: 'cost_usd is not populated by any current write path in this repo; this metric uses duration as the real, measurable proxy.',
      },
      {
        capability: 'bug.platform_fix',
        verified_count: 2,
        avg_duration_to_proof_ms: null,
        status: 'insufficient_data',
        cost_usd_note: 'cost_usd is not populated by any current write path in this repo; this metric uses duration as the real, measurable proxy.',
      },
    ];
    const html = renderToStaticMarkup(<CostToProofPanel entries={entries} loading={false} error={null} onRefresh={() => {}} />);
    expect(html).toContain('curriculum.qa_check');
    expect(html).toContain('2.0s');
    expect(html).toContain('insufficient data');
  });
});
