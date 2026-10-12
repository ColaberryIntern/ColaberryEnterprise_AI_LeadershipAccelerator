/**
 * Phase 2 T202b, row 12 of `docs/growth-os-reset/FREE_ACCOUNT_CONSUMERS.md`.
 *
 * `listEnrollments` labels the admin feed-control picker, and the label is keyed
 * on `enrollment_type`. When T202b gives portal free accounts `'explorer'`, every
 * one of them gains a ` · Free` suffix in that picker — an operator-visible change
 * on existing accounts.
 *
 * It was untested. An earlier version of T202b's coverage note said this line sat
 * "inside a large un-exported function" with "no suite in the repository": both
 * false. It is inside the exported `listEnrollments` (`feedControlService.ts:331`)
 * and the module has three other suites. They mock `settingsService` only, not the
 * model this function reads, which is why this is a separate file rather than an
 * addition to one of them.
 */
jest.mock('../../settingsService', () => ({ getSetting: jest.fn(), setSetting: jest.fn() }));

/**
 * SPIED, not module-mocked, and the two failures that forced it are worth
 * recording because both looked like the test's fault and were really the import
 * graph's shape:
 *
 *  1. Mocking `config/database` made `sequelize` undefined, and every model in the
 *     chain calls `.init()` on it at module load — the suite died with "Cannot
 *     read properties of undefined (reading 'define')" before a test ran, three
 *     levels deep via `feedControlService` → `capeLearningValueRanker` →
 *     `capeLearnerStateService` → `OnboardingProfile`.
 *  2. Module-mocking `models/Enrollment` replaced it with a plain object, and
 *     `models/index.ts:545` then threw "Cohort.hasMany called with something
 *     that's not a subclass of Sequelize.Model" while wiring associations.
 *
 * So the real model is imported and `findAll` is spied. Nothing connects, because
 * the only query this function makes is the one being stubbed.
 */
import Enrollment from '../../../models/Enrollment';
import { listEnrollments } from '../feedControlService';

const mockFindAll = jest.spyOn(Enrollment, 'findAll');

const row = (over: Record<string, unknown> = {}) => ({
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  full_name: 'Ada Lovelace',
  email: 'ada@example.com',
  cohort_id: null,
  enrollment_type: 'standard',
  status: 'active',
  created_at: new Date('2026-01-01'),
  ...over,
});

describe('listEnrollments — the free-account label (T202b row 12)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('today: a portal free account is standard, so it carries NO Free marker', async () => {
    mockFindAll.mockResolvedValue([row({ enrollment_type: 'standard' })]);

    const [opt] = await listEnrollments();

    expect(opt.label).toBe('Ada Lovelace');
  });

  it('after T202b: the same account is explorer and the picker marks it Free', async () => {
    mockFindAll.mockResolvedValue([row({ enrollment_type: 'explorer' })]);

    const [opt] = await listEnrollments();

    expect(opt.label).toBe('Ada Lovelace · Free');
  });

  it('a withdrawn Explorer carries both markers, in that order', async () => {
    mockFindAll.mockResolvedValue([row({ enrollment_type: 'explorer', status: 'withdrawn' })]);

    const [opt] = await listEnrollments();

    expect(opt.label).toBe('Ada Lovelace · Free · withdrawn');
  });

  it('reports the programme as the option type, so the caller can filter on it', async () => {
    mockFindAll.mockResolvedValue([row({ enrollment_type: 'explorer' })]);

    const [opt] = await listEnrollments();

    expect(opt.type).toBe('explorer');
  });

  it('falls back to the email, then to a short id, when there is no name', async () => {
    mockFindAll.mockResolvedValue([
      row({ full_name: null, enrollment_type: 'explorer' }),
      row({ full_name: null, email: null, enrollment_type: 'explorer' }),
    ]);

    const [byEmail, byId] = await listEnrollments();

    expect(byEmail.label).toBe('ada@example.com · Free');
    expect(byId.label).toBe('aaaaaaaa · Free');
  });
});
