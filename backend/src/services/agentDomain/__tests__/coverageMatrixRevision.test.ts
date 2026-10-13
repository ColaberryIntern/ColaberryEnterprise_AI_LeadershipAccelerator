/**
 * T13 -- revision semantics: what a changed requirement invalidates, and what it preserves.
 *
 * Run `20261007-school-agent-factory`, session CC-20261006-a4k7.
 *
 * Split out of `coverageMatrix.test.ts`, which reached 501 lines against CLAUDE.md's 500-line
 * HARD ceiling. A brand-new file, so the grandfather clause does not apply. The split is also the
 * right seam: these tests exercise `reviseCapability`, which is the approval-and-change policy,
 * not the coverage matrix itself.
 */

import {
  reviseCapability,
  COSMETIC_FIELDS,
  type ApprovalRecord,
} from '../coverageMatrix';
import { type CapabilityRecord } from '../capabilityRecord';

function minimalCapability(overrides: Partial<CapabilityRecord> = {}): CapabilityRecord {
  return {
    capability_id: 'fx-1',
    name: 'Fixture capability',
    business_outcome: 'something measurable',
    intended_users: ['manager'],
    classification: 'inherited_from_legacy',
    source: 'verified_legacy_functionality',
    supporting_evidence: ['someFile.ts:10'],
    implementation_state: 'partial',
    requirement_validation_state: 'draft',
    validation_dependency: 'manager has not reviewed this',
    inputs: ['a'],
    outputs: ['b'],
    workflow: ['step one'],
    exceptions: ['it fails'],
    dependencies: [],
    application_pages: [],
    apis: [],
    source_modules: ['someFile.ts'],
    required_tools: ['read_thing'],
    human_decision: false,
    starting_autonomy: 'autonomy:R0',
    max_permitted_autonomy: 'autonomy:R5',
    blocked_by: [],
    release_behaviour: [],
    ...overrides,
  } as CapabilityRecord;
}

// ─────────────────────── revision produces a visible diff ───────────────────────

describe('revising a requirement invalidates only what it affects', () => {
  const base = minimalCapability({ capability_id: 'rev-1' });

  const workflowApproval: ApprovalRecord = {
    capability_id: 'rev-1',
    approved_by: 'Sarbjit Kaur',
    approved_at: '2026-10-01T00:00:00.000Z',
    depends_on_fields: ['workflow', 'exceptions'],
  };
  const toolApproval: ApprovalRecord = {
    capability_id: 'rev-1',
    approved_by: 'Sarbjit Kaur',
    approved_at: '2026-10-02T00:00:00.000Z',
    depends_on_fields: ['required_tools'],
  };
  const approvals = [workflowApproval, toolApproval];

  it('a MATERIAL change invalidates the dependent approval and preserves the other', () => {
    const next = minimalCapability({ capability_id: 'rev-1', workflow: ['step one', 'step two'] });
    const impact = reviseCapability(base, next, approvals);

    expect(impact.kind).toBe('material');
    expect(impact.material_fields).toEqual(['workflow']);
    expect(impact.invalidated_approvals).toEqual([workflowApproval]);
    expect(impact.preserved_approvals).toEqual([toolApproval]);
  });

  it('a COSMETIC change cascades to nothing', () => {
    const next = minimalCapability({ capability_id: 'rev-1', name: 'Fixture capability (renamed)' });
    const impact = reviseCapability(base, next, approvals);

    expect(impact.kind).toBe('cosmetic');
    expect(impact.cosmetic_fields).toEqual(['name']);
    expect(impact.material_fields).toEqual([]);
    expect(impact.invalidated_approvals).toEqual([]);
    expect(impact.preserved_approvals).toEqual(approvals);
  });

  it('POSITIVE CONTROL: a rule that invalidated everything would fail the preservation test', () => {
    // The naive "any edit invalidates every approval" implementation is safe-looking and wrong:
    // it destroys the selective reapproval the policy exists to enable. This asserts the
    // difference is observable, so the naive version cannot pass unnoticed.
    const next = minimalCapability({ capability_id: 'rev-1', workflow: ['changed'] });
    const impact = reviseCapability(base, next, approvals);
    const naive = { invalidated: approvals, preserved: [] as ApprovalRecord[] };

    expect(impact.invalidated_approvals.length).toBeLessThan(naive.invalidated.length);
    expect(impact.preserved_approvals.length).toBeGreaterThan(naive.preserved.length);
  });

  it('the revision is VISIBLE: a diff names the field and both values', () => {
    const next = minimalCapability({ capability_id: 'rev-1', workflow: ['step one', 'step two'] });
    const impact = reviseCapability(base, next, approvals);
    expect(impact.diff).toHaveLength(1);
    expect(impact.diff[0]).toMatch(/^workflow: /);
    expect(impact.diff[0]).toMatch(/step two/);
  });

  it('an unchanged capability reports no change and touches no approval', () => {
    const impact = reviseCapability(base, minimalCapability({ capability_id: 'rev-1' }), approvals);
    expect(impact.kind).toBe('none');
    expect(impact.changed_fields).toEqual([]);
    expect(impact.invalidated_approvals).toEqual([]);
  });

  it('classification FAILS CLOSED: an unclassified field is material, not cosmetic', () => {
    // A field nobody thought about must not quietly stop invalidating approvals.
    const next = minimalCapability({ capability_id: 'rev-1', some_new_field: 'added later' } as Partial<CapabilityRecord>);
    const impact = reviseCapability(base, next, [{
      capability_id: 'rev-1',
      approved_by: 'Sarbjit Kaur',
      approved_at: '2026-10-01T00:00:00.000Z',
      depends_on_fields: ['some_new_field'],
    }]);
    expect(impact.kind).toBe('material');
    expect(impact.invalidated_approvals).toHaveLength(1);
  });

  it('the cosmetic list is short and excludes anything that changes meaning', () => {
    expect(COSMETIC_FIELDS.length).toBeLessThanOrEqual(4);
    for (const material of ['workflow', 'required_tools', 'human_decision', 'max_permitted_autonomy',
      'permissions_by_environment', 'release_behaviour', 'classification', 'business_outcome']) {
      expect(COSMETIC_FIELDS).not.toContain(material);
    }
  });

  it('an approval for another capability is never invalidated by this one changing', () => {
    const foreign: ApprovalRecord = {
      capability_id: 'rev-2',
      approved_by: 'Sarbjit Kaur',
      approved_at: '2026-10-01T00:00:00.000Z',
      depends_on_fields: ['workflow'],
    };
    const next = minimalCapability({ capability_id: 'rev-1', workflow: ['changed'] });
    const impact = reviseCapability(base, next, [foreign]);
    expect(impact.invalidated_approvals).toEqual([]);
    expect(impact.preserved_approvals).toEqual([foreign]);
  });
});
