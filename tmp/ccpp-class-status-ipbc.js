#!/usr/bin/env node
const path = require('path');
const sql = require(path.resolve(__dirname, '../node_modules/mssql'));

(async () => {
  const pool = await sql.connect({
    user: process.env.MSSQL_USER, password: process.env.MSSQL_PASS,
    server: process.env.MSSQL_HOST, port: parseInt(process.env.MSSQL_PORT || '1433', 10),
    database: process.env.MSSQL_DATABASE,
    options: { encrypt: true, trustServerCertificate: true, requestTimeout: 30000 },
  });

  const inspect = async (name) => {
    console.log(`\n=== ${name} columns ===`);
    try {
      const c = await pool.request().query(`SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${name}' ORDER BY ORDINAL_POSITION`);
      for (const r of c.recordset) console.log(`  ${r.COLUMN_NAME} (${r.DATA_TYPE})`);
    } catch (e) { console.log('  err:', e.message); }
    try {
      console.log('--- sample 3 rows ---');
      const s = await pool.request().query(`SELECT TOP 3 * FROM ${name}`);
      for (const r of s.recordset) console.log('  ' + JSON.stringify(r).slice(0, 500));
    } catch (e) { console.log('  sample err:', e.message); }
  };

  // Class status / active
  await inspect('ADF_ClassStatus');
  await inspect('ADF_ClassMgmtActive');
  await inspect('ADF_CurrentClass');
  await inspect('vw_QS_MetricsDashboard_ClassManagement');

  // IPBC signups
  console.log('\n=== TABLES with "IPBC" in name ===');
  const t = await pool.request().query(`SELECT TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%IPBC%' OR TABLE_NAME LIKE '%ipbc%' ORDER BY TABLE_TYPE, TABLE_NAME`);
  for (const r of t.recordset) console.log(`  [${r.TABLE_TYPE}] ${r.TABLE_NAME}`);

  await inspect('vw_IPBC_Students_Payment_Summary');
  await inspect('vw_ADF_Student_Marketing_SalesRepsIPBC_Signups');

  await pool.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
