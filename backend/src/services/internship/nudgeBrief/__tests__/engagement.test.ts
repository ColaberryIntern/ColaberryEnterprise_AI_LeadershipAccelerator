import { CONTACT_FLOOR_DAYS, coverage, engagementState, weekendKey } from '../engagement';
import type { SidecarIntern } from '../../portfolioReport/sidecar/types';

/**
 * Coverage and engagement, which is what the system is actually for.
 *
 * Ali, 2026-11-11: "the idea is to get them to engage. We might not be able to solve their issue
 * if they have one, but the goal is to create a process that keeps the engagement up and doesn't
 * let anyone slide from the cracks."
 *
 * Every earlier measurement in this subsystem was about the MESSAGE - how similar two were, was a
 * sentence true, was a quote really theirs. None of those is the goal. These two are:
 *
 *   coverage    has anyone gone past the floor without hearing from us
 *   engagement  did anything come back after the last message we sent
 *
 * A Wednesday is used as "now" throughout except where a weekend is the point, because
 * `weekendKey` is the one rule here that depends on which day it is.
 */

const WED_NOON = new Date('2026-11-11T18:00:00.000Z'); // Wed 12:00 Central
const SAT_NOON = new Date('2026-11-14T18:00:00.000Z'); // Sat 12:00 Central
const SUN_NOON = new Date('2026-11-15T18:00:00.000Z'); // Sun 12:00 Central

const ago = (from: Date, days: number): string => new Date(from.getTime() - days * 86400000).toISOString();

function intern(lastAsk: Partial<NonNullable<SidecarIntern['last_ask']>> | null): SidecarIntern {
  return {
    enrollment_id: 'e1', first_name: 'Quincy',
    last_ask: lastAsk === null ? null : {
      sent_at: ago(WED_NOON, 1), from: 'ali@colaberry.com', subject: 'Where things stand',
      body_text: 'x', body_truncated: false, satisfied: null, satisfied_by: null,
      ...lastAsk,
    },
  } as unknown as SidecarIntern;
}

describe('nobody slides through the cracks', () => {
  /**
   * The exact shape of sliding through the cracks, and the case a "days since last contact" rule
   * scores as healthy because there is no last contact to be late from.
   */
  it('an intern we have never written to is overdue immediately', () => {
    const s = engagementState(intern(null), WED_NOON);
    expect(s.overdue).toBe(true);
    expect(s.lastContactAt).toBeNull();
    expect(s.daysSinceContact).toBeNull();
    expect(s.reason).toMatch(/no record of ever writing/);
  });

  it(`is overdue at the ${CONTACT_FLOOR_DAYS} day floor`, () => {
    expect(engagementState(intern({ sent_at: ago(WED_NOON, CONTACT_FLOOR_DAYS) }), WED_NOON).overdue).toBe(true);
  });

  it('is not overdue one day before the floor', () => {
    expect(engagementState(intern({ sent_at: ago(WED_NOON, CONTACT_FLOOR_DAYS - 1) }), WED_NOON).overdue).toBe(false);
  });

  it('names the fact rather than the rule, so a person can check it', () => {
    expect(engagementState(intern({ sent_at: ago(WED_NOON, 4) }), WED_NOON).reason)
      .toBe('4 days since we last wrote, and the floor is 2.');
  });
});

describe('a weekend gets one message, not two', () => {
  it('groups Saturday and Sunday under the same key', () => {
    expect(weekendKey(SUN_NOON)).toBe(weekendKey(SAT_NOON));
  });

  it('a weekday has no weekend key at all', () => {
    expect(weekendKey(WED_NOON)).toBeNull();
  });

  it('holds on Sunday when Saturday already had the message', () => {
    const s = engagementState(intern({ sent_at: SAT_NOON.toISOString() }), SUN_NOON);
    expect(s.overdue).toBe(false);
    expect(s.reason).toMatch(/one message/);
  });

  /**
   * The floor still bites across a weekend. Somebody last written to on Thursday is overdue by
   * Saturday, and the weekend rule only stops a SECOND message inside the same weekend.
   */
  it('does not hold on Saturday when the last message was before the weekend', () => {
    expect(engagementState(intern({ sent_at: ago(SAT_NOON, 2) }), SAT_NOON).overdue).toBe(true);
  });
});

describe('did the last message land', () => {
  it('reports engagement and what produced it', () => {
    const s = engagementState(intern({ satisfied: true, satisfied_by: 'reply' }), WED_NOON);
    expect(s.engagedSinceContact).toBe(true);
    expect(s.engagedBy).toBe('reply');
    expect(s.reason).toMatch(/they replied after it/);
  });

  it('counts a commit as engagement, because doing the work is answering', () => {
    expect(engagementState(intern({ satisfied: true, satisfied_by: 'commit' }), WED_NOON).reason)
      .toMatch(/they committed after it/);
  });

  it('says plainly when nothing came back', () => {
    const s = engagementState(intern({ satisfied: false }), WED_NOON);
    expect(s.engagedSinceContact).toBe(false);
    expect(s.reason).toMatch(/nothing has come back yet/);
  });

  /** Unknowable is not the same as no, and folding the two together would invent a failure. */
  it('keeps "too old to judge" separate from "no"', () => {
    expect(engagementState(intern({ satisfied: null }), WED_NOON).engagedSinceContact).toBeNull();
  });
});

describe('the roster in one line', () => {
  const states = [
    engagementState(intern({ satisfied: true, satisfied_by: 'reply' }), WED_NOON),
    engagementState(intern({ satisfied: true, satisfied_by: 'commit' }), WED_NOON),
    engagementState(intern({ satisfied: false }), WED_NOON),
    engagementState(intern({ sent_at: ago(WED_NOON, 5), satisfied: null }), WED_NOON),
    engagementState(intern(null), WED_NOON),
  ];

  it('counts what must be zero for nobody to be sliding', () => {
    const c = coverage(states);
    expect(c.total).toBe(5);
    expect(c.overdue).toBe(2); // the 5-day-old one and the never-contacted one
    expect(c.neverContacted).toBe(1);
  });

  it('reports engagement only over what can actually be judged', () => {
    const c = coverage(states);
    expect(c.engaged).toBe(2);
    expect(c.silent).toBe(1);
    expect(c.unknown).toBe(2); // the out-of-window one and the never-contacted one
    expect(c.engagementRate).toBe(67); // 2 of 3, not 2 of 5
  });

  /**
   * Counting unknowns as failures would make the rate drift down as the data window moves rather
   * than as engagement changes, which is a number that lies slowly.
   */
  it('returns null rather than zero when nothing is judgeable', () => {
    expect(coverage([engagementState(intern(null), WED_NOON)]).engagementRate).toBeNull();
  });
});
