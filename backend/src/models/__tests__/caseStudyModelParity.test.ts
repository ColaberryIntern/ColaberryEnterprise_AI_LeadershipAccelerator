/**
 * Model ↔ DDL column parity for the Case Study OS.
 *
 * WHY THIS SUITE EXISTS
 * On 2026-08-22 nine models were given new tenancy columns in Postgres that were
 * never declared as Sequelize attributes. Sequelize only ever SELECTs, INSERTs and
 * UPDATEs attributes a model knows about, so those columns were invisible: reads
 * came back `undefined`, writes were dropped with no error, the entire tenancy
 * runtime did nothing — and every mocked test passed the whole time. A test that
 * mocks the model layer can never see this class of bug, because the mock has
 * whatever attributes the test gives it.
 *
 * WHY IT IS STATIC
 * `jest.ci.config.ts` is an ignore-list whose stated purpose is excluding suites
 * that instantiate Sequelize against a real database, because CI provisions no
 * Postgres and no `DATABASE_URL`. A guard that lands on that list never runs in
 * CI, which is exactly how the bug above survived. So this suite imports NO model
 * class and opens NO connection: it reads `ensureCaseStudySchema.ts` (via its own
 * exported, DDL-derived column list) and the ten model files as TEXT, and compares
 * them. `config/database` is mocked purely so importing the DDL module cannot
 * touch a connection — the same convention as
 * `src/db/__tests__/ensureCaseStudySchema.test.ts`.
 *
 * Two self-checks below (`imports only text`, `not excluded from CI`) exist so the
 * property that keeps this guard alive cannot be quietly removed later.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn().mockResolvedValue([]) } }));

import fs from 'fs';
import path from 'path';
import {
  CASE_STUDY_REQUIRED_COLUMNS,
  CASE_STUDY_TABLES,
} from '../../db/ensureCaseStudySchema';

const MODELS_DIR = path.join(__dirname, '..');
const DDL_PATH = path.join(MODELS_DIR, '..', 'db', 'ensureCaseStudySchema.ts');
const CI_CONFIG_PATH = path.join(MODELS_DIR, '..', '..', 'jest.ci.config.ts');

/** The one place a table is bound to the model that owns it. */
const TABLE_TO_MODEL: Record<string, string> = {
  case_studies: 'CaseStudy.ts',
  case_study_repo_collections: 'CaseStudyRepoCollection.ts',
  case_study_repositories: 'CaseStudyRepository.ts',
  case_study_snapshots: 'CaseStudySnapshot.ts',
  case_study_metrics: 'CaseStudyMetric.ts',
  case_study_evidence: 'CaseStudyEvidence.ts',
  case_study_artifacts: 'CaseStudyArtifact.ts',
  case_study_publications: 'CaseStudyPublication.ts',
  case_study_sync_runs: 'CaseStudySyncRun.ts',
  case_study_collections: 'CaseStudyCollection.ts',
};

// ---------------------------------------------------------------------------
// A small TypeScript-source reader. Deliberately structural rather than
// line/indentation based: a guard that can be fooled by reformatting is not a
// guard. It skips comments and string literals so a column name mentioned in
// prose can never be mistaken for a declared attribute.
// ---------------------------------------------------------------------------

function skipQuoted(source: string, start: number): number {
  const quote = source[start];
  let i = start + 1;
  while (i < source.length) {
    if (source[i] === '\\') {
      i += 2;
      continue;
    }
    if (source[i] === quote) return i + 1;
    i += 1;
  }
  return i;
}

