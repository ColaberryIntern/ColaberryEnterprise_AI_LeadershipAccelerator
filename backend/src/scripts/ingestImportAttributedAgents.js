/**
 * ingestImportAttributedAgents — D3 of the agent-discovery rebuild.
 *
 * Walks the agent universe (.ts/.js files under **/agents/** or
 * **/intelligence/**, excluding tests/.d.ts/node_modules/__mocks__),
 * resolves each file's relative imports, matches them against
 * `capabilities.linked_backend_services`, scores the resulting
 * attributions, and upserts `capability_agent_maps` rows for any cap
 * exceeding MIN_SCORE.
 *
 * Skips agents that already have an active `capability_agent_maps` row
 * for the target project — D1 (LLM) and D2 (declared SERVES_CAPABILITY)
 * win. D3 only fills the gap.
 *
 * Run (inside prod backend container, has DATABASE_URL + /app/dist source):
 *   ssh root@95.216.199.47 'docker exec -i -w /app accelerator-backend \
 *     env TARGET_PROJECT_ID=<uuid> DRY_RUN=1 node' \
 *     < backend/src/scripts/ingestImportAttributedAgents.js
 *
 * Env:
 *   TARGET_PROJECT_ID  — required
 *   DRY_RUN=1          — preview without writing
 *   MIN_SCORE          — defaults to 2 (≥2 matched imports OR 1 match + name-stem boost)
 *   SCAN_ROOT          — defaults to `dist` inside container, `backend/src` locally
 *   LINKED_BY_TAG      — defaults to `import-graph-2026-05-26`
 *   VERBOSE=1          — print per-agent attribution detail
 *
 * Output: human-readable summary + `RESULT_JSON:{...}` line on stdout.
 */
const fs = require('fs');
const path = require('path');
const { Sequelize, QueryTypes } = require('sequelize');

// Bring in the attributor module from compiled dist (if running inside the
// container) or via ts-node if invoked locally. The container path is the
// common case — keep it simple and require the .js form.
let attributor;
try {
  attributor = require('/app/dist/intelligence/graph/agentImportAttributor.js');
} catch {
  try {
    attributor = require(path.resolve('backend/src/intelligence/graph/agentImportAttributor'));
  } catch (e) {
    console.error('FATAL: cannot load agentImportAttributor module:', e.message);
    process.exit(1);
  }
}
const { extractImports, resolveImport, attributeAgent, toSourcePath } = attributor;

// ─── config ───────────────────────────────────────────────────────────────
const TARGET_PROJECT_ID = process.env.TARGET_PROJECT_ID;
const DRY_RUN = process.env.DRY_RUN === '1' || process.argv.includes('--dry-run');
const MIN_SCORE = Number(process.env.MIN_SCORE || 2);
const VERBOSE = process.env.VERBOSE === '1';
const SCAN_ROOT = process.env.SCAN_ROOT
  || (fs.existsSync('dist') ? 'dist' : 'backend/src');
const LINKED_BY_TAG = process.env.LINKED_BY_TAG || 'import-graph-2026-05-26';

if (!TARGET_PROJECT_ID) {
  console.error('FATAL: TARGET_PROJECT_ID required');
  process.exit(1);
}

// ─── helpers ──────────────────────────────────────────────────────────────

// Walk file tree. Return list of .ts/.tsx/.js/.jsx files under the agent
// universe (paths containing /agents/ or /intelligence/), excluding tests
// and declaration files. Same shape as the D1c tightened classifier.
function walkAgentFiles(root, out = []) {
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    const p = path.join(root, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '__tests__', '__mocks__', '__snapshots__', 'tests'].includes(e.name)) continue;
      walkAgentFiles(p, out);
    } else if (/\.(ts|tsx|js|jsx)$/i.test(e.name)
        && !/\.(test|spec)\.(t|j)sx?$/i.test(e.name)
        && !/\.d\.ts$/i.test(e.name)) {
      const lower = p.replace(/\\/g, '/').toLowerCase();
      if (lower.includes('/agents/') || lower.includes('/intelligence/')) {
        // Path-pattern AND filename agent gate (matches D1c classifier rules)
        out.push(p);
      }
    }
  }
  return out;
}

