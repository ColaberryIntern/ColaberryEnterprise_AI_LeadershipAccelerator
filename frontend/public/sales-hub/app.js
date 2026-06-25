/* Founding Cohort — Sales Knowledge Base engine
   Self-contained: data from window.KB_DATA (kb-data.js). Works offline from file://.
   Cory uses client-side retrieval over the KB by default; set CORY_LIVE_ENDPOINT to also
   try a live LLM (e.g. '/api/chat' on enterprise.colaberry.ai) with graceful fallback. */
(function () {
  'use strict';
  var DATA = window.KB_DATA || { categories: [], qa: [] };
  var CORY_LIVE_ENDPOINT = null; // e.g. '/api/chat' once deployed; null = retrieval-only

  var DOCS = {
    onepager:   { label: 'Founding Cohort one-pager', href: 'downloads/01-founding-cohort-one-pager.pdf' },
    objections: { label: 'Objection-handling sheet',  href: 'downloads/02-objection-handling-sheet.pdf' },
    outreach:   { label: 'Outbound emails + DMs',      href: 'downloads/03-outbound-emails-and-dms.pdf' },
    script:     { label: 'Admissions call script',     href: 'downloads/04-sales-call-script.pdf' },
    positioning:{ label: 'Positioning guardrails',     href: 'downloads/00-positioning-guardrails.pdf' }
  };

  var STOP = {the:1,a:1,an:1,is:1,are:1,do:1,does:1,how:1,what:1,for:1,to:1,of:1,in:1,on:1,it:1,i:1,me:1,my:1,you:1,your:1,and:1,or:1,can:1,'with':1,about:1,this:1,that:1};
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function tokens(s){ return String(s||'').toLowerCase().split(/[^a-z0-9$]+/).filter(function(w){return w.length>2 && !STOP[w];}); }

  /* ---------- render Q&A ---------- */
  var cards = []; // {el, qa, hay}
  function renderQA(){
    var root = document.getElementById('qa-root');
    var nav  = document.getElementById('catnav');
    DATA.categories.forEach(function(cat){
      var items = DATA.qa.filter(function(x){return x.category===cat.key;});
      var sec = document.createElement('div');
      sec.className = 'cat'; sec.id = 'cat-'+cat.key;
      var h = document.createElement('div'); h.className='cat-h';
      h.innerHTML = '<span>'+esc(cat.title)+'</span><span class="ct" data-ct="'+cat.key+'">'+items.length+'</span>';
      sec.appendChild(h);
      items.forEach(function(x){
        var d = document.createElement('details'); d.className='qa';
        var flag = x.confidence==='drafted-verify' ? '<span class="flag" title="Drafted policy, pending final approval">verify before quoting</span>' : '';
        var tags = (x.tags||[]).map(function(t){return '<span class="tag">'+esc(t)+'</span>';}).join('');
        d.innerHTML =
          '<summary><span class="qtext">'+esc(x.q)+'</span><span class="chev cb-i"><i class="ri-arrow-down-s-line"></i></span></summary>'+
          '<div class="ans"><span class="atext">'+esc(x.a)+'</span>'+
          (x.detail?'<div class="detail atext-d">'+esc(x.detail)+'</div>':'')+
          '<div class="foot">'+flag+tags+'</div></div>';
        sec.appendChild(d);
        cards.push({ el:d, qa:x, hay:(x.q+' '+x.a+' '+(x.detail||'')+' '+(x.tags||[]).join(' ')).toLowerCase(),
                     qEl:d.querySelector('.qtext'), aEl:d.querySelector('.atext'), dEl:d.querySelector('.atext-d'),
                     qText:x.q, aText:x.a, dText:x.detail||'', secEl:sec });
      });
      root.appendChild(sec);
      var a = document.createElement('a'); a.className='nav'; a.href='#cat-'+cat.key;
      a.innerHTML = '<span>'+esc(cat.title)+'</span><span class="ct" data-nav="'+cat.key+'">'+items.length+'</span>';
      nav.appendChild(a);
    });
  }

  /* ---------- instant filter ---------- */
  function hi(text, toks){
    if(!toks.length) return esc(text);
    var out = esc(text);
    toks.forEach(function(t){
      var re = new RegExp('('+t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','ig');
      out = out.replace(re,'<mark>$1</mark>');
    });
    return out;
  }
  function filter(){
    var qv = document.getElementById('q').value.trim();
    var toks = tokens(qv);
    var shown = 0;
    var perCat = {};
    cards.forEach(function(c){
      var match = toks.length===0 || toks.every(function(t){return c.hay.indexOf(t)>=0;});
      c.el.classList.toggle('hide', !match);
      if(match){
        shown++; perCat[c.qa.category]=(perCat[c.qa.category]||0)+1;
        c.el.open = toks.length>0; // auto-expand when searching
        c.qEl.innerHTML = hi(c.qText, toks);
        c.aEl.innerHTML = hi(c.aText, toks);
        if(c.dEl) c.dEl.innerHTML = hi(c.dText, toks);
      } else { c.el.open=false; }
    });
    DATA.categories.forEach(function(cat){
      var n = perCat[cat.key]||0;
      var sec = document.getElementById('cat-'+cat.key);
      if(sec) sec.classList.toggle('hide', n===0);
      var ct = document.querySelector('[data-ct="'+cat.key+'"]'); if(ct) ct.textContent=n;
      var nv = document.querySelector('[data-nav="'+cat.key+'"]'); if(nv) nv.textContent=n;
    });
    document.getElementById('count').textContent = qv ? (shown+' of '+cards.length+' answers') : (cards.length+' answers');
    document.getElementById('noresults').style.display = (shown===0)?'block':'none';
  }

  /* ---------- diagrams ---------- */
  var DIAGRAMS = [
    { t:'Sales funnel — lead to enrolled', g:
      'flowchart LR\n A[Lead / outreach] --> B["Free Open House<br/>Thu Jul 16"]\n B --> C{Ready to join?}\n C -->|Yes| D["Enroll<br/>training.colaberry.com"]\n C -->|Not yet| E["Follow up<br/>+ send 1-pager"]\n E --> D\n D --> F["Founding Cohort kickoff<br/>Thu Jul 23"]\n F --> G["Architect Expo<br/>early October"]' },
    { t:'The 12 weeks — what you build', g:
      'flowchart LR\n I1["Intensive 1<br/>Business Workflow Assistant<br/>+ reusable AI Skills"] --> I2["Intensive 2<br/>Multi-agent AI team<br/>+ Enterprise Prompt Library"]\n I2 --> I3["Intensive 3<br/>Working MCP server<br/>integrated with a real system"]\n I3 --> I4["Intensive 4<br/>Complete Solution<br/>Architecture Package"]\n I4 --> O["Deployed AI system +<br/>GitHub portfolio +<br/>Anthropic Architect certification"]' },
    { t:'Pick a plan', g:
      'flowchart TD\n Q{How do you want to pay?}\n Q -->|Best value, committed| A["Annual<br/>$149/mo<br/>founding rate locks for life of membership"]\n Q -->|Want flexibility| M["Monthly<br/>$199/mo<br/>cancel anytime"]\n A --> S["One membership =<br/>all 4 intensives + cert prep<br/>+ internship + portfolio"]\n M --> S\n S --> Z["Checkout: training.colaberry.com"]' },
    { t:'Objection to close', g:
      'flowchart LR\n O[Objection] --> T["Acknowledge<br/>that is fair"]\n T --> AN["One-line answer<br/>from this KB"]\n AN --> B["Bridge<br/>which is why this gets<br/>you to their goal"]\n B --> CL["Close on scarcity<br/>40 seats, rate locks"]\n CL --> N["Next step<br/>seat or scheduled follow-up"]' }
  ];
  function renderDiagrams(){
    var root = document.getElementById('diagram-root');
    DIAGRAMS.forEach(function(d,i){
      var box = document.createElement('div'); box.className='diagram';
      box.innerHTML = '<h3>'+esc(d.t)+'</h3><div class="mermaid" id="mm'+i+'">'+d.g+'</div>';
      root.appendChild(box);
    });
    if(window.mermaid){
      try { mermaid.initialize({ startOnLoad:false, securityLevel:'loose', theme:'base',
        themeVariables:{ primaryColor:'#fde2e3', primaryBorderColor:'#FB2832', primaryTextColor:'#2b2b2b', lineColor:'#777', fontFamily:'Roboto, sans-serif' } });
        mermaid.run({ querySelector:'.mermaid' });
      } catch(e){ console.warn('mermaid', e); }
    }
  }

  /* ---------- downloads + training ---------- */
  function renderDownloads(){
    var meta = [
      ['onepager','ri-file-paper-2-line','Hand to a prospect. Program, pricing, dates, CTA.'],
      ['objections','ri-question-answer-line','Eight objections with rep-ready answers.'],
      ['script','ri-phone-line','Six-step admissions call flow.'],
      ['outreach','ri-mail-send-line','Three persona emails + DMs (drafts).'],
      ['positioning','ri-focus-3-line','Source of truth, do / do-not-say.']
    ];
    var root = document.getElementById('dl-root');
    meta.forEach(function(m){
      var doc = DOCS[m[0]];
      var a = document.createElement('a'); a.className='dl'; a.href=doc.href; a.target='_blank'; a.setAttribute('download','');
      a.innerHTML = '<span class="ic cb-icon-tile" style="background:var(--red-500)"><span class="cb-i"><i class="'+m[1]+'"></i></span></span>'+
        '<div><h4>'+esc(doc.label)+'</h4><p>'+esc(m[2])+'</p></div>';
      root.appendChild(a);
    });
  }
  function renderTraining(){
    var root = document.getElementById('train-root');
    root.innerHTML =
      '<div class="train"><h4>Five-minute call prep</h4><ol>'+
        '<li>Skim <b>Pricing</b> and <b>Founding Cohort &amp; urgency</b> here so the numbers are reflexive: $149/mo annual, $199/mo monthly, 40 seats, rate locks.</li>'+
        '<li>Have the <b>one-pager</b> open in a tab to screen-share or send.</li>'+
        '<li>Know the dates cold: free Open House Thu Jul 16, kickoff Thu Jul 23.</li>'+
        '<li>Pick the prospect angle below before you dial.</li>'+
        '<li>Ask Cory to build a gameplan for the specific person you are about to call.</li>'+
      '</ol></div>'+
      '<div class="train"><h4>The talk track</h4><ol>'+
        '<li><b>Open</b> — set the frame, earn two minutes.</li>'+
        '<li><b>Discovery</b> — find their problem and their bar. Sell with their words.</li>'+
        '<li><b>Pitch</b> — the outcome (deployed system + portfolio + cert), tied to their problem.</li>'+
        '<li><b>Bridge</b> — acknowledge, one-line answer, return to their goal.</li>'+
        '<li><b>Close</b> — 40 seats, founding rate locks. Ask for the decision.</li>'+
        '<li><b>Next step</b> — secure a seat or book the follow-up before you hang up.</li>'+
      '</ol><p style="font-size:12.5px;color:var(--text-muted);margin:10px 0 0">Full script in Downloads.</p></div>'+
      '<div class="train"><h4>Three prospect angles</h4><ul>'+
        '<li><b>Working professionals</b> — build with AI without leaving the job. Four hours a week.</li>'+
        '<li><b>Beginners / switchers</b> — no engineering degree needed; finish with a real project.</li>'+
        '<li><b>Builders / idea-owners</b> — bring the idea, leave with a deployed system.</li>'+
      '</ul></div>'+
      '<div class="train"><h4>Practice with Cory</h4><div class="chips">'+
        '<span class="chip" data-ask="Build me a gameplan for a working professional who is worried about time">Gameplan: busy professional</span>'+
        '<span class="chip" data-ask="How do I handle the price objection?">Handle price</span>'+
        '<span class="chip" data-ask="How do I prep for a call?">Call prep</span>'+
        '<span class="chip" data-ask="Send me the one-pager">Get the one-pager</span>'+
      '</div></div>';
    root.querySelectorAll('.chip').forEach(function(ch){ ch.addEventListener('click',function(){ openCory(); ask(ch.getAttribute('data-ask')); }); });
  }

  /* ---------- Cory ---------- */
  var body;
  function bubble(who, html){
    var m=document.createElement('div'); m.className='msg '+who; m.innerHTML=html; body.appendChild(m); body.scrollTop=body.scrollHeight; return m;
  }
  function dlBtn(key){ var d=DOCS[key]; return '<a class="dlbtn" href="'+d.href+'" target="_blank" download><span class="cb-i"><i class="ri-download-2-line"></i></span> '+esc(d.label)+'</a>'; }
  function retrieve(q){
    var toks=tokens(q); if(!toks.length) return [];
    return DATA.qa.map(function(x){
      var hay=(x.q+' '+(x.tags||[]).join(' ')+' '+x.a+' '+(x.detail||'')).toLowerCase();
      var s=0; toks.forEach(function(t){ if(x.q.toLowerCase().indexOf(t)>=0)s+=3; if((x.tags||[]).join(' ').indexOf(t)>=0)s+=2; if(hay.indexOf(t)>=0)s+=1; });
      return {x:x,s:s};
    }).filter(function(r){return r.s>0;}).sort(function(a,b){return b.s-a.s;}).slice(0,3).map(function(r){return r.x;});
  }
  function docFor(q){
    var l=q.toLowerCase();
    if(/one[- ]?pager|leave[- ]?behind|brochure|sell sheet/.test(l)) return 'onepager';
    if(/objection|push ?back|too expensive|not sure/.test(l)) return 'objections';
    if(/email|dm|outreach|template|message|follow[- ]?up/.test(l)) return 'outreach';
    if(/script|talk track|call flow|what do i say/.test(l)) return 'script';
    if(/positioning|guardrail|do not say|source of truth|brand/.test(l)) return 'positioning';
    return null;
  }
  function answerLocal(q){
    var l=q.toLowerCase();
    // strategy / gameplan
    if(/strateg|gameplan|game plan|plan for|approach|pitch (to|a)/.test(l)){
      return { html:'Here is a simple gameplan:<br>1. <b>Open</b> and earn two minutes.<br>2. <b>Discovery</b> — get their real problem and their bar.<br>3. <b>Pitch the outcome</b> tied to that problem: a deployed AI system, a GitHub portfolio, and the Anthropic Architect certification.<br>4. <b>Bridge</b> any objection (price is not a course fee, four hours a week, no engineering degree needed).<br>5. <b>Close on scarcity</b>: 40 founding seats, $149/mo rate locks for life of membership.<br>6. <b>Lock a next step</b> before you hang up.', doc:'script' };
    }
    if(/prep|prepare|before (the|a) ?call|get ready|ready for/.test(l)){
      return { html:'Five-minute prep:<br>1. Numbers reflexive: $149/mo annual, $199/mo monthly, 40 seats, rate locks.<br>2. Dates cold: Open House Thu Jul 16, kickoff Thu Jul 23.<br>3. One-pager open in a tab.<br>4. Pick the angle: working professional, beginner/switcher, or builder.<br>5. Ask me for a gameplan on the specific person.', doc:'onepager' };
    }
    if(/refund|cancel|money back|guarantee/.test(l)){
      return { html:'Monthly ($199/mo) cancels anytime, access through the paid month, no partial-month refund. Annual locks $149/mo and has a 14-day money-back window from the Jul 23 kickoff, then non-refundable but membership stays active the full year and the rate stays locked. <b>Note:</b> these terms are drafted and pending final approval, so confirm before quoting verbatim.', doc:'objections' };
    }
    if(/\bapi\b|\bllm\b|subscription|claude code|api key|own key|out of pocket|extra (cost|fee|charge)|additional (cost|fee|charge)|other (cost|fee|charge)|hidden (cost|fee|charge)|tool (cost|fee)|anthropic (cost|fee|subscription)/.test(l)){
      return { html:'<b>Important to disclose:</b> beyond the Colaberry membership, students cover their own third-party tool costs, which Colaberry does not cover. An Anthropic subscription for Claude Code is about $20 a month, and LLM API usage is billed to the student’s own key, usually under $10 a month per project. These are paid directly to the providers, not to Colaberry, because students build and deploy on real, live AI tools.', doc:'onepager' };
    }
    var hits=retrieve(q);
    if(hits.length){
      var html = hits.map(function(x,i){ return (i===0?'':'<br><br>')+'<b>'+esc(x.q)+'</b><br>'+esc(x.a); }).join('');
      return { html:html, doc:docFor(q) };
    }
    return { html:"I could not find that in the knowledge base. Try the price, time, refund, certification, eligibility, or enrollment topics, or open the Downloads section. You can also hand a prospect the one-pager.", doc:'onepager' };
  }
  function ask(q){
    bubble('me', esc(q));
    var thinking = bubble('cory','<span style="color:var(--text-muted)">Looking that up...</span>');
    function show(res){
      thinking.innerHTML = res.html + (res.doc?('<br>'+dlBtn(res.doc)):'');
      body.scrollTop=body.scrollHeight;
    }
    if(CORY_LIVE_ENDPOINT){
      // optional live LLM, with retrieval context; falls back to local on any error
      try {
        fetch(CORY_LIVE_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({message:q, context:retrieve(q)})})
          .then(function(r){return r.ok?r.json():Promise.reject();})
          .then(function(j){ show({ html: esc(j.reply||j.message||'').replace(/\n/g,'<br>')||answerLocal(q).html, doc:docFor(q) }); })
          .catch(function(){ show(answerLocal(q)); });
      } catch(e){ show(answerLocal(q)); }
    } else { setTimeout(function(){ show(answerLocal(q)); }, 150); }
  }
  function openCory(){ document.getElementById('cory-panel').classList.add('open'); document.getElementById('cory-launch').style.display='none'; document.getElementById('cory-q').focus(); }
  function closeCory(){ document.getElementById('cory-panel').classList.remove('open'); document.getElementById('cory-launch').style.display='flex'; }
  function initCory(){
    body=document.getElementById('cory-body');
    bubble('cory','Hi, I am Cory. I know every answer in this knowledge base, including the student-paid Anthropic and API costs. Ask me about the program, a specific objection, your gameplan for a call, or say "send me the one-pager" and I will hand you the document.');
    var c=document.createElement('div'); c.className='msg cory'; c.innerHTML='<div class="chips">'+
      '<span class="chip" data-ask="What is included in the membership?">What is included?</span>'+
      '<span class="chip" data-ask="How do I handle the price objection?">Price objection</span>'+
      '<span class="chip" data-ask="Build me a gameplan for a call">Build a gameplan</span>'+
      '<span class="chip" data-ask="What is the refund policy?">Refund policy</span></div>';
    body.appendChild(c);
    c.querySelectorAll('.chip').forEach(function(ch){ ch.addEventListener('click',function(){ ask(ch.getAttribute('data-ask')); }); });
    document.getElementById('cory-launch').addEventListener('click',openCory);
    document.getElementById('cory-close').addEventListener('click',closeCory);
    function send(){ var i=document.getElementById('cory-q'); var v=i.value.trim(); if(!v)return; i.value=''; ask(v); }
    document.getElementById('cory-send').addEventListener('click',send);
    document.getElementById('cory-q').addEventListener('keydown',function(e){ if(e.key==='Enter')send(); });
  }

  /* ---------- boot ---------- */
  document.addEventListener('DOMContentLoaded',function(){
    renderQA(); renderDownloads(); renderTraining(); renderDiagrams(); initCory();
    var q=document.getElementById('q'); q.addEventListener('input',filter); filter();
  });
})();
