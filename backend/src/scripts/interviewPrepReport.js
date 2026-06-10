#!/usr/bin/env node
/* eslint-disable */
/**
 * interviewPrepReport.js
 *
 * IPBC Interview Preparation management report. Pulls every active logged
 * interview from CCPP (vw_ColaberryInterviewPreparation_UpcomingInterviews),
 * classifies each by funnel stage + urgency + readiness (lib/interviewPrepData),
 * renders an email-safe Power-BI-style HTML report with a readiness-vs-time
 * scatter and a per-student prep heatmap (lib/renderInterviewPrepReport), writes
 * both that artifact AND a richer interactive Chart.js version to docs/reports/,
 * and emails it to Ali.
 *
 * Idempotent: read-only against CCPP; the only side effect is one email send,
 * skipped with --dry. Safe to re-run.
 *
 * Run (on the VPS, where CCPP + Mandrill creds live):
 *   node backend/src/scripts/interviewPrepReport.js --dry           # build HTML, no send
 *   node backend/src/scripts/interviewPrepReport.js                 # send to Ali
 *   node backend/src/scripts/interviewPrepReport.js --to=a@b.com
 *
 * Local render test (no DB/creds): pass a JSON fixture (a raw CCPP recordset):
 *   node backend/src/scripts/interviewPrepReport.js --fixture=tmp/interview-prep/fixture-upcoming.json --dry
 *
 * Flags: --dry (no email), --to=csv, --cc=csv, --fixture=path
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const { classify } = require('./lib/interviewPrepData');
const { renderHtml, renderText } = require('./lib/renderInterviewPrepReport');

const DRY = process.argv.includes('--dry');
const argTo = process.argv.find((a) => a.startsWith('--to='));
const argCc = process.argv.find((a) => a.startsWith('--cc='));
const argFix = process.argv.find((a) => a.startsWith('--fixture='));
const RECIPIENTS = argTo ? argTo.slice('--to='.length).split(',').map((s) => s.trim()).filter(Boolean)
  : ['ali@colaberry.com'];
const CC = argCc ? argCc.slice('--cc='.length).split(',').map((s) => s.trim()).filter(Boolean)
  : ['alimuwwakkil@gmail.com', 'ram@colaberry.com'];
const FIXTURE = argFix ? argFix.slice('--fixture='.length) : null;

const VIEW_QUERY = `
  SELECT Applicant, Company_name, Job_Title, Job_Description, InterviewType,
         InterviewDate, NoofDays, Preparationscore, AutoInterviewsCount,
         MentorInterviewsCount, AutoMocks_Overall_score_AVG, AutoMocks_Overall_score_MAX,
         Mentor, MentorEmail, Recruiter_First_Name, Recruiter_Last_Name,
         Recruiter_Email_Address, StudentPrep_Xaxis, StudentPrep_Yaxis,
         MentorPrep_Xaxis, SurveyResponse, LogInterviewID, CandidateID
  FROM vw_ColaberryInterviewPreparation_UpcomingInterviews
  ORDER BY NoofDays ASC`;

async function loadRows() {
  if (FIXTURE) {
    const raw = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), FIXTURE), 'utf-8'));
    return Array.isArray(raw) ? raw : (raw.recordset || []);
  }
  const sql = require(path.resolve(__dirname, '../../../node_modules/mssql'));
  const cfg = {
    server: process.env.MSSQL_HOST,
    port: parseInt(process.env.MSSQL_PORT || '1433', 10),
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASS,
    database: process.env.MSSQL_DATABASE || 'CCPP',
    options: { encrypt: false, trustServerCertificate: true },
    requestTimeout: 120000,
  };
  await sql.connect(cfg);
  try {
    return (await sql.query(VIEW_QUERY)).recordset;
  } finally {
    await sql.close();
  }
}

/* Richer browser artifact: real interactive scatter + heatmap via Chart.js CDN.
 * This is a local file opened in a browser (JS runs), so it can be fully
 * interactive — complements the static email version. */
