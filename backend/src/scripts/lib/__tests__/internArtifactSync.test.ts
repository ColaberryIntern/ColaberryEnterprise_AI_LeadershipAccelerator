const { syncTicket, formatSummary } = require('../internArtifactSync');
// Aliased, and the names are prefixed deliberately. These suites are GLOBAL SCRIPTS, not modules
// -- the house pattern here is a top-level `require`, as `agentRoster.test.ts` does -- so every
// top-level `const` shares one scope across every test file in the project. Two suites naming the
// same helper collide with TS2451 "Cannot redeclare block-scoped variable", which the frozen
// test-typecheck baseline reads as new errors even though jest runs both files happily.
// Marking the file a module with `export {}` fixes the types and stops jest collecting the
// suite at all, so unique names are the fix that satisfies both.
const {
  renderComment: syncRenderComment,
  fingerprintOf: syncFingerprintOf,
  FINGERPRINT_TAG: SYNC_TAG,
} = require('../internArtifactComment');

/**
 * AF10.7 sync. The properties worth the most here:
 *
 *  - IDEMPOTENT. A second run over unchanged documents posts nothing. The fingerprint IS the
 *    idempotency key and it is read back off Basecamp rather than from a watermark table.
 *  - The dedup survives a ticket with more comments than one page. Ellis's ticket carried 53 when
 *    this was written, and the 26 Oct incident was precisely a dedup that read only the oldest 15:
 *    one job filed a message twice, the other posted on every tick all afternoon.
 *  - `send` defaults to FALSE and nothing is written without it, because a comment cannot be
 *    unposted by this code.
 *  - An unreadable repo posts nothing and states why. A never-seen absent document is not news.
 */

const SYNC_DELIVERABLES = { A: 'docs/discovery/a.md', B: 'docs/migration/b.md' };
const SYNC_REPO = { owner: 'qninying', name: 'platform-reliability-agent', url: 'https://github.com/qninying/platform-reliability-agent' };
const SYNC_TICKET = { id: 10424318092, project_id: 7463955, agent: 'Ellis', title: 'Ellis - the platform agent (Quincy Nkwain Ninying)' };

/** A comment carrying the sentinel this module greps for. */
function sentinelComment(path: string, fingerprint: string) {
  return { content: `<div><em>${SYNC_TAG}:${path}:${fingerprint}</em></div>` };
}

function deps(over: Record<string, any> = {}) {
  return {
    fetchRepoFile: jest.fn().mockResolvedValue('body'),
    bcGetAll: jest.fn().mockResolvedValue([]),
    bcPost: jest.fn().mockResolvedValue({ id: 1, app_url: 'https://basecamp/comment/1' }),
    ...over,
  };
}

