import type { CaseStudyListQuery } from '../../../services/caseStudyAdminApi';
import type {
  CaseStudyDetail, CaseStudyReadinessGap, CaseStudyRepositoryRecord, CaseStudySummary,
} from '../../../services/caseStudyAdminTypes';

/**
 * caseStudyDesk — the vocabulary the Case Study review desk is built from, in
 * one module so the panels, the pages and the suite cannot drift apart.
 *
 * `CASE_STUDY_CONTROLS` is the point of the file. Spec §18 names the capabilities
 * this surface must offer; each one is listed here against the `data-testid` the
 * component that implements it must carry. The panels read the ids FROM here
 * rather than writing string literals, and `AdminCaseStudies.controls.test.tsx`
 * walks the same list, so dropping a capability fails the suite BY NAME instead
 * of quietly shrinking the page.
 */

export const CASE_STUDY_CONTROLS = {
  'dashboard': 'cs-dashboard',
  'candidate states': 'cs-states',
  'create from Project': 'cs-create-from-project',
  'create from a repo collection': 'cs-create-from-repositories',
  'attach repos': 'cs-attach-repository',
  'remove repos': 'cs-remove-repository',
  'assign repo roles': 'cs-repo-role',
  'sync': 'cs-sync',
  'inspect provenance': 'cs-provenance-version',
  'review/edit narrative': 'cs-narrative-override',
  'metrics': 'cs-metric-override',
  'evidence': 'cs-evidence-override',
  'artifacts': 'cs-artifact-override',
  'contributors': 'cs-contributor-override',
  'consent': 'cs-consent-save',
  'readiness gaps': 'cs-readiness-recheck',
  'preview': 'cs-preview',
  'approve': 'cs-approve',
  'publish': 'cs-publish',
  'unpublish': 'cs-unpublish',
  'archive': 'cs-archive',
  'sync history': 'cs-sync-history',
  'published-vs-draft diff': 'cs-published-draft-diff',
} as const;

export type CaseStudyCapability = keyof typeof CASE_STUDY_CONTROLS;

/** Spec §18's capability list, in the order the spec states it. */
export const SPEC_18_CAPABILITIES = Object.keys(CASE_STUDY_CONTROLS) as CaseStudyCapability[];

/**
 * The `data-testid` for a repeated control (one per metric, per artifact, per
 * repository). The FIRST row carries the bare capability id so the suite can
 * address "the metrics control" without knowing the fixture's ordering, and
 * every later row is suffixed so no two ids collide.
 */
export const controlIdAt = (capability: CaseStudyCapability, index: number): string =>
  (index === 0 ? CASE_STUDY_CONTROLS[capability] : `${CASE_STUDY_CONTROLS[capability]}-${index}`);

/* ─────────────────────────────────────────────────────── candidate states ─── */

/**
 * Spec §18's tab list. `query` is what the tab actually asks the API for;
 * `lens` is the part the API cannot answer.
 *
 * The list endpoint filters on `status`, `industry`, `projectId`, `search` and
 * `includeArchived` and NOTHING else — it returns `CaseStudySummary`, which
 * carries no repositories, no readiness and no sync history. So "Needs Consent"
 * is derivable from the summary (the consent columns are on it), while "Needs
 * Evidence" and "Sync Issues" are not derivable at all without reading each
 * record. Those two therefore carry a lens that is applied to the desk scan, and
 * the page says plainly when the scan has not run rather than showing a filtered
 * list that silently omits records it never looked at.
 */
export type CaseStudyLens = 'none' | 'consent' | 'evidence' | 'sync';

export interface CaseStudyStateDef {
  readonly key: string;
  readonly label: string;
  readonly query: CaseStudyListQuery;
  readonly lens: CaseStudyLens;
  /** Rendered beside the table so the filter's basis is never a mystery. */
  readonly hint: string;
}