function renderInteractiveHtml(data) {
  const pts = data.scatter.map((p) => ({ x: p.x, y: p.y, label: `${p.student} · ${p.company}`, tier: p.tier }));
  const tierColor = {
    TODAY: '#7c3aed', CRITICAL: '#b91c1c', IMMINENT: '#c2410c', AT_RISK: '#b45309',
    BEHIND: '#a16207', SOON: '#1d4ed8', ON_TRACK: '#047857', SURVEY: '#0e7490', DONE: '#6b7280',
  };
  const datasets = Object.keys(tierColor).map((t) => ({
    label: t,
    data: pts.filter((p) => p.tier === t),
    backgroundColor: tierColor[t],
    pointRadius: 7, pointHoverRadius: 10,
  })).filter((d) => d.data.length);
  const heatRows = data.rows.filter((r) => r.stage !== 'COMPLETE').map((r) => ({
    student: r.student, company: r.company, job: r.jobTitle, days: r.days,
    prep: r.prepScore, auto: r.autoMocks, mentor: r.mentorMocks, readiness: r.readinessPct,
    survey: r.days < 0 ? (r.hasSurvey ? 'Done' : 'Owed') : '-', tier: r.tier,
  }));
  return `<!doctype html><html><head><meta charset="utf-8"/>
<title>Interview Prep — Interactive</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>
  body{font-family:Arial,Helvetica,sans-serif;background:#f4f6fa;color:#1f2937;margin:0;padding:24px;}
  .wrap{max-width:980px;margin:0 auto;}
  h1{color:#0f1729;font-size:22px;} h2{color:#0f1729;font-size:15px;border-bottom:2px solid #0f1729;padding-bottom:6px;}
  .card{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:18px;margin:16px 0;}
  table{border-collapse:collapse;width:100%;font-size:13px;} th,td{padding:7px 9px;border-bottom:1px solid #e5e7eb;text-align:center;}
  th:first-child,td:first-child{text-align:left;}
  .cell{color:#fff;font-weight:700;border-radius:4px;padding:5px 8px;}
</style></head><body><div class="wrap">
<h1>Interview Prep — Priority &amp; Readiness (interactive)</h1>
<p style="color:#6b7280">Generated ${data.runAt.toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT · CCPP live · companion to the email report.</p>
<div class="card"><h2>Readiness vs. Days-to-Interview</h2><canvas id="scatter" height="120"></canvas></div>
<div class="card"><h2>Preparation Heatmap</h2><table id="heat"><thead><tr>
<th>Student / Target</th><th>Days</th><th>Prep %</th><th>Auto Mocks</th><th>Mentor Mock</th><th>Survey</th><th>Readiness %</th></tr></thead><tbody></tbody></table></div>
<script>
const C=(p)=>p>=70?'#047857':p>=50?'#1d4ed8':p>=30?'#b45309':'#b91c1c';
new Chart(document.getElementById('scatter'),{type:'scatter',data:{datasets:${JSON.stringify(datasets)}},
 options:{plugins:{tooltip:{callbacks:{label:(c)=>c.raw.label+' ('+c.raw.x+'d, '+c.raw.y+'%)'}},legend:{position:'bottom'}},
 scales:{x:{title:{display:true,text:'Days until interview (negative = past, survey owed)'},grid:{color:'#eee'}},
 y:{title:{display:true,text:'Readiness %'},min:0,max:100}}}});
const heat=${JSON.stringify(heatRows)};const tb=document.querySelector('#heat tbody');
const av=(n)=>n>=2?'#047857':n===1?'#b45309':'#b91c1c';
heat.forEach(r=>{const tr=document.createElement('tr');tr.innerHTML=
 '<td><b>'+r.student+'</b><br><span style=\\'color:#6b7280;font-size:11px\\'>'+r.company+' · '+r.job+'</span></td>'+
 '<td>'+ (r.days<0?Math.abs(r.days)+'d ago':r.days===0?'Today':'in '+r.days+'d') +'</td>'+
 '<td><span class=cell style="background:'+C(r.prep)+'">'+r.prep+'</span></td>'+
 '<td><span class=cell style="background:'+av(r.auto)+'">'+r.auto+'</span></td>'+
 '<td><span class=cell style="background:'+(r.mentor>=1?'#047857':'#b91c1c')+'">'+(r.mentor>=1?'✓':'0')+'</span></td>'+
 '<td><span class=cell style="background:'+(r.survey==='Done'?'#047857':r.survey==='Owed'?'#b91c1c':'#cbd5e1')+'">'+r.survey+'</span></td>'+
 '<td><span class=cell style="background:'+C(r.readiness)+'">'+r.readiness+'</span></td>';
 tb.appendChild(tr);});
</script></div></body></html>`;
}

async function main() {
  console.log(`[InterviewPrepReport] dry=${DRY} fixture=${FIXTURE || '(live CCPP)'} to=${RECIPIENTS.join(',')}`);
  const rows = await loadRows();
  const data = classify(rows, new Date());
  const k = data.kpis;
  console.log(`[InterviewPrepReport] active=${k.totalActive} today=${k.todayCount} critical=${k.criticalCount} surveyOwed=${k.surveyOwedCount} avgReadiness=${k.avgReadinessUpcoming}%`);

  const html = renderHtml(data).replace(/—/g, '-').replace(/–/g, '-');
  const text = renderText(data).replace(/—/g, '-').replace(/–/g, '-');

  const stamp = data.runAt.toISOString().slice(0, 10);
  const outDir = path.resolve(__dirname, '../../../docs/reports');
  fs.mkdirSync(outDir, { recursive: true });
  const emailPath = path.join(outDir, `interview-prep-${stamp}.html`);
  const interactivePath = path.join(outDir, `interview-prep-${stamp}-interactive.html`);
  fs.writeFileSync(emailPath, html);
  fs.writeFileSync(interactivePath, renderInteractiveHtml(data));
  console.log(`[InterviewPrepReport] wrote ${emailPath}`);
  console.log(`[InterviewPrepReport] wrote ${interactivePath}`);

  if (DRY) { console.log('[InterviewPrepReport] --dry: no email sent'); return; }

  const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const subj = `[Interview Prep] ${k.todayCount} today, ${k.criticalCount} critical, ${k.surveyOwedCount} survey owed · ${k.avgReadinessUpcoming}% avg readiness`;
  const r = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: RECIPIENTS.join(', '),
    cc: CC.length ? CC.join(', ') : undefined,
    subject: subj,
    text, html,
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false', Importance: 'high' },
  });
  console.log(`[InterviewPrepReport] sent — Mandrill ${r.messageId}`);
}

main().catch((e) => { console.error('[InterviewPrepReport] FATAL', e); process.exit(1); });
