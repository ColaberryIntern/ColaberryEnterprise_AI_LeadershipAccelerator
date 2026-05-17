/**
 * Tests for linkApisToRequirements — the manifest → requirement
 * linker shipped 2026-05-17 to fix the "manifest ingest doesn't update
 * the requirement layer" gap.
 *
 * Coverage:
 *   - empty apis arrays → no work, no DB call
 *   - one apis_added entry matching one requirement → updates fields
 *   - apis_modified entries match too (not just apis_added)
 *   - no matching requirement_text → no update
 *   - already-linked handler_file → idempotent (no duplicate append)
 *   - already-matched status → does not regress to unmatched
 *   - scoped to project_id (different project's requirements untouched)
 */

const saveMock = jest.fn();

jest.mock('../../../../models/RequirementsMap', () => ({
  __esModule: true,
  default: { findAll: jest.fn() },
}));

import { linkApisToRequirements } from '../telemetryIngestionService';

const PROJECT_A = '11111111-1111-1111-1111-111111111111';
const PROJECT_B = '22222222-2222-2222-2222-222222222222';

/** Build a fake requirement row that records mutations on a real object */
function fakeReq(over: Partial<{ requirement_key: string; requirement_text: string; status: string; github_file_paths: string[]; project_id: string }>) {
  const row: any = {
    requirement_key: over.requirement_key || 'REQ-X',
    requirement_text: over.requirement_text || '',
    status: over.status || 'unmatched',
    github_file_paths: over.github_file_paths ? [...over.github_file_paths] : [],
    project_id: over.project_id || PROJECT_A,
    is_active: true,
    save: saveMock,
  };
  return row;
}

