// renderFamilyDashboardEmail
//
// Email-safe HTML renderer for the Family Dashboard - table-based,
// inline-styled, hex-colored, 600px-capped, same construction pattern as the
// retired renderFamilyBriefingEmail.js (Family Command Center) so it renders
// cleanly in Outlook desktop/web, Gmail, Apple Mail, and iOS Mail instead of
// relying on an attachment. Content is the new Family Dashboard sections
// (live Basecamp KPIs/health/pipeline) built from the compiled data object
// (see lib/familyDashboardData.js); sections still needing Calendar/Procare
// render as an honest "Coming Soon" list instead of fabricated content.
//
// Session originator: CC-20260803-p9r4 (reformat pass after Ali's review)

const C = {
  navy: '#1a365d',
  navyDeep: '#0f2540',
  gold: '#c9a55c',
  bg: '#f6f7fb',
  card: '#ffffff',
  line: '#e2e8f0',
  lineSoft: '#eef2f7',
  ink: '#0f172a',
  ink2: '#475569',
  muted: '#94a3b8',
  action: '#dc2626', actionSoft: '#fee2e2',
  ok: '#15803d', okSoft: '#dcfce7',
  info: '#0e7490', infoSoft: '#cffafe',
  warn: '#b45309', warnSoft: '#fef3c7',
};

const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sectionOpen(tag) {
  return `
<tr><td style="padding:9px 0 0 0">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${C.card};border:1px solid ${C.line};border-collapse:separate">
    <tr><td style="padding:22px 22px 20px 22px;font-family:${FONT};color:${C.ink}">
      <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:${C.ink2};font-weight:700;margin:0 0 4px 0">${esc(tag)}</div>`;
}
function sectionClose() {
  return `</td></tr></table>
</td></tr>`;
}
function hTitle(t, sub) {
  let out = `<div style="font-size:20px;font-weight:700;color:${C.ink};margin:0 0 ${sub ? '6px' : '14px'} 0;letter-spacing:-.01em;font-family:${FONT}">${esc(t)}</div>`;
  if (sub) out += `<div style="font-size:13px;color:${C.ink2};margin:0 0 16px 0;font-family:${FONT}">${esc(sub)}</div>`;
  return out;
}
function chip(label, bg, fg) {
  return `<span style="display:inline-block;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:2px 7px;background:${bg};color:${fg};margin-right:6px;font-family:${FONT}">${esc(label)}</span>`;
}
function tierColors(tier) {
  if (tier === 'overdue') return [C.actionSoft, C.action];
  if (tier === 'soon') return [C.warnSoft, C.warn];
  return [C.lineSoft, C.ink2];
}
function statusColors(status) {
  if (status === 'live') return [C.okSoft, C.ok];
  if (status === 'broken') return [C.actionSoft, C.action];
  return [C.warnSoft, C.warn];
}

// ----- HERO -----
function renderHero(data, d) {
  const dateLine = `${d.dayName}, ${d.monthName} ${d.day}, ${d.year}`;
  const overdueGood = data.kpis.overdue === 0;
  const badges = [
    overdueGood
      ? `<div style="background:rgba(21,128,61,0.28);border:1px solid #86efac;color:#ffffff;padding:6px 11px;font-size:12px;font-weight:600;font-family:${FONT}">&#10003; 0 overdue</div>`
      : `<div style="background:rgba(180,83,9,0.28);border:1px solid #fcd34d;color:#ffffff;padding:6px 11px;font-size:12px;font-weight:600;font-family:${FONT}">${data.kpis.overdue} overdue</div>`,
    `<div style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.4);color:#ffffff;padding:6px 11px;font-size:12px;font-weight:600;font-family:${FONT}">${data.kpis.dueThisWeek} due this week</div>`,
    `<div style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.4);color:#ffffff;padding:6px 11px;font-size:12px;font-weight:600;font-family:${FONT}">${data.kpis.newSinceYesterday} new since yesterday</div>`,
    `<div style="background:rgba(14,116,144,0.28);border:1px solid #67e8f9;color:#ffffff;padding:6px 11px;font-size:12px;font-weight:600;font-family:${FONT}">${data.kpis.sourcesConnected} of ${data.kpis.sourcesTotal} sources live</div>`,
  ];
  return `
<tr><td style="padding:0">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.navy}" style="background:${C.navy};border-collapse:separate">
    <tr><td style="padding:28px 28px 24px 28px;font-family:${FONT};color:#ffffff">
      <div style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${C.gold};background:rgba(201,165,92,0.12);padding:5px 10px;border:1px solid ${C.gold}">Colaberry Family Ops &middot; Weekdays 5:00 AM CT</div>
      <div style="font-size:28px;font-weight:700;color:#ffffff;margin:14px 0 6px 0;letter-spacing:-.02em;line-height:1.2">Family Dashboard</div>
      <div style="font-size:14px;color:#cbd5e1;margin:0 0 18px 0">${esc(dateLine)}</div>
      <div style="font-size:16px;line-height:1.55;color:#e2e8f0;margin:0 0 16px 0">
        Everything that changed in the family Basecamp overnight, in one email. Sections marked <strong style="color:#ffffff">Live</strong> below are real data pulled this morning; sections marked <strong style="color:#ffffff">Planned</strong> are reserved for Calendar/Procare once wired in.
      </div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        ${badges.map((b, i) => `<td style="padding-right:${i < badges.length - 1 ? '6px' : '0'}">${b}</td>`).join('')}
      </tr></table>
    </td></tr>
  </table>
</td></tr>`;
}

