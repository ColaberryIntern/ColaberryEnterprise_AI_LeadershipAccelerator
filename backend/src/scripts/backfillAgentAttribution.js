/**
 * backfillAgentAttribution — 2026-05-20.
 *
 * One-shot runner for the LLM agent-attribution classifier against an
 * existing project (Colaberry Enterprise AI Accelerator by default).
 * For new projects the classifier auto-runs at the end of brownfield
 * discovery; this script is for projects that already have linked_agents
 * populated and need the authoritative pass.
 *
 * Run in the prod container:
 *   docker cp <this-file> accelerator-backend:/app/bfAA.js
 *   docker exec -w /app accelerator-backend node bfAA.js
 */

const PROJECT_ID = process.env.PROJECT_ID || 'fcce50ef-fe01-471d-a3ff-cd6948d092c2';

async function main() {
  const { Sequelize, QueryTypes } = require('sequelize');
  const seq = new Sequelize(process.env.DATABASE_URL, { logging: false });

  const enrolls = await seq.query(
    `SELECT enrollment_id FROM projects WHERE id = :pid`,
    { replacements: { pid: PROJECT_ID }, type: QueryTypes.SELECT },
  );
  if (enrolls.length === 0) { console.error('No project found'); process.exit(1); }
  const enrollmentId = enrolls[0].enrollment_id;

  console.log(`Classifying agent attribution for project ${PROJECT_ID} (enrollment ${enrollmentId})…`);

  const { classifyProjectAgentAttribution } = require('/app/dist/services/agentAttributionClassifier');
  const result = await classifyProjectAgentAttribution(enrollmentId, PROJECT_ID);

  console.log('\nResult:');
  for (const [k, v] of Object.entries(result)) console.log(`  ${k}: ${v}`);

  await seq.close();
}

main().catch(err => { console.error(err); process.exit(1); });
