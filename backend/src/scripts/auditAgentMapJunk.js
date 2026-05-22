/**
 * auditAgentMapJunk — read-only audit of capability_agent_maps for non-agent rows.
 *
 * Surfaces rows whose agent_name looks like junk: markdown specs, Python files,
 * test files, JSON, or non-agent service names that slipped through the
 * brownfield discovery + LLM attribution pipeline. Used to scope the D1
 * cleanup that prefixes the agent-discovery rebuild.
 *
 * Per-project breakdown (so other tenants' data is visible but separable).
 *
 * Run (inside prod backend container, has DATABASE_URL):
 *   ssh root@95.216.199.47 'docker exec -i -w /app accelerator-backend node' < backend/src/scripts/auditAgentMapJunk.js
 *
 * Output: JSON line `AUDIT_JSON:[...]` on stdout + a human-readable summary.
 *
 * Pure read; never writes.
 */
const { Sequelize, QueryTypes } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

// Patterns that flag a row as junk. agent_name should be a TS class/file
// stem (e.g. "actionPlannerAgent", "CostOptimizationAgent"). Anything
// matching these is almost certainly not a real agent.
const JUNK_PATTERNS = [
  { kind: 'markdown-spec',  re: /\.md$/i,                 desc: '.md spec file (not code)' },
  { kind: 'python-file',    re: /\.py$/i,                 desc: '.py Python file (this is a Node/TS codebase)' },
  { kind: 'test-file',      re: /\.test(\.|$)/i,          desc: 'test file' },
  { kind: 'json-file',      re: /\.json$/i,               desc: '.json data file' },
  { kind: 'route-file',     re: /(^|_|-)routes?(\.|$|_)/i, desc: 'routes file (HTTP wiring, not an agent)' },
];

// Non-agent service stems that the LLM classifier confirmed despite the
// system prompt explicitly warning against shared utility files. Includes
// known-noisy stems observed in 2026-05-22 prod audit. Extend cautiously.
const NON_AGENT_STEMS = new Set([
  'analyticsService',
  'buildManifestSchema',
  'contractValidator',
  'manifestValidator',
  'autoManifestGenerator',
  'databaseSynchronizer',
  'graphSynchronizer',
  'dataProfiler',
  'dictionaryBuilder',
  'executionSandboxEngine',
  'autonomousEngine',
]);

function classify(name) {
  for (const p of JUNK_PATTERNS) {
    if (p.re.test(name)) return { junk: true, kind: p.kind, why: p.desc };
  }
  if (NON_AGENT_STEMS.has(name)) {
    return { junk: true, kind: 'non-agent-service', why: 'known shared utility / infrastructure, not an agent' };
  }
  return { junk: false };
}

(async () => {
  // 1. Pull every active map row across all projects (status='active' is the
  // operational definition of "confirmed"; disabled rows already excluded).
  const rows = await sequelize.query(
    `SELECT cam.id, cam.capability_id, cam.agent_name, cam.role, cam.status, cam.linked_by, cam.linked_at,
            c.project_id, c.name AS capability_name, p.organization_name, p.name AS project_name
     FROM capability_agent_maps cam
     JOIN capabilities c ON c.id = cam.capability_id
     JOIN projects p ON p.id = c.project_id
     WHERE cam.status = 'active'
     ORDER BY p.organization_name, c.name, cam.agent_name`,
    { type: QueryTypes.SELECT }
  );

  const byProject = new Map();
  let totalActive = 0;
  let totalJunk = 0;
  const junkByKind = {};

  for (const r of rows) {
    totalActive++;
    const pid = r.project_id;
    if (!byProject.has(pid)) {
      byProject.set(pid, {
        project_id: pid,
        project_label: r.project_name || r.organization_name || pid,
        active: 0,
        junk: 0,
        junk_samples: [],
      });
    }
    const proj = byProject.get(pid);
    proj.active++;

    const c = classify(r.agent_name);
    if (c.junk) {
      totalJunk++;
      proj.junk++;
      junkByKind[c.kind] = (junkByKind[c.kind] || 0) + 1;
      if (proj.junk_samples.length < 6) {
        proj.junk_samples.push({ agent_name: r.agent_name, kind: c.kind, why: c.why, linked_by: r.linked_by, capability: r.capability_name });
      }
    }
  }

  const projectReport = Array.from(byProject.values()).sort((a, b) => b.junk - a.junk);

  console.log('====== Capability-Agent Map Junk Audit ======');
  console.log(`Total active map rows across all projects: ${totalActive}`);
  console.log(`Total flagged as junk:                     ${totalJunk}  (${totalActive ? ((100 * totalJunk) / totalActive).toFixed(1) : 0}%)`);
  console.log('');
  console.log('Junk breakdown by kind:');
  for (const [k, n] of Object.entries(junkByKind).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(20)} ${n}`);
  }
  console.log('');
  console.log('Per-project breakdown (top 10 by junk count):');
  for (const p of projectReport.slice(0, 10)) {
    console.log(`  [${p.project_id.slice(0, 8)}…]  ${p.project_label.padEnd(50)}  active=${String(p.active).padStart(4)}  junk=${String(p.junk).padStart(4)}`);
    for (const s of p.junk_samples) {
      console.log(`     - ${s.agent_name.padEnd(40)} (${s.kind}) cap="${s.capability}" linked_by=${s.linked_by}`);
    }
  }

  console.log('');
  console.log('AUDIT_JSON:' + JSON.stringify({
    totalActive,
    totalJunk,
    junkByKind,
    projects: projectReport,
  }));

  await sequelize.close();
})().catch(e => { console.error(e); process.exit(1); });
