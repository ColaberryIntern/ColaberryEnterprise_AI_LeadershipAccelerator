/**
 * certBlueprintService — seeding the official blueprint into the database.
 *
 * The integrity guard is tested directly; the seed and read paths run with the
 * models mocked, matching the repo's service-test convention.
 */
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../models/CertTrack', () => ({
  __esModule: true,
  default: { findOrCreate: jest.fn(), findOne: jest.fn() },
}));
jest.mock('../../../models/CertDomain', () => ({
  __esModule: true,
  default: { findOrCreate: jest.fn(), findAll: jest.fn() },
}));

import CertTrack from '../../../models/CertTrack';
import CertDomain from '../../../models/CertDomain';
import {
  assertBlueprintIntegrity,
  seedBlueprint,
  getCurrentBlueprint,
  weightsAreUsable,
  BlueprintIntegrityError,
} from '../certBlueprintService';
import { CCAR_FOUNDATIONS_BLUEPRINT as BP } from '../../../data/certBlueprints/ccarFoundations';

const mockTrackFindOrCreate = CertTrack.findOrCreate as unknown as jest.Mock;
const mockTrackFindOne = CertTrack.findOne as unknown as jest.Mock;
const mockDomainFindOrCreate = CertDomain.findOrCreate as unknown as jest.Mock;
const mockDomainFindAll = CertDomain.findAll as unknown as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('assertBlueprintIntegrity', () => {
  it('accepts the official blueprint', () => {
    expect(() => assertBlueprintIntegrity(BP)).not.toThrow();
  });

  it('REFUSES weights that do not total 100 — a transcription error must fail loudly', () => {
    const broken = { ...BP, domains: BP.domains.map((d, i) => (i === 0 ? { ...d, weight_pct: 30 } : d)) };
    expect(() => assertBlueprintIntegrity(broken)).toThrow(BlueprintIntegrityError);
    expect(() => assertBlueprintIntegrity(broken)).toThrow(/total 103, expected 100/);
  });

  it('refuses duplicate domain ids', () => {
    const dupes = { ...BP, domains: [BP.domains[0], { ...BP.domains[1], domain_id: 'D1' }] };
    expect(() => assertBlueprintIntegrity(dupes)).toThrow(/duplicate domain ids/);
  });

  it('refuses an empty blueprint', () => {
    expect(() => assertBlueprintIntegrity({ ...BP, domains: [] })).toThrow(/no domains/);
  });
});

describe('seedBlueprint', () => {
  const freshTrack = () => [{ save: jest.fn().mockResolvedValue(undefined) } as any, true];
  const existingTrack = () => [{ save: jest.fn().mockResolvedValue(undefined) } as any, false];

  it('happy path: creates the track and all five domains with official weights', async () => {
    mockTrackFindOrCreate.mockResolvedValue(freshTrack());
    mockDomainFindOrCreate.mockResolvedValue([{ save: jest.fn() } as any, true]);

    const result = await seedBlueprint(BP);

    expect(result.track_created).toBe(true);
    expect(result.domains_created).toBe(5);
    expect(result.domains_updated).toBe(0);
    expect(result.blueprint_version).toBe('1.0-2026-07');

    const weights = mockDomainFindOrCreate.mock.calls.map((c) => [
      c[0].where.domain_id,
      c[0].defaults.weight_pct,
      c[0].defaults.weight_source,
    ]);
    expect(weights).toEqual([
      ['D1', 27, 'official'],
      ['D2', 18, 'official'],
      ['D3', 20, 'official'],
      ['D4', 20, 'official'],
      ['D5', 15, 'official'],
    ]);
  });

  it('idempotent: a second run updates rather than duplicating', async () => {
    mockTrackFindOrCreate.mockResolvedValue(existingTrack());
    mockDomainFindOrCreate.mockResolvedValue([
      { save: jest.fn().mockResolvedValue(undefined) } as any,
      false,
    ]);

    const result = await seedBlueprint(BP);
    expect(result.track_created).toBe(false);
    expect(result.domains_created).toBe(0);
    expect(result.domains_updated).toBe(5);
  });

  it('keys domains on (track, blueprint_version, domain) so a new version is additive', async () => {
    mockTrackFindOrCreate.mockResolvedValue(freshTrack());
    mockDomainFindOrCreate.mockResolvedValue([{ save: jest.fn() } as any, true]);
    await seedBlueprint(BP);

    mockDomainFindOrCreate.mock.calls.forEach((c) => {
      expect(Object.keys(c[0].where).sort()).toEqual(['blueprint_version', 'domain_id', 'track_id']);
      expect(c[0].where.blueprint_version).toBe('1.0-2026-07');
    });
  });

  it('does NOT overwrite availability_start_week — the exam guide does not own the Week 7 fence', async () => {
    const [track] = existingTrack();
    track.availability_start_week = 9; // programme has moved the fence
    mockTrackFindOrCreate.mockResolvedValue([track, false]);
    mockDomainFindOrCreate.mockResolvedValue([{ save: jest.fn() } as any, false]);

    await seedBlueprint(BP);
    expect(track.availability_start_week).toBe(9);
  });

  it('refuses to write anything when integrity fails', async () => {
    const broken = { ...BP, domains: [{ ...BP.domains[0], weight_pct: 99 }] };
    await expect(seedBlueprint(broken)).rejects.toThrow(BlueprintIntegrityError);
    expect(mockTrackFindOrCreate).not.toHaveBeenCalled();
    expect(mockDomainFindOrCreate).not.toHaveBeenCalled();
  });
});

describe('getCurrentBlueprint', () => {
  it('returns null when nothing is seeded, rather than falling back to the constant', async () => {
    mockTrackFindOne.mockResolvedValue(null);
    await expect(getCurrentBlueprint()).resolves.toBeNull();
    expect(mockDomainFindAll).not.toHaveBeenCalled();
  });

  it('reads the domains for the track’s own blueprint version, in display order', async () => {
    mockTrackFindOne.mockResolvedValue({ track_id: 'ccar-f', blueprint_version: '1.0-2026-07' });
    mockDomainFindAll.mockResolvedValue([{ domain_id: 'D1' }]);

    const result = await getCurrentBlueprint();
    expect(result?.domains).toHaveLength(1);
    expect(mockDomainFindAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ track_id: 'ccar-f', blueprint_version: '1.0-2026-07' }),
        order: [['display_order', 'ASC']],
      }),
    );
  });
});

describe('weightsAreUsable', () => {
  it('true only when every domain carries a weight', () => {
    expect(weightsAreUsable([{ weight_pct: 27 }, { weight_pct: 18 }] as any)).toBe(true);
    expect(weightsAreUsable([{ weight_pct: 27 }, { weight_pct: null }] as any)).toBe(false);
    expect(weightsAreUsable([])).toBe(false);
  });
});
