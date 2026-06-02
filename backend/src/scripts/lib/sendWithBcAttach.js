/**
 * sendWithBcAttach — the canonical helper for outbound Ali Personal emails.
 *
 * Enforces the operating doctrine (memory: feedback_ali_personal_attach_emails_docs_to_ticket):
 * every outbound email + produced document is attached to its originating BC ticket.
 *
 * The helper is the source of friction that makes the doctrine impossible to forget:
 * - REQUIRES a ticketId. Throws if omitted. There is no opt-out for "this email
 *   doesn't really belong to a ticket" — if the email is doctrine-relevant, it
 *   has a ticket. If it isn't, use raw nodemailer.
 * - Sends the email via Mandrill SMTP.
 * - Uploads any produced documents (in `vaultAttachments`) to the project Vault
 *   under "CB Context Dossiers" so the walker can read them later.
 * - Posts a structured comment on the ticket with: email subject, recipients,
 *   Mandrill ID, summary, links to the Vault uploads.
 * - Returns { mandrillId, commentUrl, vaultUploads }.
 *
 * Usage:
 *
 *   const { sendWithBcAttach } = require('./lib/sendWithBcAttach');
 *
 *   const result = await sendWithBcAttach({
 *     ticketId: 9955562788,           // REQUIRED. BC todo id this email belongs to.
 *     from: '"Ali Muwwakkil" <ali@colaberry.com>',
 *     to: 'dlahme@colaberry.com',
 *     cc: ['ram@colaberry.com'],
 *     bcc: ['ali@colaberry.com'],
 *     replyTo: 'ali@colaberry.com',
 *     subject: 'Re: ...',
 *     html: '<html>...</html>',
 *     text: '...',                    // plaintext fallback
 *     attachments: [                  // nodemailer-style email attachments
 *       { filename: 'foo.pdf', content: buf, contentType: 'application/pdf' },
 *       { filename: 'logo.png', content: buf, cid: 'logo' },
 *     ],
 *     vaultAttachments: [             // OPTIONAL. Files to also upload to BC Vault.
 *       { filename: 'foo.pdf', content: buf, contentType: 'application/pdf',
 *         vaultDescription: 'Coca-Cola context dossier — synthesized 2026-06-04' },
 *     ],
 *     bcSummary: '<p>Short HTML summary of what the email contains.</p>',
 *                                     // OPTIONAL. Falls back to a generic one.
 *   });
 *
 *   // result.mandrillId, result.commentUrl, result.vaultUploads
 */

const fs = require('fs');
const path = require('path');
const nodemailer = require(path.resolve(__dirname, '../../../../node_modules/nodemailer'));
const { validateBeforeSend } = require('./mandrillPreflight');

const BC_ACCOUNT = '3945211';
const BC_BASE = `https://3.basecampapi.com/${BC_ACCOUNT}`;
const BC_BUCKET = 7463955; // Ali Personal default
const VAULT_FOLDER_NAME = 'CB Context Dossiers';

function bcAuthHeaders(extra = {}) {
  const token = (process.env.BASECAMP_ACCESS_TOKEN || '').replace(/^bearer\s+/i, '').trim();
  if (!token) throw new Error('BASECAMP_ACCESS_TOKEN not set (or expired — refresh from CCPP.Basecamp_AuthInfo)');
  return { Authorization: `Bearer ${token}`, 'User-Agent': 'Colaberry sendWithBcAttach', Accept: 'application/json', ...extra };
}

function strip(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }
function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