/** Top-level keys of the object/interface body starting at `openBrace`, plus where it ended. */
function readBraceBody(source: string, openBrace: number): { keys: string[]; end: number } {
  const keys: string[] = [];
  let depth = 0;
  let expectKey = false;
  let i = openBrace;

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === '/' && next === '/') {
      const nl = source.indexOf('\n', i);
      i = nl === -1 ? source.length : nl + 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      const close = source.indexOf('*/', i + 2);
      i = close === -1 ? source.length : close + 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipQuoted(source, i);
      continue;
    }
    if (ch === '{' || ch === '[' || ch === '(') {
      depth += 1;
      if (ch === '{' && depth === 1) expectKey = true;
      i += 1;
      continue;
    }
    if (ch === '}' || ch === ']' || ch === ')') {
      depth -= 1;
      if (depth === 0) return { keys, end: i + 1 };
      i += 1;
      continue;
    }
    if (depth === 1 && (ch === ',' || ch === ';')) {
      expectKey = true;
      i += 1;
      continue;
    }
    if (depth === 1 && expectKey && !/\s/.test(ch)) {
      const member = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*\??\s*:/.exec(source.slice(i, i + 160));
      if (member) {
        keys.push(member[1]);
        i += member[0].length;
        expectKey = false;
        continue;
      }
      expectKey = false;
    }
    i += 1;
  }
  return { keys, end: source.length };
}

interface ParsedModel {
  file: string;
  initKeys: Set<string>;
  interfaceKeys: Set<string>;
  declaredFields: Set<string>;
  tableName: string | null;
  timestamps: string | null;
  createdAtOption: string | null;
  updatedAtOption: string | null;
}

function parseModelFile(file: string): ParsedModel {
  const source = fs.readFileSync(path.join(MODELS_DIR, file), 'utf8');

  // `X.init(` anchored to the start of a line so a mention inside a comment or a
  // string cannot be mistaken for the real call.
  const initCall = /\n[A-Za-z_$][A-Za-z0-9_$]*\.init\(/.exec(source);
  const attrs = initCall
    ? readBraceBody(source, source.indexOf('{', initCall.index + initCall[0].length - 1))
    : { keys: [] as string[], end: source.length };

  // The model OPTIONS object is whatever follows the attributes object.
  const optionsText = source.slice(attrs.end);

  const iface = /export interface\s+[A-Za-z_$][A-Za-z0-9_$]*Attributes\s*\{/.exec(source);
  const interfaceKeys = iface
    ? readBraceBody(source, iface.index + iface[0].length - 1).keys
    : [];

  const declaredFields = [...source.matchAll(/^[ \t]*declare\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*[!?]?\s*:/gm)]
    .map((m) => m[1]);

  return {
    file,
    initKeys: new Set(attrs.keys),
    interfaceKeys: new Set(interfaceKeys),
    declaredFields: new Set(declaredFields),
    tableName: /tableName:\s*'([^']+)'/.exec(optionsText)?.[1] ?? null,
    timestamps: /timestamps:\s*(true|false)/.exec(optionsText)?.[1] ?? null,
    createdAtOption: /createdAt:\s*(false|'[^']*')/.exec(optionsText)?.[1] ?? null,
    updatedAtOption: /updatedAt:\s*(false|'[^']*')/.exec(optionsText)?.[1] ?? null,
  };
}

const MODELS: Record<string, ParsedModel> = Object.fromEntries(
  Object.entries(TABLE_TO_MODEL).map(([table, file]) => [table, parseModelFile(file)]),
);

const columnsOf = (table: string): string[] =>
  CASE_STUDY_REQUIRED_COLUMNS.filter((c) => c.startsWith(`${table}.`)).map((c) => c.split('.')[1]);

/** Sequelize itself maintains created_at/updated_at when `timestamps` is on. */
const managesCreatedAt = (m: ParsedModel): boolean =>
  m.timestamps === 'true' && m.createdAtOption !== 'false';
const managesUpdatedAt = (m: ParsedModel): boolean =>
  m.timestamps === 'true' && m.updatedAtOption !== 'false';

function knowsColumn(m: ParsedModel, column: string): boolean {
  if (m.initKeys.has(column)) return true;
  if (column === 'created_at') return managesCreatedAt(m);
  if (column === 'updated_at') return managesUpdatedAt(m);
  return false;
}

