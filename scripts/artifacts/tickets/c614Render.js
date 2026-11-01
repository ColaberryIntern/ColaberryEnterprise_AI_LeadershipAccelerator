/**
 * C6.14 - renders the approval one-pager and the full copy document.
 *
 * ## Why the letters are printed in full and not summarized
 *
 * The ticket says it in as many words: "Produce the dry run first and put it in front of Ali as
 * rendered text, not as a description of itself." A document that said "variant B opens on the
 * company's own dated quote" would be a description. So every letter is printed as the recipient
 * would receive it, signature included, with its sourcing rule printed beside it so the wording
 * and the reason for the wording are approved together.
 *
 * ## Why the figures table has a "was" column
 *
 * The movement is the argument for re-measuring. CLM-002 went from 345 to 433 in sixteen days
 * and gov qualifications tripled; a reader who sees only today's numbers has no reason to
 * believe the next document will not quote these back in January. The column that matters most
 * is the one where the registry row is blank, because that is a true number nobody may use.
 *
 * No chart. The four moving figures span 2 to 215,515, so any shared axis would flatten three of
 * them into nothing, and a table with a delta column says the same thing honestly.
 */
const D = require('./c614Data');
const C = require('./c614Copy');
const G = require('./c614Guards');
const { esc, baseCss, TOKENS } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SEV = TOKENS.SEV;

const SHARED = `
  .lede{font-size:11pt;line-height:1.45;margin:0 0 10px}
  .pill{display:inline-block;padding:1px 7px;border-radius:9px;font-size:7.6pt;
        font-weight:700;color:#fff;white-space:nowrap}
  .letter{border:1px solid var(--border);border-radius:6px;padding:0;margin:0 0 12px;
          page-break-inside:avoid;overflow:hidden}
  .letter .hd{background:var(--bg-alt);padding:6px 11px;border-bottom:1px solid var(--border);
              font-size:8.4pt;font-weight:700}
  .letter .subj{padding:7px 11px 3px;font-size:9.4pt;font-weight:700}
  .letter .bd{padding:3px 11px 9px;font-size:9.2pt;line-height:1.5;white-space:pre-wrap}
  .letter .sig{padding:0 11px 9px;font-size:8.4pt;color:#4a5568;white-space:pre-wrap;
               border-top:1px dashed var(--border);margin-top:6px;padding-top:7px}
  .rule{background:#fffaf0;border-left:3px solid ${SEV.watch};padding:7px 10px;
        font-size:8.4pt;margin:0 11px 10px}
  .warn{background:#fdf3f2;border-left:3px solid ${SEV.bad};padding:7px 10px;
        font-size:8.6pt;margin:6px 0}
  .ok{background:#f3f9f3;border-left:3px solid ${SEV.ok};padding:7px 10px;
      font-size:8.6pt;margin:6px 0}
  .flag{border:1px solid var(--border);border-left:3px solid ${SEV.watch};border-radius:5px;
        padding:8px 11px;margin:0 0 9px;page-break-inside:avoid;font-size:8.8pt}
  .flag h4{margin:0 0 4px;font-size:9.6pt}
  .flag .ask{margin-top:5px;font-weight:700;color:var(--cherry-deep)}
  .mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:7.8pt}
  .nb{color:${SEV.bad};font-weight:700}
`;

const chip = (t, c) => `<span class="pill" style="background:${c}">${esc(t)}</span>`;
const n = (v) => v.toLocaleString('en-US');

function sev(v) {
  if (v === 'MET') return SEV.ok;
  if (v === 'PENDING ALI') return SEV.watch;
  return SEV.bad;
}

/* ------------------------------------------------------------------ figures table */

/**
 * `keys` narrows the table. The one-pager gets six rows and not sixteen, because the one-pager
 * has one page and its own renderer throws rather than spilling onto a second: the limit is the
 * deliverable. The six chosen are the two with no registry row and the four that moved most,
 * which is the whole argument for re-measuring. The full sixteen are in the document.
 */
function figuresTable(keys) {
  const pick = keys ? keys.map((k) => [k, D.MEASURED[k]]) : Object.entries(D.MEASURED);
  const rows = pick.map(([key, m]) => {
    const row = m.clm
      ? `<td>${chip(m.clm, SEV.ok)}</td>`
      : `<td>${chip('NO ROW', SEV.bad)}</td>`;
    return `<tr><td class="mono">${esc(key)}</td><td style="text-align:right;font-weight:700">`
      + `${esc(n(m.value))}</td><td>${esc(m.was)}</td>${row}<td>${esc(m.text)}</td></tr>`;
  }).join('');
  return `<table><thead><tr><th>figure</th><th style="text-align:right">1 Nov</th>`
    + `<th>previously</th><th>usable?</th><th>what it counts</th></tr></thead>`
    + `<tbody>${rows}</tbody></table>`;
}

