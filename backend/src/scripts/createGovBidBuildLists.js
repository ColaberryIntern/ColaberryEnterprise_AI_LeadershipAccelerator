#!/usr/bin/env node
// Create 4 BC build lists - one per gov-bid project. Each list has
// detailed task descriptions, a mix of human and CB System assignees,
// and approval gates so every AI-produced artifact gets reviewed
// before counting as done. 2-week sprint due dates from 2026-06-09 to
// 2026-06-22 (or to close_date if longer).

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = '';
}

const axios = require(path.resolve(__dirname, '../../../node_modules/axios'));

const BC_BASE = 'https://3.basecampapi.com/3945211';
const BC_HEADERS = {
  Authorization: `Bearer ${process.env.BASECAMP_ACCESS_TOKEN}`,
  'User-Agent': 'Colaberry Accelerator (ali@colaberry.com)',
  'Content-Type': 'application/json',
};
const GOV_PROJECT = 47346103;
const GOV_TODOSET = 9908475794;

const CB_SYSTEM_ID = 37708014; // CB System BC user
const INTERNS = {
  akiwam: { id: 33056069, name: 'Akiwam' },
  obi: { id: 42266313, name: 'OBI, ANAMELECHI KINGSLEY' },
  omolola: { id: 49487826, name: 'Omolola Makinde' },
  samrawit: { id: 20684153, name: 'samrawit mekonen' },
};

