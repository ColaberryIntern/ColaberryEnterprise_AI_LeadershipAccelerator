/**
 * The in-deck browser script for generated Weekly Live decks (WL4.2), generated from the hand-built
 * Session 3 deck (backend/src/scripts/session-decks/nov2026-session3-followalong/deck-script.html)
 * with its session-specific ids removed. It reads window.__KITLIVE__ (injected by customDeck.ts) and
 * the #deckdata JSON, broadcasts each slide with its follow-along card, prompt or poll, runs the poll
 * slides, and drives the presenter side window (P). Plain ES5: it runs in whatever browser Ali uses.
 */
export function deckScript(): string {
  return `<script>(function(){
  var K = window.__KITLIVE__ || { enabled: false };
  var LIVE = !!(K.enabled && K.liveStateUrl && K.broadcastUrl && K.token);
  var DATA = JSON.parse(document.getElementById('deckdata').textContent);
  var slides = [].slice.call(document.querySelectorAll('.slide'));
  var notes = document.getElementById('notes'), counter = document.getElementById('counter'), progress = document.getElementById('progress');
  var pill = document.getElementById('livepill'), pnbtn = document.getElementById('pnbtn');
  var i = 0, notesOn = false, seq = 0, live = null, lastPresent = -1;
  var DECK_ID = 'wl-' + Math.random().toString(36).slice(2, 10);
  var pstate = {};
  var CLAUDE = 'https://claude.ai/new?q=';
  var PLAN = []; (function(){ var t = 0; DATA.forEach(function(d){ PLAN.push(t); t += Number(d.min || 0); }); })();
  var slideStart = Date.now(), classStart = null;
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
  if (LIVE) { pill.textContent = 'LIVE'; pill.className = 'on'; }

  /* ---- QR + check-in URL from the platform ---- */
  if (K.qrSvg) document.querySelectorAll('[data-qr]').forEach(function(el){ el.innerHTML = K.qrSvg; });
  document.querySelectorAll('[data-checkin]').forEach(function(el){ el.textContent = K.checkinUrl ? K.checkinUrl.replace(/^https?:\\/\\//, '') : 'link shown in the Zoom chat'; });

  /* ---- prompt cards on the projected slide: Open in Claude + Copy (for Ali's own demo) ---- */
  slides.forEach(function(s, k){
    var d = DATA[k]; if (!d || !d.prompt) return;
    var a = s.querySelector('[data-claude]'); if (a) a.href = CLAUDE + encodeURIComponent(d.prompt.text);
  });
  function copyText(t, btn){
    var done = function(){ if (btn) { var o = btn.textContent; btn.textContent = 'Copied ✓'; setTimeout(function(){ btn.textContent = o; }, 1400); } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, done); else done();
  }

  /* ---- poll slides, built from data-* (same markup as the Open House) ---- */
  slides.forEach(function(s){
    if (!s.dataset.poll) return;
    var opts = JSON.parse(s.dataset.options);
    var kindLabel = s.dataset.kind === 'trivia' ? '● Live trivia' : s.dataset.kind === 'prediction' ? '● Live prediction' : '● Live poll';
    s.innerHTML =
      '<div class="pollhead"><div class="wordmark white"></div><span class="plabel">' + kindLabel + '</span><span class="pstate">Voting open</span>' + (LIVE ? '' : '<span class="pnolive">rehearsal · live voting off</span>') +
      '<span class="spacer"></span><div class="qrmini"><div class="q">' + (K.qrSvg || '') + '</div><span>scan to<br>vote</span></div></div>' +
      '<div class="pq">' + esc(s.dataset.q) + '</div>' +
      '<div class="pvoted"><b data-voted>0</b> voted</div>' +
      '<div class="popts">' + opts.map(function(o, k){ return '<div class="popt" data-idx="' + k + '"><div class="fill"></div><span class="lab">' + String.fromCharCode(65 + k) + '. ' + esc(o) + '</span><span class="num"></span></div>'; }).join('') + '</div>' +
      '<div class="pctrl"><button class="pbtn" data-act="lock">🔒 Lock vote</button><button class="pbtn primary" data-act="reveal" style="display:none">🎉 Reveal</button><button class="pbtn" data-act="reopen" style="display:none">↩ Reopen</button></div>' +
      (s.dataset.reveal ? '<div class="preveal">' + esc(s.dataset.reveal) + '</div>' : '') +
      '<div class="pright"></div>';
  });

  function question(s){
    if (!s.dataset.poll) return null;
    var st = pstate[s.dataset.poll] || 'voting';
    return { key: s.dataset.poll, kind: s.dataset.kind || 'poll', q: s.dataset.q, options: JSON.parse(s.dataset.options),
      answer: s.dataset.answer != null ? Number(s.dataset.answer) : null, revealed: st === 'revealed', theater: { state: st } };
  }

  /* ---- broadcast: what every phone + computer shows ---- */
  function broadcast(){
    if (!LIVE) return;
    var s = slides[i], d = DATA[i], q = question(s);
    var body = {
      slide_index: i, slide_id: s.dataset.poll || ('wl-' + i), title: d.title || '', segment_label: 'Weekly Live',
      phase: q ? 'question' : d.prompt ? 'prompt' : 'status', question: q,
      prompt: d.prompt ? { label: d.prompt.label, prompt: d.prompt.text, pasteWhere: 'Claude', expectedResult: d.prompt.expect || undefined } : null,
      follow: d.follow || null,
      presenter_tip: (d.say || []).join(' · ') + (d.read ? '\\n\\nREAD: ' + d.read : '') + (d.clip ? '\\n\\nCLIP: ' + d.clip : ''),
      presenter_preface: d.do || '',
      next_title: i + 1 < DATA.length ? DATA[i + 1].title : 'End of the show',
      seq: Date.now() * 10 + (seq++ % 10), deck_id: DECK_ID,
    };
    fetch(K.broadcastUrl + '?t=' + encodeURIComponent(K.token), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(function(){});
  }

  /* ---- live state: the moving numbers ---- */
  function poll(){
    if (!LIVE) return;
    fetch(K.liveStateUrl + '?t=' + encodeURIComponent(K.token), { headers: { Accept: 'application/json' } })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(d){ if (d) { live = d; render(); renderPresenter(); } })
      .catch(function(){});
  }
  function bump(el){ el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); setTimeout(function(){ el.classList.remove('bump'); }, 220); }
  function render(){
    var s = slides[i];
    var present = (live && live.present) || 0;
    document.querySelectorAll('[data-present]').forEach(function(el){ if (String(present) !== el.textContent) { el.textContent = present; if (present > lastPresent && lastPresent >= 0) bump(el); } });
    lastPresent = present;
    if (!s.dataset.poll) return;
    var key = s.dataset.poll, st = pstate[key] || 'voting';
    var p = live && live.poll && live.poll.key === key ? live.poll : null;
    var tally = (p && p.tally) || [], total = (p && p.total) || 0;
    var votedEl = s.querySelector('[data-voted]');
    if (votedEl && votedEl.textContent !== String(total)) { votedEl.textContent = total; bump(votedEl); }
    var badge = s.querySelector('.pstate');
    badge.className = 'pstate ' + st; badge.textContent = st === 'locked' ? '🔒 Vote locked' : st === 'revealed' ? '✅ Results' : 'Voting open';
    s.querySelector('[data-act="lock"]').style.display = st === 'voting' ? '' : 'none';
    s.querySelector('[data-act="reveal"]').style.display = st === 'locked' ? '' : 'none';
    s.querySelector('[data-act="reopen"]').style.display = st === 'locked' ? '' : 'none';
    var ans = s.dataset.answer != null ? Number(s.dataset.answer) : -1;
    s.querySelectorAll('.popt').forEach(function(row){
      var k = Number(row.dataset.idx), n = tally[k] || 0, pct = total ? Math.round(n / total * 100) : 0;
      row.querySelector('.fill').style.width = pct + '%';
      row.querySelector('.num').textContent = n + ' · ' + pct + '%';
      row.classList.toggle('correct', st === 'revealed' && k === ans);
    });
    var rv = s.querySelector('.preveal'); if (rv) rv.style.display = st === 'revealed' ? 'block' : 'none';
    var right = s.querySelector('.pright'), names = (p && p.correctResponders) || null;
    if (right) {
      if (st === 'revealed' && names && names.length) { right.textContent = '✅ Got it right: ' + names.join(', '); right.style.display = 'block'; }
      else right.style.display = 'none';
    }
  }
  function confetti(){
    var colors = ['#FB2832', '#5BA63C', '#F5C542', '#367895', '#ffffff', '#E8920C'];
    for (var c = 0; c < 110; c++) {
      var b = document.createElement('i'); b.className = 'confetti';
      b.style.left = Math.random() * 100 + 'vw'; b.style.background = colors[c % colors.length];
      b.style.animationDelay = Math.random() * .7 + 's'; b.style.animationDuration = 1.9 + Math.random() * 1.7 + 's';
      document.body.appendChild(b);
      setTimeout((function(el){ return function(){ if (el.parentNode) el.parentNode.removeChild(el); }; })(b), 4600);
    }
  }
  function pollAct(act){
    var s = slides[i], key = s.dataset.poll; if (!key) return;
    pstate[key] = act === 'lock' ? 'locked' : act === 'reveal' ? 'revealed' : 'voting';
    if (act === 'reveal') confetti();
    broadcast(); render(); renderPresenter(); setTimeout(poll, 400);
  }

  /* ================= presenter window ================= */
  var pw = null, autoTried = false;
  var checked = {};   // slide index -> {phrase index: true}
  var PCSS = 'body{margin:0;background:#0b1220;color:#e7eef6;font-family:"Segoe UI",Roboto,Arial,sans-serif;font-size:16px;line-height:1.45}' +
    '#pv{padding:12px 14px 80px}.top{display:flex;align-items:baseline;gap:10px}.num{font-size:34px;font-weight:900;color:#ff6a71}.of{color:#7f93ab;font-weight:700}' +
    '.ttl{font-size:20px;font-weight:800;margin:2px 0 10px;line-height:1.25}' +
    '.clocks{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}.clk{border-radius:12px;padding:8px 10px;background:#16233a}.clk b{display:block;font-size:24px;font-variant-numeric:tabular-nums}.clk span{font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#9fb3c8;font-weight:800}' +
    '.ok b{color:#8fd16b}.warn b{color:#ffc04d}.over b{color:#ff6a71}' +
    '.box{border-radius:14px;padding:10px 12px;margin:10px 0}.lab{font-size:11px;font-weight:900;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px}' +
    '.do{background:#13284d;border-left:6px solid #4f8cff}.do .lab{color:#9cc0ff}' +
    '.say{background:#16233a}.say .lab{color:#ff9aa0}.say ul{list-style:none;margin:0;padding:0}.say li{display:flex;gap:10px;padding:8px 6px;border-radius:10px;cursor:pointer;font-size:18px;font-weight:700;align-items:flex-start}.say li:hover{background:#1d2e4a}.say li i{flex:none;width:22px;height:22px;border:2px solid #ff6a71;border-radius:6px;margin-top:3px;font-style:normal;text-align:center;line-height:18px;color:#0b1220}.say li.done{opacity:.45;text-decoration:line-through}.say li.done i{background:#8fd16b;border-color:#8fd16b}' +
    '.read{background:#f8fafc;color:#1a202c;font-size:19px;line-height:1.5}.read .lab{color:#64748b}' +
    '.clip{background:#3a2a05;border:2px solid #F5C542}.clip .lab{color:#F5C542}.clip q{display:block;font-size:20px;font-weight:800;color:#fff3c4;quotes:"\\\\201C" "\\\\201D"}.clip small{display:block;margin-top:6px;color:#e8c768;font-size:12px}' +
    '.run{background:#0f1720;border:1px solid #26313f}.run .lab{color:#8fd16b}.run pre{white-space:pre-wrap;margin:0;font-family:Consolas,monospace;font-size:13px;color:#cfe3d0}' +
    '.pollb{background:#1e2a44;border:1px solid #33507a}.pollb .lab{color:#a8c7ff}.pollb .btns{display:flex;gap:8px;margin-top:8px}' +
    'button{font:inherit;font-weight:800;border:none;border-radius:999px;padding:9px 14px;cursor:pointer;background:#27405f;color:#fff}button.pri{background:#FB2832}' +
    '.link{background:#16233a;font-size:13px;word-break:break-all}.link .lab{color:#9fb3c8}' +
    '.next{color:#9fb3c8;font-size:14px;margin-top:12px}.next b{color:#e7eef6}' +
    '.nav{position:fixed;left:0;right:0;bottom:0;display:flex;gap:8px;padding:10px 14px;background:#0b1220;border-top:1px solid #22324d}.nav button{flex:1;font-size:18px;padding:12px}' +
    '.live{font-size:12px;color:#9fb3c8;margin-left:auto}';
  function mmss(ms){ var s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function openPresenter(){
    var sw = (screen && screen.availWidth) || 1440, sh = (screen && screen.availHeight) || 900;
    var w = Math.max(340, Math.round(sw / 5));
    pw = window.open('', 'cb-presenter-wl', 'popup=yes,width=' + w + ',height=' + sh + ',left=' + (sw - w) + ',top=0');
    if (!pw) { pnbtn.classList.remove('hide'); pnbtn.textContent = '🗒️ Pop-ups blocked: click here for the presenter window'; return; }
    if (!pw.document.getElementById('pv')) {
      pw.document.open();
      pw.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Presenter · Weekly Live</title><style>' + PCSS + '</style></head><body><div id="pv"></div><div class="nav"><button data-nav="-1">◀ Back</button><button class="pri" data-nav="1">Next ▶</button></div></body></html>');
      pw.document.close();
      pw.document.addEventListener('keydown', onKey);
      pw.document.addEventListener('click', onPresenterClick);
    }
    pnbtn.classList.add('hide');
    renderPresenter();
  }
  function onPresenterClick(e){
    var n = e.target.closest('[data-nav]'); if (n) { show(i + Number(n.getAttribute('data-nav'))); return; }
    var li = e.target.closest('[data-say]');
    if (li) { var k = Number(li.getAttribute('data-say')); checked[i] = checked[i] || {}; checked[i][k] = !checked[i][k]; renderPresenter(); return; }
    var a = e.target.closest('[data-pact]'); if (a) { pollAct(a.getAttribute('data-pact')); return; }
    var c = e.target.closest('[data-copylink]'); if (c && K.checkinUrl) copyText(K.checkinUrl, c);
  }
  function clockClass(used, budget){ return used <= budget ? 'ok' : used <= budget * 1.3 ? 'warn' : 'over'; }
  function renderPresenter(){
    if (!pw || pw.closed) return;
    var root = pw.document.getElementById('pv'); if (!root) return;
    var d = DATA[i], s = slides[i], now = Date.now();
    var slideUsed = now - slideStart, budget = Number(d.min || 1) * 60000;
    var plannedAt = PLAN[i] * 60000, elapsed = classStart ? now - classStart : 0;
    var drift = classStart ? Math.round((elapsed - plannedAt) / 60000) : 0;
    var h = '<div class="top"><span class="num">' + (i + 1) + '</span><span class="of">/ ' + DATA.length + '</span><span class="live">' + (LIVE ? '● LIVE · ' + ((live && live.present) || 0) + ' in' : 'rehearsal') + '</span></div>' +
      '<div class="ttl">' + esc(d.title) + '</div>' +
      '<div class="clocks"><div class="clk ' + clockClass(slideUsed, budget) + '"><span>This slide</span><b>' + mmss(slideUsed) + ' / ' + d.min + ':00</b></div>' +
      '<div class="clk ' + (drift <= 0 ? 'ok' : drift <= 3 ? 'warn' : 'over') + '"><span>Class</span><b>' + (classStart ? mmss(elapsed) : '0:00') + '</b><span>' + (classStart ? (drift > 0 ? drift + ' min behind' : drift < 0 ? (-drift) + ' min ahead' : 'on time') : 'starts on next slide') + '</span></div></div>';
    if (d.do) h += '<div class="box do"><div class="lab">Do</div>' + esc(d.do) + '</div>';
    if (d.say && d.say.length) h += '<div class="box say"><div class="lab">Say these</div><ul>' + d.say.map(function(x, k){ var done = checked[i] && checked[i][k]; return '<li data-say="' + k + '" class="' + (done ? 'done' : '') + '"><i>' + (done ? '✓' : '') + '</i><span>' + esc(x) + '</span></li>'; }).join('') + '</ul></div>';
    if (d.read) h += '<div class="box read"><div class="lab">Read this out loud</div>' + esc(d.read) + '</div>';
    if (d.clip) h += '<div class="box clip"><div class="lab">🎬 Clip line for Piyush</div><q>' + esc(d.clip) + '</q><small>Slow down. Look at the camera. Say it exactly, as one sentence.</small></div>';
    if (d.prompt) h += '<div class="box run"><div class="lab">▶ Prompt on their screens: ' + esc(d.prompt.label) + '</div><pre>' + esc(d.prompt.text) + '</pre></div>';
    if (s.dataset.poll) {
      var st = pstate[s.dataset.poll] || 'voting', p = live && live.poll && live.poll.key === s.dataset.poll ? live.poll : null;
      h += '<div class="box pollb"><div class="lab">Live vote · ' + (p ? p.total : 0) + ' voted · ' + st + '</div>' +
        (d.reveal ? '<div>Reveal line: ' + esc(d.reveal) + '</div>' : '') +
        '<div class="btns">' + (st === 'voting' ? '<button data-pact="lock">🔒 Lock</button>' : '') + (st === 'locked' ? '<button class="pri" data-pact="reveal">🎉 Reveal</button><button data-pact="reopen">↩ Reopen</button>' : '') + '</div></div>';
    }
    if (K.checkinUrl && (i <= 2 || d.prompt)) h += '<div class="box link"><div class="lab">Link for the Zoom chat</div>' + esc(K.checkinUrl) + '<div style="margin-top:8px"><button data-copylink>Copy link</button></div></div>';
    h += '<div class="next">Next: <b>' + esc(i + 1 < DATA.length ? DATA[i + 1].title : 'End of the show') + '</b></div>';
    root.innerHTML = h;
  }
  setInterval(renderPresenter, 1000);
  pnbtn.addEventListener('click', function(e){ e.stopPropagation(); openPresenter(); });

  /* ---- navigation ---- */
  document.addEventListener('click', function(e){
    var b = e.target.closest('[data-act]');
    if (b) { e.stopPropagation(); pollAct(b.dataset.act); return; }
    var cp = e.target.closest('[data-copy]');
    if (cp) { e.stopPropagation(); var d = DATA[i]; if (d.prompt) copyText(d.prompt.text, cp); return; }
    if (e.target.closest('a,button,.pcard')) return;
    if (!autoTried) { autoTried = true; if (!pw) openPresenter(); }
    if (e.clientX > innerWidth * 0.5) show(i + 1); else show(i - 1);
  });
  function show(n){
    var next = Math.max(0, Math.min(slides.length - 1, n));
    if (next !== i) slideStart = Date.now();
    if (next > 0 && classStart === null) classStart = Date.now() - PLAN[next] * 60000;
    i = next;
    slides.forEach(function(s, k){ s.classList.toggle('active', k === i); });
    counter.textContent = (i + 1) + ' / ' + slides.length;
    progress.style.width = ((i + 1) / slides.length * 100) + '%';
    var d = DATA[i];
    notes.innerHTML = '<b>Slide ' + (i + 1) + ' · ' + esc(d.title) + ' · ~' + d.min + ' min</b><br>' + esc((d.say || []).join(' · ')) + (d.clip ? '<br><b>Clip:</b> ' + esc(d.clip) : '');
    broadcast(); render(); renderPresenter(); poll();
  }
  function onKey(e){
    if (!autoTried && /^(ArrowRight|ArrowLeft| |PageDown|PageUp)$/.test(e.key)) { autoTried = true; if (!pw) openPresenter(); }
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); show(i + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); show(i - 1); }
    else if (e.key === 'p' || e.key === 'P') openPresenter();
    else if (e.key === 'n' || e.key === 'N') { notesOn = !notesOn; notes.style.display = notesOn ? 'block' : 'none'; }
    else if (e.key === 'q' || e.key === 'Q') { var lob = slides.findIndex(function(s){ return s.dataset.oh === 'lobby'; }); if (lob >= 0) show(lob); }
    else if (e.key === 'Home') show(0);
  }
  addEventListener('keydown', onKey);
  setInterval(poll, 2500);
  show(0);
})();
</script>`;
}
