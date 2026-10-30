/**
 * C0.11's two deliverables as HTML: the one-page brief and the full record.
 *
 * ## The editorial rule here
 *
 * Nothing on either page may read as though the schedule has already been stopped. The
 * criterion chips carry the real verdicts, the headline says "has not been suspended",
 * and the action block is written as an instruction rather than a report. A governance
 * folder is exactly where a premature "done" does its damage, because it is the thing
 * somebody reads in six months to find out what happened.
 */
const T = require('../artifactTheme');
const D = require('./c011Data');
const C = require('./c011Criteria');

const { SEV, esc } = T;
const fmt = C.fmt;

const TONE = { MET: SEV.ok, 'AT RISK': SEV.watch, UNMET: SEV.bad };

const chip = (t, c) => '<span class="chip" style="background:' + c + '">' + esc(t) + '</span>';

/** Whole days between two YYYY-MM-DD dates. */
function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

function headline(which) {
  const done = !!D.ACTION.suspendedOn;
  if (done) {
    return 'Schedule ' + D.SCHEDULE.id + ' was suspended on ' + D.ACTION.suspendedOn
      + '. Fikru Cheklie settled at ' + fmt(D.SETTLEMENT) + ', exactly '
      + fmt(C.collected()) + ' was collected, and no further draft will fire.';
  }
  return 'Fikru Cheklie settled at ' + fmt(D.SETTLEMENT) + ' and exactly '
    + fmt(C.collected()) + ' has been collected - twelve payments, counted one by one. '
    + 'The contract is closed as Paid Off Early, and PaySimple schedule ' + D.SCHEDULE.id
    + ' is still Active with a ' + fmt(D.SCHEDULE.amount) + ' draft dated '
    + D.SCHEDULE.nextDraft + '. It has not been suspended. If it fires we collect '
    + fmt(C.collected() + D.SCHEDULE.amount) + ' against a ' + fmt(D.SETTLEMENT)
    + ' settlement'
    + (which === 'brief' ? '.' : ', from a student whose October draft already returned NSF.');
}

function paymentRows() {
  return D.PAYMENTS.map((p) => {
    const kept = D.KEPT.test(p.status);
    return '<tr>'
      + '<td>' + esc(p.date) + '</td>'
      + '<td style="text-align:right">' + fmt(p.amount) + '</td>'
      + '<td>' + chip(p.status, kept ? SEV.ok : SEV.bad) + '</td>'
      + '<td style="text-align:right"><code>' + p.schedule + '</code></td>'
      + '</tr>';
  }).join('');
}

function criteriaRows() {
  return C.criteria().map((c) => '<tr>'
    + '<td style="white-space:nowrap">' + chip(c.verdict, TONE[c.verdict]) + '</td>'
    + '<td><strong>' + esc(c.text) + '</strong><br><span class="meta">'
    + esc(c.detail) + '</span></td></tr>').join('');
}

