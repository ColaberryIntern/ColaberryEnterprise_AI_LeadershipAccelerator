/**
 * Report the gov solicitations that were uploaded more than once, each one now carrying two or more
 * unrelated pursuits.
 *
 * Written after the Crash Records build went missing from the admin page (2026-11-07). Each upload of a
 * solicitation ZIP mints its own `gws:<uuid>` workspace and its own qualification thread, and nothing ever
 * compares a new upload against the ones already there — not even by checksum, which is stored. The first run
 * of this audit found four solicitations entered twice or three times, two of them approved and BUILT twice.
 * Who asked: Ali, as the durable half of "settle the duplicate pursuit".
 *
 * STRICTLY READ-ONLY. Every statement is a SELECT inside a READ ONLY session, so it is safe to run against
 * production as often as you like. It nominates the member that looks like the real pursuit and says nothing
 * about retiring the others: `decision` has no 'duplicate' value, so that call belongs to a person.
 *
 * Run: `node backend/src/scripts/auditGovDuplicatePursuits.js [--json] [--only <verdict>]`
 *
 * Flags:
 *   --json              machine-readable output
 *   --only <verdict>    duplicate_built_twice | duplicate_one_built | duplicate_none_built
 *
 * Output: a group per duplicated solicitation to stdout. Writes nothing, anywhere.
 */

const path = require('path');
try { require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); } catch (_) { /* container has real env */ }

const { Client } = require('pg');
const { groupDuplicatePursuits } = require('./lib/govPursuitDuplicates');

// One statement. The lateral keeps the join one-to-one: a qualification key has exactly one thread head, and a
// plain LEFT JOIN would silently multiply a bundle row if that ever stopped being true.
const AUDIT_SQL = `
  SELECT b.qualification_key,
         b.sha256,
         b.filename,
         b.created_at AS uploaded_at,
         q.decision,
         q.status,
         q.delivery_project_id,
         COALESCE(q.requirements_json -> 'provenance' ->> 'title',
                  q.source_snapshot ->> 'title',
                  q.source_snapshot -> 'opportunity' ->> 'title') AS title
    FROM gov_source_bundles b
    LEFT JOIN LATERAL (
      SELECT gq.decision, gq.status, gq.delivery_project_id, gq.requirements_json, gq.source_snapshot
        FROM gov_qualifications gq
       WHERE gq.canonical_opportunity_id = b.qualification_key
         AND gq.status = 'active'
         AND gq.superseded_by_id IS NULL
       ORDER BY gq.updated_at DESC
       LIMIT 1
    ) q ON TRUE
   ORDER BY b.created_at
`;

function flag(name) { return process.argv.includes(`--${name}`); }
function value(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}

async function loadBundles() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    const err = new Error('DATABASE_URL is not set. Run this inside the backend container.');
    err.error_class = 'ConfigError';
    throw err;
  }
  const db = new Client({ connectionString, statement_timeout: 30000 });
  await db.connect();
  try {
    // Belt and braces on the read-only promise: Postgres itself will reject a write in this session, including
    // one added by a careless future edit. SESSION CHARACTERISTICS, not SET TRANSACTION — node-postgres sends
    // each query as its own implicit transaction, so a bare SET TRANSACTION would enforce nothing after it.
    await db.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
    const { rows } = await db.query(AUDIT_SQL);
    return rows.map((r) => ({
      qualificationKey: r.qualification_key,
      sha256: r.sha256,
      filename: r.filename,
      uploadedAt: r.uploaded_at ? new Date(r.uploaded_at).toISOString() : null,
      decision: r.decision,
      status: r.status,
      deliveryProjectId: r.delivery_project_id,
      built: !!r.delivery_project_id,
      title: r.title,
    }));
  } finally {
    await db.end();
  }
}

const VERDICT_LABEL = {
  duplicate_built_twice: 'BUILT TWICE  — one solicitation, two separate builds',
  duplicate_one_built: 'ONE BUILT    — the others are unworked copies',
  duplicate_none_built: 'NONE BUILT   — copies sitting in the funnel',
};

function printGroup(group, index) {
  console.log('');
  console.log(`[${index + 1}] ${VERDICT_LABEL[group.verdict] ?? group.verdict}`);
  for (const m of group.members) {
    const marker = m === group.primary ? '  ->' : '    ';
    const state = [m.decision ?? 'no qualification', m.built ? 'built' : 'no build'].join(', ');
    console.log(`${marker} ${m.qualificationKey}  (${state})`);
    console.log(`       title:    ${m.title ?? '(none on the record)'}`);
    console.log(`       uploaded: ${m.uploadedAt ?? '?'}   file: ${m.filename ?? '?'}`);
    if (m.deliveryProjectId) console.log(`       delivery: ${m.deliveryProjectId}`);
  }
  console.log(`     matched on: ${group.signals.join(', ')}`);
}

(async () => {
  const asJson = flag('json');
  const only = (value('only') || '').toLowerCase();
  const bundles = await loadBundles();
  let groups = groupDuplicatePursuits(bundles);
  if (only) groups = groups.filter((g) => g.verdict === only);

  if (asJson) {
    console.log(JSON.stringify({ scannedUploads: bundles.length, groups }, null, 2));
    return;
  }

  console.log(`Scanned ${bundles.length} solicitation uploads.`);
  if (groups.length === 0) {
    console.log('No solicitation appears under more than one pursuit.');
    return;
  }
  const extraPursuits = groups.reduce((n, g) => n + (new Set(g.members.map((m) => m.qualificationKey)).size - 1), 0);
  console.log(`${groups.length} solicitation(s) entered more than once; ${extraPursuits} pursuit(s) beyond the first.`);
  console.log('The arrow marks the member that looks like the real pursuit (built, else approved, else earliest).');
  groups.forEach(printGroup);
  console.log('');
  console.log('Nothing was changed. There is no "duplicate" decision value, so retiring a copy is a human call.');
})().catch((e) => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend',
    event: 'gov_duplicate_pursuit_audit_failed', outcome: 'failure',
    error_class: e && (e.error_class || e.name) ? (e.error_class || e.name) : 'Error',
    context: { message: e && e.message ? e.message : String(e) },
  }));
  process.exit(1);
});
