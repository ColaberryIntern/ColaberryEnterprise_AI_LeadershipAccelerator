/**
 * C124: the top of the report, in Ali's order: the one starred recommendation, the guided tour of the 10 most
 * impactful numbers, the summary overview chart; and further down, the decision timeline and the hypothesis board.
 */
'use strict';
const { esc, C, STATUS } = require('./charts');
const { rateOf } = require('./metrics');
const { grade } = require('./model');

const PILL = { good: 'Holding so far', bad: 'Not holding', low: 'Too few to judge', none: 'No data yet', retracted: 'Retracted' };

function starBanner(rec) {
  if (!rec.star) return '<section class="star"><div class="stars">★★★★★</div><h2>No move stands out this week</h2><p>Every step is on target or still being measured.</p></section>';
  const s = rec.star;
  const why = s.key === 'source'
    ? `${s.gap.worst.label} signs up ${s.gap.worst.rate}% of its visitors vs ${s.gap.best.label} ${s.gap.best.rate}%: about ${Math.round(s.short)} sign-ups lost.`
    : `This week ${s.n} of ${s.d} (${s.pct}%) against a target of ${s.target}%: about ${s.short} people short.`;
  const conf = s.conf < 1 ? ' Small sample: treat it as a strong lead, not a verdict.' : '';
  return `<section class="star" id="sec-star"><div class="stars" aria-label="Top recommendation">★★★★★</div>
    <div class="starkick">The one move with the greatest impact this week · ${esc(s.id)}</div>
    <h2>${esc(s.title)}</h2><p class="starwhy">${esc(why)}${esc(conf)}</p>
    <ol class="starhow">${s.how.map((h) => `<li>${esc(h)}</li>`).join('')}</ol>
    <div class="starfoot">Tests: <b>${esc(s.hypothesis.metric)} ${esc(s.hypothesis.op)} ${s.hypothesis.value}%</b> by next Wednesday ·
      ${s.executor === 'build' ? '🤖 Claude Code can build this: run the attached ONE_MOVE_PROMPT.md' : '🧑 Needs a person'} ·
      score ${s.score} = ${s.short} short × weight ${s.weight} × confidence ${s.conf} × ${s.executor === 'build' ? 'buildable 1' : 'needs a person 0.6'}${s.top && s.top < 1 ? ' × top of funnel 0.5' : ''}</div>
    ${rec.runnersUp.length ? `<div class="runners">Next in line: ${rec.runnersUp.map((r) => `<span>${esc(r.title)} <em>(${r.score})</em></span>`).join(' · ')}</div>` : ''}
    ${rec.measuring.length ? `<div class="runners">Being measured, not recommended again yet: ${rec.measuring.map((m) => `<span>${esc(m.by.title)} <em>(until ${esc(m.by.until)})</em></span>`).join(' · ')}</div>` : ''}
  </section>`;
}

/** The tour: 10 numbered stops; "Take the tour" walks the page stop by stop (plain links work without JS). */
function tour(stops) {
  const cards = stops.map((s) => `<li class="stop t-${s.tone}" data-anchor="${esc(s.anchor)}" data-text="${esc(s.text)}">
    <span class="sn">${s.rank}</span><span class="si">${s.icon}</span><span class="st"><b>${esc(s.text)}</b><br/><em>${esc(s.why)}</em></span>
    <a class="sg" href="#${esc(s.anchor)}">Show me →</a></li>`).join('');
  return `<section id="sec-tour"><h2>🧭 Tour guide: the 10 numbers that matter most this week</h2>
    <p class="lede">Ranked by impact: how far each is from target, how many people it touches, and how close it sits to the first win.
    <button type="button" class="tourbtn" id="tourStart">▶ Take the tour</button></p><ol class="stops">${cards}</ol></section>
    <div id="tourBox" class="tourbox" hidden><div id="tourText"></div><div class="tourctl"><button type="button" id="tourPrev">◀ Back</button>
      <span id="tourPos"></span><button type="button" id="tourNext">Next ▶</button><button type="button" id="tourEnd">✕</button></div></div>`;
}

