import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import AdminRevenueRoomDrilldownPage, {
  RosterView,
  TimelineView,
} from '../AdminRevenueRoomDrilldownPage';

jest.mock('../../../utils/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

/**
 * R4 acceptance: the drill-down shows the timeline and documents for an initiative.
 *
 * The invariant worth testing is that an EMPTY timeline explains itself. The spine is new
 * and most timelines are genuinely empty, which is exactly the point at which a page starts
 * lying — by rendering nothing and letting the reader supply the reason.
 */
const wrap = (node: React.ReactElement) =>
  renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);

const link = (over: Record<string, unknown> = {}) => ({
  id: 'l1',
  sourceSystem: 'gov_proposal_document',
  sourceId: 'doc-1',
  sourceUrl: null,
  title: 'Technical Approach',
  relation: 'produced',
  observedAt: '2026-10-21T10:00:00.000Z',
  linkedBy: 'govProposalEvidenceBackfill',
  linkMethod: 'automatic' as const,
  confidence: 1,
  notes: 'doc_key=tech_approach',
  ...over,
});

describe('an empty timeline says why it is empty', () => {
  it('distinguishes a MISSING table from an empty one', () => {
    const html = wrap(<TimelineView timeline={{
      state: 'absent', links: [], note: 'A missing source is not an empty one.',
    }} />);
    expect(html).toContain('timeline-absent');
    expect(html).toContain('not present in this database');
    expect(html).not.toContain('timeline-empty');
  });

  it('says nothing is linked YET, and what will fill it', () => {
    const html = wrap(<TimelineView timeline={{
      state: 'ready', links: [], note: 'This is a measured zero.',
    }} />);
    expect(html).toContain('timeline-empty');
    expect(html).toContain('Nothing is linked to this initiative yet');
    expect(html).toContain('measured zero');
    expect(html).not.toContain('timeline-absent');
  });

  it('renders neither empty state once there are events', () => {
    const html = wrap(<TimelineView timeline={{ state: 'ready', links: [link()], note: null }} />);
    expect(html).toContain('data-testid="timeline"');
    expect(html).not.toContain('timeline-empty');
    expect(html).not.toContain('timeline-absent');
  });
});

describe('a timeline event says where it came from and who vouched for it', () => {
  it('names the source system in words rather than a column value', () => {
    const html = wrap(<TimelineView timeline={{ state: 'ready', links: [link()], note: null }} />);
    expect(html).toContain('Proposal document');
    expect(html).not.toContain('gov_proposal_document');
  });

  it('shows the date the evidence happened', () => {
    const html = wrap(<TimelineView timeline={{ state: 'ready', links: [link()], note: null }} />);
    expect(html).toContain('Oct 21, 2026');
  });

  it('marks a machine-made link with its confidence, and a human link as by hand', () => {
    const auto = wrap(<TimelineView timeline={{ state: 'ready', links: [link()], note: null }} />);
    expect(auto).toContain('automatic, confidence 1.00');

    const human = wrap(<TimelineView timeline={{
      state: 'ready',
      links: [link({ linkMethod: 'human', confidence: null, linkedBy: 'ali@colaberry.com' })],
      note: null,
    }} />);
    expect(human).toContain('by hand');
    expect(human).not.toContain('confidence');
  });

  it('links out when there is a URL, and does not invent one when there is not', () => {
    const none = wrap(<TimelineView timeline={{ state: 'ready', links: [link()], note: null }} />);
    expect(none).not.toContain('<a href');

    const some = wrap(<TimelineView timeline={{
      state: 'ready', links: [link({ sourceUrl: 'https://app.basecamp.com/x' })], note: null,
    }} />);
    expect(some).toContain('https://app.basecamp.com/x');
  });

  it('falls back to the source id when a link has no title', () => {
    const html = wrap(<TimelineView timeline={{
      state: 'ready', links: [link({ title: null })], note: null,
    }} />);
    expect(html).toContain('doc-1');
  });
});

describe('the roster shows what each bid record actually contains', () => {
  const entry = (over: Record<string, unknown> = {}) => ({
    initiativeType: 'gov_bid', initiativeKey: 'bid-1', label: 'Saratoga Springs RFP',
    evidenceCount: 3, flags: ['3 proposal documents', 'never submitted'], ...over,
  });

  it('renders one clickable row per bid, carrying the bid key', () => {
    const html = wrap(<RosterView cardKey="gov_bid_pursuit" roster={[entry()]} />);
    expect(html).toContain('roster-bid-1');
    expect(html).toContain('/admin/revenue-room/gov_bid_pursuit?bid=bid-1');
  });

  it('shows the evidence count per bid', () => {
    const html = wrap(<RosterView cardKey="gov_bid_pursuit" roster={[entry()]} />);
    expect(html).toContain('linked items');
  });

  it('uses the singular for one linked item', () => {
    const html = wrap(<RosterView cardKey="gov_bid_pursuit" roster={[entry({ evidenceCount: 1 })]} />);
    expect(html).toContain('linked item<');
  });

  it('renders every flag, including the test-row warning', () => {
    const html = wrap(<RosterView cardKey="gov_bid_pursuit" roster={[
      entry({ label: 'Snow College - T8 test', flags: ['looks like a test row', 'no proposal document'] }),
    ]} />);
    expect(html).toContain('looks like a test row');
    expect(html).toContain('no proposal document');
  });

  it('says so plainly when no bid is flagged', () => {
    const html = wrap(<RosterView cardKey="gov_bid_pursuit" roster={[]} />);
    expect(html).toContain('roster-empty');
    expect(html).toContain('No bid carries the pursuit flag');
  });
});

describe('the page shell mounts', () => {
  it('renders the marker a route check can see', () => {
    const html = wrap(<AdminRevenueRoomDrilldownPage />);
    expect(html).toContain('data-testid="revenue-room-drilldown"');
  });
});
