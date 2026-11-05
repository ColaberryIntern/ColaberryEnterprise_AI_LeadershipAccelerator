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
  FIRED_KEY_TTL_MS, classifyDeploy, DEPLOY_MARGIN_MS,
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
    const all = ['pr_opened', 'pr_merged', 'pr_closed_unmerged', 'pr_deployed']
      .map((e) => buildComment(pr({ merged_at: '2026-10-08T06:00:00Z' }), e, 'abc',
        { builtAt: '2026-10-09T00:00:00Z' })).join('');
    expect(all).not.toContain('—');
  });

  it('a deploy notice says what it measured and refuses the stronger claim', () => {
    const html = buildComment(
      pr({ merged_at: '2026-11-04T12:00:00Z' }), 'pr_deployed', 'deadbee',
      { builtAt: '2026-11-05T12:24:30Z' },
    );
    // The measurement, both halves, so a reader can check the inference themselves.
    expect(html).toContain('2026-11-04T12:00:00Z');
    expect(html).toContain('2026-11-05T12:24:30Z');
    // And the limit, stated rather than left to be assumed.
    expect(html).toContain('not behavioural verification');
    expect(html).toContain('dark behind a flag');
    expect(html).toContain('Read from the container runtime, not inferred from the merge');
  });

  it('a merge notice now points forward instead of dead-ending at "no deploy signal"', () => {
    const html = buildComment(pr({ merged_at: '2026-11-04T12:00:00Z' }), 'pr_merged', 'abc');
    expect(html).toContain('Merged is not deployed');
    // The old copy said the watcher "does not know"; it now says a notice follows, and that
    // its absence is itself information.
    expect(html).toContain('if one never');
  });
});

// ---------------------------------------------------------------------------
describe('classifyDeploy: four verdicts, because two would force a guess', () => {
  const BUILT = '2026-11-05T12:24:30Z';

  it('a merge well before the build is in it', () => {
    expect(classifyDeploy('2026-11-04T12:00:00Z', [BUILT])).toBe('in_build');
  });

  it('a merge after the build cannot be in it', () => {
    expect(classifyDeploy('2026-11-05T13:16:00Z', [BUILT])).toBe('not_in_build');
  });

  it('a merge inside the margin is ambiguous, not rounded up', () => {
    // 10 minutes before the image was stamped: the build was probably already running from an
    // earlier tip. Announcing this as deployed is the one failure that matters.
    expect(classifyDeploy('2026-11-05T12:14:30Z', [BUILT])).toBe('ambiguous');
    // Just outside the margin, it resolves.
    expect(classifyDeploy('2026-11-05T11:50:00Z', [BUILT])).toBe('in_build');
  });

  it('no readable build time is unknown, never in_build', () => {
    expect(classifyDeploy('2026-11-04T12:00:00Z', [])).toBe('unknown');
    expect(classifyDeploy('2026-11-04T12:00:00Z', null)).toBe('unknown');
    expect(classifyDeploy('2026-11-04T12:00:00Z', ['not a date'])).toBe('unknown');
  });

  it('an unparseable merge time is unknown', () => {
    expect(classifyDeploy(null, [BUILT])).toBe('unknown');
    expect(classifyDeploy('whenever', [BUILT])).toBe('unknown');
  });

  /**
   * THE TEST THIS FUNCTION EXISTS FOR. The API and the built frontend live in different images.
   * If the bound were the NEWEST running image, a backend rebuild would report a frontend-only
   * change as live while the frontend serving it was two days old. Bounding on the OLDEST is
   * what makes the claim true for whichever image the change actually landed in.
   */
  it('bounds on the stalest running image, not the freshest', () => {
    const backendFresh = '2026-11-05T12:24:30Z';
    const nginxStale = '2026-11-03T09:00:00Z';
    const mergedBetween = '2026-11-04T12:00:00Z';

    expect(classifyDeploy(mergedBetween, [backendFresh, nginxStale])).toBe('not_in_build');
    // Order of the inputs must not change the verdict.
    expect(classifyDeploy(mergedBetween, [nginxStale, backendFresh])).toBe('not_in_build');
    // Sanity: against the fresh image alone it WOULD have read as deployed, which is the
    // mistake this guards.
    expect(classifyDeploy(mergedBetween, [backendFresh])).toBe('in_build');
  });

  it('accepts epoch numbers as well as ISO strings', () => {
    expect(classifyDeploy('2026-11-04T12:00:00Z', [Date.parse(BUILT)])).toBe('in_build');
  });

  it('honours an explicit margin over the default', () => {
    const merged = '2026-11-05T10:24:30Z';   // two hours before the build
    expect(classifyDeploy(merged, [BUILT])).toBe('in_build');
    expect(classifyDeploy(merged, [BUILT], 3 * 60 * 60 * 1000)).toBe('ambiguous');
    expect(DEPLOY_MARGIN_MS).toBe(30 * 60 * 1000);
  });
});

