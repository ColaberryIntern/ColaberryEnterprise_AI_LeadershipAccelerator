/**
 * A brand's agent role: read, write, and the one cell this file exists for.
 *
 * ─── THE LOAD-BEARING TEST IS "TERMINOLOGY SURVIVES" ────────────────────────
 *
 * `journey_programs.metadata` holds `terminology` and now `role`. A write that
 * replaces the column instead of merging into it destroys the first, and the
 * failure is silent: `terminologyOf` returns null, the caller falls back to
 * neutral words, and every Growth Journey tab quietly rebrands. No error, no
 * log, no exception. Every other cell in this file passes against that broken
 * version, which is exactly why the byte-identical assertion is here.
 *
 * ─── WHAT THIS FILE DOES NOT TEST, AND WHERE IT IS TESTED ───────────────────
 *
 * "Write rejected unauthenticated" is a ROUTE property - `requireAdmin` plus the
 * tenancy guard - and asserting it against the service would prove nothing,
 * because the service has no notion of a caller. It is pinned in T4's route
 * suite instead. Claiming it here would be the more comfortable lie.
 */
jest.mock('../../../models', () => ({ Brand: { findByPk: jest.fn() } }));
jest.mock('../../../models/JourneyProgram', () => ({
  JourneyProgram: { findByPk: jest.fn(), findAll: jest.fn() },
}));

import { getBrandRole, setBrandRole, roleOf, ROLE_DEFAULTS, ROLE_METADATA_KEY } from '../brandRoleService';
import { Brand } from '../../../models';
import { JourneyProgram } from '../../../models/JourneyProgram';
import { TERMINOLOGY, TERMINOLOGY_METADATA_KEY, terminologyOf } from '../journeyTerminology';
import { brandRoleBodySchema } from '../../../schemas/growthJourneyBrandRoleSchema';

/**
 * Every write below goes through the real schema, because `setBrandRole` takes a
 * BRANDED type that only `parse` produces. That is deliberate: a plain object
 * would not compile here, which is the same wall a controller hits if it forgets
 * to validate. It also means these cells exercise the strip and the bound rather
 * than assuming a controller somewhere will.
 */
const body = (title: string, description: string) =>
  brandRoleBodySchema.parse({ title, description });

const mockBrand = (Brand as unknown as { findByPk: jest.Mock }).findByPk;
const mockFindByPk = (JourneyProgram as unknown as { findByPk: jest.Mock }).findByPk;
const mockFindAll = (JourneyProgram as unknown as { findAll: jest.Mock }).findAll;

const BRAND_CT = '10ebfb01-dc51-450d-bbef-a2c10e42efa8';
const BRAND_CE = '8e8c4054-322f-4030-8c0f-c8eeafbcdd22';
const BRAND_NO_PROGRAMME = '00000000-0000-4000-8000-000000000000';

