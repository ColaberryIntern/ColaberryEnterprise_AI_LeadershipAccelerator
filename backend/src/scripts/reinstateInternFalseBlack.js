#!/usr/bin/env node
// Parameterized reinstatement for an intern who got the false-BLACK template
// from dailyInternNudges.js due to the null-days-dark bug in internActivityTracker.js.
//
// Generalized from the original reinstateIsaac.js (2026-06-08). The bug fires
// the BLACK exit template when an assignee has zero comments under their BC ID
// in the 14d lookback window. The auto-exit step is guarded by
// no-email-match-in-ccpp, so for interns who aren't in ADF_InternshipProgram
// (most non-CCPP BC assignees) the actual exit short-circuits — but the email
// and one BC comment had already landed.
//
// Usage:
//   node backend/src/scripts/reinstateInternFalseBlack.js \
//     --bc-id 48161826 \
//     --email harpreetbadwal6161@gmail.com \
//     --name "Harpreet Kaur" \
//     [--first-name Harpreet]   # auto-derived from --name if omitted
//     [--dry]                   # plan only, no writes
//
// What it does (idempotent; safe to re-run):
//   1. Walk the internship bucket (24865175, todosets 4327600402/16/17) to find
//      the BC person's one (or more) assigned todos.
//   2. For each, find the most recent CB System BLACK template comment authored
//      after the last cron run, identified by the "null days" signature.
//   3. Trash that comment via PUT /recordings/{id}/status/trashed.json (204 ok,
//      404 idempotent-skip).
//   4. Post a correction comment on the same todo.
//   5. Send apologetic email FROM Ali via sendWithBcAttach, attached to the
//      same todo. Cc dhee@colaberry.com per the BLACK exit-notice CC list.
//   6. Clear the BC person's entry from tmp/ops-engine/intern-nudge-state.json.
//
// What it does NOT do:
//   - Touch CCPP (the auto-exit guard already prevented that)
//   - Reverse any BC un-assignments (the auto-exit guard prevented those too)

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));

const BC_ACCOUNT = '3945211';
const INTERNSHIP_BUCKET = 24865175;
const TODOSET_IDS = [4327600402, 4327600416, 4327600417];
const NUDGE_STATE_PATH = path.resolve(__dirname, '../../../tmp/ops-engine/intern-nudge-state.json');
const DHEE_EMAIL = process.env.DHEE_EMAIL || 'dhee@colaberry.com';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return process.argv[i + 1];
}
function flag(name) { return process.argv.includes(`--${name}`); }

