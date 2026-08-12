// renderInternDeliveryEmail.js
//
// Email edition of the Intern Delivery Command Center.
//
// Same snapshot in as renderInternDeliveryDashboard.js, different output medium.
// The browser dashboard is interactive: Chart.js, Mermaid, a drill-through
// drawer, client-side sort and filter. None of that survives an inbox, so this
// renderer answers the same questions with static equivalents:
//
//   interactive drawer  -> the decision queue is inlined, every row deep-linked
//   Chart.js mix chart  -> proportional bars built from nested tables
//   Chart.js momentum   -> block-glyph sparklines
//   Mermaid gantt       -> projected-finish column on the attention list
//   sort/filter/search  -> a fixed, opinionated order: what is blocked, first
//
// Pure function of the snapshot. No network, no clock reads beyond the
// snapshot's own generatedAt, so the same snapshot always renders the same
// email (idempotency, per CLAUDE.md).
//
// Size discipline matters here: Gmail clips a message over ~102KB and hides the
// tail behind a "View entire message" link. The caps below (questions, gates,
// attention cards) exist to hold the body well under that, and the send script
// hard-fails if a snapshot ever pushes it past the limit.

const {
  C, FONT, esc, excerpt, chip, toneColors, sectionOpen, sectionClose, hTitle,
  statCard, bar, sparkline, link, button, shell,
} = require('./emailLayoutKit');

// Caps. Every list this renderer emits is bounded, so the body size is a
// function of the caps rather than of how big the intern programme gets. That
// property matters: an unbounded list would sail past Gmail's clip threshold
// exactly when the portfolio grows, and the send would start hard-failing.
// Nothing is hidden by a cap, only rolled up: each capped list states what it
// left out, and the attached dashboard carries the complete record.
const QUESTION_LIMIT = 8;   // open questions shown in full
const GATE_LIMIT = 8;       // Ali's approval gates listed in full
const ATTENTION_LIMIT = 6;  // stalled/at-risk projects given a full card
const COMPACT_LIMIT = 20;   // remaining projects in the one-line list
const PEOPLE_LIMIT = 20;    // active people in the roster table
const EXCERPT_CHARS = 160;  // per-question quote from the Basecamp thread

function plural(n, word, pluralForm) {
  return n === 1 ? word : (pluralForm || word + 's');
}

// Basecamp comments carry "@Ali Muwwakkil" mentions. In a briefing addressed to
// Ali the full name reads oddly anyway, and the send-side preflight treats a
// second "Ali Muwwakkil" as a duplicated signature and blocks the send. Both
// problems go away by leaving the full name to the signature alone.
function deName(s) {
  return String(s).replace(/@?Ali Muwwakkil/g, 'Ali');
}

function centralLabel(iso) {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Chicago' });
}

function shortDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
}

function deltaText(d) {
  if (!d || d.kind === 'flat' || d.value === 0) return 'no change';
  return `${d.value > 0 ? 'up' : 'down'} ${Math.abs(d.value)}%`;
}

