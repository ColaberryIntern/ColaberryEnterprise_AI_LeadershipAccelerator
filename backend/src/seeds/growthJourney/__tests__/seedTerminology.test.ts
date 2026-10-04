const resolveBrand = jest.fn();
const programFindOne = jest.fn();
const programCreate = jest.fn();
const pathFindOne = jest.fn();
const pathCreate = jest.fn();

jest.mock('../../../modules/tenancy/tenantResolver', () => ({
  resolveBrandBySlug: (...a: unknown[]) => resolveBrand(...a),
}));
jest.mock('../../../models', () => ({
  JourneyProgram: { findOne: (...a: unknown[]) => programFindOne(...a), create: (...a: unknown[]) => programCreate(...a) },
  JourneyPath: { findOne: (...a: unknown[]) => pathFindOne(...a), create: (...a: unknown[]) => pathCreate(...a) },
}));

import { seedJourneyPrograms } from '../seedJourneyPrograms';
import { JOURNEY_PROGRAMS } from '../journeyProgramDefinitions';
import { TERMINOLOGY, TERMINOLOGY_METADATA_KEY } from '../../../services/growthJourney/journeyTerminology';

/**
 * T604 — the programme's words, written into `journey_programs.metadata`.
 *
 * Two obligations, and the second is the one that bites:
 *
 *   1. Every programme ends up carrying the terminology of its KIND, on a fresh
 *      database and on one where the rows already exist.
 *   2. IT NEVER OVERWRITES A HUMAN. `metadata` is the operator's column: a key
 *      already present is left exactly as it is - even a deliberately odd one,
 *      even an empty object - and every OTHER key a human put there survives the
 *      write (the whole-column write is how a JSONB column loses the keys nobody
 *      was thinking about, which this repo has paid for once already).
 */

const brandRow = (over: Record<string, unknown> = {}) => ({
  id: 'brand-1',
  tenant_id: 'tenant-1',
  default_journey_program_id: 'program-x' as string | null,
  update: jest.fn().mockResolvedValue(undefined),
  ...over,
});

/** An existing programme row, with the `metadata` it carries and an `update` spy. */
const programRow = (metadata: unknown, over: Record<string, unknown> = {}) => ({
  id: 'program-1',
  status: 'draft',
  metadata,
  update: jest.fn().mockResolvedValue(undefined),
  ...over,
});

const created = () => programCreate.mock.calls.map(([p]) => p as Record<string, unknown>);
const updatesOf = (row: { update: jest.Mock }) => row.update.mock.calls.map(([p]) => p as Record<string, unknown>);

beforeEach(() => {
  resolveBrand.mockReset().mockImplementation(async () => brandRow());
  programFindOne.mockReset().mockResolvedValue(null);
  programCreate.mockReset().mockImplementation(async () => programRow(null));
  pathFindOne.mockReset().mockResolvedValue(null);
  pathCreate.mockReset().mockResolvedValue({ id: 'path-1' });
});

describe('a fresh database', () => {
  it('writes each programme\'s terminology from its kind, once, through update - never in the create', async () => {
    const rows = JOURNEY_PROGRAMS.map(() => programRow(null));
    let i = 0;
    programCreate.mockImplementation(async () => rows[i++]);

    const result = await seedJourneyPrograms();

    expect(result.terminology_written).toBe(JOURNEY_PROGRAMS.length);
    expect(result.terminology_left_alone).toBe(0);
    // The create carries no metadata at all: one writer, one counter.
    for (const payload of created()) expect(payload).not.toHaveProperty('metadata');
    for (const [n, def] of JOURNEY_PROGRAMS.entries()) {
      expect(updatesOf(rows[n])).toEqual([{ metadata: { [TERMINOLOGY_METADATA_KEY]: TERMINOLOGY[def.kind] } }]);
    }
  });

  it('gives the two learner brands the learner words and the business and consulting brands their own', async () => {
    const rows = JOURNEY_PROGRAMS.map(() => programRow(null));
    let i = 0;
    programCreate.mockImplementation(async () => rows[i++]);
    await seedJourneyPrograms();
    const written = JOURNEY_PROGRAMS.map((def, n) => [def.brand_slug, (updatesOf(rows[n])[0].metadata as Record<string, unknown>)[TERMINOLOGY_METADATA_KEY]]);
    expect(written).toEqual([
      ['cpn', { subject: 'learner', relationship: 'enrolment', pipeline: 'path' }],
      ['colaberry-training', { subject: 'learner', relationship: 'enrolment', pipeline: 'path' }],
      ['colaberry-enterprise', { subject: 'lead', relationship: 'account', pipeline: 'opportunity' }],
      ['ai-flotation', { subject: 'lead', relationship: 'engagement', pipeline: 'project' }],
    ]);
  });
});

