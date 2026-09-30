/**
 * Model ↔ DDL column parity for the four Story Studio asset tables.
 *
 * A DELIBERATE MIRROR OF `caseStudyModelParity.test.ts`, not an extension of it.
 *
 * That suite pins `CASE_STUDY_TABLES` to exactly ten and the core DDL's column
 * total to exactly 158, and reads `ensureCaseStudySchema.ts` as source text.
 * The Story Studio tables therefore could not be added to it without changing
 * two numbers that exist precisely so nobody changes them casually. They live
 * in a peer DDL module (`db/ensureCaseStudyStoryAssets.ts`) and get a peer
 * guard here — duplicated rather than widened.
 *
 * WHY THE GUARD EXISTS AT ALL, from the original's header: on 2026-08-22 nine
 * models were given columns in Postgres that were never declared as Sequelize
 * attributes. Sequelize only ever SELECTs, INSERTs and UPDATEs attributes a
 * model knows about, so those columns were invisible — reads came back
 * `undefined`, writes were dropped with no error, and every mocked test passed
 * the whole time. A quote whose `consent_recorded_at` silently did not persist
 * is exactly that bug wearing the worst possible costume.
 *
 * STATIC BY CONSTRUCTION. It imports no model class and opens no connection: it
 * reads the DDL module's own derived column list and the four model files AS
 * TEXT. `config/database` is mocked purely so importing the DDL module cannot
 * touch a connection — the same convention as the suite it mirrors. That is
 * what keeps it OFF `jest.ci.config.ts`'s ignore-list, which is where a guard
 * goes to stop running.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn().mockResolvedValue([]) } }));

import fs from 'fs';
import path from 'path';
import {
  CASE_STUDY_STORY_REQUIRED_COLUMNS,
  CASE_STUDY_STORY_REQUIRED_INDEXES,
  CASE_STUDY_STORY_TABLES,
} from '../../db/ensureCaseStudyStoryAssets';

const MODELS_DIR = path.join(__dirname, '..');

/** The one place a Story Studio table is bound to the model that owns it. */
const TABLE_TO_MODEL: Record<string, string> = {
  case_study_storylines: 'CaseStudyStoryline.ts',
  case_study_ai_drafts: 'CaseStudyAiDraft.ts',
  case_study_quotes: 'CaseStudyQuote.ts',
  case_study_charts: 'CaseStudyChart.ts',
};

const modelSource = (file: string): string =>
  fs.readFileSync(path.join(MODELS_DIR, file), 'utf8');

/**
 * Attribute names declared inside `X.init({ ... })`.
 *
 * Deliberately structural rather than a loose regex over the whole file: a
 * column name mentioned in a doc comment must not be mistaken for a declared
 * attribute, which is the exact way a parity guard turns into decoration.
 */
function declaredAttributes(file: string): string[] {
  const source = modelSource(file);
  const initAt = source.search(/^\w+\.init\(\s*$/m);
  expect(initAt).toBeGreaterThan(-1);

  // From `init(` to the closing `},` of its first object argument.
  const body = source.slice(initAt);
  const open = body.indexOf('{');
  let depth = 0;
  let end = open;
  for (let i = open; i < body.length; i += 1) {
    if (body[i] === '{') depth += 1;
    else if (body[i] === '}') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  const attrs = body.slice(open + 1, end);

  // Top-level keys only — nested `{ type: ..., allowNull: ... }` must not count.
  const keys: string[] = [];
  let nest = 0;
  for (const line of attrs.split('\n')) {
    const trimmed = line.trim();
    if (nest === 0) {
      const match = trimmed.match(/^([a-z_][a-z0-9_]*)\s*:/i);
      if (match) keys.push(match[1]);
    }
    nest += (line.split('{').length - 1) - (line.split('}').length - 1);
  }
  return keys;
}

const ddlColumnsFor = (table: string): string[] =>
  CASE_STUDY_STORY_REQUIRED_COLUMNS
    .filter((c) => c.startsWith(`${table}.`))
    .map((c) => c.split('.')[1]);

/**
 * Columns Sequelize manages itself from the `timestamps` / `createdAt` /
 * `updatedAt` options rather than from an attribute declaration. Listing them
 * is the honest alternative to loosening the assertion.
 */
const SEQUELIZE_MANAGED = new Set(['created_at', 'updated_at']);

describe('Story Studio asset models — DDL parity', () => {
  it('binds all four DDL tables to a model file that declares that exact tableName', () => {
    expect(Object.keys(TABLE_TO_MODEL).sort()).toEqual([...CASE_STUDY_STORY_TABLES].sort());

    for (const [table, file] of Object.entries(TABLE_TO_MODEL)) {
      expect(modelSource(file)).toContain(`tableName: '${table}'`);
    }
  });

  it('declares a Sequelize attribute for every column the DDL creates', () => {
    const missing: string[] = [];

    for (const [table, file] of Object.entries(TABLE_TO_MODEL)) {
      const declared = new Set(declaredAttributes(file));
      for (const column of ddlColumnsFor(table)) {
        if (SEQUELIZE_MANAGED.has(column)) continue;
        if (!declared.has(column)) {
          missing.push(
            `${table}.${column} — no attribute in ${file} init(); `
            + 'Sequelize will not read or write this column',
          );
        }
      }
    }

    // Names, not a count, so a failure says which column is invisible.
    expect(missing).toEqual([]);
  });

  it('parses a non-trivial number of columns, so the check above is not vacuous', () => {
    // Four tables with 5, 11, 15 and 9 columns. A parse that silently returned
    // nothing would make every assertion here pass by iterating an empty list —
    // which is how the original bug survived a green suite.
    expect(CASE_STUDY_STORY_REQUIRED_COLUMNS.length).toBeGreaterThan(30);
    for (const table of CASE_STUDY_STORY_TABLES) {
      expect(ddlColumnsFor(table).length).toBeGreaterThan(3);
    }
    for (const file of Object.values(TABLE_TO_MODEL)) {
      expect(declaredAttributes(file).length).toBeGreaterThan(2);
    }
  });

  it('creates every index it declares, and names them distinctly', () => {
    expect(CASE_STUDY_STORY_REQUIRED_INDEXES.length).toBeGreaterThan(2);
    expect(new Set(CASE_STUDY_STORY_REQUIRED_INDEXES).size)
      .toBe(CASE_STUDY_STORY_REQUIRED_INDEXES.length);
    // The partial unique index is what makes a regenerated proposal supersede
    // rather than stack. Named explicitly so removing it fails here.
    expect(CASE_STUDY_STORY_REQUIRED_INDEXES).toContain('cs_ai_drafts_one_proposal_per_path');
  });
});

describe('the guard on the guard', () => {
  it('imports only text-reading modules and the DDL, never a model class', () => {
    const self = fs.readFileSync(__filename.replace(/\.js$/, '.ts'), 'utf8');
    expect(self).toContain('ensureCaseStudyStoryAssets');
    expect(self).not.toMatch(/^import \w+ from '\.\.\/CaseStudy/m);
  });

  it('is not excluded from the CI test set', () => {
    const ci = fs.readFileSync(
      path.join(MODELS_DIR, '..', '..', 'jest.ci.config.ts'), 'utf8',
    );
    expect(ci.length).toBeGreaterThan(500); // non-vacuity
    expect(ci).not.toContain('caseStudyStoryAssetParity');
  });
});
