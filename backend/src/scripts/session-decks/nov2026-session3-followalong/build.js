/**
 * build.js — assemble Nov 2026 Session 3 (Weekly Live Episode 1) as a custom
 * deck in the Open House style, with a follow-along card for every attendee
 * screen and a presenter side window for Ali.
 *
 *   node build.js <imageDir> <outDir>
 *
 * Outputs (deterministic for the same inputs):
 *   <outDir>/deck.html   ONE self-contained file: every image is a data: URI,
 *                        because ▶ Present writes the deck into an about:blank tab
 *   <outDir>/guide.html  teaching guide: run of show, what to say and read, every
 *                        prompt and poll, and the clip sheet for Piyush
 *
 * Visual model: ../openhouse-nov2026-deck/template.html. Its <style> block is
 * reused as-is, so this deck and the Open House can never drift apart in look.
 *
 * The live loop is the platform's own (window.__KITLIVE__, injected by
 * customDeck.ts): every slide broadcasts its position, its poll or prompt, and
 * its follow-along card (backend liveFollowAlong.ts). On a backend without the
 * follow-along field the card is simply ignored; polls and prompts still work.
 *
 * The presenter window: press P, or the first arrow key opens it. It is a narrow
 * popup (one fifth of the screen) that Ali drags to his second monitor, so the
 * audience never sees it. It re-renders on every slide: do, say, read, the clip
 * line for Piyush, the prompt being run, the poll reveal, the next slide, and two
 * clocks. Arrow keys work in it too.
 *
 * Lint (fails the build): banned words, total minutes = 60, every slide has a
 * title, a follow card and something to say, every prompt and poll is well formed.
 */
const fs = require('fs');
const path = require('path');

const slides = require('./slides');

const [imageDir, outDir] = process.argv.slice(2);
if (!imageDir || !outDir) { console.error('usage: node build.js <imageDir> <outDir>'); process.exit(2); }

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
/** Logos repeat by design (every slide's brand bar). Every OTHER picture may appear once (Ali, 2026-11-23). */
const LOGOS = new Set(['colaberry-mark.png', 'colaberry-mark-white.png', 'colaberry-horizontal.png', 'colaberry-horizontal-white.png']);
const USED = {};
function img(file) {
  const p = path.join(imageDir, file);
  if (!fs.existsSync(p)) throw new Error(`image not found: ${file}`);
  if (!LOGOS.has(file)) USED[file] = (USED[file] || 0) + 1;
  return `data:${MIME[path.extname(file).toLowerCase()]};base64,${fs.readFileSync(p).toString('base64')}`;
}
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ------------------------------------------------------------------ lint -- */
const bad = [];
const banned = new RegExp('\\b(fr' + 'ee|guarant' + 'eed?)\\b', 'i');
const minutes = slides.reduce((n, s) => n + Number(s.min || 0), 0);
if (minutes !== 60) bad.push(`run time is ${minutes} min, expected 60`);
slides.forEach((s, k) => {
  const where = `slide ${k + 1} (${s.title || '?'})`;
  if (!s.title) bad.push(`${where}: no title`);
  if (!s.follow || !s.follow.heading) bad.push(`${where}: no follow card`);
  if (!s.say || !s.say.length) bad.push(`${where}: nothing to say`);
  if (s.prompt && (!s.prompt.label || !s.prompt.text)) bad.push(`${where}: prompt needs label + text`);
  if (s.poll) {
    if (!s.poll.key || !s.poll.q || !Array.isArray(s.poll.options) || s.poll.options.length < 2) bad.push(`${where}: malformed poll`);
    if (s.poll.kind === 'trivia' && typeof s.poll.answer !== 'number') bad.push(`${where}: trivia without answer`);
  }
  const text = JSON.stringify(s);
  if (banned.test(text)) bad.push(`${where}: banned word`);
  if (/[–—]/.test(text)) bad.push(`${where}: en or em dash`);
});
const keys = slides.filter((s) => s.poll).map((s) => s.poll.key);
if (new Set(keys).size !== keys.length) bad.push('duplicate poll key');
if (bad.length) { console.error('LINT FAIL\n  ' + bad.join('\n  ')); process.exit(1); }

