import { ALI_OUTREACH_CAMPAIGN_KEY, EXPLORER_CAMPAIGN_KEYS, FLOW_CAMPAIGN_KEYS, REGISTERED_CAMPAIGN_KEYS } from './campaignKeys';

/**
 * The plans behind `scripts/growthJourneyExecutionSetup.ts` (Phase 5 T505). PURE:
 * rows in, a plan out, nothing read and nothing written, so the whole decision
 * table is unit-tested and the script is a thin loader around it.
 *
 * Two subcommands, two plans:
 *
 *   register-campaigns   stamp the colaberry tenant and colaberry-training brand
 *                        on the eight Explorer campaigns WHERE NULL, and merge the
 *                        `ali_personal_outreach` key into the existing Ali campaign
 *                        (stamping its home too). Never over a different value:
 *                        a mismatch is a refusal, and one refusal stops the run.
 *   create-flow-drafts   create the two Layer 2 discovery-question campaigns as
 *                        DRAFT, unapproved, in test mode, with a one-step INACTIVE
 *                        sequence. Nothing about them can send until a human
 *                        approves the campaign and activates the sequence.
 *
 * Every production run of the script is Ali's. This loop only ever dry-runs.
 */

export interface CampaignRowView {
  id: string;
  name: string;
  tenant_id: string | null;
  brand_id: string | null;
  settings: Record<string, unknown> | null;
}

export interface BrandRef {
  tenantId: string;
  brandId: string;
  tenantSlug: string;
  brandSlug: string;
}

export type BrandLookup = (tenantSlug: string, brandSlug: string) => BrandRef | null;

export type PlanStep =
  | { kind: 'stamp'; key: string; campaign_id: string; tenant_id: string; brand_id: string }
  | { kind: 'merge_key'; key: string; campaign_id: string; settings: Record<string, unknown>; tenant_id: string | null; brand_id: string | null }
  | { kind: 'create_draft'; key: string; tenant_id: string; brand_id: string; definition: FlowDraftDefinition }
  | { kind: 'skip'; key: string; reason: string }
  | { kind: 'refuse'; key: string; reason: string };

export interface Plan {
  subcommand: 'register-campaigns' | 'create-flow-drafts';
  steps: PlanStep[];
  /** Rows the plan would write. `--expect-count` must equal this. */
  writes: number;
  refusals: number;
}

/* ── register-campaigns ────────────────────────────────────────────────────── */

export interface RegisterInputs {
  /** The Explorer campaigns found by `settings.campaign_key`, keyed by key; absent when not seeded. */
  explorer: Record<string, CampaignRowView | null>;
  /** The existing Ali campaign, found by name and type exactly as its cron finds it. */
  ali: CampaignRowView | null;
  brand: BrandLookup;
}

function stampStep(key: string, row: CampaignRowView, home: BrandRef): PlanStep {
  const tenantOk = row.tenant_id === null || row.tenant_id === home.tenantId;
  const brandOk = row.brand_id === null || row.brand_id === home.brandId;
  if (!tenantOk || !brandOk) return { kind: 'refuse', key, reason: `already_stamped_differently:tenant=${row.tenant_id ?? 'null'},brand=${row.brand_id ?? 'null'}` };
  if (row.tenant_id !== null && row.brand_id !== null) return { kind: 'skip', key, reason: 'already_stamped' };
  return { kind: 'stamp', key, campaign_id: row.id, tenant_id: home.tenantId, brand_id: home.brandId };
}

export function buildRegisterPlan(inputs: RegisterInputs): Plan {
  const steps: PlanStep[] = [];

  for (const key of EXPLORER_CAMPAIGN_KEYS) {
    const reg = REGISTERED_CAMPAIGN_KEYS[key];
    const home = inputs.brand(reg.tenantSlug, reg.brandSlug);
    const row = inputs.explorer[key] ?? null;
    if (!home) steps.push({ kind: 'refuse', key, reason: `brand_missing:${reg.tenantSlug}/${reg.brandSlug}` });
    else if (!row) steps.push({ kind: 'skip', key, reason: 'campaign_not_seeded' });
    else steps.push(stampStep(key, row, home));
  }

  const aliReg = REGISTERED_CAMPAIGN_KEYS[ALI_OUTREACH_CAMPAIGN_KEY];
  const aliHome = inputs.brand(aliReg.tenantSlug, aliReg.brandSlug);
  if (!aliHome) steps.push({ kind: 'refuse', key: ALI_OUTREACH_CAMPAIGN_KEY, reason: `brand_missing:${aliReg.tenantSlug}/${aliReg.brandSlug}` });
  else if (!inputs.ali) steps.push({ kind: 'skip', key: ALI_OUTREACH_CAMPAIGN_KEY, reason: 'ali_campaign_missing' });
  else {
    const current = inputs.ali.settings ?? {};
    const existingKey = current.campaign_key;
    const stamp = stampStep(ALI_OUTREACH_CAMPAIGN_KEY, inputs.ali, aliHome);
    if (stamp.kind === 'refuse') steps.push(stamp);
    else if (existingKey !== undefined && existingKey !== ALI_OUTREACH_CAMPAIGN_KEY) {
      steps.push({ kind: 'refuse', key: ALI_OUTREACH_CAMPAIGN_KEY, reason: `ali_campaign_carries_another_key:${String(existingKey)}` });
    } else if (existingKey === ALI_OUTREACH_CAMPAIGN_KEY && stamp.kind === 'skip') {
      steps.push({ kind: 'skip', key: ALI_OUTREACH_CAMPAIGN_KEY, reason: 'already_registered' });
    } else {
      // A MERGE, never a replace: Sequelize writes JSONB wholesale, and this row's settings are not ours.
      steps.push({
        kind: 'merge_key',
        key: ALI_OUTREACH_CAMPAIGN_KEY,
        campaign_id: inputs.ali.id,
        settings: { ...current, campaign_key: ALI_OUTREACH_CAMPAIGN_KEY },
        tenant_id: inputs.ali.tenant_id ?? aliHome.tenantId,
        brand_id: inputs.ali.brand_id ?? aliHome.brandId,
      });
    }
  }

  return finish('register-campaigns', steps);
}

