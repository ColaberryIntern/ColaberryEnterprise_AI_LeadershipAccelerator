import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChannelTable, type ChannelRow, type ChannelTruth } from '../ChannelTruthPanel';

jest.mock('../../../../utils/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

/**
 * R19 acceptance: "Ram can see where the people who pay us came from, and what we spent to get
 * them, without being shown a number nobody measured."
 *
 * `renderToStaticMarkup` never runs effects, so `ChannelTable` is exported and rendered
 * directly. That is the right seam anyway: every invariant below is a property of how a row
 * renders, not of how the panel fetches.
 *
 * The fixtures are production's real figures, measured read-only on 2026-11-17.
 */
const row = (over: Partial<ChannelRow> = {}): ChannelRow => ({
  key: 'open_house',
  label: 'Open house',
  leads: 798,
  payingMembers: 16,
  mrrCents: 298400,
  spendCents: null,
  costPerPayingMemberCents: null,
  status: 'live',
  costStatus: 'unmeasurable',
  note: 'No spend was ever recorded against this channel.',
  ...over,
});

const report = (rows: ChannelRow[], over: Partial<ChannelTruth> = {}): ChannelTruth => ({
  asOf: '2026-11-17T00:00:00.000Z',
  rows,
  totals: {
    payingMembers: rows.reduce((t, r) => t + r.payingMembers, 0),
    mrrCents: rows.reduce((t, r) => t + r.mrrCents, 0),
    recordedSpendCents: 389480,
  },
  caveats: [],
  ...over,
});

const render = (r: ChannelTruth) => renderToStaticMarkup(<ChannelTable report={r} />);

describe('the channel panel never prints a number nobody measured', () => {
  it('says "Not recorded", not $0, where no spend was ever recorded', () => {
    const html = render(report([row()]));
    // $0 here would assert the open house cost nothing. It was not measured, which differs.
    expect(html).not.toContain('$0');
    // Spelled out rather than punctuated: a bare hyphen in a money column reads as zero.
    // (House style also bans the em dash in frontend source, per the D1 typography gate.)
    expect(html).toContain('Not recorded');
  });

  it('shows the spend and a dash for cost when a channel was paid for and nobody paid back', () => {
    const html = render(report([row({
      key: 'paid_landing',
      label: 'Paid ads and landing pages',
      leads: 506,
      payingMembers: 0,
      mrrCents: 0,
      spendCents: 389480,
      costPerPayingMemberCents: null,
      status: 'measured_zero',
      costStatus: 'undefined_rate',
      note: 'Spend is recorded here and no member from this channel is paying today.',
    })]));
    // The most useful fact on the panel: $3,895 spent, nobody paying. Both must be visible.
    expect(html).toContain('$3,895');
    expect(html).toContain('channel-row-paid_landing');
    // And the cost cell must not invent a figure from a zero denominator. Scoped to the cell
    // itself: an earlier version of this matched lazily across the whole table and tripped on
    // the footer's own spend total, which proved nothing about the cell.
    expect(html).toMatch(/data-testid="channel-cost-paid_landing"><div>-<\/div>/);
  });

  it('never blends a cost per member across channels in the total row', () => {
    const html = render(report([
      row(),
      row({ key: 'paid_landing', payingMembers: 0, mrrCents: 0, spendCents: 389480, costStatus: 'undefined_rate' }),
    ]));
    // $389480 / 16 members would be a plausible-looking, entirely invented CAC.
    expect(html).toContain('Not blended on purpose');
    expect(html).not.toContain('$24,343');
  });

  it('carries two independent chips, because the count and the cost fail separately', () => {
    const html = render(report([row({ status: 'live', costStatus: 'unmeasurable' })]));
    // A live member count beside an unknowable cost is a legitimate, common row.
    expect(html).toContain('channel-row-open_house');
    expect(html).toContain('channel-cost-open_house');
  });

  it('prints the row note, which is where the reason for a blank cell lives', () => {
    expect(render(report([row()]))).toContain('No spend was ever recorded against this channel.');
  });

  it('says nothing rather than claiming an empty business when no channel has data', () => {
    const html = render(report([]));
    expect(html).toContain('channel-empty');
    expect(html).toMatch(/failure to measure rather than a business with no customers/);
  });

  it('shows the caveats, so the panel cannot be quoted without them', () => {
    const html = render(report([row()], {
      caveats: ['Lead counts are lifetime and paying members are who pays today.'],
    }));
    expect(html).toContain('channel-caveats');
    expect(html).toContain('Lead counts are lifetime');
  });

  it('formats money and counts for a reader, not a machine', () => {
    const html = render(report([row({ leads: 20688, payingMembers: 5, mrrCents: 94500 })]));
    expect(html).toContain('20,688');
    expect(html).toContain('$945');
  });
});
