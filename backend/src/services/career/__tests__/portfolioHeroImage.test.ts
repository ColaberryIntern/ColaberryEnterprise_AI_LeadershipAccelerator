import {
  parseGithubRepoUrl, pickHeroImagePath, rawImageUrl, resolveHeroImageUrl, withHeroImages,
} from '../portfolioHeroImage';

/** A canned githubApiRequest. Each entry is matched by substring on the path. */
function fakeApi(routes: Record<string, { status?: number; body: any }>) {
  const calls: string[] = [];
  const impl = async (_method: 'GET' | 'PATCH', path: string) => {
    calls.push(path);
    const key = Object.keys(routes).find((k) => path.includes(k));
    if (!key) return { status: 404, ok: false, body: '' };
    const r = routes[key];
    const status = r.status ?? 200;
    return {
      status,
      ok: status >= 200 && status < 300,
      body: typeof r.body === 'string' ? r.body : JSON.stringify(r.body),
    };
  };
  return { impl: impl as any, calls };
}

const tree = (paths: Array<string | [string, number]>) => ({
  tree: paths.map((p) => (Array.isArray(p)
    ? { type: 'blob', path: p[0], size: p[1] }
    : { type: 'blob', path: p })),
});

describe('parseGithubRepoUrl', () => {
  it('reads owner and repo from a normal URL', () => {
    expect(parseGithubRepoUrl('https://github.com/farhat/support-workflow'))
      .toEqual({ owner: 'farhat', repo: 'support-workflow' });
  });

  it('tolerates a .git suffix and deep paths', () => {
    expect(parseGithubRepoUrl('https://github.com/o/r.git')).toEqual({ owner: 'o', repo: 'r' });
    expect(parseGithubRepoUrl('https://github.com/o/r/tree/main/docs')).toEqual({ owner: 'o', repo: 'r' });
  });

  /**
   * The host check is a security property, not a nicety: the parsed owner/repo are
   * interpolated into a raw.githubusercontent URL that a stranger's browser fetches.
   */
  it('refuses any host that is not github.com', () => {
    expect(parseGithubRepoUrl('https://evil.com/o/r')).toBeNull();
    expect(parseGithubRepoUrl('https://github.com.evil.com/o/r')).toBeNull();
    expect(parseGithubRepoUrl('https://raw.githubusercontent.com/o/r')).toBeNull();
  });

  it('refuses non-http schemes and junk', () => {
    expect(parseGithubRepoUrl('javascript:alert(1)')).toBeNull();
    expect(parseGithubRepoUrl('file:///etc/passwd')).toBeNull();
    expect(parseGithubRepoUrl('github.com/o/r')).toBeNull();
    expect(parseGithubRepoUrl('')).toBeNull();
    expect(parseGithubRepoUrl(null)).toBeNull();
    expect(parseGithubRepoUrl(42)).toBeNull();
  });

  it('refuses a repo path with no repo', () => {
    expect(parseGithubRepoUrl('https://github.com/owner')).toBeNull();
  });

  it('refuses path segments that are not repo-name shaped', () => {
    expect(parseGithubRepoUrl('https://github.com/o/../../etc')).toBeNull();
  });
});

describe('pickHeroImagePath', () => {
  it('prefers a screenshot over a logo', () => {
    expect(pickHeroImagePath(tree(['logo.png', 'docs/screenshot-home.png']).tree))
      .toBe('docs/screenshot-home.png');
  });

  it('never returns build output or dependencies', () => {
    expect(pickHeroImagePath(tree([
      'node_modules/pkg/hero.png',
      'dist/screenshot.png',
      '.github/banner.png',
      'coverage/preview.png',
    ]).tree)).toBeNull();
  });

  it('ignores non-raster and script-bearing formats', () => {
    expect(pickHeroImagePath(tree(['diagram.svg', 'anim.gif', 'notes.md']).tree)).toBeNull();
  });

  it('skips an image too large to put on a phone', () => {
    expect(pickHeroImagePath(tree([['docs/screenshot.png', 20 * 1024 * 1024]]).tree)).toBeNull();
  });

  it('falls back to an ordinary image when nothing is named well', () => {
    expect(pickHeroImagePath(tree(['assets/img001.png']).tree)).toBe('assets/img001.png');
  });

  it('is deterministic when two candidates tie', () => {
    const paths = tree(['docs/a-screenshot.png', 'docs/b-screenshot.png']).tree;
    const first = pickHeroImagePath(paths);
    expect(first).toBe('docs/a-screenshot.png');
    expect(pickHeroImagePath([...paths].reverse())).toBe(first);
  });

  it('returns null on an empty or malformed tree', () => {
    expect(pickHeroImagePath([])).toBeNull();
    expect(pickHeroImagePath(null as any)).toBeNull();
  });
});

