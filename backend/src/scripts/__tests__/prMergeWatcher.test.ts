export {}; // module scope, so top-level `classify` does not collide globally (TS2451)

/**
 * Tests for the Commercialization PR Merge Watcher (ticket C0.4).
 *
 * The watcher's two load-bearing promises are "it never writes to GitHub" and "it never posts
 * the same transition twice". Neither is provable by reading the prose at the top of the file,
 * so both are asserted here: the first structurally against the source text, the second by
 * driving the pure decision functions through the sequences that would produce a duplicate.
 *
 * Requiring the module fires no I/O: every network call lives behind `require.main === module`,
 * so these tests need no HTTP mocking. That is a property of the worker's shape, and the last
 * test in this file guards it.
 */

const fs = require('fs');
const path = require('path');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const watcher = require('../prMergeWatcher');

const {
  parseTicketLink, classify, eventFor, transitionKey, marker,
  computeTransitions, alreadyPosted, buildComment, pruneFiredKeys, escapeHtml,
  FIRED_KEY_TTL_MS,
} = watcher;

const TODO_URL = 'https://app.basecamp.com/3945211/buckets/7463955/todos/10379236192';

const pr = (over: Record<string, unknown> = {}) => ({
  number: 101,
  created_at: '2026-10-07T00:00:00Z',
  title: 'A change',
  body: 'Does a thing.\n\nBasecamp: ' + TODO_URL + '\n',
  state: 'open',
  merged_at: null,
  draft: false,
  html_url: 'https://github.com/o/r/pull/101',
  head: { sha: 'abc1234' },
  merge_commit_sha: null,
  ...over,
});

const freshState = () => ({ firedKeys: {} as Record<string, string>, lastSeen: {} as Record<string, any> });

