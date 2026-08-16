#!/usr/bin/env node
/*
 * sendStudentUnblockEmails.js — the send harness for the STORY-000 unblock mail.
 *
 * Three modes, and the default is the safe one:
 *
 *   --dry-run       preflight every draft, send nothing, compose nothing
 *   --compose-only  preflight, then build the exact MIME that WOULD go out and
 *                   write it to disk for inspection. Still sends nothing.
 *   --send          actually send. Refuses unless a dedup table is proven to
 *                   exist, because this campaign has no other protection against
 *                   a double send.
 *
 * WHY A HARNESS AND NOT A ONE-LINER
 * ---------------------------------
 * The signature, the envelope BCC and the outbound-copy header used to be things
 * a send script bolted on at the last moment, which meant the verification gate
 * never saw them and could not check them. They are now properties of the DRAFT,
 * proved by verify-drafts.js, and this harness only assembles what the gate has
 * already approved. Anything it adds that the gate did not see is a bug.
 *
 * ENVELOPE BCC, DELIBERATELY
 * --------------------------
 * Ali gets a copy of every message. That copy is added to the SMTP envelope
 * (RCPT TO) and NOT as a header. A `Bcc:` header is a header like any other:
 * some clients render it, and a student seeing "Bcc: ali@colaberry.com" on their
 * own mail is a small betrayal of a warm message. There is therefore no `bcc`
 * field anywhere in this file, only an envelope recipient list, and preflight
 * asserts no Bcc or Cc header exists in the composed output.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BUSINESS_EVENT_ID = 'story000-unblock-2026-08-17';
const OUTBOUND_COPY_HEADER = 'X-Colaberry-Outbound-Copy';
const FROM_NAME = 'Ali Muwwakkil';
const FROM_ADDRESS = 'ali@colaberry.com';
const ENVELOPE_COPY_TO = 'ali@colaberry.com';

/**
 * Never mail these, under any mode. Duplicated from the fact-base generator on
 * purpose: an exclusion that lives in only one place is one edit away from being
 * gone, and the cost of the mistake here is a real message to a real person.
 */
const NEVER_MAIL = [
  { match: /^nzeribeikenna@gmail\.com$/i, why: 'do-not-email flag; withdrawn enrollment and an open refund question' },
  { match: /^rogation2000@yahoo\.fr$/i, why: "Marione's non-keeper account; the keeper is rogation2000.mn@gmail.com" },
  { match: /^ali(\+[^@]*)?@colaberry\.(com|ai)$/i, why: 'Ali himself, or an ali+ test fixture' },
  { match: /^e2e\+/i, why: 'end-to-end test fixture' },
  { match: /^test\+/i, why: 'test fixture' },
  { match: /^system@platform\.colaberry\.ai$/i, why: 'platform service account' },
];

const SIGNATURE_TEXT = [
  'Ali Muwwakkil',
  'Managing Director / AI Systems Architect',
  'Colaberry Inc.',
  '',
  '200 Chisholm Place, Suite 200, Plano, TX 75075',
  'ali@colaberry.com  |  enterprise.colaberry.ai',
  'Design Your AI Organization: https://advisor.colaberry.ai/advisory',
].join('\n');

const SIGNATURE_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; border-left: 3px solid #1a365d; padding-left: 14px; margin-top: 20px;">
  <tr><td>
    <div style="font-weight: 700; font-size: 16px; color: #1a365d;">Ali Muwwakkil</div>
    <div style="color: #2b6cb0; font-weight: 600;">Managing Director / AI Systems Architect</div>
    <div style="color: #718096;">Colaberry Inc.</div>
    <div style="margin-top: 10px; color: #2d3748;">200 Chisholm Place, Suite 200 &middot; Plano, TX 75075</div>
    <div style="color: #2d3748;"><a href="mailto:ali@colaberry.com" style="color: #2b6cb0; text-decoration: none;">ali@colaberry.com</a> &nbsp; <a href="https://enterprise.colaberry.ai" style="color: #2b6cb0; text-decoration: none;">enterprise.colaberry.ai</a></div>
    <div style="margin-top: 14px;">
      <a href="https://advisor.colaberry.ai/advisory" style="display: inline-block; background: #2b6cb0; color: #ffffff; padding: 9px 18px; border-radius: 20px; text-decoration: none; font-weight: 600;">Design Your AI Organization</a>
    </div>
  </td></tr>
