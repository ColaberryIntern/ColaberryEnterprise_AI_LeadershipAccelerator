/**
 * The autonomy-release migration, decided without a database.
 *
 * Phase 2 of `AUTONOMY_RELEASE_MIGRATION.md`. These tests exercise `planDomainMigration` against a
 * reconstruction of the REAL pre-migration state -- three releases per project and the 513 stories
 * that sat in them -- because the thing most worth proving is a negative: that nothing an intern
 * has done is deleted, moved out from under them, or stripped of its verification.
 *
 * The SQL those decisions turn into is proved separately, in
 * `migrateAgentDomainAutonomyReleases.integration.test.ts`, against a real server. Neither tier
 * can do the other's job: a mocked `sequelize.query` never deduces a parameter type, and a pure
 * planner never writes a row.
 */
import {
  planDomainMigration,
  intendedOrderWithinRung,
  MigrationRefusedError,
  type ExistingList,
  type ExistingStory,
} from '../agentDomainAutonomyReleaseMigration';
import {
  planForDomain,
  AUTONOMY_RELEASES,
  LEGACY_RELEASES,
} from '../agentDomainStoryTemplates';
import { derivedReleaseId, derivedStoryId, STORY_ID_MAX } from '../agentDomainProvisionPlan';
import { AGENT_DOMAIN_KEYS } from '../agentDomainRegistry';

const DOMAIN = 'platform';

/**
 * The state of a domain project the way it really was before this migration.
 *
 * Reconstructed rather than hand-typed: the OLD generator put the Command Center and the five
 * research stories in `r0`, the legacy plan in `r1` and every capability story in `r2`, with
 * positions running `0..n` within each. Rebuilding it from today's plan keeps the fixture at full
 * scale -- 513 rows for ten domains, 56 for platform -- so the test measures the real thing
 * instead of a three-row cartoon.
 */
function preMigrationState(domainKey: string): {
  lists: ExistingList[]; stories: ExistingStory[];
} {
  const oldClusterFor = (kind: string): string | null => {
    if (kind === 'command_center' || kind === 'research') return 'r0';
    if (kind === 'legacy_migration') return 'r1';
    if (kind === 'implementation') return 'r2';
    // `release_behaviour` stories did not exist before the migration.
    return null;
  };

  const lists: ExistingList[] = LEGACY_RELEASES.map((r, i) => ({
    id: derivedReleaseId(domainKey, r.cluster),
    cluster: r.cluster,
    title: ['Discovery and validation', 'Legacy migration plan', 'Capability development'][i],
    position: i,
  }));

  const counters = new Map<string, number>();
  const stories: ExistingStory[] = [];
  for (const s of planForDomain(domainKey).stories) {
    const cluster = oldClusterFor(s.kind);
    if (!cluster) continue;
    const n = counters.get(cluster) ?? 0;
    counters.set(cluster, n + 1);
    stories.push({
      id: derivedStoryId(domainKey, s.story_id),
      story_id: s.story_id.slice(0, STORY_ID_MAX),
      task_list_id: derivedReleaseId(domainKey, cluster),
      release_key: cluster,
      position: n,
      // All three ladder columns were null on all 513 rows before this shipped. Measured.
      capability_id: null,
      autonomy_stage: null,
      story_kind: null,
    });
  }
  return { lists, stories };
}

/** The state AFTER a successful migration, for the idempotency check. */
function postMigrationState(domainKey: string): {
  lists: ExistingList[]; stories: ExistingStory[];
} {
  const pre = preMigrationState(domainKey);
  const plan = planDomainMigration(domainKey, pre.lists, pre.stories);

  const lists: ExistingList[] = [
    ...pre.lists.map((l) => {
      const retitled = plan.lists_to_retitle.find((x) => x.id === l.id);
      return retitled ? { ...l, title: retitled.title, position: retitled.position } : l;
    }),
    ...plan.lists_to_create.map((l) => ({
      id: l.id, cluster: l.cluster, title: l.title, position: l.position,
    })),
  ];

  const moved = new Map(plan.stories_to_reparent.map((s) => [s.id, s]));
  const stories: ExistingStory[] = [
    ...pre.stories.map((s) => {
      const m = moved.get(s.id);
      return m
        ? {
          ...s,
          task_list_id: m.task_list_id,
          release_key: m.release_key,
          autonomy_stage: m.autonomy_stage,
          capability_id: m.capability_id,
          story_kind: m.story_kind,
          position: m.position,
        }
        : s;
    }),
    ...plan.stories_to_insert.map((s) => ({
      id: s.id,
      story_id: s.story_id,
      task_list_id: s.task_list_id,
      release_key: s.release_key,
      position: s.position,
      capability_id: s.capability_id,
      autonomy_stage: s.autonomy_stage,
      story_kind: s.story_kind,
    })),
  ];
  return { lists, stories };
}

