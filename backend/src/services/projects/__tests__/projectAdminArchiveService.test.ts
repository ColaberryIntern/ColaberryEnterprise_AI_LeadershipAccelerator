/**
 * Admin archive and restore.
 *
 * The cases worth writing are the ones where being wrong costs something irreversible or
 * invisible: archiving the platform's own project record, leaving a student pointed at a project
 * they can no longer see, recording a removal nobody can explain, and an admin path that quietly
 * becomes reachable without an ownership check at the route.
 *
 * The student path is NOT retested here - it has its own suite. What is tested is that the admin
 * path keeps the guarantees that must not diverge from it.
 */
import { Op } from 'sequelize';

const mockProjectFindByPk = jest.fn();
const mockProjectFindAll = jest.fn();
const mockProjectUpdate = jest.fn();
const mockEnrollmentFindByPk = jest.fn();
const mockEnrollmentUpdate = jest.fn();
const mockQuery = jest.fn();
const mockNextActive = jest.fn();

jest.mock('../../../config/database', () => ({
  sequelize: {
    query: (...a: unknown[]) => mockQuery(...a),
    transaction: async (fn: any) => fn('TX'),
  },
}));
jest.mock('../../../models/Project', () => ({
  __esModule: true,
  default: {
    findByPk: (...a: unknown[]) => mockProjectFindByPk(...a),
    findAll: (...a: unknown[]) => mockProjectFindAll(...a),
    update: (...a: unknown[]) => mockProjectUpdate(...a),
  },
}));
jest.mock('../../../models/Enrollment', () => ({
  __esModule: true,
  default: {
    findByPk: (...a: unknown[]) => mockEnrollmentFindByPk(...a),
    update: (...a: unknown[]) => mockEnrollmentUpdate(...a),
  },
}));
jest.mock('../projectArchiveService', () => {
  class ArchiveError extends Error {
    // Mirrors the REAL ArchiveError, which names this field `code`. The first version of this
    // mock invented `errorClass`, so the suite was green against a class that does not exist.
    status: number; code: string;
    constructor(status: number, message: string, code: string) {
      super(message); this.status = status; this.code = code;
    }
  }
  return {
    ArchiveError,
    nextActiveAfterArchiving: (...a: unknown[]) => mockNextActive(...a),
  };
});

/* eslint-disable @typescript-eslint/no-var-requires */
const { PROTECTED_PROJECT_IDS } = require('../protectedProjects');
const {
  adminArchiveProject, adminRestoreProject, listArchivedProjects,
} = require('../projectAdminArchiveService');

const PROTECTED = [...PROTECTED_PROJECT_IDS][0];
const PID = '11111111-1111-1111-1111-111111111111';
const EID = '22222222-2222-2222-2222-222222222222';

const project = (over: Record<string, unknown> = {}) => ({
  id: PID, enrollment_id: EID, name: 'KPI Investigation Automation System',
  archived_at: null, archived_by: null, archived_reason: null, ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue([[{ n: 0 }]]);
  mockNextActive.mockResolvedValue(null);
});

describe('the platform record stays untouchable', () => {
  /** ~144,000 rows across 15 tables, including the BuildManifest telemetry target. */
  it('refuses to archive a protected project, even for an admin', async () => {
    await expect(adminArchiveProject(PROTECTED, 'ali@colaberry.com', 'tidying'))
      .rejects.toMatchObject({ status: 403, code: 'ProtectedProject' });
    expect(mockProjectUpdate).not.toHaveBeenCalled();
  });

  it('refuses before it even loads the row, so the id cannot be probed', async () => {
    await expect(adminArchiveProject(PROTECTED, 'a', 'b')).rejects.toThrow();
    expect(mockProjectFindByPk).not.toHaveBeenCalled();
  });

  it('refuses to restore one too, so the pair cannot be used to probe', async () => {
    await expect(adminRestoreProject(PROTECTED, 'ali@colaberry.com'))
      .rejects.toMatchObject({ status: 403 });
  });
});

