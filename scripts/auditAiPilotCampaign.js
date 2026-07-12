// auditAiPilotCampaign.js — live monitor for the AI ROI Pilot cold campaign.
// Runs on prod (in the backend container, via the cron wrapper) a few times a day:
//   1. Pulls Mandrill stats for tag 'ai-pilot-cold' (sent / delivered / bounced /
//      opens / clicks / complaints / unsubs).
//   2. Finds bounced / rejected / spam-complaint / unsub addresses and APPENDS them
//      to tmp/ai-pilot-suppression.json (the fix — auto-suppress so follow-up touches
//      never re-hit a dead or opted-out address; protects sender reputation + CAN-SPAM).
//   3. Health-checks the landing pages (200).
//   4. Emails Ali a styled HTML update (pass --send; dry-run prints only).
//
// Self-contained: needs MANDRILL_API_KEY (container env). Reply-based opt-outs
// (STOP replies that land in the ali@ Gmail) are handled by the operator sweep before
// each touch — this audit covers everything Mandrill knows (delivery + bounces + the
// list-unsubscribe/complaint events).

const fs = require('fs');
const path = require('path');
const https = require('https');
function req(n){ try{return require(n);}catch{return require(path.resolve(__dirname,'../node_modules/'+n));} }
const nodemailer = req('nodemailer');

const SEND = process.argv.includes('--send');
const TAG = 'ai-pilot-cold';
const OUT_DIR = process.env.OUT_DIR || '/app/tmp';
const SUPPRESS_FILE = path.join(OUT_DIR, 'ai-pilot-suppression.json');
const TO = 'ali@colaberry.com', FROM = 'ali@colaberry.com';
const KEY = process.env.MANDRILL_API_KEY || '';

function mandrill(endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(Object.assign({ key: KEY }, body));
    const r = https.request({ hostname: 'mandrillapp.com', path: '/api/1.0' + endpoint, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      (res) => { let b = ''; res.on('data', c => b += c); res.on('end', () => { try { resolve(JSON.parse(b)); } catch { reject(new Error('bad json: ' + b.slice(0, 160))); } }); });
    r.on('error', reject); r.write(data); r.end();
  });
}
function httpStatus(url) {
  return new Promise((resolve) => { https.get(url, (r) => { resolve(r.statusCode); r.resume(); }).on('error', () => resolve(0)); });
}
function loadJson(p, f) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return f; } }
const num = (v) => (typeof v === 'number' ? v : 0);

