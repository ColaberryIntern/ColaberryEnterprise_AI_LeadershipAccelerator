import { computePlacementScore } from '../capePlacementService';
import { getCurrentResumeSkillClaims } from '../capeResumeClaimService';
import { DiagnosticAttempt } from '../../../models';

jest.mock('../capeResumeClaimService', () => ({ getCurrentResumeSkillClaims: jest.fn() }));
jest.mock('../../../models', () => ({ DiagnosticAttempt: { findOne: jest.fn() } }));

const mockClaims = getCurrentResumeSkillClaims as unknown as jest.Mock;
const mockDiagnosticFindOne = DiagnosticAttempt.findOne as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockDiagnosticFindOne.mockResolvedValue(null);
});

describe('computePlacementScore', () => {
  it('boundary (design doc §17 AC 1): no resume claim and no diagnostic history -> 0', async () => {
    mockClaims.mockResolvedValue([]);
    const score = await computePlacementScore('e1', 'agents_mcp');
    expect(score).toBe(0);
  });

  it('happy path: a single resume claim contributes its credit_weight as the base score', async () => {
    mockClaims.mockResolvedValue([{ credit_weight: 42 }]);
    const score = await computePlacementScore('e1', 'agents_mcp');
    expect(score).toBe(42);
  });

  it('happy path: multiple claim rows for a skill use the strongest (max) credit_weight', async () => {
    mockClaims.mockResolvedValue([{ credit_weight: 30 }, { credit_weight: 55 }]);
    const score = await computePlacementScore('e1', 'agents_mcp');
    expect(score).toBe(55);
  });

  it('boundary: a "confirmed" diagnostic outcome raises a low base score to at least 70', async () => {
    mockClaims.mockResolvedValue([{ credit_weight: 20 }]);
    mockDiagnosticFindOne.mockResolvedValue({ outcome: 'confirmed' });
    const score = await computePlacementScore('e1', 'agents_mcp');
    expect(score).toBeGreaterThanOrEqual(70);
  });

  it('a "confirmed" outcome never LOWERS an already-high base score', async () => {
    mockClaims.mockResolvedValue([{ credit_weight: 90 }]);
    mockDiagnosticFindOne.mockResolvedValue({ outcome: 'confirmed' });
    const score = await computePlacementScore('e1', 'agents_mcp');
    expect(score).toBe(90);
  });

  it('boundary: a "not_confirmed" outcome caps a high base score to at most 20 (never zeroed — no shaming)', async () => {
    mockClaims.mockResolvedValue([{ credit_weight: 80 }]);
    mockDiagnosticFindOne.mockResolvedValue({ outcome: 'not_confirmed' });
    const score = await computePlacementScore('e1', 'agents_mcp');
    expect(score).toBeLessThanOrEqual(20);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('a "partial" outcome nudges the score toward the midpoint, between the base and a "confirmed" result', async () => {
    mockClaims.mockResolvedValue([{ credit_weight: 20 }]);
    mockDiagnosticFindOne.mockResolvedValue({ outcome: 'partial' });
    const score = await computePlacementScore('e1', 'agents_mcp');
    expect(score).toBeGreaterThan(20);
    expect(score).toBeLessThan(70);
  });

  it('boundary: result is always capped to [0, 100]', async () => {
    mockClaims.mockResolvedValue([{ credit_weight: 100 }]);
    mockDiagnosticFindOne.mockResolvedValue({ outcome: 'confirmed' });
    const score = await computePlacementScore('e1', 'agents_mcp');
    expect(score).toBeLessThanOrEqual(100);
  });

  it('idempotency: calling twice against unchanged inputs returns an identical score', async () => {
    mockClaims.mockResolvedValue([{ credit_weight: 33 }]);
    mockDiagnosticFindOne.mockResolvedValue({ outcome: 'partial' });
    const first = await computePlacementScore('e1', 'rag');
    const second = await computePlacementScore('e1', 'rag');
    expect(first).toBe(second);
  });
});
