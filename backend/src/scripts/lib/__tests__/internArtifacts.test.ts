const { readDeliverables, summarize, MAX_DOC_BYTES } = require('../internArtifacts');

/**
 * AF10.7 reader. The properties worth the most here:
 *
 *  - `absent` and `unreadable` NEVER collapse. That is the ticket's third acceptance line, and the
 *    reason an intern with a private repo must not be told their document is missing.
 *  - An unreadable path keeps the reader's own sentence and `error_class` rather than a paraphrase.
 *  - No repo connected is a stated reason on every path, not an empty result.
 *  - A document over the ceiling is marked truncated rather than silently cut.
 *
 * `fetchRepoFile` is INJECTED, never a patched global, so these tests exercise the real contract:
 * null means 404, a throw means anything else.
 */

const DELIVERABLES = {
  'RESEARCH-1-SYSTEM-CLASSES': 'docs/discovery/01-system-classes.md',
  'LEGACY-MIGRATION-PLAN': 'docs/migration/legacy-migration-plan.md',
};

const REPO = { owner: 'qninying', name: 'platform-reliability-agent', url: 'https://github.com/qninying/platform-reliability-agent' };

/** A RepoConnectError-shaped throw: a reader sentence plus a stable class. */
function classified(error_class: string, message: string) {
  return Object.assign(new Error(message), { error_class });
}

describe('readDeliverables', () => {
  it('returns content and a byte count for a document that is there', async () => {
    const fetchRepoFile = jest.fn().mockResolvedValue('# System classes\n\nBody.');
    const docs = await readDeliverables({ repo: REPO, deliverables: DELIVERABLES, fetchRepoFile });

    expect(docs).toHaveLength(2);
    const first = docs.find((d: any) => d.path === 'docs/discovery/01-system-classes.md');
    expect(first.status).toBe('present');
    expect(first.content).toContain('System classes');
    expect(first.bytes).toBeGreaterThan(0);
    expect(first.truncated).toBe(false);
  });

  it('reads the path from the injected deliverables map, not a hardcoded list', async () => {
    const fetchRepoFile = jest.fn().mockResolvedValue('x');
    await readDeliverables({ repo: REPO, deliverables: { ONLY: 'docs/migration/only.md' }, fetchRepoFile });

    expect(fetchRepoFile).toHaveBeenCalledTimes(1);
    expect(fetchRepoFile).toHaveBeenCalledWith('qninying', 'platform-reliability-agent', 'docs/migration/only.md', expect.any(Object));
  });

  it('calls ABSENT a document the reader answers null for', async () => {
    const fetchRepoFile = jest.fn().mockResolvedValue(null);
    const docs = await readDeliverables({ repo: REPO, deliverables: DELIVERABLES, fetchRepoFile });

    expect(docs.every((d: any) => d.status === 'absent')).toBe(true);
    // Absent carries no reason, because there is nothing wrong. It is the normal early state.
    expect(docs[0].reason).toBeUndefined();
  });

  it('ACCEPTANCE 3: an unreadable repo is unreadable, never absent, and keeps its reason', async () => {
    const fetchRepoFile = jest.fn().mockRejectedValue(
      classified('Unauthorized', 'The platform cannot reach this repository. This is our side, not yours.'),
    );
    const docs = await readDeliverables({ repo: REPO, deliverables: DELIVERABLES, fetchRepoFile });

    expect(docs.every((d: any) => d.status === 'unreadable')).toBe(true);
    expect(docs[0].error_class).toBe('Unauthorized');
    expect(docs[0].reason).toContain('cannot reach this repository');
    // The distinction the whole acceptance line turns on.
    expect(docs.some((d: any) => d.status === 'absent')).toBe(false);
  });

  it('keeps a rate-limit distinct from a missing file', async () => {
    const fetchRepoFile = jest.fn().mockRejectedValue(classified('RateLimited', 'GitHub is rate limiting us.'));
    const docs = await readDeliverables({ repo: REPO, deliverables: { A: 'docs/discovery/a.md' }, fetchRepoFile });

    expect(docs[0].status).toBe('unreadable');
    expect(docs[0].error_class).toBe('RateLimited');
  });

  it('states a reason on every path when no repo is connected, and reads nothing', async () => {
    const fetchRepoFile = jest.fn();
    const docs = await readDeliverables({ repo: null, deliverables: DELIVERABLES, fetchRepoFile });

    expect(docs).toHaveLength(2);
    expect(docs.every((d: any) => d.status === 'unreadable')).toBe(true);
    expect(docs[0].error_class).toBe('RepoNotConnected');
    expect(docs[0].reason).toContain('No repository is connected');
    expect(fetchRepoFile).not.toHaveBeenCalled();
  });

  it('treats a repo pointer missing its name as not connected rather than reading a bad path', async () => {
    const fetchRepoFile = jest.fn();
    const docs = await readDeliverables({ repo: { owner: 'x' }, deliverables: DELIVERABLES, fetchRepoFile });
    expect(docs[0].error_class).toBe('RepoNotConnected');
    expect(fetchRepoFile).not.toHaveBeenCalled();
  });

  it('marks an oversize document truncated and reports its REAL size', async () => {
    const huge = 'a'.repeat(MAX_DOC_BYTES + 500);
    const fetchRepoFile = jest.fn().mockResolvedValue(huge);
    const docs = await readDeliverables({ repo: REPO, deliverables: { A: 'docs/discovery/a.md' }, fetchRepoFile });

    expect(docs[0].truncated).toBe(true);
    expect(docs[0].content).toHaveLength(MAX_DOC_BYTES);
    // The byte count is the document's, not the excerpt's, or the reader would understate it.
    expect(docs[0].bytes).toBe(MAX_DOC_BYTES + 500);
  });

  it('reports a mix per path rather than one verdict for the repo', async () => {
    const fetchRepoFile = jest.fn()
      .mockResolvedValueOnce('present one')
      .mockResolvedValueOnce(null);
    const docs = await readDeliverables({ repo: REPO, deliverables: DELIVERABLES, fetchRepoFile });

    expect(summarize(docs)).toEqual({ present: 1, absent: 1, unreadable: 0 });
  });

  it('returns paths in a stable order, so a dry run diff is readable', async () => {
    const fetchRepoFile = jest.fn().mockResolvedValue('x');
    const a = await readDeliverables({ repo: REPO, deliverables: DELIVERABLES, fetchRepoFile });
    const b = await readDeliverables({ repo: REPO, deliverables: DELIVERABLES, fetchRepoFile });
    expect(a.map((d: any) => d.key)).toEqual(b.map((d: any) => d.key));
  });

  it('handles an empty deliverables map without reading anything', async () => {
    const fetchRepoFile = jest.fn();
    const docs = await readDeliverables({ repo: REPO, deliverables: {}, fetchRepoFile });
    expect(docs).toEqual([]);
    expect(fetchRepoFile).not.toHaveBeenCalled();
  });
});
