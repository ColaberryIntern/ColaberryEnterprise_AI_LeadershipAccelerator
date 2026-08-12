#!/usr/bin/env node
// buildMeganWalkthrough.js
//
// Renders a self-contained HTML walkthrough of the TalentSignal Revenue Engine
// build: what each story actually does, in plain English, with Megan's own
// verification notes and her real screenshots embedded as data URIs.
//
// Built for Ali to understand the build before approving its three phase gates,
// so it leads with what the thing DOES and keeps the engineering detail as
// supporting evidence rather than the headline.
//
// Inputs: the harvest produced by the Basecamp pull (megan.json) plus the
// compressed screenshot directory + manifest. No network at render time.
//
//   node backend/src/scripts/buildMeganWalkthrough.js \
//     --data <megan.json> --img <small/> --out docs/MEGAN_TALENTSIGNAL_WALKTHROUGH.html

const fs = require('fs');
const path = require('path');
const { STYLES } = require(path.resolve(__dirname, './lib/internDashboardStyles'));

function arg(f, d = null) { const i = process.argv.indexOf(f); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; }
const DATA = arg('--data'), IMGDIR = arg('--img'), OUT = arg('--out');
if (!DATA || !IMGDIR || !OUT) { console.error('need --data --img --out'); process.exit(2); }

const harvest = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(IMGDIR, 'manifest.json'), 'utf8'));
const BUCKET = 24865175;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const dataUri = (() => {
  const cache = new Map();
  return (file) => {
    const m = manifest[file];
    if (!m) return null;
    if (cache.has(m.file)) return cache.get(m.file);
    const p = path.join(IMGDIR, m.file);
    if (!fs.existsSync(p)) return null;
    const uri = 'data:image/jpeg;base64,' + fs.readFileSync(p).toString('base64');
    cache.set(m.file, uri);
    return uri;
  };
})();

