import { ExplorerContentAsset } from '../../models';
import { classifyError } from '../../utils/errorClassifier';
import { redactForLogs } from '../../utils/piiRedaction';
import {
  resolveContentAssets,
  type AudienceTier,
  type ContentBrandScope,
} from '../explorerGrowth/content/resolveContentAssets';
import type { ContentAssetQuery } from '../explorerGrowth/governor/types';
import { assertContentAllowed, type ContentAssetFacts } from './contentEligibility';
import type { JourneyCandidate, JourneySubjectContext } from './governor/types';

/**
 * The adapter that makes `DecideDeps.resolveContent` real (§10; Phase 3 T305).
 *
 * ─── WHY IT EXISTS AT ALL ───────────────────────────────────────────────────
 *
 * `contentEligibility` answers "may this brand cite this asset" and
 * `resolveContentAssets` answers "which assets exist for this purpose". Neither
 * is the shape `decideForSubject` consumes, and the acceptance criterion this
 * task owes — a refused gate becoming a `WAIT` whose `content_gaps` name
 * `content_not_approved` — is only demonstrable once something composes them.
 * Without this file the gate would be a reader nobody calls, which is the
 * producer-without-a-consumer shape this repo has shipped before and regretted.
 *
 * ─── THE TWO SCOPE DECISIONS, BOTH IN THE RESTRICTIVE DIRECTION ─────────────
 *
 * 1. `allow_unscoped` is TRUE FOR COLABERRY TRAINING ONLY. The Explorer-era rows
 *    carry no brand because they were written before brands existed, and they
 *    are Training's content — Explorer IS the Training journey. Every other
 *    brand passes false and sees only what has been declared to it. That single
 *    boolean is the cross-brand leakage boundary, so it is derived from one named
 *    constant and pinned by its own test rather than assembled at each call site.
 *
 * 2. `free_preview` is the DEFAULT TIER for a journey subject. The tier exists to
 *    stop the locked-lesson leak Explorer found: a free learner being sent a
 *    week-9 paid lesson. A business lead or a CPN enquirer has no enrollment and
 *    therefore no entitlement, so they get the narrower pool. `full_access` is
 *    passed only for a subject with an enrollment, which is exactly what
 *    Explorer's own call site resolves per learner.
 *
 * ─── IT ASKS THE GATE TWICE, AND THE SECOND TIME IS THE IMPORTANT ONE ───────
 *
 * Before the lookup it asks the POLICY question: may this brand cite content for
 * this offer at all. After the lookup it asks the PER-ASSET question for every
 * row the registry returned, having fetched their declaration columns.
 *
 * The second call is not belt-and-braces. `RESOLVE_SQL` enforces `brand_id`,
 * `offer_family` and `eligible_programs`; it does NOT enforce `approval_status`
 * or `eligible_paths`, and it cannot consult `growth_journey_content_rules` at
 * all. Without this call an unreviewed asset would be cited, and the declaration
 * table would have a reader nothing reached.
 *
 * ─── IT REFUSES BY NAME AND NEVER SUBSTITUTES ───────────────────────────────
 *
 * Every exit is assets or a named gap, the discipline `resolveContentAssets`
 * already holds: a blocked asset is a gap, not a different asset; a purpose with
 * no content is a gap, not an empty success. The gaps travel to the decision's
 * `content_gaps`, which is what the shadow review reads.
 */

/** Explorer's own brand. The only journey that owns the pre-brand rows. */
export const EXPLORER_ERA_BRAND_SLUG = 'colaberry-training';

export function scopeFor(ctx: JourneySubjectContext): ContentBrandScope {
  return {
    brand_id: ctx.brand_id,
    allow_unscoped: ctx.brand_slug === EXPLORER_ERA_BRAND_SLUG,
  };
}

export function tierFor(ctx: JourneySubjectContext): AudienceTier {
  // No enrollment, no entitlement. The restrictive direction on purpose: the
  // asymmetry is a narrower content pool versus citing paid content to someone
  // who has not bought it.
  return ctx.enrollment_id ? 'full_access' : 'free_preview';
}

/** The offer family a query speaks for, falling back to the subject's path. */
function familyFor(query: ContentAssetQuery, ctx: JourneySubjectContext): string | null {
  return query.offer_family ?? ctx.classification?.primary_path ?? null;
}

/**
 * The declaration columns of the assets the registry returned - the six
 * `ContentAssetFacts` reads, not all eight on the table: `tenant_id` is already
 * pinned by the caller and `approved_by`/`approved_at` have no reader in this
 * phase, so selecting them would be selecting fields nothing consults.
 */
