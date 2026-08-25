/**
 * integrationHarness — the in-memory DATABASE the T020 integration suite runs
 * the WHOLE Case Study chain against. The GitHub double and the seed rows live
 * in `integrationFixtures.ts`, split off for CLAUDE.md's 500-line ceiling.
 *
 * NOT A TEST FILE — jest's `testMatch` is `__tests__/**\/*.test.ts`, so this is
 * imported and never collected (the same arrangement as `syncFixtures.ts`,
 * `publicFixtures.ts` and `githubFetchFake.ts`).
 *
 * ── WHY IT IS ONE SHARED FAKE AND NOT TWELVE ────────────────────────────────
 *
 * Every existing Case Study suite doubles the seam BELOW the thing it tests:
 * the sync suite doubles `listRepositories`, the publication suite doubles the
 * snapshot table, the public route suite seeds a publication row by hand. Each
 * is a correct unit test and none of them can catch the failure this task is
 * about — two real modules disagreeing about the row that passes between them.
 * So the fakes here stand in for the DATABASE and for GITHUB, and for nothing
 * else. `attachRepository`, `syncCaseStudy`, `approveSnapshot`,
 * `publishCaseStudy`, the public store, the filter engine, the projection and
 * the Express router are all the shipped code, wired to each other.
 *
 * ── THE FAKES HONOUR THE CONSTRAINTS THE REAL DDL DECLARES ──────────────────
 *
 * `case_studies.slug`, `cs_snapshots_unique_case_version`,
 * `cs_publications_unique_case_surface` and the case-insensitive
 * `cs_repositories_unique_per_collection` are all enforced here, because a fake
 * without them lets two rows exist that Postgres would refuse and the test then
 * proves a property the production system does not have. `where` is honoured —
 * including `Op.in`, which the public store uses to hydrate a pin — for the same
 * reason: a fake that answers a question its caller did not ask cannot detect a
 * caller asking the wrong one.
 *
 * `attributes` is honoured too. `caseStudyProjectSource` selects an ALLOW-LIST
 * of nineteen `projects` columns precisely so a wide JSONB blob cannot leak, and
 * a fake that returned the whole row regardless would make that allow-list
 * untestable from here.
 *
 * ── READ-ONLY MODELS THROW ──────────────────────────────────────────────────
 *
 * `Project`, `GitHubConnection`, `EvidenceRecord` and `PortfolioArtifact` are
 * SOURCES. Nothing in this feature may write to them. Their write verbs record
 * the attempt and then throw, so a regression is loud at the call site rather
 * than a number that quietly moved.
 */
import { Op } from 'sequelize';
import { randomUUID } from 'crypto';

export type Row = Record<string, any>;

/* ─────────────────────────────────────────────────────────── constraints ──── */

export class UniqueViolation extends Error {
  constructor(index: string) {
    super(`duplicate key value violates unique constraint "${index}"`);
    this.name = 'SequelizeUniqueConstraintError';
  }
}

/** Sequelize's `where`, as far as this feature actually uses it. */
function matchesValue(actual: unknown, expected: unknown): boolean {
  if (expected !== null && typeof expected === 'object' && !Array.isArray(expected)
    && !(expected instanceof Date)) {
    const ops = expected as Record<symbol, unknown>;
    if (Op.in in (expected as object)) return (ops[Op.in] as unknown[]).includes(actual);
    if (Op.is in (expected as object)) {
      return ops[Op.is] === null ? actual === null || actual === undefined : actual === ops[Op.is];
    }
  }
  if (Array.isArray(expected)) return expected.includes(actual);
  return actual === expected;
}

function matchesWhere(row: Row, where?: Row): boolean {
  if (!where) return true;
  return Object.keys(where).every((key) => matchesValue(row[key], where[key]));
}

