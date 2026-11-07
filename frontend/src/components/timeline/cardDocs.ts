/**
 * The self-contained HTML documents the lesson surfaces render in sandboxed iframes: plain lesson notes, an in-system blog
 * article, and the immersive Self Study reader. Moved out of CardDetailBody.tsx (C117) to bring that file under the 500-line
 * ceiling; CardDetailBody re-exports these, so existing imports are unchanged.
 */

/** Strip <script>/<style>/inline-handlers/javascript: from AI HTML. Defense-in-depth:
 *  reader content also renders in an opaque-origin iframe that cannot reach the parent. */
function stripUnsafe(html: string): string {
  return String(html || '')
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*style[\s\S]*?<\s*\/\s*style\s*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
}

/** Wrap AI body_html in a minimal styled doc for a SANDBOXED iframe (no scripts run → inert/safe). */
export function lessonDoc(bodyHtml: string): string {
  return `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><style>
    body{font-family:Roboto,system-ui,sans-serif;margin:0 auto;max-width:760px;padding:20px 22px;color:#1A1A1A;font-size:14.5px;line-height:1.62}
    h1,h2,h3{line-height:1.3;margin:14px 0 6px} h1{font-size:18px} h2{font-size:16px} h3{font-size:14.5px}
    p{margin:0 0 10px} ul,ol{padding-left:20px;margin:0 0 10px} li{margin-bottom:4px} a{color:#367895} img{max-width:100%}
    pre,code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;background:#F5F5F5;border-radius:6px}
    pre{padding:10px;overflow:auto} code{padding:1px 4px}
  </style>${bodyHtml}`;
}

/** Wrap an in-system blog article (fetched + sanitized server-side by blogReaderService)
 *  in a styled, self-contained reading doc for a SANDBOXED iframe — so a
 *  training.colaberry.com post reads INSIDE the Workspace (that site sends
 *  X-Frame-Options: DENY, so its live page can't be framed directly). allow-scripts is
 *  used only so nested embeds (YouTube/Buzzsprout) play; the doc's origin stays opaque. */
