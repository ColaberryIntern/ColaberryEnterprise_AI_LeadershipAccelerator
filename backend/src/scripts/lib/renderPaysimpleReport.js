/* eslint-disable */
/**
 * renderPaysimpleReport.js
 *
 * Pure renderer for the PaySimple Missed-Payments collections report.
 * Input is the structured object built by paysimpleMissedPaymentsReport.js;
 * output is { html, text }.
 *
 * EMAIL-SAFE BY DESIGN. Outlook desktop strips CSS grid/flex, <style> blocks,
 * CSS variables, gradients, box-shadow, border-radius on most elements, and SVG.
 * So every "chart" here is a nested <table> with bgcolor-filled <td> bars, every
 * color is a hex literal inline, layout is table-based, 640px outer cap, MSO
 * Arial fallback. This reads as a Power-BI-style dashboard but renders identically
 * in Outlook, Gmail, and Apple Mail. (Lesson banked from the Family Command Center
 * Outlook breakage; see PROGRESS.md 2026-06-09.)
 *
 * CONTRACT (data object):
 *   runAt: Date, windowDays, weekDays
 *   recipientLabel: string (e.g. "Taiwo & Ali")
 *   kpis: { flagged, recovered, recoveredPct, outstanding, atRisk,
 *           settledCount, settledAmt, thisWeekFlagged, thisWeekRecovered }
 *   weekTrend: [{ label, count, amt }]            // oldest -> newest
 *   reasons:   [{ reason, count, pct }]           // desc by count
 *   thisWeek:     [row]   // lastFail within weekDays (recovered shown, marked)
 *   rollingMonth: [row]   // lastFail weekDays..windowDays, outstanding only
 *   recoveredList:[row]   // recovered in window (wins)
 *   row: { name, email, phone, className, mentor, amount, reason, reasonClass,
 *          lastFailISO, daysSince, failCount, customerId, scheduleId, accountId,
 *          recovered(bool), nextExpectedISO, daysOut }
 */

const NAVY = '#0f1729';
const NAVY2 = '#1a2744';
const INK = '#1f2937';
const MUTE = '#6b7280';
const LINE = '#e5e7eb';
const PANEL = '#f4f6fa';
const RED = '#b91c1c';
const AMBER = '#b45309';
const GREEN = '#047857';
const BLUE = '#1d4ed8';
const GOLD = '#b8860b';

const REASON_COLOR = {
  nsf: AMBER,
  stopped: RED,
  account: '#7f1d1d',
  failed: '#7f1d1d',
  other: MUTE,
};

// All dates/times in the report render in US Central (CST/CDT) regardless of the
// server timezone (the VPS runs UTC). Per Ali: always report on Central time.
const TZ = 'America/Chicago';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function money(n) {
  const v = Math.round(Number(n) || 0);
  return '$' + v.toLocaleString('en-US');
}
function shortDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ });
}
function fullStamp(d) {
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: TZ, timeZoneName: 'short',
  });
}
function fmtPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === '1') return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return p || '';
}

/* PaySimple deep-link. The exact admin URL format is pending Ali's confirmation;
 * until then we link to the app root and surface the Customer/Schedule/Account
 * IDs inline so Taiwo can search. Swap PS_BASE once the real pattern is known. */
const PS_BASE = 'https://app.paysimple.com';
function psLink(customerId) {
  return `${PS_BASE}/#/customers/${customerId}`;
}

function pill(text, bg, fg) {
  return `<span style="display:inline-block;background:${bg};color:${fg};font-size:10px;font-weight:700;`
    + `padding:2px 8px;border-radius:3px;letter-spacing:.3px;white-space:nowrap;">${esc(text)}</span>`;
}