function seen(days) {
  if (days == null) return 'never';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

// ---------------------------------------------------------------- hero
function renderHero(data) {
  const p = data.portfolio;
  const questions = data.decisionQueue.filter((q) => q.kind === 'open_question');
  const gatesAli = data.decisionQueue.filter((q) => q.kind === 'approval_gate' && q.approver === 'Ali');
  const badge = (text, strong) => `<td style="padding-right:6px"><div style="background:rgba(255,255,255,${strong ? '0.18' : '0.08'});border:1px solid rgba(255,255,255,${strong ? '0.7' : '0.4'});color:#ffffff;padding:6px 11px;font-size:12px;font-weight:600;white-space:nowrap">${esc(text)}</div></td>`;

  return `
<tr><td style="padding:0">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.navy}" style="background:${C.navy};border-collapse:separate">
    <tr><td style="padding:28px 28px 24px 28px;color:#ffffff">
      <div style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${C.gold};background:rgba(201,165,92,0.12);padding:5px 10px;border:1px solid ${C.gold}">Colaberry &middot; Scrum call briefing</div>
      <div style="font-size:28px;font-weight:700;color:#ffffff;margin:14px 0 6px 0;letter-spacing:-.02em;line-height:1.2">Every intern, every project, one email</div>
      <div style="font-size:14px;color:#cbd5e1;margin:0 0 18px 0">${esc(centralLabel(data.generatedAt))} Central</div>
      <div style="font-size:16px;line-height:1.55;color:#e2e8f0;margin:0 0 16px 0">
        The state of all intern delivery across the Internship / Apprenticeship programme and the Gov Contracts push. Start at "Needs your call" and work down.
      </div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        ${badge(`${questions.length} ${plural(questions.length, 'question')} waiting on you`, true)}
        ${badge(`${gatesAli.length} approval ${plural(gatesAli.length, 'gate')} open`, true)}
        ${badge(`${p.peopleReporting} of ${p.peopleActive} reported in`)}
      </tr><tr><td colspan="3" style="height:6px;font-size:0;line-height:0">&nbsp;</td></tr><tr>
        ${badge(`${p.projectsTotal} projects`)}
        ${badge(`${p.taskDone} / ${p.taskTotal} tasks closed`)}
        ${badge(`${p.byStatus.STALLED} stalled`)}
      </tr></table>
    </td></tr>
  </table>
</td></tr>`;
}

// ------------------------------------------------- 01. needs your call
function queueRow(q, tone) {
  const meta = [];
  if (q.askedBy) meta.push(`${q.askedBy} asked`);
  if (q.ageDays != null) meta.push(`${q.ageDays}d old`);
  if (q.projectName) meta.push(q.projectName);
  const target = q.answerUrl || q.url || q.projectUrl;

  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fafbff;border:1px solid ${C.line};border-left:3px solid ${tone === 'risk' ? C.action : C.warn};margin-bottom:10px">
  <tr><td style="padding:13px 14px">
    <div style="font-size:14px;font-weight:700;color:${C.ink};line-height:1.4;margin-bottom:4px">${esc(q.title)}</div>
    ${q.whyItMatters ? `<div style="font-size:12.5px;color:${C.action};line-height:1.45;margin-bottom:5px">${esc(q.whyItMatters)}</div>` : ''}
    ${q.rawText ? `<div style="font-size:12.5px;color:${C.ink2};line-height:1.5;margin-bottom:7px">${excerpt(q.rawText, EXCERPT_CHARS)}</div>` : ''}
    <div style="font-size:11.5px;color:${C.muted}">${esc(meta.join(' · '))}</div>
    ${target ? `<div style="margin-top:8px">${link(target, 'Answer in Basecamp →')}</div>` : ''}
  </td></tr>
</table>`;
}

function gateRow(g) {
  const target = g.url || g.projectUrl;
  return `<tr>
    <td style="padding:9px 8px 9px 0;border-bottom:1px solid ${C.lineSoft};font-size:13px;color:${C.ink};line-height:1.4">
      ${target ? link(target, g.title, C.ink) : esc(g.title)}
      <div style="font-size:11.5px;color:${C.muted};margin-top:2px">${esc(g.projectName || '')}</div>
    </td>
    <td width="58" align="right" style="padding:9px 0;border-bottom:1px solid ${C.lineSoft};white-space:nowrap">${chip(`${g.ageDays}d`, g.ageDays >= 21 ? 'risk' : 'warning')}</td>
  </tr>`;
}

function renderNeedsYourCall(data) {
  const questions = data.decisionQueue.filter((q) => q.kind === 'open_question');
  const gatesAli = data.decisionQueue.filter((q) => q.kind === 'approval_gate' && q.approver === 'Ali');
  const gatesRam = data.decisionQueue.filter((q) => q.kind === 'approval_gate' && q.approver === 'Ram');
  const oldest = questions.length ? Math.max(...questions.map((q) => q.ageDays || 0)) : 0;

  let out = sectionOpen('01 / Needs your call');
  out += hTitle('The one thing to do before the call', 'Every question and approval gate where work has stopped until you answer.');

  out += `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fff5f5;border:1px solid #fecaca;margin-bottom:18px">
    <tr><td style="padding:16px 18px">
      <div style="font-size:15px;line-height:1.55;color:${C.ink}">
        <b>${questions.length} ${plural(questions.length, 'question')} ${plural(questions.length, 'is', 'are')} waiting on you</b>, and ${gatesAli.length} approval ${plural(gatesAli.length, 'gate')} ${plural(gatesAli.length, 'is', 'are')} open in your name.
        These are the items where work has genuinely stopped until you answer. The oldest has been sitting for ${oldest} days.
      </div>
    </td></tr>
  </table>`;

  const shownQuestions = questions.slice(0, QUESTION_LIMIT);
  out += `<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:${C.action};margin:0 0 10px 0">Questions for you (${questions.length})</div>`;
  out += questions.length
    ? shownQuestions.map((q) => queueRow(q, q.urgency === 'high' ? 'risk' : 'warning')).join('')
    : `<div style="font-size:13px;color:${C.muted};margin-bottom:12px">Nothing waiting. That is a good sign.</div>`;
  if (questions.length > shownQuestions.length) {
    out += `<div style="font-size:12.5px;color:${C.muted};margin-top:-2px;margin-bottom:8px">and ${questions.length - shownQuestions.length} more ${plural(questions.length - shownQuestions.length, 'question')}, in the attached dashboard.</div>`;
  }

  if (gatesAli.length) {
    const shown = gatesAli.slice(0, GATE_LIMIT);
    const hidden = gatesAli.length - shown.length;
    out += `<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:${C.warn};margin:20px 0 8px 0">Your approval gates (${gatesAli.length})</div>`;
    out += `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">${shown.map(gateRow).join('')}</table>`;
    if (hidden > 0) {
      out += `<div style="font-size:12.5px;color:${C.muted};margin-top:8px">and ${hidden} more ${plural(hidden, 'gate')} in your name, all listed in the attached dashboard.</div>`;
    }
  }

  if (gatesRam.length) {
    out += `<div style="font-size:12.5px;color:${C.ink2};margin-top:18px;padding-top:14px;border-top:1px solid ${C.lineSoft};line-height:1.5">
      <b>${gatesRam.length} approval ${plural(gatesRam.length, 'gate')}</b> ${plural(gatesRam.length, 'is', 'are')} waiting on Ram, not you. Listed in the attached dashboard under "Ram's approval gates".
    </div>`;
  }

  out += `<div style="font-size:11.5px;color:${C.muted};margin-top:16px;line-height:1.5">A question lands here when someone asked it on a Basecamp task and you have not commented in that thread since. Answering in Basecamp is what clears it from the next run.</div>`;
  out += sectionClose();
  return out;
}

// ------------------------------------------------------- 02. KPI cards
function renderKpis(data) {
  const p = data.portfolio;
  const questions = data.decisionQueue.filter((q) => q.kind === 'open_question').length;
  const gates = data.decisionQueue.filter((q) => q.kind === 'approval_gate' && q.approver === 'Ali').length;

  const rows = [
    [
      statCard('Waiting on you', String(questions + gates), `${questions} ${plural(questions, 'question')} + ${gates} ${plural(gates, 'gate')}`, (questions + gates) > 0 ? 'risk' : 'good'),
      statCard('Reporting in', `${p.peopleReporting}/${p.peopleActive}`, `posted an update in ${data.lookbackDays} days`, 'accent'),
      statCard('Portfolio complete', `${p.percentComplete}%`, `${p.taskDone} of ${p.taskTotal} tasks closed`, 'info'),
    ],
    [
      statCard('Closed last 7 days', String(p.doneLast7), `vs ${p.donePrior7} prior week, ${deltaText(p.velocityDelta)}`, p.doneLast7 >= p.donePrior7 ? 'good' : 'warning'),
      statCard('Updates last 7 days', String(p.updatesLast7), `vs ${p.updatesPrior7} prior week, ${deltaText(p.cadenceDelta)}`, p.updatesLast7 >= p.updatesPrior7 ? 'good' : 'warning'),
      statCard('Stalled projects', String(p.byStatus.STALLED), 'no movement in 14+ days', p.byStatus.STALLED > 0 ? 'risk' : 'good'),
    ],
    [
      statCard('Past due tasks', String(p.overdueTotal), 'across all active projects', p.overdueTotal > 0 ? 'warning' : 'good'),
      statCard('Active projects', String(p.projectsActive), `of ${p.projectsTotal} tracked`, 'accent'),
      statCard('Dormant roster', String(p.peopleDormant), `of ${p.peopleTotal} holding assigned work`, 'neutral'),
    ],
  ];

  let out = sectionOpen('02 / Portfolio KPIs');
  out += hTitle('The headline numbers', 'The whole intern portfolio, with the week-over-week move on each.');
  out += rows.map((r, i) => `<table role="presentation" cellpadding="0" cellspacing="6" border="0" width="100%" style="border-collapse:separate${i ? ';margin-top:6px' : ''}"><tr>${r.join('')}</tr></table>`).join('');
  out += sectionClose();
  return out;
}

// -------------------------------------------------- 03. shape and momentum
function mixRow(label, count, total, tone) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  const [, fg] = toneColors(tone);
  return `<tr>
    <td width="96" style="padding:6px 8px 6px 0;font-size:13px;color:${C.ink};font-weight:600;white-space:nowrap">${esc(label)}</td>
    <td style="padding:6px 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.lineSoft}" style="background:${C.lineSoft};border-collapse:collapse"><tr>
      <td width="${Math.max(1, pct)}%" bgcolor="${fg}" style="background:${fg};height:14px;line-height:14px;font-size:0">&nbsp;</td>
      <td style="height:14px;line-height:14px;font-size:0">&nbsp;</td>
    </tr></table></td>
    <td width="42" align="right" style="padding:6px 0 6px 10px;font-size:13px;font-weight:700;color:${C.ink}">${count}</td>
  </tr>`;
}

