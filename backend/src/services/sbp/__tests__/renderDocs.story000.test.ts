/**
 * STORY-000 must reach the student's REPO, not just the portal.
 *
 * THE PRODUCTION FAILURE THIS PINS. A student built their Command Center and
 * pushed. The webhook chain worked end to end — the commit was recognised,
 * `commit_sha` populated, verification ran eight seconds after the push. And
 * zero of three criteria passed, with `rejected_claims` EMPTY: not a single
 * claim had been made. `.colaberry/progress.json` carried no STORY-000 entry at
 * all, because `renderProgressFile` seeds from `plan.stories` and STORY-000 is
 * deliberately kept out of the plan. Told to "follow Step 3 of the prompt", the
 * student's agent answered — correctly — that it did not have the prompt:
 * `.colaberry/` held only `connect.txt`, and nothing in the repo mentioned
 * progress.json.
 *
 * So STORY-000 was the ONE story where the agent had no local reference and no
 * pre-seeded block. Every other story is a boolean to flip; this one had to be
 * authored from memory of a prompt that lives only in `student_tasks.build`.
 * With ~30 students about to run the same first class, it would have failed for
 * all of them.
 *
 * The fix appends STORY-000 at the RENDER layer — the same way
 * buildVerificationService appends its spec — and never puts it into
 * `plan.stories`, where the gate, the XP divisor and materialize ordering all
 * read.
 */
import { renderDocs } from '../renderDocs';
import { BuildPlan } from '../planContract';
import {
  COMMAND_CENTER_STORY_ID,
  COMMAND_CENTER_ACCEPTANCE,
} from '../commandCenterStory';
import {
  ProgressFile,
  mergeProgressFile,
  parseProgressFile,
  serialiseProgressFile,
} from '../verification/progressContract';
import raw from './fixtures/pilot-dryrun-plan.json';

const pilot = raw as unknown as BuildPlan;
const CTX = {
  repoUrl: 'https://github.com/ColaberryIntern/sponsor-dashboard-248d9d63',
  generatedAt: '2026-08-10T00:00:00Z',
  planVersion: 1,
  planSha256: 'abc123',
};

const STORY_000_DOC = `docs/stories/${COMMAND_CENTER_STORY_ID}.md`;
const PROGRESS = '.colaberry/progress.json';

const render = (plan: BuildPlan = pilot, ctx = CTX) => renderDocs(plan, ctx);
const fileAt = (path: string, plan: BuildPlan = pilot) =>
  render(plan).find((f) => f.path === path)!;
const progressOf = (plan: BuildPlan = pilot): ProgressFile =>
  JSON.parse(fileAt(PROGRESS, plan).content);
const story000In = (file: ProgressFile) =>
  file.stories.filter((s) => s.id === COMMAND_CENTER_STORY_ID);

describe('a fresh repo gets STORY-000 in both places', () => {
  it('renders the story doc alongside every other story doc', () => {
    const paths = render().map((f) => f.path);
    expect(paths).toContain(STORY_000_DOC);
    // Same directory, same naming convention as the plan's own stories — not a
    // new location the agent has to be told about.
    for (const s of pilot.stories) expect(paths).toContain(`docs/stories/${s.id}.md`);
  });

  it('seeds the story into progress.json with every criterion unpassed', () => {
    const entries = story000In(progressOf());
    expect(entries).toHaveLength(1);
    expect(entries[0].criteria).toHaveLength(COMMAND_CENTER_ACCEPTANCE.length);
    expect(entries[0].criteria.every((c) => c.passed === false)).toBe(true);
    expect(entries[0].acceptance_total).toBe(COMMAND_CENTER_ACCEPTANCE.length);
  });

  it('leaves the plan itself untouched — STORY-000 never enters plan.stories', () => {
    // The gate, the XP divisor and materialize ordering all read plan.stories.
    // Appending at the render layer is the whole point of this fix.
    const planJson = JSON.parse(fileAt('.colaberry/plan.json').content);
    expect(planJson.stories.map((s: any) => s.id)).not.toContain(COMMAND_CENTER_STORY_ID);
    expect(planJson.stories).toHaveLength(pilot.stories.length);
  });

  it('declares the story doc in the manifest, so prompt-path assertion can cite it', () => {
    const manifest = JSON.parse(fileAt('.colaberry/manifest.json').content);
    expect(manifest.files.map((f: any) => f.path)).toContain(STORY_000_DOC);
  });
});

