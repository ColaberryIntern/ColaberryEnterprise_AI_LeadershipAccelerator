/**
 * The behaviour under test is mostly ONE property: an unreadable Eventbrite roster
 * must never be reported as an empty one.
 *
 * That is not a theoretical nicety. The pre-existing `getRegisteredEventIds`
 * returns an empty Set on any failure, and on 2026-11-11 that made "nobody is
 * registered" and "the query broke" indistinguishable while this very data was
 * being checked by hand. A reconciliation screen is exactly where that ambiguity
 * does damage, because an empty roster renders as a confident accusation: "all six
 * of your registrants are missing from Eventbrite."
 *
 * So the failure path gets more cases than the happy path.
 */
import { reconcileOpenHouseAttendees } from '../attendeeReconciliation';
import { listOpenHouseRegistrations } from '../openHouseRegistrationStore';
import { getCurrentOpenHouseEvent } from '../openHouseEventService';
import { getEventAttendeeEmails } from '../publicEventsService';

// Explicit factories rather than bare automocks. An automock still LOADS the real
// module to infer its shape, and `publicEventsService` pulls in `mssql` and the env
// config at import time - a dependency this suite has no business needing, and one
// that can fail in CI for reasons that have nothing to do with the logic under test.
jest.mock('../openHouseRegistrationStore', () => ({
  listOpenHouseRegistrations: jest.fn(),
}));
jest.mock('../openHouseEventService', () => ({
  getCurrentOpenHouseEvent: jest.fn(),
}));
jest.mock('../publicEventsService', () => ({
  getEventAttendeeEmails: jest.fn(),
}));

const mockList = listOpenHouseRegistrations as jest.MockedFunction<typeof listOpenHouseRegistrations>;
const mockEvent = getCurrentOpenHouseEvent as jest.MockedFunction<typeof getCurrentOpenHouseEvent>;
const mockRoster = getEventAttendeeEmails as jest.MockedFunction<typeof getEventAttendeeEmails>;

const EVENT = {
  announced: true,
  event_id: '2004289439668',
  name: 'Colaberry AI Systems Architect Accelerator Open House',
  starts_at: '2026-11-20T00:30:00.000Z',
  rsvp_url: 'https://www.eventbrite.com/e/x-tickets-2004289439668',
};

function reg(email: string, over: Partial<Record<string, unknown>> = {}) {
  return {
    email_lower: email,
    name: 'A Person',
    enrollment_id: 'enr-1',
    source: 'landing_page',
    created_at: new Date('2026-11-11T03:54:22.000Z'),
    reminder_24h_sent_at: null,
    reminder_1h_sent_at: null,
    ...over,
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEvent.mockResolvedValue(EVENT as any);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore?.();
});

describe('an unreadable Eventbrite roster', () => {
  it('reports status unavailable, NOT an empty roster', async () => {
    mockList.mockResolvedValue([reg('a@example.com'), reg('b@example.com')]);
    mockRoster.mockRejectedValue(new Error('CCPP unreachable'));

    const r = await reconcileOpenHouseAttendees();

    expect(r.eventbrite.status).toBe('unavailable');
    // The whole point: null, never 0.
    expect(r.eventbrite.count).toBeNull();
    expect(r.eventbrite.count).not.toBe(0);
  });

  it('does not claim our registrants are missing from a roster it could not read', async () => {
    mockList.mockResolvedValue([reg('a@example.com')]);
    mockRoster.mockRejectedValue(new Error('CCPP unreachable'));

    const r = await reconcileOpenHouseAttendees();

    // null is "we do not know", which is the honest answer. false would assert
    // they are absent, which is the lie this module exists to avoid.
    expect(r.ours.registrants[0].on_eventbrite).toBeNull();
    expect(r.ours.registrants[0].on_eventbrite).not.toBe(false);
  });

  it('leaves the headline counts null rather than computing them from one side', async () => {
    mockList.mockResolvedValue([reg('a@example.com'), reg('b@example.com')]);
    mockRoster.mockRejectedValue(new Error('CCPP unreachable'));

    const r = await reconcileOpenHouseAttendees();

    expect(r.summary.distinct_people).toBeNull();
    expect(r.summary.overlap).toBeNull();
  });

  it('still returns our own registrants, because those are actionable', async () => {
    mockList.mockResolvedValue([reg('a@example.com'), reg('b@example.com')]);
    mockRoster.mockRejectedValue(new Error('CCPP unreachable'));

    const r = await reconcileOpenHouseAttendees();

    expect(r.ours.count).toBe(2);
    expect(r.ours.registrants).toHaveLength(2);
  });

  it('classifies the error without leaking the message into the payload', async () => {
    mockList.mockResolvedValue([]);
    mockRoster.mockRejectedValue(new TypeError('connect ECONNREFUSED 10.0.0.1:1433'));

    const r = await reconcileOpenHouseAttendees();

    expect(r.eventbrite.error_class).toBe('TypeError');
    expect(JSON.stringify(r)).not.toContain('ECONNREFUSED');
  });
});

