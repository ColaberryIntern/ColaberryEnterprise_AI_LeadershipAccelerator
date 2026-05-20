/**
 * backfillAgentRolesCache — one-time classify all existing caps' agents
 *
 * Tier-3 A+E (2026-05-20): the new cap.agent_roles_cache column is
 * populated at brownfield-scan time going forward. Existing caps don't
 * have it yet. This script:
 *   1. Pulls every active cap for the Colaberry project
 *   2. Fetches each cap's linked_agents file contents via GitHub API
 *   3. Classifies roles via inferAgentRole + persists agent_roles_cache
 *
 * Rate limit aware: bounded delay between caps, skips caps with no
 * agents, dedups files within a cap (5 max per cap).
 *
 * Idempotent: re-running classifies any cap whose cache is missing
 * OR whose linked_agents drifted from cache.agent_paths.
 *
 * Run: copy to container, `docker exec -w /app accelerator-backend node backfill.js`
 */
const path = require('path');

const PROJECT_ID = 'fcce50ef-fe01-471d-a3ff-cd6948d092c2';
const DELAY_MS_BETWEEN_CAPS = 200; // gentle pacing, well under any rate limit
const MAX_FILES_PER_CAP = 5;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  // Use compiled modules — script runs inside the container against /app/dist
  const { Sequelize, DataTypes } = require('sequelize');
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
  const sequelize = new Sequelize(url, { logging: false });

  const { inferAgentRole } = require('./dist/intelligence/systemStateEngine/scoring/codeEvidence');
  const { readFileFromRepo } = require('./dist/services/githubService');

  const caps = await sequelize.query(
    `SELECT c.id, c.name, c.linked_agents, c.agent_roles_cache, p.enrollment_id
       FROM capabilities c
       JOIN projects p ON p.id = c.project_id
      WHERE c.project_id = :pid
        AND c.applicability_status = 'active'
      ORDER BY c.name`,
    { replacements: { pid: PROJECT_ID }, type: Sequelize.QueryTypes.SELECT },
  );

  console.log(`Found ${caps.length} active caps in project.`);
  let classified = 0;
  let skippedNoAgents = 0;
  let skippedFresh = 0;
  let errors = 0;

  for (const cap of caps) {
    const agents = (cap.linked_agents || []).filter(p => /\.(ts|tsx|js|jsx)$/.test(p)).slice(0, MAX_FILES_PER_CAP);

    if (agents.length === 0) {
      skippedNoAgents++;
      continue;
    }

    // Skip when cache is already fresh AND agent paths match
    const existing = cap.agent_roles_cache;
    if (existing && existing.agent_paths) {
      const cachedSet = new Set(existing.agent_paths);
      const currentSet = new Set(agents);
      const drifted = cachedSet.size !== currentSet.size
        || [...currentSet].some(p => !cachedSet.has(p));
      const ageMs = existing.classified_at ? Date.now() - new Date(existing.classified_at).getTime() : Infinity;
      const fresh = !drifted && ageMs < 7 * 24 * 60 * 60 * 1000;
      if (fresh) {
        skippedFresh++;
        continue;
      }
    }

    try {
      const contents = await Promise.all(
        agents.map(p => readFileFromRepo(cap.enrollment_id, p).catch(() => null)),
      );
      const detected = new Set();
      let inspected = 0;
      for (let i = 0; i < agents.length; i++) {
        if (typeof contents[i] === 'string') inspected++;
        detected.add(inferAgentRole(agents[i], contents[i]));
      }
      const payload = {
        detected: [...detected],
        files_inspected: inspected,
        classified_at: new Date().toISOString(),
        agent_paths: agents,
      };
      await sequelize.query(
        `UPDATE capabilities SET agent_roles_cache = :p, updated_at = NOW() WHERE id = :id`,
        { replacements: { p: JSON.stringify(payload), id: cap.id } },
      );
      classified++;
      console.log(`  [classified] "${cap.name}": roles=[${[...detected].join(', ')}] inspected=${inspected}/${agents.length}`);
    } catch (err) {
      errors++;
      console.warn(`  [error]      "${cap.name}": ${err.message}`);
    }

    await sleep(DELAY_MS_BETWEEN_CAPS);
  }

  console.log();
  console.log(`Summary: ${classified} classified, ${skippedFresh} skipped (fresh), ${skippedNoAgents} skipped (no agents), ${errors} errors.`);
  await sequelize.close();
}

main().catch(err => { console.error(err); process.exit(1); });
