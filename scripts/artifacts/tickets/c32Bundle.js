/**
 * C3.2's meeting package, as ONE reviewable HTML bundle.
 *
 * HTML only. The ticket's acceptance criteria include "PDF not generated before approval", so
 * the build entrypoint deliberately does not call renderPdf. That is the one place this ticket
 * departs from the standing two-PDF artifact rule, and it departs because the ticket says so.
 *
 * Seven deliverables, in the order a reader needs them rather than the order the ticket lists
 * them: the flags Ali must decide first, then the deck, then everything that supports it.
 */
const D = require('./c32Data');
const { FAQ, RESERVED } = require('./c32Faq');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const CSS = `${baseCss()}
  body { font-size: 11pt; }
  .wrap { max-width: 980px; margin: 0 auto; padding: 32px 26px 70px; }
  .asked { background: #eef6ff; border-left: 4px solid #1f6feb; padding: 12px 16px;
           margin: 0 0 16px; border-radius: 0 5px 5px 0; }
  .slide { border: 1px solid var(--border); border-radius: 8px; margin: 0 0 12px;
           padding: 14px 18px; background: #fff; }
  .slide.ask { border: 2px solid var(--cherry); background: var(--cherry-bg); }
  .slide .num { display: inline-block; width: 22px; height: 22px; border-radius: 4px;
                background: var(--cherry); color: #fff; font-weight: 700; font-size: 10pt;
                text-align: center; line-height: 22px; margin-right: 8px; }
  .slide .kick { font-size: 8pt; letter-spacing: .09em; text-transform: uppercase;
                 color: var(--muted); font-weight: 700; }
  .slide h3 { display: inline; font-size: 13pt; margin: 0; }
  .slide ul { margin: 8px 0 6px 20px; }
  .slide li { margin: 4px 0; }
  .cites { font-size: 8pt; color: var(--muted); margin-top: 6px; }
  .cites code { font-size: 8pt; }
  .flag { border: 1px solid #f3c9c6; background: #fdf3f2; border-radius: 6px;
          padding: 11px 14px; margin: 0 0 10px; }
  .flag .id { font-weight: 700; color: #b3261e; }
  .flag .ask { margin-top: 6px; font-weight: 700; }
  .never { color: #b3261e; font-size: 9pt; }
  .leave { border: 2px solid var(--ink); border-radius: 8px; padding: 18px 22px; margin: 10px 0; }
  .leave h3 { margin-top: 0; }
  .toc { columns: 2; font-size: 10pt; margin: 0 0 18px; }
  .toc a { color: var(--cherry-deep); }
  .excluded { font-size: 9pt; }
`;

const cites = (ids) => (ids.length
  ? `<div class="cites">Registry: ${ids.map((i) => `<code>${esc(i)}</code>`).join(' &middot; ')}</div>`
  : '');

function deck() {
  return D.DECK.map((s) => `<div class="slide${s.isAsk ? ' ask' : ''}">
    <div><span class="num">${s.n}</span><span class="kick">${esc(s.kicker)}</span></div>
    <h3>${esc(s.title)}</h3>
    <ul>${s.body.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
    ${cites(s.claims)}
  </div>`).join('');
}

function leaveBehind() {
  return `<div class="leave">
  <h3>Colaberry, in one page</h3>
  <p><strong>What we do.</strong> We get organizations live on Claude and verify what their people
  actually built, at the commit rather than at the certificate.</p>
  <p><strong>What is running today</strong>, as of ${esc(D.AS_OF)}:
  ${D.LIVE.stories.toLocaleString('en-US')} learner stories verified against a real commit across
  ${D.LIVE.storyProjects} projects; ${D.LIVE.projects} projects in flight;
  ${D.LIVE.caseStudies} published case studies live across ${D.LIVE.caseStudySurfaces} surfaces;
  ${D.LIVE.agentsRun} AI agents that have run in production at ${esc(D.RATE)} success across
  ${esc(D.EXEC)} executions in seven days, every write audited.</p>
  <p><strong>Track record.</strong> Refactored.ai was a Work of the Future Solver at MIT Solve
  2018, one of eight from more than 1,150 applications across 110 countries, and received the
  Patrick J. McGovern Foundation Artificial Intelligence for the Betterment of Humanity Prize and
  the General Motors Prize for Advanced Technologies at the same event. One of seven finalists in
  the JFF Labs $1 Billion Wage Gain Challenge, 2019. A finalist in XPRIZE Rapid Reskilling as a
  partner in Team VITAL, with Gleechi AB and Banyan Tree Global.</p>
  <p><strong>What we are not.</strong> Colaberry is not part of the Anthropic or OpenAI programs
  and issues neither credential. We prepare people for Anthropic's architect certification and
  verify what they build; we do not award it. Our first cohort has not finished. Our agent fleet
  is instrumented, audited and read-only: it watches and records, it does not act.</p>
  <p><strong>The ask.</strong> ${esc(D.ASK)}</p>
  <p class="meta">Every figure on this page traces to a row of the Colaberry commercialization
  claim registry and carries the date it was read. Figures without a registry source are not
  printed.</p>
  </div>`;
}

