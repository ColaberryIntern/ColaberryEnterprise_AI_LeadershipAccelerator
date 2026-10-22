/* eslint-disable */
// Unit tests for the AF10.4 daily report.
//
// The load-bearing block is the FIRST one. `internConsoleActivity.ts` owns the activity bands and
// says in its own docblock that two implementations disagreeing would be the worst bug here,
// because both numbers look authoritative. The report is a .js operational script that runs from
// the host and cannot import TypeScript, so the bands are ported — and pinned against the
// original across the whole range, including the grace rule's deliberate refusal to soften
// `unknown`.
//
// The rest guard the three rules the ticket sets: every number traced, a quiet day reading as
// quiet rather than empty, and what could not be determined being stated rather than omitted.

const {
  buildReport, bandFor, withGrace, staleSyncWatch, daysBetween, NEW_INTERN_GRACE_DAYS,
} = require('../dailyAgentReport');
import {
  bandFor as tsBandFor,
  withGrace as tsWithGrace,
  NEW_INTERN_GRACE_DAYS as TS_GRACE,
} from '../../../services/internship/internConsoleActivity';

describe('the ported bands match internConsoleActivity exactly', () => {
  it('agrees on every day from 0 to 40, and on null', () => {
    for (let d = 0; d <= 40; d += 1) expect(bandFor(d)).toBe(tsBandFor(d));
    expect(bandFor(null)).toBe(tsBandFor(null));
  });

  it('agrees on the boundaries, which is where a port drifts first', () => {
    for (const d of [0, 1, 3, 4, 6, 7, 9, 10]) expect(bandFor(d)).toBe(tsBandFor(d));
  });

  it('agrees on the grace cap across every level and both sides of the window', () => {
    const levels = ['green', 'yellow', 'orange', 'red', 'black', 'unknown'];
    for (const level of levels) {
      for (const joined of [0, 1, 29, 30, 31, 90, null]) {
        expect(withGrace(level as any, joined)).toEqual(tsWithGrace(level as any, joined));
      }
    }
  });

  it('NEVER softens unknown, which is the rule most likely to be "tidied" away', () => {
    expect(withGrace('unknown', 1).level).toBe('unknown');
    expect(tsWithGrace('unknown' as any, 1).level).toBe('unknown');
  });

  it('carries the same grace window', () => {
    expect(NEW_INTERN_GRACE_DAYS).toBe(TS_GRACE);
  });
});

describe('the stale-sync watch is RELATIVE, which is the whole point', () => {
  const now = '2026-10-22T18:00:00Z';
  const repo = (domain: string, hoursAgo: number | null) => ({
    domain, intern: domain, repoUrl: `https://github.com/x/${domain}`,
    lastSyncAt: hoursAgo === null ? null : new Date(Date.parse(now) - hoursAgo * 3600000).toISOString(),
  });

  it('flags the ONE repo drifting behind its siblings', () => {
    // The private-repo failure mode: six healthy, one silently stopped.
    const out = staleSyncWatch(
      [repo('a', 1), repo('b', 1), repo('c', 1), repo('d', 1), repo('e', 1), repo('f', 30)], now,
    );
    expect(out.determinable).toBe(true);
    expect(out.flagged.map((f: any) => f.domain)).toEqual(['f']);
  });

  it('flags NOBODY when every repo is equally stale, because that is a platform problem', () => {
    // A fixed age threshold would flag all six here and teach the reader to ignore it.
    const out = staleSyncWatch(
      [repo('a', 48), repo('b', 48), repo('c', 48), repo('d', 48)], now,
    );
    expect(out.flagged).toEqual([]);
  });

  it('refuses to judge on too few repos rather than guessing from two', () => {
    const out = staleSyncWatch([repo('a', 1), repo('b', 40)], now);
    expect(out.determinable).toBe(false);
    expect(out.reason).toMatch(/too few/);
  });

  it('lists repos that have NEVER synced separately from drifted ones', () => {
    const out = staleSyncWatch(
      [repo('a', 1), repo('b', 1), repo('c', 1), repo('never', null)], now,
    );
    expect(out.neverSynced).toEqual(['never']);
    expect(out.flagged.map((f: any) => f.domain)).not.toContain('never');
  });
});