/* ------------------------------- the one-pager --------------------------------------*/
function buildVisual() {
  const left = daysBetween(D.OBSERVED, D.SCHEDULE.nextDraft);

  return `<!doctype html><html><head><meta charset="utf-8">
<title>C0.11 Settlement Overcollection</title><style>${T.baseCss()}
  body { font-size: 9.5pt; }
  h1 { font-size: 17pt; margin-bottom: 2px; }
  .rule { margin: 7px 0 9px; }
  h2 { margin: 6px 0 3px; font-size: 10.5pt; }
  .two { display: flex; gap: 13px; align-items: flex-start; }
  .two > * { flex: 1; min-width: 0; }
  table { font-size: 8.3pt; margin: 4px 0 7px; }
  td, th { padding: 2px 6px; }
  .takeaway { margin-bottom: 7px; padding: 8px 11px; }
  .takeaway .headline { font-size: 10.5pt; }
  .cards { margin: 6px 0 6px; }
  .card .n { font-size: 17pt; }
  .note { margin: 5px 0; padding: 6px 9px; font-size: 8.4pt; }
  code { font-size: 8pt; }
</style></head><body>
<h1>C0.11 &middot; Stop a collection past a settlement</h1>
<div class="meta">Verified against live PaySimple and CCPP on ${esc(D.OBSERVED)}
  &middot; contract ${D.CONTRACT.smicId} &middot; schedule
  <code>${D.SCHEDULE.id}</code> &middot; customer ${D.SCHEDULE.customerId}</div>
<div class="rule"></div>

<div class="takeaway">
  <div class="label">Takeaway</div>
  <div class="headline">${esc(headline('brief'))}</div>
</div>

<div class="cards">
  <div class="card"><div class="n">${fmt(C.collected())}</div>
    <div class="k">Collected, 12 payments</div></div>
  <div class="card"><div class="n">${fmt(D.SETTLEMENT)}</div>
    <div class="k">Settlement &mdash; difference $0</div></div>
  <div class="card"><div class="n">${left} days</div>
    <div class="k">Until the ${fmt(D.SCHEDULE.amount)} draft</div></div>
  <div class="card"><div class="n">1 of ${D.SWEEP.statusElevenContracts}</div>
    <div class="k">Paid-off contracts still live</div></div>
</div>

<div class="two">
  <div>
    <h2>Every payment on record</h2>
    <table>
      <thead><tr><th>Date</th><th style="text-align:right">Amount</th><th>Status</th>
        <th style="text-align:right">Schedule</th></tr></thead>
      <tbody>${paymentRows()}</tbody>
    </table>
  </div>
  <div>
    <h2>The three acceptance criteria</h2>
    <table><tbody>${criteriaRows()}</tbody></table>
    <div class="note warn"><strong>The obvious sweep would have missed this.</strong>
      Asking CCPP for status-11 contracts with <code>PS_IsActive = 1</code> returns
      ${D.SWEEP.naiveActive} rows, ${D.SWEEP.naiveActiveWithNoPaySimpleCustomer} of which
      have no PaySimple customer at all &mdash; and it does <em>not</em> return Fikru
      Cheklie, whose row reads null while his schedule is Active.</div>
  </div>
</div>

<div class="two">
  <div class="note warn"><strong>Run this before 2 November.</strong>
    <div style="margin:3px 0"><code>${esc(D.ACTION.command)}</code></div>
    Dry run clean. Re-checks everything live, refuses if anything moved, reads the status
    back. Already suspended does nothing. Reversible.</div>
  <div class="note"><strong>Yours: ${esc(D.FOR_ALI.question)}</strong>
    The payments prove ${fmt(C.collected())} was <em>collected</em>; nothing proves
    anyone <em>agreed</em> to it. If the real figure were higher, suspending stops
    collection that was owed.</div>
</div>
</body></html>`;
}

