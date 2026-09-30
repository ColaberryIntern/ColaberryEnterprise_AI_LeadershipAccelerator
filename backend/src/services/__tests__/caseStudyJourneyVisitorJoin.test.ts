const pageEventFindAll = jest.fn();
const visitorFindAll = jest.fn();
const leadFindByPk = jest.fn();
const emptyFindAll = jest.fn();

jest.mock('../../models', () => ({
  Lead: { findByPk: (...a: unknown[]) => leadFindByPk(...a) },
  Visitor: { findAll: (...a: unknown[]) => visitorFindAll(...a), findByPk: jest.fn() },
  PageEvent: { findAll: (...a: unknown[]) => pageEventFindAll(...a) },
  VisitorSession: { findAll: (...a: unknown[]) => emptyFindAll(...a) },
  BehavioralSignal: { findAll: (...a: unknown[]) => emptyFindAll(...a) },
  CampaignLead: { findAll: (...a: unknown[]) => emptyFindAll(...a) },
  Campaign: {},
  InteractionOutcome: { findAll: (...a: unknown[]) => emptyFindAll(...a) },
  ChatConversation: { findAll: (...a: unknown[]) => emptyFindAll(...a) },
  Activity: { findAll: (...a: unknown[]) => emptyFindAll(...a) },
  Appointment: { findAll: (...a: unknown[]) => emptyFindAll(...a) },
  LeadTemperatureHistory: { findAll: (...a: unknown[]) => emptyFindAll(...a) },
}));

import { Op } from 'sequelize';
import { getLeadJourney } from '../journeyTimelineService';

/**
 * Anonymous Case Study activity reaching the lead journey (T019 AC6).
 *
 * THE TRAP THIS TEST EXISTS TO AVOID. `resolveIdentity` backfills
 * `page_events.lead_id` when a visitor identifies, so the intuitive test is
 * "assert lead_id got stamped". That would prove the wrong thing. The journey
 * DOES NOT READ `page_events.lead_id` at all: `fetchPageEvents` resolves the
 * set of visitor ids linked to the lead and queries
 * `where: { visitor_id: { [Op.in]: ids } }`. A test written against `lead_id`
 * would keep passing if the visitor join broke, and the journey would be empty
 * on screen while the suite stayed green.
 *
 * So these assertions are on the join the journey actually performs. The
 * consequence worth stating plainly: Case Study events recorded BEFORE the
 * visitor identified appear in the journey afterwards because they were always
 * attached to the visitor - the backfill is a convenience for other readers,
 * not the mechanism the timeline depends on.
 *
 * SCOPE. All of this is downstream of consent. `PublicLayoutV2` starts the
 * tracker only when `localStorage['cbv2_consent'] === 'granted'`, and the
 * default is `'unset'`, so a non-consenting visitor produces no events for the
 * journey to show.
 */

const VISITOR_ID = '22222222-2222-4222-8222-222222222222';
const SECOND_VISITOR_ID = '33333333-3333-4333-8333-333333333333';
const LEAD_ID = 909;

function caseStudyRow(over: Record<string, unknown> = {}) {
  return {
    id: 'pe-1',
    event_type: 'case_study_view',
    page_path: '/stories/claims-triage-copilot',
    page_category: 'case_studies',
    page_title: 'Claims Triage Copilot',
    event_data: { slug: 'claims-triage-copilot', industry: 'Insurance' },
    timestamp: new Date('2026-08-20T10:00:00Z'),
    ...over,
  };
}

beforeEach(() => {
  [pageEventFindAll, visitorFindAll, leadFindByPk, emptyFindAll].forEach((m) => m.mockReset());
  emptyFindAll.mockResolvedValue([]);
  visitorFindAll.mockResolvedValue([]);
  pageEventFindAll.mockResolvedValue([caseStudyRow()]);
  leadFindByPk.mockResolvedValue({ id: LEAD_ID, name: 'A Lead', company: 'Acme', visitor: { id: VISITOR_ID } });
});

