const resolveBrand = jest.fn();
const programFindOne = jest.fn();
const programCreate = jest.fn();
const pathFindOne = jest.fn();
const pathCreate = jest.fn();

jest.mock('../../../modules/tenancy/tenantResolver', () => ({
  resolveBrandBySlug: (...a: unknown[]) => resolveBrand(...a),
}));

jest.mock('../../../models', () => ({
  JourneyProgram: {
    findOne: (...a: unknown[]) => programFindOne(...a),
    create: (...a: unknown[]) => programCreate(...a),
  },
  JourneyPath: {
    findOne: (...a: unknown[]) => pathFindOne(...a),
    create: (...a: unknown[]) => pathCreate(...a),
  },
}));

import { seedJourneyPrograms } from '../seedJourneyPrograms';
import { AI_FLOTATION_DENIED_FAMILIES } from '../../../models/OfferFamily';

/**
 * T212 — the seed that finally writes what T203 reads.
 *
 * Three obligations, in descending order of how badly they bite if wrong:
 *
 *   1. IT NEVER OVERWRITES A HUMAN. Not a status, not a default pointer that is
 *      already set — even one pointing at a different programme.
 *   2. THE PROGRAMME IS SEEDED `draft`. T203 refuses any other status, so the
 *      resting state after this seed is deliberately "resolves nothing".
 *   3. AI FLOTATION GETS NO DENIED PATH, asserted against what was actually
 *      written rather than against the definitions.
 */

const brandRow = (over: Record<string, unknown> = {}) => ({
  id: 'brand-1',
  tenant_id: 'tenant-1',
  default_journey_program_id: null as string | null,
  update: jest.fn().mockResolvedValue(undefined),
  ...over,
});

const programRow = (over: Record<string, unknown> = {}) => ({
  id: 'program-1',
  status: 'draft',
  update: jest.fn().mockResolvedValue(undefined),
  ...over,
});

beforeEach(() => {
  resolveBrand.mockReset().mockImplementation(async () => brandRow());
  programFindOne.mockReset().mockResolvedValue(null);
  programCreate.mockReset().mockImplementation(async (p: any) => programRow({ id: `program-${p.slug}` }));
  pathFindOne.mockReset().mockResolvedValue(null);
  pathCreate.mockReset().mockResolvedValue({ id: 'path-1' });
});

const programPayloads = () => programCreate.mock.calls.map((c) => c[0] as Record<string, unknown>);
const pathPayloads = () => pathCreate.mock.calls.map((c) => c[0] as Record<string, unknown>);

describe('it creates the four programs and their paths', () => {
  it('creates one program per brand on an empty database', async () => {
    const r = await seedJourneyPrograms();
    expect(r.programs_created).toBe(4);
    expect(r.programs_existing).toBe(0);
  });

  it('creates 18 paths — 2 + 5 + 6 + 5', async () => {
    const r = await seedJourneyPrograms();
    expect(r.paths_created).toBe(18);
  });

  it('creates nothing on a second run', async () => {
    programFindOne.mockResolvedValue(programRow());
    pathFindOne.mockResolvedValue({ id: 'path-1' });
    const r = await seedJourneyPrograms();
    expect(r.programs_created).toBe(0);
    expect(r.paths_created).toBe(0);
    expect(r.programs_existing).toBe(4);
    expect(r.paths_existing).toBe(18);
    expect(programCreate).not.toHaveBeenCalled();
    expect(pathCreate).not.toHaveBeenCalled();
  });

  it('keys the program lookup on (brand_id, slug) — the pair the unique index enforces', async () => {
    await seedJourneyPrograms();
    for (const call of programFindOne.mock.calls) {
      expect(Object.keys(call[0].where).sort()).toEqual(['brand_id', 'slug']);
    }
  });

  it('keys the path lookup on (program_id, offer_family)', async () => {
    await seedJourneyPrograms();
    for (const call of pathFindOne.mock.calls) {
      expect(Object.keys(call[0].where).sort()).toEqual(['offer_family', 'program_id']);
    }
  });
});

describe('the programme is the switch, and it is seeded OFF', () => {
  it('states status: draft explicitly rather than relying on the column default', async () => {
    // The safe value must survive a change to the model default — the lesson
    // `seedExplorerGrowthCampaigns` records about `is_active`.
    await seedJourneyPrograms();
    const payloads = programPayloads();
    expect(payloads).toHaveLength(4);
    for (const p of payloads) {
      expect(Object.keys(p)).toContain('status');
      expect(p.status).toBe('draft');
    }
  });

  it('seeds paths active, because the programme already holds everything shut', async () => {
    await seedJourneyPrograms();
    for (const p of pathPayloads()) expect(p.status).toBe('active');
  });

  it('numbers path priority per programme, from 0, in catalog order', async () => {
    // ORDER-INDEPENDENT. The first version read `pathPayloads().slice(0, 2)`,
    // which assumed CPN's programme was seeded first - so reordering the
    // definitions broke a test that has nothing to do with ordering. Grouping
    // by programme asserts the real property: each programme's paths are
    // numbered 0..n-1 with no gaps and no duplicates, whatever order the
    // programmes were seeded in.
    // Distinct brand ids per brand. The default mock returns the same id for
    // every brand, and CPN and Colaberry Training deliberately SHARE the slug
    // `learner` — so with one brand id their programme ids collided and two
    // programmes' paths merged into a single group. Per-brand slug uniqueness is
    // exactly what keeps those two apart in the real schema, and the mock has
    // to reflect it.
    resolveBrand.mockImplementation(async (_t: string, brandSlug: string) =>
      brandRow({ id: `brand-${brandSlug}` }),
    );
    programCreate.mockImplementation(async (p: any) =>
      programRow({ id: `program-${p.brand_id}-${p.slug}` }),
    );
    const byProgram: Record<string, number[]> = {};
    pathCreate.mockImplementation(async (p: any) => {
      (byProgram[p.program_id] ??= []).push(p.priority as number);
      return { id: 'path-1' };
    });

    await seedJourneyPrograms();

    const groups = Object.values(byProgram);
    expect(groups).toHaveLength(4);
    for (const priorities of groups) {
      expect(priorities).toEqual([...priorities].sort((x, y) => x - y));
      expect(priorities[0]).toBe(0);
      expect(new Set(priorities).size).toBe(priorities.length);
      expect(Math.max(...priorities)).toBe(priorities.length - 1);
    }
  });
});

