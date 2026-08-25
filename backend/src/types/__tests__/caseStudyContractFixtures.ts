/**
 * Fixtures for `caseStudyContracts.test.ts`.
 *
 * Split out purely to keep both files inside CLAUDE.md's 500-line ceiling. Not a
 * suite: jest's `testMatch` collects `*.test.ts` only, so nothing here runs on
 * its own.
 *
 * `DETAIL_FIXTURE` is deliberately MAXIMAL — every optional section populated,
 * both contributor consent modes, both artifact access modes, a public repo and
 * a private-repo count. A leak test against a sparse payload proves nothing,
 * because the field that leaks is the one nobody filled in.
 */

import type {
  CaseStudyArtifactVisibility,
  CaseStudyBuilderIdentityMode,
  CaseStudyBuiltByType,
  CaseStudyOrganizationIdentityMode,
  CaseStudyRepoVisibility,
  CaseStudyRoadmapStatus,
  CaseStudySectionKey,
  CaseStudyStatus,
} from '../caseStudy';
import type { PublicCaseStudyDetail, PublicCaseStudyMetric, PublicCaseStudySummary } from '../caseStudyPublic';

const HEADLINE_METRIC: PublicCaseStudyMetric = {
  label: 'Stockouts per store per week',
  valueDisplay: '41% fewer',
  unit: null,
  verificationClass: 'anonymized',
  verificationMethod: 'client',
  baseline: '6.8 per store per week',
  sample: '212 stores, 8 weeks',
  methodology: 'Pre/post comparison over matched store cohorts.',
  limitations: ['Seasonality not adjusted for.'],
};

export const SUMMARY_FIXTURE: PublicCaseStudySummary = {
  slug: 'stockout-forecasting',
  title: 'Cutting stockouts with a forecasting agent',
  standfirst: 'A four-week build against a live replenishment workflow.',
  organizationLabel: 'A national grocery distributor',
  industry: 'retail-distribution',
  primaryCapability: 'agentic-forecasting',
  capabilities: ['agentic-forecasting', 'data-pipelines'],
  stack: ['typescript', 'postgres'],
  programLabel: 'Enterprise AI Leadership Accelerator',
  builtBy: 'colaberry_team',
  verificationClass: 'anonymized',
  verificationMethod: 'client',
  headlineMetric: HEADLINE_METRIC,
  deliverables: ['architecture', 'evaluation'],
  featured: true,
  publishedAt: '2026-08-22T10:00:00.000Z',
  updatedAt: '2026-08-22T10:00:00.000Z',
  heroImageUrl: null,
};

export const DETAIL_FIXTURE: PublicCaseStudyDetail = {
  surfaceKey: 'enterprise',
  slug: SUMMARY_FIXTURE.slug,
  title: SUMMARY_FIXTURE.title,
  standfirst: SUMMARY_FIXTURE.standfirst,
  organizationLabel: SUMMARY_FIXTURE.organizationLabel,
  industry: SUMMARY_FIXTURE.industry,
  primaryCapability: SUMMARY_FIXTURE.primaryCapability,
  capabilities: SUMMARY_FIXTURE.capabilities,
  stack: SUMMARY_FIXTURE.stack,
  programLabel: SUMMARY_FIXTURE.programLabel,
  builtBy: SUMMARY_FIXTURE.builtBy,
  verificationClass: SUMMARY_FIXTURE.verificationClass,
  verificationMethod: SUMMARY_FIXTURE.verificationMethod,
  publishedAt: SUMMARY_FIXTURE.publishedAt,
  updatedAt: SUMMARY_FIXTURE.updatedAt,
  heroImageUrl: null,
  engagementDuration: 'Four weeks',
  productionStatus: 'shipped',
  heroMetrics: [HEADLINE_METRIC],
  situation: {
    heading: 'The situation',
    body: ['Replenishment planners were reconciling three systems by hand.'],
  },
  timeline: [
    {
      date: '2026-06-01',
      endDate: null,
      label: 'First working forecast',
      detail: null,
      sourceKind: 'repository',
    },
  ],
  architecture: {
    narrative: ['A scheduled extractor feeds a forecasting agent.'],
    stack: ['typescript', 'postgres'],
    capabilities: ['agentic-forecasting'],
    integrations: ['erp'],
    diagram: {
      nodes: [{ key: 'api', label: 'API', kind: 'service' }],
      edges: [{ from: 'api', to: 'db', label: null }],
    },
  },
  measurement: {
    narrative: ['Measured against matched store cohorts.'],
    metrics: [HEADLINE_METRIC],
  },
  roadmap: [{ label: 'Regional rollout', status: 'in_progress', detail: null }],
  contributors: [
    {
      displayMode: 'named',
      displayName: 'A. Builder',
      role: 'Lead engineer',
      kind: 'colaberry_team',
    },
    { displayMode: 'role_only', role: 'Data engineer', kind: 'client_team' },
  ],
  artifacts: [
    {
      access: 'open',
      artifactType: 'architecture',
      title: 'System diagram',
      description: null,
      url: 'https://example.com/diagram.png',
      previewUrl: null,
    },
    { access: 'request', artifactType: 'deck', title: 'Executive summary', description: null },
  ],
  repositories: [
    {
      label: 'Forecasting service',
      role: 'primary',
      url: 'https://github.com/colaberry/public-example',
      lastCommitDate: '2026-08-01',
    },
  ],
  privateRepositoryCount: 2,
  anonymousContributorCount: 1,
  cta: {
    eyebrow: 'Same shape, different workflow',
    heading: 'Bring us a workflow worth improving.',
    buttonLabel: 'Map an opportunity',
    href: '/lab',
  },
  seo: {
    title: 'Cutting stockouts with a forecasting agent',
    description: 'A four-week build against a live replenishment workflow.',
    canonicalUrl: 'https://enterprise.colaberry.ai/stories/stockout-forecasting',
    ogImageUrl: null,
    ogType: 'article',
  },
};

/**
 * Runtime member lists for the unions that have no exported `as const` mirror.
 *
 * These are typed to the union, so they are the runtime half of the
 * exhaustiveness guarantee — the compile-time half lives in the `switch`
 * statements in `caseStudyGuards.ts`, which `tsc --noEmit` actually checks.
 */
export const UNION_MEMBERS = {
  roadmapStatus: [
    'shipped',
    'in_progress',
    'paused',
    'not_pursued',
    'unknown',
  ] as readonly CaseStudyRoadmapStatus[],
  builtByType: [
    'learner',
    'intern',
    'client_team',
    'colaberry_team',
    'ai_flotation_team',
    'joint_team',
  ] as readonly CaseStudyBuiltByType[],
  builderIdentityMode: [
    'named',
    'role_only',
    'anonymous',
  ] as readonly CaseStudyBuilderIdentityMode[],
  organizationIdentityMode: [
    'named',
    'anonymized',
    'hidden',
  ] as readonly CaseStudyOrganizationIdentityMode[],
  artifactVisibility: [
    'public',
    'request_only',
    'private',
  ] as readonly CaseStudyArtifactVisibility[],
  repoVisibility: ['public', 'private', 'unknown'] as readonly CaseStudyRepoVisibility[],
  caseStudyStatus: [
    'draft',
    'review',
    'approved',
    'published',
    'archived',
  ] as readonly CaseStudyStatus[],
  sectionKey: [
    'hero',
    'situation',
    'build',
    'architecture',
    'measurement',
    'roadmap',
    'contributors',
    'artifacts',
    'repositories',
    'cta',
  ] as readonly CaseStudySectionKey[],
} as const;
