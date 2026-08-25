/**
 * Fixtures for the sync-service suites (T011).
 *
 * NOT A TEST FILE — jest's `testMatch` is `__tests__/**\/*.test.ts`, so this is
 * imported, never collected (the same arrangement as `githubFetchFake.ts` and
 * `snapshotFixtures.ts`).
 *
 * WHY THE FAKE TABLES ENFORCE CONSTRAINTS. `FakeTable` honours the unique
 * indexes the real DDL declares — `cs_snapshots_unique_case_version`
 * (`db/ensureCaseStudySchema.ts:184`) in particular — because the concurrency
 * claim is precisely that a second simultaneous sync cannot insert a second
 * snapshot. A fake without the constraint would let both inserts succeed and the
 * test would prove nothing about the property it is named after.
 *
 * `FakeTable.update` honours its `where` clause for the same reason: the audit
 * row's append-only guarantee is expressed as `WHERE status = 'running'`, and a
 * fake that ignored the predicate would report success for a rewrite the real
 * database would refuse.
 */
import { randomUUID } from 'crypto';

export type Row = Record<string, any>;

/** Every write Sequelize offers, so "was it called?" covers all of them. */
export const WRITE_METHODS = ['create', 'update', 'destroy', 'upsert', 'bulkCreate', 'save'] as const;

export function matchesWhere(row: Row, where?: Row): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => (
    Array.isArray(value) ? value.includes(row[key]) : row[key] === value
  ));
}

export function applyOrder(rows: Row[], order?: unknown): Row[] {
  if (!Array.isArray(order) || order.length === 0) return rows;
  const [field, direction] = order[0] as [string, string];
  const sorted = [...rows].sort((a, b) => {
    const left = a[field];
    const right = b[field];
    if (left === right) return 0;
    return left > right ? 1 : -1;
  });
  return String(direction).toUpperCase() === 'DESC' ? sorted.reverse() : sorted;
}

export class UniqueViolation extends Error {
  constructor(index: string) {
    super(`duplicate key value violates unique constraint "${index}"`);
    this.name = 'SequelizeUniqueConstraintError';
  }
}

export class FakeTable {
  rows: Row[] = [];
  creates: Row[] = [];
  updates: Array<{ values: Row; where: Row }> = [];
  destroys = 0;
  failCreateWith: Error | null = null;
  /** Fires once immediately before the next create — stages a concurrent insert. */
  beforeCreate: (() => void) | null = null;

  constructor(
    public readonly name: string,
    /** Column groups the real DDL declares unique, e.g. `[['case_study_id','version']]`. */
    private readonly uniqueGroups: readonly (readonly string[])[] = [],
  ) {}

  reset(): void {
    this.rows = [];
    this.creates = [];
    this.updates = [];
    this.destroys = 0;
    this.failCreateWith = null;
    this.beforeCreate = null;
  }

  private assertUnique(values: Row): void {
    for (const group of this.uniqueGroups) {
      const clash = this.rows.some((row) => group.every((col) => row[col] === values[col]));
      if (clash) throw new UniqueViolation(`${this.name}_unique_${group.join('_')}`);
    }
  }

  /** Insert without counting it as a service-driven create. Still constrained. */
  seed(values: Row): Row {
    this.assertUnique(values);
    const row: Row = { id: randomUUID(), ...values };
    this.rows.push(row);
    return row;
  }

  async findByPk(id: string): Promise<Row | null> {
    return this.rows.find((row) => row.id === id) ?? null;
  }

  async findOne(opts: { where?: Row; order?: unknown } = {}): Promise<Row | null> {
    const matching = this.rows.filter((row) => matchesWhere(row, opts.where));
    return applyOrder(matching, opts.order)[0] ?? null;
  }

  async findAll(opts: { where?: Row; order?: unknown; limit?: number } = {}): Promise<Row[]> {
    const matching = applyOrder(this.rows.filter((row) => matchesWhere(row, opts.where)), opts.order);
    return typeof opts.limit === 'number' ? matching.slice(0, opts.limit) : matching;
  }

  async create(values: Row): Promise<Row> {
    if (this.beforeCreate) { const hook = this.beforeCreate; this.beforeCreate = null; hook(); }
    if (this.failCreateWith) throw this.failCreateWith;
    const row = this.seed(values);
    this.creates.push({ ...values });
    return row;
  }

