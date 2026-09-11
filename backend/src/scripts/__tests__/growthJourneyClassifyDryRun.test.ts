/**
 * T225 — the dry-run script: prints the deterministic answer for one lead,
 * writes nothing, calls no model, and its output carries no person text.
 */
import * as fs from 'fs';
import * as path from 'path';

const loadClassificationInput = jest.fn();
const create = jest.fn();

jest.mock('../../services/growthJourney/classification/inputs', () => ({
  loadClassificationInput: (...a: unknown[]) => loadClassificationInput(...a),
}));
jest.mock('../../models', () => ({
  GrowthJourneyClassification: { create: (...a: unknown[]) => create(...a) },
  GrowthJourneyTransition: { create: (...a: unknown[]) => create(...a) },
  GrowthJourneyEnrollment: { create: (...a: unknown[]) => create(...a) },
}));
jest.mock('../../models/BrandOfferPolicy', () => ({ BrandOfferPolicy: { findAll: jest.fn(), findOne: jest.fn() } }));
jest.mock('../../models/Brand', () => ({ __esModule: true, default: { findAll: jest.fn() } }));

import { parseArgs, runDryRun } from '../growthJourneyClassifyDryRun';
import { classificationResultSchema } from '../../schemas/growthJourneyClassificationSchema';
import type { ClassifyOptions } from '../../services/growthJourney/classification/types';

const FLOTATION = { tenant_id: 't-af', brand_id: 'b-af', brand_slug: 'ai-flotation', default_program_slug: null };
const opts: ClassifyOptions = {
  eligibility: async (brandId, offerFamily) => ({
    allowed: offerFamily === 'workflow_automation', reason: offerFamily === 'workflow_automation' ? 'allowed' : 'explicit_deny',
    brand_id: brandId, offer_family: offerFamily, policy_id: 'p', approved_content_ready: false,
  }),
  allowedFamilies: async () => ['workflow_automation', 'ai_consulting'],
  allowingBrands: async () => [{ brand_id: 'b-ent', brand_slug: 'colaberry-enterprise' }],
};

function loadedFor(message: string) {
  return {
    status: 'loaded',
    subject: { lead_id: 501, enrollment_id: null, visitor_id: null, org_member_id: null, email_normalized: 'person@example.com', brand_relationships: [] },
    brand: FLOTATION,
    unavailable: ['behaviour'],
    input: {
      subject_ref: 'lead:501', lock: null,
      form: { entry_slug: 'workflow_intake', entry_type: null, form_type: null, interest_area: null, explicit_offer_family: null, message },
      campaign: null, source_brand: FLOTATION, account: null, behaviour: 'unavailable', reply: null,
    },
  };
}

beforeEach(() => {
  loadClassificationInput.mockReset();
  create.mockReset();
});

describe('arguments', () => {
  it('requires --lead as a positive integer and --no-persist', () => {
    expect(() => parseArgs(['--no-persist'])).toThrow(/usage/);
    expect(() => parseArgs(['--lead', 'abc', '--no-persist'])).toThrow(/usage/);
    expect(() => parseArgs(['--lead', '501'])).toThrow(/--no-persist is required/);
    expect(parseArgs(['--lead', '501', '--no-persist'])).toEqual({ leadId: 501, reply: null, noPersist: true });
    expect(parseArgs(['--lead', '501', '--reply', 'hello', '--no-persist']).reply).toBe('hello');
  });
});

describe('a real lead', () => {
  it('prints valid JSON matching the result schema, writes nothing, and exits 0', async () => {
    loadClassificationInput.mockResolvedValue(loadedFor('automate our client onboarding'));
    const lines: string[] = [];
    const code = await runDryRun({ leadId: 501, reply: null, noPersist: true }, (l) => lines.push(l), opts);
    expect(code).toBe(0);
    const printed = JSON.parse(lines.join('\n'));
    expect(printed).toMatchObject({ dry_run: true, persisted: false, subject: 'lead:501', inputs_unavailable: ['behaviour'] });
    expect(classificationResultSchema.safeParse(printed.result).success).toBe(true);
    expect(printed.result.primary_path).toBe('workflow_automation');
    expect(printed.result.source_step).toBe(2);
    expect(create).not.toHaveBeenCalled();
  });

  it('the output carries no address and no message text, even when both are in the inputs', async () => {
    loadClassificationInput.mockResolvedValue(loadedFor('I am Jane Roe, jane@example.com, please automate my CRM'));
    const lines: string[] = [];
    await runDryRun({ leadId: 501, reply: null, noPersist: true }, (l) => lines.push(l), opts);
    const text = lines.join('\n');
    expect(text).not.toContain('@');
    expect(text).not.toMatch(/jane/i);
    expect(text).not.toContain('please automate my CRM');
  });

  it('passes a --reply through as an email reply', async () => {
    loadClassificationInput.mockResolvedValue(loadedFor(''));
    await runDryRun({ leadId: 501, reply: 'can you build us an app', noPersist: true }, () => {}, opts);
    expect(loadClassificationInput).toHaveBeenCalledWith({ leadId: 501 }, { reply: { body: 'can you build us an app', channel: 'email' } });
  });

  it('a lead that does not resolve → a JSON line saying so and exit 2', async () => {
    loadClassificationInput.mockResolvedValue({ status: 'unresolved', reason: 'anchor_not_found' });
    const lines: string[] = [];
    const code = await runDryRun({ leadId: 999, reply: null, noPersist: true }, (l) => lines.push(l), opts);
    expect(code).toBe(2);
    expect(JSON.parse(lines[0])).toMatchObject({ status: 'unresolved', reason: 'anchor_not_found', persisted: false });
  });
});

describe('what the script cannot do, by its own source', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'growthJourneyClassifyDryRun.ts'), 'utf8');

  it('imports neither the AI module nor the flags module', () => {
    expect(src).not.toMatch(/aiClassifier/);
    expect(src).not.toMatch(/growthJourneyFlags/);
    expect(src).not.toMatch(/makeAiClassifier/);
  });

  it('has no persisting mode: no create, no classificationService import', () => {
    expect(src).not.toMatch(/\.create\(/);
    expect(src).not.toMatch(/classificationService/);
    expect(src).toMatch(/--no-persist is required/);
  });

  it('its ladder options carry no ai hook (control: the eligibility hook is present)', () => {
    const { dryRunOptions } = jest.requireActual('../growthJourneyClassifyDryRun');
    const o = dryRunOptions();
    expect(o.ai).toBeUndefined();
    expect(typeof o.eligibility).toBe('function');
  });
});