/** A programme row whose `update` behaves like Sequelize's: it applies the patch. */
function programRow(opts: {
  brand_id?: string;
  kind?: 'learner' | 'business' | 'consulting';
  metadata?: unknown;
}) {
  const row = {
    id: 'prog-1',
    brand_id: opts.brand_id ?? BRAND_CT,
    kind: opts.kind ?? 'learner',
    metadata: opts.metadata as Record<string, unknown> | null,
    update: jest.fn(async (patch: Record<string, unknown>) => {
      Object.assign(row, patch);
      return row;
    }),
  };
  return row;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockBrand.mockResolvedValue(null);
  mockFindByPk.mockResolvedValue(null);
  mockFindAll.mockResolvedValue([]);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('reading a role nobody has set', () => {
  it('gives Colaberry Training the learner default, in Ali\'s own words', async () => {
    mockFindAll.mockResolvedValue([programRow({ kind: 'learner', metadata: null })]);

    const result = await getBrandRole(BRAND_CT);

    expect(result.status).toBe('default');
    expect(result.role?.title).toBe('Enrollment Specialist');
    // American spelling, deliberately unlike `terminology`'s `enrolment`.
    expect(result.role?.title).not.toMatch(/Enrolment/);
  });

  it('gives Colaberry Enterprise the business default', async () => {
    mockFindAll.mockResolvedValue([programRow({ brand_id: BRAND_CE, kind: 'business' })]);

    const result = await getBrandRole(BRAND_CE);

    expect(result.role?.title).toBe('Business Development Specialist');
    expect(result.status).toBe('default');
  });

  it('marks a default as never written, so the UI can say so', async () => {
    mockFindAll.mockResolvedValue([programRow({ kind: 'consulting' })]);

    const result = await getBrandRole(BRAND_CT);

    // `updated_at: null` is the difference between "this is the default" and
    // "somebody chose this". A timestamp here would assert a choice nobody made.
    expect(result.role?.updated_at).toBeNull();
    expect(result.role?.title).toBe(ROLE_DEFAULTS.consulting.title);
  });

  it('covers every journey kind, so a new kind cannot read as undefined', () => {
    for (const kind of ['learner', 'business', 'consulting'] as const) {
      expect(ROLE_DEFAULTS[kind].title.length).toBeGreaterThan(0);
      expect(ROLE_DEFAULTS[kind].description.length).toBeGreaterThan(0);
    }
  });
});

describe('reading a role somebody has set', () => {
  it('returns the stored value, not the default for its kind', async () => {
    const stored = { title: 'Partner Liaison', description: 'Talks to partners.', updated_at: '2026-11-22T10:00:00.000Z' };
    mockFindAll.mockResolvedValue([
      programRow({ kind: 'learner', metadata: { [ROLE_METADATA_KEY]: stored } }),
    ]);

    const result = await getBrandRole(BRAND_CT);

    expect(result.status).toBe('set');
    expect(result.role).toEqual(stored);
  });

  it('falls back to the default when the stored value is the wrong shape', async () => {
    // A hand-edited row, or a half-written one. Garbage must not render as a role.
    mockFindAll.mockResolvedValue([
      programRow({ kind: 'learner', metadata: { [ROLE_METADATA_KEY]: { title: 42 } } }),
    ]);

    const result = await getBrandRole(BRAND_CT);

    expect(result.status).toBe('default');
  });
});

describe('THE CLOBBER GUARD', () => {
  it('leaves terminology byte-identical after a role write', async () => {
    const terminology = TERMINOLOGY.learner;
    const row = programRow({
      kind: 'learner',
      metadata: { [TERMINOLOGY_METADATA_KEY]: terminology },
    });
    mockFindAll.mockResolvedValue([row]);

    await setBrandRole(BRAND_CT, body('Enrollment Specialist', 'Reaches out.'));

    const written = row.update.mock.calls[0][0].metadata as Record<string, unknown>;
    // Byte-identical, not merely "present and shaped right". A merge that
    // rebuilt the object would pass a shape check and still change the words.
    expect(JSON.stringify(written[TERMINOLOGY_METADATA_KEY])).toBe(JSON.stringify(terminology));
    // And the thing five tabs actually call still parses.
    expect(terminologyOf(written)).toEqual(terminology);
  });

  it('keeps every unrelated key a human put in metadata', async () => {
    const row = programRow({
      metadata: { [TERMINOLOGY_METADATA_KEY]: TERMINOLOGY.learner, operator_note: 'do not touch' },
    });
    mockFindAll.mockResolvedValue([row]);

    await setBrandRole(BRAND_CT, body('A', 'B'));

    const written = row.update.mock.calls[0][0].metadata as Record<string, unknown>;
    expect(written.operator_note).toBe('do not touch');
  });

  it.each([
    ['null', null],
    ['a non-object', 'terminology'],
    ['an array', [1, 2, 3]],
  ])('collapses %s metadata to an empty object rather than spreading garbage', async (_label, metadata) => {
    const row = programRow({ metadata });
    mockFindAll.mockResolvedValue([row]);

    await setBrandRole(BRAND_CT, body('A', 'B'));

    const written = row.update.mock.calls[0][0].metadata as Record<string, unknown>;
    // Exactly one key: the role. Spreading a string would have produced
    // numeric character keys; spreading an array, numeric indices.
    expect(Object.keys(written)).toEqual([ROLE_METADATA_KEY]);
  });

  it('stamps updated_at on a write, which is what makes it a choice', async () => {
    const row = programRow({});
    mockFindAll.mockResolvedValue([row]);

    const result = await setBrandRole(BRAND_CT, body('A', 'B'));

    expect(result.status).toBe('saved');
    expect(result.role?.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('is idempotent: the same input twice converges on the same row', async () => {
    const row = programRow({ metadata: { [TERMINOLOGY_METADATA_KEY]: TERMINOLOGY.learner } });
    mockFindAll.mockResolvedValue([row]);

    await setBrandRole(BRAND_CT, body('Enrollment Specialist', 'Reaches out.'));
    const first = JSON.parse(JSON.stringify(row.metadata));
    await setBrandRole(BRAND_CT, body('Enrollment Specialist', 'Reaches out.'));
    const second = JSON.parse(JSON.stringify(row.metadata));

    // CLAUDE.md's fourth mandatory test type. The write replaces one key rather
    // than appending, so a second run must not add a key, duplicate the role, or
    // lose terminology on the way through.
    expect(Object.keys(second).sort()).toEqual(Object.keys(first).sort());
    expect(second[TERMINOLOGY_METADATA_KEY]).toEqual(TERMINOLOGY.learner);
    expect(second[ROLE_METADATA_KEY].title).toBe(first[ROLE_METADATA_KEY].title);
    expect(second[ROLE_METADATA_KEY].description).toBe(first[ROLE_METADATA_KEY].description);
    // `updated_at` is the one field allowed to move: it records when the choice
    // was last confirmed, which is a different question from what the choice is.
    expect(typeof second[ROLE_METADATA_KEY].updated_at).toBe('string');
  });

  it('logs the PRIOR metadata before writing, so a bad write is restorable', async () => {
    const prior = { [TERMINOLOGY_METADATA_KEY]: TERMINOLOGY.learner };
    const row = programRow({ metadata: { ...prior } });
    mockFindAll.mockResolvedValue([row]);

    await setBrandRole(BRAND_CT, body('A', 'B'));

    const logged = (console.log as jest.Mock).mock.calls
      .map((c) => JSON.parse(c[0] as string))
      .find((l) => l.event === 'brand_role_write_starting');
    expect(logged.prior_metadata).toEqual(prior);
    // Not `success`. It is emitted before the update, so nothing has succeeded
    // yet, and a line that claimed otherwise could not be read during a restore
    // to tell "about to write" from "wrote".
    expect(logged.outcome).toBe('partial');
  });

  it('claims success only in a line emitted AFTER the update', async () => {
    const row = programRow({});
    mockFindAll.mockResolvedValue([row]);

    await setBrandRole(BRAND_CT, body('A', 'B'));

    const events = (console.log as jest.Mock).mock.calls
      .map((c) => JSON.parse(c[0] as string))
      .filter((l) => String(l.event).startsWith('brand_role_write'));
    expect(events.map((e) => [e.event, e.outcome])).toEqual([
      ['brand_role_write_starting', 'partial'],
      ['brand_role_write', 'success'],
    ]);
  });
});

describe('a brand with no journey programme', () => {
  it('reads as no_programme rather than erroring', async () => {
    mockFindAll.mockResolvedValue([]);

    const result = await getBrandRole(BRAND_NO_PROGRAMME);

    expect(result.status).toBe('no_programme');
    expect(result.role).toBeNull();
  });

  it('refuses the write, because there is nowhere to store it', async () => {
    mockFindAll.mockResolvedValue([]);

    const result = await setBrandRole(BRAND_NO_PROGRAMME, body('A', 'B'));

    // Honest refusal, not a silently dropped write and not a programme invented
    // on the operator's behalf. Creating a journey is not configuring one.
    expect(result.status).toBe('no_programme');
  });
});

describe('more than one programme on a brand', () => {
  it('refuses rather than taking the first', async () => {
    mockFindAll.mockResolvedValue([programRow({}), programRow({})]);

    const result = await getBrandRole(BRAND_CT);

    expect(result.status).toBe('ambiguous_programme');
    expect(result.role).toBeNull();
  });

  it('refuses the WRITE too, not just the read', async () => {
    const a = programRow({});
    const b = programRow({});
    mockFindAll.mockResolvedValue([a, b]);

    const result = await setBrandRole(BRAND_CT, body('A', 'B'));

    expect(result.status).toBe('ambiguous_programme');
    // And nothing was written to either candidate. A refusal that still wrote
    // somewhere would be the worst of both.
    expect(a.update).not.toHaveBeenCalled();
    expect(b.update).not.toHaveBeenCalled();
  });

  it('resolves through the brand\'s own default pointer when there is one', async () => {
    const pointed = programRow({ kind: 'business' });
    mockBrand.mockResolvedValue({ default_journey_program_id: 'prog-1' });
    mockFindByPk.mockResolvedValue(pointed);

    const result = await getBrandRole(BRAND_CT);

    expect(result.status).toBe('default');
    expect(result.role?.title).toBe('Business Development Specialist');
    // The pointer answered, so the ambiguous path was never reached.
    expect(mockFindAll).not.toHaveBeenCalled();
  });

  it('ignores a pointer at a programme belonging to another brand', async () => {
    mockBrand.mockResolvedValue({ default_journey_program_id: 'prog-elsewhere' });
    mockFindByPk.mockResolvedValue(programRow({ brand_id: BRAND_CE }));
    mockFindAll.mockResolvedValue([]);

    const result = await getBrandRole(BRAND_CT);

    // A dangling pointer is not a licence to read another brand's row.
    expect(result.status).toBe('no_programme');
  });
});

describe('roleOf', () => {
  it.each([[null], [undefined], ['role'], [[1]], [{}], [{ role: null }], [{ role: [1] }], [{ role: { title: 'a' } }]])(
    'returns null for %p',
    (metadata) => {
      expect(roleOf(metadata)).toBeNull();
    }
  );

  it('tolerates a missing updated_at on a hand-written row', () => {
    expect(roleOf({ role: { title: 'a', description: 'b' } })).toEqual({
      title: 'a',
      description: 'b',
      updated_at: null,
    });
  });
});
