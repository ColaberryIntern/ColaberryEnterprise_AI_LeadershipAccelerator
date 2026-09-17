import * as fs from 'fs';
import * as path from 'path';

const m = {
  loadDecisionContext: jest.fn(),
  decisionCreate: jest.fn(),
  decisionCount: jest.fn(),
  upsertProfile: jest.fn(),
};

jest.mock('../../models', () => ({
  GrowthJourneyDecision: { create: (...a: unknown[]) => m.decisionCreate(...a), count: (...a: unknown[]) => m.decisionCount(...a) },
  GrowthJourneyClassification: { findAll: jest.fn() },
}));
jest.mock('../../services/growthJourney/decision/loadDecisionContext', () => ({
  loadDecisionContext: (...a: unknown[]) => m.loadDecisionContext(...a),
  NO_LEARNER_PROFILE_STATE: 'NO_LEARNER_PROFILE',
}));
jest.mock('../../services/growthJourney/profileService', () => ({ upsertProfile: (...a: unknown[]) => m.upsertProfile(...a) }));
jest.mock('../../services/growthJourney/offerEligibility', () => ({
  assertOfferAllowed: async () => ({ allowed: true, reason: 'test', rule_id: null }),
  resolveOfferEligibility: async () => ({ allowed: true, reason: 'test', rule_id: null }),
  OfferNotEligibleError: class extends Error {},
}));
jest.mock('../../services/growthJourney/journeyContent', () => ({
  resolveJourneyContent: async (c: { required_assets: Array<{ asset_type: string }> }) => ({
    assets: [],
    gaps: c.required_assets.map((q) => `content_purpose_unsupported:${q.asset_type}`),
  }),
}));

import { DRY_RUN_FLAGS, parseArgs, runDryRun } from '../growthJourneyDecideDryRun';
import { businessStrategy } from '../../services/growthJourney/strategies/businessCandidates';
import { bizCtx } from '../../services/growthJourney/__tests__/fixtures/b2bFixtures';

/**
 * T311 — the dry-run: prints a decision for one real subject and writes nothing.
 *
 * "Writes nothing" is asserted the only way it can be here: the decision
 * model's `create` and T307's `upsertProfile` are both mocked and both must
 * be uncalled after a run. The count-before-equals-count-after check the plan
 * names is the live form of the same assertion, run by T315 against dev1.
 */

function loaded() {
  const c = bizCtx();
  return {
    status: 'loaded',
    ctx: c,
    strategy: businessStrategy,
    subject: { lead_id: 501, enrollment_id: null, visitor_id: null, org_member_id: null, email_normalized: 'x@example.com', brand_relationships: [], customer: { paid: false, basis: 'none' } },
    program: { id: 'p-ent', slug: 'business-growth', kind: 'business', status: 'draft' },
    brand: { id: 'b-ent', slug: 'colaberry-enterprise', tenant_id: 't-col' },
    lifecycle: { state: c.state, stateEnteredAt: c.asOf, overlays: c.overlays, evidence: [], projected: true },
    previousProfile: { state: null, state_entered_at: null, created_at: null },
    returnToAi: { active: false, handoff_id: null, cooldown_until: null, reason: null },
    unavailable: [],
  };
}

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  m.loadDecisionContext.mockResolvedValue(loaded());
});

describe('parseArgs', () => {
  it('requires a subject, a brand and --no-persist', () => {
    expect(() => parseArgs(['--lead', '501', '--brand', 'b-ent'])).toThrow(/--no-persist is required/);
    expect(() => parseArgs(['--brand', 'b-ent', '--no-persist'])).toThrow(/--lead <id> or --enrollment <id>/);
    expect(() => parseArgs(['--lead', '501', '--no-persist'])).toThrow(/--brand <brand uuid> is required/);
    expect(() => parseArgs(['--lead', '0', '--brand', 'b', '--no-persist'])).toThrow(/positive integer/);
    expect(parseArgs(['--lead', '501', '--brand', 'b-ent', '--no-persist'])).toEqual({ leadId: 501, enrollmentId: null, brandId: 'b-ent', noPersist: true });
    expect(parseArgs(['--enrollment', 'enr-1', '--brand', 'b-trn', '--no-persist'])).toEqual({ leadId: null, enrollmentId: 'enr-1', brandId: 'b-trn', noPersist: true });
  });

  it('the flags it runs under can decide and can NEVER execute', () => {
    // Asserted as the whole object: the dark-launch guard forbids a dotted
    // sub-flag read anywhere, tests included, and this file is no exception.
    expect(DRY_RUN_FLAGS).toEqual({
      growthJourneyEnabled: true,
      journeySignalIngest: false,
      journeyClassification: false,
      journeyDecisions: true,
      journeyHandoffs: false,
      journeyExecution: false,
    });
    expect(Object.isFrozen(DRY_RUN_FLAGS)).toBe(true);
  });
});

