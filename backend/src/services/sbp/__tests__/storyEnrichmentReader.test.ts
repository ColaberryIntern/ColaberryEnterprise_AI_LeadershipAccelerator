/**
 * Reading `.colaberry/enrichment/` from a student repo, with the network
 * mocked. Bounded, classified, and never throwing: a webhook handler that
 * hangs is a webhook GitHub stops delivering.
 */
const mockApply = jest.fn();
jest.mock('../storyEnrichmentService', () => ({
  applyStoryEnrichment: (...a: any[]) => mockApply(...a),
}));

import { ingestStoryEnrichments, storyIdFromFileName, MAX_ENRICHMENT_FILES } from '../storyEnrichmentReader';

const PROJECT = 'cce94c20-a398-45b3-a6fb-b3fc87b6b1ef';
const TARGET = { owner: 'student', repo: 'workspace', branch: 'main' };

const goodEvent = (storyId: string) => ({
  schemaVersion: '1', projectId: PROJECT, storyId, projectTruthBaseRevision: 1,
  observedAt: '2026-09-11T12:00:00.000Z', sourceCommitSha: 'abc1234',
  factProposals: [{ dimension: 'integrations', value: 'Reads Zendesk.', evidence: 'src/client.ts' }],
});

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

/** A fake GitHub: a directory listing and a file per story. */
function fakeGithub(files: Record<string, string | { status: number }>, listingStatus = 200) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(url);
    const u = String(url);
    if (/\/contents\/\.colaberry%2Fenrichment(\?|$)/.test(u) || /\/contents\/\.colaberry\/enrichment(\?|$)/.test(u)) {
      if (listingStatus !== 200) return { status: listingStatus, json: async () => ({ message: 'x' }) };
      return {
        status: 200,
        json: async () => Object.keys(files).map((name) => ({ name, path: `.colaberry/enrichment/${name}`, type: 'file', size: 100 })),
      };
    }
    for (const [name, content] of Object.entries(files)) {
      if (u.includes(encodeURIComponent(name)) || u.includes(name)) {
        if (typeof content !== 'string') return { status: content.status, json: async () => ({}) };
        return { status: 200, json: async () => ({ content: b64(content), encoding: 'base64' }) };
      }
    }
    return { status: 404, json: async () => ({}) };
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  process.env.GITHUB_TOKEN = 'test-token';
  mockApply.mockImplementation(async (_p: string, ev: any) => ({ outcome: 'merged', storyId: ev.storyId, revision: 2, counts: {}, refused: [] }));
});

afterEach(() => { delete process.env.GITHUB_TOKEN; });

describe('storyIdFromFileName', () => {
  it('accepts STORY-NNN.json and nothing else', () => {
    expect(storyIdFromFileName('STORY-007.json')).toBe('STORY-007');
    expect(storyIdFromFileName('STORY-0007.json')).toBe('STORY-0007');
    expect(storyIdFromFileName('story-7.json')).toBeNull();
    expect(storyIdFromFileName('STORY-007.md')).toBeNull();
    expect(storyIdFromFileName('README.md')).toBeNull();
  });
});

describe('ingestStoryEnrichments', () => {
  it('reads every enrichment file on the named branch and applies each', async () => {
    const gh = fakeGithub({
      'STORY-001.json': JSON.stringify(goodEvent('STORY-001')),
      'STORY-002.json': JSON.stringify(goodEvent('STORY-002')),
    });
    const s = await ingestStoryEnrichments(PROJECT, TARGET, { fetchImpl: gh.fetchImpl });

    expect(s.files_seen).toBe(2);
    expect(s.applied.map((a) => a.storyId)).toEqual(['STORY-001', 'STORY-002']);
    expect(s.skipped).toEqual([]);
    expect(s.error_class).toBeNull();
    // The branch verification read is the branch this reads.
    expect(gh.calls[0]).toMatch(/ref=main/);
    expect(mockApply).toHaveBeenCalledTimes(2);
  });

  it('no directory is the normal state, not an error', async () => {
    const gh = fakeGithub({}, 404);
    const s = await ingestStoryEnrichments(PROJECT, TARGET, { fetchImpl: gh.fetchImpl });
    expect(s).toEqual({ files_seen: 0, applied: [], skipped: [], error_class: null });
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('skips a malformed file with its class and keeps going', async () => {
    const gh = fakeGithub({
      'STORY-001.json': '{ not json',
      'STORY-002.json': JSON.stringify({ ...goodEvent('STORY-002'), factProposals: [{ dimension: 'integrations', value: 'no evidence' }] }),
      'STORY-003.json': JSON.stringify(goodEvent('STORY-003')),
    });
    const s = await ingestStoryEnrichments(PROJECT, TARGET, { fetchImpl: gh.fetchImpl });
    expect(s.skipped.map((k) => [k.path, k.error_class])).toEqual([
      ['.colaberry/enrichment/STORY-001.json', 'NotJson'],
      ['.colaberry/enrichment/STORY-002.json', 'ContractViolation'],
    ]);
    expect(s.applied.map((a) => a.storyId)).toEqual(['STORY-003']);
  });

  it('skips a file whose name and content disagree about the story', async () => {
    const gh = fakeGithub({ 'STORY-001.json': JSON.stringify(goodEvent('STORY-009')) });
    const s = await ingestStoryEnrichments(PROJECT, TARGET, { fetchImpl: gh.fetchImpl });
    expect(s.skipped[0].reason).toMatch(/named STORY-001 but claims STORY-009/);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('ignores files that are not STORY-NNN.json', async () => {
    const gh = fakeGithub({ 'notes.txt': 'hello', 'STORY-001.json': JSON.stringify(goodEvent('STORY-001')) });
    const s = await ingestStoryEnrichments(PROJECT, TARGET, { fetchImpl: gh.fetchImpl });
    expect(s.files_seen).toBe(1);
  });

  it('classifies a rate limit and an outage, and returns rather than throwing', async () => {
    expect((await ingestStoryEnrichments(PROJECT, TARGET, { fetchImpl: fakeGithub({}, 403).fetchImpl })).error_class).toBe('RateLimitError');
    expect((await ingestStoryEnrichments(PROJECT, TARGET, { fetchImpl: fakeGithub({}, 500).fetchImpl })).error_class).toBe('UpstreamUnavailable');
    const boom = (async () => { const e: any = new Error('timeout'); e.name = 'TimeoutError'; throw e; }) as unknown as typeof fetch;
    expect((await ingestStoryEnrichments(PROJECT, TARGET, { fetchImpl: boom })).error_class).toBe('TimeoutError');
  });

  it('does nothing without a token, and says why', async () => {
    delete process.env.GITHUB_TOKEN;
    const gh = fakeGithub({ 'STORY-001.json': JSON.stringify(goodEvent('STORY-001')) });
    const s = await ingestStoryEnrichments(PROJECT, TARGET, { fetchImpl: gh.fetchImpl });
    expect(s.error_class).toBe('ConfigError');
    expect(gh.calls).toEqual([]);
  });

  it('is bounded on the number of files it will read', async () => {
    const files: Record<string, string> = {};
    for (let i = 1; i <= MAX_ENRICHMENT_FILES + 10; i += 1) {
      const id = `STORY-${String(i).padStart(3, '0')}`;
      files[`${id}.json`] = JSON.stringify(goodEvent(id));
    }
    const s = await ingestStoryEnrichments(PROJECT, TARGET, { fetchImpl: fakeGithub(files).fetchImpl });
    expect(s.files_seen).toBe(MAX_ENRICHMENT_FILES);
  });
});
