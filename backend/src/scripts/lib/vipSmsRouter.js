// VIP Alert Router — Track A Phase 1
//
// Given an inbound email payload, decide if the sender is a VIP and (if so):
//   1. Summarize the email with gpt-4o-mini into a tight "sender + ask" line
//   2. Send a VIP-marked email via Mandrill to alimuwwakkil@gmail.com
//      Gmail's mobile push notification IS the alert. Preview shows
//      "VIP <name>: <summary>" on Ali's lock screen.
//   3. Log to communication_logs for cap tracking + audit
//
// We dropped Twilio (2026-05-31) because:
//   - 2024 US carrier rules require A2P 10DLC / toll-free verification
//   - For Ali's volume (max 7/day, recipient = himself), gmail push
//     notifications work identically and require zero new infrastructure
//   - Mandrill is already paid for and battle-tested in this codebase
//   - Richer alert content (clickable links, summaries) than SMS allows
//
// Mode file: tmp/ops-engine/vip-sms-mode.txt
//   "log_only" (default) - log entries but do NOT send via Mandrill
//   "live"               - send VIP alerts to gmail

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../../../..');
const MODE_FILE = path.join(REPO, 'tmp/ops-engine/vip-sms-mode.txt');
const SMS_CAP = 7;
const VOICE_CAP = 3;

function readMode() {
  try {
    const v = fs.readFileSync(MODE_FILE, 'utf8').trim().toLowerCase();
    if (v === 'live' || v === 'log_only') return v;
  } catch (_e) {}
  return 'log_only';
}

function writeMode(mode) {
  const v = String(mode || '').trim().toLowerCase();
  if (v !== 'live' && v !== 'log_only') throw new Error(`Invalid mode: ${mode}. Use "live" or "log_only".`);
  fs.mkdirSync(path.dirname(MODE_FILE), { recursive: true });
  const prev = readMode();
  fs.writeFileSync(MODE_FILE, v + '\n');
  return { previous: prev, current: v, changed: prev !== v };
}

// =============================================================================
// VIP lookup
// =============================================================================
function execPg(sql) {
  const { spawnSync } = require('child_process');
  const r = spawnSync('docker', ['exec', '-i', 'accelerator-db', 'psql', '-U', 'accelerator', '-d', 'accelerator_prod', '-tA', '-c', sql], { encoding: 'utf8', timeout: 10000 });
  if (r.status !== 0) throw new Error(`pg: ${(r.stderr || '').trim()}`);
  return (r.stdout || '').trim();
}