describe('it never overwrites a human', () => {
  it('writes no status on an existing program', async () => {
    const row = programRow({ status: 'paused' });
    programFindOne.mockResolvedValue(row);
    await seedJourneyPrograms();
    for (const call of row.update.mock.calls) {
      expect(Object.keys(call[0])).not.toContain('status');
    }
  });

  it('sets the brand default only when it is null', async () => {
    const r = await seedJourneyPrograms();
    expect(r.defaults_set).toBe(4);
    expect(r.defaults_left_alone).toBe(0);
  });

  it('leaves a default pointer alone once set, even pointing elsewhere', async () => {
    // Not "once set to this programme" — a human pointing a brand at a
    // DIFFERENT programme has made a decision, and this seed does not arbitrate
    // it. Auto-correcting would be the override it is forbidden from doing.
    const rows: ReturnType<typeof brandRow>[] = [];
    resolveBrand.mockImplementation(async () => {
      const b = brandRow({ default_journey_program_id: 'someone-elses-program' });
      rows.push(b);
      return b;
    });

    const r = await seedJourneyPrograms();

    expect(r.defaults_left_alone).toBe(4);
    expect(r.defaults_set).toBe(0);
    for (const b of rows) expect(b.update).not.toHaveBeenCalled();
  });

  it('writes the default pointer and nothing else', async () => {
    const rows: ReturnType<typeof brandRow>[] = [];
    resolveBrand.mockImplementation(async () => {
      const b = brandRow();
      rows.push(b);
      return b;
    });
    await seedJourneyPrograms();
    for (const b of rows) {
      for (const call of b.update.mock.calls) {
        expect(Object.keys(call[0])).toEqual(['default_journey_program_id']);
      }
    }
  });
});

describe('§4:287 holds against what was actually WRITTEN', () => {
  it('creates no denied path for AI Flotation', async () => {
    // Asserted against the create payloads, not the definitions — the seed is
    // the last place this could go wrong, and a derivation bug would show up
    // here rather than in the definitions test.
    const created: Record<string, string[]> = {};
    programCreate.mockImplementation(async (p: any) => programRow({ id: `program-${p.brand_id}-${p.slug}` }));
    pathCreate.mockImplementation(async (p: any) => {
      (created[p.program_id] ??= []).push(p.offer_family);
      return { id: 'path-1' };
    });

    await seedJourneyPrograms();

    // Every path written anywhere, grouped by programme. AI Flotation's is the
    // programme whose set is exactly its five service families.
    const allWritten = Object.values(created).flat();
    expect(allWritten).toHaveLength(18);

    const flotation = Object.values(created).find(
      (families) => families.length === 5 && families.includes('paid_discovery') && !families.includes('learner_free_training'),
    );
    expect(flotation).toBeDefined();
    for (const denied of AI_FLOTATION_DENIED_FAMILIES) {
      expect(flotation).not.toContain(denied);
    }
  });

  it('writes business_training exactly once across all four programs', async () => {
    // Colaberry Enterprise only. Twice would mean AI Flotation got one too.
    await seedJourneyPrograms();
    const training = pathPayloads().filter((p) => p.offer_family === 'business_training');
    expect(training).toHaveLength(1);
  });

  it('writes no learner path for either business brand', async () => {
    await seedJourneyPrograms();
    const learnerPaths = pathPayloads().filter((p) =>
      String(p.offer_family).startsWith('learner_'),
    );
    // 2 for CPN + 5 for Colaberry Training = 7, and none for the other two.
    expect(learnerPaths).toHaveLength(7);
  });
});

describe('failure isolation', () => {
  it('skips a brand absent from this database', async () => {
    resolveBrand.mockImplementation(async (_t: string, brandSlug: string) =>
      brandSlug === 'cpn' ? null : brandRow(),
    );
    const r = await seedJourneyPrograms();
    expect(r.skipped_brands).toEqual(['cpn/cpn']);
    expect(r.programs_created).toBe(3);
    expect(r.failed).toEqual([]);
  });

  it('records a write failure without aborting the other brands', async () => {
    programCreate.mockRejectedValueOnce(new Error('deadlock detected'));
    const r = await seedJourneyPrograms();
    expect(r.failed).toHaveLength(1);
    expect(r.programs_created).toBe(3);
  });

  it('a failed path does not stop the remaining paths', async () => {
    pathCreate.mockRejectedValueOnce(new Error('unique violation'));
    const r = await seedJourneyPrograms();
    expect(r.failed).toHaveLength(1);
    expect(r.paths_created).toBe(17);
  });
});
