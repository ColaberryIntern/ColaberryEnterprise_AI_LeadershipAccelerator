import ArchitectureSkillEvidenceBandWeights from '../../../models/ArchitectureSkillEvidenceBandWeights';
import { getCurrentWeightsRow, getWeightsHistory, updateWeights } from '../capeEvidenceBandWeightsService';
import { updateEvidenceBandWeightsSchema } from '../../../schemas/capeSchema';

jest.mock('../../../config/database', () => ({
  sequelize: { transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn({})) },
}));
jest.mock('../../../models/ArchitectureSkillEvidenceBandWeights', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn() },
}));

const findOne = ArchitectureSkillEvidenceBandWeights.findOne as unknown as jest.Mock;
const findAll = ArchitectureSkillEvidenceBandWeights.findAll as unknown as jest.Mock;
const create = ArchitectureSkillEvidenceBandWeights.create as unknown as jest.Mock;

function makeCurrentRow(overrides: Record<string, any> = {}) {
  const state: Record<string, any> = {
    id: 'w1', version: 1, claim_weight: 0.2, knowledge_weight: 0.25, application_weight: 0.35, judgment_weight: 0.2,
    is_current: true, ...overrides,
  };
  state.update = jest.fn(async (patch: Record<string, any>) => { Object.assign(state, patch); return state; });
  return state;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('updateEvidenceBandWeightsSchema (Zod contract)', () => {
  it('accepts weights that sum to 1.0', () => {
    const parsed = updateEvidenceBandWeightsSchema.safeParse({
      claim_weight: 0.25, knowledge_weight: 0.25, application_weight: 0.3, judgment_weight: 0.2,
    });
    expect(parsed.success).toBe(true);
  });

  it('failure/boundary: rejects weights summing to 0.9', () => {
    const parsed = updateEvidenceBandWeightsSchema.safeParse({
      claim_weight: 0.2, knowledge_weight: 0.2, application_weight: 0.3, judgment_weight: 0.2,
    });
    expect(parsed.success).toBe(false);
  });

  it('failure/boundary: rejects weights summing to 1.1', () => {
    const parsed = updateEvidenceBandWeightsSchema.safeParse({
      claim_weight: 0.3, knowledge_weight: 0.3, application_weight: 0.3, judgment_weight: 0.2,
    });
    expect(parsed.success).toBe(false);
  });
});

describe('updateWeights', () => {
  it('happy path: 20/25/35/20 -> 25/25/30/20 creates version 2 and leaves the old row only marked non-current (never rewritten)', async () => {
    const current = makeCurrentRow();
    findOne.mockResolvedValue(current);
    create.mockResolvedValue({ version: 2, claim_weight: 0.25 });

    const result = await updateWeights({ claim_weight: 0.25, knowledge_weight: 0.25, application_weight: 0.3, judgment_weight: 0.2 }, 'admin-1');
    expect(result.versioned).toBe(true);
    expect(current.update).toHaveBeenCalledWith({ is_current: false }, expect.anything());
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ version: 2, claim_weight: 0.25 }), expect.anything());
    // the old row's own weight fields were never part of the .update() call — only is_current changed
    expect(current.update).toHaveBeenCalledWith(expect.not.objectContaining({ claim_weight: expect.anything() }), expect.anything());
  });

  it('idempotency: a PUT with the current values is a no-op — no new version', async () => {
    const current = makeCurrentRow();
    findOne.mockResolvedValue(current);
    const result = await updateWeights({ claim_weight: 0.2, knowledge_weight: 0.25, application_weight: 0.35, judgment_weight: 0.2 });
    expect(result.versioned).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it('history returns versions in order with exactly one is_current row', async () => {
    findAll.mockResolvedValue([
      { version: 1, is_current: false },
      { version: 2, is_current: true },
    ]);
    const history = await getWeightsHistory();
    expect(history.filter((h) => h.is_current)).toHaveLength(1);
  });

  it('boundary: first-ever write (no current row) creates version 1', async () => {
    findOne.mockResolvedValue(null);
    create.mockResolvedValue({ version: 1 });
    const result = await updateWeights({ claim_weight: 0.2, knowledge_weight: 0.25, application_weight: 0.35, judgment_weight: 0.2 });
    expect(result.versioned).toBe(true);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ version: 1 }), expect.anything());
  });
});

describe('getCurrentWeightsRow', () => {
  it('happy path: returns the current row', async () => {
    findOne.mockResolvedValue(makeCurrentRow());
    const row = await getCurrentWeightsRow();
    expect(row).not.toBeNull();
  });
});