export const CASE_STUDY_STATES: readonly CaseStudyStateDef[] = [
  {
    key: 'all', label: 'All', query: { includeArchived: false }, lens: 'none',
    hint: 'Every record except archived ones.',
  },
  {
    key: 'candidates', label: 'Candidates', query: { status: 'draft', includeArchived: false },
    lens: 'none', hint: 'Drafts that have not been sent for review.',
  },
  {
    key: 'needs-evidence', label: 'Needs Evidence', query: { includeArchived: false },
    lens: 'evidence',
    hint: 'Records whose readiness report has an open gap in the Evidence category. '
      + 'Requires the desk scan, because the list API does not return readiness.',
  },
  {
    key: 'needs-consent', label: 'Needs Consent', query: { includeArchived: false },
    lens: 'consent',
    hint: 'Records that name an organization or a builder without recorded consent.',
  },
  {
    key: 'ready-for-review', label: 'Ready for Review',
    query: { status: 'review', includeArchived: false }, lens: 'none',
    hint: 'Submitted for human review.',
  },
  {
    key: 'published', label: 'Published', query: { status: 'published', includeArchived: false },
    lens: 'none', hint: 'Live on a public surface.',
  },
  {
    key: 'archived', label: 'Archived', query: { status: 'archived', includeArchived: true },
    lens: 'none', hint: 'Archived records. Nothing is deleted; snapshots and history survive.',
  },
  {
    key: 'sync-issues', label: 'Sync Issues', query: { includeArchived: false }, lens: 'sync',
    hint: 'Records with an unreadable repository or no snapshot yet. '
      + 'Requires the desk scan, because the list API does not return repositories.',
  },
];

export const stateByKey = (key: string): CaseStudyStateDef =>
  CASE_STUDY_STATES.find((s) => s.key === key) ?? CASE_STUDY_STATES[0];

/* ──────────────────────────────────────────────────────────── the scan ────── */

/**
 * What reading ONE record tells the desk that the list could not. Bounded on
 * purpose: the scan covers at most `SCAN_LIMIT` records and the dashboard says
 * so, because a count over an unstated population is a claim nobody can check.
 */
export interface CaseStudyScanRow {
  readonly id: string;
  readonly repoCount: number;
  readonly connectedRepos: number;
  readonly unreadableRepos: number;
  readonly needsEvidence: boolean;
  readonly needsMedia: boolean;
  readonly syncIssue: boolean;
  /** ADVISORY. Rendered as a number beside the record, never as a gate. */
  readonly readinessScore: number | null;
  readonly readinessBand: string | null;
  readonly lastSyncedAt: string | null;
  /** `published`, `unpublished`, or `none` when the surface has no row yet. */
  readonly publicationState: string;
}

export const SCAN_LIMIT = 25;

const REPO_CONNECTED = ['connected', 'read_only'];

const hasGapIn = (gaps: readonly CaseStudyReadinessGap[], category: string): boolean =>
  gaps.some((g) => g.category === category);

/** The newest `lastSyncedAt` across a record's repositories, or null. */
function newestSync(repos: readonly CaseStudyRepositoryRecord[]): string | null {
  const stamps = repos.map((r) => r.lastSyncedAt).filter((v): v is string => !!v).sort();
  return stamps.length > 0 ? stamps[stamps.length - 1] : null;
}

export function scanRowFrom(detail: CaseStudyDetail): CaseStudyScanRow {
  const repos = detail.repositories;
  const unreadable = repos.filter((r) => !REPO_CONNECTED.includes(r.accessStatus)).length;
  const gaps = detail.readiness?.gaps ?? [];
  const enterprise = detail.publications.find((p) => p.surfaceKey === 'enterprise');
  return {
    id: detail.caseStudy.id,
    repoCount: repos.length,
    connectedRepos: repos.filter((r) => REPO_CONNECTED.includes(r.accessStatus)).length,
    unreadableRepos: unreadable,
    readinessScore: detail.readiness ? detail.readiness.score : null,
    readinessBand: detail.readiness ? detail.readiness.band : null,
    lastSyncedAt: newestSync(repos),
    publicationState: enterprise ? enterprise.status : 'none',
    // No readiness report means no evidence has been assessed, which is itself
    // "needs evidence" — never quietly the opposite.
    needsEvidence: detail.readiness === null || hasGapIn(gaps, 'evidence'),
    needsMedia: detail.readiness === null || hasGapIn(gaps, 'artifacts'),
    syncIssue: unreadable > 0 || detail.latestSnapshot === null,
  };
}

