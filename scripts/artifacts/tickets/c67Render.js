/**
 * C6.7's two deliverables: the one-page summary and the draft set.
 *
 * The one-pager carries NO email addresses and no message bodies. It is the page most
 * likely to be read on a phone or shared in a room, and what it has to convey is how many
 * drafts exist, which targets are held and why, and that nothing is configured to send.
 * The document carries the drafts themselves and goes to Basecamp, which is private.
 */
const D = require('./c67Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .st { display:inline-block; padding:1px 7px; border-radius:9px; font-size:7pt;
        font-weight:700; color:#fff; white-space:nowrap; }
  .st.go { background:#2f7d32; }
  .st.hold { background:#b26a00; }
  .asked { background:#eef6ff; border-left:4px solid #1f6feb; padding:11px 14px;
           margin:0 0 14px; border-radius:0 5px 5px 0; }
  .dec { border:2px solid var(--cherry); border-radius:6px; padding:9px 12px; margin:10px 0 0; }
  .dec .lab { font-size:7.6pt; font-weight:700; letter-spacing:.08em; text-transform:uppercase;
              color:var(--cherry-deep); margin-bottom:3px; }
  .draft { border:1px solid var(--border); border-left:4px solid #2f7d32; border-radius:5px;
           padding:10px 12px; margin:0 0 9px; page-break-inside:avoid; }
  .draft.hold { border-left-color:#b26a00; }
  .draft h3 { margin:0 0 2px; font-size:10.5pt; }
  .draft .who { font-size:8.2pt; color:var(--muted); margin-bottom:5px; }
  .draft .lab { font-size:7.2pt; font-weight:700; text-transform:uppercase;
                letter-spacing:.05em; color:var(--muted); margin-top:6px; }
  .msg { background:var(--bg-alt); border:1px solid var(--border); border-radius:4px;
         padding:8px 10px; margin-top:3px; font-size:9pt; }
  .msg .subj { font-weight:700; margin-bottom:4px; }
  .src { font-size:7.6pt; color:var(--muted); word-break:break-all; }
  .big { display:flex; gap:9px; margin:6px 0 9px; }
  .big div { flex:1; border:1px solid var(--border); border-radius:6px; padding:7px 10px; }
  .big .n { font-size:19pt; font-weight:700; line-height:1; }
  .big .k { font-size:7.2pt; color:var(--muted); text-transform:uppercase;
            letter-spacing:.05em; margin-top:3px; }
`;

function tally() {
  return `<div class="big">
    <div><div class="n" style="color:#2f7d32">${D.SENDABLE.length}</div>
      <div class="k">drafts ready for your edit</div></div>
    <div><div class="n" style="color:#b26a00">${D.HELD.length}</div>
      <div class="k">held, no draft written</div></div>
    <div><div class="n">${D.MESSAGES.length}</div><div class="k">tier-1 buyers covered</div></div>
    <div><div class="n">0</div><div class="k">configured to send</div></div>
  </div>`;
}

/**
 * `short` gives the first sentence only. The full reason runs to a paragraph each and
 * costs nearly 400px, which is most of a landscape page; the document carries all of it.
 */
function heldTable(short) {
  const reason = (m) => (short
    ? `${m.blockedReason.split('. ')[0].replace(/\.+$/, '')}.`
    : m.blockedReason);
  return `<table>
    <tr><th style="width:30%">Target</th><th>Why it is held rather than given a generic note</th></tr>
    ${D.HELD.map((m) => `<tr><td><b>${esc(m.account)}</b></td>
      <td>${esc(reason(m))}</td></tr>`).join('')}
  </table>`;
}

function targetTable() {
  return `<table>
    <tr><th style="width:34%">Target</th><th style="width:13%">State</th>
      <th>Opening rests on</th></tr>
    ${D.MESSAGES.map((m) => `<tr>
      <td><b>${esc(m.account)}</b></td>
      <td><span class="st ${m.sendable ? 'go' : 'hold'}">${m.sendable ? 'DRAFTED' : 'HELD'}</span></td>
      <td>${esc(m.sendable ? m.subject : 'nothing specific published')}</td></tr>`).join('')}
  </table>`;
}

/* ------------------------------------------------------------------ *
 * One page - no addresses, no message bodies
 * ------------------------------------------------------------------ */

function buildVisual() {
  const css = `${baseCss()}
    ${SHARED}
    body { font-size:8.7pt; }
    h1 { font-size:15pt; }
    h2 { font-size:9.8pt; margin:7px 0 4px; }
    .takeaway { padding:8px 11px; margin:0 0 7px; }
    .takeaway .headline { font-size:9.6pt; }
    table { font-size:7.5pt; margin:2px 0 5px; }
    td, th { padding:3px 5px; }
    .cols { display:flex; gap:12px; align-items:flex-start; }
    .col { flex:1; }
    .note { padding:6px 9px; margin:5px 0; font-size:7.9pt; }
    .dec { padding:7px 10px; }`;

  const body = `<div>
    <h1>C6.7 &middot; Tier-1 Personal Outreach</h1>
    <div class="meta">${esc(D.AS_OF)} &middot; drafts only, nothing configured to send
      &middot; names and addresses are in the document, not on this page</div>
    <div class="rule"></div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.headline())}</div>
    </div>

    ${tally()}

    <div class="cols">
      <div class="col">
        <h2>Held rather than filled</h2>
        ${heldTable(true)}
        <div class="note warn"><b>Four stale facts were found and deliberately not used.</b>
          A four million dollar apprenticeship page that now returns 404, a 2024 certificate
          absent from the live list, an employer partnership described only in 2020 pages,
          and trade coverage from 2013 to 2015. Each is recorded in its draft as a
          do-not-use, because search engines still surface all four.</div>
      </div>
      <div class="col">
        <h2>Three of these targets already sell an AI certificate</h2>
        <div class="note"><b>Pratt, Elon and Columbus State.</b> Columbus State is thirty
          weeks and $2,600 into one with a cohort starting in November. That changes the
          pitch: the opening cannot be that AI matters, because they know. It has to be
          what a completer can show afterwards, which is the thing none of the three
          currently answers.</div>
        <div class="note good"><b>One hook is the buyer’s own words.</b> The Clayton
          State buyer C6.4 identified signs the welcome message in their current catalog,
          where he separates teaching the technology from helping somebody apply it. That
          draft quotes him back to himself.</div>
      </div>
    </div>

    <div class="dec">
      <div class="lab">What needs your decision</div>
      ${esc(D.DECISION)}
    </div>
  </div>`;

  return htmlDoc({ title: 'C6.7 - Tier-1 Personal Outreach', css, body });
}

/* ------------------------------------------------------------------ *
 * The document - the drafts themselves
 * ------------------------------------------------------------------ */

function buildDocument() {
  const css = `${baseCss()}
    ${SHARED}
    .wrap { max-width:940px; margin:0 auto; padding:28px 22px 56px; }`;

  const body = `<div class="wrap">
    <h1>C6.7 &middot; Tier-1 Personal Outreach Drafts</h1>
    <div class="meta">${esc(D.AS_OF)} &middot; Ticket C6.7 &middot; CONTAINS PERSONAL DATA:
      named people and their email addresses, not for redistribution &middot;
      <b>${esc(D.REVIEW_STATE)}</b></div>
    <div class="rule"></div>

    <div class="asked">
      <b>What the ticket asked for.</b> Write the personal messages Ali sends to named
      tier-1 executives. One per target, each opening on something specific and researched
      about that person or their organization, none interchangeable, every claim from the
      C0.6 registry, nothing configured for automated sending, ending BLOCKED - ALI DECISION
      REQUIRED. The named risk is templated personalization: if the opening could be sent to
      anyone, it is not tier 1.
      <br><br>
      <b>What was delivered.</b> ${D.SENDABLE.length} drafts, each opening on a fact read on
      a named page with the date it showed, and ${D.HELD.length} targets held with no draft
      because their units publish nothing specific enough to open on. Nothing is wired to
      send anything.
    </div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.headline())}</div>
    </div>
    ${D.SO_WHAT.map((s) => `<p>${esc(s)}</p>`).join('')}

    <h2>All ${D.MESSAGES.length} targets</h2>
    ${targetTable()}

    <h2>Held, with the reason</h2>
    ${heldTable()}

    <div class="pagebreak"></div>
    <h2>The drafts</h2>
    <p>Each is yours to edit. The opening is the part I would defend as finished; the voice
    of the rest is mine and the relationship is yours. The source line under each draft is
    the page the opening was read on, so any of them can be checked in about fifteen
    seconds.</p>

    ${D.SENDABLE.map((m) => `<div class="draft">
      <h3>${esc(m.account)}</h3>
      <div class="who">${esc(m.name)} &middot; ${esc(m.title)} &middot; ${esc(m.email)}</div>
      <div class="msg">
        <div class="subj">Subject: ${esc(m.subject)}</div>
        <div>${esc(m.opening)}</div>
        <div style="margin-top:6px">${esc(m.body)}</div>
      </div>
      <div class="lab">The opening rests on</div>
      <div>${esc(m.hook.fact)}</div>
      <div class="lab">Source, read ${esc(m.hook.seen)}</div>
      <div class="src">${esc(m.hook.source)}</div>
      <div class="lab">Confidence</div>
      <div class="meta" style="color:var(--ink)">${esc(m.hook.confidence)}</div>
    </div>`).join('')}

    <h2>Held targets</h2>
    ${D.HELD.map((m) => `<div class="draft hold">
      <h3>${esc(m.account)}</h3>
      <div class="who">${esc(m.name)} &middot; ${esc(m.title)} &middot; ${esc(m.email)}</div>
      <div class="lab">Why no draft was written</div>
      <div>${esc(m.blockedReason)}</div>
    </div>`).join('')}

    <h2>Limits</h2>
    <ol>${D.LIMITS.map((l) => `<li style="margin-bottom:5px">${esc(l)}</li>`).join('')}</ol>

    <div class="dec">
      <div class="lab">What needs your decision</div>
      ${esc(D.DECISION)}
    </div>
  </div>`;

  return htmlDoc({ title: 'C6.7 - Tier-1 Personal Outreach Drafts', css, body });
}

module.exports = { buildVisual, buildDocument };
