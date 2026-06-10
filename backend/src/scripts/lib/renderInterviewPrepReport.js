/* eslint-disable */
/**
 * renderInterviewPrepReport.js
 *
 * Pure renderer for the IPBC Interview Preparation management report.
 * Input is the object from lib/interviewPrepData.classify(); output { html, text }.
 *
 * EMAIL-SAFE BY DESIGN (same rules as renderPaysimpleReport.js): nested <table>
 * layout, inline hex colors, 640px cap, Arial fallback. No <style> blocks, no SVG,
 * no JS, no flex/grid. The scatter plot and the readiness heatmap are both rendered
 * as bgcolor-filled <td> grids so they survive Outlook/Gmail/Apple Mail identically.
 * A richer interactive Chart.js version is written to docs/reports/ as a browser
 * artifact by the runner; the email carries the static, always-renders version.
 */

const NAVY = '#0f1729';
const INK = '#1f2937';
const MUTE = '#6b7280';
const LINE = '#e5e7eb';
const PANEL = '#f4f6fa';
const RED = '#b91c1c';
const AMBER = '#b45309';
const GREEN = '#047857';
const BLUE = '#1d4ed8';
const GOLD = '#b8860b';
const TEAL = '#0e7490';

const TZ = 'America/Chicago';

// tier -> { color, label }
const TIER_META = {
  TODAY: { color: '#7c3aed', label: 'TODAY' },
  CRITICAL: { color: RED, label: 'CRITICAL' },
  IMMINENT: { color: '#c2410c', label: 'IMMINENT' },
  AT_RISK: { color: AMBER, label: 'AT RISK' },
  BEHIND: { color: '#a16207', label: 'BEHIND' },
  SOON: { color: BLUE, label: 'SOON' },
  ON_TRACK: { color: GREEN, label: 'ON TRACK' },
  SURVEY: { color: TEAL, label: 'SURVEY OWED' },
  DONE: { color: MUTE, label: 'DONE' },
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function shortDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: TZ });
}
function fullStamp(d) {
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: TZ, timeZoneName: 'short',
  });
}
function daysLabel(d) {
  if (d === 0) return 'Today';
  if (d > 0) return `in ${d}d`;
  return `${Math.abs(d)}d ago`;
}
function readinessColor(pct) {
  if (pct >= 70) return GREEN;
  if (pct >= 50) return BLUE;
  if (pct >= 30) return AMBER;
  return RED;
}
function pill(text, bg, fg) {
  return `<span style="display:inline-block;background:${bg};color:${fg};font-size:10px;font-weight:700;`
    + `padding:2px 8px;border-radius:3px;letter-spacing:.3px;white-space:nowrap;">${esc(text)}</span>`;
}
function tierPill(tier) {
  const m = TIER_META[tier] || TIER_META.ON_TRACK;
  return pill(m.label, m.color, '#fff');
}
function panel(title, inner) {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#ffffff;border:1px solid ${LINE};margin-top:14px;">
    <tr><td style="padding:14px 16px;">
      <div style="font-size:13px;font-weight:800;color:${NAVY};text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid ${NAVY};padding-bottom:7px;margin-bottom:11px;">${title}</div>
      ${inner}
    </td></tr>
  </table>`;
}

/* ---- KPI card row ---- */
function kpiCards(k) {
  const cards = [
    { label: 'Active Interviews', value: String(k.totalActive), sub: `${k.studentsCount} students · ${k.mentorsCount} mentors`, color: NAVY },
    { label: 'Today + Critical', value: String(k.criticalCount), sub: `${k.todayCount} interviewing today`, color: RED },
    { label: 'Survey Owed', value: String(k.surveyOwedCount), sub: 'post-interview, not logged', color: TEAL },
    { label: 'Avg Readiness', value: `${k.avgReadinessUpcoming}%`, sub: `${k.atRiskCount} under 50%`, color: readinessColor(k.avgReadinessUpcoming) },
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

/* ---- SCATTER: days-to-interview (X) vs readiness% (Y), as a bgcolor grid ----
 * Bottom-left = imminent + unprepared = the danger zone (tinted red). Each cell
 * shows the initials of students landing in that (time band x readiness band). */
const X_BANDS = [
  { label: '7d+ ago', test: (d) => d <= -7 },
  { label: '3-6 ago', test: (d) => d <= -3 && d > -7 },
  { label: '1-2 ago', test: (d) => d < 0 && d > -3 },
  { label: 'TODAY', test: (d) => d === 0 },
  { label: '1d', test: (d) => d === 1 },
  { label: '2d', test: (d) => d === 2 },
  { label: '3-4d', test: (d) => d >= 3 && d <= 4 },
  { label: '5-7d', test: (d) => d >= 5 && d <= 7 },
  { label: '8-14d', test: (d) => d >= 8 && d <= 14 },
  { label: '15d+', test: (d) => d >= 15 },
];
const Y_BANDS = [
  { label: '90-100', lo: 90, hi: 101 },
  { label: '70-89', lo: 70, hi: 90 },
  { label: '50-69', lo: 50, hi: 70 },
  { label: '30-49', lo: 30, hi: 50 },
  { label: '0-29', lo: 0, hi: 30 },
];
function initials(name) {
  const p = String(name || '').trim().split(/\s+/);
  return ((p[0] || '')[0] || '').toUpperCase() + ((p[1] || '')[0] || '').toUpperCase();
}
function scatterGrid(points) {
  const xi = (d) => X_BANDS.findIndex((b) => b.test(d));
  const yi = (y) => Y_BANDS.findIndex((b) => y >= b.lo && y < b.hi);
  // danger tint: low readiness + soon (cols TODAY..2d, bottom rows)
  const headCols = X_BANDS.map((b) =>
    `<td style="font-size:9px;color:${MUTE};text-align:center;padding:3px 1px;font-weight:700;${b.label === 'TODAY' ? 'background:#f3e8ff;' : ''}">${esc(b.label)}</td>`).join('');
  const rows = Y_BANDS.map((yb, ry) => {
    const cells = X_BANDS.map((xb, cx) => {
      const here = points.filter((p) => xi(p.x) === cx && yi(p.y) === ry);
      const soon = cx >= 3 && cx <= 5;     // TODAY..2d columns
      const past = cx < 3;                 // already happened
      const low = ry >= 3;                 // bottom two readiness bands
      let bg = '#ffffff';
      if (soon && low) bg = '#fde2e2';     // danger: imminent + unprepared
      else if (soon) bg = '#eef6ff';
      else if (past) bg = '#f0fbfa';       // survey-owed zone
      const dots = here.map((p) => {
        const c = (TIER_META[p.tier] || TIER_META.ON_TRACK).color;
        return `<span title="${esc(p.student)} · ${esc(p.company)}" style="display:inline-block;background:${c};color:#fff;font-size:9px;font-weight:700;border-radius:8px;padding:1px 4px;margin:1px;">${esc(initials(p.student))}</span>`;
      }).join('');
      return `<td style="border:1px solid ${LINE};background:${bg};height:30px;text-align:center;vertical-align:middle;">${dots}</td>`;
    }).join('');
    return `<tr>
      <td style="font-size:9px;color:${MUTE};text-align:right;padding:0 5px;white-space:nowrap;font-weight:700;">${esc(yb.label)}</td>
      ${cells}
    </tr>`;
  }).join('');
  return panel('Readiness vs. Time-to-Interview (the bottom-left red zone = act now)', `
    <div style="font-size:11px;color:${MUTE};margin-bottom:8px;">Y = preparation readiness % · X = days until the interview. A marker low and to the left is interviewing soon with little prep.</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="table-layout:fixed;">
      <tr><td style="width:46px;"></td>${headCols}</tr>
      ${rows}
    </table>
    <div style="font-size:10px;color:${MUTE};margin-top:8px;">
      ${tierPill('TODAY')} ${tierPill('CRITICAL')} ${tierPill('AT_RISK')} ${tierPill('ON_TRACK')} ${tierPill('SURVEY')}
    </div>`);
}

/* ---- HEATMAP: student x prep-signal, colored cells ---- */
function heatCell(label, color) {
  return `<td style="background:${color};color:#fff;font-size:11px;font-weight:700;text-align:center;padding:7px 4px;border:1px solid #ffffff;white-space:nowrap;">${esc(label)}</td>`;
}
function heatmap(rows) {
  // one row per active interview (cap to keep the email tight)
  const active = rows.filter((r) => r.stage !== 'COMPLETE').slice(0, 24);
  const header = ['Student / Target', 'When', 'Prep', 'Auto Mocks', 'Mentor Mock', 'Survey']
    .map((h, i) => `<td style="font-size:10px;font-weight:700;color:${MUTE};text-transform:uppercase;letter-spacing:.4px;padding:6px 6px;${i === 0 ? 'text-align:left;' : 'text-align:center;'}">${esc(h)}</td>`).join('');
  const body = active.map((r) => {
    const whenColor = r.days < 0 ? TEAL : r.days === 0 ? '#7c3aed' : r.days <= 2 ? RED : r.days <= 5 ? AMBER : GREEN;
    const prepColor = readinessColor(r.prepScore);
    const autoColor = r.autoMocks >= 2 ? GREEN : r.autoMocks === 1 ? AMBER : RED;
    const mentorColor = r.mentorMocks >= 1 ? GREEN : RED;
    const surveyColor = r.days < 0 ? (r.hasSurvey ? GREEN : RED) : '#cbd5e1';
    const surveyLabel = r.days < 0 ? (r.hasSurvey ? 'Done' : 'Owed') : '—';
    return `<tr>
      <td style="padding:6px 6px;border-bottom:1px solid ${LINE};">
        <div style="font-size:13px;font-weight:700;color:${NAVY};">${esc(r.student)}</div>
        <div style="font-size:11px;color:${MUTE};">${esc(r.company)} · ${esc(r.jobTitle)}</div>
      </td>
      ${heatCell(daysLabel(r.days), whenColor)}
      ${heatCell(`${r.prepScore}%`, prepColor)}
      ${heatCell(String(r.autoMocks), autoColor)}
      ${heatCell(r.mentorMocks >= 1 ? '✓' : '0', mentorColor)}
      ${heatCell(surveyLabel, surveyColor)}
    </tr>`;
  }).join('');
  return panel('Preparation Heatmap — green is good, red is the gap to close', `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>${header}</tr>
      ${body}
    </table>
    <div style="font-size:10px;color:${MUTE};margin-top:8px;">Auto Mocks: red 0 · amber 1 · green 2+. Mentor Mock: the instructor gate before the real interview. Survey: owed once the interview date passes.</div>`);
}

/* ---- priority interview card ---- */
function interviewCard(r) {
  const m = TIER_META[r.tier] || TIER_META.ON_TRACK;
  const rColor = readinessColor(r.readinessPct);
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid ${LINE};border-left:4px solid ${m.color};margin-bottom:8px;background:#ffffff;">
    <tr><td style="padding:11px 13px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
        <td valign="top">
          <span style="font-size:15px;font-weight:800;color:${NAVY};">${esc(r.student)}</span>
          <span style="font-size:12px;color:${MUTE};">&nbsp;&middot;&nbsp;${esc(r.company)} — ${esc(r.jobTitle)}</span>
        </td>
        <td valign="top" align="right">${tierPill(r.tier)}</td>
      </tr></table>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:8px;">
        <tr>
          <td width="55%" valign="top" style="font-size:12px;color:${INK};line-height:1.7;">
            <div>${esc(r.type)} interview &middot; <b style="color:${r.days <= 2 && r.days >= 0 ? RED : INK};">${esc(shortDate(r.interviewISO))}</b> <span style="background:#f3f4f6;color:${INK};padding:1px 6px;font-size:11px;">${esc(daysLabel(r.days))}</span></div>
            <div style="color:${MUTE};">Mentor: ${esc(r.mentor || 'Unassigned')}${r.recruiter ? ` &middot; Recruiter: ${esc(r.recruiter)}` : ''}</div>
          </td>
          <td width="45%" valign="top" style="font-size:12px;color:${INK};line-height:1.7;">
            <div>Readiness <b style="color:${rColor};">${r.readinessPct}%</b> &middot; Prep ${r.prepScore}%</div>
            <div style="color:${MUTE};">Auto mocks: <b style="color:${r.autoMocks >= 2 ? GREEN : r.autoMocks === 1 ? AMBER : RED};">${r.autoMocks}</b> &middot; Mentor mock: <b style="color:${r.mentorMocks >= 1 ? GREEN : RED};">${r.mentorMocks >= 1 ? 'done' : 'none'}</b></div>
          </td>
        </tr>
      </table>

      <div style="margin-top:8px;padding-top:7px;border-top:1px dashed ${LINE};font-size:12px;color:${INK};">
        ${pill('NEXT STEP', m.color, '#fff')} &nbsp;<b>${esc(r.next.action)}</b>${r.next.detail ? `<div style="font-size:11px;color:${MUTE};margin-top:3px;">${esc(r.next.detail)}</div>` : ''}
      </div>
    </td></tr>
  </table>`;
}

