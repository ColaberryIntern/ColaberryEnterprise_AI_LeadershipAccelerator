/**
 * The rules an AIA progress-billing module must follow to sit inside the glazeoff.ai platform, and
 * where our December plan agrees or disagrees with Sai's platform plan.
 *
 *   NODE_PATH=<repo>/node_modules ARTIFACT_CHROMIUM=<msedge.exe> node scripts/artifacts/buildGlazeoffModuleRules.js
 *
 * Writes docs/GLAZEOFF_MODULE_RULES_AIA_BILLING_2026-11-21.html and .pdf (at most 4 pages).
 *
 * Sources (read 21 Nov 2026): Sai's "glazeoff-platform-tracker-FINAL.xlsx" (shared 16 Nov, built
 * from the Client Deployment Blueprint and Ram's 15 Nov Basecamp comments), the Read AI report of
 * the 17 Nov "Client Deployment Blueprint" meeting, Sai's 21 Nov email "GCP access for the billing
 * module", and Middlesex Basecamp list 10443345153. Every rule carries a tag: SAI = already in
 * Sai's plan, PROPOSED = ours, to agree with Sai before code.
 */
const path = require('path');
const { baseCss, esc, SEV } = require('./artifactTheme');
const { renderPdf, htmlDoc } = require('./renderArtifactPdf');

const DOCS = path.join(__dirname, '..', '..', 'docs');
const STEM = 'GLAZEOFF_MODULE_RULES_AIA_BILLING_2026-11-21';

const V = {
  same: { t: 'SAME PAGE', c: SEV.ok },
  adjust: { t: 'WE ADJUST', c: '#3d5a99' },
  settle: { t: 'SETTLE WITH SAI', c: '#6d28d9' },
};
const chip = (v) => `<span class="chip" style="background:${V[v].c}">${V[v].t}</span>`;
const tag = (s) => s === 'SAI'
  ? '<span class="chip" style="background:#0f766e">SAI</span>'
  : '<span class="chip" style="background:#b26a00">PROPOSED</span>';

// Topic | Sai's platform plan | Our December plan | verdict | what changes
const COMPARE = [
  ['Cloud', 'GCP; separate Cloud Run deployments per client, shared core (blueprint).',
    'GCP project <code>glazeoff-billing</code>, set up by Karun on Thu 19 Nov and linked to billing.', 'same', 'Nothing.'],
  ['What "billing module" means', 'T3.10: per-client <b>usage</b> as invoice line items (GlazeOff billing its clients for cloud and AI use). Assigned to Ali.',
    'AIA <b>progress</b> billing: Middlesex PMs fill G702/G703 requisitions.', 'settle',
    'Two different modules with the same word. Name them apart (page 3).'],
  ['Sign-in', 'AIX Auth: passwordless email link, /check endpoint, <code>require()</code> on every route. <b>Not started</b> (T1.3, T1.4, T1.6).',
    'S6: our own logins so a PM sees only his jobs.', 'settle',
    'Drop our own login. Build to the AIX Auth token now; agree a pilot fallback if it isn\'t live by 1 Dec.'],
  ['Data', 'Postgres, <code>client_id</code> on every row, row-level security (T2.2). Blueprint also mentions per-client databases.',
    'S2: tenants, jobs, schedule of values, requisitions, lines.', 'adjust',
    'Add row-level security. Ask which: one database with RLS, or one per client.'],
  ['Stack', 'Python / FastAPI back end, React front end (blueprint; "not fully finalized").',
    'Not chosen. The demo is one HTML file.', 'adjust', 'Build in FastAPI + React.'],
  ['Documents', 'Phase 2 document space: Uppy uploads, signed download links, path client/project/document/vN.',
    'No upload in December (S3). Exports G702/G703 (S5).', 'same', 'Exports become platform documents once Phase 2 exists.'],
  ['Approvals', 'Roles in the database, sequential approvals with notifications (blueprint).',
    'Four seats from the demo: PM, Brian Dempster, Nick Arena, Jamie.', 'adjust', 'The chain is per-client data, not code.'],
  ['Client differences', 'Configurable features, no custom UI per client (blueprint).',
    'Built around Middlesex.', 'adjust', 'Middlesex\'s choices live in a settings table.'],
  ['Cost tracking', '<code>client=&lt;name&gt;</code> label on every resource; usage logged per client (T3.6, T3.8).',
    'Not planned.', 'adjust', 'Label everything; emit usage events.'],
  ['Backups', 'Restore drill in Phase 4 (T4.4); owner not yet named.',
    'A timed restore before the pilot (S0 done-condition).', 'same', 'We do it earlier for our database.'],
  ['Isolation tests', 'Two test clients never see each other, tested in CI (T1.9).',
    'Not planned.', 'adjust', 'Add the two-client test to our CI.'],
  ['Timing', 'Middlesex moves onto the platform after Phases 1-2 (T3.11).',
    'AIA pilot Tue 8 Dec.', 'settle', 'Our pilot runs ahead of the platform. Agree what it borrows and what it stubs.'],
];

