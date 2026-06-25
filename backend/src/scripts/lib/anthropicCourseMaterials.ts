/**
 * Pure, idempotent decision logic for wiring course-link materials into a
 * LiveSession's materials_json. Extracted from wireWeek1AnthropicCourses.ts so the
 * dedup/merge behavior is unit-testable without a database (idempotency is a
 * NON-NEGOTIABLE repo invariant — a backfill must be safe to re-run).
 */

export interface CourseMaterial {
  title: string;
  type: string;
  url: string;
}

/**
 * Given the existing materials_json (any shape — Sequelize hands back `any`) and the
 * courses to ensure are present, return the items to add (those whose title is not
 * already present) and the resulting next array (toAdd prepended to existing).
 *
 * Idempotent: feeding the returned `next` back in as `existingRaw` yields toAdd = [].
 * Non-array input (null/undefined/object) is treated as "no existing materials".
 */
export function computeMaterialsUpdate(
  existingRaw: unknown,
  courses: CourseMaterial[]
): { toAdd: CourseMaterial[]; next: CourseMaterial[] } {
  const existing: CourseMaterial[] = Array.isArray(existingRaw)
    ? (existingRaw as CourseMaterial[])
    : [];
  const existingTitles = new Set(existing.map((m) => m && m.title));
  const toAdd = courses.filter((c) => !existingTitles.has(c.title));
  return { toAdd, next: [...toAdd, ...existing] };
}
