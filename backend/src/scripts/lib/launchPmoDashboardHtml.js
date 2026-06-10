// Launch Readiness Dashboard - live HTML builder.
//
// Pure functions that turn the live project state (from launchPmoDailyUpdate's
// pullProjectState) into the polished "redesign" dashboard HTML. This is the
// v2 the weekly-poster header promised: the poster renders THIS output to PNG
// instead of the hardcoded tmp/launch-pmo-redesign-preview.html snapshot.
//
// Two exports, both pure (no I/O), so they unit-test without Basecamp:
//   buildView(state, extras)  -> a flat view model
//   renderDashboardHtml(view) -> the full HTML string
//
// House style: no em-dashes. Dynamic text from Basecamp is run through
// stripEmDashes() defensively so a BC list/task name can never inject one.

function htmlEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function stripEmDashes(s) { return String(s == null ? '' : s).replace(/[—–]/g, '-'); }
function clean(s) { return htmlEsc(stripEmDashes(s)); }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Parse a YYYY-MM-DD as a UTC noon date so toLocale* never drifts a day.
function asDate(ymd) { return new Date(`${ymd}T12:00:00Z`); }
function fmtLong(ymd) {
  try {
    return asDate(ymd).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  } catch { return ymd; }
}
function fmtShort(ymd) {
  if (!ymd) return '';
  const d = asDate(ymd);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
function daysBetween(aYmd, bYmd) {
  return Math.round((asDate(aYmd).getTime() - asDate(bYmd).getTime()) / 86400000);
}

// Due classification relative to today (YYYY-MM-DD strings).
function dueTier(dueOn, today) {
  if (!dueOn) return 'future';
  if (dueOn < today) return 'overdue';
  return daysBetween(dueOn, today) <= 7 ? 'soon' : 'future';
}
function duePill(dueOn, today) {
  const tier = dueTier(dueOn, today);
  if (tier === 'overdue') return { cls: 'overdue', label: `Overdue · ${fmtShort(dueOn)}` };
  if (tier === 'soon') return { cls: 'soon', label: `Due ${fmtShort(dueOn)}` };
  return { cls: 'future', label: dueOn ? `Due ${fmtShort(dueOn)}` : 'No due date' };
}
function scoreTier(score) { return score >= 80 ? 's-high' : score >= 50 ? 's-mid' : 's-low'; }

// Curriculum Readiness: completion percent of the "Curriculum" Basecamp todo
// list. Computed identically to every other area's pct in pullProjectState
// (round(done / total * 100)), so it uses the SAME units as the rest of the
// dashboard - Basecamp todos (curriculum build tasks), not a separate data
// source. completed = area.done, total = area.total.
//
// Divide-by-zero guard: if the Curriculum list is missing or empty (0/0), we
// report 0% and flag hasData:false so the tile renders "no curriculum data"
// instead of a misleading 0% that looks like real progress.
function computeCurriculumReadiness(state) {
  const area = (state.areas || []).find((a) => /curriculum/i.test(a.listName || ''));
  const total = area ? area.total : 0;
  const done = area ? area.done : 0;
  if (!area || total === 0) {
    return { pct: 0, done, total, present: !!area, hasData: false };
  }
  return { pct: Math.round((done / total) * 100), done, total, present: true, hasData: true };
}

const ESC_LABEL = {
  REMINDER: 'Reminder', ESCALATE_LEAD: 'Escalate', NOTIFY_ALI: 'Notify Ali', CRITICAL_RISK: 'Critical',
};

function ownerOf(todo) {
  const names = (todo.assignees || []).join(', ').replace(/Ali Muwwakkil/g, 'Ali').trim();
  return names || (todo.tier === 'AI' ? 'CB System' : 'unassigned');
}

// ---------------------------------------------------------------------------
// View model
// ---------------------------------------------------------------------------
function buildView(state, extras = {}) {
  const { escalations = [], humanQueue = [], blockedHumanTasks = [], blockerMap = new Map(), targetDate = '' } = extras;
  const today = state.today;
  const openTotal = state.areas.reduce((s, a) => s + a.openCount, 0);
  const humanPct = openTotal > 0 ? Math.round((state.totalHuman / openTotal) * 100) : 0;

  // YOUR TURN: prefer a task assigned to Ali, else the top human task.
  const aliTasks = humanQueue.filter((h) => (h.assignees || []).some((a) => /Ali Muwwakkil/i.test(a)));
  const nextForAli = aliTasks[0] || humanQueue[0] || null;

  // Per-area next human step (first unblocked HUMAN/EITHER), sorted by urgency.
  const areaCards = state.areas
    .map((a) => {
      const nextH = a.openTodos.find((t) => (t.tier === 'HUMAN' || t.tier === 'EITHER') && !blockerMap.get(t.id)?.blocked);
      if (!nextH) return null;
      const pill = duePill(nextH.due_on, today);
      return {
        area: a.listName,
        task: nextH.content,
        url: nextH.url,
        owner: ownerOf(nextH),
        dueOn: nextH.due_on || '',
        tier: dueTier(nextH.due_on, today),
        pillCls: pill.cls,
        pillLabel: pill.label,
      };
    })
    .filter(Boolean)
    .sort((x, y) => (x.dueOn || '9999-12-31').localeCompare(y.dueOn || '9999-12-31'));

  // Feasibility, lowest score first.
  const feasibility = [...state.areas]
    .sort((a, b) => a.feasibility.score - b.feasibility.score)
    .map((a) => ({
      name: a.listName,
      score: a.feasibility.score,
      tier: scoreTier(a.feasibility.score),
      requiredDays: a.feasibility.requiredDays,
      daysToLaunch: a.feasibility.daysToLaunch,
    }));

  const escalationRows = escalations.slice(0, 8).map((e) => ({
    label: ESC_LABEL[e.classification] || 'Reminder',
    days: e.days_overdue,
    area: e.area,
    task: e.content,
  }));

  const blockedRows = (blockedHumanTasks || []).slice(0, 8).map((b) => {
    const m = /upstream open:\s*"([^"]+)"/.exec(b.blocker?.reason || '');
    return {
      task: b.content,
      owner: ownerOf(b),
      waitingOn: m ? m[1] : (b.blocker?.reason || 'upstream task'),
    };
  });

  return {
    today,
    longDate: fmtLong(today),
    targetDate,
    daysToLaunch: state.daysToLaunch,
    overall: state.overall,
    curriculum: computeCurriculumReadiness(state),
    totalHuman: state.totalHuman,
    totalAi: state.totalAi,
    totalOverdue: state.totalOverdue,
    openTotal,
    humanPct,
    areaCount: state.areas.length,
    nextForAli: nextForAli ? {
      task: nextForAli.content, url: nextForAli.url, area: nextForAli.area,
      dueLong: nextForAli.due_on ? fmtLong(nextForAli.due_on) : 'no due date',
      owner: ownerOf(nextForAli),
    } : null,
    areaCards,
    feasibility,
    escalationRows,
    blockedRows,
  };
}

