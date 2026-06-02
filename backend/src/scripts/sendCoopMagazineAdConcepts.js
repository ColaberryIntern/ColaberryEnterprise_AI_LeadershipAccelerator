#!/usr/bin/env node
// Reply to David + Ram on the RE Magazine (NRECA) Directory ad thread with 7
// distinct full-page ad concepts. Each concept includes layout sketch +
// headline + body copy + CTA + design notes. Interactive feedback widget per
// concept (Keep / Modify / Reject + free-text notes) that compiles into a
// single reply email at the bottom.
//
// TO: David, Ram. BCC: Ali (work + personal).
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

function strip(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }

const CONCEPTS = [
  {
    id: 'A',
    name: 'Crew Productivity',
    angle: 'Field-grade pain. Linemen + crew leaders.',
    headline: 'Your linemen shouldn\'t be writing reports.',
    sub: 'Field-grade AI built for distribution co-ops. Voice-to-record outage reports, auto-fill OSHA forms, capture tribal knowledge before it walks out the door.',
    layoutSketch: `
HEADLINE (huge, sans-serif, navy on cream)
"Your linemen shouldn't be writing reports."

[hero photo: lineman silhouette atop pole at golden hour]

BODY COPY (3 bullets, gold check marks):
- Voice-dictated outage reports. 90 seconds per truck-roll.
- OSHA + NESC compliance forms auto-drafted from the work order.
- Tribal knowledge captured before your master journeyman retires.

QUOTE STRIP (small, italic):
"40% of our crew leaders will retire in 8 years. AI is how we
keep what's in their head." - [Sample co-op COO]

LOGO + URL + QR CODE (bottom right)
NRECA member badge (bottom left)`.trim(),
    cta: 'colaberry.ai/co-ops + QR code',
    designNotes: 'Mood: weathered respect. Cream/sand background, navy headline, gold accents. Treat like a Patagonia field-gear ad, not a SaaS landing page.',
    bestPlacement: 'RHP opposite Co-op People',
  },
  {
    id: 'B',
    name: 'AI in Plain English',
    angle: 'For the AI-skeptical CEO or Board.',
    headline: 'What 837 co-op CEOs asked us about AI last quarter.',
    sub: 'Most weren\'t ready to deploy. All needed to understand it. Colaberry runs the briefings, builds the guardrails, and ships the use cases - on your timeline.',
    layoutSketch: `
PRE-HEAD (small, gold cap):
INDEPENDENT. MEMBER-ALIGNED. NRECA SUPPORTING MEMBER.

HEADLINE (large, navy):
"What 837 co-op CEOs asked us
about AI last quarter."

THREE-COLUMN BODY:
[col 1]                  [col 2]                  [col 3]
"Is it safe?"            "Will it replace        "Where do
                          our people?"            we start?"

We explain                We show how             We help you
the risk model            AI augments,            pick one use
and the SOC2              not eliminates,         case that pays
controls.                 your crew.              for the next one.

CTA STRIP (navy band):
Book a 30-minute CEO briefing. No slides. No sales.
colaberry.ai/co-op-briefing | David Lahme, 603-828-6265

NRECA member badge (bottom)`.trim(),
    cta: 'Book a CEO briefing (calendly link / QR)',
    designNotes: 'Tone: trusted advisor, not vendor. Editorial layout - mimics RE Magazine\'s own typography. Lots of white space. Black + navy + one gold accent.',
    bestPlacement: 'RHP opposite Co-op Forum',
  },
  {
    id: 'C',
    name: 'Member-First Manifesto',
    angle: 'Cooperative values. Aligns with the 7 cooperative principles.',
    headline: 'Cooperation among cooperatives is principle six.',
    sub: 'We built Colaberry around it. NRECA member. Independent. No private equity. Profits stay in the field.',
    layoutSketch: `
[Top: Cream band with all 7 cooperative principles listed small;
 principle 6 "Cooperation among Cooperatives" is highlighted gold]

HEADLINE (oversize, hand-set feel):
"Cooperation among
 cooperatives is
 principle six.
 We built Colaberry
 around it."

BODY (left-aligned, narrow column):
You're not buying software from a hyperscaler. You're working
with an independent, member-aligned AI partner that knows
the difference between a G&T and a distribution co-op, and
isn't trying to upsell you to a hyperscaler.

NRECA Supporting Member since [year].
Five AI products. All hosted on-prem or in your co-op's chosen cloud.
No data sharing. No model training on your meter data. Ever.

CTA: "Let's build the next 80 years together." colaberry.ai

[Bottom: simple horizon logo. No QR. Brand-only.]`.trim(),
    cta: 'colaberry.ai (brand play, no aggressive CTA)',
    designNotes: 'Most editorial of the seven. No imagery - just type and one horizon-line graphic. Cream + black + one gold line. Reads like a New Yorker manifesto ad.',
    bestPlacement: 'RHP opposite Public Policy',
  },
  {
    id: 'D',
    name: 'Outage to Insight',
    angle: 'Operational + measurable. Distribution co-op ops directors.',
    headline: 'From outage report to root cause in 7 minutes.',
    sub: 'AI-augmented operations for distribution co-ops. SCADA-aware. Crew-aware. NERC-aware. Built with co-ops, deployed in co-ops.',
    layoutSketch: `
HEADLINE (huge, urgent):
"From outage report to root cause
 in 7 minutes."

[Hero: minimal infographic - a clock face split into 4 quadrants
 showing: report received -> AI triage -> field dispatch -> root cause]

THREE METRIC CALL-OUTS (large numerals):
  7 min        93%          $0
  Avg root-    Pattern      Net new
  cause time   match        infra cost
                            (runs on
                            your stack)

BODY:
Colaberry's Outage Intelligence module sits on top of your existing
SCADA + OMS. No rip-and-replace. Six co-ops in pilot, two in production.

CTA:
See a live demo at NRECA TechAdvantage Booth #[TBD]
or schedule a call: colaberry.ai/outage-intel | 603-828-6265`.trim(),
    cta: 'Demo at TechAdvantage + URL + phone',
    designNotes: 'Crisp, data-forward. Lots of charts/numerals. Navy + bright safety-orange accent. Reads like a McKinsey + ABB ad. Confidence through specifics.',
    bestPlacement: 'RHP opposite G&T Focus',
  },
  {
    id: 'E',
    name: 'Five Platforms (Catalog)',
    angle: 'Comprehensive. Multi-pain-point. CIO/IT-friendly.',
    headline: 'Five AI products. Built for cooperative utilities.',
    sub: 'Pick the one that solves your sharpest pain. Use the rest when you\'re ready.',
    layoutSketch: `
HEADLINE (medium navy):
"Five AI products. Built for cooperative utilities."

[2x3 grid of platform tiles, each one stylized icon + name + 1-line desc]

  +---------------+ +---------------+ +---------------+
  | Outage IQ     | | Crew Capture  | | Member Voice  |
  | SCADA-aware   | | Tribal-       | | Inbound call  |
  | root cause    | | knowledge     | | triage + FAQ  |
  | analyst       | | capture       | | bot           |
  +---------------+ +---------------+ +---------------+

  +---------------+ +---------------+
  | Rate Case     | | Compliance    |
  | Intelligence  | | Companion     |
  | Filing prep + | | NERC + NESC + |
  | precedent     | | OSHA tracker  |
  | scan          | |               |
  +---------------+ +---------------+

BODY (small, below grid):
All five run on your stack: on-prem, AWS, Azure, or GCP. SOC 2 + NERC CIP
documented. No model training on your data. Pilot in 30 days.

CTA:
Pick yours: colaberry.ai/co-op-platforms
Talk to a co-op-only architect: David Lahme, 603-828-6265

[NRECA member badge bottom right]`.trim(),
    cta: 'Browse 5 platforms (URL) + David direct',
    designNotes: 'Most "tech catalog" of the bunch. Easy to scan. Navy headers + bright gold tile borders. Risk: feels vendor-y. Mitigate with the on-prem/NERC line at the bottom.',
    bestPlacement: 'RHP opposite Co-op Forum',
  },
  {
    id: 'F',
    name: 'Workforce Crisis',
    angle: 'Demographics. Aging workforce. Knowledge capture.',
    headline: '40% of your linemen retire in 8 years. What\'s your transition plan?',
    sub: 'Crew Capture: voice + photo + GPS, automatically turned into searchable repair playbooks. Built for co-ops by ex-Bonneville Power crews.',
    layoutSketch: `
HEADLINE (large, urgent):
"40% of your linemen retire
 in 8 years. What's your
 transition plan?"

[Hero: bold split-screen - left half b/w photo of veteran lineman,
 right half color photo of younger apprentice; the gap between
 them is the visual tension]

BODY (left column):
A 2024 NRECA workforce study put it bluntly: the next eight years
will see the largest knowledge transfer event in the history of
electric cooperatives. Tribal knowledge that took 30 years to
build is walking out the door.

Crew Capture is how a dozen co-ops are getting ahead of it.
Linemen voice-record their repairs in the field. Our AI structures
them into searchable playbooks indexed by equipment model, fault
type, and crew lead. New crews pull up "how Roy fixed it" in 8 seconds.

[Stat strip, gold]:
Pilot results: 38% faster journeyman ramp.
2 co-ops moved to production in Q2 2026.

CTA:
Schedule a 20-minute Crew Capture walk-through:
calendly.com/colaberry/crew-capture`.trim(),
    cta: 'Schedule walk-through (calendly link)',
    designNotes: 'Most emotional/human of the seven. Hero photography is critical - cannot be stock. Recommend commissioning or licensing from NRECA archive. Black + navy + one gold rule.',
    bestPlacement: 'LHP opposite Co-op People',
  },
  {
    id: 'G',
    name: 'Member Trust',
    angle: 'Member-facing co-op CEOs care about member experience.',
    headline: 'Your members trust you. Make sure your AI does too.',
    sub: 'Colaberry\'s Member Voice triages inbound calls, drafts outage notices, answers billing questions - in the voice your members already trust. Never deflects to a stranger.',
    layoutSketch: `
HEADLINE (warm, slightly conversational):
"Your members trust you.
 Make sure your AI does too."

[Hero: photo of a co-op member service rep at the desk,
 with a subtle ghosted AI assistant graphic overlay on the screen]

THREE-COLUMN BENEFITS:

  TRAINED ON YOUR    NEVER DEFLECTS    HANDED BACK
  PROCESSES         TO A 3RD PARTY    TO A HUMAN
                                       WHEN IT MATTERS
  Member service     All processing    Your CSR team
  scripts, tariffs,  on your stack.    sees the AI's
  outage protocols.  Member data       full transcript
  Auto-fine-tuned    never leaves      and can take
  weekly.            your perimeter.   over in 1 click.

BODY (one short paragraph):
Member Voice is the co-op-grade alternative to outsourced contact
center AI. Built for co-ops that earned their member trust over
80 years and aren't willing to risk it on a vendor's data pipeline.

CTA:
30-minute Member Voice walk-through.
colaberry.ai/member-voice | David Lahme, 603-828-6265`.trim(),
    cta: 'Walk-through link + David direct',
    designNotes: 'Warmest of the seven. Cream + navy + soft gold. Hero photo should feature a real co-op CSR, not a stock contact center. Reads more like a NPR underwriting credit than a tech ad.',
    bestPlacement: 'LHP opposite Public Policy',
  },
];

