/**
 * M25 - the profile-to-inputs mapping, where "absent" is easiest to lose.
 *
 * The engine's absence handling is worthless if the mapper quietly turns a missing panel into a
 * zero or an empty list's length on the way in. Every case here therefore checks the SAME field
 * three ways: permitted-and-present, permitted-and-absent, and not-permitted.
 */
import { PersonProfile } from '../../adminOs/personProfileService';
import { inputsFromProfile } from '../srsInputs';

/** A profile with nothing but identity: every panel not permitted. */
const BARE = {
  email: 'someone@example.com',
  name: null,
  stage: 'lead',
  tracedToLead: true,
  company: null,
  title: null,
  withheldPanels: [],
} as unknown as PersonProfile;

const withPanels = (patch: Partial<PersonProfile>): PersonProfile =>
  ({ ...BARE, ...patch } as PersonProfile);

describe('M25 - a missing panel maps to null, never to zero', () => {
  it('maps every input to null for a profile with no panels at all', () => {
    const i = inputsFromProfile(BARE);
    for (const [key, value] of Object.entries(i)) {
      expect([key, value]).toEqual([key, null]);
    }
  });

  it('distinguishes a null panel from an absent one only in that both mean no evidence', () => {
    // undefined = not permitted, null = permitted and empty. The score treats both as absent,
    // which is correct, and neither as 0, which is the point.
    const notPermitted = inputsFromProfile(BARE);
    const permittedEmpty = inputsFromProfile(withPanels({
      engagement: null, communications: null, billingDetail: null,
      explorerScore: null, acquisition: null, appointments: null,
    }));
    expect(notPermitted.siteSessions).toBeNull();
    expect(permittedEmpty.siteSessions).toBeNull();
    expect(permittedEmpty.appointments).toBeNull();
    expect(permittedEmpty.inboundReplies).toBeNull();
  });
});

describe('M25 - a real measurement survives the mapping', () => {
  it('carries through the journey counts, including a genuine zero', () => {
    const i = inputsFromProfile(withPanels({
      journey: {
        firstTouch: null, lastActivity: null, daysKnown: 12, sessions: 0, pageEvents: 0,
        campaigns: null, emailsSent: null, enrollments: 2, intentScore: 55,
        cardsCompleted: null, sessionsAttended: null,
      },
    }));
    expect(i.daysKnown).toBe(12);
    expect(i.pageEvents).toBe(0);      // a real zero, not an absence
    expect(i.enrolments).toBe(2);
    expect(i.intentScore).toBe(55);
  });

  it('counts an empty appointments LIST as zero, and an absent list as null', () => {
    // This is the distinction M24.3 created, and the mapper is where it would be lost.
    expect(inputsFromProfile(withPanels({ appointments: [] })).appointments).toBe(0);
    expect(inputsFromProfile(withPanels({ appointments: null })).appointments).toBeNull();
  });

  it('reads the explorer bands only when a snapshot exists', () => {
    const present = inputsFromProfile(withPanels({
      explorerScore: {
        asOfDate: '2026-10-01', engagement: 70, intent: 40, fit: 50,
        primaryState: 'warm', overlays: [],
      },
    }));
    expect(present.explorerEngagement).toBe(70);
    expect(present.explorerIntent).toBe(40);
    expect(inputsFromProfile(withPanels({ explorerScore: null })).explorerEngagement).toBeNull();
  });
});

describe('recency is scored only when the timeline was read in FULL', () => {
  const ALL = ['acquisition', 'sales', 'communication', 'commerce', 'learning', 'community'];
  const JOURNEY = {
    firstTouch: null, lastActivity: '2026-10-17T12:00:00.000Z', daysKnown: null,
    sessions: null, pageEvents: null, campaigns: null, emailsSent: null,
    enrollments: null, intentScore: null, cardsCompleted: null, sessionsAttended: null,
  };

  it('carries lastActivity when every domain was read', () => {
    const i = inputsFromProfile(withPanels({
      journey: JOURNEY, timelineDomains: ALL as PersonProfile['timelineDomains'],
    }));
    expect(i.lastActivityAt).toBe('2026-10-17T12:00:00.000Z');
  });

  it('reports it ABSENT when even one domain was withheld', () => {
    // The whole reason the M24 contract excluded recency: a caller-shaped last activity is a
    // fact about the viewer, not the person. Absent is the true answer, and the engine already
    // knows how to handle absent.
    const i = inputsFromProfile(withPanels({
      journey: JOURNEY,
      timelineDomains: ALL.slice(0, 5) as PersonProfile['timelineDomains'],
    }));
    expect(i.lastActivityAt).toBeNull();
  });

  it('reports it absent when the caller got no timeline at all', () => {
    expect(inputsFromProfile(withPanels({ journey: JOURNEY })).lastActivityAt).toBeNull();
  });

  it('reports it absent when the timeline was complete but there was no activity', () => {
    const i = inputsFromProfile(withPanels({
      journey: { ...JOURNEY, lastActivity: null },
      timelineDomains: ALL as PersonProfile['timelineDomains'],
    }));
    expect(i.lastActivityAt).toBeNull();
  });
});

describe('M25 - the EXCLUDED inputs are not read at all', () => {
  it('reads prior history only through its availability flag and enrolment count', () => {
    const unavailable = inputsFromProfile(withPanels({
      history: {
        available: false, unavailableReason: 'CCPP is not configured', enrolments: [],
      } as unknown as PersonProfile['history'],
    }));
    expect(unavailable.priorHistoryAvailable).toBe(false);
    // Not 0: an unreachable system has not told us they had no enrolments.
    expect(unavailable.priorEnrolments).toBeNull();

    const available = inputsFromProfile(withPanels({
      history: {
        available: true, unavailableReason: null, enrolments: [{}, {}],
      } as unknown as PersonProfile['history'],
    }));
    expect(available.priorEnrolments).toBe(2);
  });

  it('does not read lastActivity when the timeline coverage is unknown', () => {
    const i = inputsFromProfile(withPanels({
      journey: {
        firstTouch: null, lastActivity: '2026-10-01T00:00:00.000Z', daysKnown: null,
        sessions: null, pageEvents: null, campaigns: null, emailsSent: null,
        enrollments: null, intentScore: null, cardsCompleted: null, sessionsAttended: null,
      },
    }));
    expect(Object.values(i).every((v) => v === null)).toBe(true);
  });
});