/**
 * Naming somebody, or their company, without a recorded consent. This is the
 * same pair of conditions the publish gate's `organization_consent` and
 * `builder_consent` rules check, computed from the columns the list returns.
 */
export function needsConsent(row: CaseStudySummary): boolean {
  return (row.organizationIdentityMode === 'named' && !row.organizationNamingConsent)
    || (row.builderIdentityMode === 'named' && !row.builderNamingConsent);
}

/** Apply a state's lens. `scan` is empty until the desk scan has run. */
export function applyLens(
  rows: readonly CaseStudySummary[], lens: CaseStudyLens,
  scan: ReadonlyMap<string, CaseStudyScanRow>,
): readonly CaseStudySummary[] {
  if (lens === 'none') return rows;
  if (lens === 'consent') return rows.filter(needsConsent);
  return rows.filter((r) => {
    const scanned = scan.get(r.id);
    if (!scanned) return false;
    return lens === 'evidence' ? scanned.needsEvidence : scanned.syncIssue;
  });
}

/* ────────────────────────────────────────────────────────── formatting ────── */

/**
 * `new Date(null)` renders "Invalid Date", which is what the business-accounts
 * Created column showed on production for weeks. Never print a date this cannot
 * parse.
 */
export function formatDate(value: string | null | undefined, withTime = false): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return withTime ? d.toLocaleString() : d.toLocaleDateString();
}

/**
 * How a repository is named ON SCREEN.
 *
 * A PUBLIC repository is named. Anything else — `private`, or `unknown`, which
 * fails closed the same way `repoLogIdentity` does on the backend — is shown as
 * the opaque row handle instead. That handle is the `case_study_repositories`
 * id, which is exactly what `SyncRepoError.repositoryId` exists for: it tells an
 * admin WHICH repository is at fault without this surface having to name a
 * private one. A private repo's owner/name is an identity, and identities do not
 * belong in a label that gets shoulder-read, screenshotted into a ticket, or
 * pasted into a report.
 *
 * SCOPE OF THAT GUARANTEE — read it precisely. It holds for every LABEL this
 * desk renders: the repositories panel, the sync panel, error rows, the preview
 * summary. It does NOT hold for the raw-snapshot column of the preview panel,
 * which `JSON.stringify`s the stored content verbatim and therefore prints
 * `repoOwner` and `repoName` in full.
 *
 * That is deliberate and required: spec §34 exists so a reviewer can compare
 * what is STORED against what would be PUBLISHED, and a redacted "raw" view
 * would defeat the comparison — the reviewer would be approving a version of the
 * truth rather than the truth. The public projection beside it is where the
 * private repo is dropped, which is the difference the screen is built to show.
 *
 * So the honest statement is: this function guarantees no private identity in a
 * label, and the preview's raw column is a deliberate, disclosed exception on an
 * admin-only screen. It is not a page-wide guarantee, and an earlier version of
 * this comment implied it was.
 */
export function repoLabel(repo: CaseStudyRepositoryRecord): string {
  if (repo.visibility === 'public') return `${repo.repoOwner}/${repo.repoName}`;
  return `Private repository ${repo.id.slice(0, 8)}`;
}

/** A repository link is offered only when the reader could actually open it. */
export const repoIsLinkable = (repo: CaseStudyRepositoryRecord): boolean =>
  repo.visibility === 'public' && repo.allowPublicRepoLink;
