const sql = require('mssql');
const fs = require('fs');

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
WHERE  (OrderYear < 2026) OR (OrderYear = 2026 AND OrderMonth <= 4)
ORDER BY OrderYear DESC, OrderMonth DESC, TotalPaid DESC;

SELECT 'ALI' Name, OrderMonth, OrderYear, ROUND(sum(AliComm),2) Comm
FROM   #SMI_CommIII
WHERE  (OrderYear < 2026) OR (OrderYear = 2026 AND OrderMonth <= 4)
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
AND    Month(p.[Order Date]) = 4 AND Year(p.[Order Date]) = 2026
ORDER BY p.[Order Date];
`;

async function main() {
  const pool = await sql.connect(config);
  const res = await pool.request().batch(pipeline + '\n' + FINAL);
  const s = res.recordsets;
  const detail = s[s.length - 3], summary = s[s.length - 2], ipbc = s[s.length - 1];

  fs.writeFileSync('/app/smi_detail.json', JSON.stringify(detail));
  fs.writeFileSync('/app/smi_summary.json', JSON.stringify(summary));
  fs.writeFileSync('/app/ipbc_apr.json', JSON.stringify(ipbc));

  console.log('detail rows: ' + detail.length);
  console.log('summary rows: ' + summary.length);
  console.log('ipbc Apr 2026 rows: ' + ipbc.length +
              '  sum=' + ipbc.reduce((a, r) => a + Number(r['Amount Paid']), 0).toFixed(2));
  console.log('Apr 2026 detail rows: ' + detail.filter(r => r.OrderYear === 2026 && r.OrderMonth === 4).length);
  console.log('Mar 2026 detail rows: ' + detail.filter(r => r.OrderYear === 2026 && r.OrderMonth === 3).length);
  await pool.close();
}

main().catch(e => { console.error('ERR', e.message); process.exit(1); });