const TOUR_JS = `(function(){var stops=[].slice.call(document.querySelectorAll('.stop'));if(!stops.length)return;var i=0,box=document.getElementById('tourBox');
function show(){stops.forEach(function(s){var el=document.getElementById(s.dataset.anchor);if(el)el.classList.remove('tourhi');});
var s=stops[i],el=document.getElementById(s.dataset.anchor)||s;el.classList.add('tourhi');el.scrollIntoView({behavior:'smooth',block:'start'});
document.getElementById('tourText').textContent=(i+1)+'. '+s.dataset.text;document.getElementById('tourPos').textContent=(i+1)+' of '+stops.length;box.hidden=false;}
document.getElementById('tourStart').onclick=function(){i=0;show();};document.getElementById('tourNext').onclick=function(){i=Math.min(stops.length-1,i+1);show();};
document.getElementById('tourPrev').onclick=function(){i=Math.max(0,i-1);show();};document.getElementById('tourEnd').onclick=function(){box.hidden=true;
document.querySelectorAll('.tourhi').forEach(function(e){e.classList.remove('tourhi');});};})();`;

const OVERVIEW_KEYS = [['seatClick', 'Clicked Save my seat'], ['formFinish', 'Finished the form'], ['enter', 'Entered the account'],
  ['play', 'Pressed play'], ['finish', 'Watched 75%+'], ['credit', 'Collected the credit'], ['check', 'Took the Quick check'], ['ace', 'Scored 5 of 5']];

/** Summary overview: every step's pass-through rate vs its target (Power BI bullet chart). */
function overviewRows(w, email, targets) {
  return OVERVIEW_KEYS.map(([key, label]) => {
    const r = rateOf(key, w, email);
    const g = r && r.d ? grade(key, r.n, r.d, targets) : { status: 'none', pct: null };
    return { key, label, n: r ? r.n : 0, d: r ? r.d : 0, pct: g.pct, status: g.status, target: targets.rates[key].good };
  });
}

