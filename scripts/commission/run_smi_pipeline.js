const sql = require('mssql');
const fs = require('fs');

// The reporting month. Supplied by the caller - there is deliberately no default,
// because silently inheriting last month's numbers is the exact failure this
// pipeline must never have. Set CM_YEAR / CM_MONTH before running.
const YEAR = parseInt(process.env.CM_YEAR || '', 10);
const MONTH = parseInt(process.env.CM_MONTH || '', 10);
if (!Number.isInteger(YEAR) || YEAR < 2016 || YEAR > 2100) {
  console.error('ERR CM_YEAR must be a 4-digit year, got: ' + JSON.stringify(process.env.CM_YEAR));
  process.exit(2);
}
if (!Number.isInteger(MONTH) || MONTH < 1 || MONTH > 12) {
  console.error('ERR CM_MONTH must be 1-12, got: ' + JSON.stringify(process.env.CM_MONTH));
  process.exit(2);
}
const MON3 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
              'jul', 'aug', 'sep', 'oct', 'nov', 'dec'][MONTH - 1];

const config = {
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT || '1433', 10),
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASS,
  database: process.env.MSSQL_DATABASE,
  options: { encrypt: false, trustServerCertificate: true },
  requestTimeout: 600000,
  connectionTimeout: 30000,
};

const pipeline = fs.readFileSync('/app/smi_pipeline.sql', 'utf8');

// Detail in the exact column order / sort of the workbook tabs, capped at the
// reporting month so the GETDATE()-driven forward projection is excluded.
// Plus the IPBC Group detail rows for the same month.
const FINAL = `
SELECT SMIC_SalesRep, SMIC_Name, OrderMonth, OrderYear, TotalPaid, AliComm,
       SalesRepComm, MonthlyPaid, MonthlyPaidMinus25per
FROM   #SMI_CommIII
WHERE  (OrderYear < ${YEAR}) OR (OrderYear = ${YEAR} AND OrderMonth <= ${MONTH})
ORDER BY OrderYear DESC, OrderMonth DESC, TotalPaid DESC;

SELECT 'ALI' Name, OrderMonth, OrderYear, ROUND(sum(AliComm),2) Comm
FROM   #SMI_CommIII
WHERE  (OrderYear < ${YEAR}) OR (OrderYear = ${YEAR} AND OrderMonth <= ${MONTH})
GROUP BY OrderYear, OrderMonth
ORDER BY OrderYear desc, OrderMonth desc;

SELECT p.[Customer #], p.Source, p.[Order Date], p.Status, p.Total,
       p.[Amount Paid], p.[Balance Due], p.ModifiedDate,
       p.SMIC_SalesRep, p.SMIC_CommID, p.SMIC_UserID
FROM   [dbo].[vw_ADF_PaySimple] p
LEFT JOIN ( SELECT DISTINCT SMIC_Name, SMIC_ID, PS_CUSTOMERID
            FROM dbo.vw_ADF_Student_Marketing_SalesRepsCommSystem
            UNION ALL
            SELECT StudentName, SMIC_ID, PS_CustomerID
            FROM [dbo].[vw_ADF_Student_Marketing_SalesRepsIPBC_Signups] ) b
  ON p.[Customer #] = b.PS_CUSTOMERID
WHERE  p.[Amount Paid] > 0
AND    b.SMIC_Name IS NULL
AND    Month(p.[Order Date]) = ${MONTH} AND Year(p.[Order Date]) = ${YEAR}
ORDER BY p.[Order Date];
`;

async function main() {
  console.log('reporting month: ' + YEAR + '-' + String(MONTH).padStart(2, '0'));
  const pool = await sql.connect(config);
  const res = await pool.request().batch(pipeline + '\n' + FINAL);
  const s = res.recordsets;
  const detail = s[s.length - 3], summary = s[s.length - 2], ipbc = s[s.length - 1];

  fs.writeFileSync('/app/smi_detail.json', JSON.stringify(detail));
  fs.writeFileSync('/app/smi_summary.json', JSON.stringify(summary));
  fs.writeFileSync('/app/ipbc_' + MON3 + '.json', JSON.stringify(ipbc));

  const inMonth = detail.filter(r => r.OrderYear === YEAR && r.OrderMonth === MONTH);
  const prevM = MONTH === 1 ? 12 : MONTH - 1;
  const prevY = MONTH === 1 ? YEAR - 1 : YEAR;
  const sumRow = summary.find(r => r.OrderYear === YEAR && r.OrderMonth === MONTH);

  console.log('detail rows: ' + detail.length);
  console.log('summary rows: ' + summary.length);
  console.log('ipbc ' + MON3 + ' ' + YEAR + ' rows: ' + ipbc.length +
              '  sum=' + ipbc.reduce((a, r) => a + Number(r['Amount Paid']), 0).toFixed(2));
  console.log('reporting-month detail rows: ' + inMonth.length);
  console.log('prior-month detail rows (' + prevY + '-' + prevM + '): ' +
              detail.filter(r => r.OrderYear === prevY && r.OrderMonth === prevM).length);
  console.log('COMPANY_PAID=' + (inMonth.length ? Number(inMonth[0].MonthlyPaid).toFixed(2) : 'n/a'));
  console.log('ALI_COMM=' + (sumRow ? Number(sumRow.Comm).toFixed(2) : 'n/a'));
  await pool.close();
}

main().catch(e => { console.error('ERR', e.message); process.exit(1); });
