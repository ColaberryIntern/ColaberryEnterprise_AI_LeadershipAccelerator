import { connectDatabase } from '../config/database';
import '../models';
import { Campaign, CampaignGovernanceConfig } from '../models';
import { validateGovernanceConfig } from '../services/campaignGovernancePolicy';
import { DECLARED_CONFIGS, UPDATED_BY } from './campaignGovernanceDeclarations';
import { validateCampaignForPublish } from '../services/campaignLinkService';

/**
 * The first campaign governance configs this platform has ever had (C0.12).
 *
 * Measured in production on 2026-11-01: `campaign_governance_configs` held **zero rows
 * against 47 campaigns**. `validateCampaignForPublish` requires one, so no campaign in the
 * system could pass that check, and the six campaigns that are nevertheless `status=active`
 * got there through `activateCampaign`, which never consulted it.
 *
 * ## Why a seed and not an insert
 *
 * The numbers below are decisions, and a decision that lives only in a shell history is
 * not reviewable. Each value carries the fact it was derived from, so the next person can
 * disagree with the derivation rather than guess at the intent. Re-running updates the row
 * to match this file, which makes this file the record of what governs each campaign.
 *
 * The values and their derivations live in `campaignGovernanceDeclarations.ts`.
 *
 * Usage:
 *   npx ts-node src/seeds/seedCampaignGovernanceConfig.ts            # the default set
 *   npx ts-node src/seeds/seedCampaignGovernanceConfig.ts --dry-run  # derive and validate only
 *   npx ts-node src/seeds/seedCampaignGovernanceConfig.ts --only ceo_direct
 */

/** Applied unless --only names something else. See `why` on the second entry. */
const DEFAULT_KEYS = ['ceo_direct'];

function parseArgs(argv: readonly string[]): { dryRun: boolean; keys: readonly string[] } {
  const dryRun = argv.includes('--dry-run');
  const onlyAt = argv.indexOf('--only');
  const keys = onlyAt !== -1 && argv[onlyAt + 1] ? [argv[onlyAt + 1] as string] : DEFAULT_KEYS;
  return { dryRun, keys };
}

async function seed(): Promise<void> {
  const { dryRun, keys } = parseArgs(process.argv.slice(2));
  await connectDatabase();

  const selected = DECLARED_CONFIGS.filter((c) => keys.includes(c.key));
  const unknown = keys.filter((k) => !DECLARED_CONFIGS.some((c) => c.key === k));
  if (unknown.length > 0) throw new Error(`Unknown config key(s): ${unknown.join(', ')}`);

  console.log(`[C0.12] ${dryRun ? 'DRY RUN - ' : ''}${selected.length} config(s): `
    + `${selected.map((c) => c.key).join(', ')}`);

  // Validate every declared config before writing any of them. A seed that writes the
  // first row and then rejects the second has left the table in a state nobody declared.
  for (const c of DECLARED_CONFIGS) {
    const verdict = validateGovernanceConfig(c.values);
    if (!verdict.valid) {
      throw new Error(`Declared config "${c.key}" is itself invalid: ${verdict.errors.join('; ')}`);
    }
  }
  console.log(`[C0.12] All ${DECLARED_CONFIGS.length} declared config(s) pass validateGovernanceConfig.`);

  for (const c of selected) {
    const campaign = await Campaign.findByPk(c.campaign_id);
    if (!campaign) throw new Error(`Campaign ${c.campaign_id} ("${c.campaign_name}") not found`);

    const before = await validateCampaignForPublish(c.campaign_id);
    console.log(`\n[C0.12] ${c.key} - ${c.campaign_name}`);
    console.log(`  publish check before: ${before.valid ? 'valid' : before.errors.join(' | ')}`);

    if (dryRun) {
      console.log('  --dry-run: nothing written');
      continue;
    }

    const existing = await CampaignGovernanceConfig.findOne({ where: { campaign_id: c.campaign_id } });
    const payload = { ...c.values, ramp_profile: { ...c.values.ramp_profile }, updated_by: UPDATED_BY, updated_at: new Date() };

    if (!existing) {
      await CampaignGovernanceConfig.create({ campaign_id: c.campaign_id, ...payload, created_at: new Date() } as never);
      console.log('  created');
    } else {
      await existing.update(payload as never);
      console.log('  updated to match this file');
    }

    const after = await validateCampaignForPublish(c.campaign_id);
    console.log(`  publish check after : ${after.valid ? 'valid' : after.errors.join(' | ')}`);
  }

  console.log('\n[C0.12] Seed complete.');
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[C0.12] Seed failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}

export { seed };
