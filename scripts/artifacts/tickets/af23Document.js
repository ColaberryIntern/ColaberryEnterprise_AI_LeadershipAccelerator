/**
 * AF2.3's document PDF: the mapping, the gap list, the defect, and the decision.
 *
 * Shape copied from C2.6, which is the format Ali pointed at: the one-sentence asked/delivered
 * above everything, then the takeaway, then the evidence, then what the work does NOT establish.
 * Same data module as the one-page visual.
 */
const D = require('./af23Data');
const { esc, baseCss, barChart, stackBar } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const CSS = `${baseCss()}
  .askdel { margin: 0 0 14px; font-size: 10.5pt; }
  .askdel .row { margin-bottom: 4px; }
  .askdel .lbl {
    display: inline-block; min-width: 68px; font-size: 7.6pt; font-weight: 700;
    text-transform: uppercase; letter-spacing: .07em; color: var(--muted);
    vertical-align: top; padding-top: 2px;
  }
  .askdel .val { display: inline-block; width: calc(100% - 76px); vertical-align: top; }
  ol.tk { margin: 6px 0 0 18px; padding: 0; }
  ol.tk li { margin-bottom: 7px; }
  .opt { border: 1px solid var(--border); border-radius: 6px; padding: 9px 11px; margin: 0 0 8px; }
  .opt.rec { border-color: var(--cherry); background: var(--cherry-bg); }
  .opt .hd { font-weight: 700; margin-bottom: 3px; }
  .opt .id {
    display: inline-block; width: 17px; height: 17px; border-radius: 3px; background: var(--muted);
    color: #fff; text-align: center; line-height: 17px; font-size: 8pt; margin-right: 6px;
  }
  .opt.rec .id { background: var(--cherry); }
  .kv { font-size: 8.6pt; color: var(--muted); }
`;

function sectionMapTable() {
  return `<table>
  <tr><th>Domain</th><th>Intern</th><th>Admin section</th><th>Route<br>prefixes</th>
      <th>Narrowest role that reaches it</th><th>Verdict</th></tr>
  ${D.DOMAINS.map((d) => `<tr>
    <td><code>${esc(d.key)}</code></td>
    <td>${d.intern ? esc(d.intern) : '<em>no intern assigned</em>'}</td>
    <td>${d.section ? `<code>${esc(d.section)}</code>` : '<em>none exists</em>'}</td>
    <td style="text-align:right">${d.routes || '&mdash;'}</td>
    <td>${d.role ? `<code>${esc(d.role)}</code> &middot; ${esc(d.roleSections)}`
      : esc(d.roleSections)}</td>
    <td><span class="chip" style="background:${d.verdict.color}">${esc(d.verdict.label)}</span></td>
  </tr>`).join('')}
  </table>`;
}

/** Surface weight, so "a tab" and "the settings page" are not treated as the same grant. */
function surfaceChart() {
  const rows = D.DOMAINS.filter((d) => d.routes > 0)
    .sort((a, b) => b.routes - a.routes)
    .map((d) => ({
      label: `${d.key} → ${d.section}`.slice(0, 34),
      value: d.routes,
      color: d.verdict.color,
    }));
  return `<figure>${barChart({ rows, width: 660, barH: 17, gap: 6, labelW: 215 })}
    <figcaption>Admin path prefixes mapping to each domain's section, from the gate's own table.
      Bar color is the scoping verdict. The two domains with no section are absent because they
      have nothing to count &mdash; <code>product_experience</code> and <code>website</code>.
    </figcaption></figure>`;
}

function grantFlow() {
  return `<figure><div class="mermaid">graph TD
  A["Intern signs in to the portal"] --> B{"Holds a mgmt_role?"}
  B -- "no" --> Z["No management portal at all"]
  B -- "yes" --> C["Bridge mints a scoped admin token"]
  C --> D{"Path mapped in PATH_SECTION?"}
  D -- "no" --> E["403 - deny by default"]
  D -- "yes" --> F{"Section in the role's fixed set?"}
  F -- "no" --> E
  F -- "yes" --> G["Reaches the surface, read AND write"]
  style G fill:#f3f9f3,stroke:#2f7d32,color:#2d3748
  style E fill:#fdf3f2,stroke:#b3261e,color:#2d3748
  style Z fill:#f7fafc,stroke:#e2e8f0,color:#718096
  </div>
  <figcaption>The grant path. The role is the only place a section can come from, which is why a
    per-intern grant cannot be expressed today. Note the absence of any method test: the gate
    never reads <code>req.method</code>, so reaching a section carries write as well as read.
  </figcaption></figure>`;
}