/* ---------------------------------------------------------------- styles -- */
const ohTemplate = fs.readFileSync(path.join(__dirname, '..', 'openhouse-nov2026-deck', 'template.html'), 'utf8');
const ohCss = /<style>([\s\S]*?)<\/style>/.exec(ohTemplate)[1].replace(/\{\{IMG:([^}]+)\}\}/g, (_, f) => img(f));
const EXTRA_CSS = `
  .avatar{border-radius:26px;overflow:hidden;box-shadow:var(--shadow);border:6px solid #fff;aspect-ratio:1/1;max-height:66vh}
  .avatar img{width:100%;height:100%;object-fit:cover;display:block}
  .ways{display:grid;grid-template-columns:1fr 1fr;gap:2.4vw;flex:1;min-height:0;margin-top:1vh}
  .way{border:2px solid var(--line);border-radius:22px;background:#fff;box-shadow:var(--shadow);padding:2.4vh 1.8vw;display:flex;flex-direction:column;align-items:center;text-align:center;gap:1.2vh}
  .way h3{font-size:clamp(18px,1.9vw,28px)} .way .big{font-size:clamp(34px,3.4vw,52px)}
  .way ol{text-align:left;font-size:clamp(13px,1.2vw,17px);color:var(--ink-2);line-height:1.5;padding-left:1.4em}
  .way .url{font-size:clamp(13px,1.25vw,18px)}
  .counter-row{display:flex;align-items:baseline;gap:14px;justify-content:center;margin-top:1vh}
  .counter-row .count{font-size:clamp(44px,5vw,80px)}
  .counter-row span{color:var(--muted);font-weight:800;letter-spacing:2px;font-size:12px;text-transform:uppercase}
  .stepbadge{display:inline-flex;align-items:center;gap:10px;background:var(--cherry);color:#fff;border-radius:999px;padding:.8vh 1.4vw;font-weight:800;letter-spacing:1.5px;font-size:clamp(12px,1.1vw,15px);text-transform:uppercase;margin-bottom:1.6vh}
  .howto{display:flex;gap:1vw;margin-top:2.4vh}
  .howto div{flex:1;border:1.5px solid var(--line);border-radius:14px;padding:1.4vh 1vw;background:var(--bg-soft);font-size:clamp(12px,1.1vw,16px);color:var(--ink-2);line-height:1.4}
  .howto b{display:block;font-size:clamp(22px,2vw,30px);color:var(--cherry-deep);line-height:1}
  .pcard{border-radius:18px;background:#0f1720;color:#e7eef6;box-shadow:var(--shadow);border:1px solid #26313f;display:flex;flex-direction:column;min-height:0;max-height:64vh;overflow:hidden}
  .pcard .ph{display:flex;align-items:center;gap:10px;padding:1.3vh 1.2vw;background:#16202c;border-bottom:1px solid #26313f;font-weight:800;font-size:clamp(12px,1.05vw,15px)}
  .pcard .ph span{flex:1}
  .pcard pre{margin:0;padding:1.8vh 1.4vw;white-space:pre-wrap;word-break:break-word;font-family:Consolas,"Cascadia Mono",monospace;font-size:clamp(12px,1.12vw,17px);line-height:1.5;overflow:auto}
  .pcard .pf{padding:1.2vh 1.2vw;border-top:1px solid #26313f;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .runbtn{background:var(--cherry);color:#fff;border:none;border-radius:999px;padding:1vh 1.4vw;font-weight:800;cursor:pointer;font-size:clamp(12px,1.05vw,15px);text-decoration:none}
  .runbtn.ghost{background:#27405f}
  .expect{font-size:clamp(11px,1vw,14px);color:#9fb3c8}
  .illus{display:flex;align-items:center;justify-content:center;min-height:0}
  .illus svg{width:100%;height:auto;max-height:30vh}
  .hstack{display:grid;grid-template-rows:auto minmax(0,1fr);gap:2vh;min-height:0;height:72vh}
  .card5{border:2px solid var(--line);border-radius:22px;background:#fff;box-shadow:var(--shadow);overflow:hidden}
  .card5 .row{display:grid;grid-template-columns:minmax(120px,22%) 1fr;border-bottom:1px solid var(--line)}
  .card5 .row:last-child{border-bottom:none}
  .card5 .k{background:var(--bg-soft);padding:1.6vh 1.2vw;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;font-size:clamp(11px,1vw,14px);color:var(--muted);display:flex;align-items:center;gap:8px}
  .card5 .v{padding:1.6vh 1.2vw;font-size:clamp(14px,1.35vw,20px);color:var(--ink-2)}
  .card5 .row.hot .k{background:#fff1f0;color:var(--cherry-deep)} .card5 .row.hot{box-shadow:inset 6px 0 0 var(--cherry)}
  .vs{display:grid;grid-template-columns:1fr 1fr;gap:2.4vw;margin-top:3vh}
  .desc{border-radius:20px;padding:3vh 2vw;border:3px solid;font-size:clamp(18px,1.9vw,28px);font-weight:700;line-height:1.35;position:relative}
  .desc small{display:block;font-size:.55em;letter-spacing:2px;text-transform:uppercase;margin-bottom:1.4vh;font-weight:800}
  .desc.no{border-color:var(--cherry);background:#fff1f0;color:#7a0d14} .desc.no p{text-decoration:line-through;text-decoration-color:var(--cherry);text-decoration-thickness:3px}
  .desc.yes{border-color:var(--leaf);background:var(--leaf-soft);color:#21460f}
  .chain{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;gap:1vw;align-items:stretch;margin-top:4vh}
  .link{border-radius:22px;padding:3.4vh 1.6vw;text-align:center;color:#fff;display:flex;flex-direction:column;gap:1vh;justify-content:center}
  .link .ic{font-size:clamp(40px,4vw,64px)} .link b{font-size:clamp(20px,2.1vw,32px)} .link span{font-size:clamp(13px,1.2vw,17px);opacity:.92}
  .chain .arrow{font-size:clamp(28px,3vw,44px)}
  .three{display:grid;grid-template-columns:repeat(3,1fr);gap:1.6vw;margin-top:3vh}
  .three div{border:1.5px solid var(--line);border-radius:20px;padding:3vh 1.4vw;background:#fff;box-shadow:var(--shadow)}
  .three .n{font-size:clamp(40px,4vw,64px);font-weight:900;color:var(--cherry-deep);line-height:1}
  .three p{font-size:clamp(16px,1.6vw,24px);font-weight:700;margin-top:1.2vh;line-height:1.3}
  .glossary{margin-top:2.4vh;display:grid;gap:1vh}
  .glossary div{font-size:clamp(12px,1.1vw,16px);color:var(--ink-2);background:var(--bg-soft);border:1px solid var(--line);border-radius:12px;padding:1vh 1vw}
  .glossary b{color:var(--cherry-deep)}
  .storybox{border-left:8px solid var(--cherry);background:var(--bg-soft);border-radius:0 18px 18px 0;padding:2.4vh 2vw;margin-top:2.4vh}
  .storybox li{font-size:clamp(15px,1.5vw,22px);margin:1vh 0;list-style:none;display:flex;gap:12px;align-items:baseline}
  .tagline{display:inline-block;margin-top:1.6vh;font-size:12px;font-weight:800;letter-spacing:2px;color:#a59c96;text-transform:uppercase}
  /* Join QR on every slide (Ali, 2026-11-23): small in the corner so latecomers can join without
     interrupting; click to enlarge, J to show or hide. Hidden on the lobby and vote slides, which
     already show a QR. */
  #qrdock{position:fixed;right:14px;bottom:40px;z-index:57;background:#fff;border:1px solid var(--line);border-radius:12px;padding:6px 8px 6px 6px;display:flex;align-items:center;gap:8px;box-shadow:0 8px 24px rgba(26,32,44,.18);cursor:zoom-in;opacity:.92}
  #qrdock .q{width:min(10vh,86px);height:min(10vh,86px)} #qrdock .q svg{width:100%;height:100%;display:block}
  #qrdock span{font-size:11px;font-weight:800;line-height:1.25;color:var(--ink-2);letter-spacing:.3px}
  #qrdock.off,#qrdock.hidehere{display:none}
  #qrbig{position:fixed;inset:0;z-index:300;background:rgba(11,18,32,.86);display:none;align-items:center;justify-content:center;flex-direction:column;gap:2vh;cursor:zoom-out}
  #qrbig.on{display:flex}
  #qrbig .q{width:min(60vh,520px);height:min(60vh,520px);background:#fff;border-radius:24px;padding:18px}
  #qrbig .q svg{width:100%;height:100%}
  #qrbig b{color:#fff;font-size:clamp(20px,2.4vw,34px)} #qrbig span{color:#cbd5e1;font-size:clamp(13px,1.3vw,18px)}
  [data-copylink]{margin:.6vh 0 .4vh}
  /* Half and three-quarter screen (Ali, 2026-11-23: he shares the deck beside claude.ai). Below
     ~1150px wide every two-column slide stacks, decorative pictures step aside, and prompt
     cards get the room, so the slide still reads at half a 1920 screen. */
  @media (max-width:1150px){
    .slide{padding:3.5vh 3.5vw}
    .split,.split.rev{grid-template-columns:minmax(0,1fr);gap:2vh}
    .split>.photo,.split>.avatar,.hstack .photo,.illus,.foodstrip,.photostack{display:none}
    #qrdock .q{width:56px;height:56px} #qrdock{bottom:34px;right:10px}
    .slide{padding-bottom:12vh}
    .hstack{height:auto;display:block}
    .howto{margin-top:1.4vh} .howto div{padding:1vh .8vw;font-size:13px}
    .pcard{max-height:none} .pcard pre{font-size:15px}
    h1{font-size:clamp(28px,5vw,52px)} h2{font-size:clamp(22px,4vw,40px)}
    .sub{font-size:15px}
    .ways{gap:2vw} .way{padding:1.6vh 1.2vw}
    .chain{grid-template-columns:1fr;gap:1vh} .chain .arrow{display:none} .link{padding:1.6vh 1vw;flex-direction:row;align-items:center;gap:1vw}
    .vs,.three{grid-template-columns:minmax(0,1fr)} .desc{font-size:18px;padding:2vh 1.6vw}
    .card5 .v{font-size:15px}
    .storybox li{font-size:16px}
  }
  .foodstrip{display:grid;grid-template-columns:1fr 1fr;gap:1vw;margin-bottom:1.6vh}
  .foodstrip .photo{height:17vh}
  #pnbtn{position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:56;background:#1a202c;color:#fff;border:none;border-radius:999px;padding:8px 16px;font-weight:800;font-size:12px;letter-spacing:1px;cursor:pointer;opacity:.85}
  #pnbtn.hide{display:none}
`;