/* ------------------------------------------------------------------ letters */

function letterBlock(variant, companyName) {
  const l = C.letter(variant, companyName);
  const body = l.paragraphs.join('\n\n');
  return `<div class="letter">`
    + `<div class="hd">VARIANT ${esc(variant.id)} &middot; ${esc(companyName)}</div>`
    + `<div class="subj">Subject: ${esc(l.subject)}</div>`
    + `<div class="bd">${esc(body)}</div>`
    + `<div class="sig">${esc(C.SIGNATURE.join('\n'))}</div>`
    + `</div>`
    + (l.rule ? `<div class="rule"><b>Why it is worded this way:</b> ${esc(l.rule)}</div>` : '');
}

/**
 * Which letters to print, per variant, and the rule is "print anything whose body differs".
 *
 *   A - all four. The requisition title and the board differ, and the title is in the subject
 *       line, so a single worked example would not be the variant.
 *   B - all nine. The opener is the company's own sentence and three carry a sourcing rule.
 *   C - two. The body names only the target company, so the one real difference is Lindsay,
 *       which may not carry the sentence about nobody owning AI. Printing nine would be seven
 *       copies of the same letter, which makes a dry run harder to read, not more complete.
 */
function shown(variant, names) {
  if (variant.id === 'C') return names.filter((x) => !C.COMPANIES[x].noAiLeader)
    .concat(names.filter((x) => C.COMPANIES[x].noAiLeader).slice(0, 1));
  return names;
}

function variantSection(variant) {
  const names = Object.keys(C.COMPANIES).filter((x) => (variant.id === 'A'
    ? !!C.COMPANIES[x].req : true));
  const show = shown(variant, names);
  const rest = names.filter((x) => !show.includes(x));
  return `<h3>Variant ${esc(variant.id)}: ${esc(variant.name)}</h3>`
    + `<p class="lede"><b>When to use it.</b> ${esc(variant.whenToUse)}</p>`
    + `<div class="warn"><b>The constraint on it.</b> ${esc(variant.constraint)}</div>`
    + show.map((x) => letterBlock(variant, x)).join('')
    + (rest.length
      ? `<p style="font-size:8.6pt;color:var(--muted)">The bodies above are the whole variant. `
        + `Beyond the company name they carry no company-specific sentence, so they apply `
        + `unchanged to ${esc(rest.join(', '))}.</p>`
      : '');
}

/* ------------------------------------------------------------------ one-pager */

function buildVisual() {
  const cr = G.criteria();
  const letters = G.allLetters().length;
  const body = `
  <h1>C6.14 &middot; CEO outreach copy, for approval</h1>
  <p class="sub">Measured against production ${esc(D.MEASURED_AT)} &middot; campaign
    ${esc(D.CAMPAIGN.status)}, ${D.CAMPAIGN.touchpoints} touchpoints, nothing sent</p>

  <div class="warn"><b>Read this first.</b> This ticket says three variants are already drafted
    and asks you to approve them. They do not exist: zero rows in
    <span class="mono">campaign_variants</span>, nothing in the repository, nothing in C6.13's
    eight comments. The ${letters} letters here are new copy, so this is a first read rather
    than a check.</div>

  <h3>What production actually says today, and what may not be said</h3>
  ${figuresTable(['agentsEverRun', 'registrySize', 'executions7d', 'executions30d', 'stories',
    'govQualifications'])}

  <div class="warn"><b>Two rows have no registry source, and one of them is in your recruiter
    brief.</b> "266 agents" is the size of the agent registry, which CLM-005 says is not a count
    of operating agents; ${D.MEASURED.agentsEverRun.value} have run. The thirty-day execution
    window has no row because CLM-006 is defined on seven days. Both are measured and true, and
    neither may leave the building.</div>

  <table><thead><tr><th>Acceptance criterion</th><th>Verdict</th></tr></thead>
    <tbody>${cr.map((c) => `<tr><td>${esc(c.text)}</td>`
      + `<td>${chip(c.verdict, sev(c.verdict))}</td></tr>`).join('')}</tbody></table>

  <div class="ok"><b>What is left to you, and only you.</b>
    <span class="mono">claims_approved</span> and <span class="mono">dry_run_reviewed</span> both
    still read false in production. The dry run is the rendered text in the companion document,
    and nothing in this build writes either gate. <b>${D.FLAGS.length} open flags are in that
    document; two change what happens next:</b> CNO Financial Group is still enrolled as an
    active lead after you disqualified it, and the branded signature ends with an advisory call
    to action that reads as a vendor pitch.</div>`;

  return htmlDoc({ title: 'C6.14 CEO Outreach Copy', css: baseCss() + SHARED, body });
}

