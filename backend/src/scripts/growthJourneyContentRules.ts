import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import {
  buildContentRulesPlan,
  renderPlanSummary,
  type ContentRulesPlan,
  type PlanAsset,
  type PlanBrand,
} from '../services/growthJourney/content/contentRulesPlan';

/**
 * The content-rules tool (Phase 4 T412): the operator declares which authored
 * assets a learner offer family may cite.
 *
 * ─── DRY RUN BY DEFAULT; A PERSON'S FLAG IS THE AUTHORISATION ───────────────
 *
 * Same shape as `runExplorerContentSync.ts` and `runExplorerGovernor.ts`: no
 * write without `--confirm-production`, and the guard is spelled out here
 * rather than shared, so the three cannot drift into one inheriting a weakened
 * version of it. The production run is Ali's; T416 records it as pending.
 *
 * ─── WHAT IT WRITES, AND WHAT IT REFUSES TO TOUCH ───────────────────────────
 *
 * Writes: `growth_journey_content_rules` (upsert on the unique
 * `(brand_id, asset_id, version)`) and one `approved_landing_pages` entry per
 * brand x family on the existing `brand_offer_policies` row.
 *
 * NEVER writes `explorer_content_assets`. That table is SYNCED from the
 * curriculum by `syncTimelineCards`; a `brand_id` or `offer_family` stamped on
 * a synced row is erased by the next sync and, until then, claims an ownership
 * the curriculum never stated. There is no `UPDATE explorer_content_assets` in
 * this file, and `growthJourneyContentRules.test.ts` scans the source to keep
 * it that way. Nothing here sends, enqueues or notifies.
 *
 * Usage (every run needs the `--landing-page` it would approve; a write also needs
 * `--brand`, so one URL is never approved for every learner brand at once):
 *   node dist/scripts/growthJourneyContentRules.js --landing-page https://... --dry-run
 *   node dist/scripts/growthJourneyContentRules.js --brand colaberry-training --landing-page https://... --dry-run
 *   node dist/scripts/growthJourneyContentRules.js --brand colaberry-training --landing-page https://... --confirm-production
 */

export interface Args {
  dryRun: boolean;
  confirmProduction: boolean;
  brandSlug: string | null;
  landingPage: string | null;
  version: number;
}

export function parseArgs(argv: string[]): Args {
  const out: Args = { dryRun: false, confirmProduction: false, brandSlug: null, landingPage: null, version: 1 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--confirm-production') out.confirmProduction = true;
    else if (a === '--brand') { out.brandSlug = argv[i + 1] ?? null; i += 1; }
    else if (a === '--landing-page') { out.landingPage = argv[i + 1] ?? null; i += 1; }
    else if (a === '--version') { out.version = Number(argv[i + 1] ?? '1'); i += 1; }
    else if (a.startsWith('--')) throw new Error(`unknown flag: ${a}`);
    else throw new Error(`unexpected argument: ${a}`);
  }
  if (!out.dryRun && !out.confirmProduction) out.dryRun = true;
  // A write names its brand: without it one --landing-page URL would be approved for EVERY learner
  // brand in a single run - a training.colaberry.com page on CPN's policy (the T412 verifier).
  if (out.confirmProduction && !out.dryRun && !out.brandSlug) throw new Error('--confirm-production requires --brand: one approved landing page belongs to one brand');
  if (!Number.isInteger(out.version) || out.version < 1) throw new Error('--version must be a positive integer');
  return out;
}

/**
 * No production writes without an explicit flag (CLAUDE.md).
 *
 * Copied deliberately from `runExplorerContentSync.ts:52` rather than shared,
 * for the reason that file gives.
 */
export function assertSafeTarget(args: Args): void {
  if (args.dryRun) return;
  const url = process.env.DATABASE_URL ?? '';
  const looksProd = /accelerator_prod|prod/i.test(url) && !/dev|local|test/i.test(url);
  if (looksProd && !args.confirmProduction) {
    throw new Error(
      'Refusing to write to what looks like production without --confirm-production. ' +
        'Re-run with --dry-run to preview, or pass --confirm-production deliberately.',
    );
  }
}

/* ── the reads ──────────────────────────────────────────────────────────────── */

export async function loadBrands(brandSlug: string | null): Promise<PlanBrand[]> {
  const rows = await sequelize.query<{ tenant_id: string; brand_id: string; brand_slug: string }>(
    `SELECT b.tenant_id, b.id AS brand_id, b.slug AS brand_slug
       FROM brands b
      WHERE b.status = 'active' ${brandSlug ? 'AND b.slug = :brandSlug' : ''}
      ORDER BY b.slug ASC`,
    { type: QueryTypes.SELECT, replacements: brandSlug ? { brandSlug } : {} },
  );
  return rows.map((r) => ({ tenant_id: r.tenant_id, brand_id: r.brand_id, brand_slug: r.brand_slug }));
}

/**
 * The registry, per brand slug.
 *
 * `explorer_content_assets` carries no brand of its own for a synced row (that
 * is the point), so the assets are attributed by the JOURNEY PROGRAMME's brand:
 * the learner curriculum belongs to the training brands, and a brand with no
 * learner programme gets an empty list. Read-only, and only the columns the
 * plan needs - never a body, never a URL.
 */