function capability() {
  const C = D.CAPABILITY;
  const sec = (title, rows, note) => `<h3>${esc(title)}</h3>${note ? `<p>${esc(note)}</p>` : ''}
    <table><tr><th style="width:34%">Capability</th><th>Evidence</th><th style="width:14%">Registry</th></tr>
    ${rows.map((r) => `<tr><td><strong>${esc(r.what)}</strong></td><td>${esc(r.detail)}</td>
      <td>${r.clm ? `<code>${esc(r.clm)}</code>` : '<span class="meta">counted only</span>'}</td>
    </tr>`).join('')}</table>`;
  return `
  <p>Of ${C.counts.total} capabilities counted as of ${esc(C.asof)}: <strong>${C.counts.live}
  live</strong>, ${C.counts.dark} built but not switched on, ${C.counts.designed} designed and
  ${C.counts.roadmap} on the roadmap.</p>
  ${sec('Live and verifiable today', C.live)}
  ${sec('In pilot', C.pilot, 'One cohort, not a completed outcome study.')}
  ${sec('Built but not switched on, designed, or roadmap', C.roadmap)}`;
}

function demo() {
  return `<table><tr><th style="width:9%">Time</th><th style="width:40%">On screen</th>
  <th>What is said</th></tr>
  ${D.DEMO.map((d) => `<tr><td><strong>${esc(d.t)}</strong></td><td>${esc(d.beat)}</td>
    <td>${esc(d.say)}</td></tr>`).join('')}</table>
  <p class="meta">Three minutes, ending on a question rather than a summary. The last beat is the
  ask, so the demo and the deck cannot drift apart.</p>`;
}

function agenda() {
  return `<table><tr><th style="width:14%">Minute</th><th>Item</th></tr>
  ${D.AGENDA.map((a) => `<tr><td><strong>${esc(a.m)}</strong></td><td>${esc(a.what)}</td></tr>`).join('')}
  </table>`;
}

function faq() {
  return `${FAQ.map((f) => `<div class="slide">
    <div class="kick">${esc(f.theme)}</div>
    <h3>${esc(f.q)}</h3>
    <p>${esc(f.a)}</p>
    <p class="meta"><strong>Why this answer:</strong> ${esc(f.why)}</p>
    <p class="never"><strong>Do not say:</strong> ${esc(f.never)}</p>
  </div>`).join('')}
  <h3>Three questions that stay unanswered, deliberately</h3>
  <p>These are reserved to Ali and are not answered in the room. They gate a pilot; they do not
  gate this meeting, whose ask is a demo and a fit conversation.</p>
  <table><tr><th style="width:38%">Question</th><th>Why it is not answered here</th></tr>
  ${RESERVED.map((r) => `<tr><td><strong>${esc(r.q)}</strong></td>
    <td>${esc(r.why)}</td></tr>`).join('')}</table>`;
}

function evidence(cited) {
  return `<p>Every number in this bundle, with the registry row it traces to and the date it was
  read. A figure that cannot appear in this table does not appear in the bundle.</p>
  <table><tr><th style="width:12%">Registry</th><th style="width:40%">Claim</th>
  <th>Source and date</th></tr>
  ${cited.map((id) => {
    const r = D.REGISTRY[id];
    return `<tr><td><code>${esc(id)}</code></td><td>${esc(r.text)}</td>
      <td>${esc(r.src)}${r.dated ? `<br><strong>Re-read ${esc(D.AS_OF)}</strong>` : ''}</td></tr>`;
  }).join('')}</table>
  <h3>Deliberately excluded</h3>
  <p class="excluded">These registry rows exist and are kept out of this bundle on purpose.</p>
  <table class="excluded"><tr><th style="width:12%">Registry</th><th>Why it is not here</th></tr>
  ${Object.entries(D.REGISTRY).filter(([, r]) => !r.deck)
    .map(([id, r]) => `<tr><td><code>${esc(id)}</code></td><td>${esc(r.why)}</td></tr>`).join('')}
  </table>`;
}

