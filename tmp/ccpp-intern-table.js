#!/usr/bin/env node
// Find the underlying TABLE that backs vw_QS_MetricsDashboard_InternshipTracking_ALL_Interns.
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

  console.log('=== Base TABLES (not views) with "intern" in name ===');
  const t = await pool.request().query(`
    SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE' AND (TABLE_NAME LIKE '%Intern%' OR TABLE_NAME LIKE '%intern%')
    ORDER BY TABLE_NAME`);
  for (const r of t.recordset) console.log(`  ${r.TABLE_SCHEMA}.${r.TABLE_NAME}`);

  console.log('\n=== Tables with column InternBaseCampAlias or internisactive ===');
  const c = await pool.request().query(`
    SELECT DISTINCT t.TABLE_NAME, t.TABLE_TYPE
    FROM INFORMATION_SCHEMA.TABLES t
    JOIN INFORMATION_SCHEMA.COLUMNS c ON c.TABLE_NAME = t.TABLE_NAME
    WHERE c.COLUMN_NAME IN ('InternBaseCampAlias', 'internisactive', 'InternEndDate', 'InternCancelReasonID')
    ORDER BY t.TABLE_TYPE, t.TABLE_NAME`);
  for (const r of c.recordset) console.log(`  [${r.TABLE_TYPE}] ${r.TABLE_NAME}`);

  console.log('\n=== Sample 3 rows from view (active only) ===');
  const s = await pool.request().query(`
    SELECT TOP 3 InternID, Intern, InternEmail, InternBaseCampAlias, internisactive, InternStartDate, InternEndDate, InternManager
    FROM vw_QS_MetricsDashboard_InternshipTracking_ALL_Interns
    WHERE internisactive = 1
    ORDER BY InternStartDate DESC`);
  for (const r of s.recordset) console.log(JSON.stringify(r, null, 2));

  console.log('\n=== Count of active interns ===');
  const ct = await pool.request().query(`SELECT COUNT(*) as cnt FROM vw_QS_MetricsDashboard_InternshipTracking_ALL_Interns WHERE internisactive = 1`);
  console.log(`  ${ct.recordset[0].cnt} active`);

  await pool.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