export async function loadAssetsByBrandSlug(brands: readonly PlanBrand[]): Promise<Record<string, PlanAsset[]>> {
  if (brands.length === 0) return {};
  const assets = await sequelize.query<{ id: string; asset_type: string; title: string; audience_tags: string[] | null; active: boolean; brand_id: string | null }>(
    `SELECT a.id, a.asset_type, a.title, a.audience_tags, a.active, a.brand_id
       FROM explorer_content_assets a
      ORDER BY a.id ASC`,
    { type: QueryTypes.SELECT },
  );
  const learnerBrands = await sequelize.query<{ brand_slug: string }>(
    `SELECT DISTINCT b.slug AS brand_slug
       FROM journey_programs p
       JOIN brands b ON b.id = p.brand_id
      WHERE p.kind = 'learner' AND p.status <> 'retired'`,
    { type: QueryTypes.SELECT },
  );
  const learner = new Set(learnerBrands.map((r) => r.brand_slug));
  const out: Record<string, PlanAsset[]> = {};
  for (const brand of brands) {
    out[brand.brand_slug] = learner.has(brand.brand_slug)
      ? assets.map((a) => ({ id: a.id, asset_type: a.asset_type, title: a.title, audience_tags: a.audience_tags ?? [], active: a.active, brand_id: a.brand_id ?? null }))
      : [];
  }
  return out;
}

/* ── the write, in one transaction ──────────────────────────────────────────── */

export interface WriteResult {
  rules_created: number;
  rules_existing: number;
  policy_pages_added: number;
  policy_rows_missing: string[];
}

export async function applyPlan(plan: ContentRulesPlan): Promise<WriteResult> {
  const result: WriteResult = { rules_created: 0, rules_existing: 0, policy_pages_added: 0, policy_rows_missing: [] };
  await sequelize.transaction(async (transaction) => {
    for (const rule of plan.rules) {
      // ON CONFLICT DO NOTHING on the unique (brand_id, asset_id, version): a second
      // run creates nothing and reports the row as existing. `RETURNING id` is empty on conflict.
      const inserted = await sequelize.query<{ id: string }>(
        `INSERT INTO growth_journey_content_rules
           (id, tenant_id, brand_id, asset_id, eligible_programs, offer_family, approval_status, version, created_at, updated_at)
         VALUES (gen_random_uuid(), :tenant_id, :brand_id, :asset_id, CAST(:eligible_programs AS jsonb), :offer_family, :approval_status, :version, NOW(), NOW())
         ON CONFLICT (brand_id, asset_id, version) WHERE asset_id IS NOT NULL DO NOTHING
         RETURNING id`,
        {
          type: QueryTypes.SELECT,
          transaction,
          replacements: {
            tenant_id: rule.tenant_id,
            brand_id: rule.brand_id,
            asset_id: rule.asset_id,
            eligible_programs: JSON.stringify(rule.eligible_programs),
            offer_family: rule.offer_family,
            approval_status: rule.approval_status,
            version: rule.version,
          },
        },
      );
      if (inserted.length > 0) result.rules_created += 1;
      else result.rules_existing += 1;
    }

    for (const page of plan.policy_pages) {
      // The policy row is the brand's existing declaration; only its approved-page list grows,
      // and only with a URL it does not already carry. A brand with no policy row is REPORTED,
      // never created here: a policy is an approval, and this tool does not grant one.
      const updated = await sequelize.query<{ id: string }>(
        `UPDATE brand_offer_policies
            SET approved_landing_pages = CASE
                  WHEN approved_landing_pages @> CAST(:page_json AS jsonb) THEN approved_landing_pages
                  ELSE approved_landing_pages || CAST(:page_json AS jsonb)
                END,
                updated_at = NOW()
          WHERE brand_id = :brand_id AND offer_family = :offer_family AND status = 'active'
            AND NOT (approved_landing_pages @> CAST(:page_json AS jsonb))
          RETURNING id`,
        {
          type: QueryTypes.SELECT,
          transaction,
          replacements: { brand_id: page.brand_id, offer_family: page.offer_family, page_json: JSON.stringify([page.landing_page]) },
        },
      );
      if (updated.length > 0) result.policy_pages_added += 1;
      else {
        const existing = await sequelize.query<{ id: string }>(
          `SELECT id FROM brand_offer_policies WHERE brand_id = :brand_id AND offer_family = :offer_family AND status = 'active' LIMIT 1`,
          { type: QueryTypes.SELECT, transaction, replacements: { brand_id: page.brand_id, offer_family: page.offer_family } },
        );
        if (existing.length === 0) result.policy_rows_missing.push(`${page.brand_slug}/${page.offer_family}`);
      }
    }
  });
  return result;
}

export async function run(args: Args, out: (line: string) => void = (l) => console.log(l)): Promise<number> {
  assertSafeTarget(args);
  const brands = await loadBrands(args.brandSlug);
  if (brands.length === 0) {
    out(`no active brand matches ${args.brandSlug ?? '(any)'}`);
    return 2;
  }
  const assetsByBrandSlug = await loadAssetsByBrandSlug(brands);
  const landingPageByBrandSlug: Record<string, string> = {};
  for (const brand of brands) {
    if (args.landingPage) landingPageByBrandSlug[brand.brand_slug] = args.landingPage;
  }

  const plan = buildContentRulesPlan({ brands, assetsByBrandSlug, landingPageByBrandSlug, version: args.version });
  for (const line of renderPlanSummary(plan, args.dryRun ? 'dry-run' : 'write')) out(line);

  if (args.dryRun) {
    out('[dry-run] nothing written. Re-run with --confirm-production to write the rules.');
    return 0;
  }

  const written = await applyPlan(plan);
  out(`written: rules_created=${written.rules_created} rules_existing=${written.rules_existing} policy_pages_added=${written.policy_pages_added}`);
  if (written.policy_rows_missing.length) {
    out(`no active policy row for: ${written.policy_rows_missing.join(', ')} — approve the family first; no policy was created here.`);
  }
  out('explorer_content_assets touched: 0');
  return 0;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  return run(parseArgs(argv));
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('growthJourneyContentRules failed:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