describe('the real 2026-11-11 shape: two rosters, no overlap', () => {
  beforeEach(() => {
    mockList.mockResolvedValue([
      reg('ours1@example.com'), reg('ours2@example.com'), reg('ours3@example.com'),
      reg('ours4@example.com'), reg('ours5@example.com'), reg('ours6@example.com'),
    ]);
    mockRoster.mockResolvedValue([
      'eb1@example.com', 'eb2@example.com', 'eb3@example.com', 'eb4@example.com',
      'eb5@example.com', 'eb6@example.com', 'eb7@example.com',
    ]);
  });

  it('counts thirteen distinct people, not seven and not six', async () => {
    const r = await reconcileOpenHouseAttendees();
    expect(r.summary.distinct_people).toBe(13);
    expect(r.eventbrite.count).toBe(7);
    expect(r.ours.count).toBe(6);
  });

  it('reports zero overlap and names both exclusive groups', async () => {
    const r = await reconcileOpenHouseAttendees();
    expect(r.summary.overlap).toBe(0);
    expect(r.summary.only_in_our_funnel).toBe(6);
    expect(r.eventbrite.only_on_eventbrite).toHaveLength(7);
  });
});

describe('overlap arithmetic', () => {
  it('counts a person on both lists once', async () => {
    mockList.mockResolvedValue([reg('both@example.com'), reg('mine@example.com')]);
    mockRoster.mockResolvedValue(['both@example.com', 'theirs@example.com']);

    const r = await reconcileOpenHouseAttendees();

    expect(r.summary.distinct_people).toBe(3); // both, mine, theirs
    expect(r.summary.overlap).toBe(1);
    expect(r.summary.only_in_our_funnel).toBe(1);
    expect(r.eventbrite.only_on_eventbrite).toEqual(['theirs@example.com']);
  });

  it('matches across casing and whitespace, on BOTH sides', async () => {
    // Two normalisers for one comparison is how a false "no overlap" is made.
    mockList.mockResolvedValue([reg('  Mixed.Case@Example.COM ')]);
    mockRoster.mockResolvedValue(['mixed.case@example.com']);

    const r = await reconcileOpenHouseAttendees();

    expect(r.summary.overlap).toBe(1);
    expect(r.ours.registrants[0].on_eventbrite).toBe(true);
    expect(r.summary.only_in_our_funnel).toBe(0);
  });

  it('does not treat two different addresses sharing a prefix as one person', async () => {
    // A real near-miss: both rosters held an address beginning "na". Masked output
    // made them look identical; they were two different people.
    mockList.mockResolvedValue([reg('nadia@gmail.com')]);
    mockRoster.mockResolvedValue(['nathan@gmail.com']);

    const r = await reconcileOpenHouseAttendees();

    expect(r.summary.overlap).toBe(0);
    expect(r.summary.distinct_people).toBe(2);
  });
});

describe('reminder stamps', () => {
  it('reads the real columns rather than defaulting everyone to un-reminded', async () => {
    mockList.mockResolvedValue([
      reg('done@example.com', {
        reminder_24h_sent_at: new Date('2026-11-18T18:30:00.000Z'),
        reminder_1h_sent_at: null,
      }),
    ]);
    mockRoster.mockResolvedValue([]);

    const r = await reconcileOpenHouseAttendees();

    expect(r.ours.registrants[0].reminded_24h).toBe(true);
    expect(r.ours.registrants[0].reminded_1h).toBe(false);
  });
});

describe('no announced event', () => {
  it('says not_configured rather than inventing an empty event', async () => {
    mockEvent.mockResolvedValue(null as any);

    const r = await reconcileOpenHouseAttendees();

    expect(r.event).toBeNull();
    expect(r.eventbrite.status).toBe('not_configured');
    expect(r.eventbrite.count).toBeNull();
    expect(mockRoster).not.toHaveBeenCalled();
  });

  it('does not query the roster for an unannounced event', async () => {
    mockEvent.mockResolvedValue({ announced: false, event_id: null } as any);

    const r = await reconcileOpenHouseAttendees();

    expect(r.eventbrite.status).toBe('not_configured');
    expect(mockList).not.toHaveBeenCalled();
  });
});

describe('an empty-but-readable roster', () => {
  it('is reported as ok with a count of zero - the opposite of unavailable', async () => {
    mockList.mockResolvedValue([reg('a@example.com')]);
    mockRoster.mockResolvedValue([]);

    const r = await reconcileOpenHouseAttendees();

    // This is the case that MUST stay distinguishable from the failure above.
    expect(r.eventbrite.status).toBe('ok');
    expect(r.eventbrite.count).toBe(0);
    expect(r.ours.registrants[0].on_eventbrite).toBe(false);
    expect(r.summary.distinct_people).toBe(1);
  });
});