// Thing | Rule | Example | source
const NAMES = [
  ['Module key', 'One key everywhere. Never the bare word "billing".', '<code>aia_billing</code> in code, database and permissions; <code>aia-billing</code> in URLs, services, labels', 'PROPOSED'],
  ['The other module', 'T3.10 usage invoicing gets its own key.', '<code>usage_billing</code> / <code>usage-billing</code>', 'PROPOSED'],
  ['GCP project', 'Project IDs cannot be renamed after creation.', '<code>glazeoff-billing</code> already exists (Karun, Thu 19 Nov). Keep it, and tell modules apart with the <code>module</code> label.', 'PROPOSED'],
  ['Cloud resources', '<code>&lt;module&gt;-&lt;role&gt;-&lt;env&gt;</code>', '<code>aia-billing-api-prod</code>, <code>aia-billing-web-prod</code>, <code>aia-billing-pg-prod</code>', 'PROPOSED'],
  ['Labels', 'Every resource carries client, module and env.', '<code>client=middlesex-glass</code> <code>module=aia-billing</code> <code>env=prod</code>', 'SAI'],
  ['Client', 'A uuid from AIX Auth plus a lowercase slug.', '<code>client_id</code> (uuid), <code>middlesex-glass</code>', 'SAI'],
  ['Database schema', 'Each module owns one Postgres schema. Platform tables stay in core; a module reads core ids and never writes core tables.', '<code>aia_billing.pay_applications</code>', 'PROPOSED'],
  ['Tables', 'snake_case, plural nouns, AIA vocabulary. The word "job" is reserved for GlazeOff\'s job contract.', '<code>contracts</code>, not <code>jobs</code>', 'PROPOSED'],
  ['API', '<code>/api/&lt;module&gt;/v1/&lt;plural-resource&gt;</code>, JSON in snake_case.', '<code>/api/aia-billing/v1/pay-applications</code>', 'PROPOSED'],
  ['Permissions', '<code>&lt;module&gt;:&lt;resource&gt;:&lt;action&gt;</code>, levels none / read / write / admin by user type.', '<code>aia_billing:pay_applications:approve</code>', 'SAI'],
  ['Events', '<code>&lt;module&gt;.&lt;resource&gt;.&lt;past-tense verb&gt;</code>', '<code>aia_billing.pay_application.submitted</code>', 'PROPOSED'],
  ['Files', 'The platform path: client / project / document / version / file.', '<code>middlesex-glass/&lt;project&gt;/&lt;document&gt;/v2/G702.pdf</code>', 'SAI'],
  ['Migrations', 'Alembic, forward-only, one change per file.', '<code>0003_add_retainage_to_contracts</code>', 'PROPOSED'],
];

