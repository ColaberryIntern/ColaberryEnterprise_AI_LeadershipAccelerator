import type {
  PublicCaseStudyArchitecture,
  PublicCaseStudyArtifact,
  PublicCaseStudyCta,
  PublicCaseStudyMeasurement,
  PublicCaseStudyMetric,
  PublicCaseStudyRoadmapItem,
  PublicCaseStudySummary,
  PublicCaseStudyTimelineEntry,
} from '../../../services/caseStudyPublicTypes';

/**
 * Fixtures for the case-study component suite.
 *
 * They are BUILDERS, not constants, so a test that needs a record with one field
 * missing says exactly that (`summary({ headlineMetric: null })`) instead of
 * copying a whole object and quietly changing three things. The no-invented-
 * metric tests depend on knowing precisely which strings a payload contains, so
 * every value here is deliberately distinctive.
 *
 * Not in `__tests__/` on purpose: CRA's jest collects every file under that
 * directory as a suite, and a fixtures module there fails with "must contain at
 * least one test".
 */

export const metric = (
  overrides: Partial<PublicCaseStudyMetric> = {},
): PublicCaseStudyMetric => ({
  label: 'Stockouts per quarter',
  valueDisplay: '41% fewer',
  unit: null,
  verificationClass: 'verified',
  verificationMethod: 'client',
  baseline: 'approximately 300 per quarter',
  sample: 'eight distribution sites',
  methodology: 'Counted from the client inventory export before and after.',
  limitations: ['One season of data.'],
  ...overrides,
});

export const summary = (
  overrides: Partial<PublicCaseStudySummary> = {},
): PublicCaseStudySummary => ({
  slug: 'sample-record',
  title: 'A routing agent for dispatch planners',
  standfirst: 'What the team shipped, and what changed afterwards.',
  organizationLabel: 'A regional distributor',
  industry: 'Logistics',
  primaryCapability: 'Agentic workflow',
  capabilities: ['Agentic workflow', 'Retrieval'],
  stack: ['Claude', 'MCP'],
  programLabel: 'Delivery cohort',
  builtBy: 'colaberry_team',
  verificationClass: 'verified',
  verificationMethod: 'repo',
  headlineMetric: metric(),
  deliverables: ['Planner console', 'Evaluation harness'],
  featured: false,
  publishedAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z',
  heroImageUrl: null,
  ...overrides,
});

export const timelineEntry = (
  overrides: Partial<PublicCaseStudyTimelineEntry> = {},
): PublicCaseStudyTimelineEntry => ({
  date: '2026-03-04',
  endDate: null,
  label: 'First working slice merged',
  detail: 'The planner console rendered live routes.',
  sourceKind: 'repository',
  ...overrides,
});

export const architecture = (
  overrides: Partial<PublicCaseStudyArchitecture> = {},
): PublicCaseStudyArchitecture => ({
  narrative: ['A queue in front, a planner behind it.'],
  stack: ['Claude', 'Postgres'],
  capabilities: ['Agentic workflow'],
  integrations: ['Warehouse export'],
  // EMPTY BY DEFAULT, and for the same reason `diagramSource` is null by
  // default: it is the ordinary case. Data stores are derived from repository
  // evidence, so a front-end-only repository yields none, and a fixture that
  // supplied them by default would make "the list hides when empty" the unusual
  // path rather than the one every other suite exercises.
  dataStores: [],
  diagram: {
    nodes: [
      { key: 'api', label: 'Planner API', kind: 'service' },
      { key: 'worker', label: 'Route worker', kind: 'worker' },
    ],
    edges: [{ from: 'api', to: 'worker', label: 'queues' }],
  },
  // Null by DEFAULT, because null is the normal case: almost no record carries a
  // hand-drawn chart. A fixture that supplied one by default would make the
  // "band hides when there is no source" test the unusual path rather than the
  // ordinary one, and every other suite would silently start rendering mermaid.
  diagramSource: null,
  ...overrides,
});

export const measurement = (
  overrides: Partial<PublicCaseStudyMeasurement> = {},
): PublicCaseStudyMeasurement => ({
  narrative: ['Measured against the quarter before the rollout.'],
  metrics: [metric()],
  ...overrides,
});

export const roadmapItem = (
  overrides: Partial<PublicCaseStudyRoadmapItem> = {},
): PublicCaseStudyRoadmapItem => ({
  label: 'Second region',
  status: 'in_progress',
  detail: 'Pending a data-sharing agreement.',
  ...overrides,
});

export const openArtifact = (
  overrides: Partial<Extract<PublicCaseStudyArtifact, { access: 'open' }>> = {},
): PublicCaseStudyArtifact => ({
  access: 'open',
  artifactType: 'deck',
  presentation: 'evidence',
  title: 'Executive walkthrough',
  description: 'Twelve slides on the rollout.',
  url: 'https://example.org/walkthrough',
  previewUrl: null,
  ...overrides,
});

export const requestArtifact = (): PublicCaseStudyArtifact => ({
  access: 'request',
  artifactType: 'evaluation',
  presentation: 'evidence',
  title: 'Evaluation results',
  description: null,
});

/**
 * A picture OF the delivered work. `previewUrl` is deliberately null on one of
 * the two image builders below and set on the other, so a suite exercising the
 * carousel covers both the "publisher supplied a thumbnail" and the "fall back
 * to the asset itself" paths rather than only whichever one the fixture happened
 * to pick.
 */
export const screenshotArtifact = (
  overrides: Partial<Extract<PublicCaseStudyArtifact, { access: 'open' }>> = {},
): PublicCaseStudyArtifact => ({
  access: 'open',
  artifactType: 'screenshot',
  presentation: 'evidence',
  title: 'The planner console',
  description: 'The route list as a dispatcher sees it.',
  url: 'https://example.org/console.png',
  previewUrl: 'https://example.org/console-thumb.png',
  ...overrides,
});

/**
 * ATMOSPHERE, NEVER EVIDENCE. Its caption says where the picture was taken and
 * makes no claim about the system - which is the only kind of photograph the
 * server will publish at all. `presentation` is what the server stamped, not
 * something a fixture gets to choose freely: a photograph is always atmosphere.
 */
export const photoArtifact = (
  overrides: Partial<Extract<PublicCaseStudyArtifact, { access: 'open' }>> = {},
): PublicCaseStudyArtifact => ({
  access: 'open',
  artifactType: 'photo',
  presentation: 'atmosphere',
  title: 'The Dallas studio during a working session',
  description: null,
  url: 'https://example.org/studio.jpg',
  previewUrl: null,
  ...overrides,
});

export const cta = (overrides: Partial<PublicCaseStudyCta> = {}): PublicCaseStudyCta => ({
  eyebrow: 'Same shape, different workflow',
  heading: 'Bring us a workflow worth improving.',
  buttonLabel: 'Map an opportunity',
  href: '/lab',
  ...overrides,
});
