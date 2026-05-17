/**
 * Tests for actionGeneratorService — specifically the defensive
 * github_file_paths branch added 2026-05-17 (finding #3 fix).
 *
 * Coverage:
 *   - Requirement with no artifact + no files → create_artifact (legacy)
 *   - Requirement with no artifact + files declared → update_artifact (new)
 *   - The new branch title mentions the linked files
 *   - The new branch's action_type is NOT create_artifact
 */

// Mock the models module BEFORE the generator imports it. Same convention
// the enrollmentRoutes tests established.
jest.mock('../../../models', () => ({
  __esModule: true,
  ArtifactDefinition: { findByPk: jest.fn().mockResolvedValue(null) },
  AssignmentSubmission: { findByPk: jest.fn() },
  ProjectArtifact: { findOne: jest.fn().mockResolvedValue(null) },
}));

import { generateAction } from '../actionGeneratorService';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';

function fakeReq(over: Partial<{
  requirement_key: string;
  requirement_text: string;
  status: string;
  source_artifact_id: string | null;
  github_file_paths: string[];
}>): any {
  return {
    id: 'req-1',
    project_id: PROJECT_ID,
    requirement_key: over.requirement_key || 'REQ-001',
    requirement_text: over.requirement_text || 'Sample requirement text.',
    source_artifact_id: over.source_artifact_id === undefined ? null : over.source_artifact_id,
    github_file_paths: over.github_file_paths || [],
    status: over.status || 'unmatched',
    confidence_score: 0,
  };
}

describe('generateAction — defensive github_file_paths branch (finding #3)', () => {
  test('no artifact + no files → create_artifact (legacy behavior preserved)', async () => {
    const req = fakeReq({
      requirement_key: 'REQ-NEW',
      requirement_text: '`GET /api/something` to retrieve thing.',
      source_artifact_id: null,
      github_file_paths: [],
    });
    const action = await generateAction(req, PROJECT_ID, []);
    expect(action.action_type).toBe('create_artifact');
    expect(action.title).toMatch(/^Create artifact for:/);
    expect(action.reason).toContain('REQ-NEW');
  });

  test('no artifact + 1 linked file → update_artifact (NEW branch)', async () => {
    const req = fakeReq({
      requirement_key: 'REQ-027',
      requirement_text: '`GET /api/courses` to retrieve available courses.',
      source_artifact_id: null,
      github_file_paths: ['backend/src/routes/enrollmentRoutes.ts'],
    });
    const action = await generateAction(req, PROJECT_ID, []);
    expect(action.action_type).toBe('update_artifact');
    expect(action.action_type).not.toBe('create_artifact');
    expect(action.title).toMatch(/^Track formal artifact for:/);
    expect(action.reason).toContain('REQ-027');
    expect(action.reason).toContain('backend/src/routes/enrollmentRoutes.ts');
  });

  test('no artifact + multiple linked files → reason previews first 2 with ellipsis', async () => {
    const req = fakeReq({
      requirement_key: 'REQ-MULTI',
      requirement_text: 'A requirement with many implementation files.',
      source_artifact_id: null,
      github_file_paths: ['a.ts', 'b.ts', 'c.ts', 'd.ts'],
    });
    const action = await generateAction(req, PROJECT_ID, []);
    expect(action.action_type).toBe('update_artifact');
    expect(action.reason).toContain('a.ts');
    expect(action.reason).toContain('b.ts');
    expect(action.reason).toContain('…');
    expect(action.reason).not.toContain('c.ts');
  });

  test('no artifact + empty array files → falls through to create_artifact', async () => {
    const req = fakeReq({
      requirement_key: 'REQ-EMPTY',
      requirement_text: 'No files yet.',
      source_artifact_id: null,
      github_file_paths: [],
    });
    const action = await generateAction(req, PROJECT_ID, []);
    expect(action.action_type).toBe('create_artifact');
  });

  test('no artifact + undefined files → falls through to create_artifact (defensive)', async () => {
    const req = fakeReq({ requirement_key: 'REQ-UNDEF' });
    delete (req as any).github_file_paths;
    const action = await generateAction(req, PROJECT_ID, []);
    expect(action.action_type).toBe('create_artifact');
  });

  test('confidence_score on the new branch is 0.85 (slightly less certain than create_artifact 0.9)', async () => {
    const req = fakeReq({
      source_artifact_id: null,
      github_file_paths: ['some/file.ts'],
    });
    const action = await generateAction(req, PROJECT_ID, []);
    expect(action.confidence_score).toBe(0.85);
  });
});
