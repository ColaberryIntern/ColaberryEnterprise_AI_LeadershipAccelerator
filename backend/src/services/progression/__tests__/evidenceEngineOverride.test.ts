/**
 * recordEvidence's builderXpOverride — the seam the budget model awards through.
 *
 * What matters: the override must REPLACE the flat lookup rather than sit
 * alongside it, and it must not become a hole through which a caller can write
 * an arbitrary or malformed amount into the XP ledger.
 */
const mockEvidenceFindOrCreate = jest.fn();
const mockXpFindOrCreate = jest.fn();
const mockGetTypeXp = jest.fn();

jest.mock('../../../models/EvidenceRecord', () => ({
  __esModule: true,
  default: { findOrCreate: (...a: any[]) => mockEvidenceFindOrCreate(...a) },
}));
jest.mock('../../../models/XpEvent', () => ({
  __esModule: true,
  default: { findOrCreate: (...a: any[]) => mockXpFindOrCreate(...a) },
}));
jest.mock('../pointsConfigService', () => ({
  getTypeXp: (...a: any[]) => mockGetTypeXp(...a),
}));

import { recordEvidence } from '../evidenceEngine';

const ENROLLMENT = '22222222-2222-2222-2222-222222222222';

function input(extra: Record<string, unknown> = {}) {
  return {
    enrollmentId: ENROLLMENT,
    source: 'github_commit' as const,
    sourceRef: 'STORY-001@abc',
    typeSlug: 'project_story_verified',
    competencyWeights: [{ domain_id: 'architecture', weight: 1 }],
    ...extra,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEvidenceFindOrCreate.mockResolvedValue([{}, true]);
  mockXpFindOrCreate.mockResolvedValue([{}, true]);
  mockGetTypeXp.mockResolvedValue({ learning: 0, builder: 999, community: 0 });
});

it('uses the override and never consults the flat per-type rate', async () => {
  const res = await recordEvidence(input({ builderXpOverride: 40 }));

  expect(res.builder_xp).toBe(40);
  expect(mockGetTypeXp).not.toHaveBeenCalled();
  expect(mockEvidenceFindOrCreate.mock.calls[0][0].defaults.builder_xp).toBe(40);
  expect(mockXpFindOrCreate.mock.calls[0][0].defaults.amount).toBe(40);
});

it('falls back to the flat rate when no override is given', async () => {
  const res = await recordEvidence(input());
  expect(res.builder_xp).toBe(999);
  expect(mockGetTypeXp).toHaveBeenCalledWith('project_story_verified');
});

it('treats an explicit 0 override as zero, not as "unset"', async () => {
  const res = await recordEvidence(input({ builderXpOverride: 0 }));
  expect(res.builder_xp).toBe(0);
  expect(mockGetTypeXp).not.toHaveBeenCalled();
  // Evidence is still written; only the XP event is skipped.
  expect(mockEvidenceFindOrCreate).toHaveBeenCalled();
  expect(mockXpFindOrCreate).not.toHaveBeenCalled();
});

it('floors a negative override to 0 rather than debiting the ledger', async () => {
  const res = await recordEvidence(input({ builderXpOverride: -50 }));
  expect(res.builder_xp).toBe(0);
  expect(mockXpFindOrCreate).not.toHaveBeenCalled();
});

it('coerces a fractional or non-finite override to a safe integer', async () => {
  expect((await recordEvidence(input({ builderXpOverride: 26.7 }))).builder_xp).toBe(26);
  expect((await recordEvidence(input({ builderXpOverride: NaN }))).builder_xp).toBe(0);
  expect((await recordEvidence(input({ builderXpOverride: Infinity }))).builder_xp).toBe(0);
});
