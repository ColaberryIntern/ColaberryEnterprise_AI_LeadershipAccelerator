jest.mock('../../config/database', () => ({
  sequelize: { transaction: jest.fn((cb: any) => cb({})), authenticate: jest.fn() },
}));
jest.mock('../../models', () => ({
  Organization: { findOne: jest.fn() },
  OrgMember: {
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    findOrCreate: jest.fn(),
    findByPk: jest.fn(),
  },
}));
jest.mock('../../services/freeSignupService', () => ({ createFreeAccount: jest.fn() }));
jest.mock('fs');

import fs from 'fs';
import { Op } from 'sequelize';
import { Organization, OrgMember } from '../../models';
import { createFreeAccount } from '../../services/freeSignupService';
import {
  parseArgs,
  runPlan,
  runCommit,
  runRevert,
  computeDiff,
  DEPARTMENT_ASSIGNMENTS,
  FARHAT_EMAIL,
  FARHAT_TEAM,
} from '../assignOrgDepartments20260819';

const mockOrgFindOne = Organization.findOne as unknown as jest.Mock;
const mockMemberFindAll = OrgMember.findAll as unknown as jest.Mock;
const mockMemberFindOne = OrgMember.findOne as unknown as jest.Mock;
const mockMemberUpdate = OrgMember.update as unknown as jest.Mock;
const mockMemberFindOrCreate = OrgMember.findOrCreate as unknown as jest.Mock;
const mockMemberFindByPk = OrgMember.findByPk as unknown as jest.Mock;
const mockCreateFreeAccount = createFreeAccount as unknown as jest.Mock;
const mockWriteFileSync = fs.writeFileSync as unknown as jest.Mock;
const mockReadFileSync = fs.readFileSync as unknown as jest.Mock;

const ORG = { id: 'org-colaberry' };

/** Extracts the target email string a `findAll`/`findOne` call was scoped
 * to, from the real `{ [Op.iLike]: email }` where-clause the script builds —
 * lets these tests assert on the actual email being queried rather than
 * guessing at the mock call shape. */
function emailFromWhere(where: any): string {
  return String(where?.email?.[Op.iLike] ?? '').toLowerCase();
}

function memberRow(overrides: Record<string, any> = {}) {
  return {
    id: 'member-1',
    email: 'someone@colaberry.com',
    team: null,
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOrgFindOne.mockResolvedValue(ORG);
  mockMemberFindAll.mockResolvedValue([]);
  mockMemberFindOne.mockResolvedValue(null); // Farhat doesn't exist by default
  // Safe defaults for the Farhat-creation path so tests that don't care about
  // it (e.g. the "everyone unresolved" boundary case, which still exercises
  // computeDiff's Farhat branch since her row is null by default above)
  // don't crash on an unconfigured mock — real behavior, just not the focus
  // of that particular test.
  mockCreateFreeAccount.mockResolvedValue({ enrollment: { id: 'default-farhat-enrollment-id' } });
  mockMemberFindOrCreate.mockResolvedValue([memberRow({ id: 'default-farhat-member-id', email: FARHAT_EMAIL, team: FARHAT_TEAM }), true]);
});

describe('parseArgs', () => {
  it('defaults to plan mode', () => {
    expect(parseArgs([]).mode).toBe('plan');
  });

  it('--commit switches to commit mode', () => {
    expect(parseArgs(['--commit']).mode).toBe('commit');
  });

  it('--revert requires --undo-log', () => {
    expect(() => parseArgs(['--revert'])).toThrow(/requires --undo-log/);
  });

  it('--commit and --revert are mutually exclusive', () => {
    expect(() => parseArgs(['--commit', '--revert', '--undo-log', 'x.json'])).toThrow(/mutually exclusive/);
  });
});