describe('the migration creates the ladder and keeps the originals', () => {
  const pre = preMigrationState(DOMAIN);
  const plan = planDomainMigration(DOMAIN, pre.lists, pre.stories);

  it('starts from a fixture that really is the old shape', () => {
    // Guards the test itself. If this fixture stopped resembling production, every assertion
    // below would still pass and prove nothing about the migration.
    expect(pre.lists.map((l) => l.cluster)).toEqual(['r0', 'r1', 'r2']);
    expect(pre.stories.filter((s) => s.release_key === 'r0')).toHaveLength(6);
    expect(pre.stories.filter((s) => s.release_key === 'r1')).toHaveLength(1);
    expect(pre.stories.filter((s) => s.release_key === 'r2')).toHaveLength(48);
    expect(pre.stories.every((s) => s.autonomy_stage === null)).toBe(true);
  });

  it('creates exactly the ten rungs, and no more', () => {
    expect(plan.lists_to_create).toHaveLength(10);
    expect(plan.lists_to_create.map((l) => l.cluster))
      .toEqual(AUTONOMY_RELEASES.map((r) => r.cluster));
  });

  it('creates no list that already exists', () => {
    // Second line behind `ON CONFLICT (id) DO NOTHING`, and the one that matters: there is also a
    // UNIQUE index on `(project_id, cluster)`, which a conflict on `id` would not catch.
    const existing = new Set(pre.lists.map((l) => l.cluster));
    for (const l of plan.lists_to_create) expect(existing.has(l.cluster)).toBe(false);
  });

  it('keeps the three originals and only moves them below the ladder', () => {
    expect(plan.lists_to_retitle).toHaveLength(3);
    expect(plan.lists_to_retitle.map((l) => l.position)).toEqual([10, 11, 12]);
    for (const l of plan.lists_to_retitle) expect(l.title).toMatch(/superseded/);
  });
});

describe('nothing an intern has done is deleted or disturbed', () => {
  const pre = preMigrationState(DOMAIN);
  const plan = planDomainMigration(DOMAIN, pre.lists, pre.stories);

  it('every pre-existing story is still accounted for, by its own id', () => {
    const touched = new Set(plan.stories_to_reparent.map((s) => s.id));
    const unrecognised = new Set(plan.unrecognised_stories);
    for (const s of pre.stories) {
      const accountedFor = touched.has(s.id) || unrecognised.has(s.story_id);
      expect(accountedFor).toBe(true);
    }
  });

  it('the plan has no way to express a deletion at all', () => {
    // Structural, not behavioural, and that is the strongest form available: there is no
    // `stories_to_delete` on the plan, so no amount of state can make it delete one.
    expect(Object.keys(plan).sort()).toEqual([
      'already_migrated', 'domain_key', 'lists_to_create', 'lists_to_retitle',
      'stories_to_insert', 'stories_to_reparent', 'unrecognised_stories',
    ]);
  });

  it('a re-parent writes SIX fields and names no verification column', () => {
    // The promise in the design document: `status`, `verified_at`, `verified_by`, `verified_ref`,
    // `verification_json`, `title`, `narrative` and `build` are untouched. 51 rows in production
    // carry a verification stamp, and a migration that moved them would be taking real work away
    // from the people who did it.
    expect(plan.stories_to_reparent.length).toBeGreaterThan(0);
    for (const s of plan.stories_to_reparent) {
      expect(Object.keys(s).sort()).toEqual([
        'autonomy_stage', 'capability_id', 'id', 'position', 'release_key', 'story_id',
        'story_kind', 'task_list_id',
      ]);
    }
  });

  it('every row that moves keeps the id it already had', () => {
    const before = new Map(pre.stories.map((s) => [s.story_id, s.id]));
    for (const s of plan.stories_to_reparent) expect(s.id).toBe(before.get(s.story_id));
  });
});

