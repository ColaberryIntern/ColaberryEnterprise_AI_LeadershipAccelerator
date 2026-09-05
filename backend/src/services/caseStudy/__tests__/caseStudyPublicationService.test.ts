/**
 * caseStudyPublicationService + caseStudyPublishGate — unit tests. T012.
 *
 * NO DATABASE, NO NETWORK, NO REAL CLOCK DEPENDENCY. Every Sequelize model this
 * path touches is mocked with an in-memory fake that enforces the same unique
 * index the DDL declares (`cs_publications_unique_case_surface ON
 * (case_study_id, surface_key)`, `db/ensureCaseStudySchema.ts:318-319`), so the
 * suite runs under `jest.ci.config.ts` with `DATABASE_URL` unset.
 *
 * THE FIXTURE IS THE ARGUMENT. `publishableContent()` is a Case Study that is
 * genuinely publishable: an anonymised organisation, role-only contributors, one
 * headline figure verified against a repository with an evidence pointer and a
 * measurement context, a public repository, and a production claim in the build
 * timeline that IS backed by a verified shipped status. Every rejection test
 * below takes that record and breaks exactly ONE thing, so a failing test names
 * the rule that fired rather than a fixture that was never valid in the first
 * place. `it('the reference record publishes')` is what keeps that honest.
 *
 * The thirteen acceptance criteria are tagged `AC1`…`AC13` in the test names.
 */
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/* ─────────────────────────────────────────────────────────── the fakes ───── */

type Row = Record<string, any>;

class FakeCaseStudyTable {
  rows: Row[] = [];
  writes = 0;

  reset(): void { this.rows = []; this.writes = 0; }

  seed(values: Row): Row {
    const row: Row = {
      id: randomUUID(), status: 'approved',
      organization_identity_mode: 'anonymized', organization_naming_consent: false,
      organization_display_name: null,
      builder_identity_mode: 'role_only', builder_naming_consent: false,
      archived_at: null, ...values,
    };
    this.rows.push(row);
    return row;
  }

  async findByPk(id: string): Promise<Row | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }

  async create(): Promise<Row> { this.writes += 1; throw new Error('case_studies must not be written'); }
  async update(): Promise<unknown> { this.writes += 1; throw new Error('case_studies must not be written'); }
  async destroy(): Promise<unknown> { this.writes += 1; throw new Error('case_studies must not be destroyed'); }
}

class FakeSnapshotTable {
  rows: Row[] = [];
  creates = 0;
  updates = 0;
  destroys = 0;

  reset(): void { this.rows = []; this.creates = 0; this.updates = 0; this.destroys = 0; }

  seed(values: Row): Row {
    const row: Row = {
      id: randomUUID(), version: 1, status: 'approved',
      approved_by: 'ali@colaberry.com', approved_at: new Date('2026-08-01T00:00:00.000Z'),
      content: {}, provenance: {}, content_hash: 'a'.repeat(64),
      generated_at: new Date('2026-08-01T00:00:00.000Z'), generated_by: 'repo_sync',
      ...values,
    };
    this.rows.push(row);
    return row;
  }

  /**
   * Honour the ORDER BY direction the caller actually asked for.
   *
   * This previously hard-coded a descending sort for ANY `order` clause, which
   * meant the direction was untested: flipping the service's
   * `[['version','DESC']]` to `ASC` — publishing the OLDEST approved snapshot
   * instead of the newest — left the whole suite green. A fake that answers a
   * question its own caller did not ask cannot detect a wrong question.
   */
  async findOne(opts: any): Promise<Row | null> {
    const where = opts?.where ?? {};
    let matching = this.rows.filter((r) => Object.keys(where).every((k) => r[k] === where[k]));
    const clause = Array.isArray(opts?.order) ? opts.order[0] : undefined;
    if (Array.isArray(clause)) {
      const [column, direction] = clause as [string, string];
      const descending = String(direction).toUpperCase() === 'DESC';
      matching = [...matching].sort((a, b) => (descending
        ? Number(b[column]) - Number(a[column])
        : Number(a[column]) - Number(b[column])));
    }
    return matching[0] ?? null;
  }

  async create(values: Row): Promise<Row> { this.creates += 1; return this.seed(values); }
  async update(): Promise<unknown> { this.updates += 1; return [0]; }
  async destroy(): Promise<unknown> { this.destroys += 1; return 0; }
}

class FakePublicationRow {
  constructor(private readonly table: FakePublicationTable, private readonly data: Row) {}
  get id(): string { return this.data.id; }
  get status(): string { return this.data.status; }
  get published_snapshot_id(): string | null { return this.data.published_snapshot_id ?? null; }
  get published_at(): Date | null { return this.data.published_at ?? null; }
  get unpublished_at(): Date | null { return this.data.unpublished_at ?? null; }
  get published_by(): string | null { return this.data.published_by ?? null; }
  raw(): Row { return this.data; }

  async update(values: Row): Promise<FakePublicationRow> {
    this.table.updates += 1;
    Object.assign(this.data, values);
    return this;
  }
}

class FakePublicationTable {
  rows: Row[] = [];
  creates = 0;
  updates = 0;
  destroys = 0;
  /** Fires once immediately before the next create — stages a concurrent insert. */
  beforeCreate: (() => void) | null = null;

  reset(): void {
    this.rows = []; this.creates = 0; this.updates = 0; this.destroys = 0; this.beforeCreate = null;
  }

  get writes(): number { return this.creates + this.updates + this.destroys; }

  /** Enforces `UNIQUE(case_study_id, surface_key)` exactly as the DDL does. */
  seed(values: Row): FakePublicationRow {
    const clash = this.rows.some((r) => r.case_study_id === values.case_study_id
      && r.surface_key === values.surface_key);
    if (clash) {
      const err: any = new Error('duplicate key value violates unique constraint "cs_publications_unique_case_surface"');
      err.name = 'SequelizeUniqueConstraintError';
      throw err;
    }
    const row: Row = {
      id: randomUUID(), status: 'draft', published_snapshot_id: null,
      published_by: null, published_at: null, unpublished_at: null, ...values,
    };
    this.rows.push(row);
    return new FakePublicationRow(this, row);
  }

  async findOne(opts: any): Promise<FakePublicationRow | null> {
    const where = opts?.where ?? {};
    const row = this.rows.find((r) => Object.keys(where).every((k) => r[k] === where[k]));
    return row ? new FakePublicationRow(this, row) : null;
  }

  async create(values: Row): Promise<FakePublicationRow> {
    if (this.beforeCreate) { const hook = this.beforeCreate; this.beforeCreate = null; hook(); }
    const created = this.seed(values);
    this.creates += 1;
    return created;
  }

  async destroy(): Promise<unknown> { this.destroys += 1; return 0; }
}

const caseStudies = new FakeCaseStudyTable();
const snapshots = new FakeSnapshotTable();
const publications = new FakePublicationTable();

jest.mock('../../../models/CaseStudy', () => ({
  __esModule: true,
  default: {
    findByPk: (id: string) => caseStudies.findByPk(id),
    create: (...a: any[]) => (caseStudies as any).create(...a),
    update: (...a: any[]) => (caseStudies as any).update(...a),
    destroy: (...a: any[]) => (caseStudies as any).destroy(...a),
  },
}));

jest.mock('../../../models/CaseStudySnapshot', () => ({
  __esModule: true,
  default: {
    findOne: (o: any) => snapshots.findOne(o),
    create: (v: any) => snapshots.create(v),
    update: (...a: any[]) => (snapshots as any).update(...a),
    destroy: (...a: any[]) => (snapshots as any).destroy(...a),
  },
}));

jest.mock('../../../models/CaseStudyPublication', () => ({
  __esModule: true,
  default: {
    findOne: (o: any) => publications.findOne(o),
    create: (v: any) => publications.create(v),
    destroy: (...a: any[]) => (publications as any).destroy(...a),
  },
}));