function renderShape(data) {
  const p = data.portfolio;
  const total = p.projectsTotal;

  let out = sectionOpen('03 / Trends and mix');
  out += hTitle('Where the portfolio actually stands', 'Anything in the red or amber bands will not move without an intervention from you.');

  out += `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">
    ${mixRow('Stalled', p.byStatus.STALLED, total, 'risk')}
    ${mixRow('At risk', p.byStatus.AT_RISK, total, 'risk')}
    ${mixRow('Watch', p.byStatus.WATCH, total, 'warning')}
    ${mixRow('On track', p.byStatus.ON_TRACK, total, 'good')}
    ${mixRow('Complete', p.byStatus.COMPLETE, total, 'good')}
  </table>`;

  out += `<div style="margin-top:22px;padding-top:16px;border-top:1px solid ${C.lineSoft}">
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:${C.ink2};margin-bottom:10px">Momentum, last ${data.lookbackDays} days</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td width="110" style="font-size:12.5px;color:${C.ink2};padding:4px 0">Tasks closed</td>
        <td style="padding:4px 0">${sparkline(p.dailyCompletions, C.ok)}</td>
        <td align="right" style="font-size:12.5px;color:${C.ink};font-weight:700;padding:4px 0;white-space:nowrap">${p.doneLast7} in 7d</td>
      </tr>
      <tr>
        <td style="font-size:12.5px;color:${C.ink2};padding:4px 0">Updates posted</td>
        <td style="padding:4px 0">${sparkline(p.dailyUpdates, C.accent)}</td>
        <td align="right" style="font-size:12.5px;color:${C.ink};font-weight:700;padding:4px 0;white-space:nowrap">${p.updatesLast7} in 7d</td>
      </tr>
    </table>
    <div style="font-size:11.5px;color:${C.muted};margin-top:8px;line-height:1.5">Updates running well ahead of closures means talk outpacing delivery.</div>
  </div>`;

  out += `<div style="margin-top:22px;padding-top:16px;border-top:1px solid ${C.lineSoft}">
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:${C.ink2};margin-bottom:10px">By stream</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">
      ${p.byStream.map((s) => `<tr>
        <td style="padding:8px 8px 8px 0;font-size:13px;color:${C.ink};font-weight:600;border-bottom:1px solid ${C.lineSoft}">${esc(s.stream)}</td>
        <td width="70" align="right" style="padding:8px 10px 8px 0;font-size:12.5px;color:${C.ink2};border-bottom:1px solid ${C.lineSoft};white-space:nowrap">${s.projects} ${plural(s.projects, 'project')}</td>
        <td width="150" style="padding:8px 0;border-bottom:1px solid ${C.lineSoft}">${bar(s.taskTotal ? Math.round((s.taskDone / s.taskTotal) * 100) : null, null, 90)}</td>
        <td width="72" align="right" style="padding:8px 0;font-size:12px;color:${C.muted};border-bottom:1px solid ${C.lineSoft};white-space:nowrap">${s.taskDone}/${s.taskTotal}</td>
      </tr>`).join('')}
    </table>
  </div>`;

  out += sectionClose();
  return out;
}

