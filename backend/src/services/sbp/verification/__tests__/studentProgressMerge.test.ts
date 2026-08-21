/**
 * studentProgressMerge — the merge that is safe to hand to a student.
 *
 * `mergeProgressFile` is correct for the commit it was written for and lossy for
 * this one: it returns `{ ...rendered, stories }`, and `rendered` has four keys,
 * so anything else a student put at the top level of their progress file is
 * simply not in the output. `parseProgressFile` cannot rescue it either — the
 * Zod object strips unknown keys before the merge ever sees them.
 *
 * The fixtures here are not invented. They are the shapes read live from the
 * fifteen pull-only student repos on 2026-08-21:
 *
 *   - Hellen Muhonja's file carries NINE custom top-level keys her Command
 *     Center reads at runtime, including her own decisions log.
 *   - Abrahim Nur's file carries a per-story `points` key.
 *   - Firas Baidhani still carries the OLD STORY-000 wording and scores 5/5,
 *     which is the case that inverts if the supersession table is missing.
 *   - Eleven students were emailed a computed file the day before this shipped,
 *     so the common case at release is a SECOND run over an already-correct
 *     file, and it must be byte-identical.
 */
import {
  renderProgressFile,
  mergeProgressFile,
  serialiseProgressFile,
  SUPERSEDED_CRITERIA,
} from '../progressContract';
import {
  PLATFORM_TOP_LEVEL_KEYS,
  PLATFORM_STORY_KEYS,
  mergeStudentProgressFile,
} from '../studentProgressMerge';

const PLAN = [
  {
    id: 'STORY-000',
    release: 'R1',
    acceptance: [
      'Given the Command Center, when any tab renders, then .colaberry/plan.json and '
      + '.colaberry/progress.json are both committed in this repo and every tab reads its content '
      + 'from them at runtime rather than from hard-coded values.',
      'Given the Command Center, when a stranger opens it, then it needs no login.',
    ],
  },
  { id: 'STORY-001', release: 'R1', acceptance: ['Given a lead, when it arrives, then it is scored.'] },
  { id: 'STORY-002', release: 'R2', acceptance: ['Given a report, when it runs, then it is emailed.'] },
];

const rendered = () => renderProgressFile(PLAN, 'MeshMedic');

/** Hellen's nine, verbatim and in her file's order. */
const HELLENS_NINE = [
  'updatedAt', 'storyStatus', 'systemStatus', 'guardrailEnforced',
  'agentsScoped', 'outcomes', 'story000', 'decisions', 'notes',
];

/**
 * A file shaped like Hellen's: STORY-000 only, all five ticked, and nine custom
 * top-level keys around it — the exact combination that makes a naive merge
 * both correct-looking and destructive.
 */
const hellensFile = (): string => JSON.stringify({
  schema_version: 2,
  project: 'MeshMedic',
  updatedAt: '2026-08-18T09:00:00Z',
  storyStatus: { 'STORY-000': 'done' },
  systemStatus: 'green',
  guardrailEnforced: true,
  agentsScoped: ['intake', 'triage'],
  outcomes: [{ metric: 'referral_time', baseline: 48 }],
  story000: { command_center_url: 'https://hellen.example/mesh' },
  decisions: [{ on: '2026-08-16', chose: 'Vercel over Pages', because: 'custom domain' }],
  notes: 'Command Center reads storyStatus and decisions at runtime.',
  stories: [{
    id: 'STORY-000',
    criteria: PLAN[0].acceptance.map((text) => ({ text, passed: true })),
    files_touched: ['index.html'],
    tests_added: [],
    notes: 'built the shell first',
  }],
}, null, 2);