/**
 * The four models this feature must NEVER write. Spied on all six Sequelize
 * write methods. The service does not import them at all, which is the strongest
 * form of the guarantee — these spies exist so that the day somebody adds an
 * import, a test goes red instead of a customer's evidence row changing.
 */
const WRITE_METHODS = ['create', 'bulkCreate', 'update', 'upsert', 'destroy', 'findOrCreate'] as const;
const foreignModelMock = () => {
  const spies: Record<string, jest.Mock> = {};
  for (const m of WRITE_METHODS) spies[m] = jest.fn();
  spies.findOne = jest.fn(async () => null);
  spies.findByPk = jest.fn(async () => null);
  spies.findAll = jest.fn(async () => []);
  return { __esModule: true, default: spies };
};
jest.mock('../../../models/EvidenceRecord', () => foreignModelMock());
jest.mock('../../../models/PortfolioArtifact', () => foreignModelMock());
jest.mock('../../../models/Project', () => foreignModelMock());
jest.mock('../../../models/GitHubConnection', () => foreignModelMock());

import EvidenceRecord from '../../../models/EvidenceRecord';
import PortfolioArtifact from '../../../models/PortfolioArtifact';
import Project from '../../../models/Project';
import GitHubConnection from '../../../models/GitHubConnection';

import {
  CASE_STUDY_PUBLISH_BLOCKER_CODES,
  CaseStudyPublicationError,
  MAX_PUBLICATION_ATTEMPTS,
  evaluateCaseStudyPublication,
  evaluateCaseStudyPublishGate,
  formatCaseStudyPublishBlockers,
  isCaseStudyPublicationError,
  publishCaseStudy,
  unpublishCaseStudy,
} from '../caseStudyPublicationService';
import type {
  CaseStudyPublishBlockerCode,
  CaseStudyPublishDecision,
  CaseStudyPublishGateInput,
  CaseStudyPublishRecord,
} from '../caseStudyPublicationService';
import { persistCaseStudySnapshot } from '../caseStudySnapshotStore';
import { scoreCaseStudyReadiness } from '../caseStudyReadinessService';
import { opaqueRepoRef } from '../caseStudyRepoReader';
import type {
  CaseStudyMetricEntry,
  CaseStudySnapshotContent,
  CaseStudySurfaceKey,
  CaseStudyVerification,
} from '../../../types/caseStudy';
import type { CaseStudyProvenance } from '../../../types/caseStudyProvenance';

/* ───────────────────────────────────────────────────────────── fixtures ──── */

const APPROVED_AT = '2026-08-01T00:00:00.000Z';
const repoVerified = (evidenceId?: string): CaseStudyVerification =>
  ({ class: 'verified', method: 'repo', verifiedAt: APPROVED_AT, evidenceId });

/** A performance figure proven by a commit. Carries no percentage and no money,
 *  so it makes no claim rule 10 would have to check for backing. */
const PROOF_POINT: CaseStudyMetricEntry = {
  key: 'reconciliation_runtime',
  label: 'Nightly reconciliation runtime',
  valueDisplay: '18 minutes, down from just over four hours',
  numericValue: 18,
  unit: 'minutes',
  metricType: 'performance',
  verification: repoVerified('ev-runtime-1'),
  isHeadline: true,
  publishable: true,
  measurement: {
    baseline: '4h 02m median across the fourteen runs before the change',
    sample: 'thirty consecutive nightly runs',
    measured: 'wall-clock duration recorded by the job itself',
    methodology: 'median run duration, read from the workflow run log',
    limitations: ['one environment only; no financial figure was measured'],
  },
};

function publishableContent(): CaseStudySnapshotContent {
  return {
    identity: {
      slug: 'nightly-reconciliation-rebuild',
      title: 'Rebuilding a nightly reconciliation job',
      standfirst: 'A four-hour nightly job, rewritten until it finished before the analysts arrived.',
      summary: 'A batch reconciliation pipeline was rebuilt around incremental reads and a '
        + 'deterministic ordering, and the runtime is now pinned by the repository history.',
      organizationIdentityMode: 'anonymized',
      organizationNamingConsent: false,
      builderIdentityMode: 'role_only',
      builderNamingConsent: false,
      builtByType: 'colaberry_team',
      programLabel: 'Enterprise AI Accelerator',
      // A verified, shipped status. This is what makes the "Cut over in
      // production" timeline entry below a backed claim rather than a blocked one.
      productionStatus: { status: 'shipped', verification: repoVerified('ev-runtime-1') },
    },
    heroMetrics: [PROOF_POINT],
    situation: {
      narrative: [
        'The reconciliation job ran overnight and regularly overran the analysts arriving.',
        'Nobody could say which step was slow, because the job logged only its start and end.',
      ],
      verification: { class: 'verified', method: 'internal' },
    },
    buildTimeline: [
      { date: '2026-03-02', label: 'Instrumented each stage', source: 'commit', verification: repoVerified() },
      { date: '2026-03-19', label: 'Replaced the full reload with an incremental read', source: 'pull_request', verification: repoVerified() },
      { date: '2026-04-08', label: 'Cut over in production', source: 'release', verification: repoVerified() },
    ],
    architecture: {
      narrative: ['A scheduled worker reads a change feed, reconciles in batches and writes an audit row per run.'],
      stack: ['TypeScript', 'Node.js', 'PostgreSQL'],
      capabilities: ['batch reconciliation', 'anomaly flagging'],
    },
    measurement: {
      narrative: ['Runtime is measured by the job, not by the operator, so the figure survives a rerun.'],
      metrics: [PROOF_POINT],
    },
    roadmap: [
      { label: 'Hourly incremental runs', status: 'in_progress', verification: { class: 'pending', method: 'internal' } },
    ],
    contributors: [{ displayMode: 'role_only', role: 'Data engineer', kind: 'colaberry_team' }],
    artifacts: [
      // `publicUrl` is required by the two-image readiness rule, which counts an
      // image only when it is approved AND public AND image-typed AND carries a
      // real http(s) URL. The reference record is meant to score 100, and an
      // artifact with no URL renders as blank space - so counting one would make
      // the rule agree with an empty page. Added when that rule landed; this
      // suite asserts exact scores and was missed at the time, which is what
      // turned CI red rather than any defect in the rule.
      { id: 'a1', artifactType: 'screenshot', title: 'Run duration dashboard', sourceType: 'repo', visibility: 'public', status: 'approved', publicUrl: 'https://example.com/shot.png' },
      { id: 'a2', artifactType: 'architecture', title: 'Pipeline architecture', sourceType: 'repo', visibility: 'public', status: 'approved', publicUrl: 'https://example.com/arch.png' },
    ],
    repositories: [{
      repoOwner: 'colaberry', repoName: 'reconciliation',
      repoUrl: 'https://github.com/colaberry/reconciliation',
      role: 'primary', visibility: 'public', accessStatus: 'connected',
      allowPublicRepoLink: true, defaultBranch: 'main', lastSeenSha: 'a'.repeat(40),
    }],
    taxonomy: {
      industry: 'manufacturing', primaryCapability: 'data-engineering',
      capabilities: ['batch-reconciliation', 'anomaly-flagging'],
      stack: ['typescript', 'node', 'postgresql'],
      deliverables: ['pipeline'], projectStatus: 'shipped',
    },
  };
}

const publishableRecord = (): CaseStudyPublishRecord => ({
  id: 'cs-1',
  status: 'approved',
  organizationIdentityMode: 'anonymized',
  organizationNamingConsent: false,
  organizationDisplayName: null,
  builderIdentityMode: 'role_only',
  builderNamingConsent: false,
  archivedAt: null,
});