describe('computeDiff', () => {
  it('reports every named target as unresolved when no org_members row exists for it', async () => {
    mockMemberFindAll.mockResolvedValue([]);

    const { rows, unresolved } = await computeDiff(ORG.id);

    expect(unresolved).toHaveLength(DEPARTMENT_ASSIGNMENTS.length);
    // Farhat is the one intentional create, not "unresolved".
    expect(rows.filter((r) => r.action === 'created')).toHaveLength(1);
  });

  it('an already-correct row produces no change (not in rows[], not in unresolved[])', async () => {
    mockMemberFindAll.mockImplementation(async ({ where }: any) => {
      if (emailFromWhere(where) === 'ali@colaberry.com') {
        return [memberRow({ id: 'ali-id', email: 'ali@colaberry.com', team: 'Exec' })];
      }
      return [];
    });

    const { rows, unresolved } = await computeDiff(ORG.id);
    const aliRow = rows.find((r) => 'email' in r && r.email === 'ali@colaberry.com');
    expect(aliRow).toBeUndefined();
    expect(unresolved.find((u) => u.email === 'ali@colaberry.com')).toBeUndefined();
  });

  it('william@colaberry.com resolves to BOTH real duplicate rows (case-insensitive match)', async () => {
    mockMemberFindAll.mockImplementation(async ({ where }: any) => {
      if (emailFromWhere(where) === 'william@colaberry.com') {
        return [
          memberRow({ id: 'william-1', email: 'william@colaberry.com', team: 'Staff' }),
          memberRow({ id: 'william-2', email: 'William@colaberry.com', team: null }),
        ];
      }
      return [];
    });

    const { rows } = await computeDiff(ORG.id);
    const williamRows = rows.filter((r) => 'org_member_id' in r && (r.org_member_id === 'william-1' || r.org_member_id === 'william-2'));
    expect(williamRows).toHaveLength(2);
    expect(williamRows.every((r) => (r as any).new_team === 'Sales')).toBe(true);
  });

  it('Farhat: reported as a create when no row exists yet', async () => {
    mockMemberFindOne.mockResolvedValue(null);

    const { rows } = await computeDiff(ORG.id);
    const farhatRow = rows.find((r) => r.email === FARHAT_EMAIL);
    expect(farhatRow).toEqual(expect.objectContaining({ action: 'created', new_team: FARHAT_TEAM }));
  });

  it('Farhat: reported as an update (not a duplicate create) when her row already exists with the wrong team', async () => {
    mockMemberFindOne.mockResolvedValue(memberRow({ id: 'farhat-id', email: FARHAT_EMAIL, team: 'Marketing' }));

    const { rows } = await computeDiff(ORG.id);
    const farhatRow = rows.find((r) => r.email === FARHAT_EMAIL);
    expect(farhatRow).toEqual(expect.objectContaining({ action: 'updated', previous_team: 'Marketing', new_team: FARHAT_TEAM }));
  });
});

describe('runPlan', () => {
  it('makes ZERO DB writes', async () => {
    mockMemberFindAll.mockResolvedValue([memberRow({ team: null })]);

    await runPlan('/tmp', 'test-session');

    expect(mockMemberUpdate).not.toHaveBeenCalled();
    expect(mockMemberFindOrCreate).not.toHaveBeenCalled();
    expect(mockCreateFreeAccount).not.toHaveBeenCalled();
  });

  it('writes the undo log and report to disk', async () => {
    await runPlan('/tmp', 'test-session');

    expect(mockWriteFileSync).toHaveBeenCalledTimes(2); // undo log + markdown report
    const [, undoLogJson] = mockWriteFileSync.mock.calls[0];
    const undoLog = JSON.parse(undoLogJson);
    expect(undoLog.session_id).toBe('test-session');
  });

  it('failure path: throws a clear error (never a silent no-op) when the "Colaberry" Organization row itself is missing', async () => {
    mockOrgFindOne.mockResolvedValue(null);

    await expect(runPlan('/tmp', 'test-session')).rejects.toThrow(/No Organization row named "Colaberry"/);
    expect(mockMemberFindAll).not.toHaveBeenCalled();
  });
});

