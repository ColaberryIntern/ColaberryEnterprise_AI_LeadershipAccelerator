#!/usr/bin/env node
/**
 * Close a requirement by linking it to a docs/source artifact.
 *
 * Usage:
 *   node scripts/closeRequirement.js \
 *     --req REQ-085 \
 *     --name "JWT Authentication Reference" \
 *     --type document \
 *     --path docs/spec/access-control-and-auth.md \
 *     --action-id <uuid>
 *
 * Optional:
 *   --description "..."   Extra detail stored on the artifact_definitions row
 *   --extra-path X        Additional file path appended to github_file_paths
 *
 * Behavior:
 *   1. INSERTs an artifact_definitions row (over psql on prod) and captures id.
 *   2. UPDATEs requirements_maps for the REQ: status=matched, github_file_paths
 *      union [path, extra-paths], source_artifact_id=new_id.
 *   3. POSTs a BuildManifest to /api/portal/project/telemetry declaring the
 *      file (if a docs file was just created) + database_changes + impacts.
 *   4. POSTs /next-action/complete for the supplied --action-id.
 *
 * Idempotency: refuses to flip status if it is already 'matched' (caller
 * should pass --force to override). Always emits a manifest for audit.
 */
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const crypto = require('crypto');

const PROJECT_ID = 'fcce50ef-fe01-471d-a3ff-cd6948d092c2';
const VPS = 'root@95.216.199.47';
const PROD_BASE = 'https://enterprise.colaberry.ai';

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : null;
}
function flag(name) { return process.argv.includes(name); }

const REQ = arg('--req');
const NAME = arg('--name');
const TYPE = arg('--type') || 'document';
const PATH = arg('--path');
const DESC = arg('--description') || '';
const EXTRA = arg('--extra-path');
const ACTION_ID = arg('--action-id');
const FORCE = flag('--force');
const DRY = flag('--dry-run');

if (!REQ || !NAME || !PATH) {
  console.error('Usage: --req REQ-XXX --name "..." --path docs/x.md [--type document] [--description "..."] [--extra-path Y] [--action-id UUID] [--force] [--dry-run]');
  process.exit(2);
}

const TOKEN = fs.readFileSync(path.join(__dirname, '.ali_jwt.txt'), 'utf8').trim();

function psql(sql) {
  // Write SQL to a local temp file, scp to the VPS, run via psql -f, capture stdout.
  // This sidesteps all bash-quoting hell from nested single quotes in the SQL.
  if (DRY) { console.log('[dry-run] psql:', sql); return ''; }
  const localTmp = path.join(require('os').tmpdir(), `closereq_${Date.now()}_${Math.random().toString(36).slice(2)}.sql`);
  fs.writeFileSync(localTmp, sql);
  const remoteTmp = `/tmp/${path.basename(localTmp)}`;
  try {
    execSync(`scp -q "${localTmp}" ${VPS}:${remoteTmp}`, { stdio: ['pipe','pipe','pipe'] });
    const out = execSync(
      `ssh ${VPS} "docker cp ${remoteTmp} accelerator-db:${remoteTmp} && docker exec accelerator-db psql -U accelerator -d accelerator_prod -t -A -F '|' -f ${remoteTmp} && rm -f ${remoteTmp}"`,
      { encoding: 'utf8' }
    );
    // Strip the noisy collation-mismatch WARNING psql prepends to every call
    return out
      .split('\n')
      .filter(l => !/^(WARNING|DETAIL|HINT)/.test(l))
      .join('\n')
      .trim();
  } finally {
    try { fs.unlinkSync(localTmp); } catch {}
  }
}