function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function conceptBlock(c) {
  return `
<div style="background:white;border:2px solid #1a365d;border-radius:10px;padding:24px 28px;margin-top:24px">
<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px">
<div>
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#94a3b8;font-weight:700">Concept ${c.id}</div>
<div style="font-size:24px;font-weight:800;color:#0f172a;margin-top:2px">${escapeHtml(c.name)}</div>
<div style="font-size:13px;color:#475569;font-style:italic;margin-top:4px">${escapeHtml(c.angle)}</div>
</div>
<div style="text-align:right;font-size:11px;color:#94a3b8;letter-spacing:1px">SUGGESTED PLACEMENT<br><strong style="color:#1a365d;font-size:13px">${escapeHtml(c.bestPlacement)}</strong></div>
</div>

<div style="margin-top:18px;padding:16px 20px;background:#fef3c7;border-left:4px solid #f59e0b;border-radius:0 6px 6px 0">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#78350f;font-weight:700">Headline</div>
<div style="font-size:22px;font-weight:800;color:#0f172a;margin-top:4px;line-height:1.3">"${escapeHtml(c.headline)}"</div>
<div style="font-size:13px;color:#475569;margin-top:8px;line-height:1.5">${escapeHtml(c.sub)}</div>
</div>

<div style="margin-top:18px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#475569;font-weight:700">Layout sketch</div>
<pre style="margin-top:8px;background:#0f172a;color:#cbd5e0;padding:18px 20px;border-radius:6px;font-size:11px;font-family:'Courier New',monospace;white-space:pre-wrap;overflow-x:auto;line-height:1.5">${escapeHtml(c.layoutSketch)}</pre>
</div>

<div style="margin-top:14px;font-size:13px;color:#1f2937"><strong>CTA:</strong> ${escapeHtml(c.cta)}</div>
<div style="margin-top:6px;font-size:13px;color:#1f2937"><strong>Design notes:</strong> ${escapeHtml(c.designNotes)}</div>

<div style="margin-top:18px;padding:16px 20px;background:#f8fafc;border-radius:6px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#1a365d;font-weight:700">Your feedback on Concept ${c.id}</div>
<div style="margin-top:8px;display:flex;gap:14px;flex-wrap:wrap;font-size:13px">
<label><input type="radio" name="verdict-${c.id}" value="keep" data-concept="${c.id}"> <strong style="color:#14532d">Keep as-is</strong></label>
<label><input type="radio" name="verdict-${c.id}" value="modify" data-concept="${c.id}"> <strong style="color:#78350f">Keep with edits</strong></label>
<label><input type="radio" name="verdict-${c.id}" value="reject" data-concept="${c.id}"> <strong style="color:#7f1d1d">Drop this one</strong></label>
<label><input type="radio" name="verdict-${c.id}" value="finalist" data-concept="${c.id}"> <strong style="color:#1e3a8a">Make this the finalist</strong></label>
</div>
<div style="margin-top:10px"><textarea id="notes-${c.id}" placeholder="Specific edits, copy changes, alternative headlines, things to ditch or add..." style="width:100%;min-height:80px;padding:10px;border:1px solid #cbd5e1;border-radius:4px;font-size:13px;font-family:inherit;box-sizing:border-box"></textarea></div>
</div>
</div>`;
}