function applyOrder(rows: Row[], order?: unknown): Row[] {
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

/* ──────────────────────────────────────────────────────────── the model ──── */

export interface FakeModelOptions {
  /** Column groups the real DDL declares unique, e.g. `[['case_study_id','version']]`. */
  readonly unique?: readonly (readonly string[])[];
  /** Columns the real unique index wraps in `LOWER()`. */
  readonly caseInsensitive?: readonly string[];
  /** A source table this feature may only read. Its write verbs throw. */
  readonly readOnly?: boolean;
}

/**
 * One table. Rows are plain objects carrying a non-enumerable `update`/`get`,
 * so `JSON.stringify(model.rows)` is the row data and nothing else — which is
 * what makes the leak assertions in the suite meaningful.
 */
export class FakeModel {
  rows: Row[] = [];
  creates: Row[] = [];
  updates: Array<{ values: Row; where: Row }> = [];
  destroys = 0;
  /** Every forbidden write attempted against a read-only source table. */
  writeAttempts: string[] = [];

  constructor(public readonly name: string, private readonly opts: FakeModelOptions = {}) {}

  reset(): void {
    this.rows = [];
    this.creates = [];
    this.updates = [];
    this.destroys = 0;
    this.writeAttempts = [];
  }

  private keyOf(row: Row, group: readonly string[]): string {
    return group
      .map((col) => (this.opts.caseInsensitive?.includes(col)
        ? String(row[col] ?? '').toLowerCase()
        : String(row[col] ?? '')))
      .join('|');
  }

  private assertUnique(values: Row): void {
    for (const group of this.opts.unique ?? []) {
      const key = this.keyOf(values, group);
      if (this.rows.some((row) => this.keyOf(row, group) === key)) {
        throw new UniqueViolation(`${this.name}_unique_${group.join('_')}`);
      }
    }
  }

  private instance(values: Row): Row {
    const model = this;
    const row: Row = { ...values };
    Object.defineProperty(row, 'update', {
      enumerable: false,
      value: async (patch: Row): Promise<Row> => {
        model.refuseWrite('update');
        model.updates.push({ values: { ...patch }, where: { id: row.id } });
        Object.assign(row, patch);
        return row;
      },
    });
    Object.defineProperty(row, 'get', { enumerable: false, value: (): Row => ({ ...row }) });
    Object.defineProperty(row, 'save', { enumerable: false, value: async (): Promise<Row> => row });
    return row;
  }

  private refuseWrite(verb: string): void {
    if (!this.opts.readOnly) return;
    this.writeAttempts.push(verb);
    throw new Error(`${this.name} is a source table and must never be written (${verb})`);
  }

  /** Insert without counting it as a service-driven create. Still constrained. */
  seed(values: Row): Row {
    this.assertUnique(values);
    const row = this.instance({ id: randomUUID(), ...values });
    this.rows.push(row);
    return row;
  }

  private project(row: Row, attributes?: unknown): Row {
    if (!Array.isArray(attributes)) return row;
    const narrowed: Row = {};
    for (const name of attributes as string[]) narrowed[name] = row[name];
    return this.instance(narrowed);
  }

  async findByPk(id: string, opts: Row = {}): Promise<Row | null> {
    const row = this.rows.find((r) => r.id === id);
    return row ? this.project(row, opts.attributes) : null;
  }

  async findOne(opts: Row = {}): Promise<Row | null> {
    const matching = applyOrder(this.rows.filter((r) => matchesWhere(r, opts.where)), opts.order);
    const row = matching[0];
    return row ? this.project(row, opts.attributes) : null;
  }

  async findAll(opts: Row = {}): Promise<Row[]> {
    const matching = applyOrder(this.rows.filter((r) => matchesWhere(r, opts.where)), opts.order);
    const limited = typeof opts.limit === 'number' ? matching.slice(0, opts.limit) : matching;
    return limited.map((row) => this.project(row, opts.attributes));
  }

  async create(values: Row, _opts?: Row): Promise<Row> {
    this.refuseWrite('create');
    const row = this.seed(values);
    this.creates.push({ ...values });
    return row;
  }

  async findOrCreate(opts: Row): Promise<[Row, boolean]> {
    const found = this.rows.find((r) => matchesWhere(r, opts.where));
    if (found) return [found, false];
    return [await this.create({ ...(opts.where ?? {}), ...(opts.defaults ?? {}) }), true];
  }

  async update(values: Row, opts: Row = {}): Promise<[number]> {
    this.refuseWrite('update');
    this.updates.push({ values: { ...values }, where: { ...(opts.where ?? {}) } });
    const targets = this.rows.filter((r) => matchesWhere(r, opts.where));
    for (const row of targets) Object.assign(row, values);
    return [targets.length];
  }

  async destroy(opts: Row = {}): Promise<number> {
    this.refuseWrite('destroy');
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !matchesWhere(r, opts.where));
    this.destroys += before - this.rows.length;
    return before - this.rows.length;
  }

  async upsert(values: Row): Promise<unknown> {
    this.refuseWrite('upsert');
    return this.create(values);
  }

  async bulkCreate(values: readonly Row[]): Promise<Row[]> {
    this.refuseWrite('bulkCreate');
    return Promise.all(values.map((v) => this.create(v)));
  }

  /** The shape a `jest.mock` factory hands back as the module's default export. */
  asModel(): Record<string, (...args: any[]) => unknown> {
    return {
      findByPk: (id: string, o?: Row) => this.findByPk(id, o),
      findOne: (o?: Row) => this.findOne(o),
      findAll: (o?: Row) => this.findAll(o),
      findOrCreate: (o: Row) => this.findOrCreate(o),
      create: (v: Row, o?: Row) => this.create(v, o),
      update: (v: Row, o?: Row) => this.update(v, o),
      destroy: (o?: Row) => this.destroy(o),
      upsert: (v: Row) => this.upsert(v),
      bulkCreate: (v: Row[]) => this.bulkCreate(v),
    };
  }
}

