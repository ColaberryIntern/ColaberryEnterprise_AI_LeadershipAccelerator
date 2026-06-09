#!/usr/bin/env node
// Anthropic Partner Network — per-person drill-down.
// For each cohort member: course completions, what's still missing, days
// until Jun 12 deadline, suggested next nudge.
//
// Source: Basecamp project 47477101 (Anthropic Partner Network onboarding).
// Each cohort member has their own todolist; each todo in that list is one
// required Anthropic Academy course / lesson.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

const BC_TOKEN = process.env.BASECAMP_ACCESS_TOKEN || '';
const BUCKET = 47477101;
const BASE = `https://3.basecampapi.com/3945211/buckets/${BUCKET}`;
const H = { Authorization: 'Bearer ' + BC_TOKEN, 'User-Agent': 'Colaberry', Accept: 'application/json', 'Content-Type': 'application/json' };
const DEADLINE = new Date('2026-06-12T23:59:59-05:00');
const COHORT_LIST_IDS = [
  { id: 9942692753, name: 'Angela Mezo' },
  { id: 9942251236, name: 'Srinivas Balla' },
  { id: 9940691151, name: 'Swati Raman' },
  { id: 9940691094, name: 'Taiwo Oludimimu' },
  { id: 9940691052, name: 'Jackie Chalk' },
  { id: 9940691006, name: 'Aleem' },
  { id: 9940690977, name: 'Sohail Syed' },
  { id: 9940690954, name: 'Sai Tejesh' },
  { id: 9940690926, name: 'Karun Swaroop' },
  { id: 9940690894, name: 'Kes Delele' },
];

