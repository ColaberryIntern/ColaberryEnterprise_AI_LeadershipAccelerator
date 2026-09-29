import { Op, type WhereOptions } from 'sequelize';

/**
 * The paging and brand-scoping rule shared by every Growth Journey admin read
 * (Phase 6, T607 — moved VERBATIM out of `performance/performanceReads.ts`,
 * which now imports it and re-exports the two caps).
 *
 * It lives in one file because it is ONE rule. T606 shipped it for three reads;
 * T607 adds seven more, and four copies of `Math.min(Math.max(1, …), MAX_PAGE)`
 * is four places for the cap to drift — the same failure the metric registry
 * exists to prevent, one layer down. `MAX_PAGE` is the number an admin screen
 * can never page past, and there is exactly one of it.
 *
 * `T606`'s suite still pins the behaviour (limit 0 / 1 / 100 / 101 / 10000 /
 * -5 / 25.9 and offset -3 / 7.9 through the reads that import this), so the
 * move is characterised rather than asserted.
 */

export const MAX_PAGE = 100;
export const DEFAULT_PAGE = 25;

export interface ReadScope {
  brandIds: readonly string[];
  programId?: string | null;
  limit?: number;
  offset?: number;
}

export interface Page<T> {
  rows: T[];
  total: number;
  limit: number;
  offset: number;
}

export const emptyPage = <T>(limit: number, offset: number): Page<T> => ({ rows: [], total: 0, limit, offset });

export function paging(scope: ReadScope): { limit: number; offset: number } {
  const limit = Math.min(Math.max(1, Math.floor(scope.limit ?? DEFAULT_PAGE)), MAX_PAGE);
  const offset = Math.max(0, Math.floor(scope.offset ?? 0));
  return { limit, offset };
}

/**
 * The brand clause on its own, for the tables that have no `program_id`
 * (score snapshots, offer policies, queue policies, conversation ownership).
 */
export function brandWhere(brandIds: readonly string[]): Record<string, unknown> {
  return { brand_id: { [Op.in]: [...brandIds] } };
}

/** The brand clause plus an optional programme, for the tables that carry one. */
export function scopeWhere(scope: ReadScope): WhereOptions {
  const where = brandWhere(scope.brandIds);
  if (scope.programId) where.program_id = scope.programId;
  return where;
}
