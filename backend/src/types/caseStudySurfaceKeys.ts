/**
 * caseStudySurfaceKeys - the surface vocabulary: every surface the contract admits, and the
 * subset a record may actually be published to.
 *
 * Split out of `caseStudy.ts` (1103 lines, over CLAUDE.md's 500-line ceiling) before the
 * `hire` surface was added, so the change that adds a surface grows this file and not that one.
 * `caseStudy.ts` re-exports everything here, so every existing
 * `import { CaseStudySurfaceKey } from '.../types/caseStudy'` keeps working unchanged.
 *
 * LEAF MODULE. It imports nothing, which is what lets `caseStudy.ts` - itself a leaf that
 * "imports nothing" - depend on it without dragging anything else in.
 */

/**
 * Every surface the platform will ever publish to. All four exist in the
 * contract from day one — that is what makes "adding Training is a publication
 * row, not a schema change" a real property rather than an aspiration — but only
 * `enterprise` is publishable in Phase 1 and the publish gate rejects the rest.
 *
 * `case_study_collections.surface_key`, `case_study_publications.surface_key`.
 */
export type CaseStudySurfaceKey = 'enterprise' | 'training' | 'ai-flotation' | 'refactored';

export const CASE_STUDY_SURFACE_KEYS = [
  'enterprise',
  'training',
  'ai-flotation',
  'refactored',
] as const;

/**
 * The surfaces a record may actually be published to. Enforced again at the
 * publish gate (T012, `ruleSurface`), not only here.
 *
 * `ai-flotation` JOINED 2026-09-05, and the shape of that change is the point:
 * its profile, its band order, its ledger labels and its publication rows all
 * existed already, unused. Ali asked to "control what Case Study is shown on
 * what site", and the answer was one entry in this list plus a resolver that
 * reads the surface off the request - which is exactly what the gate's own
 * refusal message had been promising since Phase 1.
 *
 * `training` and `refactored` stay out deliberately. Neither has a page to
 * appear on yet, and a surface that is publishable but unreachable is a record
 * marked live that nobody can read.
 *
 * ADDING ONE IS NOT A FREE ACTION. Each surface is a brand - AI Flotation runs
 * its own Cloudflare zone specifically to keep the entity boundary clean - so
 * publishing a record there is a statement about whose delivery it was. The
 * per-surface publication row is the control for that judgement. It does not
 * make the judgement.
 */
export const PUBLISHABLE_SURFACE_KEYS = ['enterprise', 'ai-flotation', 'training'] as const;