/* ---- mentor coaching-load rollup ---- */
function mentorRollup(mentors) {
  if (!mentors.length) return '';
  const rows = mentors.map((m) => `
    <tr style="border-bottom:1px solid ${LINE};">
      <td style="padding:7px 8px;font-size:13px;font-weight:700;color:${NAVY};">${esc(m.mentor)}</td>
      <td style="padding:7px 8px;font-size:12px;color:${INK};text-align:center;">${m.count}</td>
      <td style="padding:7px 8px;text-align:center;">${m.critical ? pill(String(m.critical), RED, '#fff') : `<span style="color:${MUTE};">0</span>`}</td>
      <td style="padding:7px 8px;text-align:center;">${m.surveyOwed ? pill(String(m.surveyOwed), TEAL, '#fff') : `<span style="color:${MUTE};">0</span>`}</td>
      <td style="padding:7px 8px;text-align:center;font-weight:700;color:${readinessColor(m.avgReadiness)};">${m.avgReadiness}%</td>
    </tr>`).join('');
  return panel('Mentor Coaching Load', `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr style="background:${PANEL};">
        <td style="padding:6px 8px;font-size:11px;font-weight:700;color:${MUTE};">Mentor</td>
        <td style="padding:6px 8px;font-size:11px;font-weight:700;color:${MUTE};text-align:center;">Interviews</td>
        <td style="padding:6px 8px;font-size:11px;font-weight:700;color:${MUTE};text-align:center;">Critical</td>
        <td style="padding:6px 8px;font-size:11px;font-weight:700;color:${MUTE};text-align:center;">Survey Owed</td>
        <td style="padding:6px 8px;font-size:11px;font-weight:700;color:${MUTE};text-align:center;">Avg Readiness</td>
      </tr>
      ${rows}
    </table>`);
}

