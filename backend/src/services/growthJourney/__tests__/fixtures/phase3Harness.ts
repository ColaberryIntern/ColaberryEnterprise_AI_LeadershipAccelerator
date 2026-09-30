import type { GrowthJourneyFlags } from '../../../../config/growthJourneyFlags';
import type { SubjectAnchor } from '../../subjectResolver';
import { AS_OF, brandRow, contactFor, policyRowFor, programRow, type GjBrandSlug, type ShadowFixture } from './phase3Fixtures';

/**
 * T313 — the harness the shadow-run suites share: the Sequelize boundary as
 * jest functions, and one `arrange` that makes the whole world answer for a
 * fixture.
 *
 * ─── WHAT IS REAL, AND WHAT ANSWERS FROM THE FIXTURE ────────────────────────
 *
 * REAL: T311's writer and its read-only loader, T307's and T308's lifecycles,
 * T306's scorer, T309's and T310's strategies with Explorer's own generators,
 * T303's pipeline with Explorer's arbiter, freshness gate and contact policy,
 * the offer gate (over policy rows served from the SEED definitions), T305's
 * content gate, the row builder and the idempotent append.
 *
 * FROM THE FIXTURE, at the module boundary each already owns a suite for:
 * the subject resolver (T211), the contact-evidence resolver (T304), the
 * lifecycle-source counter and the learner-facts loader (T311/T309), the
 * latest-classification read (T229's `latestClassification`, routed to the
 * classification row the fixture states), and the profile upsert (T307, the
 * one write the run owns — asserted, never made). The models the loader and
 * the gates read answer as rows.
 *
 * A test file declares the `jest.mock` lines itself (they are hoisted per
 * file) with factories that `require` this module, so both suites drive the
 * same world.
 */

export const m = {
  brandFindByPk: jest.fn(),
  programFindOne: jest.fn(),
  leadFindByPk: jest.fn(),
  profileFindOne: jest.fn(),
  explorerProfileFindByPk: jest.fn(),
  handoffFindOne: jest.fn(),
  // T506: the loader's approved-flow read; null is the shipped state (no flow campaign exists).
  campaignFindOne: jest.fn(),
  decisionCreate: jest.fn(),
  decisionFindOne: jest.fn(),
  classificationFindOne: jest.fn(),
  contentRuleFindAll: jest.fn(),
  contentAssetFindAll: jest.fn(),
  leadTenantContextFindAll: jest.fn(),
  enrollmentFindByPk: jest.fn(),
  enrollmentFindAll: jest.fn(),
  explorerProfileFindOne: jest.fn(),
  enrollmentLeadFindOne: jest.fn(),
  subscriptionFindOne: jest.fn(),
  policyFindOne: jest.fn(),
  resolveSubject: jest.fn(),
  resolveContactEvidence: jest.fn(),
  loadLifecycleSourceCounts: jest.fn(),
  loadLearnerFacts: jest.fn(),
  upsertProfile: jest.fn(),
  /** T410: `EventLedger.create` behind the real ledger adapter, for the suites that assert the decision's ledger row. */
  ledgerCreate: jest.fn(),
};

/** The `../../../models` index, as the loader, the writer, the gates and the resolver see it. */
export const modelsMock = {
  Brand: { findByPk: (...a: unknown[]) => m.brandFindByPk(...a) },
  JourneyProgram: { findOne: (...a: unknown[]) => m.programFindOne(...a) },
  Lead: { findByPk: (...a: unknown[]) => m.leadFindByPk(...a) },
  Enrollment: { findByPk: (...a: unknown[]) => m.enrollmentFindByPk(...a), findAll: (...a: unknown[]) => m.enrollmentFindAll(...a) },
  // T407: the real resolver's lead -> enrolment walk and customer fact, when a test requires the actual module.
  EnrollmentLead: { findOne: (...a: unknown[]) => m.enrollmentLeadFindOne(...a) },
  Subscription: { findOne: (...a: unknown[]) => m.subscriptionFindOne(...a) },
  CommunityMember: {},
  LeadTenantContext: { findAll: (...a: unknown[]) => m.leadTenantContextFindAll(...a) },
  GrowthJourneyProfile: { findOne: (...a: unknown[]) => m.profileFindOne(...a) },
  ExplorerJourneyProfile: { findByPk: (...a: unknown[]) => m.explorerProfileFindByPk(...a), findOne: (...a: unknown[]) => m.explorerProfileFindOne(...a) },
  GrowthJourneyHandoff: { findOne: (...a: unknown[]) => m.handoffFindOne(...a) },
  Campaign: { findOne: (...a: unknown[]) => m.campaignFindOne(...a) },
  GrowthJourneyDecision: {
    create: (...a: unknown[]) => m.decisionCreate(...a),
    findOne: (...a: unknown[]) => m.decisionFindOne(...a),
  },
  GrowthJourneyClassification: { findOne: (...a: unknown[]) => m.classificationFindOne(...a), findAll: jest.fn() },
  GrowthJourneyContentRule: { findAll: (...a: unknown[]) => m.contentRuleFindAll(...a) },
  ExplorerContentAsset: { findAll: (...a: unknown[]) => m.contentAssetFindAll(...a) },
};

