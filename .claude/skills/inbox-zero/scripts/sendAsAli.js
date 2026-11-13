// sendAsAli.js: the ONLY way this tab sends mail as Ali. Real client signature (HTML + inline logo), plain-text fallback,
// hard guards: the body is PLAIN TEXT (no HTML, ever), no dashes in the body, no sign-off/name at the end, signature
// exactly once, Ali always BCC'd.
// Input JSON on env SEND_JSON: { to, cc?, bcc?, subject, body, inReplyToMsgId?, attachments?: [{filename, path}], dry?: true }
// The kit (ali_signature.html + ali_signature_logo.png) must be at /tmp/ali-signature inside the container.
//
// C122 (11 Nov 2026): a session sent Jackie a body written in HTML. This script escapes the body (it is text), so the
// email arrived showing literal <p> tags, and the link-maker wrapped a URL that was already inside <a href="..."> a
// second time, garbling it. Ali: "We need to make sure you can't send out html like this. EVER". So a body containing
// HTML tags or HTML entities is now refused, in dry runs and live, before anything is built, and the finished email
// is checked again before it can go out.
//
// The guards are pure and exported so they are tested (sendAsAli.test.js, `node --test`); the send itself runs only when
// SEND_JSON is set, which is how send.sh invokes this file.
const fs = require('fs');

const KIT = '/tmp/ali-signature';
const PLAIN_SIG = ['Ali Muwwakkil', 'Managing Director / AI Systems Architect', 'Colaberry Inc.', '', '200 Chisholm Place, Suite 200, Plano, TX 75075', 'ali@colaberry.com  |  enterprise.colaberry.ai', 'Design Your AI Organization: https://advisor.colaberry.ai/advisory'].join('\n');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const linkify = (s) => s.replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}" style="color:#3a8fb5;text-decoration:none;">${u}</a>`);

