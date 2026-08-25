/**
 * Case Study OS — surface profiles and the canonical filter engine.
 *
 * Spec §31 requires ONE filter engine serving the public index, the admin
 * preview, saved collections, and the future Training and AI Flotation
 * renderers. That only stays true if there is one filter TYPE; the moment the
 * admin preview declares its own shape, the preview stops predicting what the
 * public page will show, which is the specific way preview features become
 * lies.
 *
 * LEAF MODULE: type-only import from `./caseStudy`, nothing else.
 */

import type {
  CaseStudyBuiltByType,
  CaseStudyRepoVisibility,
  CaseStudyRoadmapStatus,
  CaseStudySectionKey,
  CaseStudySurfaceKey,
  CaseStudyVerificationClass,
  CaseStudyVerificationMethod,
} from './caseStudy';

/* ─────────────────────────────────────────────────────── sort vocabulary ──── */

/** Deterministic, and named. AI may not decide what is featured. Spec §31. */
export type CaseStudySortKey = 'featured' | 'newest' | 'strongest-proof' | 'recently-updated';

export const CASE_STUDY_SORT_KEYS = [
  'featured',
  'newest',
  'strongest-proof',
  'recently-updated',
] as const;

/* ──────────────────────────────────────────────────── the filter contract ──── */

/**
 * The one filter shape. All facet values are canonical normalised slugs, so
 * `"Agentic AI"` and `"agentic-ai"` cannot become two different facets.
 *
 * Spec §31 lists both `verification_method` and a bare `method`. They are the
 * same axis, so only `verificationMethod` exists here; `method` is handled as a
 * query-string alias by the route's Zod schema (T014) rather than as a second
 * field that could hold a different value from the first.
 */
export interface CaseStudyFilterInput {
  readonly surface?: CaseStudySurfaceKey;
  readonly capability?: readonly string[];
  readonly industry?: readonly string[];
  readonly stack?: readonly string[];
  readonly program?: readonly string[];
  readonly builtBy?: readonly CaseStudyBuiltByType[];
  readonly verificationClass?: readonly CaseStudyVerificationClass[];
  readonly verificationMethod?: readonly CaseStudyVerificationMethod[];
  readonly deliverable?: readonly string[];
  readonly projectStatus?: readonly CaseStudyRoadmapStatus[];
  /**
   * An ADMIN-only facet. It filters on the source repositories' visibility and
   * must never be honoured on a public request — answering "show me the ones
   * backed by private repos" would leak the fact itself.
   */
  readonly repoVisibility?: readonly CaseStudyRepoVisibility[];
  readonly featured?: boolean;
  /** A `case_study_collections.slug`. */
  readonly collection?: string;
}

export interface CaseStudyQueryInput {
  readonly filters: CaseStudyFilterInput;
  readonly sort: CaseStudySortKey;
  readonly page: number;
  readonly limit: number;
}

export interface CaseStudyPagedResult<TItem> {
  readonly items: readonly TItem[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly hasMore: boolean;
}

/**
 * `case_study_collections`, typed — a saved filter set. A curated path such as
 * "agents" or "built by learners" is a row here, never a duplicated record, which
 * is why one Case Study can appear on several paths without any copy drifting.
 */
export interface CaseStudySavedCollection {
  readonly slug: string;
  readonly surfaceKey: CaseStudySurfaceKey;
  readonly title: string;
  readonly description: string | null;
  readonly filters: CaseStudyFilterInput;
  readonly sort: CaseStudySortKey;
  readonly status: 'draft' | 'published';
}

/* ─────────────────────────────────────────────────────── surface profiles ──── */

export interface CaseStudyCtaProfile {
  readonly key: string;
  readonly eyebrow: string;
  readonly heading: string;
  readonly buttonLabel: string;
  readonly href: string;
}

/**
 * Everything that differs between surfaces, in one object — so no component ever
 * asks "which surface am I on?" and the future-surface claim stays structural.
 * Spec §21.
 *
 * All four surface keys are representable. Only `enterprise` sets
 * `publishable: true` in Phase 1, and the publish gate (T012) rejects the other
 * three independently of this flag — a contract that admits a surface is not the
 * same as a system that will publish to it.
 */
export interface CaseStudySurfaceProfile {
  readonly surfaceKey: CaseStudySurfaceKey;
  readonly brandLabel: string;
  readonly publishable: boolean;
  readonly hero: {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
  };
  readonly defaultFilters: CaseStudyFilterInput;
  readonly defaultSort: CaseStudySortKey;
  readonly sectionOrder: readonly CaseStudySectionKey[];
  readonly hiddenSections: readonly CaseStudySectionKey[];
  readonly cta: CaseStudyCtaProfile;
  /**
   * What this surface leads with — Enterprise emphasises outcome and
   * measurement, Training emphasises who built it and what they learned (§21).
   * Copy, not logic: it orders emphasis, it never changes what is true.
   */
  readonly emphasis: readonly string[];
}
