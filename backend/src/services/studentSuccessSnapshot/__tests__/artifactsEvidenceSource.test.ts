const mockFindAll = jest.fn();
jest.mock('../../../models/EvidenceRecord', () => ({ __esModule: true, default: { findAll: (...a: any[]) => mockFindAll(...a) } }));

import { getArtifactsEvidenceField } from '../artifactsEvidenceSource';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getArtifactsEvidenceField', () => {
  it('happy path: real per-source-type breakdown, only validated evidence', async () => {
    mockFindAll.mockResolvedValue([
      { id: 'e1', source_type: 'github_commit' }, { id: 'e2', source_type: 'github_commit' }, { id: 'e3', source_type: 'instructor_review' },
    ]);

    const field = await getArtifactsEvidenceField('enrollment-1');

    expect(field.status).toBe('known');
    expect(field.value).toEqual({ totalValidated: 3, bySourceType: { github_commit: 2, instructor_review: 1 } });
    expect(mockFindAll).toHaveBeenCalledWith({ where: { enrollment_id: 'enrollment-1', validated: true } });
  });

  it('honesty boundary: zero validated evidence is a real known empty state', async () => {
    mockFindAll.mockResolvedValue([]);

    const field = await getArtifactsEvidenceField('enrollment-1');

    expect(field.status).toBe('known');
    expect(field.value).toEqual({ totalValidated: 0, bySourceType: {} });
  });
});
