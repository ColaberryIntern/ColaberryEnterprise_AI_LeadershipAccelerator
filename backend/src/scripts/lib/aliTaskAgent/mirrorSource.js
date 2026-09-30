/**
 * mirrorSource — reads Ali's assigned + active todos from the ops_bc_todos
 * mirror (the read-model bcSyncService refreshes every 2 minutes).
 *
 * This is the fast, scalable queue source. A single indexed query returns every
 * assigned todo, already carrying the priority engine's `urgency_score`, instead
 * of the 66-project Basecamp API sweep (which times out and hits rate limits).
 * Dismissed todos are excluded at the source.
 *
 * Runs where the Postgres mirror is reachable (the compose network / backend
 * container). `DATABASE_URL` is the standard connection string; callers outside
 * that network (e.g. a host-side dry run) should feed rows in directly and use
 * queueBuilder.buildQueueFromRows instead.
 */
const path = require('path');

function loadPg() {
  try { return require('pg'); }
  catch { return require(path.resolve(__dirname, '../../../../../node_modules/pg')); }
}

const ROWS_QUERY = `
  SELECT t.bc_id, t.project_id, t.todolist_id, t.todolist_name, t.title, t.description,
         t.due_on::text AS due_on, t.bc_app_url, t.urgency_score, t.bc_updated_at,
         p.name AS project_name
  FROM ops_bc_todos t
  LEFT JOIN ops_bc_projects p ON p.bc_id = t.project_id
  WHERE t.assignee_ids @> $1::jsonb
    AND t.status = 'active'
    AND (t.is_dismissed IS FALSE OR t.is_dismissed IS NULL)
`;

/**
 * @param {object} [opts]
 * @param {number} [opts.aliId]
 * @param {string} [opts.connectionString] defaults to process.env.DATABASE_URL
 * @returns {Promise<Array<object>>} ops_bc_todos rows (+ project_name)
 */
async function fetchAssignedActiveRows(opts = {}) {
  const aliId = Number(opts.aliId || process.env.ALI_BC_USER_ID || 17454835);
  const connectionString = opts.connectionString || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('mirrorSource: DATABASE_URL not set');
  const { Client } = loadPg();
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const r = await client.query(ROWS_QUERY, [JSON.stringify([String(aliId)])]);
    return r.rows;
  } finally {
    await client.end();
  }
}

module.exports = { fetchAssignedActiveRows, ROWS_QUERY };