export function blogReaderDoc(
  bodyHtml: string,
  title?: string,
  opts?: { featuredImage?: string | null; author?: string | null; sourceUrl?: string | null },
): string {
  const q = (s: string) => String(s).replace(/"/g, '&quot;');
  const safeTitle = String(title || 'Blog').replace(/[<>]/g, '');
  const author = String(opts?.author || '').replace(/[<>]/g, '');
  const img = String(opts?.featuredImage || '');
  const src = String(opts?.sourceUrl || '');
  const hero = /^https?:\/\//i.test(img) ? `<img class="hero" src="${q(img)}" alt="">` : '';
  const srcLink = /^https?:\/\//i.test(src)
    ? `<p class="src"><a href="${q(src)}" target="_blank" rel="noopener noreferrer">Read the original on the training site ↗</a></p>`
    : '';
  return `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><style>
    body{font-family:Roboto,system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;background:#F7F4EE;color:#1a1a1a;font-size:15.5px;line-height:1.7}
    .wrap{max-width:720px;margin:0 auto;padding:24px 22px 64px}
    .eyebrow{font:700 11px/1 Roboto,sans-serif;letter-spacing:.13em;text-transform:uppercase;color:#c20e1e;margin:0 0 10px}
    h1.tt{font-size:1.7rem;line-height:1.22;margin:0 0 6px;font-weight:800}
    .byline{color:#6a6a6a;font-size:13px;margin:0 0 16px}
    img.hero{width:100%;border-radius:14px;margin:6px 0 18px;display:block}
    h2,h3,h4{line-height:1.3;margin:22px 0 8px}h2{font-size:1.32rem}h3{font-size:1.14rem}h4{font-size:1rem}
    p{margin:0 0 13px}ul,ol{padding-left:22px;margin:0 0 13px}li{margin-bottom:6px}
    a{color:#367895}img{max-width:100%;height:auto;border-radius:10px}strong{color:#111}
    iframe{max-width:100%;width:100%;aspect-ratio:16/9;border:0;border-radius:12px;margin:10px 0}
    table{border-collapse:collapse;width:100%;margin:14px 0}th,td{border:1px solid #DDD6C9;padding:9px 12px;text-align:left;vertical-align:top}
    .src{margin-top:26px;padding-top:16px;border-top:1px solid #DDD6C9;font-size:13.5px}
    @media(prefers-color-scheme:dark){body{background:#231f1b;color:#ece7e0}.eyebrow,.src a{color:#ff6b83}strong{color:#fff}a{color:#7fc4e0}th,td{border-color:#3a342e}}
  </style><div class="wrap">
    <p class="eyebrow">Blog · Read in your workspace</p>
    <h1 class="tt">${safeTitle}</h1>
    ${author ? `<p class="byline">By ${author}</p>` : ''}
    ${hero}
    ${bodyHtml}
    ${srcLink}
  </div>`;
}

/** Immersive Self Study reader: a warm full-height reading with a hero, a STICKY top
 *  tab-nav (built from <section id data-nav>), scrollspy active-highlight, a progress
 *  line, and smooth click-to-scroll. Renders hand-authored rich content (diagrams,
 *  icon term-cards, prereq tiles, callouts, tables). In a sandbox="allow-scripts" iframe
 *  whose origin is opaque (no allow-same-origin): its scripts cannot touch the parent
 *  page/cookies/storage, and the HTML is script/style-stripped as defense-in-depth. */
/** Sandbox for the Self Study reader iframe, shared by the drawer and the workstation
 *  so the two surfaces can never drift. `allow-scripts` runs the reader engine (nav +
 *  read-gate). The popup pair is what makes an authored <a href> actually work: without
 *  `allow-popups` the click is silently swallowed (same failure the intel band hit), and
 *  without `allow-popups-to-escape-sandbox` the opened tab INHERITS this sandbox — an
 *  opaque origin with no cookies — which breaks the login-gated course links (Anthropic
 *  Skilljar) the readings point at. Deliberately no `allow-same-origin`: the reader still
 *  cannot touch the parent page, cookies, or storage. */
export const READER_SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox';

export interface ReaderOpts { cardId?: string; doneIds?: string[]; heroIllus?: string; }
export function readerDoc(bodyHtml: string, title?: string, opts?: ReaderOpts): string {
  const body = stripUnsafe(bodyHtml);
  const heroTitle = String(title || 'Self Study').replace(/[<>]/g, '');
  const cardId = String(opts?.cardId || '');
  const doneIds = Array.isArray(opts?.doneIds) ? opts!.doneIds!.filter((x) => typeof x === 'string') : [];
  const heroIllus = String(opts?.heroIllus || '').replace(/[^a-z-]/g, '');
  const heroFig = heroIllus ? `<div class="herofig" data-illus="${heroIllus}"></div>` : '';
  // Reader engine (runs inside the iframe): builds the tab-nav + scrollspy + progress,
  // injects term-card icons from data-icon, and renders diagrams from a data-diagram
  // TYPE + data-items labels — so authored/generated content only supplies a type +
  // labels, never fragile SVG geometry. Template literal so the SVG quotes need no escaping.
  const js = `(function(){var ICONS={brain:'<path d="M4 17l6-6 4 4 6-6"/>',chip:'<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',scissors:'<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8.5 7.5l11.5 9M8.5 16.5L20 7"/>',window:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',book:'<path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 0-2 2z"/><path d="M5 18h13"/>',chat:'<path d="M4 5h16v11H8l-4 4z"/>',gauge:'<path d="M4 15a8 8 0 0 1 16 0"/><path d="M12 15l4-4"/>',flag:'<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',check:'<path d="M4 12l5 5L20 6"/>',bulb:'<path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 4 10c-1 1-1 2-1 3H9c0-1 0-2-1-3a6 6 0 0 1 4-10z"/>'};function esc(s){return String(s).replace(/[<>&]/g,function(m){return m==='<'?'&lt;':m==='>'?'&gt;':'&amp;';});}[].forEach.call(document.querySelectorAll('[data-icon]'),function(el){var ic=ICONS[el.getAttribute('data-icon')]||ICONS.bulb;var h=el.querySelector('h3,h4');if(!h)return;var t=document.createElement('span');t.className='tile';t.innerHTML='<svg viewBox="0 0 24 24">'+ic+'</svg>';h.insertBefore(t,h.firstChild);});var ILLUS={'ai-network':'<svg viewBox="0 0 480 210" role="img" aria-label="Neural network"><g stroke="#2E6A86" stroke-width="1.5" opacity=".35"><path d="M96 60L232 46M96 60L232 104M96 105L232 104M96 105L232 162M96 150L232 162M96 150L232 104M232 46L388 84M232 104L388 84M232 104L388 132M232 162L388 132M232 46L388 132M232 162L388 84"/></g><circle cx="96" cy="60" r="13" fill="#2E6A86"/><circle cx="96" cy="105" r="13" fill="#2E6A86"/><circle cx="96" cy="150" r="13" fill="#2E6A86"/><circle cx="232" cy="46" r="15" fill="#5BA63C"/><circle cx="232" cy="104" r="18" fill="#FB2832"/><circle cx="232" cy="162" r="15" fill="#5BA63C"/><circle cx="388" cy="84" r="14" fill="#E8920C"/><circle cx="388" cy="132" r="14" fill="#E8920C"/></svg>','terminal':'<svg viewBox="0 0 480 210" role="img" aria-label="Code terminal"><rect x="72" y="28" width="336" height="154" rx="13" fill="#1c2229"/><line x1="72" y1="60" x2="408" y2="60" stroke="#333d47" stroke-width="2"/><circle cx="92" cy="44" r="5" fill="#FB2832"/><circle cx="110" cy="44" r="5" fill="#E8920C"/><circle cx="128" cy="44" r="5" fill="#5BA63C"/><rect x="94" y="80" width="58" height="9" rx="4" fill="#5BA63C"/><rect x="160" y="80" width="118" height="9" rx="4" fill="#c9d3dc"/><rect x="94" y="102" width="38" height="9" rx="4" fill="#E8920C"/><rect x="140" y="102" width="150" height="9" rx="4" fill="#7d8b98"/><rect x="112" y="124" width="92" height="9" rx="4" fill="#3aa0d8"/><rect x="212" y="124" width="66" height="9" rx="4" fill="#c9d3dc"/><rect x="94" y="146" width="54" height="9" rx="4" fill="#5BA63C"/><rect x="156" y="145" width="11" height="11" rx="2" fill="#fff"/></svg>','pipeline':'<svg viewBox="0 0 480 210" role="img" aria-label="Process pipeline"><g fill="#fff" stroke="#2E6A86" stroke-width="2.5"><rect x="26" y="92" width="82" height="56" rx="11"/><rect x="138" y="92" width="82" height="56" rx="11"/><rect x="250" y="92" width="82" height="56" rx="11"/><rect x="362" y="92" width="82" height="56" rx="11"/></g><g stroke="#8a8178" stroke-width="2.5"><path d="M112 120h18" stroke-linecap="round"/><path d="M128 114l8 6-8 6" fill="none"/><path d="M224 120h18" stroke-linecap="round"/><path d="M240 114l8 6-8 6" fill="none"/><path d="M336 120h18" stroke-linecap="round"/><path d="M352 114l8 6-8 6" fill="none"/></g><circle cx="67" cy="120" r="8" fill="#FB2832"/><circle cx="179" cy="120" r="8" fill="#5BA63C"/><circle cx="291" cy="120" r="8" fill="#E8920C"/><circle cx="403" cy="120" r="8" fill="#2E6A86"/></svg>','documents':'<svg viewBox="0 0 480 210" role="img" aria-label="Documents"><rect x="182" y="36" width="120" height="150" rx="10" fill="#fff" stroke="#DDD6C9" stroke-width="2" transform="rotate(-7 240 110)"/><rect x="176" y="30" width="126" height="152" rx="10" fill="#fff" stroke="#2E6A86" stroke-width="2.5"/><g stroke="#cdc6ba" stroke-width="6" stroke-linecap="round"><path d="M196 64h86"/><path d="M196 86h86"/><path d="M196 108h58"/><path d="M196 130h86"/><path d="M196 152h48"/></g><circle cx="300" cy="152" r="23" fill="#5BA63C"/><path d="M289 152l8 8 14-15" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>','conversation':'<svg viewBox="0 0 480 210" role="img" aria-label="Conversation"><circle cx="42" cy="78" r="20" fill="#5BA63C"/><circle cx="42" cy="72" r="7" fill="#fff"/><path d="M30 94a12 12 0 0 1 24 0z" fill="#fff"/><rect x="74" y="48" width="176" height="60" rx="16" fill="#2E6A86"/><g stroke="#fff" stroke-width="5" stroke-linecap="round"><path d="M96 70h122"/><path d="M96 88h84"/></g><rect x="228" y="118" width="176" height="60" rx="16" fill="#fff" stroke="#FB2832" stroke-width="2.5"/><g stroke="#cdc6ba" stroke-width="5" stroke-linecap="round"><path d="M250 140h130"/><path d="M250 158h92"/></g><rect x="418" y="128" width="42" height="42" rx="11" fill="#FB2832"/><rect x="429" y="139" width="20" height="20" rx="4" fill="#fff"/></svg>','growth':'<svg viewBox="0 0 480 210" role="img" aria-label="Growth"><path d="M84 28v152h316" fill="none" stroke="#cdc6ba" stroke-width="2.5" stroke-linecap="round"/><g fill="#2E6A86" opacity=".22"><rect x="120" y="128" width="34" height="52" rx="4"/><rect x="190" y="102" width="34" height="78" rx="4"/><rect x="260" y="76" width="34" height="104" rx="4"/><rect x="330" y="48" width="34" height="132" rx="4"/></g><path d="M104 150l68-24 70-30 72-36" fill="none" stroke="#FB2832" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M300 66l16-8 2 17" fill="none" stroke="#FB2832" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="104" cy="150" r="5" fill="#FB2832"/><circle cx="172" cy="126" r="5" fill="#FB2832"/><circle cx="242" cy="96" r="5" fill="#FB2832"/></svg>','automation':'<svg viewBox="0 0 480 210" role="img" aria-label="Automation gears"><circle cx="205" cy="104" r="40" fill="none" stroke="#2E6A86" stroke-width="15" stroke-dasharray="11 13"/><circle cx="205" cy="104" r="24" fill="none" stroke="#2E6A86" stroke-width="6"/><circle cx="292" cy="146" r="27" fill="none" stroke="#E8920C" stroke-width="12" stroke-dasharray="9 11"/><circle cx="292" cy="146" r="14" fill="none" stroke="#E8920C" stroke-width="5"/></svg>','idea':'<svg viewBox="0 0 480 210" role="img" aria-label="Idea"><g stroke="#E8920C" stroke-width="5" stroke-linecap="round"><path d="M240 30v-14"/><path d="M303 51l10-10"/><path d="M177 51l-10-10"/><path d="M325 104h15"/><path d="M140 104h15"/></g><circle cx="240" cy="106" r="46" fill="#ffe6ad" stroke="#E8920C" stroke-width="3"/><path d="M226 104a14 14 0 0 1 28 0" fill="none" stroke="#E8920C" stroke-width="3"/><path d="M240 120v-8" stroke="#E8920C" stroke-width="3"/><rect x="222" y="150" width="36" height="12" rx="3" fill="#8a8178"/><rect x="227" y="164" width="26" height="10" rx="3" fill="#8a8178"/></svg>'};[].forEach.call(document.querySelectorAll('[data-illus]'),function(el){var g=ILLUS[el.getAttribute('data-illus')];if(g)el.insertAdjacentHTML('afterbegin',g);});var CB=['#FB2832','#5BA63C','#2E6A86','#E8920C'];function dN(it){var n=it.length,cx=220,cy=140,mx=125,mn=48,s='<svg viewBox="0 0 440 300" role="img" aria-label="'+esc(it.join(' inside '))+'">';for(var i=0;i<n;i++){var r=n>1?mx-i*(mx-mn)/(n-1):mx,cyy=cy+i*20;s+='<circle cx="'+cx+'" cy="'+cyy+'" r="'+r+'" fill="none" stroke="'+CB[i%4]+'" stroke-width="2.5"/><text x="'+cx+'" y="'+(cyy-r+22)+'" text-anchor="middle" class="dg-txt" font-size="'+(13-i)+'" font-weight="700">'+esc(it[i])+'</text>';}return s+'</svg>';}function dL(it){var n=it.length,s='<svg viewBox="0 0 440 '+(n*66+6)+'" role="img" aria-label="'+esc(it.join(', '))+'">';for(var i=0;i<n;i++){var y=6+i*66;s+='<rect x="18" y="'+y+'" width="404" height="54" rx="12" fill="#fff" stroke="'+CB[i%4]+'" stroke-width="2.5"/><text x="36" y="'+(y+32)+'" class="dg-txt" font-size="13" font-weight="700">'+esc(it[i])+'</text>';}return s+'</svg>';}function dF(it){var n=it.length,g=26,w=Math.floor((440-20-(n-1)*g)/n),s='<svg viewBox="0 0 440 92" role="img" aria-label="'+esc(it.join(' then '))+'">',x=10;for(var i=0;i<n;i++){s+='<rect x="'+x+'" y="24" width="'+w+'" height="44" rx="10" fill="#fff" stroke="#2E6A86" stroke-width="2"/><text x="'+(x+w/2)+'" y="50" text-anchor="middle" class="dg-txt" font-size="11">'+esc(it[i])+'</text>';if(i<n-1){var ax=x+w;s+='<path d="M'+ax+' 46h'+(g-6)+'" stroke="#8a8178" stroke-width="2"/><path d="M'+(ax+g-10)+' 41l7 5-7 5" fill="#8a8178"/>';}x+=w+g;}return s+'</svg>';}function dC(it){var n=it.length,cx=220,cy=150,R2=96,s='<svg viewBox="0 0 440 300" role="img" aria-label="'+esc(it.join(' then '))+', repeating">';s+='<circle cx="'+cx+'" cy="'+cy+'" r="'+R2+'" fill="none" stroke="#DDD6C9" stroke-width="2" stroke-dasharray="4 7"/>';for(var j=0;j<n;j++){var b1=(-90+j*360/n),b2=(-90+(j+1)*360/n),am=((b1+b2)/2)*Math.PI/180,mx=cx+R2*Math.cos(am),my=cy+R2*Math.sin(am),td=am+Math.PI/2,dx=Math.cos(td),dy=Math.sin(td);s+='<path d="M'+(mx-dx*8-dy*5)+' '+(my-dy*8+dx*5)+'L'+(mx+dx*8)+' '+(my+dy*8)+'L'+(mx-dx*8+dy*5)+' '+(my-dy*8-dx*5)+'Z" fill="#8a8178"/>';}for(var i=0;i<n;i++){var a=(-90+i*360/n)*Math.PI/180,x=cx+R2*Math.cos(a),y=cy+R2*Math.sin(a);s+='<circle cx="'+x+'" cy="'+y+'" r="31" fill="'+CB[i%4]+'"/><text x="'+x+'" y="'+(y+4)+'" text-anchor="middle" fill="#fff" font-size="11" font-weight="700">'+esc(it[i])+'</text>';}return s+'</svg>';}function dS(it){var n=it.length,s='<svg viewBox="0 0 440 '+(n*70+10)+'" role="img" aria-label="'+esc(it.join(', then '))+'">';for(var i=0;i<n;i++){var y=10+i*70;if(i<n-1)s+='<path d="M42 '+(y+54)+'v16" stroke="#DDD6C9" stroke-width="3"/>';s+='<circle cx="42" cy="'+(y+27)+'" r="21" fill="'+CB[i%4]+'"/><text x="42" y="'+(y+33)+'" text-anchor="middle" fill="#fff" font-size="16" font-weight="800">'+(i+1)+'</text><rect x="80" y="'+y+'" width="344" height="54" rx="12" fill="#fff" stroke="#DDD6C9" stroke-width="2"/><text x="100" y="'+(y+32)+'" fill="#1a1a1a" font-size="13" font-weight="700" class="dg-txt">'+esc(it[i])+'</text>';}return s+'</svg>';}var R={nested:dN,layers:dL,flow:dF,cycle:dC,steps:dS};[].forEach.call(document.querySelectorAll('figure[data-diagram]'),function(f){var it=(f.getAttribute('data-items')||'').split('|').filter(Boolean),fn=R[f.getAttribute('data-diagram')];if(fn&&it.length){var cap=f.querySelector('figcaption');f.insertAdjacentHTML('afterbegin',fn(it));if(cap)f.appendChild(cap);}});var secs=[].slice.call(document.querySelectorAll('section[id]')),nav=document.getElementById('nav');if(!nav)return;if(!secs.length){nav.style.display='none';}var map={};secs.forEach(function(s){var label=s.getAttribute('data-nav');if(!label){var h=s.querySelector('h2,h3');label=h?h.textContent:s.id;}var a=document.createElement('a');a.textContent=label;a.href='#'+s.id;a.addEventListener('click',function(e){e.preventDefault();var el=document.getElementById(s.id);if(!el)return;var navH=nav.getBoundingClientRect().height;var y=(window.pageYOffset||document.documentElement.scrollTop)+el.getBoundingClientRect().top-navH-15;window.scrollTo({top:y,behavior:'smooth'});});nav.appendChild(a);map[s.id]=a;});var bar=document.querySelector('#pbar>i'),t=false;function sc(){var d=document.documentElement,m=d.scrollHeight-d.clientHeight;if(bar)bar.style.width=(m>0?((window.pageYOffset||d.scrollTop)/m*100):0)+'%';t=false;}window.addEventListener('scroll',function(){if(!t){requestAnimationFrame(sc);t=true;}},{passive:true});sc();if('IntersectionObserver' in window){var spy=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){Object.keys(map).forEach(function(k){map[k].classList.remove('active');});var a=map[e.target.id];if(a){a.classList.add('active');}}});},{rootMargin:'-12% 0px -72% 0px',threshold:0});secs.forEach(function(s){spy.observe(s);});}var CARDID=${JSON.stringify(cardId)},NEED=secs.length,DONE={},secT={};function activeSec(){var d=document.documentElement,st=window.pageYOffset||d.scrollTop;if(!secs.length)return null;if(st+d.clientHeight>=d.scrollHeight-4)return secs[secs.length-1];var line=st+d.clientHeight*0.32,cur=secs[0];for(var i=0;i<secs.length;i++){var top=secs[i].getBoundingClientRect().top+st;if(top<=line)cur=secs[i];}return cur;}function ssPost(){var k=Object.keys(DONE);try{window.parent.postMessage({source:'ss-reader',cardId:CARDID,done:k.length,total:NEED,ids:k,complete:NEED>0?k.length>=NEED:true},'*');}catch(e){}}function ssDone(id){if(DONE[id])return;DONE[id]=1;var a=map[id];if(a)a.classList.add('read');var sec=document.getElementById(id);if(sec)sec.classList.add('read');ssPost();}${JSON.stringify(doneIds)}.forEach(function(id){if(map[id])ssDone(id);});ssPost();if(NEED>0){setInterval(function(){var a=activeSec();if(a&&!DONE[a.id]){secT[a.id]=(secT[a.id]||0)+1;if(secT[a.id]>=5)ssDone(a.id);}},1000);}})();`;
  return `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><style>
    html{scroll-behavior:smooth}
    body{font-family:Roboto,system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;background:#F7F4EE;color:#1a1a1a;font-size:15px;line-height:1.64}
    #pbar{position:sticky;top:0;height:3px;z-index:6}#pbar>i{display:block;height:100%;width:0;background:#FB2832;transition:width .08s linear}
    #nav{position:sticky;top:3px;z-index:5;display:flex;flex-wrap:wrap;gap:7px;padding:9px 20px;background:rgba(247,244,238,.95);backdrop-filter:blur(8px);border-bottom:1px solid #DDD6C9}
    #nav a{flex:none;font:600 12.5px/1 Roboto,sans-serif;color:#4a4a4a;background:#FDFCFA;border:1px solid #DDD6C9;border-radius:999px;padding:8px 14px;text-decoration:none;white-space:nowrap;cursor:pointer;transition:.15s}
    #nav a:hover{border-color:#2E6A86;color:#1a1a1a}#nav a.active{background:#c20e1e;border-color:#c20e1e;color:#fff}
    .wrap{max-width:700px;margin:0 auto;padding:0 22px}
    .hero{padding:22px 0 4px}.hero .eyebrow{font:700 11px/1 Roboto;letter-spacing:.13em;text-transform:uppercase;color:#c20e1e;margin:0 0 10px}
    .hero h1{font-size:1.5rem;line-height:1.24;margin:0 0 12px;font-weight:700}
    .note{background:#FDFCFA;border:1px dashed #DDD6C9;border-radius:12px;padding:14px 16px}.note p{margin:0;color:#4a4a4a}
    .ss{padding:4px 0 64px}
    .ss section{scroll-margin-top:62px;padding-top:22px;margin-top:22px;border-top:1px solid #DDD6C9}.ss section:first-child{border-top:0;margin-top:8px;padding-top:6px}
    .ss h2{font-size:1.3rem;margin:0 0 8px;font-weight:700}.ss .lead{font-weight:600;font-size:1.05rem;margin:0 0 12px;color:#c20e1e}
    .ss p{margin:0 0 12px}.ss ul{padding-left:0;margin:0 0 12px;list-style:none}.ss ol{padding-left:22px;margin:0 0 12px}
    .cardgrid{display:flex;flex-wrap:wrap;gap:12px;margin:14px 0}
    .term{flex:1 1 240px;background:#FDFCFA;border:1px solid #DDD6C9;border-left:4px solid #2E6A86;border-radius:12px;padding:14px 16px}
    .term.leaf{border-left-color:#5BA63C}.term.berry{border-left-color:#2E6A86}
    .term h3,.term h4{display:flex;align-items:center;gap:9px;font-size:1.02rem;color:#1a1a1a;margin:0 0 6px;font-weight:700}
    .tile{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;flex:none;background:#2E6A86}.term.leaf .tile{background:#5BA63C}
    .tile svg{width:17px;height:17px;stroke:#fff;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .why{color:#4a4a4a;font-size:14px}.why b{color:#1a1a1a}
    .warn{background:#fff6f6;border:1px solid #f6d5d8;border-left:4px solid #FB2832;border-radius:12px;padding:14px 16px;margin:16px 0}.warn b{color:#c20e1e}
    .figure{background:#FDFCFA;border:1px solid #DDD6C9;border-radius:14px;padding:18px;margin:16px 0;text-align:center}
    .figure svg{max-width:min(100%,440px);height:auto;display:block;margin:0 auto}
    .figure figcaption{font-size:13px;color:#4a4a4a;margin-top:12px;line-height:1.5}
    .prereq{display:flex;gap:11px;align-items:flex-start;background:#FDFCFA;border:1px solid #DDD6C9;border-radius:12px;padding:12px 14px;margin:8px 0}
    .prereq b{display:block;margin-bottom:2px}
    .ss ol li{margin-bottom:9px}.ss ol li::marker{font-weight:700;color:#c20e1e}
    .ss a{color:#2E6A86;text-decoration:underline;text-underline-offset:2px}.ss a:hover{color:#c20e1e}
    .cmd{background:#1c2229;color:#e6edf3;border-radius:10px;padding:12px 14px;margin:10px 0;overflow-x:auto;white-space:pre;font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
    .cmd .c{color:#8a99a8}.cmd .g{color:#5BA63C}
    .ss code{background:#EFEBE4;border-radius:5px;padding:1px 6px;font:13px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
    .ss .cmd code{background:none;padding:0;font-size:inherit}
    table{border-collapse:collapse;width:100%;margin:14px 0;font-size:14.5px}
    th,td{border:1px solid #DDD6C9;padding:9px 12px;text-align:left;vertical-align:top}th{background:#EFEBE4;font-weight:700}td:first-child{font-weight:600}
    .dg-txt{fill:#1a1a1a;font-family:Roboto,sans-serif}
    .illus{background:#FDFCFA;border:1px solid #DDD6C9;border-radius:16px;padding:16px;margin:18px 0;text-align:center}
    .illus svg{width:100%;max-width:460px;height:auto;display:block;margin:0 auto}
    .illus figcaption{font-size:13px;color:#4a4a4a;margin-top:10px;line-height:1.5}
    .herofig{margin:14px 0 6px;border-radius:16px;background:linear-gradient(135deg,#e7eef2,#f7f4ee);padding:18px;border:1px solid #DDD6C9}
    .herofig svg{width:100%;max-width:520px;height:auto;display:block;margin:0 auto}
    .stats{display:flex;flex-wrap:wrap;gap:12px;margin:16px 0}
    .stat{flex:1 1 130px;background:#FDFCFA;border:1px solid #DDD6C9;border-top:3px solid #FB2832;border-radius:12px;padding:14px 12px;text-align:center}
    .stat b{display:block;font-size:1.7rem;font-weight:800;color:#c20e1e;line-height:1.1}
    .stat span{display:block;font-size:12.5px;color:#4a4a4a;margin-top:4px}
    #nav a.read{border-color:#5BA63C;color:#3f7d27}
    #nav a.read::after{content:"";display:inline-block;width:13px;height:13px;margin-left:6px;vertical-align:-2px;border-radius:50%;background:#5BA63C url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M5 12l4 4L18 7' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/11px no-repeat}
    #nav a.active.read{background:#3f8f2e;border-color:#3f8f2e;color:#fff}
    #nav a.active.read::after{background-color:#fff;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M5 12l4 4L18 7' fill='none' stroke='%233f8f2e' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")}
    .ss section.read>h2::before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:#5BA63C;margin-right:9px;vertical-align:middle}
    @media(prefers-color-scheme:dark){.illus,.stat{background:#2c2723;border-color:#3a342e}.illus figcaption,.stat span{color:#a89f94}.herofig{background:linear-gradient(135deg,#2f3a40,#231f1b);border-color:#3a342e}#nav a.read{color:#8fce6f}}
    @media(prefers-color-scheme:dark){body{background:#231f1b;color:#ece7e0}#nav{background:rgba(35,31,27,.95);border-color:#3a342e}#nav a{background:#2c2723;border-color:#3a342e;color:#c9beb2}#nav a.active{color:#231f1b;background:#ff6b83;border-color:#ff6b83}.hero .eyebrow{color:#ff6b83}.note,.term,.figure,.prereq{background:#2c2723;border-color:#3a342e}.ss section{border-color:#3a342e}.ss .lead,.term h3,.term h4,.warn b{color:#ff6b83}.term h3,.term h4{color:#ece7e0}.why{color:#a89f94}.warn{background:#2c2723;border-color:#3a342e}th{background:#2c2723}th,td{border-color:#3a342e}.dg-txt{fill:#ece7e0}.ss a{color:#7fc4e0}.ss a:hover{color:#ff6b83}.ss code{background:#3a342e}.ss ol li::marker{color:#ff6b83}}
    @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}#pbar>i{transition:none}}
  </style>
  <div id="pbar"><i></i></div><nav id="nav"></nav>
  <div class="wrap">
    <div class="hero">${heroFig}<p class="eyebrow">Read before class</p><h1>${heroTitle}</h1><div class="note"><p>How to use this: read at your own pace, skip anything you already know, nothing here is tested.</p></div></div>
    <main class="ss">${body}</main>
  </div>
  <script>${js}</script>`;
}
