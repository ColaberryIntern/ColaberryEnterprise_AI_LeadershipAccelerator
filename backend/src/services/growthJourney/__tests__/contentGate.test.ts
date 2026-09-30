import { EXPLORER_ASSET_PURPOSES } from '../../../types/explorerGrowth';
import { decideForSubject } from '../governor/decideForSubject';
import {
  JOURNEY_PURPOSE_SPECS,
  gateJourneyPurpose,
  isJourneyPurpose,
  unsupportedJourneyPurposes,
} from '../governor/contentGate';
import { JOURNEY_CONTENT_PURPOSES, type DecideDeps, type JourneyCandidate, type JourneySubjectContext } from '../governor/types';
import { resolveJourneyContent } from '../journeyContent';
import { businessStrategy } from '../strategies/businessCandidates';
import { flotationStrategy } from '../strategies/aiFlotationCandidates';
import { deps, flags } from './fixtures/learnerFixtures';
import { bizCtx, flotCtx, withClassification } from './fixtures/b2bFixtures';

/**
 * T310 — the content gate for journey purposes, and the two B2B strategies
 * through the shared pipeline.
 *
 * The property the plan names first: a content gap produces WAIT with the gap
 * named, NEVER a substituted asset. The mutation that proves it - substitute
 * `weekly_digest` on a gap - fails the no-substitution cases below.
 */

const ALLOWED = { allowed: true, reason: 'ok', rule_id: null };

/* ── the gate ──────────────────────────────────────────────────────────────── */

describe('the journey purposes are a vocabulary Explorer does not have', () => {
  it('none of the three is an Explorer purpose, and every Explorer purpose is not a journey one', () => {
    for (const p of JOURNEY_CONTENT_PURPOSES) expect((EXPLORER_ASSET_PURPOSES as readonly string[]).includes(p)).toBe(false);
    for (const p of EXPLORER_ASSET_PURPOSES) expect(isJourneyPurpose(p)).toBe(false);
    for (const p of JOURNEY_CONTENT_PURPOSES) expect(isJourneyPurpose(p)).toBe(true);
    expect(isJourneyPurpose('anything_else')).toBe(false);
  });

  it('every journey purpose is a DECLARED gap today, each with a reason and what it needs', () => {
    // Pinned as the exact set, so flipping one to supported is a failing test
    // here and a deliberate edit, never a silent change.
    expect(unsupportedJourneyPurposes().map((u) => u.purpose)).toEqual([...JOURNEY_CONTENT_PURPOSES]);
    for (const u of unsupportedJourneyPurposes()) {
      expect(u.reason.length).toBeGreaterThan(40);
      expect(u.needs.length).toBeGreaterThan(20);
    }
  });

  it('the gap string names the purpose, and the verdict carries the declaration', () => {
    const v = gateJourneyPurpose('case_study');
    expect(v.supported).toBe(false);
    if (v.supported) return;
    expect(v.gap).toBe('content_purpose_unsupported:case_study');
    expect(v.reason).toContain('no case-study substrate');
    expect(v.needs).toContain('case-study kind');
  });

  it('the specs are frozen — the registry cannot be mutated at runtime', () => {
    expect(Object.isFrozen(JOURNEY_PURPOSE_SPECS)).toBe(true);
    expect(Object.isFrozen(JOURNEY_PURPOSE_SPECS.case_study)).toBe(true);
  });
});

/* ── through T305's resolver ───────────────────────────────────────────────── */