describe('runDryRun', () => {
  it('prints a decision for the subject and writes nothing', async () => {
    const lines: string[] = [];
    const code = await runDryRun(parseArgs(['--lead', '501', '--brand', 'b-ent', '--no-persist']), (l) => lines.push(l), bizCtx().asOf);
    expect(code).toBe(0);
    const printed = JSON.parse(lines.join('\n'));
    expect(printed).toMatchObject({
      dry_run: true,
      persisted: false,
      subject: 'lead:501',
      brand: 'colaberry-enterprise',
      program: { kind: 'business', status: 'draft' },
      state: 'EXPLORING_SOLUTIONS',
      lifecycle_projected: true,
    });
    expect(printed.decision.selected_action).toBe('WAIT');
    expect(printed.decision.reason).toBe('content_gap:content_purpose_unsupported:capability_education');
    expect(printed.decision.candidates).toEqual([{ action: 'SEND_EMAIL', tier: 7, channel: 'email', purposes: ['capability_education'] }]);
    // Nothing was written: not a decision row, not a projection.
    expect(m.decisionCreate).not.toHaveBeenCalled();
    expect(m.upsertProfile).not.toHaveBeenCalled();
  });

  it('a refusal is still a decision, and still exit 0', async () => {
    m.loadDecisionContext.mockResolvedValue({ ...loaded(), ctx: bizCtx({ state: 'CUSTOMER', overlays: [] }) });
    const lines: string[] = [];
    expect(await runDryRun(parseArgs(['--lead', '501', '--brand', 'b-ent', '--no-persist']), (l) => lines.push(l))).toBe(0);
    expect(JSON.parse(lines.join('\n')).decision.reason).toBe('hard_stop:converted');
  });

  it('a subject that does not resolve is exit 2 with the reason, and nothing printed that names a person', async () => {
    m.loadDecisionContext.mockResolvedValue({ status: 'unresolved', reason: 'no_such_lead' });
    const lines: string[] = [];
    expect(await runDryRun(parseArgs(['--lead', '9', '--brand', 'b-ent', '--no-persist']), (l) => lines.push(l))).toBe(2);
    expect(JSON.parse(lines[0])).toEqual({ dry_run: true, persisted: false, brand_id: 'b-ent', status: 'unresolved', reason: 'no_such_lead' });
  });

  it('the output carries no address and no message text', async () => {
    const lines: string[] = [];
    await runDryRun(parseArgs(['--lead', '501', '--brand', 'b-ent', '--no-persist']), (l) => lines.push(l));
    const text = lines.join('\n');
    expect(text).not.toContain('@');
    expect(text).not.toContain('x@example.com');
    // The loaded context HAD an address; the printer did not carry it through.
    expect(loaded().subject.email_normalized).toContain('@');
  });
});

describe('what the script is, by source', () => {
  it('imports no flags module, no mailer and no model client - it cannot act whatever the environment says', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'growthJourneyDecideDryRun.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const banned of ['process.env', 'enrollLeadInSequence', 'sendEmail', 'mandrill', 'openai', 'anthropic', 'upsertProfile', 'GrowthJourneyDecision']) {
      expect({ banned, present: code.includes(banned) }).toEqual({ banned, present: false });
    }
    // The flags module is reached for its TYPE only: every import of it is `import type`.
    const flagImports = code.match(/import[^;]*from '\.\.\/config\/growthJourneyFlags'/g) ?? [];
    expect(flagImports.length).toBeGreaterThan(0);
    for (const line of flagImports) expect(line.startsWith('import type')).toBe(true);
    expect(code).toContain('--no-persist is required');
  });
});