function stripEmDashes(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }
function htmlEscape(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function shortDate(d) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function stripHtml(s) { return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }

async function bcGet(p) { const r = await fetch(p.startsWith('http') ? p : BASE + p, { headers: H }); if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`); return r.json(); }
async function bcGetAll(p) {
  let n = p.startsWith('http') ? p : BASE + p;
  const out = [];
  while (n) {
    const r = await fetch(n, { headers: H });
    if (!r.ok) break;
    const page = await r.json();
    if (!Array.isArray(page)) break;
    out.push(...page);
    const lh = (r.headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/);
    n = lh ? lh[1] : null;
  }
  return out;
}

function daysUntil(date) { return Math.ceil((date.getTime() - Date.now()) / 86400000); }

(async () => {
  const daysLeft = daysUntil(DEADLINE);
  const people = [];
  for (const p of COHORT_LIST_IDS) {
    try {
      const open = await bcGetAll(`/todolists/${p.id}/todos.json`);
      const done = await bcGetAll(`/todolists/${p.id}/todos.json?completed=true`);
      const total = open.length + done.length;
      const lastCompletion = done
        .map((t) => t.completion?.created_at || t.updated_at)
        .filter(Boolean)
        .sort()
        .pop();
      const recentlyCompleted = done.filter((t) => {
        const ts = t.completion?.created_at || t.updated_at;
        return ts && (Date.now() - new Date(ts).getTime()) < 7 * 86400000;
      });
      const stillOpen = open.map((t) => ({ id: t.id, title: stripEmDashes(stripHtml(t.content)).slice(0, 80) }));
      const completedTitles = done.map((t) => stripEmDashes(stripHtml(t.content)).slice(0, 80));
      people.push({
        name: p.name,
        listId: p.id,
        listUrl: `https://app.basecamp.com/3945211/buckets/${BUCKET}/todolists/${p.id}`,
        completedCount: done.length,
        openCount: open.length,
        total,
        lastCompletion,
        recentlyCompleted: recentlyCompleted.length,
        stillOpen,
        completedTitles,
      });
    } catch (e) { console.error(`fail ${p.name}: ${e.message}`); }
  }
  // Sort: people most at-risk first (least progress + no recent activity)
  people.sort((a, b) => {
    if (a.completedCount !== b.completedCount) return a.completedCount - b.completedCount;
    const aLast = a.lastCompletion ? new Date(a.lastCompletion).getTime() : 0;
    const bLast = b.lastCompletion ? new Date(b.lastCompletion).getTime() : 0;
    return aLast - bLast;
  });

  const totalCompleted = people.reduce((s, p) => s + p.completedCount, 0);
  const totalNeeded = 40; // 4 courses × 10 people
  const pctOverall = Math.round((totalCompleted / totalNeeded) * 100);
  const stalled = people.filter((p) => p.completedCount === 0);
  const finished = people.filter((p) => p.completedCount >= 4);
  const inProgress = people.filter((p) => p.completedCount > 0 && p.completedCount < 4);

  function statusFor(p) {
    if (p.completedCount >= 4) return { label: 'DONE', bg: '#dcfce7', color: '#166534', accent: '#16a34a' };
    if (p.completedCount === 0) return { label: 'STALLED', bg: '#fee2e2', color: '#991b1b', accent: '#dc2626' };
    if (p.recentlyCompleted > 0) return { label: 'MOVING', bg: '#fef9c3', color: '#854d0e', accent: '#ca8a04' };
    return { label: 'IDLE', bg: '#fed7aa', color: '#9a3412', accent: '#ea580c' };
  }

  const card = (p) => {
    const s = statusFor(p);
    const sinceLast = p.lastCompletion ? `${Math.round((Date.now() - new Date(p.lastCompletion).getTime()) / 86400000)} days ago` : 'never completed any';
    const openList = p.stillOpen.slice(0, 4).map((t) => `<li style="margin-bottom:2px">${htmlEscape(t.title)}</li>`).join('');
    return `
<div style="background:white;border:1px solid #e2e8f0;border-radius:6px;padding:14px;margin-bottom:10px">
  <div style="display:flex;justify-content:space-between;border-bottom:1px solid #f1f5f9;padding-bottom:8px;margin-bottom:8px">
    <div>
      <div style="font-size:14px;font-weight:700;color:#1a365d">${htmlEscape(p.name)}</div>
      <div style="font-size:11px;color:#64748b">Last completion: ${sinceLast}</div>
    </div>
    <div style="text-align:right">
      <span style="display:inline-block;padding:3px 8px;border-radius:8px;font-size:10px;font-weight:700;letter-spacing:1px;background:${s.bg};color:${s.color}">${s.label}</span>
      <div style="font-size:18px;font-weight:800;color:${s.accent};margin-top:4px">${p.completedCount} <span style="font-size:11px;color:#94a3b8;font-weight:400">of ${p.total}</span></div>
    </div>
  </div>
  ${openList ? `<div style="font-size:11px;color:#64748b;margin-bottom:2px"><strong>Still open</strong> (${p.stillOpen.length}):</div><ul style="margin:0 0 6px 18px;padding:0;font-size:12px;color:#475569">${openList}${p.stillOpen.length > 4 ? `<li style="color:#94a3b8;font-style:italic">+${p.stillOpen.length - 4} more</li>` : ''}</ul>` : '<div style="font-size:12px;color:#166534;font-weight:600">All required courses completed</div>'}
  <div style="margin-top:6px"><a href="${p.listUrl}" style="font-size:11px;color:#2b6cb0;text-decoration:none">View their BC list &rarr;</a></div>
</div>`;
  };

  const html = `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:arial,sans-serif">
<div style="max-width:720px;margin:0 auto;background:white;color:#1a202c;line-height:1.55">

<div style="background:linear-gradient(135deg,#1a365d 0%,#2b6cb0 100%);color:white;padding:28px 32px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Anthropic Partner Network &middot; Per-person drill-down</div>
<div style="font-size:24px;font-weight:800;margin-top:6px;line-height:1.25">${daysLeft} days to deadline (Jun 12)</div>
<div style="font-size:14px;color:#cbd5e0;margin-top:6px">${totalCompleted}/${totalNeeded} completions across 10 people (${pctOverall}%) &middot; ${stalled.length} stalled at zero &middot; ${finished.length} finished</div>
</div>

<div style="background:#1c1917;color:white;padding:18px 32px">
<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#fbbf24;font-weight:700">For Ali</div>
<div style="font-size:14px;margin-top:6px">Ali, this is the per-person view of the Anthropic Partner Network cohort so you know exactly who to chase. Sorted by most at-risk first. ${stalled.length} ${stalled.length === 1 ? 'person has' : 'people have'} not completed a single course yet ${daysLeft > 0 ? `with ${daysLeft} days left` : ''}. Each card shows what's still open and links to their Basecamp list.</div>
</div>

<div style="padding:24px 32px;background:#f8fafc">

${people.map(card).join('')}

<div style="background:white;border:1px solid #cbd5e0;border-radius:6px;padding:16px;margin-top:18px">
<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#1a365d;font-weight:700;margin-bottom:10px">Recommended chase script</div>
<div style="font-size:13px;color:#475569;line-height:1.7">
For STALLED (no completions): direct message, "[Name] - Anthropic Partner Network deadline is ${shortDate(DEADLINE)}. ${daysLeft} days left. You have not started any courses yet. What's blocking you? Reply by EOD."<br><br>
For IDLE (some progress, no recent): "[Name] - ${shortDate(DEADLINE)} deadline, ${daysLeft} days. You finished ${0} courses but haven't completed any in ${0} days. ${0} still open. Reply with your finish date."<br><br>
For MOVING (recent progress): no chase, just monitor.<br><br>
For DONE: thank-you note + ask them to mentor a stalled peer.
</div>
</div>

</div>
</div>
</body></html>`;

  const text = `Ali, Anthropic Partner per-person drill-down. ${daysLeft} days to deadline.\n${totalCompleted}/${totalNeeded} done. ${stalled.length} stalled, ${finished.length} finished.\n\n` +
    people.map((p, i) => {
      const sinceLast = p.lastCompletion ? `${Math.round((Date.now() - new Date(p.lastCompletion).getTime()) / 86400000)}d ago` : 'never';
      return `${i + 1}. ${p.name} [${statusFor(p).label}] - ${p.completedCount}/${p.total} done, last ${sinceLast}\n   still open: ${p.stillOpen.slice(0, 3).map((t) => t.title.slice(0, 50)).join('; ')}${p.stillOpen.length > 3 ? ` (+${p.stillOpen.length - 3})` : ''}\n`;
    }).join('');

  validateBeforeSend(stripEmDashes(html), stripEmDashes(text));
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    cc: 'alimuwwakkil@gmail.com',
    subject: `[Anthropic Partner] Drill-down - ${stalled.length} stalled, ${daysLeft} days to deadline`,
    text: stripEmDashes(text),
    html: stripEmDashes(html),
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false', 'Importance': stalled.length > 0 ? 'high' : 'normal' },
  });
  console.log('Sent:', r.messageId);
})().catch(e => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