// ---------------------------------------------------------------------------
// CSS (ported verbatim from the approved redesign; no em-dashes inside)
// ---------------------------------------------------------------------------
const CSS = `
  :root{--bg:#f6f7f9;--surface:#fff;--ink:#0f1729;--ink-2:#1f2937;--muted:#64748b;--muted-2:#94a3b8;--border:#e5e8ec;--gold:#d4a017;--green:#15803d;--green-bg:#ecfdf5;--amber:#b45309;--amber-bg:#fffbeb;--red:#b91c1c;--red-bg:#fef2f2;--blue:#1e40af;--blue-bg:#eff6ff;--shadow-sm:0 1px 2px rgba(15,23,42,.04),0 1px 3px rgba(15,23,42,.04);--shadow-md:0 2px 4px rgba(15,23,42,.04),0 4px 8px rgba(15,23,42,.06);--shadow-lg:0 4px 6px rgba(15,23,42,.03),0 10px 20px rgba(15,23,42,.08);}
  *{box-sizing:border-box}html,body{margin:0;padding:0}
  body{font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;background:var(--bg);color:var(--ink);line-height:1.5;-webkit-font-smoothing:antialiased}
  .container{max-width:1140px;margin:0 auto;padding:32px 28px 64px}
  .head{display:flex;align-items:flex-end;justify-content:space-between;padding-bottom:24px;border-bottom:1px solid var(--border);margin-bottom:32px;gap:24px;flex-wrap:wrap}
  .head .eyebrow{font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:2.5px;text-transform:uppercase;color:var(--muted);font-weight:600;margin-bottom:6px}
  .head h1{margin:0;font-size:32px;font-weight:800;color:var(--ink);letter-spacing:-.02em;line-height:1.1}
  .head .sub{margin-top:6px;font-size:13px;color:var(--muted)}
  .head .meta-block{text-align:right;font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--muted);line-height:1.7}
  .head .meta-block .dot{color:var(--green)}
  .kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:var(--border);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:32px;box-shadow:var(--shadow-sm)}
  .kpi{background:var(--surface);padding:22px 24px 20px;display:flex;flex-direction:column;justify-content:space-between;min-height:124px}
  .kpi .label{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);font-weight:600}
  .kpi .value{font-size:38px;font-weight:800;color:var(--ink);letter-spacing:-.025em;line-height:1;margin-top:14px}
  .kpi .value .unit{font-size:16px;font-weight:600;color:var(--muted);margin-left:4px}
  .kpi .delta{margin-top:8px;font-size:12px;color:var(--muted)}
  .kpi.urgent .value,.kpi.urgent .label{color:var(--red)}
  .progress-track{margin-top:10px;height:6px;background:var(--border);border-radius:4px;overflow:hidden}
  .progress-fill{height:100%;background:linear-gradient(90deg,var(--gold),#f59e0b);border-radius:4px}
  .your-turn{background:linear-gradient(135deg,#0f172a,#1e293b);color:#fff;border-radius:12px;padding:24px 28px;margin-bottom:32px;display:flex;align-items:center;justify-content:space-between;gap:24px;position:relative;overflow:hidden;box-shadow:var(--shadow-lg)}
  .your-turn::before{content:'';position:absolute;top:0;left:0;bottom:0;width:4px;background:var(--gold)}
  .your-turn .yt-text{flex:1;min-width:0}
  .your-turn .yt-eyebrow{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:var(--gold);font-weight:700;margin-bottom:8px}
  .your-turn .yt-task{font-size:22px;font-weight:700;color:#fff;letter-spacing:-.015em;line-height:1.25;margin-bottom:10px}
  .your-turn .yt-meta{font-size:12px;color:#cbd5e0;display:flex;gap:14px;flex-wrap:wrap}
  .your-turn .yt-meta strong{color:#fff;font-weight:600}
  .your-turn .yt-cta{background:var(--gold);color:#1f1500;padding:12px 22px;border-radius:8px;font-weight:700;font-size:13px;letter-spacing:.3px;text-decoration:none;white-space:nowrap}
  .section{margin-bottom:36px}
  .section-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px}
  .section-head h2{margin:0;font-size:14px;font-weight:700;color:var(--ink);text-transform:uppercase;letter-spacing:1.5px}
  .section-head .meta{font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--muted)}
  .area-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
  .area-card{background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--green);border-radius:8px;padding:16px 18px;box-shadow:var(--shadow-sm)}
  .area-card.tier-overdue{border-left-color:var(--red)}
  .area-card.tier-soon{border-left-color:var(--amber)}
  .area-card.tier-future{border-left-color:var(--blue)}
  .area-card .area-row1{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:10px}
  .area-card .area-name{font-size:13px;font-weight:700;color:var(--ink)}
  .area-card .pill{font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:1px;text-transform:uppercase;font-weight:700;padding:4px 8px;border-radius:4px;white-space:nowrap}
  .pill.overdue{background:var(--red-bg);color:var(--red)}
  .pill.soon{background:var(--amber-bg);color:var(--amber)}
  .pill.future{background:var(--blue-bg);color:var(--blue)}
  .area-card .task{font-size:13px;color:var(--ink-2);text-decoration:none;display:block;margin:6px 0;line-height:1.4;font-weight:500}
  .area-card .owner{font-size:11px;color:var(--muted);font-family:'IBM Plex Mono',monospace}
  .area-card .owner strong{color:var(--ink-2);font-weight:600}
  .feasibility-table,.blocked-table{background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;box-shadow:var(--shadow-sm)}
  .feasibility-row{display:grid;grid-template-columns:200px 60px 1fr 130px;align-items:center;padding:12px 18px;border-bottom:1px solid var(--border);gap:16px;font-size:12px}
  .feasibility-row:last-child{border-bottom:none}
  .feasibility-row .feas-name{font-weight:600;color:var(--ink);font-size:12.5px}
  .feasibility-row .feas-score{font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:13px}
  .feas-score.s-high,.feas-fill.s-high{color:var(--green)}
  .feas-score.s-mid{color:var(--amber)}
  .feas-score.s-low{color:var(--red)}
  .feasibility-row .feas-bar{height:6px;background:var(--border);border-radius:4px;overflow:hidden}
  .feasibility-row .feas-fill{height:100%;border-radius:4px}
  .feas-fill.s-high{background:var(--green)}
  .feas-fill.s-mid{background:var(--amber)}
  .feas-fill.s-low{background:var(--red)}
  .feasibility-row .feas-load{font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--muted);text-align:right}
  .feasibility-row .feas-load strong{color:var(--ink);font-weight:600}
  .escalation-list{display:flex;flex-direction:column;gap:8px}
  .escalation-pill{background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--amber);border-radius:6px;padding:10px 14px;display:flex;align-items:center;gap:12px;box-shadow:var(--shadow-sm);font-size:12.5px}
  .escalation-pill .tag{font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:700;letter-spacing:1px;background:var(--amber-bg);color:var(--amber);padding:4px 8px;border-radius:4px;text-transform:uppercase;flex-shrink:0}
  .escalation-pill .area-tag{font-weight:600;color:var(--ink-2);font-size:12px}
  .escalation-pill .task{color:var(--muted);flex:1}
  .blocked-row{display:grid;grid-template-columns:1fr 130px 1.4fr;padding:12px 18px;border-bottom:1px solid var(--border);gap:16px;font-size:12px;align-items:start}
  .blocked-row:last-child{border-bottom:none}
  .blocked-row .b-task{font-weight:600;color:var(--ink)}
  .blocked-row .b-owner{font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--muted)}
  .blocked-row .b-block{color:var(--muted);font-size:11.5px;line-height:1.4}
  .blocked-row .b-block strong{color:var(--amber);font-weight:600}
  .footer{margin-top:40px;padding-top:20px;border-top:1px solid var(--border);font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:var(--muted);line-height:1.7}
  .footer strong{color:var(--ink-2);font-weight:600}
  @media (max-width:880px){.container{padding:20px 16px 48px}.kpis{grid-template-columns:repeat(2,1fr)}.area-grid{grid-template-columns:1fr}.feasibility-row,.blocked-row{grid-template-columns:1fr;gap:6px}.your-turn{flex-direction:column;align-items:flex-start}}
`;