function agentNameFromFile(filePath) {
  return path.basename(filePath).replace(/\.(tsx?|jsx?)$/i, '');
}

function hasDeclaredCapability(filePath) {
  // Matches D2's SERVES_CAPABILITY / SERVES_CAPABILITIES — skip those here.
  try {
    const src = fs.readFileSync(filePath, 'utf8');
    return /^[ \t]*(?:export\s+const\s+|exports\.)SERVES_CAPABILIT(?:Y|IES)\s*(?::[^=]+)?\s*=/m.test(src);
  } catch { return false; }
}

// ─── main ─────────────────────────────────────────────────────────────────
(async () => {
  const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

  // 1. Load all capabilities + their linked_backend_services, build the file map.
  const caps = await sequelize.query(
    `SELECT id, name, linked_backend_services
     FROM capabilities
     WHERE project_id = :pid`,
    { replacements: { pid: TARGET_PROJECT_ID }, type: QueryTypes.SELECT },
  );
  const capFileMap = new Map();
  let totalFileRefs = 0;
  for (const c of caps) {
    const files = Array.isArray(c.linked_backend_services) ? c.linked_backend_services : [];
    for (const rawFile of files) {
      const normalized = toSourcePath(String(rawFile));
      totalFileRefs++;
      let arr = capFileMap.get(normalized);
      if (!arr) { arr = []; capFileMap.set(normalized, arr); }
      arr.push({ capId: c.id, capName: c.name });
    }
  }
  console.log(`Loaded ${caps.length} caps, ${totalFileRefs} file refs → map of ${capFileMap.size} distinct files`);

  // 2. Load existing active maps so we can skip agents already attributed.
  const existing = await sequelize.query(
    `SELECT cam.agent_name, cam.capability_id
     FROM capability_agent_maps cam
     JOIN capabilities c ON c.id = cam.capability_id
     WHERE c.project_id = :pid AND cam.status = 'active'`,
    { replacements: { pid: TARGET_PROJECT_ID }, type: QueryTypes.SELECT },
  );
  const existingPairs = new Set(existing.map(r => `${r.capability_id}::${r.agent_name}`));
  const agentsAlreadyMapped = new Set(existing.map(r => r.agent_name));
  console.log(`Existing active maps: ${existing.length} (${agentsAlreadyMapped.size} distinct agents)`);

  // 3. Walk the agent universe.
  const files = walkAgentFiles(SCAN_ROOT);
  console.log(`Found ${files.length} candidate agent files under ${SCAN_ROOT}/`);

  // 4. Score each. Skip declared agents (D2) and already-mapped agents.
  const attributions = []; // { agentName, sourceFile, capId, capName, score, evidence, nameStemBoost }
  let scanned = 0, skippedDeclared = 0, skippedAlreadyMapped = 0, noMatch = 0, scored = 0;
  for (const f of files) {
    scanned++;
    if (hasDeclaredCapability(f)) { skippedDeclared++; continue; }
    const agentName = agentNameFromFile(f);
    if (agentsAlreadyMapped.has(agentName)) { skippedAlreadyMapped++; continue; }
    const matches = attributeAgent(f, capFileMap);
    if (matches.length === 0) { noMatch++; continue; }
    const qualifying = matches.filter(m => m.score >= MIN_SCORE);
    if (qualifying.length === 0) { noMatch++; continue; }
    scored++;
    for (const m of qualifying) {
      attributions.push({
        agentName, sourceFile: f,
        capId: m.capId, capName: m.capName,
        score: m.score, evidence: m.evidence, nameStemBoost: m.nameStemBoost,
      });
    }
  }

  console.log('');
  console.log('=== Scan results ===');
  console.log(`Scanned:                     ${scanned}`);
  console.log(`Skipped (declared D2):       ${skippedDeclared}`);
  console.log(`Skipped (already mapped):    ${skippedAlreadyMapped}`);
  console.log(`No qualifying matches:       ${noMatch}`);
  console.log(`Agents with attributions:    ${scored}`);
  console.log(`Total attributions planned:  ${attributions.length}  (MIN_SCORE=${MIN_SCORE})`);

  if (VERBOSE && attributions.length > 0) {
    console.log('');
    console.log('=== Attributions ===');
    // Group by agent for readability.
    const byAgent = new Map();
    for (const a of attributions) {
      if (!byAgent.has(a.agentName)) byAgent.set(a.agentName, []);
      byAgent.get(a.agentName).push(a);
    }
    for (const [agent, atts] of byAgent.entries()) {
      console.log(`\n  ${agent}`);
      for (const a of atts) {
        const boost = a.nameStemBoost ? ' [stem]' : '';
        console.log(`    → "${a.capName}"  score=${a.score}${boost}  evidence=${a.evidence.length} files`);
        if (a.evidence.length <= 4) {
          for (const e of a.evidence) console.log(`        - ${e}`);
        } else {
          for (const e of a.evidence.slice(0, 3)) console.log(`        - ${e}`);
          console.log(`        - ... +${a.evidence.length - 3} more`);
        }
      }
    }
  }

  if (DRY_RUN) {
    console.log('\n[DRY_RUN=1] No writes performed.');
    console.log('RESULT_JSON:' + JSON.stringify({
      scanned, skippedDeclared, skippedAlreadyMapped, noMatch, scored,
      attributions: attributions.length, dry_run: true, min_score: MIN_SCORE,
    }));
    await sequelize.close();
    return;
  }

  // 5. Upsert. Same shape as D2's ingester. Tag linked_by with the D3 marker.
  let inserted = 0, reactivated = 0, updated = 0;
  for (const a of attributions) {
    const key = `${a.capId}::${a.agentName}`;
    if (existingPairs.has(key)) continue; // belt and suspenders — shouldn't hit since we skip already-mapped agents

    const existRow = await sequelize.query(
      `SELECT id, status, linked_by FROM capability_agent_maps
       WHERE capability_id = :cid AND agent_name = :name LIMIT 1`,
      { replacements: { cid: a.capId, name: a.agentName }, type: QueryTypes.SELECT },
    );
    if (existRow.length === 0) {
      await sequelize.query(
        `INSERT INTO capability_agent_maps
         (id, capability_id, agent_name, role, status, linked_by, linked_at, created_at, updated_at)
         VALUES (gen_random_uuid(), :cid, :name, NULL, 'active', :tag, NOW(), NOW(), NOW())`,
        { replacements: { cid: a.capId, name: a.agentName, tag: LINKED_BY_TAG }, type: QueryTypes.INSERT },
      );
      inserted++;
    } else {
      const e = existRow[0];
      const nextLinkedBy = (e.linked_by || '').includes(LINKED_BY_TAG)
        ? e.linked_by
        : `${e.linked_by || ''}${e.linked_by ? '+' : ''}${LINKED_BY_TAG}`;
      const wasDisabled = e.status !== 'active';
      await sequelize.query(
        `UPDATE capability_agent_maps
         SET status = 'active', unlinked_at = NULL, linked_at = NOW(),
             linked_by = :lb, updated_at = NOW()
         WHERE id = :id`,
        { replacements: { id: e.id, lb: nextLinkedBy }, type: QueryTypes.UPDATE },
      );
      if (wasDisabled) reactivated++; else updated++;
    }
  }

  console.log('');
  console.log(`Inserted:    ${inserted}`);
  console.log(`Reactivated: ${reactivated}`);
  console.log(`Updated:     ${updated}`);

  console.log('\nRESULT_JSON:' + JSON.stringify({
    scanned, skippedDeclared, skippedAlreadyMapped, noMatch, scored,
    attributions: attributions.length, inserted, reactivated, updated,
    min_score: MIN_SCORE,
  }));

  await sequelize.close();
})().catch(e => { console.error(e); process.exit(1); });