/* ──────────────────────────────────────────────────────────── the tables ──── */

export interface IntegrationDb {
  readonly studies: FakeModel;
  readonly snapshots: FakeModel;
  readonly syncRuns: FakeModel;
  readonly metrics: FakeModel;
  readonly artifacts: FakeModel;
  readonly evidence: FakeModel;
  readonly repoCollections: FakeModel;
  readonly repositories: FakeModel;
  readonly publications: FakeModel;
  readonly savedCollections: FakeModel;
  readonly projects: FakeModel;
  readonly connections: FakeModel;
  readonly evidenceRecords: FakeModel;
  readonly portfolioArtifacts: FakeModel;
}

export function makeIntegrationDb(): IntegrationDb {
  return {
    studies: new FakeModel('case_studies', { unique: [['slug']] }),
    snapshots: new FakeModel('case_study_snapshots', { unique: [['case_study_id', 'version']] }),
    syncRuns: new FakeModel('case_study_sync_runs'),
    metrics: new FakeModel('case_study_metrics'),
    artifacts: new FakeModel('case_study_artifacts'),
    evidence: new FakeModel('case_study_evidence'),
    repoCollections: new FakeModel('case_study_repo_collections', { unique: [['case_study_id']] }),
    repositories: new FakeModel('case_study_repositories', {
      unique: [['collection_id', 'repo_owner', 'repo_name']],
      caseInsensitive: ['repo_owner', 'repo_name'],
    }),
    publications: new FakeModel('case_study_publications', {
      unique: [['case_study_id', 'surface_key']],
    }),
    savedCollections: new FakeModel('case_study_collections', { unique: [['slug']] }),
    projects: new FakeModel('projects', { readOnly: true }),
    connections: new FakeModel('github_connections', { readOnly: true }),
    evidenceRecords: new FakeModel('evidence_records', { readOnly: true }),
    portfolioArtifacts: new FakeModel('runtime_portfolio_artifacts', { readOnly: true }),
  };
}

export function resetIntegrationDb(db: IntegrationDb): void {
  for (const model of Object.values(db)) (model as FakeModel).reset();
}
