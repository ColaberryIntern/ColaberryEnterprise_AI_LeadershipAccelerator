/**
 * Fixtures for the public API suites (T014).
 *
 * NOT A TEST FILE - jest's `testMatch` collects `**\/__tests__/**\/*.test.ts`,
 * so this is imported and never run on its own (same arrangement as
 * `snapshotFixtures.ts` and `githubFetchFake.ts`).
 *
 * THE FIXTURE IS THE ARGUMENT. `internalSnapshotContent()` is a MAXIMAL internal
 * record: every optional section populated, both contributor consent modes, all
 * four artifact states, a public repository AND a private one, a publishable
 * verified metric AND a pending one AND an unpublishable one - plus a dozen
 * fields that exist nowhere on the public contract (review notes, a student
 * email, an enrollment id, an admin id, a private repo URL, internal ids). A
 * leak test against a sparse payload proves nothing, because the field that
 * leaks is the one nobody filled in.
 *
 * `SENTINELS` is the list of strings that must never appear anywhere in a public
 * payload, at any nesting depth. Each carries the name of what it stands for, so
 * a failure reports "student email leaked" rather than a hex string.
 */

import type { CaseStudySnapshotContent } from '../../../types/caseStudy';

/* ------------------------------------------------------------ sentinels --- */

export interface Sentinel { readonly what: string; readonly value: string }

export const PRIVATE_REPO_URL = 'https://github.com/acme-private-org/private-internal-repo';

export const SENTINELS: readonly Sentinel[] = [
  { what: 'private repository URL', value: PRIVATE_REPO_URL },
  { what: 'private repository owner', value: 'acme-private-org' },
  { what: 'private repository name', value: 'private-internal-repo' },
  { what: 'private repository branch', value: 'internal-release-branch' },
  { what: 'private repository commit sha', value: 'f00dbabe'.repeat(5) },
  { what: 'draft review note', value: 'DRAFT REVIEW NOTE do not publish this yet' },
  { what: 'internal note', value: 'INTERNAL NOTE margin was thin on this engagement' },
  { what: 'student email', value: 'student.builder@example.edu' },
  { what: 'enrollment id', value: 'enr-11111111-2222-4333-8444-555555555555' },
  { what: 'admin id', value: 'admin-9f3c1e7743b04d5a' },
  { what: 'case study id', value: 'cs-22222222-3333-4444-8555-666666666666' },
  { what: 'snapshot id', value: 'snap-33333333-4444-4555-8666-777777777777' },
  { what: 'project id', value: 'proj-44444444-5555-4666-8777-888888888888' },
  { what: 'evidence id', value: 'ev-55555555-6666-4777-8888-999999999999' },
  { what: 'artifact id', value: 'art-66666666-7777-4888-8999-aaaaaaaaaaaa' },
  { what: 'project variables blob', value: 'PROJECT_VARIABLES_SECRET_BLOB' },
  { what: 'internal client name', value: 'Northwind Provisions Holdings Inc' },
  { what: 'timeline source ref', value: 'sha:deadbeefdeadbeefdeadbeefdeadbeef' },
  { what: 'pending metric figure', value: 'PENDING FIGURE 99 percent' },
  { what: 'unpublishable metric figure', value: 'UNPUBLISHABLE FIGURE 77 percent' },
  { what: 'unapproved artifact title', value: 'CANDIDATE deck not cleared for release' },
  { what: 'private artifact url', value: 'https://files.internal.example/private-deck.pdf' },
  { what: 'unconsented contributor name', value: 'Jordan Unconsented' },
  { what: 'github access token', value: 'ghp_thisisnotarealtokenbutlookslikeone' },
];

/* -------------------------------------------------------------- content --- */

const verified = (evidenceId: string) => ({
  class: 'verified' as const,
  method: 'repo' as const,
  verifiedAt: '2026-08-01T00:00:00.000Z',
  evidenceId,
});

/**
 * A maximal internal snapshot, plus the fields a public payload must never
 * carry. The rogue fields are attached through one `as unknown as` at the end:
 * the internal type does not declare `reviewNotes` either, which is the point -
 * real JSONB carries whatever was written into it, and the projection must cope
 * with a column that is wider than any TypeScript type claims.
 */