/* ---------------------------------------------------------- illustrations -- */
const SVG = {
  phonelaptop: `<svg viewBox="0 0 520 260" role="img" aria-label="A phone and a laptop, both following the class">
    <rect x="40" y="40" width="300" height="180" rx="14" fill="#1a202c"/><rect x="54" y="54" width="272" height="152" rx="6" fill="#fff"/>
    <rect x="54" y="54" width="186" height="152" fill="#eef3f8"/><text x="147" y="134" text-anchor="middle" font-size="16" font-weight="700" fill="#367895">Live class</text>
    <rect x="244" y="54" width="82" height="152" fill="#fff1f0"/><rect x="252" y="66" width="66" height="10" rx="4" fill="#FB2832"/>
    <rect x="252" y="84" width="58" height="6" rx="3" fill="#cbd5e1"/><rect x="252" y="96" width="62" height="6" rx="3" fill="#cbd5e1"/><rect x="252" y="114" width="66" height="22" rx="11" fill="#1f2937"/>
    <rect x="20" y="220" width="340" height="14" rx="7" fill="#94a3b8"/>
    <rect x="400" y="50" width="100" height="190" rx="18" fill="#1a202c"/><rect x="408" y="66" width="84" height="158" rx="8" fill="#fff"/>
    <rect x="416" y="78" width="68" height="10" rx="4" fill="#FB2832"/><rect x="416" y="96" width="60" height="6" rx="3" fill="#cbd5e1"/><rect x="416" y="108" width="64" height="6" rx="3" fill="#cbd5e1"/>
    <rect x="416" y="128" width="68" height="70" rx="6" fill="#0f1720"/><rect x="422" y="136" width="50" height="5" rx="2" fill="#5BA63C"/><rect x="422" y="146" width="40" height="5" rx="2" fill="#94a3b8"/>
    <rect x="416" y="204" width="68" height="14" rx="7" fill="#FB2832"/>
  </svg>`,
  sheet: `<svg viewBox="0 0 520 330" role="img" aria-label="A small orders table with three mistakes circled">
    <rect x="10" y="10" width="500" height="280" rx="14" fill="#fff" stroke="#e8e2de" stroke-width="2"/>
    <rect x="10" y="10" width="500" height="36" rx="14" fill="#1a202c"/>
    ${['Order', 'Date', 'Customer', 'Region', 'Amount'].map((h, i) => `<text x="${30 + i * 98}" y="34" font-size="14" font-weight="700" fill="#fff">${h}</text>`).join('')}
    ${[['1001', 'Nov 20', 'Ana', 'West', '120'], ['1002', 'Nov 20', 'Ben', 'East', '85'], ['1002', 'Nov 20', 'Ben', 'East', '85'], ['1003', 'Nov 21', 'Cy', '', '240'], ['1004', 'Nov 21', 'Dee', 'South', '-60'], ['1005', 'Nov 22', 'Eli', 'North', '310']].map((r, j) =>
      r.map((c, i) => `<text x="${30 + i * 98}" y="${74 + j * 38}" font-size="15" fill="#2d3748">${c}</text>`).join('')).join('')}
    <rect x="18" y="130" width="484" height="30" rx="8" fill="none" stroke="#FB2832" stroke-width="3"/>
    <rect x="312" y="168" width="80" height="30" rx="8" fill="none" stroke="#FB2832" stroke-width="3"/>
    <rect x="410" y="206" width="86" height="30" rx="8" fill="none" stroke="#FB2832" stroke-width="3"/>
    <text x="260" y="318" text-anchor="middle" font-size="14" font-weight="700" fill="#E5121D">Made-up practice data: listed twice, an empty box, an amount below zero</text>
  </svg>`,
  checklist: `<svg viewBox="0 0 520 300" role="img" aria-label="A checklist with PASS and FAIL marks and a STOP answer">
    ${[['Listed twice?', 'FAIL'], ['Any empty box?', 'FAIL'], ['Amount below zero?', 'FAIL'], ['Date in the future?', 'PASS']].map(([t, r], j) =>
      `<rect x="20" y="${16 + j * 54}" width="480" height="44" rx="12" fill="${r === 'PASS' ? '#eaf6e3' : '#fff1f0'}" stroke="${r === 'PASS' ? '#5BA63C' : '#FB2832'}" stroke-width="2"/>
       <text x="40" y="${44 + j * 54}" font-size="18" fill="#1a202c" font-weight="600">${t}</text>
       <text x="480" y="${44 + j * 54}" text-anchor="end" font-size="18" font-weight="800" fill="${r === 'PASS' ? '#2f6b16' : '#C20E1E'}">${r}</text>`).join('')}
    <rect x="160" y="236" width="200" height="52" rx="26" fill="#C20E1E"/><text x="260" y="270" text-anchor="middle" font-size="24" font-weight="900" fill="#fff">STOP</text>
  </svg>`,
  card: `<svg viewBox="0 0 520 300" role="img" aria-label="A recipe card labelled SKILL.md">
    <rect x="30" y="20" width="460" height="260" rx="18" fill="#fffaf0" stroke="#E8920C" stroke-width="3"/>
    <text x="54" y="58" font-size="22" font-weight="900" fill="#1a202c">SKILL.md</text><text x="470" y="58" text-anchor="end" font-size="14" font-weight="700" fill="#E8920C">recipe card</text>
    ${[['NAME', 'morning-order-check'], ['WHEN', 'someone asks if an orders file is safe to share'], ['STEPS', '4 checks, in order'], ['RESULT', 'PASS / FAIL, then GO or STOP'], ['NEVER', 'change the data']].map(([k, v], j) =>
      `<text x="54" y="${100 + j * 38}" font-size="14" font-weight="800" fill="${k === 'WHEN' ? '#E5121D' : '#64748b'}">${k}</text><text x="150" y="${100 + j * 38}" font-size="16" fill="#2d3748">${v}</text>`).join('')}
  </svg>`,
  update: `<svg viewBox="0 0 520 300" role="img" aria-label="A short five line update for a manager">
    <rect x="40" y="16" width="440" height="268" rx="18" fill="#fff" stroke="#e8e2de" stroke-width="2"/>
    <rect x="40" y="16" width="440" height="44" rx="18" fill="#367895"/><text x="64" y="45" font-size="17" font-weight="800" fill="#fff">To: my manager</text>
    ${[['Status', 'STOP'], ['What happened', '3 mistakes in the orders'], ['Why it matters', 'the sales number is wrong'], ['Who fixes it', 'the data analyst'], ['Next update', '11:00 AM today']].map(([k, v], j) =>
      `<text x="64" y="${96 + j * 38}" font-size="15" font-weight="800" fill="#1a202c">${k}:</text><text x="210" y="${96 + j * 38}" font-size="15" fill="${v === 'STOP' ? '#C20E1E' : '#2d3748'}" font-weight="${v === 'STOP' ? 800 : 400}">${v}</text>`).join('')}
  </svg>`,
};