// ---------------------------------------------------------------------------
// Plain-English layer. The story titles are written for engineers; these are
// written for the person deciding whether to approve the release. `what` is the
// capability in business terms, `why` is why it earns its place, `note` is the
// single most interesting engineering fact worth an executive's attention.
// ---------------------------------------------------------------------------
const PLAIN = {
  'S-01': { what: 'The app exists and runs.', why: 'One command brings up the website, the server and the database together. Everything after this is built on it.', note: 'Every request writes one line of log with an ID you can trace end to end. She caught three defects in her own review before shipping it, including a logger that went silent on cancelled requests.' },
  'S-02': { what: 'People can register and log in securely.', why: 'Without accounts there are no roles, and without roles nothing else can be restricted.', note: 'She closed two attacks that were not in the spec: one that let you discover which email addresses exist, and a timing trick that leaks the same thing. She proved passwords never reach the logs by scanning all output for the raw text.' },
  'S-03': { what: 'One job signal becomes one scored opportunity, end to end.', why: 'The thinnest possible version of the whole product, working. It proves the idea before anything is built on top.', note: 'This is where she was left without the scoring factors, built a defensible model instead of inventing numbers quietly, and labelled it as awaiting your review.' },
  'S-04': { what: 'The demand board: companies ranked by how likely they are to be hiring.', why: 'This is the product. Everything before it was foundation; this is the screen a salesperson opens in the morning.', note: 'She found the first version wrote to the database once per record in a loop, which would never survive real volume, and replaced it with a single bulk write. 10,000 records in about 0.7 seconds against a 5 second target.' },
  'S-05': { what: 'Clients, candidates and job openings can be managed.', why: 'The real records the rest of the system reasons about.', note: 'Personal data is tagged at the database level, and a salesperson simply does not receive candidate contact details in the response. She separated "this is personal data" from "hide this", so a candidate name stays visible for matching while still being erasable later.' },
  'S-06': { what: 'Given a job, the system ranks the candidates who fit it.', why: 'The matchmaking core. It is what a recruiter would otherwise do by memory.', note: 'Every ranking comes with the reasons behind it, not just a number.' },
  'S-07': { what: 'Opportunities get a score so the best ones surface first.', why: 'Turns a long list into a prioritised queue.', note: 'Reuses the same scorer as the earlier stories rather than introducing a second one, so the numbers cannot drift apart.' },
  'S-08': { what: 'A sales pipeline: opportunities move through stages.', why: 'The day-to-day workflow a sales manager lives in.', note: 'Every stage change is written to a log the database itself prevents anyone from editing afterwards. That append-only guarantee is enforced below the application, so a bug in the app cannot rewrite history.' },
  'S-09': { what: 'The AI drafts a proposal. A human sends it. Never the machine.', why: 'She calls this the keystone, and she is right: it is the line between a useful assistant and something that emails your clients on its own.', note: 'She proved it by disabling every outbound path and showing nothing fires, during drafting and during release. Releasing requires a deliberate human action, and who released it and when is recorded permanently.' },
  'S-10': { what: 'Finds warm introductions: who already knows someone at the target company.', why: 'A warm path is worth more than any amount of cold outreach.', note: 'Deliberately simple, no graph database, because you asked for lightweight. Confidence multiplies along the chain, so one weak link drags the whole path down and a direct relationship always beats a two-hop guess.' },
  'S-11': { what: 'Recruiters rate recommendations good or bad, and it is remembered.', why: 'The beginning of the system learning from the people using it.', note: 'Stored now, used later. She flagged honestly that it keeps only the latest rating per person rather than full history, and asked whether that is enough for the bias-correction intent.' },
  'S-12': { what: 'The manager dashboard: placements, time-to-hire, demand score.', why: 'The three numbers an agency manager actually runs the business on.', note: 'Computed live from the real audit trail, not stored figures that can drift. A test reads the personal-data registry and proves no personal field appears anywhere in the analytics, so it stays true automatically as new fields are added.' },
  'S-13': { what: 'Forecasts demand ahead of time.', why: 'Moves the product from describing today to anticipating next month.', note: 'Shipped without a write-up comment, so this is the one story here with the least visible evidence.' },
  'S-14': { what: 'Roles decide what each person can see and do.', why: 'A recruiter, a salesperson and an admin should not see the same system.', note: 'Enforced on the server, not just hidden in the interface, which is the difference between real access control and a cosmetic one.' },
  'S-15': { what: 'People can have their personal data erased, and it is provable.', why: 'The legal obligation, and the one that carries real consequences if it is faked.', note: 'Marked as a human task rather than an AI one, and shipped with no comment thread.' },
  'S-16': { what: 'Stops the CRM filling with duplicates, and lets a bad write be undone.', why: 'Data quality is what makes every number above trustworthy.', note: 'This is where she found the contradiction nobody asked her to look for: a rollback could restore data somebody had legally erased. She refused to exempt the snapshots and raised it rather than picking the convenient answer.' },
  'S-17': { what: 'Flags revenue anomalies and segments clients.', why: 'Tells the manager where the money is behaving oddly.', note: 'Closes out the analytics and trust release.' },
  'S-18': { what: 'Performance and load validation.', why: 'Proves it holds up under real volume.', note: 'Not started.' },
  'S-19': { what: 'End-to-end tests, seed data and continuous integration.', why: 'What stops the next change quietly breaking the last one.', note: 'Not started.' },
  'S-20': { what: 'Deploy to a public demo URL with onboarding docs.', why: 'Was the last step before go-live.', note: 'Superseded 2026-08-12: no demo hosting. This becomes a recorded local walkthrough instead.' },
};

const RELEASE_BLURB = {
  'R0 - Walking skeleton': 'The thinnest slice that works end to end: an app that runs, people who can log in, and one signal turning into one scored opportunity. Nothing here is impressive on its own. It is the floor everything else stands on.',
  'R1 - Core intelligence surfaces': 'The actual product appears. Companies ranked by hidden hiring demand, real client and candidate records behind it, and candidates ranked against a job.',
  'R2 - Pipeline and human-in-the-loop': 'Where it becomes a working sales tool, and where the trust line gets drawn: the AI drafts, a human releases. Nothing leaves the platform on its own.',
  'R3 - Analytics, trust and compliance': 'The manager view, plus the unglamorous work that makes the numbers trustworthy: roles, erasure, duplicate prevention and an audit trail the database itself protects.',
  'R4 - Launch readiness': 'Not started. Load testing, automated end-to-end tests, and what was going to be a public demo.',
  'MILESTONE APPROVALS - Ali': 'Your three gates. All three are open, the oldest for 22 days, on a project that is 17 of 20 done.',
};