const PROJECTS = [
  {
    slug: 'tdhca-multifamily',
    intern: INTERNS.akiwam,
    title: 'TDHCA Multifamily Management — BUILD',
    proposalListId: 9967405074,
    rfpUuid: '2f5fd926-05f6-4d02-9388-c0ae3b141aed',
    closeDate: '2026-06-29',
    demoDomain: 'tdhca-demo.colaberry.dev',
    coreFeatures: [
      { name: 'Developer application intake portal', detail: 'Multi-page form: property details, sponsor info, financial pro forma upload, supporting documents. Save-in-progress. Deadline gating per allocation cycle.' },
      { name: 'Underwriting workbench', detail: 'Side-by-side application + scoring rubric. Threshold tests, conditional approval flow, deficiency letters from templates.' },
      { name: 'Asset management view', detail: 'Post-award compliance period tracking: lease-up status, tenant certifications, owner certifications, inspection schedules.' },
      { name: 'LURA generator + IRS 8823 / 8609 forms', detail: 'Document generation from configurable templates. Editable template with merge fields for property + sponsor data. PDF export.' },
      { name: 'Pipeline dashboard', detail: 'Admin view of all applications by status. Deadlines coming up. Exceptions and overdue items. Charts.' },
      { name: 'Public property lookup', detail: 'Search-only view for the public. Award amounts. Period of affordability. Map.' },
    ],
  },
  {
    slug: 'tdcj-oig-records',
    intern: INTERNS.obi,
    title: 'TDCJ-OIG Records Mgmt — BUILD',
    proposalListId: 9967406450,
    rfpUuid: 'cf2f3de4-cb2b-4eb0-85d5-7494cc6693d0',
    closeDate: '2026-11-01',
    demoDomain: 'tdcj-rms-demo.colaberry.dev',
    coreFeatures: [
      { name: 'Case management', detail: 'Create cases, attach evidence + interviews. Status workflow (open → under review → closed → referred). Assignment + reassignment.' },
      { name: 'Evidence locker with chain-of-custody', detail: 'Upload digital evidence (photo, doc, audio, video). SHA-256 hash on upload. Every transfer logged with timestamp + officer ID + reason.' },
      { name: 'Structured interview / statement intake', detail: 'Form for witness / suspect statements. Audio attachment, transcription, signature block, time + place of interview.' },
      { name: 'Incident report builder', detail: 'Law-enforcement-grade report with standard sections. Auto-populate from case data. PDF export with TDCJ-OIG header.' },
      { name: 'Multi-jurisdictional search', detail: 'Search a mock Texas inmate index by name, TDCJ ID, alias, last known unit. Unified record view.' },
      { name: 'Built-in OIG dashboards + reports', detail: 'Open cases by region, by type, by investigator. Monthly OIG summary template that pre-populates.' },
      { name: 'Audit log (read + write)', detail: 'Every read of a record + every write logged. Searchable by investigator. Append-only.' },
      { name: 'CJIS-style auth (SSO + MFA)', detail: 'Mock SAML SSO + TOTP MFA. Session expiry. IP allowlist for admin paths.' },
    ],
  },
  {
    slug: 'utd-residential-life',
    intern: INTERNS.omolola,
    title: 'UTD Residential Life — BUILD',
    proposalListId: 9967407307,
    rfpUuid: '4dc18cd6-a1a3-4bdd-86f4-b4e97c6d6dd7',
    closeDate: '2026-06-30',
    demoDomain: 'utd-reslife-demo.colaberry.dev',
    coreFeatures: [
      { name: 'Forms for reporting (incident, noise, lockout, etc.)', detail: 'Configurable form templates: on-call log, noise complaint, lockout, roommate agreement, evaluations. Photo upload. Escalation rules.' },
      { name: 'Staff scheduling + on-call rotation', detail: 'Calendar UI for front desk hours + RA on-call rotation. Shift swap requests. Auto-reminders.' },
      { name: 'Program proposals + curriculum mapping', detail: 'Student staff submit program ideas; each links back to a residential curriculum learning outcome. Approval workflow.' },
      { name: 'Student staff performance evals', detail: 'End-of-semester evaluations. Self + supervisor versions. Side-by-side comparison.' },
      { name: 'Mass communications hub', detail: 'Mass-text, mass-email, in-platform messaging. Target by hall / floor / individual. Simple multi-question survey support.' },
      { name: 'Student 360-profile + privacy tiers', detail: 'One student record: program attendance, conversations with staff, complaints, roommate agreement. Privacy levels for different staff roles.' },
      { name: 'Insight dashboards + macro/micro drill-down', detail: 'Drill from community area → hall → floor → individual student. Charts: attendance by program category, complaints per hall, RA conversations.' },
      { name: 'Student-of-concern flag + workflow', detail: 'Any staff can flag a student. Triggers a workflow to professional staff. Audit trail of who flagged + outcome.' },
    ],
  },
  {
    slug: 'harris-agenda-meeting',
    intern: INTERNS.samrawit,
    title: 'Harris County Agenda + Meeting — BUILD',
    proposalListId: 9967409301,
    rfpUuid: '2e287828-9040-4948-98fe-a0250a5d66a5',
    closeDate: '2026-06-22',
    demoDomain: 'harris-meetings-demo.colaberry.dev',
    coreFeatures: [
      { name: 'Agenda builder (drag-and-drop)', detail: 'Build a meeting agenda by item: number, title, description, supporting docs, presenter, suggested action. Auto-numbering. Publish.' },
      { name: 'Per-item document management with versioning', detail: 'Staff upload supporting docs per item. Revision history. Access control: draft visible to staff only; published to public.' },
      { name: 'Live voting workflow', detail: 'During live meeting, clerk calls vote per item. Each member casts yes/no/abstain/absent. Totals shown live. Vote record archived to item.' },
      { name: 'Minutes generation', detail: 'Auto-build minutes from agenda + votes + clerk notes. Edit, finalize, sign, publish to public.' },
      { name: 'Action item tracker', detail: 'Motions or board directions create trackable action items assigned to a department with deadline. Status updates feed reports.' },
      { name: 'Public portal', detail: 'Residents see upcoming meetings, agendas, materials, vote results, minutes, action item status. Search by topic / date / member.' },
      { name: 'Live "now showing" meeting view', detail: 'Public-facing page during the meeting: current agenda item, presenter, projected docs. Optional video embed (mocked).' },
      { name: 'Member portal + conflicts-of-interest', detail: 'Elected members log in, see upcoming meeting, request agenda items, review materials, declare COI per item.' },
    ],
  },
];

const SPRINT_START = '2026-06-09';
const SPRINT_END = '2026-06-22'; // 2-week sprint; longer-runway RFPs spread submission later but build target is 2 weeks

// ---------- Standard build task list (re-customized per project) ----------