/* ----------------------------------------------------------- slide bodies -- */
const brand = (sec, white) => `<div class="brandbar"><div class="wordmark${white ? ' white' : ''}"></div><span class="bsec">${esc(sec)}</span></div>`;
const promptCard = (s) => `<div class="pcard"><div class="ph"><span>${esc(s.prompt.label)}</span><span class="expect">On everyone's phone too</span></div><pre>${esc(s.prompt.text)}</pre>
  <div class="pf"><a class="runbtn" data-claude target="_blank" rel="noopener">▶ Open in Claude</a><button class="runbtn ghost" data-copy>Copy</button><span class="expect">You should see: ${esc(s.prompt.expect || '')}</span></div></div>`;

function body(s) {
  switch (s.kind) {
    case 'title': return `${brand('Weekly Live · Episode 1')}
      <div class="split"><div>
        <div class="kicker">Monday, November 23 · 6:30 PM Central</div>
        <h1>Your know-how<br>is now a <span class="red">product.</span></h1>
        <p class="sub">Tonight you teach AI one thing you know how to do, once, so it does it the same way every time. No experience needed: if you can copy and paste, you can do this.</p>
        <div class="stats"><div class="stat"><b>60 min</b><span>live</span></div><div class="stat berry"><b>5</b><span>hands-on prompts</span></div><div class="stat leaf"><b>📱 + 💻</b><span>phone or computer</span></div></div>
      </div><div class="avatar"><img src="${img('ali-avatar.jpg')}" alt="Ali Muwwakkil"></div></div>`;
    case 'lobby': return `${brand('Get connected')}
      <div class="kicker">Before we start · 2 minutes</div><h2>Follow along on your <span class="red">phone</span> or your <span class="red">computer</span>.</h2>
      <div class="ways">
        <div class="way"><div class="big">📱</div><h3>On your phone</h3><div class="bigqr" data-qr style="width:min(26vh,250px);height:min(26vh,250px)"></div>
          <ol><li>Point your camera at the code</li><li>Type your name and email</li><li>Keep the page open all class</li></ol></div>
        <div class="way"><div class="big">💻</div><h3>On your computer</h3><div class="url">The link is in the Zoom chat</div>
          <button class="runbtn" data-copylink type="button">📋 Copy link for the chat</button>
          <ol><li>Click the link in the Zoom chat</li><li>Type your name and email</li><li>Click <b>Open as a side window</b> so the class keeps the rest of your screen</li></ol>
          <div class="counter-row"><span>In the room</span><div class="count" data-present>0</div></div></div>
      </div>`;
    case 'agenda': return `${brand("Tonight's plan")}
      <div class="center" style="max-width:1080px;width:100%;margin:0 auto"><div class="kicker">The next 60 minutes</div><h2 style="margin-bottom:1.4vh">Here's the plan.</h2><div style="width:100%">
        <div class="agrow"><span class="n">1</span><span class="t">A story you have probably lived<span>The person who knows how to check the numbers is out today</span></span><span class="mins">5 min</span></div>
        <div class="agrow"><span class="n">2</span><span class="t">What a skill is<span>A recipe card for Claude, in five lines</span></span><span class="mins">6 min</span></div>
        <div class="agrow hot"><span class="n">3</span><span class="t">Hands-on: teach Claude a real check<span>5 short copy and paste prompts, on your phone or computer</span></span><span class="mins">25 min</span></div>
        <div class="agrow hot"><span class="n">4</span><span class="t">Your turn: a skill card for YOUR job<span>Two volunteers in the hot seat, everyone builds their own</span></span><span class="mins">9 min</span></div>
        <div class="agrow"><span class="n">5</span><span class="t">Recap, next Monday, your questions</span><span class="mins">5 min</span></div>
      </div></div>`;
    case 'story': return `${brand('A story')}
      <div class="split"><div>
        <div class="kicker">Illustrative scenario</div><h2>8:05 AM.<br><span class="red">The person who knows is out.</span></h2>
        <ul class="storybox"><li>📉 The dashboard says sales are down 18%</li><li>✅ The automatic overnight update says SUCCESS</li><li>🤒 The analyst who checks it by hand is out sick</li><li>🤷 Nobody else knows her checklist</li></ul>
      </div><div class="photo" style="height:66vh"><img src="${img('team-laptop.jpg')}" alt="A team looking at a laptop"></div></div>`;
    case 'statement': return `<div class="center mid"><div class="kicker">${s.title === 'Your know-how is now a product' ? 'The big idea' : 'Look what you just did'}</div>
      ${s.title === 'Your know-how is now a product'
        ? '<h1>Your know-how<br>is now a <u>product</u>.</h1><p class="sub" style="margin-top:4vh">The checks, steps and judgment in your head are exactly what companies are turning into AI skills. Tonight you write one down.</p>'
        : '<h1>You just wrote down a check<br>that lived in <u>one person\'s head</u>.</h1><p class="sub" style="margin-top:4vh">Now anyone can run it, the same way, every time. Next: save it so Claude uses it on its own.</p>'}</div>`;
    case 'skill': return `${brand('What is a skill?')}
      <div class="split"><div>
        <div class="kicker">In plain words</div><h2>A skill is a<br><span class="red">recipe card for Claude.</span></h2>
        <p class="sub">You write it once. Claude keeps it. When a question matches the WHEN line, Claude pulls out the card and follows it the same way every time.</p>
        <div class="glossary"><div><b>Prompt:</b> the message you type to Claude</div><div><b>Skill:</b> saved instructions Claude uses when the moment fits</div><div><b>Practice data:</b> made-up numbers, safe to play with</div></div>
      </div><div><div class="foodstrip"><div class="photo"><img src="${img('food-bowl.jpg')}" alt="A finished dish"></div><div class="photo"><img src="${img('food-board.jpg')}" alt="Fresh ingredients on a cutting board"></div></div><div class="card5">
        <div class="row"><div class="k">🏷️ Name</div><div class="v">morning-order-check</div></div>
        <div class="row hot"><div class="k">⏰ When</div><div class="v">Someone asks if an orders file is safe to share</div></div>
        <div class="row"><div class="k">📋 Steps</div><div class="v">Listed twice? Empty box? Odd amount? Future date?</div></div>
        <div class="row"><div class="k">🎯 Result</div><div class="v">PASS or FAIL for each, then GO or STOP</div></div>
        <div class="row"><div class="k">🚫 Never</div><div class="v">Change the data. Only report on it.</div></div>
      </div></div></div>`;
    case 'handson': return `${brand(`Hands-on ${s.n} of 5`)}
      <div class="split"><div class="hstack"><div>
          <div class="stepbadge">✋ Hands-on ${s.n} of 5</div><h2>${esc(s.title.replace(/^Hands-on \d: /, '').replace(/^./, (c) => c.toUpperCase()))}</h2>
          <div class="howto"><div><b>1</b>Copy it on your phone, or click Open in Claude</div><div><b>2</b>Paste it into a new Claude chat and send</div><div><b>3</b>Tap <b style="display:inline;font-size:1em">Finished</b> when Claude answers</div></div>
          ${s.n === 2 ? '<div class="raffle" style="margin-top:2vh">🛡️ <b>Rule:</b> never practice on real company data. Made-up data is safe to get wrong.</div>' : ''}
        </div><div class="illus">${SVG[s.img] || ''}</div></div>
        ${promptCard(s)}</div>`;
    case 'mistake': return `${brand('The number one mistake')}
      <div class="kicker">Why a skill never runs</div><h2>Claude picks a skill by its <span class="red">WHEN</span> line.</h2>
      <div class="vs"><div class="desc no"><small>❌ Never runs</small><p>"Helps with data."</p></div>
        <div class="desc yes"><small>✅ Runs every time</small><p>"Checks an orders file for mistakes before anyone shares it, and answers GO or STOP."</p></div></div>
      <p class="sub">Write the WHEN line in the words a coworker would actually say when they need it.</p>`;
    case 'fet': return `${brand('Find it. Explain it. Tell people.')}
      <div class="kicker">Every problem needs three things</div><h2>The check found it. <span class="red">Now tell the boss.</span></h2>
      <div class="chain">
        <div class="link" style="background:var(--cherry)"><div class="ic">🔍</div><b>Find it</b><span>The morning check: GO or STOP</span></div><div class="arrow">→</div>
        <div class="link" style="background:var(--berry)"><div class="ic">🧩</div><b>Explain it</b><span>What went wrong, and why</span></div><div class="arrow">→</div>
        <div class="link" style="background:var(--leaf)"><div class="ic">📨</div><b>Tell people</b><span>5 lines your manager can act on</span></div>
      </div>`;
    case 'hotseat': return `${brand('Your turn')}
      <div class="split"><div class="hstack"><div>
          <div class="stepbadge">🙋 Hot seat</div><h2>A check only <span class="red">you</span> know how to do.</h2>
          <p class="sub">Two volunteers: what is one check that would stop running if you were out tomorrow? No real data, only the shape of the task. Everyone else: run this prompt for your own job.</p>
        </div><div class="photo" style="min-height:0"><img src="${img('sticky-notes.jpg')}" alt="A team planning on sticky notes"></div></div>
        ${promptCard(s)}</div>`;
    case 'save': return `${brand('Where your skill lives')}
      <div class="split"><div>
        <div class="kicker">Keep it</div><h2>Your recipe card<br><span class="red">goes with you.</span></h2>
        <ul class="points"><li><b>Save your skill card</b> somewhere safe: a note, a doc, an email to yourself</li><li>Ask Claude: <b>"How do I add this skill to my Claude account?"</b></li><li>After that, just ask in plain words, and Claude uses it</li><li>In the program, <b>Week 2</b> is building three skills like this one for your own project</li></ul>
      </div><div class="photo" style="height:66vh"><img src="${img('developer-code.jpg')}" alt="Someone building on a laptop"></div></div>`;
    case 'recap': return `${brand('Recap')}
      <div class="kicker">Three things to remember</div><h2>What you can do now.</h2>
      <div class="three"><div><div class="n">1</div><p>A skill is a recipe card for Claude.</p></div><div><div class="n">2</div><p>The WHEN line decides if it ever runs.</p></div><div><div class="n">3</div><p>Find it. Explain it. Tell people.</p></div></div>`;
    case 'next': return `${brand('Next Monday')}
      <div class="split"><div>
        <div class="kicker">Next Monday · 6:30 PM Central</div><h2>It's 2 AM and nobody is at the keyboard.<br><span class="red">Does anything happen at all?</span></h2>
        <p class="sub">Next week: your first AI assistant that keeps working while you sleep.</p>
        <ul class="points"><li>Questions now? <b>Type them on your phone or computer</b>, they show up here</li></ul>
      </div><div class="photo" style="height:66vh"><img src="${img('night-street.jpg')}" alt="A city street at night"></div></div>`;
    default: return '';
  }
}

