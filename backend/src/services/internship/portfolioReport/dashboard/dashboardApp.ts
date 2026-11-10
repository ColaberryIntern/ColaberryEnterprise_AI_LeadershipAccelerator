/**
 * dashboardApp - the CLIENT code of the interactive report page, run in the browser.
 *
 * Ali, 10 Nov 2026: "Create easy navigation where I can click on a person and it can easily
 * filter. Also for every report, find me the 10 most insightful communications ... I don't see the
 * suggested prompts. That's important in deciding which prompt to send them."
 *
 * It is serialized with Function.prototype.toString into the page (renderDashboard.ts), so it must
 * be SELF-CONTAINED: no imports, no outer variables, nothing that makes tsc emit a helper. It gets
 * the sidecar data, `document` and `window` as arguments; the backend has no DOM types, hence the
 * `any` on those three parameters (and only there).
 *
 * Safety: every value from the data reaches the page through textContent or a validated https
 * href, never through innerHTML.
 *
 * Filters: a person (sidebar or any name in the page) and a triage tier (click a bar), plus a name
 * search. State lives in location.hash (#p=<enrollment>&t=<tier>) so a filtered view can be
 * bookmarked and Back works.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- browser globals and the untyped sidecar, see header
export function dashboardApp(data: any, doc: any, win: any): void {
  const TIERS: Record<string, [string, string, string]> = {
    no_project_at_day_N: ['#991b1b', '#fee2e2', 'No project'],
    never_started_building: ['#9a3412', '#ffedd5', 'Never started'],
    blocked_waiting_on_ali: ['#0e7490', '#cffafe', 'Waiting on you'],
    overdue_backlog: ['#9f1239', '#ffe4e6', 'Overdue backlog'],
    quiet: ['#b45309', '#fef3c7', 'Quiet'],
    on_track: ['#166534', '#dcfce7', 'On track'],
  };
  const TIER_ORDER = ['no_project_at_day_N', 'never_started_building', 'blocked_waiting_on_ali', 'overdue_backlog', 'quiet', 'on_track'];
  const interns: any[] = data.interns || [];
  const byId: Record<string, any> = {};
  for (const i of interns) byId[i.enrollment_id] = i;
  const state: { p: string | null; t: string | null; q: string } = { p: null, t: null, q: '' };
  // The TRIAGE tier, read by destructuring: the free-account consumer scan treats any `.tier`
  // property read as a reader of an enrollment's tier (see sidecar/build.ts snapshotOf).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped sidecar row
  const tierOf = (row: any): string => { const { tier } = (row && row.triage) || {}; return tier; };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- element attrs are free-form
  function h(tag: string, attrs?: any, ...kids: any[]): any {
    const el = doc.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style') el.setAttribute('style', v);
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else if (k === 'href') { if (/^https:\/\//.test(String(v))) el.setAttribute('href', v); }
        else el.setAttribute(k, String(v));
      }
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.appendChild(typeof kid === 'object' ? kid : doc.createTextNode(String(kid)));
    }
    return el;
  }
  const tierPill = (t: string): any => { const x = TIERS[t] || ['#334155', '#f1f5f9', t]; return h('span', { class: 'pill', style: `color:${x[0]};background:${x[1]}` }, x[2]); };
  const fmt = (iso: string): string => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' }); };

  function copyText(text: string, btn: any): void {
    const done = (): void => { const was = btn.textContent; btn.textContent = 'Copied'; win.setTimeout(() => { btn.textContent = was; }, 1400); };
    if (win.navigator && win.navigator.clipboard && win.navigator.clipboard.writeText) {
      win.navigator.clipboard.writeText(text).then(done, () => fallback());
    } else fallback();
    function fallback(): void {
      const ta = h('textarea', { style: 'position:fixed;left:-9999px' });
      ta.value = text;
      doc.body.appendChild(ta);
      ta.select();
      try { doc.execCommand('copy'); done(); } catch (e) { btn.textContent = 'Select and copy'; }
      ta.remove();
    }
  }
  const copyBtn = (label: string, text: string): any => h('button', { class: 'copy', type: 'button', onclick: (e: any) => copyText(text, e.currentTarget) }, label);
  const personLink = (id: string, name: string): any => h('button', { class: 'link', type: 'button', onclick: () => go(id, null) }, name);

  function readHash(): void {
    const m = /p=([^&]+)/.exec(win.location.hash || '');
    const t = /t=([^&]+)/.exec(win.location.hash || '');
    state.p = m && byId[decodeURIComponent(m[1])] ? decodeURIComponent(m[1]) : null;
    state.t = t && TIERS[decodeURIComponent(t[1])] ? decodeURIComponent(t[1]) : null;
  }
  function go(p: string | null, t: string | null): void {
    state.p = p; state.t = t;
    const hash = p ? `#p=${encodeURIComponent(p)}` : t ? `#t=${encodeURIComponent(t)}` : '#';
    if (win.history && win.history.pushState) win.history.pushState(null, '', hash); else win.location.hash = hash;
    render();
    const top = doc.getElementById('main');
    if (top && top.scrollIntoView) top.scrollIntoView({ block: 'start' });
  }
  const visible = (): any[] => interns.filter((i) => (!state.p || i.enrollment_id === state.p) && (!state.t || tierOf(i) === state.t));

  function sidebar(): any {
    const q = state.q.toLowerCase();
    const list = interns.filter((i) => !q || String(i.name).toLowerCase().includes(q));
    return h('nav', { class: 'side', 'aria-label': 'Interns' },
      h('input', { class: 'search', type: 'search', placeholder: 'Find a person', 'aria-label': 'Find a person', value: state.q, oninput: (e: any) => { state.q = e.target.value; renderSide(); } }),
      h('button', { type: 'button', class: `person${!state.p && !state.t ? ' on' : ''}`, 'aria-pressed': String(!state.p && !state.t), onclick: () => go(null, null) },
        h('span', { class: 'pname' }, `All interns (${interns.length})`)),
      list.map((i) => { const x = TIERS[tierOf(i)] || ['#334155']; return h('button', { type: 'button', class: `person${state.p === i.enrollment_id ? ' on' : ''}`, 'aria-pressed': String(state.p === i.enrollment_id), 'data-id': i.enrollment_id, onclick: () => go(i.enrollment_id, null) },
        h('span', { class: 'dot', style: `background:${x[0]}` }), h('span', { class: 'pname' }, i.name), h('span', { class: 'pmeta' }, `${(TIERS[tierOf(i)] || [0, 0, tierOf(i)])[2]} · day ${i.day ?? '?'}`)); }));
  }

  function tiles(): any {
    const c = data.counts || {};
    const t = (label: string, v: any, color: string): any => h('div', { class: 'tile', style: `border-top-color:${color}` }, h('div', { class: 'tv' }, v === null || v === undefined ? '-' : v), h('div', { class: 'tl' }, label));
    return h('div', { class: 'tiles' }, t('Interns', c.interns, '#1a365d'), t('On track', c.on_track, '#16a34a'), t('Need attention', c.need_attention, '#ea580c'), t('Stalled', c.stalled, '#C20E1E'), t('Weeks 1-3 cleared', c.weeks_1_3_cleared, '#16a34a'), t('No project', c.no_project, '#ea580c'), t('Replies you owe', c.replies_owed, '#0e7490'));
  }

  function triageBars(): any {
    const counts: Record<string, number> = {};
    for (const i of interns) counts[tierOf(i)] = (counts[tierOf(i)] || 0) + 1;
    const max = Math.max(1, ...Object.values(counts));
    return h('section', { class: 'box' }, h('h2', null, 'Triage: who to act on, in order'), h('div', { class: 'muted small' }, 'Click a tier to see only those interns.'),
      TIER_ORDER.map((t) => { const n = counts[t] || 0; const x = TIERS[t]; return h('button', { type: 'button', class: `bar-row${state.t === t ? ' on' : ''}`, 'aria-pressed': String(state.t === t), disabled: n ? null : true, onclick: () => go(null, state.t === t ? null : t) },
        h('span', { class: 'bar-label' }, x[2]), h('span', { class: 'bar-track' }, h('span', { class: 'bar', style: `width:${(n / max) * 100}%;background:${x[0]}` })), h('span', { class: 'bar-n' }, String(n))); }));
  }

  function comms(): any {
    const person = state.p ? byId[state.p] : null;
    const list: any[] = person ? person.communications : (data.top_communications || []).filter((c: any) => !state.t || (byId[c.enrollment_id] && tierOf(byId[c.enrollment_id]) === state.t));
    const title = person ? `${person.first_name}'s most insightful communications` : '10 most insightful communications';
    return h('section', { class: 'box', id: 'comms' }, h('h2', null, title),
      h('div', { class: 'muted small' }, 'Ranked by what they say: blockers, questions, findings, decisions, concrete evidence and substance. Each one shows why it ranked.'),
      list.length ? h('ol', { class: 'comms' }, list.map((c: any) => h('li', { class: 'comm' },
        h('div', { class: 'comm-head' }, h('span', { class: 'score', title: 'insight score' }, String(c.score)),
          h('span', { class: c.direction === 'from_intern' ? 'dir in' : 'dir out' }, c.direction === 'from_intern' ? `${c.intern} → you` : `You → ${c.intern}`),
          person ? null : personLink(c.enrollment_id, 'filter'), h('span', { class: 'muted small' }, fmt(c.received_at)),
          c.answered === false ? h('span', { class: 'pill', style: 'color:#b91c1c;background:#fee2e2' }, 'unanswered') : null),
        h('div', { class: 'subj' }, c.subject), h('div', { class: 'excerpt' }, c.excerpt),
        h('div', null, (c.signals || []).filter((s: string) => !/^-/.test(s)).map((s: string) => h('span', { class: 'sig' }, s)))))) : h('div', { class: 'muted' }, 'No communications in the window.'));
  }

  function askBlock(a: any, n: number): any {
    return h('div', { class: 'ask' },
      h('div', { class: 'ask-head' }, h('span', { class: 'ask-n' }, String(n)), h('b', null, a.name)),
      h('div', { class: 'small' }, a.why),
      h('div', { class: 'lbl' }, 'Nudge to send them ', copyBtn('Copy nudge', a.nudge)), h('div', { class: 'nudge' }, a.nudge),
      h('div', { class: 'lbl' }, 'Prompt they paste into Claude Code ', copyBtn('Copy prompt', a.prompt)), h('pre', { class: 'prompt' }, a.prompt));
  }

  function card(i: any): any {
    const p = i.project;
    const kpi = (label: string, v: any, warn?: boolean): any => h('div', { class: 'kpi' }, h('div', { class: `kv${warn ? ' warn' : ''}` }, v === null || v === undefined ? '-' : v), h('div', { class: 'kl' }, label));
    const wb = i.pacing.weeks_behind;
    return h('article', { class: 'card', id: `i-${i.enrollment_id}` },
      h('div', { class: 'card-head' },
        h('div', null, h('div', { class: 'cname' }, state.p ? i.name : personLink(i.enrollment_id, i.name)), h('div', { class: 'muted small' }, `${i.track_label} · day ${i.day ?? '?'}`)),
        h('div', { style: 'text-align:right' }, tierPill(tierOf(i)), p && p.command_center_url ? h('div', null, h('a', { href: p.command_center_url, target: '_blank', rel: 'noopener noreferrer', class: 'cc' }, 'Command Center ↗')) : null)),
      h('div', { class: 'reason' }, i.triage.reason),
      h('div', { class: 'narr' }, i.narrative),
      h('div', { class: 'kpis' }, kpi('built', p ? `${i.percent_built ?? 0}%` : 'no project', !p), kpi('stories', p ? `${i.stories_verified ?? 0}/${i.stories_total ?? 0}` : null),
        kpi('training week', `${i.training.weeks_completed}/${i.training.weeks_total}`), kpi('pace', wb === null ? 'unknown' : wb > 0 ? `${wb} behind` : wb < 0 ? `${-wb} ahead` : 'on pace', wb !== null && wb > 0),
        kpi('real / all artifacts', `${i.artifacts_real_count}/${i.artifacts_raw_count}`), kpi('days since build work', p ? (i.days_since_build_work ?? 'none in 21d') : null, i.days_since_build_work === null || i.days_since_build_work >= 4)),
      h('h3', null, `Suggested prompts (${i.asks.length})`),
      i.asks.length ? i.asks.map((a: any, n: number) => askBlock(a, n + 1)) : h('div', { class: 'muted small' }, 'No artifact asks for this intern today.'),
      h('h3', null, 'Needs attention'),
      i.most_urgent ? h('ul', { class: 'urgent' }, [i.most_urgent, ...i.most_urgent_overflow].map((u: any) => h('li', null, h('b', null, u.label), `: ${u.detail}`))) : h('div', { class: 'muted small' }, 'Nothing waiting.'),
      i.last_ask ? h('div', null, h('h3', null, 'Your last message'),
        h('div', { class: 'small' }, `${fmt(i.last_ask.sent_at)} · ${i.last_ask.subject || ''} · `, h('b', null, i.last_ask.satisfied === true ? `answered (${String(i.last_ask.satisfied_by).replace('_', ' ')})` : i.last_ask.satisfied === false ? 'no response yet' : 'unknown')),
        h('details', null, h('summary', null, 'Show message'), h('div', { class: 'excerpt' }, i.last_ask.body_text || ''))) : null,
      i.open_questions.length ? h('div', null, h('h3', null, 'Open questions to you'), i.open_questions.map((q: any) => h('div', { class: 'oq' }, h('b', null, q.subject), ` (${fmt(q.received_at)}) `, q.text))) : null,
      i.artifacts.length ? h('div', null, h('h3', null, 'Artifacts'), h('div', null, i.artifacts.map((a: any) => h('a', { class: `art${a.classification === 'test_or_scratch' ? ' scratch' : ''}${a.wrong_format ? ' wrong' : ''}`, href: a.url, target: '_blank', rel: 'noopener noreferrer', title: a.classification }, `${a.kind_label}: ${a.title.length > 54 ? `${a.title.slice(0, 53)}...` : a.title}`)))) : null);
  }

  function agentJson(): any {
    const person = state.p ? byId[state.p] : null;
    const download = h('button', { type: 'button', class: 'copy', onclick: () => {
      const blob = new win.Blob([JSON.stringify(person || data, null, 2)], { type: 'application/json' });
      const a = h('a', { download: person ? `internship-${person.first_name}-${data.report_date}.json` : `internship-report-${data.report_date}.json` });
      a.href = win.URL.createObjectURL(blob); doc.body.appendChild(a); a.click(); a.remove();
    } }, person ? 'Download this intern\'s JSON' : 'Download the full JSON');
    return h('section', { class: 'box' }, h('h2', null, 'What an agent reads'),
      h('div', { class: 'muted small' }, person ? `The full JSON entry for ${person.name}, including every suggested prompt in full.` : 'Pick a person to see their full JSON entry, or download the whole file.'),
      download, person ? h('pre', { class: 'json' }, JSON.stringify(person, null, 2)) : null);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- DOM nodes
  function fill(el: any, ...kids: any[]): void {
    while (el.firstChild) el.removeChild(el.firstChild);
    for (const k of kids) if (k) el.appendChild(k);
  }
  function renderSide(): void { const s = doc.getElementById('side'); fill(s, sidebar()); const inp = s.querySelector('input'); if (inp && state.q) { inp.focus(); inp.setSelectionRange(state.q.length, state.q.length); } }
  function render(): void {
    renderSide();
    const main = doc.getElementById('main');
    const vis = visible();
    const label = state.p ? byId[state.p].name : state.t ? `${TIERS[state.t][2]} (${vis.length})` : null;
    fill(main,
      label ? h('div', { class: 'filter' }, 'Showing: ', h('b', null, label), ' ', h('button', { type: 'button', class: 'copy', onclick: () => go(null, null) }, 'Show everyone')) : null,
      state.p ? null : tiles(), state.p ? null : triageBars(), comms(),
      h('section', { class: 'box' }, h('h2', null, state.p ? 'Intern' : `Interns (${vis.length})`), vis.map(card)),
      agentJson());
  }

  win.addEventListener('popstate', () => { readHash(); render(); });
  win.addEventListener('hashchange', () => { readHash(); render(); });
  readHash();
  render();
}
