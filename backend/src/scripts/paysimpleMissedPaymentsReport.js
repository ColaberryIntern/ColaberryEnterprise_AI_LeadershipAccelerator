#!/usr/bin/env node
/* eslint-disable */
/**
 * paysimpleMissedPaymentsReport.js
 *
 * Collections report for Colaberry IPBC recurring tuition drafts run through
 * PaySimple. Pulls failed/returned payments from CCPP for a rolling window,
 * enriches each with student identity + contact + recurring-schedule IDs,
 * detects recovery (a settled payment after the failure), buckets into
 * "this week" (priority, sticky for 7 days) vs "rolling month" (still
 * outstanding), computes recovery metrics, renders an email-safe Power-BI-style
 * HTML report (see lib/renderPaysimpleReport.js), writes it to docs/, and
 * emails it.
 *
 * Idempotent: read-only against CCPP; the only side effect is one email send,
 * which is skipped with --dry. Safe to re-run.
 *
 * Run (on the VPS, where CCPP + Mandrill creds live):
 *   node backend/src/scripts/paysimpleMissedPaymentsReport.js --dry          # build HTML, no send
 *   node backend/src/scripts/paysimpleMissedPaymentsReport.js                # send to default recipient
 *   node backend/src/scripts/paysimpleMissedPaymentsReport.js --to=a@b.com,c@d.com
 *
 * Flags: --dry (no email), --to=csv (override recipients), --window=30, --week=7
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const sql = require(path.resolve(__dirname, '../../../node_modules/mssql'));
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { renderHtml, renderText } = require('./lib/renderPaysimpleReport');

const DRY = process.argv.includes('--dry');
// True-noon-CT guard. The VPS runs UTC and Debian cron interprets schedules in
// UTC (no CRON_TZ), so DST would drift a fixed UTC time off noon. Instead the
// cron fires at BOTH 17:00 and 18:00 UTC and passes --only-if-noon-ct; this guard
// lets exactly the noon-Central run proceed (17:00 UTC = noon CDT summer, 18:00
// UTC = noon CST winter) and the other exit cleanly. Manual runs omit the flag.
const ONLY_IF_NOON_CT = process.argv.includes('--only-if-noon-ct');
const argTo = process.argv.find((a) => a.startsWith('--to='));
const argCc = process.argv.find((a) => a.startsWith('--cc='));
const RECIPIENTS = argTo ? argTo.slice('--to='.length).split(',').map((s) => s.trim()).filter(Boolean)
  : ['ali@colaberry.com'];
const CC = argCc ? argCc.slice('--cc='.length).split(',').map((s) => s.trim()).filter(Boolean) : [];
const WINDOW = parseInt((process.argv.find((a) => a.startsWith('--window=')) || '--window=30').split('=')[1], 10);
const WEEK = parseInt((process.argv.find((a) => a.startsWith('--week=')) || '--week=7').split('=')[1], 10);

const cfg = {
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT || '1433', 10),
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASS,
  database: process.env.MSSQL_DATABASE || 'CCPP',
  options: { encrypt: false, trustServerCertificate: true },
  requestTimeout: 120000,
};

/* Classify a PaySimple failure/return reason into a small, callable bucket. */
function classifyReason(raw) {
  const s = (raw || '').toLowerCase();
  if (/insufficient|nsf/.test(s)) return { reasonClass: 'nsf', label: 'Insufficient Funds (NSF)' };
  if (/stopped/.test(s)) return { reasonClass: 'stopped', label: 'Payment Stopped' };
  if (/closed|frozen/.test(s)) return { reasonClass: 'account', label: 'Account Closed / Frozen' };
  if (/known bad|bad account|declin|invalid|expired/.test(s)) return { reasonClass: 'failed', label: 'Bad Account / Declined' };
  return { reasonClass: 'other', label: raw ? raw.slice(0, 28) : 'Other' };
}

