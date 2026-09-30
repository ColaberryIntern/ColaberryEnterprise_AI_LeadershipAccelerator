const mockStudentCompetencyFindAll = jest.fn();
jest.mock('../../../models/StudentCompetency', () => ({ __esModule: true, default: { findAll: (...a: any[]) => mockStudentCompetencyFindAll(...a) } }));

const mockCompetencyDomainFindAll = jest.fn();
jest.mock('../../../models/CompetencyDomain', () => ({ __esModule: true, default: { findAll: (...a: any[]) => mockCompetencyDomainFindAll(...a) } }));

import { getCompetencyEvidenceField } from '../competencyEvidenceSource';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getCompetencyEvidenceField', () => {
  it('happy path: real per-domain confidence resolved to real domain names via one batch lookup', async () => {
    mockStudentCompetencyFindAll.mockResolvedValue([
      { id: 'sc1', domain_id: 'd1', confidence: 0.8, evidence_count: 5 },
      { id: 'sc2', domain_id: 'd2', confidence: 0.3, evidence_count: 1 },
    ]);
    mockCompetencyDomainFindAll.mockResolvedValue([
      { domain_id: 'd1', name: 'AI Opportunity Assessment' },
      { domain_id: 'd2', name: 'Stakeholder Communication' },
    ]);

    const field = await getCompetencyEvidenceField('enrollment-1');

    expect(field.status).toBe('known');
    expect(field.value?.domains).toEqual([
      { domainId: 'd1', domainName: 'AI Opportunity Assessment', confidence: 0.8, evidenceCount: 5 },
      { domainId: 'd2', domainName: 'Stakeholder Communication', confidence: 0.3, evidenceCount: 1 },
    ]);
    expect(mockCompetencyDomainFindAll).toHaveBeenCalledTimes(1); // one batch lookup, not N+1
  });

  it('honesty boundary: zero competency rows is a real known empty state, no domain lookup issued', async () => {
    mockStudentCompetencyFindAll.mockResolvedValue([]);

    const field = await getCompetencyEvidenceField('enrollment-1');

    expect(field.status).toBe('known');
    expect(field.value).toEqual({ domains: [] });
    expect(mockCompetencyDomainFindAll).not.toHaveBeenCalled();
  });

  it('a domain with no resolved name falls back to its real domain_id, never a fabricated label', async () => {
    mockStudentCompetencyFindAll.mockResolvedValue([{ id: 'sc1', domain_id: 'd-unknown', confidence: 0.5, evidence_count: 2 }]);
    mockCompetencyDomainFindAll.mockResolvedValue([]);

    const field = await getCompetencyEvidenceField('enrollment-1');

    expect(field.value?.domains[0].domainName).toBe('d-unknown');
  });
});
