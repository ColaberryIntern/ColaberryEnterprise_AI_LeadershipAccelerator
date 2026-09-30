/**
 * The design system sync's parsing and planning.
 *
 * What actually goes wrong here is not a crash. It is a sync that runs cleanly and copies
 * the wrong set of files: it misses a stylesheet because the repo wrote its import with
 * double quotes instead of single, or it skips the fonts because they are referenced from
 * a nested file rather than the entry point. In both cases the job reports success, the
 * PR is empty or partial, and the vendored tokens are quietly wrong. So the assertions
 * below are about WHICH files a walk reaches, never merely that it returned something.
 *
 * The traversal case is a security test rather than a correctness one. The resolved path
 * is used to build both a fetch URL and a write path, so a `../../..` reference in an
 * upstream repository we do not control would write outside the target directory.
 */
const {
  DESIGN_SYSTEMS,
  MANIFEST,
  orphansToRemove,
  buildManifest,
  parseReferences,
  resolveRepoPath,
  rawUrl,
  collectFiles,
  diffTrees,
  hasDrift,
  isExternal,
} = require('../designSystemSync');

describe('parseReferences', () => {
  it('reads all three legal @import spellings, because all three appear in the wild', () => {
    const css = `
      @import url('tokens/fonts.css');
      @import url(tokens/colors.css);
      @import "tokens/spacing.css";
    `;
    expect(parseReferences(css).imports).toEqual([
      'tokens/fonts.css',
      'tokens/colors.css',
      'tokens/spacing.css',
    ]);
  });

  it('ignores a commented-out import, which is not an import', () => {
    const css = `
      @import url('tokens/colors.css');
      /* @import url('tokens/retired.css'); */
    `;
    const { imports } = parseReferences(css);
    expect(imports).toEqual(['tokens/colors.css']);
    expect(imports).not.toContain('tokens/retired.css');
  });

  it('collects font url() references but leaves external and data URIs alone', () => {
    const css = `
      @font-face { src: url('../assets/fonts/public-sans-latin.woff2') format('woff2'); }
      .a { background: url(https://cdn.example.com/x.png); }
      .b { background: url(data:image/svg+xml;base64,AAAA); }
    `;
    expect(parseReferences(css).urls).toEqual(['../assets/fonts/public-sans-latin.woff2']);
  });

  it('does not double-count an @import written as url(), which would skip parsing it', () => {
    // The same text matches both the import and the url patterns. If it landed in `urls`
    // it would be fetched as a plain asset and never scanned for ITS imports, silently
    // truncating the walk at that file.
    const { imports, urls } = parseReferences("@import url('tokens/colors.css');");
    expect(imports).toEqual(['tokens/colors.css']);
    expect(urls).toEqual([]);
  });

  it('treats a cache-busted reference as the same file', () => {
    expect(parseReferences("@import url('tokens/fonts.css?v=3');").imports).toEqual([
      'tokens/fonts.css',
    ]);
  });
});

describe('resolveRepoPath', () => {
  it('resolves a sibling reference against the referencing file', () => {
    expect(resolveRepoPath('styles.css', 'tokens/colors.css')).toBe('tokens/colors.css');
  });

  it('resolves ../ out of a nested directory, which is how fonts are referenced', () => {
    expect(resolveRepoPath('tokens/fonts.css', '../assets/fonts/roboto-latin.woff2')).toBe(
      'assets/fonts/roboto-latin.woff2'
    );
  });

  it('refuses a reference that climbs out of the repository root', () => {
    // These repos are not ours. A traversal here becomes a write outside the target
    // directory, so it is refused rather than sanitised.
    expect(resolveRepoPath('tokens/fonts.css', '../../../../etc/passwd')).toBeNull();
    expect(resolveRepoPath('styles.css', '../secrets.css')).toBeNull();
  });
});

describe('isExternal', () => {
  it.each([
    ['https://cdn.example.com/a.css', true],
    ['//cdn.example.com/a.css', true],
    ['data:font/woff2;base64,AA', true],
    ['tokens/colors.css', false],
    ['../assets/fonts/a.woff2', false],
  ])('%s -> %s', (ref, expected) => {
    expect(isExternal(ref)).toBe(expected);
  });
});

describe('collectFiles', () => {
  // A miniature design repo shaped like the real ones: entry imports tokens, tokens
  // import fonts, fonts reference binary files two directories away.
  const REPO = {
    'styles.css': "@import url('tokens/fonts.css');\n@import url('tokens/colors.css');",
    'tokens/fonts.css': "@font-face { src: url('../assets/fonts/a.woff2'); }",
    'tokens/colors.css': ':root { --accent: #1D6A4C; }',
    'assets/fonts/a.woff2': Buffer.from([0x77, 0x4f, 0x46, 0x32]),
  };
  const readFile = async (p) => (p in REPO ? REPO[p] : null);

  it('reaches fonts referenced from a nested stylesheet, not just the entry point', async () => {
    const { files } = await collectFiles({ readFile });
    // The font is two hops deep. A walk that only parsed styles.css would return three
    // files and look perfectly healthy while shipping no fonts at all.
    expect(files.sort()).toEqual([
      'assets/fonts/a.woff2',
      'styles.css',
      'tokens/colors.css',
      'tokens/fonts.css',
    ]);
  });

  it('reports a referenced file that does not exist instead of failing silently', async () => {
    const broken = { ...REPO, 'styles.css': "@import url('tokens/ghost.css');" };
    const { files, missing } = await collectFiles({
      readFile: async (p) => (p in broken ? broken[p] : null),
    });
    expect(missing).toEqual(['tokens/ghost.css']);
    expect(files).toEqual(['styles.css']);
  });

  it('terminates on a circular import rather than looping forever', async () => {
    const cyclic = {
      'styles.css': "@import url('a.css');",
      'a.css': "@import url('b.css');",
      'b.css': "@import url('a.css');",
    };
    const { files } = await collectFiles({
      readFile: async (p) => (p in cyclic ? cyclic[p] : null),
    });
    expect(files.sort()).toEqual(['a.css', 'b.css', 'styles.css']);
  });

  it('is deterministic: the same repo walked twice yields the same list', async () => {
    // The sync opens a PR when the file set changes. A non-deterministic walk would open
    // PRs against an unchanged upstream, and the noise would train everyone to ignore it.
    const first = await collectFiles({ readFile });
    const second = await collectFiles({ readFile });
    expect(second.files).toEqual(first.files);
  });
});