// ---------------------------------------------------------------------------
// HTML renderer
// ---------------------------------------------------------------------------
function renderDashboardHtml(view) {
  const yt = view.nextForAli;
  const ytHtml = yt
    ? `<div class="your-turn"><div class="yt-text">
<div class="yt-eyebrow">Your turn · next decision to unblock the project</div>
<div class="yt-task">${clean(yt.task)}</div>
<div class="yt-meta"><span><strong>${clean(yt.area)}</strong></span><span>due ${clean(yt.dueLong)}</span><span>${clean(yt.owner)}</span></div>
</div>${yt.url ? `<a class="yt-cta" href="${htmlEsc(yt.url)}">Open in Basecamp &rarr;</a>` : ''}</div>`
    : `<div class="your-turn"><div class="yt-text"><div class="yt-eyebrow">Your turn</div><div class="yt-task">You are clear. No human action queued for you right now.</div></div></div>`;

  const areaHtml = view.areaCards.map((c) => `<div class="area-card tier-${c.tier}">
<div class="area-row1"><div class="area-name">${clean(c.area)}</div><div class="pill ${c.pillCls}">${clean(c.pillLabel)}</div></div>
<a class="task" href="${htmlEsc(c.url)}">${clean(c.task)}</a>
<div class="owner">Owner · <strong>${clean(c.owner)}</strong></div>
</div>`).join('\n');

  const feasHtml = view.feasibility.map((f) => `<div class="feasibility-row">
<div class="feas-name">${clean(f.name)}</div>
<div class="feas-score ${f.tier}">${f.score}</div>
<div class="feas-bar"><div class="feas-fill ${f.tier}" style="width:${Math.max(0, Math.min(100, f.score))}%"></div></div>
<div class="feas-load"><strong>${f.requiredDays}d</strong> work / ${f.daysToLaunch}d</div>
</div>`).join('\n');

  const escHtml = view.escalationRows.map((e) => `<div class="escalation-pill">
<span class="tag">${clean(e.label)} · ${e.days}d</span>
<span class="area-tag">${clean(e.area)}</span>
<span class="task">${clean(e.task)}</span>
</div>`).join('\n');

  const blockedHtml = view.blockedRows.map((b) => `<div class="blocked-row">
<div class="b-task">${clean(b.task)}</div>
<div class="b-owner">${clean(b.owner)}</div>
<div class="b-block"><strong>Waiting on:</strong> ${clean(b.waitingOn)}</div>
</div>`).join('\n');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Launch Readiness Dashboard - ${htmlEsc(view.today)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=IBM+Plex+Mono:wght@500;700&display=swap" rel="stylesheet">
<style>${CSS}</style></head>
<body><div class="container">

<div class="head">
  <div class="title-block">
    <div class="eyebrow">AI Systems Architect Accelerator &middot; Launch PMO</div>
    <h1>Launch Readiness Dashboard</h1>
    <div class="sub">${clean(view.longDate)} &middot; ${view.daysToLaunch} days to launch${view.targetDate ? ` &middot; target ${htmlEsc(view.targetDate)}` : ''}</div>
  </div>
  <div class="meta-block">
    <div><span class="dot">&#9679;</span> Live state &middot; refreshed 10:00 AM CT</div>
    <div>${view.areaCount} areas tracked &middot; ${view.openTotal} open todos</div>
    <div>Auto-posted Mon-Fri by CB System</div>
  </div>
</div>

<div class="kpis">
  <div class="kpi"><div><div class="label">Days to Launch</div><div class="value">${view.daysToLaunch}<span class="unit">d</span></div></div><div class="delta">${view.targetDate ? `target ${htmlEsc(view.targetDate)}` : 'launch window'}</div></div>
  <div class="kpi"><div><div class="label">Overall Readiness</div><div class="value">${view.overall}<span class="unit">%</span></div></div><div class="progress-track"><div class="progress-fill" style="width:${Math.max(0, Math.min(100, view.overall))}%"></div></div></div>
  <div class="kpi"><div><div class="label">Curriculum Readiness</div><div class="value">${view.curriculum.pct}<span class="unit">%</span></div></div>${view.curriculum.hasData ? `<div class="delta" title="${view.curriculum.done} of ${view.curriculum.total} curriculum tasks complete">${view.curriculum.done} / ${view.curriculum.total} tasks ready</div><div class="progress-track"><div class="progress-fill" style="width:${Math.max(0, Math.min(100, view.curriculum.pct))}%"></div></div>` : `<div class="delta">no curriculum data</div>`}</div>
  <div class="kpi"><div><div class="label">Open · Human / AI</div><div class="value">${view.totalHuman}<span class="unit">/${view.totalAi}</span></div></div><div class="delta">${view.openTotal} open todos &middot; ${view.humanPct}% human</div></div>
  <div class="kpi urgent"><div><div class="label">Overdue</div><div class="value">${view.totalOverdue}</div></div><div class="delta">${view.escalationRows.length} reminders escalating</div></div>
</div>

${ytHtml}

<div class="section">
  <div class="section-head"><h2>Next human step blocking each area</h2><div class="meta">${view.areaCards.length} areas &middot; sorted by urgency</div></div>
  <div class="area-grid">
${areaHtml}
  </div>
</div>

<div class="section">
  <div class="section-head"><h2>Feasibility per area</h2><div class="meta">lowest first &middot; score = work-days vs days-to-launch</div></div>
  <div class="feasibility-table">
${feasHtml}
  </div>
</div>

${view.escalationRows.length ? `<div class="section">
  <div class="section-head"><h2>Escalations</h2><div class="meta">${view.escalationRows.length} open</div></div>
  <div class="escalation-list">
${escHtml}
  </div>
</div>` : ''}

${view.blockedRows.length ? `<div class="section">
  <div class="section-head"><h2>Blocked downstream tasks</h2><div class="meta">${view.blockedRows.length} waiting on upstream work</div></div>
  <div class="blocked-table">
${blockedHtml}
  </div>
</div>` : ''}

<div class="footer">
  <div><strong>Source</strong> &middot; Basecamp project 47502609 (AI Systems Architect Accelerator) &middot; pulled live at post time</div>
  <div><strong>Cadence</strong> &middot; Mon-Fri 10:00 AM CT via runReportingAuditAndSend cron &middot; idempotent on date</div>
  <div><strong>Help</strong> &middot; Tag <code>@CB System</code> on any task for AI execution, artifact drafting, or follow-up scheduling</div>
</div>

</div></body></html>`;
}

module.exports = { buildView, renderDashboardHtml };
