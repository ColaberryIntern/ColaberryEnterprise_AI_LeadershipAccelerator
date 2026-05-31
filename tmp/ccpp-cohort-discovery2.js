#!/usr/bin/env node
// Drill into the most likely views.
const path = require('path');
const sql = require(path.resolve(__dirname, '../node_modules/mssql'));

(async () => {
  const config = {
    user: process.env.MSSQL_USER, password: process.env.MSSQL_PASS,
    server: process.env.MSSQL_HOST, port: parseInt(process.env.MSSQL_PORT || '1433', 10),
    database: process.env.MSSQL_DATABASE,
    options: { encrypt: true, trustServerCertificate: true, requestTimeout: 30000 },
  };
  const pool = await sql.connect(config);

  const inspect = async (name) => {
    console.log(`\n=== ${name} columns ===`);
    try {
      const c = await pool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = '${name}'
        ORDER BY ORDINAL_POSITION`);
      for (const r of c.recordset) console.log(`  ${r.COLUMN_NAME} (${r.DATA_TYPE})`);
    } catch (e) { console.log(`  err: ${e.message}`); }
    try {
      console.log(`--- sample 2 rows ---`);
      const s = await pool.request().query(`SELECT TOP 2 * FROM ${name}`);
      for (const r of s.recordset) console.log('  ' + JSON.stringify(r).slice(0, 600));
    } catch (e) { console.log(`  sample err: ${e.message}`); }
  };

  // Look for class/cohort metadata
  console.log('=== TABLES with "class" in name ===');
  const t = await pool.request().query(`
    SELECT TABLE_NAME, TABLE_TYPE
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME LIKE '%class%' OR TABLE_NAME LIKE '%Class%'
    ORDER BY TABLE_TYPE, TABLE_NAME`);
  for (const r of t.recordset) console.log(`  [${r.TABLE_TYPE}] ${r.TABLE_NAME}`);

  await inspect('vw_ClassSignUps_EventProgress');
  await inspect('vw_StudentOverview');
  await inspect('vw_StudentRankings');
  await inspect('VW_TWC_MASTER_STUDENT_LIST');

  await pool.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