describe('resolveJourneyContent answers a journey purpose itself', () => {
  const candidate = (purpose: string, family = 'workflow_automation'): JourneyCandidate => ({
    action_type: 'SEND_EMAIL',
    campaign_key: null,
    priority_tier: 7,
    intra_tier_score: 50,
    channel: 'email',
    required_assets: [{ asset_type: purpose as JourneyCandidate['required_assets'][number]['asset_type'], offer_family: family, program_slug: 'business-growth' }],
    rationale: [],
  });

  it('never hands a journey purpose to Explorer\'s resolver, and names the gap', async () => {
    const resolveAssets = jest.fn();
    const r = await resolveJourneyContent(candidate('capability_education'), bizCtx(), {
      assertAllowed: async () => ALLOWED,
      resolveAssets,
      loadFacts: async () => new Map(),
    });
    expect(resolveAssets).not.toHaveBeenCalled();
    expect(r).toEqual({ assets: [], gaps: ['content_purpose_unsupported:capability_education'] });
  });

  it('but the brand policy still runs FIRST, so a refused family is refused for that reason', async () => {
    const resolveAssets = jest.fn();
    const r = await resolveJourneyContent(candidate('capability_education', 'business_training'), flotCtx(), {
      assertAllowed: async () => ({ allowed: false, reason: 'offer_not_eligible:explicit_deny', rule_id: null }),
      resolveAssets,
      loadFacts: async () => new Map(),
    });
    expect(resolveAssets).not.toHaveBeenCalled();
    expect(r.gaps).toEqual(['offer_not_eligible:explicit_deny']);
  });

  it('an Explorer purpose still goes to Explorer\'s resolver — the branch is narrow', async () => {
    const resolveAssets = jest.fn(async () => ({ resolved: false as const, reason: 'no_asset_for:weekly_digest' }));
    const r = await resolveJourneyContent(candidate('weekly_digest'), bizCtx(), {
      assertAllowed: async () => ALLOWED,
      resolveAssets: resolveAssets as never,
      loadFacts: async () => new Map(),
    });
    expect(resolveAssets).toHaveBeenCalledTimes(1);
    expect(r.gaps).toEqual(['no_asset_for:weekly_digest']);
  });
});

/* ── through the pipeline ──────────────────────────────────────────────────── */