// ---------------------------------------------------------------------------
describe('the pr_deployed transition: a second rung, and it must not flood', () => {
  const BUILT = '2026-11-05T12:24:30Z';
  const buildTimes = [Date.parse(BUILT)];

  const mergedPr = (over: Record<string, unknown> = {}) => pr({
    state: 'closed',
    merged_at: '2026-11-04T12:00:00Z',
    merge_commit_sha: 'deadbee',
    ...over,
  });

  /** State as it stands after the merge notice has already been posted. */
  const afterMerge = (p: any, deployAdoptedAt: string | null) => {
    const s: any = {
      firedKeys: { [transitionKey(p.number, 'pr_merged', p.head.sha)]: '2026-11-04T12:05:00Z' },
      lastSeen: { [String(p.number)]: { event: 'pr_merged', sha: p.head.sha, at: '2026-11-04T12:05:00Z' } },
      adoptedAt: '2026-10-07T00:00:00Z',
    };
    if (deployAdoptedAt) s.deployAdoptedAt = deployAdoptedAt;
    return s;
  };

  it('announces the deploy once the code is in the running build', () => {
    const p = mergedPr();
    const out = computeTransitions([p], afterMerge(p, '2026-11-01T00:00:00Z'), { buildTimes });
    expect(out).toHaveLength(1);
    expect(out[0].event).toBe('pr_deployed');
    expect(out[0].silent).toBe(false);
  });

  it('keys the deploy on the merge commit, not the head sha', () => {
    // The head sha can still move after a merge; a moving key would announce the same deploy
    // twice.
    const p = mergedPr();
    const out = computeTransitions([p], afterMerge(p, '2026-11-01T00:00:00Z'), { buildTimes });
    expect(out[0].sha).toBe('deadbee');
    expect(out[0].key).toBe(transitionKey(101, 'pr_deployed', 'deadbee'));
  });

  it('never announces the same deploy twice', () => {
    const p = mergedPr();
    const state = afterMerge(p, '2026-11-01T00:00:00Z');
    const first = computeTransitions([p], state, { buildTimes });
    expect(first).toHaveLength(1);
    // Record it the way main() does, then run again.
    state.firedKeys[first[0].key] = '2026-11-05T12:30:00Z';
    expect(computeTransitions([p], state, { buildTimes })).toHaveLength(0);
  });

  /**
   * The flood this would otherwise cause. Every pull request ever merged predates the running
   * image, so without a stamp, switching this on posts a deploy notice on the entire history.
   */
  it('announces nothing for merges that predate the deploy watch', () => {
    const p = mergedPr({ merged_at: '2026-10-01T00:00:00Z' });
    const out = computeTransitions([p], afterMerge(p, '2026-11-01T00:00:00Z'), { buildTimes });
    expect(out).toHaveLength(0);
  });

  it('announces nothing at all until the deploy watch has been stamped', () => {
    const p = mergedPr();
    const out = computeTransitions([p], afterMerge(p, null), { buildTimes });
    expect(out).toHaveLength(0);
  });

  it('announces nothing when the container runtime could not be read', () => {
    const p = mergedPr();
    const state = afterMerge(p, '2026-11-01T00:00:00Z');
    expect(computeTransitions([p], state, { buildTimes: [] })).toHaveLength(0);
    expect(computeTransitions([p], state, {})).toHaveLength(0);
  });

  it('waits for the merge notice first, so the rungs arrive in order', () => {
    // A merged PR whose merge has NOT been announced yet reports the merge this tick, not the
    // deploy. The deploy follows on the next tick.
    const p = mergedPr();
    const state: any = { firedKeys: {}, lastSeen: {}, adoptedAt: '2026-10-07T00:00:00Z', deployAdoptedAt: '2026-11-01T00:00:00Z' };
    const out = computeTransitions([p], state, { buildTimes });
    expect(out).toHaveLength(1);
    expect(out[0].event).toBe('pr_merged');
  });

  it('says nothing about a pull request that is merged but not yet in a build', () => {
    const p = mergedPr({ merged_at: '2026-11-05T13:16:00Z' });   // after the image was built
    const out = computeTransitions([p], afterMerge(p, '2026-11-01T00:00:00Z'), { buildTimes });
    expect(out).toHaveLength(0);
  });

  /**
   * THE ONE THAT MATTERS MOST, and it was missing until a mutation test exposed it.
   *
   * Changing the announce condition from `=== 'in_build'` to `!== 'not_in_build'` - which would
   * publish an ambiguous verdict as a deploy - passed every other test in this file. The
   * classifyDeploy unit test proves the verdict is 'ambiguous'; only this one proves the
   * watcher STAYS SILENT on it. Rounding ambiguous up is the single failure this whole design
   * exists to prevent, so it needs a test that dies when the rounding is reintroduced.
   */
  it('stays silent on an ambiguous verdict instead of rounding it up to deployed', () => {
    // Ten minutes before the image was stamped: the build was very likely already running from
    // an earlier tip, so the image may not carry this merge at all.
    const p = mergedPr({ merged_at: '2026-11-05T12:14:30Z' });
    const state = afterMerge(p, '2026-11-01T00:00:00Z');
    expect(classifyDeploy(p.merged_at, buildTimes)).toBe('ambiguous');
    expect(computeTransitions([p], state, { buildTimes })).toHaveLength(0);
  });

  it('stays silent when the merge time itself is unreadable', () => {
    const p = mergedPr({ merged_at: 'sometime last week' });
    const out = computeTransitions([p], afterMerge(p, '2026-11-01T00:00:00Z'), { buildTimes });
    expect(out).toHaveLength(0);
  });

  it('still ignores a pull request with no ticket link', () => {
    const p = mergedPr({ body: 'no link here' });
    expect(computeTransitions([p], afterMerge(p, '2026-11-01T00:00:00Z'), { buildTimes })).toHaveLength(0);
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

  /**
   * The deploy signal gave this worker a second external dependency: the container runtime.
   * That is a far bigger surface than an unauthenticated GET, so it gets the same treatment as
   * the GitHub promise - asserted against the source, not the prose.
   */
  it('calls the container runtime only to inspect, never to change anything', () => {
    expect(src).toContain('execFileSync');
    // An argument array, never a shell string, so a container name cannot be read as syntax.
    expect(src).not.toMatch(/\bexecSync\b/);
    expect(src).not.toMatch(/child_process['"]\)\.exec\b/);
    expect(src).not.toMatch(/\bspawnSync?\(/);

    const dockerArgs = src.match(/run\(\[[^\]]*\]\)/g) || [];
    expect(dockerArgs.length).toBeGreaterThan(0);
    for (const call of dockerArgs) {
      expect(call).toMatch(/'inspect'/);
    }
    for (const verb of ['run', 'stop', 'start', 'rm', 'kill', 'restart', 'exec', 'compose', 'pull', 'push']) {
      expect(src).not.toContain("'" + verb + "'");
    }
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
