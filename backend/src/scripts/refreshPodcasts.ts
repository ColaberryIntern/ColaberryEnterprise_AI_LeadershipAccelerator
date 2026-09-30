/**
 * refreshPodcasts — CLI wrapper around the podcast ingestion service.
 *
 * Usage:
 *   npx ts-node src/scripts/refreshPodcasts.ts            # scrape + upsert into `podcasts`
 *   npx ts-node src/scripts/refreshPodcasts.ts --dry-run  # scrape + report, write nothing
 *
 * Used for the initial catalog population and for manual re-runs. The weekly refresh
 * runs in-process via schedulerService (`PodcastRefresh`, Mon 03:00 CT); this script is
 * the same code path and is safe to run repeatedly (idempotent upsert by website_url).
 */
import { sequelize } from '../config/database';
import Podcast from '../models/Podcast';
import { refreshPodcasts } from '../services/podcast/podcastIngestionService';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  if (!dryRun) {
    await sequelize.authenticate();
    // Ensure the table exists even if this box's server hasn't booted the new model yet.
    await Podcast.sync();
  }

  const summary = await refreshPodcasts({ dryRun });

  console.log('\n=== Podcast refresh complete ===');
  console.log(`  mode:            ${dryRun ? 'DRY-RUN (no writes)' : 'COMMIT'}`);
  console.log(`  episodes seen:   ${summary.total}`);
  console.log(`  inserted:        ${summary.inserted}`);
  console.log(`  updated:         ${summary.updated}`);
  console.log(`  unchanged:       ${summary.unchanged}`);
  console.log(`  failed:          ${summary.failed}`);
  console.log(`  with thumbnail:  ${summary.withThumbnail}/${summary.total}`);
  console.log(`  feed fetched:    ${summary.feedFetched} (${summary.feedEpisodes} episodes)`);
  console.log(`  duration:        ${summary.durationMs} ms`);
  if (summary.errors.length) console.log(`  errors:          ${summary.errors.join(' | ')}`);

  if (!dryRun) await sequelize.close();
  process.exit(summary.ok ? 0 : 1);
}

main().catch((err) => {
  console.error('[refreshPodcasts] fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