/* ---- survey nudge action block (mirrors the intern report's nudging section) ---- */
function surveyActionBlock(awaiting) {
  if (!awaiting.length) {
    return panel('Post-Interview Survey Queue', `<div style="font-size:13px;color:${GREEN};">All interviews to date have a survey on file. Nothing owed. 🎉</div>`);
  }
  const lis = awaiting.map((r) => `
    <tr>
      <td width="26" valign="top" style="font-size:13px;font-weight:800;color:#fff;background:${TEAL};text-align:center;padding:5px 0;">${Math.abs(r.days)}d</td>
      <td style="font-size:13px;color:${INK};line-height:1.5;padding:5px 0 11px 12px;">
        <b>${esc(r.student)}</b> &middot; ${esc(r.company)} — ${esc(r.jobTitle)}
        <span style="color:${MUTE};">(interviewed ${esc(shortDate(r.interviewISO))}, ${Math.abs(r.days)} days ago — no survey logged)</span>
        <div style="font-size:12px;color:${TEAL};margin-top:2px;">Action: open the interview in IPBC → <b>Send Survey link</b>, then congratulate + ask how it went.</div>
      </td>
    </tr>`).join('');
  return panel(`📋 Post-Interview Survey Queue — ${awaiting.length} owed (the "Send Survey link" button)`, `
    <div style="font-size:13px;color:${INK};line-height:1.6;margin-bottom:10px;">
      These interviews have passed with no post-interview survey on file. On the IPBC <i>Logged Interviews</i> page each row has a <b>Send Survey link</b> button. Once the nudge engine is live it congratulates the student one day after the interview and pushes the survey automatically; until then this is the manual queue, longest-waiting first:
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${lis}</table>`);
}