describe('the stories land on the rung the data names', () => {
  const pre = preMigrationState(DOMAIN);
  const plan = planDomainMigration(DOMAIN, pre.lists, pre.stories);

  it('all 513-era stories go to R0, because every capability starts there', () => {
    // Measured against the shipped capability records: all 443 carry
    // `starting_autonomy: autonomy:R0`, and the research and legacy stories are mapped there by
    // the design. So the re-parent consolidates rather than spreads -- which the design document
    // predicted and addressed under "Why this does not make anyone look worse".
    for (const s of plan.stories_to_reparent) expect(s.autonomy_stage).toBe('autonomy:R0');
  });

  it('the NEW stories spread across the rungs above R0', () => {
    const rungs = new Set(plan.stories_to_insert.map((s) => s.autonomy_stage));
    expect(rungs.size).toBeGreaterThan(3);
    expect([...rungs].every((r) => /^autonomy:R[0-9]$/.test(r as string))).toBe(true);
  });

  it('every inserted story carries its acceptance criteria, not an empty array', () => {
    // The first 503 stories shipped with `acceptance` null and needed two repair scripts. These
    // 964 have real criteria in the source data, so they get them at insert time.
    expect(plan.stories_to_insert.length).toBeGreaterThan(0);
    for (const s of plan.stories_to_insert) {
      expect(s.acceptance.length).toBeGreaterThan(0);
      expect(s.acceptance[0].trim().length).toBeGreaterThan(0);
    }
  });

  it('every inserted story traces to a capability', () => {
    for (const s of plan.stories_to_insert) {
      expect(s.capability_id).toBeTruthy();
      expect(s.story_kind).toBe('release_behaviour');
    }
  });

  it('the Command Center ends up first on the R0 list', () => {
    // Position is what the portal sorts the board on, and three lists merging into one rung
    // produces dozens of duplicate positions, so this cannot be left to chance.
    const cc = plan.stories_to_reparent.find((s) => s.story_id === `${DOMAIN}.STORY-000`);
    expect(cc).toBeDefined();
    expect(cc?.position).toBe(0);
  });

  it('positions within each rung are dense, starting at zero, with no tie', () => {
    const byRung = new Map<string, number[]>();
    for (const s of [...plan.stories_to_reparent, ...plan.stories_to_insert]) {
      if (!byRung.has(s.release_key)) byRung.set(s.release_key, []);
      (byRung.get(s.release_key) as number[]).push(s.position);
    }
    for (const [rung, positions] of byRung) {
      const sorted = [...positions].sort((a, b) => a - b);
      expect(new Set(sorted).size).toBe(sorted.length);
      expect(sorted).toEqual([...Array(sorted.length).keys()]);
      expect(rung).toMatch(/^autonomy:R[0-9]$/);
    }
  });
});

describe('running it twice changes nothing', () => {
  it('the second run reports already_migrated and writes nothing', () => {
    // The half of the Command Center backfill that could not execute was its refresh branch, and
    // that is the branch a SECOND run takes -- so run one looked fine while the idempotency claim
    // was unprovable. This asserts the claim directly.
    const post = postMigrationState(DOMAIN);
    const second = planDomainMigration(DOMAIN, post.lists, post.stories);

    expect(second.already_migrated).toBe(true);
    expect(second.lists_to_create).toHaveLength(0);
    expect(second.lists_to_retitle).toHaveLength(0);
    expect(second.stories_to_reparent).toHaveLength(0);
    expect(second.stories_to_insert).toHaveLength(0);
  });

  it('POSITIVE CONTROL: the FIRST run is not already_migrated', () => {
    // Without this, a planner that returned an empty plan for every input would pass the test
    // above and look idempotent while doing nothing at all.
    const pre = preMigrationState(DOMAIN);
    const first = planDomainMigration(DOMAIN, pre.lists, pre.stories);
    expect(first.already_migrated).toBe(false);
    expect(first.stories_to_insert.length).toBeGreaterThan(0);
  });

  it('a single row knocked out of place is the only thing the next run fixes', () => {
    const post = postMigrationState(DOMAIN);
    const victim = post.stories[3];
    const nudged = post.stories.map((s) => (
      s.id === victim.id ? { ...s, position: 999, autonomy_stage: null } : s
    ));

    const repair = planDomainMigration(DOMAIN, post.lists, nudged);
    expect(repair.already_migrated).toBe(false);
    expect(repair.stories_to_reparent).toHaveLength(1);
    expect(repair.stories_to_reparent[0].id).toBe(victim.id);
    expect(repair.stories_to_insert).toHaveLength(0);
  });
});

