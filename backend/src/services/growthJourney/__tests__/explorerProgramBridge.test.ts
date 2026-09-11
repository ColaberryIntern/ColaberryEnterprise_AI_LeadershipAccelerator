const profileFindAll = jest.fn();
const profileCount = jest.fn();
const profileCreate = jest.fn();
const profileUpdate = jest.fn();
const profileDestroy = jest.fn();
const programFindOne = jest.fn();
const enrollmentFindOne = jest.fn();
const enrollmentCreate = jest.fn();
const enrollmentCount = jest.fn();
const resolveBrand = jest.fn();

jest.mock('../../../models', () => ({
  ExplorerJourneyProfile: {
    findAll: (...a: unknown[]) => profileFindAll(...a),
    count: (...a: unknown[]) => profileCount(...a),
    // Present ONLY so a write can be asserted against — AD-1 forbids touching
    // any explorer_* table, and "I did not intend to write there" is not a
    // property a reader can check.
    create: (...a: unknown[]) => profileCreate(...a),
    update: (...a: unknown[]) => profileUpdate(...a),
    upsert: (...a: unknown[]) => profileCreate(...a),
    destroy: (...a: unknown[]) => profileDestroy(...a),
  },
  JourneyProgram: { findOne: (...a: unknown[]) => programFindOne(...a) },
  GrowthJourneyEnrollment: {
    findOne: (...a: unknown[]) => enrollmentFindOne(...a),
    create: (...a: unknown[]) => enrollmentCreate(...a),
    count: (...a: unknown[]) => enrollmentCount(...a),
  },
}));

jest.mock('../../../modules/tenancy/tenantResolver', () => ({
  resolveBrandBySlug: (...a: unknown[]) => resolveBrand(...a),
}));

import {
  backfillExplorerEnrollments,
  reconcileExplorerBackfill,
  EXPLORER_PROGRAM,
  BACKFILL_SOURCE,
} from '../explorerProgramBridge';
import { subjectRef } from '../../../models/GrowthJourneyEnrollment';
import { PROGRAM_SLUGS } from '../../../seeds/growthJourney/journeyProgramDefinitions';

/**
 * T205 — mapping the Explorer population onto the generic programme.
 *
 * Production holds 217 `explorer_journey_profiles` rows. The fixture below is
 * 217 profiles rather than a token three, because the properties that matter
 * here are counting properties: 217 in, 217 out, and 217 again on a re-run.
 *
 * THE NEGATIVE CONTRACT IS THE IMPORTANT ONE. AD-1 forbids touching any
 * `explorer_*` table, so every Explorer writer is spied and checked after every
 * scenario — not in one dedicated test, which would only prove the path it
 * exercised.
 */

const PROFILE_COUNT = 217;

const profiles = (n = PROFILE_COUNT) =>
  Array.from({ length: n }, (_, i) => ({
    enrollment_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    lead_id: i % 3 === 0 ? null : 1000 + i,
  }));

const EXPLORER_WRITERS = [
  ['ExplorerJourneyProfile.create/upsert', profileCreate],
  ['ExplorerJourneyProfile.update', profileUpdate],
  ['ExplorerJourneyProfile.destroy', profileDestroy],
] as const;

const expectExplorerUntouched = () => {
  for (const [name, spy] of EXPLORER_WRITERS) {
    if (spy.mock.calls.length > 0) {
      throw new Error(`${name} was called — AD-1 forbids writing to any explorer_* table`);
    }
  }
};

beforeEach(() => {
  for (const [, spy] of EXPLORER_WRITERS) spy.mockReset();
  resolveBrand.mockReset().mockResolvedValue({ id: 'brand-training', tenant_id: 'tenant-colaberry' });
  programFindOne.mockReset().mockResolvedValue({ id: 'program-learner' });
  profileFindAll.mockReset().mockResolvedValue(profiles());
  profileCount.mockReset().mockResolvedValue(PROFILE_COUNT);
  enrollmentFindOne.mockReset().mockResolvedValue(null);
  enrollmentCreate.mockReset().mockResolvedValue({ id: 'gje-1' });
  enrollmentCount.mockReset().mockResolvedValue(PROFILE_COUNT);
});

