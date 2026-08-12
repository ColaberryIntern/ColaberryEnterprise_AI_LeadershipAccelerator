/* Intern Delivery Command Center - client runtime.
 *
 * Browser asset, not a CommonJS module. It is read as text by
 * lib/internDashboardShell.js and inlined into the single output HTML file.
 *
 * Everything on the page renders from window.DATA. Nothing is hardcoded and no
 * number is written twice, per the Reference Kit rule: one data object is the
 * only source of truth.
 */
(function () {
  'use strict';
  var D = window.DATA;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ---------------------------------------------------------------- helpers
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pid(id) { return D.projects.filter(function (p) { return p.projectId === id; })[0]; }
  function person(id) { return D.people.filter(function (p) { return p.personId === id; })[0]; }
  function personName(id) { var p = person(id); return p ? p.name : 'Unassigned'; }
  function plural(n, s, p) { return n === 1 ? s : (p || s + 's'); }
  function shortDate(iso) {
    if (!iso) return 'n/a';
    var d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function longDate(iso) {
    if (!iso) return 'n/a';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Trend chip. The "new" case matters: 0 -> 3 is not "infinity percent".
  function delta(d, unit) {
    if (!d) return '<span class="delta flat">n/a</span>';
    if (d.kind === 'new') return '<span class="delta up">new activity</span>';
    if (d.kind === 'flat' || d.value === 0) return '<span class="delta flat">no change</span>';
    var arrow = d.value > 0 ? '▲' : '▼';
    return '<span class="delta ' + (d.value > 0 ? 'up' : 'down') + '">' + arrow + ' ' + Math.abs(d.value) + '%' + (unit ? ' ' + unit : '') + '</span>';
  }

  // Conditional formatting: the completion bar is the single most-scanned
  // element on the page, so its colour carries the judgement.
  function barColor(p) {
    if (p == null) return 'var(--neutral)';
    if (p >= 80) return 'var(--good)';
    if (p >= 50) return 'var(--accent)';
    if (p >= 25) return 'var(--warn)';
    return 'var(--risk)';
  }
  function bar(pctVal, reason) {
    if (pctVal == null) {
      return '<div class="bar na" title="' + esc(reason || 'Not calculable') + '"><span>not calculable</span></div>';
    }
    return '<div class="bar" title="' + pctVal + '% complete"><i style="width:' + Math.max(2, pctVal) + '%;background:' + barColor(pctVal) + '"></i><span>' + pctVal + '%</span></div>';
  }
  function spark(series) {
    if (!series || !series.length) return '';
    var max = Math.max.apply(null, series.map(function (d) { return d.count; }).concat([1]));
    return '<span class="spark">' + series.map(function (d) {
      var h = Math.round((d.count / max) * 22);
      var cls = d.count === 0 ? '' : d.count >= 3 ? 'hi' : 'on';
      return '<i class="' + cls + '" style="height:' + Math.max(2, h) + 'px" title="' + d.date + ': ' + d.count + '"></i>';
    }).join('') + '</span>';
  }
  function badge(text, tone) { return '<span class="badge ' + (tone || 'neutral') + '">' + esc(text) + '</span>'; }

  var SENTIMENT_TONE = function (score) {
    if (score >= 0.35) return 'good';
    if (score >= 0.05) return 'info';
    if (score > -0.25) return 'neutral';
    if (score > -0.55) return 'warning';
    return 'risk';
  };

  // ------------------------------------------------------- 1. exec summary
  function renderExec() {
    var p = D.portfolio;
    var qs = D.decisionQueue.filter(function (q) { return q.kind === 'open_question'; });
    var gatesAli = D.decisionQueue.filter(function (q) { return q.kind === 'approval_gate' && q.approver === 'Ali'; });
    var stalled = D.projects.filter(function (x) { return x.status === 'STALLED'; });
    var atRisk = D.projects.filter(function (x) { return x.status === 'AT_RISK'; });
    var reporting = D.people.filter(function (x) { return x.hasUpdateInWindow; });
    var quiet = D.people.filter(function (x) { return x.active && !x.hasUpdateInWindow; });

    var top = qs.slice(0, 3).map(function (q) {
      return '<li style="margin-bottom:6px"><a href="#decisions" data-scroll>' + esc(q.title) + '</a> <span class="badge risk">' + q.ageDays + 'd</span> <span style="color:var(--muted);font-size:12.5px">' + esc(q.askedBy) + ' on ' + esc(q.projectName) + '</span></li>';
    }).join('');

    var html = ''
      + '<div class="card callout risk">'
      + '<h3>The one thing to do before the call</h3>'
      + '<p><b>' + qs.length + ' ' + plural(qs.length, 'question') + ' ' + plural(qs.length, 'is', 'are') + ' waiting on you</b>, and ' + gatesAli.length + ' approval ' + plural(gatesAli.length, 'gate') + ' ' + plural(gatesAli.length, 'is', 'are') + ' open in your name. '
      + 'These are the items where work has genuinely stopped until you answer. The oldest has been sitting for ' + (qs.length ? qs[0].ageDays : 0) + ' days.</p>'
      + (top ? '<ul style="margin:10px 0 0;padding-left:20px;font-size:14px">' + top + '</ul>' : '')
      + '</div>'

      + '<div class="card callout">'
      + '<h3>Where the portfolio actually stands</h3>'
      + '<p>' + reporting.length + ' of the ' + (reporting.length + quiet.length) + ' people currently delivering posted an update in the last ' + D.lookbackDays + ' days'
      + (quiet.length ? ', and ' + quiet.length + ' more closed tasks without commenting' : '')
      + ' (' + D.people.length + ' people hold assigned work in total; the rest are dormant). '
      + 'Across ' + p.projectsTotal + ' project ' + plural(p.projectsTotal, 'stream') + ' the portfolio stands at <b>' + p.taskDone + ' of ' + p.taskTotal + ' tasks closed (' + p.percentComplete + '%)</b>. '
      + 'Last 7 days: ' + p.doneLast7 + ' tasks closed against ' + p.donePrior7 + ' the week before ' + delta(p.velocityDelta) + ', on ' + p.updatesLast7 + ' updates ' + delta(p.cadenceDelta) + '.</p>'
      + '<p>' + stalled.length + ' ' + plural(stalled.length, 'project') + ' ' + plural(stalled.length, 'is', 'are') + ' stalled (no movement in 14+ days) and ' + atRisk.length + ' more ' + plural(atRisk.length, 'is', 'are') + ' at risk. '
      + p.overdueTotal + ' tasks are past their due date.</p>'
      + '</div>';

    $('#exec-body').innerHTML = html;
  }

  // ----------------------------------------------------------- 2. KPI cards
  function renderKpis() {
    var p = D.portfolio;
    var qs = D.decisionQueue.filter(function (q) { return q.kind === 'open_question'; }).length;
    var gates = D.decisionQueue.filter(function (q) { return q.kind === 'approval_gate' && q.approver === 'Ali'; }).length;
    var cards = [
      { label: 'Waiting on you', val: qs + gates, foot: qs + ' open ' + plural(qs, 'question') + ' + ' + gates + ' approval ' + plural(gates, 'gate'), tone: (qs + gates) > 0 ? 'risk' : 'good' },
      { label: 'Reporting in', val: p.peopleReporting + '/' + p.peopleActive, foot: 'of those delivering, posted an update in ' + D.lookbackDays + ' days', tone: 'accent' },
      { label: 'Portfolio complete', val: p.percentComplete + '%', foot: p.taskDone + ' of ' + p.taskTotal + ' tasks closed', tone: 'info' },
      { label: 'Closed last 7 days', val: p.doneLast7, foot: 'vs ' + p.donePrior7 + ' prior week ' + delta(p.velocityDelta), tone: p.doneLast7 >= p.donePrior7 ? 'good' : 'warn' },
      { label: 'Updates last 7 days', val: p.updatesLast7, foot: 'vs ' + p.updatesPrior7 + ' prior week ' + delta(p.cadenceDelta), tone: p.updatesLast7 >= p.updatesPrior7 ? 'good' : 'warn' },
      { label: 'Stalled projects', val: p.byStatus.STALLED, foot: 'no movement in 14+ days', tone: p.byStatus.STALLED > 0 ? 'risk' : 'good' },
      { label: 'Past due tasks', val: p.overdueTotal, foot: 'across all active projects', tone: p.overdueTotal > 0 ? 'warn' : 'good' },
      { label: 'Active projects', val: p.projectsActive, foot: 'of ' + p.projectsTotal + ' tracked', tone: 'accent' },
    ];
    $('#kpi-body').innerHTML = cards.map(function (c) {
      return '<div class="card kpi ' + c.tone + '"><div class="label">' + esc(c.label) + '</div><div class="val">' + c.val + '</div><div class="foot">' + c.foot + '</div></div>';
    }).join('');
  }

  // ------------------------------------------------------ 3. decision queue
  var queueFilter = 'questions';
  function renderQueue() {
    var items = D.decisionQueue.filter(function (q) {
      if (queueFilter === 'questions') return q.kind === 'open_question';
      if (queueFilter === 'gates') return q.kind === 'approval_gate' && q.approver === 'Ali';
      if (queueFilter === 'ram') return q.kind === 'approval_gate' && q.approver === 'Ram';
      return true;
    });
    if (!items.length) {
      $('#queue-body').innerHTML = '<div class="card empty">Nothing in this queue. That is a good sign.</div>';
      return;
    }
    $('#queue-body').innerHTML = items.map(function (q) {
      var isQ = q.kind === 'open_question';
      var cls = isQ ? (q.urgency || 'medium') : 'gate';
      var meta = [];
      if (isQ) {
        meta.push('<b>' + esc(q.askedBy) + '</b> asked ' + longDate(q.askedAt));
        meta.push(badge(q.ageDays + ' ' + plural(q.ageDays, 'day') + ' unanswered', q.ageDays > 14 ? 'risk' : q.ageDays > 5 ? 'warning' : 'neutral'));
      } else {
        meta.push(badge('Approval gate', 'accent'));
        meta.push(badge('open ' + q.ageDays + 'd', q.ageDays > 21 ? 'risk' : 'warning'));
        if (q.approver === 'Ram') meta.push(badge('Ram approves', 'info'));
      }
      meta.push('<a href="#" data-project="' + q.projectId + '">' + esc(q.projectName) + '</a>');
      if (isQ && q.taskTitle) meta.push('<span title="' + esc(q.taskTitle) + '">on: ' + esc(q.taskTitle.slice(0, 60)) + '</span>');

      return '<div class="card qcard ' + cls + '">'
        + '<div>'
        + '<div class="q">' + esc(q.title) + '</div>'
        + (q.whyItMatters ? '<div class="why">' + esc(q.whyItMatters) + '</div>' : '')
        + '<div class="meta">' + meta.join('') + '</div>'
        + '</div>'
        + '<div class="act">'
        + '<a class="btn primary" style="text-align:center" href="' + esc(q.answerUrl || q.url) + '" target="_blank" rel="noopener">' + (isQ ? 'Answer in Basecamp' : 'Open the gate') + '</a>'
        + '<button class="btn" data-project="' + q.projectId + '">See the project</button>'
        + '</div>'
        + '</div>';
    }).join('');
  }

  // ------------------------------------------------------------- 4. people
  var peopleSort = { key: 'statusRank', dir: 1 };
  function peopleRows() {
    var q = ($('#search').value || '').toLowerCase();
    var rows = D.people.filter(function (p) { return p.active; });
    if (q) rows = rows.filter(function (p) { return (p.name + ' ' + (p.email || '') + ' ' + p.streams.join(' ')).toLowerCase().indexOf(q) !== -1; });
    var k = peopleSort.key;
    return rows.sort(function (a, b) {
      var av = a[k], bv = b[k];
      if (av == null) av = k === 'name' ? '' : -1;
      if (bv == null) bv = k === 'name' ? '' : -1;
      if (typeof av === 'string') return av.localeCompare(bv) * peopleSort.dir;
      return (av - bv) * peopleSort.dir;
    });
  }
  function renderPeople() {
    var rows = peopleRows();
    var body = rows.map(function (p) {
      var traj = p.trajectory || 'Steady';
      var trajTone = traj === 'Accelerating' ? 'good' : traj === 'Just started' ? 'info'
        : traj === 'Slowing' ? 'warning' : traj === 'Stalled' ? 'risk' : 'neutral';
      return '<tr data-person="' + p.personId + '">'
        + '<td><div class="namecell"><b>' + esc(p.name) + '</b><small>' + esc(p.streams.join(' + ')) + (p.email ? ' &middot; ' + esc(p.email) : '') + '</small></div></td>'
        + '<td>' + badge(p.statusLabel, p.statusTone) + (p.hasUpdateInWindow ? '' : ' ' + badge('no comment', 'warning'))
        + (p.worstStatus && p.worstStatus !== p.status && (p.worstStatus === 'STALLED' || p.worstStatus === 'AT_RISK')
          ? '<div style="font-size:10.5px;color:var(--muted);margin-top:3px" title="' + esc(p.worstStatusProject || '') + '">worst project: ' + esc(p.worstStatusLabel) + '</div>' : '')
        + '</td>'
        + '<td>' + p.projectCount + '</td>'
        + '<td style="min-width:130px">' + bar(p.percentComplete, p.percentReason) + '</td>'
        + '<td>' + spark(p.dailyUpdates) + '<div style="font-size:11px;color:var(--muted)">' + p.updatesInLookback + ' in ' + D.lookbackDays + 'd</div></td>'
        + '<td>' + p.doneLast7 + ' <small style="color:var(--muted)">vs ' + p.donePrior7 + '</small><br>' + delta(p.velocityDelta) + '</td>'
        + '<td>' + badge(traj, trajTone) + '</td>'
        + '<td>' + (p.daysSinceUpdate == null ? '<span class="badge risk">never</span>' : p.daysSinceUpdate + 'd ago') + '</td>'
        + '<td>' + (p.openGateCount ? badge(p.openGateCount + ' gate', 'warning') : '') + ' ' + (p.overdueCount ? badge(p.overdueCount + ' late', 'risk') : '') + '</td>'
        + '</tr>';
    }).join('');
    $('#people-body').innerHTML = body || '<tr class="norow"><td colspan="9" class="empty">No one matches that search.</td></tr>';
    $('#people-count').textContent = rows.length;
  }

  // Dormant roster. Kept on the page because removing it would misreport who
  // holds work; folded shut because it is not what the call is about.
  function renderDormant() {
    var rows = D.people.filter(function (p) { return !p.active; });
    $('#dormant-count').textContent = rows.length;
    if (!rows.length) { $('#dormant-body').innerHTML = '<div class="empty">Everyone holding work is active.</div>'; return; }
    $('#dormant-body').innerHTML = '<div class="tablewrap"><table><thead><tr><th class="nosort">Person</th><th class="nosort">Streams</th><th class="nosort">Projects</th><th class="nosort">Last activity</th><th class="nosort">Owns</th></tr></thead><tbody>'
      + rows.map(function (p) {
        return '<tr data-person="' + p.personId + '"><td><b>' + esc(p.name) + '</b></td><td><small>' + esc(p.streams.join(' + ')) + '</small></td><td>' + p.projectCount + '</td><td>'
          + (p.lastActivityAt ? longDate(p.lastActivityAt) + ' <small style="color:var(--muted)">(' + p.daysSinceUpdate + 'd)</small>' : '<span class="badge neutral">no recorded activity</span>')
          + '</td><td>' + p.ownedProjectIds.length + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  // ----------------------------------------------------------- 5. projects
  var projFilter = 'all';
  function renderProjects() {
    var q = ($('#search').value || '').toLowerCase();
    var rows = D.projects.slice();
    if (projFilter === 'attention') rows = rows.filter(function (p) { return p.status === 'STALLED' || p.status === 'AT_RISK'; });
    else if (projFilter === 'moving') rows = rows.filter(function (p) { return p.status === 'ON_TRACK' || p.status === 'WATCH'; });
    else if (projFilter === 'done') rows = rows.filter(function (p) { return p.status === 'COMPLETE'; });
    else if (projFilter !== 'all') rows = rows.filter(function (p) { return p.stream === projFilter; });
    if (q) rows = rows.filter(function (p) { return (p.name + ' ' + personName(p.ownerId) + ' ' + (p.summary || '')).toLowerCase().indexOf(q) !== -1; });

    $('#proj-count').textContent = rows.length;
    $('#proj-body').innerHTML = rows.map(function (p) {
      return '<div class="card pcard ' + p.statusTone + '" data-project="' + p.projectId + '">'
        + '<div class="ptop"><div><h4>' + esc(p.name) + '</h4><div class="owner">' + esc(personName(p.ownerId)) + ' &middot; ' + esc(p.stream) + '</div></div>' + badge(p.statusLabel, p.statusTone) + '</div>'
        + bar(p.percentComplete, p.percentReason)
        + '<div class="sum">' + esc(p.summary || '') + '</div>'
        + (p.riskFlags.length ? '<div class="flags">' + p.riskFlags.map(function (f) { return badge(f.label, f.tone); }).join('') + '</div>' : '')
        + '<div class="stats">'
        + '<div><b>' + p.taskDone + '/' + p.taskTotal + '</b><small>tasks</small></div>'
        + '<div><b>' + p.doneLast7 + '</b><small>closed 7d</small></div>'
        + '<div><b>' + (p.daysSinceActivity == null ? '∞' : p.daysSinceActivity + 'd') + '</b><small>since update</small></div>'
        + '</div>'
        + '</div>';
    }).join('') || '<div class="card empty">No projects match that filter.</div>';
  }

  // ------------------------------------------------------- 6. drill-through
  function openDrawer(title, crumbs, body) {
    $('#drawer-title').innerHTML = title;
    $('#drawer-crumbs').innerHTML = crumbs;
    $('#drawer-body').innerHTML = body;
    $('#drawer').classList.add('on');
    $('#scrim').classList.add('on');
    document.body.style.overflow = 'hidden';
    $('#drawer-body').scrollTop = 0;
  }
  function closeDrawer() {
    $('#drawer').classList.remove('on');
    $('#scrim').classList.remove('on');
    document.body.style.overflow = '';
  }

  function projectDrawer(id) {
    var p = pid(id);
    if (!p) return;
    var qs = D.decisionQueue.filter(function (q) { return q.projectId === id; });

    var releases = p.releases.length
      ? p.releases.map(function (r) {
        var tasks = p.tasks.filter(function (t) { return t.groupName === r.name; });
        return '<details class="acc"' + (r.done < r.total && r.done > 0 ? ' open' : '') + '>'
          + '<summary><span style="flex:1">' + esc(r.name) + '</span>' + bar(r.pct) + '<span style="color:var(--muted);font-size:12px">' + r.done + '/' + r.total + '</span></summary>'
          + '<div class="accbody"><ul class="tasklist">' + tasks.map(taskLi).join('') + '</ul></div>'
          + '</details>';
      }).join('')
      : '<ul class="tasklist" style="border:1px solid var(--border);border-radius:var(--r-sm);background:var(--card)">' + p.tasks.filter(function (t) { return t.groupKind !== 'approval_gate'; }).map(taskLi).join('') + '</ul>';

    var gates = p.gates.length
      ? '<div class="dsec"><h5>Approval gates</h5><ul class="tasklist" style="border:1px solid var(--border);border-radius:var(--r-sm);background:var(--card)">' + p.gates.map(taskLi).join('') + '</ul></div>'
      : '';

    var questions = qs.length
      ? '<div class="dsec"><h5>Waiting on you (' + qs.length + ')</h5>' + qs.map(function (q) {
        return '<div class="card qcard ' + (q.kind === 'open_question' ? (q.urgency || 'medium') : 'gate') + '" style="margin-bottom:8px">'
          + '<div><div class="q">' + esc(q.title) + '</div>' + (q.whyItMatters ? '<div class="why">' + esc(q.whyItMatters) + '</div>' : '')
          + '<div class="meta">' + (q.askedBy ? '<b>' + esc(q.askedBy) + '</b> &middot; ' + q.ageDays + 'd' : 'approval gate &middot; ' + q.ageDays + 'd') + '</div></div>'
          + '<div class="act"><a class="btn primary" style="text-align:center" href="' + esc(q.answerUrl || q.url) + '" target="_blank" rel="noopener">Answer</a></div></div>';
      }).join('') + '</div>'
      : '';

    var comments = p.recentComments.length
      ? '<div class="dsec"><h5>Latest updates</h5>' + p.recentComments.map(function (c) {
        return '<div class="cmt"><div class="ch">' + esc(c.author) + ' <span style="color:var(--muted);font-weight:400">' + longDate(c.createdAt) + ' &middot; ' + esc(c.todoTitle) + '</span></div><div class="cb" data-expand>' + esc(c.text) + '</div></div>';
      }).join('') + '</div>'
      : '';

    var body = ''
      + '<div class="dsec"><div class="card callout ' + (p.statusTone === 'risk' ? 'risk' : p.statusTone === 'warning' ? 'warn' : '') + '" style="margin:0">'
      + '<h3>' + esc(p.headline || p.statusLabel) + '</h3><p>' + esc(p.summary || '') + '</p>'
      + (p.nextAction ? '<p style="font-size:13px;color:var(--muted)"><b>Next action:</b> ' + esc(p.nextAction) + '</p>' : '')
      + (p.riskNote ? '<p style="font-size:13px;color:var(--muted)"><b>Biggest risk:</b> ' + esc(p.riskNote) + '</p>' : '')
      + '</div></div>'

      + '<div class="dsec"><div class="minigrid">'
      + '<div class="m"><b>' + (p.percentComplete == null ? 'n/a' : p.percentComplete + '%') + '</b><small>complete</small></div>'
      + '<div class="m"><b>' + p.taskDone + '/' + p.taskTotal + '</b><small>tasks</small></div>'
      + '<div class="m"><b>' + p.doneLast7 + '</b><small>closed 7d</small></div>'
      + '<div class="m"><b>' + p.updatesLast7 + '</b><small>updates 7d</small></div>'
      + '<div class="m"><b>' + (p.daysSinceActivity == null ? '∞' : p.daysSinceActivity) + '</b><small>days quiet</small></div>'
      + '<div class="m"><b>' + p.overdue.length + '</b><small>past due</small></div>'
      + '</div></div>'

      + '<div class="dsec"><h5>Read of the room</h5><div class="card pad">'
      + badge(p.sentiment ? p.sentiment.label : 'Neutral', SENTIMENT_TONE(p.sentiment ? p.sentiment.score : 0))
      + ' <span style="color:var(--muted);font-size:13px">' + esc(p.sentiment ? p.sentiment.rationale : '') + '</span>'
      + '<dl class="dl" style="margin-top:14px">'
      + '<dt>Owner</dt><dd>' + esc(personName(p.ownerId)) + '</dd>'
      + '<dt>Current release</dt><dd>' + (p.currentRelease ? esc(p.currentRelease.name) + ' (' + p.currentRelease.done + '/' + p.currentRelease.total + ')' : 'no release structure') + '</dd>'
      + '<dt>Velocity trend</dt><dd>' + p.doneLast7 + ' closed this week vs ' + p.donePrior7 + ' last ' + delta(p.velocityDelta) + '</dd>'
      + '<dt>Update trend</dt><dd>' + p.updatesLast7 + ' updates this week vs ' + p.updatesPrior7 + ' last ' + delta(p.cadenceDelta) + '</dd>'
      + '<dt>Started</dt><dd>' + longDate(p.startedOn) + '</dd>'
      + '<dt>Projected finish</dt><dd>' + (p.projectedFinish ? longDate(p.projectedFinish) + ' <small style="color:var(--muted)">(' + p.projectedDays + ' days at current pace)</small>' : '<span class="badge risk">not projectable at current pace</span>') + '</dd>'
      + '</dl></div></div>'

      + questions
      + '<div class="dsec"><h5>Releases and tasks (' + p.taskTotal + ')</h5>' + releases + '</div>'
      + gates
      + comments;

    openDrawer(esc(p.name), 'Portfolio <b>&rsaquo;</b> ' + esc(p.stream) + ' <b>&rsaquo;</b> ' + esc(personName(p.ownerId)) + ' <b>&rsaquo;</b> Project', body);
  }

  // Renders both delivery tasks and approval gates, which reach here from
  // different builders. Tolerate a missing field rather than blanking the whole
  // drawer: one malformed record must not cost the reader the other thirty.
  function taskLi(t) {
    var who = Array.isArray(t.assignees) ? t.assignees : [];
    return '<li class="' + (t.completed ? 'done' : '') + '">'
      + '<span class="tick ' + (t.completed ? 'done' : t.overdue ? 'over' : '') + '">' + (t.completed ? '✓' : '') + '</span>'
      + '<span class="tt"><span>' + esc(t.title) + '</span><small>'
      + (who.length ? esc(who.join(', ')) : 'unassigned')
      + (t.dueOn ? ' &middot; due ' + shortDate(t.dueOn) + (t.overdue ? ' (overdue)' : '') : '')
      + (t.completedAt ? ' &middot; closed ' + shortDate(t.completedAt) : '')
      + (t.commentsCount ? ' &middot; ' + t.commentsCount + ' ' + plural(t.commentsCount, 'comment') : '')
      + '</small></span>'
      + '<a class="btn" style="padding:3px 8px;font-size:11px" href="' + esc(t.url) + '" target="_blank" rel="noopener">open</a>'
      + '</li>';
  }

  function personDrawer(id) {
    var p = person(id);
    if (!p) return;
    var mine = D.projects.filter(function (x) { return p.projectIds.indexOf(x.projectId) !== -1; });
    var qs = D.decisionQueue.filter(function (q) { return p.projectIds.indexOf(q.projectId) !== -1 && q.kind === 'open_question'; });

    var body = ''
      + '<div class="dsec"><div class="card callout" style="margin:0">'
      + '<h3>' + esc(p.trajectory || 'Steady') + '</h3><p>' + esc(p.summary || '') + '</p>'
      + (p.talkingPoint ? '<p style="font-size:13px;color:var(--muted)"><b>Raise this with them:</b> ' + esc(p.talkingPoint) + '</p>' : '')
      + '</div></div>'

      + '<div class="dsec"><div class="minigrid">'
      + '<div class="m"><b>' + (p.percentComplete == null ? 'n/a' : p.percentComplete + '%') + '</b><small>owned work done</small></div>'
      + '<div class="m"><b>' + p.projectCount + '</b><small>projects</small></div>'
      + '<div class="m"><b>' + p.updatesInLookback + '</b><small>updates ' + D.lookbackDays + 'd</small></div>'
      + '<div class="m"><b>' + p.doneLast7 + '</b><small>closed 7d</small></div>'
      + '<div class="m"><b>' + (p.daysSinceUpdate == null ? '∞' : p.daysSinceUpdate) + '</b><small>days quiet</small></div>'
      + '<div class="m"><b>' + p.overdueCount + '</b><small>past due</small></div>'
      + '</div></div>'

      + '<div class="dsec"><h5>Update cadence, last ' + D.lookbackDays + ' days</h5><div class="card pad">'
      + spark(p.dailyUpdates) + '<div style="font-size:12.5px;color:var(--muted);margin-top:8px">'
      + p.updatesLast7 + ' updates this week vs ' + p.updatesPrior7 + ' last week ' + delta(p.cadenceDelta)
      + ' &middot; ' + p.doneLast7 + ' tasks closed vs ' + p.donePrior7 + ' ' + delta(p.velocityDelta) + '</div></div></div>'

      + (qs.length ? '<div class="dsec"><h5>They are blocked on you (' + qs.length + ')</h5>' + qs.map(function (q) {
        return '<div class="card qcard ' + (q.urgency || 'medium') + '" style="margin-bottom:8px"><div><div class="q">' + esc(q.title) + '</div><div class="meta">' + esc(q.projectName) + ' &middot; ' + q.ageDays + 'd</div></div>'
          + '<div class="act"><a class="btn primary" style="text-align:center" href="' + esc(q.answerUrl || q.url) + '" target="_blank" rel="noopener">Answer</a></div></div>';
      }).join('') + '</div>' : '')

      + '<div class="dsec"><h5>Their projects (' + mine.length + ')</h5>'
      + mine.map(function (x) {
        return '<div class="card pad" style="margin-bottom:9px;cursor:pointer" data-project="' + x.projectId + '">'
          + '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:8px"><b style="font-size:14px">' + esc(x.name) + '</b>' + badge(x.statusLabel, x.statusTone) + '</div>'
          + bar(x.percentComplete, x.percentReason)
          + '<div style="font-size:12.5px;color:var(--muted);margin-top:8px">' + esc(x.summary || '') + '</div>'
          + '<div style="font-size:11.5px;color:var(--muted);margin-top:7px">' + (x.ownerId === p.personId ? 'owner' : 'contributor') + ' &middot; ' + x.taskDone + '/' + x.taskTotal + ' tasks &middot; ' + (x.daysSinceActivity == null ? 'no activity' : x.daysSinceActivity + 'd since update') + '</div>'
          + '</div>';
      }).join('') + '</div>';

    openDrawer(esc(p.name), 'Portfolio <b>&rsaquo;</b> ' + esc(p.streams.join(' + ')) + ' <b>&rsaquo;</b> Person', body);
  }

  // -------------------------------------------------------------- 7. charts
  var charts = [];
  function chartTheme() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return { grid: dark ? '#1f2c44' : '#e2e8f0', text: dark ? '#94a3b8' : '#64748b' };
  }
  var C = { good: '#16a34a', warn: '#d97706', risk: '#dc2626', accent: '#0f766e', info: '#2563eb', neutral: '#94a3b8' };

  function renderCharts() {
    if (typeof Chart === 'undefined') {
      $$('.cvs').forEach(function (c) { c.innerHTML = '<div class="empty">Charts need an internet connection (Chart.js loads from a CDN).</div>'; });
      return;
    }
    charts.forEach(function (c) { c.destroy(); });
    charts = [];
    var t = chartTheme();
    Chart.defaults.font.family = '"Segoe UI",system-ui,sans-serif';
    Chart.defaults.color = t.text;

    // Status mix
    var st = D.portfolio.byStatus;
    charts.push(new Chart($('#chart-status'), {
      type: 'doughnut',
      data: {
        labels: ['Stalled', 'At Risk', 'Watch', 'On Track', 'Complete', 'Not Started'],
        datasets: [{ data: [st.STALLED, st.AT_RISK, st.WATCH, st.ON_TRACK, st.COMPLETE, st.NOT_STARTED], backgroundColor: [C.risk, '#f87171', C.warn, C.good, C.accent, C.neutral], borderWidth: 0 }],
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '58%', plugins: { legend: { position: 'right', labels: { boxWidth: 11, font: { size: 11 } } } } },
    }));

    // Completion by person (owned work only)
    var pl = D.people.filter(function (p) { return p.active && p.percentComplete != null; })
      .sort(function (a, b) { return b.percentComplete - a.percentComplete; });
    charts.push(new Chart($('#chart-people'), {
      type: 'bar',
      data: {
        labels: pl.map(function (p) { return p.name.split(' ')[0]; }),
        datasets: [{ label: '% of owned tasks closed', data: pl.map(function (p) { return p.percentComplete; }), backgroundColor: pl.map(function (p) { return p.percentComplete >= 80 ? C.good : p.percentComplete >= 50 ? C.accent : p.percentComplete >= 25 ? C.warn : C.risk; }), borderRadius: 4 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: function (c) { var p = pl[c.dataIndex]; return p.taskDone + ' of ' + p.taskTotal + ' tasks'; } } } },
        scales: { x: { max: 100, grid: { color: t.grid }, ticks: { callback: function (v) { return v + '%'; } } }, y: { grid: { display: false } } },
      },
    }));

    // Momentum: completions vs updates over the window
    charts.push(new Chart($('#chart-momentum'), {
      type: 'line',
      data: {
        labels: D.portfolio.dailyCompletions.map(function (d) { return d.date.slice(5); }),
        datasets: [
          { label: 'Tasks closed', data: D.portfolio.dailyCompletions.map(function (d) { return d.count; }), borderColor: C.good, backgroundColor: 'rgba(22,163,74,.12)', fill: true, tension: .32, borderWidth: 2, pointRadius: 2 },
          { label: 'Updates posted', data: D.portfolio.dailyUpdates.map(function (d) { return d.count; }), borderColor: C.info, backgroundColor: 'rgba(37,99,235,.08)', fill: true, tension: .32, borderWidth: 2, pointRadius: 2 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 11, font: { size: 11 } } } },
        scales: { y: { beginAtZero: true, grid: { color: t.grid } }, x: { grid: { display: false } } },
      },
    }));

    // Stream split
    var bs = D.portfolio.byStream;
    charts.push(new Chart($('#chart-stream'), {
      type: 'bar',
      data: {
        labels: bs.map(function (s) { return s.stream; }),
        datasets: [
          { label: 'Closed', data: bs.map(function (s) { return s.taskDone; }), backgroundColor: C.good, borderRadius: 4 },
          { label: 'Open', data: bs.map(function (s) { return s.taskTotal - s.taskDone; }), backgroundColor: C.neutral, borderRadius: 4 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 11, font: { size: 11 } } } },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, grid: { color: t.grid } } },
      },
    }));
  }

  // ---------------------------------------------------------- 8. gantt
  function renderGantt() {
    var rows = D.projects.filter(function (p) { return p.status !== 'COMPLETE' && p.taskTotal >= 2 && p.startedOn; })
      .sort(function (a, b) { return a.statusRank - b.statusRank; }).slice(0, 18);
    if (!rows.length) { $('#gantt').innerHTML = '<div class="empty">No datable projects.</div>'; return; }

    // Mermaid gantt states carry the conditional formatting: crit = at risk or
    // stalled, active = moving, done = finished.
    var lines = ['gantt', '  dateFormat YYYY-MM-DD', '  axisFormat %b %d', '  title Projected delivery at current pace'];
    var byStream = {};
    rows.forEach(function (p) { (byStream[p.stream] = byStream[p.stream] || []).push(p); });
    Object.keys(byStream).forEach(function (s) {
      lines.push('  section ' + s.replace(/[:#]/g, ' '));
      byStream[s].forEach(function (p) {
        var label = p.name.replace(/[:#,]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 46);
        var tag = (p.status === 'STALLED' || p.status === 'AT_RISK') ? 'crit, ' : (p.status === 'ON_TRACK' ? 'active, ' : '');
        var end = p.projectedFinish;
        if (!end) {
          // No credible forecast. Draw a short stub so the row still appears and
          // the label says why, rather than silently dropping the project.
          lines.push('  ' + label + ' (no forecast) :crit, p' + p.projectId + ', ' + p.startedOn + ', 14d');
        } else {
          lines.push('  ' + label + ' :' + tag + 'p' + p.projectId + ', ' + p.startedOn + ', ' + end);
        }
      });
    });
    $('#gantt').textContent = lines.join('\n');
    $('#gantt').removeAttribute('data-processed');
  }

  // -------------------------------------------------------- 9. heatmap
  function renderHeat() {
    var people = D.people.filter(function (p) { return p.active; });
    var projects = D.projects.filter(function (p) { return p.status !== 'COMPLETE' && p.taskTotal >= 2; });
    if (!people.length || !projects.length) { $('#heat').innerHTML = '<div class="empty">Not enough data for a coverage matrix.</div>'; return; }

    var head = '<tr><th class="lbl"></th>' + projects.map(function (p) {
      return '<th title="' + esc(p.name) + '">' + esc(p.name.replace(/ - (BUILD|PROPOSAL).*/i, '').slice(0, 26)) + '</th>';
    }).join('') + '</tr>';

    var rows = people.map(function (person) {
      return '<tr><td class="lbl" data-person="' + person.personId + '" style="cursor:pointer">' + esc(person.name) + '</td>'
        + projects.map(function (p) {
          var owns = p.ownerId === person.personId;
          var contributes = p.contributorIds.indexOf(person.personId) !== -1;
          if (!owns && !contributes) return '<td class="cell" style="background:var(--neutral-bg)" title="not on this project"></td>';
          var v = p.percentComplete;
          var bg = v == null ? 'var(--neutral)' : barColor(v);
          return '<td class="cell" data-project="' + p.projectId + '" style="background:' + bg + ';opacity:' + (owns ? 1 : .55) + '" title="' + esc(person.name + ' - ' + p.name + ': ' + (v == null ? 'not calculable' : v + '%') + (owns ? ' (owner)' : ' (contributor)')) + '">' + (v == null ? '-' : Math.round(v)) + '</td>';
        }).join('') + '</tr>';
    }).join('');

    $('#heat').innerHTML = '<div class="tablewrap"><table class="heat"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>'
      + '<div class="note">Each cell is that person\'s project at its completion percentage. Full opacity means they own it, faded means they contribute. Grey means they are not on it. Click any cell to drill in.</div>';
  }

  // ------------------------------------------------------------ 10. TOC
  function renderToc() {
    var secs = $$('section[id]');
    $('#toc-body').innerHTML = secs.map(function (s, i) {
      var h = $('h2', s);
      var lede = $('.seclede', s);
      return '<a href="#' + s.id + '" data-scroll><b>' + String(i + 1).padStart(2, '0') + '. ' + esc(h ? h.textContent : s.id) + '</b>'
        + (lede ? '<small>' + esc(lede.textContent.slice(0, 96)) + '</small>' : '') + '</a>';
    }).join('');
  }

  // ------------------------------------------------------------ wiring
  function wire() {
    // delegated drill-through
    document.addEventListener('click', function (e) {
      var pr = e.target.closest('[data-project]');
      if (pr) { e.preventDefault(); projectDrawer(parseInt(pr.getAttribute('data-project'), 10)); return; }
      var pe = e.target.closest('[data-person]');
      if (pe) { e.preventDefault(); personDrawer(parseInt(pe.getAttribute('data-person'), 10)); return; }
      var ex = e.target.closest('[data-expand]');
      if (ex) { ex.classList.toggle('open'); return; }
      var sc = e.target.closest('[data-scroll]');
      if (sc) { $('#navlinks').classList.remove('open'); }
    });

    $('#scrim').addEventListener('click', closeDrawer);
    $('#drawer-close').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDrawer();
      if (e.key === '/' && document.activeElement !== $('#search')) { e.preventDefault(); $('#search').focus(); }
    });

    $('#search').addEventListener('input', function () { renderPeople(); renderProjects(); });

    $$('.qtab').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('.qtab').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        queueFilter = b.getAttribute('data-q');
        renderQueue();
      });
    });
    $$('.pfilter').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('.pfilter').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        projFilter = b.getAttribute('data-f');
        renderProjects();
      });
    });

    $$('#people-table th[data-k]').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-k');
        peopleSort.dir = peopleSort.key === k ? -peopleSort.dir : 1;
        peopleSort.key = k;
        renderPeople();
      });
    });

    $('#navtoggle').addEventListener('click', function () { $('#navlinks').classList.toggle('open'); });
    $('#print').addEventListener('click', function () { window.print(); });
    $('#theme').addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('idcc-theme', next); } catch (_e) { }
      renderCharts();
      redrawMermaid();
    });

    // scroll progress, active nav, back to top
    var secs = $$('section[id]');
    window.addEventListener('scroll', function () {
      var h = document.documentElement;
      var pctScrolled = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100;
      $('#progress').style.width = pctScrolled + '%';
      $('#totop').classList.toggle('on', h.scrollTop > 600);
      var cur = null;
      secs.forEach(function (s) { if (s.getBoundingClientRect().top <= 130) cur = s.id; });
      $$('.navlinks a').forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === '#' + cur); });
    }, { passive: true });
    $('#totop').addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }

  function redrawMermaid() {
    if (typeof mermaid === 'undefined') { $('#gantt').innerHTML = '<div class="empty">The timeline needs an internet connection (Mermaid loads from a CDN).</div>'; return; }
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    renderGantt();
    try {
      mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'default', gantt: { useWidth: 1180, barHeight: 21, fontSize: 12 } });
      mermaid.init(undefined, $('#gantt'));
    } catch (e) {
      $('#gantt').innerHTML = '<div class="empty">Timeline could not render: ' + esc(e.message) + '</div>';
    }
  }

  // ------------------------------------------------------------ boot
  try { var st = localStorage.getItem('idcc-theme'); if (st) document.documentElement.setAttribute('data-theme', st); } catch (_e) { }

  renderExec();
  renderKpis();
  renderQueue();
  renderPeople();
  renderDormant();
  renderProjects();
  renderHeat();
  renderToc();
  wire();
  renderCharts();
  redrawMermaid();

  // Deep link: #project-<id> / #person-<id> opens the drawer directly, so a
  // link pasted into Basecamp lands on the right record.
  var h = location.hash;
  if (/^#project-\d+$/.test(h)) projectDrawer(parseInt(h.split('-')[1], 10));
  if (/^#person-\d+$/.test(h)) personDrawer(parseInt(h.split('-')[1], 10));
})();