// ----- KPI STAT CARDS (3-up, two rows) -----
function statCard(label, value, sub) {
  return `<td width="33%" valign="top" style="background:#fafbff;border:1px solid ${C.line};padding:12px 14px;font-family:${FONT}">
    <div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:${C.ink2};font-weight:700">${esc(label)}</div>
    <div style="font-size:22px;font-weight:700;color:${C.ink};margin-top:4px">${esc(value)}</div>
    ${sub ? `<div style="font-size:11px;color:${C.muted};margin-top:2px">${esc(sub)}</div>` : ''}
  </td>`;
}
function renderKpis(data) {
  let out = sectionOpen('KPI Dashboard');
  out += hTitle('At a glance', 'Five numbers that summarize the whole email.');
  out += `<table role="presentation" cellpadding="0" cellspacing="6" border="0" width="100%" style="border-collapse:separate">
    <tr>
      ${statCard('Due This Week', String(data.kpis.dueThisWeek), `across ${data.basecampHealth.length} lists`)}
      ${statCard('Overdue', String(data.kpis.overdue), data.kpis.overdue === 0 ? 'nothing overdue' : 'needs a reschedule')}
      ${statCard('New Since Yesterday', String(data.kpis.newSinceYesterday), 'created in last 24h')}
    </tr>
  </table>
  <table role="presentation" cellpadding="0" cellspacing="6" border="0" width="100%" style="border-collapse:separate;margin-top:6px">
    <tr>
      ${statCard('Money Pending', `$${data.kpis.moneyPendingTotal.toFixed(2)}`, `${data.moneyItems.length} ticket(s)`)}
      ${statCard('Sources Live', `${data.kpis.sourcesConnected} / ${data.kpis.sourcesTotal}`, 'see Data Pipeline below')}
      <td width="33%"></td>
    </tr>
  </table>`;
  out += sectionClose();
  return out;
}

// ----- THIS WEEK (7-column ticket-load grid, reuses the FCC day-cell pattern) -----
function dayCell({ dow, dnum, count, today }) {
  const border = today ? `border:2px solid ${C.navy}` : `border:1px solid ${C.line}`;
  const countHtml = count > 0
    ? `<div style="font-size:15px;font-weight:700;padding:4px 6px;background:${C.warnSoft};color:${C.warn};margin-top:4px;line-height:1.25;font-family:${FONT};text-align:center">${count}</div>`
    : `<div style="font-size:10.5px;color:${C.muted};margin-top:6px;font-style:italic;font-family:${FONT}">&mdash;</div>`;
  return `<td valign="top" width="14.28%" style="${border};background:#ffffff;padding:8px;vertical-align:top">
    <div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:${C.ink2};font-weight:700;font-family:${FONT}">${esc(dow)}</div>
    <div style="font-size:16px;font-weight:700;color:${today ? C.navy : C.ink};line-height:1.1;font-family:${FONT}">${esc(String(dnum))}</div>
    ${countHtml}
  </td>`;
}
function renderWeekLoad(data) {
  let out = sectionOpen('This Week');
  out += hTitle('Basecamp ticket load', 'Family tickets due each day. Source: Family Goals & Life Planning, bucket 33392153.');
  out += `<table role="presentation" cellpadding="0" cellspacing="2" border="0" width="100%" style="border-collapse:separate"><tr>
    ${data.weekLoad.map((d) => dayCell({ dow: d.dow, dnum: d.date.split(' ')[1], count: d.due, today: d.today })).join('')}
  </tr></table>`;
  out += sectionClose();
  return out;
}