/* ---- combined nudge plan (folded in so Ali gets ONE interview email) ---- */
function nudgePlanBlock(plan, mode) {
  if (!plan || !plan.length) {
    return panel('Today’s Student Nudges', `<div style="font-size:13px;color:${MUTE};">No student nudges due today.</div>`);
  }
  const modePill = mode === 'live'
    ? pill('LIVE · students emailed', GREEN, '#fff')
    : pill('PREVIEW · not sent', AMBER, '#fff');
  const rows = plan.map((x) => {
    const p = x.person; const c = x.combined;
    const recips = p.emails.length ? p.emails.join(', ') : 'email unresolved';
    return `<tr style="border-bottom:1px solid ${LINE};">
      <td style="padding:7px 9px;font-size:13px;"><b style="color:${NAVY};">${esc(p.name)}</b><br><span style="color:${MUTE};font-size:11px;">${c.count} interview${c.count === 1 ? '' : 's'} combined into 1 email · ${esc(recips)}</span></td>
      <td style="padding:7px 9px;font-size:11px;text-align:center;color:${INK};">${c.beats.map((b) => `<span style="display:inline-block;background:#eef2ff;color:${BLUE};padding:1px 6px;border-radius:3px;margin:1px;">${esc(b)}</span>`).join('')}</td>
      <td style="padding:7px 9px;font-size:12px;color:${INK};">${esc(c.subject)}</td>
    </tr>`;
  }).join('');
  return panel(`📣 Today’s Student Nudges — ${plan.length} combined email${plan.length === 1 ? '' : 's'} ${''}`, `
    <div style="font-size:13px;color:${INK};line-height:1.6;margin-bottom:10px;">
      ${modePill} &nbsp;One email per student, de-duplicated across every interview and IPBC account they have (no student gets a separate message per interview). ${mode === 'live' ? 'These were emailed to students today.' : 'In preview nothing is sent; flip the nudge engine to live to start sending these.'}
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr style="background:${PANEL};">
        <td style="padding:6px 9px;font-size:11px;font-weight:700;color:${MUTE};">Student (combined)</td>
        <td style="padding:6px 9px;font-size:11px;font-weight:700;color:${MUTE};text-align:center;">Steps pushed</td>
        <td style="padding:6px 9px;font-size:11px;font-weight:700;color:${MUTE};">Email subject</td>
      </tr>
      ${rows}
    </table>`);
}