const TABLES = [
  ['contracts', 'One per subcontract (the "job" Jamie bills). Links to the platform project id.'],
  ['sov_lines', 'The schedule of values: one row per line item, with the scheduled value.'],
  ['change_orders', 'Approved changes that add lines or change values.'],
  ['pay_applications', 'One per contract per billing period: the G702 header. Shown on screen as "Requisition".'],
  ['pay_application_lines', 'The G703 rows: % complete, this period, stored materials.'],
  ['approval_steps', 'Per-client chain configuration: the seats and their order.'],
  ['approvals', 'Each approve or return action, by whom and when.'],
  ['exports', 'Every generated .xlsx and PDF, pointing to the stored file.'],
  ['client_settings', 'Retainage %, the SOV format and other per-client choices.'],
  ['audit_events', 'Append-only record of every change.'],
];

const COLUMN_RULES = [
  ['<code>id</code> uuid primary key; <code>client_id</code> uuid NOT NULL on <b>every</b> table, enforced by row-level security', 'SAI'],
  ['The client comes from the signed-in token, never from the browser or the request body', 'SAI'],
  ['Money is <code>numeric(14,2)</code>, never a float. Percentages are <code>numeric(5,2)</code>, from 0 to 100', 'PROPOSED'],
  ['Timestamps end in <code>_at</code> (timestamptz, UTC); dates end in <code>_on</code>; foreign keys are <code>&lt;singular&gt;_id</code>; booleans start with <code>is_</code> or <code>has_</code>', 'PROPOSED'],
  ['Every table has <code>created_at</code>, <code>updated_at</code> and <code>created_by</code> (the user id from the token)', 'PROPOSED'],
  ['A submitted value is never overwritten. A revision inserts a new row with <code>revision_no</code> and <code>supersedes_id</code>, so the original stays on record', 'PROPOSED'],
  ['Status is text with a CHECK list: draft, submitted, approved, returned, finalized, exported', 'PROPOSED'],
];

const FORM_CHECKS = [
  ['Every route calls <code>require()</code> with a permission key, and refuses access when the check fails', 'SAI'],
  ['A two-client isolation test passes in CI: client B never sees client A\'s rows, files or exports, including on error paths', 'SAI'],
  ['There is no <code>if client == "middlesex"</code> anywhere in the code; every difference is a <code>client_settings</code> row', 'PROPOSED'],
  ['Every cloud resource carries client, module and env labels', 'SAI'],
  ['Usage events go out for the per-client usage report (T3.8)', 'SAI'],
  ['Any AI call goes through the platform LLM gateway, with de-identification (T5.2, T5.3); there is none in December', 'SAI'],
  ['Secrets live in Secret Manager, never in the repo', 'PROPOSED'],
  ['The schema is reviewed by the database owners (Karun, Harsh and Venkatesh, per the tracker) before migrations run', 'PROPOSED'],
  ['A restore has been run once and timed before real data goes in', 'PROPOSED'],
];

const QUESTIONS = [
  ['"Billing module" means two things', 'T3.10 is usage invoicing; Ram\'s 19 Nov ask was AIA progress billing for Middlesex.',
    'Two modules, two keys: <code>aia-billing</code> now, and <code>usage-billing</code> (T3.10) after T3.8 and T3.9 land.'],
  ['Sign-in before 8 Dec', 'AIX Auth is not started, and the pilot is in 17 days.',
    'Build to the AIX Auth token shape and <code>require()</code> from day one. If AIX Auth is not live by Tue 1 Dec, the pilot uses a temporary issuer with the same token shape, deleted when AIX Auth ships.'],
  ['One database or one per client', 'The tracker says client_id plus row-level security; the blueprint mentions per-client databases.',
    'One module database with row-level security for the pilot. Revisit when the long-term deployment model is decided.'],
  ['Where the code lives', 'The platform repos are colaberry/GlazeOff and GlazeOff-Client; ShopDraw is in karunswaroop/GlazeOff-Shopdraw.',
    'Its own repo, <code>colaberry/GlazeOff-AIA-Billing</code>, in FastAPI + React, with Sai\'s review on the first PR.'],
];

