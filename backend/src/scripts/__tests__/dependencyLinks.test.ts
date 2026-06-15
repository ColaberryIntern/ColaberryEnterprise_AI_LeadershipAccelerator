/**
 * Unit tests for the pure dependency-link logic shared by the launch-task
 * generator and the in-place backfill. Guards the contract that approval/
 * review tasks carry resolvable Depends-on / Artifact / List links, and that
 * the marker format is parseable by the AI_ProjectArchitect consumer regex.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const dl = require('../lib/dependencyLinks');

const CANDIDATES = [
  { id: 1, title: 'Draft sales call script for outreach to alumni', app_url: 'https://app.basecamp.com/3945211/buckets/47502609/todos/1', completed: true, listId: 42 },
  { id: 2, title: 'Review and approve sales call script', app_url: 'https://app.basecamp.com/3945211/buckets/47502609/todos/2', completed: false, listId: 42 },
  { id: 3, title: 'Launch Mailchimp campaign to alumni', app_url: 'https://app.basecamp.com/3945211/buckets/47502609/todos/3', completed: false, listId: 42 },
];

describe('resolveDependency', () => {
  test('exact title match', () => {
    const m = dl.resolveDependency('Draft sales call script for outreach to alumni', CANDIDATES, { selfId: 2 });
    expect(m && m.id).toBe(1);
  });

  test('substring match (dep phrase ⊂ sibling title)', () => {
    // The real failing case: "Approve sales call script" ⊂ "Review and approve sales call script".
    const m = dl.resolveDependency('Approve sales call script', CANDIDATES, { selfId: 99 });
    expect(m && m.id).toBe(2);
  });

  test('excludes self', () => {
    const m = dl.resolveDependency('Review and approve sales call script', CANDIDATES, { selfId: 2 });
    expect(m).toBeNull();
  });

  test('"none" / unmatched returns null', () => {
    expect(dl.resolveDependency('none', CANDIDATES)).toBeNull();
    expect(dl.resolveDependency('something entirely unrelated xyzzy', CANDIDATES)).toBeNull();
  });
});

describe('extractDependencyText', () => {
  test('pulls the Dependencies block, drops "none"', () => {
    const html = '<div><h3>Dependencies</h3><p>Draft sales call script for outreach to alumni</p></div>';
    expect(dl.extractDependencyText(html)).toBe('Draft sales call script for outreach to alumni');
    expect(dl.extractDependencyText('<h3>Dependencies</h3><p>none</p>')).toBe('');
    expect(dl.extractDependencyText('<p>no deps section</p>')).toBe('');
  });
});

describe('listUrlFromAppUrl', () => {
  test('swaps /todos/<id> -> /todolists/<listId>', () => {
    expect(dl.listUrlFromAppUrl('https://app.basecamp.com/3945211/buckets/47502609/todos/2', 42))
      .toBe('https://app.basecamp.com/3945211/buckets/47502609/todolists/42');
    expect(dl.listUrlFromAppUrl('', 42)).toBe('');
  });
});

describe('buildMarkersBlock + consumer-regex contract', () => {
  // Replicate the AI_ProjectArchitect consumer regexes (suggestions.py
  // _DEPENDS_ON_RE / _ARTIFACT_RE, scorer.py ARTIFACT_PENDING_RE). If these
  // stop capturing, the downstream prompt/gate silently breaks.
  const DEPENDS_ON_RE = /Depends-on:\s*(?:<\/strong>)?\s*([^<\n]+?)\s*(?:<|$)/i;
  const ARTIFACT_RE = /Artifact:\s*(?:<\/strong>)?\s*([^<\n]+?)\s*(?:<|$)/i;
  const ARTIFACT_PENDING_RE = /Artifact:\s*(?:<\/strong>)?\s*PENDING\b/i;

  test('completed dependency -> Artifact is the drafting URL, fully parseable', () => {
    const block = dl.buildMarkersBlock({
      dependsOnUrl: 'https://app.basecamp.com/3945211/buckets/47502609/todos/1',
      artifact: 'https://app.basecamp.com/3945211/buckets/47502609/todos/1',
      listUrl: 'https://app.basecamp.com/3945211/buckets/47502609/todolists/42',
    });
    expect(DEPENDS_ON_RE.exec(block)![1]).toBe('https://app.basecamp.com/3945211/buckets/47502609/todos/1');
    expect(ARTIFACT_RE.exec(block)![1]).toBe('https://app.basecamp.com/3945211/buckets/47502609/todos/1');
    expect(ARTIFACT_PENDING_RE.test(block)).toBe(false);
  });

  test('pending dependency -> Artifact: PENDING triggers the scorer gate', () => {
    const block = dl.buildMarkersBlock({
      dependsOnUrl: 'https://app.basecamp.com/3945211/buckets/47502609/todos/1',
      artifact: 'PENDING',
      listUrl: 'https://app.basecamp.com/3945211/buckets/47502609/todolists/42',
    });
    expect(ARTIFACT_PENDING_RE.test(block)).toBe(true);
  });
});

describe('injectMarkers idempotency', () => {
  const base = '<div>\n<h3>Dependencies</h3>\n<p>Draft sales call script</p>\n<h3>Briefs</h3><ul></ul>\n</div>';
  const block = dl.buildMarkersBlock({ dependsOnUrl: 'URL1', artifact: 'PENDING', listUrl: 'URL2' });

  test('inserts once after Dependencies', () => {
    const out = dl.injectMarkers(base, block);
    expect(dl.hasMarkers(out)).toBe(true);
    expect(out.indexOf('Depends-on:')).toBeGreaterThan(out.indexOf('<h3>Dependencies</h3>'));
  });

  test('re-running replaces, never duplicates', () => {
    const once = dl.injectMarkers(base, block);
    const newBlock = dl.buildMarkersBlock({ dependsOnUrl: 'URL1b', artifact: 'PENDING', listUrl: 'URL2' });
    const twice = dl.injectMarkers(once, newBlock);
    expect((twice.match(/data-cb-deplinks="1"/g) || []).length).toBe(1);
    expect(twice).toContain('URL1b');
    expect(twice).not.toContain('URL1<');
  });

  test('re-injecting the SAME block is byte-stable (no churn)', () => {
    const once = dl.injectMarkers(base, block);
    const again = dl.injectMarkers(once, block);
    expect(again).toBe(once);
  });
});