/* ── create-flow-drafts ────────────────────────────────────────────────────── */

export interface FlowDraftDefinition {
  key: string;
  name: string;
  description: string;
  sequenceName: string;
  /** The one step's instructions. They ask; they never state a number, a date or a status. */
  ai_instructions: string;
}

const GUARDRAILS =
  'Ask, never assert. Never state or imply a price, a cost range, a discount, a date, a start date, a deadline, a seat count, ' +
  'availability, or anything about the reader\'s consent, subscription status, or legal or compliance standing. Never promise an ' +
  'outcome, a timeline, or a named person\'s attention. Never mention a competitor. If the reader asked something these rules would ' +
  'answer, say a colleague will follow up. Plain text, under 120 words, one question per line, no links unless one approved link is supplied.';

export const FLOW_DRAFT_DEFINITIONS: readonly FlowDraftDefinition[] = Object.freeze([
  {
    key: FLOW_CAMPAIGN_KEYS.colaberryBusinessDiscoveryQuestions,
    name: 'Growth Journey — Discovery Questions (Colaberry Business)',
    description: 'Layer 2: two or three discovery questions for a Colaberry Business lead who showed intent. Draft, unapproved, test mode.',
    sequenceName: 'Growth Journey — Discovery Questions (Colaberry Business)',
    ai_instructions:
      'You are writing on behalf of Colaberry Business. Write a short, reply-aware email that asks two or three discovery questions ' +
      'about the reader\'s own situation. Permitted topics only: business training for their team, AI consulting, workflow automation, ' +
      'an application build, or a general AI project. ' + GUARDRAILS,
  },
  {
    key: FLOW_CAMPAIGN_KEYS.aiFlotationDiscoveryQuestions,
    name: 'Growth Journey — Discovery Questions (AI Flotation)',
    description: 'Layer 2: two or three discovery questions for an AI Flotation lead who showed intent. Draft, unapproved, test mode.',
    sequenceName: 'Growth Journey — Discovery Questions (AI Flotation)',
    ai_instructions:
      'You are writing on behalf of AI Flotation. Write a short, reply-aware email that asks two or three discovery questions about ' +
      'the reader\'s own situation. Permitted topics only: a consulting engagement, workflow automation, an application build, or an AI ' +
      'project. ' + GUARDRAILS,
  },
]);

export interface FlowDraftInputs {
  /** The flow campaigns found by key; absent when not yet created. */
  existing: Record<string, CampaignRowView | null>;
  brand: BrandLookup;
}

export function buildFlowDraftsPlan(inputs: FlowDraftInputs): Plan {
  const steps: PlanStep[] = [];
  for (const def of FLOW_DRAFT_DEFINITIONS) {
    const reg = REGISTERED_CAMPAIGN_KEYS[def.key];
    const home = inputs.brand(reg.tenantSlug, reg.brandSlug);
    if (!home) steps.push({ kind: 'refuse', key: def.key, reason: `brand_missing:${reg.tenantSlug}/${reg.brandSlug}` });
    else if (inputs.existing[def.key]) steps.push({ kind: 'skip', key: def.key, reason: 'already_exists' });
    else steps.push({ kind: 'create_draft', key: def.key, tenant_id: home.tenantId, brand_id: home.brandId, definition: def });
  }
  return finish('create-flow-drafts', steps);
}

/* ── shared ────────────────────────────────────────────────────────────────── */

function finish(subcommand: Plan['subcommand'], steps: PlanStep[]): Plan {
  const writes = steps.filter((s) => s.kind === 'stamp' || s.kind === 'merge_key' || s.kind === 'create_draft').length;
  const refusals = steps.filter((s) => s.kind === 'refuse').length;
  return { subcommand, steps, writes, refusals };
}

/** One line per step, for the plan a human reads before typing --confirm-production. */
export function renderPlan(plan: Plan, mode: 'dry-run' | 'write'): string[] {
  const lines = [`[${mode}] ${plan.subcommand}: ${plan.writes} write(s), ${plan.refusals} refusal(s)`];
  for (const s of plan.steps) {
    if (s.kind === 'stamp') lines.push(`  stamp        ${s.key}  tenant=${s.tenant_id} brand=${s.brand_id}`);
    else if (s.kind === 'merge_key') lines.push(`  merge_key    ${s.key}  settings.campaign_key merged (${Object.keys(s.settings).length} key(s) kept); tenant=${s.tenant_id} brand=${s.brand_id}`);
    else if (s.kind === 'create_draft') lines.push(`  create_draft ${s.key}  draft, unapproved, test mode, sequence INACTIVE; tenant=${s.tenant_id} brand=${s.brand_id}`);
    else if (s.kind === 'skip') lines.push(`  skip         ${s.key}  ${s.reason}`);
    else lines.push(`  REFUSE       ${s.key}  ${s.reason}`);
  }
  if (plan.refusals > 0) lines.push('  a refusal stops the whole run: nothing is written until it is resolved');
  return lines;
}