export const policyModelMock = { BrandOfferPolicy: { findOne: (...a: unknown[]) => m.policyFindOne(...a), findAll: jest.fn() } };

export const flags = (): GrowthJourneyFlags => ({
  growthJourneyEnabled: true,
  journeySignalIngest: false,
  journeyClassification: false,
  journeyDecisions: true,
  journeyHandoffs: false,
  journeyExecution: false,
});

export interface ArrangeOptions {
  /** Brands whose policy an operator has approved content for (reaches the per-asset gate). */
  contentReady?: ReadonlySet<GjBrandSlug>;
}

/** The persisted rows of this arrangement, keyed by idempotency key: the unique index, in memory. */
export const persisted = new Map<string, Record<string, unknown>>();

/** Make every boundary answer for one fixture. */
export function arrange(f: ShadowFixture, opts: ArrangeOptions = {}): void {
  for (const fn of Object.values(m)) fn.mockReset();
  persisted.clear();
  const brand = brandRow(f.brand);
  const program = programRow(f.brand);

  m.resolveSubject.mockImplementation(async (anchor: SubjectAnchor) => ({
    status: 'resolved',
    subject: {
      lead_id: f.subject.lead_id,
      // T211's rule, restated here because the mock stands in for it: a lead
      // anchor never yields an enrolment; an enrollment anchor carries its own.
      enrollment_id: anchor.enrollmentId ? f.subject.enrollment_id : null,
      visitor_id: null,
      org_member_id: null,
      email_normalized: f.subject.email,
      brand_relationships: [],
      // T407: a customer is a PAID one; a fixture states it, and none of Phase 3's do.
      customer: f.subject.customer ?? { paid: false, basis: 'none' },
    },
  }));
  m.brandFindByPk.mockImplementation(async (id: string) => (id === brand.id ? { ...brand } : null));
  m.programFindOne.mockImplementation(async (q: { where: { brand_id: string } }) => (q.where.brand_id === brand.id ? { ...program } : null));
  m.leadFindByPk.mockImplementation(async (id: number) => (f.lead && id === f.lead.id ? { ...f.lead } : null));
  m.classificationFindOne.mockResolvedValue(f.classification ? { ...f.classification } : null);
  m.profileFindOne.mockResolvedValue(f.profile ? { ...f.profile } : null);
  m.explorerProfileFindByPk.mockImplementation(async (id: string) =>
    f.learner && id === f.learner.enrollment_id ? { created_at: new Date('2026-08-01T00:00:00Z'), scores_computed_at: new Date('2026-09-15T06:00:00Z') } : null,
  );
  m.loadLifecycleSourceCounts.mockResolvedValue({ ...f.counts });
  m.loadLearnerFacts.mockResolvedValue(f.learner ? { status: 'learner', facts: f.learner } : { status: 'no_learner_profile', reason: 'no_profile_row' });
  m.resolveContactEvidence.mockResolvedValue(contactFor(f.contact));
  m.policyFindOne.mockImplementation(async (q: { where: { brand_id: string; offer_family: string } }) =>
    policyRowFor(q.where.brand_id, q.where.offer_family, opts.contentReady ?? new Set()),
  );
  m.handoffFindOne.mockResolvedValue(null);
  m.campaignFindOne.mockResolvedValue(null);
  m.enrollmentFindAll.mockResolvedValue([]);
  m.explorerProfileFindOne.mockResolvedValue(null);
  m.enrollmentLeadFindOne.mockResolvedValue(null);
  m.subscriptionFindOne.mockResolvedValue(null);
  m.contentRuleFindAll.mockResolvedValue([]);
  m.contentAssetFindAll.mockResolvedValue([]);
  m.leadTenantContextFindAll.mockResolvedValue([]);
  m.upsertProfile.mockResolvedValue({ profileId: `gp-${f.key}`, previousState: f.profile?.state ?? null, stateChanged: true, transitionId: 't-1', transitionReplayed: false });

  // The unique index on idempotency_key, honoured in memory so a replay is a real replay.
  m.decisionCreate.mockImplementation(async (row: Record<string, unknown>) => {
    const key = String(row.idempotency_key);
    if (persisted.has(key)) {
      const err = new Error('duplicate key value violates unique constraint "growth_journey_decisions_idempotency_unique"') as Error & { name: string; parent?: unknown };
      err.name = 'SequelizeUniqueConstraintError';
      err.parent = { code: '23505' };
      throw err;
    }
    const stored = { id: `d-${persisted.size + 1}`, ...row };
    persisted.set(key, stored);
    return stored;
  });
  m.decisionFindOne.mockImplementation(async (q: { where: { idempotency_key: string } }) => persisted.get(q.where.idempotency_key) ?? null);
}

export const anchorOf = (f: ShadowFixture): SubjectAnchor => ('enrollmentId' in f.anchor ? { enrollmentId: f.anchor.enrollmentId } : { leadId: f.anchor.leadId });

export { AS_OF };
