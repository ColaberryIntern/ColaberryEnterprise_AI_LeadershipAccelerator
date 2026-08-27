// ============================================================================
// sessionKitDocService — renders the full interactive Class Kit teaching deck
// (the Open-House-style HTML that runs a class) for one live session.
//
// Reuses buildSessionKit for the session facts + student check-in QR + cohort +
// meeting link, then buildKitSpec (run of show + slides from the week blueprint)
// and renderKitHtml (self-contained deck). Returns a complete HTML document the
// admin opens in a new tab and shares on screen while teaching.
//
// Live pulse is off here (the deck runs standalone). Wiring the live-state feed
// is a follow-up; renderKitHtml already accepts a { live } config for it.
// ============================================================================
import QRCode from 'qrcode';
import { env } from '../config/env';
import { buildSessionKit } from './sessionKitService';
import { buildKitSpec } from './classKit/kitSpecDaySlides';
import { renderKitHtml, modeForSlide } from './classKit/kitHtml';
import { renderClassOutline } from './classKit/outlineHtml';
import { mintKitToken } from './classKit/kitToken';
import { getKitConfig } from './sessionKitConfigService';

/**
 * Render the plain-language CLASS OUTLINE for a session — a one-page teaching plan
 * (segments, time windows, the teaching points under each) to review and prepare
 * from. Same content as the deck, read as a lesson plan. Null if session missing.
 */
export async function renderSessionOutline(sessionId: string): Promise<string | null> {
  const kit = await buildSessionKit(sessionId);
  if (!kit) return null;
  const config = await getKitConfig(sessionId);
  const spec = buildKitSpec({
    session: kit.session,
    cohortName: kit.cohort_name,
    checkinUrl: kit.checkin_url,
    qrSvg: kit.qr_svg,
    meetLink: kit.meeting_link,
    config,
  });
  return renderClassOutline(spec);
}

export type KitDocMode = 'live' | 'rehearse' | 'standalone';

/**
 * Render the Class Kit deck HTML for a session. Returns null if the session does
 * not exist (caller maps that to a 404). Deterministic.
 *   • 'live'       — full live pulse/sync (default; used by ▶ Present).
 *   • 'rehearse'   — live OFF so practising doesn't broadcast to students.
 *   • 'standalone' — live OFF, for the downloadable offline file.
 */
export async function renderSessionKitDoc(sessionId: string, mode: KitDocMode = 'live'): Promise<string | null> {
  const kit = await buildSessionKit(sessionId);
  if (!kit) return null;

  const config = await getKitConfig(sessionId);
  const spec = buildKitSpec({
    session: kit.session,
    cohortName: kit.cohort_name,
    checkinUrl: kit.checkin_url,
    qrSvg: kit.qr_svg,
    meetLink: kit.meeting_link,
    config,
  });

  if (mode !== 'live') {
    // Rehearse / offline: no broadcast, no live-state polling.
    return renderKitHtml(spec, { live: { enabled: false } });
  }

  // Enable the live pulse: the deck (opened via document.write into an about:blank
  // window) polls the session-scoped live-state endpoint with a short-lived kit
  // token. The endpoint must be ABSOLUTE — a relative URL won't resolve from an
  // about:blank document — and it stays same-origin as the admin page (which
  // inherited that origin), so the fetch needs no CORS and no cookies.
  const base = (env.frontendUrl || 'https://enterprise.colaberry.ai').replace(/\/+$/, '');
  return renderKitHtml(spec, {
    live: {
      enabled: true,
      endpoint: `${base}/api/portal/sessions/${sessionId}/live-state`,
      broadcastEndpoint: `${base}/api/portal/sessions/${sessionId}/broadcast`,
      token: mintKitToken(sessionId),
      pollMs: 4000,
    },
  });
}

/**
 * The instructor's OWN phone view — a small, self-contained, dark, high-
 * contrast page that polls the current slide's script/talking-points and a
 * preview of what's next. Never shown on the projected/shared deck; opened
 * only on the presenter's own device. Reuses the same kit-token pattern as
 * the deck's own live-state polling (no participant login, no new auth
 * mechanism) — the token is scoped to this one session and expires in 12h.
 * Null if session missing.
 */
