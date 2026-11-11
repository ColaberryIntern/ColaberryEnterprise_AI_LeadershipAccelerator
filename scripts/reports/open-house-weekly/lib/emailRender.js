/**
 * C124: the email edition of the weekly report, built like the Intern Delivery briefing: table-based inline HTML from
 * the shared emailLayoutKit, the same branded signature, the same Mandrill preflight. Order follows the ask: the starred
 * move, the 10 numbers, the summary overview; then the hypotheses, the latest decisions and what is attached.
 * Built from lib/view.js, so it can never disagree with the attached report or ONE_MOVE_PROMPT.md.
 */
'use strict';
const path = require('path');
const LIB = path.join(__dirname, '..', '..', '..', '..', 'backend', 'src', 'scripts', 'lib');
const K = require(path.join(LIB, 'emailLayoutKit'));
const { SIG_HTML, SIG_TEXT } = require(path.join(LIB, 'internDeliveryEmailSend'));

const { C, esc } = K;
const TONE = { good: [C.okSoft, C.ok], bad: [C.actionSoft, C.action], warn: [C.warnSoft, C.warn], ok: [C.warnSoft, C.warn], info: [C.infoSoft, C.info], low: [C.lineSoft, C.ink2], none: [C.lineSoft, C.ink2] };
const VERDICT = { good: 'Holding so far', bad: 'Not holding', low: 'Too few to judge', none: 'No data yet', retracted: 'Retracted' };

const prettyDate = (ymd) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

function starCard(rec) {
  const s = rec.star;
  if (!s) return `${K.sectionOpen('The one move')}${K.hTitle('No move stands out this week', 'Every step is on target or still being measured.')}${K.sectionClose()}`;
  const why = s.key === 'source'
    ? `${s.gap.worst.label} signs up ${s.gap.worst.rate}% of its visitors vs ${s.gap.best.label} ${s.gap.best.rate}%.`
    : `This week ${s.n} of ${s.d} (${s.pct}%) against a target of ${s.target}%: about ${s.short} people short.${s.conf < 1 ? ' Small sample, so a strong lead rather than a verdict.' : ''}`;
  return `
<tr><td style="padding:9px 0 0 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fffaf0;border:2px solid ${C.gold}">
  <tr><td style="padding:20px 22px;font-family:${K.FONT};color:${C.ink}">
    <div style="color:${C.gold};font-size:22px;letter-spacing:4px">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#975a16;font-weight:700;margin:4px 0">The one move with the greatest impact</div>
    <div style="font-size:19px;font-weight:700;margin:0 0 8px 0">${esc(s.title)}</div>
    <div style="font-size:14px;line-height:1.5;margin:0 0 10px 0">${esc(why)}</div>
    <ol style="margin:0 0 10px 18px;padding:0;font-size:13.5px;line-height:1.5">${s.how.map((h) => `<li style="margin:2px 0">${esc(h)}</li>`).join('')}</ol>
    <div style="font-size:12.5px;color:${C.ink2}">${s.executor === 'build' ? 'Claude Code can build this. To make the move, open this email in inbox zero and say "make the Open House move": it runs the attached ONE_MOVE_PROMPT.md.' : 'This move needs a person. The attached prompt prepares the evidence and the ask.'}</div>
    <div style="font-size:11.5px;color:${C.muted};margin-top:6px">${esc(s.id)} · tests ${esc(s.hypothesis.metric)} ${esc(s.hypothesis.op)} ${s.hypothesis.value}% by next Wednesday</div>
  </td></tr></table></td></tr>`;
}

function topTenCard(top10) {
  const rows = top10.map((f) => {
    const [bg, fg] = TONE[f.tone] || TONE.info;
    return `<tr><td valign="top" style="padding:7px 10px 7px 0;width:26px"><span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;background:${C.navy};color:#fff;font-size:11px;font-weight:700">${f.rank}</span></td>
      <td valign="top" style="padding:7px 0;border-bottom:1px solid ${C.lineSoft}"><div style="font-size:13.5px;font-weight:600;color:${C.ink}"><span style="display:inline-block;width:8px;height:8px;background:${fg};margin-right:6px"></span>${esc(f.text)}</div>
      ${f.why ? `<div style="font-size:12px;color:${C.ink2};margin-top:2px;background:${bg};display:inline-block;padding:1px 6px">${esc(f.why)}</div>` : ''}</td></tr>`;
  }).join('');
  return `${K.sectionOpen('Tour guide')}${K.hTitle('The 10 numbers that matter most this week', 'Ranked by how far each is from target, how many people it touches, and how close it sits to the first win.')}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>${K.sectionClose()}`;
}

/** Summary overview: a bullet row per step (bar = this week, number = vs target), table-based for Outlook. */
function overviewCard(rows) {
  const body = rows.map((r) => {
    const [, fg] = TONE[r.status] || TONE.none;
    const fill = r.pct === null ? 0 : Math.max(2, Math.min(100, Math.round(r.pct)));
    return `<tr><td style="padding:5px 8px 5px 0;font-size:12.5px;color:${C.ink};white-space:nowrap">${esc(r.label)}</td>
      <td width="200" style="width:200px;padding:5px 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.lineSoft}" style="background:${C.lineSoft}"><tr>
        ${fill ? `<td width="${fill}%" bgcolor="${fg}" style="background:${fg};height:10px;line-height:10px;font-size:0">&nbsp;</td>` : ''}<td style="height:10px;line-height:10px;font-size:0">&nbsp;</td></tr></table></td>
      <td style="padding:5px 0 5px 8px;font-size:12px;font-weight:700;color:${C.ink};white-space:nowrap">${r.d ? `${r.pct}%` : 'n/a'} <span style="font-weight:400;color:${C.muted}">${r.d ? `(${r.n}/${r.d})` : ''} target ${r.target}%</span></td></tr>`;
  }).join('');
  return `${K.sectionOpen('Summary overview')}${K.hTitle('Every step against its target', 'Pass-through from the step before. Green on target, amber watch, red below, grey too few to judge.')}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${body}</table>${K.sectionClose()}`;
}