describe('it refuses rather than guessing', () => {
  it('fills a missing rung instead of orphaning the stories that need it', () => {
    // I set out to make the orphan refusal fire and could not, which is the right answer rather
    // than a gap in the test: `lists_to_create` is computed from the full rung list before any
    // story is placed, so every rung a story can name is either already there or being created in
    // the same plan. The refusal in `planDomainMigration` is therefore a second line that no state
    // the planner produces on its own can reach, and this records that rather than dressing an
    // unreachable branch up as a covered one.
    //
    // What IS worth proving is the recovery: hand it a project where nine rungs exist and one has
    // been deleted, and it creates exactly the missing one.
    const pre = preMigrationState(DOMAIN);
    const nineOfTen: ExistingList[] = [
      ...pre.lists,
      ...AUTONOMY_RELEASES.slice(1).map((r) => ({
        id: derivedReleaseId(DOMAIN, r.cluster),
        cluster: r.cluster,
        title: r.name,
        position: r.position,
      })),
    ];
    const plan = planDomainMigration(DOMAIN, nineOfTen, pre.stories);
    expect(plan.lists_to_create.map((l) => l.cluster)).toEqual(['autonomy:R0']);
    expect(plan.stories_to_reparent.length).toBeGreaterThan(0);
  });

  it('MigrationRefusedError carries a stable error_class', () => {
    // CLAUDE.md's error-classification rule: a generic `Error` in the logs is indistinguishable
    // from anything else going wrong.
    const e = new MigrationRefusedError('for the test');
    expect(e.error_class).toBe('MigrationRefusedError');
    expect(e.name).toBe('MigrationRefusedError');
  });
});