// ------------------------------------------------------------ 04. people
function renderPeople(data) {
  const active = data.people.filter((p) => p.active)
    .sort((a, b) => a.statusRank - b.statusRank || (b.daysSinceUpdate || 0) - (a.daysSinceUpdate || 0));
  const dormant = data.people.filter((p) => !p.active);

  const th = (label, align) => `<th align="${align || 'left'}" style="padding:8px 8px 8px 0;font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:${C.ink2};font-weight:700;border-bottom:2px solid ${C.line};white-space:nowrap">${label}</th>`;

  const shown = active.slice(0, PEOPLE_LIMIT);

  let out = sectionOpen('04 / People');
  out += hTitle(`${active.length} people delivering`, `Everyone with an update or a closed task in the last ${data.lookbackDays} days, worst status first.`);
  out += `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">
    <tr>${th('Person')}${th('Status')}${th('Owned work')}${th('7d', 'right')}${th('Last seen', 'right')}</tr>
    ${shown.map((p) => `<tr>
      <td style="padding:10px 8px 10px 0;border-bottom:1px solid ${C.lineSoft};font-size:13px;font-weight:600;color:${C.ink}">${esc(p.name)}
        <div style="font-size:11px;color:${C.muted};font-weight:400;margin-top:2px">${p.projectCount} ${plural(p.projectCount, 'project')} &middot; ${esc(p.trajectory)}</div></td>
      <td style="padding:10px 8px 10px 0;border-bottom:1px solid ${C.lineSoft}">${chip(p.statusLabel, p.statusTone)}</td>
      <td style="padding:10px 8px 10px 0;border-bottom:1px solid ${C.lineSoft}">${bar(p.percentComplete, p.percentReason, 74)}</td>
      <td align="right" style="padding:10px 8px 10px 0;border-bottom:1px solid ${C.lineSoft};font-size:13px;color:${C.ink};font-weight:700">${p.doneLast7}</td>
      <td align="right" style="padding:10px 0;border-bottom:1px solid ${C.lineSoft};font-size:12px;color:${p.daysSinceUpdate >= 14 ? C.action : C.ink2};white-space:nowrap">${esc(seen(p.daysSinceUpdate))}</td>
    </tr>`).join('')}
  </table>`;
  const overflow = active.length - shown.length;
  out += `<div style="font-size:11.5px;color:${C.muted};margin-top:12px;line-height:1.5">${overflow > 0 ? `${overflow} further active ${plural(overflow, 'person', 'people')} did not fit here. ` : ''}${dormant.length} more people hold assigned work but have posted nothing and closed nothing in the window. Both groups are in the attached dashboard.</div>`;
  out += sectionClose();
  return out;
}