const gateInput = (
  patch: {
    surfaceKey?: CaseStudySurfaceKey;
    record?: Partial<CaseStudyPublishRecord>;
    content?: CaseStudySnapshotContent;
    provenance?: CaseStudyProvenance;
    snapshot?: Partial<{ status: string; approvedBy: string | null; approvedAt: string | null }>;
    noSnapshot?: boolean;
  } = {},
): CaseStudyPublishGateInput => ({
  surfaceKey: patch.surfaceKey ?? 'enterprise',
  caseStudy: { ...publishableRecord(), ...(patch.record ?? {}) },
  snapshot: patch.noSnapshot ? null : {
    id: 'snap-1',
    version: 3,
    status: 'approved',
    approvedBy: 'ali@colaberry.com',
    approvedAt: APPROVED_AT,
    content: patch.content ?? publishableContent(),
    provenance: patch.provenance ?? {},
    ...(patch.snapshot ?? {}),
  } as any,
});

const evaluate = (patch: Parameters<typeof gateInput>[0] = {}): CaseStudyPublishDecision =>
  evaluateCaseStudyPublishGate(gateInput(patch));

const codes = (d: CaseStudyPublishDecision): readonly CaseStudyPublishBlockerCode[] => d.codes;
const messages = (d: CaseStudyPublishDecision): string => d.blockers.map((b) => b.message).join('\n');
const withCode = (d: CaseStudyPublishDecision, c: CaseStudyPublishBlockerCode) =>
  d.blockers.filter((b) => b.code === c);

/** Seed a case study + one approved snapshot, and return their ids. */
function seedPublishable(content: CaseStudySnapshotContent = publishableContent()) {
  const cs = caseStudies.seed({ id: randomUUID() });
  const snap = snapshots.seed({ case_study_id: cs.id, version: 1, status: 'approved', content });
  return { caseStudyId: cs.id as string, snapshotId: snap.id as string };
}

const SERVICE_DIR = path.join(__dirname, '..');
const readSource = (f: string): string => fs.readFileSync(path.join(SERVICE_DIR, f), 'utf8');
const GATE_FILES = [
  'caseStudyPublicationService.ts',
  'caseStudyPublicationStore.ts',
  'caseStudyPublishGate.ts',
  'caseStudyPublishRules.ts',
  'caseStudyPublishClaimScan.ts',
];

let logSpy: jest.SpyInstance;
const logLines = (): string[] => logSpy.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  caseStudies.reset();
  snapshots.reset();
  publications.reset();
  jest.clearAllMocks();
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => { logSpy.mockRestore(); });

/* ══════════════════════════════════════════ the fixture is actually valid ══ */

