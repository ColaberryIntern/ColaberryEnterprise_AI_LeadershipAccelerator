#!/usr/bin/env node
// 48h after-deploy check for the Inbox COS tone-down. Pulls last 48h
// Inbox COS-tagged email counts from inbox_emails and posts a BC
// comment on todo 9966887928 with before/after.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
}

const axios = require(path.resolve(__dirname, '../../../node_modules/axios'));
const { Sequelize } = require(path.resolve(__dirname, '../../../node_modules/sequelize'));

const BC_HEADERS = {
  Authorization: `Bearer ${process.env.BASECAMP_ACCESS_TOKEN}`,
  'User-Agent': 'Colaberry Accelerator (ali@colaberry.com)',
  'Content-Type': 'application/json',
};
const COMMENTS_URL = 'https://3.basecampapi.com/3945211/buckets/7463955/recordings/9966887928/comments.json';

const SOURCES = [
  { label: 'URGENT keyword classifier', sql: "subject ILIKE '%URGENT:%detected%'", baseline7d: 139 },
  { label: 'ASK_USER digest (Timer 3, info@)', sql: "from_address ILIKE '%info@colaberry.com%' AND subject ILIKE '%need your decision%'", baseline7d: 33 },
  { label: 'ASK_USER SMS path (Timer 5, deleted)', sql: "from_address ILIKE '%ali@colaberry.com%' AND subject ILIKE '%need your decision%'", baseline7d: 18 },
  { label: 'Sync failed (auth-expired loop)', sql: "subject ILIKE '%Inbox COS sync failed%'", baseline7d: 17 },
  { label: 'VIP detected (KEEP)', sql: "subject ILIKE 'VIP:%'", baseline7d: 24 },
  { label: 'Calendar conflicts', sql: "subject ILIKE '%calendar conflicts today%'", baseline7d: 21 },
  { label: 'Meeting prep 15-min (KEEP)', sql: "subject ILIKE 'In 15 min:%'", baseline7d: 38 },
];

(async () => {
  const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
    host: process.env.DB_HOST || 'localhost', port: parseInt(process.env.DB_PORT || '5432', 10),
    dialect: 'postgres', logging: false,
  });

  const rows = [];
  let totalActual = 0;
  for (const s of SOURCES) {
    const [res] = await sequelize.query(
      `SELECT COUNT(*)::int AS n FROM inbox_emails WHERE received_at > NOW() - INTERVAL '48 hours' AND ${s.sql}`
    );
    const actual48h = res[0].n;
    totalActual += actual48h;
    const baseline48h = Math.round((s.baseline7d / 7) * 2); // 2 days from 7d baseline
    const cutPct = baseline48h > 0 ? Math.round((1 - actual48h / baseline48h) * 100) : 0;
    rows.push({ label: s.label, baseline48h, actual48h, cutPct });
  }
  const totalBaseline = SOURCES.reduce((s, r) => s + Math.round((r.baseline7d / 7) * 2), 0);
  const totalCutPct = Math.round((1 - totalActual / totalBaseline) * 100);

  const rowsHtml = rows.map(r => `<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${r.label}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#991b1b">${r.baseline48h}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#166534">${r.actual48h}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${r.cutPct >= 0 ? r.cutPct + '%' : '+' + (-r.cutPct) + '%'}</td></tr>`).join('');

  const html = `<div>
<h3>48-hour Inbox COS tone-down check</h3>
<p>Last 48 hours since the v2 deploy. All counts pulled from <code>inbox_emails</code> directly.</p>
<table style="border-collapse:collapse;font-family:arial;font-size:13px">
<thead><tr style="background:#1a365d;color:white"><th style="padding:8px 10px;text-align:left">Source</th><th style="padding:8px 10px;text-align:left">Expected (from 7d baseline)</th><th style="padding:8px 10px;text-align:left">Actual 48h</th><th style="padding:8px 10px;text-align:left">Cut</th></tr></thead>
<tbody>${rowsHtml}</tbody>
<tfoot><tr style="background:#f1f5f9;font-weight:700"><td style="padding:8px 10px">TOTAL (tracked)</td><td style="padding:8px 10px;color:#991b1b">${totalBaseline}</td><td style="padding:8px 10px;color:#166534">${totalActual}</td><td style="padding:8px 10px">${totalCutPct}%</td></tr></tfoot>
</table>
</div>`;

  await axios.post(COMMENTS_URL, { content: html }, { headers: BC_HEADERS });
  console.log('48h check posted. Total cut:', totalCutPct + '%');
  await sequelize.close();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