afterEach(() => {
  expectExplorerUntouched();
});

const createPayloads = () => enrollmentCreate.mock.calls.map((c) => c[0] as Record<string, unknown>);

describe('AD-1: Explorer is read, never written', () => {
  it('reads profiles and writes only growth_journey_enrollments', async () => {
    const r = await backfillExplorerEnrollments();
    expect(profileFindAll).toHaveBeenCalled();
    expect(enrollmentCreate).toHaveBeenCalledTimes(PROFILE_COUNT);
    expect(r.enrollments_created).toBe(PROFILE_COUNT);
  });

  it('selects only the two columns it needs from the profile', async () => {
    // A profile carries scores, overlays and signal summaries this step has no
    // business reading.
    await backfillExplorerEnrollments();
    expect(profileFindAll).toHaveBeenCalledWith({ attributes: ['enrollment_id', 'lead_id'] });
  });

  it('touches Explorer on no path, including the refusal paths', async () => {
    resolveBrand.mockResolvedValue(null);
    await backfillExplorerEnrollments();
    programFindOne.mockResolvedValue(null);
    resolveBrand.mockResolvedValue({ id: 'b', tenant_id: 't' });
    await backfillExplorerEnrollments();
    enrollmentCreate.mockRejectedValue(new Error('boom'));
    await backfillExplorerEnrollments();
    // expectExplorerUntouched() runs in afterEach.
  });
});

describe('217 in, 217 out — and 217 again', () => {
  it('creates one enrollment per profile', async () => {
    const r = await backfillExplorerEnrollments();
    expect(r.profiles_scanned).toBe(PROFILE_COUNT);
    expect(r.enrollments_created).toBe(PROFILE_COUNT);
    expect(r.enrollments_existing).toBe(0);
  });

  it('creates NOTHING on a second run — the named count, not just "no change"', async () => {
    enrollmentFindOne.mockResolvedValue({ id: 'gje-existing' });
    const r = await backfillExplorerEnrollments();
    expect(r.profiles_scanned).toBe(PROFILE_COUNT);
    expect(r.enrollments_created).toBe(0);
    expect(r.enrollments_existing).toBe(PROFILE_COUNT);
    expect(enrollmentCreate).not.toHaveBeenCalled();
  });

  it('keys every lookup on (program_id, subject_ref) — the unique index pair', async () => {
    await backfillExplorerEnrollments();
    for (const call of enrollmentFindOne.mock.calls) {
      expect(Object.keys(call[0].where).sort()).toEqual(['program_id', 'subject_ref']);
    }
  });

  it('writes 217 DISTINCT subject_refs, not the same one 217 times', async () => {
    // The failure this catches: a key built from something constant would
    // satisfy every assertion above while collapsing 217 people into one row.
    await backfillExplorerEnrollments();
    const refs = createPayloads().map((p) => p.subject_ref);
    expect(refs).toHaveLength(PROFILE_COUNT);
    expect(new Set(refs).size).toBe(PROFILE_COUNT);
  });

  it('treats a unique violation as a lost race, not a failure', async () => {
    const err = Object.assign(new Error('duplicate key'), {
      name: 'SequelizeUniqueConstraintError',
    });
    enrollmentCreate.mockRejectedValue(err);
    const r = await backfillExplorerEnrollments();
    expect(r.enrollments_raced).toBe(PROFILE_COUNT);
    expect(r.failed).toEqual([]);
  });

  it('recognises the raw Postgres code too, not only the Sequelize class', async () => {
    enrollmentCreate.mockRejectedValue(Object.assign(new Error('dup'), { parent: { code: '23505' } }));
    const r = await backfillExplorerEnrollments();
    expect(r.enrollments_raced).toBe(PROFILE_COUNT);
  });

  it('records a genuine error as failed, not as a race', async () => {
    enrollmentCreate.mockRejectedValue(new Error('connection terminated'));
    const r = await backfillExplorerEnrollments();
    expect(r.failed).toHaveLength(PROFILE_COUNT);
    expect(r.enrollments_raced).toBe(0);
  });

  it('one failure does not stop the rest', async () => {
    enrollmentCreate.mockRejectedValueOnce(new Error('one bad row'));
    const r = await backfillExplorerEnrollments();
    expect(r.failed).toHaveLength(1);
    expect(r.enrollments_created).toBe(PROFILE_COUNT - 1);
  });
});

