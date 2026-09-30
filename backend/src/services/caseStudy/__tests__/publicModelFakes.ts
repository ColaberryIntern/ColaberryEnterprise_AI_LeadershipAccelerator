/**
 * In-memory stand-ins for the four Case Study tables the public read path
 * touches. Shared by the store suite and the three route suites (T014).
 *
 * NOT A TEST FILE - jest collects `*.test.ts` only.
 *
 * THE FAKES HONOUR THE WHERE CLAUSE, including `Op.in`. A fake that answers a
 * question its caller did not ask cannot detect a wrong question: if `findAll`
 * ignored `where`, the surface-isolation tests would pass against a router that
 * had no surface scoping at all.
 *
 * Every write method throws. The public API has no business writing anything,
 * and an exception is a property where a comment is only a hope.
 */

import { Op } from 'sequelize';
import { internalSnapshotContent } from './publicFixtures';

export type Row = Record<string, any>;

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  for (const key of Object.keys(where)) {
    const expected = where[key];
    if (expected && typeof expected === 'object' && Op.in in expected) {
      if (!(expected as Record<symbol, unknown[]>)[Op.in].includes(row[key])) return false;
      continue;
    }
    if (row[key] !== expected) return false;
  }
  return true;
}

export class FakeTable {
  rows: Row[] = [];
  reset(): void { this.rows = []; }
  seed(row: Row): Row { this.rows.push(row); return row; }

  async findAll(opts: Row = {}): Promise<Row[]> {
    const hits = this.rows.filter((r) => matches(r, opts.where));
    return typeof opts.limit === 'number' ? hits.slice(0, opts.limit) : hits;
  }

  async findOne(opts: Row = {}): Promise<Row | null> {
    return this.rows.find((r) => matches(r, opts.where)) ?? null;
  }

  create(): never { throw new Error('the public read path must never write'); }
  update(): never { throw new Error('the public read path must never write'); }
  upsert(): never { throw new Error('the public read path must never write'); }
  destroy(): never { throw new Error('the public read path must never write'); }
}

export const fakes = {
  studies: new FakeTable(),
  publications: new FakeTable(),
  snapshots: new FakeTable(),
  collections: new FakeTable(),
};

export function resetFakes(): void {
  fakes.studies.reset();
  fakes.publications.reset();
  fakes.snapshots.reset();
  fakes.collections.reset();
}

export const APPROVED_STAMPS = {
  status: 'approved',
  approved_by: 'ali@colaberry.com',
  approved_at: new Date('2026-08-01T00:00:00.000Z'),
};

let counter = 0;

/**
 * One genuinely publishable record: approved Case Study, published publication,
 * a pin to an approved snapshot carrying the maximal internal content. Every
 * negative test below breaks exactly ONE thing about it, so a failing test names
 * the rule that fired rather than a fixture that was never valid.
 */
export function seedPublishedRecord(
  over: { study?: Row; publication?: Row; snapshot?: Row; content?: unknown } = {},
): { study: Row; publication: Row; snapshot: Row } {
  counter += 1;
  const id = `cs-${counter}`;
  const study = fakes.studies.seed({
    id,
    slug: 'stockout-forecasting',
    status: 'approved',
    archived_at: null,
    industry: null,
    primary_capability: null,
    program_key: null,
    built_by_type: null,
    ...over.study,
  });
  const snapshot = fakes.snapshots.seed({
    id: `snap-${counter}`,
    case_study_id: study.id,
    version: 1,
    ...APPROVED_STAMPS,
    content: over.content ?? internalSnapshotContent(),
    ...over.snapshot,
  });
  const publication = fakes.publications.seed({
    id: `pub-${counter}`,
    case_study_id: study.id,
    surface_key: 'enterprise',
    status: 'published',
    published_snapshot_id: snapshot.id,
    featured: true,
    featured_rank: 1,
    surface_title_override: null,
    surface_summary_override: null,
    published_at: new Date('2026-08-22T10:00:00.000Z'),
    created_at: new Date('2026-08-20T10:00:00.000Z'),
    updated_at: new Date('2026-08-22T10:00:00.000Z'),
    ...over.publication,
  });
  return { study, publication, snapshot };
}
