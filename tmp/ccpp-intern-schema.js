#!/usr/bin/env node
// Read-only discovery: find CCPP tables/columns related to interns.
const path = require('path');
const sql = require(path.resolve(__dirname, '../node_modules/mssql'));

(async () => {
  const config = {
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASS,
    server: process.env.MSSQL_HOST,
    port: parseInt(process.env.MSSQL_PORT || '1433', 10),
    database: process.env.MSSQL_DATABASE,
    options: { encrypt: true, trustServerCertificate: true, requestTimeout: 30000 },
  };
  const pool = await sql.connect(config);

  console.log('=== TABLES with "intern" in name ===');
  const t = await pool.request().query(`
    SELECT TABLE_SCHEMA, TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME LIKE '%Intern%' OR TABLE_NAME LIKE '%intern%'
    ORDER BY TABLE_NAME`);
  for (const r of t.recordset) console.log(`  ${r.TABLE_SCHEMA}.${r.TABLE_NAME}`);

  console.log('\n=== Columns named like *intern* or *status* across all tables ===');
  const c = await pool.request().query(`
    SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE COLUMN_NAME LIKE '%Intern%' OR COLUMN_NAME LIKE '%intern%'
    ORDER BY TABLE_NAME, COLUMN_NAME`);
  for (const r of c.recordset) console.log(`  ${r.TABLE_NAME}.${r.COLUMN_NAME} (${r.DATA_TYPE})`);

  await pool.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
