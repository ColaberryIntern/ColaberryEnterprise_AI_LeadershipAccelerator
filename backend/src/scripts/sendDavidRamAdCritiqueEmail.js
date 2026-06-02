#!/usr/bin/env node
// Reply to David (CC Ram, BCC Ali) on the RE Magazine ad thread with the 5
// half-page horizontal mockup designs, embedded as inline images (CID), with
// designer's notes and pressure-test prompts under each. Frame as creative
// juices flowing — these are not final, critique-mode on.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

function strip(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }

const REPO = path.resolve(__dirname, '../../..');
const PDF_PATH = path.join(REPO, 'docs/coop-ad-mockups-2026-06-02.pdf');

const MOCKUPS = [
  {
    n: 1, cid: 'mockup1', file: path.join(REPO, 'tmp/mockup-thumb-1.png'),
    name: 'Crew Productivity',
    headline: '"Your linemen shouldn\'t be writing reports."',
    placement: 'RHP opp. Co-op People (or Co-op Forum)',
    intent: 'Speak to the heart of co-op operations - lineman dignity, no tech-speak. Position Colaberry as someone who respects the field, not someone selling a SaaS dashboard.',
    working: 'The silhouette photo is iconic - it reads as respectful, not selling. The headline reframes "AI" as labor-saving (which is what the lineman cares about) instead of labor-replacing.',
    pressureTest: [
      'Diagonal red "TRUSTED CO-OP PARTNER" stamp - is it the right tone, or too retail / too "Avis"? Could become a small horizontal red rule under the headline instead.',
      'The bullet "OSHA + NESC forms auto-drafted" is the most concrete promise - is that too specific (sets expectations) or exactly right (proves we know the work)?',
      'NRECA Supporting Member badge - confirm we have rights to display this. If not, the badge slot becomes a tagline.',
    ],
    questionForDavid: 'Who actually reads RE Magazine - the lineman, the COO, or the CEO? If it\'s the executive, this ad puts the lineman in front of them, which lands emotionally but doesn\'t pitch the buyer directly. Worth pivoting if the audience is C-suite, not field.',
  },
  {
    n: 2, cid: 'mockup2', file: path.join(REPO, 'tmp/mockup-thumb-2.png'),
    name: 'AI in Plain English',
    headline: '"What 837 co-op CEOs asked us about AI last quarter."',
    placement: 'RHP opp. Co-op Forum',
    intent: 'Hook the AI-skeptical CEO or Board. Position Colaberry as a trusted advisor who briefs you - not a vendor who sells to you. Editorial layout signals "this is information," not "this is an ad."',
    working: 'Three italic-red CEO question quotes are the punch. They put the reader\'s objection in the ad before we answer it. Red CTA button is the only sharp action - rest is editorial.',
    pressureTest: [
      '"837 CEOs last quarter" - this number is fabricated. Either we have a real defensible figure (and we cite it), or it has to come down to a directional phrase ("hundreds" / "what we hear from co-op CEOs"). I would not run this with the false specific.',
      'Editorial quiet vs the competitor ads around it - most co-op-magazine ads are loud (graphics, bright colors). This one whispers. Is that contrarian-strong or invisible?',
      'CTA "Book a 30-min Briefing" - is the briefing format we can actually deliver? If so we should preview what they\'ll get on the landing page.',
    ],
    questionForDavid: 'Of the 7 leaders you\'re targeting at Coca-Cola / NRECA-level, how many would respond to "let us explain AI to your Board" vs "let us show you a result"? This is the explainer play. M3 is the result play.',
  },
  {
    n: 3, cid: 'mockup3', file: path.join(REPO, 'tmp/mockup-thumb-3.png'),
    name: '7 Minutes (Outage to Insight)',
    headline: '"From outage report to root cause - before the truck rolls."',
    placement: 'RHP opp. G&T Focus',
    intent: 'Lead with one hard metric. McKinsey + ABB confidence. The single oversized red "7" is the eye-magnet in a sea of white ads.',
    working: 'Charcoal background is the contrarian move - 95% of utility-magazine ads will be white. This ad will get noticed before anyone reads it. The metric strip (93% / $0 / 30-day) gives the reader three concrete handles in the second glance.',
    pressureTest: [
      '"7 minutes average across 6 co-op pilots" - this needs to be a real number from a real pilot. If it is aspirational, the line has to change to "what is possible" framing or we will get caught on it.',
      'Dark background uses more ink budget at press - confirm with RE Magazine if half-page solid black incurs a surcharge.',
      'No human in the ad. Mockup 3 is data + grid + steel. Strong for an IT director, possibly too cold for a board reader.',
    ],
    questionForDavid: 'Is the right buyer for this ad the Director of Operations / CIO (who lives in this metric), or the CEO (who probably does not know what "root cause analysis" means)? If it is the CEO, we should add a human translation line.',
  },
  {
    n: 4, cid: 'mockup4', file: path.join(REPO, 'tmp/mockup-thumb-4.png'),
    name: 'Five Platforms (catalog)',
    headline: '"Pick the one that solves your sharpest pain."',
    placement: 'RHP opp. Co-op Forum',
    intent: 'Tech catalog. Five tiles, each with a photo + name + one-line desc, so a busy reader can grab a single wedge that matches their pain. Reads like the catalog page at the back of a B2B magazine - intentional.',
    working: 'Five tile photos give each product distinct identity. Top red bar is the eye-catch from across a desk. The footer line "runs on your stack / SOC 2 + NERC CIP / no model training" preempts the security objection.',
    pressureTest: [
      '5 tiles at half-page = each tile is roughly 120px wide. The headlines work but the 9pt descs may break at press. If they do, drop to 4 tiles or kill the descs.',
      'The product names (Outage IQ / Crew Capture / Member Voice / Rate Case IQ / Compliance Companion) are co-op-specific framing - they are NOT our real platform routes (/ai-architect, /ai-workforce-designer, /advisory). Two options - either we keep these as positioning (good for the ad, bad for the website hand-off) or we swap to the real names.',
      'The catalog approach dilutes focus. A single-product hero ad (like M3) is sharper if there is one wedge we KNOW most co-ops will react to.',
    ],
    questionForDavid: 'Of the 5 tiles, which one does your Coca-Cola conversation tell you co-ops actually feel? If one is a clear winner, killing this catalog and going single-hero on that pain is probably stronger.',
  },
  {
    n: 5, cid: 'mockup5', file: path.join(REPO, 'tmp/mockup-thumb-5.png'),
    name: '40% Workforce Crisis',
    headline: '"40% of your linemen retire in 8 years. What\'s your transition plan?"',
    placement: 'LHP opp. Co-op People',
    intent: 'Emotional + data hook. The aging-workforce problem is the one anxiety every co-op CEO is privately tracking. The split veteran/apprentice photos with the red "8 YEARS" gap label tells the story before anyone reads the copy.',
    working: 'Split photo composition does the heavy lifting visually. The red "40%" hits the reader before the headline. Crew Capture as a product anchor is concrete - we are offering a thing, not a workshop.',
    pressureTest: [
      '"40% retire in 8 years" - this needs a citation. NRECA workforce study (if real) is the credible source. Without it the number reads as scary marketing.',
      'Photography risk: these are stock placeholders. For real production we need either commissioned co-op shots OR NRECA archive licenses. If neither, this concept does not work and we should swap to a typography-only direction.',
      'The "8 YEARS" red label is doing a lot of work as both a design element and a piece of data. If David thinks "8 years" is wrong, the whole ad has to be redesigned.',
    ],
    questionForDavid: 'Of all five ads, this one is the bet on YOUR specific conversation - is workforce demographics the actual top-of-mind pain for the CEOs you talk to, or is it second-tier behind something operational (outage, member experience)?',
  },
];