function storyCard(story) {
  const hyp = story.hypotheses.map((h) => `<tr><td style="padding:4px 8px 4px 0;font-size:12.5px">${esc(h.title)}</td>
    <td style="padding:4px 0;white-space:nowrap" align="right">${K.chip(h.grade.label || VERDICT[h.grade.status], h.grade.status === 'good' ? 'good' : h.grade.status === 'bad' ? 'risk' : 'neutral')}</td></tr>`).join('');
  const latest = story.timeline.slice(-5).reverse().map((e) => `<div style="font-size:12.5px;margin:0 0 6px 0"><span style="color:${C.muted}">${esc(e.date)}</span> · <b>${esc(e.label)}</b>: ${esc(e.title)}</div>`).join('');
  return `${K.sectionOpen('The story so far')}${K.hTitle('Hypotheses, graded this week')}<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${hyp}</table>
    <div style="font-size:14px;font-weight:700;margin:14px 0 6px 0">Latest decisions</div>${latest}
    <div style="font-size:12px;color:${C.ink2}">The full timeline of decisions, changes of direction and corrections is in the attached report.</div>${K.sectionClose()}`;
}

function renderEmail(view) {
  const { cur, rec, weekOf } = view;
  const j = cur.journey;
  const subject = `Open House funnel, week of ${prettyDate(weekOf)}: ${rec.star ? rec.star.title : 'no move this week'}`;
  const stats = `<table role="presentation" cellpadding="0" cellspacing="6" border="0" width="100%"><tr>
    ${K.statCard('Visitors', String(cur.visitors), 'from the ads')}${K.statCard('Sign-ups', String(cur.signups.landing_page), `${view.funnel[2].pctTop ?? 0}% of visitors`, 'good')}
    ${K.statCard('Entered', String(j.entered), `of ${j.new_account} new accounts`, j.entered < j.new_account / 2 ? 'risk' : 'good')}</tr></table>`;
  const hero = `${K.sectionOpen('Open House funnel · weekly')}${K.hTitle(`Week of ${prettyDate(weekOf)}`, `${cur.from_ct} to ${cur.to_ct} CT. Every person from a Facebook or Instagram ad to the first win.`)}${stats}${K.sectionClose()}`;
  const attached = `${K.sectionOpen('Attached')}<div style="font-size:13px;line-height:1.6">
    <b>OPEN_HOUSE_WEEKLY_REPORT.html</b>: the full report with the guided tour, the flow of every person, every fork, the hypothesis board and the decision timeline. Open it in a browser.<br/>
    <b>ONE_MOVE_PROMPT.md</b>: the detailed prompt that makes the starred move and records it in the story, so next week's report grades it.</div>${K.sectionClose()}`;
  const body = [hero, starCard(rec), topTenCard(view.top10), overviewCard(view.overview), storyCard(view.story), attached].join('\n')
    + `\n<tr><td style="padding:0 16px 8px 16px">${SIG_HTML}</td></tr>`;
  const html = K.shell({ title: subject, preheaderText: rec.star ? `The one move: ${rec.star.title}` : 'No move this week', banner: 'OPEN HOUSE FUNNEL · WEEKLY REPORT', body });

  const text = [`OPEN HOUSE FUNNEL, WEEK OF ${prettyDate(weekOf).toUpperCase()}`, `${cur.from_ct} to ${cur.to_ct} CT`, '',
    `Visitors ${cur.visitors} · Sign-ups ${cur.signups.landing_page} · Entered ${j.entered} of ${j.new_account} new accounts`, '',
    '***** THE ONE MOVE *****', rec.star ? rec.star.title : 'None this week', ...(rec.star ? rec.star.how.map((h, i) => `${i + 1}. ${h}`) : []), '',
    'THE 10 NUMBERS THAT MATTER MOST', ...view.top10.map((f) => `${f.rank}. ${f.text}${f.why ? ` (${f.why})` : ''}`), '',
    'EVERY STEP AGAINST ITS TARGET', ...view.overview.map((r) => `- ${r.label}: ${r.d ? `${r.pct}% (${r.n}/${r.d})` : 'n/a'}, target ${r.target}%`), '',
    'HYPOTHESES', ...view.story.hypotheses.map((h) => `- ${h.title}: ${h.grade.label || VERDICT[h.grade.status]}`), '',
    'Attached: OPEN_HOUSE_WEEKLY_REPORT.html (open in a browser) and ONE_MOVE_PROMPT.md (say "make the Open House move" in inbox zero).',
    '', SIG_TEXT].join('\n');
  return { subject: K.stripEmDash(subject), html, text: K.stripEmDash(text) };
}

module.exports = { renderEmail, prettyDate };