// ---------------------------------------------------------------------------
describe('parseTicketLink: opt-in is what keeps the watcher off other peoples PRs', () => {
  it('reads account, bucket and todo out of a normal link', () => {
    const t = parseTicketLink('Basecamp: ' + TODO_URL);
    expect(t).toEqual({ accountId: '3945211', bucketId: '7463955', todoId: '10379236192', url: TODO_URL });
  });

  it('accepts the 3.basecamp.com host as well as app.basecamp.com', () => {
    const t = parseTicketLink('see https://3.basecamp.com/3945211/buckets/7463955/todos/999');
    expect(t?.todoId).toBe('999');
  });

  it('returns null for a PR with no link, which is how a PR stays invisible', () => {
    expect(parseTicketLink('No ticket here')).toBeNull();
    expect(parseTicketLink('')).toBeNull();
    expect(parseTicketLink(null)).toBeNull();
    expect(parseTicketLink(undefined)).toBeNull();
  });

  it('is not fooled by a Basecamp link that is not a to-do', () => {
    expect(parseTicketLink('https://app.basecamp.com/3945211/buckets/7463955/messages/123')).toBeNull();
    expect(parseTicketLink('https://app.basecamp.com/3945211/projects/21023844')).toBeNull();
  });

  it('ignores a lookalike host, so a forged link in an outside PR cannot address our Basecamp', () => {
    expect(parseTicketLink('https://evil.com/3945211/buckets/1/todos/2')).toBeNull();
    expect(parseTicketLink('https://basecamp.com.attacker.net/1/buckets/2/todos/3')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('classify and eventFor', () => {
  it('reads merged from merged_at, not from state alone', () => {
    expect(classify(pr({ state: 'closed', merged_at: '2026-10-08T06:00:00Z' }))).toBe('merged');
  });
  it('separates closed-without-merge from merged', () => {
    expect(classify(pr({ state: 'closed', merged_at: null }))).toBe('closed_unmerged');
  });
  it('treats an open PR as open', () => {
    expect(classify(pr())).toBe('open');
  });
  it('maps each status to its event name', () => {
    expect(eventFor('merged')).toBe('pr_merged');
    expect(eventFor('closed_unmerged')).toBe('pr_closed_unmerged');
    expect(eventFor('open')).toBe('pr_opened');
    expect(eventFor('nonsense')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('computeTransitions: the happy path', () => {
  it('announces a newly seen open PR', () => {
    const out = computeTransitions([pr()], freshState());
    expect(out).toHaveLength(1);
    expect(out[0].event).toBe('pr_opened');
    expect(out[0].silent).toBe(false);
    expect(out[0].ticket.todoId).toBe('10379236192');
  });

  it('announces a merge after the PR was previously seen open', () => {
    const state = freshState();
    state.lastSeen['101'] = { event: 'pr_opened', sha: 'abc1234', at: '2026-10-07T00:00:00Z' };
    const out = computeTransitions([pr({ state: 'closed', merged_at: '2026-10-08T06:00:00Z' })], state);
    expect(out).toHaveLength(1);
    expect(out[0].event).toBe('pr_merged');
    expect(out[0].silent).toBe(false);
  });

  it('skips a PR with no ticket link entirely', () => {
    expect(computeTransitions([pr({ body: 'no link' })], freshState())).toHaveLength(0);
  });

  it('handles a PR whose body is null without throwing', () => {
    expect(() => computeTransitions([pr({ body: null })], freshState())).not.toThrow();
    expect(computeTransitions([pr({ body: null })], freshState())).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe('computeTransitions: adoption, so turning this on does not spam every old ticket', () => {
  it('adopts an already-merged PR silently on the very first run', () => {
    const out = computeTransitions([pr({ state: 'closed', merged_at: '2026-01-01T00:00:00Z' })], freshState());
    expect(out).toHaveLength(1);
    expect(out[0].silent).toBe(true);
  });

  it('adopts an already-closed PR silently on the very first run', () => {
    const out = computeTransitions([pr({ state: 'closed', merged_at: null })], freshState());
    expect(out[0].silent).toBe(true);
  });

  it('still announces a first-sighting MERGE when explicitly asked to', () => {
    const out = computeTransitions(
      [pr({ state: 'closed', merged_at: '2026-01-01T00:00:00Z' })],
      freshState(),
      { announceFirstSighting: true },
    );
    expect(out[0].silent).toBe(false);
  });

  it('a hundred historical merged PRs produce a hundred silent adoptions and zero posts', () => {
    const many = Array.from({ length: 100 }, (_, i) =>
      pr({ number: 200 + i, state: 'closed', merged_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' }));
    const out = computeTransitions(many, { ...freshState(), adoptedAt: '2026-06-01T00:00:00Z' });
    expect(out).toHaveLength(100);
    expect(out.every((t: any) => t.silent === true)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('the open-and-merge-between-ticks gap: a poller must not swallow a fast merge', () => {
  const ADOPTED = '2026-06-01T00:00:00Z';

  it('ANNOUNCES a PR that was raised and merged inside one tick interval', () => {
    // Never seen before, already merged, but created AFTER we started watching. This is the
    // case a naive "first sighting of a non-open PR is silent" rule loses entirely.
    const fast = pr({
      number: 500,
      created_at: '2026-10-08T10:00:00Z',
      state: 'closed',
      merged_at: '2026-10-08T10:09:00Z',
    });
    const out = computeTransitions([fast], { ...freshState(), adoptedAt: ADOPTED });
    expect(out).toHaveLength(1);
    expect(out[0].event).toBe('pr_merged');
    expect(out[0].silent).toBe(false);
  });

  it('still adopts silently a PR that predates the watch start', () => {
    const old = pr({
      number: 501,
      created_at: '2026-01-15T00:00:00Z',
      state: 'closed',
      merged_at: '2026-01-16T00:00:00Z',
    });
    const out = computeTransitions([old], { ...freshState(), adoptedAt: ADOPTED });
    expect(out[0].silent).toBe(true);
  });

  it('announces a fast CLOSE without merge too, not just a fast merge', () => {
    const fast = pr({
      number: 502, created_at: '2026-10-08T10:00:00Z', state: 'closed', merged_at: null,
    });
    const out = computeTransitions([fast], { ...freshState(), adoptedAt: ADOPTED });
    expect(out[0].silent).toBe(false);
    expect(out[0].event).toBe('pr_closed_unmerged');
  });

  it('treats an unparseable created_at as live traffic rather than silently dropping it', () => {
    const weird = pr({ number: 503, created_at: 'not-a-date', state: 'closed', merged_at: '2026-10-08T10:00:00Z' });
    const out = computeTransitions([weird], { ...freshState(), adoptedAt: ADOPTED });
    expect(out[0].silent).toBe(false);
  });

  it('a PR created exactly at the watch instant is treated as live, not history', () => {
    const boundary = pr({ number: 504, created_at: ADOPTED, state: 'closed', merged_at: '2026-06-01T00:05:00Z' });
    const out = computeTransitions([boundary], { ...freshState(), adoptedAt: ADOPTED });
    expect(out[0].silent).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('idempotency: the property that stops 47 duplicate comments on one to-do', () => {
  it('does not re-announce a transition already in firedKeys', () => {
    const state = freshState();
    const key = transitionKey(101, 'pr_opened', 'abc1234');
    state.firedKeys[key] = new Date().toISOString();
    expect(computeTransitions([pr()], state)).toHaveLength(0);
  });

  it('does not re-announce when the PR has not changed since last tick', () => {
    const state = freshState();
    state.lastSeen['101'] = { event: 'pr_opened', sha: 'abc1234', at: '2026-10-07T00:00:00Z' };
    expect(computeTransitions([pr()], state)).toHaveLength(0);
  });

  it('is stable across repeated ticks once the key is recorded', () => {
    const state = freshState();
    const first = computeTransitions([pr()], state);
    expect(first).toHaveLength(1);
    // simulate the worker recording the checkpoint
    state.firedKeys[first[0].key] = new Date().toISOString();
    state.lastSeen['101'] = { event: first[0].event, sha: first[0].sha, at: new Date().toISOString() };
    for (let i = 0; i < 5; i++) expect(computeTransitions([pr()], state)).toHaveLength(0);
  });

  it('announces again when a merge follows an open, because that is a real second transition', () => {
    const state = freshState();
    const opened = computeTransitions([pr()], state)[0];
    state.firedKeys[opened.key] = new Date().toISOString();
    state.lastSeen['101'] = { event: 'pr_opened', sha: 'abc1234', at: new Date().toISOString() };
    const merged = computeTransitions([pr({ state: 'closed', merged_at: '2026-10-08T06:00:00Z' })], state);
    expect(merged).toHaveLength(1);
    expect(merged[0].event).toBe('pr_merged');
  });

  it('alreadyPosted finds the marker in a thread, which is the authority over the state file', () => {
    const thread = [
      { content: '<div>unrelated human comment</div>' },
      { content: buildComment(pr(), 'pr_opened', 'abc1234') },
    ];
    expect(alreadyPosted(thread, 101, 'pr_opened', 'abc1234')).toBe(true);
    expect(alreadyPosted(thread, 101, 'pr_merged', 'abc1234')).toBe(false);
    expect(alreadyPosted(thread, 102, 'pr_opened', 'abc1234')).toBe(false);
  });

  it('alreadyPosted survives a thread with null or non-string content', () => {
    expect(alreadyPosted([{ content: null }, {}, { content: 123 }], 101, 'pr_opened', 'abc')).toBe(false);
    expect(alreadyPosted([], 101, 'pr_opened', 'abc')).toBe(false);
    expect(alreadyPosted(null, 101, 'pr_opened', 'abc')).toBe(false);
  });

  it('a wiped state file costs API calls, not duplicate comments', () => {
    // State is gone, so computeTransitions proposes the transition again...
    const proposed = computeTransitions([pr()], freshState());
    expect(proposed).toHaveLength(1);
    // ...but the thread still carries the marker, so the worker will not post it.
    const thread = [{ content: buildComment(pr(), 'pr_opened', 'abc1234') }];
    expect(alreadyPosted(thread, proposed[0].pr.number, proposed[0].event, proposed[0].sha)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('pruneFiredKeys: boundary conditions', () => {
  it('keeps a key inside the TTL and drops one outside it', () => {
    const now = Date.parse('2026-10-08T00:00:00Z');
    const state: any = { firedKeys: {
      fresh: new Date(now - 1000).toISOString(),
      old: new Date(now - FIRED_KEY_TTL_MS - 1000).toISOString(),
    } };
    expect(pruneFiredKeys(state, now)).toBe(1);
    expect(Object.keys(state.firedKeys)).toEqual(['fresh']);
  });

  it('drops a key with an unparseable timestamp rather than keeping it forever', () => {
    const state: any = { firedKeys: { bad: 'not-a-date' } };
    expect(pruneFiredKeys(state, Date.now())).toBe(1);
  });

  it('handles an empty or absent firedKeys map', () => {
    expect(pruneFiredKeys({ firedKeys: {} } as any, Date.now())).toBe(0);
    expect(pruneFiredKeys({} as any, Date.now())).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('buildComment', () => {
  it('carries the dedup marker', () => {
    expect(buildComment(pr(), 'pr_opened', 'abc1234')).toContain(marker(101, 'pr_opened', 'abc1234'));
  });

  it('says plainly that merged is not deployed, because the watcher cannot see deploys', () => {
    const html = buildComment(pr({ state: 'closed', merged_at: '2026-10-08T06:00:00Z' }), 'pr_merged', 'abc1234');
    expect(html).toContain('Merged is not deployed');
  });

  it('states that a human closes the to-do', () => {
    expect(buildComment(pr(), 'pr_opened', 'abc')).toContain('a human closes this to-do');
  });

  it('escapes a hostile PR title instead of injecting it into the comment', () => {
    const html = buildComment(pr({ title: '<img src=x onerror=alert(1)>' }), 'pr_opened', 'abc');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('escapeHtml covers the five characters that matter', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('contains no em dash, per the outbound copy rule', () => {
    const all = ['pr_opened', 'pr_merged', 'pr_closed_unmerged']
      .map((e) => buildComment(pr({ merged_at: '2026-10-08T06:00:00Z' }), e, 'abc')).join('');
    expect(all).not.toContain('—');
  });
});

// ---------------------------------------------------------------------------
describe('the structural promises, asserted against the source rather than the prose', () => {
  const src: string = fs.readFileSync(path.join(__dirname, '..', 'prMergeWatcher.js'), 'utf8');

  // Positive control: if this read ever silently returns something tiny, every assertion below
  // would pass vacuously. Catch that here rather than trusting an absence.
  it('reads a source file of a plausible size (positive control)', () => {
    expect(src.length).toBeGreaterThan(4000);
    expect(src).toContain('async function ghGet');
  });

  it('never sends a non-GET request to GitHub', () => {
    const ghCalls = src.split('\n').filter((l: string) => l.includes('GH_API') || l.includes('api.github.com'));
    expect(ghCalls.length).toBeGreaterThan(0);
    for (const line of ghCalls) {
      expect(line).not.toMatch(/method:\s*'(POST|PATCH|PUT|DELETE)'/i);
    }
    // The single fetch to GitHub pins its method explicitly.
    expect(src).toMatch(/fetch\(GH_API \+ pathname, \{\s*\n\s*method: 'GET',/);
  });

  it('contains no GitHub merge, close, review or label call path', () => {
    expect(src).not.toMatch(/\/merge\b/);
    expect(src).not.toMatch(/pulls\/[^'"]*\/(merge|reviews|requested_reviewers)/);
    expect(src).not.toMatch(/\bissues\/[^'"]*\/(labels|comments)/);
    expect(src).not.toMatch(/prAutoMerge/);
    expect(src).not.toMatch(/\bgh pr (merge|close|review|edit)\b/);
  });

  it('never completes or closes a Basecamp to-do', () => {
    expect(src).not.toMatch(/completion\.json/);
    expect(src).not.toMatch(/\/todos\/[^'"]*\/(completion|position)/);
  });

  it('writes to Basecamp only by posting a comment', () => {
    const bcWrites = src.split('\n').filter((l: string) => /method: 'POST'/.test(l));
    expect(bcWrites).toHaveLength(1);
    expect(src).toMatch(/comments\.json/);
  });

  it('defaults to dry run, so running it by hand posts nothing', () => {
    expect(src).toMatch(/const execute = process\.argv\.includes\('--execute'\)/);
  });

  it('keeps all I/O behind require.main, which is why these tests need no HTTP mock', () => {
    expect(src).toMatch(/if \(require\.main === module\)/);
    const idx = src.indexOf('if (require.main === module)');
    expect(idx).toBeGreaterThan(0);
    // module.exports must come before the entrypoint guard, so requiring is side-effect free
    expect(src.indexOf('module.exports')).toBeLessThan(idx);
  });

  it('requiring the module fired no network call', () => {
    // If require() had executed main(), fetch would have been called during module load.
    // There is no fetch spy here on purpose: the assertion is that the module loaded at all
    // without a BASECAMP_ACCESS_TOKEN set, which bcHeaders() would have thrown on.
    expect(typeof watcher.computeTransitions).toBe('function');
    expect(process.env.BASECAMP_ACCESS_TOKEN).toBeUndefined();
  });
});