/**
 * Every slide has its own background photo (assets/bg-NN.jpg, NN = slide number), under a
 * tint that keeps the text readable: white on content slides, cherry on statements, navy on
 * live votes. The photo shows what the slide is about (Ali, 2026-11-23).
 */
function bgStyle(s, k) {
  const tint = s.kind === 'poll' ? 'rgba(11,18,32,.86),rgba(11,18,32,.92)'
    : s.kind === 'statement' ? 'rgba(229,18,29,.80),rgba(160,10,24,.88)'
      : 'rgba(255,255,255,.72),rgba(255,255,255,.84)';
  return ` style="background:linear-gradient(${tint}),url('${img(`bg-${String(k + 1).padStart(2, '0')}.jpg`)}') center/cover no-repeat"`;
}

function section(s, k) {
  if (s.kind === 'poll') {
    const p = s.poll;
    return `<section class="slide poll"${bgStyle(s, k)} data-idx="${k}"data-poll="${esc(p.key)}" data-kind="${esc(p.kind)}" data-q="${esc(p.q)}" data-options='${esc(JSON.stringify(p.options)).replace(/'/g, '&#39;')}'${typeof p.answer === 'number' ? ` data-answer="${p.answer}"` : ''}${p.reveal ? ` data-reveal="${esc(p.reveal)}"` : ''}></section>`;
  }
  const cls = s.kind === 'statement' ? 'slide statement wm' : 'slide wm';
  return `<section class="${cls}"${bgStyle(s, k)} data-idx="${k}"${s.kind === 'lobby' ? ' data-oh="lobby"' : ''}>${body(s)}</section>`;
}