describe('syncTicket, deciding', () => {
  it('would post both documents on a ticket with no history', async () => {
    const d = deps();
    const r = await syncTicket({ ticket: SYNC_TICKET, repo: SYNC_REPO, deliverables: SYNC_DELIVERABLES, ...d });

    expect(r.decisions.map((x: any) => x.outcome)).toEqual(['would_post', 'would_post']);
    expect(r.documents).toEqual({ present: 2, absent: 0, unreadable: 0 });
    expect(d.bcPost).not.toHaveBeenCalled();
  });

  it('IDEMPOTENT: a re-run with unchanged content decides nothing to do', async () => {
    const doc = { path: 'docs/discovery/a.md', status: 'present', content: 'body' };
    const fp = syncFingerprintOf(doc);
    const d = deps({
      bcGetAll: jest.fn().mockResolvedValue([
        sentinelComment('docs/discovery/a.md', fp),
        sentinelComment('docs/migration/b.md', fp),
      ]),
    });

    const r = await syncTicket({ ticket: SYNC_TICKET, repo: SYNC_REPO, deliverables: SYNC_DELIVERABLES, ...d, send: true });

    expect(r.decisions.every((x: any) => x.outcome === 'unchanged')).toBe(true);
    expect(d.bcPost).not.toHaveBeenCalled();
  });

  it('posts an update when the content changed under the same path', async () => {
    const stale = syncFingerprintOf({ path: 'docs/discovery/a.md', status: 'present', content: 'OLD' });
    const d = deps({
      bcGetAll: jest.fn().mockResolvedValue([sentinelComment('docs/discovery/a.md', stale)]),
    });

    const r = await syncTicket({
      ticket: SYNC_TICKET, repo: SYNC_REPO, deliverables: { A: 'docs/discovery/a.md' }, ...d, send: true,
    });

    expect(r.decisions[0].outcome).toBe('posted');
    expect(r.decisions[0].previous).toBe(stale);
    expect(d.bcPost).toHaveBeenCalledTimes(1);
  });

  it('THE PAGINATION REGRESSION: finds a fingerprint sitting past the first 15 comments', async () => {
    // The 26 Oct incident in one test. comments.json returns the OLDEST 15; a dedup that reads
    // only that page cannot see its own most recent sentinel and reposts forever.
    const fp = syncFingerprintOf({ path: 'docs/discovery/a.md', status: 'present', content: 'body' });
    const noise = Array.from({ length: 52 }, (_, i) => ({ content: `conversation ${i}` }));
    const d = deps({ bcGetAll: jest.fn().mockResolvedValue([...noise, sentinelComment('docs/discovery/a.md', fp)]) });

    const r = await syncTicket({
      ticket: SYNC_TICKET, repo: SYNC_REPO, deliverables: { A: 'docs/discovery/a.md' }, ...d, send: true,
    });

    expect(r.comments_read).toBe(53);
    expect(r.decisions[0].outcome).toBe('unchanged');
    expect(d.bcPost).not.toHaveBeenCalled();
  });

  it('still finds it on an exactly-full page boundary of 15, and of 30', async () => {
    const fp = syncFingerprintOf({ path: 'docs/discovery/a.md', status: 'present', content: 'body' });
    for (const total of [15, 30]) {
      const noise = Array.from({ length: total - 1 }, (_, i) => ({ content: `c${i}` }));
      const d = deps({ bcGetAll: jest.fn().mockResolvedValue([...noise, sentinelComment('docs/discovery/a.md', fp)]) });
      // eslint-disable-next-line no-await-in-loop
      const r = await syncTicket({
        ticket: SYNC_TICKET, repo: SYNC_REPO, deliverables: { A: 'docs/discovery/a.md' }, ...d, send: true,
      });
      expect(r.comments_read).toBe(total);
      expect(r.decisions[0].outcome).toBe('unchanged');
      expect(d.bcPost).not.toHaveBeenCalled();
    }
  });

  it('reads EVERY comment through the injected paginating client, by its full path', async () => {
    const d = deps();
    await syncTicket({ ticket: SYNC_TICKET, repo: SYNC_REPO, deliverables: { A: 'docs/discovery/a.md' }, ...d });
    expect(d.bcGetAll).toHaveBeenCalledWith('/buckets/7463955/recordings/10424318092/comments.json');
  });
});