/* ------------------------------------------------------------------ full document */

function buildDocument() {
  const body = `
  <h1>C6.14 &middot; The CEO outreach copy, and what every sentence stands on</h1>
  <p class="sub">Nine qualifying companies &middot; three variants &middot;
    ${G.allLetters().length} letters &middot; measured ${esc(D.MEASURED_AT)}
    (<span class="mono">${esc(D.MEASURED_AT_UTC)}</span>)</p>

  <p class="lede"><b>Nothing has been sent, and this document cannot send anything.</b> The
    campaign is ${esc(D.CAMPAIGN.status)} with <span class="mono">started_at</span> null, every
    one of the ten enrolled leads shows zero touchpoints, and
    <span class="mono">interaction_outcomes</span> holds no rows against lead ids
    ${esc(D.CAMPAIGN.leadIdRange)}. Voice and SMS are disabled and calls are made personally.</p>

  <h2>1. The figures, re-read rather than carried over</h2>
  <p class="lede">Two sources disagreed in both value and window: this ticket records 266 agents
    and 765,305 executions over thirty days read on 21 October, while the C3.2 bundle records 151
    agents and 168,619 executions over seven days read on 16 October. CLM-002 says in its own
    prohibited wording that an undated figure becomes wrong by sitting still, so the registry's
    queries were re-run. The <b>usable?</b> column is the one that matters.</p>
  ${figuresTable()}
  <p style="font-size:8.6pt">Seven-day success rate, computed from the two figures above rather
    than typed: <b>${D.RATE_7D.toFixed(2)}%</b> across ${esc(n(D.MEASURED.executions7d.value))}
    executions, ${esc(n(D.MEASURED.agentsInMetrics7d.value))} distinct agents contributing.</p>

  <h2>2. The three variants, as a chief executive would receive them</h2>
  ${C.VARIANTS.map(variantSection).join('')}

  <h2>3. Claim by claim, what it rests on</h2>
  <table><thead><tr><th>Claim in the copy</th><th>Source</th><th>How it is established</th>
    </tr></thead><tbody>
    ${D.TRACEABILITY.map((t) => `<tr><td>${esc(t.claim)}</td>`
      + `<td>${chip(t.source, t.source === 'personal' ? SEV.watch : SEV.ok)}</td>`
      + `<td style="font-size:8.2pt">${esc(t.how)}<br><i>${esc(t.note)}</i></td></tr>`).join('')}
  </tbody></table>

  <h2>4. What is deliberately NOT in the copy</h2>
  ${D.WITHHELD.map((w) => `<div class="flag"><h4>${esc(w.figure)}</h4>${esc(w.why)}</div>`).join('')}
  <div class="ok"><b>If you do want Anthropic named,</b> this is the only form it may take, and
    both halves are mandatory together (${esc(D.APPROVED_IF_USED.clm.join(' + '))}):<br>
    <i>${esc(D.APPROVED_IF_USED.text)}</i></div>

  <h2>5. The company that is no longer on the list</h2>
  ${Object.entries(C.EXCLUDED).map(([k, v]) => `<div class="flag"><h4>${esc(k)}</h4>${esc(v)}
    <div class="ask">It is still enrolled in production as lead 25373. See F2.</div></div>`).join('')}

  <h2>6. Open flags</h2>
  ${D.FLAGS.map((f) => `<div class="flag"><h4>${esc(f.id)}. ${esc(f.title)}</h4>${esc(f.detail)}
    <div class="ask">Ask: ${esc(f.ask)}</div></div>`).join('')}

  <h2>7. The two attestations</h2>
  <div class="ok">Both gates read <b>false</b> in production as of ${esc(D.MEASURED_AT)}, and
    this build asserts that they do before it will produce a document at all. They are yours to
    set and this artifact does not write them, propose wording for them, or treat a reply to it
    as having set them. The dry run you are asked to have read is section 2.</div>`;

  return htmlDoc({ title: 'C6.14 CEO Outreach Copy and Claim Trace',
    css: baseCss() + SHARED, body });
}

module.exports = { buildVisual, buildDocument };