// ---------------------------------------------------------- 05. projects
function projectCard(p) {
  const flags = (p.riskFlags || []).slice(0, 4)
    .map((f) => `<span style="margin-right:5px;display:inline-block;margin-bottom:4px">${chip(f.label, f.tone)}</span>`).join('');
  const finish = p.projectedFinish ? shortDate(p.projectedFinish) : null;

  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fafbff;border:1px solid ${C.line};border-left:3px solid ${p.statusTone === 'risk' ? C.action : C.warn};margin-bottom:12px">
  <tr><td style="padding:14px 16px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      <td style="font-size:14px;font-weight:700;color:${C.ink};line-height:1.35;padding-right:8px">${link(p.url, p.name, C.ink)}</td>
      <td width="70" align="right" valign="top">${chip(p.statusLabel, p.statusTone)}</td>
    </tr></table>
    <div style="font-size:11.5px;color:${C.muted};margin:4px 0 9px 0">${esc(p.stream)} &middot; ${p.taskDone} of ${p.taskTotal} closed &middot; quiet ${p.daysSinceActivity}d${finish ? ` &middot; projected finish ${esc(finish)}` : ' &middot; no forecast'}</div>
    <div style="margin-bottom:9px">${bar(p.percentCalculable ? p.percentComplete : null, p.percentReason, 150)}</div>
    ${p.summary ? `<div style="font-size:12.5px;color:${C.ink2};line-height:1.5;margin-bottom:8px">${esc(p.summary)}</div>` : ''}
    ${p.nextAction ? `<div style="font-size:12.5px;color:${C.ink};line-height:1.5;margin-bottom:9px"><b>Next:</b> ${esc(p.nextAction)}</div>` : ''}
    ${flags ? `<div>${flags}</div>` : ''}
  </td></tr>
</table>`;
}

function renderProjects(data) {
  const rank = { STALLED: 0, AT_RISK: 1, WATCH: 2, ON_TRACK: 3, COMPLETE: 4, NOT_STARTED: 5 };
  const sorted = [...data.projects].sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || b.openGateCount - a.openGateCount);
  const attention = sorted.filter((p) => p.status === 'STALLED' || p.status === 'AT_RISK');
  const cards = attention.slice(0, ATTENTION_LIMIT);
  const rest = sorted.filter((p) => !cards.includes(p));

  let out = sectionOpen('05 / Project detail');
  out += hTitle(`${attention.length} projects need attention`, 'Stalled and at-risk work first, with the read and the next action on each.');
  out += cards.map(projectCard).join('');
  if (attention.length > cards.length) {
    out += `<div style="font-size:12.5px;color:${C.muted};margin:0 0 16px 0">and ${attention.length - cards.length} more at risk, in the compact list below.</div>`;
  }

  const restShown = rest.slice(0, COMPACT_LIMIT);
  out += `<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:${C.ink2};margin:20px 0 8px 0">Everything else (${rest.length})</div>`;
  out += `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">
    ${restShown.map((p) => `<tr>
      <td style="padding:8px 8px 8px 0;border-bottom:1px solid ${C.lineSoft};font-size:12.5px;color:${C.ink};line-height:1.4">${link(p.url, p.name, C.ink)}</td>
      <td width="66" align="right" style="padding:8px 8px 8px 0;border-bottom:1px solid ${C.lineSoft}">${chip(p.statusLabel, p.statusTone)}</td>
      <td width="52" align="right" style="padding:8px 0;border-bottom:1px solid ${C.lineSoft};font-size:12.5px;font-weight:700;color:${C.ink};white-space:nowrap">${p.percentCalculable ? Math.round(p.percentComplete) + '%' : '-'}</td>
    </tr>`).join('')}
  </table>`;
  if (rest.length > restShown.length) {
    out += `<div style="font-size:12.5px;color:${C.muted};margin-top:10px">and ${rest.length - restShown.length} more ${plural(rest.length - restShown.length, 'project')}, in the attached dashboard.</div>`;
  }
  out += sectionClose();
  return out;
}