// ----- BASECAMP HEALTH (table) -----
function renderHealth(data) {
  let out = sectionOpen('Where the Open Work Lives');
  out += hTitle('Family Basecamp health', 'Open tickets by list, earliest due date.');
  out += `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:13.5px;font-family:${FONT};border-collapse:collapse">
    <tr style="border-bottom:2px solid ${C.line}">
      <th align="left" style="padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:${C.ink2};font-weight:700">List</th>
      <th align="left" style="padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:${C.ink2};font-weight:700">Open</th>
      <th align="left" style="padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:${C.ink2};font-weight:700">Earliest due</th>
    </tr>
    ${data.basecampHealth.map((r) => {
      const [bg, fg] = tierColors(r.tier);
      return `<tr><td style="padding:10px;border-bottom:1px solid ${C.lineSoft}"><a href="${r.url}" style="color:${C.navy};text-decoration:none">${esc(r.list)}</a></td><td style="padding:10px;border-bottom:1px solid ${C.lineSoft}">${r.open}</td><td style="padding:10px;border-bottom:1px solid ${C.lineSoft}">${chip(r.dueLabel, bg, fg)}</td></tr>`;
    }).join('')}
  </table>`;
  out += sectionClose();
  return out;
}

// ----- NEW SINCE YESTERDAY (reuses FCC changeRow pattern) -----
function changeRow({ title, meta, url }) {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fafbff;border:1px solid ${C.line};margin-bottom:10px">
  <tr>
    <td width="88" valign="top" style="padding:14px 0 14px 14px">
      <div style="display:inline-block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;padding:4px 8px;background:${C.okSoft};color:${C.ok};font-family:${FONT}">New</div>
    </td>
    <td valign="top" style="padding:14px 14px 14px 12px;font-family:${FONT}">
      <div style="font-size:14px;font-weight:600;color:${C.ink};margin:0 0 2px 0"><a href="${url}" style="color:${C.ink};text-decoration:none">${esc(title)}</a></div>
      <div style="font-size:12px;color:${C.ink2}">${esc(meta)}</div>
    </td>
  </tr>
</table>`;
}
function renderNewSince(data) {
  let out = sectionOpen('Overnight');
  out += hTitle('New since yesterday', 'Tickets created in the family project in the last 24 hours.');
  if (data.newSinceYesterday.length) {
    out += data.newSinceYesterday.map((r) => changeRow(r)).join('');
  } else {
    out += `<div style="font-size:13px;color:${C.muted};font-family:${FONT}">Nothing new in the last 24 hours.</div>`;
  }
  out += sectionClose();
  return out;
}

// ----- MONEY -----
function renderMoney(data) {
  let out = sectionOpen('Money');
  out += hTitle('Reconciliation & money tickets', 'Any open family ticket with a dollar amount in its title or notes.');
  if (data.moneyItems.length) {
    out += data.moneyItems.map((m) => changeRow({ title: `${m.title}${m.amount ? ` (${m.amount})` : ''}`, meta: m.listName, url: m.url })).join('');
  } else {
    out += `<div style="font-size:13px;color:${C.muted};font-family:${FONT}">Nothing pending right now.</div>`;
  }
  out += sectionClose();
  return out;
}

// ----- DATA PIPELINE (status table instead of Mermaid, which can't render in email) -----
function renderPipeline(data) {
  let out = sectionOpen('Under the Hood');
  out += hTitle('Data pipeline', 'What feeds this email today, and what is next.');
  out += `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:13.5px;font-family:${FONT};border-collapse:collapse">
    ${data.sources.map((s) => {
      const [bg, fg] = statusColors(s.status);
      return `<tr><td style="padding:10px 10px 10px 0;border-bottom:1px solid ${C.lineSoft};font-weight:600;color:${C.ink}">${esc(s.name)}</td><td style="padding:10px;border-bottom:1px solid ${C.lineSoft}">${chip(s.status, bg, fg)}</td><td style="padding:10px 0 10px 10px;border-bottom:1px solid ${C.lineSoft};color:${C.ink2};font-size:12.5px">${esc(s.detail)}</td></tr>`;
    }).join('')}
  </table>`;
  out += sectionClose();
  return out;
}

// ----- RISKS (reuses FCC riskItem pattern) -----
function riskItem({ title, sub }) {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${C.actionSoft.replace(')', ')')};background:#fff5f5;border:1px solid #fecaca;margin-bottom:10px">
  <tr>
    <td width="40" valign="top" style="padding:14px 0 14px 14px;font-size:18px;text-align:center;font-weight:700;color:${C.action};font-family:${FONT}">!</td>
    <td valign="top" style="padding:14px 14px 14px 8px;font-family:${FONT}">
      <div style="font-size:14.5px;font-weight:600;color:${C.ink};margin:0 0 2px 0">${esc(title)}</div>
      <div style="font-size:12.5px;color:${C.ink2};line-height:1.45">${esc(sub)}</div>
    </td>
  </tr>
</table>`;
}
function renderRisks(data) {
  let out = sectionOpen('Watch List');
  out += hTitle('Risks & flags', 'Anything that needs attention or is blocking the pipeline.');
  if (data.risks.length) {
    out += data.risks.map((r) => riskItem({ title: r.title, sub: r.detail })).join('');
  } else {
    out += `<div style="font-size:13px;color:${C.muted};font-family:${FONT}">No flags today.</div>`;
  }
  out += sectionClose();
  return out;
}

