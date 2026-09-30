/**
 * capstoneRecordCompiler — tested from literals.
 *
 * Two properties carry most of the weight. The compiler must INVENT NOTHING —
 * a reader who finds one embellished claim discounts the whole page, and a
 * student defending this at the Expo has to source every line. And it must be
 * DETERMINISTIC, because a clock or an unstable sort makes every re-compile a
 * new version, burying real changes in noise.
 */
import { CompilerInputs, compileCapstoneRecord } from '../capstoneRecordCompiler';
import { isShareable } from '../capstoneRecordContract';

const inputs = (over: Partial<CompilerInputs> = {}): CompilerInputs => ({
  enrollment: { full_name: 'Dana Okoye', cohort_name: 'Cohort - July 2026' },
  project: {
    name: 'Meridian Intake Agent',
    descriptor: 'A governed intake-to-invoice agent.',
    repo_url: 'https://github.com/dana/workspace',
    demo_url: 'https://youtu.be/abc',
    hours_reclaimed: 12,
    architecture_mermaid: null,
  },
  artifacts: [
    { week: 5, title: 'MCP Server', filename: 'server.md', path: 'artifacts/week-05/server.md', commit_sha: 'sha5' },
    { week: 4, title: 'Prompts', filename: 'prompts.md', path: 'artifacts/week-04/prompts.md', commit_sha: 'sha4' },
  ],
  competencies: [{ domain_id: 'architecture', label: 'Architecture', evidence_count: 3 }],
  posts: [],
  ...over,
});

describe('it invents nothing', () => {
  it('leaves the headline null when no manifesto was written', () => {
    expect(compileCapstoneRecord(inputs()).identity.headline).toBeNull();
  });

  it('takes the headline from the week-12 manifesto and nowhere else', () => {
    const r = compileCapstoneRecord(inputs({
      posts: [{ week: 12, headline: 'Someone who ships AI my company can trust', shared: true }],
    }));
    expect(r.identity.headline).toBe('Someone who ships AI my company can trust');
  });

  it('leaves hours null when never measured rather than guessing zero', () => {
    const r = compileCapstoneRecord(inputs({ project: { ...inputs().project!, hours_reclaimed: null } }));
    expect(r.system.hours_reclaimed).toBeNull();
  });

  it('keeps a real zero as zero — absent and measured-as-nothing are different', () => {
    const r = compileCapstoneRecord(inputs({ project: { ...inputs().project!, hours_reclaimed: 0 } }));
    expect(r.system.hours_reclaimed).toBe(0);
  });

  it('survives a student with no project at all', () => {
    const r = compileCapstoneRecord(inputs({ project: null }));
    expect(r.system.project_name).toBeNull();
    expect(r.identity.repo_url).toBeNull();
    expect(isShareable(r)).toBe(false);
  });

  it('falls back to a neutral name rather than rendering an empty heading', () => {
    expect(compileCapstoneRecord(inputs({ enrollment: {} })).identity.full_name).toBe('Architect');
  });

  it('treats whitespace-only fields as absent', () => {
    const r = compileCapstoneRecord(inputs({ project: { ...inputs().project!, descriptor: '   ' } }));
    expect(r.system.descriptor).toBeNull();
  });
});

describe('artifacts', () => {
  it('orders by week regardless of input order', () => {
    expect(compileCapstoneRecord(inputs()).artifacts.map((a) => a.week)).toEqual([4, 5]);
  });

  it('skips a row that cannot point at a file — it is not evidence', () => {
    const r = compileCapstoneRecord(inputs({
      artifacts: [{ week: 4, title: 'Orphan', filename: 'x.md', path: null }],
    }));
    expect(r.artifacts).toHaveLength(0);
  });

  it('labels a sample build and does not pass it off as their own', () => {
    const r = compileCapstoneRecord(inputs({
      artifacts: [{ week: 2, filename: 'a.md', path: 'artifacts/week-02/a.md', built_on_sample: true }],
    }));
    expect(r.artifacts[0].built_on).toBe('Sample project');
    expect(r.artifacts[0].is_sample).toBe(true);
  });

  it('defaults an unlabelled artifact to their own project', () => {
    const r = compileCapstoneRecord(inputs({
      artifacts: [{ week: 2, filename: 'a.md', path: 'artifacts/week-02/a.md' }],
    }));
    expect(r.artifacts[0].built_on).toBe('Own project');
  });

  it('carries a null commit sha through so the renderer can leave it unlinked', () => {
    const r = compileCapstoneRecord(inputs({
      artifacts: [{ week: 2, filename: 'a.md', path: 'artifacts/week-02/a.md', commit_sha: null }],
    }));
    expect(r.artifacts[0].commit_sha).toBeNull();
  });
});

describe('competencies', () => {
  it('omits a competency with no evidence rather than showing it at zero', () => {
    // "Governance — 0" invites a reader to wonder what went wrong. The truthful
    // statement is that it has not been demonstrated yet.
    const r = compileCapstoneRecord(inputs({
      competencies: [
        { domain_id: 'architecture', label: 'Architecture', evidence_count: 3 },
        { domain_id: 'governance', label: 'Governance', evidence_count: 0 },
      ],
    }));
    expect(r.competencies.map((c) => c.domain)).toEqual(['architecture']);
  });

  it('orders by evidence strength', () => {
    const r = compileCapstoneRecord(inputs({
      competencies: [
        { domain_id: 'a', evidence_count: 1 },
        { domain_id: 'b', evidence_count: 9 },
      ],
    }));
    expect(r.competencies.map((c) => c.domain)).toEqual(['b', 'a']);
  });
});