</table>`;

// ──────────────────────────────────────────────────────────────────────── args

const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const has = (n) => args.includes(n);

const DRAFTS_DIR = argOf('--drafts');
const PEOPLE_PATH = argOf('--people');
const OUT_DIR = argOf('--out');
const DRY_RUN = has('--dry-run');
const COMPOSE_ONLY = has('--compose-only');
const SEND = has('--send');

if (!DRAFTS_DIR || !PEOPLE_PATH) {
  console.error('usage: sendStudentUnblockEmails.js --drafts <dir> --people <people.json> (--dry-run | --compose-only [--out <dir>] | --send)');
  process.exit(2);
}
if (!DRY_RUN && !COMPOSE_ONLY && !SEND) {
  console.error('refusing to run with no mode. Pass --dry-run, --compose-only or --send.');
  process.exit(2);
}

// ─────────────────────────────────────────────────────────────────── fact base

function loadPeople(p) {
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (Array.isArray(raw) || !raw.meta || !Array.isArray(raw.people)) {
    console.error('the fact base has no provenance stamp. Regenerate it with scripts/buildStudentFactBase.js.');
    process.exit(4);
  }
  return raw;
}

const factBase = loadPeople(PEOPLE_PATH);
const byEmail = new Map(factBase.people.map((x) => [x.email.toLowerCase(), x]));

// ───────────────────────────────────────────────────────────────────── parsing

function parseDraft(text, label) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) throw new Error(`${label}: missing front matter`);
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const mm = line.match(/^([a-z_]+):\s*(.*)$/);
    if (mm) meta[mm[1]] = mm[2].trim();
  }
  const body = m[2];
  const prose = (body.split(/^BODY\s*$/m)[1] || '').replace(/^\n+/, '').replace(/\s+$/, '');
  const names = [];
  const re = /^PROJECT_NAME:\s*(.+)$/gmi;
  let x;
  while ((x = re.exec(body)) !== null) names.push(x[1].trim());
  return { meta, prose, projectNames: names };
}

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Render the plain-text prose as the HTML part.
 *
 * The prose already ENDS with the plain-text signature (folded in at draft time
 * so the gate could check it). Here that trailing block is lifted off and
 * replaced with the branded HTML table, so the two parts carry the same
 * signature in the form each medium wants. If the text block were left in as
 * well the message would carry two signatures, which is the documented
 * 2026-05-30 violation.
 */
function toHtml(prose) {
  const idx = prose.lastIndexOf(SIGNATURE_TEXT);
  if (idx < 0) throw new Error('prose does not end with the plain-text signature');
  const bodyOnly = prose.slice(0, idx).replace(/\s+$/, '');
  const paragraphs = bodyOnly.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const html = paragraphs
    .map((p) => `<p style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.6;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
  return `${html}\n${SIGNATURE_HTML}`;
}

// ──────────────────────────────────────────────────────────────────── preflight