describe('linkApisToRequirements', () => {
  beforeEach(() => {
    saveMock.mockClear();
    // Reset the findAll mock for each test
    const RM = require('../../../../models/RequirementsMap').default;
    RM.findAll.mockReset();
  });

  test('empty apis_added + apis_modified → returns 0 and does not query', async () => {
    const RM = require('../../../../models/RequirementsMap').default;
    const count = await linkApisToRequirements({ project_id: PROJECT_A, apis_added: [], apis_modified: [] });
    expect(count).toBe(0);
    expect(RM.findAll).not.toHaveBeenCalled();
  });

  test('one matching requirement → updates github_file_paths + status', async () => {
    const RM = require('../../../../models/RequirementsMap').default;
    const req = fakeReq({
      requirement_key: 'REQ-027',
      requirement_text: '`GET /api/courses` to retrieve available courses.',
      status: 'unmatched',
      github_file_paths: [],
    });
    RM.findAll.mockResolvedValue([req]);

    const count = await linkApisToRequirements({
      project_id: PROJECT_A,
      apis_added: [{ method: 'GET', path: '/api/courses', handler_file: 'backend/src/routes/enrollmentRoutes.ts' }],
    });

    expect(count).toBe(1);
    expect(req.github_file_paths).toEqual(['backend/src/routes/enrollmentRoutes.ts']);
    expect(req.status).toBe('matched');
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  test('apis_modified entries match too (not just apis_added)', async () => {
    const RM = require('../../../../models/RequirementsMap').default;
    const req = fakeReq({
      requirement_text: 'PUT /api/users/:id/roles for role updates',
    });
    RM.findAll.mockResolvedValue([req]);

    const count = await linkApisToRequirements({
      project_id: PROJECT_A,
      apis_modified: [{ method: 'PUT', path: '/api/users/:id/roles', handler_file: 'backend/src/routes/userRoutes.ts' }],
    });

    expect(count).toBe(1);
    expect(req.github_file_paths).toContain('backend/src/routes/userRoutes.ts');
  });

  test('no matching requirement_text → no update, returns 0', async () => {
    const RM = require('../../../../models/RequirementsMap').default;
    const req = fakeReq({
      requirement_text: 'Authentication is handled via JWT tokens.',
    });
    RM.findAll.mockResolvedValue([req]);

    const count = await linkApisToRequirements({
      project_id: PROJECT_A,
      apis_added: [{ method: 'GET', path: '/api/courses', handler_file: 'backend/src/routes/enrollmentRoutes.ts' }],
    });

    expect(count).toBe(0);
    expect(req.github_file_paths).toEqual([]);
    expect(req.status).toBe('unmatched');
    expect(saveMock).not.toHaveBeenCalled();
  });

  test('idempotent: already-linked handler_file does not duplicate', async () => {
    const RM = require('../../../../models/RequirementsMap').default;
    const req = fakeReq({
      requirement_text: '`GET /api/courses` to retrieve available courses.',
      status: 'matched',
      github_file_paths: ['backend/src/routes/enrollmentRoutes.ts'],
    });
    RM.findAll.mockResolvedValue([req]);

    const count = await linkApisToRequirements({
      project_id: PROJECT_A,
      apis_added: [{ method: 'GET', path: '/api/courses', handler_file: 'backend/src/routes/enrollmentRoutes.ts' }],
    });

    expect(count).toBe(0); // no dirty fields, no save, no count
    expect(req.github_file_paths).toEqual(['backend/src/routes/enrollmentRoutes.ts']);
    expect(saveMock).not.toHaveBeenCalled();
  });

  test('idempotent: appends new handler_file but does not duplicate existing', async () => {
    const RM = require('../../../../models/RequirementsMap').default;
    const req = fakeReq({
      requirement_text: '`GET /api/courses` to retrieve available courses.',
      status: 'matched',
      github_file_paths: ['backend/src/routes/oldHandler.ts'],
    });
    RM.findAll.mockResolvedValue([req]);

    await linkApisToRequirements({
      project_id: PROJECT_A,
      apis_added: [{ method: 'GET', path: '/api/courses', handler_file: 'backend/src/routes/enrollmentRoutes.ts' }],
    });

    expect(req.github_file_paths).toEqual([
      'backend/src/routes/oldHandler.ts',
      'backend/src/routes/enrollmentRoutes.ts',
    ]);
  });

  test('does not regress status from matched → unmatched', async () => {
    const RM = require('../../../../models/RequirementsMap').default;
    const req = fakeReq({
      requirement_text: '`GET /api/courses` to retrieve available courses.',
      status: 'verified',
      github_file_paths: [],
    });
    RM.findAll.mockResolvedValue([req]);

    await linkApisToRequirements({
      project_id: PROJECT_A,
      apis_added: [{ method: 'GET', path: '/api/courses', handler_file: 'backend/src/routes/enrollmentRoutes.ts' }],
    });

    // status was 'verified' — should stay 'verified', not flip to 'matched'
    expect(req.status).toBe('verified');
    expect(req.github_file_paths).toEqual(['backend/src/routes/enrollmentRoutes.ts']);
  });

  test('scoped to project_id — the findAll query carries the project filter', async () => {
    const RM = require('../../../../models/RequirementsMap').default;
    RM.findAll.mockResolvedValue([]);
    await linkApisToRequirements({
      project_id: PROJECT_B,
      apis_added: [{ method: 'GET', path: '/api/courses', handler_file: 'backend/src/routes/enrollmentRoutes.ts' }],
    });
    expect(RM.findAll).toHaveBeenCalledTimes(1);
    const where = RM.findAll.mock.calls[0][0].where;
    expect(where.project_id).toBe(PROJECT_B);
  });

  test('skips API entries missing path or handler_file', async () => {
    const RM = require('../../../../models/RequirementsMap').default;
    RM.findAll.mockResolvedValue([fakeReq({ requirement_text: 'mentions /api/courses somewhere' })]);
    const count = await linkApisToRequirements({
      project_id: PROJECT_A,
      apis_added: [
        { method: 'GET', path: '', handler_file: 'backend/src/routes/x.ts' } as any,
        { method: 'GET', path: '/api/something-else', handler_file: '' } as any,
      ],
    });
    expect(count).toBe(0);
    expect(saveMock).not.toHaveBeenCalled();
  });
});
