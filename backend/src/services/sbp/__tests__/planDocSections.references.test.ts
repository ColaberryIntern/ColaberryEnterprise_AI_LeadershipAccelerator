import fs from 'fs';
import path from 'path';
import { BuildPlan, PlanStory, StoryReferences } from '../planContract';
import { renderDocs } from '../renderDocs';

/**
 * P6-T3 — the per-story lifecycle references, as they reach the student's repo.
 *
 * Two claims are being tested, and they pull in opposite directions:
 *
 *   FORWARD — a story that HAS references renders them.
 *   BACKWARD — every plan that does NOT, which is every plan generated before 2026-10-09 and every
 *   plan whose project has no approved blueprint, renders exactly as it did before.
 *
 * The backward claim is the one that matters more, because it is the common case and because it is
 * the plan's stated ROLLBACK condition: reverting the schema leaves stored plans that carry the
 * field, so a renderer must tolerate it in both directions or the revert is not a revert.
 *
 * ## Why this uses a real stored plan and not a hand-built one
 *
 * "Legacy plans still work" is a claim about data that already exists, so a synthetic object cannot
 * evidence it — I would be choosing the shape I then verify. `fixtures/pilot-dryrun-plan.json` is a
 * real pilot dry-run plan: 18 requirements, 5 releases, 12 stories, no `agents`, no `blocked_by`
 * and no `references`.
 *
 * It also settles the forward-compatibility question by accident, which is the best way to settle
 * one. Its stories carry `_prompt` — a key the contract has never declared. So "the renderer
 * tolerates an undeclared key" is not a property I have to construct a test for; it is already
 * true of production data, and the assertion below simply names it.
 */

const LEGACY: BuildPlan = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'pilot-dryrun-plan.json'), 'utf8'),
);

const REFS: StoryReferences = {
  business_task_ids: ['BT-004', 'BT-011'],
  workspace: { kind: 'workspace', ref: 'WS-intake', action: 'approve' },
  blueprint: { revision: 3, content_sha256: 'abcdef0123456789'.repeat(4) },
  design_refs: ['DD-002'],
  builder_agent: 'claude-code',
  acceptance_evidence: ['an approval row exists carrying the approver identity'],
};

/** The same plan with `references` on exactly one story, so a diff isolates the change. */
function withRefsOnFirstStory(refs: StoryReferences): BuildPlan {
  const clone: BuildPlan = JSON.parse(JSON.stringify(LEGACY));
  clone.stories[0] = { ...clone.stories[0], references: refs };
  return clone;
}

const fileMap = (plan: BuildPlan): Record<string, string> =>
  Object.fromEntries(renderDocs(plan, {}).map((f) => [f.path, f.content]));

describe('P6-T3 — the apparatus is a real plan, so these assertions mean something', () => {
  it('the fixture is a genuine legacy plan: no references, no agents, and an undeclared key', () => {
    // Guards the case where the fixture is quietly modernised and every "legacy" assertion below
    // starts testing the new shape instead of the old one.
    expect(LEGACY.stories.length).toBeGreaterThan(5);
    expect(LEGACY.stories.some((s) => s.references !== undefined)).toBe(false);
    expect('agents' in LEGACY).toBe(false);
    // The undeclared key that makes the backward claim evidence rather than construction.
    expect(LEGACY.stories.some((s) => '_prompt' in (s as Record<string, unknown>))).toBe(true);
  });
});

describe('P6-T3 — a legacy plan renders exactly as before', () => {
  it('renders with no reference section anywhere', () => {
    const files = fileMap(LEGACY);
    for (const [p, content] of Object.entries(files)) {
      expect(content).not.toContain('## Where this fits');
      expect(content).not.toContain('### Evidence this story needs');
      // The specific failure being guarded: a renderer that emits a heading with "unknown" under
      // it would put a claim in the student's repo the platform cannot support.
      expect(content).not.toMatch(/\*\*Blueprint:\*\*\s*revision\s*undefined/);
      expect(p).toBeTruthy();
    }
  });

  it('tolerates the undeclared `_prompt` key that real stored plans already carry', () => {
    // The rollback direction, proven on production data. A renderer that choked on an unknown key
    // would mean a plan written by a newer version could not be read by an older one — which is
    // exactly what a revert produces.
    expect(() => renderDocs(LEGACY, {})).not.toThrow();
    expect(Object.keys(fileMap(LEGACY)).length).toBeGreaterThan(5);
  });

  it('tolerates an unknown key INSIDE references, so a later field cannot break an older renderer', () => {
    const future = { ...REFS, some_field_added_later: 'x' } as unknown as StoryReferences;
    expect(() => renderDocs(withRefsOnFirstStory(future), {})).not.toThrow();
  });
});

