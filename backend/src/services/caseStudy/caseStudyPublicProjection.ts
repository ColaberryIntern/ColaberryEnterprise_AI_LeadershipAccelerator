/**
 * caseStudyPublicProjection - THE SECURITY BOUNDARY of the public API.
 *
 * Everything `/api/public/case-studies*` ever returns is built here, field by
 * named field, from an object literal whose shape is `PublicCaseStudySummary` or
 * `PublicCaseStudyDetail`. There is no spread of an internal object anywhere in
 * this file, no `...content`, no `Object.assign`, no `JSON.parse(JSON.stringify)`
 * of a row. An internal field reaches the public payload only when a human types
 * its name into one of these literals - and `caseStudyPublicProjection.test.ts`
 * is watching for exactly that.
 *
 * WHY NOT `res.json(snapshot)` WITH A DELETE LIST. `publicPortfolioRoutes.ts`
 * returns raw JSONB and filters client-side; that is a rendering decision, not a
 * security boundary, and it is precisely the pattern this file must not copy. A
 * deny-list is wrong by default: the field added next month is not on it. An
 * allow-list is right by default: the field added next month is absent until
 * somebody adds it here on purpose.
 *
 * ONE RULE ABOUT UNVERIFIED FACTS. Nothing whose verification class is `pending`
 * is projected - not a metric, not a timeline entry, not a roadmap item, not the
 * situation, not the production status, not the engagement duration. For metrics
 * this is also structural (`PublicVerificationClass` has no `pending` member), so
 * a pending figure has no shape to occupy even if this code were wrong.
 *
 * A PRIVATE REPOSITORY IS DROPPED, NOT BLANKED. `PublicCaseStudyRepository` has
 * no owner, no name, no visibility field, so a private repo cannot be rendered
 * "without its URL". It survives as one increment of `privateRepositoryCount`,
 * which is the honest statement (there was more work behind this) without the
 * identity.
 *
 * PURE. No model, no Express, no `fetch`, no `Date.now()`. Given the same
 * snapshot content it returns the same payload forever, which is what lets the
 * admin preview show exactly what the public page will show.
 *
 * FAILURE-FIRST. (1) A malformed section cannot throw: every read is defensive
 * and anything unreadable is DROPPED rather than rendered, so bad data degrades
 * to a shorter page and never to a leak or a 500. (2) No retry - no I/O.
 * (3) Recovery: fix the snapshot and re-approve it. (4) Handled: missing
 * sections, absent verification, non-http URLs, unconsented names, unapproved
 * artifacts, unknown enum members. Not handled: nothing - there is no failure
 * mode left that reaches the caller.
 */

import { getCaseStudySurfaceProfile, normalizeFacetList, normalizeFacetSlug } from './caseStudyFilterService';
import {
  arr,
  pairOf,
  projectArchitecture,
  projectArtifacts,
  projectContributors,
  projectMeasurement,
  projectMetric,
  projectMetrics,
  projectRepositories,
  projectRoadmap,
  projectSituation,
  projectTimeline,
  resolveHeroImage,
  resolveOrganizationLabel,
  resolveRecordVerification,
  text,
  truncate,
} from './caseStudyPublicSections';
import type { PublicVerificationPair } from './caseStudyPublicSections';
import type {
  CaseStudySnapshotContent,
  CaseStudySurfaceKey,
  IsoDateTime,
} from '../../types/caseStudy';
import type {
  PublicCaseStudyDetail,
  PublicCaseStudyMetric,
  PublicCaseStudySummary,
} from '../../types/caseStudyPublic';

/**
 * ONE IMPORT SITE. Callers (the store, the routes, the future admin preview)
 * import everything from here; `caseStudyPublicSections.ts` is an implementation
 * detail they never need to name. Same arrangement as
 * `caseStudyPublicationService.ts` re-exporting the gate and the store.
 */
export {
  ATMOSPHERE_ARTIFACT_TYPES,
  DELIVERED_WORK_CLAIMS,
  HERO_IMAGE_PRIORITY,
  artifactPresentation,
  describesDeliveredWork,
} from './caseStudyArtifactPresentation';
export {
  MAX_DIAGRAM_SOURCE_CHARS,
  projectArtifacts,
  projectContributors,
  projectDiagramSource,
  projectMetric,
  projectRepositories,
  resolveHeroImage,
  resolveOrganizationLabel,
  resolveRecordVerification,
  safeHttpUrl,
} from './caseStudyPublicSections';
export type {
  ContributorProjection,
  PublicVerificationPair,
  RepositoryProjection,
} from './caseStudyPublicSections';

/* ---------------------------------------------------------------- input --- */

/** Publication-owned facts. Surface state, never canonical Case Study content. */
export interface PublicProjectionPublicationFacts {
  readonly featured: boolean;
  readonly publishedAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  readonly titleOverride: string | null;
  readonly summaryOverride: string | null;
}

export interface PublicProjectionInput {
  readonly surfaceKey: CaseStudySurfaceKey;
  readonly slug: string;
  readonly content: CaseStudySnapshotContent;
  readonly publication: PublicProjectionPublicationFacts;
  /** e.g. `https://enterprise.colaberry.ai`. Supplied by the caller from env. */
  readonly canonicalBaseUrl: string;
}

interface CommonFields {
  readonly title: string;
  readonly standfirst: string | null;
  readonly organizationLabel: string | null;
  readonly industry: string | null;
  readonly primaryCapability: string | null;
  readonly capabilities: readonly string[];
  readonly stack: readonly string[];
  readonly programLabel: string | null;
  readonly verification: PublicVerificationPair;
  readonly heroImageUrl: string | null;
}