describe('the criterion text is generated, never hand-typed', () => {
  // PR #1518 exists because retyped criteria drift on punctuation — the em dash
  // in "Trust — no tab shows…" is the exact character an editor rewrites. The
  // defence is to never make the student retype it at all.
  it('renders every criterion byte-identically in the story doc', () => {
    const doc = fileAt(STORY_000_DOC).content;
    for (const a of COMMAND_CENTER_ACCEPTANCE) {
      expect(doc).toContain(a);
      expect(doc).toContain(`- [ ] ${a}`);
    }
  });

  it('seeds every criterion byte-identically in progress.json', () => {
    const [entry] = story000In(progressOf());
    expect(entry.criteria.map((c) => c.text)).toEqual([...COMMAND_CENTER_ACCEPTANCE]);
  });

  it('keeps the em dash intact rather than folding it to a hyphen', () => {
    const trust = COMMAND_CENTER_ACCEPTANCE.find((a) => a.startsWith('Trust'))!;
    expect(trust).toContain('—');
    const [entry] = story000In(progressOf());
    expect(entry.criteria.map((c) => c.text)).toContain(trust);
    expect(fileAt(STORY_000_DOC).content).toContain(trust);
  });
});

describe('a fresh session with no chat history can act on the doc alone', () => {
  const doc = () => fileAt(STORY_000_DOC).content;

  it('names the file it has to edit and the flag it has to flip', () => {
    expect(doc()).toContain('.colaberry/progress.json');
    expect(doc()).toMatch(/passed/);
  });

  it('carries the claim step — the half the student\'s agent could not find', () => {
    expect(doc()).toMatch(/Step 3/);
    expect(doc()).toContain(COMMAND_CENTER_STORY_ID);
    expect(doc()).toMatch(/commit/i);
  });

  it('tells the agent the criteria are already seeded, so it flips rather than authors', () => {
    expect(doc()).toMatch(/already/i);
  });

  it('lands the checkpoint on the finish, so a cold reader does not stop at nine tabs', () => {
    // The doc renders `commandCenterPrompt` verbatim, so the fix carries here on
    // its own — which is exactly the assumption worth pinning rather than
    // trusting. A student reading the file cold must hit the same continuous
    // flow the portal shows: build the rest, then Step 3, commit, push.
    const lines = doc().split('\n').filter((l) => /remove the banner/i.test(l));

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/Step 3/);
    expect(lines[0]).toMatch(/commit/i);
    expect(lines[0]).toMatch(/push/i);
  });

  it('still says to tick only what is genuinely true', () => {
    // Preservation, not new behaviour: telling the agent to finish must never
    // become permission to claim a criterion the build has not met.
    expect(doc()).toMatch(/Only tick a line when it is actually true/i);
    expect(doc()).toMatch(/genuinely true/i);
  });

  it('carries no secret — this repo is public by default', () => {
    // commandCenterPrompt is pure and plan-driven and must stay that way; the
    // webhook secret lives only in the authenticated workspace panel. Rendering
    // this prompt into a public repo is what makes that constraint load-bearing.
    expect(doc()).not.toMatch(/gh secret|GITHUB_TOKEN|ghp_|webhook_secret\s*=/i);
  });
});

describe('idempotency — a republish must not churn or reset', () => {
  it('renders byte-identical output the second time', () => {
    const a = render();
    const b = render();
    expect(b.map((f) => f.path)).toEqual(a.map((f) => f.path));
    for (let i = 0; i < a.length; i++) expect(b[i].content).toBe(a[i].content);
  });

  it('adds exactly one STORY-000 entry, never two', () => {
    expect(story000In(progressOf())).toHaveLength(1);
    // And the doc is rendered once, not once per release.
    const paths = render().map((f) => f.path);
    expect(paths.filter((p) => p === STORY_000_DOC)).toHaveLength(1);
  });

  it('defers to the plan if a plan ever carries its own STORY-000', () => {
    // Same defensive dedup buildVerificationService uses: the plan is the
    // authority on every story it actually contains.
    const withOwn: BuildPlan = {
      ...pilot,
      stories: [
        {
          ...pilot.stories[0],
          id: COMMAND_CENTER_STORY_ID,
          acceptance: ['Given a bespoke plan, when it names STORY-000, then the plan wins.'],
        },
        ...pilot.stories.slice(1),
      ],
    };
    const entries = story000In(progressOf(withOwn));
    expect(entries).toHaveLength(1);
    expect(entries[0].criteria.map((c) => c.text)).toEqual([
      'Given a bespoke plan, when it names STORY-000, then the plan wins.',
    ]);
    const paths = render(withOwn).map((f) => f.path);
    expect(paths.filter((p) => p === STORY_000_DOC)).toHaveLength(1);
  });
});