// Source of truth: inbox_vips table (managed via the admin UI at
// /admin/inbox/vips). Lower priority number = more important
// (Adalene=1=highest, business contacts=30-50, etc).
function findVip(senderEmail) {
  if (!senderEmail) return null;
  const email = senderEmail.toLowerCase().trim().replace(/'/g, "''");
  const row = execPg(`SELECT id, email_address, name, relationship, priority FROM inbox_vips WHERE LOWER(email_address) = '${email}' LIMIT 1`);
  if (!row) return null;
  const [id, em, name, relationship, priority] = row.split('|');
  return { id, email: em, displayName: name || em, relationship, priority: parseInt(priority, 10) };
}

function listVips() {
  const out = execPg(`SELECT id, email_address, COALESCE(name, ''), relationship, priority FROM inbox_vips ORDER BY priority ASC, name`);
  if (!out) return [];
  return out.split('\n').filter(Boolean).map((line) => {
    const [id, email, name, relationship, priority] = line.split('|');
    return { id, email, displayName: name, relationship, priority: parseInt(priority, 10) };
  });
}

// =============================================================================
// Cap enforcement
// =============================================================================
function smsCount24h() {
  const out = execPg(`SELECT COUNT(*) FROM communication_logs WHERE channel = 'sms' AND direction = 'outbound' AND created_at > NOW() - INTERVAL '24 hours'`);
  return parseInt(out || '0', 10);
}
function voiceCount24h() {
  const out = execPg(`SELECT COUNT(*) FROM communication_logs WHERE channel = 'voice' AND direction = 'outbound' AND created_at > NOW() - INTERVAL '24 hours'`);
  return parseInt(out || '0', 10);
}

function canSendSms() { return smsCount24h() < SMS_CAP; }
function canMakeVoiceCall() { return voiceCount24h() < VOICE_CAP; }

// =============================================================================
// Log
// =============================================================================
function logVipAlert({ to, body, status, providerMessageId, error, metadata }) {
  // We keep channel='sms' so existing cap logic + admin views work unchanged.
  // The "alert via gmail push" is functionally equivalent to SMS for capping.
  const md = JSON.stringify(metadata || {}).replace(/'/g, "''");
  const sql = `INSERT INTO communication_logs (id, channel, direction, status, to_address, from_address, body, provider, provider_message_id, error_message, metadata, created_at) VALUES (gen_random_uuid(), 'sms', 'outbound', '${status}', '${(to || '').replace(/'/g, "''")}', 'ali@colaberry.com', '${(body || '').slice(0, 4000).replace(/'/g, "''")}', 'mandrill-vip', ${providerMessageId ? `'${providerMessageId.replace(/'/g, "''")}'` : 'NULL'}, ${error ? `'${error.replace(/'/g, "''")}'` : 'NULL'}, '${md}'::jsonb, NOW())`;
  try { execPg(sql); } catch (e) { console.error('logVipAlert fail:', e.message); }
}

// =============================================================================
// SMS send (Twilio when live, no-op in log_only)
// =============================================================================
async function sendVipAlertEmail({ to, vipName, summary, originalSender, originalSubject, originalSnippet }) {
  // Gmail mobile push notification IS the alert. Subject is engineered so the
  // lock-screen preview reads "VIP <name>: <summary>" at a glance.
  const nodemailer = require(path.resolve(REPO, 'node_modules/nodemailer'));
  if (!process.env.MANDRILL_API_KEY) throw new Error('MANDRILL_API_KEY not set');

  // Subject = the notification preview. Gmail shows ~50 chars on lock screen.
  const subject = `VIP ${vipName}: ${summary}`.slice(0, 90);

  // Body: structured for fast scan when Ali opens the notification.
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:arial,sans-serif">
<div style="max-width:560px;margin:0 auto;background:white;color:#1a202c;line-height:1.55;padding:20px 24px">
<div style="background:#1c1917;color:white;padding:14px 18px;border-radius:6px;margin-bottom:14px">
<div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">VIP - act fast</div>
<div style="font-size:16px;margin-top:4px;font-weight:700">${(vipName || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>
<div style="font-size:13px;color:#cbd5e0;margin-top:4px">${(summary || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>
</div>

<table cellpadding="6" cellspacing="0" style="width:100%;font-size:13px">
<tr><td style="color:#475569;width:90px">From:</td><td>${(originalSender || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</td></tr>
<tr><td style="color:#475569">Subject:</td><td><strong>${(originalSubject || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</strong></td></tr>
</table>

${originalSnippet ? `<div style="background:#f8fafc;border-left:4px solid #1a365d;padding:12px 14px;margin-top:14px;font-size:13px;color:#475569"><strong style="color:#1a365d">Preview:</strong><br>${(originalSnippet || '').slice(0, 800).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</div>` : ''}

<div style="margin-top:18px;font-size:11px;color:#94a3b8">This alert fires when one of your VIP contacts (managed at <a href="https://enterprise.colaberry.ai/admin/inbox" style="color:#2b6cb0">/admin/inbox</a>) sends you an email. Capped at 7/day. Reply to the original email at ali@colaberry.com to respond.</div>
</div></body></html>`;

  const text = `VIP ${vipName}\n${summary}\n\nFrom: ${originalSender}\nSubject: ${originalSubject}\n\n${(originalSnippet || '').slice(0, 600)}`;

  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"VIP Alert" <ali@colaberry.com>',
    to,
    subject,
    text,
    html,
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false', 'Importance': 'high', 'X-Priority': '1' },
  });
  return { providerMessageId: r.messageId };
}

// =============================================================================
// Summarize email with LLM
// =============================================================================
async function summarizeEmail({ senderName, subject, body }) {
  if (!process.env.OPENAI_API_KEY) {
    return `${senderName} sent: "${(subject || '').slice(0, 60)}"`;
  }
  try {
    const { getInstrumentedOpenAI } = require(path.resolve(__dirname, './openaiInstrumented'));
    const openai = getInstrumentedOpenAI({ workflow_id: 'vip_sms_router' });
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'You produce a single sentence under 110 characters describing an inbound email from a VIP sender so the recipient knows what the sender is asking. Format: "<sender first name>: <one-line ask or topic>". No em-dashes, no fluff.' },
        { role: 'user', content: `Sender: ${senderName}\nSubject: ${subject || '(no subject)'}\n\nBody:\n${(body || '').slice(0, 2000)}` },
      ],
    });
    return (resp.choices?.[0]?.message?.content || '').trim().replace(/—/g, '-').replace(/–/g, '-');
  } catch (e) {
    return `${senderName}: "${(subject || '').slice(0, 60)}"`;
  }
}

// =============================================================================
// Main entry: route an inbound email
// =============================================================================
const ALI_GMAIL = process.env.ALI_GMAIL || 'alimuwwakkil@gmail.com';

async function routeInboundEmail({ senderEmail, senderName, subject, body, gmailMessageUrl }) {
  const mode = readMode();
  const vip = findVip(senderEmail);
  if (!vip) {
    return { vip: false, mode, fired: false, reason: 'sender not in VIP list' };
  }
  if (!canSendSms()) {
    logVipAlert({ to: ALI_GMAIL, body: '[cap reached - logged only]', status: 'deferred-cap', metadata: { vip_id: vip.id, sender_email: senderEmail, subject, mode } });
    return { vip: true, mode, fired: false, reason: 'daily alert cap reached (7/24h)' };
  }
  const displayName = vip.displayName || senderName || senderEmail;
  const summary = await summarizeEmail({ senderName: displayName, subject, body });

  // Snippet for the alert body (first 800 chars of original, plain text)
  const snippet = (body || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 800);

  let providerMessageId = null;
  let error = null;
  let status = 'log_only';
  if (mode === 'live') {
    try {
      const sent = await sendVipAlertEmail({
        to: ALI_GMAIL,
        vipName: displayName,
        summary,
        originalSender: senderEmail,
        originalSubject: subject,
        originalSnippet: snippet,
      });
      providerMessageId = sent.providerMessageId;
      status = 'sent';
    } catch (e) {
      error = e.message;
      status = 'failed';
    }
  }
  logVipAlert({
    to: ALI_GMAIL,
    body: `VIP ${displayName}: ${summary}`,
    status, providerMessageId, error,
    metadata: { vip_id: vip.id, sender_email: senderEmail, sender_name: displayName, subject, mode },
  });
  return { vip: true, mode, fired: status === 'sent', status, summary, vipName: displayName, providerMessageId, error };
}

module.exports = {
  readMode, writeMode,
  findVip, listVips,
  canSendSms, canMakeVoiceCall,
  smsCount24h, voiceCount24h,
  routeInboundEmail,
  SMS_CAP, VOICE_CAP,
};