// Real HTML tag names only, so plain text such as "x < 5" or an address written as <someone@example.com> is not refused.
const HTML_TAG = /<\s*\/?\s*(p|a|br|div|span|b|i|u|s|strong|em|small|font|ul|ol|li|table|thead|tbody|tr|td|th|h[1-6]|img|hr|blockquote|pre|code|section|header|footer|html|head|body|style|script|meta|link|center|sup|sub)\b[^<>]*>/i;
const HTML_ENTITY = /&(?:[a-z][a-z0-9]{1,7}|#\d{1,6}|#x[0-9a-f]{1,6});/i;

/** Reasons a body cannot be sent, or [] when it is fine. Pure. */
function bodyGuards(body, j = {}) {
  const fails = [];
  const tag = body.match(HTML_TAG);
  if (tag) {
    fails.push(`body contains HTML (${tag[0].slice(0, 40)}). The body must be PLAIN TEXT: write paragraphs separated by a blank line, and paste links as bare URLs (they are linked automatically). This script adds the HTML itself.`);
  }
  const ent = body.match(HTML_ENTITY);
  if (ent) fails.push(`body contains an HTML entity (${ent[0]}). Write the character itself: & ' " < >`);
  if (/[—–]/.test(body)) fails.push('body contains an em or en dash');
  if (/\n\s*(best|thanks|thank you|regards|sincerely|cheers|warmly)[,.!]?\s*(\n\s*ali[\s.!]*)?$/i.test(body)) fails.push('body ends with a sign-off');
  if (/\n\s*ali( muwwakkil)?\s*[.!]?\s*$/i.test(body)) fails.push('body ends with the name');
  if (/Managing Director/i.test(body)) fails.push('body already contains a signature');
  if (!j.to || !j.subject) fails.push('to and subject are required');
  return fails;
}

/** The HTML for the message body (before the signature). Pure. */
function renderBody(body) {
  return body.split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px 0;">${linkify(esc(p)).replace(/\n/g, '<br>')}</p>`).join('');
}

/**
 * Second lock, on the FINISHED body HTML: nothing that reads as escaped markup, and every link well formed. If the
 * first check ever has a gap, this one stops the email instead of letting a reader see raw tags. Pure.
 */
function renderedGuards(bodyHtml) {
  const fails = [];
  if (/&lt;\s*\/?\s*[a-z]/i.test(bodyHtml)) fails.push('the rendered email would show raw HTML tags to the reader');
  if (/&amp;(?:[a-z]+|#\d+);/i.test(bodyHtml)) fails.push('the rendered email would show a raw HTML entity to the reader');
  const opens = (bodyHtml.match(/<a\s/gi) || []).length;
  const closes = (bodyHtml.match(/<\/a>/gi) || []).length;
  if (opens !== closes) fails.push(`the rendered email has ${opens} links opened but ${closes} closed`);
  for (const m of bodyHtml.matchAll(/href="([^"]*)"/gi)) {
    if (/[<>\s]/.test(m[1]) || /&quot;|&lt;|&gt;/.test(m[1])) { fails.push(`a link is malformed: ${m[1].slice(0, 60)}`); break; }
  }
  return fails;
}

async function main() {
  const j = JSON.parse(process.env.SEND_JSON);
  const body = String(j.body || '').replace(/\r/g, '').trim();
  const fails = bodyGuards(body, j);
  if (fails.length) { console.log(JSON.stringify({ error: 'guard', fails })); process.exit(1); }
  const sigHtml = fs.readFileSync(`${KIT}/ali_signature.html`, 'utf8');
  const cid = (sigHtml.match(/cid:([^"']+)/) || [])[1];
  const paragraphs = renderBody(body);
  const rendered = renderedGuards(paragraphs);
  if (rendered.length) { console.log(JSON.stringify({ error: 'guard', fails: rendered })); process.exit(1); }
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111;">${paragraphs}<div style="height:16px;"></div>${sigHtml}</div>`;
  const text = `${body}\n\n${PLAIN_SIG}`;
  if ((html.match(/Managing Director/g) || []).length !== 1 || (text.match(/Managing Director/g) || []).length !== 1) { console.log(JSON.stringify({ error: 'signature count is not exactly one' })); process.exit(1); }
  let headers = {};
  if (j.inReplyToMsgId) {
    const { getColaberryGmailClient } = require('/app/dist/services/inbox/inboxSyncService');
    const g = getColaberryGmailClient();
    const o = await g.users.messages.get({ userId: 'me', id: j.inReplyToMsgId, format: 'metadata', metadataHeaders: ['Message-ID', 'References'] });
    const h = {}; for (const x of o.data.payload.headers || []) h[x.name.toLowerCase()] = x.value;
    headers = { inReplyTo: h['message-id'], references: [h.references, h['message-id']].filter(Boolean).join(' ') };
  }
  const attachments = [{ filename: 'colaberry-logo.png', path: `${KIT}/ali_signature_logo.png`, cid, contentDisposition: 'inline' }, ...(j.attachments || []).map((a) => ({ filename: a.filename, path: a.path }))];
  const bcc = [j.bcc, 'ali@colaberry.com'].filter(Boolean).join(', ');
  const summary = { to: j.to, cc: j.cc || null, bcc, subject: j.subject, threaded: !!headers.inReplyTo, html_signature: /alt="Colaberry"/.test(html), logo_cid: cid, attachments: attachments.slice(1).map((a) => a.filename) };
  if (j.dry) { console.log(JSON.stringify({ dry: true, ...summary })); console.log('\n' + text); process.exit(0); }
  const nodemailer = require('nodemailer');
  const t = nodemailer.createTransport({ host: 'smtp.mandrillapp.com', port: 587, secure: false, auth: { user: 'apikey', pass: process.env.MANDRILL_API_KEY } });
  const info = await t.sendMail({ from: '"Ali Muwwakkil" <ali@colaberry.com>', to: j.to, cc: j.cc, bcc, subject: j.subject, text, html, attachments, ...headers });
  console.log(JSON.stringify({ sent: true, accepted: info.accepted, rejected: info.rejected, response: String(info.response).slice(0, 40), ...summary }));
  process.exit(0);
}

module.exports = { bodyGuards, renderBody, renderedGuards };

if (process.env.SEND_JSON) {
  main().catch((e) => { console.log(JSON.stringify({ error: e.message.slice(0, 300) })); process.exit(1); });
}