function compareTable() {
  return `<table><thead><tr><th style="width:15%">Topic</th><th style="width:31%">Sai's platform plan</th><th style="width:22%">Our plan</th><th style="width:12%">Verdict</th><th>What changes</th></tr></thead><tbody>
  ${COMPARE.map(([t, s, o, v, w]) => `<tr><td><b>${t}</b></td><td>${s}</td><td>${o}</td><td>${chip(v)}</td><td>${w}</td></tr>`).join('')}
  </tbody></table>`;
}

function platformSvg() {
  return `<svg viewBox="0 0 760 330" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, sans-serif">
  <rect x="5" y="5" width="750" height="320" rx="12" fill="none" stroke="#94a3b8" stroke-dasharray="5 5"/>
  <text x="20" y="27" font-size="12" font-weight="700" fill="#64748b">GLAZEOFF.AI ON GCP</text>
  <rect x="20" y="38" width="720" height="92" rx="10" fill="#0f766e"/>
  <text x="380" y="60" text-anchor="middle" font-size="14" font-weight="700" fill="#fff">PLATFORM CORE (Sai and Harsh)</text>
  ${[['AIX Auth', 'sign-in, /check, require()'], ['Clients + projects', 'client_id, RLS'], ['Document space', 'client/project/doc/vN'], ['Cost + usage', 'labels, usage log'], ['LLM gateway', 'de-identified']]
    .map(([a, b], i) => `<rect x="${32 + i * 142}" y="72" width="132" height="48" rx="7" fill="#115e59"/>
      <text x="${98 + i * 142}" y="92" text-anchor="middle" font-size="11.5" font-weight="700" fill="#fff">${a}</text>
      <text x="${98 + i * 142}" y="109" text-anchor="middle" font-size="9.5" fill="#ccfbf1">${b}</text>`).join('')}
  <text x="380" y="152" text-anchor="middle" font-size="11" fill="#475569">Every module plugs into the core through the same five contracts ↓</text>
  ${[['Takeoff + ShopDraw', 'Karun\'s GlazeOff app, via the job contract', '#e2e8f0', '#334155'],
     ['AIA progress billing', 'OURS · aia-billing · pilot 8 Dec', '#c7d2fe', '#1e3a8a'],
     ['Usage billing (T3.10)', 'invoices clients for platform use · later', '#fde68a', '#78350f']]
    .map(([a, b, f, c], i) => `<rect x="${20 + i * 243}" y="165" width="232" height="66" rx="9" fill="${f}" ${i === 1 ? 'stroke="#1e3a8a" stroke-width="2.5"' : ''}/>
      <text x="${136 + i * 243}" y="192" text-anchor="middle" font-size="13" font-weight="700" fill="${c}">${a}</text>
      <text x="${136 + i * 243}" y="212" text-anchor="middle" font-size="10" fill="${c}">${b}</text>`).join('')}
  ${[['1 Identity', 'require() on every route'], ['2 Tenancy', 'client_id + RLS'], ['3 Documents', 'platform file path'], ['4 Cost', 'labels + usage events'], ['5 Config', 'settings rows, not code']]
    .map(([a, b], i) => `<rect x="${20 + i * 145}" y="250" width="137" height="60" rx="8" fill="#fff" stroke="#0f766e" stroke-width="1.5"/>
      <text x="${88 + i * 145}" y="275" text-anchor="middle" font-size="12" font-weight="700" fill="#0f766e">${a}</text>
      <text x="${88 + i * 145}" y="293" text-anchor="middle" font-size="9.5" fill="#334155">${b}</text>`).join('')}
</svg>`;
}

const rows = (list) => list.map(([r, s]) => `<tr><td>${r}</td><td style="width:70px">${tag(s)}</td></tr>`).join('');

