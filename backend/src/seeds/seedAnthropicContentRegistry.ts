/**
 * Seed the anthropic_content_registry table with non-course content hubs.
 *
 * Course rows are now populated and maintained by the catalog scraper
 * (anthropicCatalogScraper.ts / POST /api/admin/sync/anthropic-catalog).
 * Run the scraper after this seed to populate course entries.
 *
 * Idempotent: upserts on url (unique constraint); re-running never duplicates rows.
 *
 * Run: `npx ts-node backend/src/seeds/seedAnthropicContentRegistry.ts`
 *
 * Before running on prod, apply the migration:
 *   backend/src/seeds/migrations/add_outline_to_anthropic_content_registry.sql
 */

import path from 'path';
import { config } from 'dotenv';
config({ path: path.resolve(__dirname, '../../../.env.dev') });

import { sequelize } from '../config/database';
import { QueryTypes } from 'sequelize';

interface SeedRow {
  content_type: 'course' | 'document' | 'news' | 'partner-portal';
  title: string;
  url: string;
}

// Only non-course rows. Courses are discovered and upserted by the scraper.
const ROWS: SeedRow[] = [
  {
    content_type: 'document',
    title: 'Anthropic Documentation',
    url: 'https://docs.anthropic.com',
  },
  {
    content_type: 'news',
    title: 'Anthropic News',
    url: 'https://www.anthropic.com/news',
  },
];

async function run(): Promise<void> {
  console.log('[seedAnthropicContentRegistry] start');
  await sequelize.authenticate();

  for (const row of ROWS) {
    await sequelize.query(
      `INSERT INTO anthropic_content_registry (id, content_type, title, url)
       VALUES (gen_random_uuid(), :content_type, :title, :url)
       ON CONFLICT (url) DO UPDATE
         SET title = EXCLUDED.title,
             content_type = EXCLUDED.content_type`,
      {
        replacements: { content_type: row.content_type, title: row.title, url: row.url },
        type: QueryTypes.INSERT,
      },
    );
    console.log(`  upserted: ${row.content_type} | ${row.title}`);
  }

  const [countResult] = await sequelize.query(
    'SELECT COUNT(*) AS count FROM anthropic_content_registry',
    { type: QueryTypes.SELECT },
  );
  console.log(`[seedAnthropicContentRegistry] done — ${(countResult as any).count} total rows`);
  console.log('[seedAnthropicContentRegistry] Run the catalog scraper to populate course rows:');
  console.log('  POST /api/admin/sync/anthropic-catalog');

  await sequelize.close();
}

run().catch((err) => {
  console.error('[seedAnthropicContentRegistry] FATAL:', err.message);
  process.exit(1);
});
