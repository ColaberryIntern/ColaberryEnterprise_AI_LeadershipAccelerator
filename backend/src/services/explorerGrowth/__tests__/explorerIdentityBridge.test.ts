const enrollmentFindByPk = jest.fn();
const enrollmentFindAll = jest.fn();
const leadFindOne = jest.fn();
const profileFindByPk = jest.fn();
const profileCreate = jest.fn();
const profileFindAll = jest.fn();

const sequelizeStub = {
  where: (...a: unknown[]) => ({ __where: a }),
  fn: (...a: unknown[]) => ({ __fn: a }),
  col: (...a: unknown[]) => ({ __col: a }),
};

jest.mock('../../../models', () => ({
  Enrollment: {
    findByPk: (...a: unknown[]) => enrollmentFindByPk(...a),
    findAll: (...a: unknown[]) => enrollmentFindAll(...a),
  },
  Lead: {
    findOne: (...a: unknown[]) => leadFindOne(...a),
    sequelize: sequelizeStub,
  },
  CommunityMember: {},
  ExplorerJourneyProfile: {
    findByPk: (...a: unknown[]) => profileFindByPk(...a),
    create: (...a: unknown[]) => profileCreate(...a),
    findAll: (...a: unknown[]) => profileFindAll(...a),
  },
}));

import {
  normalizeEmail,
  resolveExplorerLead,
  repairAllExplorerBridges,
  findUnbridgedExplorers,
} from '../explorerIdentityBridge';

const ENR_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ENR_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

beforeEach(() => {
  [
    enrollmentFindByPk,
    enrollmentFindAll,
    leadFindOne,
    profileFindByPk,
    profileCreate,
    profileFindAll,
  ].forEach((m) => m.mockReset());
  profileFindByPk.mockResolvedValue(null);
  profileCreate.mockResolvedValue({});
  profileFindAll.mockResolvedValue([]);
});

describe('normalizeEmail', () => {
  it.each([
    [' Ali@X.COM ', 'ali@x.com'],
    ['ALI@x.com', 'ali@x.com'],
    ['ali@x.com', 'ali@x.com'],
  ])('normalises %p to %p', (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
  });

  it('treats null and undefined as empty rather than throwing', () => {
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail(undefined)).toBe('');
  });
});

describe('resolveExplorerLead', () => {
  it('persists the lead_id when an email match exists', async () => {
    enrollmentFindByPk.mockResolvedValue({ id: ENR_A, email: 'Learner@Example.COM' });
    leadFindOne.mockResolvedValue({ id: 9911 });

    const result = await resolveExplorerLead(ENR_A);

    expect(result).toMatchObject({ lead_id: 9911, resolved: true, email_normalized: 'learner@example.com' });
    expect(profileCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        enrollment_id: ENR_A,
        lead_id: 9911,
        email_normalized: 'learner@example.com',
      }),
    );
  });

  it('matches case- and whitespace-insensitively', async () => {
    enrollmentFindByPk.mockResolvedValue({ id: ENR_A, email: '  MiXeD@Case.io  ' });
    leadFindOne.mockResolvedValue({ id: 5 });

    const result = await resolveExplorerLead(ENR_A);

    expect(result.email_normalized).toBe('mixed@case.io');
    // The lookup must be by the NORMALISED value, not the raw column.
    expect(leadFindOne).toHaveBeenCalledTimes(1);
  });

  it('reports unresolved WITHOUT creating a lead when there is no match', async () => {
    // Silently minting CRM rows for people who never entered the funnel would
    // corrupt every downstream conversion metric. Unresolved must stay unresolved.
    enrollmentFindByPk.mockResolvedValue({ id: ENR_A, email: 'nobody@example.com' });
    leadFindOne.mockResolvedValue(null);

    const result = await resolveExplorerLead(ENR_A);

    expect(result).toMatchObject({ lead_id: null, resolved: false });
    expect(profileCreate).toHaveBeenCalledWith(
      expect.objectContaining({ lead_id: null }),
    );
  });

  it('does not throw for an unknown enrollment', async () => {
    enrollmentFindByPk.mockResolvedValue(null);
    await expect(resolveExplorerLead(ENR_A)).resolves.toMatchObject({ resolved: false });
    expect(profileCreate).not.toHaveBeenCalled();
  });

  it('updates an existing profile instead of creating a duplicate', async () => {
    const update = jest.fn().mockResolvedValue({});
    profileFindByPk.mockResolvedValue({ update });
    enrollmentFindByPk.mockResolvedValue({ id: ENR_A, email: 'a@b.co' });
    leadFindOne.mockResolvedValue({ id: 1 });

    await resolveExplorerLead(ENR_A);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ lead_id: 1 }));
    expect(profileCreate).not.toHaveBeenCalled();
  });

  it('writes nothing in dryRun mode', async () => {
    enrollmentFindByPk.mockResolvedValue({ id: ENR_A, email: 'a@b.co' });
    leadFindOne.mockResolvedValue({ id: 1 });

    const result = await resolveExplorerLead(ENR_A, { dryRun: true });

    expect(result.resolved).toBe(true);
    expect(profileCreate).not.toHaveBeenCalled();
    expect(profileFindByPk).not.toHaveBeenCalled();
  });
});

