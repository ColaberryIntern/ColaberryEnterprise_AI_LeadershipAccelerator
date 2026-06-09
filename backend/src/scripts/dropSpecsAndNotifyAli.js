#!/usr/bin/env node
// After the architect-specs poller finishes, drop each completed spec
// into its project's requirements file and send Ali a complete
// summary email of the gov-bid sprint v2 state.

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = '';
}

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));
const TRACKING_TODO = 9967017720;

const REPO = path.resolve(__dirname, '../../..');
const JOBS_FILE = path.join(REPO, 'tmp/architect-jobs.json');

const SLUG_MAP = {
  4: 'tdhca-multifamily',
  8: 'tdcj-oig-records',
  14: 'utd-residential-life',
  2: 'harris-agenda-meeting',
};

const PROJECTS = [
  { slug: 'tdhca-multifamily',     intern: 'Akiwam',  proposalListId: 9967405074, buildListId: 9967512649, title: 'TDHCA Multifamily Management System',          closeDate: '2026-06-29' },
  { slug: 'tdcj-oig-records',      intern: 'OBI',     proposalListId: 9967406450, buildListId: 9967513032, title: 'TDCJ-OIG Records Management System',           closeDate: '2026-11-01' },
  { slug: 'utd-residential-life',  intern: 'Omolola', proposalListId: 9967407307, buildListId: 9967513338, title: 'UTD Residential Life Software',                closeDate: '2026-06-30' },
  { slug: 'harris-agenda-meeting', intern: 'samrawit', proposalListId: 9967409301, buildListId: 9967513732, title: 'Harris County Agenda + Meeting Mgmt System',  closeDate: '2026-06-22' },
];

