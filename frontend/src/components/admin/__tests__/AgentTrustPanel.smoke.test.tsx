import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AgentTrustPanel from '../AgentTrustPanel';
import { AgentTrustEntry } from '../../../services/workLedgerApi';

// ProofDesk Outcomes & Learning — Milestone 5 (T010). Follows the established
// GovernanceShadowPanel.smoke.test.tsx convention: pure/presentational panel, so it's
// directly renderable for loading/error/boundary/happy-path states via
// renderToStaticMarkup.

describe('AgentTrustPanel — loading state', () => {
  it('renders a spinner, not the data table', () => {
    const html = renderToStaticMarkup(<AgentTrustPanel entries={null} loading={true} error={null} onRefresh={() => {}} />);
    expect(html).toContain('spinner-border');
    expect(html).not.toContain('Success rate');
  });
});

describe('AgentTrustPanel — error state', () => {
  it('renders the error message, not a crash or a stale table', () => {
    const html = renderToStaticMarkup(
      <AgentTrustPanel entries={null} loading={false} error="Failed to load agent trust stats" onRefresh={() => {}} />,
    );
    expect(html).toContain('Failed to load agent trust stats');
  });
});

describe('AgentTrustPanel — boundary: zero work-unit data (the real production state today)', () => {
  it('renders the honest empty-state message, not a fabricated rate', () => {
    const html = renderToStaticMarkup(<AgentTrustPanel entries={[]} loading={false} error={null} onRefresh={() => {}} />);
    expect(html).toContain('No data yet');
    expect(html).toContain('opt-in');
  });
});

describe('AgentTrustPanel — happy path: mixed sufficient/insufficient data', () => {
  it('renders success-rate badges for sufficient data and an insufficient-data badge otherwise', () => {
    const entries: AgentTrustEntry[] = [
      {
        agent_name: 'CurriculumQAAgent',
        capability: 'curriculum.qa_check',
        risk_tier: 'R1',
        total: 3,
        succeeded: 2,
        failed: 1,
        success_rate: 0.667,
        status: 'sufficient_data',
      },
      {
        agent_name: 'CurriculumArchitectAgent',
        capability: 'curriculum.design_module',
        risk_tier: 'R2',
        total: 0,
        succeeded: 0,
        failed: 0,
        success_rate: null,
        status: 'insufficient_data',
      },
    ];
    const html = renderToStaticMarkup(<AgentTrustPanel entries={entries} loading={false} error={null} onRefresh={() => {}} />);
    expect(html).toContain('CurriculumQAAgent');
    expect(html).toContain('curriculum.qa_check');
    expect(html).toContain('67%');
    expect(html).toContain('insufficient data');
  });
});