export async function renderPresenterPage(sessionId: string): Promise<string | null> {
  const kit = await buildSessionKit(sessionId);
  if (!kit) return null;

  const base = (env.frontendUrl || 'https://enterprise.colaberry.ai').replace(/\/+$/, '');
  const token = mintKitToken(sessionId);
  const endpoint = `${base}/api/portal/sessions/${sessionId}/presenter-notes?t=${encodeURIComponent(token)}`;

  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Presenter notes</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#12141a;color:#f2f0ee;font-family:"Segoe UI",Roboto,Arial,sans-serif;
    min-height:100vh;display:flex;flex-direction:column;padding:18px 18px 40px}
  .lbl{font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#f43f5e;margin-bottom:4px}
  .seg{font-size:13px;color:#9aa2b1;margin-bottom:18px}
  .tip{font-size:clamp(20px,5.5vw,30px);line-height:1.42;font-weight:600;flex:1;white-space:pre-wrap}
  .tip.empty{color:#6b7385;font-weight:400;font-style:italic}
  /* The preface is direction you read silently; the tip is the text you say
     out loud. Deliberately different weights and sizes, because in a dark room
     mid-class the two must never be mistaken for each other at a glance. */
  .pre{font-size:clamp(16px,4.2vw,21px);line-height:1.5;font-weight:500;flex:1;
    white-space:pre-wrap;color:#cbd5e1}
  .pre.empty{color:#6b7385;font-weight:400;font-style:italic}
  .hint{margin-top:14px;font-size:12px;color:#4b5263;font-style:italic}

  /* Colour IS the instruction here. Glancing down mid-sentence, the instructor
     has to know in under a second whether a line is theirs to SAY, theirs to
     DO, or just context — having to read a paragraph to find out is exactly
     the dead pause this exists to remove. One colour per role, used
     identically on both screens, each with a leading rule and a word label so
     the role survives a bright room, low screen brightness, or colour
     blindness. */
  .ln{display:block;padding:9px 12px;margin-bottom:8px;border-radius:8px;
    border-left:4px solid transparent;white-space:pre-wrap}
  .ln-tag{display:block;font-size:10px;font-weight:800;letter-spacing:1.4px;
    text-transform:uppercase;margin-bottom:3px}
  /* SAY — the words that leave your mouth. Warmest and highest contrast: on
     the read screen this must be the only thing that catches the eye. */
  .ln-say{background:rgba(251,191,36,.10);border-left-color:#fbbf24;color:#fde9b8}
  .ln-say .ln-tag{color:#fbbf24}
  /* DO — hands on the keyboard: run it, click it, put it on screen. */
  .ln-do{background:rgba(56,189,248,.10);border-left-color:#38bdf8;color:#bae6fd}
  .ln-do .ln-tag{color:#38bdf8}
  /* NOTE — commentary and pacing. Deliberately the quietest of the three. */
  .ln-note{background:rgba(148,163,184,.08);border-left-color:#64748b;color:#b6c0cd}
  .ln-note .ln-tag{color:#94a3b8}
  /* The prompt brief keeps its own colour, so "there is something to run on
     this step" can never blend into the commentary sitting next to it. */
  .ln-run{background:rgba(244,63,94,.10);border-left-color:#f43f5e;color:#fecdd3;
    font-size:15px;line-height:1.45}
  .ln-run .ln-tag{color:#f43f5e}
  /* On the read screen the spoken lines carry the whole slide, so they take
     the full display size the single blob used to have. */
  #tip .ln-say{font-size:clamp(20px,5.4vw,30px);line-height:1.4;font-weight:600;
    padding:12px 14px}
  .next{margin-top:22px;padding-top:16px;border-top:1px solid #2b2f3a;font-size:14px;color:#9aa2b1}
  .next b{color:#e2e8f0;font-weight:700}
  .stale{position:fixed;top:10px;right:14px;font-size:10px;color:#6b7385;letter-spacing:.5px}
  .err{color:#f59e0b;font-size:13px;margin-top:10px}
  /* Live poll results. Read-only by construction — bars and counts, no tap
     targets — so this view watches the room without ever voting in it. */
  .poll{margin-top:18px;padding-top:14px;border-top:1px solid #2b2f3a}
  .poll-hd{font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;
    color:#38bdf8;margin-bottom:10px}
  .prow{margin-bottom:9px}
  .ptop{display:flex;justify-content:space-between;gap:10px;font-size:14px;line-height:1.3}
  .pname{color:#e2e8f0}
  .pnum{color:#38bdf8;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
  .pbar{height:7px;border-radius:4px;background:#232833;margin-top:4px;overflow:hidden}
  .pfill{height:100%;background:#38bdf8;border-radius:4px;transition:width .4s ease}
</style></head>
<body>
  <div class="stale" id="upd"></div>
  <div class="lbl" id="lbl">Set up — read this</div>
  <div class="seg" id="seg">Waiting for the deck to open…</div>
  <div class="pre empty" id="pre">Open the deck — this fills in the moment you land on a slide.</div>
  <div class="tip empty" id="tip" style="display:none"></div>
  <div class="hint" id="hint"></div>
  <div class="poll" id="poll" style="display:none"><div class="poll-hd">Live results · you are watching, not voting</div><div id="prows"></div></div>
  <div class="next" id="next"></div>
  <div class="err" id="err"></div>
<script>
(function(){
  var endpoint = ${JSON.stringify(endpoint)};
  var segEl = document.getElementById('seg'), tipEl = document.getElementById('tip'),
      preEl = document.getElementById('pre'), lblEl = document.getElementById('lbl'),
      hintEl = document.getElementById('hint'),
      pollEl = document.getElementById('poll'), prowsEl = document.getElementById('prows'),
      nextEl = document.getElementById('next'), updEl = document.getElementById('upd'),
      errEl = document.getElementById('err');
  var lastTip = null, lastPre = null, lastPoll = null;
  function esc(s){ return String(s).replace(/[&<>]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]; }); }
  // Turn tagged script lines into colour-coded blocks. A line's leading tag
  // decides its role; anything untagged inherits the block's default role, so
  // a week authored before the tags existed still renders, just in one colour.
  function paint(text, dflt){
    var lines = String(text || '').split('\\n');
    var out = [], buf = [], role = dflt;
    function flush(){
      if (!buf.length) return;
      var label = { say: 'Say this', do: 'Do this', note: 'Context', run: 'To run' }[role] || 'Context';
      out.push('<span class="ln ln-' + role + '"><span class="ln-tag">' + label + '</span>'
        + esc(buf.join('\\n')) + '</span>');
      buf = [];
    }
    lines.forEach(function(raw){
      var l = raw.trim();
      if (!l) return;
      var m = /^(SAY|DO|NOTE):\\s*/i.exec(l);
      var isRun = /^[▶○📖]/.test(l);
      if (m) { flush(); role = m[1].toLowerCase(); buf.push(l.slice(m[0].length)); }
      else if (isRun) { flush(); role = 'run'; buf.push(l); }
      else if (role === 'run') { buf.push(l); }
      else { buf.push(l); }
    });
    flush();
    return out.join('');
  }
  function tick(){
    fetch(endpoint).then(function(r){
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function(d){
      errEl.textContent = '';
      segEl.textContent = (d.segment_label || '') + (d.title ? ' — ' + d.title : '');

      // Two modes, switched by whether the diagram is full-screened on the
      // projected deck. Landed on the slide: the PREFACE — what this step is,
      // whether there is a prompt, what it will do. Diagram full-screened:
      // the room is looking at the picture and nothing else, so this becomes
      // the paragraph to actually read out.
      var showTip = !!d.diagram_fullscreen;
      tipEl.style.display = showTip ? '' : 'none';
      preEl.style.display = showTip ? 'none' : '';
      lblEl.textContent = showTip ? 'Read this out' : 'Set up — read this';
      hintEl.textContent = showTip
        ? 'Click the diagram again to come back to the set-up notes.'
        : 'Click the diagram on the deck when you are ready to read.';
      if (showTip) {
        var tip = d.presenter_tip || '';
        if (tip !== lastTip) {
          lastTip = tip;
          // Everything on this screen is spoken, so it all paints as SAY.
          tipEl.innerHTML = tip ? paint(tip, 'say')
            : '<span class="ln ln-note"><span class="ln-tag">Context</span>'
              + 'No spoken lines for this slide — keep talking from the diagram.</span>';
          tipEl.classList.toggle('empty', !tip);
        }
      } else {
        var pre = d.presenter_preface || '';
        if (pre !== lastPre) {
          lastPre = pre;
          // Nothing here is spoken; untagged text is context by default.
          preEl.innerHTML = pre ? paint(pre, 'note')
            : '<span class="ln ln-note"><span class="ln-tag">Context</span>'
              + 'No set-up notes for this slide.</span>';
          preEl.classList.toggle('empty', !pre);
        }
      }

      // Live results while a question is on screen. Rendered from counts only
      // — no names, no option buttons — so watching the room form an answer
      // can never turn into voting in it.
      var poll = d.poll || null;
      pollEl.style.display = poll ? '' : 'none';
      var sig = poll ? JSON.stringify(poll) : null;
      if (sig !== lastPoll) {
        lastPoll = sig;
        if (poll) {
          var total = poll.total || 0;
          prowsEl.innerHTML = (poll.options || []).map(function(o, idx){
            var n = (poll.tally || [])[idx] || 0;
            var pct = total ? Math.round((n / total) * 100) : 0;
            return '<div class="prow"><div class="ptop"><span class="pname">' + esc(o) + '</span>'
              + '<span class="pnum">' + n + ' · ' + pct + '%</span></div>'
              + '<div class="pbar"><div class="pfill" style="width:' + pct + '%"></div></div></div>';
          }).join('') + '<div class="ptop" style="margin-top:10px"><span class="pname">Answered</span><span class="pnum">' + total + '</span></div>';
        }
      }

      nextEl.innerHTML = d.next_title ? '<b>Next:</b> ' + esc(d.next_title) : '';
      if (d.updated_at) {
        var secs = Math.max(0, Math.round((Date.now() - new Date(d.updated_at).getTime()) / 1000));
        updEl.textContent = secs < 8 ? 'live' : secs + 's ago';
      }
    }).catch(function(e){ errEl.textContent = 'Connection hiccup — retrying… (' + e.message + ')'; });
  }
  tick();
  setInterval(tick, 2500);
})();
</script>
</body></html>`;
}

/**
 * Self-service link for the instructor's own presenter page — an admin-only
 * endpoint (not a public/token-guessable one) that mints a fresh kit token
 * and hands back the URL + a scannable QR, so getting to the presenter page
 * on a phone never requires anyone to manually mint a token. Every call
 * mints a NEW 12h token; the QR is generated fresh each time, never cached,
 * and this is deliberately a separate call from buildSessionKit's own
 * qr_svg (the student check-in QR) so the two never end up on the same
 * response payload or printed handout. Null if session missing.
 */
export async function getPresenterLink(sessionId: string): Promise<{ url: string; qrSvg: string } | null> {
  const kit = await buildSessionKit(sessionId);
  if (!kit) return null;
  const base = (env.frontendUrl || 'https://enterprise.colaberry.ai').replace(/\/+$/, '');
  const token = mintKitToken(sessionId);
  const url = `${base}/api/portal/sessions/${sessionId}/presenter-page?t=${encodeURIComponent(token)}`;
  const qrSvg = await QRCode.toString(url, { type: 'svg', margin: 1, width: 240 });
  return { url, qrSvg };
}

/**
 * A lightweight instructor readiness report: class facts, counts (teaching slides,
 * prompts, checkpoints, interactions, diagrams), and the source/evidence ledger.
 * Read before class to prep + to review what's sourced. Null if session missing.
 */
export async function renderSessionReadinessReport(sessionId: string): Promise<string | null> {
  const kit = await buildSessionKit(sessionId);
  if (!kit) return null;
  const config = await getKitConfig(sessionId);
  const spec = buildKitSpec({
    session: kit.session, cohortName: kit.cohort_name,
    checkinUrl: kit.checkin_url, qrSvg: kit.qr_svg, meetLink: kit.meeting_link,
    config,
  });

  const esc = (s: unknown) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as Record<string, string>)[c]);
  const slides = spec.slides;
  const count = (fn: (s: typeof slides[number]) => boolean) => slides.filter(fn).length;
  const teach = count((s) => s.kind === 'teach');
  const prompts = count((s) => !!s.prompt);
  const checkpoints = count((s) => s.kind === 'checkpoint');
  const interactions = count((s) => s.kind === 'interaction');
  const diagrams = count((s) => !!s.diagram);
  const evidence = config.evidenceOverrides ?? slides.flatMap((s) => s.evidence || []);
  const hasMeet = !!kit.meeting_link;

  // Visual readiness: mode mix, visual page types, and the coding-prompt/lecture
  // hygiene checks from the storytelling upgrade (PR #? — see PROGRESS.md).
  const modes = slides.map((s) => modeForSlide(s));
  const modeCount = (m: 'teach' | 'story' | 'build') => modes.filter((x) => x === m).length;
  const storyPages = count((s) => s.kind === 'hook' || s.kind === 'beforeafter');
  const theaterPolls = count((s) => !!s.interaction?.theater);
  const promptsMissingResult = slides.filter((s) => s.prompt && (!s.prompt.expectedResult || !s.prompt.stopCondition)).length;
  // Longest run of consecutive plain teach-mode pages with no diagram/visual —
  // the "no more than two text-heavy pages in a row" rule from the storytelling plan.
  let maxTextStreak = 0, curStreak = 0;
  for (const s of slides) {
    const textHeavy = modeForSlide(s) === 'teach' && !s.diagram && s.kind !== 'cover' && s.kind !== 'rules';
    curStreak = textHeavy ? curStreak + 1 : 0;
    if (curStreak > maxTextStreak) maxTextStreak = curStreak;
  }

  const gate = (ok: boolean, label: string) => `<li class="${ok ? 'ok' : 'warn'}">${ok ? '✅' : '⚠️'} ${esc(label)}</li>`;
  const evidenceRows = evidence.length
    ? evidence.map((e) => `<li><b>${esc(e.publisher)}</b>${e.sourceTitle ? ' · ' + esc(e.sourceTitle) : ''}${e.publicationDate ? ' (' + esc(e.publicationDate) + ')' : ''}${e.note ? ' — <i>' + esc(e.note) + '</i>' : ''}<br><span class="claim">“${esc(e.claim)}”</span></li>`).join('')
    : '<li>No sourced factual claims flagged for this class.</li>';

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Readiness · ${esc(spec.meta.dayLabel)} · ${esc(spec.meta.title)}</title>
<style>
  body{font-family:"Segoe UI",Roboto,Arial,sans-serif;color:#1a202c;max-width:760px;margin:0 auto;padding:30px 22px 70px;line-height:1.5}
  h1{font-size:26px;margin:4px 0} .kick{color:#E5121D;font-weight:800;letter-spacing:2px;text-transform:uppercase;font-size:12px}
  .meta{color:#64748b;margin-bottom:16px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin:14px 0}
  .stat{background:#faf7f5;border:1px solid #e8e2de;border-radius:10px;padding:12px;text-align:center}
  .stat b{display:block;font-size:26px} .stat span{font-size:12px;color:#64748b}
  h2{font-size:17px;margin:22px 0 8px;color:#1a365d} ul{margin:6px 0;padding-left:20px} li{margin:5px 0}
  li.warn{color:#a26208} .claim{color:#475569;font-size:13.5px}
  .foot{margin-top:24px;color:#94a3b8;font-size:12px;border-top:1px solid #e8e2de;padding-top:12px}
</style></head><body>
<div class="kick">Readiness · ${esc(spec.meta.cohortName)} · ${esc(spec.meta.dayLabel)}</div>
<h1>${esc(spec.meta.title)}</h1>
<div class="meta">${esc(spec.meta.dateLabel)} · ${esc(spec.meta.timeRange)} · ${spec.meta.durationMin} min</div>
<div class="grid">
  <div class="stat"><b>${slides.length}</b><span>slides</span></div>
  <div class="stat"><b>${teach}</b><span>teaching</span></div>
  <div class="stat"><b>${prompts}</b><span>prompts</span></div>
  <div class="stat"><b>${checkpoints}</b><span>checkpoints</span></div>
  <div class="stat"><b>${interactions}</b><span>polls/trivia</span></div>
  <div class="stat"><b>${diagrams}</b><span>diagrams</span></div>
</div>
<h2>Presentation mix</h2>
<div class="grid">
  <div class="stat"><b>${modeCount('teach')}</b><span>Teach mode</span></div>
  <div class="stat"><b>${modeCount('story')}</b><span>Story mode</span></div>
  <div class="stat"><b>${modeCount('build')}</b><span>Build mode</span></div>
  <div class="stat"><b>${storyPages}</b><span>hook/before-after</span></div>
  <div class="stat"><b>${theaterPolls}</b><span>Decision Theater</span></div>
</div>
<h2>Active configuration</h2>
<ul>
  <li>Story beats: ${config.storyBeats.enabled ? `on${config.storyBeats.max != null ? ` · capped at ${config.storyBeats.max}` : ''}${config.storyBeats.overrides ? ' · custom set' : ' · authored defaults'}` : 'off'}</li>
  <li>Live Decision Theater: ${config.theaterEnabled ? 'on' : 'off (polls render as the normal inline poll)'}</li>
  <li>Build Bay detail rows: ${config.buildBayDetail ? 'on' : 'off (prompt + rescue only)'}</li>
  <li>Evidence sources: ${config.evidenceOverrides ? `custom (${config.evidenceOverrides.length})` : 'authored defaults'}</li>
  <li>Change any of this from <b>Present ▾ → ⚙️ Customize</b> — it applies the next time this page or the deck is opened.</li>
</ul>
<h2>Readiness gates</h2>
<ul>
  ${gate(slides.length >= 12, `Content depth — ${slides.length} slides (${teach} teaching)`)}
  ${gate(spec.totalMinutes > 0, `Timing — ${spec.totalMinutes} min run of show`)}
  ${gate(hasMeet, hasMeet ? 'Meeting link generated' : 'No meeting link yet — generate one from the session row')}
  ${gate(spec.meta.dayKind === 'orientation' || prompts > 0, spec.meta.dayKind === 'build' ? `Build prompts present (${prompts})` : 'Prompts present where expected')}
  ${gate(true, 'QR check-in embedded on the cover + full-screen (Q)')}
  ${gate(maxTextStreak <= 2, maxTextStreak <= 2 ? 'No more than 2 text-heavy pages in a row' : `${maxTextStreak} text-heavy pages in a row — consider a hook, diagram, or before/after to break it up`)}
  ${prompts > 0 ? gate(promptsMissingResult === 0, promptsMissingResult === 0 ? 'Every prompt has an expected result + stop condition' : `${promptsMissingResult}/${prompts} prompts missing an expected result or stop condition`) : ''}
</ul>
<h2>Source / evidence ledger</h2>
<ul>${evidenceRows}</ul>
<h2>Before you present</h2>
<ul>
  <li>Open <b>▶ Present</b> and press <b>Start class</b> to arm the pace tracker.</li>
  <li>The check-in QR is on slide 1; students scan once and their phones follow the deck.</li>
  <li><b>N</b> = presenter notes/script · <b>V</b> = Focus (clean recording) · <b>C</b> = Compact (side-by-side with Claude Code) · <b>Q</b> = full-screen QR.</li>
  <li>If live sync drops, the class content still works — keep teaching; the pace tracker is client-side.</li>
</ul>
<div class="foot">Readiness report · generated from the Class Kit · AI Systems Architect Accelerator</div>
</body></html>`;
}