function common(input: PublicProjectionInput): CommonFields {
  const { content, publication } = input;
  const taxonomy = content?.taxonomy;
  const primary = normalizeFacetSlug(taxonomy?.primaryCapability) || null;
  return {
    title: text(publication.titleOverride) || text(content?.identity?.title),
    standfirst: text(publication.summaryOverride) || text(content?.identity?.standfirst) || null,
    organizationLabel: resolveOrganizationLabel(content),
    industry: normalizeFacetSlug(taxonomy?.industry) || null,
    primaryCapability: primary,
    capabilities: normalizeFacetList([primary, ...arr(taxonomy?.capabilities)]),
    stack: normalizeFacetList(taxonomy?.stack),
    programLabel: text(content?.identity?.programLabel) || null,
    verification: resolveRecordVerification(content),
    heroImageUrl: resolveHeroImage(content),
  };
}

/* ---------------------------------------------------------- projections --- */

/** One card on the index. Every key below is a key of `PublicCaseStudySummary`. */
export function projectPublicSummary(input: PublicProjectionInput): PublicCaseStudySummary {
  const c = common(input);
  const content = input.content;
  // The metric an editor MARKED as the headline, if it survives projection;
  // otherwise the first hero metric that does. Never the "best-looking" number:
  // choosing one by value would make the card an argument rather than a report.
  const heroEntries = arr(content?.heroMetrics);
  const flagged = heroEntries.find((m) => m && m.isHeadline === true && projectMetric(m) !== null);
  const headline: PublicCaseStudyMetric | null =
    (flagged ? projectMetric(flagged) : null) ?? projectMetrics(heroEntries)[0] ?? null;
  return {
    slug: input.slug,
    title: c.title,
    standfirst: c.standfirst,
    organizationLabel: c.organizationLabel,
    industry: c.industry,
    primaryCapability: c.primaryCapability,
    capabilities: c.capabilities,
    stack: c.stack,
    programLabel: c.programLabel,
    builtBy: content?.taxonomy?.builtByType ?? content?.identity?.builtByType ?? null,
    verificationClass: c.verification.verificationClass,
    verificationMethod: c.verification.verificationMethod,
    headlineMetric: headline,
    deliverables: normalizeFacetList(content?.taxonomy?.deliverables),
    featured: input.publication.featured === true,
    publishedAt: input.publication.publishedAt,
    updatedAt: input.publication.updatedAt,
    heroImageUrl: c.heroImageUrl,
  };
}

/** One page. Every key below is a key of `PublicCaseStudyDetail`. */
export function projectPublicDetail(input: PublicProjectionInput): PublicCaseStudyDetail {
  const c = common(input);
  const content = input.content;
  const profile = getCaseStudySurfaceProfile(input.surfaceKey);
  const people = projectContributors(content);
  const repos = projectRepositories(content?.repositories ?? []);
  const engagement = content?.identity?.engagementWindow;
  const production = content?.identity?.productionStatus;
  const description = truncate(
    c.standfirst || text(content?.identity?.summary) || c.title, 300,
  );
  return {
    surfaceKey: input.surfaceKey,
    slug: input.slug,
    title: c.title,
    standfirst: c.standfirst,
    organizationLabel: c.organizationLabel,
    industry: c.industry,
    primaryCapability: c.primaryCapability,
    capabilities: c.capabilities,
    stack: c.stack,
    programLabel: c.programLabel,
    builtBy: content?.taxonomy?.builtByType ?? content?.identity?.builtByType ?? null,
    verificationClass: c.verification.verificationClass,
    verificationMethod: c.verification.verificationMethod,
    publishedAt: input.publication.publishedAt,
    updatedAt: input.publication.updatedAt,
    heroImageUrl: c.heroImageUrl,
    engagementDuration: pairOf(engagement?.verification)?.verificationClass === 'verified'
      ? text(engagement?.durationLabel) || null
      : null,
    productionStatus: production && pairOf(production.verification) ? production.status : null,
    heroMetrics: projectMetrics(content?.heroMetrics ?? []),
    situation: projectSituation(content),
    timeline: projectTimeline(content?.buildTimeline ?? []),
    architecture: projectArchitecture(content),
    measurement: projectMeasurement(content),
    roadmap: projectRoadmap(content?.roadmap ?? []),
    contributors: people.contributors,
    artifacts: projectArtifacts(content?.artifacts ?? []),
    repositories: repos.repositories,
    privateRepositoryCount: repos.privateRepositoryCount,
    anonymousContributorCount: people.anonymousContributorCount,
    cta: {
      eyebrow: profile.cta.eyebrow,
      heading: profile.cta.heading,
      buttonLabel: profile.cta.buttonLabel,
      href: profile.cta.href,
    },
    seo: {
      title: c.title,
      description,
      /*
       * THE CANONICAL BELONGS TO THE SURFACE, NOT TO THE PLATFORM.
       *
       * This was `${canonicalBaseUrl}/stories/${slug}` for every surface, which
       * was right while only Enterprise had a page. It stopped being right the
       * moment AI Flotation published: a reader on aiflotation.com would have
       * been served a canonical pointing at enterprise.colaberry.ai, handing
       * one brand's ranking to another company's domain and telling a crawler
       * the AI Flotation page was a duplicate of somebody else's.
       *
       * Each surface states where it is read. Enterprise's value is unchanged,
       * so no live address moves. A surface with no page yet falls back to the
       * platform rather than inventing a URL nobody serves.
       */
      canonicalUrl: profile.publicBaseUrl && profile.detailPathPrefix
        ? `${profile.publicBaseUrl.replace(/\/+$/, '')}${profile.detailPathPrefix}/${input.slug}`
        : `${input.canonicalBaseUrl.replace(/\/+$/, '')}/stories/${input.slug}`,
      ogImageUrl: c.heroImageUrl,
      ogType: 'article',
    },
  };
}