describe('Case Study models — DDL parity', () => {
  it('binds all ten DDL tables to a model file that declares that exact tableName', () => {
    expect(Object.keys(TABLE_TO_MODEL).sort()).toEqual([...CASE_STUDY_TABLES].sort());

    const problems: string[] = [];
    for (const [table, file] of Object.entries(TABLE_TO_MODEL)) {
      if (!fs.existsSync(path.join(MODELS_DIR, file))) {
        problems.push(`${table} → ${file} does not exist`);
        continue;
      }
      if (MODELS[table].tableName !== table) {
        problems.push(`${file} declares tableName '${MODELS[table].tableName}', expected '${table}'`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('every table the DDL creates columns for has an owning model — no table can slip through', () => {
    const ddlSource = fs.readFileSync(DDL_PATH, 'utf8');
    const unowned: string[] = [];
    for (const table of new Set(CASE_STUDY_REQUIRED_COLUMNS.map((c) => c.split('.')[0]))) {
      if (!TABLE_TO_MODEL[table]) unowned.push(table);
    }
    expect(unowned).toEqual([]);

    // ...and each mapped table is genuinely created by the DDL file on disk, so
    // the map cannot list a table that no longer exists and score a free pass.
    for (const table of Object.keys(TABLE_TO_MODEL)) {
      expect(ddlSource).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });

  it('each table contributes at least one column, and the DDL total is still 159', () => {
    // A table parsed as zero columns would make its per-table parity test pass
    // vacuously — "nothing to check" must never read as "everything is fine".
    const empty = CASE_STUDY_TABLES.filter((t) => columnsOf(t).length === 0);
    expect(empty).toEqual([]);

    // Canary, not decoration: when this number moves, ten models need revisiting.
    expect(CASE_STUDY_REQUIRED_COLUMNS).toHaveLength(159);
  });

  it.each([...CASE_STUDY_TABLES])(
    '%s — every column the DDL creates is declared in the model (interface + init + declare)',
    (table) => {
      const model = MODELS[table];
      const missing: string[] = [];

      for (const column of columnsOf(table)) {
        if (!knowsColumn(model, column)) {
          missing.push(`${table}.${column} — no attribute in ${model.file} init(); Sequelize will not read or write this column`);
        }
        if (!model.declaredFields.has(column)) {
          missing.push(`${table}.${column} — no 'declare ${column}' line in ${model.file}`);
        }
        if (!model.interfaceKeys.has(column)) {
          missing.push(`${table}.${column} — missing from the attributes interface in ${model.file}`);
        }
      }

      expect(missing).toEqual([]);
    },
  );

  it.each([...CASE_STUDY_TABLES])(
    '%s — declares no attribute the DDL does not create',
    (table) => {
      const model = MODELS[table];
      const known = new Set(columnsOf(table));
      const phantom = [...model.initKeys]
        .filter((k) => !known.has(k))
        .map((k) => `${model.file} declares '${k}', which ${table} has no column for — every SELECT would fail`);
      expect(phantom).toEqual([]);
    },
  );

  it.each([...CASE_STUDY_TABLES])(
    '%s — does not let Sequelize manage a timestamp column the DDL never creates',
    (table) => {
      const model = MODELS[table];
      const known = new Set(columnsOf(table));

      // The mirror image of a missing attribute: an EXTRA managed timestamp makes
      // every write set a column that is not there. case_study_snapshots and
      // case_study_evidence have no updated_at; case_study_sync_runs has neither.
      if (!known.has('created_at')) {
        expect({ table, managesCreatedAt: managesCreatedAt(model) }).toEqual({ table, managesCreatedAt: false });
      }
      if (!known.has('updated_at')) {
        expect({ table, managesUpdatedAt: managesUpdatedAt(model) }).toEqual({ table, managesUpdatedAt: false });
      }
    },
  );
});

describe('Case Study parity guard — the guard on the guard', () => {
  it('imports only text-reading modules and the DDL, never a model class or a connection', () => {
    const self = fs.readFileSync(__filename.replace(/\.js$/, '.ts'), 'utf8');
    const specifiers = [...self.matchAll(/^import[^'"]*from\s+'([^']+)'/gm)].map((m) => m[1]);
    expect(specifiers.sort()).toEqual(['../../db/ensureCaseStudySchema', 'fs', 'path']);
  });

  it('is not excluded from the CI test set', () => {
    // If this suite ever lands on jest.ci.config.ts's ignore-list it stops running
    // where it matters, and the 2026-08-22 failure mode is available again.
    expect(fs.readFileSync(CI_CONFIG_PATH, 'utf8')).not.toContain('caseStudyModelParity');
  });
});