describe('rawImageUrl', () => {
  it('builds a HEAD-pinned raw URL and encodes each segment', () => {
    expect(rawImageUrl({ owner: 'o', repo: 'r' }, 'docs/my shot.png'))
      .toBe('https://raw.githubusercontent.com/o/r/HEAD/docs/my%20shot.png');
  });
});

describe('resolveHeroImageUrl', () => {
  it('returns the raw URL for a public repo', async () => {
    const api = fakeApi({
      '/git/trees/': { body: tree(['docs/screenshot.png']) },
      '/repos/': { body: { private: false } },
    });
    await expect(resolveHeroImageUrl('https://github.com/o/r', { apiRequest: api.impl }))
      .resolves.toBe('https://raw.githubusercontent.com/o/r/HEAD/docs/screenshot.png');
  });

  /**
   * THE safety property of this module. A private repo's contents must never be
   * handed to an anonymous reader, so the tree is not even requested.
   */
  it('refuses a private repo and never reads its tree', async () => {
    const api = fakeApi({
      '/git/trees/': { body: tree(['docs/screenshot.png']) },
      '/repos/': { body: { private: true } },
    });
    await expect(resolveHeroImageUrl('https://github.com/o/r', { apiRequest: api.impl }))
      .resolves.toBeNull();
    expect(api.calls.some((c) => c.includes('/git/trees/'))).toBe(false);
  });

  it('refuses when visibility is absent rather than assuming public', async () => {
    const api = fakeApi({ '/repos/': { body: { name: 'r' } } });
    await expect(resolveHeroImageUrl('https://github.com/o/r', { apiRequest: api.impl }))
      .resolves.toBeNull();
  });

  it('degrades to null on 404, rate limit, and malformed JSON', async () => {
    const gone = fakeApi({ '/repos/': { status: 404, body: '' } });
    await expect(resolveHeroImageUrl('https://github.com/o/r', { apiRequest: gone.impl }))
      .resolves.toBeNull();

    const limited = fakeApi({ '/repos/': { status: 403, body: 'rate limit' } });
    await expect(resolveHeroImageUrl('https://github.com/o/r', { apiRequest: limited.impl }))
      .resolves.toBeNull();

    const junk = fakeApi({ '/repos/': { body: 'not json at all' } });
    await expect(resolveHeroImageUrl('https://github.com/o/r', { apiRequest: junk.impl }))
      .resolves.toBeNull();
  });

  it('never throws when the API itself throws', async () => {
    const boom = (async () => { throw new Error('socket hang up'); }) as any;
    await expect(resolveHeroImageUrl('https://github.com/o/r', { apiRequest: boom }))
      .resolves.toBeNull();
  });

  it('makes no calls at all for a non-GitHub URL', async () => {
    const api = fakeApi({ '/repos/': { body: { private: false } } });
    await expect(resolveHeroImageUrl('https://gitlab.com/o/r', { apiRequest: api.impl }))
      .resolves.toBeNull();
    expect(api.calls).toHaveLength(0);
  });
});

describe('withHeroImages', () => {
  it('attaches a hero to each project and null where there is no repo', async () => {
    const api = fakeApi({
      '/git/trees/': { body: tree(['docs/screenshot.png']) },
      '/repos/': { body: { private: false } },
    });
    const out = await withHeroImages(
      [{ name: 'A', github_repo_url: 'https://github.com/o/r' }, { name: 'B' }],
      { apiRequest: api.impl },
    );
    expect(out[0].hero_image_url).toContain('raw.githubusercontent.com');
    expect(out[1].hero_image_url).toBeNull();
  });

  it('bounds the number of GitHub lookups regardless of project count', async () => {
    const api = fakeApi({
      '/git/trees/': { body: tree(['docs/screenshot.png']) },
      '/repos/': { body: { private: false } },
    });
    const projects = Array.from({ length: 20 }, (_, i) => ({
      name: 'P' + i, github_repo_url: 'https://github.com/o/r' + i,
    }));
    const out = await withHeroImages(projects, { apiRequest: api.impl });
    expect(out).toHaveLength(20);
    // 8 repos looked up, two calls each.
    expect(api.calls.filter((c) => c.includes('/git/trees/'))).toHaveLength(8);
    expect(out[19].hero_image_url).toBeNull();
  });

  it('returns the input untouched when there are no projects', async () => {
    await expect(withHeroImages([])).resolves.toEqual([]);
  });
});