describe('a removal has to be explainable', () => {
  it('refuses without a reason', async () => {
    mockProjectFindByPk.mockResolvedValue(project());
    await expect(adminArchiveProject(PID, 'ali@colaberry.com', ''))
      .rejects.toMatchObject({ status: 400, code: 'ReasonRequired' });
    expect(mockProjectUpdate).not.toHaveBeenCalled();
  });

  it('refuses a reason longer than the column holds, rather than truncating silently', async () => {
    mockProjectFindByPk.mockResolvedValue(project());
    await expect(adminArchiveProject(PID, 'ali@colaberry.com', 'x'.repeat(201)))
      .rejects.toMatchObject({ code: 'ReasonTooLong' });
  });

  it('records who and why on the row', async () => {
    mockProjectFindByPk.mockResolvedValue(project());
    mockEnrollmentFindByPk.mockResolvedValue({ active_project_id: null });
    await adminArchiveProject(PID, 'ali@colaberry.com', 'Swati asked for it to go');
    const [values] = mockProjectUpdate.mock.calls[0];
    expect(values.archived_by).toBe('ali@colaberry.com');
    expect(values.archived_reason).toBe('Swati asked for it to go');
    expect(values.archived_at).toBeInstanceOf(Date);
  });
});

describe('the owner is never left pointing at it', () => {
  /**
   * enrollments.active_project_id has NO foreign key. A pointer left on an archived project
   * makes getProjectByEnrollment fall through to "newest remaining project", which on one
   * enrollment resolves to the platform's own record.
   */
  it('clears the active pointer when the archived project was active', async () => {
    mockProjectFindByPk.mockResolvedValue(project());
    mockEnrollmentFindByPk.mockResolvedValue({ active_project_id: PID });
    const r = await adminArchiveProject(PID, 'admin', 'dead build');
    expect(mockEnrollmentUpdate).toHaveBeenCalled();
    expect(mockEnrollmentUpdate.mock.calls[0][0].active_project_id).toBeNull();
    expect(r.active_project_id).toBeNull();
  });

  it('repoints to the next live project when there is one', async () => {
    mockProjectFindByPk.mockResolvedValue(project());
    mockEnrollmentFindByPk.mockResolvedValue({ active_project_id: PID });
    mockNextActive.mockResolvedValue({ id: 'next-id' });
    const r = await adminArchiveProject(PID, 'admin', 'dead build');
    expect(mockEnrollmentUpdate.mock.calls[0][0].active_project_id).toBe('next-id');
    expect(r.active_project_id).toBe('next-id');
  });

  it('leaves the pointer alone when a DIFFERENT project was active', async () => {
    mockProjectFindByPk.mockResolvedValue(project());
    mockEnrollmentFindByPk.mockResolvedValue({ active_project_id: 'other' });
    const r = await adminArchiveProject(PID, 'admin', 'dead build');
    expect(mockEnrollmentUpdate).not.toHaveBeenCalled();
    expect(r.active_project_id).toBe('other');
  });

  /** Reusing the student path's resolver rather than re-deriving it is the point. */
  it('asks the shared resolver where the pointer goes', async () => {
    mockProjectFindByPk.mockResolvedValue(project());
    mockEnrollmentFindByPk.mockResolvedValue({ active_project_id: PID });
    await adminArchiveProject(PID, 'admin', 'dead build');
    expect(mockNextActive).toHaveBeenCalledWith(EID, PID);
  });
});