// ----- COMING SOON -----
const COMING_SOON = [
  { name: "Today's Snapshot & Conflicts", desc: 'Family events + work-calendar overlaps, from Google Calendar.' },
  { name: '7-Day Calendar Grid', desc: 'Family + kids events across the coming week.' },
  { name: 'Travel Countdown', desc: 'Confirmed trips pulled from calendar entries.' },
  { name: 'Weekly Recap', desc: 'One-paragraph roll-up of the last 7 days.' },
  { name: 'Photo Flashback', desc: 'Recent family photos surfaced from Gmail/Drive.' },
  { name: 'Procare Spend Trend', desc: 'Monthly school-charge history and projection.' },
];
function renderComingSoon() {
  let out = sectionOpen('Coming Next');
  out += hTitle('Coming soon', 'These sections lived in the old 6 AM Family Command Center email. They move here once Calendar/Procare are wired in.');
  out += `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    ${COMING_SOON.map((c) => `<tr><td style="padding:8px 0;border-bottom:1px solid ${C.lineSoft};font-family:${FONT}">
      <div style="font-size:13.5px;font-weight:600;color:${C.ink}">${esc(c.name)}</div>
      <div style="font-size:12px;color:${C.ink2};margin-top:2px">${esc(c.desc)}</div>
    </td></tr>`).join('')}
  </table>`;
  out += sectionClose();
  return out;
}

// ----- FOOTER -----
function renderFooter(d) {
  return `
<tr><td style="padding:32px 16px 16px 16px;text-align:center;font-family:${FONT}">
  <div style="font-size:11px;color:${C.muted};line-height:1.6">
    <strong style="color:${C.ink2}">Family Dashboard</strong><br/>
    Generated ${esc(d.dayName)} ${esc(d.monthName)} ${esc(String(d.day))}, ${esc(String(d.year))} &middot; Sources: Basecamp (live), Hotmail/MS Graph (reachability checked live), Google Calendar + Procare (planned).<br/>
    Reply to ali@colaberry.com to adjust.
  </div>
</td></tr>`;
}
function renderTopBanner(d) {
  const today = `${d.dayName} ${d.monthName} ${d.day}, ${d.year}`;
  return `
<tr><td bgcolor="${C.navy}" style="background:${C.navy};color:#ffffff;text-align:center;font-size:11px;padding:8px 12px;letter-spacing:.06em;font-family:${FONT}">
  Family Dashboard &middot; ${esc(today)} &middot; sent to Ali &amp; Addie
</td></tr>`;
}
function renderPreheader(data, d) {
  return `
<div style="display:none;font-size:1px;color:${C.bg};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">
  ${data.kpis.dueThisWeek} due this week, ${data.kpis.overdue} overdue, ${data.kpis.newSinceYesterday} new since yesterday. ${esc(d.dayName)} ${esc(d.monthName)} ${esc(String(d.day))} dashboard.
</div>`;
}

function renderFamilyDashboardEmail(data) {
  const now = new Date(data.generatedAt);
  const d = {
    dayName: now.toLocaleDateString('en-US', { weekday: 'long' }),
    monthName: now.toLocaleDateString('en-US', { month: 'long' }),
    day: now.getDate(),
    year: now.getFullYear(),
  };

  const body = [
    renderHero(data, d),
    renderKpis(data),
    renderWeekLoad(data),
    renderHealth(data),
    renderNewSince(data),
    renderMoney(data),
    renderPipeline(data),
    renderRisks(data),
    renderComingSoon(),
    renderFooter(d),
  ].join('\n');

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>Family Dashboard - ${esc(d.dayName)} ${esc(d.monthName)} ${esc(String(d.day))}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td, p, a, h1, h2, h3, h4, h5, h6, div, span { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:${FONT};color:${C.ink};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
${renderPreheader(data, d)}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.bg}" style="background:${C.bg}">
  ${renderTopBanner(d)}
  <tr><td align="center" style="padding:18px 8px 60px 8px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px">
      ${body}
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function renderFamilyDashboardEmailText(data) {
  return `Family Dashboard

Due this week: ${data.kpis.dueThisWeek}
Overdue: ${data.kpis.overdue}
New since yesterday: ${data.kpis.newSinceYesterday}
Money pending: $${data.kpis.moneyPendingTotal.toFixed(2)}
Data sources live: ${data.kpis.sourcesConnected} / ${data.kpis.sourcesTotal}
${data.risks.length ? `\nFlags: ${data.risks.map((r) => r.title).join('; ')}` : ''}

This is the HTML-only format. Open in a modern email client to see the full layout.

Reply to ali@colaberry.com to adjust.`;
}

module.exports = { renderFamilyDashboardEmail, renderFamilyDashboardEmailText };
