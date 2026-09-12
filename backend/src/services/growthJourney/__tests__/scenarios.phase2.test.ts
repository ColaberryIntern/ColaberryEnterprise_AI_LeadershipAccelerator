import * as fs from 'fs';
import * as path from 'path';
import { classifyInput } from '../classification/classify';
import { PROGRAM_SLUGS } from '../../../seeds/growthJourney/journeyProgramDefinitions';
import { ECOSYSTEM_SEED } from '../../../seeds/ecosystemSeedData';
import { allowedFamiliesFor } from '../../../seeds/growthJourney/offerPolicyDefinitions';
import { ENTRY_POINT_RULES } from '../classification/classificationRules';
import { UNAVAILABLE, type ClassificationResult } from '../classification/types';
import {
  ENTRY_FIXTURES,
  brandBySlug,
  brandForHostname,
  brandForSource,
  fixtureBrands,
  fixtureOptions,
  formFor,
  inputFor,
  webHostnames,
} from './fixtures/phase2Fixtures';

/**
 * T230 — the Phase 2 exit criterion, as automated tests and as the demo
 * script: "test fixtures from every website/channel are assigned correctly,
 * including Colaberry Business build services and AI Flotation's hard
 * training exclusion." Every fixture is derived from the seeds that define
 * the ecosystem; every expectation is stated in `phase2Fixtures.ts`.
 */