function renderHtml(data, opts = {}) {
  const k = data.kpis;
  const priority = data.rows.filter((r) => r.stage !== 'COMPLETE');
  const topPriority = priority.slice(0, 12);

  const body = `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PANEL};padding:0;margin:0;">
    <tr><td align="center" style="padding:18px 10px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" style="width:640px;max-width:640px;font-family:Arial,Helvetica,sans-serif;">

        <tr><td style="background:${NAVY};padding:22px 22px;">
          <div style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:${GOLD};font-weight:700;">Colaberry &middot; IPBC Placement</div>
          <div style="font-size:23px;font-weight:800;color:#ffffff;margin-top:5px;line-height:1.15;">Interview Prep — Priority &amp; Readiness</div>
          <div style="font-size:12px;color:#aebbd4;margin-top:5px;">Upcoming interviews ranked by urgency &times; preparation &middot; ${esc(fullStamp(data.runAt))}</div>
        </td></tr>

        <tr><td style="padding:16px 16px 6px;">
          ${kpiCards(k)}
          ${data.today.length ? panel(`🎯 Interviewing Today (${data.today.length})`, data.today.map(interviewCard).join('')) : ''}
          ${scatterGrid(data.scatter)}
          ${heatmap(data.rows)}

          ${panel(`Priority Queue — ${priority.length} active interview${priority.length === 1 ? '' : 's'} (most urgent + least prepared first)`,
            topPriority.length ? topPriority.map(interviewCard).join('')
              : `<div style="font-size:13px;color:${MUTE};">No active interviews in the pipeline right now.</div>`)}

          ${surveyActionBlock(data.awaitingSurvey)}
          ${nudgePlanBlock(opts.nudgePlan, opts.nudgeMode)}
          ${mentorRollup(data.mentorRollup)}
        </td></tr>

        <tr><td style="padding:14px 18px 26px;">
          <div style="border-top:1px solid ${LINE};padding-top:12px;font-size:11px;color:${MUTE};line-height:1.6;">
            <b style="color:${INK};">How priority is computed.</b> Readiness blends the IPBC Preparation score (45%), Auto Mock interviews taken (30%, target 3), and whether the instructor mock is done (25%). Urgency tiers combine days-to-interview with readiness: anything inside 2 days under 60% readiness is CRITICAL.<br/>
            <b style="color:${INK};">Funnel.</b> Logged → review the 10 questions → draft answers → Auto Mock (repeat) → mentor mock → interview → post-interview survey. Each report names the single next step per student.<br/>
            <b style="color:${INK};">Source.</b> CCPP <i>vw_ColaberryInterviewPreparation_UpcomingInterviews</i>, live. All times US Central. Generated ${esc(fullStamp(data.runAt))}.
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>`;

  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body style="margin:0;padding:0;background:${PANEL};">${body}</body></html>`;
}

function renderText(data) {
  const k = data.kpis;
  const line = (r) => `  - [${(TIER_META[r.tier] || {}).label || r.tier}] ${r.student} | ${r.company} - ${r.jobTitle} | ${shortDate(r.interviewISO)} (${daysLabel(r.days)}) | readiness ${r.readinessPct}% prep ${r.prepScore}% auto ${r.autoMocks} mentor ${r.mentorMocks >= 1 ? 'Y' : 'N'} | NEXT: ${r.next.action}`;
  const priority = data.rows.filter((r) => r.stage !== 'COMPLETE');
  return [
    `INTERVIEW PREP — PRIORITY & READINESS`,
    ``,
    `Active: ${k.totalActive} | Today+Critical: ${k.criticalCount} (${k.todayCount} today) | Survey owed: ${k.surveyOwedCount} | Avg readiness: ${k.avgReadinessUpcoming}% (${k.atRiskCount} under 50%)`,
    ``,
    `PRIORITY QUEUE:`,
    ...priority.slice(0, 20).map(line),
    ``,
    `SURVEY OWED (post-interview, not logged):`,
    ...data.awaitingSurvey.map((r) => `  - ${r.student} | ${r.company} | interviewed ${shortDate(r.interviewISO)} (${Math.abs(r.days)}d ago) → Send Survey link`),
    ``,
    `Generated ${fullStamp(data.runAt)} from CCPP vw_ColaberryInterviewPreparation_UpcomingInterviews.`,
  ].join('\n');
}

module.exports = { renderHtml, renderText };
