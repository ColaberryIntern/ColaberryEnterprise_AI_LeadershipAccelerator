import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import ConversationsPanel from '../ConversationsPanel';
import type { ConversationEntry, ConversationsView } from '../ConversationsPanel';

jest.mock('../../../../utils/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

/**
 * R7: the conversations card on the drill-down.
 *
 * The ticket's warning is the thing being tested: "Expect this surface to be sparse and do
 * not let sparse render as healthy." Measured on production 2026-11-27, nothing has been
 * booked or answered since April, six replies land inside the window, and three of the
 * nine booked meetings are test rows. The dormant fixture below is therefore a constructed
 * case, not a snapshot of the live board.
 *
 * So these cover the ways the card could tell a comfortable lie:
 *
 *   - a dormant pipeline drawn in the same tone as a live one
 *   - a test row dropped, which hides that the cleanup is outstanding
 *   - a name rendered as a link with nothing to link on, which 404s
 *   - a name rendered as text when the row DID carry a lead id, which breaks Ali's 360 rule
 *   - "held" appearing as a tier with a zero in it
 */
const entry = (over: Partial<ConversationEntry> = {}): ConversationEntry => ({
  id: 'io-1',
  kind: 'meeting_booked',
  label: 'Meeting booked',
  name: 'Bibiane Nsah',
  leadId: 1528,
  company: null,
  at: '2026-03-31',
  suspectReasons: [],
  ...over,
});

const view = (over: Partial<ConversationsView> = {}): ConversationsView => ({
  headline: 'Nothing in 180 days. The last conversation of any kind was recorded on '
    + '2026-04-28, 211 days ago, so every entry below sits outside the window this board '
    + 'reports on. The pipeline of conversations is dormant.',
  lastAt: '2026-04-28',
  daysSince: 211,
  dormant: true,
  tiers: [
    {
      key: 'meeting_booked',
      label: 'Meeting booked',
      entries: [
        entry(),
        entry({ id: 'io-2', name: 'Test User', company: 'Test', leadId: 44, suspectReasons: ['the lead is named as a test', 'the company is named as a test'] }),
      ],
      suspectCount: 1,
      definition: "interaction_outcomes.outcome = 'booked_meeting'. Booked, not yet held.",
    },
    {
      key: 'answered',
      label: 'Call answered',
      entries: [],
      suspectCount: 0,
      definition: "interaction_outcomes.outcome = 'answered'. Somebody picked up.",
    },
  ],
  silentSources: [
    { label: 'appointments', detail: 'The table exists and has never been written to.' },
  ],
  heldNote: 'No meeting can be shown as HELD, and that is a gap in the writer rather than in '
    + 'the meetings.',
  provenance: 'interaction_outcomes joined to leads for the name.',
  ...over,
});

const render = (v: ConversationsView): string => renderToStaticMarkup(
  <StaticRouter location="/admin/revenue-room/membership">
    <ConversationsPanel view={v} />
  </StaticRouter>,
);

describe('dormancy is drawn as dormancy', () => {
  it('leads with the headline and marks it as needing attention', () => {
    const html = render(view());
    expect(html).toContain('Needs attention.');
    expect(html).toContain('Nothing in 180 days');
    expect(html).toContain('211 days ago');
  });

  it('uses the warning tone on dormant and does not on live', () => {
    // The control: the tone is a consequence of the data, not a permanent decoration.
    expect(render(view())).toContain('--status-warning-bg');
    const live = render(view({ dormant: false, headline: '1 conversation inside the last 180 days.' }));
    expect(live).not.toContain('--status-warning-bg');
    expect(live).not.toContain('Needs attention.');
  });
});

describe('a test row is listed, flagged', () => {
  it('shows both rows and prints the flag text on the suspect one', () => {
    const html = render(view());
    expect(html).toContain('Bibiane Nsah');
    expect(html).toContain('Test User');
    expect(html).toContain('the lead is named as a test; the company is named as a test');
  });

  it('says how many do not look real, in the tier header', () => {
    expect(render(view())).toContain('1 of these does not look real');
    const two = view();
    two.tiers[0].suspectCount = 2;
    expect(render(two)).toContain('2 of these do not look real');
  });

  it('says nothing about suspects when none tripped', () => {
    const clean = view();
    clean.tiers[0].suspectCount = 0;
    expect(render(clean)).not.toContain('does not look real');
  });
});

describe('a name opens the 360, and only when there is something to open it with', () => {
  /** Ali, 2026-09-09: clicking a person's name must reach their 360 dashboard. */
  it('links the name to the person page on the communications tab', () => {
    const html = render(view());
    expect(html).toContain('href="/admin/people/lead%3A1528?tab=communications"');
  });

  it('renders text, not an anchor, when the row carries no lead id', () => {
    const orphan = view();
    orphan.tiers[0].entries = [entry({ id: 'io-9', leadId: null, name: 'Mike Nelson' })];
    const html = render(orphan);
    // Asserted as "not an anchor" rather than "no href": a <Link to={null}> would carry the
    // same testid and the same text, and would still render an <a>.
    expect(html).toContain('<span style="color:var(--text-body)" data-testid="conversation-name-io-9">Mike Nelson</span>');
    expect(html).not.toContain('/admin/people/');
  });

  it('says a name is missing rather than leaving the cell blank', () => {
    const anon = view();
    anon.tiers[0].entries = [entry({ id: 'io-8', leadId: null, name: null })];
    expect(render(anon)).toContain('No name recorded');
  });
});

describe('what is deliberately absent', () => {
  it('draws no held tier, so no number can be read as one', () => {
    const html = render(view());
    expect(html).toContain('No meeting is shown as held.');
    expect(html).toContain('gap in the writer');
    expect(html).not.toContain('data-testid="conversation-tier-meeting_held"');
  });

  it('says an empty tier was read and held nothing, rather than hiding it', () => {
    const html = render(view());
    expect(html).toContain('data-testid="conversation-empty-answered"');
    expect(html).toContain('The source was read and held no row of this kind');
  });

  it('names the instruments that exist and hold nothing', () => {
    expect(render(view())).toContain('never been written to');
  });

  it('prints no company as "None recorded" rather than as an empty cell', () => {
    expect(render(view())).toContain('None recorded');
  });
});

describe('counts carry separators', () => {
  /** Ali, on testing R27: "format the numbers with commas". */
  it('formats a four-figure tier count', () => {
    const big = view();
    big.tiers[0].entries = Array.from({ length: 1234 }, (_, i) => entry({ id: `io-${i}` }));
    expect(render(big)).toContain('1,234 recorded');
  });
});
