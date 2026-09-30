/**
 * Database side of the walkthrough — reads and the two deliberate mutations the
 * script needs (expiring a mock, demoting one question to draft, seeding a
 * pending evidence row). Everything runs against accelerator_cert_dev through
 * the container's own psql; the database NAME is asserted before any write, for
 * the same reason the dev scripts do it: NODE_ENV and hostnames would not have
 * protected anything here.
 */
const { execFileSync } = require('child_process');

const DB = 'accelerator_cert_dev';

function psql(sql) {
  return execFileSync(
    'docker',
    ['exec', 'accelerator-db', 'psql', '-U', 'accelerator', '-d', DB, '-tAF', '', '-c', sql],
    { encoding: 'utf8' },
  ).trim();
}

function rows(sql, cols) {
  const out = psql(sql);
  if (!out) return [];
  return out.split('\n').map((line) => {
    const parts = line.split('');
    return Object.fromEntries(cols.map((c, i) => [c, parts[i]]));
  });
}

// Refuse to touch anything unless this really is the isolated database.
const actual = psql('select current_database()');
if (actual !== DB) {
  throw new Error(`[walkthrough] refusing to run: connected to "${actual}", expected "${DB}"`);
}

exports.pointsLedger = () =>
  rows(
    `select event_type, count(*)::text, coalesce(sum(points),0)::text
       from student_points_events group by 1 order by 1`,
    ['event_type', 'n', 'points'],
  );

exports.expireLatestMock = () => {
  const out = psql(
    `update cert_sessions set expires_at = now() - interval '5 minutes'
      where mode = 'mock' and status = 'in_progress' returning id`,
  );
  return out ? out.split('\n').length : 0;
};

exports.demoteOneQuestion = () => {
  const out = psql(
    `update cert_question_revisions set review_status = 'draft', reviewer = null, reviewed_at = null
       where (question_key, revision) = (
         select question_key, revision from cert_question_revisions
          where review_status = 'approved' order by question_key limit 1)
     returning question_key`,
  );
  return out.split('\n')[0] || null;
};

exports.reviewerFor = (key) => {
  const [row] = rows(
    `select reviewer, review_status from cert_question_revisions
      where question_key = '${key}' order by revision desc limit 1`,
    ['reviewer', 'review_status'],
  );
  return row || {};
};

exports.seedPendingEvidence = () => {
  const out = psql(`
    insert into cert_evidence_mappings
      (id, enrollment_id, track_id, blueprint_version, domain_id, objective_id,
       source_type, source_id, mapping_state, mapping_rationale, auto_matched,
       created_at, updated_at)
    select gen_random_uuid(), e.id, 'ccar-f', '1.0-2026-07', 'D2', 'D2.1',
           'portfolio_artifact', 'walkthrough-artifact-1', 'pending',
           'An MCP server the student built and shipped.', true, now(), now()
      from enrollments e where e.email = 'cert-dev@colaberry.test'
    returning id`);
  return out.split('\n')[0] || null;
};

exports.mappingState = (id) => {
  const [row] = rows(
    `select mapping_state, verified_by, coalesce(rejected_reason,'') from cert_evidence_mappings where id = '${id}'`,
    ['mapping_state', 'verified_by', 'rejected_reason'],
  );
  return row || {};
};
