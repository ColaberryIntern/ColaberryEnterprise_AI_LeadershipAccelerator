import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import AdminRevenueRoomPage, { InitiativeCardView } from '../AdminRevenueRoomPage';
import type { InitiativeCard } from '../AdminRevenueRoomPage';

jest.mock('../../../utils/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

/**
 * R1 acceptance: the page shows real data where it exists and the five-state vocabulary
 * where it does not, and never a number nobody measured.
 *
 * `renderToStaticMarkup` never runs effects, so the page's own fetch cannot populate a
 * card here. That is why `InitiativeCardView` is exported and tested directly: the
 * invariant has to be reachable or it is only asserted by reading the source.
 */
const card = (over: Partial<InitiativeCard> = {}): InitiativeCard => ({
  key: 'k',
  label: 'An initiative',
  kind: 'membership',
  status: 'live',
  value: '$120,000',
  sourceTable: 'subscriptions',
  provenance: 'Annualized from active subscriptions carrying a payment id.',
  owner: 'Ali',
  nextDeadline: null,
  nextDeadlineMeans: null,
  lastActivity: null,
  drillDownKey: 'k',
  ...over,
});

const render = (c: InitiativeCard) =>
  renderToStaticMarkup(<MemoryRouter><InitiativeCardView card={c} /></MemoryRouter>);

describe('a card shows a number only if a number was measured', () => {
  it('prints the value for a measured card', () => {
    const html = render(card());
    expect(html).toContain('$120,000');
    expect(html).toContain('data-has-number="yes"');
  });

  it('prints a measured zero, because zero is a finding', () => {
    const html = render(card({ status: 'measured_zero', value: '0' }));
    expect(html).toContain('data-has-number="yes"');
    expect(html).toContain('>0<');
  });

  // The failure this page exists to prevent: an unmeasured card that looks measured.
  it('prints NO number for an unmeasurable card, even when a value is supplied', () => {
    const html = render(card({ status: 'unmeasurable', value: '12' }));
    expect(html).toContain('data-has-number="no"');
    expect(html).not.toContain('>12<');
    expect(html).toContain('No number is shown because none can be measured.');
  });

  it('prints no number for an undefined rate', () => {
    const html = render(card({ status: 'undefined_rate', value: '0%' }));
    expect(html).toContain('data-has-number="no"');
    expect(html).not.toContain('0%');
  });

  it('shows a proxy value, since a proxy is measured but is not the metric', () => {
    const html = render(card({ status: 'proxy', value: '12' }));
    expect(html).toContain('data-has-number="yes"');
    expect(html).toContain('status-chip-proxy');
  });
});

describe('status and health are carried separately', () => {
  it('renders a verdict beside the status for a revenue bet', () => {
    const html = render(card({
      key: 'bet', kind: 'hypothesis', status: 'measured_zero',
      value: '0 of 3', verdict: 'no_evidence',
    }));
    expect(html).toContain('status-chip-measured_zero');
    expect(html).toContain('verdict-bet');
    expect(html).toContain('Pipe is empty');
  });

  it('names an uncountable bet as an admission rather than a neutral label', () => {
    const html = render(card({ kind: 'hypothesis', status: 'unmeasurable', value: null, verdict: 'uncountable' }));
    expect(html).toContain('Cannot be measured yet');
  });

  it('omits the verdict entirely for things that are not bets', () => {
    const html = render(card({ key: 'm' }));
    expect(html).not.toContain('verdict-m');
  });
});

describe('a missing deadline is stated, never shown as a dash', () => {
  it('says nothing records one when the deadline is null', () => {
    const html = render(card({ nextDeadline: null }));
    expect(html).toContain('No deadline is recorded for this anywhere in the system.');
  });

  it('shows the date and what happens on it', () => {
    const html = render(card({
      nextDeadline: '2026-11-30',
      nextDeadlineMeans: 'Survives if at least one pilot has been proposed.',
    }));
    expect(html).toContain('2026-11-30');
    expect(html).toContain('Survives if at least one pilot has been proposed.');
  });
});

describe('the card carries its provenance and its caveat', () => {
  it('always shows where the number came from', () => {
    expect(render(card())).toContain('Annualized from active subscriptions');
  });

  it('shows a caveat when one is supplied', () => {
    const html = render(card({ caveat: 'This is a flag count, not a pipeline.' }));
    expect(html).toContain('This is a flag count, not a pipeline.');
  });

  it('links to the drill-down R4 will build, rather than looking clickable and going nowhere', () => {
    const html = render(card({ key: 'gov', drillDownKey: 'gov_bid_pursuit' }));
    expect(html).toContain('/admin/revenue-room/gov_bid_pursuit');
    expect(html).toContain('drill-gov');
  });

  it('names an owner, so no card is unowned', () => {
    expect(render(card())).toContain('Ali');
  });
});

describe('the page shell mounts', () => {
  it('renders the marker a route check can see', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter><AdminRevenueRoomPage /></MemoryRouter>,
    );
    expect(html).toContain('data-testid="revenue-room"');
    expect(html).toContain('The Revenue Room');
  });
});
