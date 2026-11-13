import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import AdminRevenueRoomPage, { InitiativeCardView, tileAsCard } from '../AdminRevenueRoomPage';
import type { InitiativeCard, CommercialTile } from '../AdminRevenueRoomPage';

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

/**
 * R13 — the Commercialization board's tiles are cards on this page now. These tests exist
 * because the merge's failure mode is silent: a tile whose `falseFriend` is dropped looks
 * perfectly fine and quietly re-admits a source somebody already rejected.
 *
 * They replace AdminCommercializationPage.test.tsx, which went with its page.
 */
const tile = (over: Partial<CommercialTile> = {}): CommercialTile => ({
  key: 'demos',
  label: 'Demos booked',
  status: 'unmeasurable',
  value: null,
  sourceTable: null,
  provenance: 'No table records a demo booking.',
  ...over,
});

describe('a commercialization tile survives becoming a card', () => {
  it('carries the false friend across, so a rejected source is not rediscovered', () => {
    const html = render(tileAsCard(tile({
      falseFriend: 'workforce_meetings is internal leadership meetings',
    })));
    expect(html).toContain('Not this:');
    expect(html).toContain('workforce_meetings is internal leadership meetings');
  });

  it('keeps the tile text and its own empty-state wording', () => {
    const html = render(tileAsCard(tile()));
    expect(html).toContain('Demos booked');
    expect(html).toContain('No table records a demo booking.');
    expect(html).toContain('No number is shown because none can be measured.');
    expect(html).toContain('data-has-number="no"');
  });

  it('says an undefined rate has no deals rather than that it cannot be measured', () => {
    const html = render(tileAsCard(tile({ status: 'undefined_rate' })));
    expect(html).toContain('No closed deals either way');
    expect(html).not.toContain('No number is shown because none can be measured.');
  });

  it('still refuses a number on an unmeasurable tile even when one is supplied', () => {
    const html = render(tileAsCard(tile({ value: '42' })));
    expect(html).not.toContain('42');
    expect(html).toContain('data-has-number="no"');
  });

  it('prints a measured zero, because a zero that was measured is a finding', () => {
    const html = render(tileAsCard(tile({
      key: 'pipe', status: 'measured_zero', value: '0', sourceTable: 'revenue_opportunities',
    })));
    expect(html).toContain('>0<');
    expect(html).toContain('data-has-number="yes"');
  });

  it('offers no drill-down link, rather than one that goes nowhere', () => {
    const html = render(tileAsCard(tile()));
    expect(html).not.toContain('Open the full history');
  });

  it('shows no owner line, because that board never recorded one', () => {
    const html = render(tileAsCard(tile()));
    expect(html).not.toContain('ri-user-line');
  });

  it('states no deadline at all, rather than implying one is missing', () => {
    const html = render(tileAsCard(tile()));
    expect(html).not.toContain('No deadline is recorded');
  });

  it('namespaces the key, so a tile cannot collide with an initiative of the same name', () => {
    expect(tileAsCard(tile({ key: 'membership_subscriptions' })).key)
      .toBe('proof_membership_subscriptions');
  });

  it('is labelled as business proof, not as a revenue bet', () => {
    const html = render(tileAsCard(tile()));
    expect(html).toContain('Business proof');
    expect(html).not.toContain('Revenue bet');
  });
});
