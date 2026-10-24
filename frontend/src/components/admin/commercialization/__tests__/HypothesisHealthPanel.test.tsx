import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import HypothesisHealthPanel, { HypothesisRow } from '../HypothesisHealthPanel';

/**
 * C8.6 acceptance: "Dying hypotheses visually obvious."
 *
 * `renderToStaticMarkup` never runs effects, so the populated states are exercised
 * through `HypothesisRow` directly. That is the right seam anyway: what has to be true
 * is a property of how a row renders a verdict, not of how the panel fetches.
 */
const row = (over: Partial<Parameters<typeof HypothesisRow>[0]['h']> = {}) => ({
  key: 'paid_accelerator',
  label: 'Paid 90-day accelerator',
  whoPays: 'Mid-market enterprise',
  evidenceRequired: '3 paid pilots by 31 Dec',
  killCondition: 'Kill if 31 December 2026 passes with fewer than 3 paid pilots.',
  target: { stage: 'contract', count: 3, by: '2026-12-31' },
  verdict: 'no_evidence' as const,
  evidence: 0,
  inFlight: 0,
  daysRemaining: 69,
  tripwires: [],
  note: 'The pipe is empty rather than slow.',
  ...over,
});

const render = (h: ReturnType<typeof row>) => renderToStaticMarkup(<HypothesisRow h={h} />);

describe('a dying hypothesis cannot be scrolled past', () => {
  it('marks a no-evidence hypothesis as dying', () => {
    const html = render(row());
    expect(html).toContain('data-dying="yes"');
    expect(html).toContain('data-verdict="no_evidence"');
    expect(html).toContain('No evidence in flight');
  });

  it('marks a past-deadline hypothesis as dying', () => {
    expect(render(row({ verdict: 'past_deadline', daysRemaining: -5 })))
      .toContain('data-dying="yes"');
  });

  it('does NOT mark a confirmed or in-flight hypothesis as dying', () => {
    expect(render(row({ verdict: 'confirmed', evidence: 3 }))).toContain('data-dying="no"');
    expect(render(row({ verdict: 'in_flight', inFlight: 4 }))).toContain('data-dying="no"');
  });

  it('does NOT mark an uncountable hypothesis as dying', () => {
    // The one that matters: a bet the instrument cannot see is not a bet that is
    // failing, and colouring it red would get it killed for an instrumentation gap.
    const html = render(row({ verdict: 'uncountable', evidence: null }));
    expect(html).toContain('data-dying="no"');
    expect(html).toContain('Not yet measurable');
  });
});

describe('the kill condition is always on screen', () => {
  it('shows it for every verdict, not behind a disclosure', () => {
    for (const v of ['confirmed', 'in_flight', 'no_evidence', 'past_deadline', 'uncountable'] as const) {
      expect(render(row({ verdict: v }))).toContain('Kill condition:');
    }
  });

  it('states a fired tripwire with its date and what was observed', () => {
    const html = render(row({
      tripwires: [{
        on: '2026-11-30', survivesIf: 'at least one pilot has been proposed',
        atLeast: 1, due: true, observed: 0, tripped: true,
      }],
    }));
    expect(html).toContain('data-testid="tripwire-fired-paid_accelerator"');
    expect(html).toContain('2026-11-30');
    expect(html).toContain('at least one pilot has been proposed');
  });

  it('says nothing about a tripwire that has not fired', () => {
    const html = render(row({
      tripwires: [{
        on: '2026-11-30', survivesIf: 'at least one pilot has been proposed',
        atLeast: 1, due: false, observed: 0, tripped: false,
      }],
    }));
    expect(html).not.toContain('Tripwire fired');
  });
});

describe('counts are shown only when they were measured', () => {
  it('shows the running count for a measured hypothesis', () => {
    expect(render(row({ evidence: 1 }))).toContain('(1 of 3 so far)');
  });

  it('shows NO count when the stage is uncountable', () => {
    const html = render(row({ verdict: 'uncountable', evidence: null }));
    expect(html).not.toContain('so far)');
  });

  it('reads the deadline the right way round once it has passed', () => {
    expect(render(row({ daysRemaining: -5 }))).toContain('5 days past the deadline');
    expect(render(row({ daysRemaining: 69 }))).toContain('69 days remaining');
  });
});

describe('the panel itself', () => {
  it('renders before any data arrives without crashing', () => {
    expect(() => renderToStaticMarkup(
      <MemoryRouter><HypothesisHealthPanel /></MemoryRouter>,
    )).not.toThrow();
  });

  it('says the counts come from the funnel, not from manual entry', () => {
    // The acceptance criterion, stated where the reader sees it.
    const html = renderToStaticMarkup(
      <MemoryRouter><HypothesisHealthPanel /></MemoryRouter>,
    );
    expect(html).toMatch(/not from manual entry/);
  });
});
