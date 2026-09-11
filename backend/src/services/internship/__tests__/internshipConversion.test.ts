/**
 * Existing-intern conversion.
 *
 * The one requirement worth writing a whole suite around: "Existing-intern dry-run
 * causes no writes or messages." Everything else here is about not creating
 * duplicates and not silently picking the wrong account.
 */

// Every model the service touches is mocked so a plan can be driven through
// branches without a database — and so the write mutators can be ASSERTED unused.
const mockEnrollment = { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), update: jest.fn() };
const mockApplication = { findOne: jest.fn(), findOrCreate: jest.fn(), create: jest.fn(), update: jest.fn() };
const mockMembership = { findOne: jest.fn(), findOrCreate: jest.fn(), create: jest.fn(), update: jest.fn() };
const mockDocument = { findOrCreate: jest.fn(), create: jest.fn(), update: jest.fn() };
const mockAck = { findOrCreate: jest.fn(), create: jest.fn(), update: jest.fn() };
const mockEvent = { create: jest.fn() };
const mockProject = { count: jest.fn() };
const mockAttendance = { count: jest.fn() };
const mockCert = { count: jest.fn() };

jest.mock('../../../models/Enrollment', () => ({ __esModule: true, default: mockEnrollment }));
jest.mock('../../../models/InternshipApplication', () => ({ __esModule: true, default: mockApplication }));
jest.mock('../../../models/CohortMembership', () => ({ __esModule: true, default: mockMembership }));
jest.mock('../../../models/InternshipDocument', () => ({ __esModule: true, default: mockDocument }));
jest.mock('../../../models/InternshipRequirementAcknowledgement', () => ({ __esModule: true, default: mockAck }));
jest.mock('../../../models/InternshipStatusEvent', () => ({ __esModule: true, default: mockEvent }));
jest.mock('../../../models/Project', () => ({ __esModule: true, default: mockProject }));
jest.mock('../../../models/AttendanceRecord', () => ({ __esModule: true, default: mockAttendance }));
jest.mock('../../../models/CertReadinessSnapshot', () => ({ __esModule: true, default: mockCert }));

const mockFindCohort = jest.fn();
const mockEnsureCohort = jest.fn();
jest.mock('../internshipCohortService', () => ({
  ...jest.requireActual('../internshipCohortService'),
  findInternshipCohort: (...a: unknown[]) => mockFindCohort(...a),
  ensureInternshipCohort: (...a: unknown[]) => mockEnsureCohort(...a),
}));

const mockEmit = jest.fn().mockResolvedValue({ written: true });
jest.mock('../internshipAnalytics', () => ({
  ...jest.requireActual('../internshipAnalytics'),
  emitInternshipEvent: (...a: unknown[]) => mockEmit(...a),
}));

import { commitConversion, planConversion } from '../internshipConversionService';

const COHORT = { id: 'cohort-1' };

/** Every function that could write. Used to prove a dry run touches none of them. */
const ALL_WRITERS = [
  mockEnrollment.create, mockEnrollment.update,
  mockApplication.findOrCreate, mockApplication.create, mockApplication.update,
  mockMembership.findOrCreate, mockMembership.create, mockMembership.update,
  mockDocument.findOrCreate, mockDocument.create, mockDocument.update,
  mockAck.findOrCreate, mockAck.create, mockAck.update,
  mockEvent.create,
];