describe('idempotency', () => {
  it('reports changed:false and writes nothing when already archived', async () => {
    mockProjectFindByPk.mockResolvedValue(project({
      archived_at: new Date('2026-11-01T00:00:00Z'), archived_by: 'someone', archived_reason: 'earlier',
    }));
    mockEnrollmentFindByPk.mockResolvedValue({ active_project_id: null });
    const r = await adminArchiveProject(PID, 'admin', 'again');
    expect(r.changed).toBe(false);
    expect(r.archived_by).toBe('someone'); // the FIRST reason survives, not the second
    expect(mockProjectUpdate).not.toHaveBeenCalled();
  });

  it('reports changed:false on restoring something not archived', async () => {
    mockProjectFindByPk.mockResolvedValue(project());
    mockEnrollmentFindByPk.mockResolvedValue({ active_project_id: null });
    const r = await adminRestoreProject(PID, 'admin');
    expect(r.changed).toBe(false);
    expect(mockProjectUpdate).not.toHaveBeenCalled();
  });

  it('404s on a project that does not exist', async () => {
    mockProjectFindByPk.mockResolvedValue(null);
    await expect(adminArchiveProject(PID, 'admin', 'x')).rejects.toMatchObject({ status: 404 });
  });
});

describe('restore', () => {
  it('clears the audit fields, because they describe an archive that no longer holds', async () => {
    mockProjectFindByPk.mockResolvedValue(project({
      archived_at: new Date(), archived_by: 'ali', archived_reason: 'was wrong',
    }));
    mockEnrollmentFindByPk.mockResolvedValue({ active_project_id: 'other' });
    mockProjectFindByPk.mockResolvedValueOnce(project({
      archived_at: new Date(), archived_by: 'ali', archived_reason: 'was wrong',
    })).mockResolvedValueOnce(project({ id: 'other' }));
    await adminRestoreProject(PID, 'admin');
    const [values] = mockProjectUpdate.mock.calls[0];
    expect(values).toMatchObject({ archived_at: null, archived_by: null, archived_reason: null });
  });

  /** Restoring must not switch a student off the build they are currently working. */
  it('does NOT adopt as active when the owner already has a live active project', async () => {
    mockProjectFindByPk
      .mockResolvedValueOnce(project({ archived_at: new Date() }))
      .mockResolvedValueOnce(project({ id: 'other', archived_at: null }));
    mockEnrollmentFindByPk.mockResolvedValue({ active_project_id: 'other' });
    const r = await adminRestoreProject(PID, 'admin');
    expect(mockEnrollmentUpdate).not.toHaveBeenCalled();
    expect(r.active_project_id).toBe('other');
  });

  it('adopts as active when the owner is pointing at nothing', async () => {
    mockProjectFindByPk.mockResolvedValue(project({ archived_at: new Date() }));
    mockEnrollmentFindByPk.mockResolvedValue({ active_project_id: null });
    const r = await adminRestoreProject(PID, 'admin');
    expect(mockEnrollmentUpdate.mock.calls[0][0].active_project_id).toBe(PID);
    expect(r.active_project_id).toBe(PID);
  });
});

describe('the reveal', () => {
  it('asks only for archived rows, newest first', async () => {
    mockProjectFindAll.mockResolvedValue([]);
    await listArchivedProjects();
    const [opts] = mockProjectFindAll.mock.calls[0];
    expect(opts.where.archived_at).toEqual({ [Op.ne]: null });
    expect(opts.order).toEqual([['archived_at', 'DESC']]);
  });

  it('caps the page size rather than trusting the caller', async () => {
    mockProjectFindAll.mockResolvedValue([]);
    await listArchivedProjects(100000);
    expect(mockProjectFindAll.mock.calls[0][0].limit).toBeLessThanOrEqual(1000);
    await listArchivedProjects(0);
    expect(mockProjectFindAll.mock.calls[1][0].limit).toBeGreaterThanOrEqual(1);
  });

  it('reports what would come back on restore, so the decision is informed', async () => {
    mockProjectFindAll.mockResolvedValue([project({ archived_at: new Date(), archived_by: 'ali', archived_reason: 'dupe' })]);
    mockEnrollmentFindByPk.mockResolvedValue({ full_name: 'Swati Raman', email: 's@x.com' });
    mockQuery.mockResolvedValue([[{ n: 17 }]]);
    const [row] = await listArchivedProjects();
    expect(row).toMatchObject({
      id: PID, archived_by: 'ali', archived_reason: 'dupe',
      student_name: 'Swati Raman', task_count: 17,
    });
  });
});