/* ----------------------------- the full document ------------------------------------*/
function buildDocument() {
  const left = daysBetween(D.OBSERVED, D.SCHEDULE.nextDraft);

  return `<!doctype html><html><head><meta charset="utf-8">
<title>C0.11 Settlement Overcollection</title><style>${T.baseCss()}</style></head><body>
<h1>C0.11 &middot; Stop a collection that would take money past a settlement</h1>
<div class="meta">AI Capability Commercialization &middot; verified ${esc(D.OBSERVED)}
  &middot; artifact folder: 00 - Master &amp; Governance</div>
<div class="rule"></div>

<div class="takeaway">
  <div class="label">Takeaway</div>
  <div class="headline">${esc(headline())}</div>
</div>

<h2>The case, in payments</h2>
<p>The settlement was collected across two schedules, which is why a reconciliation that
looked only at the current one would get the answer backwards: it would find
${fmt(9000)} on schedule ${D.SCHEDULE.id}, conclude ${fmt(3000)} was still owed, and
leave the draft running.</p>
<table>
  <thead><tr><th>Date</th><th style="text-align:right">Amount</th><th>Status</th>
    <th style="text-align:right">Schedule</th></tr></thead>
  <tbody>${paymentRows()}</tbody>
</table>
<p><strong>Twelve payments stayed, totalling ${fmt(C.collected())}.</strong> One did not:
the ${esc(D.PAYMENTS[D.PAYMENTS.length - 1].date)} draft returned
<code>ReverseNSF</code>, meaning it was taken and given back. A reversal is not
collection, so it is excluded from the total; counting it would have overstated what the
student paid and made a correct suspension look unnecessary.</p>
<p>The difference between what was collected and the settlement is <strong>$0</strong>.
Source: ${esc(D.PS_SRC)}.</p>

<h2>The schedule that is still armed</h2>
<table><tbody>
  <tr><td style="width:170px"><strong>Schedule</strong></td>
    <td><code>${D.SCHEDULE.id}</code>, status <strong>${esc(D.SCHEDULE.status)}</strong></td></tr>
  <tr><td><strong>Customer</strong></td>
    <td>${esc(D.SCHEDULE.customer)}, ${D.SCHEDULE.customerId}</td></tr>
  <tr><td><strong>Amount and rhythm</strong></td>
    <td>${fmt(D.SCHEDULE.amount)} on ${esc(D.SCHEDULE.frequency)}</td></tr>
  <tr><td><strong>Next draft</strong></td>
    <td><strong>${esc(D.SCHEDULE.nextDraft)}</strong> &mdash; ${left} days from the
      date this was verified</td></tr>
  <tr><td><strong>Runs until</strong></td><td>${esc(D.SCHEDULE.endDate)}</td></tr>
  <tr><td><strong>Contract</strong></td>
    <td>${D.CONTRACT.smicId}, status ${D.CONTRACT.status}
      &ldquo;${esc(D.CONTRACT.statusName)}&rdquo; (group
      ${esc(D.CONTRACT.statusGroup)})</td></tr>
</tbody></table>
<p>Because the schedule runs on ${esc(D.SCHEDULE.frequency)} and ends
${esc(D.SCHEDULE.endDate)}, the ${esc(D.SCHEDULE.nextDraft)} draft is the last one it
will attempt. Stopping it is the whole of the remaining exposure:
${fmt(D.SCHEDULE.amount)}.</p>

<h2>The sweep, and why the obvious version of it fails</h2>
<p>The ticket asks whether any other Paid Off Early contract still carries a live
schedule. The natural way to answer that is one query against CCPP:
<code>SMIC_Status = 11 AND ${esc(D.METHOD.flag.split(' on ')[0])} = 1</code>. That query
is wrong in both directions at once.</p>
<div class="note warn"><strong>It misses the only true case.</strong>
${esc(D.METHOD.falseNegative)}</div>
<div class="note"><strong>And it invents ten false ones.</strong>
${esc(D.METHOD.falsePositives)}</div>
<p>${esc(D.METHOD.conclusion)}</p>
<table>
  <thead><tr><th>Measure</th><th style="text-align:right">Count</th></tr></thead>
  <tbody>
    <tr><td>Contracts closed as Paid Off Early</td>
      <td style="text-align:right">${D.SWEEP.statusElevenContracts}</td></tr>
    <tr><td>Of those, carrying a real PaySimple customer id</td>
      <td style="text-align:right">${D.SWEEP.withPaySimpleCustomer}</td></tr>
    <tr><td>Checked against PaySimple directly</td>
      <td style="text-align:right">${D.SWEEP.checkedAgainstPaySimple}</td></tr>
    <tr><td><strong>With a live schedule</strong></td>
      <td style="text-align:right"><strong>${D.SWEEP.liveSchedulesFound}</strong></td></tr>
  </tbody>
</table>
<p>The one is ${esc(D.SWEEP.liveScheduleOwners.join(', '))}. Nothing else needs
stopping, and that statement rests on having asked PaySimple about every contract that
could have had a schedule rather than on CCPP's opinion of them.</p>

<h2>The three acceptance criteria</h2>
<table><tbody>${criteriaRows()}</tbody></table>

<h2>The action, prepared and not taken</h2>
<p>The script is staged in the production backend container. It is a dry run by default
and does nothing without <code>COMMIT=1</code>.</p>
<p><code>${esc(D.ACTION.command)}</code></p>
<p>It re-asserts every precondition against live data at the moment it runs, because the
evidence here was gathered on ${esc(D.OBSERVED)} and the action may be taken later:</p>
<ul>${D.ACTION.preconditions.map((p) => '<li>' + esc(p) + '</li>').join('')}</ul>
<p>${esc(D.ACTION.confirmedBack)} ${esc(D.ACTION.reversible)}</p>

<h2>The one thing this document cannot settle</h2>
<p><strong>${esc(D.FOR_ALI.question)}</strong></p>
<p>${esc(D.FOR_ALI.whyNotMine)}</p>
<p>That is why the first criterion reads UNMET rather than "ready": the evidence is
complete, the command is staged and verified, and the confirmation it waits on is a human
fact rather than a number in a database. The deadline for that confirmation is
<strong>${esc(D.FOR_ALI.deadline)}</strong>.</p>

<p class="meta"><strong>REVIEW STATE: BLOCKED - ALI DECISION REQUIRED</strong></p>
</body></html>`;
}

module.exports = { buildVisual, buildDocument, headline, daysBetween };
