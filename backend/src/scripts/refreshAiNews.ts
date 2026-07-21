/**
 * refreshAiNews — CLI wrapper around the AI News Flash ingestion pipeline.
 *
 * Usage:
 *   npx ts-node src/scripts/refreshAiNews.ts               # ingest library (LLM cards only if AI_NEWS_INGEST_ENABLED=true)
 *   npx ts-node src/scripts/refreshAiNews.ts --dry-run     # fetch + report, write nothing
 *   npx ts-node src/scripts/refreshAiNews.ts --force       # materialize cards even if the flag is off (supervised run)
 *   npx ts-node src/scripts/refreshAiNews.ts --max 5       # cap cards materialized this run
 *
 * Same code path as the weekly scheduler job ('AiNewsRefresh'); idempotent (dedup
 * by guid, one card per item), safe to run repeatedly.
 */
import { sequelize } from '../config/database';
import AiNewsItem from '../models/AiNewsItem';
import { refreshAiNews } from '../services/intel/aiNewsIngestionService';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');
  const maxIdx = process.argv.indexOf('--max');
  const maxCards = maxIdx >= 0 ? Number(process.argv[maxIdx + 1]) : undefined;

  if (!dryRun) {
    await sequelize.authenticate();
    await AiNewsItem.sync(); // ensure the table exists if the server hasn't booted the model here
  }

  const result = await refreshAiNews({ dryRun, force, maxCards });

  console.log('\n=== AI News refresh complete ===');
  console.log(`  mode:          ${dryRun ? 'DRY-RUN (no writes)' : force ? 'COMMIT + FORCE cards' : 'COMMIT'}`);
  console.log(`  items found:   ${result.found}`);
  console.log(`  inserted:      ${result.inserted}`);
  console.log(`  updated:       ${result.updated}`);
  console.log(`  cards created: ${result.carded}`);
  if (result.skippedFeeds.length) console.log(`  skipped feeds: ${result.skippedFeeds.join(', ')}`);

  if (!dryRun) await sequelize.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('[refreshAiNews] fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