function preflight(file, draft) {
  const problems = [];
  const to = (draft.meta.to || '').toLowerCase();

  if (!to) problems.push('no `to` in front matter');
  for (const rule of NEVER_MAIL) {
    if (rule.match.test(to)) problems.push(`EXCLUDED RECIPIENT: ${to} (${rule.why})`);
  }

  const person = byEmail.get(to);
  if (!person) problems.push(`${to} is not in the verified fact base`);

  if (!draft.meta.subject) problems.push('no subject');
  if (draft.meta.business_event_id !== BUSINESS_EVENT_ID) {
    problems.push(`business_event_id must be "${BUSINESS_EVENT_ID}", got "${draft.meta.business_event_id}"`);
  }
  const expected = crypto.createHash('sha256')
    .update([to, draft.meta.subject || '', BUSINESS_EVENT_ID].join('|')).digest('hex').slice(0, 32);
  if (draft.meta.idempotency_key !== expected) {
    problems.push(`idempotency_key mismatch (expected ${expected})`);
  }

  if (!draft.prose.trim()) problems.push('empty body');
  if (!draft.prose.includes(SIGNATURE_TEXT)) problems.push('branded signature missing from the body');
  if (!draft.prose.replace(/\s+$/, '').endsWith(SIGNATURE_TEXT.split('\n').pop())) {
    problems.push('signature is not the last thing in the body');
  }
  if ((draft.prose.match(/Ali Muwwakkil/g) || []).length > 1) problems.push('duplicate signature');
  if (/\n\s*(?:best|thanks|cheers|regards|sincerely)?,?\s*\nAli\s*\n+Ali Muwwakkil/i.test(draft.prose)) {
    problems.push('both a bare "Ali" closer and the branded signature');
  }

  // Em-dash, with the same narrow exemption the gate applies: a student's own
  // verified project name is data, not Ali's prose.
  let styleProse = draft.prose;
  for (const n of draft.projectNames) {
    if (person && n === person.project_name) styleProse = styleProse.split(n).join('');
  }
  if (/—/.test(styleProse)) problems.push('em-dash in prose');

  // Project names, again, because this harness must never be the thing that
  // widens what the gate approved.
  for (const n of draft.projectNames) {
    if (!person || n !== person.project_name) {
      problems.push(`declared project name "${n}" is not ${to}'s live name (${person ? person.project_name : 'unknown'})`);
    }
  }

  return { to, person, problems, idempotencyKey: expected };
}

// ────────────────────────────────────────────────────────────────────── compose

function compose(draft, pre) {
  const text = draft.prose.replace(/\s+$/, '') + '\n';
  const html = toHtml(draft.prose);

  // Headers that will appear in the message. No Bcc. No Cc. Ever.
  const headers = {
    From: `"${FROM_NAME}" <${FROM_ADDRESS}>`,
    To: `"${pre.person.full_name}" <${pre.to}>`,
    Subject: draft.meta.subject,
    'MIME-Version': '1.0',
    [OUTBOUND_COPY_HEADER]: BUSINESS_EVENT_ID,
    'X-Colaberry-Idempotency-Key': pre.idempotencyKey,
    'X-MC-Track': 'none',
    'X-MC-AutoText': 'false',
  };

  // The SMTP envelope. Ali's copy lives HERE and nowhere else, which is what
  // makes it a true blind copy rather than a header a client can render.
  const envelope = {
    from: FROM_ADDRESS,
    to: [pre.to, ENVELOPE_COPY_TO],
  };

  const boundary = 'cb_' + crypto.randomBytes(12).toString('hex');
  const headerBlock = Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\r\n');
  const mime =
    `${headerBlock}\r\n` +
    `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n` +
    `--${boundary}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${text}\r\n` +
    `--${boundary}\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${html}\r\n` +
    `--${boundary}--\r\n`;

  return { headers, envelope, text, html, mime, headerBlock };
}

/** Assert the composed message is what we promised it would be. */
function auditComposed(c, pre) {
  const problems = [];
  if (/^(bcc|cc):/im.test(c.headerBlock)) problems.push('a Bcc or Cc header is present in the composed message');
  if (!c.envelope.to.map((x) => x.toLowerCase()).includes(ENVELOPE_COPY_TO)) {
    problems.push(`envelope does not carry the copy to ${ENVELOPE_COPY_TO}`);
  }
  if (!c.envelope.to.map((x) => x.toLowerCase()).includes(pre.to)) {
    problems.push('envelope does not carry the recipient');
  }
  if (c.headers[OUTBOUND_COPY_HEADER] !== BUSINESS_EVENT_ID) {
    problems.push(`${OUTBOUND_COPY_HEADER} header is wrong or missing`);
  }
  if (!c.html.includes('Managing Director / AI Systems Architect')) problems.push('HTML part has no branded signature');
  if (!c.text.includes('Managing Director / AI Systems Architect')) problems.push('text part has no branded signature');
  if ((c.html.match(/Ali Muwwakkil/g) || []).length > 1) problems.push('HTML part has a duplicate signature');
  if (/—/.test(c.text.replace(new RegExp(escapeRegex(pre.person.project_name || ' '), 'g'), ''))) {
    problems.push('em-dash in the text part');
  }
  return problems;
}

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ───────────────────────────────────────────────────────────────────────── main

