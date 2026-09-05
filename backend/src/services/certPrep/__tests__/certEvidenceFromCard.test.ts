/**
 * Evidence write-back from a completed card.
 *
 * The whole risk here is over-claiming. This runs on every card completion, so
 * a mapping applied too eagerly credits thousands of students with evidence
 * they did not produce — and unlike a crash, nobody would notice. The tests are
 * mostly about what it refuses to write.
 */
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../models/CertEvidenceMapping', () => ({
  __esModule: true,
  default: { findOrCreate: jest.fn() },
}));
jest.mock('../certBlueprintService', () => ({ getCurrentBlueprint: jest.fn() }));

import { sequelize } from '../../../config/database';
import CertEvidenceMapping from '../../../models/CertEvidenceMapping';
import { getCurrentBlueprint } from '../certBlueprintService';
import { proposeEvidenceFromCard } from '../certEvidenceFromCard';

const mQuery = sequelize.query as unknown as jest.Mock;
const mFindOrCreate = CertEvidenceMapping.findOrCreate as unknown as jest.Mock;
const mBlueprint = getCurrentBlueprint as unknown as jest.Mock;

const blueprint = {
  track: { track_id: 'ccar-f', blueprint_version: '1.0-2026-07' },
  domains: [
    { domain_id: 'D3', objectives: [{ objective_id: 'D3.1' }, { objective_id: 'D3.5' }] },
    { domain_id: 'D4', objectives: [{ objective_id: 'D4.1' }, { objective_id: 'D4.2' }, { objective_id: 'D4.3' }] },
  ],
};

const withMapping = (objective_ids: string[], rationale = 'because the lab is prompt engineering whatever the week is about') =>
  mQuery.mockResolvedValue([{ certification_mapping: { objective_ids, rationale } }]);

beforeEach(() => {
  jest.clearAllMocks();
  mBlueprint.mockResolvedValue(blueprint);
  mFindOrCreate.mockResolvedValue([{}, true]);
});

describe('what it writes', () => {
  it('proposes one row per objective the type claims', async () => {
    withMapping(['D4.1', 'D4.2', 'D4.3']);
    const result = await proposeEvidenceFromCard('e1', { id: 'card-1', type: 'prompt_lab' });
    expect(result.proposed).toBe(3);
    expect(result.claimed).toEqual(['D4.1', 'D4.2', 'D4.3']);
  });

  it('records the objective AND its domain, so readiness can find it', async () => {
    withMapping(['D3.1']);
    await proposeEvidenceFromCard('e1', { id: 'card-1', type: 'setup_lab' });
    const defaults = mFindOrCreate.mock.calls[0][0].defaults;
    expect(defaults.objective_id).toBe('D3.1');
    expect(defaults.domain_id).toBe('D3');
    expect(defaults.source_type).toBe('timeline_card');
    expect(defaults.source_id).toBe('card-1');
  });

  it('carries the mapping rationale, so a reviewer sees why it was proposed', async () => {
    withMapping(['D4.1'], 'a challenge is a precision exercise on one prompt');
    await proposeEvidenceFromCard('e1', { id: 'c', type: 'prompt_challenge' });
    expect(mFindOrCreate.mock.calls[0][0].defaults.mapping_rationale)
      .toContain('precision exercise');
  });
});

describe('what it refuses to write', () => {
  it('NEVER writes a verified row — a student cannot verify their own work', async () => {
    withMapping(['D4.1', 'D4.2']);
    await proposeEvidenceFromCard('e1', { id: 'c', type: 'prompt_lab' });
    for (const call of mFindOrCreate.mock.calls) {
      expect(call[0].defaults.mapping_state).toBe('pending');
      expect(call[0].defaults.auto_matched).toBe(true);
    }
  });

  it('writes nothing for a type with no mapping — most types are unmapped on purpose', async () => {
    mQuery.mockResolvedValue([{ certification_mapping: null }]);
    const result = await proposeEvidenceFromCard('e1', { id: 'c', type: 'implementation_task' });
    expect(result).toMatchObject({ proposed: 0, reason: 'no_mapping' });
    expect(mFindOrCreate).not.toHaveBeenCalled();
  });

  it('writes nothing for a type that does not exist', async () => {
    mQuery.mockResolvedValue([]);
    const result = await proposeEvidenceFromCard('e1', { id: 'c', type: 'ghost_type' });
    expect(result).toMatchObject({ proposed: 0, reason: 'no_mapping' });
  });

  it('skips an objective the current blueprint does not have, rather than inventing a domain', async () => {
    // A stale mapping naming a retired objective must not manufacture a domain
    // for it. The seeder validates against the blueprint; this is the backstop.
    withMapping(['D4.1', 'D9.9']);
    const result = await proposeEvidenceFromCard('e1', { id: 'c', type: 'prompt_lab' });
    expect(result.claimed).toEqual(['D4.1']);
    expect(result.proposed).toBe(1);
  });

  it('writes nothing when there is no blueprint at all', async () => {
    withMapping(['D4.1']);
    mBlueprint.mockResolvedValue(null);
    await expect(proposeEvidenceFromCard('e1', { id: 'c', type: 'prompt_lab' }))
      .resolves.toMatchObject({ proposed: 0, reason: 'no_blueprint' });
  });
});

describe('it never costs a student their completion', () => {
  it('returns rather than throwing when the write fails', async () => {
    withMapping(['D4.1']);
    mFindOrCreate.mockRejectedValue(new Error('database is having a bad afternoon'));
    await expect(proposeEvidenceFromCard('e1', { id: 'c', type: 'prompt_lab' }))
      .resolves.toMatchObject({ proposed: 0, reason: 'error' });
  });

  it('returns rather than throwing when the type lookup fails', async () => {
    mQuery.mockRejectedValue(new Error('no connection'));
    await expect(proposeEvidenceFromCard('e1', { id: 'c', type: 'prompt_lab' }))
      .resolves.toMatchObject({ proposed: 0, reason: 'error' });
  });
});

describe('idempotency', () => {
  it('completing the same card twice proposes nothing the second time', async () => {
    withMapping(['D4.1', 'D4.2']);
    mFindOrCreate.mockResolvedValue([{}, false]);   // the row already existed
    const result = await proposeEvidenceFromCard('e1', { id: 'card-1', type: 'prompt_lab' });
    expect(result.proposed).toBe(0);
    expect(result.claimed).toEqual(['D4.1', 'D4.2']);  // still reports what it claims
  });

  it('keys on the objective, not the domain — three objectives in one domain are three rows', async () => {
    // The unique index used to key on domain, so D4.2 and D4.3 silently
    // no-opped and readiness under-counted. Corrected in this phase.
    withMapping(['D4.1', 'D4.2', 'D4.3']);
    await proposeEvidenceFromCard('e1', { id: 'card-1', type: 'prompt_lab' });
    const wheres = mFindOrCreate.mock.calls.map((c) => c[0].where);
    expect(wheres.map((w) => w.objective_id)).toEqual(['D4.1', 'D4.2', 'D4.3']);
    expect(new Set(wheres.map((w) => JSON.stringify(w))).size).toBe(3);
  });
});
