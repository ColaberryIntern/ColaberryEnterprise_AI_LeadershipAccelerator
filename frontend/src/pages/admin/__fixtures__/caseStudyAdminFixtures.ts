import type {
  CaseStudyDetail, CaseStudyPublishBlocker, CaseStudyReadinessReport, CaseStudyRepositoryRecord,
  CaseStudySnapshotSummary, CaseStudySummary, CaseStudySurfacePreview, CaseStudySyncResult,
  CaseStudySyncRunSummary,
} from '../../../services/caseStudyAdminTypes';

/**
 * Fixtures for the Case Study admin suites — one realistic record, shaped like
 * what the backend actually returns.
 *
 * Deliberately NOT a clean record: the draft carries a pending metric, a private
 * repository, an anonymous contributor and a candidate artifact, because those
 * are exactly the things the publish gate refuses and the projection withholds.
 * A fixture where everything is already fine would let both of those behaviours
 * regress without a test noticing.
 *
 * Lives in `__fixtures__` rather than `__tests__` because CRA's jest testMatch
 * claims every file under `__tests__` as a suite (see `domHarness.tsx`).
 */

export const CASE_STUDY_ID = 'cs-1';
export const SNAPSHOT_DRAFT_ID = 'snap-draft';
export const SNAPSHOT_APPROVED_ID = 'snap-approved';
export const SNAPSHOT_PUBLISHED_ID = 'snap-published';
export const PUBLIC_REPO_ID = 'repo-public';
export const PRIVATE_REPO_ID = 'repo-private';

export function summaryFixture(over: Partial<CaseStudySummary> = {}): CaseStudySummary {
  return {
    id: CASE_STUDY_ID,
    slug: 'claims-triage-copilot',
    title: 'Claims triage copilot',
    status: 'review',
    sourceType: 'platform_project',
    projectId: 'proj-1',
    canonicalSummary: 'First-notice-of-loss triage, rebuilt as an agent workflow.',
    industry: 'Insurance',
    primaryCapability: 'agentic-workflow',
    programKey: 'enterprise-accelerator',
    builtByType: 'colaberry_team',
    visibility: 'public',
    organizationDisplayName: 'Northwind Mutual',
    organizationIsAnonymized: false,
    organizationIdentityMode: 'named',
    // Named WITHOUT consent: the state the gate refuses, and the state the
    // "Needs Consent" lens is meant to find.
    organizationNamingConsent: false,
    builderIdentityMode: 'role_only',
    builderNamingConsent: false,
    approvedBy: null,
    approvedAt: null,
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-20T09:00:00.000Z',
    archivedAt: null,
    ...over,
  };
}

const METRIC_HEADLINE = {
  key: 'claim_cycle_time',
  label: 'Median claim cycle time',
  valueDisplay: '4.2 days',
  unit: 'days',
  metricType: 'duration',
  isHeadline: true,
  // Pending and not publishable: the publish gate's `metric_pending` case.
  publishable: false,
  verification: { class: 'pending', method: 'client_reported' },
  measurement: { baseline: '9.1 days', sample: '1,204 claims', limitations: [] },
};

const METRIC_SECONDARY = {
  key: 'reopen_rate',
  label: 'Reopened claims',
  valueDisplay: '3%',
  unit: '%',
  metricType: 'rate',
  isHeadline: false,
  publishable: true,
  verification: {
    class: 'verified', method: 'system_export', verifiedAt: '2026-08-11T00:00:00.000Z',
    evidenceId: 'ev-1',
  },
  measurement: {
    baseline: '11%', sample: '1,204 claims', measured: '2026-08-10',
    methodology: 'Claims reopened within 30 days, from the claims system export.',
    limitations: ['One book of business only.'],
  },
};