describe('syncTicket, the absent and unreadable cases', () => {
  it('says nothing about a document that was never there', async () => {
    const d = deps({ fetchRepoFile: jest.fn().mockResolvedValue(null) });
    const r = await syncTicket({ ticket: SYNC_TICKET, repo: SYNC_REPO, deliverables: SYNC_DELIVERABLES, ...d, send: true });

    expect(r.decisions.every((x: any) => x.outcome === 'skipped_absent')).toBe(true);
    expect(d.bcPost).not.toHaveBeenCalled();
  });

  it('THE DELETION CASE: a document that WAS posted and is now gone posts an update', async () => {
    const wasPosted = syncFingerprintOf({ path: 'docs/discovery/a.md', status: 'present', content: 'body' });
    const d = deps({
      fetchRepoFile: jest.fn().mockResolvedValue(null),
      bcGetAll: jest.fn().mockResolvedValue([sentinelComment('docs/discovery/a.md', wasPosted)]),
    });

    const r = await syncTicket({
      ticket: SYNC_TICKET, repo: SYNC_REPO, deliverables: { A: 'docs/discovery/a.md' }, ...d, send: true,
    });

    expect(r.decisions[0].outcome).toBe('posted');
    expect(d.bcPost).toHaveBeenCalledTimes(1);
    expect(d.bcPost.mock.calls[0][1].content).toContain('no longer in the repository');
  });

  it('ACCEPTANCE 3: an unreadable repo posts the reason, not the document', async () => {
    const d = deps({
      fetchRepoFile: jest.fn().mockRejectedValue(
        Object.assign(new Error('The platform cannot reach this repository.'), { error_class: 'Unauthorized' }),
      ),
    });

    const r = await syncTicket({
      ticket: SYNC_TICKET, repo: SYNC_REPO, deliverables: { A: 'docs/discovery/a.md' }, ...d, send: true,
    });

    expect(r.documents.unreadable).toBe(1);
    expect(d.bcPost.mock.calls[0][1].content).toContain('Unauthorized');
    expect(d.bcPost.mock.calls[0][1].content).toContain('Nothing was posted from the document itself');
  });

  it('states a reason per path when no repo is connected, and reads no files', async () => {
    const d = deps();
    const r = await syncTicket({ ticket: SYNC_TICKET, repo: null, deliverables: SYNC_DELIVERABLES, ...d });

    expect(r.repo).toBeNull();
    expect(r.documents.unreadable).toBe(2);
    expect(d.fetchRepoFile).not.toHaveBeenCalled();
  });
});

describe('send is opt-in', () => {
  it('writes NOTHING when send is omitted', async () => {
    const d = deps();
    const r = await syncTicket({ ticket: SYNC_TICKET, repo: SYNC_REPO, deliverables: SYNC_DELIVERABLES, ...d });

    expect(r.sent).toBe(false);
    expect(d.bcPost).not.toHaveBeenCalled();
    // The body is still produced, because reading it is the point of a dry run.
    expect(r.decisions[0].html).toContain('docs/discovery/a.md');
  });

  it('writes NOTHING when send is explicitly false, even with changes pending', async () => {
    const d = deps();
    await syncTicket({ ticket: SYNC_TICKET, repo: SYNC_REPO, deliverables: SYNC_DELIVERABLES, ...d, send: false });
    expect(d.bcPost).not.toHaveBeenCalled();
  });

  it('posts the same body a dry run showed, so the preview is not a different render', async () => {
    const dry = deps();
    const dryRun = await syncTicket({
      ticket: SYNC_TICKET, repo: SYNC_REPO, deliverables: { A: 'docs/discovery/a.md' }, ...dry,
    });

    const live = deps();
    await syncTicket({
      ticket: SYNC_TICKET, repo: SYNC_REPO, deliverables: { A: 'docs/discovery/a.md' }, ...live, send: true,
    });

    expect(live.bcPost.mock.calls[0][1].content).toBe(dryRun.decisions[0].html);
  });

  it('never marks a ticket complete, whatever else it does', async () => {
    const d = deps();
    await syncTicket({ ticket: SYNC_TICKET, repo: SYNC_REPO, deliverables: SYNC_DELIVERABLES, ...d, send: true });

    const urls = d.bcPost.mock.calls.map((c: any[]) => String(c[0]));
    expect(urls.every((u: string) => u.endsWith('/comments.json'))).toBe(true);
    expect(urls.some((u: string) => u.includes('completion'))).toBe(false);
  });
});

describe('formatSummary', () => {
  it('reports the agent, the ticket, the repo and what happened', async () => {
    const d = deps();
    const r = await syncTicket({ ticket: SYNC_TICKET, repo: SYNC_REPO, deliverables: SYNC_DELIVERABLES, ...d });
    const line = formatSummary(r);

    expect(line).toContain('Ellis');
    expect(line).toContain('10424318092');
    expect(line).toContain('qninying/platform-reliability-agent');
    expect(line).toContain('would_post=2');
  });
});
