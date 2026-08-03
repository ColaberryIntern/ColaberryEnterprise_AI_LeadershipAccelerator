import StudentSkillEvidence from '../../../models/StudentSkillEvidence';
import { recordSkillEvidence, buildIdempotencyKey, CapeEvidenceValidationError } from '../capeEvidenceLedgerService';

jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../models/StudentSkillEvidence', () => ({
  __esModule: true,
  default: { findOrCreate: jest.fn() },
}));

const findOrCreate = StudentSkillEvidence.findOrCreate as unknown as jest.Mock;

const VALID_INPUT = {
  enrollment_id: 'enr-1',
  skill_id: 'agents_mcp' as const,
  band: 'application' as const,
  credit: 12,
  source: 'timeline',
  source_ref: 'card-1',
  idempotency_key: buildIdempotencyKey.timeline('enr-1', 'card-1', 'agents_mcp'),
};

beforeEach(() => {
  jest.clearAllMocks();
  findOrCreate.mockResolvedValue([{ id: 'row-1', band: 'application', skill_id: 'agents_mcp' }, true]);
});

describe('buildIdempotencyKey', () => {
  it('produces the §13 formats exactly', () => {
    expect(buildIdempotencyKey.timeline('e1', 'c1', 's1')).toBe('timeline:e1:c1:s1');
    expect(buildIdempotencyKey.classroom('sub1', 's1')).toBe('classroom:sub1:s1');
    expect(buildIdempotencyKey.diagnostic('att1', 's1')).toBe('diagnostic:att1:s1');
    expect(buildIdempotencyKey.resume(3, 's1')).toBe('resume:3:s1');
  });
});

describe('recordSkillEvidence', () => {
  it('happy path: creates a new evidence row', async () => {
    const result = await recordSkillEvidence(VALID_INPUT);
    expect(result.created).toBe(true);
    expect(findOrCreate).toHaveBeenCalledWith(expect.objectContaining({
      where: { idempotency_key: VALID_INPUT.idempotency_key },
    }));
  });

  it('idempotency: a second call with the same idempotency_key does not create a duplicate row', async () => {
    findOrCreate.mockResolvedValue([{ id: 'row-1', band: 'application', skill_id: 'agents_mcp' }, false]);
    const result = await recordSkillEvidence(VALID_INPUT);
    expect(result.created).toBe(false);
    expect(findOrCreate).toHaveBeenCalledTimes(1);
  });

  it('failure/boundary: rejects an invalid band before touching the DB', async () => {
    await expect(recordSkillEvidence({ ...VALID_INPUT, band: 'bogus' as any }))
      .rejects.toThrow(CapeEvidenceValidationError);
    expect(findOrCreate).not.toHaveBeenCalled();
  });

  it('failure/boundary: rejects an unknown skill_id before touching the DB', async () => {
    await expect(recordSkillEvidence({ ...VALID_INPUT, skill_id: 'not_a_real_skill' as any }))
      .rejects.toThrow(CapeEvidenceValidationError);
    expect(findOrCreate).not.toHaveBeenCalled();
  });

  it('failure/boundary: rejects non-positive credit before touching the DB', async () => {
    await expect(recordSkillEvidence({ ...VALID_INPUT, credit: 0 }))
      .rejects.toThrow(CapeEvidenceValidationError);
    await expect(recordSkillEvidence({ ...VALID_INPUT, credit: -5 }))
      .rejects.toThrow(CapeEvidenceValidationError);
    expect(findOrCreate).not.toHaveBeenCalled();
  });
});
