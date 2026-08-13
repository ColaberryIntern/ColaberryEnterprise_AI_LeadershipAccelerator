import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import OutcomeMeasurementsPanel from '../OutcomeMeasurementsPanel';
import { OutcomeMeasurementsSummary } from '../../../services/workLedgerApi';

// ProofDesk Outcomes & Learning — Milestone 5 (T010). Matches
// GovernanceShadowPanel.smoke.test.tsx's convention.

describe('OutcomeMeasurementsPanel — loading state', () => {
  it('renders a spinner, not the stat row', () => {
    const html = renderToStaticMarkup(<OutcomeMeasurementsPanel summary={null} loading={true} error={null} onRefresh={() => {}} />);
    expect(html).toContain('spinner-border');
    expect(html).not.toContain('Stable');
  });
});

describe('OutcomeMeasurementsPanel — error state', () => {
  it('renders the error message, not a crash or stale content', () => {
    const html = renderToStaticMarkup(
      <OutcomeMeasurementsPanel summary={null} loading={false} error="Failed to load outcome measurements summary" onRefresh={() => {}} />,
    );
    expect(html).toContain('Failed to load outcome measurements summary');
  });
});

describe('OutcomeMeasurementsPanel — boundary: nothing scheduled yet', () => {
  it('renders the honest empty-state message, not fabricated zeros in a stat grid', () => {
    const empty: OutcomeMeasurementsSummary = { scheduled: 0, observed: 0, stable: 0, recurrence_detected: 0, insufficient_data: 0 };
    const html = renderToStaticMarkup(<OutcomeMeasurementsPanel summary={empty} loading={false} error={null} onRefresh={() => {}} />);
    expect(html).toContain('nothing scheduled');
  });
});

describe('OutcomeMeasurementsPanel — happy path: mixed lifecycle counts', () => {
  it('renders all 5 stat totals', () => {
    const summary: OutcomeMeasurementsSummary = {
      scheduled: 3,
      observed: 5,
      stable: 2,
      recurrence_detected: 1,
      insufficient_data: 2,
    };
    const html = renderToStaticMarkup(<OutcomeMeasurementsPanel summary={summary} loading={false} error={null} onRefresh={() => {}} />);
    expect(html).toContain('Scheduled');
    expect(html).toContain('Observed');
    expect(html).toContain('Stable');
    expect(html).toContain('Recurrence detected');
    expect(html).toContain('Insufficient data');
  });
});