/* -------------------------------------------------------------- deck data -- */
const DATA = slides.map((s) => ({
  title: s.title, min: s.min, do: s.do || '', say: s.say || [], read: s.read || '', clip: s.clip || '',
  follow: s.follow, prompt: s.prompt ? { label: s.prompt.label, text: s.prompt.text, expect: s.prompt.expect || '' } : null,
  reveal: s.poll && s.poll.reveal ? s.poll.reveal : '',
}));
const safeJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

// Browser code, kept as an HTML fragment (like the Open House template's <script>) so the
// server-side timer scan (platformOperations/scanTimers) never mistakes its setIntervals for server timers.
const deckScript = fs.readFileSync(path.join(__dirname, 'deck-script.html'), 'utf8');

const deck = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Weekly Live · Your Know-How Is Now a Product</title>
<style>${ohCss}${EXTRA_CSS}</style>
</head>
<body>
<div id="progress"></div>
<div id="counter"></div>
<div id="hint">← → navigate · P presenter window · J join QR · Q lobby</div>
<div id="livepill">REHEARSAL · LIVE OFF</div>
<button id="pnbtn" type="button">🗒️ Open presenter window (P)</button>
<div id="qrdock" title="Click to enlarge · J to show or hide"><div class="q" data-qr></div><span>Scan to<br>join along</span></div>
<div id="qrbig"><div class="q" data-qr></div><b>Scan to join along</b><span>Name and email, no account needed · or use the link in the Zoom chat</span></div>
<div id="notes"></div>
${slides.map(section).join('\n')}
<script type="application/json" id="deckdata">${safeJson(DATA)}</script>
${deckScript}
</body>
</html>
`;

/* ---------------------------------------------------------- teaching guide -- */
let clock = 0;
const rows = slides.map((s, k) => {
  const at = clock; clock += Number(s.min || 0);
  return `<section class="row${s.poll ? ' poll' : ''}${s.prompt ? ' prompt' : ''}"><div class="when">${at}:00<span>~${s.min} min</span></div><div class="b">
    <div class="tag">Slide ${k + 1}${s.poll ? ' · ' + s.poll.kind.toUpperCase() : ''}${s.prompt ? ' · HANDS-ON' : ''}</div><h2>${esc(s.title)}</h2>
    ${s.do ? `<p class="do"><b>Do:</b> ${esc(s.do)}</p>` : ''}
    <ul>${(s.say || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    ${s.read ? `<p class="read"><b>Read:</b> ${esc(s.read)}</p>` : ''}
    ${s.clip ? `<p class="clip"><b>🎬 Clip line:</b> “${esc(s.clip)}”</p>` : ''}
    ${s.prompt ? `<pre>${esc(s.prompt.text)}</pre>` : ''}
    ${s.poll ? `<p><b>On their phones:</b> ${esc(s.poll.q)}</p><ol type="A">${s.poll.options.map((o, j) => `<li${j === s.poll.answer ? ' class="right"' : ''}>${esc(o)}</li>`).join('')}</ol>${s.poll.reveal ? `<p class="read"><b>Reveal:</b> ${esc(s.poll.reveal)}</p>` : ''}` : ''}
    <p class="ph"><b>Their screen says:</b> ${esc(s.follow.heading)}</p>
  </div></section>`;
}).join('\n');
const clips = slides.map((s, k) => (s.clip ? `<li><b>Slide ${k + 1} · ${esc(s.title)}</b><br>“${esc(s.clip)}”</li>` : '')).filter(Boolean).join('');
const guide = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Teaching Guide · Your Know-How Is Now a Product</title><style>
body{font-family:"Segoe UI",Roboto,Arial,sans-serif;color:#1a202c;max-width:980px;margin:0 auto;padding:28px 18px 60px;background:#faf7f5}
h1{font-size:30px;margin:0 0 6px} .lead{color:#64748b;margin:0 0 22px}
.row{display:grid;grid-template-columns:90px 1fr;gap:16px;background:#fff;border:1px solid #e8e2de;border-radius:16px;padding:16px;margin:12px 0}
.row.poll{border-left:6px solid #367895} .row.prompt{border-left:6px solid #FB2832}
.when{font-weight:800;font-size:20px} .when span{display:block;font-size:12px;color:#64748b;font-weight:600}
.tag{font-size:11px;font-weight:800;letter-spacing:2px;color:#E5121D;text-transform:uppercase} h2{font-size:20px;margin:4px 0 8px}
.do{color:#1d4fd8} .read{background:#f1f5f9;border-radius:10px;padding:10px 12px} .clip{background:#fdf0dd;border-radius:10px;padding:10px 12px;color:#5f3803}
pre{background:#0f1720;color:#e7eef6;border-radius:10px;padding:12px;white-space:pre-wrap;font-size:13px}
li.right{font-weight:800;color:#2f6b16} .ph{color:#64748b;font-size:14px}
.clips{background:#fff;border:2px solid #E8920C;border-radius:16px;padding:16px 20px} .clips li{margin:10px 0}
</style></head><body>
<h1>Teaching Guide: Your Know-How Is Now a Product</h1>
<p class="lead">Weekly Live · Episode 1 · Monday, November 23, 6:30 PM Central · 60 minutes · ${slides.length} slides, 5 hands-on prompts, ${keys.length} live votes. Press P in the deck for the presenter window.</p>
<h2>🎬 Clip sheet for Piyush</h2><ol class="clips">${clips}</ol>
<h2 style="margin-top:28px">Run of show</h2>
${rows}
</body></html>
`;

const repeats = Object.entries(USED).filter(([, n]) => n > 1).map(([f, n]) => `${f} x${n}`);
if (repeats.length) { console.error('LINT FAIL\n  picture used more than once: ' + repeats.join(', ')); process.exit(1); }

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'deck.html'), deck);
fs.writeFileSync(path.join(outDir, 'guide.html'), guide);
console.log(`OK ${slides.length} slides, ${minutes} min, ${keys.length} polls, ${slides.filter((s) => s.prompt).length} prompts, ${slides.filter((s) => s.clip).length} clip lines; deck ${Math.round(deck.length / 1024)}KB, guide ${Math.round(guide.length / 1024)}KB`);