export type AssetFactsLoader = (ids: string[]) => Promise<Map<string, ContentAssetFacts>>;

const loadAssetFacts: AssetFactsLoader = async (ids) => {
  const rows = (await ExplorerContentAsset.findAll({
    where: { id: ids },
    attributes: [
      'id',
      'brand_id',
      'offer_family',
      'approval_status',
      'eligible_programs',
      'eligible_paths',
    ],
  })) as unknown as ContentAssetFacts[];
  return new Map(rows.map((row) => [String(row.id), row]));
};

export interface JourneyContentDeps {
  assertAllowed?: typeof assertContentAllowed;
  resolveAssets?: typeof resolveContentAssets;
  loadFacts?: AssetFactsLoader;
}

/**
 * Resolve every asset a candidate asks for, gated per query.
 *
 * The gate runs BEFORE the registry lookup for each query: there is no point
 * selecting an asset the brand may not cite, and doing it in this order means a
 * refusal is reported as the policy reason rather than as a content shortage.
 */
export async function resolveJourneyContent(
  candidate: JourneyCandidate,
  ctx: JourneySubjectContext,
  deps: JourneyContentDeps = {},
): Promise<{ assets: Record<string, unknown>[]; gaps: string[] }> {
  const assertAllowed = deps.assertAllowed ?? assertContentAllowed;
  const resolveAssets = deps.resolveAssets ?? resolveContentAssets;
  const loadFacts = deps.loadFacts ?? loadAssetFacts;

  const assets: Record<string, unknown>[] = [];
  const gaps: string[] = [];
  const scope = scopeFor(ctx);
  const tier = tierFor(ctx);

  for (const query of candidate.required_assets) {
    const family = familyFor(query, ctx);
    if (!family) {
      // A purpose with no family behind it cannot be checked against a brand's
      // offer policy, and an unchecked citation is the one thing §10 forbids.
      gaps.push(`content_no_offer_family:${query.asset_type}`);
      continue;
    }

    const verdict = await assertAllowed({
      brandId: ctx.brand_id,
      tenantId: ctx.tenant_id,
      offerFamily: family,
      // No asset: this is the POLICY question. Nothing has been selected yet, so
      // the asset's own columns are unknown - and they are enforced in SQL by
      // the resolver's own brand predicate, which runs next.
      allowUnscoped: scope.allow_unscoped,
      programSlug: ctx.program_slug,
      state: ctx.state,
      at: ctx.asOf,
    });
    if (!verdict.allowed) {
      gaps.push(verdict.reason);
      continue;
    }

    const resolved = await resolveAssets(
      { ...query, program_slug: query.program_slug ?? ctx.program_slug ?? undefined },
      ctx.asOf,
      tier,
      scope,
    );
    if (!resolved.resolved) {
      gaps.push(resolved.reason);
      continue;
    }

    const selected = resolved.assets as unknown as Record<string, unknown>[];
    const ids = selected.map((a) => String(a.id)).filter(Boolean);
    let facts: Map<string, ContentAssetFacts>;
    try {
      facts = ids.length > 0 ? await loadFacts(ids) : new Map();
    } catch (err: unknown) {
      // Fail closed: an unreadable declaration column is not an approval. The
      // gap travels either way, but the error CLASS is recorded - the sibling
      // failure path in `contentEligibility` does, and two failure paths in one
      // feature disagreeing about whether a failure is worth logging is how a
      // recurring outage stays invisible. Ids and slugs only, redacted anyway.
      console.warn(
        redactForLogs(
          JSON.stringify({
            service: 'growth-journey',
            level: 'warn',
            outcome: 'failure',
            event: 'growth_journey.asset_facts_lookup_failed',
            error_class: classifyError(err),
            brand_id: ctx.brand_id,
            asset_count: ids.length,
          }),
        ),
      );
      gaps.push('asset_facts_lookup_failed');
      continue;
    }

    for (const asset of selected) {
      const id = String(asset.id);
      const row = facts.get(id);
      if (!row) {
        // The row came from this same table a moment ago. If it cannot be read
        // back, something is wrong and the safe answer is not to cite it.
        gaps.push('asset_facts_missing');
        continue;
      }
      const perAsset = await assertAllowed({
        brandId: ctx.brand_id,
        tenantId: ctx.tenant_id,
        offerFamily: family,
        asset: row,
        allowUnscoped: scope.allow_unscoped,
        programSlug: ctx.program_slug,
        state: ctx.state,
        tier,
        at: ctx.asOf,
      });
      if (perAsset.allowed) assets.push(asset);
      else gaps.push(perAsset.reason);
    }
  }

  return { assets, gaps };
}