describe('runCommit', () => {
  it('writes the undo log to disk BEFORE any DB write (ordering)', async () => {
    mockMemberFindAll.mockImplementation(async ({ where }: any) => {
      if (emailFromWhere(where) === 'ali@colaberry.com') return [memberRow({ id: 'ali-id', email: 'ali@colaberry.com', team: null })];
      return [];
    });

    const writeOrder: string[] = [];
    mockWriteFileSync.mockImplementation(() => writeOrder.push('undo-log-written'));
    mockMemberUpdate.mockImplementation(async () => writeOrder.push('db-updated'));

    await runCommit('/tmp', 'test-session');

    expect(writeOrder[0]).toBe('undo-log-written');
    expect(writeOrder.indexOf('db-updated')).toBeGreaterThan(writeOrder.indexOf('undo-log-written'));
  });

  it('happy path: updates a row whose team is wrong via OrgMember.update, scoped by id', async () => {
    mockMemberFindAll.mockImplementation(async ({ where }: any) => {
      if (emailFromWhere(where) === 'ali@colaberry.com') return [memberRow({ id: 'ali-id', email: 'ali@colaberry.com', team: null })];
      return [];
    });

    const result = await runCommit('/tmp', 'test-session');

    expect(mockMemberUpdate).toHaveBeenCalledWith({ team: 'Exec' }, expect.objectContaining({ where: { id: 'ali-id' } }));
    expect(result.updated).toBeGreaterThanOrEqual(1);
  });

  it('idempotency: a second commit with everything already correct writes zero updates', async () => {
    mockMemberFindAll.mockImplementation(async ({ where }: any) => {
      const queried = emailFromWhere(where);
      const target = DEPARTMENT_ASSIGNMENTS.find((d) => d.email.toLowerCase() === queried);
      if (target) return [memberRow({ id: `${target.email}-id`, email: target.email, team: target.team })];
      return [];
    });
    mockMemberFindOne.mockResolvedValue(memberRow({ id: 'farhat-id', email: FARHAT_EMAIL, team: FARHAT_TEAM }));

    const result = await runCommit('/tmp', 'test-session');

    expect(mockMemberUpdate).not.toHaveBeenCalled();
    expect(mockCreateFreeAccount).not.toHaveBeenCalled();
    expect(result.updated).toBe(0);
    expect(result.created).toBe(0);
  });

  it('Farhat: creates a free account + org_members row exactly once via createFreeAccount + findOrCreate', async () => {
    mockMemberFindOne.mockResolvedValue(null);
    mockCreateFreeAccount.mockResolvedValue({ enrollment: { id: 'farhat-enrollment-id' } });
    mockMemberFindOrCreate.mockResolvedValue([memberRow({ id: 'farhat-new-id', email: FARHAT_EMAIL, team: FARHAT_TEAM }), true]);

    const result = await runCommit('/tmp', 'test-session');

    expect(mockCreateFreeAccount).toHaveBeenCalledTimes(1);
    expect(mockCreateFreeAccount).toHaveBeenCalledWith(expect.objectContaining({ email: FARHAT_EMAIL }));
    expect(mockMemberFindOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { org_id: ORG.id, email: FARHAT_EMAIL },
        defaults: expect.objectContaining({ team: FARHAT_TEAM, role: 'member' }),
      }),
    );
    expect(result.created).toBe(1);
  });

  it('idempotency: a second commit finds Farhat already exists and does not create a duplicate', async () => {
    mockMemberFindOne.mockResolvedValue(memberRow({ id: 'farhat-id', email: FARHAT_EMAIL, team: FARHAT_TEAM }));

    const result = await runCommit('/tmp', 'test-session');

    expect(mockCreateFreeAccount).not.toHaveBeenCalled();
    expect(result.created).toBe(0);
  });

  it('failure/boundary: a target email with no existing row (other than Farhat) is reported in unresolved, never thrown', async () => {
    mockMemberFindAll.mockResolvedValue([]);

    const result = await runCommit('/tmp', 'test-session');

    expect(result.unresolved).toBe(DEPARTMENT_ASSIGNMENTS.length);
  });

  it('boundary: the untouched-list emails never appear in any write call', async () => {
    const untouched = ['swati@colaberry.com', 'ali+10@colaberry.com', 'balakrishna.k@colaberry.com', 'channocatshhr@yahoo.com', 'reese@colaberry.com'];
    expect(DEPARTMENT_ASSIGNMENTS.map((d) => d.email)).toEqual(expect.not.arrayContaining(untouched));

    await runCommit('/tmp', 'test-session');

    // Stronger than checking OrgMember.update()'s call args (that call never
    // carries an `email` field at all — {team, where:{id}} — so asserting on
    // it there would be vacuous). The real, checkable guarantee is that the
    // script never even QUERIES for an untouched email in the first place,
    // since computeDiff() only iterates DEPARTMENT_ASSIGNMENTS + Farhat.
    const queriedEmails = mockMemberFindAll.mock.calls.map(([{ where }]: any) => emailFromWhere(where));
    for (const email of untouched) {
      expect(queriedEmails).not.toContain(email);
    }
  });

  it('idempotency: a second commit with everything already correct still writes an undo log (now with an empty diff), never skips the artifact', async () => {
    mockMemberFindAll.mockImplementation(async ({ where }: any) => {
      const queried = emailFromWhere(where);
      const target = DEPARTMENT_ASSIGNMENTS.find((d) => d.email.toLowerCase() === queried);
      if (target) return [memberRow({ id: `${target.email}-id`, email: target.email, team: target.team })];
      return [];
    });
    mockMemberFindOne.mockResolvedValue(memberRow({ id: 'farhat-id', email: FARHAT_EMAIL, team: FARHAT_TEAM }));

    await runCommit('/tmp', 'test-session');

    expect(mockWriteFileSync).toHaveBeenCalled();
    const [, undoLogJson] = mockWriteFileSync.mock.calls[0];
    const undoLog = JSON.parse(undoLogJson);
    expect(undoLog.rows).toEqual([]);
  });

  it('failure path: throws a clear error (never a silent no-op) when the "Colaberry" Organization row itself is missing', async () => {
    mockOrgFindOne.mockResolvedValue(null);

    await expect(runCommit('/tmp', 'test-session')).rejects.toThrow(/No Organization row named "Colaberry"/);
    expect(mockMemberFindAll).not.toHaveBeenCalled();
    expect(mockMemberUpdate).not.toHaveBeenCalled();
  });
});