beforeEach(() => {
  jest.clearAllMocks();
  mockFindCohort.mockResolvedValue(COHORT);
  mockEnsureCohort.mockResolvedValue({ cohort: COHORT, created: false });
  mockEnrollment.findByPk.mockResolvedValue({ enrolled_at: '2026-03-02', created_at: '2026-03-01' });
  mockProject.count.mockResolvedValue(2);
  mockAttendance.count.mockResolvedValue(11);
  mockCert.count.mockResolvedValue(1);
  mockApplication.findOne.mockResolvedValue(null);
  mockMembership.findOne.mockResolvedValue(null);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

const oneMatch = (id = 'enr-1') =>
  mockEnrollment.findAll.mockResolvedValue([{ id, full_name: 'Ada Lovelace', created_at: '2026-03-01' }]);

describe('the dry run writes nothing', () => {
  it('touches no write mutator on any model, for any outcome', async () => {
    // Drive several branches through one plan: matched, unmatched, ambiguous.
    mockEnrollment.findAll
      .mockResolvedValueOnce([{ id: 'enr-1', full_name: 'Ada', created_at: '2026-03-01' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'enr-2', full_name: 'Grace', created_at: '2026-01-01' },
        { id: 'enr-3', full_name: 'Grace', created_at: '2026-02-01' },
      ]);

    await planConversion({
      interns: [
        { email: 'ada@example.com', interview_grandfathered: true, documents_already_verified: true },
        { email: 'nobody@example.com' },
        { email: 'grace@example.com' },
      ],
    });

    for (const writer of ALL_WRITERS) expect(writer).not.toHaveBeenCalled();
  });

  it('sends no message', async () => {
    oneMatch();
    await planConversion({ interns: [{ email: 'ada@example.com' }] });
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('does not even create the cohort', async () => {
    // Creating it would be a write. The plan REPORTS whether it exists instead.
    mockFindCohort.mockResolvedValue(null);
    oneMatch();
    const plan = await planConversion({ interns: [{ email: 'ada@example.com' }] });
    expect(mockEnsureCohort).not.toHaveBeenCalled();
    expect(plan.cohort_exists).toBe(false);
  });

  it('marks itself as a dry run in its own output', async () => {
    oneMatch();
    const plan = await planConversion({ interns: [{ email: 'ada@example.com' }] });
    expect(plan.dry_run).toBe(true);
  });
});

describe('matching never guesses', () => {
  it('reports no_match rather than creating a student', async () => {
    mockEnrollment.findAll.mockResolvedValue([]);
    const plan = await planConversion({ interns: [{ email: 'nobody@example.com' }] });
    expect(plan.rows[0].outcome).toBe('no_match');
    expect(plan.rows[0].blocked_reason).toMatch(/No active enrollment/i);
    expect(mockEnrollment.create).not.toHaveBeenCalled();
  });

  it('refuses an ambiguous match and lists every candidate', async () => {
    // Two active enrollments on one email is exactly what pickBestEnrollment
    // exists for; choosing here would silently attach the internship to the wrong
    // account.
    mockEnrollment.findAll.mockResolvedValue([
      { id: 'enr-2', full_name: 'Grace', created_at: '2026-01-01' },
      { id: 'enr-3', full_name: 'Grace', created_at: '2026-02-01' },
    ]);
    const plan = await planConversion({ interns: [{ email: 'grace@example.com' }] });
    expect(plan.rows[0].outcome).toBe('ambiguous_match');
    expect(plan.rows[0].candidate_enrollment_ids).toEqual(['enr-2', 'enr-3']);
    expect(plan.rows[0].enrollment_id).toBeNull();
  });

  it('rejects a malformed email without querying', async () => {
    const plan = await planConversion({ interns: [{ email: 'not-an-email' }] });
    expect(plan.rows[0].outcome).toBe('no_match');
    expect(mockEnrollment.findAll).not.toHaveBeenCalled();
  });

  it('normalises the email before matching', async () => {
    oneMatch();
    await planConversion({ interns: [{ email: '  Ada@Example.COM ' }] });
    expect(mockEnrollment.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ email: 'ada@example.com' }) }),
    );
  });
});

describe('what the plan promises', () => {
  it('always requires the tool acknowledgement, even when grandfathered', async () => {
    // The contract: "Require EVERY converted intern to acknowledge the Claude Code
    // account and personal API-key requirement." A grandfathered interview cannot
    // carry it — the requirement postdates those interviews.
    oneMatch();
    const plan = await planConversion({
      interns: [{
        email: 'ada@example.com',
        interview_grandfathered: true,
        documents_already_verified: true,
      }],
    });
    expect(plan.rows[0].requirements!.tool_acknowledgement).toBe('required');
    expect(plan.rows[0].actions.join(' ')).toMatch(/Claude Code and API-key acknowledgement/i);
  });

  it('reflects the administrator\'s certifications rather than inferring them', async () => {
    oneMatch();
    const bare = await planConversion({ interns: [{ email: 'ada@example.com' }] });
    expect(bare.rows[0].requirements!.interview).toBe('required');
    expect(bare.rows[0].requirements!.documents).toBe('new_offer_letter_required');

    oneMatch();
    const certified = await planConversion({
      interns: [{ email: 'ada@example.com', interview_grandfathered: true, documents_already_verified: true }],
    });
    expect(certified.rows[0].requirements!.interview).toBe('grandfathered');
    expect(certified.rows[0].requirements!.documents).toBe('already_verified');
  });

  it('refuses to add to the cohort when documents are not verified', async () => {
    oneMatch();
    const plan = await planConversion({
      interns: [{ email: 'ada@example.com', interview_grandfathered: true }],
    });
    expect(plan.rows[0].actions.join(' ')).toMatch(/Do NOT add them to the cohort yet/i);
  });

  it('counts what it promises to preserve', async () => {
    oneMatch();
    const plan = await planConversion({ interns: [{ email: 'ada@example.com' }] });
    expect(plan.rows[0].preserved).toEqual({
      started_on: '2026-03-02',
      projects: 2,
      attendance_records: 11,
      certification_snapshots: 1,
    });
  });

  it('summarises the whole roster', async () => {
    mockEnrollment.findAll
      .mockResolvedValueOnce([{ id: 'enr-1', full_name: 'Ada', created_at: '2026-03-01' }])
      .mockResolvedValueOnce([]);
    const plan = await planConversion({
      interns: [{ email: 'ada@example.com' }, { email: 'nobody@example.com' }],
    });
    expect(plan.summary.will_convert).toBe(1);
    expect(plan.summary.no_match).toBe(1);
  });
});

