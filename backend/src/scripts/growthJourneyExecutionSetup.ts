import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { Campaign, FollowUpSequence } from '../models';
import { CAMPAIGN_NAME, CAMPAIGN_TYPE } from '../services/aliPersonalOutreachService';
import { EXPLORER_CAMPAIGN_KEYS, FLOW_CAMPAIGN_KEYS } from '../services/growthJourney/execution/campaignKeys';
import {
  buildFlowDraftsPlan,
  buildRegisterPlan,
  renderPlan,
  type BrandRef,
  type CampaignRowView,
  type Plan,
} from '../services/growthJourney/execution/setupPlan';

/**
 * Growth Journey OS — the execution setup tool (Phase 5 T505).
 *
 * Two subcommands, both DRY-RUN BY DEFAULT and both written for Ali's hand:
 *
 *   register-campaigns   stamp the tenant and brand on the eight Explorer campaigns
 *                        where NULL, and merge the `ali_personal_outreach` key into
 *                        the existing Ali campaign - never over a different value
 *   create-flow-drafts   create the two Layer 2 discovery-question campaigns as
 *                        draft, unapproved, test mode, with an INACTIVE sequence
 *
 * A write needs `--confirm-production` AND `--expect-count N` equal to the number
 * of rows the plan would write, so a plan that changed since it was read cannot
 * be applied by muscle memory. A single refusal in the plan stops the run.
 *
 *   node dist/scripts/growthJourneyExecutionSetup.js register-campaigns --dry-run
 *   node dist/scripts/growthJourneyExecutionSetup.js create-flow-drafts --dry-run
 *   node dist/scripts/growthJourneyExecutionSetup.js register-campaigns --confirm-production --expect-count 9
 *
 * Nothing here activates a campaign, approves one, or touches a sequence's
 * `is_active`: those stay a human's clicks. The decision logic lives in
 * `setupPlan.ts`, pure and unit-tested; this file only loads and applies.
 */

export interface Args {
  subcommand: 'register-campaigns' | 'create-flow-drafts';
  dryRun: boolean;
  confirmProduction: boolean;
  expectCount: number | null;
}

export function parseArgs(argv: string[]): Args {
  const [subcommand, ...rest] = argv;
  if (subcommand !== 'register-campaigns' && subcommand !== 'create-flow-drafts') {
    throw new Error(`usage: growthJourneyExecutionSetup <register-campaigns|create-flow-drafts> [--dry-run] [--confirm-production --expect-count N]`);
  }
  const out: Args = { subcommand, dryRun: true, confirmProduction: false, expectCount: null };
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--confirm-production') { out.confirmProduction = true; out.dryRun = false; }
    else if (a === '--expect-count') { out.expectCount = Number(rest[i + 1]); i += 1; }
    else if (a.startsWith('--')) throw new Error(`unknown flag: ${a}`);
    else throw new Error(`unexpected argument: ${a}`);
  }
  if (out.confirmProduction && (out.expectCount === null || !Number.isInteger(out.expectCount) || out.expectCount < 0)) {
    throw new Error('--confirm-production requires --expect-count N, the number of rows the dry run said it would write');
  }
  return out;
}

/**
 * No production writes without an explicit flag (CLAUDE.md). Copied deliberately
 * from `growthJourneyContentRules.ts:assertSafeTarget` rather than shared, for the
 * reason that file gives.
 */
export function assertSafeTarget(args: Args): void {
  if (args.dryRun) return;
  const url = process.env.DATABASE_URL ?? '';
  const looksProd = /accelerator_prod|prod/i.test(url) && !/dev|local|test/i.test(url);
  if (looksProd && !args.confirmProduction) {
    throw new Error('Refusing to write to what looks like production without --confirm-production.');
  }
}

/* ── the reads ──────────────────────────────────────────────────────────────── */

export async function loadBrands(): Promise<Map<string, BrandRef>> {
  const rows = await sequelize.query<{ tenant_id: string; tenant_slug: string; brand_id: string; brand_slug: string }>(
    `SELECT t.id AS tenant_id, t.slug AS tenant_slug, b.id AS brand_id, b.slug AS brand_slug
       FROM brands b JOIN tenants t ON t.id = b.tenant_id
      WHERE b.status = 'active'`,
    { type: QueryTypes.SELECT },
  );
  return new Map(rows.map((r) => [`${r.tenant_slug}/${r.brand_slug}`, { tenantId: r.tenant_id, tenantSlug: r.tenant_slug, brandId: r.brand_id, brandSlug: r.brand_slug }]));
}

