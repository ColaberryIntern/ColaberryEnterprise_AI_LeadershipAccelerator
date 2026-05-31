#!/usr/bin/env node
// Discover CCPP cohort + student + section-completion schema.
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

  console.log('=== TABLES with "cohort" in name ===');
  const t1 = await pool.request().query(`
    SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME LIKE '%cohort%' OR TABLE_NAME LIKE '%Cohort%'
    ORDER BY TABLE_TYPE, TABLE_NAME`);
  for (const r of t1.recordset) console.log(`  [${r.TABLE_TYPE}] ${r.TABLE_NAME}`);

  console.log('\n=== TABLES with "section" or "completion" or "progress" ===');
  const t2 = await pool.request().query(`
    SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME LIKE '%section%' OR TABLE_NAME LIKE '%completion%' OR TABLE_NAME LIKE '%progress%' OR TABLE_NAME LIKE '%Student%'
    ORDER BY TABLE_TYPE, TABLE_NAME`);
  for (const r of t2.recordset) console.log(`  [${r.TABLE_TYPE}] ${r.TABLE_NAME}`);

  console.log('\n=== TABLES with "program" ===');
  const t3 = await pool.request().query(`
    SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME LIKE '%program%' OR TABLE_NAME LIKE '%Program%'
    ORDER BY TABLE_TYPE, TABLE_NAME`);
  for (const r of t3.recordset) console.log(`  [${r.TABLE_TYPE}] ${r.TABLE_NAME}`);

  await pool.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
