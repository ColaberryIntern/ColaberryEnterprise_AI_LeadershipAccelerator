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
  buildReport, bandFor, withGrace, staleSyncWatch, daysBetween, shapeAgentRows,
  renderHtml, NEW_INTERN_GRACE_DAYS,
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

describe('shaping does not mistake the platform for the intern', () => {
  // The provisioner commits into EVERY one of these repositories. If its commits counted as
  // movement the report would show seven busy interns on a day nobody touched anything, which
  // is the precise failure this report exists to prevent.
  const now = '2026-10-22T18:00:00Z';
  const row = (commits: any[]) => ({
    domain: 'marketing', intern: 'Sarbjit', stories: 70, verified: 0,
    joined_at: '2026-10-14T00:00:00Z', repo_url: 'u', last_sync_at: now, commits,
    due_dates: null, moved: null,
  });

  it('drops the build bot and the provisioner chore, keeps the intern commit', () => {
    const [out] = shapeAgentRows([row([
      { date: '2026-10-22T10:00:00Z', author: 'Colaberry Build Bot', message: 'sync' },
      { date: '2026-10-22T11:00:00Z', author: 'Someone', message: 'chore(colaberry): provision' },
      { date: '2026-10-22T12:00:00Z', author: 'Sarbjit', message: 'Add discovery notes' },
    ])], now);
    expect(out.movedSinceYesterday).toEqual(['commit: Add discovery notes']);
  });

  it('still uses a platform commit for the last-commit DATE, because the repo did sync', () => {
    // Deliberate asymmetry: a bot commit is not the intern working, but it does prove the
    // repository is reachable, which is what the activity band and the sync watch read.
    const [out] = shapeAgentRows([row([
      { date: '2026-10-22T10:00:00Z', author: 'Colaberry Build Bot', message: 'sync' },
    ])], now);
    expect(out.lastCommitAt).toBe('2026-10-22T10:00:00Z');
    expect(out.movedSinceYesterday).toEqual([]);
  });

  it('cuts a long commit subject at a word boundary, not mid-word', () => {
    // The first real report carried "document the rol" and "map the nine anatomy elem".
    const [out] = shapeAgentRows([row([{
      date: '2026-10-22T12:00:00Z',
      author: 'QNinying',
      message: 'platform.RESEARCH-3-ROLE-AND-DA-TRANSITION: document the role and which DA bits move',
    }])], now);
    const line = out.movedSinceYesterday[0];
    expect(line.endsWith('...')).toBe(true);
    expect(line).not.toMatch(/\srol\.\.\.$/);
    expect(line.replace(/^commit: /, '').length).toBeLessThanOrEqual(63);
  });

  it('leaves a short subject completely alone, with no ellipsis', () => {
    const [out] = shapeAgentRows([row([
      { date: '2026-10-22T12:00:00Z', author: 'Sarbjit', message: 'Add discovery notes' },
    ])], now);
    expect(out.movedSinceYesterday).toEqual(['commit: Add discovery notes']);
  });

  it('ignores commits older than 24 hours and survives a null commit list', () => {
    const [old] = shapeAgentRows([row([
      { date: '2026-10-20T12:00:00Z', author: 'Sarbjit', message: 'Initial commit' },
    ])], now);
    expect(old.movedSinceYesterday).toEqual([]);
    expect(old.lastCommitAt).toBe('2026-10-20T12:00:00Z');

    const [none] = shapeAgentRows([{ ...row([]), commits: null }], now);
    expect(none.lastCommitAt).toBeNull();
    expect(none.movedSinceYesterday).toEqual([]);
  });
});

describe('the rendered body states the things the ticket asked for', () => {
  // The artifact on the ticket shows THIS output, so these assertions are also what keeps the
  // picture on the ticket honest.
  const now = '2026-10-22T18:00:00Z';
  const render = (over: any = {}) => renderHtml(buildReport({
    agents: [{
      domain: 'marketing', agent: 'marketing', intern: 'Sarbjit', verified: 0, stories: 70,
      movedSinceYesterday: [], lastCommitAt: '2026-10-20T12:00:00Z',
      joinedAt: '2026-09-01T00:00:00Z', repoUrl: 'https://github.com/x/y',
      lastSyncAt: now, dueDates: ['2026-10-20'], ...over,
    }],
    now,
  }), now);

  it('names the source of every number', () => {
    const html = render();
    for (const src of ['student_tasks.verified_at', 'commit_summary_json',
      'student_tasks.due_on', 'github_connections.last_sync_at']) {
      expect(html).toContain(src);
    }
  });

  it('escapes an intern name so a stray angle bracket cannot break the email', () => {
    expect(render({ intern: 'A <b>name' })).toContain('A &lt;b&gt;name');
  });

  it('says the quiet day out loud in the body, not just in the data', () => {
    expect(render()).toMatch(/measured quiet day, not a missing report/);
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