function overviewSvg(rows) {
  const W = 760, rowH = 34, x0 = 190, span = 470;
  const body = rows.map((r, i) => {
    const y = i * rowH + 4, w = r.pct === null ? 0 : (Math.min(100, r.pct) / 100) * span, tx = x0 + (r.target / 100) * span;
    return `<text x="0" y="${y + 18}" font-size="12.5" fill="${C.ink}">${esc(r.label)}</text>
      <rect x="${x0}" y="${y + 4}" width="${span}" height="20" rx="4" fill="#edf2f7"/>
      <rect x="${x0}" y="${y + 4}" width="${Math.max(r.d ? 2 : 0, w)}" height="20" rx="4" fill="${STATUS[r.status] || C.blue}"/>
      <line x1="${tx}" x2="${tx}" y1="${y}" y2="${y + 28}" stroke="${C.navy}" stroke-width="2.5"/>
      <text x="${x0 + span + 10}" y="${y + 18}" font-size="12" font-weight="700" fill="${C.ink}">${r.d ? `${r.pct}%` : 'n/a'} <tspan fill="${C.mute}" font-weight="400">${r.d ? `(${r.n}/${r.d})` : ''}</tspan></text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${rows.length * rowH + 8}" role="img" aria-label="Summary overview" class="chart">${body}</svg>`;
}

function overview(w, email, targets) {
  return `<section id="sec-overview"><h2>📊 Summary overview: every step against its target</h2>
    <p class="lede">Bar = this week's pass-through from the step before. Dark line = target. Color = on target, watch, below, or too few to judge.</p>
    ${overviewSvg(overviewRows(w, email, targets))}</section>`;
}

function timeline(story) {
  const items = story.timeline.map((e) => `<li class="tl k-${e.kind}${e.superseded ? ' gone' : ''}"><span class="td">${esc(e.date)}</span>
    <span class="tk">${e.icon} ${esc(e.label)}</span><div class="tt">${esc(e.title)}</div>${e.detail ? `<div class="tx">${esc(e.detail)}</div>` : ''}
    <div class="tlinks">${e.ticket ? `<a href="${esc(e.ticket)}">ticket</a>` : ''}${e.pr ? ` · <a href="${esc(e.pr)}">PR</a>` : ''}${e.superseded ? ' · superseded' : ''}</div></li>`).join('');
  return `<section id="sec-story"><h2>🗺️ How we got here: the decision timeline</h2>
    <p class="lede">Every decision, change of direction, build, correction and hypothesis, oldest first. Nothing is deleted: a change of direction is a new entry.</p><ol class="timeline">${items}</ol></section>`;
}

function hypotheses(story) {
  const rows = story.hypotheses.map((h) => {
    const g = h.grade;
    return `<tr${g.status === 'retracted' ? ' class="gone"' : ''}><td>${esc(h.date.slice(0, 10))}</td><td>${esc(h.title)}</td>
      <td class="num">${esc(h.test.metric)} ${esc(h.test.op)} ${h.test.value}%</td><td class="num">${g.pct === undefined || g.pct === null ? 'n/a' : `${g.pct}% (${g.n}/${g.d})`}</td>
      <td><span class="pill p-${g.status === 'retracted' ? 'low' : g.status}">${esc(PILL[g.status] || g.label)}</span></td></tr>`;
  }).join('');
  return `<section id="sec-hyp"><h2>🔬 Hypothesis board</h2><p class="lede">Every bet we have made, graded against this week's numbers.</p>
    <table class="tbl"><thead><tr><th>Made</th><th>Hypothesis</th><th>Test</th><th>This week</th><th>Verdict</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

const LEAD_CSS = `
.star{background:linear-gradient(135deg,#fffaf0 0%,#fff 60%);border:2px solid #d69e2e}.stars{color:#d69e2e;font-size:26px;letter-spacing:4px}
.starkick{font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:#975a16;font-weight:700}.star h2{font-size:22px;margin:4px 0 6px}
.starwhy{font-size:15px;margin:0 0 8px}.starhow{margin:0 0 10px 18px;padding:0}.starhow li{margin:3px 0}.starfoot{font-size:12.5px;color:var(--mute)}
.runners{font-size:12.5px;color:var(--mute);margin-top:6px}.runners em{font-style:normal}
.stops{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:10px}
.stop{display:flex;align-items:flex-start;gap:10px;border:1px solid var(--line);border-left:5px solid var(--blue);border-radius:10px;padding:10px 12px;background:#fbfcfe}
.stop.t-bad{border-left-color:var(--bad)}.stop.t-warn{border-left-color:var(--ok)}.stop.t-good{border-left-color:var(--good)}
.sn{background:var(--navy);color:#fff;border-radius:50%;min-width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:12px}
.si{font-size:18px}.st{flex:1;font-size:13px}.st em{color:var(--mute);font-style:normal;font-size:12px}.sg{font-size:12px;white-space:nowrap;color:var(--blue);text-decoration:none;font-weight:600}
.tourbtn{margin-left:8px;background:var(--navy);color:#fff;border:0;border-radius:999px;padding:5px 14px;font-weight:700;cursor:pointer}
.tourbox{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);width:min(680px,calc(100% - 32px));background:var(--navy);color:#fff;border-radius:12px;padding:12px 16px;box-shadow:0 8px 30px rgba(0,0,0,.25);z-index:50}
.tourctl{display:flex;gap:8px;align-items:center;margin-top:8px}.tourctl button{background:#fff;color:var(--navy);border:0;border-radius:6px;padding:3px 10px;font-weight:700;cursor:pointer}
.tourctl span{flex:1;text-align:center;font-size:12px;opacity:.8}.tourhi{outline:4px solid #d69e2e;outline-offset:4px}
.timeline{list-style:none;margin:0;padding:0 0 0 14px;border-left:3px solid var(--line)}.tl{position:relative;margin:0 0 14px 0;padding-left:14px}
.tl::before{content:'';position:absolute;left:-23px;top:4px;width:13px;height:13px;border-radius:50%;background:var(--blue);border:3px solid #fff}
.tl.k-pivot::before{background:#805ad5}.tl.k-correction::before,.tl.k-retraction::before{background:var(--ok)}.tl.k-build::before{background:var(--good)}.tl.k-hypothesis::before{background:#d69e2e}
.td{font-size:12px;color:var(--mute);margin-right:8px}.tk{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:var(--navy)}
.tt{font-weight:600}.tx{font-size:13px;color:var(--ink)}.tlinks{font-size:12px}.tlinks a{color:var(--blue)}.gone,.gone .tt{text-decoration:line-through;opacity:.6}
@media (max-width:900px){.stops{grid-template-columns:1fr}}`;

module.exports = { starBanner, tour, overview, overviewRows, timeline, hypotheses, TOUR_JS, LEAD_CSS };