const view = (row: unknown): CampaignRowView | null => {
  if (!row) return null;
  const r = row as { id: string; name: string; tenant_id: string | null; brand_id: string | null; settings: Record<string, unknown> | null };
  return { id: r.id, name: r.name, tenant_id: r.tenant_id ?? null, brand_id: r.brand_id ?? null, settings: r.settings ?? null };
};

export async function loadByKeys(keys: readonly string[]): Promise<Record<string, CampaignRowView | null>> {
  const out: Record<string, CampaignRowView | null> = {};
  for (const key of keys) out[key] = view(await Campaign.findOne({ where: { settings: { campaign_key: key } } as never }));
  return out;
}

export async function loadAliCampaign(): Promise<CampaignRowView | null> {
  return view(await Campaign.findOne({ where: { name: CAMPAIGN_NAME, type: CAMPAIGN_TYPE } as never }));
}

/* ── the plan and the writes ────────────────────────────────────────────────── */

export async function buildPlan(args: Args): Promise<Plan> {
  const brands = await loadBrands();
  const brand = (tenantSlug: string, brandSlug: string) => brands.get(`${tenantSlug}/${brandSlug}`) ?? null;
  if (args.subcommand === 'register-campaigns') {
    return buildRegisterPlan({ explorer: await loadByKeys(EXPLORER_CAMPAIGN_KEYS), ali: await loadAliCampaign(), brand });
  }
  return buildFlowDraftsPlan({ existing: await loadByKeys(Object.values(FLOW_CAMPAIGN_KEYS)), brand });
}

export async function applyPlan(plan: Plan): Promise<number> {
  let written = 0;
  for (const step of plan.steps) {
    if (step.kind === 'stamp') {
      await Campaign.update({ tenant_id: step.tenant_id, brand_id: step.brand_id } as never, { where: { id: step.campaign_id } });
      written += 1;
    } else if (step.kind === 'merge_key') {
      await Campaign.update({ settings: step.settings, tenant_id: step.tenant_id, brand_id: step.brand_id } as never, { where: { id: step.campaign_id } });
      written += 1;
    } else if (step.kind === 'create_draft') {
      const def = step.definition;
      const sequence = await FollowUpSequence.create({
        name: def.sequenceName,
        description: def.description,
        // The Explorer seed's step shape: an empty body_template, rendered from ai_instructions at send time.
        steps: [{ delay_days: 0, channel: 'email', subject: 'A couple of questions', body_template: '', max_attempts: 1, step_goal: 'two or three discovery questions', ai_tone: 'warm, direct, not salesy', ai_instructions: def.ai_instructions }],
        // EXPLICIT, as the Explorer seed says: the model defaults this to true.
        is_active: false,
      } as never);
      await Campaign.create({
        name: def.name,
        description: def.description,
        type: 'warm_nurture',
        sequence_id: (sequence as unknown as { id: string }).id,
        status: 'draft',
        approval_status: 'draft',
        campaign_mode: 'standard',
        tenant_id: step.tenant_id,
        brand_id: step.brand_id,
        settings: { campaign_key: def.key, test_mode_enabled: true },
      } as never);
      written += 1;
    }
  }
  return written;
}

/* ── main ───────────────────────────────────────────────────────────────────── */

export async function run(args: Args, out: (line: string) => void = console.log): Promise<number> {
  assertSafeTarget(args);
  const plan = await buildPlan(args);
  for (const line of renderPlan(plan, args.dryRun ? 'dry-run' : 'write')) out(line);

  if (plan.refusals > 0) {
    out('refused: resolve the REFUSE lines above; nothing was written.');
    return 2;
  }
  if (args.dryRun) {
    out(`[dry-run] nothing written. Re-run with --confirm-production --expect-count ${plan.writes} to apply.`);
    return 0;
  }
  if (args.expectCount !== plan.writes) {
    out(`refused: --expect-count ${args.expectCount} but the plan would write ${plan.writes} row(s); re-read the dry run.`);
    return 2;
  }
  const written = await applyPlan(plan);
  out(`written: ${written} row(s).`);
  return 0;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  return run(parseArgs(argv));
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
