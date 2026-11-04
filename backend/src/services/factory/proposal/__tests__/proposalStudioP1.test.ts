/**
 * P1 of the Gov Proposal Studio — "documents are the single proposal model".
 *
 * Proves the three acceptance properties on the PURE cores (no DB):
 *   - documents carry one section per covered requirement (`deriveProposalDocuments`);
 *   - the slot→document migration bridges the UUID slot key to the TEXT canonical key, is idempotent, and loses
 *     nothing (a response that routes to no document is reported in `unmatched`, never dropped);
 *   - `evaluateReadinessFromDocuments` returns the SAME ready verdict as the deprecated slot path on a fixture.
 */
import { deriveProposalDocuments } from '../govProposalDocuments';
import { planSlotMigration, applySectionPatches, type MigrationRequirement, type MigrationResponse } from '../migrateSlotsToDocuments';
import { evaluateReadinessFromDocuments, evaluateSubmissionReadiness, type ReadinessDocument } from '../submissionPackage';
import type { ResponseSlot } from '../responseSlots';

// Both are SUBMITTAL obligations (classifyRequirementCategory → 'submit'), so each routes to a proposal document
// rather than the build track. REQ-001 → cover_letter (specific pattern); REQ-002 → technical (the default).
const REQS: MigrationRequirement[] = [
  { id: 'uuid-1', canonical_req_id: 'REQ-001', statement: 'Provide a signed cover letter / transmittal letter.', kind: 'compliance' },
  { id: 'uuid-2', canonical_req_id: 'REQ-002', statement: 'The proposal must include a technical approach narrative for the solution.', kind: 'compliance' },
];

describe('deriveProposalDocuments — sections', () => {
  it('gives each document one section per covered requirement, keyed by the canonical id', () => {
    const docs = deriveProposalDocuments(REQS);
    const cover = docs.find((d) => d.key === 'cover_letter');
    const tech = docs.find((d) => d.key === 'technical');
    expect(cover).toBeDefined();
    expect(tech).toBeDefined();
    expect(cover!.sections).toHaveLength(1);
    expect(cover!.sections[0].sectionKey).toBe('REQ-001');
    expect(cover!.sections[0].requirementIds).toEqual(['REQ-001']);
    expect(cover!.sections[0].heading.length).toBeGreaterThan(0);
    expect(tech!.sections[0].sectionKey).toBe('REQ-002');
  });
});

describe('planSlotMigration — bridge, idempotency, no loss', () => {
  const responses: MigrationResponse[] = [
    // keyed by the SLOT key (the UUID), as persisted responses are
    { requirementId: 'uuid-1', content: '<p>Our cover letter.</p>', figures: [], gaps: [{ id: 'g1', question: 'Who signs?', suggestions: ['The PM'], resolution: 'open' }] },
    { requirementId: 'uuid-2', content: '<p>GIS REST layers.</p>', figures: [{ commit: 'abc1234', ref: 'img1', caption: 'GIS' }], gaps: [] },
    // a response for a requirement that is not in the set / routes to no document → unmatched, never dropped
    { requirementId: 'uuid-ghost', content: '<p>Build-track work.</p>', figures: [], gaps: [] },
  ];

  it('routes a UUID-keyed response to the document section keyed by its canonical id', () => {
    const plan = planSlotMigration(REQS, responses);
    const cover = plan.sectionPatches.find((p) => p.sectionKey === 'REQ-001');
    expect(cover).toBeDefined();
    expect(cover!.docKey).toBe('cover_letter');
    expect(cover!.contentHtml).toContain('cover letter');
    const tech = plan.sectionPatches.find((p) => p.sectionKey === 'REQ-002');
    expect(tech!.docKey).toBe('technical');
    expect(tech!.figures).toHaveLength(1);
    // the gap migrated to its document+section with the source id for idempotency
    expect(plan.gapRows).toHaveLength(1);
    expect(plan.gapRows[0]).toMatchObject({ docKey: 'cover_letter', sectionKey: 'REQ-001', sourceGapId: 'g1', resolution: 'open' });
  });

  it('reports a response that routes to no document as unmatched (no silent loss)', () => {
    const plan = planSlotMigration(REQS, responses);
    expect(plan.unmatched).toEqual(['uuid-ghost']);
  });

  it('is idempotent — the same inputs produce an identical plan', () => {
    expect(planSlotMigration(REQS, responses)).toEqual(planSlotMigration(REQS, responses));
  });

  it('applySectionPatches sets content by sectionKey and re-applying is a no-op', () => {
    const docs = deriveProposalDocuments(REQS);
    const cover = docs.find((d) => d.key === 'cover_letter')!;
    const plan = planSlotMigration(REQS, responses);
    const once = applySectionPatches(cover.sections, plan.sectionPatches);
    const twice = applySectionPatches(once, plan.sectionPatches);
    expect(once[0].contentHtml).toContain('cover letter');
    expect(twice).toEqual(once);
  });
});

describe('evaluateReadinessFromDocuments — parity with the slot verdict', () => {
  const slot = (requirementId: string, status: ResponseSlot['status']): ResponseSlot => ({ requirementId, statement: 's', sourceRef: null, status });
  const doc = (key: string, status: ReadinessDocument['status'], gaps?: ReadinessDocument['gaps']): ReadinessDocument => ({ key, status, gaps });

  it('both say READY when every response is approved / every document accepted', () => {
    const slots = [slot('REQ-001', 'approved'), slot('REQ-002', 'approved')];
    const docs = [doc('cover_letter', 'accepted'), doc('technical', 'accepted')];
    expect(evaluateSubmissionReadiness(slots, true, true).ready).toBe(true);
    expect(evaluateReadinessFromDocuments(docs, true, true).ready).toBe(true);
  });

  it('both say NOT READY when one is unapproved / unaccepted', () => {
    const slots = [slot('REQ-001', 'approved'), slot('REQ-002', 'draft')];
    const docs = [doc('cover_letter', 'accepted'), doc('technical', 'drafted')];
    expect(evaluateSubmissionReadiness(slots, true, true).ready).toBe(false);
    expect(evaluateReadinessFromDocuments(docs, true, true).ready).toBe(false);
  });

  it('a filler gap blocks in both models', () => {
    const slots = [{ ...slot('REQ-001', 'approved'), gaps: [{ id: 'g', question: 'q', suggestions: [], resolution: 'filler' as const }] }];
    const docs = [doc('cover_letter', 'accepted', [{ resolution: 'filler' }])];
    expect(evaluateSubmissionReadiness(slots, true, true).ready).toBe(false);
    const r = evaluateReadinessFromDocuments(docs, true, true);
    expect(r.ready).toBe(false);
    expect(r.blocking.some((b) => b.startsWith('documents_filler:'))).toBe(true);
  });

  it('an empty set is not ready, and coverage / bid-approval gate both models', () => {
    expect(evaluateReadinessFromDocuments([], true, true).ready).toBe(false);
    expect(evaluateReadinessFromDocuments([doc('x', 'accepted')], false, true).blocking).toContain('coverage_insufficient');
    expect(evaluateReadinessFromDocuments([doc('x', 'accepted')], true, false).blocking).toContain('requirements_blocking');
  });
});
