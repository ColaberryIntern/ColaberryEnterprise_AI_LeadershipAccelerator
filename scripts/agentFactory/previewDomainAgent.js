/**
 * AF3.1 Release Zero — PREVIEW what creating a domain agent would do. Writes nothing.
 *
 *   node scripts/agentFactory/previewDomainAgent.js              # all ten
 *   node scripts/agentFactory/previewDomainAgent.js marketing    # one
 *
 * Runs on the prod backend, because the only honest preview is against the database the real
 * run would write to. It calls `previewAgentIdentity()`, which is structurally zero-write: that
 * function only ever calls `.findOne` on the four models and never imports `findOrCreate`,
 * `create` or `update`, so there is no code path through it that can persist anything.
 *
 * This script adds no writes of its own, and asserts the Release Zero floor on every plan before
 * printing it.
 */
const path = require('path');
const { deriveDomainAgent, assertReleaseZeroSafe, DOMAIN_PROFILES } = require(
  path.join(__dirname, 'releaseZeroPlan.js'),
);

const ONLY = process.argv[2];
const SEED = '/app/dist/services/agentBlueprint/agentIdentitySeed.js';

(async () => {
  const { previewAgentIdentity } = require(SEED);
  const keys = ONLY ? [ONLY] : Object.keys(DOMAIN_PROFILES);

  console.log(`Release Zero PREVIEW — ${keys.length} domain(s). NOTHING IS WRITTEN.\n`);

  let wouldCreate = 0;
  let alreadyThere = 0;

  for (const key of keys) {
    const plan = deriveDomainAgent(key);
    assertReleaseZeroSafe(plan);

    const p = await previewAgentIdentity(plan.config);
    const rows = [
      ['AiAgent', p.aiAgent.exists ? 'EXISTS' : 'MISSING - registry entry needed first'],
      ['Enrollment', p.enrollment.wouldCreate ? 'would CREATE' : 'exists'],
      ['CommunityMember', p.communityMember.wouldCreate ? 'would CREATE' : 'exists'],
      ['AdminUser', p.adminUser.wouldCreate ? 'would CREATE' : 'exists'],
    ];
    const creates = rows.filter(([, v]) => v.startsWith('would CREATE')).length;
    if (creates) wouldCreate += 1; else alreadyThere += 1;

    console.log(`${plan.registryEntry.agent_name}`);
    console.log(`  email            ${plan.config.email}`);
    console.log(`  display          ${plan.config.displayName}`);
    console.log(`  category         ${plan.registryEntry.category}`);
    console.log(`  enabled          ${plan.registryEntry.enabled}   `
      + `autonomy=${plan.registryEntry.autonomy_level}   `
      + `tools=${JSON.stringify(plan.registryEntry.tools_granted)}`);
    rows.forEach(([k, v]) => console.log(`  ${k.padEnd(16)} ${v}`));
    console.log('');
  }

  console.log('='.repeat(64));
  console.log(`domains whose identity rows do NOT yet exist: ${wouldCreate}`);
  console.log(`domains already seeded:                       ${alreadyThere}`);
  console.log('');
  console.log('Release Zero floor asserted on every plan: enabled=false, autonomy=observe,');
  console.log('tools_granted=[], no reporting line. Nothing above was written.');
  console.log('');
  console.log('THE REAL RUN IS NOT THIS SCRIPT. It needs, per domain:');
  console.log('  1. an AGENT_REGISTRY entry in backend/src/services/agentRegistrySeed.ts');
  console.log('     (seedAgentIdentity throws without the AiAgent row - a deliberate guard');
  console.log('      against an orphaned identity), which is a code change and a PR;');
  console.log('  2. a seedAgentIdentity() call after the registry findOrCreate loop.');
  console.log('Both are reserved to Ali: this creates real staff identities in production.');
  process.exit(0);
})().catch((e) => { console.error('PREVIEW FAILED: ' + e.message); process.exit(1); });
