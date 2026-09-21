import { ALI_OUTREACH_CAMPAIGN_KEY, EXPLORER_CAMPAIGN_KEYS, FLOW_CAMPAIGN_KEYS } from '../campaignKeys';
import {
  FLOW_DRAFT_DEFINITIONS,
  buildFlowDraftsPlan,
  buildRegisterPlan,
  renderPlan,
  type BrandRef,
  type CampaignRowView,
} from '../setupPlan';

/**
 * T505 — the setup plans, pure. What the script would write, refuse or skip,
 * decided from rows alone, so every branch is a unit test and the script is a
 * loader.
 */

const HOMES: Record<string, BrandRef> = {
  'colaberry/colaberry-training': { tenantId: 't-col', tenantSlug: 'colaberry', brandId: 'b-trn', brandSlug: 'colaberry-training' },
  'colaberry/colaberry-enterprise': { tenantId: 't-col', tenantSlug: 'colaberry', brandId: 'b-ent', brandSlug: 'colaberry-enterprise' },
  'ai-flotation/ai-flotation': { tenantId: 't-flo', tenantSlug: 'ai-flotation', brandId: 'b-flo', brandSlug: 'ai-flotation' },
};
const brand = (t: string, b: string) => HOMES[`${t}/${b}`] ?? null;

const explorerRow = (key: string, over: Partial<CampaignRowView> = {}): CampaignRowView =>
  ({ id: `c-${key}`, name: key, tenant_id: null, brand_id: null, settings: { campaign_key: key, test_mode_enabled: true, explorer_tier: 1 }, ...over });
const shipped = () => Object.fromEntries(EXPLORER_CAMPAIGN_KEYS.map((k) => [k, explorerRow(k)]));
const ali = (over: Partial<CampaignRowView> = {}): CampaignRowView =>
  ({ id: 'c-ali', name: 'Ali Personal Outreach', tenant_id: null, brand_id: null, settings: { daily_cap: 10, from_name: 'Ali' }, ...over });

describe('register-campaigns', () => {
  it('the shipped state: 8 stamps + 1 key merge = 9 writes, 0 refusals', () => {
    const plan = buildRegisterPlan({ explorer: shipped(), ali: ali(), brand });
    expect(plan).toMatchObject({ subcommand: 'register-campaigns', writes: 9, refusals: 0 });
    expect(plan.steps.filter((s) => s.kind === 'stamp')).toHaveLength(8);
    for (const s of plan.steps) if (s.kind === 'stamp') expect(s).toMatchObject({ tenant_id: 't-col', brand_id: 'b-trn' });
    const merge = plan.steps.find((s) => s.kind === 'merge_key');
    expect(merge).toMatchObject({ key: ALI_OUTREACH_CAMPAIGN_KEY, campaign_id: 'c-ali', tenant_id: 't-col', brand_id: 'b-ent' });
  });

  it('the Ali merge keeps EVERY existing settings key - a merge, never a replace', () => {
    const plan = buildRegisterPlan({ explorer: {}, ali: ali(), brand });
    const merge = plan.steps.find((s) => s.kind === 'merge_key');
    expect(merge && merge.kind === 'merge_key' && merge.settings).toEqual({ daily_cap: 10, from_name: 'Ali', campaign_key: ALI_OUTREACH_CAMPAIGN_KEY });
  });

  it('a campaign already stamped with its home is skipped; one stamped DIFFERENTLY is refused, and a refusal is never a write', () => {
    const explorer = shipped();
    explorer.explorer_next_lesson = explorerRow('explorer_next_lesson', { tenant_id: 't-col', brand_id: 'b-trn' });
    explorer.explorer_weekly_digest = explorerRow('explorer_weekly_digest', { tenant_id: 't-col', brand_id: 'b-ent' });
    const plan = buildRegisterPlan({ explorer, ali: ali(), brand });
    expect(plan.steps.find((s) => s.key === 'explorer_next_lesson')).toEqual({ kind: 'skip', key: 'explorer_next_lesson', reason: 'already_stamped' });
    expect(plan.steps.find((s) => s.key === 'explorer_weekly_digest')).toMatchObject({ kind: 'refuse', reason: 'already_stamped_differently:tenant=t-col,brand=b-ent' });
    expect(plan).toMatchObject({ writes: 7, refusals: 1 });
  });

  it('a half-stamped row (tenant set, brand NULL - the one production row) is stamped, not refused', () => {
    const explorer = { explorer_enrollment_ready: explorerRow('explorer_enrollment_ready', { tenant_id: null, brand_id: 'b-trn' }) };
    const plan = buildRegisterPlan({ explorer, ali: null, brand });
    expect(plan.steps.find((s) => s.key === 'explorer_enrollment_ready')).toMatchObject({ kind: 'stamp', tenant_id: 't-col', brand_id: 'b-trn' });
  });

  it('the Ali campaign carrying ANOTHER key is refused; already carrying ours and stamped is a skip; missing is a skip', () => {
    expect(buildRegisterPlan({ explorer: {}, ali: ali({ settings: { campaign_key: 'something_else' } }), brand }).steps.at(-1))
      .toMatchObject({ kind: 'refuse', reason: 'ali_campaign_carries_another_key:something_else' });
    expect(buildRegisterPlan({ explorer: {}, ali: ali({ tenant_id: 't-col', brand_id: 'b-ent', settings: { campaign_key: ALI_OUTREACH_CAMPAIGN_KEY } }), brand }).steps.at(-1))
      .toEqual({ kind: 'skip', key: ALI_OUTREACH_CAMPAIGN_KEY, reason: 'already_registered' });
    expect(buildRegisterPlan({ explorer: {}, ali: null, brand }).steps.at(-1)).toEqual({ kind: 'skip', key: ALI_OUTREACH_CAMPAIGN_KEY, reason: 'ali_campaign_missing' });
  });

  it('an unseeded Explorer campaign is a skip, and a missing brand row is a refusal', () => {
    expect(buildRegisterPlan({ explorer: {}, ali: null, brand }).steps[0]).toEqual({ kind: 'skip', key: EXPLORER_CAMPAIGN_KEYS[0], reason: 'campaign_not_seeded' });
    const plan = buildRegisterPlan({ explorer: shipped(), ali: ali(), brand: () => null });
    expect(plan.refusals).toBe(9);
    expect(plan.writes).toBe(0);
  });
});