const SRC = path.join(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const opts = fixtureOptions();

type Row = { fixture: string; brand: string | null; program: string | null; path: string | null; step: number; review: boolean };
const demo: Row[] = [];
const record = (fixture: string, r: ClassificationResult) =>
  demo.push({ fixture, brand: r.brand_relationship, program: r.journey_program, path: r.primary_path, step: r.source_step, review: r.requires_human_review });

afterAll(() => {
  // The demo script the spec asks for: one line per fixture with its result.
  const width = Math.max(...demo.map((d) => d.fixture.length));
  const lines = demo.map((d) => `${d.fixture.padEnd(width)}  ${String(d.brand).padEnd(24)} ${String(d.program).padEnd(16)} ${String(d.path).padEnd(30)} step ${d.step} ${d.review ? 'REVIEW' : ''}`);
  console.info(`\nPhase 2 fixtures — ${demo.length} classified\n${lines.join('\n')}\n`);
});

describe('every seeded (source, entry) pair', () => {
  it('the fixture list covers every seeded entry point exactly once, and every rule key', () => {
    const seed = read('seeds/seedLeadSources.ts');
    const seeded = [...seed.matchAll(/^\s*slug: '([a-z_]+)',/gm)].map((m) => m[1]).filter((s) => !buildSourceSet().has(s));
    expect([...new Set(seeded)].sort()).toEqual(ENTRY_FIXTURES.map((f) => f.entry).sort());
    expect(Object.keys(ENTRY_POINT_RULES).sort()).toEqual(ENTRY_FIXTURES.map((f) => f.entry).sort());
  });

  for (const f of ENTRY_FIXTURES) {
    it(`${f.source}/${f.entry} (${f.prod_accepted} accepted in prod) → ${f.expect.brand} / ${f.expect.program ?? 'no programme'} / ${f.expect.path ?? 'no path'} / step ${f.expect.step}${f.expect.review ? ' / review' : ''}`, async () => {
      const brand = brandForSource(f.source);
      expect(brand?.brand_slug).toBe(f.expect.brand);
      const r = await classifyInput(inputFor(brand, { form: formFor(f.entry) }), opts);
      record(`${f.source}/${f.entry}`, r);
      expect(r.brand_relationship).toBe(f.expect.brand);
      expect(r.journey_program).toBe(f.expect.program);
      expect(r.primary_path).toBe(f.expect.path);
      expect(r.source_step).toBe(f.expect.step);
      expect(r.requires_human_review).toBe(f.expect.review);
      if (f.expect.intent) expect(r.intent).toBe(f.expect.intent);
      // never a family the brand may not offer
      if (r.primary_path) expect(allowedFamiliesFor(brand!.tenant_slug, brand!.brand_slug)).toContain(r.primary_path);
    });
  }
});

describe('every web hostname resolves to its brand, with no leakage', () => {
  const hosts = webHostnames();

  it('the seed defines web hostnames for every brand (non-vacuous)', () => {
    expect(hosts.length).toBeGreaterThanOrEqual(12);
    expect(hosts).toEqual(expect.arrayContaining(['aiflotation.com', 'opportunitylift.org', 'training.colaberry.com', 'colaberry.ai']));
  });

  it('colaberry.com is an EMAIL hostname, not a web one: a browser visit there resolves no brand context, by design', async () => {
    expect(webHostnames()).not.toContain('colaberry.com');
    const purposes = ECOSYSTEM_SEED.flatMap((t) => t.brands.flatMap((b) => b.domains.filter((d) => d.hostname === 'colaberry.com').map((d) => d.purpose)));
    expect(purposes).toEqual(['email']);
    // The live resolver looks the hostname up with purpose 'web' (tenantResolver.ts) and finds nothing,
    // so the ladder runs with no source brand: no relationship, no programme, a human looks.
    const r = await classifyInput(inputFor(null), opts);
    record('host colaberry.com (email purpose → no context)', r);
    expect(r.brand).toBeNull();
    expect(r.journey_program).toBeNull();
    expect(r.primary_path).toBeNull();
    expect(r.requires_human_review).toBe(true);
    expect(r.source_step).toBe(8);
  });

  for (const host of webHostnames()) {
    it(`${host} → its brand's programme, nothing more`, async () => {
      const brand = brandForHostname(host)!;
      expect(brand).toBeTruthy();
      const r = await classifyInput(inputFor(brand), opts);
      record(`host ${host}`, r);
      expect(r.brand_relationship).toBe(brand.brand_slug);
      expect(r.journey_program).toBe(brand.default_program_slug);
      expect(r.primary_path).toBeNull(); // no family is named by a bare visit
      expect(r.requires_human_review).toBe(false);
    });
  }

  it('AI Flotation hostnames: business training asked for on any of them is refused and referred (Scenario F, per host)', async () => {
    const afHosts = hosts.filter((h) => brandForHostname(h)?.brand_slug === 'ai-flotation');
    expect(afHosts.length).toBeGreaterThanOrEqual(2);
    for (const h of afHosts) {
      const r = await classifyInput(inputFor(brandForHostname(h), { form: formFor('workflow_intake', 'we need business training for our team') }), opts);
      record(`host ${h} + business training`, r);
      expect(r.primary_path).toBeNull();
      expect(r.requires_human_review).toBe(true);
      expect(r.evidence).toContain('brand_boundary:explicit_deny');
      expect(r.referral_target_brand_id).toBe(brandBySlug('colaberry-enterprise').brand_id);
    }
  });

  it('a learner-brand hostname never yields a service family, and a service-brand hostname never yields a learner family', async () => {
    const training = await classifyInput(inputFor(brandForHostname('training.colaberry.com'), { form: formFor(null, 'can you automate our onboarding') }), opts);
    expect(training.primary_path).toBeNull();
    expect(training.requires_human_review).toBe(true);
    const enterprise = await classifyInput(inputFor(brandForHostname('colaberry.ai'), { form: formFor(null, null, 'enrollment') }), opts);
    expect(enterprise.primary_path).toBeNull();
    expect(enterprise.requires_human_review).toBe(true);
  });
});

describe('the reply channels', () => {
  it('an email reply to a registered Enterprise campaign, from a lead who arrived via CPN (Scenario G)', async () => {
    const r = await classifyInput(inputFor(brandBySlug('cpn'), {
      campaign: { campaign_id: 'camp-1', campaign_key: 'enterprise_q3', brand: brandBySlug('colaberry-enterprise'), offer_family: null, interest_group: null },
      reply: { body: 'Interested — can you automate our reporting?', channel: 'email' },
    }), opts);
    record('reply email → enterprise campaign', r);
    expect(r).toMatchObject({ brand_relationship: 'colaberry-enterprise', journey_program: PROGRAM_SLUGS.colaberryEnterprise, primary_path: 'workflow_automation', source_step: 6 });
  });

  it('an SMS reply that opts out is recorded as such, terminal, no review', async () => {
    const r = await classifyInput(inputFor(brandBySlug('colaberry-training'), { reply: { body: 'STOP', channel: 'sms' } }), opts);
    record('reply sms STOP', r);
    expect(r.intent).toBe('opt_out');
    expect(r.primary_path).toBeNull();
    expect(r.requires_human_review).toBe(false);
  });
});

describe('scenarios A–J (§16), as tests', () => {
  it('A — CPN free-training signup keeps CPN attribution, the CPN learner programme, and no consulting/build content', async () => {
    const r = await classifyInput(inputFor(brandForSource('cpn'), { form: formFor('free_training_interest', 'I want to learn AI, when does the free class start?') }), opts);
    record('A cpn free training', r);
    expect(r).toMatchObject({ brand_relationship: 'cpn', journey_program: PROGRAM_SLUGS.cpn, primary_path: 'learner_free_training' });
    expect(['ai_consulting', 'workflow_automation', 'application_build', 'ai_project', 'paid_discovery', 'business_training']).not.toContain(r.primary_path);
  });

  it('B — a Training explorer who visits enrolment content advances toward paid training only with evidence', async () => {
    const r = await classifyInput(inputFor(brandBySlug('colaberry-training'), { behaviour: { page_categories: { program: 4, enroll: 1 } } }), opts);
    record('B training explorer enroll visit', r);
    expect(r).toMatchObject({ brand_relationship: 'colaberry-training', primary_path: 'learner_paid_training', source_step: 5 });
    const silent = await classifyInput(inputFor(brandBySlug('colaberry-training'), { behaviour: { page_categories: { program: 4 } } }), opts);
    expect(silent.primary_path).toBeNull();
  });

  it('C — Colaberry Business: training for 50 employees → Business Training', async () => {
    const r = await classifyInput(inputFor(brandForSource('colaberry'), { form: formFor('request_demo_form', 'We need AI training for 50 employees across two offices') }), opts);
    record('C enterprise team training', r);
    expect(r).toMatchObject({ brand_relationship: 'colaberry-enterprise', journey_program: PROGRAM_SLUGS.colaberryEnterprise, primary_path: 'business_training', requires_human_review: false });
  });

  it('D — Colaberry Business: workflow automation → Workflow Automation, not Business Training', async () => {
    const r = await classifyInput(inputFor(brandForSource('colaberry'), { form: formFor('request_demo_form', 'Looking to automate client onboarding end to end') }), opts);
    record('D enterprise workflow', r);
    expect(r.primary_path).toBe('workflow_automation');
  });

  it('E — AI Flotation: an application request → Application Build', async () => {
    const r = await classifyInput(inputFor(brandForSource('ai-flotation'), { form: formFor('workflow_intake', 'We want you to build an application for our dispatch team') }), opts);
    record('E flotation app build', r);
    expect(r).toMatchObject({ brand_relationship: 'ai-flotation', primary_path: 'application_build', requires_human_review: false });
  });

  it('F — AI Flotation asked for business training: blocked, recorded, referred to Colaberry Business — never pretended', async () => {
    const r = await classifyInput(inputFor(brandForSource('ai-flotation'), { form: formFor('workflow_intake', 'we need business training for our whole team') }), opts);
    record('F flotation training request', r);
    expect(r.primary_path).toBeNull();
    expect(r.requires_human_review).toBe(true);
    expect(r.evidence).toContain('brand_boundary:explicit_deny');
    expect(r.referral_target_brand_id).toBe(brandBySlug('colaberry-enterprise').brand_id);
    expect(r.brand_relationship).toBe('ai-flotation'); // the source is preserved; the transition is REQUESTED, not made
  });

  it('H — one person, two isolated brand relationships: each classified under its own brand, each with its own answer', async () => {
    const training = await classifyInput(inputFor(brandBySlug('colaberry-training'), { subject_ref: 'lead:77', form: formFor(null, null, 'enrollment') }), opts);
    const enterprise = await classifyInput(inputFor(brandBySlug('colaberry-enterprise'), { subject_ref: 'lead:77', form: formFor('request_demo_form', 'automate our intake') }), opts);
    record('H same person, training', training);
    record('H same person, enterprise', enterprise);
    expect(training).toMatchObject({ brand_relationship: 'colaberry-training', primary_path: 'learner_paid_training' });
    expect(enterprise).toMatchObject({ brand_relationship: 'colaberry-enterprise', primary_path: 'workflow_automation' });
    expect(training.brand?.brand_id).not.toBe(enterprise.brand?.brand_id);
  });

  it('J — unavailable inputs are marked unavailable, excluded from the decision, never zeroed', async () => {
    const r = await classifyInput(inputFor(brandBySlug('colaberry-enterprise'), { form: UNAVAILABLE, behaviour: UNAVAILABLE, account: UNAVAILABLE }), opts);
    record('J unavailable inputs', r);
    expect(r.steps_considered.find((s) => s.step === 2)?.outcome).toBe('unavailable');
    expect(r.evidence).toEqual(expect.arrayContaining(['explicit_selection:unavailable', 'step5:behaviour:unavailable', 'step5:account:unavailable']));
    expect(r.journey_program).toBe(PROGRAM_SLUGS.colaberryEnterprise);
    expect(r.confidence).toBeGreaterThan(0);
  });
});

describe('the lead paths that bypass ingest reach the classifier only through the reply hook or a manual trigger', () => {
  it('the three bypass paths do not call the classifier or the routing engine', () => {
    for (const rel of ['controllers/leadController.ts', 'controllers/sponsorController.ts', 'services/alumniReferralService.ts']) {
      const src = read(rel);
      expect({ rel, classify: /classifySubject|evaluateAndDispatch|recordReplyClassification/.test(src) }).toEqual({ rel, classify: false });
    }
  });

  it('both reply webhooks carry the hook, twice each (opt-out branch and normal path)', () => {
    for (const rel of ['controllers/mandrillWebhookController.ts', 'controllers/ghlWebhookController.ts']) {
      const n = (read(rel).match(/recordReplyClassification\(/g) ?? []).length;
      expect({ rel, calls: n }).toEqual({ rel, calls: 2 });
    }
  });

  it('every ecosystem brand is either a Growth Journey brand with policy rows or a brand with none — nothing in between', () => {
    for (const b of fixtureBrands()) {
      const allowed = allowedFamiliesFor(b.tenant_slug, b.brand_slug);
      const isGj = ['cpn', 'colaberry-training', 'colaberry-enterprise', 'ai-flotation'].includes(b.brand_slug);
      expect({ brand: b.brand_slug, hasPolicy: allowed.length > 0 }).toEqual({ brand: b.brand_slug, hasPolicy: isGj });
    }
  });
});

function buildSourceSet(): Set<string> {
  // Source slugs appear in the same seed file with the same `slug:` shape; exclude them by the ecosystem map.
  const s = new Set<string>();
  for (const b of fixtureBrands()) for (const src of ENTRY_FIXTURES.map((f) => f.source)) s.add(src);
  return s;
}
