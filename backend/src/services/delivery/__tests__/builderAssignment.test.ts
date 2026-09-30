import {
  CAPACITY_CONSUMING_ROLES,
  assignBuilderToProject,
  consumesCapacity,
} from '../builderAssignment';

/**
 * The first code path that actually consults Gate 12.
 *
 * Gate 12's capacity logic was thoroughly unit-tested and **had no production callers**,
 * so a builder could be put on a hundred projects and nothing would object. These tests
 * cover the wiring rather than the arithmetic: `capacityEconomics.test.ts` already proves
 * `assessOverload` computes correctly, and proving it twice would say nothing new.
 *
 * What is new here is that something *asks* it, asks it about the right count, and
 * refuses when it says no.
 */

const OWNER = 'actor-1';
const BUILDER = 'builder-1';
const PROJECT = 'project-1';

/** A models double. Only the calls this service makes are implemented. */
function makeModels(opts: {
  existingMember?: unknown;
  profile?: { max_parallel_projects: number } | null;
  activeCount?: number;
  override?: {
    override_max_parallel_projects: number;
    expires_at: Date;
  } | null;
}) {
  const created: Record<string, unknown>[] = [];
  const events: Record<string, unknown>[] = [];
  return {
    created,
    events,
    DeliveryProjectMember: {
      findOne: async () => opts.existingMember ?? null,
      count: async () => opts.activeCount ?? 0,
      create: async (row: Record<string, unknown>) => {
        created.push(row);
        return { id: 'membership-1', ...row };
      },
    },
    BuilderAuthorityProfile: {
      findOne: async () => (opts.profile === undefined ? { max_parallel_projects: 3 } : opts.profile),
    },
    DeliveryCapacityOverride: {
      findOne: async () => opts.override ?? null,
    },
    DeliveryEvent: {
      create: async (row: Record<string, unknown>) => {
        events.push(row);
        return row;
      },
    },
  };
}

const assign = (models: any, over: Partial<Parameters<typeof assignBuilderToProject>[0]> = {}) =>
  assignBuilderToProject({
    projectId: PROJECT,
    builderIdentityId: BUILDER,
    role: 'builder',
    actorIdentityId: OWNER,
    now: new Date('2026-08-30T12:00:00Z'),
    models,
    ...over,
  });

describe('which roles consume capacity', () => {
  it('counts builder-side roles', () => {
    for (const r of CAPACITY_CONSUMING_ROLES) expect(consumesCapacity(r)).toBe(true);
  });

  it('does NOT count client-side or review roles', () => {
    // A client reviewer on twelve projects is not overloaded, they are a client.
    for (const r of ['client_reviewer', 'client_owner', 'observer', 'qa_reviewer', 'mentor']) {
      expect(consumesCapacity(r)).toBe(false);
    }
  });
});

describe('assignBuilderToProject', () => {
  it('assigns when the builder is under their cap', async () => {
    const models = makeModels({ activeCount: 1, profile: { max_parallel_projects: 3 } });
    const out = await assign(models);
    expect(out.assigned).toBe(true);
    expect(models.created).toHaveLength(1);
  });

  it('REFUSES the assignment that would exceed the cap', async () => {
    // Cap 3, already on 3. This is the fourth — scenario C's stated observable.
    const models = makeModels({ activeCount: 3, profile: { max_parallel_projects: 3 } });
    const out = await assign(models);
    expect(out.assigned).toBe(false);
    if (!out.assigned) expect(out.reason).toBe('overloaded');
    // Nothing written. A refusal that still created the row would be worse than no guard.
    expect(models.created).toHaveLength(0);
  });

  it('assesses the assignment being CONSIDERED, not the current count', async () => {
    // Cap 3, on 3 already. Assessing the current count would find 3 <= 3 and allow it,
    // letting every builder land exactly one over their cap forever.
    const models = makeModels({ activeCount: 3, profile: { max_parallel_projects: 3 } });
    const out = await assign(models);
    expect(out.assigned).toBe(false);
    if (!out.assigned && out.assessment) expect(out.assessment.activeProjects).toBe(4);
  });

  it('a LIVE override lifts the cap, and the reliance is recorded', async () => {
    const models = makeModels({
      activeCount: 3,
      profile: { max_parallel_projects: 3 },
      override: {
        override_max_parallel_projects: 5,
        expires_at: new Date('2026-09-30T12:00:00Z'),
      },
    });
    const out = await assign(models);
    expect(out.assigned).toBe(true);
    if (out.assigned) expect(out.assessment.reliesOnOverride).toBe(true);
    expect(models.events[0].context).toMatchObject({ relies_on_override: true });
  });

  it('an EXPIRED override does not lift the cap — the part that rots silently', async () => {
    // The scenario spec calls this out specifically: a test that only checks the refusal
    // would pass forever while the expiry logic quietly broke. The query filters on
    // expiry too, but the decision is re-made against `now`, so a row that lapsed between
    // the query and the check still falls back.
    const models = makeModels({
      activeCount: 3,
      profile: { max_parallel_projects: 3 },
      override: {
        override_max_parallel_projects: 5,
        expires_at: new Date('2026-08-01T12:00:00Z'), // a month before `now`
      },
    });
    const out = await assign(models);
    expect(out.assigned).toBe(false);
    if (!out.assigned) expect(out.reason).toBe('overloaded');
  });

  it('refuses a builder with no authority profile rather than defaulting a cap', async () => {
    // An unassessed person having NO cap is exactly backwards, and inventing a number
    // here would fabricate an authority decision nobody made.
    const models = makeModels({ profile: null });
    const out = await assign(models);
    expect(out.assigned).toBe(false);
    if (!out.assigned) expect(out.reason).toBe('no_authority_profile');
  });

  it('refuses a client-side role through the builder path', async () => {
    const models = makeModels({});
    const out = await assign(models, { role: 'client_reviewer' });
    expect(out.assigned).toBe(false);
    if (!out.assigned) expect(out.reason).toBe('client_side_role');
    expect(models.created).toHaveLength(0);
  });

  it('is idempotent — re-assigning the same role does not double-count capacity', async () => {
    const models = makeModels({ existingMember: { id: 'existing' } });
    const out = await assign(models);
    expect(out.assigned).toBe(false);
    if (!out.assigned) expect(out.reason).toBe('already_assigned');
    expect(models.created).toHaveLength(0);
  });

  it('does not consult capacity for a non-consuming role', async () => {
    // A mentor on a project does not eat build capacity. If this consulted the cap, a
    // mentor could be refused because of unrelated build load.
    const models = makeModels({ activeCount: 99, profile: { max_parallel_projects: 1 } });
    const out = await assign(models, { role: 'mentor' });
    expect(out.assigned).toBe(true);
  });

  it('still assigns when the event write fails', async () => {
    // The assignment already happened and was capacity-checked. Undoing it because
    // bookkeeping failed would be worse than losing the event.
    const models = makeModels({ activeCount: 0, profile: { max_parallel_projects: 3 } });
    models.DeliveryEvent.create = async () => {
      throw new Error('events table unavailable');
    };
    const out = await assign(models);
    expect(out.assigned).toBe(true);
  });
});
