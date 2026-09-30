// sendAsAli.js: the ONLY way this tab sends mail as Ali. Real client signature (HTML + inline logo), plain-text fallback,
// hard guards: no dashes in the body, no sign-off/name at the end, signature exactly once, Ali always BCC'd.
// Input JSON on env SEND_JSON: { to, cc?, bcc?, subject, body, inReplyToMsgId?, attachments?: [{filename, path}], dry?: true }
// The kit (ali_signature.html + ali_signature_logo.png) must be at /tmp/ali-signature inside the container.
const fs = require('fs');
const nodemailer = require('nodemailer');
const { getColaberryGmailClient } = require('/app/dist/services/inbox/inboxSyncService');
const KIT = '/tmp/ali-signature';
const PLAIN_SIG = ['Ali Muwwakkil', 'Managing Director / AI Systems Architect', 'Colaberry Inc.', '', '200 Chisholm Place, Suite 200, Plano, TX 75075', 'ali@colaberry.com  |  enterprise.colaberry.ai', 'Design Your AI Organization: https://advisor.colaberry.ai/advisory'].join('\n');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const linkify = (s) => s.replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}" style="color:#3a8fb5;text-decoration:none;">${u}</a>`);
(async () => {
  const j = JSON.parse(process.env.SEND_JSON);
  const body = String(j.body || '').replace(/\r/g, '').trim();
  const fails = [];
  if (/[\u2014\u2013]/.test(body)) fails.push('body contains an em or en dash');
  if (/\n\s*(best|thanks|thank you|regards|sincerely|cheers|warmly)[,.!]?\s*(\n\s*ali[\s.!]*)?$/i.test(body)) fails.push('body ends with a sign-off');
  if (/\n\s*ali( muwwakkil)?\s*[.!]?\s*$/i.test(body)) fails.push('body ends with the name');
  if (/Managing Director/i.test(body)) fails.push('body already contains a signature');
  if (!j.to || !j.subject) fails.push('to and subject are required');
  if (fails.length) { console.log(JSON.stringify({ error: 'guard', fails })); process.exit(1); }
  const sigHtml = fs.readFileSync(`${KIT}/ali_signature.html`, 'utf8');
  const cid = (sigHtml.match(/cid:([^"']+)/) || [])[1];
  const paragraphs = body.split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px 0;">${linkify(esc(p)).replace(/\n/g, '<br>')}</p>`).join('');
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111;">${paragraphs}<div style="height:16px;"></div>${sigHtml}</div>`;
  const text = `${body}\n\n${PLAIN_SIG}`;
  if ((html.match(/Managing Director/g) || []).length !== 1 || (text.match(/Managing Director/g) || []).length !== 1) { console.log(JSON.stringify({ error: 'signature count is not exactly one' })); process.exit(1); }
  let headers = {};
  if (j.inReplyToMsgId) {
    const g = getColaberryGmailClient();
    const o = await g.users.messages.get({ userId: 'me', id: j.inReplyToMsgId, format: 'metadata', metadataHeaders: ['Message-ID', 'References'] });
    const h = {}; for (const x of o.data.payload.headers || []) h[x.name.toLowerCase()] = x.value;
    headers = { inReplyTo: h['message-id'], references: [h.references, h['message-id']].filter(Boolean).join(' ') };
  }
  const attachments = [{ filename: 'colaberry-logo.png', path: `${KIT}/ali_signature_logo.png`, cid, contentDisposition: 'inline' }, ...(j.attachments || []).map((a) => ({ filename: a.filename, path: a.path }))];
  const bcc = [j.bcc, 'ali@colaberry.com'].filter(Boolean).join(', ');
  const summary = { to: j.to, cc: j.cc || null, bcc, subject: j.subject, threaded: !!headers.inReplyTo, html_signature: /alt="Colaberry"/.test(html), logo_cid: cid, attachments: attachments.slice(1).map((a) => a.filename) };
  if (j.dry) { console.log(JSON.stringify({ dry: true, ...summary })); console.log('\n' + text); process.exit(0); }
  const t = nodemailer.createTransport({ host: 'smtp.mandrillapp.com', port: 587, secure: false, auth: { user: 'apikey', pass: process.env.MANDRILL_API_KEY } });
  const info = await t.sendMail({ from: '"Ali Muwwakkil" <ali@colaberry.com>', to: j.to, cc: j.cc, bcc, subject: j.subject, text, html, attachments, ...headers });
  console.log(JSON.stringify({ sent: true, accepted: info.accepted, rejected: info.rejected, response: String(info.response).slice(0, 40), ...summary }));
  process.exit(0);
})().catch((e) => { console.log(JSON.stringify({ error: e.message.slice(0, 300) })); process.exit(1); });
