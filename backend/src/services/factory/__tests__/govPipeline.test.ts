import { deriveGovPipelineStage, projectGovPipelineCard } from '../govPipeline';

describe('deriveGovPipelineStage', () => {
  it('no_bid → passed', () => expect(deriveGovPipelineStage('no_bid', false)).toBe('passed'));
  it('no_bid stays passed even with a stale project (materialized ignored)', () => expect(deriveGovPipelineStage('no_bid', true)).toBe('passed'));
  it('pending_review → qualifying', () => expect(deriveGovPipelineStage('pending_review', false)).toBe('qualifying'));
  it('needs_evidence → qualifying', () => expect(deriveGovPipelineStage('needs_evidence', false)).toBe('qualifying'));
  it('approved_bid_pursuit + not materialized → ready_to_assign', () => expect(deriveGovPipelineStage('approved_bid_pursuit', false)).toBe('ready_to_assign'));
  it('approved_bid_pursuit + materialized → in_build', () => expect(deriveGovPipelineStage('approved_bid_pursuit', true)).toBe('in_build'));
  it('rfi_response + materialized → in_build', () => expect(deriveGovPipelineStage('rfi_response', true)).toBe('in_build'));
  it('rfi_response + not materialized → ready_to_assign', () => expect(deriveGovPipelineStage('rfi_response', false)).toBe('ready_to_assign'));
  it('an unknown decision degrades to the qualifying lane', () => expect(deriveGovPipelineStage('something_new', false)).toBe('qualifying'));
});

describe('projectGovPipelineCard', () => {
  // applicability 'always' + submission + binding + evidenceRef present → not blocking → canApprovePursuit true.
  const establishedReq = {
    id: 'R1', applicability: 'always', dueStage: 'submission',
    bindingStatus: 'binding_solicitation_requirement', evidenceRef: { docId: 'd1' },
  };

  it('projects a decoupled (gws) Round-2 pursuit from provenance + established + ZIP attestation', () => {
    const rec = {
      canonical_opportunity_id: 'gws:11111111-1111-1111-1111-111111111111',
      bidding_entity: 'colaberry', decision: 'needs_evidence', version: 3,
      delivery_project_id: null,
      requirements_json: {
        provenance: { title: 'Work Order Management', agency: 'City of Example' },
        established: [establishedReq],
        reviewedDocuments: [{ method: 'solicitation_zip', sha256: 'abc123' }],
        pursuitKind: 'software',
      },
      updated_at: '2026-10-27T00:00:00.000Z', created_at: '2026-10-20T00:00:00.000Z',
    };
    const card = projectGovPipelineCard(rec, null);
    expect(card.stage).toBe('qualifying');
    expect(card.isDecoupled).toBe(true);
    expect(card.title).toBe('Work Order Management');
    expect(card.agency).toBe('City of Example');
    expect(card.establishedCount).toBe(1);
    expect(card.zipAttested).toBe(true);
    expect(card.readyToAdvance).toBe(true);
    expect(card.pursuitKind).toBe('software');
    expect(card.build).toBeNull();
    expect(card.updatedAt).toBe('2026-10-27T00:00:00.000Z');
  });

  it('readyToAdvance is false and zipAttested false when nothing is established yet', () => {
    const rec = {
      canonical_opportunity_id: 'gws:22222222-2222-2222-2222-222222222222',
      bidding_entity: 'colaberry', decision: 'pending_review', version: 1,
      requirements_json: { established: [] },
    };
    const card = projectGovPipelineCard(rec, null);
    expect(card.stage).toBe('qualifying');
    expect(card.establishedCount).toBe(0);
    expect(card.readyToAdvance).toBe(false);
    expect(card.zipAttested).toBe(false);
    expect(card.title).toBeNull();
    expect(card.createdAt).toBeNull();
  });

  it('projects a canonical approved + materialized pursuit from source_snapshot as in_build with progress', () => {
    const rec = {
      canonical_opportunity_id: `op:gov:${'a'.repeat(32)}`,
      bidding_entity: 'colaberry', decision: 'approved_bid_pursuit', version: 5,
      delivery_project_id: 'dp-1',
      source_snapshot: { title: 'ERP Modernization', agency: 'State of Example' },
      requirements_json: { established: [establishedReq] },
      updated_at: '2026-10-27T12:00:00.000Z',
    };
    const build = { studentProjectId: 'sp-1', pct: 40, verified: 2, total: 5 };
    const card = projectGovPipelineCard(rec, build);
    expect(card.stage).toBe('in_build');
    expect(card.isDecoupled).toBe(false);
    expect(card.title).toBe('ERP Modernization');
    expect(card.agency).toBe('State of Example');
    expect(card.deliveryProjectId).toBe('dp-1');
    expect(card.build?.pct).toBe(40);
    expect(card.build?.total).toBe(5);
  });

  it('an approved pursuit with no materialized build is ready_to_assign', () => {
    const rec = {
      canonical_opportunity_id: 'gws:33333333-3333-3333-3333-333333333333',
      bidding_entity: 'colaberry', decision: 'approved_bid_pursuit', version: 4,
      delivery_project_id: 'dp-2', requirements_json: { established: [establishedReq] },
    };
    expect(projectGovPipelineCard(rec, null).stage).toBe('ready_to_assign');
  });

  it('a no_bid pursuit projects to the passed-on drawer', () => {
    const rec = {
      canonical_opportunity_id: 'gws:44444444-4444-4444-4444-444444444444',
      bidding_entity: 'colaberry', decision: 'no_bid', version: 2, requirements_json: {},
    };
    expect(projectGovPipelineCard(rec, null).stage).toBe('passed');
  });
});