describe('the journey joins page_events by visitor_id, not lead_id (AC6)', () => {
  it('queries on visitor_id', async () => {
    await getLeadJourney(LEAD_ID);

    expect(pageEventFindAll).toHaveBeenCalledTimes(1);
    const where = pageEventFindAll.mock.calls[0][0].where;
    expect(where.visitor_id[Op.in]).toContain(VISITOR_ID);
  });

  it('does not filter on page_events.lead_id', async () => {
    // If it did, every event recorded before identification would vanish from
    // the journey the moment the backfill missed a row.
    await getLeadJourney(LEAD_ID);
    expect(pageEventFindAll.mock.calls[0][0].where).not.toHaveProperty('lead_id');
  });

  it('includes every visitor linked to the lead, not only the primary one', async () => {
    // One person, two browsers. Both were linked by identity resolution.
    visitorFindAll.mockResolvedValue([{ id: SECOND_VISITOR_ID }]);
    await getLeadJourney(LEAD_ID);

    const ids = pageEventFindAll.mock.calls[0][0].where.visitor_id[Op.in];
    expect(ids).toEqual(expect.arrayContaining([VISITOR_ID, SECOND_VISITOR_ID]));
  });

  it('applies no event_type predicate, so Case Study events flow in with no map edit', async () => {
    await getLeadJourney(LEAD_ID);
    expect(pageEventFindAll.mock.calls[0][0].where).not.toHaveProperty('event_type');
  });
});

describe('anonymous Case Study events are visible once identity resolves (AC6)', () => {
  it('surfaces the view in the timeline as a website event', async () => {
    const journey = await getLeadJourney(LEAD_ID);
    const view = journey?.events.find((e) => e.event_type === 'case_study_view');

    expect(view).toBeDefined();
    // JourneyTimeline.tsx renders `title` verbatim and colours by `category`,
    // so no frontend change is needed for these to display.
    expect(view?.category).toBe('website');
    expect(view?.title).toBeTruthy();
  });

  it('carries the event_data payload through to the timeline metadata', async () => {
    const journey = await getLeadJourney(LEAD_ID);
    const view = journey?.events.find((e) => e.event_type === 'case_study_view');

    // Only reachable because the tracker now sends `event_data` at all.
    expect(view?.metadata?.event_data).toEqual({ slug: 'claims-triage-copilot', industry: 'Insurance' });
    expect(view?.metadata?.page_category).toBe('case_studies');
  });

  it('shows the whole Case Study sequence a visitor produces before identifying', async () => {
    pageEventFindAll.mockResolvedValue([
      caseStudyRow({ id: 'pe-1', event_type: 'case_study_view' }),
      caseStudyRow({ id: 'pe-2', event_type: 'case_study_filter', event_data: { filter_key: 'industry', result_count: 4 } }),
      caseStudyRow({ id: 'pe-3', event_type: 'case_study_repo_click' }),
      caseStudyRow({ id: 'pe-4', event_type: 'case_study_artifact_click' }),
      caseStudyRow({ id: 'pe-5', event_type: 'case_study_cta_click' }),
    ]);

    const journey = await getLeadJourney(LEAD_ID);
    const types = journey?.events.map((e) => e.event_type);

    expect(types).toEqual([
      'case_study_view',
      'case_study_filter',
      'case_study_repo_click',
      'case_study_artifact_click',
      'case_study_cta_click',
    ]);
  });

  it('renders unknown-to-the-title-map types with the machine fallback rather than crashing', async () => {
    // `titleMap` has no Case Study entries; the fallback is
    // `<type> on <page_category>`. Ugly, not broken - and worth knowing before
    // someone reads it on screen and files it as a bug.
    const journey = await getLeadJourney(LEAD_ID);
    expect(journey?.events[0].title).toBe('case_study_view on case_studies');
  });
});

describe('the limit-200 ASC window (noted, not fixed)', () => {
  it('takes the OLDEST 200 page events', async () => {
    // A long-lived lead with chatty events can crowd out newer activity. Left
    // as-is deliberately: changing the window is a behaviour change to every
    // journey in the system, not a Case Study fix, and no test here shows Case
    // Study events actually being crowded out.
    await getLeadJourney(LEAD_ID);
    const options = pageEventFindAll.mock.calls[0][0];
    expect(options.limit).toBe(200);
    expect(options.order).toEqual([['timestamp', 'ASC']]);
  });
});
