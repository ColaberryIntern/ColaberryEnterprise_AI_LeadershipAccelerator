/**
 * C3.4's document and one-page visual. Both read c34Data only.
 *
 * The visual's job is to answer one question before anyone opens the document: should OpenAI run
 * in parallel with Anthropic, and the answer is no, with the probe evidence that supports it.
 */
const D = require('./c34Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const conf = (c) => `<span class="cf" style="background:${c.color}">${esc(c.k)}</span>`;
const code = (s) => (s === 200 ? '#2f7d32' : s === 404 ? '#b3261e' : '#b26a00');

const SHARED = `
  .cf { display:inline-block; padding:0 6px; border-radius:8px; font-size:7pt;
        font-weight:700; color:#fff; white-space:nowrap; }
  .st { font-family:Consolas,monospace; font-weight:700; }
  .warn { background:#fdf3f2; border:1px solid #f3c9c6; border-radius:6px;
          padding:9px 12px; margin:8px 0; }
  .warn b { color:#b3261e; }
  .ok { background:#f3f9f3; border:1px solid #cfe6d4; border-radius:6px;
        padding:9px 12px; margin:8px 0; }
  .vd { border-left:4px solid var(--muted); padding:8px 12px; margin:0 0 8px; background:#fff;
        border-top:1px solid var(--border); border-right:1px solid var(--border);
        border-bottom:1px solid var(--border); border-radius:0 6px 6px 0; }
`;

function controlsTable() {
  return `<table><tr><th style="width:44%">Control probed</th><th style="width:10%">Status</th>
  <th>What it establishes</th></tr>
  ${D.CONTROLS.map((c) => `<tr><td><code>${esc(c.url)}</code></td>
    <td class="st" style="color:${code(c.status)}">${c.status}</td>
    <td>${esc(c.means)}</td></tr>`).join('')}</table>`;
}

function probeTable() {
  return `<table><tr><th style="width:44%">URL</th><th style="width:10%">Status</th>
  <th>Reading</th></tr>
  ${D.PROBES.map((p) => `<tr><td><code>${esc(p.url)}</code></td>
    <td class="st" style="color:${code(p.status)}">${p.status}</td>
    <td>${esc(p.reads)}</td></tr>`).join('')}</table>`;
}

/* ----------------------------- document ----------------------------- */

function buildDocument() {
  const css = `${baseCss()}
    .wrap { max-width:920px; margin:0 auto; padding:30px 24px 60px; }
    .asked { background:#eef6ff; border-left:4px solid #1f6feb; padding:12px 16px;
             margin:0 0 15px; border-radius:0 5px 5px 0; }
    ${SHARED}`;

  const body = `<div class="wrap">
  <h1>The OpenAI route, re-verified</h1>
  <div class="meta">C3.4 &middot; AI Capability Commercialization &middot; every claim re-read
    ${esc(D.ACCESS)} &middot; baseline ${esc(D.BASELINE)}
    &middot; <strong>READY FOR ALI REVIEW</strong></div>
  <div class="rule"></div>

  <div class="asked"><strong>Asked and delivered.</strong> The ticket asked me to re-verify the
  OpenAI route from primary sources, prove absences by probing rather than inferring, re-check
  three titles, and preserve two known corrections. <strong>Delivered: every absence established
  through a channel validated in both directions on the same run, three titles re-read, both
  corrections carried forward intact, and a recommendation on the question the ticket
  reserves to you.</strong> Three of the four baseline facts hold; the fourth was wrong when it
  was written.</div>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">${esc(D.HEADLINE)}</div>
  </div>

  ${D.SO_WHAT.map((s) => `<p>${esc(s)}</p>`).join('')}

  <h2>How absence was proven, and why that needed care</h2>
  <div class="warn"><b>A naive probe log is worthless on this domain.</b> ${esc(D.CLOUDFLARE)}</div>
  <p>So every run validates its own channel first. If the known-real control does not return 200
  the channel is blocked and no absence in that run means anything; if the nonsense control does
  not return 404 the host soft-404s and status codes cannot prove absence at all. The tool fails
  the run in either case rather than printing a log that would be read as evidence.</p>
  ${controlsTable()}
  <p>With that established, the probes below are evidence rather than noise.</p>
  ${probeTable()}

  <h2>What the baseline got right, and the one thing it got wrong</h2>
  ${D.BASELINE_CHECK.map((b) => `<div class="vd" style="border-left-color:${b.color}">
    <strong>${esc(b.claim)}</strong>
    <div style="color:${b.color};font-weight:700;margin:3px 0">${esc(b.verdict)}</div>
    <div>${esc(b.detail)}</div></div>`).join('')}

  <h2>Every door that exists, and whether it opens for us</h2>
  <table><tr><th style="width:21%">Door</th><th style="width:13%">Open?</th>
  <th>What it is</th><th style="width:21%">Fit</th></tr>
  ${D.DOORS.map((d) => `<tr><td><strong>${esc(d.name)}</strong>
    <div class="meta">${esc(d.url)}</div></td>
    <td>${esc(d.open)}</td><td>${esc(d.detail)}</td><td>${esc(d.fit)}</td></tr>`).join('')}
  </table>

  <h2>How an organization actually got in</h2>
  <p>${esc(D.GOODWILL.what)}</p>
  <ol>${D.GOODWILL.structure.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
  <div class="ok"><strong>Read across:</strong> ${esc(D.GOODWILL.readAcross)}</div>

  <h2>The people, re-read rather than recalled</h2>
  <table><tr><th style="width:17%">Person</th><th style="width:22%">Title</th>
  <th style="width:12%">Confidence</th><th>Source and caution</th></tr>
  ${D.PEOPLE.map((p) => `<tr><td><strong>${esc(p.name)}</strong></td><td>${esc(p.title)}</td>
    <td>${conf(p.conf)}</td>
    <td class="meta">${esc(p.src)}<br>${esc(p.note)}</td></tr>`).join('')}</table>
  <p>No email address was sought, inferred or recorded for anyone.</p>

  <h2>Two corrections, carried forward rather than re-made</h2>
  <table><tr><th style="width:18%">Person</th><th style="width:26%">The error</th>
  <th>Status in this pass</th></tr>
  ${D.CORRECTIONS.map((c) => `<tr><td><strong>${esc(c.who)}</strong></td>
    <td class="meta">Previously ${esc(c.wrong)}. Correct: ${esc(c.right)}.</td>
    <td>${esc(c.status)}</td></tr>`).join('')}</table>

  <h2>The decision this is for</h2>
  <p class="meta">${esc(D.DECISION.question)}</p>
  <div class="ok"><strong>Recommendation: ${esc(D.DECISION.recommend)}</strong></div>
  <ol>${D.DECISION.why.map((w) => `<li>${esc(w)}</li>`).join('')}</ol>
  <p><strong>Do these anyway:</strong></p>
  <ul>${D.DECISION.butDo.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>

  <h2>What could not be verified</h2>
  <table><tr><th style="width:34%">Item</th><th>Why, and what it would take</th></tr>
  ${D.UNVERIFIED.map((u) => `<tr><td><strong>${esc(u.what)}</strong></td>
    <td>${esc(u.why)}</td></tr>`).join('')}</table>
  </div>`;
  return htmlDoc({ title: 'C3.4 The OpenAI route re-verified', css, body });
}

/* ----------------------------- one-pager ---------------------------- */

function buildVisual() {
  const css = `${baseCss()}
    body { font-size:8.5pt; }
    h1 { font-size:16pt; }
    h2 { font-size:8.8pt; margin:5px 0 3px; border:0; padding:0; text-transform:uppercase;
         letter-spacing:.07em; color:var(--ink); }
    .cols { display:flex; gap:15px; } .col { flex:1; min-width:0; }
    .takeaway { padding:6px 11px; margin-bottom:6px; }
    .takeaway .headline { font-size:10.8pt; } .takeaway .label { font-size:7pt; }
    table { font-size:7.1pt; margin:3px 0 5px; } th { padding:3px 5px; font-size:6.5pt; }
    td { padding:3px 5px; }
    ${SHARED}
    .vd { padding:4px 8px; margin:0 0 4px; font-size:7.2pt; }
    .warn, .ok { padding:6px 9px; font-size:7.2pt; margin:4px 0; }
    .foot { margin-top:6px; font-size:6.7pt; color:var(--muted);
            border-top:1px solid var(--border); padding-top:5px; }`;

  const body = `
  <h1>The OpenAI route, re-verified</h1>
  <div class="meta">C3.4 &middot; absences proven by probe, not inferred &middot; read
    ${esc(D.ACCESS)} &middot; one page</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">${esc(D.HEADLINE)}</div>
  </div>

  <div class="cols">
    <div class="col">
      <h2>The probe, with its controls</h2>
      <div class="warn"><b>A naive log would be worthless here.</b> Plain curl returns 403 both
      for pages that exist and pages that do not, so it cannot tell them apart. Every run
      validates its channel first and fails rather than reporting.</div>
      <table><tr><th>Control</th><th>Code</th></tr>
      ${D.CONTROLS.map((c) => `<tr><td><code>${esc(c.url)}</code></td>
        <td class="st" style="color:${code(c.status)}">${c.status}</td></tr>`).join('')}</table>
      <table><tr><th>Probe</th><th>Code</th><th>Reads</th></tr>
      ${D.PROBES.slice(0, 6).map((p) => `<tr><td><code>${esc(p.url.slice(0, 40))}</code></td>
        <td class="st" style="color:${code(p.status)}">${p.status}</td>
        <td>${esc(p.reads.split('.')[0])}</td></tr>`).join('')}</table>

      <h2>Every door, and whether it opens</h2>
      <table><tr><th style="width:38%">Door</th><th>Open?</th></tr>
      ${D.DOORS.map((d) => `<tr><td><strong>${esc(d.name)}</strong></td>
        <td>${esc(d.open)}</td></tr>`).join('')}</table>
    </div>

    <div class="col">
      <h2>What our own baseline got wrong</h2>
      ${D.BASELINE_CHECK.map((b) => `<div class="vd" style="border-left-color:${b.color}">
        <strong>${esc(b.claim)}</strong><br>
        <span style="color:${b.color};font-weight:700">${esc(b.verdict)}</span></div>`).join('')}
      <div class="warn" style="font-size:7pt"><b>The miss that matters.</b> Select, Advanced and
      Elite tiers plus $150 million and a goal of 300,000 certified consultants were announced
      14 June 2026, four months BEFORE our baseline pass, and it recorded none of them.</div>

      <h2>The recommendation</h2>
      <div class="ok"><strong>${esc(D.DECISION.recommend)}</strong></div>
      <div style="font-size:7.2pt;margin-bottom:4px">Anthropic publishes a front door with three
      gates we already meet. OpenAI publishes none for what we do. The cost of running both is
      not money, it is Ali\'s attention, which C4.8 names as the binding constraint.</div>
      <div style="font-size:7.2pt"><strong>Do anyway:</strong> submit the partner application, it
      costs an afternoon and the 300,000-consultant program is only reachable from inside. Treat
      the Goodwill Keystone pattern as the real strategy: be visibly good in a named sector and
      be recruited. Re-check in January.</div>
    </div>
  </div>

  <div class="foot">Absence is only claimed where a validated control pair was recorded in the
  same run, enforced by a build assertion. Both prior corrections are carried forward and a
  second assertion fails if either is dropped. No email address was sought or recorded. Nothing
  was sent to OpenAI.</div>`;
  return htmlDoc({ title: 'C3.4 The OpenAI route, one page', css, body });
}

module.exports = { buildDocument, buildVisual };