function tasks(p) {
  const features = p.coreFeatures;
  const demoUrl = `https://${p.demoDomain}`;
  const slug = p.slug;
  const repoPath = `gov-bid-builds/${slug}/`;
  const requirementsPath = `${repoPath}requirements.md`;
  const proposalListUrl = `https://app.basecamp.com/3945211/buckets/47346103/todolists/${p.proposalListId}`;
  const opUrl = `http://95.216.199.47/admin/bonfire/${p.rfpUuid}/submission-readiness`;

  const list = [];

  // ----- Phase 0: Orientation (Days 1-2) -----
  list.push({
    content: `Read the AI Project Architect spec end-to-end`,
    assignee: p.intern, kind: 'human',
    description: `<div><strong>What to do</strong></div>
<ol>
<li>Open <code>${requirementsPath}</code> in the repo. This is the AI Project Architect (Professional mode) spec for the build.</li>
<li>Read the full document. Focus areas: the data model, the user roles, the API contract, the deployment topology, and the demo storyline.</li>
<li>Write a 1-page "what I'm building" summary in plain English (Google Doc), and post the share link as a comment on this todo.</li>
<li>Open the proposal list at <a href="${proposalListUrl}">${p.title.replace(' — BUILD', '')} proposal</a> to cross-reference. The proposal will reference the live demo URL: ${demoUrl}.</li>
</ol>
<div><strong>Critical sections to internalize</strong></div>
<ul>
<li>Demo storyline (Section 4 in the spec) — this is the click-through flow you build.</li>
<li>Data model (Section 5) — tables + relationships.</li>
<li>User roles (Section 3) — every screen filters by role.</li>
</ul>
<div><strong>Done when</strong></div>
<p>Your 1-page summary doc is posted as a comment + this todo is checked.</p>`,
  });

  list.push({
    content: `Review the scaffolded project structure`,
    assignee: p.intern, kind: 'human',
    description: `<div><strong>What to do</strong></div>
<ol>
<li>Open <code>${repoPath}</code> in your editor.</li>
<li>Confirm the scaffolded structure: <code>README.md</code>, <code>SETUP.md</code>, <code>requirements.md</code>, <code>package.json</code>, <code>.env.example</code>, <code>app/</code>, <code>seeds/</code>, <code>deploy/</code>, <code>docs/</code>, <code>MOVE_TO_OWN_REPO.md</code>.</li>
<li>Read <code>README.md</code> and <code>SETUP.md</code>. Confirm the demo URL convention is what we want: <code>${demoUrl}</code>.</li>
<li>Read <code>MOVE_TO_OWN_REPO.md</code> — this is the future split-out plan. Don't do it yet; just understand the eventual path.</li>
</ol>
<div><strong>If something's missing</strong></div>
<p>Comment on this todo. CB System will regenerate the scaffold.</p>
<div><strong>Done when</strong></div>
<p>This todo is checked. No comment needed if everything looks right.</p>`,
  });

  // ----- Phase 1: Foundation (Days 2-4) -----
  list.push({
    content: `[CB System] Initialize repo: backend Express + frontend React skeleton`,
    assignee: { id: CB_SYSTEM_ID, name: 'CB System' }, kind: 'ai-approval',
    approver: p.intern,
    description: `<div><strong>What CB System will produce</strong></div>
<ul>
<li>A working Express server at <code>${repoPath}app/backend/</code> with <code>/health</code> endpoint, env loading, and Sequelize-based DB connection.</li>
<li>A React (CRA + TypeScript) frontend at <code>${repoPath}app/frontend/</code> with a placeholder home page that fetches <code>/api/health</code>.</li>
<li>An updated <code>package.json</code> with workspaces pointing at both.</li>
<li>A <code>docker-compose.yml</code> in the project root for local Postgres + MinIO.</li>
</ul>
<div><strong>Where the output appears</strong></div>
<p>Committed to <code>main</code> branch. CB System will post the commit SHA as a comment on this todo.</p>
<div><strong>How to review (assignee: ${p.intern.name})</strong></div>
<ol>
<li>Pull <code>main</code>.</li>
<li>Run the SETUP.md steps. Confirm <code>npm run dev</code> boots both backend (port 3001) and frontend (port 3000).</li>
<li>Hit http://localhost:3000 in a browser. The home page should fetch from <code>/api/health</code> and show "ok".</li>
<li>If it works, comment "approved" and check the box.</li>
<li>If not, comment what went wrong; CB System will fix and re-deliver.</li>
</ol>
<div><strong>This is an approval-gate task.</strong> Don't check the box until you've actually run it locally.</div>`,
  });

  list.push({
    content: `[CB System] Generate database schema migrations from the spec`,
    assignee: { id: CB_SYSTEM_ID, name: 'CB System' }, kind: 'ai-approval',
    approver: p.intern,
    description: `<div><strong>What CB System will produce</strong></div>
<ul>
<li>Sequelize migrations under <code>${repoPath}app/backend/migrations/</code> for every table in the data model section of the spec.</li>
<li>Sequelize models under <code>${repoPath}app/backend/models/</code> matching each migration.</li>
<li>An updated <code>npm run db:migrate</code> script.</li>
</ul>
<div><strong>How to review</strong></div>
<ol>
<li>Pull <code>main</code> after CB System posts the commit SHA.</li>
<li>Open the spec (<code>${requirementsPath}</code>) data model section. Match it against the migrations one table at a time.</li>
<li>Run <code>npm run db:migrate</code>. Confirm no errors. Connect to local Postgres and confirm tables exist.</li>
<li>If migrations match the spec, comment "approved" + check the box.</li>
<li>If a table is missing or wrong, comment which table + what's wrong. CB System will fix.</li>
</ol>`,
  });

  list.push({
    content: `[CB System] Generate REST API endpoints + Zod validation per the spec`,
    assignee: { id: CB_SYSTEM_ID, name: 'CB System' }, kind: 'ai-approval',
    approver: p.intern,
    description: `<div><strong>What CB System will produce</strong></div>
<ul>
<li>Express route files under <code>${repoPath}app/backend/routes/</code> for every API endpoint in the spec.</li>
<li>Zod schemas for each request + response shape.</li>
<li>Controller stubs that return mock data (no real business logic yet — that's a later human task).</li>
<li>An OpenAPI 3.0 schema generated from the Zod schemas, at <code>${repoPath}app/backend/openapi.yaml</code>.</li>
</ul>
<div><strong>How to review</strong></div>
<ol>
<li>Pull <code>main</code>. Boot dev server.</li>
<li>Hit each endpoint in the spec with curl or Postman. Confirm a JSON response.</li>
<li>Open <code>openapi.yaml</code>. Confirm it matches the spec's API contract section.</li>
<li>If everything matches, comment "approved".</li>
</ol>`,
  });

  list.push({
    content: `[CB System] Generate fake-data seed script (${features.length}-feature demo storyline)`,
    assignee: { id: CB_SYSTEM_ID, name: 'CB System' }, kind: 'ai-approval',
    approver: p.intern,
    description: `<div><strong>What CB System will produce</strong></div>
<ul>
<li>A seed script at <code>${repoPath}seeds/index.js</code> that populates the local DB with realistic fake data matching the spec's demo storyline.</li>
<li>Per-table seed data files: <code>seeds/users.js</code>, <code>seeds/&lt;entity&gt;.js</code>, etc.</li>
<li>The seed must produce data that supports the demo flow: <em>${features.map(f => f.name).slice(0, 3).join('; ')}; etc.</em></li>
</ul>
<div><strong>How to review</strong></div>
<ol>
<li>Run <code>npm run seed</code>.</li>
<li>Connect to local DB. Confirm each table has rows.</li>
<li>Open the React frontend; click around. Data should appear, not empty tables.</li>
<li>Names + numbers should look plausible (not "test1, test2, test3"). Fake-but-realistic.</li>
<li>Comment "approved" + check.</li>
</ol>
<div><strong>Why this matters</strong></div>
<p>The agency evaluator will click around the demo. Empty tables kill the bid. Realistic fake data makes the demo feel like a real product.</p>`,
  });

  list.push({
    content: `[CB System] Wire mock authentication + role-based UI gating`,
    assignee: { id: CB_SYSTEM_ID, name: 'CB System' }, kind: 'ai-approval',
    approver: p.intern,
    description: `<div><strong>What CB System will produce</strong></div>
<ul>
<li>Mock SSO login page: dropdown to "log in as" a sample user of each role from the spec.</li>
<li>Session cookie-based auth (real but mock provider).</li>
<li>Frontend role-based gating: navigation menu items / pages filtered by role.</li>
<li>Backend role-checking middleware on each route.</li>
</ul>
<div><strong>How to review</strong></div>
<ol>
<li>Boot the demo. Log in as each role from the spec one at a time.</li>
<li>Confirm each role sees only the screens / data it should.</li>
<li>Confirm a non-admin role can't access an admin-only endpoint (check via browser network tab).</li>
<li>Comment "approved" + check.</li>
</ol>`,
  });

  // ----- Phase 2: Core features (Days 4-9) -----
  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    list.push({
      content: `Build feature ${i + 1}/${features.length}: ${f.name}`,
      assignee: p.intern, kind: 'human',
      description: `<div><strong>What to build</strong></div>
<p>${f.detail}</p>
<div><strong>Spec reference</strong></div>
<p>Find the corresponding section in <code>${requirementsPath}</code> (search for "${f.name}" or the closest match). Use the spec's API contract + data model. The CB System scaffolding has the routes + tables stubbed out.</p>
<div><strong>Demo storyline placement</strong></div>
<p>This feature is part of the click-through flow that the agency evaluator will follow. Make it work end-to-end with the seeded fake data.</p>
<div><strong>How to test</strong></div>
<ol>
<li>Boot the demo locally.</li>
<li>Walk through the user story for this feature using a seeded user.</li>
<li>Take a screenshot of the working flow. Save to <code>${repoPath}docs/screenshots/feature-${i + 1}-${f.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png</code>.</li>
<li>Commit + push. PR title: "Feature ${i + 1}: ${f.name}".</li>
</ol>
<div><strong>If stuck</strong></div>
<p>Comment on this todo with what you've tried + where you're blocked. Tag @CB System if you want code help; tag @Ali Muwwakkil if you need a product decision.</p>
<div><strong>Done when</strong></div>
<p>Screenshot in <code>docs/screenshots/</code>, PR merged, this todo checked.</p>`,
    });
  }

  // ----- Phase 3: Polish + Deploy (Days 9-12) -----
  list.push({
    content: `[CB System] Apply agency-styled UI theme + branding (mock)`,
    assignee: { id: CB_SYSTEM_ID, name: 'CB System' }, kind: 'ai-approval',
    approver: p.intern,
    description: `<div><strong>What CB System will produce</strong></div>
<ul>
<li>A theme.ts file with colors + typography drawn from a public reference (the agency's public website + brand standards if available; otherwise government-neutral palette).</li>
<li>A header with a placeholder agency logo + name.</li>
<li>A footer with a "this is a demo" disclaimer + Colaberry attribution.</li>
</ul>
<div><strong>Why mock + disclaimer</strong></div>
<p>The agency hasn't authorized real branding. We use government-neutral styling that <em>looks</em> like the agency without using real logos. The disclaimer protects us legally.</p>
<div><strong>How to review</strong></div>
<ol>
<li>Boot demo. Confirm theming is consistent.</li>
<li>Confirm the disclaimer is visible on every page.</li>
<li>Comment "approved" + check.</li>
</ol>`,
  });

  list.push({
    content: `End-to-end test the demo storyline as if you are the agency evaluator`,
    assignee: p.intern, kind: 'human',
    description: `<div><strong>What to do</strong></div>
<ol>
<li>Open <code>${requirementsPath}</code>, go to the demo storyline section.</li>
<li>Click through every step of the storyline using the local demo. Use realistic timings.</li>
<li>Note any breaks, awkward UX, missing data, broken links.</li>
<li>Fix the breaks (or open follow-up todos for big ones).</li>
<li>Repeat until the full storyline runs clean.</li>
<li>Record a 2-minute screen recording (Loom or QuickTime) of the full storyline. Save to <code>${repoPath}docs/demo-walkthrough.mp4</code> or post Loom link.</li>
</ol>
<div><strong>Why</strong></div>
<p>The agency evaluator will spend ~3 minutes on the demo. Every break in the flow costs us points. Practice it like a pitch.</p>
<div><strong>Done when</strong></div>
<p>The full storyline runs without intervention + a recording exists.</p>`,
  });

  list.push({
    content: `[CB System] Generate Dockerfile + deploy script for ${demoUrl}`,
    assignee: { id: CB_SYSTEM_ID, name: 'CB System' }, kind: 'ai-approval',
    approver: p.intern,
    description: `<div><strong>What CB System will produce</strong></div>
<ul>
<li>A production <code>Dockerfile</code> in <code>${repoPath}deploy/</code> that multi-stage-builds frontend + backend into one nginx-fronted image.</li>
<li>A <code>docker-compose.production.yml</code> that pairs the app container with Postgres + MinIO.</li>
<li>A <code>deploy.sh</code> that ssh's into the Hetzner VPS (95.216.199.47), pulls the repo, and rebuilds.</li>
<li>A nginx server block stub for <code>${p.demoDomain}</code>.</li>
</ul>
<div><strong>How to review</strong></div>
<ol>
<li>Build the Docker image locally: <code>docker build -t ${slug} -f deploy/Dockerfile .</code></li>
<li>Confirm build succeeds.</li>
<li>Run the image locally with <code>docker compose -f deploy/docker-compose.production.yml up</code>.</li>
<li>Confirm the app boots and responds.</li>
<li>Comment "approved" + check.</li>
</ol>
<div><strong>Don't actually deploy to ${p.demoDomain} until the next todo.</strong></div>`,
  });

  list.push({
    content: `Deploy demo to public URL ${demoUrl} (with Ali's go-ahead)`,
    assignee: p.intern, kind: 'human',
    description: `<div><strong>What to do</strong></div>
<ol>
<li>Ask Ali for go-ahead in #gov-contracts Slack. He needs to confirm DNS + nginx + Cloudflare for <code>${p.demoDomain}</code>.</li>
<li>Once go-ahead: SSH to <code>root@95.216.199.47</code>. Pull the repo. Run the deploy script in <code>${repoPath}deploy/deploy.sh</code>.</li>
<li>Wait for backend to bind port. Hit <code>${demoUrl}/health</code> — should return ok.</li>
<li>Walk the full demo storyline against the live URL. Same as the local end-to-end test but against the public deploy.</li>
<li>Post a screenshot of the live demo home page as a comment.</li>
</ol>
<div><strong>Critical</strong></div>
<p>Production deploys are an Ali-greenlight gate. Don't deploy without his explicit go-ahead. (Memory note: production deploys only after hours unless Ali greenlights.)</p>
<div><strong>Done when</strong></div>
<p>${demoUrl} is live and the demo storyline runs cleanly.</p>`,
  });

  // ----- Phase 4: Proposal integration (Days 12-14) -----
  list.push({
    content: `Capture proposal-ready screenshots + write walkthrough doc`,
    assignee: p.intern, kind: 'human',
    description: `<div><strong>What to do</strong></div>
<ol>
<li>Take 8-12 high-resolution screenshots of the live demo at ${demoUrl}. Capture: home page, each major feature, the dashboards.</li>
<li>Save each as PNG to <code>${repoPath}docs/screenshots/</code>.</li>
<li>Write a 2-page walkthrough doc (Google Doc): for each screenshot, one paragraph explaining what the agency evaluator is seeing + how it satisfies an RFP requirement.</li>
<li>Save share link to <code>${repoPath}docs/walkthrough.md</code>.</li>
</ol>
<div><strong>Why this matters</strong></div>
<p>Most proposals are text. The agency evaluator sees the same words from every bidder. Screenshots of a working product cut through. They prove the proposal isn't vapor.</p>
<div><strong>Done when</strong></div>
<p>Screenshots in docs/screenshots/, walkthrough doc shared with Ali + Ram.</p>`,
  });

  list.push({
    content: `Update proposal narrative to reference the live demo URL`,
    assignee: p.intern, kind: 'human',
    description: `<div><strong>What to do</strong></div>
<ol>
<li>Open the proposal narrative draft you created on the proposal list: <a href="${proposalListUrl}">${p.title.replace(' — BUILD', '')} proposal</a>.</li>
<li>Add a callout box on page 1: "A working pilot of this system is deployed at <code>${demoUrl}</code>. Evaluators can click through the full demo flow to see real screens with sample data."</li>
<li>Throughout the proposal, when describing a capability, add: "Live in our pilot — see [link to ${demoUrl}/specific-page]".</li>
<li>The deep links into the demo should land on a real working page, not 404. Test each one.</li>
<li>Share the updated narrative with @Ali Muwwakkil and @Ram Katamaraja for review.</li>
</ol>
<div><strong>Done when</strong></div>
<p>Updated narrative shared + every deep link tested.</p>`,
  });

  list.push({
    content: `Final internal review: build + proposal package (24h before submit)`,
    assignee: p.intern, kind: 'human',
    description: `<div><strong>What to do</strong></div>
<ol>
<li>Package everything: live demo URL, deep-linked walkthrough doc, screenshots, requirements matrix, proposal narrative, all OP submission-readiness artifacts (cover letter, capability statement, references, etc).</li>
<li>One Google Doc index page with links to each artifact.</li>
<li>Post a comment on this todo tagging @Ali Muwwakkil + @Ram Katamaraja: "Ready for final review — ${p.title.replace(' — BUILD', '')}, closes ${p.closeDate}, demo at ${demoUrl}".</li>
<li>Wait for go/no-go.</li>
</ol>
<div><strong>Done when</strong></div>
<p>Ali replies "go" on the comment thread.</p>`,
  });

  return list;
}

