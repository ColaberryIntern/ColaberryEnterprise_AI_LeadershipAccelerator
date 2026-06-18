/**
 * Seed the anthropic_content_registry table with the 6 confirmed URLs.
 *
 * Idempotent: upserts on url (unique constraint), so re-running never duplicates rows.
 * All 5 Skilljar course URLs confirmed as of 2026-06-18. Partner portal URL remains
 * a PLACEHOLDER until Anthropic confirms the partner portal URL post 2026-06-12.
 *
 * Run: `npx ts-node backend/src/seeds/seedAnthropicContentRegistry.ts`
 *
 * Output: writes/updates rows in anthropic_content_registry, prints final row count.
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

const ROWS: SeedRow[] = [
  // 5 confirmed partner-required Skilljar courses
  {
    content_type: 'course',
    title: 'Introduction to Agent Skills',
    url: 'https://anthropic.skilljar.com/introduction-to-agent-skills',
  },
  {
    content_type: 'course',
    title: 'Claude with the Anthropic API',
    url: 'https://anthropic.skilljar.com/claude-with-the-anthropic-api',
  },
  {
    content_type: 'course',
    title: 'Introduction to Model Context Protocol',
    url: 'https://anthropic.skilljar.com/introduction-to-model-context-protocol',
  },
  {
    content_type: 'course',
    title: 'Claude Code in Action',
    url: 'https://anthropic.skilljar.com/claude-code-in-action',
  },
  {
    content_type: 'course',
    title: 'Claude Code 101',
    url: 'https://anthropic.skilljar.com/claude-code-101',
  },
  // Public content hubs
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
  // Partner portal — URL TBD until partner status confirmed 2026-06-12.
  // Row is seeded as a placeholder so the watcher schema is populated;
  // update the url column once the real URL is known.
  {
    content_type: 'partner-portal',
    title: 'Anthropic Partner Portal (PLACEHOLDER — update url after 2026-06-12)',
    url: 'https://partners.anthropic.com/PLACEHOLDER',
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

  await sequelize.close();
}

run().catch((err) => {
  console.error('[seedAnthropicContentRegistry] FATAL:', err.message);
  process.exit(1);
});
