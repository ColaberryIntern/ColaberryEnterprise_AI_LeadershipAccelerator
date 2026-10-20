/**
 * C8.9 renderers. All data comes from c89Data, which checks the mechanism against source.
 *
 * The one-pager leads with "no code was written and that is the finding", because the
 * instinct on a P0 build ticket is to ship something, and the honest answer here is that
 * the build exists and the gap is a decision.
 */
const D = require('./c89Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .lede{font-size:12.5px;line-height:1.5;margin:0 0 10px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .met{color:#16a34a;font-weight:700}
  .blocked{color:#b45309;font-weight:700}
  .cannot{color:#b3261e;font-weight:700}
  .flag{background:#fff7ed;border-left:3px solid #ea580c;padding:8px 10px;margin:8px 0;
        font-size:11px}
  .alarm{background:#fef2f2;border-left:4px solid #b3261e;padding:10px 12px;margin:8px 0}
  .ok{background:#f0fdf4;border-left:3px solid #16a34a;padding:8px 10px;margin:8px 0;
      font-size:11px}
  .num{font-variant-numeric:tabular-nums;font-weight:700}
  .no{color:#b3261e;font-weight:700}
  ul{margin:4px 0 8px 16px;padding:0}
  li{margin:3px 0}
`;

const cls = (v) => (v === 'MET' ? 'met' : v === 'BLOCKED' ? 'blocked' : 'cannot');

function criteriaTable(full) {
  return `<table>
    <thead><tr><th>Verdict</th><th>Criterion</th>${full ? '<th>On what evidence</th>' : ''}</tr></thead>
    <tbody>${D.CRITERIA.map((c) => `<tr>
      <td class="${cls(c.verdict)}">${esc(c.verdict)}</td>
      <td>${esc(c.text)}</td>
      ${full ? `<td>${esc(c.evidence)}</td>` : ''}
    </tr>`).join('')}</tbody></table>`;
}

function cohortTable() {
  return `<table>
    <thead><tr><th>Cohort</th><th>Learners</th><th>A candidate?</th></tr></thead>
    <tbody>${D.COHORTS.map((c) => `<tr>
      <td>${esc(c.name)}</td>
      <td class="num">${c.learners}</td>
      <td>${c.institutional ? 'Yes' : '<span class="no">NO</span>'} &middot; ${esc(c.why)}</td>
    </tr>`).join('')}</tbody></table>`;
}

function buildVisual() {
  const m = D.MEASURED;
  const css = baseCss() + SHARED;
  const body = `
    <h1>C8.9 &middot; Cohort to organization join</h1>
    <p class="lede"><strong>No code was written, and that is the finding.</strong> The join
    is entirely built: the table is created at boot, the service is tenant-scoped and
    idempotent, the routes exist, and the existing tests cover it. What is missing is one
    decision and one critical fix that belongs to another ticket.</p>

    ${criteriaTable(false)}

    <div class="grid2">
      <div>
        <h2>Measured in production, ${esc(D.AS_OF)}</h2>
        <table><tbody>
          <tr><td><code>org_cohorts</code> rows</td><td class="num no">${m.orgCohorts}</td></tr>
          <tr><td>organizations</td><td class="num">${m.organizations}</td></tr>
          <tr><td>cohorts</td><td class="num">${m.cohorts}</td></tr>
          <tr><td><code>org_members</code></td><td class="num">${m.orgMembers}</td></tr>
          <tr><td><code>tenant_memberships</code> / <code>tenants</code></td>
            <td class="num no">${m.tenantMemberships} / ${m.tenants}</td></tr>
        </tbody></table>
        <div class="alarm"><strong>Criterion 3 cannot be met by this ticket.</strong>
        <code>tenant_memberships</code> holds ${m.tenantMemberships} rows against
        ${m.tenants} tenants, so the isolation layer is in permissive mode. That is C7.7
        gap <strong>G2</strong>, rated CRITICAL. Populating the join before it closes would
        group learners without isolating them: the appearance of a license boundary
        without the boundary.</div>
      </div>
      <div>
        <h2>Which cohort could be attached</h2>
        ${cohortTable()}
        <div class="flag"><strong>The biggest cohort is the wrong one.</strong> Attaching a
        prospect pool to an organization asserts that 435 people belong to that institution.
        It is the first thing anyone would reach for and the most damaging thing this join
        could get wrong.</div>
      </div>
    </div>

    <div class="ok"><strong>What needs your decision:</strong> ${esc(D.DECISION)}</div>`;
  return htmlDoc({ title: 'C8.9 - Cohort to Organization Join', css, body });
}

function buildDocument() {
  const m = D.MEASURED;
  const css = baseCss() + SHARED;
  const body = `
    <h1>C8.9 &middot; Cohort to organization join: what is built, what is empty, and what
    is blocked</h1>
    <p class="lede">The ticket warns that "a table with the right shape and zero records
    reads as capability and is not", and asks for proof with real data rather than a
    migration. The honest answer runs in both directions: the mechanism is real, the rows
    are not, and the isolation that would make the rows meaningful belongs to another
    ticket.</p>

    <h2>The three criteria</h2>
    ${criteriaTable(true)}

    <h2>Why no code was written</h2>
    <p>Everything criterion 1 asks for already exists:</p>
    <ul>
      <li><code>org_cohorts</code> is created at boot by <code>ensureOrgAccountSchema</code>,
      called from <code>server.ts</code>, with a unique index on
      <code>(org_id, cohort_id)</code>.</li>
      <li><code>adminOrgService.addCohortToOrganization</code> takes a tenant scope,
      validates both the organization and the cohort, and uses <code>findOrCreate</code>, so
      a re-link is a no-op rather than a duplicate row.</li>
      <li><code>POST</code> and <code>DELETE /api/admin/organizations/:id/cohorts</code>
      are routed behind <code>requireAdmin</code>, and the delete confirms the org is in
      scope before removing anything.</li>
      <li><code>adminOrgService.test.ts</code> already covers the create and the idempotent
      re-link.</li>
    </ul>
    <p>Writing a second implementation would be the mirror image of the failure this ticket
    warns about: shipping code to look busy against a gap that is not a code gap. A build
    assertion in this artifact fails if any of the above stops being true, so the verdict
    cannot go stale.</p>

    <h2>Why the rows are not mine to write</h2>
    <p>Two reasons, and the second is the real one.</p>
    <ul>
      <li>Production database work in this repo is read-only for me by standing rule.</li>
      <li><strong>Attaching a cohort to an organization is an assertion about who a group of
      learners belongs to.</strong> There are ${m.organizations} organizations and
      ${m.cohorts} cohorts, and nothing in the data says which bought which. Guessing would
      mis-attribute real people to an institution that did not buy them, and it would be
      invisible afterwards because the join would look populated and correct.</li>
    </ul>
    ${cohortTable()}

    <h2>Why criterion 3 is blocked elsewhere</h2>
    <p><code>tenant_memberships</code> holds ${m.tenantMemberships} rows against
    ${m.tenants} tenants. That is the live state of C7.7's gap <strong>G2</strong>, rated
    CRITICAL: the tenancy layer is built and fails closed, but it switches to a permissive
    mode while the membership table is empty, and that is where it is now.</p>
    <p>So an institutional license holder cannot be shown only their own learners today, no
    matter what <code>org_cohorts</code> contains. Populating the join first would create
    the appearance of a license boundary without the boundary, which is worse than an empty
    table because it reads as done.</p>

    <h2>What this means for the Knimbus channel</h2>
    <p>The ticket records this as the gate on C3.12 and on delivery of any institutional
    license sold under C2.3. The gate is narrower than it looked: the plumbing is in place,
    and what stands between here and a deliverable institutional license is one attachment
    decision and the G2 tenancy migration.</p>

    <h2>What needs your decision</h2>
    <ol>
      <li><strong>${esc(D.DECISION)}</strong> Name the organization and the cohort and I
      will make the attachment through the existing admin route, not by hand in the
      database.</li>
      <li>Whether C7.7 G2 is scheduled before any institutional license is sold, since
      criterion 3 depends entirely on it.</li>
    </ol>

    <p style="font-size:10px;color:#64748b;margin-top:12px">
    <strong>REVIEW STATE: BLOCKED - ALI DECISION REQUIRED</strong></p>`;
  return htmlDoc({ title: 'C8.9 - Cohort to Organization Join', css, body });
}

module.exports = { buildVisual, buildDocument };