describe('the reference record', () => {
  it('publishes — every rejection test below breaks exactly one thing in it', () => {
    const decision = evaluate();
    expect(decision.blockers.map((b) => `${b.code}: ${b.message}`)).toEqual([]);
    expect(decision.allowed).toBe(true);
    expect(decision.summary).toBe('');
  });

  it('allows a production claim in prose because a verified shipped status backs it', () => {
    const content = publishableContent();
    expect(JSON.stringify(content.buildTimeline)).toContain('in production');
    expect(evaluate({ content }).allowed).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════ AC1 — status ══════ */

describe('AC1 — Case Study status is not approved', () => {
  it.each(['draft', 'review', 'archived', 'published'] as const)(
    'refuses status "%s" and names it', (status) => {
      const decision = evaluate({ record: { status } });
      expect(decision.allowed).toBe(false);
      expect(codes(decision)).toContain('case_study_not_approved');
      expect(messages(decision)).toContain(`Case Study status is "${status}"`);
      expect(messages(decision)).toContain('only an approved Case Study may be published');
    },
  );

  it('refuses an archived record even when its status still reads approved', () => {
    const decision = evaluate({ record: { archivedAt: '2026-07-01T00:00:00.000Z' } });
    expect(decision.allowed).toBe(false);
    expect(withCode(decision, 'case_study_not_approved')[0].message)
      .toContain('archived at 2026-07-01T00:00:00.000Z');
  });
});

/* ═════════════════════════════════════════════════════ AC2 — snapshot ═════ */

describe('AC2 — no approved snapshot exists', () => {
  it('refuses when there is no snapshot at all', () => {
    const decision = evaluate({ noSnapshot: true });
    expect(decision.allowed).toBe(false);
    expect(withCode(decision, 'snapshot_not_approved')[0].message)
      .toBe('no approved snapshot exists for this Case Study');
  });

  it.each(['draft', 'superseded'] as const)('refuses a "%s" snapshot by version', (status) => {
    const decision = evaluate({ snapshot: { status } });
    expect(decision.allowed).toBe(false);
    expect(messages(decision)).toContain(`snapshot version 3 has status "${status}"`);
  });

  it('refuses an approved snapshot that records no approver', () => {
    const decision = evaluate({ snapshot: { approvedBy: null } });
    expect(decision.allowed).toBe(false);
    expect(messages(decision)).toContain('snapshot version 3 is marked approved but records no approver');
  });

  it('does not pile content blockers on top of a missing snapshot', () => {
    expect(evaluate({ noSnapshot: true }).blockers).toHaveLength(1);
  });
});

/* ══════════════════════════════════════════════ AC3 — pending metrics ═════ */

describe('AC3 — a visible metric is still pending', () => {
  it('refuses a publishable pending metric and names the figure', () => {
    const content = publishableContent();
    (content as any).heroMetrics = [{
      ...PROOF_POINT, verification: { class: 'pending', method: 'internal' },
    }];
    (content as any).measurement = { ...content.measurement, metrics: [] };
    const decision = evaluate({ content });
    expect(decision.allowed).toBe(false);
    expect(withCode(decision, 'metric_pending')[0].message).toBe(
      'headline metric "18 minutes, down from just over four hours" is marked publishable '
      + 'but its verification is still pending',
    );
  });

  it('ignores a pending metric that is not publishable — invisible is not a claim', () => {
    const content = publishableContent();
    (content as any).measurement = {
      ...content.measurement,
      metrics: [...content.measurement!.metrics, {
        key: 'draft_idea', label: 'Forecast accuracy', valueDisplay: 'not yet measured',
        metricType: 'quality', verification: { class: 'pending', method: 'internal' },
        isHeadline: false, publishable: false,
      }],
    };
    expect(evaluate({ content }).allowed).toBe(true);
  });
});

/* ══════════════════════════════════ AC4 — organisation naming consent ═════ */

describe('AC4 — organization is named without naming consent', () => {
  it('refuses a named organization with no consent, in spec §15\'s own words', () => {
    const content = publishableContent();
    (content as any).identity = {
      ...content.identity,
      organizationIdentityMode: 'named',
      organizationNamingConsent: false,
      organizationDisplayName: 'Northwind Foods',
    };
    const decision = evaluate({
      content, record: { organizationIdentityMode: 'named', organizationNamingConsent: false },
    });
    expect(decision.allowed).toBe(false);
    expect(withCode(decision, 'organization_consent').map((b) => b.message)).toContain(
      'organization name "Northwind Foods" is visible but naming consent is not approved',
    );
  });

  it('refuses when consent is recorded on the record but not in the approved snapshot', () => {
    const content = publishableContent();
    (content as any).identity = {
      ...content.identity, organizationIdentityMode: 'named',
      organizationNamingConsent: false, organizationDisplayName: 'Northwind Foods',
    };
    const decision = evaluate({
      content, record: { organizationIdentityMode: 'named', organizationNamingConsent: true },
    });
    expect(decision.allowed).toBe(false);
    expect(messages(decision)).toContain('organization naming consent differs between the Case Study record (true) and the approved snapshot (false)');
  });

  it('refuses a "hidden" organization whose name is still in the snapshot', () => {
    const content = publishableContent();
    (content as any).identity = {
      ...content.identity, organizationIdentityMode: 'hidden',
      organizationNamingConsent: false, organizationDisplayName: 'Northwind Foods',
    };
    const decision = evaluate({ content, record: { organizationIdentityMode: 'hidden' } });
    expect(decision.allowed).toBe(false);
    expect(messages(decision)).toContain('organization identity mode is "hidden" but the snapshot still carries the name "Northwind Foods"');
  });

  it('allows a named organization once consent is recorded in both places', () => {
    const content = publishableContent();
    (content as any).identity = {
      ...content.identity, organizationIdentityMode: 'named',
      organizationNamingConsent: true, organizationDisplayName: 'Northwind Foods',
    };
    expect(evaluate({
      content,
      record: { organizationIdentityMode: 'named', organizationNamingConsent: true },
    }).allowed).toBe(true);
  });
});

/* ═══════════════════════════════════════ AC5 — builder naming consent ═════ */

describe('AC5 — builder is named without builder consent', () => {
  it('refuses a named contributor with no builder consent, naming the person', () => {
    const content = publishableContent();
    (content as any).contributors = [{
      displayMode: 'named', displayName: 'Priya Nair', role: 'Data engineer',
      kind: 'colaberry_team', consentRecordedAt: APPROVED_AT,
    }];
    const decision = evaluate({ content });
    expect(decision.allowed).toBe(false);
    const found = withCode(decision, 'builder_consent').map((b) => b.message);
    expect(found).toContain('contributor "Priya Nair" (Data engineer) would be named but builder naming consent is not approved');
    expect(found).toContain('contributor "Priya Nair" (Data engineer) would be named while the builder identity mode is "role_only"');
  });

  it('refuses a named builder identity mode with no consent', () => {
    const content = publishableContent();
    (content as any).identity = { ...content.identity, builderIdentityMode: 'named' };
    const decision = evaluate({ content, record: { builderIdentityMode: 'named' } });
    expect(decision.allowed).toBe(false);
    expect(messages(decision)).toContain('builder identity is "named" but builder naming consent is not approved');
  });

  it('refuses a named contributor who records no consent timestamp', () => {
    const content = publishableContent();
    (content as any).identity = {
      ...content.identity, builderIdentityMode: 'named', builderNamingConsent: true,
    };
    (content as any).contributors = [{
      displayMode: 'named', displayName: 'Priya Nair', role: 'Data engineer', kind: 'colaberry_team',
    }];
    const decision = evaluate({
      content, record: { builderIdentityMode: 'named', builderNamingConsent: true },
    });
    expect(decision.allowed).toBe(false);
    expect(messages(decision)).toContain('contributor "Priya Nair" (Data engineer) is named but records no consent timestamp');
  });

  it('allows a named contributor with consent on both sides and a timestamp', () => {
    const content = publishableContent();
    (content as any).identity = {
      ...content.identity, builderIdentityMode: 'named', builderNamingConsent: true,
    };
    (content as any).contributors = [{
      displayMode: 'named', displayName: 'Priya Nair', role: 'Data engineer',
      kind: 'colaberry_team', consentRecordedAt: APPROVED_AT,
    }];
    expect(evaluate({
      content, record: { builderIdentityMode: 'named', builderNamingConsent: true },
    }).allowed).toBe(true);
  });
});

/* ═════════════════════════════════════════════ AC6 — private repo leak ════ */

describe('AC6 — a private repo would be exposed', () => {
  it('refuses a private repository flagged for a public link, and names it only opaquely', () => {
    const content = publishableContent();
    (content as any).repositories = [{
      repoOwner: 'northwind-foods', repoName: 'internal-billing',
      repoUrl: 'https://github.com/northwind-foods/internal-billing',
      role: 'backend', visibility: 'private', accessStatus: 'connected',
      allowPublicRepoLink: true,
    }];
    const decision = evaluate({ content });
    expect(decision.allowed).toBe(false);
    const blocker = withCode(decision, 'private_repo_exposed')[0];
    expect(blocker.message).toContain('visibility is "private"');
    expect(blocker.message).toContain(`repo_ref ${opaqueRepoRef('northwind-foods', 'internal-billing')}`);
    // The identity itself never appears, in the message or the remedy.
    const surfaced = `${blocker.message} ${blocker.remedy}`;
    expect(surfaced).not.toContain('northwind-foods');
    expect(surfaced).not.toContain('internal-billing');
    expect(surfaced).not.toContain('github.com');
  });

  it('fails closed on `unknown` visibility — an unread repo is not a public one', () => {
    const content = publishableContent();
    (content as any).repositories = [{
      ...content.repositories![0], visibility: 'unknown', accessStatus: 'unavailable',
    }];
    const decision = evaluate({ content });
    expect(decision.allowed).toBe(false);
    expect(withCode(decision, 'private_repo_exposed')[0].message).toContain('visibility is "unknown"');
  });

  it('allows a private repository that is not flagged for a public link', () => {
    const content = publishableContent();
    (content as any).repositories = [{
      ...content.repositories![0], visibility: 'private', allowPublicRepoLink: false,
    }];
    expect(evaluate({ content }).allowed).toBe(true);
  });
});

/* ══════════════════════════════════════ AC7 — required proof metadata ═════ */

describe('AC7 — required proof metadata is missing', () => {
  it('refuses a verified headline metric with no evidence pointer, in spec §15\'s own words', () => {
    const content = publishableContent();
    const metric = {
      ...PROOF_POINT, key: 'stockouts', label: 'Stockouts', valueDisplay: '41% fewer stockouts',
      metricType: 'business_outcome' as const,
      verification: { class: 'verified' as const, method: 'client' as const },
    };
    (content as any).heroMetrics = [metric];
    (content as any).measurement = { ...content.measurement, metrics: [metric] };
    const decision = evaluate({ content });
    expect(decision.allowed).toBe(false);
    expect(withCode(decision, 'proof_metadata_missing').map((b) => b.message)).toContain(
      'headline metric "41% fewer stockouts" has no verified evidence',
    );
  });

  it('refuses a headline metric with no baseline, sample or methodology', () => {
    const content = publishableContent();
    const metric = { ...PROOF_POINT, measurement: { limitations: [] } };
    (content as any).heroMetrics = [metric];
    (content as any).measurement = { ...content.measurement, metrics: [metric] };
    const decision = evaluate({ content });
    expect(decision.allowed).toBe(false);
    expect(messages(decision)).toContain('states no baseline, sample or methodology');
  });

  it('refuses a verified production status with no evidence reference', () => {
    const content = publishableContent();
    (content as any).identity = {
      ...content.identity,
      productionStatus: { status: 'shipped', verification: { class: 'verified', method: 'repo' } },
    };
    const decision = evaluate({ content });
    expect(decision.allowed).toBe(false);
    expect(messages(decision)).toContain('production status "shipped" is labelled verified but carries no evidence reference');
  });
});

/* ═════════════════════ the recorded position on self-attested verification ═ */

describe('self-attested verification is refused as `verified`, and publishable below it', () => {
  const selfMetric = (cls: 'verified' | 'anonymized' | 'illustrative') => ({
    ...PROOF_POINT, verification: { class: cls, method: 'self' as const, evidenceId: 'ev-runtime-1' },
  });
  const withMetric = (m: any): CaseStudySnapshotContent => {
    const content = publishableContent();
    (content as any).heroMetrics = [m];
    (content as any).measurement = { ...content.measurement, metrics: [m] };
    return content;
  };

  it('refuses class "verified" with method "self" — a mislabel, not weak evidence', () => {
    const decision = evaluate({ content: withMetric(selfMetric('verified')) });
    expect(decision.allowed).toBe(false);
    expect(codes(decision)).toContain('self_attested_verification');
    expect(withCode(decision, 'self_attested_verification')[0].message).toContain(
      'is labelled verified but its verification method is "self"; a self-report is not third-party verification',
    );
  });

  it.each(['anonymized', 'illustrative'] as const)(
    'allows class "%s" with method "self" — the surface labels the method beside the class', (cls) => {
      expect(evaluate({ content: withMetric(selfMetric(cls)) }).allowed).toBe(true);
    },
  );

  it('does not let a self-attested figure back a claim in prose', () => {
    const metric = {
      ...PROOF_POINT, key: 'stockouts', label: 'Stockouts', valueDisplay: '41% fewer stockouts',
      metricType: 'business_outcome' as const,
      verification: { class: 'anonymized' as const, method: 'self' as const, evidenceId: 'ev-1' },
    };
    const content = withMetric(metric);
    (content as any).identity = { ...content.identity, standfirst: 'They saw 41% fewer stockouts.' };
    const decision = evaluate({ content });
    expect(decision.allowed).toBe(false);
    expect(messages(decision)).toContain('the standfirst states the figure "41%" but no verified metric on this Case Study carries it');
  });
});

/* ══════════════════════════════════════════════ AC8 — AI-written quotes ═══ */

describe('AC8 — an AI-generated quote exists', () => {
  const quoted = 'It took our nightly close from painful to boring, and the team noticed.';

  it('refuses a quotation in an AI-drafted field', () => {
    const content = publishableContent();
    (content as any).identity = { ...content.identity, standfirst: `"${quoted}"` };
    const provenance: CaseStudyProvenance = {
      'identity.standfirst': {
        tier: 'ai_draft', recordedAt: APPROVED_AT,
        origin: { kind: 'ai_draft', model: 'test', promptKey: 'standfirst', factInputs: [] },
      },
    };
    const decision = evaluate({ content, provenance });
    expect(decision.allowed).toBe(false);
    expect(withCode(decision, 'ai_generated_quote')[0].message).toContain(
      'is AI-drafted; an AI draft may never create a quote',
    );
  });

  it('refuses a quotation nobody can account for — unknown authorship fails closed', () => {
    const content = publishableContent();
    (content as any).identity = { ...content.identity, standfirst: `"${quoted}"` };
    const decision = evaluate({ content, provenance: {} });
    expect(decision.allowed).toBe(false);
    expect(withCode(decision, 'ai_generated_quote')[0].message).toContain(
      'no provenance entry accounts for who wrote it',
    );
  });

  it('allows the same quotation when a human override accounts for it', () => {
    const content = publishableContent();
    (content as any).identity = { ...content.identity, standfirst: `"${quoted}"` };
    const provenance: CaseStudyProvenance = {
      identity: {
        tier: 'human_override', recordedAt: APPROVED_AT,
        origin: { kind: 'human', actor: 'ali@colaberry.com' },
      },
    };
    expect(evaluate({ content, provenance }).allowed).toBe(true);
  });

  it('does not treat a single quoted term of art as a quotation', () => {
    const content = publishableContent();
    (content as any).identity = { ...content.identity, standfirst: 'The branch is called "main".' };
    expect(evaluate({ content, provenance: {} }).allowed).toBe(true);
  });

  it('refuses an AI draft recorded at a quote-classed path even with no prose hit', () => {
    const provenance: CaseStudyProvenance = {
      'identity.testimonial': {
        tier: 'ai_draft', recordedAt: APPROVED_AT,
        origin: { kind: 'ai_draft', model: 'test', promptKey: 'quote', factInputs: [] },
      },
    };
    const decision = evaluate({ provenance });
    expect(decision.allowed).toBe(false);
    expect(withCode(decision, 'ai_generated_quote')[0].message).toContain(
      'a quoted field an AI draft may never supply',
    );
  });

  it('catches what provenance cannot — an AI draft at a permitted path carrying a figure', () => {
    // caseStudyProvenance.ts's header names exactly this residue and hands it here.
    const content = publishableContent();
    (content as any).identity = { ...content.identity, standfirst: 'The rebuild cut costs 40%.' };
    const provenance: CaseStudyProvenance = {
      'identity.standfirst': {
        tier: 'ai_draft', recordedAt: APPROVED_AT,
        origin: { kind: 'ai_draft', model: 'test', promptKey: 'standfirst', factInputs: [] },
      },
    };
    const decision = evaluate({ content, provenance });
    expect(decision.allowed).toBe(false);
    expect(messages(decision)).toContain('the standfirst states the figure "40%" but no verified metric on this Case Study carries it');
  });
});

/* ═════════════════════════════════════ AC9 — unverified public claims ═════ */

describe('AC9 — an unverified production / ROI / outcome claim exists', () => {
  const withStandfirst = (s: string): CaseStudySnapshotContent => {
    const content = publishableContent();
    (content as any).identity = { ...content.identity, standfirst: s };
    return content;
  };

  it('refuses an unbacked percentage', () => {
    const decision = evaluate({ content: withStandfirst('Stockouts fell 41% in the first quarter.') });
    expect(decision.allowed).toBe(false);
    expect(withCode(decision, 'unverified_claim')[0].message)
      .toBe('the standfirst states the figure "41%" but no verified metric on this Case Study carries it');
  });

  it('refuses an unbacked money figure', () => {
    const decision = evaluate({ content: withStandfirst('The rebuild saved $1.2 million a year.') });
    expect(decision.allowed).toBe(false);
    expect(messages(decision)).toContain('states the figure "$1.2 million"');
  });

  it('refuses an ROI claim with no verified business-outcome metric', () => {
    const decision = evaluate({ content: withStandfirst('The payback was immediate.') });
    expect(decision.allowed).toBe(false);
    expect(messages(decision)).toContain('makes a return-on-investment claim ("payback")');
  });

  it('refuses a production claim with no verified shipped status', () => {
    const content = withStandfirst('The pipeline has been in production since April.');
    delete (content.identity as any).productionStatus;
    const decision = evaluate({ content });
    expect(decision.allowed).toBe(false);
    expect(messages(decision)).toContain('claims production deployment ("in production")');
  });

  it('refuses a shipped production status whose verification is still pending', () => {
    const content = publishableContent();
    (content as any).identity = {
      ...content.identity,
      productionStatus: { status: 'shipped', verification: { class: 'pending', method: 'internal' } },
    };
    const decision = evaluate({ content });
    expect(decision.allowed).toBe(false);
    expect(messages(decision)).toContain('production status is "shipped" but its verification is "pending"');
  });

  it('allows a percentage that a verified metric actually carries', () => {
    const metric = {
      ...PROOF_POINT, key: 'stockouts', label: 'Stockouts', valueDisplay: '41% fewer stockouts',
      metricType: 'business_outcome' as const, verification: repoVerified('ev-stockouts'),
    };
    const content = withStandfirst('Stockouts fell 41% in the first quarter.');
    (content as any).heroMetrics = [metric];
    (content as any).measurement = { ...content.measurement, metrics: [metric] };
    expect(evaluate({ content }).allowed).toBe(true);
  });
});

/* ══════════════════════════════════════════════ AC13 — surface control ════ */

/**
 * `ai-flotation` MOVED FROM THE REFUSED LIST TO THE ALLOWED ONE on 2026-09-05,
 * when aiflotation.com/results gained a page to render records on. This block
 * used to assert that all three non-enterprise surfaces were refused; that was
 * a Phase 1 fact, not a permanent one, and the gate's own refusal text always
 * said so - "the other surfaces exist so that adding one later is a publication
 * row rather than a schema change".
 *
 * The boundary still exists and is still tested. `training` and `refactored`
 * have no page to appear on, so they stay refused, and the two tests below are
 * what stop the allowed list quietly growing to everything.
 */
describe('AC13 — surface control', () => {
  it.each(['training', 'refactored'] as const)(
    'accepts "%s" in the contract and refuses it at the gate', (surfaceKey) => {
      const decision = evaluate({ surfaceKey });
      expect(decision.allowed).toBe(false);
      expect(withCode(decision, 'surface_not_publishable')[0].message).toBe(
        `surface "${surfaceKey}" is accepted by the contract but is not publishable in Phase 1`,
      );
    },
  );

  it.each(['enterprise', 'ai-flotation'] as const)(
    'raises no surface blocker for "%s", which has a page to appear on', (surfaceKey) => {
      const decision = evaluate({ surfaceKey });
      expect(withCode(decision, 'surface_not_publishable')).toEqual([]);
    },
  );

  it('refuses the non-enterprise surface through the service too, before any write', async () => {
    const { caseStudyId } = seedPublishable();
    await expect(publishCaseStudy({
      caseStudyId, surfaceKey: 'training', actor: 'ali@colaberry.com',
    })).rejects.toMatchObject({ error_class: 'PublishBlocked' });
    expect(publications.writes).toBe(0);
  });

  it('rejects a surface key that is not in the contract at all as a validation error', async () => {
    const { caseStudyId } = seedPublishable();
    await expect(publishCaseStudy({
      caseStudyId, surfaceKey: 'marketing' as CaseStudySurfaceKey, actor: 'ali@colaberry.com',
    })).rejects.toMatchObject({ error_class: 'ValidationError' });
    expect(publications.writes).toBe(0);
  });
});

/* ══════════════════════════════════ every reason at once, in §15's shape ══ */

describe('the refusal is actionable and complete', () => {
  it('returns every blocking reason at once, not the first', () => {
    const content = publishableContent();
    (content as any).identity = {
      ...content.identity,
      organizationIdentityMode: 'named', organizationNamingConsent: false,
      organizationDisplayName: 'Northwind Foods',
      standfirst: 'Stockouts fell 63% in the quarter after go-live.',
    };
    (content as any).heroMetrics = [{
      ...PROOF_POINT, key: 'stockouts', label: 'Stockouts', valueDisplay: '41% fewer stockouts',
      verification: { class: 'verified', method: 'client' },
    }];
    (content as any).measurement = { ...content.measurement, metrics: [] };
    (content as any).repositories = [{
      ...content.repositories![0], visibility: 'private', allowPublicRepoLink: true,
    }];
    const decision = evaluate({
      surfaceKey: 'training',
      record: { status: 'draft', organizationIdentityMode: 'named' },
      content,
    });
    expect(new Set(codes(decision))).toEqual(new Set([
      'surface_not_publishable', 'case_study_not_approved', 'organization_consent',
      'private_repo_exposed', 'proof_metadata_missing', 'unverified_claim',
    ]));
    expect(decision.blockers.length).toBeGreaterThanOrEqual(6);
  });

  it('formats spec §15\'s block, one field-naming line per reason', () => {
    const summary = formatCaseStudyPublishBlockers([
      { code: 'proof_metadata_missing', field: 'heroMetrics[0].verification.evidenceId', message: 'headline metric "41% fewer stockouts" has no verified evidence', remedy: 'x' },
      { code: 'organization_consent', field: 'identity.organizationNamingConsent', message: 'organization name is visible but naming consent is not approved', remedy: 'y' },
    ]);
    expect(summary).toBe([
      'Cannot publish:',
      '- headline metric "41% fewer stockouts" has no verified evidence',
      '- organization name is visible but naming consent is not approved',
    ].join('\n'));
  });

  it('never returns a blocker without a field and a remedy — every code, not a sample', () => {
    // This previously exercised ONE input producing 3 of the 11 codes, so blanking
    // the remedy on any of the other 8 left the suite green. An admin facing a
    // refusal with no remedy has no way forward, which is the failure this test
    // exists to prevent — so it has to see every code actually emitted.
    // Each entry breaks exactly one thing on the reference fixture, mirroring the
    // per-AC tests above, so a failure here names a real rule rather than a fixture
    // that was never valid.
    // DEEP clone before mutating. `publishableContent()` returns a fresh outer
    // object but shares the module-level `PROOF_POINT` by reference, so mutating
    // `heroMetrics[0]` in place rewrites the constant for every later test in the
    // file — which is exactly what happened on the first attempt at this sweep
    // and poisoned sixteen unrelated assertions.
    const bend = (mutate: (c: CaseStudySnapshotContent) => void): CaseStudySnapshotContent => {
      const content = JSON.parse(JSON.stringify(publishableContent())) as CaseStudySnapshotContent;
      mutate(content);
      return content;
    };

    const inputs: Array<Parameters<typeof evaluate>[0]> = [
      // surface_not_publishable + case_study_not_approved + snapshot_not_approved
      { record: { status: 'draft' }, surfaceKey: 'training', noSnapshot: true },
      // metric_pending
      { content: bend((c) => { (c.heroMetrics as any)[0].verification = { class: 'pending', method: 'repo' }; }) },
      // organization_consent
      {
        record: { organizationIdentityMode: 'named', organizationNamingConsent: false, organizationDisplayName: 'Northwind Foods' },
        content: bend((c) => {
          (c.identity as any).organizationIdentityMode = 'named';
          (c.identity as any).organizationDisplayName = 'Northwind Foods';
        }),
      },
      // builder_consent
      {
        record: { builderIdentityMode: 'named', builderNamingConsent: false },
        content: bend((c) => {
          (c.identity as any).builderIdentityMode = 'named';
          (c.contributors as any)[0] = { displayMode: 'named', displayName: 'Priya Nair', role: 'Data engineer', kind: 'colaberry_team' };
        }),
      },
      // private_repo_exposed
      { content: bend((c) => { (c.repositories as any)[0].visibility = 'private'; }) },
      // proof_metadata_missing — strip the evidence pointer AND the measurement
      // context that rule 7 requires of a visible headline figure.
      {
        content: bend((c) => {
          const metric = (c.heroMetrics as any)[0];
          delete metric.evidenceRef;
          delete metric.measurement;
          if (metric.verification) delete metric.verification.evidenceRef;
        }),
      },
      // self_attested_verification
      { content: bend((c) => { (c.heroMetrics as any)[0].verification = { class: 'verified', method: 'self' }; }) },
      // ai_generated_quote
      {
        content: bend((c) => { (c.identity as any).standfirst = 'The lead engineer said "this changed how we work".'; }),
        provenance: { identity: { tier: 'ai_draft', origin: { kind: 'ai_draft', promptKey: 'standfirst' } } } as any,
      },
      // unverified_claim
      { content: bend((c) => { (c.identity as any).standfirst = 'Costs fell 41% in the first quarter.'; }) },
    ];

    const seen = new Set<string>();
    for (const input of inputs) {
      for (const blocker of evaluate(input).blockers) {
        seen.add(blocker.code);
        expect(CASE_STUDY_PUBLISH_BLOCKER_CODES).toContain(blocker.code);
        expect(blocker.field.length).toBeGreaterThan(0);
        expect(blocker.remedy.length).toBeGreaterThan(0);
        expect(blocker.message).not.toMatch(/^cannot publish$/i);
        // The message must name the offending field or value, not restate the code.
        expect(blocker.message).not.toBe(blocker.code);
      }
    }

    // Coverage assertion: if a new code is added and nothing here triggers it,
    // this fails rather than silently leaving it unguarded.
    expect([...seen].sort()).toEqual([...CASE_STUDY_PUBLISH_BLOCKER_CODES].sort());
  });
});

/* ═══════════════════ readiness is advisory — a score authorises nothing ═══ */

describe('a high readiness score authorises nothing', () => {
  const readinessInput = (content: CaseStudySnapshotContent) => ({
    content, status: 'approved' as const, snapshotStatus: 'approved' as const,
    publication: { surfaceKey: 'enterprise' as const },
  });

  it('scores the reference record 100/100 and the gate allows it', () => {
    const content = publishableContent();
    expect(scoreCaseStudyReadiness(readinessInput(content)).score).toBe(100);
    expect(evaluate({ content }).allowed).toBe(true);
  });

  it('still refuses a 97/100 "substantial" record whose one fault is a pending visible metric', () => {
    const content = publishableContent();
    (content as any).measurement = {
      ...content.measurement,
      metrics: [...content.measurement!.metrics, {
        key: 'forecast_accuracy', label: 'Forecast accuracy', valueDisplay: 'awaiting sign-off',
        metricType: 'quality', verification: { class: 'pending', method: 'client' },
        isHeadline: false, publishable: true,
      }],
    };
    const report = scoreCaseStudyReadiness(readinessInput(content));
    expect(report.score).toBe(97);
    expect(report.band).toBe('substantial');

    const decision = evaluate({ content });
    expect(decision.allowed).toBe(false);
    expect(codes(decision)).toEqual(['metric_pending']);
  });

  it('the gate never imports the readiness engine — it may only cite it in prose', () => {
    for (const file of GATE_FILES) {
      expect(readSource(file)).not.toMatch(/(?:import|require)[^\n]*caseStudyReadiness/);
      expect(readSource(file)).not.toMatch(/from '\.\/caseStudyReadiness/);
    }
  });
});

/* ════════════════════════════════ AC10 — publishing twice is idempotent ═══ */

describe('AC10 — publishing the same approved snapshot twice is safe', () => {
  it('writes once, reports `unchanged` the second time, and leaves the row identical', async () => {
    const { caseStudyId, snapshotId } = seedPublishable();
    const first = await publishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: 'ali@colaberry.com' });
    expect(first.outcome).toBe('published');
    expect(first.publishedSnapshotId).toBe(snapshotId);
    expect(publications.creates).toBe(1);

    const before = JSON.stringify(publications.rows);
    const second = await publishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: 'someone.else@colaberry.com' });
    expect(second.outcome).toBe('unchanged');
    expect(second.publicationId).toBe(first.publicationId);
    expect(second.publishedSnapshotId).toBe(snapshotId);
    expect(publications.writes).toBe(1);
    expect(JSON.stringify(publications.rows)).toBe(before);
  });

  it('still runs the gate on the repeat call — consent withdrawn between clicks is refused', async () => {
    const { caseStudyId } = seedPublishable();
    await publishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: 'ali@colaberry.com' });
    caseStudies.rows[0].status = 'review';
    await expect(publishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: 'ali@colaberry.com' }))
      .rejects.toMatchObject({ error_class: 'PublishBlocked' });
    expect(publications.writes).toBe(1);
  });

  it('survives the unique-index race by re-reading, within the bounded attempts', async () => {
    const { caseStudyId, snapshotId } = seedPublishable();
    // Another admin's insert lands between our read and our create.
    publications.beforeCreate = () => {
      publications.seed({
        case_study_id: caseStudyId, surface_key: 'enterprise',
        status: 'published', published_snapshot_id: snapshotId,
        published_by: 'other@colaberry.com', published_at: new Date(),
      });
    };
    const result = await publishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: 'ali@colaberry.com' });
    expect(result.outcome).toBe('unchanged');
    expect(publications.rows).toHaveLength(1);
    expect(MAX_PUBLICATION_ATTEMPTS).toBe(3);
  });
});