describe('it resolves T212’s programme rather than creating one', () => {
  it('uses the shared slug constant, not a literal', async () => {
    await backfillExplorerEnrollments();
    expect(EXPLORER_PROGRAM.programSlug).toBe(PROGRAM_SLUGS.colaberryTraining);
    expect(programFindOne).toHaveBeenCalledWith({
      where: { brand_id: 'brand-training', slug: PROGRAM_SLUGS.colaberryTraining },
    });
  });

  it('targets colaberry / colaberry-training', async () => {
    await backfillExplorerEnrollments();
    expect(resolveBrand).toHaveBeenCalledWith('colaberry', 'colaberry-training');
  });

  it('REFUSES when the programme is missing, rather than inventing it', async () => {
    // A backfill that creates its own destination cannot tell "the seed has not
    // run" from "the seed ran and I disagreed with it".
    programFindOne.mockResolvedValue(null);
    const r = await backfillExplorerEnrollments();
    expect(r.refused).toBe('program_not_found');
    expect(r.enrollments_created).toBe(0);
    expect(enrollmentCreate).not.toHaveBeenCalled();
    // It does not even read the profiles.
    expect(profileFindAll).not.toHaveBeenCalled();
  });

  it('refuses when the brand is missing', async () => {
    resolveBrand.mockResolvedValue(null);
    const r = await backfillExplorerEnrollments();
    expect(r.refused).toBe('brand_not_found');
    expect(programFindOne).not.toHaveBeenCalled();
  });
});

describe('the rows it writes', () => {
  it('carries tenant and brand from the resolved brand', async () => {
    await backfillExplorerEnrollments();
    for (const p of createPayloads()) {
      expect(p.tenant_id).toBe('tenant-colaberry');
      expect(p.brand_id).toBe('brand-training');
      expect(p.program_id).toBe('program-learner');
    }
  });

  it('leaves path_id null — an Explorer profile names no offer family', async () => {
    // Choosing one would invent an offer for 217 real people, and §4's
    // eligibility gate would then be asked about a path nobody chose.
    await backfillExplorerEnrollments();
    for (const p of createPayloads()) expect(p.path_id).toBeNull();
  });

  it('stamps the source so the backfilled population stays identifiable', async () => {
    await backfillExplorerEnrollments();
    for (const p of createPayloads()) expect(p.source).toBe(BACKFILL_SOURCE);
  });

  it('carries both anchors through, including a null lead', async () => {
    await backfillExplorerEnrollments();
    const payloads = createPayloads();
    // The fixture makes every third profile lead-less.
    expect(payloads.filter((p) => p.lead_id === null).length).toBeGreaterThan(0);
    for (const p of payloads) expect(p.enrollment_id).toBeTruthy();
  });

  it('states status explicitly rather than relying on the column default', async () => {
    await backfillExplorerEnrollments();
    for (const p of createPayloads()) {
      expect(Object.keys(p)).toContain('status');
      expect(p.status).toBe('active');
    }
  });
});