function mockupBlock(m) {
  return `
<div style="margin-top:30px;border:2px solid #1a365d;border-radius:10px;overflow:hidden;background:white">
<div style="background:#1a365d;color:white;padding:14px 20px;display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px">
<div>
<div style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Mockup ${m.n}</div>
<div style="font-size:20px;font-weight:800;margin-top:2px">${m.name}</div>
</div>
<div style="font-size:11px;letter-spacing:1px;color:#cbd5e0;text-align:right">${m.placement}</div>
</div>

<div style="padding:14px 16px 0;text-align:center;background:#e2e8f0">
<img src="cid:${m.cid}" alt="Mockup ${m.n}" style="max-width:100%;height:auto;display:block;margin:0 auto;box-shadow:0 4px 14px rgba(0,0,0,0.15)">
</div>

<div style="padding:0 16px 16px;background:#e2e8f0">
<div style="text-align:center;font-size:14px;color:#1a365d;font-style:italic;padding:10px 0">${m.headline}</div>
</div>

<div style="padding:20px 24px;background:white">

<div style="margin-bottom:14px">
<div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#0c4a6e;font-weight:700;margin-bottom:4px">Designer's intent</div>
<div style="font-size:13px;color:#1f2937">${m.intent}</div>
</div>

<div style="margin-bottom:14px;padding:12px 14px;background:#dcfce7;border-left:4px solid #14532d;border-radius:0 6px 6px 0">
<div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#14532d;font-weight:700;margin-bottom:4px">What I think is working</div>
<div style="font-size:13px;color:#14532d">${m.working}</div>
</div>

<div style="margin-bottom:14px;padding:12px 14px;background:#fef2f2;border-left:4px solid #c1272d;border-radius:0 6px 6px 0">
<div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#7f1d1d;font-weight:700;margin-bottom:6px">Pressure-test this (red pen on)</div>
<ul style="font-size:13px;color:#7f1d1d;margin:0;padding-left:18px">
${m.pressureTest.map((p) => `<li style="margin-bottom:4px">${p}</li>`).join('')}
</ul>
</div>

<div style="padding:12px 14px;background:#fef9e7;border-left:4px solid #d4a017;border-radius:0 6px 6px 0">
<div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#78350f;font-weight:700;margin-bottom:4px">David - one question for you</div>
<div style="font-size:13px;color:#78350f">${m.questionForDavid}</div>
</div>

</div>
</div>`;
}

