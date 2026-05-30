#!/usr/bin/env node
// Inspect ADF_InternshipProgram (the enrollment master) + cancel reasons.
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

  console.log('=== ADF_InternshipProgram columns ===');
  const c = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'ADF_InternshipProgram'
    ORDER BY ORDINAL_POSITION`);
  for (const r of c.recordset) console.log(`  ${r.COLUMN_NAME} (${r.DATA_TYPE}, ${r.IS_NULLABLE === 'YES' ? 'nullable' : 'not null'})`);

  console.log('\n=== ADF_InternshipCancelReasons (lookup table) ===');
  const r = await pool.request().query(`SELECT * FROM ADF_InternshipCancelReasons ORDER BY 1`);
  for (const row of r.recordset.slice(0, 25)) console.log('  ' + JSON.stringify(row));

  console.log('\n=== Sample 3 active rows from ADF_InternshipProgram (Ali-managed) ===');
  const sm = await pool.request().query(`
    SELECT TOP 3 *
    FROM ADF_InternshipProgram
    WHERE internisactive = 1`);
  for (const row of sm.recordset) console.log(JSON.stringify(row, null, 2));

  console.log('\n=== Distinct active interns count (DISTINCT InternID) ===');
  const dct = await pool.request().query(`SELECT COUNT(DISTINCT InternID) as cnt FROM ADF_InternshipProgram WHERE internisactive = 1`);
  console.log(`  ${dct.recordset[0].cnt} distinct active interns`);

  await pool.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