export function snapshotFixture(
  id: string, version: number, status: 'draft' | 'approved' | 'superseded',
  over: Record<string, unknown> = {},
): CaseStudySnapshotSummary {
  return {
    id,
    version,
    status,
    contentHash: `hash-${version}`,
    generatedAt: '2026-08-20T08:00:00.000Z',
    generatedBy: 'repo_sync',
    approvedBy: status === 'approved' ? 'ali@colaberry.com' : null,
    approvedAt: status === 'approved' ? '2026-08-19T08:00:00.000Z' : null,
    content: {
      identity: {
        slug: 'claims-triage-copilot',
        title: 'Claims triage copilot',
        standfirst: 'Generated standfirst from the repository README.',
        summary: 'Generated summary.',
        organizationDisplayName: 'Northwind Mutual',
        organizationIdentityMode: 'named',
        organizationNamingConsent: false,
        builderIdentityMode: 'role_only',
        builderNamingConsent: false,
      },
      heroMetrics: [METRIC_HEADLINE],
      situation: { heading: 'First notice of loss', body: ['The intake queue was manual.'] },
      buildTimeline: [
        { date: '2026-05-04', label: 'First agent shipped', sourceKind: 'repository' },
      ],
      architecture: {
        narrative: ['A router in front of three specialist agents.'],
        stack: ['TypeScript', 'Postgres'],
        capabilities: ['agentic-workflow'],
        integrations: ['Guidewire'],
      },
      measurement: { narrative: ['Measured against the prior quarter.'], metrics: [METRIC_SECONDARY] },
      roadmap: [{ label: 'Subrogation', status: 'planned' }],
      contributors: [
        {
          displayMode: 'named', displayName: 'Dana Reyes', role: 'Lead engineer',
          kind: 'colaberry_team', consentRecordedAt: '2026-08-01T00:00:00.000Z',
        },
        { displayMode: 'anonymous', kind: 'client_team' },
      ],
      artifacts: [
        {
          id: 'art-1', artifactType: 'architecture_diagram', title: 'Routing diagram',
          sourceType: 'repository', visibility: 'public', status: 'approved',
          publicUrl: 'https://example.test/diagram.png',
        },
        {
          id: 'art-2', artifactType: 'demo_video', title: 'Internal demo',
          sourceType: 'upload', visibility: 'private', status: 'candidate',
        },
      ],
      repositories: [
        { repoOwner: 'colaberry', repoName: 'claims-router', role: 'primary', visibility: 'public' },
        { repoOwner: 'northwind', repoName: 'internal-rules', role: 'backend', visibility: 'private' },
      ],
      taxonomy: {
        industry: 'Insurance', primaryCapability: 'agentic-workflow',
        capabilities: ['agentic-workflow'], stack: ['TypeScript'], deliverables: ['service'],
      },
      ...over,
    },
    provenance: {
      'identity.title': { source: 'repository_analysis', sourceRef: 'a1b2c3d' },
      'identity.standfirst': { source: 'human_override', note: 'rewritten for the enterprise page' },
      'heroMetrics.0.valueDisplay': { source: 'manifest' },
    },
    sourceCommitMap: { 'colaberry/claims-router': 'a1b2c3d' },
  };
}

export function repositoriesFixture(): CaseStudyRepositoryRecord[] {
  return [
    {
      id: PUBLIC_REPO_ID, collectionId: 'col-1', repoOwner: 'colaberry',
      repoName: 'claims-router', repoUrl: 'https://github.com/colaberry/claims-router',
      role: 'primary', visibility: 'public', accessStatus: 'connected', allowPublicRepoLink: true,
      defaultBranch: 'main', lastSeenSha: 'a1b2c3d', lastSyncedAt: '2026-08-20T08:00:00.000Z',
    },
    {
      id: PRIVATE_REPO_ID, collectionId: 'col-1', repoOwner: 'northwind',
      repoName: 'internal-rules', repoUrl: 'https://github.com/northwind/internal-rules',
      role: 'backend', visibility: 'private', accessStatus: 'unavailable',
      allowPublicRepoLink: false, lastSyncedAt: '2026-08-18T08:00:00.000Z',
    },
  ];
}

export function readinessFixture(): CaseStudyReadinessReport {
  return {
    score: 54,
    maxScore: 100,
    band: 'developing',
    categories: [
      {
        category: 'evidence', label: 'Evidence', weight: 20, awarded: 6,
        summary: 'Evidence: 6/20',
        gaps: [{
          category: 'evidence', categoryLabel: 'Evidence', checkKey: 'evidence.headline_linked',
          pointsLost: 14, pointsPossible: 20,
          detail: 'the headline metric has no linked evidence record',
          remedy: 'attach the claims system export to the headline metric',
        }],
      },
      {
        category: 'artifacts', label: 'Artifacts/media', weight: 10, awarded: 4,
        summary: 'Artifacts/media: 4/10',
        gaps: [{
          category: 'artifacts', categoryLabel: 'Artifacts/media', checkKey: 'artifacts.hero_image',
          pointsLost: 6, pointsPossible: 10,
          detail: 'no approved hero image',
          remedy: 'approve a hero image so the enterprise card is not textless',
        }],
      },
    ],
    gaps: [
      {
        category: 'evidence', categoryLabel: 'Evidence', checkKey: 'evidence.headline_linked',
        pointsLost: 14, pointsPossible: 20,
        detail: 'the headline metric has no linked evidence record',
        remedy: 'attach the claims system export to the headline metric',
      },
      {
        category: 'artifacts', categoryLabel: 'Artifacts/media', checkKey: 'artifacts.hero_image',
        pointsLost: 6, pointsPossible: 10,
        detail: 'no approved hero image',
        remedy: 'approve a hero image so the enterprise card is not textless',
      },
    ],
    advisory: 'Readiness is advisory. Publication is decided by the publish gate.',
  };
}