/* ══════════════════════════════════ AC11 + AC12 — unpublish, not delete ═══ */

describe('AC11 — unpublishing twice is safe', () => {
  it('writes once and reports `unchanged` the second time', async () => {
    const { caseStudyId } = seedPublishable();
    await publishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: 'ali@colaberry.com' });
    const writesAfterPublish = publications.writes;

    const first = await unpublishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: 'ali@colaberry.com' });
    expect(first.outcome).toBe('unpublished');
    const after = JSON.stringify(publications.rows);

    const second = await unpublishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: 'ali@colaberry.com' });
    expect(second.outcome).toBe('unchanged');
    expect(second.unpublishedAt).toBe(first.unpublishedAt);
    expect(publications.writes).toBe(writesAfterPublish + 1);
    expect(JSON.stringify(publications.rows)).toBe(after);
  });

  it('is a no-op when the surface was never published at all', async () => {
    const { caseStudyId } = seedPublishable();
    const result = await unpublishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: 'ali@colaberry.com' });
    expect(result).toMatchObject({ outcome: 'unchanged', publicationId: null, publishedSnapshotId: null });
    expect(publications.writes).toBe(0);
  });
});

describe('AC12 — unpublish removes visibility and deletes nothing', () => {
  it('flips status, keeps the pinned snapshot, and destroys no row anywhere', async () => {
    const { caseStudyId, snapshotId } = seedPublishable();
    await publishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: 'ali@colaberry.com' });
    const snapshotsBefore = JSON.stringify(snapshots.rows);
    const caseStudiesBefore = JSON.stringify(caseStudies.rows);

    const result = await unpublishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: 'ali@colaberry.com' });

    // Public visibility is gone …
    expect(result.outcome).toBe('unpublished');
    expect(publications.rows[0].status).toBe('unpublished');
    expect(publications.rows[0].unpublished_at).toBeInstanceOf(Date);
    // … and nothing was deleted: the publication row survives, still recording
    // which version was live, and every other table is byte-identical.
    expect(publications.rows).toHaveLength(1);
    expect(publications.rows[0].published_snapshot_id).toBe(snapshotId);
    expect(result.publishedSnapshotId).toBe(snapshotId);
    expect(publications.destroys).toBe(0);
    expect(snapshots.destroys).toBe(0);
    expect(JSON.stringify(snapshots.rows)).toBe(snapshotsBefore);
    expect(JSON.stringify(caseStudies.rows)).toBe(caseStudiesBefore);
  });

  it('re-publishing after an unpublish restores visibility and clears the stamp', async () => {
    const { caseStudyId, snapshotId } = seedPublishable();
    await publishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: 'ali@colaberry.com' });
    await unpublishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: 'ali@colaberry.com' });
    const again = await publishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: 'ali@colaberry.com' });
    expect(again.outcome).toBe('published');
    expect(publications.rows[0].status).toBe('published');
    expect(publications.rows[0].unpublished_at).toBeNull();
    expect(publications.rows[0].published_snapshot_id).toBe(snapshotId);
    expect(publications.rows).toHaveLength(1);
  });

  it('contains no destroy or truncate call in any gate or publication source file', () => {
    for (const file of GATE_FILES) {
      expect(readSource(file)).not.toMatch(/\.(destroy|truncate)\s*\(/);
    }
  });
});