function storyKey(title) { const m = String(title).match(/\bS-(\d+)\b/); return m ? 'S-' + m[1] : null; }

// Kind is decided by mean brightness, precomputed into the manifest: a dev
// terminal is near-black, a web UI on this palette is near-white. Labelling
// matters because 29 of her 32 attachments are terminal output, and an
// unlabelled wall of screenshots implies visual proof of a product that these
// images do not actually show.
function imagesFor(task) {
  const seen = new Set();
  const out = [];
  for (const c of task.comments) for (const im of c.images) {
    const m = manifest[im.file];
    if (!m || seen.has(m.file)) continue;
    seen.add(m.file);
    const uri = dataUri(im.file);
    if (uri) out.push({ uri, w: m.w, h: m.h, kind: m.kind || 'evidence' });
  }
  return out;
}
const KIND_LABEL = { ui: 'the interface', terminal: 'terminal / test output', evidence: 'evidence' };

function meganNote(task) {
  const c = task.comments.filter((x) => /megan/i.test(x.author || ''));
  if (!c.length) return null;
  return c.map((x) => x.text).join('\n\n');
}

// ---------------------------------------------------------------------------
function renderStory(task) {
  const key = storyKey(task.title);
  const p = PLAIN[key] || {};
  const imgs = imagesFor(task);
  const note = meganNote(task);
  const clean = esc(task.title.replace(/^[^A-Za-z]*/, '').replace(/\s*\[[^\]]+\]\s*$/, ''));
  const done = task.completed;

  return `<article class="card story ${done ? '' : 'todo'}" id="${key}">
  <div class="storyhead">
    <div>
      <span class="skey">${esc(key || '')}</span>
      <h3>${esc(p.what || clean)}</h3>
      <div class="stitle">${clean}</div>
    </div>
    <span class="badge ${done ? 'good' : 'neutral'}">${done ? 'Built' : 'Not started'}</span>
  </div>
  ${p.why ? `<p class="why"><strong>Why it matters.</strong> ${esc(p.why)}</p>` : ''}
  ${p.note ? `<p class="note2"><strong>Worth knowing.</strong> ${esc(p.note)}</p>` : ''}
  ${imgs.length ? `<div class="shots">${imgs.map((im, i) => `<figure><img loading="lazy" src="${im.uri}" alt="${esc(key)} ${esc(KIND_LABEL[im.kind])} ${i + 1}"><figcaption><span class="kind ${esc(im.kind)}">${esc(KIND_LABEL[im.kind])}</span> ${esc(key)} &middot; ${i + 1} of ${imgs.length}</figcaption></figure>`).join('')}</div>` : ''}
  ${note ? `<details class="acc"><summary>Megan's own write-up and verification</summary><div class="accbody"><pre class="verbatim">${esc(note)}</pre></div></details>` : ''}
  <a class="tlink" href="${esc(task.url)}" target="_blank" rel="noopener">Open this story in Basecamp &rarr;</a>