describe('a student\'s own keys survive the merge', () => {
  it('carries all nine of Hellen Muhonja\'s custom top-level keys across', () => {
    const result = mergeStudentProgressFile(rendered(), hellensFile());
    const out = JSON.parse(result.content);
    for (const key of HELLENS_NINE) {
      expect(Object.keys(out)).toContain(key);
    }
    expect(result.preserved_top_level_keys).toEqual(HELLENS_NINE);
  });

  it('carries their VALUES, not just their names — the decisions log is intact', () => {
    const out = JSON.parse(mergeStudentProgressFile(rendered(), hellensFile()).content);
    expect(out.decisions).toEqual([
      { on: '2026-08-16', chose: 'Vercel over Pages', because: 'custom domain' },
    ]);
    expect(out.storyStatus).toEqual({ 'STORY-000': 'done' });
    expect(out.notes).toBe('Command Center reads storyStatus and decisions at runtime.');
  });

  /**
   * The regression guard, and the whole reason this module exists. If this ever
   * starts passing, `mergeProgressFile` has grown the behaviour itself and this
   * module can go.
   */
  it('is exactly what the platform\'s own mergeProgressFile does NOT do', () => {
    const naive = mergeProgressFile(rendered(), hellensFile());
    for (const key of HELLENS_NINE) {
      expect(Object.keys(naive)).not.toContain(key);
    }
  });

  it('preserves a per-story custom key — Abrahim Nur\'s `points`', () => {
    const file = JSON.stringify({
      schema_version: 2,
      stories: [{ id: 'STORY-001', points: 40, criteria: [{ text: PLAN[1].acceptance[0], passed: true }] }],
    });
    const result = mergeStudentProgressFile(rendered(), file);
    const story = JSON.parse(result.content).stories.find((s: any) => s.id === 'STORY-001');
    expect(story.points).toBe(40);
    expect(result.preserved_story_keys).toEqual(['points']);
  });

  it('never lets a student key overwrite a platform key', () => {
    // `stories` is ours. A file claiming a different one must not win, or a
    // student could hand themselves a plan.
    const hostile = JSON.stringify({
      schema_version: 2, stories: [], project: 'not-mine', totals: null,
    });
    const out = JSON.parse(mergeStudentProgressFile(rendered(), hostile).content);
    expect(out.project).toBe('MeshMedic');
    expect(out.stories.map((s: any) => s.id)).toEqual(['STORY-000', 'STORY-001', 'STORY-002']);
  });
});

describe('the ticks a student has already earned', () => {
  it('carries every tick across rather than resetting it', () => {
    const result = mergeStudentProgressFile(rendered(), hellensFile());
    const out = JSON.parse(result.content);
    const s0 = out.stories.find((s: any) => s.id === 'STORY-000');
    expect(s0.criteria.every((c: any) => c.passed)).toBe(true);
    expect(result.criteria_passed).toBe(2);
  });

  it('gives the other stories their full criteria — the whole point of the fix', () => {
    // Hellen's file has ONE story. The merged file must carry all three, each
    // with its exact criterion wording, or she is back where she started.
    const out = JSON.parse(mergeStudentProgressFile(rendered(), hellensFile()).content);
    expect(out.stories.map((s: any) => s.id)).toEqual(['STORY-000', 'STORY-001', 'STORY-002']);
    expect(out.stories.find((s: any) => s.id === 'STORY-001').criteria[0].text)
      .toBe(PLAN[1].acceptance[0]);
  });

  /**
   * Firas Baidhani's case. His file carries the wording STORY-000 had BEFORE
   * 2026-08-19 and he scores 5/5 in production. An earlier measurement of this
   * merge concluded it regressed everyone by 2 of 5 — that was an artefact of a
   * pinned runtime dist that predates `SUPERSEDED_CRITERIA`. Pinned here so the
   * inversion cannot come back through a code path rather than a stale build.
   */
  it('keeps a tick made against wording the platform itself later rewrote', () => {
    expect(SUPERSEDED_CRITERIA.length).toBeGreaterThan(0);
    const old = SUPERSEDED_CRITERIA[0];
    const plan = [{ id: 'STORY-000', acceptance: [old.now] }];
    const theirs = JSON.stringify({
      schema_version: 2,
      stories: [{ id: 'STORY-000', criteria: [{ text: old.was, passed: true }] }],
    });
    const result = mergeStudentProgressFile(renderProgressFile(plan, 'HomeHub'), theirs);
    expect(result.criteria_passed).toBe(1);
    expect(JSON.parse(result.content).stories[0].criteria[0].passed).toBe(true);
  });
});

