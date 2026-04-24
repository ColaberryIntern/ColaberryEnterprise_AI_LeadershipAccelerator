/**
 * Backfill UTM params on approved Skool responses.
 *
 * Updates enterprise.colaberry.ai/partners and advisor.colaberry.ai links
 * in approved skool_responses to include Skool UTM tracking params.
 *
 * Safe to run multiple times - only updates rows that don't already have utm_source.
 */
const { connectDatabase, sequelize } = require('./dist/config/database');
const { QueryTypes } = require('sequelize');

async function main() {
  await connectDatabase();

  // 1. Update enterprise.colaberry.ai/partners links
  const [, partnersMeta] = await sequelize.query(`
    UPDATE skool_responses
    SET body = REPLACE(body,
      'enterprise.colaberry.ai/partners',
      'enterprise.colaberry.ai/partners?utm_source=skool&utm_medium=community&utm_campaign=aaa_hub')
    WHERE post_status = 'approved'
      AND body LIKE '%enterprise.colaberry.ai/partners%'
      AND body NOT LIKE '%utm_source%'
  `);
  const partnersUpdated = partnersMeta?.rowCount || partnersMeta || 0;
  console.log(`[Skool UTM] Updated ${partnersUpdated} rows with enterprise.colaberry.ai/partners UTM`);

  // 2. Update advisor.colaberry.ai links
  const [, advisorMeta] = await sequelize.query(`
    UPDATE skool_responses
    SET body = REPLACE(body,
      'advisor.colaberry.ai/advisory',
      'advisor.colaberry.ai/advisory/?utm_source=skool&utm_medium=community&utm_campaign=aaa_hub')
    WHERE post_status = 'approved'
      AND body LIKE '%advisor.colaberry.ai/advisory%'
      AND body NOT LIKE '%utm_source%'
  `);
  const advisorUpdated = advisorMeta?.rowCount || advisorMeta || 0;
  console.log(`[Skool UTM] Updated ${advisorUpdated} rows with advisor.colaberry.ai UTM`);

  // 3. Also update ai-workforce-designer links
  const [, designerMeta] = await sequelize.query(`
    UPDATE skool_responses
    SET body = REPLACE(body,
      'enterprise.colaberry.ai/ai-workforce-designer',
      'enterprise.colaberry.ai/ai-workforce-designer?utm_source=skool&utm_medium=community&utm_campaign=aaa_hub')
    WHERE post_status = 'approved'
      AND body LIKE '%enterprise.colaberry.ai/ai-workforce-designer%'
      AND body NOT LIKE '%utm_source%'
  `);
  const designerUpdated = designerMeta?.rowCount || designerMeta || 0;
  console.log(`[Skool UTM] Updated ${designerUpdated} rows with ai-workforce-designer UTM`);

  console.log('[Skool UTM] Backfill complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[Skool UTM] Fatal error:', err);
  process.exit(1);
});
