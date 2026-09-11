import { OFFER_FAMILIES } from '../../../../models/OfferFamily';
import { allowedFamiliesFor } from '../../../../seeds/growthJourney/offerPolicyDefinitions';
import { PROGRAM_SLUGS } from '../../../../seeds/growthJourney/journeyProgramDefinitions';
import type { EligibilityDecision } from '../../offerEligibility';
import { classifyInput } from '../classify';
import { CONFIDENCE } from '../classificationRules';
import {
  RULESET_VERSION,
  STEP_ORDER,
  UNAVAILABLE,
  type AiProposal,
  type BrandContext,
  type ClassificationInput,
  type ClassifyOptions,
} from '../types';

/**
 * T223 — the §7.1 ladder.
 *
 * The eligibility table here is DERIVED from the shipped policy definitions
 * (`allowedFamiliesFor`), not restated, so the AI Flotation exclusion these
 * tests prove is the one production seeds. Scenario names are the spec's.
 */

const brand = (slug: string, tenant: string, program: string | null): BrandContext => ({
  tenant_id: `t-${tenant}`,
  brand_id: `b-${slug}`,
  brand_slug: slug,
  default_program_slug: program,
});

const CPN = brand('cpn', 'cpn', PROGRAM_SLUGS.cpn);
const TRAINING = brand('colaberry-training', 'colaberry', PROGRAM_SLUGS.colaberryTraining);
const ENTERPRISE = brand('colaberry-enterprise', 'colaberry', PROGRAM_SLUGS.colaberryEnterprise);
const FLOTATION = brand('ai-flotation', 'ai-flotation', PROGRAM_SLUGS.aiFlotation);
const BRANDS = [CPN, TRAINING, ENTERPRISE, FLOTATION];

const allowedOf = (b: BrandContext): string[] => allowedFamiliesFor(b.tenant_id.slice(2), b.brand_slug);

function decision(brandId: string, family: string): EligibilityDecision {
  const b = BRANDS.find((x) => x.brand_id === brandId);
  const allowed = Boolean(b && allowedOf(b).includes(family));
  const known = (OFFER_FAMILIES as readonly string[]).includes(family);
  return {
    allowed,
    reason: !known ? 'unknown_offer_family' : allowed ? 'allowed' : b?.brand_slug === 'ai-flotation' ? 'explicit_deny' : 'no_policy',
    brand_id: brandId,
    offer_family: family,
    policy_id: allowed ? `p-${brandId}-${family}` : null,
    approved_content_ready: false,
  };
}

const eligibility = jest.fn(async (brandId: string, family: string) => decision(brandId, family));
const allowedFamilies = jest.fn(async (brandId: string) => {
  const b = BRANDS.find((x) => x.brand_id === brandId);
  return b ? allowedOf(b) : [];
});
const allowingBrands = jest.fn(async (family: string) =>
  BRANDS.filter((b) => allowedOf(b).includes(family)).map((b) => ({ brand_id: b.brand_id, brand_slug: b.brand_slug })),
);

const opts = (extra: Partial<ClassifyOptions> = {}): ClassifyOptions => ({ eligibility, allowedFamilies, allowingBrands, ...extra });

const form = (f: Partial<NonNullable<Exclude<ClassificationInput['form'], 'unavailable'>>> = {}) => ({
  entry_slug: null, entry_type: null, form_type: null, interest_area: null, explicit_offer_family: null, message: null, ...f,
});

const input = (i: Partial<ClassificationInput> = {}): ClassificationInput => ({
  subject_ref: 'lead:1',
  lock: null,
  form: null,
  campaign: null,
  source_brand: null,
  account: null,
  behaviour: null,
  reply: null,
  ...i,
});

beforeEach(() => {
  eligibility.mockClear();
  allowedFamilies.mockClear();
  allowingBrands.mockClear();
});

