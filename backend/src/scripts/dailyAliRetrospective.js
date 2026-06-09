#!/usr/bin/env node
// P4 daily 24h retrospective — v1 DRY-RUN ONLY.
//
// Spun out of notification-plan todo 9942071243 (closed earlier this session)
// and tracked as follow-up todo 9959857610. v6 plan called for a 6 PM CT
// daily report covering "what landed in the last 24h" so Ali can scan +
// catch what he missed.
//
// Source: inbox_emails (Postgres, populated by InboxCOS sync)
// VIP source: inbox_vips
// Output (default): HTML preview file + console summary. NO BC post, NO email send.
// Output (--post-bc): also post the HTML as a comment on the meta tracking
//   todo (created on first run). Requires Ali's explicit go.
//
// Buckets:
//   1. VIP touches (anyone in inbox_vips)
//   2. Decisions / blockers (urgent keyword in subject or body)
//   3. Questions awaiting (subject contains '?' or starts with 'Re:')
//   4. Theme of the day (top 5 sender domains by volume)
//   5. Quiet noise (everything else - counted but not listed)

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const REPO = path.resolve(__dirname, '../../..');
const PREVIEW_OUT = path.join(REPO, 'tmp/p4-retrospective-preview.html');
const META_STATE_PATH = path.join(REPO, 'tmp/p4-meta-todo-id.json');
const POST_BC = process.argv.includes('--post-bc');
const OPEN_LOCAL = process.argv.includes('--open');

// BC config for --post-bc mode
const BC_TOKEN = process.env.BASECAMP_ACCESS_TOKEN || '';
const BC_H = { Authorization: 'Bearer ' + BC_TOKEN, 'User-Agent': 'Colaberry', Accept: 'application/json', 'Content-Type': 'application/json' };
const BC_BASE = 'https://3.basecampapi.com/3945211/buckets/7463955';  // Ali Personal
const AI_PRODUCTS_LIST_ID = 9939449052;
const ALI_ID = 17454835;

const URGENT_KEYWORDS = [
  'urgent', 'asap', 'deadline', 'emergency', 'immediate',
  'time-sensitive', 'critical', 'action required', 'past due',
  'overdue', 'final notice', 'last chance', 'decide', 'approve',
  'blocker', 'blocking', 'call me', 'now',
];

function pgQuery(sql) {
  // Runs psql via the host docker daemon. Caller passes a SQL string that
  // already escapes anything user-controlled (none here — all hardcoded).
  const env = { ...process.env };
  const r = spawnSync(
    'ssh',
    ['root@95.216.199.47', `docker exec -i accelerator-db psql -U accelerator -d accelerator_prod -tA -F'|' -c "${sql.replace(/"/g, '\\"')}"`],
    { encoding: 'utf8', timeout: 30000, env }
  );
  if (r.status !== 0) throw new Error(`pg ssh: ${(r.stderr || '').trim()}`);
  const out = (r.stdout || '').split('\n').filter(l => l && !/^WARNING|^DETAIL|^HINT/.test(l));
  return out;
}

function fetchInbox24h() {
  // Last 24h of inbox_emails, plus VIP join
  const sql = `SELECT i.id, i.provider, i.from_address, i.from_name, i.subject, COALESCE(LEFT(i.body_text, 200), ''), i.received_at::text, COALESCE(v.priority::text, '') FROM inbox_emails i LEFT JOIN inbox_vips v ON lower(i.from_address) = lower(v.email_address) WHERE i.received_at > NOW() - INTERVAL '24 hours' ORDER BY i.received_at DESC`;
  const rows = pgQuery(sql);
  return rows.map(line => {
    const [id, provider, from_address, from_name, subject, body_preview, received_at, vipPriority] = line.split('|');
    return { id, provider, from_address, from_name, subject, body_preview, received_at, vipPriority: vipPriority ? parseInt(vipPriority) : null };
  });
}

function fetchVips() {
  const sql = `SELECT email_address, name, priority FROM inbox_vips ORDER BY priority`;
  return pgQuery(sql).map(line => {
    const [email_address, name, priority] = line.split('|');
    return { email_address: email_address.toLowerCase(), name, priority: parseInt(priority) };
  });
}

function senderDomain(addr) {
  const at = (addr || '').lastIndexOf('@');
  if (at < 0) return 'unknown';
  return addr.slice(at + 1).toLowerCase();
}

