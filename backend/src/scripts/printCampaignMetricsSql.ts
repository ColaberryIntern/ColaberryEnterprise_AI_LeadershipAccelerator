/**
 * Print the exact SQL getCampaignMetrics would execute for a given scope, with the bound
 * replacements substituted as literals, so it can be run read-only (EXPLAIN / LIMIT) against
 * a real database. Exists because the T014 verifier showed that a SQL-text test cannot tell a
 * real column from a wrong one; this is the "verify the thing" half.
 *
 * Run: `TS_NODE_TRANSPILE_ONLY=1 npx ts-node src/scripts/printCampaignMetricsSql.ts [start] [end] [brandId]`
 * Output: the statement on stdout. Nothing is executed and no database is contacted.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

async function main(): Promise<void> {
  const [start, end, brandId] = process.argv.slice(2);
  const db = await import('../config/database');
  let captured = '';
  let captureReplacements: Record<string, string> = {};
  (db.sequelize as unknown as { query: (sql: string, opts: { replacements: Record<string, string> }) => Promise<unknown[]> }).query =
    async (sql, opts) => { captured = sql; captureReplacements = opts.replacements; return []; };
  const { getCampaignMetrics } = await import('../services/marketingAnalyticsService');
  await getCampaignMetrics({ start: start || undefined, end: end || undefined, brandId: brandId || undefined });
  let sql = captured;
  for (const [k, v] of Object.entries(captureReplacements)) sql = sql.replace(new RegExp(`:${k}\\b`, 'g'), `'${String(v).replace(/'/g, "''")}'`);
  process.stdout.write(sql.trim() + '\n');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(`[print-sql] FAILED: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`);
  process.exit(1);
});
