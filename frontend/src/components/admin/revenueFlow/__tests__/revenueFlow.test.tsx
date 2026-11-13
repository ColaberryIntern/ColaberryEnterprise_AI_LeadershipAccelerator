import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import FlowTimeline, { TimelineClassification, TimelineEvent } from '../FlowTimeline';
import FlowTableView from '../FlowTableView';
import FlowSparkline from '../FlowSparkline';
import { STREAM_PAINT, TONE, dollars, paintFor, streamPaint } from '../flowTokens';

/**
 * R16 Phase 2 acceptance.
 *
 * These test the rules that can break SILENTLY and look fine on screen: a counterfactual
 * amount rendered as revenue, a gap in the timeline quietly closed up, the table view
 * deleted as tidying, or a tone losing the word that makes it readable without colour.
 */
const CLASSES: Record<string, TimelineClassification> = {
  member_started: { key: 'member_started', label: 'Member started paying', tone: 'good', glyph: '▲', direction: 'in' },
  never_paid: { key: 'never_paid', label: 'Signed up, never paid', tone: 'warn', glyph: '○', direction: 'none' },
  refunded: { key: 'refunded', label: 'Refunded', tone: 'danger', glyph: '⤺', direction: 'out' },
  bid_flagged: { key: 'bid_flagged', label: 'Flagged for pursuit', tone: 'info', glyph: '◔', direction: 'none' },
};

const ev = (over: Partial<TimelineEvent> = {}): TimelineEvent => ({
  at: '2026-11-12',
  classification: 'member_started',
  stream: 'membership',
  label: 'monthly member started at $199',
  entityKey: 's-1',
  valueCents: 19_900,
  ...over,
});

const timeline = (events: TimelineEvent[]) =>
  renderToStaticMarkup(<FlowTimeline events={events} classifications={CLASSES} />);

describe('an amount that is not revenue never reads as revenue', () => {
  /**
   * 132 of 274 subscription rows carried no payment id on 2026-11-12. Their amount is what
   * the plan WOULD have been worth. Printing "$199" beside one of those, unqualified, is the
   * single most expensive thing this page could get wrong.
   */
  it('prefixes a never-paid amount with "would have been"', () => {
    const html = timeline([ev({ classification: 'never_paid', valueCents: 19_900 })]);
    expect(html).toContain('would have been');
    expect(html).toContain('$199');
  });

  it('does not prefix a real payment', () => {
    const html = timeline([ev()]);
    expect(html).toContain('$199');
    expect(html).not.toContain('would have been');
  });

  /**
   * The label here deliberately contains no dollar sign. An earlier version of this test
   * asserted `not.toContain('$')` against a fixture whose LABEL read "monthly member started
   * at $199", so it failed on prose the component was only passing through. The component
   * was right; the assertion was measuring the wrong thing.
   */
  it('shows no amount at all when the backend sent none', () => {
    const html = timeline([
      ev({ classification: 'bid_flagged', valueCents: null, label: 'Harris County flagged for pursuit' }),
    ]);
    expect(html).not.toContain('$');
    // And specifically: the bold value span the renderer uses for an amount is absent.
    expect(html).not.toContain('font-weight:700">');
  });
});

describe('a quiet stretch is drawn, not closed up', () => {
  /**
   * The internship report draws "4 days, no build work" instead of concatenating active
   * days. Carried over because a revenue timeline that silently joins up active days makes a
   * quiet fortnight look like continuous activity.
   */
  it('renders the gap and says how long it was', () => {
    const html = timeline([
      ev({ at: '2026-11-12' }),
      ev({ at: '2026-11-05', entityKey: 's-2' }),
    ]);
    expect(html).toContain('6 days, nothing recorded');
  });

  it('draws no gap between consecutive days', () => {
    const html = timeline([ev({ at: '2026-11-12' }), ev({ at: '2026-11-11', entityKey: 's-2' })]);
    expect(html).not.toContain('nothing recorded');
  });

  it('says so plainly when the window holds nothing', () => {
    const html = timeline([]);
    expect(html).toContain('a statement about the window');
  });
});

describe('meaning never depends on colour alone', () => {
  /**
   * The palette validation returned a contrast WARN on the light surface
   * (--status-success 2.94:1, --status-warning 2.39:1) whose required relief is "visible
   * labels or a table view". Both ship, and both are asserted, because either one being
   * removed looks like tidying and is actually an accessibility regression.
   */
  it('puts a glyph and a label on every pill', () => {
    const html = timeline([ev({ classification: 'never_paid' })]);
    expect(html).toContain('○');
    expect(html).toContain('Signed up, never paid');
  });

  it('gives every tone a word, not just a swatch', () => {
    for (const [, paint] of Object.entries(TONE)) {
      expect(paint.name.trim().length).toBeGreaterThan(2);
    }
  });

  it('ships a table view carrying the same events in words', () => {
    const html = renderToStaticMarkup(
      <FlowTableView events={[ev({ classification: 'never_paid' })]} classifications={CLASSES} />,
    );
    expect(html).toContain('data-testid="flow-table-view"');
    expect(html).toContain('Signed up, never paid');
    expect(html).toContain('<caption');
  });
});