async function bcPost(p, body, extraHeaders = {}) {
  const r = await fetch(`${BC_BASE}${p}`, {
    method: 'POST',
    headers: bcAuthHeaders({ 'Content-Type': 'application/json', ...extraHeaders }),
    body: typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${p} -> ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
async function bcGet(p) {
  const r = await fetch(`${BC_BASE}${p}`, { headers: bcAuthHeaders() });
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function ensureVaultFolder(bucketId) {
  const proj = await bcGet(`/projects/${bucketId}.json`);
  const root = (proj.dock || []).find((d) => d.name === 'vault');
  if (!root) throw new Error(`bucket ${bucketId} has no vault dock`);
  const subs = await bcGet(`/buckets/${bucketId}/vaults/${root.id}/vaults.json`);
  let folder = Array.isArray(subs) ? subs.find((v) => v.title === VAULT_FOLDER_NAME) : null;
  if (!folder) {
    folder = await bcPost(`/buckets/${bucketId}/vaults/${root.id}/vaults.json`, { title: VAULT_FOLDER_NAME });
  }
  return folder;
}

async function uploadToVault({ bucketId, filename, content, contentType, vaultDescription }) {
  const att = await fetch(`${BC_BASE}/attachments.json?name=${encodeURIComponent(filename)}`, {
    method: 'POST',
    headers: bcAuthHeaders({ 'Content-Type': contentType }),
    body: content,
  });
  if (!att.ok) throw new Error(`attachments.json ${att.status}: ${await att.text()}`);
  const sgid = (await att.json()).attachable_sgid;
  const folder = await ensureVaultFolder(bucketId);
  const upload = await bcPost(`/buckets/${bucketId}/vaults/${folder.id}/uploads.json`, {
    attachable_sgid: sgid,
    base_name: filename.replace(/\.[^.]+$/, ''),
    description: vaultDescription || `Attached via sendWithBcAttach on ${new Date().toISOString().slice(0, 10)}`,
  });
  return { sgid, filename, vaultUrl: upload.app_url, uploadId: upload.id };
}

async function postTicketComment({ bucketId, ticketId, html }) {
  const c = await bcPost(`/buckets/${bucketId}/recordings/${ticketId}/comments.json`, { content: html });
  return c;
}

/**
 * Main entry point.
 */
async function sendWithBcAttach(opts = {}) {
  const {
    bucketId = BC_BUCKET,
    ticketId,
    from = '"Ali Muwwakkil" <ali@colaberry.com>',
    to, cc, bcc, replyTo = 'ali@colaberry.com',
    subject, html, text, attachments = [],
    vaultAttachments = [],
    bcSummary,
    headers,
    mandrillTrack = 'opens,clicks',
  } = opts;

  // === GUARD: ticketId is required ===
  if (!ticketId) {
    throw new Error(`sendWithBcAttach: ticketId is REQUIRED. Every outbound Ali Personal email must be attached to an originating BC ticket per the operating doctrine (memory: feedback_ali_personal_attach_emails_docs_to_ticket). If this email genuinely does not belong to a ticket, use raw nodemailer.`);
  }
  if (!to) throw new Error('sendWithBcAttach: `to` is required.');
  if (!subject) throw new Error('sendWithBcAttach: `subject` is required.');
  if (!html && !text) throw new Error('sendWithBcAttach: at least one of `html` or `text` is required.');

  // === Strip em-dashes (per Ali style rule) ===
  const cleanedHtml = html ? strip(html) : undefined;
  const cleanedText = text ? strip(text) : undefined;

  // === Preflight ===
  validateBeforeSend(cleanedHtml || '', cleanedText || '');

  // === Send via Mandrill ===
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const sent = await transport.sendMail({
    from, to, cc, bcc, replyTo, subject,
    text: cleanedText, html: cleanedHtml, attachments,
    headers: { 'X-MC-Track': mandrillTrack, 'X-MC-AutoText': 'false', ...(headers || {}) },
  });

  // === Upload Vault docs ===
  const vaultUploads = [];
  for (const v of vaultAttachments) {
    const u = await uploadToVault({ bucketId, ...v });
    vaultUploads.push(u);
  }

  // === Post BC comment ===
  const recipientStr = [
    to && `<strong>To:</strong> ${escapeHtml([].concat(to).join(', '))}`,
    cc && cc.length && `<strong>Cc:</strong> ${escapeHtml([].concat(cc).join(', '))}`,
    bcc && bcc.length && `<strong>Bcc:</strong> ${escapeHtml([].concat(bcc).join(', '))}`,
  ].filter(Boolean).join(' &middot; ');
  const summary = bcSummary || `<div style="font-size:13px;color:#475569">Email sent. No additional summary provided.</div>`;
  const vaultBlock = vaultUploads.length ? `<div style="margin-top:14px"><strong>Produced documents (durable in BC Vault):</strong></div>
${vaultUploads.map((u) => `<div style="margin-top:6px"><a href="${u.vaultUrl}">${escapeHtml(u.filename)}</a> <bc-attachment sgid="${u.sgid}" caption="${escapeHtml(u.filename)}"></bc-attachment></div>`).join('')}` : '';

  const commentHtml = `<div style="background:#fef9e7;border-left:5px solid #d4a017;padding:14px 18px;border-radius:0 6px 6px 0">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#78350f;font-weight:700">Outbound email attached per operating doctrine</div>
<div style="font-size:13px;color:#78350f;margin-top:4px">Sent ${new Date().toISOString()}. Auto-attached by <code>sendWithBcAttach</code>.</div>
</div>
<div style="margin-top:12px"><strong>Subject:</strong> ${escapeHtml(subject)}</div>
<div style="margin-top:4px;font-size:13px;color:#475569">${recipientStr}</div>
<div style="margin-top:4px"><strong>Mandrill:</strong> <code>${escapeHtml(sent.messageId)}</code></div>
<hr style="border:none;border-top:1px solid #e2e8f0;margin:14px 0">
${summary}
${vaultBlock}`;

  const comment = await postTicketComment({ bucketId, ticketId, html: commentHtml });
  return { mandrillId: sent.messageId, commentUrl: comment.app_url, vaultUploads };
}

module.exports = { sendWithBcAttach };