function mentorDefect() {
  const m = D.MENTOR_DEFECT;
  return `<h2>A live defect found while measuring, and fixed</h2>
  <p><strong>${esc(m.title)}.</strong> <code>mgmtRoles.ts</code> declared
  <strong>${m.declared}</strong> management roles. The CHECK constraint permitted
  <strong>${m.permitted}</strong>. <code>${esc(m.missing)}</code> was added to the type union and to
  the role definitions &mdash; deliberately, with a careful comment about per-mentor scoping &mdash;
  and the constraint was never widened, so <code>mgmt_role = 'mentor'</code> was
  <strong>rejected by Postgres</strong> and the role could not be assigned to anybody.</p>
  ${stackBar({
    parts: [
      { label: 'Storable and declared', value: m.permitted, color: '#2f7d32' },
      { label: 'Declared but rejected by Postgres', value: m.declared - m.permitted, color: '#b3261e' },
    ],
    width: 660,
    height: 26,
  })}
  <div class="note">
    <strong>${esc(m.severity)}.</strong> ${esc(m.why)}
    Measured: ${m.scopeRows} rows in <code>career_mentor_scopes</code>, ${m.holders} members
    holding the role.
  </div>
  <p><strong>The fix is one word; the test is the point.</strong> ${esc(m.fix)}
  ${esc(m.mutation)}</p>
  <div class="note warn"><strong>Why this matters for your decision.</strong> It is the proof that
  "just add a narrow role" is a schema change, and that the last time someone added a role they
  forgot the constraint. ${esc(m.ddlSwallows)}</div>`;
}

