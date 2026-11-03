/**
 * utmBackfill — which session the ad's tags are taken from, and which fields travel.
 *
 * Two assertions carry most of the weight, and they pull in opposite directions. The first is that
 * a visitor whose newest session is untagged still gets the campaign from the tagged session
 * behind it: that is the case the old newest-session-only read dropped, and it is not rare, because
 * sessions are reused for 30 minutes and the React tracker's own flush carries no UTM fields, so
 * any visitor who looked at a second page before signing up had an untagged session sitting in
 * front of their ad click. The second is that reaching back is BOUNDED — without that, the fix
 * becomes unbounded first-touch attribution, which is a different bug rather than no bug.
 *
 * Every call passes an explicit `nowMs`. Letting it default to the real clock would make the
 * window assertions pass today and start failing a month from now, which is the kind of test that
 * teaches people to ignore CI.
 */
import {
  pickAttributionSession,
  utmBackfillUpdates,
  UTM_ATTRIBUTION_WINDOW_DAYS,
  UTM_FIELDS,
  UTM_SESSION_LOOKBACK,
  UtmFields,
  UtmSession,
} from '../utmBackfill';

const NOW = Date.parse('2026-11-03T12:00:00.000Z');
const DAY_MS = 86_400_000;
const daysAgo = (days: number) => new Date(NOW - days * DAY_MS);

const session = (over: UtmSession = {}): UtmSession => ({
  utm_source: 'fb', utm_campaign: '52708443249234', utm_medium: 'paid',
  utm_content: '52708445138434', utm_term: '52708443249434', created_at: daysAgo(1), ...over,
});

const untagged = (over: UtmSession = {}): UtmSession => ({
  utm_source: null, utm_campaign: null, utm_medium: null, utm_content: null, utm_term: null,
  created_at: daysAgo(0), ...over,
});

const emptyLead = (): UtmFields => ({});

const pick = (sessions: readonly UtmSession[]) => pickAttributionSession(sessions, NOW);

describe('pickAttributionSession', () => {
  it('takes the newest session when it carries the campaign', () => {
    const newest = session({ utm_campaign: 'newest' });
    expect(pick([newest, session({ utm_campaign: 'older', created_at: daysAgo(2) })])).toBe(newest);
  });

  it('reaches past an untagged newer session to the ad click behind it', () => {
    const adClick = session({ utm_campaign: '52708443249234', created_at: daysAgo(3) });
    const picked = pick([untagged(), untagged({ created_at: daysAgo(1) }), adClick]);
    expect(picked).toBe(adClick);
    expect(utmBackfillUpdates(picked, emptyLead()).utm_campaign).toBe('52708443249234');
  });

  it('falls back to the newest session when no session anywhere carries a campaign', () => {
    // Still worth having: it may carry a source or medium, and returning nothing would lose those.
    const newest = untagged({ utm_source: 'google' });
    expect(pick([newest, untagged({ created_at: daysAgo(4) })])).toBe(newest);
  });

  it('treats a blank campaign as absent rather than as an attribution', () => {
    const real = session({ utm_campaign: '527', created_at: daysAgo(2) });
    expect(pick([session({ utm_campaign: '   ' }), real])).toBe(real);
    expect(pick([session({ utm_campaign: '' }), real])).toBe(real);
  });

  it('returns undefined for no sessions, and survives a shape that is not a list', () => {
    expect(pick([])).toBeUndefined();
    expect(pickAttributionSession(null as unknown as UtmSession[], NOW)).toBeUndefined();
    expect(pickAttributionSession(undefined as unknown as UtmSession[], NOW)).toBeUndefined();
  });
});