describe('subjectRef — the derived key AD-2 makes necessary', () => {
  it('prefers the enrollment id over the lead id', async () => {
    // Load-bearing: an enrollment id is stable for the life of the enrollment,
    // while the lead a profile resolves to can change as identities merge.
    // Keying on the less stable anchor would give the same person a second
    // participation row after a merge.
    expect(subjectRef({ enrollmentId: 'e-1', leadId: 42 })).toBe('enrollment:e-1');
  });

  it('falls back to the lead id', async () => {
    expect(subjectRef({ leadId: 42 })).toBe('lead:42');
  });

  it('accepts lead id zero rather than treating it as absent', async () => {
    // `0` is falsy. A truthiness check here would silently drop a real lead.
    expect(subjectRef({ leadId: 0 })).toBe('lead:0');
  });

  it('returns null with no anchor, rather than a placeholder', async () => {
    // A placeholder key would collide with every other anchorless row under the
    // unique index — one row for everybody.
    expect(subjectRef({})).toBeNull();
    expect(subjectRef({ enrollmentId: null, leadId: null })).toBeNull();
  });

  it('counts an anchorless profile as skipped rather than dropping it silently', async () => {
    profileFindAll.mockResolvedValue([{ enrollment_id: null, lead_id: null }]);
    const r = await backfillExplorerEnrollments();
    expect(r.skipped_no_anchor).toBe(1);
    expect(r.enrollments_created).toBe(0);
  });
});

describe('reconciliation counts the DESTINATION, not the report', () => {
  it('matches when both sides agree', async () => {
    profileCount.mockResolvedValue(217);
    enrollmentCount.mockResolvedValue(217);
    await expect(reconcileExplorerBackfill()).resolves.toMatchObject({
      profiles: 217,
      enrollments: 217,
      matched: true,
    });
  });

  it('reports a mismatch rather than rounding it away', async () => {
    // The precedent this exists for: a nightly job in this programme reported
    // `succeeded: 152, failed: 0` while 60 learners were invisible to it.
    profileCount.mockResolvedValue(217);
    enrollmentCount.mockResolvedValue(157);
    const r = await reconcileExplorerBackfill();
    expect(r.matched).toBe(false);
    expect(r.enrollments).toBe(157);
  });

  it('counts only the backfilled source on this programme', async () => {
    await reconcileExplorerBackfill();
    expect(enrollmentCount).toHaveBeenCalledWith({
      where: { program_id: 'program-learner', source: BACKFILL_SOURCE },
    });
  });

  it('refuses rather than reporting 0 = 0 as matched when the programme is missing', async () => {
    programFindOne.mockResolvedValue(null);
    const r = await reconcileExplorerBackfill();
    expect(r.refused).toBe('program_not_found');
    expect(r.matched).toBe(false);
  });

  it('flags an empty population as VACUOUS, because 0 = 0 proves nothing', async () => {
    // Not hypothetical. `accelerator_dev1` holds ZERO explorer_journey_profiles
    // — the 217 are in production — so the plan's "run against dev1 first"
    // criterion cannot be satisfied there at all, and a dev1 reconciliation
    // would report matched: true having back-filled nobody.
    profileCount.mockResolvedValue(0);
    enrollmentCount.mockResolvedValue(0);
    const r = await reconcileExplorerBackfill();
    expect(r.matched).toBe(true);
    expect(r.vacuous).toBe(true);
  });

  it('is not vacuous once there is a real population', async () => {
    profileCount.mockResolvedValue(217);
    enrollmentCount.mockResolvedValue(217);
    const r = await reconcileExplorerBackfill();
    expect(r.vacuous).toBe(false);
    expect(r.matched).toBe(true);
  });

  it('marks a refusal vacuous too — it counted nothing', async () => {
    resolveBrand.mockResolvedValue(null);
    const r = await reconcileExplorerBackfill();
    expect(r.vacuous).toBe(true);
    expect(r.matched).toBe(false);
  });
});