const HTML = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Aptos,Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:820px;margin:0 auto;background:white">

<div style="background:linear-gradient(135deg,#0f172a 0%,#1a365d 100%);color:white;padding:32px 36px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">RE Magazine ad - 5 directions, critique mode on</div>
<h1 style="margin:8px 0 6px;font-size:24px;font-weight:800">David, Ram - these are creative-juice-flowing concepts, not finals. Tear them apart.</h1>
<div style="font-size:14px;color:#cbd5e0">Per your Tuesday note David: half page, 4-color, horizontal, red for the punch, copy due Thursday EOD. Below are 5 distinct visual directions at the actual half-page-horizontal aspect (1.54:1). Real typography, real colors, real photography (stock placeholders flagged below). Pick one, remix two, or tell me they are all wrong - any of those is a win.</div>
</div>

<div style="background:#fef2f2;border-left:5px solid #c1272d;padding:18px 24px;margin:0;font-size:14px;color:#1f2937">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7f1d1d;font-weight:700;margin-bottom:6px">How to critique these</div>
<div>I have put my honest take under each mockup in three blocks:</div>
<ul style="margin:8px 0 6px;padding-left:22px;line-height:1.7">
<li><strong style="color:#14532d">Working</strong> - what I think the ad does well</li>
<li><strong style="color:#7f1d1d">Pressure-test</strong> - what I am unsure about / what could break at press / what could read wrong to a co-op CEO</li>
<li><strong style="color:#78350f">One question for you</strong> - what only you can answer from your conversations</li>
</ul>
<div style="margin-top:8px"><strong>What I need back from you (reply-all to this email is fine, bullets are fine):</strong></div>
<ol style="margin:6px 0 0;padding-left:22px;line-height:1.7">
<li>Which one is the finalist (or which two we should remix).</li>
<li>The headline lands / does not land - in your gut, before reading anything else.</li>
<li>The pressure-test items I called out - say "ignore that" or "yes change it" line-by-line.</li>
<li>Any stat (837 CEOs / 7 minutes / 40% retire / 93% match) you want kept, killed, or sourced.</li>
<li>Photography path - commissioned shoot at a local co-op, NRECA archive license, or keep stock placeholders. Drives the production timeline.</li>
</ol>
<div style="margin-top:10px;font-size:12px;color:#7f1d1d"><strong>The PDF attached is the full-fidelity visual</strong> (open in Preview or Acrobat for the polish). The interactive HTML attached has per-mockup feedback widgets if you want to use those instead of reply-bullets.</div>
</div>