async function postJson(urlPath, body) {
  if (DRY) { console.log('[dry-run] POST', urlPath, JSON.stringify(body).slice(0, 200)); return {}; }
  const res = await fetch(PROD_BASE + urlPath, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed; try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  if (!res.ok) throw new Error(`POST ${urlPath} -> ${res.status}: ${text.slice(0, 400)}`);
  return parsed;
}

(async () => {
  // Step 1: confirm REQ exists + check current status
  const current = psql(
    `SELECT status, source_artifact_id FROM requirements_maps WHERE requirement_key = '${REQ}' AND project_id = '${PROJECT_ID}';`
  );
  console.log(`[${REQ}] current:`, current || '(not found)');
  if (!current) { console.error(`[${REQ}] not found in requirements_maps`); process.exit(3); }
  if (current.startsWith('matched|') && !FORCE) {
    console.log(`[${REQ}] already matched — skipping (use --force to override)`);
    process.exit(0);
  }

  // Step 2: insert ArtifactDefinition + update requirements_maps in one transaction
  const escName = NAME.replace(/'/g, "''");
  const escDesc = (DESC || `Documentation artifact closing ${REQ}.`).replace(/'/g, "''");
  const paths = [PATH, ...(EXTRA ? [EXTRA] : [])];
  const pathsJson = JSON.stringify(paths); // raw JSON; psql -f handles literal quotes fine

  const linkResult = psql(
    `WITH new_artifact AS (INSERT INTO artifact_definitions (id, name, description, artifact_type, github_file_path, requires_github_validation, artifact_role, created_at) VALUES (gen_random_uuid(), '${escName}', '${escDesc}', '${TYPE}', '${PATH}', false, 'output', NOW()) RETURNING id) UPDATE requirements_maps SET source_artifact_id = (SELECT id FROM new_artifact), github_file_paths = '${pathsJson}'::jsonb, status = 'matched', updated_at = NOW() WHERE requirement_key = '${REQ}' AND project_id = '${PROJECT_ID}' RETURNING source_artifact_id;`
  );
  // psql returns RETURNING rows then a status line like "UPDATE 1" — find the UUID
  const uuidLine = linkResult.split('\n').map(l => l.trim()).find(l => /^[0-9a-f-]{36}$/i.test(l));
  const artifactId = uuidLine || '(unknown)';
  console.log(`[${REQ}] linked to artifact ${artifactId}`);

  // Step 3: emit BuildManifest
  const taskId = crypto.randomUUID();
  const manifest = {
    manifest_version: '1.0',
    telemetry_version: '1.0',
    task_id: taskId,
    project_id: PROJECT_ID,
    execution_timestamp: new Date().toISOString(),
    files_created: fs.existsSync(path.join(__dirname, '..', PATH)) ? [PATH] : [],
    database_changes: [
      { table: 'artifact_definitions', operation: 'data_migration', details: `Inserted ArtifactDefinition id=${artifactId}, name='${NAME}', type=${TYPE}, github_file_path=${PATH}.` },
      { table: 'requirements_maps', operation: 'data_migration', details: `${REQ}: status unmatched->matched, github_file_paths set, source_artifact_id=${artifactId}.` },
    ],
    system_impacts: [
      { kind: 'increases_coverage', target_id: REQ, delta: 1 },
      { kind: 'increases_maturity', target_id: REQ },
    ],
    decision_trace: {
      approach: `Linked ${REQ} to existing/created artifact at ${PATH}.`,
      why_this_approach: DESC || 'Standard artifact-creation pattern.',
    },
  };

  const manifestRes = await postJson('/api/portal/project/telemetry', manifest);
  console.log(`[${REQ}] manifest ${manifestRes.manifest_id || '(none)'}`);

  // Step 4: complete the action (if provided)
  if (ACTION_ID) {
    const completeRes = await postJson('/api/portal/project/next-action/complete', {
      action_id: ACTION_ID,
      completion_evidence: `${REQ} linked to ArtifactDefinition ${artifactId} (${PATH}). Manifest ${manifestRes.manifest_id || 'n/a'}.`,
    });
    console.log(`[${REQ}] action ${ACTION_ID} completed (status=${(completeRes.action || {}).status})`);
  }

  console.log(`[${REQ}] DONE.`);
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
