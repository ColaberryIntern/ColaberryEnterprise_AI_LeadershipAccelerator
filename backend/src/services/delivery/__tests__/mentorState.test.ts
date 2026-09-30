import {
  assembleBuilderState,
  mentorQueueFor,
  COMPLETED_STORY_STATUSES,
  IN_FLIGHT_STORY_STATUSES,
} from '../mentorState';

/**
 * The first caller of Gate 11, which had zero callers AND no test.
 *
 * Most of what matters here is about **what the assembler refuses to claim**. The failure
 * mode being defended against is not a wrong number — it is a confident zero: a mentor
 * queue that reports "no problems" for a builder whose problems are simply unrecorded,
 * with the same confidence as a genuine all-clear.
 */

const BUILDER = 'identity-builder';
const PROJECT = 'project-1';

function makeModels(opts: {
  memberships?: any[];
  stories?: any[];
  acceptances?: any[];
  releases?: any[];
} = {}) {
  const calls: Record<string, any[]> = { acceptances: [], releases: [] };
  return {
    calls,
    DeliveryProjectMember: {
      findAll: async () =>
        opts.memberships ?? [{ delivery_project_id: PROJECT, platform_identity_id: BUILDER }],
    },
    DeliveryStory: { findAll: async () => opts.stories ?? [] },
    DeliveryClientAcceptance: {
      findAll: async (q: any) => {
        calls.acceptances.push(q);
        return opts.acceptances ?? [];
      },
    },
    DeliveryRelease: {
      findAll: async (q: any) => {
        calls.releases.push(q);
        return opts.releases ?? [];
      },
    },
  };
}

const story = (over: any = {}) => ({
  status: 'proposed',
  rework_count: 0,
  assigned_to_identity_id: BUILDER,
  ...over,
});

describe('what the assembler admits it cannot see', () => {
  it('ALWAYS reports the two fields with no source in the schema', async () => {
    // Not a query nobody wrote — a join that does not exist. Reporting them on every call
    // is what stops `false` from being read as "checked, and fine".
    const out = await assembleBuilderState({ builderIdentityId: BUILDER, models: makeModels() });
    const fields = out.unsourceable.map((u) => u.field).sort();
    expect(fields).toEqual(['architectureConcernRaised', 'trustOrSecurityGateFailing']);
    expect(out.state.trustOrSecurityGateFailing).toBe(false);
    expect(out.state.architectureConcernRaised).toBe(false);
  });

  it('every unsourceable entry carries a REASON, not just a field name', async () => {
    // A field name alone tells a reader something is missing but not whether it is worth
    // fixing. The reason is what makes the list actionable instead of decorative.
    const out = await assembleBuilderState({ builderIdentityId: BUILDER, models: makeModels() });
    for (const u of out.unsourceable) {
      expect(typeof u.reason).toBe('string');
      expect(u.reason.length).toBeGreaterThan(20);
    }
  });

  it('DECLARES the story counts unsourceable when no status is recognised', async () => {
    // The important one. If the status vocabulary moves, every count silently becomes 0 —
    // which renders as a builder in perfect health. The guard turns that into a stated gap.
    const models = makeModels({
      stories: [story({ status: 'wip' }), story({ status: 'shipped' })],
    });
    const out = await assembleBuilderState({ builderIdentityId: BUILDER, models });
    const fields = out.unsourceable.map((u) => u.field);
    expect(fields).toContain('concurrentStories');
    expect(fields).toContain('completedStories');
    expect(fields).toContain('reworkedStories');
  });

  it('names the statuses it actually saw, so the fix is obvious', async () => {
    // "Counts unavailable" sends someone reading code. "Statuses present: shipped, wip"
    // sends them to the one line that needs changing.
    const models = makeModels({
      stories: [story({ status: 'wip' }), story({ status: 'shipped' })],
    });
    const out = await assembleBuilderState({ builderIdentityId: BUILDER, models });
    const reason = out.unsourceable.find((u) => u.field === 'concurrentStories')!.reason;
    expect(reason).toContain('shipped');
    expect(reason).toContain('wip');
  });

  it('does NOT cry vocabulary-mismatch when the builder simply has no stories', async () => {
    // Zero stories is a real, correct zero. Reporting it as a gap would train readers to
    // ignore the gap list, which is the only thing making the rest of this useful.
    const out = await assembleBuilderState({
      builderIdentityId: BUILDER,
      models: makeModels({ stories: [] }),
    });
    expect(out.unsourceable.map((u) => u.field)).not.toContain('concurrentStories');
    expect(out.state.concurrentStories).toBe(0);
  });

  it('does not cry mismatch when SOME stories classify', async () => {
    const models = makeModels({
      stories: [story({ status: 'in_progress' }), story({ status: 'mystery' })],
    });
    const out = await assembleBuilderState({ builderIdentityId: BUILDER, models });
    expect(out.unsourceable.map((u) => u.field)).not.toContain('concurrentStories');
    expect(out.state.concurrentStories).toBe(1);
  });
});