function body() {
  return `
  <h1>glazeoff.ai module rules: AIA progress billing</h1>
  <div class="meta">For Ali, to agree with Sai · 21 Nov 2026 · Sources: Sai's platform tracker (16 Nov), the Client Deployment Blueprint meeting (17 Nov), Sai's email (21 Nov), Basecamp list 10443345153</div>
  <div class="rule"></div>
  <div class="takeaway"><div class="label">Takeaway</div>
    <div class="headline">Mostly the same page. Sai's platform already sets the hard rules: GCP, FastAPI + React, client_id with row-level security, AIX Auth and a shared file layout. Our plan bends to them in ${COMPARE.filter((r) => r[3] === 'adjust').length} places. ${COMPARE.filter((r) => r[3] === 'settle').length} need a word with Sai first. The biggest: in his tracker, the "billing module" assigned to you is usage invoicing, not AIA billing.</div></div>
  <h2>Sai's plan vs ours</h2>
  ${compareTable()}

  <div class="pagebreak"></div>
  <h2>Where the module plugs in</h2>
  <figure style="width:86%;margin:6px auto 8px">${platformSvg()}<figcaption>The core is Sai's tracker, Phases 1 to 5. The three modules sit side by side. The five contracts are what keep a module "in form": any module that honors them can be switched on per client.</figcaption></figure>
  <h2>Names</h2>
  <table><thead><tr><th style="width:17%">Thing</th><th style="width:36%">Rule</th><th>Example</th><th style="width:70px">Source</th></tr></thead><tbody>
  ${NAMES.map(([a, b, c, s]) => `<tr><td><b>${a}</b></td><td>${b}</td><td>${c}</td><td>${tag(s)}</td></tr>`).join('')}
  </tbody></table>

  <div class="pagebreak"></div>
  <h2>Tables in the <code>aia_billing</code> schema (proposed)</h2>
  <table><thead><tr><th style="width:26%">Table</th><th>Holds</th></tr></thead><tbody>
  ${TABLES.map(([t, d]) => `<tr><td><code>${t}</code></td><td>${d}</td></tr>`).join('')}
  </tbody></table>
  <div class="note">The platform owns clients, users, roles and projects. These tables refer to them by id and never copy them.</div>
  <h2>Column rules</h2>
  <table><tbody>${rows(COLUMN_RULES)}</tbody></table>

  <div class="pagebreak"></div>
  <h2>A module is "in form" when</h2>
  <table><tbody>${rows(FORM_CHECKS)}</tbody></table>
  <h2>Settle these with Sai before code starts</h2>
  <table><thead><tr><th style="width:22%">Question</th><th style="width:32%">Why it's open</th><th>Recommendation</th></tr></thead><tbody>
  ${QUESTIONS.map(([q, w, r]) => `<tr><td><b>${q}</b></td><td>${w}</td><td>${r}</td></tr>`).join('')}
  </tbody></table>
  <div class="note good"><b>What doesn't change:</b> the demo's screens, the four-seat approval order, the G702/G703 math, the 8 Dec two-PM pilot, and the restore test before real data goes in.</div>
  <div class="note"><b>Access as of 21 Nov (Sai's second email):</b> Ali has write on colaberry/GlazeOff-Client and an invite to colaberry/GlazeOff. Karun still needs to add Ali to <code>glazeoff-billing</code> (adding people needs Owner; Sai has Editor) and to karunswaroop/GlazeOff-Shopdraw.</div>
  <p class="meta">SAI = already in Sai's tracker or blueprint. PROPOSED = ours; nothing tagged PROPOSED is agreed until Sai says so.</p>`;
}

(async () => {
  const css = baseCss() + `
    table td, table th { font-size: 8pt; padding: 3px 5px; line-height:1.35; }
    table { margin: 4px 0 8px; }
    h2 { margin-top: 12px; }
    .takeaway .headline { font-size: 11pt; }`;
  const html = htmlDoc({ title: 'glazeoff.ai module rules: AIA billing', css, body: body() });
  require('fs').writeFileSync(path.join(DOCS, `${STEM}.html`), html);
  const r = await renderPdf({ html, outPath: path.join(DOCS, `${STEM}.pdf`), maxPages: 4, margin: '12mm' });
  console.log(JSON.stringify(r));
})().catch((e) => { console.error(e.message); process.exit(1); });