<div style="padding:24px 36px;background:#f8fafc">

${MOCKUPS.map(mockupBlock).join('\n')}

</div>

<div style="padding:24px 36px;background:#0f172a;color:white">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Once you give me the call</div>
<ul style="font-size:13px;color:#cbd5e0;margin-top:8px;line-height:1.7">
<li>I do the production design pass (typography polish, real photo licensing, NRECA badge if approved, press-ready CMYK PDF).</li>
<li>I send back the final PDF for one quick approval round.</li>
<li>You upload to RE Magazine by Thursday EOD.</li>
</ul>
<div style="margin-top:14px;font-size:13px;color:#cbd5e0">Open questions still unanswered from the prior round - Gold-tier commitment ($9,500/yr for the 50% ad discount), NRECA Supporting Member badge usage rights, QR code yes/no, real stat sources for any number above. All answerable by Wednesday morning if you have a minute.</div>
</div>

<div style="padding:22px 36px;background:white;font-size:14px;color:#1f2937">
Reading anything off in the gut? Just say so. The rest is execution.<br><br>
Ali
</div>

</div></body></html>`;

const text = strip(`David, Ram - 5 RE Magazine half-page horizontal ad directions for your red-pen critique.

These are creative-juice-flowing concepts, not finals. The PDF attached has the full visual. Reply with bullets, or open the attached HTML for the interactive feedback widget.

How to critique:
- I have put my honest designer's take under each mockup: "Working" (what the ad does well), "Pressure-test" (what I am unsure about or what could break at press), "One question for you" (what only you can answer).
- What I need back: (1) which is the finalist (or which two to remix), (2) does the headline land in your gut, (3) line-by-line on the pressure-test items, (4) any stat (837 CEOs / 7 min / 40% / 93%) kept, killed, or sourced, (5) photography path - commissioned / NRECA archive / keep stock.

The 5 directions:
1. Crew Productivity - "Your linemen shouldn't be writing reports." Lineman silhouette + diagonal red stamp. RHP opp Co-op People.
2. AI in Plain English - "What 837 co-op CEOs asked us about AI last quarter." Editorial + italic-red CEO quotes + red CTA. RHP opp Co-op Forum.
3. 7 Minutes - "From outage report to root cause - before the truck rolls." Charcoal + oversized red "7" + transmission tower photo. RHP opp G&T Focus.
4. Five Platforms catalog - 5 tiles, each with photo + product name. Red top bar. RHP opp Co-op Forum.
5. 40% Workforce Crisis - "40% of your linemen retire in 8 years." Split veteran/apprentice photos + red 8-YEARS gap label + giant red 40%. LHP opp Co-op People.

Open questions still standing - Gold-tier commitment ($9,500/yr for the 50% ad discount), NRECA Supporting Member badge rights, QR code yes/no, real stat sources.

Once you call it: production pass + final PDF approval + you upload by Thursday EOD.

Ali`);

(async () => {
  validateBeforeSend(HTML, text);
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const attachments = [
    ...MOCKUPS.map((m) => ({ filename: `mockup-${m.n}.png`, content: fs.readFileSync(m.file), cid: m.cid })),
    { filename: 'coop-ad-mockups-2026-06-02.pdf', content: fs.readFileSync(PDF_PATH), contentType: 'application/pdf' },
    { filename: 'coop-ad-mockups-2026-06-02.html', content: fs.readFileSync(path.join(REPO, 'docs/coop-ad-mockups-2026-06-02.html')), contentType: 'text/html' },
  ];
  const r = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'dlahme@colaberry.com',
    cc: ['ram@colaberry.com'],
    bcc: ['ali@colaberry.com', 'alimuwwakkil@gmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Re: Open for Advertising - RE Magazine - 7 ad concepts for your review',
    text, html: HTML, attachments,
    headers: { 'X-MC-Track': 'opens,clicks', 'X-MC-AutoText': 'false' },
  });
  console.log('Sent:', r.messageId);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