describe('the counts it does source', () => {
  it('separates in-flight from completed', async () => {
    const models = makeModels({
      stories: [
        story({ status: 'in_progress' }),
        story({ status: 'in_review' }),
        story({ status: 'done' }),
      ],
    });
    const out = await assembleBuilderState({ builderIdentityId: BUILDER, models });
    expect(out.state.concurrentStories).toBe(2);
    expect(out.state.completedStories).toBe(1);
  });

  it('counts rework only among COMPLETED stories', async () => {
    // A story still in flight that has already come back is not yet evidence about the
    // builder's completion quality — it is evidence they are still working on it. Counting
    // it would inflate the rework rate against work that has not finished.
    const models = makeModels({
      stories: [
        story({ status: 'done', rework_count: 2 }),
        story({ status: 'done', rework_count: 0 }),
        story({ status: 'in_progress', rework_count: 3 }),
      ],
    });
    const out = await assembleBuilderState({ builderIdentityId: BUILDER, models });
    expect(out.state.completedStories).toBe(2);
    expect(out.state.reworkedStories).toBe(1);
  });

  it('treats a missing rework_count as zero rather than NaN', async () => {
    // Rows written before the column existed have no value for it.
    const models = makeModels({ stories: [story({ status: 'done', rework_count: undefined })] });
    const out = await assembleBuilderState({ builderIdentityId: BUILDER, models });
    expect(out.state.reworkedStories).toBe(0);
  });

  it('sources releaseAwaitingApproval from Gate 14s table', async () => {
    // The field that made Gate 14 a prerequisite for Gate 11.
    const models = makeModels({ releases: [{ id: 'r1', status: 'candidate' }] });
    const out = await assembleBuilderState({ builderIdentityId: BUILDER, models });
    expect(out.state.releaseAwaitingApproval).toBe(true);
  });

  it('reads client review state from acceptances', async () => {
    const models = makeModels({
      acceptances: [{ status: 'pending', accepted_at: null }, { status: 'accepted', accepted_at: new Date() }],
    });
    const out = await assembleBuilderState({ builderIdentityId: BUILDER, models });
    expect(out.state.clientReviewPending).toBe(true);
    expect(out.state.hasClientReviewExperience).toBe(true);
  });
});

describe('scoping', () => {
  it('does not query acceptances or releases at all when the builder has no projects', async () => {
    // An unscoped findAll here would return every acceptance in the system and report a
    // pending client review for a builder who is on no project.
    const models = makeModels({ memberships: [] });
    const out = await assembleBuilderState({ builderIdentityId: BUILDER, models });
    expect(models.calls.acceptances).toHaveLength(0);
    expect(models.calls.releases).toHaveLength(0);
    expect(out.state.clientReviewPending).toBe(false);
    expect(out.state.releaseAwaitingApproval).toBe(false);
  });
});

describe('mentorQueueFor', () => {
  it('returns prioritised exceptions AND the blind spots together', async () => {
    // Six answers presented as eight is the thing this whole module exists to prevent, so
    // the queue carries its own caveats rather than leaving the caller to fetch them.
    const models = makeModels({
      stories: Array.from({ length: 6 }, () => story({ status: 'in_progress' })),
      releases: [{ id: 'r1', status: 'candidate' }],
    });
    const out = await mentorQueueFor({ builderIdentityId: BUILDER, models });

    const kinds = out.exceptions.map((e) => e.kind);
    expect(kinds).toContain('builder_overloaded');
    expect(kinds).toContain('release_ready');
    // Urgent first: release_ready is urgent, builder_overloaded is not.
    expect(kinds.indexOf('release_ready')).toBeLessThan(kinds.indexOf('builder_overloaded'));
    expect(out.unsourceable.length).toBeGreaterThan(0);
  });
});

describe('the status sets themselves', () => {
  it('do not overlap', async () => {
    // An overlapping status would be counted as both in-flight and completed, making the
    // two counts silently inconsistent with each other.
    const overlap = IN_FLIGHT_STORY_STATUSES.filter((s) => COMPLETED_STORY_STATUSES.includes(s));
    expect(overlap).toEqual([]);
  });

  it("includes 'proposed', the only status anything actually writes", async () => {
    // upsertStory writes 'proposed' and nothing else does. If that value ever fell out of
    // the in-flight set, every real story in the database would stop being counted.
    expect(IN_FLIGHT_STORY_STATUSES).toContain('proposed');
  });
});