describe('create-flow-drafts', () => {
  it('creates the two drafts in their own brands, and skips one that exists', () => {
    const plan = buildFlowDraftsPlan({ existing: {}, brand });
    expect(plan).toMatchObject({ subcommand: 'create-flow-drafts', writes: 2, refusals: 0 });
    expect(plan.steps).toEqual([
      expect.objectContaining({ kind: 'create_draft', key: FLOW_CAMPAIGN_KEYS.colaberryBusinessDiscoveryQuestions, tenant_id: 't-col', brand_id: 'b-ent' }),
      expect.objectContaining({ kind: 'create_draft', key: FLOW_CAMPAIGN_KEYS.aiFlotationDiscoveryQuestions, tenant_id: 't-flo', brand_id: 'b-flo' }),
    ]);
    const again = buildFlowDraftsPlan({ existing: { [FLOW_CAMPAIGN_KEYS.aiFlotationDiscoveryQuestions]: explorerRow('x') }, brand });
    expect(again.steps[1]).toEqual({ kind: 'skip', key: FLOW_CAMPAIGN_KEYS.aiFlotationDiscoveryQuestions, reason: 'already_exists' });
    expect(again.writes).toBe(1);
  });

  it('the AI Flotation instructions never name training, a price, a date or a seat count - the brand boundary and the never-state rule', () => {
    const flo = FLOW_DRAFT_DEFINITIONS.find((d) => d.key === FLOW_CAMPAIGN_KEYS.aiFlotationDiscoveryQuestions)!;
    const text = `${flo.name} ${flo.description} ${flo.ai_instructions}`;
    expect(text).not.toMatch(/train|course|curricul|cohort start/i);
    expect(text).not.toMatch(/\$|\d+\s*seats?|January|February|March|April|May |June|July|August|September|October|November|December/i);
    // The Colaberry Business one MAY name business training - that brand offers it (the control).
    const biz = FLOW_DRAFT_DEFINITIONS.find((d) => d.key === FLOW_CAMPAIGN_KEYS.colaberryBusinessDiscoveryQuestions)!;
    expect(biz.ai_instructions).toMatch(/business training/);
  });

  it('both sets of instructions carry the never-state guardrails, and ask rather than assert', () => {
    for (const def of FLOW_DRAFT_DEFINITIONS) {
      expect(def.ai_instructions).toMatch(/Never state or imply a price/);
      expect(def.ai_instructions).toMatch(/consent, subscription status, or legal or compliance standing/);
      expect(def.ai_instructions).toMatch(/Ask, never assert/);
      expect(def.ai_instructions).toMatch(/under 120 words/);
    }
  });
});

describe('renderPlan', () => {
  it('prints one line per step and says a refusal stops the run', () => {
    const lines = renderPlan(buildRegisterPlan({ explorer: { explorer_next_lesson: explorerRow('explorer_next_lesson', { brand_id: 'b-ent' }) }, ali: null, brand }), 'dry-run');
    expect(lines[0]).toMatch(/^\[dry-run\] register-campaigns: 0 write\(s\), 1 refusal\(s\)/);
    expect(lines.some((l) => /REFUSE\s+explorer_next_lesson/.test(l))).toBe(true);
    expect(lines.at(-1)).toMatch(/a refusal stops the whole run/);
  });
});