describe('safe to run twice', () => {
  it('is byte-identical on a second pass over its own output', () => {
    const once = mergeStudentProgressFile(rendered(), hellensFile()).content;
    const twice = mergeStudentProgressFile(rendered(), once).content;
    expect(twice).toBe(once);
  });

  it('adds no duplicate stories and reverts no tick on the second pass', () => {
    const once = mergeStudentProgressFile(rendered(), hellensFile());
    const twice = mergeStudentProgressFile(rendered(), once.content);
    const ids = JSON.parse(twice.content).stories.map((s: any) => s.id);
    expect(ids).toEqual([...new Set(ids)]);
    expect(twice.criteria_passed).toBe(once.criteria_passed);
    expect(twice.preserved_top_level_keys).toEqual(HELLENS_NINE);
  });

  it('is a no-op against a file the platform itself produced yesterday', () => {
    // Eleven students were emailed exactly this. Re-running must change nothing.
    const emailed = serialiseProgressFile(rendered());
    expect(mergeStudentProgressFile(rendered(), emailed).content).toBe(emailed);
  });
});

describe('what it reports about the file it found', () => {
  it('says `absent` when there is nothing at the path', () => {
    const result = mergeStudentProgressFile(rendered(), null);
    expect(result.existing).toBe('absent');
    expect(result.criteria_passed).toBe(0);
  });

  it('says `merged` only when the merge could actually read their file', () => {
    expect(mergeStudentProgressFile(rendered(), hellensFile()).existing).toBe('merged');
  });

  /**
   * The dangerous middle case: valid JSON, wrong shape. `mergeProgressFile`
   * discards it silently and carries nothing, so calling this a merge would tell
   * a student their ticks came across when none could.
   */
  it('says `unreadable` for a file that parses as JSON but not as a progress file', () => {
    const result = mergeStudentProgressFile(rendered(), JSON.stringify({ hello: 'world' }));
    expect(result.existing).toBe('unreadable');
    expect(result.criteria_passed).toBe(0);
  });

  it('still rescues the custom keys of a file it could not otherwise read', () => {
    const result = mergeStudentProgressFile(
      rendered(),
      JSON.stringify({ schema_version: 2, decisions: [{ on: 'x' }] }),
    );
    expect(result.existing).toBe('unreadable');
    expect(result.preserved_top_level_keys).toEqual(['decisions']);
  });

  it('says `unreadable`, not `absent`, for a file that is not JSON at all', () => {
    expect(mergeStudentProgressFile(rendered(), '{ not json').existing).toBe('unreadable');
  });

  it('reports a story the plan does not contain instead of losing it silently', () => {
    const theirs = JSON.stringify({
      schema_version: 2,
      stories: [{ id: 'STORY-999', criteria: [{ text: 'mine', passed: true }] }],
    });
    const result = mergeStudentProgressFile(rendered(), theirs);
    expect(result.unrecognised_story_ids).toEqual(['STORY-999']);
  });
});

describe('the ownership frontier is pinned to what the renderer actually emits', () => {
  it('lists every top-level key renderProgressFile produces, and no more', () => {
    expect(Object.keys(rendered()).sort()).toEqual([...PLATFORM_TOP_LEVEL_KEYS].sort());
  });

  it('lists every story-level key renderProgressFile produces, and no more', () => {
    expect(Object.keys(rendered().stories[0]).sort()).toEqual([...PLATFORM_STORY_KEYS].sort());
  });
});