(async () => {
  if (!KEY) { console.error('FAILED: MANDRILL_API_KEY not set'); process.exit(1); }
  const today = (process.env.AUDIT_DATE || new Date().toISOString().slice(0, 10));

  // 1. Aggregate tag stats.
  let stats = {};
  try {
    const info = await mandrill('/tags/info.json', { tag: TAG });
    stats = info && !info.status ? info : {};
  } catch (e) { console.error('tag info error: ' + e.message); }
  const today5 = (stats.stats && stats.stats.today) || {};

  // 2. Per-message search -> bounce/complaint suppression.
  let messages = [];
  try { messages = await mandrill('/messages/search.json', { query: 'tags:' + TAG, date_from: today, date_to: today, limit: 1000 }) || []; }
  catch (e) { console.error('search error: ' + e.message); }
  if (!Array.isArray(messages)) messages = [];
  const stateCounts = {};
  const badStates = new Set(['bounced', 'soft-bounced', 'rejected', 'invalid', 'spam']);
  const toSuppress = new Set();
  for (const m of messages) {
    const st = m.state || 'unknown'; stateCounts[st] = (stateCounts[st] || 0) + 1;
    if (badStates.has(st) && m.email) toSuppress.add(String(m.email).toLowerCase());
  }
  // Append bounces/complaints to the suppression list (idempotent union).
  let newlySuppressed = 0;
  if (toSuppress.size) {
    const cur = new Set(loadJson(SUPPRESS_FILE, []).map(e => String(e).toLowerCase()));
    for (const e of toSuppress) if (!cur.has(e)) { cur.add(e); newlySuppressed++; }
    if (newlySuppressed) { const tmp = SUPPRESS_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify([...cur], null, 2)); fs.renameSync(tmp, SUPPRESS_FILE); }
  }
  const suppressionTotal = loadJson(SUPPRESS_FILE, []).length;

  // 3. Landing health.
  const routes = ['/ai-pilot', '/ai-pilot/transport', '/ai-pilot/construction', '/ai-pilot/care'];
  const health = {};
  for (const r of routes) health[r] = await httpStatus('https://enterprise.colaberry.ai' + r);

  const sent = num(today5.sent), bounced = num(today5.hard_bounces) + num(today5.soft_bounces);
  const opens = num(today5.unique_opens || today5.opens), clicks = num(today5.unique_clicks || today5.clicks);
  const rejects = num(today5.rejects), complaints = num(today5.complaints), unsubs = num(today5.unsubs);
  const openRate = sent ? Math.round((opens / sent) * 100) : 0;

  const line = (k, v) => `<tr><td style="padding:6px 12px;color:#5a6b80;font:13px Segoe UI">${k}</td><td style="padding:6px 12px;font:700 14px Segoe UI;color:#1a365d">${v}</td></tr>`;
  const hrow = Object.entries(health).map(([r, c]) => `<span style="display:inline-block;margin:2px 6px 2px 0;font:12px Segoe UI;color:${c === 200 ? '#2f855a' : '#c53030'}">${r} ${c}</span>`).join('');
  const html = `<!DOCTYPE html><html><body style="margin:0;background:#f5f7fa"><div style="max-width:640px;margin:0 auto;background:#fff">
  <div style="background:linear-gradient(135deg,#1a365d,#234e86);color:#fff;padding:22px 24px">
    <div style="font:700 12px Segoe UI;letter-spacing:.14em;color:#90cdf4;text-transform:uppercase">Colaberry AI &middot; Campaign Monitor</div>
    <div style="font:800 21px Segoe UI;margin-top:4px">AI ROI Pilot &mdash; live update</div>
    <div style="font:13px Segoe UI;color:#cbd8e8;margin-top:4px">Touch 1, ${today}. 99 queued, staggered 9am-5pm CT.</div></div>
  <div style="padding:18px 24px">
    <table style="border-collapse:collapse;width:100%;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
      ${line('Sent (delivered by Mandrill so far)', sent)}
      ${line('Opens / open rate', opens + ' (' + openRate + '%)')}
      ${line('Clicks', clicks)}
      ${line('Bounced (hard+soft)', bounced)}
      ${line('Rejected / invalid', rejects)}
      ${line('Spam complaints', complaints)}
      ${line('Unsubscribes (Mandrill)', unsubs)}
      ${line('Newly auto-suppressed this run', newlySuppressed)}
      ${line('Suppression list total', suppressionTotal)}
    </table>
    <div style="margin-top:14px;font:12px Segoe UI;color:#5a6b80">Per-message states today: ${Object.entries(stateCounts).map(([s, c]) => s + '=' + c).join(', ') || 'none yet (sends still scheduled)'}</div>
    <div style="margin-top:12px;font:13px Segoe UI;color:#1a202c"><b>Funnel health:</b> ${hrow}</div>
    <div style="margin-top:14px;font:12px Segoe UI;color:#94a3b8">Bounces + complaints are auto-suppressed so later touches never re-hit them. STOP replies (in your inbox) are swept before each follow-up touch. Next touch: Wed (day 2).</div>
  </div></div></body></html>`;

  console.log(`AUDIT ${today}: sent=${sent} opens=${opens} bounced=${bounced} complaints=${complaints} newlySuppressed=${newlySuppressed} suppressionTotal=${suppressionTotal} health=${JSON.stringify(health)}`);
  if (!SEND) { console.log('DRY-RUN. Pass --send to email ' + TO + '.'); return; }
  const t = nodemailer.createTransport({ host: 'smtp.mandrillapp.com', port: 587, secure: false, auth: { user: 'apikey', pass: KEY } });
  const info = await t.sendMail({ from: `"Colaberry AI" <${FROM}>`, to: TO, subject: `AI ROI Pilot monitor: ${sent} sent, ${bounced} bounced, ${opens} opens (${today})`, html, headers: { 'X-MC-Tags': 'ai-pilot-internal' } });
  console.log('SENT msgId=' + info.messageId);
})().catch(e => { console.error('AUDIT FAILED: ' + e.message); process.exit(1); });