describe('diffTrees', () => {
  const buf = (s) => Buffer.from(s, 'utf8');

  it('separates added, changed, removed and unchanged', () => {
    const upstream = new Map([
      ['tokens/colors.css', buf('--accent:#1D6A4C')],
      ['tokens/motion.css', buf('--dur:200ms')],
      ['tokens/new.css', buf('--x:1')],
    ]);
    const local = new Map([
      ['tokens/colors.css', buf('--accent:#0F5A3C')],
      ['tokens/motion.css', buf('--dur:200ms')],
      ['tokens/gone.css', buf('--y:2')],
    ]);

    expect(diffTrees(upstream, local)).toEqual({
      added: ['tokens/new.css'],
      changed: ['tokens/colors.css'],
      removed: ['tokens/gone.css'],
      unchanged: ['tokens/motion.css'],
    });
  });

  it('compares bytes, so a binary font is not corrupted into looking identical', () => {
    const upstream = new Map([['a.woff2', Buffer.from([0x00, 0xff, 0xfe])]]);
    const local = new Map([['a.woff2', Buffer.from([0x00, 0xff, 0xfd])]]);
    expect(diffTrees(upstream, local).changed).toEqual(['a.woff2']);
  });

  it('reports no drift when the trees match, which is the normal steady state', () => {
    const same = () => new Map([['tokens/colors.css', buf('--accent:#1D6A4C')]]);
    const diff = diffTrees(same(), same());
    expect(hasDrift(diff)).toBe(false);
    expect(diff.unchanged).toEqual(['tokens/colors.css']);
  });
});

describe('DESIGN_SYSTEMS registry', () => {
  it('covers all five brand design repositories', () => {
    expect(DESIGN_SYSTEMS.map((d) => d.brandSlug).sort()).toEqual([
      'ai-flotation',
      'colaberry-enterprise',
      'colaberry-training',
      'cpn',
      'refactored',
    ]);
  });

  it('gives every entry without a target a written reason', () => {
    // A brand with target:null is a decision. Without the reason it is indistinguishable
    // from someone forgetting to wire it up.
    for (const entry of DESIGN_SYSTEMS.filter((d) => d.target === null)) {
      expect(entry.note.length).toBeGreaterThan(40);
    }
  });

  it('keeps every write target inside apps/, never anywhere else in the tree', () => {
    for (const entry of DESIGN_SYSTEMS.filter((d) => d.target)) {
      expect(entry.target).toMatch(/^apps\/[a-z0-9-]+\/src\/assets\/design$/);
    }
  });

  it('builds a raw URL against the real account and branch', () => {
    expect(rawUrl('Career-Pathways-Network-Design-System', 'main', 'tokens/colors.css')).toBe(
      'https://raw.githubusercontent.com/aleemcolaberry/Career-Pathways-Network-Design-System/main/tokens/colors.css'
    );
  });
});

describe('ownership manifest', () => {
  it('deletes only what the sync previously wrote', () => {
    // The real case this guards. DESIGN_SYSTEM.md is hand-authored and site.css tells the
    // next developer to read it; ai-flotation-mark.svg is referenced by the site but no
    // stylesheet imports it, so the walk never reaches either. Before the manifest, the
    // first run removed seven such files across two live brands.
    const previouslyOwned = ['tokens/colors.css', 'tokens/retired.css'];
    const upstreamNow = ['tokens/colors.css', 'tokens/motion.css'];

    const removed = orphansToRemove(previouslyOwned, upstreamNow);

    expect(removed).toEqual(['tokens/retired.css']);
    expect(removed).not.toContain('DESIGN_SYSTEM.md');
    expect(removed).not.toContain('ai-flotation-mark.svg');
  });

  it('removes nothing on a first run, when it owns nothing yet', () => {
    expect(orphansToRemove([], ['tokens/colors.css'])).toEqual([]);
    expect(orphansToRemove(undefined, ['tokens/colors.css'])).toEqual([]);
  });

  it('carries no timestamp, so an unchanged upstream produces no diff', () => {
    // A generatedAt field would rewrite the manifest on every run, opening a pull request
    // every night against design systems nobody had touched. People stop reading those.
    const a = buildManifest({ repo: 'R', branch: 'main', entry: 'styles.css', files: ['b.css', 'a.css'] });
    const b = buildManifest({ repo: 'R', branch: 'main', entry: 'styles.css', files: ['a.css', 'b.css'] });
    expect(a).toBe(b);
    expect(a).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(JSON.parse(a).files).toEqual(['a.css', 'b.css']);
  });

  it('names the manifest as a dotfile so it does not read as a design asset', () => {
    expect(MANIFEST).toBe('.design-sync-manifest.json');
  });
});
