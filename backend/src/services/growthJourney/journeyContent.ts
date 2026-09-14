import {
  resolveContentAssets,
  type AudienceTier,
  type ContentBrandScope,
} from '../explorerGrowth/content/resolveContentAssets';
import type { ContentAssetQuery } from '../explorerGrowth/governor/types';
import { assertContentAllowed } from './contentEligibility';
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

export interface JourneyContentDeps {
  assertAllowed?: typeof assertContentAllowed;
  resolveAssets?: typeof resolveContentAssets;
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
    if (resolved.resolved) assets.push(...(resolved.assets as unknown as Record<string, unknown>[]));
    else gaps.push(resolved.reason);
  }

  return { assets, gaps };
}