describe('repairAllExplorerBridges — duplicate-email dedupe', () => {
  it('collapses two enrollments sharing an email to one canonical profile', async () => {
    // enrollments.email is NOT unique and duplicates are routine. Without
    // pickBestEnrollment the bridge attaches to whichever row came back first,
    // which is often an empty shadow account.
    enrollmentFindAll.mockResolvedValue([
      {
        id: ENR_A,
        email: 'dupe@example.com',
        enrollment_type: 'explorer',
        payment_status: 'pending',
        created_at: new Date('2026-01-01'),
        communityMember: null,
      },
      {
        id: ENR_B,
        email: 'DUPE@example.com',
        enrollment_type: 'explorer',
        payment_status: 'paid',
        created_at: new Date('2025-01-01'),
        communityMember: null,
      },
    ]);
    enrollmentFindByPk.mockImplementation((id: string) =>
      Promise.resolve({ id, email: 'dupe@example.com' }),
    );
    leadFindOne.mockResolvedValue({ id: 42 });

    const report = await repairAllExplorerBridges();

    expect(report.scanned).toBe(2);
    expect(report.duplicatesSkipped).toBe(1);
    expect(report.resolved).toBe(1);
    // pickBestEnrollment prefers paid over pending, so ENR_B wins despite ENR_A
    // being newer.
    expect(profileCreate).toHaveBeenCalledTimes(1);
    expect(profileCreate).toHaveBeenCalledWith(
      expect.objectContaining({ enrollment_id: ENR_B }),
    );
  });

  it('reports unresolved learners by enrollment id', async () => {
    enrollmentFindAll.mockResolvedValue([
      {
        id: ENR_A,
        email: 'ghost@example.com',
        enrollment_type: 'explorer',
        payment_status: 'pending',
        created_at: new Date(),
        communityMember: null,
      },
    ]);
    enrollmentFindByPk.mockResolvedValue({ id: ENR_A, email: 'ghost@example.com' });
    leadFindOne.mockResolvedValue(null);

    const report = await repairAllExplorerBridges();

    expect(report.unresolved).toBe(1);
    expect(report.unresolvedEnrollmentIds).toEqual([ENR_A]);
  });

  it('writes nothing when dryRun is set', async () => {
    enrollmentFindAll.mockResolvedValue([
      {
        id: ENR_A,
        email: 'a@b.co',
        enrollment_type: 'explorer',
        payment_status: 'pending',
        created_at: new Date(),
        communityMember: null,
      },
    ]);
    enrollmentFindByPk.mockResolvedValue({ id: ENR_A, email: 'a@b.co' });
    leadFindOne.mockResolvedValue({ id: 3 });

    const report = await repairAllExplorerBridges({ dryRun: true });

    expect(report.dryRun).toBe(true);
    expect(report.resolved).toBe(1);
    expect(profileCreate).not.toHaveBeenCalled();
  });
});

describe('repairAllExplorerBridges — PII in logs', () => {
  // Flagged by the plan auditor: this function iterates 154 learner emails and
  // reports the ones that fail. The natural implementation logs raw addresses,
  // and piiLogCoverage.test.ts is a per-file minimum-count check over 24
  // pre-existing files, so it would not have caught a brand-new service.
  it('never emits a raw email address in its log line', async () => {
    enrollmentFindAll.mockResolvedValue([
      {
        id: ENR_A,
        email: 'sensitive.person@realdomain.com',
        enrollment_type: 'explorer',
        payment_status: 'pending',
        created_at: new Date(),
        communityMember: null,
      },
    ]);
    enrollmentFindByPk.mockResolvedValue({ id: ENR_A, email: 'sensitive.person@realdomain.com' });
    leadFindOne.mockResolvedValue(null);

    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await repairAllExplorerBridges();

    const emitted = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(emitted).not.toContain('sensitive.person@realdomain.com');
    // The enrollment id IS safe to log and is what an operator acts on.
    expect(emitted).toContain(ENR_A);
    log.mockRestore();
  });
});

describe('findUnbridgedExplorers', () => {
  it('returns the enrollment ids whose lead_id is still null', async () => {
    profileFindAll.mockResolvedValue([{ enrollment_id: ENR_A }, { enrollment_id: ENR_B }]);
    await expect(findUnbridgedExplorers()).resolves.toEqual([ENR_A, ENR_B]);
  });

  it('returns an empty array when every learner is bridged', async () => {
    profileFindAll.mockResolvedValue([]);
    await expect(findUnbridgedExplorers()).resolves.toEqual([]);
  });
});