/* ═════════════════════════════════════════ publication pins a snapshot ════ */

describe('publication pins a snapshot', () => {
  it('does not follow a newer draft snapshot written by a later sync', async () => {
    const { caseStudyId, snapshotId } = seedPublishable();
    const published = await publishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: 'ali@colaberry.com' });
    expect(published.publishedSnapshotId).toBe(snapshotId);
    const writesAfterPublish = publications.writes;

    // A later sync writes a NEW DRAFT version through the real store.
    const persisted = await persistCaseStudySnapshot({
      caseStudyId,
      draft: {
        contentHash: 'b'.repeat(64),
        generatedAt: '2026-08-20T00:00:00.000Z',
        generatedBy: 'repo_sync',
        content: publishableContent(),
        provenance: {},
        sourceCommitMap: {},
      } as any,
    });
    expect(persisted.outcome).toBe('created');
    expect(persisted.version).toBe(2);

    // The pin did not move, and nothing touched the publication row.
    expect(publications.rows[0].published_snapshot_id).toBe(snapshotId);
    expect(publications.writes).toBe(writesAfterPublish);

    // Re-running publish resolves the APPROVED snapshot, not the newest draft.
    const repeat = await publishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: 'ali@colaberry.com' });
    expect(repeat.outcome).toBe('unchanged');
    expect(repeat.publishedSnapshotId).toBe(snapshotId);
    expect(repeat.snapshotVersion).toBe(1);
  });

  it('moves the pin only on an explicit republish of a newly approved version', async () => {
    const { caseStudyId, snapshotId } = seedPublishable();
    await publishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: 'ali@colaberry.com' });
    const v2 = snapshots.seed({
      case_study_id: caseStudyId, version: 2, status: 'approved', content: publishableContent(),
    });
    const republished = await publishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: 'ali@colaberry.com' });
    expect(republished.outcome).toBe('published');
    expect(republished.publishedSnapshotId).toBe(v2.id);
    expect(republished.publishedSnapshotId).not.toBe(snapshotId);
    expect(publications.rows).toHaveLength(1);
  });

  it('refuses a snapshot id belonging to another Case Study', async () => {
    const a = seedPublishable();
    const b = seedPublishable();
    await expect(publishCaseStudy({
      caseStudyId: a.caseStudyId, snapshotId: b.snapshotId,
      surfaceKey: 'enterprise', actor: 'ali@colaberry.com',
    })).rejects.toMatchObject({ error_class: 'SnapshotNotFound', http_status: 404 });
  });
});