describe('through decideForSubject, with T305\'s real gate behind the resolver seam', () => {
  const pipelineDeps = (): DecideDeps => ({
    ...deps(),
    resolveContent: (c, s) =>
      resolveJourneyContent(c, s, {
        assertAllowed: async () => ALLOWED,
        resolveAssets: jest.fn(async () => ({ resolved: false as const, reason: 'no_asset' })) as never,
        loadFacts: async () => new Map(),
      }),
  });

  it.each([
    ['Colaberry Enterprise', businessStrategy, bizCtx, 'workflow_automation'],
    ['AI Flotation', flotationStrategy, flotCtx, 'application_build'],
  ] as const)('%s: a content gap is WAIT with the gap named, and NEVER a substituted asset', async (_n, strategy, ctx, path) => {
    const out = await decideForSubject(ctx(), strategy, pipelineDeps(), flags());
    if (out.status !== 'decided') throw new Error('disabled');
    const d = out.decision;
    expect(d.selected_action).toBe('WAIT');
    expect(d.reason).toBe('content_gap:content_purpose_unsupported:capability_education');
    expect(d.content_gaps).toEqual(['content_purpose_unsupported:capability_education']);
    expect(d.selected_content).toBeNull();
    expect(d.selected_path).toBe(path);
    // The candidate that won and then waited is on the record, with its purpose.
    expect(d.candidates.map((c) => c.required_assets[0]?.asset_type)).toEqual(['capability_education']);
    // No Explorer learner purpose anywhere near a business decision.
    for (const c of d.candidates) for (const q of c.required_assets) expect(isJourneyPurpose(q.asset_type)).toBe(true);
    expect(d.suppressed.map((s) => s.reason)).toEqual(['content_gap:content_purpose_unsupported:capability_education']);
  });

  it.each([
    ['Colaberry Enterprise', businessStrategy, bizCtx, 'QUALIFIED_OPPORTUNITY'],
    ['AI Flotation', flotationStrategy, flotCtx, 'BUILD_QUALIFIED'],
  ] as const)('%s: one reply is a named refusal carrying the Layer-2 shapes it would take, never a handoff', async (_n, strategy, ctx, state) => {
    const out = await decideForSubject(ctx({ state }), strategy, pipelineDeps(), flags());
    if (out.status !== 'decided') throw new Error('disabled');
    expect(out.decision.selected_action).toBe('WAIT');
    expect(out.decision.reason).toBe(`no_candidate:qualified_state_needs_layer_2:${state}`);
    expect(out.decision.deferred_actions.map((d) => [d.would, d.payload.layer])).toEqual(expect.arrayContaining([
      ['discovery_questions', 2],
      ['scheduling_offer', 2],
    ]));
    expect(out.decision.deferred_actions.some((d) => d.would === 'create_handoff')).toBe(false);
  });

  it.each([
    ['Colaberry Enterprise', businessStrategy, bizCtx, 'DISCOVERY_READY', 'sales'],
    ['AI Flotation', flotationStrategy, flotCtx, 'DISCOVERY_READY', 'solution_architect'],
  ] as const)('%s: a commercial state is a named refusal carrying the handoff it would make', async (_n, strategy, ctx, state, owner) => {
    const out = await decideForSubject(ctx({ state }), strategy, pipelineDeps(), flags());
    if (out.status !== 'decided') throw new Error('disabled');
    expect(out.decision.selected_action).toBe('WAIT');
    expect(out.decision.reason).toBe(`no_candidate:commercial_state_needs_layer_4:${state}`);
    expect(out.decision.candidates).toEqual([]);
    expect(out.decision.deferred_actions).toContainEqual(
      { would: 'create_handoff', reason: `commercial_state:${state}`, payload: { brand: ctx().brand_slug, state, path: ctx().classification?.primary_path, layer: 4, owner } },
    );
  });

  it('a decline: the suppression wins, and nothing was proposed beside it', async () => {
    const out = await decideForSubject(bizCtx({ overlays: ['DECLINED'] }), businessStrategy, pipelineDeps(), flags());
    if (out.status !== 'decided') throw new Error('disabled');
    expect(out.decision.selected_action).toBe('SUPPRESS_CONTACT');
    expect(out.decision.selected_channel).toBe('none');
    expect(out.decision.candidates).toHaveLength(1);
  });

  it('a converted customer is a hard stop, and the deferral list is empty because there is nothing to escalate', async () => {
    // T307 stamps no NO_RESPONSE on a customer, so the overlays are empty here as they would be.
    const out = await decideForSubject(bizCtx({ state: 'CUSTOMER', overlays: [] }), businessStrategy, pipelineDeps(), flags());
    if (out.status !== 'decided') throw new Error('disabled');
    expect(out.decision.reason).toBe('hard_stop:converted');
    expect(out.decision.deferred_actions).toEqual([]);
  });

  it('AI Flotation with a business-training classification: nothing generated, and the reason names the exclusion', async () => {
    const ctx = flotCtx({ classification: withClassification({ primary_path: 'business_training' }) });
    const out = await decideForSubject(ctx, flotationStrategy, pipelineDeps(), flags());
    if (out.status !== 'decided') throw new Error('disabled');
    expect(out.decision.selected_action).toBe('WAIT');
    expect(out.decision.reason).toBe('no_candidate:flotation_excludes:business_training');
    expect(out.decision.candidates).toEqual([]);
  });

  it('a strategy without the defer hook records an empty deferral list, exactly as before T310', async () => {
    const mute = {
      program_kind: 'business' as const,
      ruleset_version: 'x',
      hardStops: (c: JourneySubjectContext) => c.hardStop,
      generate: (): JourneyCandidate[] => [],
    };
    const out = await decideForSubject(bizCtx(), mute, pipelineDeps(), flags());
    if (out.status !== 'decided') throw new Error('disabled');
    expect(out.decision.reason).toBe('no_candidate');
    expect(out.decision.deferred_actions).toEqual([]);
  });
});