/* ---- KPI card row ---- */
function kpiCards(k) {
  const cards = [
    { label: 'Flagged (30d)', value: String(k.flagged), sub: `${k.thisWeekFlagged} this week`, color: NAVY },
    { label: 'Payment Made', value: `${k.recoveredPct}%`, sub: `${k.recovered} cleared`, color: GREEN },
    { label: 'Rescheduled', value: `${k.rescheduledPct}%`, sub: `${k.rescheduled} draft pending`, color: BLUE },
    { label: 'Needs A Call', value: String(k.outstanding), sub: money(k.atRisk) + ' at risk', color: RED },
  ];
  const tds = cards.map((c) => `
    <td width="25%" valign="top" style="padding:6px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#ffffff;border:1px solid ${LINE};border-top:3px solid ${c.color};">
        <tr><td style="padding:12px 14px;">
          <div style="font-size:10px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:${MUTE};">${esc(c.label)}</div>
          <div style="font-size:26px;font-weight:800;color:${c.color};line-height:1.1;margin-top:4px;font-family:Arial,Helvetica,sans-serif;">${esc(c.value)}</div>
          <div style="font-size:11px;color:${MUTE};margin-top:3px;">${esc(c.sub)}</div>
        </td></tr>
      </table>
    </td>`).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>${tds}</tr></table>`;
}

/* ---- horizontal bar chart (table-based) ---- */
function barChart(title, items, opt = {}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const color = opt.color || BLUE;
  const rows = items.map((i) => {
    const pct = Math.max(2, Math.round((i.value / max) * 100));
    const barColor = i.color || color;
    return `
      <tr>
        <td width="130" style="font-size:12px;color:${INK};padding:5px 8px 5px 0;vertical-align:middle;">${esc(i.label)}</td>
        <td style="vertical-align:middle;padding:5px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
            <td width="${pct}%" style="background:${barColor};height:18px;font-size:0;line-height:0;">&nbsp;</td>
            <td style="font-size:12px;font-weight:700;color:${INK};padding-left:8px;white-space:nowrap;">${esc(i.right)}</td>
          </tr></table>
        </td>
      </tr>`;
  }).join('');
  return panel(title, `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>`);
}

/* ---- recovery stacked bar (3-way: paid / rescheduled / outstanding) ---- */
function recoveryBar(k) {
  const total = Math.max(1, k.flagged);
  const recPct = Math.round((k.recovered / total) * 100);
  const resPct = Math.round((k.rescheduled / total) * 100);
  const outPct = Math.max(0, 100 - recPct - resPct);
  const seg = (pct, bg) => pct > 0
    ? `<td width="${Math.max(3, pct)}%" style="background:${bg};height:26px;color:#fff;font-size:12px;font-weight:700;text-align:center;vertical-align:middle;">${pct}%</td>`
    : '';
  return panel('Recovery Status (rolling 30 days)', `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      ${seg(recPct, GREEN)}${seg(resPct, BLUE)}${seg(outPct, RED)}
    </tr></table>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:8px;"><tr>
      <td style="font-size:11px;color:${MUTE};">${pill('PAID', GREEN, '#fff')} ${k.recovered} &nbsp; ${pill('RESCHEDULED', BLUE, '#fff')} ${k.rescheduled} &nbsp; ${pill('NEEDS CALL', RED, '#fff')} ${k.outstanding}</td>
      <td align="right" style="font-size:11px;color:${MUTE};">${money(k.atRisk)} at risk</td>
    </tr></table>`);
}

function panel(title, inner) {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#ffffff;border:1px solid ${LINE};margin-top:14px;">
    <tr><td style="padding:14px 16px;">
      <div style="font-size:13px;font-weight:800;color:${NAVY};text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid ${NAVY};padding-bottom:7px;margin-bottom:11px;">${esc(title)}</div>
      ${inner}
    </td></tr>
  </table>`;
}