describe('the table says whether each line is actually revenue', () => {
  it('calls money in "Yes, money in"', () => {
    const html = renderToStaticMarkup(<FlowTableView events={[ev()]} classifications={CLASSES} />);
    expect(html).toContain('Yes, money in');
  });

  it('calls a refund money returned, not simply negative revenue', () => {
    const html = renderToStaticMarkup(
      <FlowTableView events={[ev({ classification: 'refunded', valueCents: 5_000 })]} classifications={CLASSES} />,
    );
    expect(html).toContain('No, money returned');
  });

  /**
   * Churn stops future money rather than returning past money. A table that called a
   * cancellation "money out" would double-count the loss.
   */
  it('calls a never-paid signup simply "No"', () => {
    const html = renderToStaticMarkup(
      <FlowTableView events={[ev({ classification: 'never_paid' })]} classifications={CLASSES} />,
    );
    expect(html).toContain('<td style="white-space:nowrap">No</td>');
  });

  it('says "not priced" rather than printing a zero', () => {
    const html = renderToStaticMarkup(
      <FlowTableView events={[ev({ classification: 'bid_flagged', valueCents: null })]} classifications={CLASSES} />,
    );
    expect(html).toContain('not priced');
    expect(html).not.toContain('$0');
  });
});

describe('the sparkline marks today and bands by kind', () => {
  const spark = (events: Array<{ at: string; classification: string; label: string }>) =>
    renderToStaticMarkup(
      <FlowSparkline
        events={events}
        classifications={{
          member_started: { key: 'member_started', label: 'Member started paying', tone: 'good', glyph: '▲' },
          never_paid: { key: 'never_paid', label: 'Signed up, never paid', tone: 'warn', glyph: '○' },
        }}
        today={new Date('2026-11-12T12:00:00Z')}
      />,
    );

  it('outlines today so the reader can place the strip', () => {
    const html = spark([]);
    expect(html).toContain('outline:2px solid var(--text-strong)');
  });

  /**
   * A column is a day and its bands are the DISTINCT kinds that happened. Height is not a
   * count and not dollars: the membership stream's biggest-value days are the ones where
   * unbillable signups arrived, so a dollar-scaled bar would make the worst days look best.
   */
  it('describes a day by the kinds that happened, with the count in the tooltip text', () => {
    const html = spark([
      { at: '2026-11-12', classification: 'member_started', label: 'a' },
      { at: '2026-11-12', classification: 'member_started', label: 'b' },
      { at: '2026-11-12', classification: 'never_paid', label: 'c' },
    ]);
    expect(html).toContain('Member started paying, Signed up, never paid');
    expect(html).toContain('(3 events)');
  });

  it('draws an empty day as an empty track rather than omitting it', () => {
    const html = spark([]);
    expect(html).toContain('var(--surface-sunken)');
    expect(html).toContain('nothing');
  });
});

describe('colour comes from tokens, and stream identity is fixed', () => {
  /**
   * Never a hex. The backend declares a tone, this layer resolves it to a design-system
   * custom property, and dark mode is handled by the system's own selected dark steps
   * rather than by anything here flipping a value.
   */
  it('resolves every tone to a CSS custom property, never a literal colour', () => {
    for (const [, paint] of Object.entries(TONE)) {
      expect(paint.fg).toMatch(/^var\(--/);
      expect(paint.bg).toMatch(/^var\(--/);
    }
    expect(streamPaint('membership').fg).toMatch(/^var\(--/);
  });

  /**
   * Colour follows the entity, never its rank: filtering to one stream must not repaint the
   * other. Membership is always chart-1 and government always chart-2.
   */
  it('pins each stream to a fixed chart slot', () => {
    expect(STREAM_PAINT.membership.fg).toBe('var(--chart-1)');
    expect(STREAM_PAINT.gov_pipeline.fg).toBe('var(--chart-2)');
  });

  /**
   * chart-3 and chart-4 measure ΔE 1.8 apart under protanopia, far below the floor, despite
   * the ramp advertising itself as colour-blind safe. Nothing here may pair them.
   */
  it('never uses the chart-3 / chart-4 pair', () => {
    const used = Object.values(STREAM_PAINT).map((s) => s.fg);
    expect(used.includes('var(--chart-3)') && used.includes('var(--chart-4)')).toBe(false);
  });

  it('falls back to muted for a tone it does not know, rather than throwing away the row', () => {
    expect(paintFor('not-a-tone')).toEqual(TONE.muted);
  });

  it('rounds dollars the same way the backend does', () => {
    expect(dollars(19_900)).toBe('$199');
    expect(dollars(7_281_600)).toBe('$72,816');
    expect(dollars(0)).toBe('$0');
  });
});