  async update(values: Row, opts: { where?: Row } = {}): Promise<[number]> {
    this.updates.push({ values: { ...values }, where: { ...(opts.where ?? {}) } });
    const targets = this.rows.filter((row) => matchesWhere(row, opts.where));
    for (const row of targets) Object.assign(row, values);
    return [targets.length];
  }

  async destroy(opts: { where?: Row } = {}): Promise<number> {
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => !matchesWhere(row, opts.where));
    this.destroys += before - this.rows.length;
    return before - this.rows.length;
  }
}

/** A read-only source table whose write methods exist purely to be asserted unused. */
export interface ReadOnlyModel {
  rows: Row[];
  writes: Record<string, jest.Mock>;
  reset(): void;
}

export function makeReadOnlyModel(): ReadOnlyModel {
  const writes: Record<string, jest.Mock> = {};
  for (const name of WRITE_METHODS) writes[name] = jest.fn();
  return {
    rows: [],
    writes,
    reset(): void {
      this.rows = [];
      for (const fn of Object.values(writes)) fn.mockReset();
    },
  };
}

/**
 * Bound lazily through a getter thunk: `jest.mock` is hoisted above the const
 * declarations in the suite, so a factory dereferencing them eagerly would hit
 * the temporal dead zone.
 */
export function writeSurface(bag: () => ReadOnlyModel): Record<string, (...a: unknown[]) => unknown> {
  const surface: Record<string, (...a: unknown[]) => unknown> = {};
  for (const name of WRITE_METHODS) surface[name] = (...args: unknown[]) => bag().writes[name](...args);
  return surface;
}

/* ─────────────────────────────────────────────────────────────── rows ────── */

export const CASE_STUDY_ID = '11111111-1111-4111-8111-111111111111';
export const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
export const ENROLLMENT_ID = '33333333-3333-4333-8333-333333333333';
export const REPO_ROW_ID = '44444444-4444-4444-8444-444444444444';
export const REPO_ROW_ID_B = '55555555-5555-4555-8555-555555555555';

/** PII a log line must never carry. Seeded into the source rows on purpose. */
export const STUDENT_EMAIL = 'learner.pii@example.com';
export const CARD_ID = '66666666-6666-4666-8666-666666666666';

export function makeCaseStudyRow(over: Row = {}): Row {
  return {
    id: CASE_STUDY_ID,
    slug: 'bottling-line-copilot',
    title: 'Bottling line copilot',
    status: 'draft',
    project_id: null,
    source_type: 'repo_collection',
    canonical_summary: 'A copilot for the bottling line.',
    industry: 'manufacturing',
    primary_capability: 'agents',
    program_key: 'enterprise-accelerator',
    built_by_type: 'learner',
    visibility: 'private',
    organization_display_name: null,
    organization_is_anonymized: true,
    organization_identity_mode: 'anonymized',
    organization_naming_consent: false,
    builder_identity_mode: 'role_only',
    builder_naming_consent: false,
    archived_at: null,
    ...over,
  };
}

export function makeProjectRow(over: Row = {}): Row {
  return {
    id: PROJECT_ID,
    enrollment_id: ENROLLMENT_ID,
    program_id: 'enterprise-accelerator',
    name: 'Bottling line copilot',
    // DATA_SOURCE_MAP §3.1: a candidate for review, never a publishable value.
    organization_name: 'Acme Bottling Co',
    industry: 'manufacturing',
    primary_business_problem: 'Line changeovers take four hours.',
    selected_use_case: 'changeover-copilot',
    automation_goal: 'Cut changeover time in half.',
    project_stage: 'implementation',
    system_model: { agents: 3 },
    executive_summary: 'A copilot that walks operators through a changeover.',
    maturity_score: 62,
    requirements_completion_pct: 80,
    health_score: 71,
    velocity_score: 55,
    stability_score: 66,
    github_repo_url: null,
    archived_at: null,
    ...over,
  };
}

/** A `case_study_repositories` record as `listRepositories()` returns it. */
export function makeRepoRecord(over: Row = {}): Row {
  return {
    id: REPO_ROW_ID,
    collectionId: 'collection-1',
    repoOwner: 'acme',
    repoName: 'atlas',
    repoUrl: 'https://github.com/acme/atlas',
    role: 'primary',
    visibility: 'public',
    accessStatus: 'connected',
    allowPublicRepoLink: true,
    ...over,
  };
}