/* ══════════════════════════════════════════════ no mutation, no PII ═══════ */

describe('the publish path mutates nothing it does not own', () => {
  const foreign: Record<string, any> = {
    EvidenceRecord, PortfolioArtifact, Project, GitHubConnection,
  };

  it('never calls any Sequelize write method on EvidenceRecord, PortfolioArtifact, Project or GitHubConnection', async () => {
    const { caseStudyId } = seedPublishable();
    await publishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: 'ali@colaberry.com' });
    await unpublishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: 'ali@colaberry.com' });
    await expect(publishCaseStudy({
      caseStudyId, surfaceKey: 'training', actor: 'ali@colaberry.com',
    })).rejects.toBeInstanceOf(CaseStudyPublicationError);

    for (const [name, model] of Object.entries(foreign)) {
      for (const method of WRITE_METHODS) {
        expect(`${name}.${method}: ${model[method].mock.calls.length}`).toBe(`${name}.${method}: 0`);
      }
    }
  });

  it('never imports those models in the first place', () => {
    for (const file of GATE_FILES) {
      expect(readSource(file))
        .not.toMatch(/models\/(EvidenceRecord|PortfolioArtifact|Project|GitHubConnection)/);
    }
  });

  it('writes no row on case_studies or case_study_snapshots', async () => {
    const { caseStudyId } = seedPublishable();
    await publishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: 'ali@colaberry.com' });
    await unpublishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: 'ali@colaberry.com' });
    expect(caseStudies.writes).toBe(0);
    expect(snapshots.creates).toBe(0);
    expect(snapshots.updates).toBe(0);
    expect(snapshots.destroys).toBe(0);
  });
});

