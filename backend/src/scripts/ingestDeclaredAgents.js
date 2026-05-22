/**
 * ingestDeclaredAgents — scan the repo for SERVES_CAPABILITY-tagged agents
 * and upsert `capability_agent_maps` rows for the target project.
 *
 * This is D2 of the agent-discovery rebuild (2026-05-22). It runs alongside
 * the existing LLM attribution pipeline rather than replacing it, so any
 * agent without declared metadata still goes through the legacy path.
 *
 * Convention: agent files export `SERVES_CAPABILITY` (string) or
 * `SERVES_CAPABILITIES` (array). See `backend/src/intelligence/agents/agentMetadata.ts`.
 *
 * Run (inside prod backend container, has DATABASE_URL and the deployed
 * repo state at /app):
 *
 *   ssh root@95.216.199.47 'docker exec -i -w /app accelerator-backend \
 *     env TARGET_PROJECT_ID=<uuid> DRY_RUN=1 node' \
 *     < backend/src/scripts/ingestDeclaredAgents.js
 *
 * Env:
 *   TARGET_PROJECT_ID  — required; capability lookup is scoped here.
 *   DRY_RUN=1          — preview without writing.
 *   SCAN_ROOT          — defaults to `backend/src` (inside /app).
 *   LINKED_BY_TAG      — defaults to `declared-2026-05-22`.
 *
 * Idempotency: re-running is safe. Existing maps are upserted (status flipped
 * to 'active' if previously disabled); rows whose file removed the metadata
 * are NOT auto-disabled (operator decision).
 *
 * Output: human-readable summary + one `RESULT_JSON:{...}` line on stdout.
 */
const fs = require('fs');
const path = require('path');
const { Sequelize, QueryTypes } = require('sequelize');

const TARGET_PROJECT_ID = process.env.TARGET_PROJECT_ID;
const DRY_RUN = process.env.DRY_RUN === '1' || process.argv.includes('--dry-run');
// Default SCAN_ROOT depends on context: inside the prod container the source
// is compiled to /app/dist; running locally against the repo the source is
// at backend/src. Caller can override either way via env.
const SCAN_ROOT = process.env.SCAN_ROOT
  || (require('fs').existsSync('dist') ? 'dist' : 'backend/src');
const LINKED_BY_TAG = process.env.LINKED_BY_TAG || 'declared-2026-05-22';

if (!TARGET_PROJECT_ID) {
  console.error('FATAL: TARGET_PROJECT_ID required (uuid of the project to ingest into)');
  process.exit(1);
}

// Regex extracts the value of an exported string constant. Handles:
//   export const SERVES_CAPABILITY = 'Lead Scoring';                 (TS source)
//   export const SERVES_CAPABILITY: AgentCapabilityRef = "Lead Scoring"; (TS w/ annotation)
//   exports.SERVES_CAPABILITY = 'Lead Scoring';                       (compiled CJS)
//
// Anchored to start-of-line (with /m) + optional whitespace, so JSDoc
// example lines like ` *   export const SERVES_CAPABILITY = ...` inside
// comments do NOT match — the `*` prefix on a comment line is not
// whitespace and breaks the anchor.
const STRING_CONST_RE = (name) =>
  new RegExp(
    `^[ \\t]*(?:export\\s+const\\s+|exports\\.)${name}\\s*(?::[^=]+)?\\s*=\\s*['"\`]([^'"\`]+)['"\`]`,
    'm',
  );

// Extracts an exported array of string literals. Handles all three forms above.
const ARRAY_CONST_RE = (name) =>
  new RegExp(
    `^[ \\t]*(?:export\\s+const\\s+|exports\\.)${name}\\s*(?::[^=]+)?\\s*=\\s*\\[([^\\]]+)\\]`,
    'm',
  );

