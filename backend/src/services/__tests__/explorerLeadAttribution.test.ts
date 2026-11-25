/**
 * `createExplorerEnrollment` must write `source_id` onto the Lead it captures.
 *
 * THE DEFECT. This path never resolved one. Measured on production 2026-11-25
 * over the preceding 25 days: 352 leads captured here, 0 with a `source_id`,
 * against 146 of 146 on the `free_signup` path. Because `Lead` has no brand
 * column and origin brand is derived only through
 * `Lead.source_id -> LeadSource.brand_id`, every one of those leads belonged to
 * no brand - which blinded brand reporting and emptied the landing-page snack
 * bar that selects leads by brand.
 *
 * These tests go through the REAL `explorerSourceAttribution` helper and mock
 * only the tenancy resolver, so they prove the whole chain the production bug
 * broke: door slug -> resolver -> the column on the row. A test that mocked the
 * helper would assert the plumbing it is supposed to be checking.
 */

jest.spyOn(console, 'error').mockImplementation(() => undefined);
jest.spyOn(console, 'log').mockImplementation(() => undefined);
jest.spyOn(console, 'warn').mockImplementation(() => undefined);

jest.mock('../../config/env', () => ({
  env: {
    frontendUrl: 'https://enterprise.colaberry.ai',
    trainingWelcomeTokenTtlDays: 30,
    trainingWelcomeFromEmail: 'ali@colaberry.com',
  },
}));

jest.mock('../../models', () => ({
  __esModule: true,
  Enrollment: { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn() },
  Cohort: { increment: jest.fn() },
  Lead: { findOne: jest.fn(), findOrCreate: jest.fn() },
  Campaign: { findOne: jest.fn() },
}));

const mockGetOrCreateExplorerCohort = jest.fn();
jest.mock('../cohortService', () => ({
  getOrCreateExplorerCohort: (...a: unknown[]) => mockGetOrCreateExplorerCohort(...a),
}));

jest.mock('../emailService', () => ({ sendTrainingWelcome: jest.fn() }));
jest.mock('../cohortSeatCounter', () => ({ recountCohortSeats: jest.fn() }));
jest.mock('../communicationLogService', () => ({ logCommunication: jest.fn() }));

const resolveContextBySourceSlug = jest.fn();
jest.mock('../../modules/tenancy/tenantResolver', () => ({
  resolveContextBySourceSlug: (...a: unknown[]) => resolveContextBySourceSlug(...a),
}));

import { Enrollment, Lead } from '../../models';
import { createExplorerEnrollment } from '../enrollmentService';
import { OPEN_HOUSE_DOOR_SOURCE_SLUG } from '../leads/doorSlugs';

const enrFindOne = Enrollment.findOne as jest.Mock;
const enrFindAll = Enrollment.findAll as jest.Mock;
const enrCreate = Enrollment.create as jest.Mock;
const leadFindOrCreate = Lead.findOrCreate as jest.Mock;

/** The real `lead_sources` row for the training door, as production holds it. */
const TRAINING_SOURCE_ID = '03e1d02e-5f36-4361-8a0e-3423a210501f';

const CONTEXT = {
  tenantId: 'tenant-1',
  tenantSlug: 'colaberry',
  brandId: '10ebfb01-dc51-450d-bbef-a2c10e42efa8',
  brandSlug: 'colaberry-training',
  sourceId: TRAINING_SOURCE_ID,
};

/** The `defaults` object handed to `Lead.findOrCreate` - the row as it would be written. */
function leadDefaults(): Record<string, unknown> {
  expect(leadFindOrCreate).toHaveBeenCalled();
  return leadFindOrCreate.mock.calls[0][0].defaults as Record<string, unknown>;
}

beforeEach(() => {
  jest.clearAllMocks();
  enrFindOne.mockResolvedValue(null);
  enrFindAll.mockResolvedValue([]);
  mockGetOrCreateExplorerCohort.mockResolvedValue({ id: 'explorer-cohort-1' });
  enrCreate.mockResolvedValue({ id: 'enr-1', full_name: 'Guest', email: 'guest@example.com', cohort_id: 'explorer-cohort-1' });
  leadFindOrCreate.mockResolvedValue([{ id: 42 }]);
  resolveContextBySourceSlug.mockResolvedValue(CONTEXT);
});