function classify(emails) {
  const vipTouches = [];
  const decisions = [];
  const questions = [];
  const domainCounts = new Map();

  for (const e of emails) {
    const text = `${e.subject} ${e.body_preview}`.toLowerCase();
    const urgentKw = URGENT_KEYWORDS.find(k => text.includes(k));
    const subjectQ = (e.subject || '').includes('?');
    const isReply = /^re:/i.test(e.subject || '');

    if (e.vipPriority !== null) {
      vipTouches.push({ ...e, urgent_kw: urgentKw });
    } else if (urgentKw) {
      decisions.push({ ...e, urgent_kw: urgentKw });
    } else if (subjectQ || isReply) {
      questions.push(e);
    }

    const d = senderDomain(e.from_address);
    domainCounts.set(d, (domainCounts.get(d) || 0) + 1);
  }

  const topDomains = [...domainCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([domain, count]) => ({ domain, count }));

  return { vipTouches, decisions, questions, topDomains, total: emails.length };
}

function buildHtml(c, vips) {
  const now = new Date();
  const dateLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  const vipMap = new Map(vips.map(v => [v.email_address, v.name]));
  function vipName(addr) { return vipMap.get((addr || '').toLowerCase()) || addr; }
  function row(e, includeKw) {
    const kwBadge = includeKw && e.urgent_kw ? `<span style="background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:3px;font-size:10px;letter-spacing:0.5px;text-transform:uppercase;margin-left:6px">${e.urgent_kw}</span>` : '';
    const senderLabel = e.vipPriority !== null ? `<strong style="color:#7c3aed">${vipName(e.from_address)}</strong>` : (e.from_name || e.from_address);
    return `<tr>
<td style="padding:6px 8px;font-size:11px;color:#64748b;white-space:nowrap">${(e.received_at || '').slice(11, 16)}</td>
<td style="padding:6px 8px;font-size:12px">${senderLabel}</td>
<td style="padding:6px 8px;font-size:12px;color:#1e293b">${(e.subject || '(no subject)').slice(0, 80)}${kwBadge}</td>
</tr>`;
  }
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1a202c;line-height:1.55">
<div style="max-width:760px;margin:24px auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08)">

<div style="background:#0f172a;color:white;padding:22px 26px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">P4 daily 24h retrospective &middot; v1 DRAFT</div>
<div style="font-size:20px;font-weight:800;margin:6px 0 4px">${dateLabel}</div>
<div style="font-size:13px;color:#cbd5e0">${c.total} emails landed across your 3 inboxes in the last 24h</div>
</div>

<div style="padding:24px 26px">

<div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap">
<div style="flex:1;min-width:140px;background:#f3e8ff;padding:14px;border-radius:6px;text-align:center">
<div style="font-size:24px;font-weight:800;color:#7c3aed">${c.vipTouches.length}</div>
<div style="font-size:11px;color:#6d28d9;letter-spacing:1px;text-transform:uppercase;font-weight:700">VIP touches</div>
</div>
<div style="flex:1;min-width:140px;background:#fef3c7;padding:14px;border-radius:6px;text-align:center">
<div style="font-size:24px;font-weight:800;color:#92400e">${c.decisions.length}</div>
<div style="font-size:11px;color:#78350f;letter-spacing:1px;text-transform:uppercase;font-weight:700">Decisions / blockers</div>
</div>
<div style="flex:1;min-width:140px;background:#dbeafe;padding:14px;border-radius:6px;text-align:center">
<div style="font-size:24px;font-weight:800;color:#1d4ed8">${c.questions.length}</div>
<div style="font-size:11px;color:#1e40af;letter-spacing:1px;text-transform:uppercase;font-weight:700">Questions awaiting</div>
</div>
</div>

${c.vipTouches.length > 0 ? `
<h2 style="font-size:16px;color:#7c3aed;margin:0 0 10px">VIP touches (${c.vipTouches.length})</h2>
<table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e9d5ff;border-radius:6px;margin-bottom:22px;border-collapse:collapse">
${c.vipTouches.map(e => row(e, true)).join('')}
</table>` : `<div style="background:#f3e8ff;border-left:4px solid #7c3aed;padding:10px 14px;border-radius:4px;font-size:13px;color:#6d28d9;margin-bottom:22px">No VIP touches in the last 24h.</div>`}

${c.decisions.length > 0 ? `
<h2 style="font-size:16px;color:#92400e;margin:0 0 10px">Decisions / blockers (${c.decisions.length})</h2>
<table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #fde68a;border-radius:6px;margin-bottom:22px;border-collapse:collapse">
${c.decisions.map(e => row(e, true)).join('')}
</table>` : ''}

${c.questions.length > 0 ? `
<h2 style="font-size:16px;color:#1d4ed8;margin:0 0 10px">Questions awaiting / open threads (${c.questions.length})</h2>
<table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #bfdbfe;border-radius:6px;margin-bottom:22px;border-collapse:collapse">
${c.questions.slice(0, 20).map(e => row(e, false)).join('')}
${c.questions.length > 20 ? `<tr><td colspan="3" style="padding:6px 8px;font-size:11px;color:#64748b;text-align:center;font-style:italic">+ ${c.questions.length - 20} more</td></tr>` : ''}
</table>` : ''}

<h2 style="font-size:16px;color:#475569;margin:0 0 10px">Theme of the day &middot; top sender domains</h2>
<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:22px">
${c.topDomains.map(d => `<div style="background:#f1f5f9;padding:8px 14px;border-radius:20px;font-size:12px"><strong>${d.domain}</strong> &middot; ${d.count}</div>`).join('')}
</div>

<div style="background:#ebf4ff;border-left:4px solid #2b6cb0;padding:12px 16px;border-radius:4px;font-size:12px;color:#1e3a8a">
<strong>v1 draft.</strong> No external send fired. To go live: review this preview, then run with <code>--post-bc</code> to install the cron + post to a meta tracking todo on Ali Personal.
</div>

</div>
</div></body></html>`;
}

(async () => {
  console.log('=== P4 DAILY 24H RETROSPECTIVE v1 (DRY-RUN) ===');
  const emails = fetchInbox24h();
  console.log(`Fetched ${emails.length} emails from last 24h.`);
  const vips = fetchVips();
  console.log(`VIP list: ${vips.length} entries.`);
  const c = classify(emails);
  console.log('\nBuckets:');
  console.log(`  VIP touches:        ${c.vipTouches.length}`);
  console.log(`  Decisions/blockers: ${c.decisions.length}`);
  console.log(`  Questions awaiting: ${c.questions.length}`);
  console.log(`  Total inbox:        ${c.total}`);
  console.log(`  Top domains:        ${c.topDomains.map(d => `${d.domain}(${d.count})`).join(', ')}`);

  const html = buildHtml(c, vips);
  fs.mkdirSync(path.dirname(PREVIEW_OUT), { recursive: true });
  fs.writeFileSync(PREVIEW_OUT, html);
  console.log(`\nPreview HTML written: ${PREVIEW_OUT}`);

  if (OPEN_LOCAL && process.platform === 'win32') {
    spawnSync('cmd', ['/c', 'start', '', PREVIEW_OUT], { stdio: 'ignore' });
  }

  if (POST_BC) {
    // Read or create meta tracking todo
    let state = null;
    if (fs.existsSync(META_STATE_PATH)) {
      try { state = JSON.parse(fs.readFileSync(META_STATE_PATH, 'utf8')); } catch (_) {}
    }
    if (!state || !state.todoId) {
      console.log('\nNo meta tracking todo on file. Creating one in Ali Personal -> AI Products...');
      const r = await fetch(`${BC_BASE}/todolists/${AI_PRODUCTS_LIST_ID}/todos.json`, {
        method: 'POST', headers: BC_H,
        body: JSON.stringify({
          content: '[Tracking] Daily 24h retrospective',
          description: '<div><strong>What this todo is:</strong> the home for the P4 daily 24h retrospective. Every weekday at 6 PM CT a fresh comment lands here covering: VIP touches, decisions+blockers, questions awaiting, theme-of-day domains. Source: inbox_emails (Postgres) joined with inbox_vips. Spun out of notification-plan todo 9942071243 (closed 2026-06-03) per Ali greenlight on v1 preview.</div>',
          assignee_ids: [ALI_ID],
        }),
      });
      if (!r.ok) throw new Error(`Meta todo POST -> ${r.status} ${await r.text()}`);
      const todo = await r.json();
      state = { todoId: todo.id, todoUrl: todo.app_url, createdAt: new Date().toISOString() };
      fs.mkdirSync(path.dirname(META_STATE_PATH), { recursive: true });
      fs.writeFileSync(META_STATE_PATH, JSON.stringify(state, null, 2));
      console.log(`  meta todo: ${todo.id} ${todo.app_url}`);
    }
    // Post the daily comment
    const cr = await fetch(`${BC_BASE}/recordings/${state.todoId}/comments.json`, {
      method: 'POST', headers: BC_H,
      body: JSON.stringify({ content: html }),
    });
    if (!cr.ok) { console.error(`Comment POST failed: ${cr.status} ${await cr.text()}`); process.exit(1); }
    const cmt = await cr.json();
    console.log(`\nPosted daily retrospective comment: ${cmt.id} ${cmt.app_url}`);
  } else {
    console.log('\n--post-bc NOT set. No BC comment posted, no email sent. Dry-run complete.');
  }
})().catch(e => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
