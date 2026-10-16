/**
 * C3.1's document. Every claim carries its source, the page's own date, the date we read it, and
 * a confidence, because the ticket names "reusing the 6 Oct research without re-verification" as
 * the thing that would make this artifact untrustworthy.
 *
 * Reads c31Data only. A number typed here instead of imported could drift from the visual, which
 * is exactly the failure the shared data module exists to prevent.
 */
const D = require('./c31Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const CSS = `${baseCss()}
  .src { font-size: 7.6pt; color: var(--muted); }
  .conf { display: inline-block; padding: 0 6px; border-radius: 8px; font-size: 7pt;
          font-weight: 700; color: #fff; white-space: nowrap; }
  .asked { background: #eef6ff; border-left: 4px solid #1f6feb; padding: 10px 14px;
           margin: 0 0 14px; border-radius: 0 5px 5px 0; }
  .q { font-weight: 700; color: var(--cherry-deep); }
  ol.plan { padding-left: 0; list-style: none; counter-reset: s; }
  ol.plan li { counter-increment: s; position: relative; padding-left: 26px; margin-bottom: 10px; }
  ol.plan li::before { content: counter(s); position: absolute; left: 0; top: 1px; width: 18px;
    height: 18px; border-radius: 4px; background: var(--cherry); color: #fff; font-weight: 700;
    font-size: 9pt; text-align: center; line-height: 18px; }
  .owner { font-size: 8pt; color: var(--muted); font-weight: 400; }
`;

const conf = (c) => `<span class="conf" style="background:${c.color}">${esc(c.k)}</span>`;
const src = (s) => `<span class="src">${esc(s.url)} &middot; ${esc(s.pageDate)} &middot; read `
  + `${esc(D.ACCESS)}</span>`;

function build() {
  const counting = D.CERTS.filter((c) => c.counts);
  const body = `
  <h1>The Anthropic route, re-verified</h1>
  <div class="meta">C3.1 &middot; AI Capability Commercialization &middot; every claim re-read
    from primary sources on ${esc(D.ACCESS)} &middot; baseline ${esc(D.BASELINE)}
    &middot; <strong>READY FOR ALI REVIEW</strong></div>
  <div class="rule"></div>

  <div class="asked"><strong>Asked and delivered.</strong> The ticket asked me to re-verify every
  fact about the Anthropic route from primary sources and to write the follow-up plan for the
  submitted application. <strong>Delivered: every fact re-read today with its URL, the page's own
  date and a confidence; the ${D.CHANGES.filter((c) => c.sev === 'fix').length} things that need
  correcting called out; ${D.UNVERIFIED.length} items reported as NOT VERIFIED rather than filled
  in; and a five-step plan.</strong> The re-verification also answered a question the ticket did
  not ask, which turns out to be the important one.</div>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">${esc(D.HEADLINE)}</div>
  </div>

  ${D.SO_WHAT.map((s) => `<p>${esc(s)}</p>`).join('')}

  <h2>What the ticket asked, answered in order</h2>

  <p class="q">Has a Partner Account Manager been assigned?</p>
  <p>No, and the question needs reframing. ${esc(D.PAM_NOTE)}</p>

  <p class="q">Did the three Select-tier numbers survive re-verification?</p>
  <p>All three, verbatim. ${conf(D.C.HIGH)} ${src(D.SRC.track)}</p>
  <table><tr><th>Claim from ${esc(D.BASELINE)}</th><th>Verdict today</th></tr>
  ${D.SELECT_RECHECK.map((r) => `<tr><td>${esc(r.claim)}</td>
    <td><strong>${esc(r.verdict)}</strong></td></tr>`).join('')}</table>
  <p>There is positive evidence of no change rather than merely an absence of contrary evidence:
  the page carrying all three numbers was last modified on 9 September 2026, which is before the
  baseline pass, so there was no window in which they could have moved.</p>

  <p class="q">Is Frontier Academy still nomination-only?</p>
  <p>Yes, confirmed verbatim: <em>"Participation is by nomination; organizations can ask their
  Anthropic account team or Partner Account Manager whether they're eligible."</em>
  ${conf(D.C.HIGH)} ${src(D.SRC.faNews)} The program page adds
  <em>"Nomination only, with a high bar for every program"</em>. Note what this means for us: the
  sentence is addressed to organizations that already have an account team or a partner manager.
  We have neither, so this door is downstream of admission, not an alternative to it.</p>

  <h2>The contradiction that stalled this, and who is right</h2>
  <p>${esc(D.OURS.marchPromise)}</p>
  <p>${esc(D.OURS.contradiction)}</p>
  <p>${esc(D.OURS.aliReply)} <strong>That was ${D.OURS.silenceDays} days ago and there has been no
  answer.</strong></p>
  <div class="note warn"><strong>Resolution.</strong> ${esc(D.RESOLUTION)}</div>

  <h2>The tier ladder</h2>
  <table><tr><th>Tier</th><th>Active certified individuals</th><th>Joint customers in production</th>
  <th>Public stories</th><th>Notes</th></tr>
  ${D.TIERS.map((t) => `<tr><td><strong>${esc(t.name)}</strong></td>
    <td>${t.certified ? esc(t.certified) : '&mdash;'}</td>
    <td>${t.customers ? esc(t.customers) : '&mdash;'}</td>
    <td>${t.stories ? esc(t.stories) : '&mdash;'}</td>
    <td class="src">${esc(t.note)}</td></tr>`).join('')}</table>
  <p>An active certified individual is defined as someone who holds a current Anthropic
  certification <em>and has used Claude in the past 90 days</em>, so the bench decays if it is not
  used. Promotions are processed on 1 January and 1 July, with an extra review on 1 October 2026 in
  this first year. ${conf(D.C.HIGH)} ${src(D.SRC.track)}</p>

  <h2>The certifications, and the one that does not count</h2>
  <table><tr><th>Exam</th><th>Price, USD</th><th>Counts toward a tier?</th></tr>
  ${D.CERTS.map((c) => `<tr><td>${esc(c.name)}</td><td>$${c.price}</td>
    <td>${c.counts ? 'Yes' : '<strong style="color:#b3261e">No</strong>'}</td></tr>`).join('')}
  </table>
  <div class="note warn"><strong>This breaks the obvious plan.</strong> The cheapest exam is the
  $99 Associate and it is worth nothing toward the ladder. Only ${counting.length} of the four
  count, the cheapest of those is $${D.CHEAPEST_COUNTING}, so reaching Select's bench costs about
  <strong>$${D.SELECT_BENCH_COST.toLocaleString('en-US')}</strong> at full price. The 50 percent
  partner discount begins at Select, which is to say after you have already paid for the ten that
  got you there. And exams are sold only to people at organizations already in the network, so
  none of this can be done in advance. ${conf(D.C.HIGH)} ${src(D.SRC.certs)}</div>

  <h2>What changed since ${esc(D.BASELINE)}</h2>
  <table><tr><th style="width:24%">Fact</th><th>What we found today</th><th>Source</th></tr>
  ${D.CHANGES.map((c) => `<tr>
    <td><strong>${esc(c.what)}</strong></td>
    <td>${esc(c.change)}</td>
    <td>${conf(c.conf)}<br>${src(c.src)}</td></tr>`).join('')}</table>

  <h2>The people, re-read rather than recalled</h2>
  <p>The ticket flags stale titles as a trustworthiness risk, so none of these was carried over.</p>
  <table><tr><th>Person</th><th>Current title</th><th>Confidence</th><th>What to do with it</th></tr>
  ${D.PEOPLE.map((p) => `<tr><td><strong>${esc(p.name)}</strong></td>
    <td>${esc(p.title)}</td><td>${conf(p.conf)}</td>
    <td class="src">${esc(p.note)}<br>${esc(p.src.url)} &middot; ${esc(p.src.pageDate)}</td>
  </tr>`).join('')}</table>
  <p>No email address was looked for, inferred or recorded for any of them.</p>

  <h2>Whether a training company fits at all</h2>
  <p>${esc(D.FIT.noCategory)} ${conf(D.C.HIGH)} ${src(D.SRC.apply)}</p>
  <p>${esc(D.FIT.butCounts)} ${conf(D.C.HIGH)} ${src(D.SRC.dir)}</p>
  <div class="note good"><strong>The most favorable published sentence for Colaberry:</strong>
  <em>"${esc(D.FIT.bestSentence)}"</em> ${conf(D.C.HIGH)} ${src(D.FIT.bestSentenceSrc)}
  Size explicitly does not change the bar: <em>"whether it's a ten-person AI-native shop or a
  global consultancy"</em>.</div>
  <div class="note"><strong>Reserved to Ali.</strong> ${esc(D.FIT.decision)}</div>

  <h2>The instrument we already own is pointed the wrong way</h2>
  <p>The ticket records "nothing to reuse; this is research." That is not quite right, and the
  correction matters. An Anthropic content watcher runs ${esc(D.WATCHER.runs)}, and logged
  ${D.WATCHER.octoberEvents} change events in October alone. It watches
  ${D.WATCHER.watches.map(esc).join(', ')}.</p>
  <p>It does not watch ${D.WATCHER.missing.map(esc).join(', ')} &mdash; that is, not one page this
  ticket depended on.</p>
  <div class="note warn"><strong>${esc(D.WATCHER.placeholder)}</strong></div>
  <p>${esc(D.WATCHER.hashOnly)} So the system could not have answered "what changed since
  ${esc(D.BASELINE)}" even for the pages it does watch, which is why that question needed three
  research passes instead of a query.</p>

  <h2>The follow-up plan</h2>
  <ol class="plan">${D.PLAN.map((p) => `<li><strong>${esc(p.title)}</strong>
    <span class="owner">&middot; ${esc(p.owner)} &middot; ${esc(p.when)}</span><br>
    ${esc(p.detail)}</li>`).join('')}</ol>

  <h2>What could not be verified</h2>
  <p>These are listed rather than filled in. A plausible answer in any of these holes would be the
  most dangerous thing in the document.</p>
  <table><tr><th style="width:32%">Item</th><th>Why not, and what it would take</th></tr>
  ${D.UNVERIFIED.map((u) => `<tr><td><strong>${esc(u.what)}</strong></td>
    <td>${esc(u.why)}</td></tr>`).join('')}</table>
  <div class="note"><strong>One figure to handle carefully.</strong> ${esc(D.SCALE_TENSION)}</div>

  <h2>Method</h2>
  <ul>
  <li>Every page was opened and read. No search-engine answer summary was used as a source.</li>
  <li>Each claim carries the URL, the page's own publication or modification date where it shows
  one, the date we read it, and a confidence. HIGH means verbatim on a page Anthropic owns.</li>
  <li>The three Select numbers, being the load-bearing claim, were re-read a second time directly
  rather than accepted from a single pass.</li>
  <li>Our own state comes from the follow-up ledger on the production host and from the crontab,
  not from recollection.</li>
  <li>Nothing was sent to Anthropic and no account was contacted in producing this.</li>
  </ul>`;

  return htmlDoc({ title: 'C3.1 Anthropic route re-verified', css: CSS, body });
}

module.exports = { build };
