/**
 * listRepoCommitsForMatch - the commit source for the gov manual-sync fallback
 * (syncGovCommitsFromRepo). It must return FULL shas and the FULL message (a story citation
 * can live below the subject line), and it must never throw into a sync - a classified read
 * problem comes back as []. These are exactly the properties the idempotent gov matcher relies
 * on: full shas so dedup on (story, sha) matches what the push webhook already filed.
 */
import { listRepoCommitsForMatch } from '../repoProgressReader';

interface Route { test: (url: string) => boolean; reply: (url: string) => unknown; status?: number }
function makeFetch(routes: Route[]): typeof fetch {
  return (async (url: string) => {
    const route = routes.find((r) => r.test(String(url)));
    const status = route?.status ?? 200;
    const body = route ? route.reply(String(url)) : [];
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => null },
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  }) as unknown as typeof fetch;
}

const OLD_TOKEN = process.env.GITHUB_TOKEN;
afterAll(() => { process.env.GITHUB_TOKEN = OLD_TOKEN; });

describe('listRepoCommitsForMatch', () => {
  beforeEach(() => { process.env.GITHUB_TOKEN = 'test-token'; });

  it('returns full shas and the full commit message, not just the subject line', async () => {
    const sha = 'a'.repeat(40);
    const impl = makeFetch([
      {
        test: (u) => u.includes('/commits'),
        reply: () => [
          { sha, commit: { message: 'REQ-008 wire the permit form\n\nStory: cites REQ-008' }, author: { login: 'omolola' } },
        ],
      },
    ]);
    const out = await listRepoCommitsForMatch('peacecrowne-oss', 'Saratoga-Springs-Municipal', undefined, impl);
    expect(out).toEqual([
      { sha, message: 'REQ-008 wire the permit form\n\nStory: cites REQ-008', authorLogin: 'omolola' },
    ]);
  });

  it('returns [] when GITHUB_TOKEN is not configured (never throws into a sync)', async () => {
    delete process.env.GITHUB_TOKEN;
    const out = await listRepoCommitsForMatch('o', 'r', undefined, makeFetch([]));
    expect(out).toEqual([]);
  });

  it('returns [] when the repo is not found (404 on the first page)', async () => {
    const impl = makeFetch([{ test: (u) => u.includes('/commits'), status: 404, reply: () => null }]);
    const out = await listRepoCommitsForMatch('o', 'r', undefined, impl);
    expect(out).toEqual([]);
  });

  it('maps a missing GitHub author to null without dropping the commit', async () => {
    const sha = 'b'.repeat(40);
    const impl = makeFetch([
      { test: (u) => u.includes('/commits'), reply: () => [{ sha, commit: { message: 'REQ-001 done' }, author: null }] },
    ]);
    const out = await listRepoCommitsForMatch('o', 'r', undefined, impl);
    expect(out).toEqual([{ sha, message: 'REQ-001 done', authorLogin: null }]);
  });
});
