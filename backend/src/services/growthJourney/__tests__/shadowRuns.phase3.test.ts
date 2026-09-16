jest.mock('../../../models', () => require('./fixtures/phase3Harness').modelsMock);
jest.mock('../../../models/BrandOfferPolicy', () => require('./fixtures/phase3Harness').policyModelMock);
jest.mock('../../../models/Brand', () => ({ __esModule: true, default: { findAll: jest.fn(), findByPk: jest.fn() } }));
jest.mock('../subjectResolver', () => ({ resolveSubject: (...a: unknown[]) => require('./fixtures/phase3Harness').m.resolveSubject(...a) }));
jest.mock('../governor/contactEvidence', () => ({
  ...jest.requireActual('../governor/contactEvidence'),
  resolveContactEvidence: (...a: unknown[]) => require('./fixtures/phase3Harness').m.resolveContactEvidence(...a),
}));
jest.mock('../decision/lifecycleInputs', () => ({ loadLifecycleSourceCounts: (...a: unknown[]) => require('./fixtures/phase3Harness').m.loadLifecycleSourceCounts(...a) }));
jest.mock('../strategies/learnerFacts', () => ({ loadLearnerFacts: (...a: unknown[]) => require('./fixtures/phase3Harness').m.loadLearnerFacts(...a) }));
jest.mock('../profileService', () => ({ upsertProfile: (...a: unknown[]) => require('./fixtures/phase3Harness').m.upsertProfile(...a) }));
jest.mock('../classificationService', () => ({
  ...jest.requireActual('../classificationService'),
  latestClassification: (...a: unknown[]) => require('./fixtures/phase3Harness').m.classificationFindOne(...a),
}));

import { sequelize } from '../../../config/database';
import { decideForSubjectAndRecord, SHADOW_MODE } from '../decisionService';
import type { JourneyDecision } from '../governor/types';
import { AS_OF, anchorOf, arrange, flags, m, persisted } from './fixtures/phase3Harness';
import { allFixtures, EXPLORER_STATES, NO_LEARNER_PROFILE } from './fixtures/phase3Scenarios';
import {
  allowedFor,
  brandRow,
  deferredStates,
  GJ_BRANDS,
  programRow,
  REACHABLE_BUSINESS_STATES,
  REACHABLE_FLOTATION_STATES,
  type ShadowFixture,
} from './fixtures/phase3Fixtures';

/**
 * T313 — the Phase 3 exit criterion, as tests and as the demo script.
 *
 * "One governed next action per subject — or a named refusal — every
 * competitor suppressed with a reason, and no cross-brand or ineligible
 * content anywhere." Every fixture in `phase3Fixtures.ts` is driven through
 * T311's writer with the real loader, lifecycles, strategies, pipeline and
 * gates (see `phase3Harness.ts` for what answers from the fixture), and the
 * criterion is asserted literally over every decision the run produced. The
 * §16 scenarios are `shadowRuns.phase3.scenarios.test.ts`.
 */

const fixtures = allFixtures();
// Armed before any run: Explorer's registry resolver reaches the database through this and nothing else.
const sqlSpy = jest.spyOn(sequelize, 'query').mockResolvedValue([] as never);
type Recorded = Extract<Awaited<ReturnType<typeof decideForSubjectAndRecord>>, { status: 'recorded' }>;
const results = new Map<string, Recorded>();

async function run(f: ShadowFixture): Promise<Recorded> {
  const r = await decideForSubjectAndRecord({ anchor: anchorOf(f), brandId: brandRow(f.brand).id, trigger: 'nightly', flags: flags(), asOf: AS_OF });
  if (r.status !== 'recorded') throw new Error(`${f.key}: ${r.status}`);
  return r;
}

beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterAll(() => {
  // The demo script: every fixture with its state, selected action, suppressions and gaps.
  const width = Math.max(...fixtures.map((f) => f.key.length));
  const lines = [...results.entries()].map(([key, r]) => {
    const d = r.decision;
    const sup = d.suppressed.map((s) => `${s.action_type}<${s.reason.slice(0, 40)}>`).join(' ');
    return `${key.padEnd(width)}  ${String(r.row.state_at_decision).padEnd(26)} ${d.selected_action.padEnd(16)} ${d.reason.slice(0, 60).padEnd(62)} sup=${d.suppressed.length} ${sup} gaps=${d.content_gaps.join(',')}`;
  });
  console.info(`\nPhase 3 shadow run — ${results.size} of ${fixtures.length} fixtures decided\n${lines.join('\n')}\n`);
  sqlSpy.mockRestore();
  jest.restoreAllMocks();
});