</article>`;
}

// The 20 requirements from "TalentSignal Revenue Engine - 01 - Requirements"
// (Basecamp doc, created 2026-07-21), checked against what actually shipped.
// `state`: met | partial | unbuilt. `note` explains anything other than a clean met.
const REQS = [
  ['REQ-001', 'must', 'Hidden Demand Analysis with a confidence score', 'S-03, S-04', 'met', ''],
  ['REQ-002', 'must', 'Client Matchmaking: ranked, explained candidates', 'S-05, S-06', 'met', ''],
  ['REQ-003', 'must', 'Opportunity Scoring, 0..1 from transparent factors', 'S-07', 'met', 'Score breakdown is inspectable and versioned. Opportunities scored before S-07 cannot be reconstructed and are marked non-auditable rather than given a fake breakdown.'],
  ['REQ-004', 'must', 'Sales Pipeline Management', 'S-08', 'met', ''],
  ['REQ-005', 'must', 'AI drafts an opportunity package, human releases', 'S-09', 'met', ''],
  ['REQ-006', 'should', 'Warm Relationship Identification', 'S-10', 'met', ''],
  ['REQ-007', 'should', 'Predictive Analysis with a confidence interval', 'S-13', 'met', 'Marked complete but shipped with no write-up comment, so this is one of only two stories with no evidence trail at all.'],
  ['REQ-008', 'should', 'Recommendation Engine with feedback loop', 'S-11', 'met', 'Her open decision 019: only the latest rating per recruiter is kept, not full history, which may not satisfy the stated "correct bias over time" intent.'],
  ['REQ-009', 'must', 'Reporting and Analytics KPI dashboard', 'S-12', 'met', ''],
  ['REQ-010', 'must', 'Authentication, JWT, MFA-ready', 'S-02', 'met', 'MFA-ready, not MFA. The requirement only asks for ready.'],
  ['REQ-011', 'must', 'Role-Based Access Control per route and resource', 'S-14', 'met', ''],
  ['REQ-012', 'must', 'Data Privacy: consent, encryption, access and erasure', 'S-15', 'met', 'Shipped with no write-up comment. Given this is the GDPR/CCPA requirement, it is the one place the missing evidence actually matters.'],
  ['REQ-013', 'must', 'Append-only audit trail', 'S-15', 'met', 'Enforced by a database trigger rather than application code, so a bug in the app cannot rewrite history.'],
  ['REQ-014', 'should', 'CRM Pollution Prevention, rollback on bad update', 'S-16', 'met', 'Where she found the rollback-versus-erasure contradiction and raised it instead of picking the convenient answer.'],
  ['REQ-015', 'could', 'Client Segmentation and Targeting', 'S-17', 'met', ''],
  ['REQ-016', 'could', 'Revenue anomaly detection with alerting', 'S-17', 'met', ''],
  ['REQ-017', 'must', 'Performance: p95 under 200ms, 1000 concurrent users', 'S-18', 'unbuilt', 'Not started. Also amended on 2026-08-12: authentication endpoints are now scoped out of the 200ms budget, because bcrypt at cost 12 exceeds it by design and weakening it to hit a dashboard number would trade real security for a metric.'],
  ['REQ-018', 'must', 'Dockerized, CI on GitHub Actions, public demo URL', 'S-01, S-19, S-20', 'partial', 'Docker is done (S-01). CI and end-to-end tests (S-19) are not started. The public demo URL (S-20) was cancelled outright on 2026-08-12, so as written this requirement can no longer be fully satisfied and needs rewording to a recorded local walkthrough.'],
  ['REQ-019', 'must', 'Data Ingestion through provider adapters (mocked for the demo)', 'S-03, S-04', 'met', 'Built exactly as specified. The requirement itself says mocked, so the absence of a real data source is a decision recorded in the requirements, not an oversight by the builder. It is still the single biggest thing between this and something real.'],
  ['REQ-020', 'must', 'Nothing outbound without explicit human release', 'S-09', 'met', 'Proven by disabling every outbound path and showing nothing fires, during drafting and during release.'],
];

const ARCH = `flowchart LR
  A["Job signals<br/>(reposted roles,<br/>days open, no salary)"] --> B["SignalAgent<br/>scores hidden demand"]
  B --> C["Demand board<br/>ranked companies"]
  C --> D["MatchAgent<br/>ranks candidates for a job"]
  D --> E["PackageAgent<br/>drafts a proposal"]
  E --> F{"HUMAN<br/>releases it"}
  F -->|approved| G["Sent by a person"]
  F -.->|nothing auto-sends| H["No outbound path exists"]
  C --> I["PipelineAgent<br/>stages + warm intros"]
  I --> J["InsightAgent<br/>manager dashboard"]
  K["ComplianceAgent<br/>PII registry, erasure,<br/>append-only audit"] -.-> C
  K -.-> I
  K -.-> J`;

const releases = harvest.releases.map((r) => {
  const tasks = r.tasks.slice().sort((a, b) => {
    const ka = storyKey(a.title) || 'S-99', kb = storyKey(b.title) || 'S-99';
    return parseInt(ka.slice(2), 10) - parseInt(kb.slice(2), 10);
  });
  const done = tasks.filter((t) => t.completed).length;
  return { ...r, tasks, done };
});

const totalTasks = releases.filter((r) => !/MILESTONE/i.test(r.name)).reduce((s, r) => s + r.tasks.length, 0);
const totalDone = releases.filter((r) => !/MILESTONE/i.test(r.name)).reduce((s, r) => s + r.done, 0);
const uniqueShots = new Map();
for (const m of Object.values(manifest)) if (!uniqueShots.has(m.file)) uniqueShots.set(m.file, m);
const shotCount = uniqueShots.size;
const uiCount = [...uniqueShots.values()].filter((m) => m.kind === 'ui').length;

const html = `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TalentSignal Revenue Engine - what Megan built</title>
<style>${STYLES}
.story{padding:22px;margin-bottom:18px;border-left:4px solid var(--good)}
.story.todo{border-left-color:var(--neutral);opacity:.85}
.storyhead{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:10px}
.skey{font-size:11px;font-weight:800;letter-spacing:1.5px;color:var(--accent)}
.story h3{font-size:19px;margin:4px 0 3px;line-height:1.3}
.stitle{font-size:12px;color:var(--muted)}
.why{font-size:14.5px;margin:10px 0}
.note2{font-size:13.5px;color:var(--muted);background:var(--neutral-bg);padding:12px 14px;border-radius:var(--r-sm);margin:10px 0}
.shots{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:12px;margin:14px 0}
.shots figure{margin:0}
.shots img{width:100%;border:1px solid var(--border);border-radius:var(--r-sm);cursor:zoom-in;display:block;background:#fff}
.shots figcaption{font-size:11px;color:var(--muted);margin-top:5px;display:flex;align-items:center;gap:6px}
.reqnote{font-size:12px;color:var(--muted);margin-top:5px;line-height:1.5}
.kind{font-size:9.5px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;padding:2px 6px;border-radius:3px}
.kind.terminal{background:var(--neutral-bg);color:var(--muted)}
.kind.ui{background:var(--good-bg);color:var(--good)}
.kind.mixed,.kind.evidence{background:var(--warn-bg);color:var(--warn)}
.verbatim{white-space:pre-wrap;font-family:var(--font);font-size:13px;line-height:1.6;margin:0;padding:14px;color:var(--text)}
.tlink{font-size:12.5px;font-weight:600;display:inline-block;margin-top:6px}
.relhead{margin:34px 0 14px}
.relhead h2{font-size:22px}
.relblurb{font-size:14.5px;color:var(--muted);max-width:820px;margin-top:8px}
.lightbox{position:fixed;inset:0;background:rgba(8,12,20,.92);display:none;align-items:center;justify-content:center;z-index:200;cursor:zoom-out;padding:24px}
.lightbox.on{display:flex}
.lightbox img{max-width:100%;max-height:100%;border-radius:6px}
</style>
</head>
<body>
<div id="progress"></div>
<nav class="top"><div class="wrap">
  <div class="brand"><span class="dot"></span>TalentSignal &middot; what Megan built</div>
  <div class="navlinks" id="navlinks">
    <a href="#summary" data-scroll>Summary</a>
    <a href="#origin" data-scroll>Origin</a>
    <a href="#reqs" data-scroll>Requirements</a>
    <a href="#how" data-scroll>How it works</a>
    ${releases.map((r) => `<a href="#${r.name.replace(/[^A-Za-z0-9]/g, '')}" data-scroll>${esc(r.name.split(' - ')[0].replace('MILESTONE APPROVALS', 'Your gates'))}</a>`).join('')}
    <a href="#verdict" data-scroll>What to do</a>
  </div>
  <div class="navtools">
    <button class="btn" id="theme" title="Light / dark">&#9686;</button>
    <button class="btn" id="print">Print</button>
    <button class="btn navtoggle" id="navtoggle">&#9776;</button>
  </div>
</div></nav>

<header class="hero"><div class="wrap">
  <div class="eyebrow">Colaberry &middot; Internship build review</div>
  <h1>TalentSignal Revenue Engine</h1>
  <div class="sub">What Megan Dimiyo-Mbenoun has actually built, story by story, in plain English, with her own screenshots. Written so you can approve the three open gates knowing what you are approving.</div>
  <div class="herometa">
    <span>${totalDone} of ${totalTasks} stories built</span>
    <span>${shotCount} screenshots from her own runs</span>
    <span>2 screen recordings</span>
    <span>3 gates waiting on you</span>
  </div>
</div></header>

<section id="summary"><div class="wrap">
  <div class="sechead"><div><span class="num">01</span><h2>What this thing is</h2></div></div>
  <div class="card callout">
    <h3>A staffing agency's revenue engine</h3>
    <p>It watches the job market for signs a company is quietly struggling to hire, ranks those companies by how likely the demand is, matches your candidates against the roles, drafts the proposal, and tracks the deal through to placement. A manager dashboard sits on top with the three numbers the business runs on.</p>
    <p><strong>The line it deliberately does not cross:</strong> the AI drafts, a human sends. There is no outbound path in the code at all, and Megan proved that by disabling every possible one and showing nothing fires.</p>
  </div>
  <div class="card callout">
    <h3>Where it stands</h3>
    <p><strong>${totalDone} of ${totalTasks} stories are built.</strong> Releases R0 through R3 are complete: the foundation, the demand board, the sales pipeline with the human release gate, and the analytics and compliance layer. What is left is R4, launch readiness: load testing, end-to-end tests, and what was going to be a public demo.</p>
    <p>Your three approval gates cover work that is already finished. The oldest has been open 22 days.</p>
  </div>
  <div class="card callout warn">
    <h3>Read the pictures with this in mind</h3>
    <p><strong>Only ${uiCount} of the ${shotCount} screenshots below show the actual interface.</strong> The other ${shotCount - uiCount} are terminal output: test suites passing, migrations running, code under review. Each one is labelled so you can tell them apart at a glance.</p>
    <p>That is not padding on her part, it is what she was asked for. Every story required proof that the acceptance criteria passed, and she supplied it thoroughly. But it does mean <strong>there is very little visual record of the product itself</strong>, which is worth knowing before you approve it, and is exactly what the recorded walkthrough now on her plate will fix.</p>
  </div>
</div></section>

<section id="origin"><div class="wrap">
  <div class="sechead"><div><span class="num">02</span><h2>Where this project came from</h2></div></div>
  <p class="seclede">Worth reading first if you do not remember commissioning it.</p>
  <div class="card pad">
    <dl class="dl">
      <dt>Created</dt><dd><strong>2026-07-21 at 15:06</strong>, under Ali's Basecamp identity.</dd>
      <dt>Generated from</dt><dd>A 160 KB document, <em>TalentSignal Revenue Engine - Build Guide v1</em>, dated the same day and still attached in the project's Docs &amp; Files folder.</dd>
      <dt>How that document was made</dt><dd>It reads as machine output, not something written by hand. Its opening profile is a set of slugs: <code>Problem: hidden_demand</code>, <code>Target User: staffing_agencies</code>, <code>Value Proposition: proactive_sales</code>, <code>Monetization: subscription_fee</code>. That is the shape the AI Project Architect produces when it expands a short idea into a full build guide.</dd>
      <dt>How it became a Basecamp plan</dt><dd>The story-build pipeline turned the guide into 20 requirements, 20 stories across 5 releases, and the to-do list Megan has been working from. That pipeline runs identity-guarded as Ali, which is why every document and the list itself show him as the author.</dd>
    </dl>
    <div class="note">So the chain was: a short idea, expanded by one tool into a build guide, expanded by a second tool into a work plan, published under Ali's name. It is entirely possible for this project to exist, and to be well specified, without Ali having consciously specified it. That is worth knowing before judging the work inside it.</div>
  </div>
  <div class="card callout warn">
    <h3>Three features in the source guide never became requirements</h3>
    <p>The Build Guide lists <strong>Automated Email Follow-ups</strong>, <strong>Client Engagement Tools</strong> and <strong>Real-time Analytics</strong> among its selected features. None of them appear in the 20 requirements.</p>
    <p>Dropping the email follow-ups was the right call and probably deliberate: automatic outbound email would directly contradict REQ-020, the rule that nothing leaves the platform without a human releasing it. The other two simply fell away between the two documents.</p>
  </div>
</div></section>

<section id="reqs"><div class="wrap">
  <div class="sechead"><div><span class="num">03</span><h2>Requirements versus what shipped</h2></div>
    <span class="badge ${REQS.filter((r) => r[4] === 'met').length === REQS.length ? 'good' : 'warning'}">${REQS.filter((r) => r[4] === 'met').length} of ${REQS.length} met</span></div>
  <p class="seclede">All 20 requirements from the requirements document, checked against the build. Every requirement maps to at least one story and every story cites a requirement, so there are no orphans on either side.</p>
  <div class="tablewrap card"><table>
    <thead><tr><th class="nosort">Req</th><th class="nosort">Priority</th><th class="nosort">What it asks for</th><th class="nosort">Stories</th><th class="nosort">State</th></tr></thead>
    <tbody>${REQS.map(([id, pri, what, st, state, note]) => `<tr class="norow">
      <td><strong>${esc(id)}</strong></td>
      <td>${pri === 'must' ? '<span class="badge risk">must</span>' : pri === 'should' ? '<span class="badge warning">should</span>' : '<span class="badge neutral">could</span>'}</td>
      <td>${esc(what)}${note ? `<div class="reqnote">${esc(note)}</div>` : ''}</td>
      <td><small>${esc(st)}</small></td>
      <td><span class="badge ${state === 'met' ? 'good' : state === 'partial' ? 'warning' : 'risk'}">${state === 'met' ? 'met' : state === 'partial' ? 'partial' : 'not built'}</span></td>
    </tr>`).join('')}</tbody>
  </table></div>
  <div class="card callout" style="margin-top:16px">
    <h3>The short version</h3>
    <p><strong>17 of 20 requirements are met outright.</strong> Every single "must" is met except two, and both gaps are in the same place: <strong>launch readiness, which she has not started</strong>.</p>
    <p><strong>REQ-017 (performance) is not built</strong>, and has also been amended: authentication is now scoped out of the 200ms budget, because bcrypt exceeds it by design and weakening it would trade real security for a metric.</p>
    <p><strong>REQ-018 (deployment) is partial and can no longer be met as written</strong>: Docker is done, CI and end-to-end tests are not started, and the public demo URL was cancelled on 2026-08-12. It needs rewording to a recorded local walkthrough.</p>
  </div>
  <div class="card callout warn">
    <h3>The mocked-data question, answered precisely</h3>
    <p>The demand board ranks companies on invented signals. That is real, and it is why the demo is hard to follow: there is no provenance to show behind any row.</p>
    <p><strong>But it is not a gap someone forgot.</strong> REQ-019 says, in the requirements document itself, "pull job-board and market signals through provider adapters <strong>(mocked for the demo)</strong>". Megan built exactly what she was asked for, and built the adapter seam a real source would plug into. The decision to run on mocked data was made in the requirements on day one, not by her.</p>
    <p>It remains the single biggest thing standing between this and something real, and no story in the plan changes it.</p>
  </div>
  <div class="card callout">
    <h3>Two stories shipped with no evidence at all</h3>
    <p><strong>S-13 (predictive analysis)</strong> and <strong>S-15 (data privacy and audit trail)</strong> are both marked complete with no write-up comment and no screenshots, unlike the other fifteen. S-15 is the GDPR and CCPA requirement, so that is the one place the missing evidence actually matters. Worth asking her for the verification on that one specifically before approving Phase 2.</p>
  </div>
</div></section>

<section id="how"><div class="wrap">
  <div class="sechead"><div><span class="num">04</span><h2>How it works</h2></div></div>
  <p class="seclede">Signals come in on the left. Nothing leaves on the right without a person deciding it should.</p>
  <div class="card mermaidbox"><pre class="mermaid">${ARCH}</pre></div>
  <div class="note">The dotted line is the important one: the release gate has no automatic path through it, and the compliance layer touches every surface rather than being bolted on at the end.</div>
</div></section>

${releases.map((r, i) => `
<section id="${r.name.replace(/[^A-Za-z0-9]/g, '')}"><div class="wrap">
  <div class="relhead sechead"><div><span class="num">${String(i + 5).padStart(2, '0')}</span><h2>${esc(r.name)}</h2></div>
    <span class="badge ${r.done === r.tasks.length ? 'good' : r.done === 0 ? 'neutral' : 'warning'}">${r.done} / ${r.tasks.length} built</span></div>
  <p class="relblurb">${esc(RELEASE_BLURB[r.name] || '')}</p>
  ${r.tasks.map(renderStory).join('')}
</div></section>`).join('')}

<section id="verdict"><div class="wrap">
  <div class="sechead"><div><span class="num">${String(releases.length + 5).padStart(2, '0')}</span><h2>What to do with this</h2></div></div>
  <div class="card callout">
    <h3>The three gates are the easy part</h3>
    <p>Phases 1 and 2 cover R0 through R3, which are built and evidenced above. Phase 3 covers R4, which has not started, so that one is genuinely premature and can wait.</p>
  </div>
  <div class="card callout warn">
    <h3>One story just changed under her</h3>
    <p><strong>S-20 was "deploy to a public demo URL"</strong>, and there will now be no hosted demo. That story needs rewriting to a recorded local walkthrough before she reaches R4, or she will start work against criteria that no longer hold.</p>
  </div>
  <div class="card callout">
    <h3>What her open decisions are actually asking</h3>
    <p><strong>Decision 019 (S-11):</strong> the feedback table keeps only the latest rating per recruiter, not the full history. She flagged that the stated intent, correcting bias over time, might eventually need the history, and asked rather than assuming.</p>
    <p>That pattern is the thing worth noticing across this whole build. Three separate times she hit a point where the convenient answer was available and the honest one cost her time, and she took the honest one each time: refusing to weaken password security to hit a latency target, refusing to invent scoring weights when you went quiet, and refusing to let a rollback restore data someone had legally erased.</p>
  </div>
  <div class="prevnext"><a class="btn" href="#summary" data-scroll>&larr; Back to the top</a>
    <a class="btn primary" href="https://app.basecamp.com/3945211/buckets/${BUCKET}/todolists/${harvest.list}" target="_blank" rel="noopener">Open the full build in Basecamp &rarr;</a></div>
</div></section>

<div class="lightbox" id="lightbox"><img id="lbimg" alt=""></div>
<button id="totop" aria-label="Back to top">&uarr;</button>
<footer><div class="wrap">
  Generated from the live Basecamp build list and Megan's own comments and attachments.
  Screenshots are hers, taken during her own verification runs, embedded directly so this file works offline.
  The one diagram uses Mermaid from a CDN and needs internet to draw.
</div></footer>

<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.0/dist/mermaid.min.js"></script>
<script>
(function(){
  var $=function(s){return document.querySelector(s)};
  try{var t=localStorage.getItem('idcc-theme'); if(t) document.documentElement.setAttribute('data-theme',t);}catch(e){}
  $('#theme').addEventListener('click',function(){
    var n=document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';
    document.documentElement.setAttribute('data-theme',n);
    try{localStorage.setItem('idcc-theme',n)}catch(e){}
    draw();
  });
  $('#print').addEventListener('click',function(){window.print()});
  $('#navtoggle').addEventListener('click',function(){$('#navlinks').classList.toggle('open')});
  document.addEventListener('click',function(e){
    var img=e.target.closest('.shots img');
    if(img){ $('#lbimg').src=img.src; $('#lightbox').classList.add('on'); return; }
    if(e.target.closest('#lightbox')) $('#lightbox').classList.remove('on');
    if(e.target.closest('[data-scroll]')) $('#navlinks').classList.remove('open');
  });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape') $('#lightbox').classList.remove('on'); });
  var secs=[].slice.call(document.querySelectorAll('section[id]'));
  window.addEventListener('scroll',function(){
    var h=document.documentElement;
    $('#progress').style.width=(h.scrollTop/(h.scrollHeight-h.clientHeight)*100)+'%';
    $('#totop').classList.toggle('on',h.scrollTop>600);
    var cur=null; secs.forEach(function(s){ if(s.getBoundingClientRect().top<=130) cur=s.id; });
    [].slice.call(document.querySelectorAll('.navlinks a')).forEach(function(a){ a.classList.toggle('active',a.getAttribute('href')==='#'+cur); });
  },{passive:true});
  $('#totop').addEventListener('click',function(){window.scrollTo({top:0,behavior:'smooth'})});
  function draw(){
    if(typeof mermaid==='undefined'){ var g=document.querySelector('.mermaid'); if(g) g.innerHTML='<div class="empty">The diagram needs an internet connection.</div>'; return; }
    var dark=document.documentElement.getAttribute('data-theme')==='dark';
    try{ mermaid.initialize({startOnLoad:false,theme:dark?'dark':'default'}); mermaid.init(undefined,document.querySelectorAll('.mermaid')); }catch(e){}
  }
  draw();
})();
</script>
</body></html>`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');
console.log(`[walkthrough] wrote ${OUT} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} MB)`);
console.log(`[walkthrough] ${totalDone}/${totalTasks} stories, ${shotCount} screenshots embedded, ${releases.length} releases`);
