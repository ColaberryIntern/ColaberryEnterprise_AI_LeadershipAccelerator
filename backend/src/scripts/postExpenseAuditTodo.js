#!/usr/bin/env node
// Create a Basecamp todo in Ali Personal / AI Products for the expense
// audit, upload the XLSX as an attachment + linked Vault file, post a
// comment summarizing what's in the sheet.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const ACCOUNT = '3945211';
const BUCKET = 7463955; // Ali Personal
const AI_PRODUCTS_LIST = 9939449052; // existing "AI Products" todolist
const TOKEN_FALLBACK = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
function tok() {
  let t = (process.env.BASECAMP_ACCESS_TOKEN || TOKEN_FALLBACK).trim();
  if (t.toLowerCase().startsWith('bearer ')) t = t.slice(7).trim();
  return t;
}
const H = (extra = {}) => ({ Authorization: `Bearer ${tok()}`, 'User-Agent': 'Colaberry ExpenseAudit', Accept: 'application/json', ...extra });

async function bcGet(p) {
  const r = await fetch(`https://3.basecampapi.com/${ACCOUNT}${p}`, { headers: H() });
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`);
  return r.json();
}
async function bcPost(p, body) {
  const r = await fetch(`https://3.basecampapi.com/${ACCOUNT}${p}`, { method: 'POST', headers: H({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${p} -> ${r.status} ${await r.text()}`);
  return r.json();
}

(async () => {
  const XLSX_PATH = path.resolve(__dirname, '../../../tmp/expense-audit-2026-05-08-payroll.xlsx');
  if (!fs.existsSync(XLSX_PATH)) { console.error('XLSX missing - run buildExpenseAuditXlsx.js first'); process.exit(1); }
  const xlsxBuf = fs.readFileSync(XLSX_PATH);
  const filename = 'expense-audit-2026-05-08-payroll.xlsx';

  // Step 1: register the file as an attachment
  console.log('Registering attachment...');
  const attR = await fetch(`https://3.basecampapi.com/${ACCOUNT}/attachments.json?name=${encodeURIComponent(filename)}`, {
    method: 'POST',
    headers: H({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    body: xlsxBuf,
  });
  if (!attR.ok) throw new Error(`attach: ${attR.status} ${await attR.text()}`);
  const attach = await attR.json();
  const sgid = attach.attachable_sgid;
  console.log(`  sgid: ${sgid?.slice(0, 30)}...`);

  // Step 2: create the todo
  console.log('Creating todo...');
  const todoBody = {
    content: '[Tracking] Expense audit + cancellations - payroll period ending 2026-05-08',
    description: `<div>
<p><strong>Source:</strong> Ram's email forward of Durga Siralam expense reimbursement list (2026-06-01).</p>
<p><strong>Status:</strong> 37 line items totaling $7,996.10 across Ali ($7,965.12) and John McBride ($30.98). Spreadsheet attached below with 4 tabs: Summary, All expenses, Cancel candidates, Must keep (core).</p>

<h3>Already done</h3>
<ul>
<li>PEOPLE DATA LABS subscription cancelled 2026-06-01.</li>
</ul>

<h3>Action plan (Ali drives, CB tracks)</h3>
<p>Open the "Cancel candidates" tab in the XLSX below. 14 vendors listed in priority order (highest \\$ first). For each: confirm purpose, cancel if unused, fill in the Result column.</p>
<ol>
<li><strong>BENDING SPOONS - $3,179.23</strong> (largest non-API line). Identify the product + active use. Cancel if unclear.</li>
<li><strong>ZENLEADS - $527.67</strong>. Cancel if no active outbound.</li>
<li><strong>RELEVANCE AI - $349.00</strong>. Cancel if Claude Code has replaced.</li>
<li><strong>PIPEDREAM - $300.71</strong>. Cancel if migrated to GHL or cron.</li>
<li><strong>STACKBLITZ - $200.00</strong>. Cancel.</li>
<li><strong>BEAUTIFUL SLIDES - $153.50</strong>. Cancel if no recent decks.</li>
<li><strong>FRESHR SAS + MAILREACH</strong>. Duplicate email warmup function. Pick one, cancel other (saves \\$110 or \\$100).</li>
<li><strong>ALPHA VANTAGE - $99.99</strong>. Cancel if no active finance API consumer.</li>
<li><strong>REFERRAL ROCK - $50.00</strong>. Cancel - no active referral program.</li>
<li>HIGGSFIELD, THINKRRAI, BUBBLE GROUP (x2), BOOST MOBILE - smaller items, confirm/cancel.</li>
</ol>

<h3>Core - cannot cancel</h3>
<p>Hetzner (prod VPS), Anthropic (Claude Code + API), OpenAI (gpt-4o for daily reports + auto-runner), GitHub, UptimeRobot. Microsoft + Google services should be verified for what they actually cover before any decision.</p>

<h3>Potential savings</h3>
<p>If all 14 candidates beyond People Data Labs are cancelled: <strong>~$5,300/month recurring saved</strong> (estimate based on this month's pattern). Subset cancellation will save proportionally.</p>

<p><em>CB drafted this audit from Ram's email on 2026-06-01. Tag <code>@CB System</code> on this todo with cancellation results and CB will update the spreadsheet + track the running total.</em></p>
</div>`,
    assignee_ids: [17454835], // Ali
  };
  const todo = await bcPost(`/buckets/${BUCKET}/todolists/${AI_PRODUCTS_LIST}/todos.json`, todoBody);
  console.log(`  todo id: ${todo.id} url: ${todo.app_url}`);

  // Step 3: post the file as an attachment via a comment on the new todo
  console.log('Posting XLSX as comment attachment...');
  const commentHtml = `<div><strong>Expense audit spreadsheet</strong> - 4 tabs: Summary, All expenses, Cancel candidates (action list), Must keep (core).</div>
<bc-attachment sgid="${sgid}" caption="${filename}"></bc-attachment>`;
  const comment = await bcPost(`/buckets/${BUCKET}/recordings/${todo.id}/comments.json`, { content: commentHtml });
  console.log(`  comment id: ${comment.id}`);

  // Step 4: also upload to project Vault for permanent storage
  console.log('Uploading to project Vault (Docs & Files)...');
  const proj = await bcGet(`/projects/${BUCKET}.json`);
  const vault = (proj.dock || []).find((d) => d.name === 'vault');
  let vaultUrl = null;
  if (vault) {
    // Find or create "CB Artifacts" folder
    const subs = await bcGet(`/buckets/${BUCKET}/vaults/${vault.id}/vaults.json`);
    let folder = Array.isArray(subs) ? subs.find((v) => v.title === 'CB Artifacts') : null;
    if (!folder) {
      folder = await bcPost(`/buckets/${BUCKET}/vaults/${vault.id}/vaults.json`, { title: 'CB Artifacts' });
    }
    const upload = await bcPost(`/buckets/${BUCKET}/vaults/${folder.id}/uploads.json`, {
      attachable_sgid: sgid, base_name: filename, description: 'Expense audit for May 8 2026 payroll period',
    });
    vaultUrl = upload.app_url;
    console.log(`  vault upload: ${vaultUrl}`);
    // Post a second comment linking the vault location
    await bcPost(`/buckets/${BUCKET}/recordings/${todo.id}/comments.json`, {
      content: `<div>Also stored in Docs & Files for permanent reference: <a href="${vaultUrl}">${filename}</a></div>`,
    });
  }

  console.log('\n=== DONE ===');
  console.log(`Todo URL: ${todo.app_url}`);
  console.log(`Vault URL: ${vaultUrl || '(vault upload skipped)'}`);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
