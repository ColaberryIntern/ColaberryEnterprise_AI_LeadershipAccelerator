/* ============================================================
   Colaberry Knowledge Base - unified engine
   Merges window.KB_DATA (sales) + window.HUB_DATA (marketing)
   + window.DESIGN_DATA (design) into one domain-tagged model.
   Top-nav driven, home -> browse flow. Cory: retrieval by
   default; live Claude if a key is set (localStorage only,
   sent only to Anthropic). Works from file://.
   New domain = drop a *-kb.js (window.X_DATA) + add a DOMAINS
   entry with dataGlobal:"X_DATA" + a tab renders automatically.
   ============================================================ */
(function () {
  "use strict";

  var LS_KEY = "ckb.anthropic_key";
  var LS_MODEL = "ckb.model";
  var DEFAULT_MODEL = "claude-opus-4-8";
  var MODELS = [
    { id: "claude-opus-4-8", label: "Claude Opus 4.8 (default)" },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (faster, cheaper)" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (fastest)" }
  ];

  var CORE = [
    "Colaberry runs the AI Systems Architect Accelerator, powered by Anthropic and Claude Code: a 12-week, project-based program that moves people from AI consumer to AI builder.",
    "Free Open House: Thursday July 16, 2026. Founding Cohort kickoff: Thursday July 23, 2026. Founding cohort capped at 40 seats. Pricing: $149/mo billed annually (founding rate, locked while active) or $199/mo monthly. Enroll at training.colaberry.com.",
    "Students also cover their own third-party tool costs, paid directly to providers: an Anthropic subscription for Claude Code (about $20/mo) and LLM API usage (usually under $10/mo). Disclose before enrollment.",
    "Refund and cancellation terms are drafted and pending final approval. Do not quote them as final.",
    "The design domain is the Colaberry design system: cherry red #FB2832 (primary, constant), leaf green #77BB4A, berry blue #367895; Roboto and Roboto Mono type; semantic tokens; warm, emoji-free voice.",
    "Never invent facts, numbers, testimonials, names, dates, or claims. If a detail is not in the knowledge base, say so and point to the relevant document or the Open House."
  ].join(" ");

  var DOMAINS = [
    { key:"sales", label:"Sales", icon:"ri-funds-line", color:"var(--green-600)", status:"active", dataGlobal:"KB_DATA",
      blurb:"Everything to win a call: pricing, objections, the founding cohort, certification, eligibility, and the call script.",
      hub:"sales/index.html",
      resources:[
        { href:"sales/downloads/01-founding-cohort-one-pager.pdf", icon:"ri-file-paper-2-line", t:"Founding Cohort one-pager", d:"Program, pricing, dates, CTA. Hand to a prospect." },
        { href:"sales/downloads/02-objection-handling-sheet.pdf", icon:"ri-question-answer-line", t:"Objection-handling sheet", d:"Rep-ready answers to the common pushbacks." },
        { href:"sales/downloads/04-sales-call-script.pdf", icon:"ri-phone-line", t:"Admissions call script", d:"The six-step admissions call flow." },
        { href:"sales/downloads/03-outbound-emails-and-dms.pdf", icon:"ri-mail-send-line", t:"Outbound emails + DMs", d:"Three persona emails and DMs (drafts)." },
        { href:"sales/downloads/00-positioning-guardrails.pdf", icon:"ri-focus-3-line", t:"Positioning guardrails", d:"Source of truth, do and do-not-say." },
        { href:"sales/index.html", icon:"ri-external-link-line", t:"Open the full Sales hub", d:"Search, flows, downloads, and Cory for prep." }
      ] },
    { key:"marketing", label:"Marketing", icon:"ri-megaphone-line", color:"var(--red-500)", status:"active", dataGlobal:"HUB_DATA",
      blurb:"The Open House push: strategy, the prompt engine, ready post copy, the calendar, creative, KPIs, and brand.",
      hub:"marketing/index.html", resources:null /* derived from docs */ },
    { key:"design", label:"Design", icon:"ri-palette-line", color:"var(--blue-600)", status:"active", dataGlobal:"DESIGN_DATA",
      blurb:"The Colaberry design system: colors, type, logo, 20 components, templates, motion, accessibility, and how to prompt Claude with it.",
      hub:"design/design-system.html",
      resources:[
        { href:"design/design-system.html", icon:"ri-layout-masonry-line", t:"Design system guide", d:"Living docs: tokens, live components, WCAG audit, hand-off." },
        { href:"design/BRAND.md", icon:"ri-government-line", t:"Brand guide", d:"One-page rules: color, type, logo, motion, voice, prompting." },
        { href:"design/IMPLEMENTATION.md", icon:"ri-code-s-slash-line", t:"Implementation guide", d:"Install for plain HTML, React, Vite, and Next." },
        { href:"design/Colaberry%20Social%20Media%20Kit.html", icon:"ri-instagram-line", t:"Social media kit", d:"On-brand social templates." },
        { href:"design/AI-Architect-Accelerator-Brochure.html", icon:"ri-booklet-line", t:"Accelerator brochure", d:"A finished brochure built on the system." },
        { href:"design/index.html", icon:"ri-external-link-line", t:"Open the full Design System", d:"The animated landing and full guide (best on a server)." }
      ] },
    { key:"curriculum", label:"Curriculum & Training", icon:"ri-graduation-cap-line", color:"var(--green-700)", status:"active", dataGlobal:"CURRICULUM_DATA",
      blurb:"The 12-week program: the four intensives, the tools and skills you build, the internship and portfolio lanes, levels, and certification.",
      hub:"sales/index.html",
      resources:[
        { href:"marketing/docs/program-fact-sheet.html", icon:"ri-file-list-3-line", t:"Program fact sheet", d:"The program at a glance: structure, dates, and what is included." },
        { href:"sales/index.html", icon:"ri-external-link-line", t:"Pricing & enrollment", d:"Open the Sales hub for plans, eligibility, and how to enroll." }
      ] },
    { key:"product", label:"Product & Platform", icon:"ri-stack-line", color:"var(--blue-500)", status:"active", dataGlobal:"PRODUCT_DATA",
      blurb:"The student platform and the Colaberry AI Membership as a product: what is included, the plans, the tracks, and the tools you use.",
      hub:"sales/index.html",
      resources:[
        { href:"marketing/docs/program-fact-sheet.html", icon:"ri-file-list-3-line", t:"Program fact sheet", d:"What the membership includes, in one page." },
        { href:"sales/index.html", icon:"ri-external-link-line", t:"Plans & enrollment", d:"Open the Sales hub for pricing and to enroll." }
      ] },
    { key:"compliance", label:"Compliance & Trust", icon:"ri-shield-check-line", color:"var(--amber-500)", status:"active", dataGlobal:"COMPLIANCE_DATA",
      blurb:"Colaberry's credentials and track record: the regulated career school, more than 5,000 careers since 2012, student protections, and how we communicate.",
      resources:null }
  ];
  function domain(k){ for(var i=0;i<DOMAINS.length;i++){ if(DOMAINS[i].key===k) return DOMAINS[i]; } return null; }
  function activeLabels(){ return DOMAINS.filter(function(d){return d.status==="active";}).map(function(d){return d.label;}).join(", "); }

  /* ---------- charts (mermaid) ---------- */
  var PAL = {
    hub:{f:"#1b1b1b",b:"#1b1b1b",t:"#ffffff"},
    s:{f:"#d3ebc0",b:"#4a8f2e",t:"#1f3d12"},
    m:{f:"#fbd2d5",b:"#FB2832",t:"#5a0a0e"},
    d:{f:"#cfe1ea",b:"#367895",t:"#14323d"},
    c:{f:"#d7ebc4",b:"#3f7d2a",t:"#1c3c12"},
    p:{f:"#cfe1ef",b:"#3f7fab",t:"#143042"},
    k:{f:"#fae2bd",b:"#E8920C",t:"#5a3a05"},
    node:{f:"#f3f5f7",b:"#aab2bc",t:"#1b1b1b"}
  };
  function sty(ids, key){ var p=PAL[key]; return ids.map(function(id){ return "style " + id + " fill:" + p.f + ",stroke:" + p.b + ",stroke-width:1.5px,color:" + p.t; }).join("\n"); }
  function mm(dir, lines){ return "flowchart " + dir + "\n" + lines.join("\n"); }
  var CHARTS = {
    home: mm("LR", [
      'OH["Free Open House<br/>Jul 16"] --> FC["Founding Cohort<br/>starts Jul 23"] --> WK["12 weeks<br/>4 intensives"] --> CAP["Capstone<br/>+ Architect Expo"] --> CE["Anthropic Architect<br/>certification"]',
      sty(["OH","FC"],"s"), sty(["WK","CAP","CE"],"c"),
      'click OH call kbChart("sales","open house")',
      'click FC call kbChart("sales","founding cohort")',
      'click WK call kbChart("curriculum","intensive")',
      'click CAP call kbChart("curriculum","capstone")',
      'click CE call kbChart("curriculum","certification")'
    ]),
    all: mm("LR", [
      'KB["Knowledge Base"] --> S["Sales"]',
      'KB --> M["Marketing"]', 'KB --> D["Design"]', 'KB --> C["Curriculum"]', 'KB --> P["Product"]', 'KB --> K["Compliance and Trust"]',
      sty(["KB"],"hub"), sty(["S"],"s"), sty(["M"],"m"), sty(["D"],"d"), sty(["C"],"c"), sty(["P"],"p"), sty(["K"],"k"),
      'click S call kbChart("sales","")', 'click M call kbChart("marketing","")', 'click D call kbChart("design","")',
      'click C call kbChart("curriculum","")', 'click P call kbChart("product","")', 'click K call kbChart("compliance","")'
    ]),
    sales: mm("LR", [
      'A["Awareness"] --> O["Open House"] --> F["Founding Cohort"] --> E["Enrolled"]',
      'O --> PR["Pricing and billing"]', 'F --> OB["Objections"]', 'E --> CE["Certification"]',
      sty(["A","O","F","E"],"s"), sty(["PR","OB","CE"],"node"),
      'click O call kbChart("sales","open house")', 'click F call kbChart("sales","founding cohort")',
      'click E call kbChart("sales","enrollment")', 'click PR call kbChart("sales","pricing")',
      'click OB call kbChart("sales","objection")', 'click CE call kbChart("sales","certification")'
    ]),
    marketing: mm("LR", [
      'G["Goal:<br/>Open House regs"] --> CH["Channels"] --> CT["Content"] --> KP["KPIs"]',
      'CH --> LI["LinkedIn + email"]', 'CT --> CA["Calendar"]',
      sty(["G","CH","CT","KP"],"m"), sty(["LI","CA"],"node"),
      'click G call kbChart("marketing","open house")', 'click CH call kbChart("marketing","channel")',
      'click CT call kbChart("marketing","content")', 'click KP call kbChart("marketing","kpi")',
      'click LI call kbChart("marketing","linkedin")', 'click CA call kbChart("marketing","calendar")'
    ]),
    design: mm("TD", [
      'BR["Brand<br/>BRAND.md + assets"] --> CO["Code<br/>tokens + components"] --> AG["Agent<br/>SKILL.md + docs"]',
      'CO --> CL["Color"]', 'CO --> TY["Typography"]', 'CO --> CM["Components"]',
      sty(["BR","CO","AG"],"d"), sty(["CL","TY","CM"],"node"),
      'click BR call kbChart("design","brand")', 'click CO call kbChart("design","token")', 'click AG call kbChart("design","prompt")',
      'click CL call kbChart("design","color")', 'click TY call kbChart("design","typography")', 'click CM call kbChart("design","component")'
    ]),
    curriculum: mm("LR", [
      'I1["1 Foundation<br/>W1-3"] --> I2["2 AI Team<br/>W4-6"] --> I3["3 Real World<br/>W7-9"] --> I4["4 Scale<br/>W10-12"] --> CAP["Capstone + Expo"]',
      'I4 --> CE["Certification"]', 'I1 --> LN["Project, internship<br/>and portfolio"]',
      sty(["I1","I2","I3","I4","CAP"],"c"), sty(["CE","LN"],"node"),
      'click I1 call kbChart("curriculum","foundation")', 'click I2 call kbChart("curriculum","team")',
      'click I3 call kbChart("curriculum","real world")', 'click I4 call kbChart("curriculum","scale")',
      'click CAP call kbChart("curriculum","capstone")', 'click CE call kbChart("curriculum","certification")',
      'click LN call kbChart("curriculum","internship")'
    ]),
    product: mm("TD", [
      'MEM["Colaberry AI Membership"] --> INC["Includes<br/>4 intensives, cert,<br/>internship, portfolio"]',
      'MEM --> PL["Plans<br/>$149 annual / $199 monthly"]', 'MEM --> TR["Tracks<br/>pro, beginner, builder"]',
      sty(["MEM"],"p"), sty(["INC","PL","TR"],"node"),
      'click MEM call kbChart("product","membership")', 'click INC call kbChart("product","included")',
      'click PL call kbChart("product","pricing")', 'click TR call kbChart("product","track")'
    ]),
    compliance: mm("LR", [
      'REG["Regulated school<br/>COA U5306"] --> TR["Track record<br/>5,000+ since 2012"] --> SP["Student protections"] --> TP["Transparency"]',
      sty(["REG","TR","SP","TP"],"k"),
      'click REG call kbChart("compliance","regulated")', 'click TR call kbChart("compliance","track record")',
      'click SP call kbChart("compliance","protect")', 'click TP call kbChart("compliance","transparen")'
    ])
  };
  var CHART_SEQ = 0, MERMAID_READY = false;
  function initMermaid(){
    if(MERMAID_READY || !window.mermaid) return;
    try {
      window.mermaid.initialize({
        startOnLoad:false, securityLevel:"loose", theme:"base",
        flowchart:{ htmlLabels:true, curve:"basis", useMaxWidth:true, padding:10 },
        themeVariables:{ fontFamily:"Roboto, system-ui, sans-serif", fontSize:"14px", lineColor:"#9aa3ad" }
      });
      MERMAID_READY = true;
    } catch(e){}
  }
  function renderChart(key, containerId){
    var el = document.getElementById(containerId); if(!el) return;
    var def = CHARTS[key]; if(!def){ el.innerHTML=""; el.style.display="none"; return; }
    if(el.getAttribute("data-key")===key && el.querySelector("svg")) return; // already current
    if(!window.mermaid){ el.style.display="none"; return; }
    initMermaid();
    var gid = "kbmmd" + (++CHART_SEQ);
    var hint = '<p class="charthint"><span class="cb-i"><i class="ri-cursor-line"></i></span> Click any box to filter the answers' + (containerId==="home-chart" ? " by topic." : " below.") + '</p>';
    try {
      window.mermaid.render(gid, def).then(function(res){
        el.innerHTML = hint + res.svg;
        if(res.bindFunctions) res.bindFunctions(el);
        el.style.display=""; el.setAttribute("data-key", key);
      }).catch(function(){ el.style.display="none"; });
    } catch(e){ el.style.display="none"; }
  }

  /* ---------- chart -> filter bridge, and Cory deep links ---------- */
  function kbChart(scope2, q){
    var inp = document.getElementById("q"); if(inp) inp.value = q || "";
    var target = (scope2 && domain(scope2)) ? scope2 : "all";
    goScope(target);
    filter();
    var anchor = document.getElementById("kb-root");
    if(anchor) setTimeout(function(){ try{ anchor.scrollIntoView({behavior:"smooth", block:"start"}); }catch(e){} }, 70);
  }
  window.kbChart = kbChart;
  function srcLink(e){
    return '<a class="cory-src" data-scope="' + e.domain + '" data-q="' + esc(e.q) + '" role="button" tabindex="0">' +
      '<span class="cb-i"><i class="ri-arrow-right-circle-line"></i></span><span>' + esc(e.q) + '</span><em>' + esc(e.domain) + '</em></a>';
  }
  function coryOpen(scope2, q){
    closeCory();
    kbChart(scope2, q);
    setTimeout(function(){
      for(var i=0;i<cards.length;i++){ if(cards[i].e.q===q){ cards[i].el.open=true; try{ cards[i].el.scrollIntoView({behavior:"smooth", block:"center"}); }catch(e){} break; } }
    }, 150);
  }

  var STOP = {the:1,a:1,an:1,is:1,are:1,do:1,does:1,how:1,what:1,for:1,to:1,of:1,in:1,on:1,it:1,we:1,our:1,i:1,me:1,my:1,you:1,your:1,and:1,or:1,can:1,with:1,about:1,this:1,that:1,when:1,where:1,who:1};
  function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c];}); }
  function tokens(s){ return String(s||"").toLowerCase().split(/[^a-z0-9$]+/).filter(function(w){return w.length>2 && !STOP[w];}); }
  function docLabel(f){ return f.replace(/\.html$/,"").replace(/-/g," ").replace(/\b\w/g,function(c){return c.toUpperCase();}); }
  function openAttr(href){ return /^https?:|\.pdf$/i.test(href) ? " target=\"_blank\" rel=\"noopener\"" : ""; }
  function mdlite(s){ return esc(s).replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>").replace(/`([^`]+)`/g,"<code>$1</code>").replace(/\n/g,"<br>"); }

  /* ---------- build unified model ---------- */
  var ENTRIES = [], CATS = [];
  function build(){
    DOMAINS.forEach(function(d){
      if(d.status!=="active" || !d.dataGlobal) return;
      var data = window[d.dataGlobal];
      if(!data || !data.qa) return;
      var cm = {};
      (data.categories||[]).forEach(function(c){ cm[c.key]=c.title; CATS.push({domain:d.key, key:c.key, title:c.title}); });
      data.qa.forEach(function(x){
        var ref=null, refLabel=null, flag=false;
        if(d.key==="marketing"){ if(x.doc){ ref="marketing/docs/"+x.doc; refLabel=docLabel(x.doc); } }
        else if(d.key==="sales"){ flag = (x.confidence==="drafted-verify"); ref="sales/index.html#cat-"+x.category; refLabel=cm[x.category]||"Sales hub"; }
        else if(x.ref){ ref=x.ref; refLabel=x.refLabel||"Reference"; }
        ENTRIES.push({ domain:d.key, cat:x.category, catTitle:cm[x.category]||x.category, q:x.q, a:x.a, detail:x.detail||"", tags:x.tags||[], flag:flag, ref:ref, refLabel:refLabel });
      });
      if(d.key==="marketing"){
        var seen={}, list=[];
        data.qa.forEach(function(x){ if(x.doc && !seen[x.doc]){ seen[x.doc]=1; list.push({ href:"marketing/docs/"+x.doc, icon:"ri-file-text-line", t:docLabel(x.doc), d:"" }); } });
        list.push({ href:"marketing/index.html", icon:"ri-external-link-line", t:"Open the full Marketing hub", d:"Search, the campaign snapshot, and Cory." });
        d.resources = list;
      }
    });
    ENTRIES.forEach(function(e){ e.hay = (e.q+" "+e.a+" "+e.detail+" "+(e.tags||[]).join(" ")+" "+e.catTitle).toLowerCase(); });
  }
  function domCount(k){ var n=0; ENTRIES.forEach(function(e){ if(e.domain===k) n++; }); return n; }

  /* ---------- state ---------- */
  var scope = "all";

  /* ---------- top-nav tabs ---------- */
  function renderTabs(){
    var root = document.getElementById("domtabs"); if(!root) return;
    var html = '<button class="tab" data-scope="all"><span class="cb-i"><i class="ri-apps-2-line"></i></span> All</button>';
    DOMAINS.forEach(function(d){
      if(d.status==="active") html += '<button class="tab" data-scope="'+d.key+'"><span class="cb-i"><i class="'+d.icon+'"></i></span> '+esc(d.label)+'</button>';
    });
    root.innerHTML = html;
    root.querySelectorAll(".tab[data-scope]").forEach(function(b){ b.addEventListener("click", function(){ goScope(b.getAttribute("data-scope")); }); });
  }

  /* ---------- home domain cards ---------- */
  function renderTiles(){
    var root = document.getElementById("tiles"); if(!root) return;
    root.innerHTML = DOMAINS.filter(function(d){return d.status==="active";}).map(function(d){
      return '<div class="dcard" role="button" tabindex="0" aria-label="Open '+esc(d.label)+'" data-dom="'+d.key+'">'+
        '<span class="ic" style="background:'+d.color+'" aria-hidden="true"><span class="cb-i"><i class="'+d.icon+'"></i></span></span>'+
        '<h3>'+esc(d.label)+'</h3><p>'+esc(d.blurb)+'</p>'+
        '<div class="foot"><span class="n">'+domCount(d.key)+' answers</span><span class="go">Open <span class="cb-i"><i class="ri-arrow-right-line"></i></span></span></div>'+
      '</div>';
    }).join("");
    root.querySelectorAll(".dcard[data-dom]").forEach(function(t){
      t.addEventListener("click", function(){ goScope(t.getAttribute("data-dom")); });
      t.addEventListener("keydown", function(e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); goScope(t.getAttribute("data-dom")); } });
    });
    var soon = document.getElementById("soonrow");
    if(soon){
      soon.innerHTML = DOMAINS.filter(function(d){return d.status==="soon";}).map(function(d){
        return '<span class="soonchip"><span class="cb-i"><i class="'+d.icon+'"></i></span> '+esc(d.label)+' <em>Soon</em></span>';
      }).join("");
    }
  }

  /* ---------- KB render ---------- */
  var cards = [];
  function renderKB(){
    var root = document.getElementById("kb-root"); if(!root) return;
    root.innerHTML = ""; cards = [];
    DOMAINS.filter(function(d){return d.status==="active";}).forEach(function(d){
      var band = document.createElement("div"); band.className="domband"; band.id="dom-"+d.key;
      band.innerHTML = '<span class="dot" style="background:'+d.color+'"><span class="cb-i"><i class="'+d.icon+'"></i></span></span><h3>'+esc(d.label)+'</h3><span class="sub">'+domCount(d.key)+' answers</span>';
      root.appendChild(band);
      CATS.filter(function(c){return c.domain===d.key;}).forEach(function(c){
        var items = ENTRIES.filter(function(e){return e.domain===d.key && e.cat===c.key;});
        if(!items.length) return;
        var sec = document.createElement("div"); sec.className="cat"; sec.id="cat-"+d.key+"-"+c.key;
        var h = document.createElement("div"); h.className="cat-h";
        h.innerHTML = "<span>"+esc(c.title)+"</span><span class=\"ct\" data-ct=\""+d.key+"-"+c.key+"\">"+items.length+"</span>";
        sec.appendChild(h);
        items.forEach(function(e){
          var det = document.createElement("details"); det.className="qa";
          var tags = (e.tags||[]).slice(0,4).map(function(t){return "<span class=\"tag\">"+esc(t)+"</span>";}).join("");
          var dbadge = "<span class=\"dbadge "+e.domain+"\">"+e.domain+"</span>";
          var flag = e.flag ? "<span class=\"flag\">verify before quoting</span>" : "";
          var ref = e.ref ? "<a class=\"doclink\" href=\""+e.ref+"\""+openAttr(e.ref)+"><span class=\"cb-i\"><i class=\"ri-file-text-line\"></i></span> "+esc(e.refLabel)+"</a>" : "";
          det.innerHTML =
            "<summary><span class=\"qtext\">"+esc(e.q)+"</span><span class=\"chev cb-i\"><i class=\"ri-arrow-down-s-line\"></i></span></summary>"+
            "<div class=\"ans\"><span class=\"atext\">"+esc(e.a)+"</span>"+
            (e.detail?"<div class=\"detail\">"+esc(e.detail)+"</div>":"")+
            "<div class=\"foot\">"+dbadge+flag+tags+ref+"</div></div>";
          sec.appendChild(det);
          cards.push({ el:det, e:e, qEl:det.querySelector(".qtext"), aEl:det.querySelector(".atext"), qText:e.q, aText:e.a });
        });
        root.appendChild(sec);
      });
    });
  }

  /* ---------- filter ---------- */
  function hi(text, toks){ var out=esc(text); if(!toks.length) return out; toks.forEach(function(t){ var re=new RegExp("("+t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+")","ig"); out=out.replace(re,"<mark>$1</mark>"); }); return out; }
  function filter(){
    var input = document.getElementById("q");
    var qv = input ? input.value.trim() : "";
    var toks = tokens(qv);
    var shown=0, perCat={}, perDom={};
    cards.forEach(function(c){
      var inScope = (scope==="all" || c.e.domain===scope);
      var match = inScope && (toks.length===0 || toks.every(function(t){return c.e.hay.indexOf(t)>=0;}));
      c.el.classList.toggle("hide", !match);
      if(match){
        shown++;
        perCat[c.e.domain+"-"+c.e.cat]=(perCat[c.e.domain+"-"+c.e.cat]||0)+1;
        perDom[c.e.domain]=(perDom[c.e.domain]||0)+1;
        c.el.open = toks.length>0;
        c.qEl.innerHTML = hi(c.qText, toks);
        c.aEl.innerHTML = hi(c.aText, toks);
      } else { c.el.open=false; }
    });
    CATS.forEach(function(c){
      var n = perCat[c.domain+"-"+c.key]||0;
      var sec = document.getElementById("cat-"+c.domain+"-"+c.key);
      if(sec) sec.classList.toggle("hide", n===0);
      var ct = document.querySelector("[data-ct=\""+c.domain+"-"+c.key+"\"]"); if(ct) ct.textContent=n;
    });
    DOMAINS.filter(function(d){return d.status==="active";}).forEach(function(d){
      var band = document.getElementById("dom-"+d.key);
      if(band) band.classList.toggle("hide", (perDom[d.key]||0)===0);
    });
    var count = document.getElementById("count"); if(count) count.textContent = shown+" of "+ENTRIES.length+" answers";
    var nr = document.getElementById("noresults"); if(nr) nr.style.display = (shown===0)?"block":"none";
  }

  /* ---------- scope + views ---------- */
  function setScope(s){
    scope = s;
    document.querySelectorAll(".tab[data-scope]").forEach(function(b){ var onb=b.getAttribute("data-scope")===s; b.classList.toggle("on", onb); if(onb){ b.setAttribute("aria-current","true"); } else { b.removeAttribute("aria-current"); } });
    var st = document.getElementById("scopeTitle");
    if(st){
      if(s==="all"){ st.innerHTML = '<span class="dot" style="background:var(--neutral-700)"><span class="cb-i"><i class="ri-apps-2-line"></i></span></span> All domains'; }
      else { var d=domain(s); st.innerHTML = '<span class="dot" style="background:'+(d?d.color:'var(--neutral-700)')+'"><span class="cb-i"><i class="'+(d?d.icon:'ri-folder-line')+'"></i></span></span> '+esc(d?d.label:s); }
    }
    renderResources();
    renderChart(s, "browse-chart");
    filter();
  }
  function debounce(fn, ms){ var t; return function(){ var args=arguments, ctx=this; clearTimeout(t); t=setTimeout(function(){ fn.apply(ctx,args); }, ms); }; }
  function homeView(){
    var h=document.getElementById("home"), b=document.getElementById("browse");
    if(h) h.hidden=false; if(b) b.hidden=true;
    scope="all";
    document.querySelectorAll(".tab[data-scope]").forEach(function(t){ t.classList.remove("on"); t.removeAttribute("aria-current"); });
    var qi=document.getElementById("q"); if(qi) qi.value="";
    filter();
    renderChart("home", "home-chart");
    window.scrollTo({top:0, behavior:"auto"});
  }
  function browseView(s){
    var h=document.getElementById("home"), b=document.getElementById("browse");
    if(h) h.hidden=true; if(b) b.hidden=false;
    setScope(s||"all");
    window.scrollTo({top:0, behavior:"auto"});
  }
  function applyRoute(){
    var hsh=(location.hash||"").replace(/^#/,"");
    if(!hsh || hsh==="home"){ homeView(); }
    else { browseView((hsh==="all"||domain(hsh))?hsh:"all"); }
  }
  function goHome(){ if(location.hash && location.hash!=="#home"){ location.hash="home"; } else { applyRoute(); } }
  function goScope(s){ if(location.hash!=="#"+s){ location.hash=s; } else { applyRoute(); } }
  function onSearch(v){
    var a=document.getElementById("q"); if(a && a.value!==v) a.value=v;
    var browse=document.getElementById("browse");
    if(v && browse && browse.hidden){ goScope("all"); return; }
    filter();
  }

  /* ---------- resources ---------- */
  function renderResources(){
    var root = document.getElementById("res-root"); if(!root) return;
    var doms = DOMAINS.filter(function(d){ return d.status==="active" && (d.resources && d.resources.length) && (scope==="all" || d.key===scope); });
    root.innerHTML = doms.map(function(d){
      var rc = (d.resources||[]).map(function(r){
        return '<a href="'+r.href+'"'+openAttr(r.href)+(/\.pdf$/i.test(r.href)?' download':'')+'>'+
          '<span class="ic" style="background:'+d.color+'"><span class="cb-i"><i class="'+r.icon+'"></i></span></span>'+
          '<div><h4>'+esc(r.t)+'</h4>'+(r.d?'<p>'+esc(r.d)+'</p>':'')+'</div></a>';
      }).join("");
      return '<h3><span class="dot" style="background:'+d.color+'"><span class="cb-i"><i class="'+d.icon+'"></i></span></span> '+esc(d.label)+' documents</h3><div class="res">'+rc+'</div>';
    }).join("");
  }

  /* ---------- Cory assistant ---------- */
  var body, history = [];
  function bubble(who, html){ var m=document.createElement("div"); m.className="msg "+who; m.innerHTML=html; body.appendChild(m); body.scrollTop=body.scrollHeight; return m; }
  function refBtn(e){ return e.ref ? "<a class=\"dlbtn\" href=\""+e.ref+"\""+openAttr(e.ref)+"><span class=\"cb-i\"><i class=\"ri-file-text-line\"></i></span> "+esc(e.refLabel)+"</a>" : ""; }
  function topMatches(q, k){
    var toks = tokens(q); if(!toks.length) return [];
    return ENTRIES.filter(function(e){ return scope==="all" || e.domain===scope; }).map(function(e){
      var s=0; toks.forEach(function(t){ if(e.q.toLowerCase().indexOf(t)>=0)s+=3; if((e.tags||[]).join(" ").indexOf(t)>=0)s+=2; if(e.hay.indexOf(t)>=0)s+=1; });
      return {e:e,s:s};
    }).filter(function(r){return r.s>0;}).sort(function(a,b){return b.s-a.s;}).slice(0,k).map(function(r){return r.e;});
  }
  function retrievalAnswer(q){
    var hits = topMatches(q,3);
    if(!hits.length) return { html:"I could not find that in the knowledge base for this scope. Try All at the top, or terms like pricing, objections, the 12-week plan, certification, components, or tokens. You can also click any box in a chart to filter the page.", links:"" };
    var scopeBit = scope!=="all" ? (" in " + (domain(scope)?domain(scope).label:scope)) : "";
    var top = hits[0];
    var lead = "Here is what I found" + scopeBit + ":";
    var summary = "<br><br><b>" + esc(top.q) + "</b><br>" + esc(top.a);
    var more = hits.length>1
      ? "<br><br>Want the full detail? Tap any of these and I will open it in the docs and filter the page to it:"
      : "<br><br>Tap to open it in the docs:";
    var links = '<div class="cory-srcs">' + hits.map(srcLink).join("") + '</div>';
    return { html: lead + summary + more, links: links };
  }
  function buildSystem(q){
    var ctx = topMatches(q,8).map(function(e){ return "["+e.domain+"] Q: "+e.q+"\nA: "+e.a+(e.detail?("\n("+e.detail+")"):""); }).join("\n\n");
    var scopeLabel = scope==="all" ? ("all domains ("+activeLabels()+")") : (domain(scope)?domain(scope).label:scope);
    return [
      "You are Cory, the assistant for the Colaberry company knowledge base, the single source of truth for the whole company.",
      "The user is currently scoped to: "+scopeLabel+". Answer from that scope using ONLY the facts below.",
      "Rules: warm and concise, sentence case, speak to you, no emoji, no em-dash characters. Lead with proof when relevant.",
      "Never invent facts, numbers, testimonials, names, dates, or claims. If a detail is not provided, say you do not have it and point to the relevant document or the Open House. Refund terms are drafted, not final.",
      "When asked to create new material (a post, email, script, video outline), assemble it only from these facts and say what is still needed.",
      "Answer directly with no preamble and no exposed reasoning.",
      "", "CORE FACTS:", CORE, "",
      "RELEVANT KNOWLEDGE BASE ENTRIES (scope: "+scopeLabel+"):",
      ctx || "(none matched; rely on core facts and say if unsure)"
    ].join("\n");
  }
  function getKey(){ try { return localStorage.getItem(LS_KEY)||""; } catch(e){ return ""; } }
  function getModel(){ try { return localStorage.getItem(LS_MODEL)||DEFAULT_MODEL; } catch(e){ return DEFAULT_MODEL; } }

  var coryBusy=false, coryCtrl=null;
  function setBusy(b){ coryBusy=b; var s=document.getElementById("cory-send"); if(s){ s.disabled=b; s.style.opacity=b?"0.55":""; } }
  function askLive(q, target){
    var sys = buildSystem(q);
    history.push({ role:"user", content:q });
    var acc="", truncated=false; var ctrl=("AbortController" in window)?new AbortController():null; coryCtrl=ctrl;
    var to=setTimeout(function(){ if(ctrl) ctrl.abort(); }, 45000);
    fetch("https://api.anthropic.com/v1/messages", {
      method:"POST", signal: ctrl?ctrl.signal:undefined,
      headers:{ "content-type":"application/json", "x-api-key":getKey(), "anthropic-version":"2023-06-01", "anthropic-dangerous-direct-browser-access":"true" },
      body: JSON.stringify({ model:getModel(), max_tokens:4096, system:sys, messages:history.slice(-8), stream:true })
    }).then(function(resp){
      if(!resp.ok || !resp.body){ return resp.text().then(function(t){ throw new Error("HTTP "+resp.status+" "+t.slice(0,140)); }); }
      var reader = resp.body.getReader(), dec = new TextDecoder(), buf = "";
      function pump(){ return reader.read().then(function(res){
        if(res.done){ if(acc) history.push({ role:"assistant", content:acc }); return; }
        buf += dec.decode(res.value,{stream:true});
        var lines = buf.split("\n"); buf = lines.pop();
        lines.forEach(function(line){
          line = line.trim(); if(!line || line.indexOf("data:")!==0) return;
          var p = line.slice(5).trim(); if(p==="[DONE]") return;
          try { var ev = JSON.parse(p); if(ev.type==="content_block_delta" && ev.delta && ev.delta.type==="text_delta"){ acc += ev.delta.text; target.innerHTML = mdlite(acc); body.scrollTop=body.scrollHeight; } else if(ev.type==="message_delta" && ev.delta && ev.delta.stop_reason==="max_tokens"){ truncated=true; } } catch(e){}
        });
        return pump();
      }); }
      return pump();
    }).then(function(){ clearTimeout(to); setBusy(false); coryCtrl=null;
        if(!acc){ var r=retrievalAnswer(q); target.innerHTML = r.html + (r.links||""); }
        else {
          var hits = topMatches(q,3);
          if(hits.length){ target.innerHTML += '<div class="cory-srcs-lead">Open in the docs:</div><div class="cory-srcs">' + hits.map(srcLink).join("") + '</div>'; }
          if(truncated){ target.innerHTML += "<br><br><em style=\"color:var(--text-muted)\">Response was truncated. Ask Cory to continue.</em>"; }
        } })
      .catch(function(err){ clearTimeout(to); setBusy(false); coryCtrl=null; var r=retrievalAnswer(q); var em=String((err&&err.message)||err); var msg; if(err&&err.name==="AbortError"){ msg="stopped"; } else if(/HTTP 40[13]/.test(em)){ msg="check your API key"; } else if(/HTTP (429|5\d\d)/.test(em)){ msg="service busy, try again shortly"; } else { msg=esc(em).slice(0,80); } target.innerHTML = "<span style=\"color:var(--status-danger)\">Live answer unavailable ("+msg+"). Showing the knowledge base instead.</span><br><br>"+r.html+(r.links||""); });
  }
  function ask(q){
    if(coryBusy) return;
    bubble("me", esc(q));
    var t = bubble("cory","<span style=\"color:var(--text-muted)\">Looking that up...</span>");
    if(getKey()){ setBusy(true); askLive(q,t); } else { setTimeout(function(){ var r=retrievalAnswer(q); t.innerHTML = r.html + (r.links||""); }, 120); }
  }

  function setScopeNote(){ var s=document.getElementById("cory-scope-label"); if(s) s.textContent = (scope==="all"?"All domains":(domain(scope)?domain(scope).label:scope)); }
  var coryLastFocus=null;
  function coryBg(on){ [document.querySelector(".topbar"), document.getElementById("main"), document.querySelector(".site-footer")].forEach(function(el){ if(!el) return; if(on){ try{ el.inert=true; }catch(e){} el.setAttribute("aria-hidden","true"); } else { try{ el.inert=false; }catch(e){} el.removeAttribute("aria-hidden"); } }); }
  function openCory(){ coryLastFocus=document.activeElement; document.getElementById("cory-panel").classList.add("open"); var l=document.getElementById("cory-launch"); l.style.display="none"; l.setAttribute("aria-expanded","true"); coryBg(true); setScopeNote(); var i=document.getElementById("cory-q"); if(i) i.focus(); }
  function closeCory(){ document.getElementById("cory-panel").classList.remove("open"); var l=document.getElementById("cory-launch"); l.style.display="flex"; l.setAttribute("aria-expanded","false"); coryBg(false); if(coryLastFocus && coryLastFocus.focus){ try{ coryLastFocus.focus(); }catch(e){} } }
  function toggleSettings(){ var p=document.getElementById("cory-settings"); if(!p) return; p.classList.toggle("open"); if(p.classList.contains("open")){ var k=document.getElementById("cory-key"); if(k) k.value=getKey(); var m=document.getElementById("cory-model"); if(m) m.value=getModel(); } }
  function saveSettings(){ var k=document.getElementById("cory-key"), m=document.getElementById("cory-model"); try { if(k){ if(k.value.trim()) localStorage.setItem(LS_KEY,k.value.trim()); else localStorage.removeItem(LS_KEY); } if(m) localStorage.setItem(LS_MODEL,m.value); } catch(e){} document.getElementById("cory-settings").classList.remove("open"); bubble("cory", getKey()?"Live mode is on. I will answer with Claude, grounded in the knowledge base.":"Live mode is off. I will answer from the knowledge base. Add a key in settings for live answers."); }

  function showIntro(){
    bubble("cory","Hi, I am Cory, the company knowledge base assistant. I cover "+activeLabels()+". Ask me anything, or use me to draft new material from what we already have. Tips: press / to search the hub and Esc to close me. "+(getKey()?"Live mode is on.":"Add an Anthropic API key with the key icon for live answers; otherwise I answer from the knowledge base."));
    var c = document.createElement("div"); c.className="msg cory";
    c.innerHTML = "<div class=\"bchips\">"+
      "<span class=\"bchip\" data-ask=\"What does the program cost and what is included?\">Pricing</span>"+
      "<span class=\"bchip\" data-ask=\"How do I handle the price objection?\">Price objection</span>"+
      "<span class=\"bchip\" data-ask=\"What are the brand colors and fonts?\">Brand basics</span>"+
      "<span class=\"bchip\" data-ask=\"What does the 12 week curriculum cover?\">12-week plan</span>"+
      "<span class=\"bchip\" data-ask=\"Draft a short LinkedIn post inviting people to the Open House.\">Draft a post</span></div>";
    body.appendChild(c);
  }
  function clearChat(){ if(coryCtrl){ try{ coryCtrl.abort(); }catch(e){} coryCtrl=null; } history=[]; setBusy(false); if(body){ body.innerHTML=""; showIntro(); } }
  function showHelp(){ openCory(); bubble("cory","Here is how this knowledge base works. Use the tabs at the top (All, Sales, Marketing, Design) or the cards on the home screen to pick a domain; that focuses both the search and me. Type in the search bar to filter answers across the current scope, and open any answer to see its source document. Ask me a question and I answer from the knowledge base; with an API key in settings I answer live with Claude and can draft posts, emails, and outlines. Shortcuts: slash focuses search, Esc closes me, and the refresh icon starts a new chat."); }
  function initCory(){
    body = document.getElementById("cory-body"); if(!body) return;
    showIntro();
    document.getElementById("cory-launch").addEventListener("click", openCory);
    document.getElementById("cory-close").addEventListener("click", closeCory);
    var sb=document.getElementById("cory-settings-btn"); if(sb) sb.addEventListener("click", toggleSettings);
    var cl=document.getElementById("cory-clear"); if(cl) cl.addEventListener("click", clearChat);
    var hp=document.getElementById("helpBtn"); if(hp) hp.addEventListener("click", function(e){ e.preventDefault(); showHelp(); });
    var sv=document.getElementById("cory-save"); if(sv) sv.addEventListener("click", saveSettings);
    function send(){ var i=document.getElementById("cory-q"); var v=i.value.trim(); if(!v) return; i.value=""; ask(v); }
    document.getElementById("cory-send").addEventListener("click", send);
    document.getElementById("cory-q").addEventListener("keydown", function(e){ if(e.key==="Enter") send(); });
    document.addEventListener("click", function(e){
      var src=e.target.closest(".cory-src");
      if(src){ e.preventDefault(); coryOpen(src.getAttribute("data-scope"), src.getAttribute("data-q")); return; }
      var chip=e.target.closest(".bchip"); if(!chip) return; openCory(); ask(chip.getAttribute("data-ask"));
    });
    document.addEventListener("keydown", function(e){ if(e.key==="Enter"){ var s=e.target&&e.target.closest&&e.target.closest(".cory-src"); if(s){ e.preventDefault(); coryOpen(s.getAttribute("data-scope"), s.getAttribute("data-q")); } } });
    document.addEventListener("keydown", function(e){ if(e.key==="Escape"){ if(coryBusy && coryCtrl){ try{ coryCtrl.abort(); }catch(err){} setBusy(false); } var p=document.getElementById("cory-panel"); if(p && p.classList.contains("open")) closeCory(); } });
    var sel=document.getElementById("cory-model"); if(sel){ sel.innerHTML = MODELS.map(function(m){ return "<option value=\""+m.id+"\">"+esc(m.label)+"</option>"; }).join(""); sel.value=getModel(); }
  }

  /* ---------- boot ---------- */
  document.addEventListener("DOMContentLoaded", function(){
    build();
    renderTabs(); renderTiles(); renderKB();
    var q=document.getElementById("q"); if(q) q.addEventListener("input", debounce(function(){ onSearch(q.value); }, 180));
    var hb=document.getElementById("homeBtn"); if(hb) hb.addEventListener("click", function(e){ e.preventDefault(); goHome(); });
    var bk=document.getElementById("backHome"); if(bk) bk.addEventListener("click", function(e){ e.preventDefault(); goHome(); });
    window.addEventListener("hashchange", applyRoute);
    document.addEventListener("keydown", function(e){ if(e.key==="/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(((document.activeElement||{}).tagName)||"")){ e.preventDefault(); var s=document.getElementById("q"); if(s) s.focus(); } });
    applyRoute();
    initCory();
    window.addEventListener("load", function(){
      var b=document.getElementById("browse");
      if(b && !b.hidden){ renderChart(scope, "browse-chart"); } else { renderChart("home", "home-chart"); }
    });
  });
})();
