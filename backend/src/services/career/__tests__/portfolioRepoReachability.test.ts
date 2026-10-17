/**
 * portfolioRepoReachability - the check that decides whether a stranger can open a repo.
 *
 * This sits on the render path of a PUBLIC endpoint and calls an external service, so the
 * tests are weighted toward the failure path: what happens on a timeout, what happens on a
 * 404, how many requests a page can possibly make, and whether a GitHub blip can silently
 * delete a learner's evidence.
 */
import {
  reachablePublicRepos, normalizeRepoUrl, __resetReachabilityCache,
} from '../portfolioRepoReachability';

const A = 'https://github.com/qninying/ambit';
const B = 'https://github.com/baidhani/HomeHub';

beforeEach(() => __resetReachabilityCache());

/** A probe with a script of answers, which also records what it was asked. */
function scripted(answers: Record<string, number | null>) {
  const calls: string[] = [];
  const probe = async (url: string) => { calls.push(url); return answers[url] ?? 404; };
  return { probe, calls };
}

describe('normalizeRepoUrl', () => {
  it('strips .git and a trailing slash so one repository has one key', () => {
    expect(normalizeRepoUrl(`${A}.git`)).toBe(A);
    expect(normalizeRepoUrl(`${A}/`)).toBe(A);
  });

  it('refuses anything that is not exactly https://github.com/owner/name', () => {
    for (const bad of ['http://github.com/a/b', 'https://gitlab.com/a/b',
      'https://github.com/a', 'https://github.com/a/b/tree/main',
      'https://github.com.evil.test/a/b', '', null, 42, {}]) {
      expect(normalizeRepoUrl(bad as unknown)).toBeNull();
    }
  });
});

describe('what comes back', () => {
  it('returns only the repositories that answered 200', async () => {
    const { probe } = scripted({ [A]: 200, [B]: 404 });
    const out = await reachablePublicRepos([A, B], probe);
    expect([...out]).toEqual([A]);
  });

  it('treats every non-200 status as not reachable', async () => {
    for (const status of [301, 403, 404, 429, 451, 500, 503]) {
      __resetReachabilityCache();
      const { probe } = scripted({ [A]: status });
      expect([...await reachablePublicRepos([A], probe)]).toEqual([]);
    }
  });

  it('asks once for a repository listed twice, under either spelling', async () => {
    const { probe, calls } = scripted({ [A]: 200 });
    const out = await reachablePublicRepos([A, `${A}.git`, `${A}/`, A], probe);
    expect(calls).toEqual([A]);
    expect([...out]).toEqual([A]);
  });

  it('never asks about a URL it would refuse anyway', async () => {
    const { probe, calls } = scripted({});
    await reachablePublicRepos(['https://gitlab.com/a/b', null, 7, ''], probe);
    expect(calls).toEqual([]);
  });

  it('returns normalized URLs, so a caller can compare without re-normalizing', async () => {
    const { probe } = scripted({ [A]: 200 });
    expect([...await reachablePublicRepos([`${A}.git`], probe)]).toEqual([A]);
  });
});

describe('the cache, which is what makes this safe on a public page', () => {
  it('does not ask twice for the same repository', async () => {
    const { probe, calls } = scripted({ [A]: 200 });
    await reachablePublicRepos([A], probe);
    await reachablePublicRepos([A], probe);
    expect(calls).toEqual([A]);
  });

  it('re-asks a reachable repository after six hours', async () => {
    const { probe, calls } = scripted({ [A]: 200 });
    const t0 = 1_000_000;
    await reachablePublicRepos([A], probe, t0);
    await reachablePublicRepos([A], probe, t0 + 6 * 60 * 60 * 1000 - 1);
    expect(calls).toHaveLength(1);
    await reachablePublicRepos([A], probe, t0 + 6 * 60 * 60 * 1000 + 1);
    expect(calls).toHaveLength(2);
  });

  it('re-asks an UNREACHABLE repository much sooner, so a fix is picked up quickly', async () => {
    const { probe, calls } = scripted({ [A]: 404 });
    const t0 = 1_000_000;
    await reachablePublicRepos([A], probe, t0);
    await reachablePublicRepos([A], probe, t0 + 14 * 60 * 1000);
    expect(calls).toHaveLength(1);
    await reachablePublicRepos([A], probe, t0 + 16 * 60 * 1000);
    expect(calls).toHaveLength(2);
  });

  it('picks up a repository that has just been made public', async () => {
    let status = 404;
    const probe = async () => status;
    const t0 = 1_000_000;
    expect([...await reachablePublicRepos([A], probe, t0)]).toEqual([]);
    status = 200;
    expect([...await reachablePublicRepos([A], probe, t0 + 16 * 60 * 1000)]).toEqual([A]);
  });
});

describe('the failure path', () => {
  it('keeps the last known answer when the request does not complete', async () => {
    // A GitHub blip must not silently delete a page's strongest evidence. The reader would
    // have no way of knowing a whole section had gone missing.
    let status: number | null = 200;
    const probe = async () => status;
    const t0 = 1_000_000;
    await reachablePublicRepos([A], probe, t0);
    status = null;
    const later = t0 + 7 * 60 * 60 * 1000; // cache expired, so it really does re-ask
    expect([...await reachablePublicRepos([A], probe, later)]).toEqual([A]);
  });

  it('but a real 404 DOES remove it, because that is an answer and not a blip', async () => {
    let status: number | null = 200;
    const probe = async () => status;
    const t0 = 1_000_000;
    await reachablePublicRepos([A], probe, t0);
    status = 404;
    expect([...await reachablePublicRepos([A], probe, t0 + 7 * 60 * 60 * 1000)]).toEqual([]);
  });

  it('is not reachable when the very first request fails and nothing is known', async () => {
    const probe = async () => null;
    expect([...await reachablePublicRepos([A, B], probe)]).toEqual([]);
  });

  it('does not remember a failure as a result, so the next render retries', async () => {
    let status: number | null = null;
    const probe = async () => status;
    await reachablePublicRepos([A], probe, 1000);
    status = 200;
    expect([...await reachablePublicRepos([A], probe, 1001)]).toEqual([A]);
  });

  it('returns an empty set for an empty input without calling anything', async () => {
    const { probe, calls } = scripted({});
    expect([...await reachablePublicRepos([], probe)]).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe('the request budget', () => {
  it('never runs more than four probes at once', async () => {
    let inFlight = 0;
    let peak = 0;
    const probe = async (url: string) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => { setTimeout(r, 1); });
      inFlight -= 1;
      return url.endsWith('9') ? 404 : 200;
    };
    const urls = Array.from({ length: 12 }, (_, i) => `https://github.com/o/r${i}`);
    const out = await reachablePublicRepos(urls, probe);
    expect(peak).toBeLessThanOrEqual(4);
    expect(out.size).toBe(11);
  });

  it('one slow repository does not stop the others from being answered', async () => {
    const probe = async (url: string) => {
      await new Promise((r) => { setTimeout(r, url.endsWith('slow') ? 30 : 1); });
      return 200;
    };
    const urls = ['https://github.com/o/slow', ...Array.from({ length: 8 },
      (_, i) => `https://github.com/o/r${i}`)];
    expect((await reachablePublicRepos(urls, probe)).size).toBe(9);
  });
});
