/**
 * Remove EVERY row a test enrollment left behind, in any table, not a hand-picked list (CH9.9 attempt 2).
 *
 * Visiting the portal as a member makes the backend write rows the test never asked for (campus
 * presence, room visits, student level, a community profile...). A cleanup that names tables misses
 * the next one somebody adds. This finds every public table with an `enrollment_id` column and
 * deletes the test enrollment's rows there; the caller then deletes the enrollment itself.
 *
 * `countLeft` is the honest after-check: the same tables, counted, plus the enrollments row.
 * LOCAL TEST DATABASES ONLY: callers have already refused anything that is not localhost.
 */
async function enrollmentTables(db) {
  const rows = (await db.query(`SELECT c.table_name::text AS t FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'enrollment_id' AND t.table_type = 'BASE TABLE' ORDER BY 1`)).rows;
  return rows.map((r) => r.t);
}

/** Delete the enrollment's rows everywhere, children first by retrying what a foreign key blocked. */
async function sweepEnrollment(db, enrollmentId, problems) {
  let pending = await enrollmentTables(db);
  for (let pass = 0; pass < 4 && pending.length; pass += 1) {
    const blocked = [];
    for (const t of pending) {
      try {
        await db.query(`DELETE FROM "${t}" WHERE enrollment_id = $1`, [enrollmentId]); // eslint-disable-line no-await-in-loop
      } catch (e) {
        blocked.push(t);
        if (pass === 3) problems.push(`${t}: ${e.message}`);
      }
    }
    pending = blocked;
  }
  try { await db.query('DELETE FROM enrollments WHERE id = $1', [enrollmentId]); } catch (e) { problems.push(`enrollments: ${e.message}`); }
}

/** "table n" for every table still holding a row for the enrollment (and the enrollment itself). */
async function countLeft(db, enrollmentId) {
  const left = [];
  for (const t of await enrollmentTables(db)) {
    const n = Number((await db.query(`SELECT count(*) AS n FROM "${t}" WHERE enrollment_id = $1`, [enrollmentId])).rows[0].n); // eslint-disable-line no-await-in-loop
    if (n > 0) left.push(`${t} ${n}`);
  }
  const e = Number((await db.query('SELECT count(*) AS n FROM enrollments WHERE id = $1', [enrollmentId])).rows[0].n);
  if (e > 0) left.push(`enrollments ${e}`);
  return left;
}

module.exports = { enrollmentTables, sweepEnrollment, countLeft };