describe('P6-T3 — references render, and change nothing else', () => {
  it('adding references to ONE story changes that story, the plan file and the manifest — nothing else', () => {
    // Byte comparison across the whole file set. `renderDocs` hashes its output and the repo writer
    // commits on a changed hash, so a reference block that perturbed an unrelated document would
    // churn a commit into every student's repo saying nothing.
    //
    // My first version of this asserted ONE changed file and was wrong: `.colaberry/plan.json` is
    // the serialised plan, so it must carry the new field, and `.colaberry/manifest.json` carries
    // the hashes, so it must move with it. Both are correct and the expectation was not. What
    // matters is the NEGATIVE half below — that no OTHER story, and none of the shared documents,
    // is touched.
    const before = fileMap(LEGACY);
    const after = fileMap(withRefsOnFirstStory(REFS));
    const changed = Object.keys(after).filter((p) => after[p] !== before[p]).sort();

    expect(changed).toEqual([
      '.colaberry/manifest.json',
      '.colaberry/plan.json',
      `docs/stories/${LEGACY.stories[0].id}.md`,
    ].sort());

    // Stated separately so a future change to the file set cannot weaken it by accident.
    for (const other of LEGACY.stories.slice(1)) {
      expect(changed).not.toContain(`docs/stories/${other.id}.md`);
    }
    for (const shared of ['docs/REQUIREMENTS.md', 'docs/STORIES.md', 'docs/TRACEABILITY.md', 'CLAUDE.md']) {
      expect(changed).not.toContain(shared);
    }
  });

  it('renders the workspace, its action, the pinned blueprint and the evidence', () => {
    const doc = fileMap(withRefsOnFirstStory(REFS))[`docs/stories/${LEGACY.stories[0].id}.md`];
    expect(doc).toContain('## Where this fits');
    expect(doc).toContain('**Workspace:** WS-intake · approve');
    // The hash is truncated for readability but the REVISION is exact, because the revision is
    // what identifies the blueprint and the hash only says it has not moved.
    expect(doc).toContain('revision 3');
    expect(doc).toContain('**Business tasks:** BT-004, BT-011');
    expect(doc).toContain('**Design decisions:** DD-002');
    expect(doc).toContain('**Built by:** claude-code');
    expect(doc).toContain('### Evidence this story needs');
    expect(doc).toContain('an approval row exists carrying the approver identity');
  });

  it('renders headless work as headless, not as a missing workspace', () => {
    // `headless` is a real answer. If it rendered as an absent workspace, whoever fills this in
    // would either invent a page or leave the field off — and absence means "not established".
    const headless: StoryReferences = {
      ...REFS,
      workspace: { kind: 'headless', ref: 'nightly-reconciliation', action: null },
    };
    const doc = fileMap(withRefsOnFirstStory(headless))[`docs/stories/${LEGACY.stories[0].id}.md`];
    expect(doc).toContain('**Runs headless:** nightly-reconciliation');
    expect(doc).not.toContain('**Workspace:**');
  });

  it('omits the optional lines it has nothing for, rather than printing empty ones', () => {
    const sparse: StoryReferences = {
      business_task_ids: [],
      workspace: { kind: 'headless', ref: 'job' },
      blueprint: { revision: 1, content_sha256: 'f'.repeat(64) },
      design_refs: [],
      acceptance_evidence: [],
    };
    const doc = fileMap(withRefsOnFirstStory(sparse))[`docs/stories/${LEGACY.stories[0].id}.md`];
    expect(doc).toContain('## Where this fits');
    expect(doc).not.toContain('**Business tasks:**');
    expect(doc).not.toContain('**Design decisions:**');
    expect(doc).not.toContain('**Built by:**');
    expect(doc).not.toContain('### Evidence this story needs');
  });

  it('stays PURE: the same plan renders byte-identically, and ARRAY order does not matter', () => {
    // renderDocs promises "same plan in, byte-identical files out", and sorts arrays by their
    // natural key so "two structurally identical plans whose arrays arrived in a different order
    // must render byte-identically". The reference block is new code inside that promise.
    const plan = withRefsOnFirstStory(REFS);
    expect(fileMap(plan)).toEqual(fileMap(plan));

    const shuffled = JSON.parse(JSON.stringify(plan)) as BuildPlan;
    shuffled.stories.reverse();
    shuffled.requirements.reverse();
    shuffled.releases.reverse();
    expect(fileMap(shuffled)).toEqual(fileMap(plan));
  });

  it('object KEY order is not canonicalised — a measured limit, recorded rather than asserted', () => {
    // My first version of the purity test asserted that reordering a story's object KEYS also
    // renders identically. It does not: `.colaberry/plan.json` is serialised with JSON.stringify,
    // which follows insertion order, so the bytes differ and the manifest hash moves with them.
    //
    // That is NOT a defect being reported as one. The renderer's stated promise is about array
    // order, which is the thing that genuinely varies — arrays arrive from a model and from SQL in
    // whatever order. Object key order comes from the code that built the object, which is the same
    // code every time. So this is pinned as a known boundary rather than fixed speculatively or
    // claimed as a guarantee it never made.
    const plan = withRefsOnFirstStory(REFS);
    const keyReordered = JSON.parse(JSON.stringify(plan)) as BuildPlan;
    const first = plan.stories[0] as PlanStory;
    keyReordered.stories[0] = { references: first.references, ...first } as PlanStory;

    expect(fileMap(keyReordered)['.colaberry/plan.json'])
      .not.toEqual(fileMap(plan)['.colaberry/plan.json']);
    // The documents a human reads are unaffected, which is the part that would have mattered.
    expect(fileMap(keyReordered)[`docs/stories/${first.id}.md`])
      .toEqual(fileMap(plan)[`docs/stories/${first.id}.md`]);
  });
});
