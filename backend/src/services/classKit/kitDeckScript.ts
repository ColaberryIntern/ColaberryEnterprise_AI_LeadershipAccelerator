/**
 * kitDeckScript.ts — the browser runtime for the Class Kit deck, exported as a
 * string that kitHtml.ts drops into a <script> tag. It reads window.__KIT__
 * (segments + slide→segment map + live config) injected by the renderer.
 *
 * Deliberately written WITHOUT template literals or ${...} so the whole thing
 * nests safely inside the TS backtick template that returns it.
 *
 * Responsibilities:
 *   • slide navigation (keys, click zones, progress + counter)
 *   • the live pace tracker (Start class → clock, current segment, ON TIME /
 *     BEHIND / AHEAD, mini-timeline). This is fully client-side — no backend.
 *   • the pulse rail: polls window.__KIT__.live.endpoint when enabled; otherwise
 *     shows an idle "activates when students check in" state. Derives presenter
 *     feedback from pulse + pace.
 *   • reveal buttons, prompt copy buttons, presenter notes, QR overlay,
 *     compact mode, and "Mark this moment" (a downloadable clip list).
 */
export function deckScript(): string {
  return `
(function(){
  var K = window.__KIT__ || {};
  var segs = K.segments || [];
  var slides = [].slice.call(document.querySelectorAll('.kslide'));
  var total = K.totalMinutes || 120;
  var i = 0;
  var moments = [];
  var revealed = {};
  var theaterState = {}; // slide id -> 'voting' | 'locked' | 'revealed'

  var elProgress = document.getElementById('kprogress');
  var elCounter = document.getElementById('kcounter');
  var elNotes = document.getElementById('knotes');

  function pad(n){ n = Math.floor(n); return (n < 10 ? '0' : '') + n; }
  function fmtMMSS(ms){ var s = Math.max(0, Math.floor(ms/1000)); return pad(s/60) + ':' + pad(s%60); }

  function segOfSlide(idx){
    var el = slides[idx];
    return { start: parseFloat(el.getAttribute('data-segstart')) || 0,
             end: parseFloat(el.getAttribute('data-segend')) || 0,
             label: el.getAttribute('data-seglabel') || '' };
  }

  // ---- navigation ----
  function show(n){
    i = Math.max(0, Math.min(slides.length - 1, n));
    for (var k = 0; k < slides.length; k++){ slides[k].classList.toggle('active', k === i); }
    elProgress.style.width = ((i + 1) / slides.length * 100) + '%';
    elCounter.textContent = (i + 1) + ' / ' + slides.length;
    applyMode();
    var sm = (K.slides || [])[i];
    if (sm && sm.question && sm.question.theater && !theaterState[sm.id]) theaterState[sm.id] = 'voting';
    renderNotes();
    updatePace();
    broadcastCurrent();
    renderTheater();
    if (window.__renderMermaid) window.__renderMermaid(slides[i]);
    slides[i].scrollTop = 0;
  }
  function next(){ show(i + 1); }
  function prev(){ show(i - 1); }

  // Auto-switch the presentation mode (Teach / Story / Build) from the active
  // slide's data-mode — this is what makes Build Mode's dark left-aligned
  // layout + collapsed rail kick in automatically when coding begins, no
  // manual Compact toggle required.
  function applyMode(){
    var sm = (K.slides || [])[i];
    var mode = (sm && sm.mode) || 'teach';
    document.body.classList.remove('mode-teach', 'mode-story', 'mode-build');
    document.body.classList.add('mode-' + mode);
  }

  // Broadcast the deck's CURRENT view so students' phones switch to match it.
  function broadcastCurrent(){
    var live = K.live || {};
    if (!live.enabled || !live.broadcastEndpoint) return;
    var sm = (K.slides || [])[i];
    if (!sm) return;
    var q = sm.question ? {
      key: sm.question.key, kind: sm.question.kind, q: sm.question.q,
      options: sm.question.options, answer: sm.question.answer, revealed: !!revealed[sm.id],
      theater: sm.question.theater ? { state: theaterState[sm.id] || 'voting' } : undefined,
    } : null;
    var body = {
      slide_index: i, slide_id: sm.id, title: sm.title, segment_label: sm.segment_label,
      phase: sm.phase, question: q, broadcast_prompts: sm.broadcast_prompts,
      prompt: sm.prompt || undefined,
    };
    fetch(live.broadcastEndpoint + '?t=' + encodeURIComponent(live.token || ''), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).catch(function(){});
  }

  // ---- pace tracker ----
  var startKey = 'kit_start_' + (K.meta && K.meta.sessionId || 'x');
  function classStart(){ var v = localStorage.getItem(startKey); return v ? parseInt(v, 10) : 0; }
  function setStart(ms){ if (ms) localStorage.setItem(startKey, String(ms)); else localStorage.removeItem(startKey); }

  var elStart = document.getElementById('kstart');
  var elClock = document.getElementById('kpaceclock');
  var elSeg = document.getElementById('kpaceseg');
  var elStatus = document.getElementById('kpacestatus');
  var elNow = document.getElementById('kpacenow');

  elStart.addEventListener('click', function(){
    if (classStart()){ if (confirm('Reset the class clock?')) { setStart(0); } }
    else { setStart(Date.now()); }
    updatePace();
  });

  function updatePace(){
    var start = classStart();
    if (!start){
      elStart.textContent = 'Start class'; elStart.classList.remove('running');
      elClock.textContent = '00:00';
      elSeg.innerHTML = '<b>Not started</b>press Start class when you begin';
      elStatus.className = 'kpace-status idle'; elStatus.textContent = 'READY';
      if (elNow) elNow.style.left = '0%';
      return;
    }
    elStart.textContent = 'Reset'; elStart.classList.add('running');
    var elapsedMs = Date.now() - start;
    var elapsedMin = elapsedMs / 60000;
    elClock.textContent = fmtMMSS(elapsedMs);
    var cur = segOfSlide(i);
    elSeg.innerHTML = '<b>' + esc(cur.label) + '</b>planned ' + Math.round(cur.start) + '–' + Math.round(cur.end) + ' min';

    var cls = 'ontime', txt = 'ON TIME';
    if (elapsedMin > cur.end){ cls = 'behind'; txt = 'BEHIND ' + Math.round(elapsedMin - cur.end) + ' MIN'; }
    else if (elapsedMin < cur.start){ cls = 'ahead'; txt = 'AHEAD ' + Math.round(cur.start - elapsedMin) + ' MIN'; }
    elStatus.className = 'kpace-status ' + cls; elStatus.textContent = txt;

    if (elNow) elNow.style.left = Math.min(100, (elapsedMin / total) * 100) + '%';
    renderFeedback(cls, elapsedMin, cur);
  }

  // ---- pulse rail ----
  var live = K.live || { enabled: false };
  var pulse = { here: 0, building: 0, stuck: 0, finished: 0, present: 0, participated: 0, questions: [], poll: null };
  var elLive = document.getElementById('kraillive');
  function setPulseCell(id, v){ var el = document.getElementById(id); if (el) el.textContent = v; }

  function renderPoll(){
    var el = document.getElementById('kpoll');
    if (!el) return;
    var p = pulse.poll;
    if (!p || !p.options || !p.options.length){ el.style.display = 'none'; return; }
    var sm = (K.slides || [])[i];
    var revealedNow = sm && sm.question && revealed[sm.id];
    var ans = sm && sm.question && typeof sm.question.answer === 'number' ? sm.question.answer : -1;
    var total = p.total || 0;
    var rows = p.options.map(function(opt, idx){
      var n = (p.tally && p.tally[idx]) || 0;
      var pct = total ? Math.round(n / total * 100) : 0;
      var isCorrect = revealedNow && idx === ans;
      return '<div class="kpoll-row' + (isCorrect ? ' correct' : '') + '">' +
        '<div class="lab"><span>' + esc(opt) + '</span><span class="n">' + n + '</span></div>' +
        '<div class="kpoll-bar"><i style="width:' + pct + '%"></i></div></div>';
    }).join('');
    el.innerHTML = '<div class="kpoll-head">Live answers · ' + total + ' voted</div>' + rows;
    el.style.display = 'block';
  }

  // ---- Live Decision Theater — full-screen poll on the active slide ----
  // Scoped to the ".kslide.active" class (not IDs) so multiple theater slides in
  // one deck never collide. Reads the SAME pulse.poll tally the rail already
  // polls — no separate endpoint. The vote lock is enforced server-side
  // (sessionLiveStateService.recordPollResponse); this just reflects state.
  function renderTheater(){
    var active = document.querySelector('.kslide.active');
    if (!active) return;
    var root = active.querySelector('.ktheater');
    if (!root) return;
    var sm = (K.slides || [])[i];
    if (!sm) return;
    var st = theaterState[sm.id] || 'voting';
    var badge = root.querySelector('[data-role="badge"]');
    var countEl = root.querySelector('[data-role="count"]');
    var tiles = root.querySelectorAll('.ktheater-tile');
    var lockBtn = root.querySelector('[data-action="lock"]');
    var revealBtn = root.querySelector('[data-action="reveal"]');
    var reopenBtn = root.querySelector('[data-action="reopen"]');
    var explain = root.querySelector('[data-role="explain"]');
    var p = pulse.poll;
    var total = (p && p.total) || 0;
    if (countEl) countEl.textContent = total + (pulse.present ? (' of ' + pulse.present + ' voted') : ' voted');
    if (badge){
      badge.className = 'ktheater-badge ' + st;
      badge.textContent = st === 'locked' ? '🔒 Vote locked' : st === 'revealed' ? '✅ Results' : '🗳️ Voting open';
    }
    if (lockBtn) lockBtn.style.display = st === 'voting' ? '' : 'none';
    if (revealBtn) revealBtn.style.display = st === 'locked' ? '' : 'none';
    if (reopenBtn) reopenBtn.style.display = st === 'locked' ? '' : 'none';
    if (explain) explain.style.display = st === 'revealed' ? '' : 'none';
    for (var k = 0; k < tiles.length; k++){
      var idx = parseInt(tiles[k].getAttribute('data-idx'), 10);
      var n = (p && p.tally && p.tally[idx]) || 0;
      var pct = total ? Math.round(n / total * 100) : 0;
      var fill = tiles[k].querySelector('.fill');
      var pctEl = tiles[k].querySelector('.pct');
      if (st === 'revealed'){
        if (fill) fill.style.width = pct + '%';
        if (pctEl) pctEl.textContent = pct + '%';
        var isCorrect = sm.question && typeof sm.question.answer === 'number' && sm.question.answer === idx;
        tiles[k].classList.toggle('correct', !!isCorrect);
      } else {
        if (fill) fill.style.width = '0%';
        if (pctEl) pctEl.textContent = '';
        tiles[k].classList.remove('correct');
      }
    }
  }

  function renderPulse(){
    setPulseCell('kp-here', pulse.here);
    setPulseCell('kp-building', pulse.building);
    setPulseCell('kp-stuck', pulse.stuck);
    setPulseCell('kp-finished', pulse.finished);
    setPulseCell('kp-present', pulse.present || 0);
    setPulseCell('kp-participated', pulse.participated || 0);
    renderPoll();
    renderTheater();
    var ql = document.getElementById('kqlist');
    if (ql){
      if (!pulse.questions || !pulse.questions.length){
        ql.innerHTML = '<div class="kq-empty">No questions yet. Students ask from their phones.</div>';
      } else {
        ql.innerHTML = pulse.questions.slice(0, 12).map(function(q){
          return '<div class="kq">' + esc(q.text || '') + '<span class="who">' + esc(q.name || 'Student') + '</span></div>';
        }).join('');
      }
    }
  }

  function renderFeedback(paceCls, elapsedMin, cur){
    var el = document.getElementById('kfeedback');
    if (!el) return;
    var active = pulse.here + pulse.building + pulse.stuck + pulse.finished;
    var stuckThresh = Math.max(2, Math.ceil(active * 0.15));
    var msg = 'Good pace. Keep going.', cls = 'kfeedback go';
    if (pulse.stuck >= stuckThresh){ msg = pulse.stuck + ' stuck — pause and take a question.'; cls = 'kfeedback stop'; }
    else if (paceCls === 'behind' && active && pulse.finished >= active * 0.5){ msg = 'Behind, but most are done — skip the deep example and move on.'; cls = 'kfeedback warn'; }
    else if (paceCls === 'behind'){ msg = 'Running behind — tighten up or drop an optional beat.'; cls = 'kfeedback warn'; }
    else if (active && pulse.finished >= active * 0.6){ msg = 'Most finished — you can move on.'; cls = 'kfeedback go'; }
    else if (paceCls === 'ahead'){ msg = 'Ahead of schedule — you have room to go deeper.'; cls = 'kfeedback go'; }
    el.className = cls; el.textContent = msg;
  }

  function pollLive(){
    if (!live.enabled || !live.endpoint) return;
    var url = live.endpoint + (live.endpoint.indexOf('?') >= 0 ? '&' : '?') + 't=' + encodeURIComponent(live.token || '');
    fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(d){ if (d){ pulse = { here: d.here||0, building: d.building||0, stuck: d.stuck||0, finished: d.finished||0, present: d.present||0, participated: d.participated||0, questions: d.questions||[], poll: d.poll||null }; renderPulse(); updatePace(); } })
      .catch(function(){});
  }

  if (elLive){
    if (live.enabled){ elLive.textContent = 'LIVE'; elLive.className = 'krail-live'; }
    else { elLive.textContent = 'STANDBY'; elLive.className = 'krail-live off'; }
  }

  // ---- reveal + copy ----
  document.addEventListener('click', function(e){
    var theaterBtn = e.target.closest('[data-action="lock"], [data-action="reveal"], [data-action="reopen"]');
    if (theaterBtn){
      e.stopPropagation();
      var sm2 = (K.slides || [])[i];
      if (sm2){
        var action = theaterBtn.getAttribute('data-action');
        if (action === 'lock') theaterState[sm2.id] = 'locked';
        else if (action === 'reveal'){ theaterState[sm2.id] = 'revealed'; revealed[sm2.id] = true; }
        else if (action === 'reopen') theaterState[sm2.id] = 'voting';
        broadcastCurrent();
        renderTheater();
      }
      return;
    }
    var rb = e.target.closest('.kreveal-btn');
    if (rb){
      e.stopPropagation();
      var wrap = rb.closest('.kinner');
      var line = wrap.querySelector('.kreveal-line'); if (line) line.classList.add('show');
      var correct = wrap.querySelector('.kopt[data-correct="1"]'); if (correct) correct.classList.add('correct');
      rb.style.display = 'none';
      // tell the phones the answer is revealed too
      var sm = (K.slides || [])[i]; if (sm) { revealed[sm.id] = true; broadcastCurrent(); }
      return;
    }
    var cb = e.target.closest('.kcopy');
    if (cb){
      e.stopPropagation();
      var pre = cb.closest('.kprompt').querySelector('pre');
      var text = pre.getAttribute('data-raw') || pre.textContent;
      navigator.clipboard && navigator.clipboard.writeText(text);
      cb.textContent = 'Copied'; setTimeout(function(){ cb.textContent = 'Copy prompt'; }, 1400);
      return;
    }
    if (e.target.closest('#kpace, #krail, #knotes, .ktoggles, #kqr-overlay, button, a')) return;
    // click zones: right = next, left = prev
    if (e.clientX > window.innerWidth * 0.28) next(); else prev();
  });

  // ---- presenter notes ----
  var notesOn = false;
  function renderNotes(){
    if (!notesOn) return;
    var el = slides[i];
    var tip = el.getAttribute('data-tip') || '';
    var pub = el.getAttribute('data-pub') || '';
    var seg = segOfSlide(i);
    var nxt = (i + 1 < slides.length) ? (slides[i+1].getAttribute('data-slidetitle') || '') : 'End of class';
    elNotes.innerHTML =
      '<span class="lbl">' + esc(seg.label) + ' · planned ' + Math.round(seg.start) + '–' + Math.round(seg.end) + ' min</span> ' +
      '<br><span class="lbl">Teach</span> ' + esc(tip) +
      (pub ? '<br><span class="lbl pub">On camera</span> <span class="pub">' + esc(pub) + '</span>' : '') +
      '<br><span class="lbl nxt">Next</span> <span class="nxt">' + esc(nxt) + '</span>';
  }

  // ---- toggles / overlays ----
  function toggleCompact(){ document.body.classList.toggle('compact'); syncToggle('t-compact', document.body.classList.contains('compact')); }
  function toggleRail(){ document.body.classList.toggle('rail-on'); syncToggle('t-rail', document.body.classList.contains('rail-on')); }
  // Focus / Video mode — hide all chrome for a clean recording.
  function toggleFocus(){ document.body.classList.toggle('focus'); syncToggle('t-focus', document.body.classList.contains('focus')); }
  function toggleNotes(){ notesOn = !notesOn; elNotes.classList.toggle('show', notesOn); syncToggle('t-notes', notesOn); renderNotes(); }
  function toggleQR(){ document.getElementById('kqr-overlay').classList.toggle('show'); }
  function syncToggle(id, on){ var b = document.getElementById(id); if (b) b.classList.toggle('on', on); }

  function markMoment(){
    var start = classStart();
    var at = start ? (Date.now() - start) : 0;
    moments.push({ tc: fmtMMSS(at), slide: slides[i].getAttribute('data-slidetitle') || '', seg: segOfSlide(i).label });
    toast('Marked ' + fmtMMSS(at) + '  (' + moments.length + ' clips)');
  }
  function downloadMoments(){
    if (!moments.length){ toast('No moments marked yet'); return; }
    var lines = ['timecode,segment,slide'].concat(moments.map(function(m){ return m.tc + ',"' + (m.seg||'') + '","' + (m.slide||'') + '"'; }));
    var blob = new Blob([lines.join('\\n')], { type: 'text/csv' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'clip-list-' + (K.meta && K.meta.sessionNumber || '') + '.csv'; a.click();
  }
  var toastEl = document.getElementById('ktoast'); var toastT;
  function toast(msg){ toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function(){ toastEl.classList.remove('show'); }, 1600); }

  // wire toggle buttons
  bind('t-compact', toggleCompact); bind('t-rail', toggleRail); bind('t-notes', toggleNotes);
  bind('t-qr', toggleQR); bind('t-mark', markMoment); bind('t-download', downloadMoments);
  bind('t-focus', toggleFocus); bind('kfocus-exit', toggleFocus);
  bind('t-print', function(){ window.print(); });
  function bind(id, fn){ var b = document.getElementById(id); if (b) b.addEventListener('click', function(e){ e.stopPropagation(); fn(); }); }

  // Idle-hide: chrome fades when the mouse is still (keeps it out of the video).
  var idleT;
  function wake(){ document.body.classList.remove('idle'); clearTimeout(idleT); idleT = setTimeout(function(){ document.body.classList.add('idle'); }, 3500); }
  document.addEventListener('mousemove', wake); document.addEventListener('keydown', wake); wake();
  document.getElementById('kqr-overlay').addEventListener('click', function(){ this.classList.remove('show'); });

  // ---- keys ----
  document.addEventListener('keydown', function(e){
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') prev();
    else if (e.key === 'Home') show(0);
    else if (e.key === 'End') show(slides.length - 1);
    else if (e.key === 'r' || e.key === 'R'){ var b = slides[i].querySelector('.kreveal-btn'); if (b) b.click(); }
    else if (e.key === 'n' || e.key === 'N') toggleNotes();
    else if (e.key === 'c' || e.key === 'C') toggleCompact();
    else if (e.key === 'q' || e.key === 'Q') toggleQR();
    else if (e.key === 'm' || e.key === 'M') markMoment();
    else if (e.key === 'v' || e.key === 'V') toggleFocus();
    else if (e.key === 'd' || e.key === 'D') downloadMoments();
    else if (e.key === 'p' || e.key === 'P') window.print();
    else if (e.key === 's' || e.key === 'S') elStart.click();
  });

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]; }); }

  // ---- boot ----
  // rail defaults on when live is enabled, or as a standby coach otherwise.
  document.body.classList.add('rail-on'); syncToggle('t-rail', true);
  renderPulse(); show(0);
  setInterval(updatePace, 1000);
  if (live.enabled){ pollLive(); setInterval(pollLive, live.pollMs || 4000); }
})();
`;
}
