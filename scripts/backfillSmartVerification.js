#!/usr/bin/env node
/**
 * Backfill smart verification across all currently-unmatched requirements
 * for a project. Runs server-side via `docker exec accelerator-backend
 * node -e ...` so it imports the compiled verifier directly (no separate
 * HTTP endpoint required).
 *
 * Usage (locally):
 *   node scripts/backfillSmartVerification.js --project <uuid> [--dry-run]
 *
 * What it does:
 *   1. Pulls every requirements_maps row where status='unmatched' for the
 *      given project.
 *   2. For each, runs verifySingleRequirement (the same path that runs
 *      during verifyProject), which now includes:
 *        - rule verification
 *        - deep code-content sampling when rule confidence is low
 *        - LLM semantic verdict against actual code excerpts
 *        - status promotion when verdict is high-confidence
 *   3. Writes a markdown report to docs/SMART_VERIFIER_BACKFILL_YYYY-MM-DD.md
 *      with: per-REQ before/after, files read, LLM reasoning, status change.
 *   4. Throttled — max 5 concurrent, ~1s between batches.
 *
 * Cost: 59 REQs × gpt-4o-mini × ~3K input tokens ≈ $0.30 total.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const VPS = 'root@95.216.199.47';

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : null;
}
function flag(name) { return process.argv.includes(name); }

const PROJECT_ID = arg('--project') || 'fcce50ef-fe01-471d-a3ff-cd6948d092c2';
const DRY = flag('--dry-run');
const TODAY = new Date().toISOString().slice(0, 10);
const REPORT_PATH = path.join(__dirname, '..', 'docs', `SMART_VERIFIER_BACKFILL_${TODAY}.md`);

// The backfill driver runs INSIDE the prod backend container, so it has
// the env, models, and services loaded. We ship the body as a script
// over stdin to `docker exec ... node -`.
const driverScript = `
const { RequirementsMap, Project } = require('/app/dist/models');
const { analyzeCode } = require('/app/dist/services/verification/codeAnalysisService');
const { verifySingleRequirement } = require('/app/dist/services/verification/verificationOrchestrator');
const { Enrollment } = require('/app/dist/models');

(async () => {
  const projectId = '${PROJECT_ID}';
  const dryRun = ${DRY};

  const project = await Project.findByPk(projectId);
  if (!project) { console.error('PROJECT_NOT_FOUND'); process.exit(2); }

  const enrollment = await Enrollment.findByPk(project.enrollment_id);
  if (!enrollment) { console.error('ENROLLMENT_NOT_FOUND'); process.exit(3); }

  const requirements = await RequirementsMap.findAll({
    where: { project_id: projectId, status: 'unmatched' },
    order: [['requirement_key', 'ASC']],
  });

  console.error(\`Backfilling \${requirements.length} unmatched requirements (dryRun=\${dryRun})\`);

  const analysis = await analyzeCode(enrollment.id);
  console.error(\`Analysis: \${analysis.detected_features.length} features, \${analysis.file_map.length} matched files\`);

  // Stream NDJSON rows so the caller can incrementally consume.
  for (const req of requirements) {
    const before = {
      status: req.status,
      verification_status: req.verification_status,
      semantic_confidence: req.semantic_confidence,
    };

    if (dryRun) {
      process.stdout.write(JSON.stringify({ key: req.requirement_key, text: req.requirement_text.slice(0, 120), before, dryRun: true }) + '\\n');
      continue;
    }

    try {
      const outcome = await verifySingleRequirement(enrollment.id, projectId, req, analysis);
      await req.reload();
      const after = {
        status: req.status,
        verification_status: req.verification_status,
        semantic_confidence: req.semantic_confidence,
        semantic_reasoning: (req.semantic_reasoning || '').slice(0, 300),
        github_file_paths: req.github_file_paths,
      };
      const flipped = before.status !== after.status;
      process.stdout.write(JSON.stringify({
        key: req.requirement_key,
        text: req.requirement_text.slice(0, 120),
        before,
        after,
        promoted_status: outcome.promoted_status,
        flipped,
      }) + '\\n');
    } catch (err) {
      process.stdout.write(JSON.stringify({ key: req.requirement_key, error: err.message }) + '\\n');
    }
  }

  process.exit(0);
})().catch((e) => { console.error('FATAL', e.message, e.stack); process.exit(1); });
`;

console.log(`[backfill] PROJECT_ID=${PROJECT_ID}  DRY=${DRY}`);
console.log(`[backfill] Writing report to ${REPORT_PATH}`);

// Ship driver via stdin to docker exec node -
const tmpLocal = path.join(require('os').tmpdir(), `backfill_driver_${Date.now()}.js`);
fs.writeFileSync(tmpLocal, driverScript);

let output = '';
try {
  // SCP driver to VPS, copy into container, run via node, capture stdout
  const remoteTmp = `/tmp/${path.basename(tmpLocal)}`;
  execSync(`scp -q "${tmpLocal}" ${VPS}:${remoteTmp}`, { stdio: ['pipe','pipe','inherit'] });
  output = execSync(
    `ssh ${VPS} "docker cp ${remoteTmp} accelerator-backend:${remoteTmp} && docker exec accelerator-backend node ${remoteTmp}; rm -f ${remoteTmp}"`,
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  );
} catch (err) {
  console.error('[backfill] driver failed:', err.message);
  output = err.stdout ? err.stdout.toString() : '';
} finally {
  try { fs.unlinkSync(tmpLocal); } catch {}
}

// Parse NDJSON output
const lines = output.split('\n').filter((l) => l.trim().startsWith('{'));
const results = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

console.log(`[backfill] Processed ${results.length} requirements`);

const flipped = results.filter((r) => r.flipped);
const errors = results.filter((r) => r.error);
const unchanged = results.filter((r) => !r.flipped && !r.error && !r.dryRun);

console.log(`[backfill] Flipped: ${flipped.length}  Unchanged: ${unchanged.length}  Errors: ${errors.length}`);

// Build report markdown
let md = `# Smart Verifier Backfill — ${TODAY}\n\n`;
md += `**Project:** \`${PROJECT_ID}\`\n\n`;
md += `**Dry run:** ${DRY}\n\n`;
md += `## Summary\n\n`;
md += `| Bucket | Count |\n| --- | ---: |\n`;
md += `| Total requirements processed | ${results.length} |\n`;
md += `| **Status flipped (unmatched -> matched/verified)** | **${flipped.length}** |\n`;
md += `| Unchanged (verifier agrees: still unmatched) | ${unchanged.length} |\n`;
md += `| Errors | ${errors.length} |\n\n`;

if (flipped.length > 0) {
  md += `## Flipped requirements\n\n`;
  for (const r of flipped) {
    md += `### ${r.key} — ${r.before.status} -> **${r.after.status}**\n\n`;
    md += `> ${r.text}\n\n`;
    md += `- verification_status: \`${r.before.verification_status}\` -> \`${r.after.verification_status}\`\n`;
    md += `- semantic_confidence: ${r.before.semantic_confidence?.toFixed?.(2) ?? 'n/a'} -> ${r.after.semantic_confidence?.toFixed?.(2) ?? 'n/a'}\n`;
    md += `- files_read: ${(r.after.github_file_paths || []).map((p) => '`' + p + '`').join(', ') || '(none)'}\n`;
    md += `- semantic_reasoning: ${r.after.semantic_reasoning || '(none)'}\n\n`;
  }
}

if (unchanged.length > 0) {
  md += `## Unchanged (verifier still says unmatched)\n\n`;
  md += `These remain unmatched even after deep verification — likely genuine gaps in the codebase.\n\n`;
  md += `| Key | Text | semantic_confidence | reasoning |\n| --- | --- | ---: | --- |\n`;
  for (const r of unchanged) {
    const conf = r.after?.semantic_confidence?.toFixed?.(2) ?? 'n/a';
    const reason = (r.after?.semantic_reasoning || '').slice(0, 120).replace(/\|/g, '/');
    md += `| ${r.key} | ${r.text.replace(/\|/g, '/').slice(0, 80)} | ${conf} | ${reason} |\n`;
  }
  md += '\n';
}

if (errors.length > 0) {
  md += `## Errors\n\n`;
  for (const r of errors) {
    md += `- ${r.key}: ${r.error}\n`;
  }
  md += '\n';
}

if (DRY) {
  md += `## Dry-run preview (no changes written)\n\n`;
  md += `Run without \`--dry-run\` to apply.\n`;
}

fs.writeFileSync(REPORT_PATH, md);
console.log(`[backfill] Wrote report: ${REPORT_PATH}`);
process.exit(errors.length > 0 ? 1 : 0);
