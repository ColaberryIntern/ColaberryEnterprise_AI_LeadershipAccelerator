/**
 * C6.4's two deliverables: the one-page finding, and the account-person map.
 *
 * The one-pager deliberately carries NO email addresses. It is the page most likely to be
 * screen-shared, and the contrast it has to land is that the CRM was covered in the wrong
 * buying center. The document carries the map itself, names and addresses included, and
 * goes to Basecamp, which is private.
 */
const D = require('./c64Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .st { display:inline-block; padding:1px 7px; border-radius:9px; font-size:7pt;
        font-weight:700; color:#fff; white-space:nowrap; }
  .st.pub { background:#2f7d32; }
  .st.flag { background:#b26a00; }
  .mail { font-family:Consolas,monospace; font-size:8pt; word-break:break-all; }
  .asked { background:#eef6ff; border-left:4px solid #1f6feb; padding:11px 14px;
           margin:0 0 14px; border-radius:0 5px 5px 0; }
  .dec { border:2px solid var(--cherry); border-radius:6px; padding:9px 12px; margin:10px 0 0; }
  .dec .lab { font-size:7.6pt; font-weight:700; letter-spacing:.08em; text-transform:uppercase;
              color:var(--cherry-deep); margin-bottom:3px; }
  .big { display:flex; gap:10px; margin:6px 0 10px; }
  .big div { flex:1; border:1px solid var(--border); border-radius:6px; padding:8px 10px; }
  .big .n { font-size:19pt; font-weight:700; line-height:1; color:var(--cherry); }
  .big .k { font-size:7.4pt; color:var(--muted); text-transform:uppercase;
            letter-spacing:.05em; margin-top:3px; }
`;

function bigNumbers() {
  const o = D.OWNED_STATS;
  return `<div class="big">
    <div><div class="n">${o.accounts}</div><div class="k">tier-1 accounts</div></div>
    <div><div class="n">${o.total}</div><div class="k">contacts already owned</div></div>
    <div><div class="n">${o.ce}</div><div class="k">of them in continuing education</div></div>
    <div><div class="n">${D.PUBLISHED.length + D.NAMED.length}</div><div class="k">buyers now named</div></div>
    <div><div class="n">${D.PUBLISHED.length}</div><div class="k">with a verified email</div></div>
    <div><div class="n">${D.FLAGGED.length}</div><div class="k">not found, flagged</div></div>
  </div>`;
}

function spendTable() {
  const s = D.SPEND;
  return `<table>
    <tr><th>Apollo spend, reconciled against the counter</th><th style="width:22%">Calls</th></tr>
    <tr><td>Search, one per account</td><td>${s.searchCalls} (counter ${s.searchBefore} to ${s.searchAfter})</td></tr>
    <tr><td>Enrich, one per exact-match person</td><td>${s.enrichCalls} (counter ${s.enrichBefore} to ${s.enrichAfter})</td></tr>
    <tr><td><b>Total today, against a ceiling of ${s.limit}</b></td>
      <td><b>${s.enrichAfter} of ${s.limit}</b></td></tr>
  </table>`;
}

/** The one-pager's gap table: the eleven named-without-an-address are summarized, the
 * three not-found are listed, because those are the ones needing a decision. */
function gapTable() {
  return `<table>
    <tr><th style="width:34%">Account</th><th>State</th></tr>
    <tr><td><b>${D.NAMED.length} accounts</b></td>
      <td>Buyer named at the right institution in the right role, and Apollo holds no
      email address for them. The names are in the document.</td></tr>
    ${D.FLAGGED.map((f) => `<tr><td><b>${esc(f.account)}</b></td>
      <td>${esc(f.reason)}</td></tr>`).join('')}
  </table>`;
}

function mapTable() {
  return `<table>
    <tr><th style="width:23%">Account</th><th style="width:13%">Buyer</th>
      <th style="width:28%">Title</th><th>Verified email</th></tr>
    ${D.ROWS.map((r) => {
    if (r.state === 'PUBLISHED') {
      return `<tr><td>${esc(r.account)}</td><td>${esc(r.name)}</td><td>${esc(r.title)}</td>
         <td class="mail">${esc(r.email)}</td></tr>`;
    }
    if (r.state === 'NAMED') {
      return `<tr><td>${esc(r.account)}</td><td>${esc(r.name)}</td><td>${esc(r.title)}</td>
         <td><span class="st flag">NO ADDRESS</span> ${esc(r.reason)}</td></tr>`;
    }
    return `<tr><td>${esc(r.account)}</td><td colspan="3">
         <span class="st flag">NOT FOUND</span> ${esc(r.reason)}</td></tr>`;
  }).join('')}
  </table>`;
}

/* ------------------------------------------------------------------ *
 * One page - NO EMAIL ADDRESSES
 * ------------------------------------------------------------------ */

function buildVisual() {
  const css = `${baseCss()}
    ${SHARED}
    body { font-size:8.8pt; }
    h1 { font-size:15pt; }
    h2 { font-size:10pt; margin:8px 0 4px; }
    .takeaway { padding:8px 11px; margin:0 0 8px; }
    .takeaway .headline { font-size:9.8pt; }
    table { font-size:7.9pt; margin:2px 0 6px; }
    td, th { padding:3px 6px; }
    .cols { display:flex; gap:12px; align-items:flex-start; }
    .col { flex:1; }
    .note { padding:6px 9px; margin:5px 0; font-size:8pt; }
    .dec { padding:7px 10px; }`;

  const body = `<div>
    <h1>C6.4 &middot; Economic Buyers and Influencers, Tier-1 Accounts</h1>
    <div class="meta">${esc(D.AS_OF)} &middot; names and addresses are in the document, not on
      this page &middot; every figure measured</div>
    <div class="rule"></div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.headline())}</div>
    </div>

    ${bigNumbers()}

    <div class="cols">
      <div class="col">
        <h2>Named without an address, and not found at all</h2>
        ${gapTable()}
        <div class="note warn"><b>Two apparent matches were different institutions.</b>
          A first pass matched on shared words after stripping "university", "college" and
          "state", which reduces "Morgan State University" to "morgan" and would have
          accepted Morgan Stanley. Tightening it caught Florida College matching Florida
          Keys Community College, and Piedmont Community College matching Central Piedmont.</div>
      </div>
      <div class="col">
        <h2>What it cost, and what came free</h2>
        ${spendTable()}
        <div class="note"><b>Nothing was spent until what we already own had been checked.</b>
          The 2,102 Apollo-sourced leads in the database were searched first, then our saved
          Apollo contacts through the free account-scoped endpoint. Neither held a single
          continuing-education contact at any of these institutions, and that is what
          justified spending anything.</div>
      </div>
    </div>

    <div class="dec">
      <div class="lab">What needs your decision</div>
      ${esc(D.DECISION)}
    </div>
  </div>`;

  return htmlDoc({ title: 'C6.4 - Economic Buyers and Influencers', css, body });
}

/* ------------------------------------------------------------------ *
 * The document - carries the map
 * ------------------------------------------------------------------ */

function buildDocument() {
  const css = `${baseCss()}
    ${SHARED}
    .wrap { max-width:960px; margin:0 auto; padding:28px 22px 56px; }
    table { font-size:8.4pt; }
    td, th { padding:4px 6px; }`;

  const body = `<div class="wrap">
    <h1>C6.4 &middot; Economic Buyers and Influencers</h1>
    <div class="meta">${esc(D.AS_OF)} &middot; Ticket C6.4 &middot; 38 tier-1 accounts from C6.3
      &middot; CONTAINS PERSONAL DATA, not for redistribution</div>
    <div class="rule"></div>

    <div class="asked">
      <b>What the ticket asked for.</b> Put real names against the tier-1 accounts: the
      economic buyer and key influencers, using Apollo for verified data only, with the
      quota checked before any bulk run, no guessed addresses, and any account where no
      verified contact can be found flagged rather than invented.
      <br><br>
      <b>What was delivered.</b> ${D.PUBLISHED.length} named buyers with Apollo-verified
      email addresses, ${D.FLAGGED.length} accounts flagged with the reason, the influencers
      we already held identified as the wrong buying center, and the spend reconciled against
      the counter on both runs. Nothing was sent and nothing was written to the database.
    </div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.headline())}</div>
    </div>
    ${D.SO_WHAT.map((s) => `<p>${esc(s)}</p>`).join('')}

    <h2>How it was done, in order</h2>
    <table>
      <tr><th style="width:20%">Step</th><th>What happened</th></tr>
      ${D.METHOD.map((m) => `<tr><td><b>${esc(m[0])}</b></td><td>${esc(m[1])}</td></tr>`).join('')}
    </table>
    ${spendTable()}

    <div class="pagebreak"></div>
    <h2>The map</h2>
    <p>One row per tier-1 account. Every address below is the string Apollo returned,
    recorded unchanged; a build assertion fails if a published address differs by a single
    character from the enrichment response, and no address is ever constructed from a
    pattern.</p>
    ${mapTable()}

    <h2>Influencers we already hold, and why they are not the buyer</h2>
    <p>All ${D.OWNED_STATS.accounts} accounts already carried a contact, ${D.OWNED_STATS.total}
    in total, but ${D.OWNED_STATS.itOnly} accounts held nothing but CIOs, CISOs and IT
    directors and ${D.OWNED_STATS.ce} held anyone in continuing education. They are a real
    route into the institution and the wrong first message, which is exactly what C6.3 said
    about them account by account. They are recorded as influencers.</p>

    <h2>Limits</h2>
    <ol>${D.LIMITS.map((l) => `<li style="margin-bottom:5px">${esc(l)}</li>`).join('')}</ol>

    <div class="dec">
      <div class="lab">What needs your decision</div>
      ${esc(D.DECISION)}
    </div>
  </div>`;

  return htmlDoc({ title: 'C6.4 - Economic Buyers and Influencers', css, body });
}

module.exports = { buildVisual, buildDocument };