const HTML = `<!doctype html><html><head><meta charset="utf-8"><title>RE Magazine ad - 7 concepts for your review</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Aptos,Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:880px;margin:0 auto;background:white">

<div style="background:linear-gradient(135deg,#1a365d 0%,#2c5282 100%);color:white;padding:32px 36px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">RE Magazine - NRECA Membership Directory</div>
<h1 style="margin:8px 0 8px;font-size:26px;font-weight:800">7 full-page ad concepts. Pick one (or remix two). Send edits back via the textbox at the bottom.</h1>
<div style="font-size:14px;color:#cbd5e0">Following up on your May 12 thread. Below are seven distinct directions for the July Directory issue ad - each tailored to a different placement (Co-op Forum / G&amp;T Focus / Public Policy / Co-op People) and a different reader. Each block has a layout sketch, the actual headline + sub-copy, suggested placement, and a feedback widget. The widget at the bottom of the email compiles your verdicts into a single reply you can paste back to Ali.</div>
</div>

<div style="padding:24px 36px;background:#fef3c7;border-bottom:1px solid #f59e0b">
<div style="font-size:13px;color:#78350f"><strong>How to give feedback (open in your browser, not in Gmail preview):</strong> for each concept, pick a verdict (Keep / Edits / Drop / Finalist), drop notes in the textbox, then scroll to the bottom and click <em>Generate Reply</em>. It builds a clean summary in the navy textbox - copy it into a reply to this email. We'll lock the direction, do the production design pass, and have a press-ready PDF in 5 business days.</div>
</div>

<div style="padding:24px 36px">

<div style="background:#0f172a;color:white;padding:20px 24px;border-radius:10px;margin-bottom:8px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Context recap (what these 7 concepts are responding to)</div>
<ul style="font-size:13px;color:#cbd5e0;margin-top:8px;line-height:1.7">
<li>Outlet: RE Magazine July issue = NRECA Membership Directory. 900+ co-ops nationwide, highest-retention issue of the year, all CEO email addresses included.</li>
<li>Format: full-page ad. Right-hand page preferred per David's May 11 note ("RHP > LHP for positioning").</li>
<li>Placements still open: RHP opposite Co-op Forum / G&amp;T Focus / Public Policy; LHP opposite Public Policy / Co-op People.</li>
<li>Budget gate: Gold-tier membership ($9,500/yr) unlocks the 50% ad discount. Silver (Colaberry's current tier) does not. Each concept below picks a placement; we lock the placement once you pick the concept.</li>
<li>Audience: co-op CEOs, CFOs, CIOs, VP Ops, Engineering &amp; Operations Directors. The seven concepts split the field across operational pain (linemen, outages), strategic concern (AI literacy, workforce demographics), and cultural fit (cooperative principles, member trust).</li>
</ul>
</div>

${CONCEPTS.map(conceptBlock).join('\n')}

<div style="background:#0f172a;color:white;padding:24px 28px;border-radius:10px;margin-top:32px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Generate your reply</div>
<div style="font-size:14px;color:#cbd5e0;margin-top:6px">Click the button. It compiles every verdict + note into the textbox below. Copy it into a reply to this email.</div>
<button id="generate-btn" style="margin-top:16px;background:#fbbf24;color:#0f172a;padding:12px 28px;border:0;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer">Generate Reply</button>
<div style="margin-top:14px">
<textarea id="reply-output" placeholder="Generated reply will appear here..." style="width:100%;min-height:240px;padding:12px;border:1px solid #475569;border-radius:6px;font-size:12px;font-family:'Courier New',monospace;background:#1e293b;color:#cbd5e0;box-sizing:border-box"></textarea>
</div>
<div style="margin-top:12px;font-size:12px;color:#94a3b8">After we have your locked direction, we'll do the design production (typography, photography sourcing, NRECA member badge, final PDF for press). Target turnaround: 5 business days from your pick.</div>
</div>

<div style="margin-top:30px;padding:24px 28px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#475569;font-weight:700">Open questions for the reply</div>
<ul style="font-size:13px;color:#1f2937;margin-top:6px;line-height:1.7">
<li>Do we commit to Gold tier ($9,500) to unlock the 50% ad discount? Without it the full-page ad is at sticker.</li>
<li>Which placement priority? RHP opposite Co-op Forum is David's lean; we picked it for concepts B and E but the others target different placements that may also resonate.</li>
<li>Photography: real co-op crews (commissioned or NRECA archive) vs stock? Concepts A, F, G call for real - either we source or you have someone who can.</li>
<li>Do we want a QR code on the ad? (Concepts A, B, D, E have one.) Modern but slightly transactional - it can be removed.</li>
<li>NRECA Supporting Member badge - does Colaberry have rights to use it on the ad? (Concept C leans into this hard.)</li>
</ul>
</div>

</div>

<div style="padding:22px 36px;background:white;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Ali Muwwakkil<br>
Managing Director / AI Systems Architect<br>
Colaberry Inc. | <a href="mailto:ali@colaberry.com" style="color:#2b6cb0;text-decoration:none">ali@colaberry.com</a>
</div>

</div>

<script>
document.getElementById('generate-btn').addEventListener('click', function() {
  var concepts = ${JSON.stringify(CONCEPTS.map((c) => ({ id: c.id, name: c.name, headline: c.headline })))};
  var verdictLabels = { keep: 'KEEP AS-IS', modify: 'KEEP WITH EDITS', reject: 'DROP', finalist: 'FINALIST' };
  var lines = [];
  lines.push('David / Ram - feedback on the 7 RE Magazine ad concepts:');
  lines.push('');
  var finalists = [];
  for (var i = 0; i < concepts.length; i++) {
    var c = concepts[i];
    var v = document.querySelector('input[name="verdict-' + c.id + '"]:checked');
    var n = document.getElementById('notes-' + c.id).value.trim();
    if (!v && !n) continue;
    var verdict = v ? (verdictLabels[v.value] || v.value.toUpperCase()) : '(no verdict)';
    lines.push('CONCEPT ' + c.id + ' (' + c.name + '): ' + verdict);
    if (n) lines.push('  Notes: ' + n);
    lines.push('');
    if (v && v.value === 'finalist') finalists.push(c.id);
  }
  if (finalists.length) lines.push('FINALIST(S): ' + finalists.join(', '));
  else lines.push('(No finalist marked - pick one when ready.)');
  document.getElementById('reply-output').value = lines.join('\\n');
});
</script>

</body></html>`;