describe('a second run, and an operator\'s edits', () => {
  it('is idempotent: the key is already there, so nothing is written and the count says so', async () => {
    const row = programRow({ [TERMINOLOGY_METADATA_KEY]: TERMINOLOGY.learner });
    programFindOne.mockResolvedValue(row);
    const result = await seedJourneyPrograms();
    expect(result.terminology_written).toBe(0);
    expect(result.terminology_left_alone).toBe(JOURNEY_PROGRAMS.length);
    expect(row.update).not.toHaveBeenCalled();
    expect(programCreate).not.toHaveBeenCalled();
  });

  it('never overwrites a human\'s words - whatever they are', async () => {
    for (const operatorValue of [
      { subject: 'member', relationship: 'membership', pipeline: 'track' },
      {},
      'a string, because a human edited the JSON by hand',
      null,
    ]) {
      const row = programRow({ [TERMINOLOGY_METADATA_KEY]: operatorValue });
      programFindOne.mockResolvedValue(row);
      const result = await seedJourneyPrograms();
      expect(result.terminology_written).toBe(0);
      expect(row.update).not.toHaveBeenCalled();
    }
  });

  it('keeps every other metadata key when it does write', async () => {
    const row = programRow({ owner_note: 'ask Ali before renaming', cohort_hint: { size: 12 } });
    programFindOne.mockResolvedValue(row);
    await seedJourneyPrograms();
    // The first write is the learner programme's; the mocked row's own metadata never changes,
    // so every later write carries the same spread - the first is the one worth stating.
    expect(updatesOf(row)[0]).toEqual({
      metadata: {
        owner_note: 'ask Ali before renaming',
        cohort_hint: { size: 12 },
        [TERMINOLOGY_METADATA_KEY]: TERMINOLOGY.learner,
      },
    });
  });

  it('treats metadata that is not an object as absent, and does not spread it', async () => {
    for (const odd of [null, undefined, 'text', 42, ['a', 'list']]) {
      const row = programRow(odd);
      programFindOne.mockResolvedValue(row);
      await seedJourneyPrograms();
      expect(updatesOf(row)[0]).toEqual({ metadata: { [TERMINOLOGY_METADATA_KEY]: TERMINOLOGY.learner } });
    }
  });

  it('does not touch the status or the brand default while writing the words', async () => {
    const brand = brandRow({ default_journey_program_id: 'someone-elses-program' });
    resolveBrand.mockImplementation(async () => brand);
    // One mocked row answers all four programmes, so it takes four writes - each carrying
    // metadata ALONE. The status the row already has is never in a payload.
    const row = programRow(null, { status: 'active' });
    programFindOne.mockResolvedValue(row);
    const result = await seedJourneyPrograms();
    expect(updatesOf(row)).toHaveLength(JOURNEY_PROGRAMS.length);
    for (const payload of updatesOf(row)) expect(Object.keys(payload)).toEqual(['metadata']);
    expect(brand.update).not.toHaveBeenCalled();
    expect(result.defaults_left_alone).toBe(JOURNEY_PROGRAMS.length);
  });
});

describe('the map itself', () => {
  it('covers every kind a programme definition uses, and each word is non-empty', () => {
    const kinds = [...new Set(JOURNEY_PROGRAMS.map((d) => d.kind))].sort();
    expect(Object.keys(TERMINOLOGY).sort()).toEqual(['business', 'consulting', 'learner']);
    for (const kind of kinds) {
      const words = TERMINOLOGY[kind];
      expect(Object.keys(words).sort()).toEqual(['pipeline', 'relationship', 'subject']);
      for (const word of Object.values(words)) expect(word.trim().length).toBeGreaterThan(0);
    }
  });

  it('is frozen, so a caller cannot rename a word for everyone at runtime', () => {
    expect(Object.isFrozen(TERMINOLOGY)).toBe(true);
    expect(Object.isFrozen(TERMINOLOGY.learner)).toBe(true);
  });
});