describe('pickAttributionSession is bounded, so reaching back does not become first-touch', () => {
  it('ignores an ad click older than the window and keeps the newest session instead', () => {
    const newest = untagged();
    const stale = session({ utm_campaign: 'march_campaign', created_at: daysAgo(UTM_ATTRIBUTION_WINDOW_DAYS + 1) });
    expect(pick([newest, stale])).toBe(newest);
    // And so nothing is written: the newest session has no tags to give.
    expect(utmBackfillUpdates(pick([newest, stale]), emptyLead())).toEqual({});
  });

  it('accepts a click at the edge of the window', () => {
    const edge = session({ utm_campaign: 'edge', created_at: daysAgo(UTM_ATTRIBUTION_WINDOW_DAYS) });
    expect(pick([untagged(), edge])).toBe(edge);
  });

  it('prefers a click inside the window over an older one, even though both are tagged', () => {
    const recent = session({ utm_campaign: 'recent', created_at: daysAgo(2) });
    const stale = session({ utm_campaign: 'stale', created_at: daysAgo(200) });
    expect(pick([recent, stale])).toBe(recent);
  });

  it('reads an ISO string timestamp as well as a Date, since a plain row carries a string', () => {
    const newest = untagged();
    const stale = session({ utm_campaign: 'stale', created_at: daysAgo(90).toISOString() });
    expect(pick([newest, stale])).toBe(newest);
    const fresh = session({ utm_campaign: 'fresh', created_at: daysAgo(2).toISOString() });
    expect(pick([newest, fresh])).toBe(fresh);
  });

  it('keeps a session whose timestamp cannot be read, rather than dropping the attribution', () => {
    // Losing an attribution over a missing field is the failure this change exists to stop. A
    // session row with no readable created_at is a schema problem, not a stale click.
    for (const bad of [null, undefined, '', 'not-a-date']) {
      const odd = session({ utm_campaign: 'readable_campaign', created_at: bad as never });
      expect(pick([untagged(), odd])).toBe(odd);
    }
  });

  it('bounds the read by session count too, because a long-lived visitor has unbounded sessions', () => {
    expect(UTM_SESSION_LOOKBACK).toBeGreaterThan(1);
    expect(UTM_SESSION_LOOKBACK).toBeLessThanOrEqual(50);
    expect(UTM_ATTRIBUTION_WINDOW_DAYS).toBeGreaterThan(0);
  });
});

describe('utmBackfillUpdates', () => {
  it('carries all five fields, not just the three that used to travel', () => {
    const updates = utmBackfillUpdates(session(), emptyLead());
    expect(Object.keys(updates).sort()).toEqual([...UTM_FIELDS].sort());
    // utm_content and utm_term are which ad and which placement. 1,464 ad visits carried them and
    // 0 of 450 leads did, because these two were the ones left out.
    expect(updates.utm_content).toBe('52708445138434');
    expect(updates.utm_term).toBe('52708443249434');
  });

  it('never overwrites a tag the lead already has', () => {
    const lead: UtmFields = { utm_campaign: 'from_the_form', utm_source: 'fb|paid' };
    const updates = utmBackfillUpdates(session({ utm_campaign: 'from_the_session' }), lead);
    expect(updates.utm_campaign).toBeUndefined();
    expect(updates.utm_source).toBeUndefined();
    expect(updates.utm_medium).toBe('paid'); // the fields the lead lacks still travel
  });

  it('is safe to run twice: a retried identify call changes nothing the second time', () => {
    const lead: UtmFields = emptyLead();
    const first = utmBackfillUpdates(session(), lead);
    expect(Object.keys(first)).toHaveLength(5);
    Object.assign(lead, first); // what the controller's lead.update() leaves behind
    expect(utmBackfillUpdates(session(), lead)).toEqual({});
  });

  it('copies nothing when there is no session, and nothing when the session is blank', () => {
    expect(utmBackfillUpdates(undefined, emptyLead())).toEqual({});
    expect(utmBackfillUpdates(null, emptyLead())).toEqual({});
    expect(utmBackfillUpdates(untagged(), emptyLead())).toEqual({});
    expect(utmBackfillUpdates({ utm_campaign: '   ', utm_source: '' }, emptyLead())).toEqual({});
  });

  it('treats a lead tag of whitespace as missing, so a blank write does not block the real value', () => {
    expect(utmBackfillUpdates(session(), { utm_campaign: '  ' }).utm_campaign).toBe('52708443249234');
  });

  it('copies the value as it stands, leaving the shape of utm_source to be settled on read', () => {
    expect(utmBackfillUpdates(session({ utm_source: 'fb|paid' }), emptyLead()).utm_source).toBe('fb|paid');
  });

  it('ignores anything outside the five fields, so an unexpected session shape cannot write junk', () => {
    const updates = utmBackfillUpdates({ ...session(), fbclid: 'IwAR123', email: 'x@y.com' } as UtmSession, emptyLead());
    expect(Object.keys(updates).sort()).toEqual([...UTM_FIELDS].sort());
  });
});