describe('intendedOrderWithinRung', () => {
  it('follows the generator order, not the order rows arrive in', () => {
    const order = intendedOrderWithinRung(['a', 'b', 'c'], [
      { story_id: 'c', position: 0, id: 'i3' },
      { story_id: 'a', position: 7, id: 'i1' },
      { story_id: 'b', position: 7, id: 'i2' },
    ]);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('puts rows the generator does not know about last, deterministically', () => {
    const order = intendedOrderWithinRung(['a'], [
      { story_id: 'zz', position: 5, id: 'i9' },
      { story_id: 'a', position: 9, id: 'i1' },
      { story_id: 'yy', position: 5, id: 'i8' },
    ]);
    // `a` first because it is generated; then the two unknowns by (position, id) -- the id
    // tie-break is what makes this deterministic, and positions WILL tie after three lists merge.
    expect(order).toEqual(['a', 'i8' < 'i9' ? 'yy' : 'zz', 'i8' < 'i9' ? 'zz' : 'yy']);
  });

  it('is stable: ordering an already-ordered list changes nothing', () => {
    const rows = [
      { story_id: 'a', position: 0, id: 'i1' },
      { story_id: 'b', position: 1, id: 'i2' },
    ];
    expect(intendedOrderWithinRung(['a', 'b'], rows)).toEqual(['a', 'b']);
    expect(intendedOrderWithinRung(['a', 'b'], rows)).toEqual(['a', 'b']);
  });
});

describe('rows written while story_id was varchar(60)', () => {
  /**
   * The defect a fixture cannot find.
   *
   * Every fixture in this file generates its ids at today's width, so they match the generator by
   * construction. Production does not: `story_id` was `varchar(60)` when those rows were written,
   * so 24 of them are stored cut off mid-word. Running this planner against a snapshot of the real
   * rows reported **17 stories as unrecognised** -- they would have been left behind under a
   * superseded release while a fresh duplicate of each was inserted beside them.
   *
   * The fixture below reproduces that by truncating the way the old column did.
   */
  const DOMAIN_WITH_LONG_IDS = 'product_experience';
  const LEGACY_WIDTH = 60;

  const legacyTruncatedState = (): { lists: ExistingList[]; stories: ExistingStory[] } => {
    const pre = preMigrationState(DOMAIN_WITH_LONG_IDS);
    return {
      lists: pre.lists,
      stories: pre.stories.map((s) => ({ ...s, story_id: s.story_id.slice(0, LEGACY_WIDTH) })),
    };
  };

  it('the fixture really does contain truncated ids, or it proves nothing', () => {
    const state = legacyTruncatedState();
    const truncated = state.stories.filter((s) => s.story_id.length === LEGACY_WIDTH);
    expect(truncated.length).toBeGreaterThan(0);
    // And at least one of them is genuinely shorter than the id the generator now produces.
    const generated = new Set(planForDomain(DOMAIN_WITH_LONG_IDS).stories.map((s) => s.story_id));
    expect(truncated.some((s) => !generated.has(s.story_id))).toBe(true);
  });

  it('matches them anyway, and reports nothing as unrecognised', () => {
    const state = legacyTruncatedState();
    const plan = planDomainMigration(DOMAIN_WITH_LONG_IDS, state.lists, state.stories);
    expect(plan.unrecognised_stories).toEqual([]);
  });

  it('re-parents the truncated rows instead of inserting duplicates beside them', () => {
    const state = legacyTruncatedState();
    const plan = planDomainMigration(DOMAIN_WITH_LONG_IDS, state.lists, state.stories);

    // Every existing row moves; none of them is re-created.
    expect(plan.stories_to_reparent).toHaveLength(state.stories.length);
    const existingIds = new Set(state.stories.map((s) => s.id));
    for (const ins of plan.stories_to_insert) expect(existingIds.has(ins.id)).toBe(false);
  });

  it('repairs the truncated story_id to its full value', () => {
    const state = legacyTruncatedState();
    const plan = planDomainMigration(DOMAIN_WITH_LONG_IDS, state.lists, state.stories);
    const repaired = plan.stories_to_reparent.filter((s) => s.story_id.length > LEGACY_WIDTH);
    expect(repaired.length).toBeGreaterThan(0);
    // The row id was ALWAYS derived from the untruncated string, so writing the full `story_id`
    // makes the row self-consistent rather than changing its identity.
    for (const s of repaired) {
      expect(s.id).toBe(derivedStoryId(DOMAIN_WITH_LONG_IDS, s.story_id));
    }
  });

  it('a per-rung story is never mistaken for the capability row it shares a prefix with', () => {
    // The ambiguity that made the first attempt refuse: four generated ids share the 60-character
    // prefix `curriculum.CAP.module_and_artifact_drafting_for_human_approv` -- the capability story
    // and its R0, R1 and R4 rung stories. Only the capability story existed at that width, so the
    // candidates are narrowed by kind. If that narrowing were removed, this would refuse.
    const state = legacyTruncatedState();
    const plan = planDomainMigration(DOMAIN_WITH_LONG_IDS, state.lists, state.stories);
    for (const s of plan.stories_to_reparent) {
      expect(s.story_kind).not.toBe('release_behaviour');
    }
    for (const s of plan.stories_to_insert) {
      expect(s.story_kind).toBe('release_behaviour');
    }
  });

  it('is still idempotent once the ids have been repaired', () => {
    const state = legacyTruncatedState();
    const plan = planDomainMigration(DOMAIN_WITH_LONG_IDS, state.lists, state.stories);
    const moved = new Map(plan.stories_to_reparent.map((s) => [s.id, s]));

    const after: ExistingStory[] = [
      ...state.stories.map((s) => {
        const m = moved.get(s.id);
        return m ? {
          ...s,
          story_id: m.story_id,
          task_list_id: m.task_list_id,
          release_key: m.release_key,
          autonomy_stage: m.autonomy_stage,
          capability_id: m.capability_id,
          story_kind: m.story_kind,
          position: m.position,
        } : s;
      }),
      ...plan.stories_to_insert.map((s) => ({
        id: s.id, story_id: s.story_id, task_list_id: s.task_list_id, release_key: s.release_key,
        position: s.position, capability_id: s.capability_id, autonomy_stage: s.autonomy_stage,
        story_kind: s.story_kind,
      })),
    ];
    const afterLists: ExistingList[] = [
      ...state.lists.map((l) => {
        const r = plan.lists_to_retitle.find((x) => x.id === l.id);
        return r ? { ...l, title: r.title, position: r.position } : l;
      }),
      ...plan.lists_to_create,
    ];

    const second = planDomainMigration(DOMAIN_WITH_LONG_IDS, afterLists, after);
    expect(second.already_migrated).toBe(true);
  });
});

describe('every domain migrates, not just the one under test', () => {
  it('plans cleanly for all ten', () => {
    for (const domainKey of AGENT_DOMAIN_KEYS) {
      const pre = preMigrationState(domainKey);
      const plan = planDomainMigration(domainKey, pre.lists, pre.stories);
      expect(plan.lists_to_create).toHaveLength(10);
      expect(plan.stories_to_insert.length).toBeGreaterThan(0);
      expect(plan.unrecognised_stories).toEqual([]);
      expect(plan.already_migrated).toBe(false);
    }
  });

  it('projects 964 new stories and re-parents 513 across the ten', () => {
    // The two totals Phase 2 is accountable for, measured through the migration rather than
    // through the generator, so a plan that silently dropped a domain would show up here.
    let inserted = 0;
    let reparented = 0;
    for (const domainKey of AGENT_DOMAIN_KEYS) {
      const pre = preMigrationState(domainKey);
      const plan = planDomainMigration(domainKey, pre.lists, pre.stories);
      inserted += plan.stories_to_insert.length;
      reparented += plan.stories_to_reparent.length;
    }
    expect(inserted).toBe(964);
    expect(reparented).toBe(513);
  });
});