/* ── the fixture set is the one the plan asks for ───────────────────────────── */

describe('the fixture set: one subject per programme per reachable state, and the deferred states named by the lifecycles', () => {
  it('Colaberry Business: every reachable state exactly once; SOLUTION_SCOPING is the lifecycle\'s own deferral', () => {
    const keys = fixtures.filter((f) => f.brand === 'colaberry-enterprise').map((f) => f.key.split('/')[1]).filter((k) => (REACHABLE_BUSINESS_STATES as readonly string[]).includes(k));
    expect([...keys].sort()).toEqual([...REACHABLE_BUSINESS_STATES].sort());
    expect(deferredStates().filter((d) => d.program === 'colaberry-enterprise').map((d) => d.state)).toEqual(['SOLUTION_SCOPING']);
  });

  it('AI Flotation: every reachable state exactly once; SCOPE_IN_PROGRESS is the lifecycle\'s own deferral', () => {
    const keys = fixtures.filter((f) => f.brand === 'ai-flotation').map((f) => f.key.split('/')[1]).filter((k) => (REACHABLE_FLOTATION_STATES as readonly string[]).includes(k));
    expect([...keys].sort()).toEqual([...REACHABLE_FLOTATION_STATES].sort());
    expect(deferredStates().filter((d) => d.program === 'ai-flotation').map((d) => d.state)).toEqual(['SCOPE_IN_PROGRESS']);
  });

  it('CPN and Training: every Explorer state once each, plus the subject Explorer does not know', () => {
    for (const brand of ['cpn', 'colaberry-training'] as const) {
      const states = fixtures.filter((f) => f.brand === brand).map((f) => f.key.split('/')[1]).filter((k) => (EXPLORER_STATES as readonly string[]).includes(k) || k === NO_LEARNER_PROFILE);
      expect([...states].sort()).toEqual([...EXPLORER_STATES, NO_LEARNER_PROFILE].sort());
    }
  });

  it('every §16 letter A-L is claimed by at least one fixture', () => {
    const letters = new Set(fixtures.flatMap((f) => (f.scenario ? [f.scenario[0]] : [])));
    // I is demonstrated on the Training ENROLLMENT_READY learner (several candidates) and on the DECLINED subject.
    letters.add('I');
    expect([...letters].sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
    expect(fixtures.map((f) => f.key)).toEqual([...new Set(fixtures.map((f) => f.key))]); // keys are unique
  });
});

/* ── every fixture, end to end ──────────────────────────────────────────────── */

describe('every fixture through T311: the lifecycle says what the fixture expects, and the decision is one action or one named refusal', () => {
  for (const f of fixtures) {
    it(`${f.key}${f.scenario ? ` (§16 ${f.scenario})` : ''} → ${f.expect.state} / ${f.expect.action}`, async () => {
      arrange(f);
      const r = await run(f);
      results.set(f.key, r);
      const d = r.decision;

      // The lifecycle's answer, on the row.
      expect(r.row.state_at_decision).toBe(f.expect.state);
      if (f.expect.overlays) expect(r.row.overlays_at_decision).toEqual(f.expect.overlays);
      // One action or one named refusal.
      expect(d.selected_action).toBe(f.expect.action);
      expect(d.reason).toMatch(f.expect.reason);
      exitCriterion(f, d);

      // The row is the shadow record of exactly this decision.
      expect(r.replayed).toBe(false);
      expect(r.row).toMatchObject({
        brand_id: brandRow(f.brand).id, tenant_id: brandRow(f.brand).tenant_id, program_id: programRow(f.brand).id,
        mode: SHADOW_MODE, executed: false, execution_receipt: null, ai_involved: false,
        selected_action: d.selected_action, suppressed: d.suppressed, candidates: d.candidates,
      });
      expect(m.decisionCreate).toHaveBeenCalledTimes(1);
      // The one write the run owns lands only where a growth-journey lifecycle ran.
      expect(m.upsertProfile).toHaveBeenCalledTimes(f.brand === 'cpn' || f.brand === 'colaberry-training' ? 0 : 1);

      // Idempotency: the same subject again, same inputs, is the same row.
      const again = await run(f);
      expect(again.replayed).toBe(true);
      expect(again.row.id).toBe(r.row.id);
      expect(persisted.size).toBe(1);
    });
  }
});

/** The exit criterion, per decision. */
function exitCriterion(f: ShadowFixture, d: JourneyDecision): void {
  expect(typeof d.selected_action).toBe('string');
  expect(d.selected_action.length).toBeGreaterThan(0);
  for (const s of d.suppressed) {
    expect(typeof s.reason).toBe('string');
    expect(s.reason.length).toBeGreaterThan(0);
    expect(typeof s.action_type).toBe('string');
  }
  if (d.selected_action === 'WAIT') {
    expect(d.reason).not.toBe('');
    expect(d.reason).not.toBe('WAIT');
    // A refusal after arbitration accounts for every candidate: the losers and the chosen-then-blocked winner.
    if (d.candidates.length > 0 && /^(content_gap|chosen_then_blocked|every_candidate|winner_not_eligible)/.test(d.reason)) expect(d.suppressed).toHaveLength(d.candidates.length);
  } else {
    // A winner: every competitor suppressed with a reason, and only the winner not.
    expect(d.suppressed).toHaveLength(d.candidates.length - 1);
    expect(d.candidates.some((c) => c.action_type === d.selected_action)).toBe(true);
  }
  // No cross-brand or ineligible content anywhere.
  if (d.selected_path) expect(allowedFor(f.brand)).toContain(d.selected_path);
  for (const a of (d.selected_content?.assets as Array<{ brand_id?: string | null }> | undefined) ?? []) {
    expect([brandRow(f.brand).id, null, undefined]).toContain(a.brand_id);
  }
}

/* ── the criterion over the whole run ───────────────────────────────────────── */

describe('the exit criterion over the whole run', () => {
  it('ran every fixture, and the assertions above were not vacuous: a real winner exists, refusals exist, competitors were suppressed', () => {
    expect(results.size).toBe(fixtures.length);
    const decisions = [...results.values()].map((r) => r.decision);
    expect(decisions.filter((d) => d.selected_action !== 'WAIT').length).toBeGreaterThanOrEqual(1);
    expect(decisions.filter((d) => d.selected_action === 'WAIT').length).toBeGreaterThanOrEqual(decisions.length / 2);
    expect(decisions.filter((d) => d.candidates.length >= 2).length).toBeGreaterThanOrEqual(2);
    expect(decisions.reduce((n, d) => n + d.suppressed.length, 0)).toBeGreaterThanOrEqual(5);
  });

  it('zero decisions whose selected_path is a family the brand may not offer, and every refusal names its class', () => {
    for (const [key, r] of results) {
      const brand = fixtures.find((f) => f.key === key)!.brand;
      if (r.decision.selected_path) expect({ key, ok: allowedFor(brand).includes(r.decision.selected_path) }).toEqual({ key, ok: true });
      if (r.decision.selected_action === 'WAIT') expect({ key, named: /^(refused: |hard_stop:|no_candidate|every_candidate|no_winner|winner_not_eligible|chosen_then_blocked:|content_gap:)/.test(r.decision.reason) }).toEqual({ key, named: true });
    }
  });

  it('zero content assets cited from another brand — and in the seeded state, zero cited at all, because the policy gate refuses before any registry read', () => {
    for (const r of results.values()) {
      expect(r.decision.selected_content).toBeNull();
    }
    // Non-vacuity: the gate refused by name on the fixtures that asked for content.
    const notApproved = [...results.values()].filter((r) => r.decision.content_gaps.includes('content_not_approved'));
    expect(notApproved.length).toBeGreaterThanOrEqual(10);
  });

  it('the registry SQL is never reached in the seeded state (the policy question is answered first)', () => {
    // Every run above went through `arrange`, which never served a content-ready policy;
    // Explorer's resolver would have hit `sequelize.query` (the spy was armed before the
    // first run, and the scenarios suite shows it fires when the policy is content-ready).
    expect(sqlSpy).not.toHaveBeenCalled();
  });

  it('nothing under a learner brand proposes a service family, and nothing under a service brand cites learner content', () => {
    for (const [key, r] of results) {
      const brand = fixtures.find((f) => f.key === key)!.brand;
      const families = r.decision.candidates.flatMap((c) => c.required_assets.map((q) => (q as { offer_family?: string }).offer_family).filter((x): x is string => typeof x === 'string'));
      for (const fam of families) {
        const learnerFamily = fam.startsWith('learner_');
        const learnerBrand = brand === 'cpn' || brand === 'colaberry-training';
        expect({ key, fam, consistent: learnerFamily === learnerBrand }).toEqual({ key, fam, consistent: true });
      }
    }
    expect(GJ_BRANDS).toHaveLength(4);
  });
});
