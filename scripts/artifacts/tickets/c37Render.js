/**
 * C3.7's two deliverables: the one-page ranked matrix, and the document behind it.
 *
 * The visual leads with the cross-cutting finding rather than the ranking, because the
 * finding changes what the decision is about and the ranking only answers it afterwards.
 */
const D = require('./c37Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .door { display:inline-block; padding:1px 6px; border-radius:9px; font-size:7.2pt;
          font-weight:700; color:#fff; white-space:nowrap; }
  .eco { border:1px solid var(--border); border-radius:6px; padding:8px 11px; margin:0 0 7px; }
  .eco .hd { font-weight:700; font-size:10.5pt; }
  .eco .prog { color:var(--muted); font-size:8.4pt; }
  .eco .lab { font-weight:700; font-size:8.4pt; margin-top:5px; }
  .rk { display:inline-block; width:19px; height:19px; border-radius:50%; background:var(--cherry);
        color:#fff; text-align:center; font-weight:700; font-size:9pt; line-height:19px;
        margin-right:6px; }
  .rk.low { background:var(--muted); }
`;

const doorChip = (d) => `<span class="door" style="background:${d.color}">${esc(d.k)}</span>`;

function ecoCards(short) {
  return D.RANKED.map((r) => `<div class="eco">
    <div class="hd"><span class="rk${r.rank > 4 ? ' low' : ''}">${r.rank}</span>${esc(r.name)}
      ${doorChip(r.door)}</div>
    <div class="prog">${esc(r.program)}</div>
    ${short ? `<div style="margin-top:4px;font-size:8.6pt">${esc(String(r.route).split('. ')[0])}.</div>`
    : `<div class="lab">Training category</div><div>${esc(r.category)}</div>
       <div class="lab">Entry route</div><div>${esc(r.route)}</div>
       <div class="lab">Eligibility</div><div>${esc(r.eligibility)}</div>
       <div class="lab">Why it fits</div><div>${esc(r.fit)}</div>
       <div class="lab">What is against it</div><div>${esc(r.against)}</div>`}
  </div>`).join('');
}

/* ------------------------------------------------------------------ *
 * 1. THE ONE-PAGE VISUAL
 * ------------------------------------------------------------------ */

function buildVisual() {
  const css = `${baseCss()}
    /* No @page size: the renderer emits Letter and sets the margin. Declaring a size here
       fights it and silently forces a second sheet. */
    @page { margin: 10mm; }
    .wrap { padding:0; }
    h1 { font-size:16pt; }
    h2 { font-size:10.5pt; margin:9px 0 5px; }
    body { font-size:9pt; }
    .cols { display:flex; gap:13px; align-items:flex-start; }
    .col { flex:1; }
    .takeaway { padding:9px 12px; margin:0 0 9px; }
    .takeaway .headline { font-size:10.5pt; }
    .eco { padding:6px 9px; margin:0 0 5px; }
    .eco .hd { font-size:9.6pt; }
    ${SHARED}`;

  const body = `<div class="wrap">
    <h1>C3.7 &middot; Strategic Partner Expansion Map</h1>
    <div class="meta">Eight ecosystems researched against primary sources ${esc(D.AS_OF)}
      &middot; ranked by fit and reachability, never by brand size</div>
    <div class="rule"></div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.HEADLINE)}</div>
    </div>

    <div class="cols">
      <div class="col">
        <h2>The ranking</h2>
        <table>
          <tr><th style="width:6%">#</th><th style="width:19%">Ecosystem</th>
            <th style="width:28%">The door</th><th>In one line</th></tr>
          ${D.RANKED.map((r) => `<tr>
            <td><b>${r.rank}</b></td>
            <td><b>${esc(r.name)}</b></td>
            <td>${doorChip(r.door)}</td>
            <td>${esc(String(r.route).split('. ')[0])}.</td>
          </tr>`).join('')}
        </table>
      </div>
      <div class="col">
        <h2>Why the ranking looks wrong, and is not</h2>
        <div class="note" style="padding:7px 10px">The two largest brands rank last. <b>AWS is
          shut</b>, verified on a page AWS modified the day before we looked: "not currently
          accepting new applications", no form, no waitlist, no reopening criteria.
          <b>Google Cloud is invitation only</b>, in its own program document. Ranking this
          map by brand size is the specific failure the ticket names, and it would have put
          both in the top two.</div>

        <h2>What none of the eight does</h2>
        <div class="note warn" style="padding:7px 10px">Every one of them licenses you to
          teach <b>the vendor&rsquo;s courseware about the vendor&rsquo;s products</b>. Not
          one has a category, a field or a scoring mechanic for proof of what a learner
          actually built, and several forbid altering the content. So none is a channel for
          the offer we already sell. Each is a route for a <b>second, product-training line
          of business</b> beside it.</div>

        <h2>The one route that would carry our own program</h2>
        <div class="note good" style="padding:7px 10px"><b>Knimbus.</b> ${esc(D.KNIMBUS.distinction)}
          Reaches more than 600 institutions with an identity layer and bundled compute.
          <br><br><b>Carry the caution with it:</b> Indian higher education is a different
          buyer, geography and funding mechanism. A second motion under test, not proof the
          primary one works.
          <br><br><b>So the decision is not which ecosystem.</b> It is whether we want a
          product-training line at all. If no, these are eight dead ends and Knimbus is the
          answer. If yes, NVIDIA is the one to open.</div>
      </div>
    </div>
  </div>`;

  return htmlDoc({ title: 'C3.7 - Strategic Partner Expansion Map', css, body });
}

/* ------------------------------------------------------------------ *
 * 2. THE DOCUMENT
 * ------------------------------------------------------------------ */

function buildDocument() {
  const css = `${baseCss()}
    .wrap { max-width:900px; margin:0 auto; padding:30px 24px 60px; }
    .asked { background:#eef6ff; border-left:4px solid #1f6feb; padding:12px 16px;
             margin:0 0 15px; border-radius:0 5px 5px 0; }
    ${SHARED}`;

  const body = `<div class="wrap">
    <h1>C3.7 &middot; Strategic Partner Expansion Map</h1>
    <div class="meta">Researched against primary sources ${esc(D.AS_OF)} &middot; Ticket C3.7
      &middot; no outreach initiated</div>
    <div class="rule"></div>

    <div class="asked">
      <b>What the ticket asked for.</b> Rank the next tier of strategic ecosystems so the
      company is not dependent on two labs, with a named entry route for each, ranked by fit
      and reachability rather than brand size, and no campaign started.
      <br><br>
      <b>What was delivered.</b> Eight ecosystems researched against primary vendor sources,
      ranked, each with its entry route and the reasoning shown, plus a finding that changes
      what the decision is about.
    </div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.HEADLINE)}</div>
    </div>
    ${D.SO_WHAT.map((s) => `<p>${esc(s)}</p>`).join('')}

    <h2>1. The ranking at a glance</h2>
    <table>
      <tr><th style="width:5%">#</th><th style="width:16%">Ecosystem</th>
        <th style="width:26%">Training category</th><th>The door</th></tr>
      ${D.RANKED.map((r) => `<tr><td><b>${r.rank}</b></td><td><b>${esc(r.name)}</b></td>
        <td>${esc(r.program)}</td><td>${doorChip(r.door)}</td></tr>`).join('')}
    </table>
    <div class="note"><b>Ranked by fit and reachability, never brand size.</b> That is the
    ticket&rsquo;s explicit warning and it matters here: the two largest brands in the set
    rank seventh and eighth. A build assertion fails if a shut or invitation-only ecosystem
    ever climbs into the top half of this table.</div>

    <div class="pagebreak"></div>
    <h2>2. Each ecosystem, with the reasoning shown</h2>
    ${ecoCards(false)}

    <h2>3. The route that would carry our own program</h2>
    <p><b>${esc(D.KNIMBUS.what)}.</b> ${esc(D.KNIMBUS.why)}</p>
    <div class="note good">${esc(D.KNIMBUS.distinction)}</div>
    <div class="note warn"><b>The caution travels with it.</b> ${esc(D.KNIMBUS.caution)}</div>

    <h2>4. What we could not establish</h2>
    <ol>${D.LIMITS.map((l) => `<li style="margin-bottom:6px">${esc(l)}</li>`).join('')}</ol>

    <h2>5. What the ticket asks you to decide</h2>
    <p>Which ecosystem to approach after the first two, and when. The map says the prior
    question is whether a product-training line of business is wanted at all, because every
    one of the eight sells the vendor&rsquo;s courseware rather than ours. If it is, NVIDIA
    is the one to open and the preparation is concrete and controllable: NVIDIA states in
    writing that instructor quality carries the most weight at assessment, so the task is
    identifying two or three instructors who can pass a workshop as a student and clear a
    teach-back. If it is not, the honest answer is that these eight are dead ends for the
    offer we have, and the channel thesis runs through Knimbus instead.</p>
    <div class="note"><b>No outreach has been initiated</b>, which the ticket puts out of
    scope and a build assertion enforces against this document&rsquo;s own prose.</div>
  </div>`;

  return htmlDoc({ title: 'C3.7 - Strategic Partner Expansion Map', css, body });
}

module.exports = { buildVisual, buildDocument };