describe('the step order is the spec’s, literally', () => {
  it('names the eight §7.1 steps in order', () => {
    expect([...STEP_ORDER]).toEqual([
      'human_lock',
      'explicit_selection',
      'campaign_entry_contract',
      'source_domain_default',
      'observed_behaviour_and_account',
      'reply_rules',
      'ai_fallback',
      'low_confidence_default',
    ]);
  });

  it('every result carries the ruleset version and a trace for all eight steps', async () => {
    const r = await classifyInput(input({ source_brand: CPN }), opts());
    expect(r.ruleset_version).toBe(RULESET_VERSION);
    expect(r.steps_considered.map((s) => s.step)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('each step fires only when the earlier ones abstain', () => {
  it('step 2 wins over step 3 when both would answer (message beats entry point)', async () => {
    const r = await classifyInput(
      input({ source_brand: ENTERPRISE, form: form({ entry_slug: 'request_demo_form', message: 'we want to automate client onboarding' }) }),
      opts(),
    );
    expect(r.primary_path).toBe('workflow_automation');
    expect(r.source_step).toBe(2);
    // step 3 still contributed evidence, but did not decide
    expect(r.evidence).toContain('step3:entry_point:request_demo_form->business_training');
  });

  it('step 3 decides when step 2 abstains (entry point with no message)', async () => {
    const r = await classifyInput(input({ source_brand: FLOTATION, form: form({ entry_slug: 'workflow_intake' }) }), opts());
    expect(r.primary_path).toBe('workflow_automation');
    expect(r.source_step).toBe(3);
  });

  it('step 4 decides brand and programme when steps 2-3 abstain', async () => {
    const r = await classifyInput(input({ source_brand: TRAINING, form: form({ entry_slug: 'not_a_known_entry' }) }), opts());
    expect(r.brand_relationship).toBe('colaberry-training');
    expect(r.journey_program).toBe(PROGRAM_SLUGS.colaberryTraining);
    expect(r.primary_path).toBeNull();
    expect(r.source_step).toBe(4);
  });

  it('step 4 names a path only when the brand can offer exactly one family', async () => {
    const one = brand('one-family', 'x', 'p');
    const single = await classifyInput(input({ source_brand: one }), opts({
      allowedFamilies: async () => ['ai_consulting'],
      eligibility: async (b, f) => ({ allowed: true, reason: 'allowed', brand_id: b, offer_family: f, policy_id: 'p', approved_content_ready: false }),
    }));
    expect(single.primary_path).toBe('ai_consulting');
    expect(single.confidence).toBe(CONFIDENCE.source_single_family);
    const many = await classifyInput(input({ source_brand: ENTERPRISE }), opts());
    expect(many.primary_path).toBeNull();
  });

  it('step 5 fills a path from behaviour only when nothing earlier named one', async () => {
    const r = await classifyInput(input({ source_brand: TRAINING, behaviour: { page_categories: { pricing: 2, program: 5 } } }), opts());
    expect(r.primary_path).toBe('learner_paid_training');
    expect(r.source_step).toBe(5);
    const earlier = await classifyInput(
      input({ source_brand: TRAINING, form: form({ interest_area: 'enrollment' }), behaviour: { page_categories: { pricing: 2 } } }),
      opts(),
    );
    expect(earlier.source_step).toBe(2);
  });

  it('step 6 classifies a reply when the form said nothing', async () => {
    const r = await classifyInput(input({ source_brand: ENTERPRISE, reply: { body: 'Yes, we need a workflow for onboarding', channel: 'email' } }), opts());
    expect(r.primary_path).toBe('workflow_automation');
    expect(r.source_step).toBe(6);
  });

  it('an opt-out reply is terminal: recorded, no path, no model, no review', async () => {
    const ai = jest.fn(async (): Promise<AiProposal | null> => null);
    const r = await classifyInput(input({ source_brand: TRAINING, reply: { body: 'please unsubscribe me', channel: 'email' } }), opts({ ai }));
    expect(r.intent).toBe('opt_out');
    expect(r.primary_path).toBeNull();
    expect(r.requires_human_review).toBe(false);
    expect(r.source_step).toBe(6); // the terminal answer decided, even without a path
    expect(ai).not.toHaveBeenCalled();
    expect(r.steps_considered.find((s) => s.step === 7)?.outcome).toBe('skipped');
  });

  it('step 7 runs only for unresolved free text, and never when a path exists', async () => {
    const ai = jest.fn(async (): Promise<AiProposal | null> => ({
      brand_relationship: 'colaberry-enterprise', journey_program: null, primary_path: 'ai_project', secondary_paths: [],
      intent: 'pilot', confidence: 0.8, evidence: ['mentions a pilot'], requires_human_review: false, model_version: 'gpt-4o-mini@p1',
    }));
    const resolved = await classifyInput(input({ source_brand: ENTERPRISE, form: form({ message: 'automate our intake' }) }), opts({ ai }));
    expect(ai).not.toHaveBeenCalled();
    expect(resolved.ai_involved).toBe(false);

    const ambiguous = await classifyInput(input({ source_brand: ENTERPRISE, form: form({ message: 'hello, curious about what you do' }) }), opts({ ai }));
    expect(ai).toHaveBeenCalledTimes(1);
    expect(ambiguous.primary_path).toBe('ai_project');
    expect(ambiguous.source_step).toBe(7);
    expect(ambiguous.ai_involved).toBe(true);
    expect(ambiguous.model_version).toBe('gpt-4o-mini@p1');
  });

  it('step 7 is never consulted when there is no free text to read, even with a model wired', async () => {
    // A mutation that deleted this gate survived attempt 1: nothing asked a
    // wired model to stay quiet on an empty form.
    const ai = jest.fn(async (): Promise<AiProposal | null> => ({
      brand_relationship: null, journey_program: null, primary_path: 'ai_project', secondary_paths: [],
      intent: null, confidence: 0.9, evidence: [], requires_human_review: false, model_version: 'm',
    }));
    const r = await classifyInput(input({ source_brand: ENTERPRISE, form: form({ entry_slug: 'not_a_known_entry' }) }), opts({ ai }));
    expect(ai).not.toHaveBeenCalled();
    expect(r.ai_involved).toBe(false);
    expect(r.steps_considered.find((s) => s.step === 7)).toMatchObject({ outcome: 'skipped', note: 'no free text to read' });
    expect(r.primary_path).toBeNull();
  });

  it('step 8 does NOT ask for review at low confidence when there was no free text (nurture instead)', async () => {
    // The other survivor: with only a source brand the confidence is 0.4, below
    // the review line — review is for text nobody could read, not for silence.
    const r = await classifyInput(input({ source_brand: CPN }), opts());
    expect(r.confidence).toBeLessThan(CONFIDENCE.review_below);
    expect(r.requires_human_review).toBe(false);
    expect(r.evidence).toContain('step8:safe_default_nurture');
    expect(r.evidence).not.toContain('step8:review:free_text_unresolved');
    expect(r.journey_program).toBe(PROGRAM_SLUGS.cpn);
  });

  it('step 7 is skipped, not failed, when no model is wired', async () => {
    const r = await classifyInput(input({ source_brand: ENTERPRISE, form: form({ message: 'hello, curious about what you do' }) }), opts());
    expect(r.steps_considered.find((s) => s.step === 7)).toMatchObject({ outcome: 'skipped' });
  });

  it('step 8: unresolved free text → review; no free text → safe default nurture', async () => {
    const review = await classifyInput(input({ source_brand: ENTERPRISE, form: form({ message: 'hello, curious about what you do' }) }), opts());
    expect(review.requires_human_review).toBe(true);
    expect(review.evidence).toContain('step8:review:free_text_unresolved');
    const nurture = await classifyInput(input({ source_brand: CPN, form: form({ entry_slug: 'newsletter_footer' }) }), opts());
    expect(nurture.requires_human_review).toBe(false);
    expect(nurture.journey_program).toBe(PROGRAM_SLUGS.cpn);
    expect(nurture.evidence).toContain('step8:safe_default_nurture');
  });
});

describe('the pair matrix: when steps n and n+1 would BOTH answer, n wins', () => {
  // A synthetic single-family brand so step 4 can name a path (ENTERPRISE
  // allows six and therefore never does). Eligibility for it is a plain allow.
  const ONE = brand('one-family', 'one', 'one-program');
  const oneOpts = (extra: Partial<ClassifyOptions> = {}) => opts({
    allowedFamilies: async (b) => (b === ONE.brand_id ? ['workflow_automation'] : allowedFamilies(b)),
    eligibility: async (b, f) => (b === ONE.brand_id
      ? { allowed: f === 'workflow_automation', reason: f === 'workflow_automation' ? 'allowed' : 'no_policy', brand_id: b, offer_family: f, policy_id: 'p', approved_content_ready: false }
      : decision(b, f)),
    ...extra,
  });

  it('(1,2) a lock beats an explicit interest_area', async () => {
    const r = await classifyInput(input({
      source_brand: TRAINING,
      form: form({ interest_area: 'enrollment' }), // step 2 would say learner_paid_training
      lock: { classification_id: 'c9', brand_relationship: 'colaberry-training', journey_program: 'learner', primary_path: 'learner_certification', secondary_paths: [], intent: null, decided_by: 'human:admin-2' },
    }), opts());
    expect(r.source_step).toBe(1);
    expect(r.primary_path).toBe('learner_certification');
    expect(r.steps_considered.find((s) => s.step === 2)).toMatchObject({ outcome: 'skipped' });
  });

  it('(2,3) an explicit message beats the entry-point contract', async () => {
    const r = await classifyInput(input({ source_brand: ENTERPRISE, form: form({ entry_slug: 'request_demo_form', message: 'automate our intake' }) }), opts());
    expect(r.source_step).toBe(2);
    expect(r.primary_path).toBe('workflow_automation');
  });

  it('(3,4) an entry-point contract beats the single-family source default', async () => {
    const r = await classifyInput(input({ source_brand: ONE, form: form({ entry_slug: 'workflow_intake' }) }), oneOpts());
    expect(r.source_step).toBe(3);
    expect(r.primary_path).toBe('workflow_automation');
    expect(r.evidence).toContain('step4:single_family:workflow_automation'); // step 4 still spoke, did not decide
  });

  it('(4,5) the single-family source default beats a behaviour hint', async () => {
    const r = await classifyInput(input({ source_brand: ONE, behaviour: { page_categories: { pricing: 1 } } }), oneOpts());
    expect(r.source_step).toBe(4);
    expect(r.primary_path).toBe('workflow_automation');
    expect(r.evidence).toContain('step5:page_category:pricing');
  });

  it('(5,6) a behaviour hint beats a reply rule', async () => {
    const r = await classifyInput(input({
      source_brand: TRAINING,
      behaviour: { page_categories: { pricing: 1 } },
      reply: { body: 'can you automate our reporting?', channel: 'email' },
    }), opts());
    expect(r.source_step).toBe(5);
    expect(r.primary_path).toBe('learner_paid_training');
    expect(r.evidence).toContain('step6:reply_rule:automation');
  });

  it('(6,7) a reply rule beats a wired model', async () => {
    const ai = jest.fn(async (): Promise<AiProposal | null> => null);
    const r = await classifyInput(input({ source_brand: ENTERPRISE, reply: { body: 'please build us an app', channel: 'sms' } }), opts({ ai }));
    expect(r.source_step).toBe(6);
    expect(ai).not.toHaveBeenCalled();
  });

  it('(7,8) a model path beats the low-confidence default', async () => {
    const ai = async (): Promise<AiProposal> => ({
      brand_relationship: null, journey_program: null, primary_path: 'ai_consulting', secondary_paths: [],
      intent: null, confidence: 0.7, evidence: [], requires_human_review: false, model_version: 'm',
    });
    const r = await classifyInput(input({ source_brand: ENTERPRISE, form: form({ message: 'not sure what we need yet' }) }), opts({ ai }));
    expect(r.source_step).toBe(7);
    expect(r.steps_considered.find((s) => s.step === 8)).toMatchObject({ outcome: 'skipped' });
  });
});

describe('the brand boundary — nothing is exempt', () => {
  it('AI Flotation asking for business training: path dropped, review, referral to Colaberry Enterprise (Scenario F)', async () => {
    const r = await classifyInput(input({ source_brand: FLOTATION, form: form({ entry_slug: 'workflow_intake', message: 'we need business training for our team' }) }), opts());
    expect(r.primary_path).toBeNull();
    expect(r.requires_human_review).toBe(true);
    expect(r.evidence).toContain('brand_boundary:explicit_deny');
    expect(r.referral_target_brand_id).toBe(ENTERPRISE.brand_id);
    expect(r.evidence).toContain('referral:target:colaberry-enterprise');
    expect(r.eligibility).toMatchObject({ allowed: false, reason: 'explicit_deny', brand_id: FLOTATION.brand_id, offer_family: 'business_training' });
    // the check was made against the policy, not skipped
    expect(eligibility).toHaveBeenCalledWith(FLOTATION.brand_id, 'business_training');
  });

  it('control: AI Flotation asking for workflow automation passes cleanly', async () => {
    const r = await classifyInput(input({ source_brand: FLOTATION, form: form({ entry_slug: 'workflow_intake', message: 'automate our client onboarding' }) }), opts());
    expect(r.primary_path).toBe('workflow_automation');
    expect(r.requires_human_review).toBe(false);
    expect(r.referral_target_brand_id).toBeNull();
    expect(r.evidence).toContain('brand_boundary:allowed');
  });

  it('a model proposal naming a denied family is dropped the same way', async () => {
    const ai = async (): Promise<AiProposal> => ({
      brand_relationship: 'ai-flotation', journey_program: null, primary_path: 'business_training', secondary_paths: ['learner_paid_training', 'ai_consulting'],
      intent: 'training', confidence: 0.9, evidence: ['asked about training'], requires_human_review: false, model_version: 'm1',
    });
    const r = await classifyInput(input({ source_brand: FLOTATION, form: form({ message: 'what can you offer us?' }) }), opts({ ai }));
    expect(r.ai_involved).toBe(true);
    expect(r.primary_path).toBeNull();
    expect(r.requires_human_review).toBe(true);
    expect(r.evidence).toContain('brand_boundary:explicit_deny');
    // secondary paths are filtered by the same policy: the learner one goes, consulting stays
    expect(r.secondary_paths).toEqual(['ai_consulting']);
    expect(r.evidence).toContain('secondary_dropped:learner_paid_training:explicit_deny');
  });

  it('a model proposal naming an unknown family is dropped and flagged', async () => {
    const ai = async (): Promise<AiProposal> => ({
      brand_relationship: null, journey_program: null, primary_path: 'quantum_consulting', secondary_paths: [],
      intent: null, confidence: 0.9, evidence: [], requires_human_review: false, model_version: 'm1',
    });
    const r = await classifyInput(input({ source_brand: ENTERPRISE, form: form({ message: 'anything' }) }), opts({ ai }));
    expect(r.primary_path).toBeNull();
    expect(r.evidence).toContain('step7:model_returned_unknown_family');
    expect(r.requires_human_review).toBe(true);
  });

  it('even a human lock is re-checked against policy', async () => {
    const r = await classifyInput(input({
      source_brand: FLOTATION,
      lock: { classification_id: 'c1', brand_relationship: 'ai-flotation', journey_program: 'service-growth', primary_path: 'business_training', secondary_paths: [], intent: null, decided_by: 'human:admin-1' },
    }), opts());
    expect(r.source_step).toBe(1);
    expect(r.primary_path).toBeNull();
    expect(r.evidence).toContain('brand_boundary:explicit_deny');
    expect(r.requires_human_review).toBe(true);
  });

  it('a family only two brands allow yields no single referral target (ambiguous)', async () => {
    // learner families: CPN allows free training + community; Training allows all five.
    const r = await classifyInput(input({ source_brand: FLOTATION, form: form({ explicit_offer_family: 'learner_free_training' }) }), opts());
    expect(r.primary_path).toBeNull();
    expect(r.referral_target_brand_id).toBeNull();
    expect(r.evidence).toContain('referral:ambiguous:colaberry-training,cpn');
  });

  it('no brand context at all → no path can be validated → review', async () => {
    const r = await classifyInput(input({ form: form({ message: 'automate everything' }) }), opts());
    expect(r.primary_path).toBeNull();
    expect(r.brand_relationship).toBeNull();
    expect(r.requires_human_review).toBe(true);
    expect(r.evidence).toContain('brand_boundary:no_brand');
    expect(eligibility).not.toHaveBeenCalled();
  });

  it('an eligibility lookup that throws is a denial, and says so', async () => {
    const r = await classifyInput(input({ source_brand: ENTERPRISE, form: form({ message: 'automate everything' }) }), opts({
      eligibility: async () => { throw new Error('db down'); },
    }));
    expect(r.primary_path).toBeNull();
    expect(r.evidence).toContain('eligibility:lookup_failed');
    expect(r.evidence).toContain('brand_boundary:lookup_failed');
    expect(r.requires_human_review).toBe(true);
    // and it proposes NO referral: a failed lookup says nothing about which
    // brand should have this person (a mutation that referred anyway survived
    // until this line existed)
    expect(r.referral_target_brand_id).toBeNull();
    expect(allowingBrands).not.toHaveBeenCalled();
  });

  it('a lapsed or inactive policy refuses without proposing a referral either', async () => {
    const r = await classifyInput(input({ source_brand: ENTERPRISE, form: form({ message: 'automate everything' }) }), opts({
      eligibility: async (b, f) => ({ allowed: false, reason: 'policy_inactive', brand_id: b, offer_family: f, policy_id: 'p', approved_content_ready: false }),
    }));
    expect(r.primary_path).toBeNull();
    expect(r.evidence).toContain('brand_boundary:policy_inactive');
    expect(r.referral_target_brand_id).toBeNull();
    expect(allowingBrands).not.toHaveBeenCalled();
  });
});

describe('scenarios from the spec (§16)', () => {
  it('C — Colaberry Business, training for 50 employees → business_training', async () => {
    const r = await classifyInput(input({ source_brand: ENTERPRISE, form: form({ entry_slug: 'request_demo_form', message: 'We need AI training for 50 employees across two offices' }) }), opts());
    expect(r).toMatchObject({ brand_relationship: 'colaberry-enterprise', journey_program: PROGRAM_SLUGS.colaberryEnterprise, primary_path: 'business_training', requires_human_review: false });
  });

  it('D — Colaberry Business, workflow automation → workflow_automation, not business_training', async () => {
    const r = await classifyInput(input({ source_brand: ENTERPRISE, form: form({ entry_slug: 'request_demo_form', message: 'Looking to automate client onboarding end to end' }) }), opts());
    expect(r.primary_path).toBe('workflow_automation');
    expect(r.intent).toBe('automation_request');
  });

  it('A — CPN free-training signup keeps CPN and the learner programme', async () => {
    const r = await classifyInput(input({ source_brand: CPN, form: form({ entry_slug: 'free_training_interest' }) }), opts());
    expect(r).toMatchObject({ brand_relationship: 'cpn', journey_program: PROGRAM_SLUGS.cpn, primary_path: 'learner_free_training', source_step: 3 });
  });

  it('E — AI Flotation application request → application_build', async () => {
    const r = await classifyInput(input({ source_brand: FLOTATION, form: form({ entry_slug: 'workflow_intake', message: 'We want you to build an application for our dispatch team' }) }), opts());
    expect(r.primary_path).toBe('application_build');
  });

  it('G — a reply to a registered campaign is classified under the CAMPAIGN’s brand', async () => {
    const r = await classifyInput(input({
      source_brand: CPN, // where the lead first arrived
      campaign: { campaign_id: 'c-9', campaign_key: 'enterprise_cold_q3', brand: ENTERPRISE, offer_family: null, interest_group: null },
      reply: { body: 'Interested — can you help us automate reporting?', channel: 'email' },
    }), opts());
    expect(r.brand_relationship).toBe('colaberry-enterprise');
    expect(r.journey_program).toBe(PROGRAM_SLUGS.colaberryEnterprise);
    expect(r.primary_path).toBe('workflow_automation');
    expect(r.evidence).toContain('step3:campaign_brand_only');
    expect(eligibility).toHaveBeenCalledWith(ENTERPRISE.brand_id, 'workflow_automation');
  });

  it('J — unavailable inputs are recorded as unavailable, never zeroed, and do not lower confidence', async () => {
    const r = await classifyInput(input({ source_brand: TRAINING, form: form({ interest_area: 'enrollment' }), behaviour: UNAVAILABLE, account: UNAVAILABLE }), opts());
    expect(r.primary_path).toBe('learner_paid_training');
    expect(r.confidence).toBe(CONFIDENCE.explicit);
    expect(r.evidence).toEqual(expect.arrayContaining(['step5:behaviour:unavailable', 'step5:account:unavailable']));
    expect(r.confidence).not.toBe(0);
    const formGone = await classifyInput(input({ source_brand: TRAINING, form: UNAVAILABLE }), opts());
    expect(formGone.steps_considered.find((s) => s.step === 2)?.outcome).toBe('unavailable');
    expect(formGone.journey_program).toBe(PROGRAM_SLUGS.colaberryTraining);
  });
});

describe('evidence never carries the text it fired on', () => {
  it('a message with an email address and a name leaves no trace in evidence', async () => {
    const r = await classifyInput(input({ source_brand: ENTERPRISE, form: form({ message: 'Hi, I am Jane Roe (jane.roe@example.com), automate our CRM please' }) }), opts());
    const blob = JSON.stringify(r.evidence) + JSON.stringify(r.steps_considered);
    expect(blob).not.toContain('@');
    expect(blob).not.toMatch(/jane/i);
    expect(r.primary_path).toBe('workflow_automation');
  });
});