describe('the lead is attributable to a brand', () => {
  it('persists the source_id resolved from the door slug', async () => {
    await createExplorerEnrollment({
      name: 'Guest',
      email: 'guest@example.com',
      sourceSlug: OPEN_HOUSE_DOOR_SOURCE_SLUG,
    });

    expect(resolveContextBySourceSlug).toHaveBeenCalledWith('training');
    expect(leadDefaults().source_id).toBe(TRAINING_SOURCE_ID);
  });

  it('still records the ad channel separately, so the brand does not overwrite the source of the click', async () => {
    await createExplorerEnrollment({
      name: 'Guest',
      email: 'guest@example.com',
      sourceSlug: OPEN_HOUSE_DOOR_SOURCE_SLUG,
      utm_source: 'ig',
      utm_medium: 'paid',
      page_url: 'https://www.refactored.ai/open-house?utm_source=ig',
    });

    const row = leadDefaults();
    expect(row.source_id).toBe(TRAINING_SOURCE_ID);
    expect(row.utm_source).toBe('ig');
    expect(row.utm_medium).toBe('paid');
  });

  it('REGRESSION: the brand comes from the door, not from the hostname in page_url', async () => {
    // refactored.ai resolves to brand `refactored` through `lead_sources.domain`,
    // but this class is Colaberry Training's. Deriving the brand from the host
    // would have misattributed 221 production leads to a brand that never ran it.
    await createExplorerEnrollment({
      name: 'Guest',
      email: 'guest@example.com',
      sourceSlug: OPEN_HOUSE_DOOR_SOURCE_SLUG,
      page_url: 'https://www.refactored.ai/open-house',
    });

    expect(resolveContextBySourceSlug).toHaveBeenCalledWith('training');
    expect(resolveContextBySourceSlug).not.toHaveBeenCalledWith(expect.stringContaining('refactored'));
    expect(leadDefaults().source_id).toBe(TRAINING_SOURCE_ID);
  });
});

describe('an honest NULL, never an invented brand', () => {
  it('writes NULL when no door slug is supplied, and does not consult the resolver', async () => {
    await createExplorerEnrollment({ name: 'Guest', email: 'guest@example.com' });

    expect(resolveContextBySourceSlug).not.toHaveBeenCalled();
    expect(leadDefaults().source_id).toBeNull();
  });

  it('writes NULL when the catalog cannot resolve the slug', async () => {
    resolveContextBySourceSlug.mockResolvedValue(null);

    await createExplorerEnrollment({
      name: 'Guest',
      email: 'guest@example.com',
      sourceSlug: 'a-door-nobody-registered',
    });

    expect(leadDefaults().source_id).toBeNull();
  });

  it('still creates the account when the resolver throws', async () => {
    resolveContextBySourceSlug.mockRejectedValue(new Error('resolver down'));

    const result = await createExplorerEnrollment({
      name: 'Guest',
      email: 'guest@example.com',
      sourceSlug: OPEN_HOUSE_DOOR_SOURCE_SLUG,
    });

    // The person gets their account. Attribution is best-effort; the signup is not.
    expect(result.created).toBe(true);
    expect(leadDefaults().source_id).toBeNull();
  });

  it('CONTROL: the same call DOES attribute when the resolver answers', async () => {
    // Without this, every assertion above would pass on a build where
    // `source_id` was hard-wired to null.
    await createExplorerEnrollment({
      name: 'Guest',
      email: 'guest@example.com',
      sourceSlug: OPEN_HOUSE_DOOR_SOURCE_SLUG,
    });

    expect(leadDefaults().source_id).toBe(TRAINING_SOURCE_ID);
  });
});

describe('idempotency', () => {
  it('does not rewrite the attribution of a lead that already exists', async () => {
    // `source_id` rides in `defaults`, so a returning person keeps their
    // first-touch brand. Sequelize only applies `defaults` on insert.
    await createExplorerEnrollment({
      name: 'Guest',
      email: 'guest@example.com',
      sourceSlug: OPEN_HOUSE_DOOR_SOURCE_SLUG,
    });

    const call = leadFindOrCreate.mock.calls[0][0];
    expect(call.where).toEqual({ email: 'guest@example.com' });
    expect(Object.keys(call)).not.toContain('update');
    expect(call.defaults.source_id).toBe(TRAINING_SOURCE_ID);
  });
});