const MISSED_QUERY = `
  WITH fails AS (
    SELECT t.CustomerID, MAX(t.CreatedAt) lastFail, MIN(t.CreatedAt) firstFail, COUNT(*) failCount
    FROM ADF_PaysimpleTrans t
    WHERE t.CreatedAt >= DATEADD(day, -@win, GETDATE())
      AND t.EventType IN ('payment_failed','payment_returned')
    GROUP BY t.CustomerID )
  SELECT f.CustomerID, f.lastFail, f.firstFail, f.failCount,
    lt.Amount, lt.PaymentType, ISNULL(lt.FailureReason, lt.ReturnReason) Reason,
    du.FirstName, du.LastName, du.Email,
    COALESCE(ph.PropertyValue, au.PhoneNumber) Phone,
    au.ClassName, au.Mentor, au.IPBC_CurrentlyDue,
    ps.RecurringScheduleId, ps.AccountId, rec.recoveredAt,
    CASE WHEN rec.hit IS NOT NULL THEN 1 ELSE 0 END recovered,
    res.reschedAt,
    CASE WHEN rec.hit IS NULL AND res.hit IS NOT NULL THEN 1 ELSE 0 END rescheduled
  FROM fails f
  OUTER APPLY (SELECT TOP 1 Amount, PaymentType, FailureReason, ReturnReason FROM ADF_PaysimpleTrans
               WHERE CustomerID = f.CustomerID AND EventType IN ('payment_failed','payment_returned')
               ORDER BY CreatedAt DESC) lt
  OUTER APPLY (SELECT TOP 1 SMIC_UserID FROM ADF_Student_Marketing_SalesRepsComm
               WHERE PS_CustomerID = f.CustomerID ORDER BY PS_IsActive DESC, SMIC_DateAdded DESC) vms
  LEFT JOIN dnnuser.users du ON du.UserID = vms.SMIC_UserID
  OUTER APPLY (SELECT TOP 1 PhoneNumber, ClassName, Mentor, IPBC_CurrentlyDue FROM ADF_ColaberryActiveUsers
               WHERE UserID = vms.SMIC_UserID ORDER BY ClassStartDate DESC) au
  OUTER APPLY (SELECT TOP 1 up.PropertyValue FROM dnnuser.UserProfile up
               JOIN dnnuser.ProfilePropertyDefinition pd ON pd.PropertyDefinitionID = up.PropertyDefinitionID
               WHERE up.UserID = vms.SMIC_UserID AND pd.PropertyName IN ('Cell','Telephone') AND up.PropertyValue <> ''
               ORDER BY CASE pd.PropertyName WHEN 'Cell' THEN 0 ELSE 1 END) ph
  OUTER APPLY (SELECT TOP 1 RecurringScheduleId, AccountId FROM CB_PS_TXN_LOG
               WHERE CustomerId = CAST(f.CustomerID AS varchar) ORDER BY CreatedOn DESC) ps
  -- recovered = a payment that SETTLED strictly AFTER this student's most recent
  -- failure (i.e. the replacement/retry draft cleared). A settle before the
  -- failure is a prior month's draft and does NOT cure the current miss.
  OUTER APPLY (SELECT TOP 1 1 AS hit, s.CreatedAt AS recoveredAt FROM ADF_PaysimpleTrans s
               WHERE s.CustomerID = f.CustomerID AND s.EventType = 'payment_settled'
                 AND s.CreatedAt > f.lastFail ORDER BY s.CreatedAt ASC) rec
  -- rescheduled = a replacement draft was initiated (created/submitted) AFTER the
  -- failure but has NOT settled yet. Future-dated schedules are not in this log
  -- (it only records executed transactions), so this is the closest DB proxy;
  -- exact reschedule dates need the PaySimple API.
  OUTER APPLY (SELECT TOP 1 1 AS hit, r2.CreatedAt AS reschedAt FROM ADF_PaysimpleTrans r2
               WHERE r2.CustomerID = f.CustomerID
                 AND r2.EventType IN ('payment_created','payment_submitted_for_settlement')
                 AND r2.CreatedAt > f.lastFail ORDER BY r2.CreatedAt ASC) res
  ORDER BY f.lastFail DESC`;