export function blockersFixture(): CaseStudyPublishBlocker[] {
  return [
    {
      code: 'metric_pending',
      field: 'heroMetrics.0.verification.class',
      message: 'headline metric "Median claim cycle time" is still pending verification',
      remedy: 'verify the figure against its evidence record, or unset it as a headline metric',
    },
    {
      code: 'organization_consent',
      field: 'identity.organizationNamingConsent',
      message: 'organization name "Northwind Mutual" is visible but naming consent is not approved',
      remedy: 'record the naming consent, or set the identity mode to "anonymized"',
    },
  ];
}

export function detailFixture(over: Partial<CaseStudyDetail> = {}): CaseStudyDetail {
  return {
    caseStudy: summaryFixture(),
    repositories: repositoriesFixture(),
    latestSnapshot: snapshotFixture(SNAPSHOT_DRAFT_ID, 3, 'draft'),
    approvedSnapshot: snapshotFixture(SNAPSHOT_APPROVED_ID, 2, 'approved'),
    publications: [{
      id: 'pub-1', surfaceKey: 'enterprise', status: 'published',
      publishedSnapshotId: SNAPSHOT_PUBLISHED_ID, publishedAt: '2026-08-15T00:00:00.000Z',
      unpublishedAt: null,
    }],
    readiness: readinessFixture(),
    ...over,
  };
}

export function previewFixture(over: Partial<CaseStudySurfacePreview> = {}): CaseStudySurfacePreview {
  const blockers = blockersFixture();
  return {
    surfaceKey: 'enterprise',
    snapshot: snapshotFixture(SNAPSHOT_DRAFT_ID, 3, 'draft'),
    source: 'latest_draft',
    decision: {
      allowed: false,
      blockers,
      codes: ['metric_pending', 'organization_consent'],
      summary: `Cannot publish:\n- ${blockers[0].message}\n- ${blockers[1].message}`,
    },
    readiness: readinessFixture(),
    projection: {
      slug: 'claims-triage-copilot',
      title: 'Claims triage copilot',
      standfirst: 'Generated standfirst from the repository README.',
      // Consent is not recorded, so the projection does not name the client.
      organizationLabel: 'A national insurance carrier',
      industry: 'Insurance',
      primaryCapability: 'agentic-workflow',
      capabilities: ['agentic-workflow'],
      stack: ['TypeScript'],
      verificationClass: 'verified',
      // Only the verified, publishable figure survives.
      heroMetrics: [{ label: 'Reopened claims', valueDisplay: '3%' }],
      contributors: [{ role: 'Lead engineer', displayMode: 'named' }],
      artifacts: [{ title: 'Routing diagram', access: 'open' }],
      repositories: [{ label: 'claims-router', url: 'https://github.com/colaberry/claims-router' }],
      privateRepositoryCount: 1,
      anonymousContributorCount: 1,
    },
    ...over,
  };
}

export function syncResultFixture(): CaseStudySyncResult {
  return {
    syncRunId: 'run-1',
    caseStudyId: CASE_STUDY_ID,
    status: 'partial',
    trigger: 'manual',
    counts: {
      reposAttempted: 2, reposSucceeded: 1, reposFailed: 1, factsExtracted: 14, candidateMetrics: 2,
    },
    snapshotId: SNAPSHOT_DRAFT_ID,
    snapshotVersion: 3,
    snapshotOutcome: 'created',
    contentHash: 'hash-3',
    repoErrors: [{
      repositoryId: PRIVATE_REPO_ID, repoRef: 'repo:7f2a',
      errorClass: 'UpstreamUnavailable', message: 'the repository could not be read',
    }],
    repoIssues: [],
    errorClass: null,
    errorSummary: null,
    unknownProvenanceFields: [],
    startedAt: '2026-08-20T08:00:00.000Z',
    completedAt: '2026-08-20T08:00:40.000Z',
  };
}

export function syncRunsFixture(): CaseStudySyncRunSummary[] {
  return [{
    id: 'run-1', trigger: 'manual', status: 'partial', reposAttempted: 2, reposSucceeded: 1,
    reposFailed: 1, factsExtracted: 14, candidateMetrics: 2, snapshotId: SNAPSHOT_DRAFT_ID,
    errorClass: null, errorSummary: null,
    startedAt: '2026-08-20T08:00:00.000Z', completedAt: '2026-08-20T08:00:40.000Z',
  }];
}