describe('a quiet day reads as a quiet day', () => {
  const agent = (over: any = {}) => ({
    domain: 'platform', agent: 'Ellis', intern: 'Quincy', verified: 4, stories: 54,
    movedSinceYesterday: [], lastCommitAt: '2026-10-22T10:00:00Z', joinedAt: '2026-09-01T00:00:00Z',
    repoUrl: 'https://github.com/x/y', lastSyncAt: '2026-10-22T17:00:00Z', dueDates: [], ...over,
  });
  const now = '2026-10-22T18:00:00Z';

  it('says so in words when nothing moved, rather than returning an empty report', () => {
    const r = buildReport({ agents: [agent(), agent({ domain: 'sales' })], now });
    expect(r.headline).toMatch(/Nothing moved since yesterday/);
    expect(r.headline).toMatch(/measured quiet day, not a missing report/);
  });

  it('counts what moved when something did', () => {
    const r = buildReport({
      agents: [agent({ movedSinceYesterday: ['RESEARCH-1 verified', 'RESEARCH-2 verified'] })], now,
    });
    expect(r.totals.movedCount).toBe(2);
    expect(r.headline).toMatch(/2 things moved/);
  });
});

describe('it states what it could not determine', () => {
  const now = '2026-10-22T18:00:00Z';
  const base = {
    domain: 'sales', agent: 'Vic', intern: 'Victoria', verified: 0, stories: 38,
    movedSinceYesterday: [], joinedAt: '2026-10-14T00:00:00Z', dueDates: [],
  };

  it('names an agent with no repository instead of showing a silent zero', () => {
    const r = buildReport({ agents: [{ ...base, repoUrl: null, lastCommitAt: null, lastSyncAt: null }], now });
    expect(r.undetermined.join(' ')).toMatch(/sales: no repository connected/);
  });

  it('names a connected repo with no commit date', () => {
    const r = buildReport({
      agents: [{ ...base, repoUrl: 'https://github.com/x/y', lastCommitAt: null, lastSyncAt: now }], now,
    });
    expect(r.undetermined.join(' ')).toMatch(/no commit date recorded/);
  });

  it('says when the stale-sync watch could not run at all', () => {
    const r = buildReport({ agents: [{ ...base, repoUrl: 'u', lastCommitAt: now, lastSyncAt: now }], now });
    expect(r.undetermined.join(' ')).toMatch(/Stale-sync watch/);
  });
});

describe('dates', () => {
  const now = '2026-10-22T18:00:00Z';
  const agent = (dueDates: string[]) => ({
    domain: 'd', agent: 'A', intern: 'I', verified: 0, stories: 1, movedSinceYesterday: [],
    lastCommitAt: now, joinedAt: '2026-01-01T00:00:00Z', repoUrl: 'u', lastSyncAt: now, dueDates,
  });

  it('counts overdue and due-soon separately', () => {
    const r = buildReport({ agents: [agent(['2026-10-20', '2026-10-23', '2026-11-30'])], now });
    expect(r.rows[0].overdue).toBe(1);   // the 20th
    expect(r.rows[0].dueSoon).toBe(1);   // the 23rd, within 2 days
  });

  it('does not count today as overdue', () => {
    const r = buildReport({ agents: [agent(['2026-10-22'])], now });
    expect(r.rows[0].overdue).toBe(0);
    expect(r.rows[0].dueSoon).toBe(1);
  });

  it('daysBetween returns null rather than NaN on a missing or bad date', () => {
    expect(daysBetween(null, now)).toBeNull();
    expect(daysBetween(now, undefined)).toBeNull();
    expect(daysBetween('nonsense', now)).toBeNull();
  });
});
