/**
 * The Weekly Live deck's styles (WL4.2): the Open House template's <style> plus the Session 3
 * follow-along additions, generated from backend/src/scripts/session-decks/ so the generated decks
 * and the hand-built ones look the same. Logos are absolute URLs on the site (`asset`), because
 * Present writes the deck into a blank tab where a relative path resolves to nothing.
 */
export function deckCss(asset: (sitePath: string) => string): string {
  return `
  :root{
    --cherry:#FB2832; --cherry-deep:#E5121D; --cherry-dark:#C20E1E;
    --leaf:#5BA63C; --leaf-soft:#eaf6e3;
    --berry:#367895; --amber:#E8920C; --amber-soft:#fdf0dd;
    --ink:#1a202c; --ink-2:#2d3748; --muted:#64748b; --line:#e8e2de;
    --bg:#ffffff; --bg-soft:#faf7f5; --shadow:0 18px 50px rgba(26,32,44,.14);
  }
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{height:100%}
  body{font-family:"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:#111;overflow:hidden}
  .slide{position:absolute;inset:0;display:none;flex-direction:column;background:var(--bg);padding:4.5vh 5vw;overflow:hidden}
  .slide.active{display:flex;animation:fadein .35s ease}
  @keyframes fadein{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
  .slide.wm::after{content:"";position:absolute;right:-70px;bottom:-90px;width:420px;height:420px;
    background:url("${asset('/colaberry-icon.png')}") no-repeat center/contain;opacity:.055;pointer-events:none}
  .slide.statement.wm::after{background-image:url("${asset('/colaberry-icon.png')}");opacity:.10}
  #progress{position:fixed;top:0;left:0;height:5px;background:var(--cherry);width:0;z-index:50;transition:width .3s ease}
  #counter{position:fixed;bottom:16px;right:22px;z-index:50;font-size:13px;color:#94a3b8;font-weight:600;letter-spacing:1px}
  #hint{position:fixed;bottom:16px;left:22px;z-index:50;font-size:12px;color:#b8b0aa}
  #livepill{position:fixed;top:14px;right:18px;z-index:55;font-size:11px;font-weight:800;letter-spacing:1.5px;padding:5px 12px;border-radius:999px;background:#94a3b8;color:#fff}
  #livepill.on{background:var(--leaf)}
  .kicker{color:var(--cherry-deep);font-weight:800;letter-spacing:3px;text-transform:uppercase;font-size:clamp(12px,1.15vw,16px);margin-bottom:1.6vh}
  h1{font-size:clamp(32px,4.4vw,64px);line-height:1.08;letter-spacing:-.5px}
  h2{font-size:clamp(26px,3.4vw,50px);line-height:1.1;letter-spacing:-.5px}
  .sub{color:var(--muted);font-size:clamp(15px,1.5vw,21px);line-height:1.5;margin-top:1.8vh;max-width:58ch}
  .red{color:var(--cherry-deep)}
  ul.points{margin-top:2.4vh;list-style:none}
  ul.points li{position:relative;padding-left:30px;margin:1.3vh 0;font-size:clamp(14px,1.3vw,19px);line-height:1.45;color:var(--ink-2)}
  ul.points li::before{content:"";position:absolute;left:0;top:.5em;width:14px;height:14px;border-radius:4px;background:var(--cherry);opacity:.9}
  ul.points li b{color:var(--ink)}
  .brandbar{display:flex;align-items:center;gap:14px;margin-bottom:3vh;z-index:2}
  .wordmark{height:30px;width:150px;background:url("${asset('/colaberry-horizontal.png')}") no-repeat left center/contain}
  .wordmark.white{background-image:url("${asset('/knowledge/assets/logo/colaberry-horizontal-white.png')}");height:26px;width:130px}
  .brandbar .bsec{font-weight:700;letter-spacing:2.5px;font-size:13px;color:#a89f99;text-transform:uppercase;border-left:2px solid var(--line);padding-left:14px}
  .split{display:grid;grid-template-columns:minmax(0,46fr) minmax(0,54fr);gap:4vw;align-items:center;flex:1;min-height:0}
  .split.rev{grid-template-columns:minmax(0,54fr) minmax(0,46fr)}
  .center{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;min-height:0}
  .center.mid{align-items:center;text-align:center}
  .shot{position:relative;border-radius:18px;overflow:hidden;border:1px solid var(--line);box-shadow:var(--shadow);background:#fff;height:70vh}
  .shot img{width:100%;height:100%;object-fit:cover;object-position:top center;display:block}
  .shot .tag{position:absolute;top:12px;left:12px;background:var(--cherry);color:#fff;font-size:11px;font-weight:800;letter-spacing:1.5px;padding:5px 12px;border-radius:999px;z-index:2}
  .shot .tag.pub{background:var(--berry)}
  .shot .cap{position:absolute;left:0;right:0;bottom:0;background:linear-gradient(transparent,rgba(20,15,12,.84));color:#fff;font-size:13px;padding:26px 16px 12px;letter-spacing:.4px}
  .photo{position:relative;border-radius:18px;overflow:hidden;border:1px solid var(--line);box-shadow:var(--shadow)}
  .photo img{width:100%;height:100%;object-fit:cover;display:block}
  .photostack{display:grid;grid-template-rows:3fr 2fr;gap:2vh;height:72vh}
  .statement{background:radial-gradient(120% 140% at 20% 0%,#ff5a4e 0%,var(--cherry) 42%,var(--cherry-dark) 100%);color:#fff}
  .statement .kicker{color:#ffd9d4}
  .statement h1{color:#fff;font-size:clamp(36px,5vw,76px)}
  .statement .sub{color:#ffe4e1}
  .stats{display:flex;gap:2vw;margin-top:3.4vh;flex-wrap:wrap}
  .stat{border:1.5px solid var(--line);border-left:6px solid var(--cherry);border-radius:14px;padding:1.8vh 1.6vw;background:var(--bg-soft);min-width:11vw}
  .stat b{display:block;font-size:clamp(24px,2.7vw,40px);letter-spacing:-.5px}
  .stat span{display:block;color:var(--muted);font-size:clamp(11px,.95vw,14px);text-transform:uppercase;letter-spacing:1.3px;margin-top:4px}
  .stat.berry{border-left-color:var(--berry)} .stat.amber{border-left-color:var(--amber)} .stat.leaf{border-left-color:var(--leaf)}
  .src{margin-top:2vh;font-size:clamp(10px,.85vw,12px);color:#a59c96;letter-spacing:.4px}
  .quote{position:relative;border:1.5px solid var(--line);border-radius:18px;background:#fff;box-shadow:var(--shadow);padding:2.6vh 2.2vw 2vh 3.4vw;margin:1.2vh 0}
  .quote::before{content:"\\201C";position:absolute;left:.9vw;top:.2vh;font-size:clamp(50px,5vw,84px);font-weight:800;color:var(--cherry);opacity:.85;font-family:Georgia,serif;line-height:1}
  .quote p{font-size:clamp(15px,1.55vw,23px);line-height:1.42;color:var(--ink);font-weight:600}
  .quote .who{margin-top:1.2vh;font-size:clamp(11px,1vw,14px);color:var(--muted);font-weight:700;letter-spacing:.6px;text-transform:uppercase}
  .quote .who b{color:var(--cherry-deep)}
  .quote.berry::before{color:var(--berry)} .quote.amber::before{color:var(--amber)}
  .phases{display:grid;grid-template-columns:repeat(4,1fr);gap:1.4vw;flex:1;margin-top:2.6vh;min-height:0}
  .phase{position:relative;border:1.5px solid var(--line);border-radius:16px;background:var(--bg-soft);padding:2.2vh 1.2vw;display:flex;flex-direction:column;overflow:hidden}
  .phase .ic{font-size:clamp(28px,2.6vw,40px);margin-bottom:1vh}
  .phase h3{font-size:clamp(15px,1.4vw,20px);line-height:1.25;margin-bottom:.6vh}
  .phase .wk{font-size:clamp(10px,.9vw,13px);color:var(--cherry-deep);font-weight:800;letter-spacing:2px;text-transform:uppercase;margin-bottom:1vh}
  .phase p{font-size:clamp(12px,1.08vw,15.5px);color:var(--ink-2);line-height:1.45}
  .phase .ghost{position:absolute;right:14px;bottom:0;font-size:clamp(100px,10vw,170px);font-weight:800;color:rgba(26,32,44,.055);line-height:.8}
  .phase:nth-child(1){border-top:5px solid var(--cherry)} .phase:nth-child(2){border-top:5px solid var(--berry)}
  .phase:nth-child(3){border-top:5px solid var(--amber)} .phase:nth-child(4){border-top:5px solid var(--leaf)}
  .bookcover{width:min(19vw,250px);aspect-ratio:2/3;border-radius:10px;box-shadow:0 24px 60px rgba(26,32,44,.35);
    background:linear-gradient(160deg,#0e1b26 0%,#16324a 55%,#0b1220 100%);color:#fff;display:flex;flex-direction:column;padding:2vh 1.3vw;border:1px solid rgba(255,255,255,.15)}
  .bookcover .bc-top{font-size:10px;letter-spacing:2.5px;color:#7fd1c0;font-weight:800;text-transform:uppercase}
  .bookcover h3{font-size:clamp(18px,1.9vw,28px);line-height:1.12;margin-top:1.2vh;font-weight:800}
  .bookcover .bc-sub{font-size:clamp(10px,.85vw,13px);color:#bcd3e2;line-height:1.4;margin-top:1.2vh}
  .bookcover .bc-author{margin-top:auto;font-size:clamp(11px,.95vw,14px);font-weight:700;border-top:1px solid rgba(255,255,255,.25);padding-top:1.2vh}
  .bookcover .bc-author span{display:block;font-weight:500;color:#9fb8c9;font-size:.85em}
  .ram{width:min(12vw,150px);aspect-ratio:1/1;border-radius:20px;overflow:hidden;border:4px solid #fff;box-shadow:var(--shadow)}
  .ram img{width:100%;height:100%;object-fit:cover;display:block}
  .prizes{display:grid;grid-template-columns:1fr 1fr;gap:2.4vw;flex:1;margin-top:2vh;min-height:0;align-items:stretch}
  .prize{border:2px solid var(--line);border-radius:22px;padding:3vh 2vw;display:flex;gap:1.6vw;align-items:center;background:#fff;box-shadow:var(--shadow)}
  .prize.gold{border-color:var(--amber);background:linear-gradient(160deg,#fffaf0,#fdf0dd)}
  .prize .big{font-size:clamp(40px,4.6vw,70px);font-weight:900;letter-spacing:-1px;color:var(--cherry-deep);line-height:1}
  .prize h3{font-size:clamp(18px,1.9vw,28px);margin:.8vh 0}
  .prize p{font-size:clamp(13px,1.2vw,17px);color:var(--ink-2);line-height:1.45}
  .raffle{margin-top:2.4vh;background:var(--amber-soft);border:2px solid var(--amber);border-radius:16px;padding:1.6vh 1.6vw;font-size:clamp(13px,1.25vw,17px);color:#5f3803;line-height:1.5}
  .raffle b{color:#3f2600}
  .doors{display:grid;grid-template-columns:1.15fr 1fr;gap:2.4vw;flex:1;margin-top:2vh;min-height:0}
  .door{border:2px solid var(--line);border-radius:20px;padding:2.6vh 2vw;display:flex;flex-direction:column;background:#fff}
  .door.primary{border-color:var(--cherry);box-shadow:var(--shadow)}
  .door .dk{font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:var(--muted)}
  .door.primary .dk{color:var(--cherry-deep)}
  .door h3{font-size:clamp(20px,2.1vw,30px);margin:.6vh 0}
  .price{font-size:clamp(34px,4vw,58px);font-weight:800;letter-spacing:-1px}
  .price small{font-size:.38em;color:var(--muted);font-weight:600}
  .door ul{list-style:none;margin-top:1.4vh}
  .door li{padding:.7vh 0 .7vh 26px;position:relative;font-size:clamp(13px,1.2vw,17px);color:var(--ink-2)}
  .door li::before{content:"✓";position:absolute;left:0;color:var(--leaf);font-weight:800}
  .sum{margin-top:auto;border-top:2px dashed var(--line);padding-top:1.4vh;display:flex;justify-content:space-between;font-size:clamp(14px,1.35vw,19px);font-weight:700}
  .sum b{color:var(--cherry-deep);font-size:1.25em}
  .agrow{display:flex;align-items:center;gap:1.4vw;padding:1.3vh 1.4vw;border:1.5px solid var(--line);border-radius:16px;background:#fff;margin:1vh 0;box-shadow:0 6px 18px rgba(26,32,44,.05)}
  .agrow .n{width:42px;height:42px;flex:none;border-radius:50%;background:var(--cherry);color:#fff;font-weight:800;font-size:19px;display:flex;align-items:center;justify-content:center}
  .agrow.hot{border-color:var(--cherry);box-shadow:var(--shadow)} .agrow.hot .n{background:var(--cherry-dark)}
  .agrow .t{flex:1;font-size:clamp(15px,1.45vw,20px);font-weight:700}
  .agrow .t span{display:block;font-weight:500;color:var(--muted);font-size:.72em;margin-top:2px}
  .agrow .mins{font-family:Consolas,monospace;font-size:clamp(12px,1.05vw,15px);color:var(--berry);font-weight:700;white-space:nowrap}
  .bigbtn{display:inline-flex;align-items:center;gap:14px;background:var(--cherry);color:#fff;text-decoration:none;font-weight:800;
    font-size:clamp(17px,1.8vw,26px);padding:2.2vh 2.6vw;border-radius:999px;box-shadow:0 18px 44px rgba(251,40,50,.4)}
  .ladder{display:flex;gap:1vw;align-items:stretch;margin-top:2.6vh}
  .rung{flex:1;border-radius:16px;padding:2vh 1.2vw;color:#fff;display:flex;flex-direction:column;gap:.6vh}
  .rung b{font-size:clamp(15px,1.4vw,20px)} .rung span{font-size:clamp(11px,1vw,14px);opacity:.9}
  .arrow{align-self:center;font-size:28px;color:#c9c1bb}
  .bars{display:flex;align-items:flex-end;gap:3vw;height:34vh;margin-top:3vh;padding:0 1vw;border-bottom:2px solid var(--line)}
  .bar{flex:1;border-radius:12px 12px 0 0;position:relative;display:flex;align-items:flex-start;justify-content:center;color:#fff;font-weight:800;padding-top:1vh;font-size:clamp(16px,1.6vw,24px)}
  .bar i{position:absolute;bottom:-4.4vh;left:0;right:0;text-align:center;color:var(--muted);font-style:normal;font-size:clamp(11px,1vw,14px);font-weight:700}
  .bigqr{width:min(34vh,330px);height:min(34vh,330px);border:2px solid var(--line);border-radius:20px;padding:14px;background:#fff;box-shadow:var(--shadow)}
  .bigqr svg{width:100%;height:100%}
  .count{font-size:clamp(60px,9vw,140px);font-weight:900;color:var(--cherry-deep);line-height:1;letter-spacing:-2px;transition:transform .2s}
  .count.bump{transform:scale(1.12)}
  .url{font-size:clamp(14px,1.4vw,20px);font-weight:700;color:var(--berry);margin-top:1.4vh;word-break:break-all}

  /* ---------- live poll slide (platform voting) ---------- */
  .slide.poll{background:radial-gradient(120% 120% at 10% 0%,#1b2a44 0%,#0B1220 60%);padding:3vh 3vw;color:#fff}
  .pollhead{display:flex;align-items:center;gap:1.6vw;margin-bottom:1.4vh}
  .pollhead .plabel{font-weight:800;letter-spacing:2.5px;font-size:clamp(12px,1.1vw,15px);color:#ff6a71;text-transform:uppercase}
  .pollhead .spacer{flex:1}
  .qrmini{display:flex;align-items:center;gap:10px;background:#fff;border-radius:12px;padding:6px 12px 6px 6px;color:var(--ink)}
  .qrmini .q{width:min(9vh,84px);height:min(9vh,84px)} .qrmini .q svg{width:100%;height:100%;display:block}
  .qrmini span{font-size:clamp(10px,.95vw,13px);font-weight:700;line-height:1.25}
  .pq{font-size:clamp(24px,2.9vw,44px);font-weight:800;line-height:1.15;max-width:1200px;margin:1vh 0 2.4vh}
  .pvoted{display:flex;align-items:baseline;gap:12px;color:#9fb3c8;font-weight:700;letter-spacing:1px;font-size:clamp(13px,1.2vw,17px)}
  .pvoted b{font-size:clamp(34px,3.6vw,58px);color:#fff;font-weight:900;letter-spacing:-1px;transition:transform .2s}
  .pvoted b.bump{transform:scale(1.15)}
  .popts{display:grid;gap:1.4vh;margin-top:2vh;max-width:1250px}
  .popt{position:relative;border-radius:16px;background:#16233a;border:2px solid #27405f;overflow:hidden;padding:2vh 1.6vw;display:flex;justify-content:space-between;align-items:center;font-size:clamp(16px,1.6vw,24px);font-weight:700}
  .popt .fill{position:absolute;inset:0;width:0;background:linear-gradient(90deg,#FB2832,#ff7a57);opacity:.55;transition:width .7s cubic-bezier(.2,.9,.3,1);z-index:0}
  .popt:nth-child(2) .fill{background:linear-gradient(90deg,#367895,#4fb0d8)}
  .popt:nth-child(3) .fill{background:linear-gradient(90deg,#E8920C,#ffc04d)}
  .popt:nth-child(4) .fill{background:linear-gradient(90deg,#5BA63C,#8fd16b)}
  .popt .lab,.popt .num{position:relative;z-index:1}
  .popt .num{font-variant-numeric:tabular-nums;color:#fff}
  .popt.correct{border-color:#8fd16b;box-shadow:0 0 0 4px rgba(143,209,107,.25)}
  .popt.correct .lab::after{content:"  ✓";color:#8fd16b}
  .pctrl{display:flex;gap:12px;margin-top:2.4vh;align-items:center;flex-wrap:wrap}
  .pbtn{background:#27405f;color:#fff;border:none;border-radius:999px;padding:1.3vh 2vw;font-weight:800;cursor:pointer;font-size:clamp(13px,1.1vw,16px)}
  .pbtn.primary{background:var(--cherry);box-shadow:0 12px 30px rgba(251,40,50,.4)}
  .pstate{font-weight:800;letter-spacing:2px;font-size:12px;text-transform:uppercase;padding:6px 12px;border-radius:999px;background:#3b2a55;color:#e4d4ff}
  .pstate.locked{background:#5a3b10;color:#ffd38a} .pstate.revealed{background:#1e4a2a;color:#bdeecb}
  .preveal{margin-top:2vh;max-width:1200px;background:#101c2e;border:1.5px solid #233650;border-radius:14px;padding:1.8vh 1.6vw;color:#dbe6f0;font-size:clamp(14px,1.35vw,20px);display:none}
  .pright{margin-top:1.2vh;color:#bdeecb;font-weight:700;font-size:clamp(13px,1.1vw,16px);display:none}
  .pnolive{color:#ffd38a;font-weight:700;font-size:13px;margin-left:8px}
  .rafflebox{margin-top:2vh;text-align:center;display:none}
  .rafflebig{font-size:clamp(40px,5vw,84px);font-weight:900;color:#F5C542;min-height:1.2em;letter-spacing:-1px}
  .rafflechips{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:1.4vh}
  .rafflechips span{background:#1e4a2a;border:1.5px solid #8fd16b;border-radius:999px;padding:.9vh 1.4vw;font-weight:800}
  .confetti{position:fixed;top:-14px;width:10px;height:16px;border-radius:2px;z-index:200;pointer-events:none;animation:fall 2.6s linear forwards}
  @keyframes fall{to{transform:translateY(106vh) rotate(760deg)}}
  #notes{position:fixed;left:0;right:0;bottom:0;background:rgba(20,15,12,.95);color:#ffe4e1;padding:16px 26px;font-size:15px;line-height:1.5;z-index:60;display:none;border-top:3px solid var(--cherry);max-height:40vh;overflow:auto}
  #notes b{color:#fff}
  @media print{body{overflow:visible;background:#fff}.slide{display:flex !important;position:relative;page-break-after:always;height:100vh}#progress,#counter,#hint,#notes,#livepill{display:none !important}@page{size:letter landscape;margin:0}}

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
  #pnbtn{position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:56;background:#1a202c;color:#fff;border:none;border-radius:999px;padding:8px 16px;font-weight:800;font-size:12px;letter-spacing:1px;cursor:pointer;opacity:.85}
  #pnbtn.hide{display:none}
`;
}
