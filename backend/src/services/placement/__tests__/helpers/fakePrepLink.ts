/**
 * CP8.3 test helper: an in-memory career_interviews that applies careerPrep/interviews.linkPlacementInterview's ONE
 * statement only as the SQL words it (the stand-in databases of the booking suites route that statement here):
 *   the conflict target must be the partial unique index `(placement_interview_id) WHERE placement_interview_id IS NOT NULL`
 *   (otherwise it throws, as Postgres would without a matching index); a second link for the same placement interview
 *   updates only the columns the DO UPDATE SET names, and only when its WHERE (the same learner) holds; LEFT(.., 120) cuts.
 * `failures` makes the next N statements throw (a database error), for the incomplete-then-swept path.
 */
export type PrepRow = { id: string; enrollment_id: string; source: string; company: string; role: string; type: string; starts_at: Date; placement_interview_id: string };
export interface PrepStore { rows: PrepRow[]; failures: number; statements: string[] }
export const prepStore = (): PrepStore => ({ rows: [], failures: 0, statements: [] });

export function prepLinkAnswer(store: PrepStore, sql: string, r: Record<string, unknown>): [unknown[], number] | null {
  if (!sql.includes('INSERT INTO career_interviews')) return null;
  store.statements.push(sql);
  if (store.failures > 0) { store.failures -= 1; throw Object.assign(new Error('career_interviews write failed'), { name: 'SequelizeDatabaseError' }); }
  if (!/ON CONFLICT \(placement_interview_id\) WHERE placement_interview_id IS NOT NULL/.test(sql)) {
    throw new Error('there is no unique or exclusion constraint matching the ON CONFLICT specification');
  }
  const cut = (col: string, v: unknown) => (new RegExp(`LEFT\\(:${col}, 120\\)`).test(sql) ? String(v).slice(0, 120) : String(v));
  const values = { company: cut('company', r.company), role: cut('role', r.role), type: String(r.type), starts_at: r.start as Date };
  const found = store.rows.find((x) => x.placement_interview_id === r.pid);
  if (!found) {
    const row: PrepRow = { id: `prep-${store.rows.length + 1}`, enrollment_id: String(r.e), source: /VALUES \(:e, 'real'/.test(sql) ? 'real' : '?', placement_interview_id: String(r.pid), ...values };
    store.rows.push(row);
    return [[{ id: row.id }], 1];
  }
  const set = /DO UPDATE SET ([\s\S]*?)(\s+WHERE [\s\S]*?)?\s+RETURNING/.exec(sql);
  if (!set) return [[], 0]; // DO NOTHING: no row returned
  if (/WHERE career_interviews\.enrollment_id = EXCLUDED\.enrollment_id/.test(set[2] ?? '') && found.enrollment_id !== String(r.e)) return [[], 0];
  for (const m of set[1].matchAll(/(\w+) = EXCLUDED\.(\w+)/g)) (found as Record<string, unknown>)[m[1]] = (values as Record<string, unknown>)[m[2]];
  return [[{ id: found.id }], 1];
}