// ------------------------------------------------------------ 06. method
function renderMethod(data) {
  const m = data.meta;
  const scope = m.scope.map((s) => `${s.label} (${s.bucketId})`).join(' and ');
  const defs = [
    ['Who appears', `Anyone assigned a task or posting an update in ${scope}. Ali, Ram, Jackie and the CB System and "+ai" twin accounts are excluded as staff or bots.`],
    ['Active', `Posted an update or closed a task in the last ${data.lookbackDays} days.`],
    ['Percent complete', 'Closed delivery tasks over total delivery tasks. Approval gates are excluded from the denominator, since those are yours to close, not theirs. Under two tasks reports "not calculable" rather than a misleading 0 or 100 percent.'],
    ['Status', 'Stalled: no activity in 14+ days. At Risk: quiet 7 to 13 days, or nothing closed in a fortnight. Watch: moving but with past-due tasks or a velocity drop over 50 percent. On Track: active and closing work. Complete: every task closed.'],
    ['Questions for you', `Found by rule: a comment from someone other than you carrying a question or blocked-on-you signal, where you have not replied in that thread since. ${m.narrativeMode === 'llm' ? `Screened by ${m.narrativeModel}; ${m.questionsScreenedOut || 0} were dropped as not genuinely yours.` : 'The model screen was unavailable on this run, so the list is unscreened.'}`],
    ['Data freshness', `Live read of the Basecamp API at ${centralLabel(data.generatedAt)} Central. ${m.commentCount} comments and ${data.portfolio.taskTotal} tasks across ${data.portfolio.projectsTotal} project lists.`],
  ];

  let out = sectionOpen('06 / How to read this');
  out += hTitle('Definitions and provenance', 'Every number above traces to a live Basecamp read. The model narrates, it never calculates.');
  out += `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">
    ${defs.map(([t, d]) => `<tr>
      <td width="130" valign="top" style="padding:9px 12px 9px 0;border-bottom:1px solid ${C.lineSoft};font-size:12px;font-weight:700;color:${C.ink}">${esc(t)}</td>
      <td valign="top" style="padding:9px 0;border-bottom:1px solid ${C.lineSoft};font-size:12px;color:${C.ink2};line-height:1.5">${esc(d)}</td>
    </tr>`).join('')}
  </table>
  <div style="margin-top:18px">${button('https://app.basecamp.com/3945211/projects/24865175', 'Open the Internship project')}</div>
  <div style="font-size:11.5px;color:${C.muted};margin-top:12px;line-height:1.5">The full interactive dashboard, with charts, the delivery timeline, the coverage matrix and per-person drill-through, is attached to this email as an HTML file. Open it in a browser.</div>`;
  out += sectionClose();
  return out;
}