const files = fs.readdirSync(DRAFTS_DIR).filter((f) => f.endsWith('.md') && f !== 'index.md').sort();
console.log(`SEND HARNESS  mode=${SEND ? 'SEND' : COMPOSE_ONLY ? 'COMPOSE-ONLY' : 'DRY-RUN'}`);
console.log(`fact base     ${PEOPLE_PATH}`);
console.log(`  stamped to  production ${factBase.meta.production_head_sha.slice(0, 12)}, generated ${factBase.meta.generated_at}`);
console.log(`drafts        ${files.length} in ${DRAFTS_DIR}\n`);

let failed = 0;
const seen = new Map();
const composed = [];

for (const f of files) {
  const draft = parseDraft(fs.readFileSync(path.join(DRAFTS_DIR, f), 'utf8'), f);
  const pre = preflight(f, draft);

  if (seen.has(pre.idempotencyKey)) pre.problems.push(`duplicate idempotency key, collides with ${seen.get(pre.idempotencyKey)}`);
  else seen.set(pre.idempotencyKey, f);

  let audit = [];
  let c = null;
  if (!pre.problems.length) {
    c = compose(draft, pre);
    audit = auditComposed(c, pre);
  }

  const all = [...pre.problems, ...audit];
  if (all.length) {
    failed++;
    console.log(`FAIL  ${f}`);
    for (const p of all) console.log(`      ${p}`);
  } else {
    composed.push({ file: f, ...c, to: pre.to });
    console.log(`ok    ${f.padEnd(18)} -> ${pre.to.padEnd(32)} env:[${c.envelope.to.join(', ')}]  key=${pre.idempotencyKey}`);
  }
}

console.log(`\nPREFLIGHT: ${files.length - failed}/${files.length}`);

if (failed) {
  console.log('\nrefusing to go further with a failing preflight.');
  process.exit(1);
}

// Every composed message carries the copy header and a true envelope BCC.
console.log(`every message carries ${OUTBOUND_COPY_HEADER}: ${BUSINESS_EVENT_ID}`);
console.log(`every envelope carries a blind copy to ${ENVELOPE_COPY_TO}, and no message has a Bcc or Cc header`);

if (COMPOSE_ONLY) {
  const dir = OUT_DIR || path.join(DRAFTS_DIR, '..', 'composed');
  fs.mkdirSync(dir, { recursive: true });
  for (const c of composed) {
    fs.writeFileSync(path.join(dir, c.file.replace(/\.md$/, '.eml')), c.mime, 'utf8');
    fs.writeFileSync(path.join(dir, c.file.replace(/\.md$/, '.envelope.json')), JSON.stringify(c.envelope, null, 1), 'utf8');
  }
  console.log(`\nwrote ${composed.length} composed messages to ${dir}`);
  console.log('NOTHING WAS SENT.');
  process.exit(0);
}

if (DRY_RUN) {
  console.log('\nDRY RUN. NOTHING WAS SENT.');
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────── --send
//
// Deliberately blocked. CLAUDE.md mandates dedup on
// (recipient, subject, business_event_id) for transactional Mandrill sends, and
// this campaign has no such table in production. Every draft already carries the
// key; until something CHECKS it before the SMTP call, the key is documentation
// rather than protection, and a retry would double-send to twenty five students.
console.error('\n--send is blocked.');
console.error('  There is no email dedup table in production keyed on');
console.error('  (recipient, subject, business_event_id). Without it the idempotency keys');
console.error('  carried by these drafts are documentation, not protection, and any retry');
console.error('  double-sends to real students.');
console.error('\n  Build the dedup table and check it inside the same transaction as the send');
console.error('  record, then remove this block.');
process.exit(3);