describe('adding STORY-000 must not disturb work a student has already done', () => {
  /**
   * The dangerous case. `progress.json` is SHARED state: the platform owns the
   * story/criterion skeleton, the student's agent owns the `passed` flags. This
   * is the merge repoWriter performs before it commits.
   */
  const studentFile = (): string => {
    // What sits in the repo today: the 12 planned stories, no STORY-000, and a
    // student who has genuinely finished two of them.
    const before = JSON.parse(fileAt(PROGRESS).content) as ProgressFile;
    return serialiseProgressFile({
      ...before,
      stories: before.stories
        .filter((s) => s.id !== COMMAND_CENTER_STORY_ID)
        .map((s) =>
          s.id === 'STORY-001' || s.id === 'STORY-002'
            ? {
              ...s,
              criteria: s.criteria.map((c) => ({ ...c, passed: true, evidence: 'covered by tests' })),
              files_touched: ['src/auth.ts'],
              tests_added: ['src/__tests__/auth.test.ts'],
              notes: 'done in week 2',
              updated_at: '2026-08-14T10:00:00Z',
            }
            : s,
        ),
    });
  };

  it('keeps every flag the student set on other stories', () => {
    const merged = mergeProgressFile(progressOf(), studentFile());

    for (const id of ['STORY-001', 'STORY-002']) {
      const s = merged.stories.find((x) => x.id === id)!;
      expect(s.criteria.length).toBeGreaterThan(0);
      expect(s.criteria.every((c) => c.passed === true)).toBe(true);
      expect(s.criteria.filter((c) => c.evidence === 'covered by tests').length).toBe(s.criteria.length);
      expect(s.files_touched).toEqual(['src/auth.ts']);
      expect(s.tests_added).toEqual(['src/__tests__/auth.test.ts']);
      expect(s.notes).toBe('done in week 2');
    }
    // Not a single flag flipped back anywhere in the file.
    const flipped = merged.stories.filter(
      (s) => ['STORY-001', 'STORY-002'].includes(s.id) && s.criteria.some((c) => !c.passed),
    );
    expect(flipped).toEqual([]);
  });

  it('adds STORY-000 to that same file, unpassed, without touching the rest', () => {
    const merged = mergeProgressFile(progressOf(), studentFile());
    const entries = story000In(merged);
    expect(entries).toHaveLength(1);
    expect(entries[0].criteria.every((c) => c.passed === false)).toBe(true);
    expect(merged.stories).toHaveLength(pilot.stories.length + 1);
  });

  it('does NOT reset a student who has already finished STORY-000', () => {
    // The republish case that would be worst: a student finishes the Command
    // Center, then an instructor republishes the plan and the ticks vanish.
    const withStory000 = mergeProgressFile(progressOf(), studentFile());
    const finished = serialiseProgressFile({
      ...withStory000,
      stories: withStory000.stories.map((s) =>
        s.id === COMMAND_CENTER_STORY_ID
          ? { ...s, criteria: s.criteria.map((c) => ({ ...c, passed: true })), updated_at: '2026-08-15T09:00:00Z' }
          : s,
      ),
    });

    const republished = mergeProgressFile(progressOf(), finished);
    const [entry] = story000In(republished);
    expect(entry.criteria).toHaveLength(COMMAND_CENTER_ACCEPTANCE.length);
    expect(entry.criteria.every((c) => c.passed === true)).toBe(true);
    expect(entry.updated_at).toBe('2026-08-15T09:00:00Z');
  });

  it('re-merging twice is stable — no duplicate entry, byte-identical bytes', () => {
    const once = serialiseProgressFile(mergeProgressFile(progressOf(), studentFile()));
    const twice = serialiseProgressFile(mergeProgressFile(progressOf(), once));
    expect(twice).toBe(once);
    expect(story000In(JSON.parse(twice))).toHaveLength(1);
  });

  it('the merged file still parses against the schema the reader enforces', () => {
    const merged = serialiseProgressFile(mergeProgressFile(progressOf(), studentFile()));
    const parsed = parseProgressFile(merged);
    expect(parsed.ok).toBe(true);
  });
});