function extractStrings(arrayBody) {
  const out = [];
  const re = /['"`]([^'"`]+)['"`]/g;
  let m;
  while ((m = re.exec(arrayBody)) !== null) out.push(m[1]);
  return out;
}

function walkDir(root, out = []) {
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    const p = path.join(root, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '__tests__' || e.name === '__mocks__' || e.name === '__snapshots__') continue;
      walkDir(p, out);
    } else if (/\.(ts|tsx|js|jsx)$/i.test(e.name) && !/\.(test|spec)\.(t|j)sx?$/i.test(e.name) && !/\.d\.ts$/i.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

function extractMetadata(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const result = { caps: [], role: null };
  // Single
  const single = src.match(STRING_CONST_RE('SERVES_CAPABILITY'));
  if (single) result.caps.push(single[1]);
  // Array
  const arr = src.match(ARRAY_CONST_RE('SERVES_CAPABILITIES'));
  if (arr) result.caps.push(...extractStrings(arr[1]));
  // Role
  const role = src.match(STRING_CONST_RE('AGENT_ROLE'));
  if (role) result.role = role[1];
  // Dedupe + drop empties
  result.caps = Array.from(new Set(result.caps.map(c => c.trim()).filter(Boolean)));
  return result;
}

function agentNameFrom(filePath) {
  // basename without extension — matches the existing capability_agent_maps.agent_name convention
  return path.basename(filePath).replace(/\.(tsx?|jsx?)$/i, '');
}

(async () => {
  const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

  // 1. Pull all capabilities for the target project (single round-trip).
  const caps = await sequelize.query(
    'SELECT id, name FROM capabilities WHERE project_id = :pid',
    { replacements: { pid: TARGET_PROJECT_ID }, type: QueryTypes.SELECT },
  );
  const capByLowerName = new Map(caps.map(c => [c.name.toLowerCase(), c]));
  console.log(`Loaded ${caps.length} capabilities for project ${TARGET_PROJECT_ID}`);

  // 2. Walk the repo for code files (inside container, cwd is /app).
  const files = walkDir(SCAN_ROOT);
  console.log(`Scanning ${files.length} code files under ${SCAN_ROOT}/`);

  // 3. Extract metadata + plan upserts.
  const found = []; // { file, agentName, capName, capId, role }
  const unmatched = []; // { file, capName }
  let withMetaCount = 0;
  for (const f of files) {
    let meta;
    try { meta = extractMetadata(f); }
    catch (e) { continue; }
    if (meta.caps.length === 0) continue;
    withMetaCount++;
    const agentName = agentNameFrom(f);
    for (const capName of meta.caps) {
      const cap = capByLowerName.get(capName.toLowerCase());
      if (cap) {
        found.push({ file: f, agentName, capName, capId: cap.id, role: meta.role });
      } else {
        unmatched.push({ file: f, capName });
      }
    }
  }
  console.log(`Files with declared metadata: ${withMetaCount}`);
  console.log(`Plan: ${found.length} upsert(s), ${unmatched.length} unmatched cap reference(s)`);

  if (unmatched.length > 0) {
    console.log('\nUnmatched references (no capability with this name in target project):');
    for (const u of unmatched) console.log(`  ${u.file}  → "${u.capName}"`);
  }

  if (DRY_RUN) {
    console.log('\n[DRY_RUN=1] No writes performed.');
    if (found.length > 0) {
      console.log('\nWould upsert:');
      for (const u of found) console.log(`  ${u.file}  → cap="${u.capName}" agent="${u.agentName}" role=${u.role || '<none>'}`);
    }
    console.log('\nRESULT_JSON:' + JSON.stringify({ withMetaCount, planned: found.length, unmatched: unmatched.length, dry_run: true }));
    await sequelize.close();
    return;
  }

  // 4. Upsert. The natural key is (capability_id, agent_name). When a row
  // already exists we flip status='active', stamp unlinked_at=NULL, refresh
  // linked_at, and append our tag to linked_by so the audit trail accumulates.
  let inserted = 0, reactivated = 0, updated = 0;
  for (const u of found) {
    const existing = await sequelize.query(
      'SELECT id, status, linked_by FROM capability_agent_maps WHERE capability_id = :cid AND agent_name = :name LIMIT 1',
      { replacements: { cid: u.capId, name: u.agentName }, type: QueryTypes.SELECT },
    );
    if (existing.length === 0) {
      await sequelize.query(
        `INSERT INTO capability_agent_maps (id, capability_id, agent_name, role, status, linked_by, linked_at, created_at, updated_at)
         VALUES (gen_random_uuid(), :cid, :name, :role, 'active', :tag, NOW(), NOW(), NOW())`,
        { replacements: { cid: u.capId, name: u.agentName, role: u.role, tag: LINKED_BY_TAG }, type: QueryTypes.INSERT },
      );
      inserted++;
    } else {
      const e = existing[0];
      const nextLinkedBy = (e.linked_by || '').includes(LINKED_BY_TAG)
        ? e.linked_by
        : `${e.linked_by || ''}${e.linked_by ? '+' : ''}${LINKED_BY_TAG}`;
      const wasDisabled = e.status !== 'active';
      await sequelize.query(
        `UPDATE capability_agent_maps
         SET status = 'active',
             unlinked_at = NULL,
             linked_at = NOW(),
             linked_by = :lb,
             role = COALESCE(:role, role),
             updated_at = NOW()
         WHERE id = :id`,
        { replacements: { id: e.id, lb: nextLinkedBy, role: u.role }, type: QueryTypes.UPDATE },
      );
      if (wasDisabled) reactivated++; else updated++;
    }
  }

  console.log(`\nInserted:    ${inserted}`);
  console.log(`Reactivated: ${reactivated}  (rows previously status!=active)`);
  console.log(`Updated:     ${updated}      (already active; refreshed linked_by + role)`);

  console.log('\nRESULT_JSON:' + JSON.stringify({
    withMetaCount,
    planned: found.length,
    inserted,
    reactivated,
    updated,
    unmatched: unmatched.length,
  }));

  await sequelize.close();
})().catch(e => { console.error(e); process.exit(1); });