/* ---- student row card (priority list) ---- */
function studentCard(r, opts = {}) {
  const recovered = r.recovered;
  const rescheduled = r.rescheduled;
  const statusPill = recovered
    ? pill('✓ PAYMENT MADE', GREEN, '#fff')
    : rescheduled
      ? pill('RESCHEDULED', BLUE, '#fff')
      : pill('NEEDS A CALL', RED, '#fff');
  const accent = recovered ? GREEN : rescheduled ? BLUE : (REASON_COLOR[r.reasonClass] || RED);
  const reasonPill = pill(r.reason, '#fff4e5', REASON_COLOR[r.reasonClass] || MUTE);
  const phone = r.phone ? `<a href="tel:${esc(String(r.phone).replace(/\D/g, ''))}" style="color:${BLUE};text-decoration:none;font-weight:700;">${esc(fmtPhone(r.phone))}</a>` : `<span style="color:${MUTE};">(in PaySimple)</span>`;
  const ageBg = r.daysSince <= 3 ? '#fee2e2' : '#f3f4f6';
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid ${LINE};border-left:4px solid ${accent};margin-bottom:8px;background:#ffffff;">
    <tr><td style="padding:11px 13px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
        <td valign="top">
          <span style="font-size:15px;font-weight:800;color:${NAVY};">${esc(r.name)}</span>
          <span style="font-size:11px;color:${MUTE};">&nbsp;&middot;&nbsp;${esc(r.className || 'Class n/a')}</span>
        </td>
        <td valign="top" align="right">${statusPill}</td>
      </tr></table>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:8px;">
        <tr>
          <td width="50%" valign="top" style="font-size:12px;color:${INK};line-height:1.7;">
            <div>&#9742; ${phone}</div>
            <div>&#9993; <a href="mailto:${esc(r.email)}" style="color:${BLUE};text-decoration:none;">${esc(r.email)}</a></div>
            ${r.mentor ? `<div style="color:${MUTE};">Mentor: ${esc(r.mentor)}</div>` : ''}
          </td>
          <td width="50%" valign="top" style="font-size:12px;color:${INK};line-height:1.7;">
            <div><b style="color:${RED};">${money(r.amount)}</b> &middot; ${esc((r.paymentType || 'ACH').toUpperCase())} &middot; ${reasonPill}</div>
            <div>Missed <b>${shortDate(r.lastFailISO)}</b> <span style="background:${ageBg};color:${INK};padding:1px 6px;font-size:11px;">${r.daysSince}d ago</span>${r.failCount > 1 ? ` &middot; ${r.failCount}× in window` : ''}</div>
            ${recovered
              ? `<div style="color:${GREEN};">Cleared ${r.recoveredISO ? shortDate(r.recoveredISO) : ''} ✓</div>`
              : rescheduled
                ? `<div style="color:${BLUE};">Replacement draft submitted ${r.rescheduledISO ? shortDate(r.rescheduledISO) : ''} - awaiting settlement</div>`
                : `<div style="color:${MUTE};">Next auto-attempt: <b style="color:${INK};">${shortDate(r.nextExpectedISO)}</b> (${r.daysOut >= 0 ? `in ${r.daysOut}d` : `${Math.abs(r.daysOut)}d overdue`})</div>`}
          </td>
        </tr>
      </table>

      <div style="margin-top:8px;padding-top:7px;border-top:1px dashed ${LINE};font-size:11px;color:${MUTE};">
        PaySimple: <a href="${psLink(r.customerId)}" style="color:${BLUE};text-decoration:none;font-weight:700;">Customer #${esc(r.customerId)}</a>
        &middot; Schedule ${esc(r.scheduleId || '-')} &middot; Account ${esc(r.accountId || '-')}
        ${(recovered || rescheduled) ? '' : `&nbsp;&nbsp;${pill('ACTION: CALL + RESCHEDULE', NAVY, '#fff')}`}
      </div>
    </td></tr>
  </table>`;
}

function gameplan(data) {
  const k = data.kpis;
  const topReason = data.reasons[0];
  const steps = [
    `<b>Work the "This Week" list first (${data.thisWeek.filter((r) => !r.recovered).length} open).</b> These are the freshest flags - the conversation lands best within 72 hours of the failed draft. Recovered names stay listed for the week as confirmation, no action needed on those.`,
    `<b>Lead with the failure reason.</b> ${topReason ? `"${topReason.reason}" is the #1 cause this month (${topReason.count} students).` : ''} NSF/Insufficient Funds usually means "retry after payday" - ask for a date and reschedule. "Payment Stopped" / "Account Closed" / "known bad account" means the bank instrument is dead - you must collect a NEW card or account on the call, not just retry.`,
    `<b>Open the PaySimple customer link before each call.</b> It shows the bank/card on file, the recurring schedule, and the phone number for the names where CCPP has no phone. Update the payment method there, then schedule the replacement draft and note the date.`,
    `<b>Capture the replacement date.</b> For each call, log the new scheduled payment date so next run shows "rescheduled in N days" instead of just "outstanding." Once it settles, the student auto-drops off this report.`,
    `<b>Escalate the dead-instrument cases.</b> Students with a closed/frozen/known-bad account who don't pick up after 2 attempts should go to Ali for an access-hold decision.`,
  ];
  const lis = steps.map((s, i) => `
    <tr>
      <td width="26" valign="top" style="font-size:14px;font-weight:800;color:#fff;background:${NAVY};text-align:center;padding:4px 0;">${i + 1}</td>
      <td style="font-size:13px;color:${INK};line-height:1.55;padding:4px 0 12px 12px;">${s}</td>
    </tr>`).join('');
  return panel('Gameplan for Taiwo', `
    <div style="font-size:13px;color:${INK};line-height:1.6;margin-bottom:10px;">
      ${k.outstanding} students owe a payment right now (${money(k.atRisk)}). Here is the fastest path to clear them:
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${lis}</table>`);
}