function renderFooter(data) {
  return `
<tr><td style="padding:28px 16px 16px 16px;text-align:center">
  <div style="font-size:11px;color:${C.muted};line-height:1.6">
    <strong style="color:${C.ink2}">Intern Delivery Command Center</strong><br/>
    Generated ${esc(centralLabel(data.generatedAt))} Central from the live Basecamp API.<br/>
    Regenerate with buildInternDeliveryDashboard.js, then sendInternDeliveryEmail.js.
  </div>
</td></tr>`;
}

// ------------------------------------------------------------- compose
function renderInternDeliveryEmail(data) {
  const p = data.portfolio;
  const questions = data.decisionQueue.filter((q) => q.kind === 'open_question').length;
  const gates = data.decisionQueue.filter((q) => q.kind === 'approval_gate' && q.approver === 'Ali').length;
  const dateShort = new Date(data.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });

  const body = [
    renderHero(data),
    renderNeedsYourCall(data),
    renderKpis(data),
    renderShape(data),
    renderPeople(data),
    renderProjects(data),
    renderMethod(data),
    renderFooter(data),
  ].join('\n');

  const html = shell({
    title: `Intern Delivery Command Center - ${dateShort}`,
    preheaderText: `${questions} questions and ${gates} approval gates waiting on you. ${p.taskDone} of ${p.taskTotal} tasks closed (${p.percentComplete}%), ${p.byStatus.STALLED} projects stalled.`,
    banner: `Intern Delivery Command Center · ${dateShort} · scrum call briefing`,
    body: deName(body),
  });

  return {
    subject: `Intern Delivery: ${questions} ${plural(questions, 'question')} and ${gates} ${plural(gates, 'gate')} waiting on you (${dateShort})`,
    html,
    text: renderInternDeliveryEmailText(data),
  };
}

function renderInternDeliveryEmailText(data) {
  const p = data.portfolio;
  const questions = data.decisionQueue.filter((q) => q.kind === 'open_question');
  const gates = data.decisionQueue.filter((q) => q.kind === 'approval_gate' && q.approver === 'Ali');
  const attention = data.projects.filter((x) => x.status === 'STALLED' || x.status === 'AT_RISK');

  const lines = [
    'INTERN DELIVERY COMMAND CENTER',
    `${centralLabel(data.generatedAt)} Central`,
    '',
    'NEEDS YOUR CALL',
    `${questions.length} questions waiting on you, ${gates.length} approval gates open in your name.`,
    '',
    ...questions.map((q) => `- ${q.title} (${q.askedBy}, ${q.ageDays}d, ${q.projectName})\n  ${q.answerUrl || q.url || ''}`),
    '',
    'PORTFOLIO',
    `${p.peopleReporting} of ${p.peopleActive} delivering reported in (${p.peopleDormant} dormant of ${p.peopleTotal}).`,
    `${p.taskDone} of ${p.taskTotal} tasks closed (${p.percentComplete}%). ${p.overdueTotal} past due.`,
    `Last 7 days: ${p.doneLast7} closed vs ${p.donePrior7} prior, ${deltaText(p.velocityDelta)}. ${p.updatesLast7} updates, ${deltaText(p.cadenceDelta)}.`,
    `${p.byStatus.STALLED} stalled, ${p.byStatus.AT_RISK} at risk, ${p.byStatus.WATCH} watch, ${p.byStatus.ON_TRACK} on track, ${p.byStatus.COMPLETE} complete.`,
    '',
    'NEEDS ATTENTION',
    ...attention.slice(0, 10).map((x) => `- ${x.name} (${x.statusLabel}, ${x.percentCalculable ? x.percentComplete + '%' : 'n/a'}, quiet ${x.daysSinceActivity}d)`),
    '',
    'The full interactive dashboard is attached as an HTML file.',
  ];

  return deName(lines.join('\n').replace(/—/g, '-').replace(/–/g, '-'));
}

module.exports = { renderInternDeliveryEmail, renderInternDeliveryEmailText };