function build() {
  const body = `
  <h1>AF2.3 &middot; Department tab scoping, one department per intern</h1>
  <div class="meta">Agent Factory &middot; Task AF2.3 &middot; P0 &middot; rollout blocker
    &middot; measured ${esc(D.MEASURED_ON)} &middot; prepared for Ali Muwwakkil</div>
  <div class="rule"></div>

  <div class="askdel">
    <div class="row"><span class="lbl">Asked</span><span class="val">${esc(D.ASKED)}</span></div>
    <div class="row"><span class="lbl">Delivered</span><span class="val">${esc(D.DELIVERED)}</span>
    </div>
  </div>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">${esc(D.HEADLINE)}</div>
  </div>

  <ol class="tk">
    <li><strong>Sarbjit's marketing tab &mdash; the example used on the call &mdash; has no narrow
      role that reaches it.</strong> The only roles including <code>campaigns</code> are Admin
      (13 of 14 sections) and Owner. It is also the richest surface of the ten, at 11 route
      prefixes. The same is true of Quincy's <code>platform</code>, which maps to
      <code>system</code>: tickets, reports, <strong>settings</strong>, events and automation.</li>
    <li><strong>The ticket's named artifact cannot be produced as specified.</strong> It asks for
      "a per-intern section grant". ${esc(D.RBAC.grantModel)} Issuing the grants needs four new
      roles and a widened CHECK constraint, which is an RBAC change and therefore yours.</li>
    <li><strong>Two interns would share one role.</strong> <code>admissions</code> grants
      <code>lead_ingestion</code> AND <code>internship</code>, so Kalkidan would also get
      Tashima's domain and Tashima would also get Kalkidan's. The internship queue carries an
      applicant's resume, phone number and interview transcript, which the code itself calls out as
      "a materially wider grant than editing curriculum".</li>
    <li><strong>One intern's domain has no surface at all.</strong> Nothing maps to
      <code>product_experience</code>, so there is nothing to grant Mihret and nothing to scope.
      No page was invented to close this, per the ticket's out-of-scope rule.</li>
    <li><strong>Update rights are not the problem.</strong> ${esc(D.RBAC.methodNote)} The one
      exception is <code>learner_success</code>, where <code>support</code> reaches only the
      read-only <code>students</code> surface and so fails link 2 anyway.</li>
  </ol>

  <h2>The mapping, measured</h2>
  <p>Read out of the gate's own path-to-section table and the role definitions, not from the nav.
    A nav entry is not access control, and this table is what the server enforces.</p>
  ${sectionMapTable()}

  <div class="pagebreak"></div>
  <h2>How much surface each grant actually carries</h2>
  ${surfaceChart()}

  <h2>Why a per-intern grant cannot be expressed</h2>
  ${grantFlow()}

  <div class="note warn"><strong>Two facts a reader will otherwise assume wrongly.</strong>
    <br><strong>Legacy admins bypass the gate entirely.</strong> ${esc(D.RBAC.legacyBypass)}
    This is why Taiwo passes all nine admissions routes today (AF2.6), and it means an intern given
    a legacy admin login would be scoped by nothing.
    <br><strong>An unmapped path 403s its own owner.</strong> ${esc(D.RBAC.unmappedIs403)}
  </div>

  <div class="pagebreak"></div>
  ${mentorDefect()}

  <h2>The gap list the ticket asked for</h2>
  <p><strong>Domains with no admin surface today (${D.COUNTS.domainsNoSurface} of
    ${D.COUNTS.domains}):</strong>
    ${D.DOMAINS.filter((d) => d.verdict === D.V.NO_SURFACE)
      .map((d) => `<code>${esc(d.key)}</code>`).join(', ')}.
    No path prefix maps to either. No pages were invented.</p>
  <p><strong>Domains with a real surface but no narrow role (${D.COUNTS.domainsNoRole} of
    ${D.COUNTS.domains}):</strong>
    ${D.DOMAINS.filter((d) => d.verdict === D.V.NO_ROLE)
      .map((d) => `<code>${esc(d.key)}</code>`).join(', ')}.</p>

  <h2>Your decision</h2>
  ${D.OPTIONS.map((o) => `
    <div class="opt${o.recommended ? ' rec' : ''}">
      <div class="hd"><span class="id">${o.id}</span>${esc(o.title)}${o.recommended
        ? ' <span style="color:var(--cherry)">&#9733; recommended</span>' : ''}</div>
      <div>${esc(o.detail)}</div>
      <div class="kv"><strong>Covers:</strong> ${esc(o.covers)} &nbsp;&middot;&nbsp;
        <strong>Cost:</strong> ${esc(o.cost)}</div>
    </div>`).join('')}
  <p><strong>Separately, and smaller:</strong> Mihret's domain has no surface. Placeholder, or
    reassign her to a domain that has one?</p>

  <h2>What this does not establish</h2>
  <ul>
    <li><strong>No grant has been issued to any intern.</strong> Nobody's access changed. Ruth
      Kumera's onboarding requirements stand and she is not activated.</li>
    <li><strong>No role definition was widened.</strong> Provable by <code>git diff</code> of
      <code>mgmtRoles.ts</code>, which is empty &mdash; AF2.3's fourth acceptance criterion.</li>
    <li><strong>The per-route live-call assertion is not done.</strong> The ticket asks for each
      intern's token to be proven against its own surface and refused at least two others. That
      needs the grants to exist first, so it is blocked behind your decision rather than skipped.
      A role definition is not proof that a route is guarded.</li>
    <li><strong>One stale row, noted not touched.</strong> <code>agent_domain_projects</code> still
      carries the old admissions blocker claiming Taiwo has no admin login. AF2.6 disproved it and
      PR #3100 corrected the registry, but the reconcile that rewrites those rows has not run on a
      deploy carrying the correction. A deploy-ordering issue, not a code one.</li>
  </ul>

  <div class="meta" style="margin-top:16px;border-top:1px solid var(--border);padding-top:7px">
    Sources: ${esc(D.SOURCES.gate)} &middot; ${esc(D.SOURCES.roles)} &middot;
    ${esc(D.SOURCES.db)}. Built from the same data module as the one-page visual.
  </div>`;

  return htmlDoc({ title: 'AF2.3 department tab scoping', css: CSS, body });
}

module.exports = { build };