async function loadData() {
  await sql.connect(cfg);
  const runAt = new Date();
  try {
    const missed = (await new sql.Request().input('win', sql.Int, WINDOW).query(MISSED_QUERY)).recordset;

    // settled context
    const settled = (await sql.query(
      `SELECT COUNT(*) n, ISNULL(SUM(Amount),0) amt FROM ADF_PaysimpleTrans
       WHERE EventType='payment_settled' AND CreatedAt >= DATEADD(day,-${WINDOW},GETDATE())`)).recordset[0];

    // weekly trend of missed events (last 5 weeks)
    const events = (await sql.query(
      `SELECT CreatedAt FROM ADF_PaysimpleTrans
       WHERE EventType IN ('payment_failed','payment_returned')
         AND CreatedAt >= DATEADD(day,-35,GETDATE())`)).recordset;

    // ---- shape rows ----
    const now = runAt.getTime();
    const DAY = 864e5;
    const rows = missed.map((m) => {
      const cls = classifyReason(m.Reason);
      const lastFail = new Date(m.lastFail);
      const daysSince = Math.floor((now - lastFail.getTime()) / DAY);
      const next = new Date(lastFail.getTime() + 30 * DAY);
      const daysOut = Math.round((next.getTime() - now) / DAY);
      const name = `${(m.FirstName || '').trim()} ${(m.LastName || '').trim()}`.trim()
        || `PaySimple Customer ${m.CustomerID}`;
      return {
        name,
        email: m.Email || '',
        phone: m.Phone || '',
        className: (m.ClassName || '').trim(),
        mentor: (m.Mentor || '').trim(),
        amount: Number(m.Amount) || 0,
        paymentType: m.PaymentType || 'ACH',
        reason: cls.label,
        reasonRaw: m.Reason || '',
        reasonClass: cls.reasonClass,
        lastFailISO: lastFail.toISOString(),
        daysSince,
        failCount: m.failCount,
        customerId: m.CustomerID,
        scheduleId: m.RecurringScheduleId || '',
        accountId: m.AccountId || '',
        recovered: !!m.recovered,
        rescheduled: !!m.rescheduled,
        recoveredISO: m.recoveredAt ? new Date(m.recoveredAt).toISOString() : null,
        rescheduledISO: m.reschedAt ? new Date(m.reschedAt).toISOString() : null,
        nextExpectedISO: next.toISOString(),
        daysOut,
      };
    });

    // ---- buckets ----
    const thisWeek = rows.filter((r) => r.daysSince <= WEEK);
    const rollingMonth = rows.filter((r) => r.daysSince > WEEK && !r.recovered);
    const recoveredList = rows.filter((r) => r.recovered);

    // ---- KPIs ----
    const flagged = rows.length;
    const recovered = recoveredList.length;
    const rescheduled = rows.filter((r) => r.rescheduled).length;
    const outstanding = rows.filter((r) => !r.recovered && !r.rescheduled).length; // truly needs a call
    const atRisk = rows.filter((r) => !r.recovered).reduce((s, r) => s + r.amount, 0); // owed until settled

    // ---- reason breakdown (one per flagged student, latest reason) ----
    const rmap = {};
    rows.forEach((r) => {
      rmap[r.reason] = rmap[r.reason] || { reason: r.reason, reasonClass: r.reasonClass, count: 0 };
      rmap[r.reason].count++;
    });
    const reasons = Object.values(rmap).sort((a, b) => b.count - a.count)
      .map((r) => ({ ...r, pct: Math.round((r.count / Math.max(1, flagged)) * 100) }));

    // ---- weekly trend ----
    const buckets = [];
    for (let w = 4; w >= 0; w--) {
      const end = now - w * 7 * DAY;
      const start = end - 7 * DAY;
      const count = events.filter((e) => {
        const t = new Date(e.CreatedAt).getTime();
        return t > start && t <= end;
      }).length;
      const s = new Date(start + DAY), e2 = new Date(end);
      const label = `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}-${e2.getDate()}`;
      buckets.push({ label, count, amt: 0 });
    }

    return {
      runAt,
      windowDays: WINDOW,
      weekDays: WEEK,
      recipientLabel: 'Taiwo & Ali',
      kpis: {
        flagged, recovered, recoveredPct: Math.round((recovered / Math.max(1, flagged)) * 100),
        rescheduled, rescheduledPct: Math.round((rescheduled / Math.max(1, flagged)) * 100),
        outstanding, atRisk,
        settledCount: settled.n, settledAmt: Number(settled.amt) || 0,
        thisWeekFlagged: thisWeek.length,
        thisWeekRecovered: thisWeek.filter((r) => r.recovered).length,
      },
      weekTrend: buckets,
      reasons,
      thisWeek,
      rollingMonth,
      recoveredList,
    };
  } finally {
    await sql.close();
  }
}

async function main() {
  if (ONLY_IF_NOON_CT) {
    const hourCT = parseInt(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago', hour: 'numeric', hour12: false,
    }).format(new Date()), 10);
    if (hourCT !== 12) {
      console.log(`[PaySimpleReport] --only-if-noon-ct: current Central hour is ${hourCT}, not 12 — skipping this firing.`);
      return;
    }
    console.log('[PaySimpleReport] --only-if-noon-ct: it is noon Central — proceeding.');
  }
  console.log(`[PaySimpleReport] window=${WINDOW}d week=${WEEK}d dry=${DRY} to=${RECIPIENTS.join(',')} cc=${CC.join(',') || '(none)'}`);
  const data = await loadData();
  console.log(`[PaySimpleReport] flagged=${data.kpis.flagged} paid=${data.kpis.recovered} rescheduled=${data.kpis.rescheduled} needsCall=${data.kpis.outstanding} atRisk=$${data.kpis.atRisk}`);

  const html = renderHtml(data).replace(/—/g, '-').replace(/–/g, '-');
  const text = renderText(data).replace(/—/g, '-').replace(/–/g, '-');

  // write HTML artifact
  const stamp = data.runAt.toISOString().slice(0, 10);
  const outDir = path.resolve(__dirname, '../../../docs/reports');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `paysimple-missed-payments-${stamp}.html`);
  fs.writeFileSync(outPath, html);
  console.log(`[PaySimpleReport] wrote ${outPath}`);

  if (DRY) { console.log('[PaySimpleReport] --dry: no email sent'); return; }

  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const subj = `[PaySimple Collections] ${data.kpis.outstanding} outstanding ($${data.kpis.atRisk.toLocaleString('en-US')}), ${data.kpis.thisWeekFlagged} new this week`;
  const r = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: RECIPIENTS.join(', '),
    cc: CC.length ? CC.join(', ') : undefined,
    subject: subj,
    text, html,
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false', Importance: 'high' },
  });
  console.log(`[PaySimpleReport] sent — Mandrill ${r.messageId}`);
}

main().catch((e) => { console.error('[PaySimpleReport] FATAL', e); process.exit(1); });