describe('nothing sensitive reaches a log line', () => {
  const SENSITIVE = [
    'Northwind Foods', 'Priya Nair', 'priya.nair@example.com',
    'northwind-foods', 'internal-billing', 'github.com',
    'ali@colaberry.com',
  ];

  const leakyContent = (): CaseStudySnapshotContent => {
    const content = publishableContent();
    (content as any).identity = {
      ...content.identity, organizationIdentityMode: 'named',
      organizationNamingConsent: false, organizationDisplayName: 'Northwind Foods',
    };
    (content as any).contributors = [{
      displayMode: 'named', displayName: 'Priya Nair', role: 'Data engineer', kind: 'colaberry_team',
    }];
    (content as any).repositories = [{
      repoOwner: 'northwind-foods', repoName: 'internal-billing',
      repoUrl: 'https://github.com/northwind-foods/internal-billing',
      role: 'backend', visibility: 'private', accessStatus: 'connected', allowPublicRepoLink: true,
    }];
    return content;
  };

  it('logs blocker codes and never blocker messages, names, emails or repo identity', async () => {
    const cs = caseStudies.seed({
      id: randomUUID(), organization_identity_mode: 'named',
      organization_display_name: 'Northwind Foods',
    });
    snapshots.seed({ case_study_id: cs.id, version: 1, status: 'approved', content: leakyContent() });

    await expect(publishCaseStudy({
      caseStudyId: cs.id, surfaceKey: 'enterprise', actor: 'ali@colaberry.com',
    })).rejects.toBeInstanceOf(CaseStudyPublicationError);

    const lines = logLines();
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      for (const secret of SENSITIVE) expect(line).not.toContain(secret);
    }
    const entry = JSON.parse(lines[0]);
    expect(entry.service).toBe('case-study-publication');
    expect(entry.outcome).toBe('blocked');
    expect(entry.correlation_id).toEqual(expect.any(String));
    expect(entry.context.blocker_codes).toEqual(expect.arrayContaining(['organization_consent']));
    expect(entry.context.blocker_count).toBeGreaterThan(0);
    expect(entry.context.duration_ms).toEqual(expect.any(Number));
    expect(Object.keys(entry.context)).not.toContain('actor');
  });

  it('logs a successful publish and an unpublish without the actor', async () => {
    const { caseStudyId } = seedPublishable();
    await publishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: 'ali@colaberry.com', correlationId: 'trace-1' });
    await unpublishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: 'ali@colaberry.com', correlationId: 'trace-1' });
    const entries = logLines().map((l) => JSON.parse(l));
    expect(entries.map((e) => e.event)).toEqual(['case_study.publish', 'case_study.unpublish']);
    for (const entry of entries) {
      expect(entry.correlation_id).toBe('trace-1');
      expect(entry.outcome).toBe('success');
      expect(JSON.stringify(entry)).not.toContain('ali@colaberry.com');
    }
  });
});

/* ══════════════════════════════════════════ the service boundary itself ═══ */

describe('the service boundary', () => {
  it('rejects a malformed input with a tagged validation error before any read', async () => {
    await expect(publishCaseStudy({ caseStudyId: '', surfaceKey: 'enterprise', actor: 'a' } as any))
      .rejects.toMatchObject({ error_class: 'ValidationError', http_status: 400 });
    await expect(unpublishCaseStudy({ caseStudyId: 'x', surfaceKey: 'enterprise', actor: '' } as any))
      .rejects.toMatchObject({ error_class: 'ValidationError' });
    expect(publications.writes).toBe(0);
  });

  it('raises a 404 for a Case Study that does not exist', async () => {
    await expect(publishCaseStudy({
      caseStudyId: randomUUID(), surfaceKey: 'enterprise', actor: 'ali@colaberry.com',
    })).rejects.toMatchObject({ error_class: 'CaseStudyNotFound', http_status: 404 });
  });

  it('carries every blocker on the thrown error, with spec §15\'s summary as its message', async () => {
    const cs = caseStudies.seed({ id: randomUUID(), status: 'draft' });
    snapshots.seed({ case_study_id: cs.id, version: 1, status: 'approved', content: publishableContent() });
    try {
      await publishCaseStudy({ caseStudyId: cs.id, surfaceKey: 'enterprise', actor: 'ali@colaberry.com' });
      throw new Error('expected the publish to be refused');
    } catch (err) {
      expect(isCaseStudyPublicationError(err)).toBe(true);
      const publicationError = err as CaseStudyPublicationError;
      expect(publicationError.error_class).toBe('PublishBlocked');
      expect(publicationError.blockers).toHaveLength(1);
      expect(publicationError.message.startsWith('Cannot publish:\n- ')).toBe(true);
      expect(publicationError.message).toContain('Case Study status is "draft"');
    }
  });

  it('previews the same decision without writing anything', async () => {
    const cs = caseStudies.seed({ id: randomUUID(), status: 'draft' });
    snapshots.seed({ case_study_id: cs.id, version: 1, status: 'approved', content: publishableContent() });
    const decision = await evaluateCaseStudyPublication({
      caseStudyId: cs.id, surfaceKey: 'enterprise', actor: 'ali@colaberry.com',
    });
    expect(decision.allowed).toBe(false);
    expect(codes(decision)).toEqual(['case_study_not_approved']);
    expect(publications.writes).toBe(0);
    expect(logLines()).toHaveLength(0);
  });

  it('treats an unrecognised status string from the database as not approved', () => {
    const decision = evaluate({ record: { status: 'live_somehow' as any } });
    expect(decision.allowed).toBe(false);
    expect(codes(decision)).toContain('case_study_not_approved');
  });
});
