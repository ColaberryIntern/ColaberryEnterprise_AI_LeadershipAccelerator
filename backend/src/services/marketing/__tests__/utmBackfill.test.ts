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
import fs from 'fs';
import path from 'path';
import {
  historicalBackfillUpdates,
  pickAttributionSession,
  utmBackfillUpdates,
  UTM_ATTRIBUTION_WINDOW_DAYS,
  UTM_FIELDS,
  UTM_SESSION_LOOKBACK,
  UtmFields,
  UtmLead,
  UtmSession,
} from '../utmBackfill';

const NOW = Date.parse('2026-11-03T12:00:00.000Z');
const DAY_MS = 86_400_000;
const daysAgo = (days: number) => new Date(NOW - days * DAY_MS);

/**
 * A real `visitor_sessions` row. It carries a `utm_medium`, which `leads` gained a column for in
 * C10.4 — before that the fixture kept the field precisely to prove it was NOT copied. The
 * fixtures exercise the shape production actually hands the backfill.
 */
type SessionRow = UtmSession & { utm_medium?: string | null };

const session = (over: SessionRow = {}): SessionRow => ({
  utm_source: 'fb', utm_campaign: '52708443249234', utm_medium: 'paid',
  utm_content: '52708445138434', utm_term: '52708443249434', created_at: daysAgo(1), ...over,
});

const untagged = (over: SessionRow = {}): SessionRow => ({
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
  it('carries every column the lead can hold, not just the two that used to land', () => {
    const updates = utmBackfillUpdates(session(), emptyLead());
    expect(Object.keys(updates).sort()).toEqual([...UTM_FIELDS].sort());
    // utm_content and utm_term are which ad and which placement, and they were the two left out.
    // Measured in production on 2026-11-03: 388 leads created in the previous 30 days carry no
    // utm_content while a session of the same visitor does.
    expect(updates.utm_content).toBe('52708445138434');
    expect(updates.utm_term).toBe('52708443249434');
  });

  it('carries utm_medium now that leads has the column (C10.4)', () => {
    // This test used to assert the OPPOSITE, and the assertion was the old rule written down:
    // medium was excluded because `leads` had no such column, and Sequelize drops a key that is
    // not a model attribute, so the write would have succeeded while the caller's log named a
    // field it had not written. `ensureLeadAttributionColumns` now adds the column — the same file
    // the old comment here pointed at — so the exclusion is gone rather than merely unenforced.
    // Measured against production on 2026-11-08: 447 leads whose own visitor has a session
    // carrying a medium had nowhere for it to land.
    expect([...UTM_FIELDS] as string[]).toContain('utm_medium');
    expect(utmBackfillUpdates(session({ utm_medium: 'paid' }), emptyLead()).utm_medium).toBe('paid');
  });

  it('the column and the field list agree, which is what stops a silently dropped write', () => {
    // The pair that has to stay in step: a field in UTM_FIELDS with no model attribute is
    // dropped without error. Read from the model SOURCE because importing it needs a real
    // sequelize; the DDL half is pinned in db/__tests__/ensureLeadAttributionColumns.test.ts.
    const model = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'models', 'Lead.ts'), 'utf8');
    for (const field of UTM_FIELDS) {
      expect(model).toMatch(new RegExp(`\\n    ${field}: \\{\\s*type: DataTypes\\.STRING\\(255\\),`));
    }
  });

  it('never overwrites a tag the lead already has', () => {
    const lead: UtmFields = { utm_campaign: 'from_the_form', utm_source: 'fb|paid' };
    const updates = utmBackfillUpdates(session({ utm_campaign: 'from_the_session' }), lead);
    expect(updates.utm_campaign).toBeUndefined();
    expect(updates.utm_source).toBeUndefined();
    expect(updates.utm_content).toBe('52708445138434'); // the fields the lead lacks still travel
  });

  it('is safe to run twice: a retried identify call changes nothing the second time', () => {
    const lead: UtmFields = emptyLead();
    const first = utmBackfillUpdates(session(), lead);
    expect(Object.keys(first)).toHaveLength(UTM_FIELDS.length);
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

  it('ignores anything outside those columns, so an unexpected session shape cannot write junk', () => {
    // utm_medium sits in this list on purpose: it is a real session column with no lead column.
    const updates = utmBackfillUpdates(
      { ...session(), utm_medium: 'paid', fbclid: 'IwAR123', email: 'x@y.com' } as UtmSession,
      emptyLead(),
    );
    expect(Object.keys(updates).sort()).toEqual([...UTM_FIELDS].sort());
  });
});

/**
 * historicalBackfillUpdates — the same rule, anchored on the SIGNUP instead of the clock.
 *
 * These are the tests that matter most in this file, because the failure they describe is silent:
 * run against `Date.now()`, a repair over historical rows rejects every session as stale, falls
 * through to "newest session", and writes an attribution that looks plausible and is not bounded
 * by anything. It would not throw, and the rows it wrote would be indistinguishable from correct
 * ones. So the window is anchored on the lead's own created_at, and that is asserted here rather
 * than trusted to the docblock.
 */