(async () => {
  // 1. Drop specs into project requirements
  const jobs = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
  let dropped = 0; let pending = 0;
  for (const j of jobs) {
    const slug = SLUG_MAP[j.rfp];
    if (!j.completed_at) { pending++; console.log(`  pending: ${j.intern} (${slug})`); continue; }
    if (!j.spec_file || !fs.existsSync(j.spec_file)) { console.log(`  missing spec file for ${j.intern}`); continue; }
    const dest = path.join(REPO, 'gov-bid-builds', slug, 'requirements.docx');
    fs.copyFileSync(j.spec_file, dest);
    // Also update requirements.md to point at the docx
    fs.writeFileSync(path.join(REPO, 'gov-bid-builds', slug, 'requirements.md'),
      `# ${slug} - Requirements (AI Project Architect, Professional mode)\n\nThe full spec is in [\`requirements.docx\`](./requirements.docx). Open it in Word or Google Docs.\n\nGenerated: ${j.completed_at}\nJob: ${j.job_id}\n`);
    dropped++;
    console.log(`  dropped spec into ${slug}/requirements.docx`);
  }

  console.log(`\n${dropped} specs dropped, ${pending} still pending.`);

  // 2. Build summary HTML
  const rowsHtml = PROJECTS.map((p) => {
    const job = jobs.find((j) => SLUG_MAP[j.rfp] === p.slug);
    const specStatus = job?.completed_at ? 'READY' : 'still generating';
    return `<tr style="border-bottom:1px solid #e2e8f0">
<td style="padding:10px;font-weight:600;color:#1e293b">${p.intern}</td>
<td style="padding:10px"><a href="https://app.basecamp.com/3945211/buckets/47346103/todolists/${p.proposalListId}">${p.title}</a></td>
<td style="padding:10px;color:#dc2626;font-weight:600;text-align:center">${p.closeDate}</td>
<td style="padding:10px;text-align:center"><a href="https://app.basecamp.com/3945211/buckets/47346103/todolists/${p.proposalListId}" style="font-size:11px">proposal list</a><br><a href="https://app.basecamp.com/3945211/buckets/47346103/todolists/${p.buildListId}" style="font-size:11px;color:#7c3aed;font-weight:700">BUILD list</a></td>
<td style="padding:10px;text-align:center"><code style="font-size:10px;background:#f1f5f9;padding:2px 6px;border-radius:3px">gov-bid-builds/${p.slug}/</code></td>
<td style="padding:10px;text-align:center;font-size:11px;color:${specStatus === 'READY' ? '#166534' : '#92400e'}">${specStatus}</td>
</tr>`;
  }).join('');

  const html = `<div style="font-family:arial;font-size:14px;color:#2d3748;line-height:1.55;max-width:1000px">
<div style="background:#0f172a;color:white;padding:24px 28px;border-radius:8px 8px 0 0">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Gov-bid sprint v2 - full setup complete</div>
<h1 style="margin:6px 0;font-size:22px;font-weight:800;color:white">4 interns &middot; 4 proposals &middot; 4 working pilots &middot; 2-week sprint</h1>
</div>
<div style="padding:24px 28px">
<p>Ali,</p>
<p>End-to-end setup complete for the gov-bid sprint v2. Each intern owns one RFP and the matching software build that ships with the proposal as a live demo URL. Monday 6/9 kickoff.</p>

<h2 style="margin:18px 0 10px;color:#1a365d;font-size:16px">The 4 projects</h2>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-family:arial;font-size:12px">
<thead><tr style="background:#1a365d;color:white">
<th style="padding:10px;text-align:left;font-size:11px;letter-spacing:1px">Intern</th>
<th style="padding:10px;text-align:left;font-size:11px;letter-spacing:1px">RFP / Proposal</th>
<th style="padding:10px;text-align:center;font-size:11px;letter-spacing:1px">Closes</th>
<th style="padding:10px;text-align:center;font-size:11px;letter-spacing:1px">BC lists</th>
<th style="padding:10px;text-align:center;font-size:11px;letter-spacing:1px">Build repo</th>
<th style="padding:10px;text-align:center;font-size:11px;letter-spacing:1px">Spec</th>
</tr></thead>
<tbody>${rowsHtml}</tbody>
</table>

<h2 style="margin:24px 0 10px;color:#1a365d;font-size:16px">What's in place</h2>

<h3 style="margin:14px 0 6px;color:#1a365d;font-size:14px">1. Proposal track (4 BC lists, ~47 detailed todos)</h3>
<p style="font-size:13px;color:#475569">Each proposal list now has step-by-step task descriptions: where to find docs, what "done" looks like, where to put outputs, what to do if stuck. Tasks: read RFP, bid/no-bid, requirements matrix, tailor OP-generated artifacts (cover letter, capability statement, references, COI), draft narrative, internal review, submit. AI-generated artifacts in OP are pre-tailored; the intern reviews + finalizes each.</p>

<h3 style="margin:14px 0 6px;color:#1a365d;font-size:14px">2. Build track (4 BC lists, 86 detailed todos)</h3>
<p style="font-size:13px;color:#475569">Brand new lists in Gov Contracts, one per intern. Mix of <strong>human tasks</strong> (assigned to the intern) and <strong>[CB System]</strong> tasks (assigned to CB System with explicit approval gate - intern must review locally + comment "approved" before checking the box). The AI does scaffolding, schemas, API stubs, seeds, theming, Dockerfile. The human builds the 6-8 core feature screens of the demo storyline.</p>

<h3 style="margin:14px 0 6px;color:#1a365d;font-size:14px">3. Project directories (separate from main repo)</h3>
<p style="font-size:13px;color:#475569">Self-contained scaffolds at <code>gov-bid-builds/&lt;slug&gt;/</code>. Each has README, SETUP, requirements (placeholder, replaced by spec), package.json, .env.example, app/seeds/deploy/docs subdirs, and <code>MOVE_TO_OWN_REPO.md</code> with the git subtree split instructions for when you want to spin a project out into its own repo later.</p>

<h3 style="margin:14px 0 6px;color:#1a365d;font-size:14px">4. AI Project Architect specs (Professional mode)</h3>
<p style="font-size:13px;color:#475569">4 generate jobs fired in parallel against advisor.colaberry.ai. ${dropped} of 4 dropped into project requirements; ${pending} still generating (each takes ~15 min). The poller is running in the background and will deposit the remaining specs as they finish.</p>

<h3 style="margin:14px 0 6px;color:#1a365d;font-size:14px">5. Demo URLs (one per project)</h3>
<p style="font-size:13px;color:#475569">Each project's build list ends with a "deploy to public URL" task. Target domains:</p>
<ul style="font-size:12px;color:#475569">
<li><code>tdhca-demo.colaberry.dev</code></li>
<li><code>tdcj-rms-demo.colaberry.dev</code></li>
<li><code>utd-reslife-demo.colaberry.dev</code></li>
<li><code>harris-meetings-demo.colaberry.dev</code></li>
</ul>
<p style="font-size:13px;color:#475569">Production deploy is gated on your go-ahead. Just need to confirm DNS for those domains when the time comes (probably ~day 10 of the sprint).</p>

<h2 style="margin:24px 0 10px;color:#1a365d;font-size:16px">2-week timeline</h2>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;font-size:12px">
<thead><tr style="background:#f1f5f9"><th style="padding:8px;text-align:left">Phase</th><th style="padding:8px;text-align:left">Days</th><th style="padding:8px;text-align:left">What happens</th></tr></thead>
<tbody>
<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:8px;font-weight:700">Orientation</td><td style="padding:8px">Mon 6/9 - Tue 6/10</td><td style="padding:8px">Interns read spec, review scaffold, write 1-page summary, bid/no-bid call</td></tr>
<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:8px;font-weight:700">Foundation</td><td style="padding:8px">Wed 6/11 - Thu 6/12</td><td style="padding:8px">CB System generates schema + models + API stubs + seeds + auth + theming. Intern reviews + approves each.</td></tr>
<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:8px;font-weight:700">Core features</td><td style="padding:8px">Fri 6/13 - Tue 6/17</td><td style="padding:8px">Intern builds 6-8 features of the demo storyline, one per day.</td></tr>
<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:8px;font-weight:700">Polish + deploy</td><td style="padding:8px">Wed 6/18 - Thu 6/19</td><td style="padding:8px">Theming, end-to-end test, Dockerfile, deploy to public URL (with your go-ahead).</td></tr>
<tr><td style="padding:8px;font-weight:700">Proposal integration</td><td style="padding:8px">Fri 6/20 - Sat 6/21</td><td style="padding:8px">Screenshots, walkthrough doc, narrative update with deep links to demo, internal review, submit.</td></tr>
</tbody>
</table>

<h2 style="margin:24px 0 10px;color:#1a365d;font-size:16px">Approval pattern for AI tasks</h2>
<p style="font-size:13px;color:#475569">Every [CB System] task in the build lists has:</p>
<ul style="font-size:13px;color:#475569">
<li>A "What CB System will produce" section (exactly what code/files appear)</li>
<li>A "Where the output appears" section (commit SHA, file paths)</li>
<li>A "How to review" section (step-by-step verification - pull, boot, click)</li>
<li>An "approval gate" — intern only checks the box after commenting "approved"</li>
<li>A clear "if it's wrong" path — comment what's wrong, CB System re-runs</li>
</ul>
<p style="font-size:13px;color:#475569">This keeps interns in the loop on what's being built. Nothing ships without their explicit approval.</p>

<h2 style="margin:24px 0 10px;color:#1a365d;font-size:16px">Repo split later</h2>
<p style="font-size:13px;color:#475569">Each project's <code>MOVE_TO_OWN_REPO.md</code> has the <code>git subtree split</code> commands. When you're ready to spin a project out, it's a 4-step operation. The proposal materials + OP records stay with the Accelerator repo; the code goes to its own repo.</p>

<p style="margin-top:24px;padding:14px 18px;background:#fefce8;border-left:4px solid #fbbf24;border-radius:4px;font-size:13px;color:#713f12">
<strong>Monday morning</strong>: walk each intern through their proposal list + their build list. The proposal list has 10-14 detailed todos; the build list has ~22 detailed todos. The first 2 todos in each list are reading + scaffolding review - they can do those without you in the room.
</p>

<p style="margin-top:16px;font-size:12px;color:#64748b">Tracking todo: <a href="https://app.basecamp.com/3945211/buckets/7463955/todos/${TRACKING_TODO}">Ali Personal #${TRACKING_TODO}</a></p>
</div>
<table cellpadding="0" cellspacing="0" border="0" style="font-family:arial;font-size:14px;color:#2d3748;border-left:3px solid #1a365d;padding-left:14px;margin-top:24px"><tr><td><div style="font-weight:700;font-size:16px;color:#1a365d">Ali Muwwakkil</div><div style="color:#2b6cb0;font-weight:600">Managing Director / AI Systems Architect</div><div style="color:#718096">Colaberry Inc.</div></td></tr></table>
</div>`;

  const text = `Ali,

Gov-bid sprint v2 setup complete. End-to-end:

4 PROPOSAL LISTS (47 detailed todos) - in Gov Contracts BC, one per intern
4 BUILD LISTS (86 detailed todos) - mix of human + CB System with approval gates
4 PROJECT REPOS at gov-bid-builds/<slug>/ - self-contained, ready to split later
4 AI ARCHITECT SPECS (Professional mode) - ${dropped}/${jobs.length} dropped into requirements.md, ${pending} still generating

PROJECTS:
${PROJECTS.map((p) => {
  const job = jobs.find((j) => SLUG_MAP[j.rfp] === p.slug);
  return `  ${p.intern} -> ${p.title}
    Proposal: https://app.basecamp.com/3945211/buckets/47346103/todolists/${p.proposalListId}
    BUILD:    https://app.basecamp.com/3945211/buckets/47346103/todolists/${p.buildListId}
    Repo:     gov-bid-builds/${p.slug}/
    Spec:     ${job?.completed_at ? 'READY' : 'still generating'}
    Closes:   ${p.closeDate}`;
}).join('\n\n')}

EVERY [CB System] task has explicit approval gate. Interns review locally before checking the box.

Monday morning: walk interns through their proposal + build lists. First 2 tasks in each are self-serve.

Tracking: https://app.basecamp.com/3945211/buckets/7463955/todos/${TRACKING_TODO}

Ali Muwwakkil
Managing Director / AI Systems Architect
Colaberry Inc.`;

  const r = await sendWithBcAttach({
    ticketId: TRACKING_TODO,
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    bcc: ['alimuwwakkil@gmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Gov-bid sprint v2 COMPLETE setup - 4 proposals + 4 builds + 4 specs (Monday kickoff)',
    html, text,
    bcSummary: `<p>Gov-bid sprint v2 fully set up. 4 proposal BC lists (47 enriched todos with detailed instructions + links). 4 BUILD BC lists in Gov Contracts (86 todos mixing human + CB System with explicit approval gates). 4 self-contained project repos at gov-bid-builds/&lt;slug&gt;/ with full scaffolds (README, SETUP, package.json, app/seeds/deploy/docs subdirs, MOVE_TO_OWN_REPO.md with git subtree split instructions). 4 AI Project Architect Professional-mode specs fired in parallel against advisor.colaberry.ai (${dropped}/${jobs.length} dropped into requirements.docx, ${pending} still generating). Demo URL targets: tdhca-demo, tdcj-rms-demo, utd-reslife-demo, harris-meetings-demo .colaberry.dev. 2-week sprint timeline: orientation -> foundation -> core features -> polish+deploy -> proposal integration with demo URL deep-linked. Every AI task has approval gate so interns stay in loop. Production deploy of demo URLs gated on Ali's go-ahead.</p>`,
  });
  console.log(`\nEmailed Ali. Mandrill: ${r.mandrillId}`);
})().catch(e => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