describe('runRevert', () => {
  it('restores an updated row\'s team to previous_team', async () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        generated_at: '2026-08-19T00:00:00Z',
        session_id: 'test-session',
        rows: [{ action: 'updated', org_member_id: 'ali-id', email: 'ali@colaberry.com', previous_team: null, new_team: 'Exec' }],
        unresolved: [],
      }),
    );
    const row = memberRow({ id: 'ali-id', team: 'Exec' });
    mockMemberFindByPk.mockResolvedValue(row);

    const result = await runRevert('/tmp/undo.json');

    expect(result.reverted).toBe(1);
    expect(row.update).toHaveBeenCalledWith({ team: null }, expect.anything());
  });

  it('idempotency: a row already at its previous state is skipped', async () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        generated_at: '2026-08-19T00:00:00Z',
        session_id: 'test-session',
        rows: [{ action: 'updated', org_member_id: 'ali-id', email: 'ali@colaberry.com', previous_team: null, new_team: 'Exec' }],
        unresolved: [],
      }),
    );
    const row = memberRow({ id: 'ali-id', team: null });
    mockMemberFindByPk.mockResolvedValue(row);

    const result = await runRevert('/tmp/undo.json');

    expect(result.reverted).toBe(0);
    expect(result.skippedAlreadyAtPreviousState).toBe(1);
    expect(row.update).not.toHaveBeenCalled();
  });

  it('never touches a created row (e.g. Farhat) — reported as skipped, not deleted', async () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        generated_at: '2026-08-19T00:00:00Z',
        session_id: 'test-session',
        rows: [{ action: 'created', org_member_id: 'farhat-id', email: FARHAT_EMAIL, new_team: FARHAT_TEAM }],
        unresolved: [],
      }),
    );

    const result = await runRevert('/tmp/undo.json');

    expect(result.skippedCreatedRows).toBe(1);
    expect(mockMemberFindByPk).not.toHaveBeenCalled();
  });
});