function renderHtml(data) {
  const k = data.kpis;
  const year = new Date(data.runAt).toLocaleDateString('en-US', { year: 'numeric', timeZone: TZ });
  const range = `${shortDate(new Date(data.runAt).getTime() - data.windowDays * 864e5)} – ${shortDate(data.runAt)}, ${year}`;

  const thisWeekOpen = data.thisWeek.filter((r) => !r.recovered);
  const thisWeekDone = data.thisWeek.filter((r) => r.recovered);

  const weekItems = data.weekTrend.map((w) => ({ label: w.label, value: w.count, right: `${w.count}`, color: BLUE }));
  const reasonItems = data.reasons.map((r) => ({
    label: r.reason, value: r.count, right: `${r.count} (${r.pct}%)`,
    color: REASON_COLOR[r.reasonClass] || MUTE,
  }));

  const body = `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PANEL};padding:0;margin:0;">
    <tr><td align="center" style="padding:18px 10px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" style="width:640px;max-width:640px;font-family:Arial,Helvetica,sans-serif;">

        <!-- header -->
        <tr><td style="background:${NAVY};padding:22px 22px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
            <td valign="middle">
              <div style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:${GOLD};font-weight:700;">Colaberry &middot; IPBC Collections</div>
              <div style="font-size:23px;font-weight:800;color:#ffffff;margin-top:5px;line-height:1.15;">PaySimple Missed-Payment Report</div>
              <div style="font-size:12px;color:#aebbd4;margin-top:5px;">Rolling 30 days &middot; ${esc(range)} &middot; for ${esc(data.recipientLabel)}</div>
            </td>
          </tr></table>
        </td></tr>

        <!-- body -->
        <tr><td style="padding:16px 16px 6px;">
          ${kpiCards(k)}
          ${recoveryBar(k)}

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
            <td width="50%" valign="top" style="padding-right:7px;">${barChart('Missed by week', weekItems, { color: BLUE })}</td>
            <td width="50%" valign="top" style="padding-left:7px;">${barChart('Top failure reasons', reasonItems)}</td>
          </tr></table>

          ${gameplan(data)}

          <!-- THIS WEEK -->
          ${panel(`🔥 This Week — priority call list (${thisWeekOpen.length} open, stays 7 days)`,
            (thisWeekOpen.length ? thisWeekOpen.map((r) => studentCard(r)).join('')
              : `<div style="font-size:13px;color:${MUTE};">No open flags from the last 7 days.</div>`)
            + (thisWeekDone.length
              ? `<div style="font-size:12px;font-weight:700;color:${GREEN};margin:12px 0 6px;">${pill('CLEARED THIS WEEK', GREEN, '#fff')} (kept on list per rolling-week rule)</div>`
                + thisWeekDone.map((r) => studentCard(r)).join('')
              : ''))}

          <!-- ROLLING MONTH -->
          ${panel(`Rolling Month — still outstanding (${data.rollingMonth.length}, 8–30 days ago)`,
            data.rollingMonth.length
              ? data.rollingMonth.map((r) => studentCard(r)).join('')
              : `<div style="font-size:13px;color:${MUTE};">Nothing outstanding beyond this week. 🎉</div>`)}

          <!-- RECOVERED -->
          ${data.recoveredList.length ? panel(`✓ Completed / recovered this period (${data.recoveredList.length})`, `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:12px;color:${INK};">
              <tr style="background:${PANEL};">
                <td style="padding:6px 8px;font-weight:700;">Student</td>
                <td style="padding:6px 8px;font-weight:700;">Class</td>
                <td style="padding:6px 8px;font-weight:700;" align="right">Amount</td>
                <td style="padding:6px 8px;font-weight:700;">Missed</td>
              </tr>
              ${data.recoveredList.map((r) => `<tr style="border-bottom:1px solid ${LINE};">
                <td style="padding:6px 8px;">${esc(r.name)} ${pill('✓', GREEN, '#fff')}</td>
                <td style="padding:6px 8px;color:${MUTE};">${esc((r.className || '').slice(0, 28))}</td>
                <td style="padding:6px 8px;" align="right">${money(r.amount)}</td>
                <td style="padding:6px 8px;color:${MUTE};">${shortDate(r.lastFailISO)}</td>
              </tr>`).join('')}
            </table>`) : ''}

        </td></tr>

        <!-- footer -->
        <tr><td style="padding:14px 18px 26px;">
          <div style="border-top:1px solid ${LINE};padding-top:12px;font-size:11px;color:${MUTE};line-height:1.6;">
            <b style="color:${INK};">Definitions.</b> "Missed" = PaySimple <i>payment_failed</i> or <i>payment_returned</i> (NSF / stopped / closed account). "Payment made" = a settled payment after the failure. "This Week" buckets by most-recent failure within ${data.weekDays} days and keeps cleared names for the week per your rule; "Rolling Month" shows only still-outstanding flags 8–${data.windowDays} days old (recovered ones rolled off).<br/>
            <b style="color:${INK};">Status.</b> "Paid" = a payment settled after the failure. "Rescheduled" = a replacement draft was submitted after the failure but has not settled yet (inferred from the transaction log). Exact rescheduled <i>dates</i> and recurring-schedule next-run dates require the PaySimple API (credentials pending) - until then the report infers reschedule from post-failure draft activity.<br/>
            <b style="color:${INK};">Source.</b> CCPP <i>ADF_PaysimpleTrans</i> + <i>CB_PS_TXN_LOG</i> joined to student identity/contact. All times US Central. Generated ${esc(fullStamp(data.runAt))}.
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>`;

  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body style="margin:0;padding:0;background:${PANEL};">${body}</body></html>`;
}

function renderText(data) {
  const k = data.kpis;
  const line = (r) => `  - ${r.name} | ${fmtPhone(r.phone) || 'phone in PaySimple'} | ${r.email} | ${money(r.amount)} | ${r.reason} | missed ${shortDate(r.lastFailISO)} (${r.daysSince}d) | PS Cust #${r.customerId}${r.recovered ? ' | PAID' : r.rescheduled ? ' | RESCHEDULED' : ''}`;
  return [
    `PAYSIMPLE MISSED-PAYMENT REPORT  (rolling ${data.windowDays} days) — for ${data.recipientLabel}`,
    ``,
    `Flagged: ${k.flagged} | Payment made: ${k.recovered} (${k.recoveredPct}%) | Outstanding: ${k.outstanding} | At risk: ${money(k.atRisk)}`,
    `This week: ${k.thisWeekFlagged} flagged, ${k.thisWeekRecovered} cleared`,
    ``,
    `THIS WEEK — priority calls:`,
    ...data.thisWeek.filter((r) => !r.recovered).map(line),
    ``,
    `ROLLING MONTH — outstanding:`,
    ...data.rollingMonth.map(line),
    ``,
    `Generated ${new Date(data.runAt).toLocaleString('en-US')} from CCPP.`,
  ].join('\n');
}

module.exports = { renderHtml, renderText };
