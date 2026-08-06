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
  var elPrev = document.getElementById('kprev');
  var elNext = document.getElementById('knext');
  var elStage = document.querySelector('.kstage');

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
    diagramFull = false; // a new slide always starts un-full-screened
    for (var k = 0; k < slides.length; k++){ slides[k].classList.toggle('active', k === i); }
    elProgress.style.width = ((i + 1) / slides.length * 100) + '%';
    elCounter.textContent = (i + 1) + ' / ' + slides.length;
    if (elPrev) elPrev.disabled = (i === 0);
    if (elNext) elNext.disabled = (i === slides.length - 1);
    applyMode();
    var sm = (K.slides || [])[i];
    if (sm && sm.question && sm.question.theater && !theaterState[sm.id]) theaterState[sm.id] = 'voting';
    renderNotes();
    updatePace();
    broadcastCurrent();
    renderTheater();
    updateLateQr();
    if (window.__renderMermaid) window.__renderMermaid(slides[i]);
    slides[i].scrollTop = 0;
  }
  function next(){ show(i + 1); }
  function prev(){ show(i - 1); }

  // Dedicated nav buttons — the only click-driven way to change slides now.
  // A whole-page click used to fire next()/prev() (a 28%-of-screen-width
  // left/right split bound to document click), which turned the page on
  // ordinary clicks meant for reading or pointing at content. Buttons +
  // keyboard + swipe replace that entirely.
  if (elPrev) elPrev.addEventListener('click', function(e){ e.stopPropagation(); prev(); });
  if (elNext) elNext.addEventListener('click', function(e){ e.stopPropagation(); next(); });

  // Touch swipe on the slide stage — useful on the phone-companion / Rehearse view.
  var touchStartX = null;
  if (elStage){
    elStage.addEventListener('touchstart', function(e){ touchStartX = e.changedTouches[0].clientX; }, { passive: true });
    elStage.addEventListener('touchend', function(e){
      if (touchStartX === null) return;
      var dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 60){ if (dx < 0) next(); else prev(); }
      touchStartX = null;
    }, { passive: true });
  }

  // Small persistent QR for latecomers — only past the cover slide, and only
  // once the instructor has actually started class (see kitDeckStyles.ts
  // #klateqr for the "why" — before Start, slide 1's own big QR is enough).
  function updateLateQr(){
    var el = document.getElementById('klateqr');
    if (!el) return;
    el.classList.toggle('show', i > 0 && !!classStart());
  }

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

  // Full-screening a diagram means the projected screen is showing ONLY the
  // diagram (no text) — that is exactly when the instructor's phone should
  // surface the full script, since nothing else on screen has it anymore.
  var diagramFull = false;
  window.__toggleDiagramFull = function(el){
    el.classList.toggle('kdiagram--full');
    diagramFull = el.classList.contains('kdiagram--full');
    broadcastCurrent();
  };

  // Broadcast the deck's CURRENT view so students' phones switch to match it.
  // Also carries the presenter's own script/next-slide preview — server-side
  // this is stored in the same row but only ever served back out through the
  // kit-token/admin-gated presenter-notes endpoint, never the student-facing
  // companion-state one (see sessionLiveStateService.ts / getCompanionState,
  // which whitelists its own return fields and does not include this).
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
    var tipEl = slides[i];
    // The phone gets the FULL text — the short presenter cue plus the slide's
    // own paragraph — so it is genuinely the "long version" of what's on
    // screen. The projected slide itself is unchanged by this; only what
    // reaches the instructor's own phone is affected.
    var cue = tipEl ? (tipEl.getAttribute('data-tip') || '') : '';
    var bodyText = tipEl ? (tipEl.getAttribute('data-body') || '') : '';
    var presenterTip = cue && bodyText ? (cue + '\\n\\n' + bodyText) : (cue || bodyText);
    var nextTitle = (i + 1 < slides.length) ? (slides[i + 1].getAttribute('data-slidetitle') || '') : 'End of class';
    var body = {
      slide_index: i, slide_id: sm.id, title: sm.title, segment_label: sm.segment_label,
      phase: sm.phase, question: q, broadcast_prompts: sm.broadcast_prompts,
      prompt: sm.prompt || undefined, presenter_tip: presenterTip, next_title: nextTitle,
      diagram_fullscreen: diagramFull,
    };
    fetch(live.broadcastEndpoint + '?t=' + encodeURIComponent(live.token || ''), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).catch(function(){});
  }

  // ---- pace tracker ----
  // Hard ceiling: no class clock runs past 3 hours no matter what — an
  // instructor who leaves a Present tab open (or forgets to stop it) must
  // never see it climb past this, since these tabs also double as the
  // screen-recording source that gets turned into video after class.
  var MAX_CLASS_MS = 3 * 60 * 60 * 1000;
  var startKey = 'kit_start_' + (K.meta && K.meta.sessionId || 'x');
  var endKey = 'kit_end_' + (K.meta && K.meta.sessionId || 'x');
  function classStart(){ var v = localStorage.getItem(startKey); return v ? parseInt(v, 10) : 0; }
  function setStart(ms){ if (ms) localStorage.setItem(startKey, String(ms)); else localStorage.removeItem(startKey); }
  function classEnd(){ var v = localStorage.getItem(endKey); return v ? parseInt(v, 10) : 0; }
  function setEnd(ms){ if (ms) localStorage.setItem(endKey, String(ms)); else localStorage.removeItem(endKey); }

  var elStart = document.getElementById('kstart');
  var elClock = document.getElementById('kpaceclock');
  var elSeg = document.getElementById('kpaceseg');
  var elStatus = document.getElementById('kpacestatus');
  var elNow = document.getElementById('kpacenow');

  // Whether anyone has been seen checked in during this run — guards the
  // "everyone left" auto-stop so it can't fire before the room ever fills up.
  var sawPresence = false;

  elStart.addEventListener('click', function(){
    var start = classStart(), end = classEnd();
    if (start && !end){
      // running -> stop. This is the normal end-of-class action, so it
      // doesn't confirm; the clock freezes but the elapsed time is kept.
      setEnd(Date.now());
    } else if (start && end){
      // stopped but not yet cleared -> confirm before wiping the run.
      if (confirm('Reset the class clock?')) { setStart(0); setEnd(0); sawPresence = false; }
    } else {
      setStart(Date.now()); setEnd(0); sawPresence = false;
    }
    updatePace();
    updateLateQr();
  });

  // Auto-stop: 3-hour hard cap, OR everyone has checked out after having
  // checked in — whichever comes first. Runs every tick from updatePace()
  // and every live poll, so it fires even if the instructor never returns
  // to the tab.
  function autoStopIfNeeded(start, rawElapsedMs){
    if (classEnd()) return;
    if (rawElapsedMs >= MAX_CLASS_MS){ setEnd(start + MAX_CLASS_MS); return; }
    if (live.enabled){
      if (pulse.present > 0) sawPresence = true;
      else if (sawPresence) { setEnd(Date.now()); return; }
    }
  }

  function updatePace(){
    var start = classStart();
    if (!start){
      elStart.textContent = 'Start class'; elStart.classList.remove('running', 'ended');
      elClock.textContent = '00:00';
      elSeg.innerHTML = '<b>Not started</b>press Start class when you begin';
      elStatus.className = 'kpace-status idle'; elStatus.textContent = 'READY';
      if (elNow) elNow.style.left = '0%';
      return;
    }
    autoStopIfNeeded(start, Date.now() - start);
    var end = classEnd();
    var elapsedMs = end ? (end - start) : (Date.now() - start);
    var elapsedMin = elapsedMs / 60000;
    elClock.textContent = fmtMMSS(elapsedMs);
    var cur = segOfSlide(i);
    elSeg.innerHTML = '<b>' + esc(cur.label) + '</b>planned ' + Math.round(cur.start) + '–' + Math.round(cur.end) + ' min';

    var cls, txt;
    if (end){
      elStart.textContent = 'Reset'; elStart.classList.remove('running'); elStart.classList.add('ended');
      cls = 'ended'; txt = 'CLASS ENDED';
    } else {
      elStart.textContent = 'Stop class'; elStart.classList.add('running'); elStart.classList.remove('ended');
      cls = 'ontime'; txt = 'ON TIME';
      if (elapsedMin > cur.end){ cls = 'behind'; txt = 'BEHIND ' + Math.round(elapsedMin - cur.end) + ' MIN'; }
      else if (elapsedMin < cur.start){ cls = 'ahead'; txt = 'AHEAD ' + Math.round(cur.start - elapsedMin) + ' MIN'; }
    }
    elStatus.className = 'kpace-status ' + cls; elStatus.textContent = txt;

    if (elNow) elNow.style.left = Math.min(100, (elapsedMin / total) * 100) + '%';
    renderFeedback(cls, elapsedMin, cur);
  }

  // ---- pulse rail ----
  var live = K.live || { enabled: false };
  var pulse = { here: 0, building: 0, stuck: 0, finished: 0, present: 0, participated: 0, questions: [], poll: null, recentEvents: [] };
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
    var correctLine = (revealedNow && p.correctResponders && p.correctResponders.length)
      ? '<div class="kpoll-correct">✅ Got it right: ' + esc(p.correctResponders.join(', ')) + '</div>' : '';
    el.innerHTML = '<div class="kpoll-head">Live answers · ' + total + ' voted</div>' + rows + correctLine;
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
    var correctList = root.querySelector('[data-role="correct-list"]');
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
    if (correctList){
      var names = (p && p.correctResponders) || null;
      if (st === 'revealed' && names && names.length){
        correctList.textContent = '✅ Got it right: ' + names.join(', ');
        correctList.style.display = '';
      } else {
        correctList.textContent = '';
        correctList.style.display = 'none';
      }
    }
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
    renderTicker();
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

  // "First L. entering the classroom / Virtual Building" — named join/leave
  // events (session_presence_events). Virtual Building events are a proxy for
  // Meet joins (no real presence webhook exists), so treat this as a UX
  // flourish for the room, not a source of truth.
  var TICKER_COPY = {
    classroom_enter: { verb: 'entering the classroom', cls: 'classroom' },
    virtual_building_enter: { verb: 'entering the Virtual Building', cls: 'building-enter' },
    virtual_building_leave: { verb: 'leaving the Virtual Building', cls: 'building-leave' },
  };
  function timeAgo(iso){
    var then = new Date(iso).getTime();
    if (isNaN(then)) return '';
    var secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (secs < 60) return 'now';
    var mins = Math.floor(secs / 60);
    if (mins < 60) return mins + 'm ago';
    return Math.floor(mins / 60) + 'h ago';
  }
  function renderTicker(){
    var el = document.getElementById('kticker');
    if (!el) return;
    var events = pulse.recentEvents || [];
    if (!events.length){ el.innerHTML = '<div class="kticker-empty">No one yet.</div>'; return; }
    el.innerHTML = events.slice(0, 15).map(function(e){
      var copy = TICKER_COPY[e.type] || { verb: 'here', cls: '' };
      return '<div class="kticker-item ' + copy.cls + '"><span class="at">' + timeAgo(e.at) + '</span><b>' + esc(e.name) + '</b> ' + copy.verb + '</div>';
    }).join('');
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
      .then(function(d){ if (d){ pulse = { here: d.here||0, building: d.building||0, stuck: d.stuck||0, finished: d.finished||0, present: d.present||0, participated: d.participated||0, questions: d.questions||[], poll: d.poll||null, recentEvents: d.recentEvents||[] }; renderPulse(); updatePace(); } })
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
      var line = wrap.querySelector('.kreveal-line');
      var correct = wrap.querySelector('.kopt[data-correct="1"]');
      var sm = (K.slides || [])[i];
      // Toggle: a second click on the same control reverses the reveal (hides the
      // explanation + the highlighted correct option, restores the button's own
      // original label) rather than being a one-way action with no way back.
      var nowRevealed = !(sm && revealed[sm.id]);
      if (!rb.getAttribute('data-label')) rb.setAttribute('data-label', rb.textContent);
      if (line) line.classList.toggle('show', nowRevealed);
      if (correct) correct.classList.toggle('correct', nowRevealed);
      rb.textContent = nowRevealed ? 'Hide answer' : rb.getAttribute('data-label');
      // tell the phones the reveal state too
      if (sm) { revealed[sm.id] = nowRevealed; broadcastCurrent(); }
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
    if (e.target.closest('#klateqr')){ e.stopPropagation(); toggleQR(); return; }
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