// ---------- Due-date distributor ----------
function distributeDates(taskCount, startISO, endISO) {
  const start = new Date(startISO + 'T00:00:00Z').getTime();
  const end = new Date(endISO + 'T00:00:00Z').getTime();
  const total = end - start;
  return Array.from({ length: taskCount }, (_, i) =>
    new Date(start + (total * i) / Math.max(1, taskCount - 1)).toISOString().slice(0, 10)
  );
}

async function bcPost(url, body) { return (await axios.post(url, body, { headers: BC_HEADERS })).data; }

(async () => {
  const createdLists = [];
  for (const p of PROJECTS) {
    console.log(`\n=== Creating BUILD list for ${p.intern.name} <- ${p.title} ===`);
    const list = await bcPost(`${BC_BASE}/buckets/${GOV_PROJECT}/todosets/${GOV_TODOSET}/todolists.json`, {
      name: p.title,
      description: `<div><strong>${p.title}</strong></div>
<div>Owner: ${p.intern.name}</div>
<div>Demo URL target: <a href="https://${p.demoDomain}">https://${p.demoDomain}</a></div>
<div>Proposal list: <a href="https://app.basecamp.com/3945211/buckets/47346103/todolists/${p.proposalListId}">${p.title.replace(' — BUILD', '')}</a></div>
<div>Repo path: <code>gov-bid-builds/${p.slug}/</code></div>
<div>Spec: <code>gov-bid-builds/${p.slug}/requirements.md</code> (AI Project Architect, Professional mode)</div>
<div>Sprint: <strong>2026-06-09 to 2026-06-22</strong> (2 weeks). Submission deadline: <strong>${p.closeDate}</strong>.</div>
<div><br></div>
<div><strong>Approval gates:</strong> tasks tagged [CB System] are AI-generated and assigned to CB System. You (${p.intern.name}) are the approver. Check the box only after reviewing the output locally. If the AI output is wrong, comment what needs to change and CB System will re-run.</div>
<div><br></div>
<div><strong>Goal:</strong> a working public demo at <a href="https://${p.demoDomain}">https://${p.demoDomain}</a> that the agency evaluator can click through, with the proposal narrative deep-linking into specific pages. The demo is the bid's differentiator.</div>`,
    });
    console.log(`  list created: ${list.app_url}`);

    const taskList = tasks(p);
    const dates = distributeDates(taskList.length, '2026-06-09', SPRINT_END);
    console.log(`  Creating ${taskList.length} detailed build todos...`);
    for (let i = 0; i < taskList.length; i++) {
      const t = taskList[i];
      await bcPost(`${BC_BASE}/buckets/${GOV_PROJECT}/todolists/${list.id}/todos.json`, {
        content: t.content,
        description: t.description,
        due_on: dates[i],
        assignee_ids: [t.assignee.id],
      });
      process.stdout.write(`    ${i + 1}/${taskList.length}\r`);
    }
    console.log(`    ${taskList.length} todos created.`);
    createdLists.push({ ...p, listId: list.id, listUrl: list.app_url, todoCount: taskList.length });
  }

  const out = path.resolve(__dirname, '../../../tmp/build-lists.json');
  fs.writeFileSync(out, JSON.stringify(createdLists, null, 2));
  console.log(`\nDone. Build lists at ${out}`);
})().catch(e => { console.error('FAIL:', e.response?.data || e.stack || e.message); process.exit(1); });