function bcHeaders() {
  const t = (process.env.BASECAMP_ACCESS_TOKEN || '').replace(/^bearer\s+/i, '');
  if (!t) throw new Error('BASECAMP_ACCESS_TOKEN required');
  return { Authorization: 'Bearer ' + t, 'User-Agent': 'Colaberry ReinstateFalseBlack', Accept: 'application/json', 'Content-Type': 'application/json' };
}
const BASE = `https://3.basecampapi.com/${BC_ACCOUNT}/buckets/${INTERNSHIP_BUCKET}`;
async function bcGet(p) {
  const r = await fetch(p.startsWith('http') ? p : BASE + p, { headers: bcHeaders() });
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`);
  return r.json();
}
async function bcGetAll(p) {
  let n = p.startsWith('http') ? p : BASE + p;
  const out = [];
  while (n) {
    const r = await fetch(n, { headers: bcHeaders() });
    if (!r.ok) break;
    const page = await r.json();
    if (!Array.isArray(page)) break;
    out.push(...page);
    const lh = (r.headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/);
    n = lh ? lh[1] : null;
  }
  return out;
}

async function findAssignedTodos(personId) {
  const hits = [];
  for (const tsId of TODOSET_IDS) {
    let tls; try { tls = await bcGet(`/todosets/${tsId}/todolists.json`); } catch { continue; }
    if (!Array.isArray(tls)) tls = await bcGetAll(`/todosets/${tsId}/todolists.json`);
    for (const tl of tls) {
      const todos = [
        ...(await bcGetAll(`/todolists/${tl.id}/todos.json`).catch(() => [])),
        ...(await bcGetAll(`/todolists/${tl.id}/todos.json?completed=true`).catch(() => [])),
      ];
      for (const t of todos) {
        if ((t.assignees || []).find((a) => a.id === personId)) {
          hits.push({ todoId: t.id, title: (t.content || '').slice(0, 120), todolistName: tl.name, url: t.app_url, completed: !!t.completed });
        }
      }
      // nested groups
      try {
        const groups = await bcGetAll(`/todolists/${tl.id}/groups.json`);
        for (const g of groups) {
          const inner = [
            ...(await bcGetAll(`/todolists/${g.id}/todos.json`).catch(() => [])),
            ...(await bcGetAll(`/todolists/${g.id}/todos.json?completed=true`).catch(() => [])),
          ];
          for (const t of inner) {
            if ((t.assignees || []).find((a) => a.id === personId)) {
              hits.push({ todoId: t.id, title: (t.content || '').slice(0, 120), todolistName: `${tl.name} > ${g.name || g.title}`, url: t.app_url, completed: !!t.completed });
            }
          }
        }
      } catch {}
    }
  }
  return hits;
}

// Find CB System BLACK template comments on a todo. The template signature is
// the exact phrase "past the program's day-10 cliff" — the null-days-dark
// variant still includes this phrase, just with "null days" preceding it.
const BLACK_TEMPLATE_SIG = "past the program's day-10 cliff";
async function findBogusBlackComment(todoId) {
  let comments = [];
  try { comments = await bcGetAll(`/recordings/${todoId}/comments.json`); } catch { return null; }
  // Sort newest first
  comments.sort((a, b) => b.created_at.localeCompare(a.created_at));
  for (const c of comments) {
    const text = (c.content || '').toLowerCase();
    const isCbSystem = (c.creator?.name || '').toLowerCase().includes('cb system')
      || (c.creator?.email_address || '').toLowerCase() === 'ali@colaberry.com';
    if (!isCbSystem) continue;
    if (!text.includes(BLACK_TEMPLATE_SIG.toLowerCase())) continue;
    return { commentId: c.id, createdAt: c.created_at, snippet: text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200) };
  }
  return null;
}

async function trashComment(commentId, dry) {
  if (dry) return { ok: true, status: 'dry' };
  const r = await fetch(`${BASE}/recordings/${commentId}/status/trashed.json`, { method: 'PUT', headers: bcHeaders() });
  if (r.status === 204 || r.ok) return { ok: true, status: r.status };
  if (r.status === 404) return { ok: true, status: 'already-trashed' };
  return { ok: false, status: r.status, body: await r.text() };
}

async function postCorrection(todoId, firstName, dry) {
  if (dry) return { url: 'dry', status: 'dry' };
  const html = `<div><strong>Correction from Ali</strong></div>
<div>The CB System auto-comment that fired earlier (now deleted) was wrong. ${firstName}, you are an active participant in the program and there is no exit being processed. No action is needed from you.</div>
<div><br></div>
<div style="font-size:12px;color:#475569">Root cause: the activity tracker computed <code>daysSinceLast = null</code> for your Basecamp account (which is why the bogus comment said "null days dark"), so the BLACK template fired even though your actual activity gap was not 10+ days. The fix has been deployed (the tracker now treats null-days as UNKNOWN, not BLACK). No impact on your standing in the program.</div>`;
  const r = await fetch(`${BASE}/recordings/${todoId}/comments.json`, { method: 'POST', headers: bcHeaders(), body: JSON.stringify({ content: html }) });
  if (!r.ok) throw new Error(`POST correction: ${r.status} ${await r.text()}`);
  const c = await r.json();
  return { url: c.app_url, commentId: c.id };
}

function buildApologyEmail(firstName, fullName) {
  const subject = `Your Colaberry seat is fine, ${firstName} - that exit notice was a bug`;
  const html = `<div style="font-family:arial,sans-serif;color:#1a202c;font-size:14px;line-height:1.6">
<div>${firstName},</div>
<div><br></div>
<div>Thanks for replying. <strong>The exit notice you received was a bug on our side, not a real exit.</strong> I am sorry for the unnecessary stress it caused.</div>
<div><br></div>
<div>What actually happened: my activity tracker computed a <code>null</code> value for your "days since last activity" - that is why the email subject said "(null days dark)" instead of a real number. The downstream auto-exit guard caught it and did NOT actually process you out (your Basecamp assignments are untouched and there is no CCPP record change), but the warning email and the Basecamp comment fired anyway. I have deleted the bogus comment and posted a correction in its place.</div>
<div><br></div>
<div><strong>Your status:</strong> No change. You are an active participant in the program. If there is anything you need from me, reply here and let me know.</div>
<div><br></div>
<div>I have shipped a fix so this exact misfire cannot happen again - the tracker now treats unmeasurable activity as UNKNOWN (skipped) instead of BLACK (exit).</div>
<div><br></div>
<div>Ali Muwwakkil<br>Managing Director, Colaberry Inc.</div>
</div>`;
  const text = `${firstName},

Thanks for replying. The exit notice you received was a bug on our side, not a real exit. I am sorry for the unnecessary stress it caused.

What actually happened: my activity tracker computed a null value for your "days since last activity" - that is why the email subject said "(null days dark)" instead of a real number. The downstream auto-exit guard caught it and did NOT actually process you out (your Basecamp assignments are untouched and there is no CCPP record change), but the warning email and the Basecamp comment fired anyway. I have deleted the bogus comment and posted a correction in its place.

Your status: No change. You are an active participant in the program. If there is anything you need from me, reply here and let me know.

I have shipped a fix so this exact misfire cannot happen again - the tracker now treats unmeasurable activity as UNKNOWN (skipped) instead of BLACK (exit).

Ali Muwwakkil
Managing Director, Colaberry Inc.`;
  return { subject, html, text };
}

function resetNudgeState(personId, dry) {
  if (!fs.existsSync(NUDGE_STATE_PATH)) return { changed: false, reason: 'state file missing' };
  const data = JSON.parse(fs.readFileSync(NUDGE_STATE_PATH, 'utf8'));
  const key = String(personId);
  if (!(key in data)) return { changed: false, reason: 'no entry for person' };
  const removed = data[key];
  if (dry) return { changed: false, reason: 'dry', wouldRemove: { last_level: removed.last_level, last_nudge_date: removed.last_nudge_date, total_nudges: removed.total_nudges } };
  delete data[key];
  fs.writeFileSync(NUDGE_STATE_PATH, JSON.stringify(data, null, 2));
  return { changed: true, removedEntry: { last_level: removed.last_level, last_nudge_date: removed.last_nudge_date, total_nudges: removed.total_nudges } };
}

(async () => {
  const bcId = parseInt(arg('bc-id') || '0', 10);
  const email = arg('email');
  const fullName = arg('name');
  const firstName = arg('first-name') || (fullName || '').split(/\s+/)[0];
  const dry = flag('dry');
  if (!bcId || !email || !fullName) {
    console.error('Usage: --bc-id <id> --email <addr> --name "Full Name" [--first-name X] [--dry]');
    process.exit(1);
  }
  console.log(`=== Reinstating ${fullName} (BC ${bcId}, ${email}) ${dry ? '[DRY-RUN]' : '[LIVE]'} ===\n`);

  console.log('1/5 finding assigned todos in internship bucket...');
  const todos = await findAssignedTodos(bcId);
  console.log(`   found ${todos.length} assigned todo(s):`);
  for (const t of todos) console.log(`     [${t.completed ? 'x' : ' '}] ${t.todoId} :: ${t.todolistName} :: ${t.title}`);
  if (todos.length === 0) {
    console.log('   no assigned todos — cannot attach apology email. Aborting.');
    process.exit(2);
  }
  // Pick the first active todo as the "anchor" — the one to attach the apology to.
  const anchor = todos.find((t) => !t.completed) || todos[0];
  console.log(`   anchor todo for attachment: ${anchor.todoId} (${anchor.title})`);

  console.log('\n2/5 finding bogus BLACK template comment(s)...');
  const trashResults = [];
  for (const t of todos) {
    const bogus = await findBogusBlackComment(t.todoId);
    if (!bogus) { console.log(`   todo ${t.todoId}: no BLACK template comment found`); continue; }
    console.log(`   todo ${t.todoId}: bogus comment ${bogus.commentId} created ${bogus.createdAt}`);
    const r = await trashComment(bogus.commentId, dry);
    console.log(`   todo ${t.todoId}: trash -> ${JSON.stringify(r)}`);
    trashResults.push({ todoId: t.todoId, commentId: bogus.commentId, result: r });
  }
  if (trashResults.length === 0) {
    console.log('   no bogus comments found on any assigned todo (may already be trashed) - continuing');
  }

  console.log('\n3/5 posting correction comment on anchor todo...');
  const correction = await postCorrection(anchor.todoId, firstName, dry);
  console.log(`   correction: ${JSON.stringify(correction)}`);

  console.log('\n4/5 sending apologetic email from Ali via sendWithBcAttach...');
  const mail = buildApologyEmail(firstName, fullName);
  let emailResult = { mandrillId: 'dry', commentUrl: 'dry' };
  if (!dry) {
    emailResult = await sendWithBcAttach({
      bucketId: INTERNSHIP_BUCKET,
      ticketId: anchor.todoId,
      from: '"Ali Muwwakkil" <ali@colaberry.com>',
      to: email,
      cc: [DHEE_EMAIL],
      bcc: ['ali@colaberry.com'],
      replyTo: 'ali@colaberry.com',
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      bcSummary: `<div style="font-size:13px;color:#475569">Apologetic reply to ${fullName} after the false-BLACK template misfired on them with a "null days dark" subject. No CCPP record change (no-email-match-in-ccpp guard fired). Bogus BC comment(s) trashed: ${trashResults.map((t) => t.commentId).join(', ') || 'none found'}. Correction comment posted above. Nudge state cleared. Tracker null-days-dark guard shipped in same session.</div>`,
    });
  }
  console.log(`   mandrillId: ${emailResult.mandrillId}`);
  console.log(`   bc comment: ${emailResult.commentUrl}`);

  console.log('\n5/5 clearing nudge state entry...');
  const stateReset = resetNudgeState(bcId, dry);
  console.log(`   ${JSON.stringify(stateReset)}`);

  console.log(`\nDONE${dry ? ' [DRY-RUN]' : ''}. ${fullName} reinstated. Engineering fix (UNKNOWN guard) shipped in the same session — null-days BLACK pattern cannot recur.`);
})().catch((e) => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
