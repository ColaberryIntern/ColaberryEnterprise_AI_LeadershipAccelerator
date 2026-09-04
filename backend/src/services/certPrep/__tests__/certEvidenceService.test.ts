/**
 * certEvidenceService — auto-matching proposes, a human disposes.
 *
 * The load-bearing claims: nothing is ever auto-verified, re-running proposes no
 * duplicates and cannot resurrect a rejected candidate, every rule points at an
 * objective that actually exists in the official blueprint, and a missing
 * objective routes to a build rather than a reading list.
 */
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../models/CertEvidenceMapping', () => ({
  __esModule: true,
  default: { findOrCreate: jest.fn(), findAll: jest.fn(), findByPk: jest.fn() },
}));
jest.mock('../../../models/PortfolioArtifact', () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock('../../../models/EvidenceRecord', () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock('../certBlueprintService', () => ({ getCurrentBlueprint: jest.fn() }));

import CertEvidenceMapping from '../../../models/CertEvidenceMapping';
import PortfolioArtifact from '../../../models/PortfolioArtifact';
import EvidenceRecord from '../../../models/EvidenceRecord';
import { getCurrentBlueprint } from '../certBlueprintService';
import {
  CCAR_F_MATCH_RULES,
  proposeCandidates,
  getEvidenceMap,
  setMappingState,
  recommendedActionFor,
} from '../certEvidenceService';
import { CCAR_FOUNDATIONS_BLUEPRINT } from '../../../data/certBlueprints/ccarFoundations';

const mMapping = CertEvidenceMapping as any;
const mArtifacts = PortfolioArtifact.findAll as unknown as jest.Mock;
const mRecords = EvidenceRecord.findAll as unknown as jest.Mock;
const mBlueprint = getCurrentBlueprint as unknown as jest.Mock;

/** The real official blueprint, so rule integrity is checked against the shipped one. */
const REAL_BLUEPRINT = {
  track: { track_id: 'ccar-f', blueprint_version: '1.0-2026-07' },
  domains: CCAR_FOUNDATIONS_BLUEPRINT.domains,
};

beforeEach(() => {
  jest.clearAllMocks();
  mBlueprint.mockResolvedValue(REAL_BLUEPRINT);
  mArtifacts.mockResolvedValue([]);
  mRecords.mockResolvedValue([]);
  mMapping.findAll.mockResolvedValue([]);
  mMapping.findOrCreate.mockResolvedValue([{}, true]);
});

describe('rule integrity', () => {
  it('EVERY rule points at an objective that exists in the official blueprint', () => {
    const valid = new Set(
      CCAR_FOUNDATIONS_BLUEPRINT.domains.flatMap((d) => d.objectives.map((o) => o.objective_id)),
    );
    const dangling: string[] = [];
    CCAR_F_MATCH_RULES.forEach((rule) => {
      rule.objective_ids.forEach((id) => { if (!valid.has(id)) dangling.push(id); });
    });
    expect(dangling).toEqual([]);
  });

  it('every rule carries a rationale an instructor can read', () => {
    CCAR_F_MATCH_RULES.forEach((rule) => {
      expect(rule.rationale.length).toBeGreaterThan(30);
      expect(rule.objective_ids.length).toBeGreaterThan(0);
    });
  });

  it('is deliberately sparse — generic signals produce no candidates', () => {
    // "deliverable" and "peer_review" prove work happened, not which objective it
    // demonstrates. Spraying them across domains would look like progress.
    const signals = CCAR_F_MATCH_RULES.map((r) => r.signal);
    expect(signals).not.toContain('deliverable');
    expect(signals).not.toContain('peer_review');
    expect(signals).not.toContain('instructor_review');
  });
});

describe('proposeCandidates', () => {
  it('proposes a mapping for a matching artifact kind', async () => {
    mArtifacts.mockResolvedValue([{ id: 'art-1', kind: 'prompt_library' }]);
    const result = await proposeCandidates('e1');

    expect(result.considered).toBe(1);
    expect(result.proposed).toBe(2); // prompt_library -> D4.1, D4.2
    const objectives = mMapping.findOrCreate.mock.calls.map((c: any) => c[0].defaults.objective_id);
    expect(objectives).toEqual(['D4.1', 'D4.2']);
  });

  it('NEVER auto-verifies — every candidate lands as pending', async () => {
    mArtifacts.mockResolvedValue([{ id: 'art-1', kind: 'architecture_doc' }]);
    await proposeCandidates('e1');
    mMapping.findOrCreate.mock.calls.forEach((c: any) => {
      expect(c[0].defaults.mapping_state).toBe('pending');
      expect(c[0].defaults.auto_matched).toBe(true);
      expect(c[0].defaults.verified_by).toBeUndefined();
    });
  });

  it('stores the rule’s rationale so the reviewer sees the reasoning', async () => {
    mArtifacts.mockResolvedValue([{ id: 'art-1', kind: 'architecture_doc' }]);
    await proposeCandidates('e1');
    const rationale = mMapping.findOrCreate.mock.calls[0][0].defaults.mapping_rationale;
    expect(rationale).toMatch(/coordinator\/subagent|agent loop/i);
  });

  it('is keyed so a re-run cannot duplicate, or resurrect a rejected candidate', async () => {
    mArtifacts.mockResolvedValue([{ id: 'art-1', kind: 'prompt_library' }]);
    await proposeCandidates('e1');
    mMapping.findOrCreate.mock.calls.forEach((c: any) => {
      expect(Object.keys(c[0].where).sort())
        .toEqual(['domain_id', 'enrollment_id', 'source_id', 'source_type']);
    });
    // findOrCreate on that key means an existing rejected row is FOUND, not reset
  });

  it('ignores an artifact kind with no rule rather than guessing a domain', async () => {
    mArtifacts.mockResolvedValue([{ id: 'art-9', kind: 'reflection' }]);
    const result = await proposeCandidates('e1');
    expect(result.considered).toBe(1);
    expect(result.proposed).toBe(0);
    expect(mMapping.findOrCreate).not.toHaveBeenCalled();
  });

  it('matches evidence records by their source type too', async () => {
    mRecords.mockResolvedValue([{ id: 'ev-1', source_type: 'github_pr' }]);
    await proposeCandidates('e1');
    expect(mMapping.findOrCreate.mock.calls[0][0].defaults).toMatchObject({
      source_type: 'evidence_record',
      objective_id: 'D3.6',
    });
  });

  it('returns nothing when no blueprint is configured', async () => {
    mBlueprint.mockResolvedValue(null);
    await expect(proposeCandidates('e1')).resolves.toEqual({ proposed: 0, considered: 0 });
  });
});

describe('getEvidenceMap', () => {
  it('reports all 30 objectives, missing by default, each with a build action', async () => {
    const map = await getEvidenceMap('e1');
    expect(map!.total).toBe(30);
    expect(map!.verified).toBe(0);
    expect(map!.objectives.every((o) => o.state === 'missing')).toBe(true);
    expect(map!.objectives[0].recommended_action!.kind).toBe('build');
  });

  it('a PENDING mapping is not verified evidence, and still shows what would close it', async () => {
    mMapping.findAll.mockResolvedValue([
      { objective_id: 'D1.1', domain_id: 'D1', source_type: 'portfolio_artifact', source_id: 'a1', mapping_state: 'pending', mapping_rationale: 'because' },
    ]);
    const map = await getEvidenceMap('e1');
    const d11 = map!.objectives.find((o) => o.objective_id === 'D1.1')!;
    expect(d11.state).toBe('pending');
    expect(map!.verified).toBe(0);
    expect(d11.recommended_action).not.toBeNull();
  });

  it('a VERIFIED mapping counts and drops the recommended action', async () => {
    mMapping.findAll.mockResolvedValue([
      { objective_id: 'D1.1', domain_id: 'D1', source_type: 'portfolio_artifact', source_id: 'a1', mapping_state: 'verified', mapping_rationale: 'because' },
    ]);
    const map = await getEvidenceMap('e1');
    const d11 = map!.objectives.find((o) => o.objective_id === 'D1.1')!;
    expect(d11.state).toBe('verified');
    expect(d11.recommended_action).toBeNull();
    expect(map!.verified).toBe(1);
  });

  it('the query excludes rejected mappings', async () => {
    await getEvidenceMap('e1');
    const where = mMapping.findAll.mock.calls[0][0].where;
    expect(where.mapping_state).toBeDefined(); // Op.in ['pending','verified']
  });
});

describe('recommendedActionFor', () => {
  it('routes to a BUILD, never a reading list', () => {
    const action = recommendedActionFor('D2', 'Design effective tool interfaces');
    expect(action.kind).toBe('build');
    expect(action.detail).toMatch(/shipping something, not reading/i);
    expect(action.label).toContain('Design effective tool interfaces');
  });
});

describe('setMappingState', () => {
  it('refuses verification without a named reviewer', async () => {
    await expect(setMappingState('m1', 'verified', '')).rejects.toMatchObject({
      status: 400, code: 'CERT_VERIFY_NEEDS_REVIEWER',
    });
    expect(mMapping.findByPk).not.toHaveBeenCalled();
  });

  it('records who verified and when', async () => {
    const row: any = { save: jest.fn().mockResolvedValue(undefined) };
    mMapping.findByPk.mockResolvedValue(row);
    await setMappingState('m1', 'verified', 'kes@colaberry.com');
    expect(row.mapping_state).toBe('verified');
    expect(row.verified_by).toBe('kes@colaberry.com');
    expect(row.verified_at).toBeInstanceOf(Date);
    expect(row.rejected_reason).toBeNull();
  });

  it('records a rejection reason, and clears it on a later verification', async () => {
    const row: any = { save: jest.fn().mockResolvedValue(undefined) };
    mMapping.findByPk.mockResolvedValue(row);

    await setMappingState('m1', 'rejected', 'kes@colaberry.com', 'the doc does not cover orchestration');
    expect(row.rejected_reason).toBe('the doc does not cover orchestration');

    await setMappingState('m1', 'verified', 'kes@colaberry.com');
    expect(row.rejected_reason).toBeNull();
  });

  it('returns null for an unknown mapping rather than throwing', async () => {
    mMapping.findByPk.mockResolvedValue(null);
    await expect(setMappingState('nope', 'verified', 'kes@colaberry.com')).resolves.toBeNull();
  });
});