describe('consent is per post', () => {
  const allPosts = [
    { week: 1, headline: 'Ops Director at Meridian', body: 'Monday chaos into a brief', shared: true },
    { week: 9, headline: 'A retry loop sent 200 emails', shared: false },
    { week: 12, headline: 'Someone who ships AI my company can trust', body: 'I ship trustworthy AI', shared: true },
  ];

  it('renders only posts the student marked shared', () => {
    const r = compileCapstoneRecord(inputs({ posts: allPosts }));
    expect(r.posts.map((p) => p.week)).toEqual([1, 12]);
  });

  it('defaults an unmarked post to private', () => {
    const r = compileCapstoneRecord(inputs({ posts: [{ week: 5, headline: 'x' }] }));
    expect(r.posts).toHaveLength(0);
  });

  it('names the ritual each post came from', () => {
    const r = compileCapstoneRecord(inputs({ posts: allPosts }));
    expect(r.posts[0].ritual).toBe('Roll Call');
    expect(r.posts[1].ritual).toBe('Architect Manifesto');
  });

  it('builds the bookend from week 1 and week 12', () => {
    const r = compileCapstoneRecord(inputs({ posts: allPosts }));
    expect(r.bookend.opening).toBe('Monday chaos into a brief');
    expect(r.bookend.closing).toBe('I ship trustworthy AI');
  });

  it('will not use an UNSHARED week-1 post as the opening, however good the page would look', () => {
    const r = compileCapstoneRecord(inputs({
      posts: [{ week: 1, headline: 'private', body: 'private', shared: false }],
    }));
    expect(r.bookend.opening).toBeNull();
  });

  it('leaves the bookend empty when neither end was written', () => {
    expect(compileCapstoneRecord(inputs()).bookend).toEqual({ opening: null, closing: null });
  });
});

describe('determinism', () => {
  it('produces an identical record for identical inputs', () => {
    expect(compileCapstoneRecord(inputs())).toEqual(compileCapstoneRecord(inputs()));
  });

  it('is independent of artifact input order', () => {
    const a = inputs();
    const b = inputs({ artifacts: [...inputs().artifacts].reverse() });
    expect(compileCapstoneRecord(a)).toEqual(compileCapstoneRecord(b));
  });

  it('carries no timestamp of its own', () => {
    expect(JSON.stringify(compileCapstoneRecord(inputs()))).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});

describe('capabilities — what they built in their own repo', () => {
  const withCaps = (capabilities: any) =>
    compileCapstoneRecord(inputs({ capabilities })).capabilities;

  it('omits the band entirely when there is nothing, rather than an empty heading', () => {
    // An empty band reads as failure; an absent band reads as "not this part of
    // the story". A student with no connected repo has not failed at anything.
    expect(compileCapstoneRecord(inputs()).capabilities).toBeUndefined();
    expect(withCaps([])).toBeUndefined();
    expect(withCaps([{ id: 'workspace', present: false, count: 0 }])).toBeUndefined();
  });

  it('gates on `present`, not on count, so a single module survives', () => {
    // Requiring count > 0 would drop every non-collection capability.
    const out = withCaps([{ id: 'workspace', label: 'Workspace', present: true, count: 1 }]);
    expect(out).toEqual([{ id: 'workspace', label: 'Workspace', count: 1 }]);
  });

  it('keeps a collection count as observed', () => {
    // A count is distinct immediate children, decided by the reader. The compiler
    // must not reinterpret it.
    const out = withCaps([{ id: 'skills', label: 'Skills', present: true, count: 4 }]);
    expect(out![0].count).toBe(4);
  });

  it('emits `proven` only when true, never as a denial', () => {
    // `proven: false` printed beside a service reads as a FAILED demo rather than
    // one that simply has not happened yet.
    const built = withCaps([{ id: 'mcp', label: 'MCP server', present: true, count: 1 }]);
    expect(built![0]).not.toHaveProperty('proven');

    const shown = withCaps([{ id: 'mcp', label: 'MCP server', present: true, count: 1, proven: true }]);
    expect(shown![0].proven).toBe(true);

    const denied = withCaps([{ id: 'mcp', label: 'MCP', present: true, count: 1, proven: false }]);
    expect(denied![0]).not.toHaveProperty('proven');
  });

  it('carries `on_sample` so the page never implies work on a real system', () => {
    const out = withCaps([{ id: 'automation', label: 'Automation', present: true, count: 1, onSample: true }]);
    expect(out![0].on_sample).toBe(true);
    const own = withCaps([{ id: 'automation', label: 'Automation', present: true, count: 1 }]);
    expect(own![0]).not.toHaveProperty('on_sample');
  });

  it('falls back to the id when no label is supplied, and never invents one', () => {
    expect(withCaps([{ id: 'prompt_library', present: true, count: 5 }])![0].label)
      .toBe('prompt_library');
  });

  it('is deterministic: same input, same output, stable order', () => {
    const shuffled = [
      { id: 'workspace', label: 'Workspace', present: true, count: 1 },
      { id: 'automation', label: 'Automation', present: true, count: 1 },
      { id: 'skills', label: 'Skills', present: true, count: 4 },
    ];
    expect(withCaps(shuffled)!.map((c) => c.label)).toEqual(['Automation', 'Skills', 'Workspace']);
    expect(withCaps(shuffled)).toEqual(withCaps([...shuffled].reverse()));
  });

  it('does not throw on junk', () => {
    for (const bad of [undefined, null, 'nope', 42, [null], [{}]]) {
      expect(() => compileCapstoneRecord(inputs({ capabilities: bad as any }))).not.toThrow();
    }
  });
});
