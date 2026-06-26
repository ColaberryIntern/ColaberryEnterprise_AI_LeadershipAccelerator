/* ============================================================
   Open House Marketing Hub · search + Cory assistant
   Data from window.HUB_DATA (hub-data.js). Works from file://.
   Cory uses client-side retrieval over the KB by default. If you
   paste an Anthropic API key (stored only in this browser's
   localStorage), it also calls Claude directly, grounded in the
   KB, with graceful fallback to retrieval. No key is ever sent
   anywhere except api.anthropic.com.
   ============================================================ */
(function () {
  "use strict";
  var DATA = window.HUB_DATA || { categories: [], qa: [], core: "" };
  var LS_KEY = "ohmh.anthropic_key";
  var LS_MODEL = "ohmh.model";
  var DEFAULT_MODEL = "claude-opus-4-8";
  var MODELS = [
    { id: "claude-opus-4-8", label: "Claude Opus 4.8 (default)" },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (faster, cheaper)" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (fastest)" }
  ];

  var STOP = {the:1,a:1,an:1,is:1,are:1,do:1,does:1,how:1,what:1,for:1,to:1,of:1,in:1,on:1,it:1,we:1,our:1,i:1,me:1,my:1,you:1,your:1,and:1,or:1,can:1,with:1,about:1,this:1,that:1,when:1,where:1,who:1};
  function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c];}); }
  function tokens(s){ return String(s||"").toLowerCase().split(/[^a-z0-9$]+/).filter(function(w){return w.length>2 && !STOP[w];}); }
  function docHref(f){ return "docs/" + f; }
  function docLabel(f){ return f.replace(/\.html$/,"").replace(/-/g," ").replace(/\b\w/g,function(c){return c.toUpperCase();}); }

  /* ---------- render KB ---------- */
  var cards = [];
  function renderKB(){
    var root = document.getElementById("kb-root");
    var nav = document.getElementById("catnav");
    if(!root) return;
    DATA.categories.forEach(function(cat){
      var items = DATA.qa.filter(function(x){return x.category===cat.key;});
      if(!items.length) return;
      var sec = document.createElement("div");
      sec.className = "cat"; sec.id = "cat-"+cat.key;
      var h = document.createElement("div"); h.className = "cat-h";
      h.innerHTML = "<span>"+esc(cat.title)+"</span><span class=\"ct\" data-ct=\""+cat.key+"\">"+items.length+"</span>";
      sec.appendChild(h);
      items.forEach(function(x){
        var d = document.createElement("details"); d.className = "qa";
        var tags = (x.tags||[]).slice(0,4).map(function(t){return "<span class=\"tag\">"+esc(t)+"</span>";}).join("");
        d.innerHTML =
          "<summary><span class=\"qtext\">"+esc(x.q)+"</span><span class=\"chev cb-i\"><i class=\"ri-arrow-down-s-line\"></i></span></summary>"+
          "<div class=\"ans\"><span class=\"atext\">"+esc(x.a)+"</span>"+
          "<div class=\"foot\">"+tags+"<a class=\"doclink\" href=\""+docHref(x.doc)+"\" target=\"_blank\" rel=\"noopener\"><span class=\"cb-i\"><i class=\"ri-file-text-line\"></i></span> "+esc(docLabel(x.doc))+"</a></div></div>";
        sec.appendChild(d);
        cards.push({ el:d, qa:x, hay:(x.q+" "+x.a+" "+(x.tags||[]).join(" ")).toLowerCase(),
          qEl:d.querySelector(".qtext"), aEl:d.querySelector(".atext"), qText:x.q, aText:x.a });
      });
      root.appendChild(sec);
      if(nav){
        var a = document.createElement("a"); a.className="nav"; a.href="#cat-"+cat.key;
        a.innerHTML = "<span>"+esc(cat.title)+"</span><span class=\"ct\" data-nav=\""+cat.key+"\">"+items.length+"</span>";
        nav.appendChild(a);
      }
    });
  }

  /* ---------- instant filter ---------- */
  function hi(text, toks){
    var out = esc(text);
    if(!toks.length) return out;
    toks.forEach(function(t){
      var re = new RegExp("("+t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+")","ig");
      out = out.replace(re,"<mark>$1</mark>");
    });
    return out;
  }
  function filter(){
    var input = document.getElementById("q");
    if(!input) return;
    var qv = input.value.trim();
    var toks = tokens(qv);
    var shown = 0, perCat = {};
    cards.forEach(function(c){
      var match = toks.length===0 || toks.every(function(t){return c.hay.indexOf(t)>=0;});
      c.el.classList.toggle("hide", !match);
      if(match){
        shown++; perCat[c.qa.category]=(perCat[c.qa.category]||0)+1;
        c.el.open = toks.length>0;
        c.qEl.innerHTML = hi(c.qText, toks);
        c.aEl.innerHTML = hi(c.aText, toks);
      } else { c.el.open=false; }
    });
    DATA.categories.forEach(function(cat){
      var n = perCat[cat.key]||0;
      var sec = document.getElementById("cat-"+cat.key);
      if(sec) sec.classList.toggle("hide", n===0);
      var ct = document.querySelector("[data-ct=\""+cat.key+"\"]"); if(ct) ct.textContent=n;
      var nv = document.querySelector("[data-nav=\""+cat.key+"\"]"); if(nv) nv.textContent=n;
    });
    var count = document.getElementById("count");
    if(count) count.textContent = qv ? (shown+" of "+cards.length+" answers") : (cards.length+" answers");
    var nr = document.getElementById("noresults");
    if(nr) nr.style.display = (shown===0)?"block":"none";
  }

  /* ---------- retrieval ---------- */
  function topMatches(q, k){
    var toks = tokens(q); if(!toks.length) return [];
    return DATA.qa.map(function(x){
      var hay = (x.q+" "+(x.tags||[]).join(" ")+" "+x.a).toLowerCase();
      var s = 0;
      toks.forEach(function(t){
        if(x.q.toLowerCase().indexOf(t)>=0) s+=3;
        if((x.tags||[]).join(" ").indexOf(t)>=0) s+=2;
        if(hay.indexOf(t)>=0) s+=1;
      });
      return {x:x,s:s};
    }).filter(function(r){return r.s>0;}).sort(function(a,b){return b.s-a.s;}).slice(0,k).map(function(r){return r.x;});
  }

  /* ---------- Cory chat ---------- */
  var body, history = [];
  function bubble(who, html){
    var m = document.createElement("div"); m.className = "msg "+who; m.innerHTML = html;
    body.appendChild(m); body.scrollTop = body.scrollHeight; return m;
  }
  function docBtn(f){ return "<a class=\"dlbtn\" href=\""+docHref(f)+"\" target=\"_blank\" rel=\"noopener\"><span class=\"cb-i\"><i class=\"ri-file-text-line\"></i></span> "+esc(docLabel(f))+"</a>"; }

  function retrievalAnswer(q){
    var hits = topMatches(q, 3);
    if(!hits.length){
      return { html: "I could not find that in the marketing knowledge base. Try terms like audience, pricing, calendar, hashtags, sequence, or certification, or open the documents on the left. For a live answer, add an Anthropic API key in settings (the key icon).", doc: null };
    }
    var html = hits.map(function(x,i){ return (i===0?"":"<br><br>")+"<b>"+esc(x.q)+"</b><br>"+esc(x.a); }).join("");
    return { html: html, doc: hits[0].doc };
  }

  function buildSystem(q){
    var ctx = topMatches(q, 8).map(function(x){ return "Q: "+x.q+"\nA: "+x.a; }).join("\n\n");
    return [
      "You are Cory, the marketing assistant for the Colaberry AI Systems Architect Accelerator Open House campaign.",
      "Answer the team's questions about the campaign, the program, the content, and the plan, using ONLY the facts below.",
      "Rules: warm and concise, sentence case, speak to you, no emoji, no em-dash characters. Lead with proof when relevant.",
      "Never invent facts, numbers, testimonials, names, dates, or claims. If a detail is not provided, say you do not have it and point to the relevant document or the Open House.",
      "Pricing may be stated when asked (it is revealed at the Open House) but keep it out of awareness post copy.",
      "Answer directly with no preamble and no exposed reasoning.",
      "",
      "CORE FACTS:",
      DATA.core,
      "",
      "RELEVANT KNOWLEDGE BASE ENTRIES:",
      ctx || "(none matched; rely on core facts and say if unsure)"
    ].join("\n");
  }

  function getKey(){ try { return localStorage.getItem(LS_KEY) || ""; } catch(e){ return ""; } }
  function getModel(){ try { return localStorage.getItem(LS_MODEL) || DEFAULT_MODEL; } catch(e){ return DEFAULT_MODEL; } }

  function askLive(q, target){
    var key = getKey();
    var sys = buildSystem(q);
    history.push({ role:"user", content:q });
    var msgs = history.slice(-8);
    var acc = "";
    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: getModel(),
        max_tokens: 1024,
        system: sys,
        messages: msgs,
        stream: true
      })
    }).then(function(resp){
      if(!resp.ok || !resp.body){
        return resp.text().then(function(t){ throw new Error("HTTP "+resp.status+" "+t.slice(0,160)); });
      }
      var reader = resp.body.getReader();
      var dec = new TextDecoder();
      var buf = "";
      function pump(){
        return reader.read().then(function(res){
          if(res.done){ history.push({ role:"assistant", content:acc }); return; }
          buf += dec.decode(res.value, { stream:true });
          var lines = buf.split("\n");
          buf = lines.pop();
          lines.forEach(function(line){
            line = line.trim();
            if(!line || line.indexOf("data:")!==0) return;
            var payload = line.slice(5).trim();
            if(payload==="[DONE]") return;
            try {
              var ev = JSON.parse(payload);
              if(ev.type==="content_block_delta" && ev.delta && ev.delta.type==="text_delta"){
                acc += ev.delta.text;
                target.innerHTML = esc(acc).replace(/\n/g,"<br>");
                body.scrollTop = body.scrollHeight;
              }
            } catch(e){ /* ignore partial */ }
          });
          return pump();
        });
      }
      return pump();
    }).then(function(){
      if(!acc){ var r = retrievalAnswer(q); target.innerHTML = r.html + (r.doc?("<br>"+docBtn(r.doc)):""); }
    }).catch(function(err){
      var r = retrievalAnswer(q);
      target.innerHTML = "<span style=\"color:var(--status-danger)\">Live answer unavailable ("+esc(String(err.message||err)).slice(0,90)+"). Showing the knowledge base instead.</span><br><br>" + r.html + (r.doc?("<br>"+docBtn(r.doc)):"");
    });
  }

  function ask(q){
    bubble("me", esc(q));
    var t = bubble("mira", "<span style=\"color:var(--text-muted)\">Thinking...</span>");
    if(getKey()){
      askLive(q, t);
    } else {
      setTimeout(function(){
        var r = retrievalAnswer(q);
        t.innerHTML = r.html + (r.doc?("<br>"+docBtn(r.doc)):"");
      }, 120);
    }
  }

  /* ---------- chat UI ---------- */
  function openChat(){ document.getElementById("mira-panel").classList.add("open"); document.getElementById("mira-launch").style.display="none"; var i=document.getElementById("mira-q"); if(i) i.focus(); }
  function closeChat(){ document.getElementById("mira-panel").classList.remove("open"); document.getElementById("mira-launch").style.display="flex"; }

  function toggleSettings(){
    var p = document.getElementById("mira-settings");
    if(!p) return;
    p.classList.toggle("open");
    if(p.classList.contains("open")){
      var k = document.getElementById("mira-key"); if(k) k.value = getKey();
      var m = document.getElementById("mira-model"); if(m) m.value = getModel();
    }
  }
  function saveSettings(){
    var k = document.getElementById("mira-key");
    var m = document.getElementById("mira-model");
    try {
      if(k){ if(k.value.trim()) localStorage.setItem(LS_KEY, k.value.trim()); else localStorage.removeItem(LS_KEY); }
      if(m) localStorage.setItem(LS_MODEL, m.value);
    } catch(e){}
    document.getElementById("mira-settings").classList.remove("open");
    bubble("mira", getKey() ? "Live mode is on. I will answer with Claude, grounded in this kit." : "Live mode is off. I will answer from the knowledge base. Add a key in settings for live answers.");
  }

  function initChat(){
    body = document.getElementById("mira-body");
    if(!body) return;
    var live = getKey();
    bubble("mira", "Hi, I am Cory, the marketing assistant for the Open House campaign. Ask me about the audience, the sequence, pricing, the calendar, hashtags, or the program. "+(live?"Live mode is on.":"Add an Anthropic API key with the key icon for live answers; otherwise I answer from the knowledge base."));
    var c = document.createElement("div"); c.className = "msg mira";
    c.innerHTML = "<div class=\"chips\">"+
      "<span class=\"chip\" data-ask=\"What is the single goal of the campaign?\">Campaign goal</span>"+
      "<span class=\"chip\" data-ask=\"What are the five beats?\">The 5 beats</span>"+
      "<span class=\"chip\" data-ask=\"What does the program cost and when do we reveal pricing?\">Pricing</span>"+
      "<span class=\"chip\" data-ask=\"What is still needed before we can publish?\">Open items</span></div>";
    body.appendChild(c);

    document.getElementById("mira-launch").addEventListener("click", openChat);
    document.getElementById("mira-close").addEventListener("click", closeChat);
    var setBtn = document.getElementById("mira-settings-btn"); if(setBtn) setBtn.addEventListener("click", toggleSettings);
    var saveBtn = document.getElementById("mira-save"); if(saveBtn) saveBtn.addEventListener("click", saveSettings);

    function send(){ var i=document.getElementById("mira-q"); var v=i.value.trim(); if(!v) return; i.value=""; ask(v); }
    document.getElementById("mira-send").addEventListener("click", send);
    document.getElementById("mira-q").addEventListener("keydown", function(e){ if(e.key==="Enter") send(); });

    document.addEventListener("click", function(e){
      var chip = e.target.closest(".chip"); if(!chip) return;
      openChat(); ask(chip.getAttribute("data-ask"));
    });

    // populate model dropdown
    var sel = document.getElementById("mira-model");
    if(sel){ sel.innerHTML = MODELS.map(function(m){ return "<option value=\""+m.id+"\">"+esc(m.label)+"</option>"; }).join(""); sel.value = getModel(); }
  }

  /* ---------- boot ---------- */
  document.addEventListener("DOMContentLoaded", function(){
    renderKB();
    var q = document.getElementById("q");
    if(q){ q.addEventListener("input", filter); }
    filter();
    initChat();
  });
})();