function build() {
  const cited = D.assertRegistryGated();
  const ask = D.assertOneAsk();

  const body = `<div class="wrap">
  <h1>Anthropic meeting package</h1>
  <div class="meta">C3.2 &middot; AI Capability Commercialization &middot; figures re-read from
    production on ${esc(D.AS_OF)} &middot; HTML only, no PDF until approved
    &middot; <strong>READY FOR ALI REVIEW</strong></div>
  <div class="rule"></div>

  <div class="asked"><strong>Asked and delivered.</strong> The ticket asked for everything needed
  to walk into an Anthropic meeting, ending on a single ask. <strong>Delivered: a nine-slide deck,
  a one-page leave-behind, a capability statement split into live, pilot and roadmap, a
  three-minute demo outline, a meeting agenda, a seven-question FAQ, and an evidence appendix in
  which every number carries its registry row and the date it was read.</strong> Every claim is
  gated against the C0.6 registry by an assertion that fails the build, not by a promise.</div>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">The deck's strongest slide is the one listing what we are not claiming,
    and the single ask is a demo rather than a pilot, which is what keeps the three unanswered
    C2.6 questions from blocking the meeting.</div>
  </div>

  <div class="toc">
    <a href="#flags">1. Four things for you to decide</a><br>
    <a href="#deck">2. The deck, nine slides</a><br>
    <a href="#leave">3. One-page leave-behind</a><br>
    <a href="#cap">4. Capability statement</a><br>
    <a href="#demo">5. Three-minute demo</a><br>
    <a href="#agenda">6. Meeting agenda</a><br>
    <a href="#faq">7. FAQ</a><br>
    <a href="#ev">8. Evidence appendix</a>
  </div>

  <h2 id="flags">1. Four things for you to decide</h2>
  ${D.OPEN_FLAGS.map((f) => `<div class="flag">
    <span class="id">${esc(f.id)}</span> <strong>${esc(f.title)}</strong>
    <div>${esc(f.detail)}</div>
    <div class="ask">Needed from you: ${esc(f.ask)}</div>
  </div>`).join('')}

  <h2 id="deck">2. The deck, nine slides</h2>
  <p>Ends on exactly one ask, asserted at build time: <strong>${esc(ask.title)}</strong>.</p>
  ${deck()}

  <h2 id="leave">3. One-page leave-behind</h2>
  <p>Written to survive being forwarded without us, so it repeats the disclaimers rather than
  relying on anything said in the room.</p>
  ${leaveBehind()}

  <h2 id="cap">4. Capability statement</h2>
  ${capability()}

  <h2 id="demo">5. Three-minute demo</h2>
  ${demo()}

  <h2 id="agenda">6. Meeting agenda</h2>
  ${agenda()}

  <h2 id="faq">7. FAQ</h2>
  ${faq()}

  <h2 id="ev">8. Evidence appendix</h2>
  ${evidence(cited)}

  <h2>Method</h2>
  <ul>
  <li><strong>Registry gating is an assertion.</strong> Every claim id cited by the deck or the
  capability statement is checked against the C0.6 snapshot in <code>c32Data.js</code>; a claim
  that is not deck-eligible throws and no bundle is produced.</li>
  <li><strong>One ask is an assertion.</strong> The build throws unless exactly one slide is
  flagged as the ask and it is the last one.</li>
  <li><strong>No competing-lab content is an assertion</strong>, run against the rendered HTML rather
  than the source, because the criterion is about what the reader receives. The only permitted
  mentions are the three inside CLM-025's required non-affiliation wording.</li>
  <li><strong>No PDF.</strong> The entrypoint emits HTML only, per the acceptance criteria.</li>
  <li>Figures come from re-running the registry's own SQL against production on ${esc(D.AS_OF)},
  which is what the APPROVED WITH DATE rows instruct.</li>
  </ul>
  </div>`;

  const html = htmlDoc({ title: 'C3.2 Anthropic meeting package', css: CSS, body });
  D.assertNoOpenAI(html);
  return html;
}

// Each section is exported so it can also be rendered as its OWN pdf. Ali's rule, 16 Oct 2026:
// when a ticket asks for a bundle of things, every item in the bundle ships as its own pdf.
// A combined html file that has to be opened to find the seven deliverables inside it shows the
// reader nothing, because Basecamp does not preview html.
module.exports = {
  build,
  sections: { deck, leaveBehind, capability, demo, agenda, faq, evidence },
  CSS,
};