export function internalSnapshotContent(
  over: Partial<Record<string, unknown>> = {},
): CaseStudySnapshotContent {
  const content = {
    identity: {
      slug: 'stockout-forecasting',
      title: 'Cutting stockouts with a forecasting agent',
      standfirst: 'A four-week build against a live replenishment workflow.',
      summary: 'Replenishment planners were reconciling three systems by hand.',
      organizationDisplayName: 'A national grocery distributor',
      organizationIdentityMode: 'anonymized',
      organizationNamingConsent: false,
      builderIdentityMode: 'role_only',
      builderNamingConsent: false,
      builtByType: 'colaberry_team',
      programLabel: 'Enterprise AI Leadership Accelerator',
      engagementWindow: {
        start: '2026-06-01',
        end: '2026-06-28',
        durationLabel: 'Four weeks',
        verification: verified('ev-55555555-6666-4777-8888-999999999999'),
      },
      productionStatus: {
        status: 'shipped',
        verification: verified('ev-55555555-6666-4777-8888-999999999999'),
      },
      // Fields that exist on no public type.
      reviewNotes: 'DRAFT REVIEW NOTE do not publish this yet',
      internalNotes: 'INTERNAL NOTE margin was thin on this engagement',
      clientLegalName: 'Northwind Provisions Holdings Inc',
      studentEmail: 'student.builder@example.edu',
      enrollmentId: 'enr-11111111-2222-4333-8444-555555555555',
    },
    heroMetrics: [
      {
        key: 'stockouts', label: 'Stockouts per store per week', valueDisplay: '41% fewer',
        unit: null, metricType: 'business_outcome', isHeadline: true, publishable: true,
        verification: verified('ev-55555555-6666-4777-8888-999999999999'),
        measurement: {
          baseline: '6.8 per store per week', sample: '212 stores, 8 weeks',
          measured: '2026-06-28', methodology: 'Pre/post over matched cohorts.',
          limitations: ['Seasonality not adjusted for.'],
        },
      },
      {
        key: 'pending_roi', label: 'Return on investment',
        valueDisplay: 'PENDING FIGURE 99 percent', unit: null, metricType: 'business_outcome',
        isHeadline: true, publishable: true,
        verification: { class: 'pending', method: 'client' },
        measurement: { limitations: [] },
      },
      {
        key: 'internal_margin', label: 'Internal margin',
        valueDisplay: 'UNPUBLISHABLE FIGURE 77 percent', unit: null, metricType: 'delivery',
        isHeadline: false, publishable: false,
        verification: verified('ev-55555555-6666-4777-8888-999999999999'),
        measurement: { limitations: [] },
      },
    ],
    situation: {
      narrative: ['Replenishment planners were reconciling three systems by hand.'],
      constraints: ['No write access to the ERP.'],
      goals: ['Cut manual reconciliation.'],
      verification: verified('ev-55555555-6666-4777-8888-999999999999'),
    },
    buildTimeline: [
      {
        date: '2026-06-01', label: 'First working forecast', detail: 'Batch job green.',
        source: 'commit', sourceRef: 'sha:deadbeefdeadbeefdeadbeefdeadbeef',
        verification: verified('ev-55555555-6666-4777-8888-999999999999'),
      },
      {
        date: '2026-06-20', label: 'Unverified rollout claim', source: 'milestone',
        verification: { class: 'pending', method: 'self' },
      },
    ],
    architecture: {
      narrative: ['A scheduled extractor feeds a forecasting agent.'],
      stack: ['TypeScript', 'Postgres'], capabilities: ['Agentic forecasting'],
      integrations: ['ERP'], dataStores: ['postgres'],
      diagram: {
        nodes: [{ id: 'api', label: 'API', kind: 'service' }],
        edges: [{ from: 'api', to: 'db', label: 'writes' }],
      },
    },
    measurement: {
      narrative: ['Measured against matched store cohorts.'],
      metrics: [
        {
          key: 'cycle_time', label: 'Planner cycle time', valueDisplay: '3h to 20m',
          unit: null, metricType: 'delivery', isHeadline: false, publishable: true,
          verification: { class: 'anonymized', method: 'client' },
          measurement: { limitations: [] },
        },
      ],
    },
    roadmap: [
      {
        label: 'Regional rollout', status: 'in_progress', detail: null,
        verification: verified('ev-55555555-6666-4777-8888-999999999999'),
      },
    ],
    contributors: [
      {
        displayMode: 'named', displayName: 'Jordan Unconsented', role: 'Lead engineer',
        kind: 'colaberry_team', consentRecordedAt: '2026-06-02T00:00:00.000Z',
      },
      { displayMode: 'role_only', role: 'Data engineer', kind: 'client_team' },
      { displayMode: 'anonymous', kind: 'learner' },
    ],
    artifacts: [
      {
        id: 'art-66666666-7777-4888-8999-aaaaaaaaaaaa', artifactType: 'architecture',
        title: 'System diagram', sourceType: 'repo', visibility: 'public', status: 'approved',
        publicUrl: 'https://example.com/diagram.png',
        sourceCommitSha: 'f00dbabe'.repeat(5),
      },
      {
        id: 'art-77777777-7777-4888-8999-aaaaaaaaaaaa', artifactType: 'deck',
        title: 'Executive summary', sourceType: 'manual', visibility: 'request_only',
        status: 'approved',
      },
      {
        id: 'art-88888888-7777-4888-8999-aaaaaaaaaaaa', artifactType: 'report',
        title: 'Internal margin report', sourceType: 'manual', visibility: 'private',
        status: 'approved', publicUrl: 'https://files.internal.example/private-deck.pdf',
      },
      {
        id: 'art-99999999-7777-4888-8999-aaaaaaaaaaaa', artifactType: 'deck',
        title: 'CANDIDATE deck not cleared for release', sourceType: 'manual',
        visibility: 'public', status: 'candidate',
        publicUrl: 'https://files.internal.example/private-deck.pdf',
      },
    ],
    repositories: [
      {
        repoOwner: 'colaberry', repoName: 'public-example',
        repoUrl: 'https://github.com/colaberry/public-example', role: 'primary',
        visibility: 'public', accessStatus: 'connected', allowPublicRepoLink: true,
        defaultBranch: 'main', lastSyncedAt: '2026-08-01T00:00:00.000Z',
      },
      {
        repoOwner: 'acme-private-org', repoName: 'private-internal-repo',
        repoUrl: PRIVATE_REPO_URL, role: 'backend', visibility: 'private',
        accessStatus: 'connected', allowPublicRepoLink: false,
        defaultBranch: 'internal-release-branch', lastSeenSha: 'f00dbabe'.repeat(5),
      },
      {
        repoOwner: 'acme-private-org', repoName: 'unknown-visibility-repo',
        repoUrl: PRIVATE_REPO_URL, role: 'data', visibility: 'unknown',
        accessStatus: 'unknown', allowPublicRepoLink: true,
      },
    ],
    taxonomy: {
      industry: 'Retail Distribution', primaryCapability: 'Agentic Forecasting',
      capabilities: ['Agentic Forecasting', 'Data Pipelines'],
      stack: ['TypeScript', 'Postgres'], programKey: 'enterprise-accelerator',
      builtByType: 'colaberry_team', deliverables: ['Architecture', 'Evaluation'],
      projectStatus: 'shipped',
    },
    // Whole-record fields that must never cross the boundary.
    id: 'cs-22222222-3333-4444-8555-666666666666',
    caseStudyId: 'cs-22222222-3333-4444-8555-666666666666',
    snapshotId: 'snap-33333333-4444-4555-8666-777777777777',
    projectId: 'proj-44444444-5555-4666-8777-888888888888',
    createdBy: 'admin-9f3c1e7743b04d5a',
    approvedBy: 'admin-9f3c1e7743b04d5a',
    reviewNotes: 'DRAFT REVIEW NOTE do not publish this yet',
    projectVariables: { secret: 'PROJECT_VARIABLES_SECRET_BLOB' },
    githubToken: 'ghp_thisisnotarealtokenbutlookslikeone',
    metadata: { studentEmail: 'student.builder@example.edu' },
    ...over,
  };
  return content as unknown as CaseStudySnapshotContent;
}

/* ------------------------------------------------------------ deep scan --- */

/** Every key at every depth, so a leak two objects down still fails the test. */
export function deepKeys(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) deepKeys(item, out);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out.add(k);
      deepKeys(v, out);
    }
  }
  return out;
}

/** Every string at every depth, including keys, so a value leak fails too. */
export function deepStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') { out.push(value); return out; }
  if (Array.isArray(value)) {
    for (const item of value) deepStrings(item, out);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out.push(k);
      deepStrings(v, out);
    }
  }
  return out;
}
