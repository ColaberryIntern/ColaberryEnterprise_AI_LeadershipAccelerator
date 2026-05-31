// VIP SMS Router — Track A Phase 1
//
// Given an inbound email payload, decide if the sender is a VIP and (if so):
//   1. Summarize the email with gpt-4o-mini into a tight "sender + ask" line
//   2. Forward the full email to alimuwwakkil@gmail.com with a stable subject
//      so the SMS link can deep-link to it
//   3. Send an SMS to Ali's phone via Twilio (when SMS_MODE=live; otherwise
//      log-only)
//   4. Log to communication_logs for cap tracking + audit
//
// Mode file: tmp/ops-engine/vip-sms-mode.txt
//   "log_only" (default) - everything except the actual SMS send
//   "live"               - real SMS via Twilio
//
// This lets us build + test the full pipeline before Ali approves Twilio.

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
function logSms({ to, from, body, status, providerMessageId, error, metadata }) {
  const md = JSON.stringify(metadata || {}).replace(/'/g, "''");
  const sql = `INSERT INTO communication_logs (id, channel, direction, status, to_address, from_address, body, provider, provider_message_id, error_message, metadata, created_at) VALUES (gen_random_uuid(), 'sms', 'outbound', '${status}', '${(to || '').replace(/'/g, "''")}', '${(from || '').replace(/'/g, "''")}', '${(body || '').replace(/'/g, "''")}', 'twilio', ${providerMessageId ? `'${providerMessageId.replace(/'/g, "''")}'` : 'NULL'}, ${error ? `'${error.replace(/'/g, "''")}'` : 'NULL'}, '${md}'::jsonb, NOW())`;
  try { execPg(sql); } catch (e) { console.error('logSms fail:', e.message); }
}

// =============================================================================
// SMS send (Twilio when live, no-op in log_only)
// =============================================================================
async function sendSmsViaTwilio({ to, body }) {
  // API Key auth (preferred for production): use API Key SID + Secret as
  // HTTP Basic creds. Account SID identifies the account in the URL path.
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const from = process.env.TWILIO_NUMBER;
  if (!accountSid || !apiKeySid || !apiKeySecret || !from) {
    throw new Error('TWILIO_ACCOUNT_SID / TWILIO_API_KEY_SID / TWILIO_API_KEY_SECRET / TWILIO_NUMBER all required');
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const auth = Buffer.from(`${apiKeySid}:${apiKeySecret}`).toString('base64');
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
  });
  if (!r.ok) throw new Error(`Twilio ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return { providerMessageId: data.sid };
}

// =============================================================================
// Summarize email with LLM
// =============================================================================
async function summarizeEmail({ senderName, subject, body }) {
  if (!process.env.OPENAI_API_KEY) {
    return `${senderName} sent: "${(subject || '').slice(0, 60)}"`;
  }
  try {
    const OpenAI = require(path.resolve(REPO, 'node_modules/openai')).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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
async function routeInboundEmail({ senderEmail, senderName, subject, body, gmailMessageUrl }) {
  const mode = readMode();
  const vip = findVip(senderEmail);
  if (!vip) {
    return { vip: false, mode, fired: false, reason: 'sender not in VIP list' };
  }
  if (!canSendSms()) {
    logSms({ to: process.env.ALI_PHONE_NUMBER || 'unknown', from: process.env.TWILIO_NUMBER || 'unknown', body: '[cap reached - logged only]', status: 'deferred-cap', metadata: { vip_id: vip.id, sender_email: senderEmail, subject, mode } });
    return { vip: true, mode, fired: false, reason: 'daily SMS cap reached (7/24h)' };
  }
  const displayName = vip.displayName || senderName || senderEmail;
  const summary = await summarizeEmail({ senderName: displayName, subject, body });
  const linkPart = gmailMessageUrl ? ` ${gmailMessageUrl}` : '';
  const smsBody = `VIP ${summary}${linkPart}`.slice(0, 320);
  let providerMessageId = null;
  let error = null;
  let status = 'log_only';
  if (mode === 'live') {
    try {
      const sent = await sendSmsViaTwilio({ to: process.env.ALI_PHONE_NUMBER, body: smsBody });
      providerMessageId = sent.providerMessageId;
      status = 'sent';
    } catch (e) {
      error = e.message;
      status = 'failed';
    }
  }
  logSms({
    to: process.env.ALI_PHONE_NUMBER || 'unknown',
    from: process.env.TWILIO_NUMBER || 'log_only',
    body: smsBody, status, providerMessageId, error,
    metadata: { vip_id: vip.id, sender_email: senderEmail, sender_name: displayName, subject, mode },
  });
  return { vip: true, mode, fired: status === 'sent', status, smsBody, providerMessageId, error };
}

module.exports = {
  readMode, writeMode,
  findVip, listVips,
  canSendSms, canMakeVoiceCall,
  smsCount24h, voiceCount24h,
  routeInboundEmail,
  SMS_CAP, VOICE_CAP,
};