describe('commit', () => {
  const planFor = async (intern: Record<string, unknown>) => {
    oneMatch();
    return planConversion({ interns: [intern as any] });
  };

  beforeEach(() => {
    mockApplication.findOrCreate.mockResolvedValue([
      { id: 'app-1', state: 'documents_verified', cohort_id: 'cohort-1', update: jest.fn(), reload: jest.fn() },
      true,
    ]);
    mockMembership.findOrCreate.mockResolvedValue([{ id: 'mem-1' }, true]);
    mockDocument.findOrCreate.mockResolvedValue([{ id: 'doc-1' }, true]);
    mockAck.findOrCreate.mockResolvedValue([{ id: 'ack-1' }, true]);
  });

  it('converts a matched intern and adds them to the cohort when documents are verified', async () => {
    const plan = await planFor({
      email: 'ada@example.com', interview_grandfathered: true, documents_already_verified: true,
    });
    const report = await commitConversion({ plan, actorId: 'dhee@colaberry.com' });

    expect(report.dry_run).toBe(false);
    expect(report.rows[0].ok).toBe(true);
    expect(report.rows[0].added_to_cohort).toBe(true);
    expect(report.summary.converted).toBe(1);
  });

  it('does NOT add to the cohort when documents were not verified', async () => {
    const plan = await planFor({ email: 'ada@example.com', interview_grandfathered: true });
    await commitConversion({ plan, actorId: 'dhee@colaberry.com' });
    expect(mockMembership.findOrCreate).not.toHaveBeenCalled();
  });

  it('always records the credential acknowledgement', async () => {
    const plan = await planFor({ email: 'ada@example.com' });
    await commitConversion({ plan, actorId: 'dhee@colaberry.com' });
    expect(mockAck.findOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ requirement_key: 'never_share_credentials' }),
      }),
    );
  });

  it('reports an unmatched row as failed without throwing', async () => {
    mockEnrollment.findAll.mockResolvedValue([]);
    const plan = await planConversion({ interns: [{ email: 'nobody@example.com' }] });
    const report = await commitConversion({ plan, actorId: 'dhee@colaberry.com' });
    expect(report.rows[0].ok).toBe(false);
    expect(report.summary.failed).toBe(1);
  });

  it('records a per-row failure rather than aborting the batch', async () => {
    // One bad intern must not stop the other thirty-nine.
    mockEnrollment.findAll
      .mockResolvedValueOnce([{ id: 'enr-1', full_name: 'Ada', created_at: '2026-03-01' }])
      .mockResolvedValueOnce([{ id: 'enr-2', full_name: 'Grace', created_at: '2026-03-01' }]);
    const plan = await planConversion({
      interns: [{ email: 'ada@example.com' }, { email: 'grace@example.com' }],
    });

    mockApplication.findOrCreate
      .mockRejectedValueOnce(new Error('deadlock'))
      .mockResolvedValueOnce([
        { id: 'app-2', state: 'started', cohort_id: 'cohort-1', update: jest.fn(), reload: jest.fn() },
        true,
      ]);

    const report = await commitConversion({ plan, actorId: 'dhee@colaberry.com' });
    expect(report.rows).toHaveLength(2);
    expect(report.rows[0].ok).toBe(false);
    expect(report.rows[0].error).toMatch(/deadlock/);
    expect(report.rows[1].ok).toBe(true);
  });

  it('skips someone already converted instead of doing it twice', async () => {
    oneMatch();
    mockApplication.findOne.mockResolvedValue({ id: 'app-9', state: 'active' });
    mockMembership.findOne.mockResolvedValue({ id: 'mem-9' });

    const plan = await planConversion({ interns: [{ email: 'ada@example.com' }] });
    expect(plan.rows[0].outcome).toBe('already_converted');

    const report = await commitConversion({ plan, actorId: 'dhee@colaberry.com' });
    expect(report.rows[0].skipped_already_converted).toBe(true);
    expect(report.summary.skipped).toBe(1);
    expect(mockApplication.findOrCreate).not.toHaveBeenCalled();
  });
});