describe('historicalBackfillUpdates — the window is measured from the signup, not from today', () => {
  const JULY = Date.parse('2026-07-15T12:00:00.000Z');
  const leadAt = (at: number | Date | string | null): UtmLead => ({ created_at: at as any });
  /** A session N days before the JULY signup, carrying a campaign. */
  const julySession = (daysBeforeSignup: number, over: SessionRow = {}): SessionRow =>
    ({ ...session(), created_at: new Date(JULY - daysBeforeSignup * DAY_MS), ...over });

  it('attributes a July signup to its own July click, which "now" would call stale', () => {
    // The click is 2 days before the signup — plainly attributable — but about four months before
    // NOW. This is the whole case: the lead is historical, the click is not.
    const updates = historicalBackfillUpdates([julySession(2)], leadAt(new Date(JULY)), NOW);
    expect(updates.utm_campaign).toBe('52708443249234');
    expect(updates.utm_content).toBe('52708445138434');
    expect(updates.utm_medium).toBe('paid');
  });

  it('still refuses a click that was already stale AT THE TIME OF THE SIGNUP', () => {
    // Bounded, not merely shifted: a click 31 days before a 30-day window is out of it whichever
    // instant the window is anchored on. The newest session is untagged, so there is nothing to
    // fall back to and the correct answer is to write nothing.
    const stale = julySession(UTM_ATTRIBUTION_WINDOW_DAYS + 1);
    const newest = untagged({ created_at: new Date(JULY - DAY_MS) });
    expect(historicalBackfillUpdates([newest, stale], leadAt(new Date(JULY)), NOW)).toEqual({});
  });

  it('a click exactly on the window boundary is still attributable', () => {
    const edge = julySession(UTM_ATTRIBUTION_WINDOW_DAYS, { utm_campaign: 'edge' });
    expect(historicalBackfillUpdates([edge], leadAt(new Date(JULY)), NOW).utm_campaign).toBe('edge');
  });

  it('PROOF THE ANCHOR IS THE SIGNUP: the clock-anchored call rejects what this one accepts', () => {
    // The control. If this assertion ever fails, the anchor has silently moved back to the clock
    // and every historical repair is unbounded again.
    const sessions = [julySession(2)];
    const lead = leadAt(new Date(JULY));
    expect(historicalBackfillUpdates(sessions, lead, NOW).utm_campaign).toBe('52708443249234');
    // Anchored on NOW instead, the July click is four months stale, so the bounded pick finds
    // nothing attributable and falls through to newestFirst[0] — which here is that same session,
    // so the danger is not a wrong value, it is that NOTHING was bounded. Shown with a second,
    // untagged, newer session: the clock-anchored read now takes the untagged one and writes
    // nothing at all.
    const withNewerUntagged = [untagged({ created_at: new Date(NOW - DAY_MS) }), ...sessions];
    expect(utmBackfillUpdates(pickAttributionSession(withNewerUntagged, NOW), lead)).toEqual({});
    expect(historicalBackfillUpdates(withNewerUntagged, lead, NOW).utm_campaign).toBe('52708443249234');
  });

  it('falls back to the clock when the lead has no readable created_at', () => {
    // A missing stamp must not drop an attribution — that is the failure this module exists to
    // stop — so it degrades to the identify-time behaviour rather than to "write nothing".
    const recent = session({ created_at: daysAgo(1) });
    for (const bad of [null, undefined, '', 'not-a-date']) {
      expect(historicalBackfillUpdates([recent], leadAt(bad as any), NOW).utm_campaign)
        .toBe('52708443249234');
    }
  });

  it('is idempotent: a second pass over a lead it already filled writes nothing', () => {
    const lead: UtmLead = { created_at: new Date(JULY) };
    const first = historicalBackfillUpdates([julySession(2)], lead, NOW);
    expect(Object.keys(first)).toHaveLength(UTM_FIELDS.length);
    Object.assign(lead, first);
    expect(historicalBackfillUpdates([julySession(2)], lead, NOW)).toEqual({});
  });

  it('never overwrites a tag the signup itself supplied', () => {
    const lead: UtmLead = { created_at: new Date(JULY), utm_campaign: 'from_the_form' };
    const updates = historicalBackfillUpdates([julySession(2)], lead, NOW);
    expect(updates).not.toHaveProperty('utm_campaign');
    expect(updates.utm_content).toBe('52708445138434');
  });

  it('an empty or absent session list writes nothing rather than throwing', () => {
    expect(historicalBackfillUpdates([], leadAt(new Date(JULY)), NOW)).toEqual({});
    expect(historicalBackfillUpdates(null as unknown as SessionRow[], leadAt(new Date(JULY)), NOW)).toEqual({});
  });
});