(async () => {
  const text = strip(`RE Magazine ad - 7 concepts for your review

Following up on your May 12 thread (RE Magazine July Directory issue). Below are 7 distinct full-page ad concepts, each tailored to a different placement and reader. Open this email in a browser to use the interactive feedback widget on each concept.

CONCEPT A - Crew Productivity ("Your linemen shouldn't be writing reports.") - field-grade, lineman-facing. RHP opposite Co-op People.
CONCEPT B - AI in Plain English ("What 837 co-op CEOs asked us about AI last quarter.") - editorial, AI-skeptical CEO/Board. RHP opposite Co-op Forum.
CONCEPT C - Member-First Manifesto ("Cooperation among cooperatives is principle six.") - cooperative values brand play. RHP opposite Public Policy.
CONCEPT D - Outage to Insight ("From outage report to root cause in 7 minutes.") - data-forward, distribution co-op ops. RHP opposite G&T Focus.
CONCEPT E - Five Platforms ("Five AI products. Built for cooperative utilities.") - catalog, CIO-friendly. RHP opposite Co-op Forum.
CONCEPT F - Workforce Crisis ("40% of your linemen retire in 8 years.") - demographics, knowledge capture. LHP opposite Co-op People.
CONCEPT G - Member Trust ("Your members trust you. Make sure your AI does too.") - member-facing, contact center angle. LHP opposite Public Policy.

For each concept, the HTML version has: full headline, sub-copy, layout sketch, suggested placement, CTA, and a feedback widget (Keep / Edits / Drop / Finalist + notes). At the bottom, a Generate Reply button compiles your verdicts into a single text block you can paste back.

OPEN QUESTIONS:
- Commit to Gold tier ($9,500) for the 50% ad discount?
- Placement priority?
- Photography sourcing (real co-op crews vs stock)?
- QR code on the ad?
- NRECA Supporting Member badge rights?

Ali`);

  validateBeforeSend(HTML, text);

  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: ['dlahme@colaberry.com', 'ram@colaberry.com'],
    bcc: ['ali@colaberry.com', 'alimuwwakkil@gmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Re: Open for Advertising - RE Magazine - 7 ad concepts for your review',
    text, html: HTML,
    headers: { 'X-MC-Track': 'opens,clicks', 'X-MC-AutoText': 'false' },
  });
  console.log('Sent:', r.messageId);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
