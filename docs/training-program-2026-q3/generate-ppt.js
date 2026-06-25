#!/usr/bin/env node
// Generates docs/training-program-2026-q3/TRAINING_OVERVIEW.pptx
// 10-slide team-presentation deck for the AI Systems Architect Accelerator.
// Brand: Colaberry navy + warm gold. No emojis. Slide count exactly 10.

const path = require('path');
const PPTXGenJS = require(path.resolve(__dirname, '../../node_modules/pptxgenjs'));

const NAVY = '1A365D';
const NAVY_DARK = '0C0A09';
const NAVY_LIGHT = '2B6CB0';
const GOLD = 'D97706';
const WARM = 'FBBF24';
const SLATE_50 = 'F8FAFC';
const SLATE_300 = 'CBD5E0';
const SLATE_600 = '475569';
const SLATE_700 = '334155';
const WHITE = 'FFFFFF';
const RED = 'DC2626';
const GREEN_DARK = '166534';

const pres = new PPTXGenJS();
pres.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5
pres.title = 'AI Systems Architect Accelerator';
pres.author = 'Colaberry / CB System';

function addBrandHeader(slide, kicker, title, subtitle) {
  slide.background = { color: WHITE };
  // Navy stripe across top
  slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 1.3, fill: { color: NAVY } });
  slide.addText(kicker, { x: 0.5, y: 0.25, w: 12, h: 0.3, fontSize: 11, fontFace: 'Calibri', color: WARM, bold: true, charSpacing: 4 });
  slide.addText(title, { x: 0.5, y: 0.55, w: 12, h: 0.65, fontSize: 28, fontFace: 'Calibri', color: WHITE, bold: true });
  if (subtitle) slide.addText(subtitle, { x: 0.5, y: 1.45, w: 12, h: 0.35, fontSize: 14, fontFace: 'Calibri', color: SLATE_600 });
}

// SLIDE 1 - Cover
const s1 = pres.addSlide();
s1.background = { color: NAVY };
s1.addShape(pres.ShapeType.rect, { x: 0, y: 3.0, w: 13.33, h: 0.04, fill: { color: WARM } });
s1.addText('Colaberry / Anthropic Partner Network', { x: 0.6, y: 0.5, w: 12, h: 0.4, fontSize: 12, color: WARM, bold: true, charSpacing: 4 });
s1.addText('AI Systems Architect Accelerator', { x: 0.6, y: 1.0, w: 12, h: 1.5, fontSize: 48, color: WHITE, bold: true });
s1.addText('Bring your idea. We help you turn it into a real AI system.', { x: 0.6, y: 3.3, w: 12, h: 0.6, fontSize: 22, color: SLATE_300, italic: true });
s1.addText('12-week project-driven residency built on enterprise.colaberry.com', { x: 0.6, y: 4.1, w: 12, h: 0.5, fontSize: 18, color: WHITE });
s1.addText('Target launch: Cohort 1 classes start Mon 2026-07-27 (orientation Thu 2026-07-23)', { x: 0.6, y: 4.7, w: 12, h: 0.4, fontSize: 14, color: WARM });
s1.addText('Team kickoff deck v1  -  for review and discussion', { x: 0.6, y: 6.8, w: 12, h: 0.4, fontSize: 11, color: SLATE_300, italic: true });

// SLIDE 2 - Why now
const s2 = pres.addSlide();
addBrandHeader(s2, 'SECTION 1', 'Why now', 'The moment is here. Three forces converge.');
s2.addText([
  { text: '1.  Anthropic Partner Network is live.\n', options: { fontSize: 20, color: NAVY, bold: true } },
  { text: 'The Claude Certified Architect cert exists, the Skilljar courses ship, and our cohort gets free access. The upstream knowledge layer is solved. We build the application layer.\n\n', options: { fontSize: 14, color: SLATE_700 } },
  { text: '2.  The market is hungry for "AI Systems Architect."\n', options: { fontSize: 20, color: NAVY, bold: true } },
  { text: 'Career changers, enterprise employees, consultants, and indie founders all want a credible path. Bootcamps too expensive. Coursera not credible enough. We slot in the middle.\n\n', options: { fontSize: 14, color: SLATE_700 } },
  { text: '3.  We have the platform.\n', options: { fontSize: 20, color: NAVY, bold: true } },
  { text: 'enterprise.colaberry.com already runs. The @CB nudge engine, the agent registry, the dispatcher, the CCPP integration - we built the foundation for the last 5 weeks. The accelerator IS the platform.', options: { fontSize: 14, color: SLATE_700 } },
], { x: 0.6, y: 1.9, w: 12, h: 5.2, valign: 'top' });

// SLIDE 3 - Who the student is
const s3 = pres.addSlide();
addBrandHeader(s3, 'SECTION 2', 'Who the student is', 'Four personas. One launch wedge.');
const personaRows = [
  [
    { text: 'Persona', options: { bold: true, color: WHITE, fill: NAVY, fontSize: 12 } },
    { text: 'What they buy', options: { bold: true, color: WHITE, fill: NAVY, fontSize: 12 } },
    { text: 'Why they pay $1,497', options: { bold: true, color: WHITE, fill: NAVY, fontSize: 12 } },
  ],
  [
    { text: 'Career changer\n(LAUNCH WEDGE)', options: { fontSize: 11, bold: true, color: NAVY } },
    { text: 'Portfolio + cert + community to break in', options: { fontSize: 11, color: SLATE_700 } },
    { text: 'Cheaper than a bootcamp, more credible than Coursera', options: { fontSize: 11, color: SLATE_700 } },
  ],
  [
    { text: 'Future consultant', options: { fontSize: 11, color: NAVY } },
    { text: 'Track record + Project Marketplace access', options: { fontSize: 11, color: SLATE_700 } },
    { text: 'Marketplace IS the product; training is the qualifier', options: { fontSize: 11, color: SLATE_700 } },
  ],
  [
    { text: 'Enterprise employee', options: { fontSize: 11, color: NAVY } },
    { text: 'Employer-paid capability path', options: { fontSize: 11, color: SLATE_700 } },
    { text: 'Manager pays; free CCA-F via Partner Network', options: { fontSize: 11, color: SLATE_700 } },
  ],
  [
    { text: 'Indie founder', options: { fontSize: 11, color: NAVY } },
    { text: '12-week sprint to a deployable product', options: { fontSize: 11, color: SLATE_700 } },
    { text: 'Lower CAC than agency, faster than self-teach', options: { fontSize: 11, color: SLATE_700 } },
  ],
];
s3.addTable(personaRows, { x: 0.6, y: 2.0, w: 12.1, colW: [2.6, 4.5, 5.0], rowH: 0.7, border: { type: 'solid', color: SLATE_300, pt: 1 } });
s3.addText('Lead the launch with career changers. The viral-video strategy travels fastest in that community. B2B / enterprise track requires a sales motion we have not stood up.', { x: 0.6, y: 6.4, w: 12, h: 0.6, fontSize: 12, color: SLATE_600, italic: true });

// SLIDE 4 - What they build
const s4 = pres.addSlide();
addBrandHeader(s4, 'SECTION 3', 'What they build', 'One project across 12 weeks. Not 12 separate projects.');
s4.addText('Week 1 - Project DNA captured. Industry + problem + tech stack + AI requirements selected.', { x: 0.6, y: 1.9, w: 12, h: 0.4, fontSize: 14, color: NAVY, bold: true });
s4.addText('Weeks 2-11 - Each week adds a brick to the same system.', { x: 0.6, y: 2.4, w: 12, h: 0.4, fontSize: 14, color: NAVY, bold: true });
s4.addText('Week 12 - Capstone polish + public Architect Expo demo.', { x: 0.6, y: 2.9, w: 12, h: 0.4, fontSize: 14, color: NAVY, bold: true });
const weekRows = [
  [
    { text: 'Wk', options: { bold: true, color: WHITE, fill: NAVY, fontSize: 11 } },
    { text: 'Theme', options: { bold: true, color: WHITE, fill: NAVY, fontSize: 11 } },
    { text: 'Wk', options: { bold: true, color: WHITE, fill: NAVY, fontSize: 11 } },
    { text: 'Theme', options: { bold: true, color: WHITE, fill: NAVY, fontSize: 11 } },
  ],
  [{ text: '1', options: { fontSize: 11 } }, { text: 'Claude Code Foundations', options: { fontSize: 11 } }, { text: '7', options: { fontSize: 11 } }, { text: 'Subagents', options: { fontSize: 11 } }],
  [{ text: '2', options: { fontSize: 11 } }, { text: 'Agent Skills', options: { fontSize: 11 } }, { text: '8', options: { fontSize: 11 } }, { text: 'Claude Code Workflows', options: { fontSize: 11 } }],
  [{ text: '3', options: { fontSize: 11 } }, { text: 'Claude API', options: { fontSize: 11 } }, { text: '9', options: { fontSize: 11 } }, { text: 'Reliability Engineering', options: { fontSize: 11 } }],
  [{ text: '4', options: { fontSize: 11 } }, { text: 'Prompt Engineering', options: { fontSize: 11 } }, { text: '10', options: { fontSize: 11 } }, { text: 'Governance', options: { fontSize: 11 } }],
  [{ text: '5', options: { fontSize: 11 } }, { text: 'MCP Foundations', options: { fontSize: 11 } }, { text: '11', options: { fontSize: 11 } }, { text: 'Systems Architecture', options: { fontSize: 11 } }],
  [{ text: '6', options: { fontSize: 11 } }, { text: 'Advanced MCP', options: { fontSize: 11 } }, { text: '12', options: { fontSize: 11 } }, { text: 'Capstone + Architect Expo', options: { fontSize: 11 } }],
];
s4.addTable(weekRows, { x: 0.6, y: 3.6, w: 12.1, colW: [0.6, 5.4, 0.6, 5.5], rowH: 0.35, border: { type: 'solid', color: SLATE_300, pt: 1 } });
s4.addText('Format: 2 sessions per week  -  Monday Architecture Day + Thursday Build Day  -  2 hours each', { x: 0.6, y: 6.6, w: 12, h: 0.4, fontSize: 12, color: SLATE_600, italic: true });

// SLIDE 5 - Four teams
const s5 = pres.addSlide();
addBrandHeader(s5, 'SECTION 4', 'The four teams', 'Roles and ownership for the 41-day build.');
const teamCards = [
  { name: 'Website Team', owns: 'Marketing site, portal redesign, Project Builder UI, Architect Dashboard, Companion Course wrapper, Community MVP, Marketplace, Stripe enrollment.', note: 'Critical path. Biggest scope.', x: 0.4, y: 2.0, color: NAVY },
  { name: 'AI Team', owns: '6 agents (4 at launch), Anthropic Intelligence Layer, Project DNA backend, GitHub integration, Build Log auto-formatter, CCPP integration.', note: 'Self-managing platform. You + 1 contractor.', x: 6.85, y: 2.0, color: NAVY_LIGHT },
  { name: 'Marketing Team', owns: 'Brand assets, landing-page copy, viral video pipeline, LinkedIn auto-post review queue, Architect Expo content for Q4.', note: 'Lean. Leans on the auto-formatter.', x: 0.4, y: 4.85, color: GOLD },
  { name: 'Sales Team', owns: 'Pricing playbook, B2B outreach for enterprise track, Founding Cohort push, Partner Network referral pipeline.', note: 'You + part-time SDR.', x: 6.85, y: 4.85, color: GREEN_DARK },
];
for (const c of teamCards) {
  s5.addShape(pres.ShapeType.roundRect, { x: c.x, y: c.y, w: 6.1, h: 2.7, fill: { color: c.color }, line: { type: 'none' }, rectRadius: 0.1 });
  s5.addText(c.name, { x: c.x + 0.3, y: c.y + 0.2, w: 5.5, h: 0.5, fontSize: 18, color: WHITE, bold: true });
  s5.addText(c.owns, { x: c.x + 0.3, y: c.y + 0.85, w: 5.5, h: 1.4, fontSize: 11, color: WHITE });
  s5.addText(c.note, { x: c.x + 0.3, y: c.y + 2.25, w: 5.5, h: 0.4, fontSize: 11, color: WARM, italic: true });
}

// SLIDE 6 - Timeline
const s6 = pres.addSlide();
addBrandHeader(s6, 'SECTION 5', 'Timeline', '41 days to launch. 6 weeks. Gates on Jun 12, Jun 13, Jul 4.');
const timeRows = [
  [
    { text: 'Week', options: { bold: true, color: WHITE, fill: NAVY, fontSize: 12 } },
    { text: 'Date range', options: { bold: true, color: WHITE, fill: NAVY, fontSize: 12 } },
    { text: 'Hard gates', options: { bold: true, color: WHITE, fill: NAVY, fontSize: 12 } },
  ],
  [{ text: 'Wk 0', options: { fontSize: 11, bold: true } }, { text: 'May 30 - Jun 6', options: { fontSize: 11 } }, { text: 'TWC docs drafted, agent design review, brand finalized', options: { fontSize: 11 } }],
  [{ text: 'Wk 1', options: { fontSize: 11, bold: true } }, { text: 'Jun 7 - Jun 13', options: { fontSize: 11 } }, { text: 'Anthropic Partner status secured (Jun 12), TWC docs to counsel (Jun 13), CCPP schema', options: { fontSize: 11, color: RED } }],
  [{ text: 'Wk 2', options: { fontSize: 11, bold: true } }, { text: 'Jun 14 - Jun 20', options: { fontSize: 11 } }, { text: 'Project Builder + GitHub integration shipped, Anthropic L1 live', options: { fontSize: 11 } }],
  [{ text: 'Wk 3', options: { fontSize: 11, bold: true } }, { text: 'Jun 21 - Jun 27', options: { fontSize: 11 } }, { text: 'Companion Course wrapper (5 courses), Architect Dashboard, Anthropic L2 + L3', options: { fontSize: 11 } }],
  [{ text: 'Wk 4', options: { fontSize: 11, bold: true } }, { text: 'Jun 28 - Jul 4', options: { fontSize: 11 } }, { text: '4 AI agents, Build Log formatter, Stripe live, Community MVP, Marketplace v1', options: { fontSize: 11, color: RED } }],
  [{ text: 'Wk 5', options: { fontSize: 11, bold: true } }, { text: 'Jul 5 - Jul 10', options: { fontSize: 11 } }, { text: 'QA on test cohort, marketing site live, enrollment opens Jul 10', options: { fontSize: 11 } }],
];
s6.addTable(timeRows, { x: 0.5, y: 2.0, w: 12.3, colW: [0.9, 2.3, 9.1], rowH: 0.55, border: { type: 'solid', color: SLATE_300, pt: 1 } });
s6.addText('Cohort 1 classes start Mon 2026-07-27 (orientation Thu 2026-07-23). Architect Expo around 2026-10-16.', { x: 0.5, y: 6.5, w: 12, h: 0.5, fontSize: 14, color: NAVY, bold: true, italic: true });

// SLIDE 7 - Tech we are shipping
const s7 = pres.addSlide();
addBrandHeader(s7, 'SECTION 6', 'Tech we are shipping', '9 new platform features on enterprise.colaberry.com');
const techRows = [
  [
    { text: 'Component', options: { bold: true, color: WHITE, fill: NAVY, fontSize: 11 } },
    { text: 'Owner', options: { bold: true, color: WHITE, fill: NAVY, fontSize: 11 } },
    { text: 'ETA', options: { bold: true, color: WHITE, fill: NAVY, fontSize: 11 } },
  ],
  [{ text: 'Project Builder + Project DNA wizard', options: { fontSize: 10 } }, { text: 'AI Team', options: { fontSize: 10 } }, { text: 'Jun 20', options: { fontSize: 10 } }],
  [{ text: 'Anthropic Companion Course wrapper (5 courses)', options: { fontSize: 10 } }, { text: 'Website + AI', options: { fontSize: 10 } }, { text: 'Jun 27', options: { fontSize: 10 } }],
  [{ text: 'Anthropic Intelligence Layer L1 - L3', options: { fontSize: 10 } }, { text: 'AI Team', options: { fontSize: 10 } }, { text: 'Jun 27', options: { fontSize: 10 } }],
  [{ text: '4 of 6 AI agents (Mentor / Portfolio / Architect / Coach)', options: { fontSize: 10 } }, { text: 'AI Team', options: { fontSize: 10 } }, { text: 'Jul 4', options: { fontSize: 10 } }],
  [{ text: 'Architect Portfolio Dashboard', options: { fontSize: 10 } }, { text: 'Website', options: { fontSize: 10 } }, { text: 'Jun 27', options: { fontSize: 10 } }],
  [{ text: 'GitHub OAuth + activity sync', options: { fontSize: 10 } }, { text: 'AI + Website', options: { fontSize: 10 } }, { text: 'Jun 20', options: { fontSize: 10 } }],
  [{ text: 'Build Log auto-formatter (viral content engine)', options: { fontSize: 10 } }, { text: 'AI + Marketing', options: { fontSize: 10 } }, { text: 'Jul 4', options: { fontSize: 10 } }],
  [{ text: 'Community MVP + Project Marketplace v1', options: { fontSize: 10 } }, { text: 'Website', options: { fontSize: 10 } }, { text: 'Jul 4', options: { fontSize: 10 } }],
  [{ text: 'Stripe enrollment + 5 SKUs', options: { fontSize: 10 } }, { text: 'Website', options: { fontSize: 10 } }, { text: 'Jul 4', options: { fontSize: 10 } }],
  [{ text: 'CCPP integration (3 new tables for student progress)', options: { fontSize: 10 } }, { text: 'AI + DB', options: { fontSize: 10 } }, { text: 'Jun 13', options: { fontSize: 10 } }],
];
s7.addTable(techRows, { x: 0.5, y: 2.0, w: 12.3, colW: [7.5, 2.4, 2.4], rowH: 0.36, border: { type: 'solid', color: SLATE_300, pt: 1 } });
s7.addText('Deferred to v1.1 (post-launch): Curriculum + Community agents, Anthropic Intelligence L4 - L7, per-industry community subspaces, Project Marketplace governance, Architect Pro mentor scheduling.', { x: 0.5, y: 6.5, w: 12.3, h: 0.6, fontSize: 11, color: SLATE_600, italic: true });

// SLIDE 8 - Marketing + Pricing
const s8 = pres.addSlide();
addBrandHeader(s8, 'SECTION 7', 'Marketing and pricing', 'Viral is the engine. 5 SKUs at launch.');
s8.addText('Marketing: viral video pipeline', { x: 0.5, y: 1.9, w: 6, h: 0.4, fontSize: 16, color: NAVY, bold: true });
s8.addText([
  { text: 'Build Log auto-formatter\n', options: { fontSize: 12, color: SLATE_700, bold: true } },
  { text: 'Per student, per week. Generates LinkedIn post + short video script + architecture update from their GitHub activity and reflection.\n\n', options: { fontSize: 11, color: SLATE_700 } },
  { text: 'Architect Expo recordings\n', options: { fontSize: 12, color: SLATE_700, bold: true } },
  { text: 'Cohort graduations become marketing content for the next cohort.\n\n', options: { fontSize: 11, color: SLATE_700 } },
  { text: 'Identity branding\n', options: { fontSize: 12, color: SLATE_700, bold: true } },
  { text: '"Colaberry AI Architects" - modeled on CrossFitters / Harley Riders / AWS Architects.\n\n', options: { fontSize: 11, color: SLATE_700 } },
  { text: 'Founding Cohort backstop\n', options: { fontSize: 12, color: RED, bold: true } },
  { text: 'Viral works AFTER cohort 1 graduates. Founding Cohort needs a launch-month paid budget + 3 testimonials from the Anthropic Partner cohort.', options: { fontSize: 11, color: SLATE_700 } },
], { x: 0.5, y: 2.4, w: 6, h: 4.7, valign: 'top' });

s8.addText('Pricing: 5 SKUs', { x: 6.95, y: 1.9, w: 6, h: 0.4, fontSize: 16, color: NAVY, bold: true });
const priceRows = [
  [
    { text: 'SKU', options: { bold: true, color: WHITE, fill: NAVY, fontSize: 11 } },
    { text: 'Price', options: { bold: true, color: WHITE, fill: NAVY, fontSize: 11 } },
  ],
  [{ text: 'Single Intensive (1 of 4)', options: { fontSize: 11 } }, { text: '$499', options: { fontSize: 11, bold: true } }],
  [{ text: 'Bundle (all 4)', options: { fontSize: 11, bold: true, color: NAVY } }, { text: '$1,497', options: { fontSize: 11, bold: true, color: NAVY } }],
  [{ text: 'Architect Network', options: { fontSize: 11 } }, { text: '$79/mo or $790/yr', options: { fontSize: 11 } }],
  [{ text: 'Architect Pro', options: { fontSize: 11 } }, { text: '$149/mo', options: { fontSize: 11 } }],
  [{ text: 'Consulting Lab (post-grad)', options: { fontSize: 11 } }, { text: '$499 one-time', options: { fontSize: 11 } }],
];
s8.addTable(priceRows, { x: 6.95, y: 2.4, w: 5.85, colW: [3.5, 2.35], rowH: 0.45, border: { type: 'solid', color: SLATE_300, pt: 1 } });
s8.addText('Year-1 conservative: $242K (training + recurring). Aggressive vision: $594K + consulting upside.', { x: 6.95, y: 5.8, w: 5.85, h: 0.6, fontSize: 11, color: SLATE_600, italic: true });
s8.addText('TWC compliance: 4 independent seminars at $499 (under audit ceiling). Counsel review by Jun 13.', { x: 6.95, y: 6.5, w: 5.85, h: 0.6, fontSize: 11, color: GOLD, italic: true });

// SLIDE 9 - Risks
const s9 = pres.addSlide();
addBrandHeader(s9, 'SECTION 8', 'Top risks', '5 things that can break the launch.');
const risks = [
  { label: 'Risk 1', title: 'Anthropic Partner status not secured by Jun 12', mit: 'Mitigation: countdown report firing daily since May 26. Track on /admin/reports.' },
  { label: 'Risk 2', title: 'TWC fails the seminar-independence test', mit: 'Mitigation: per-intensive outcomes locked Jun 13, counsel review same week.' },
  { label: 'Risk 3', title: '41 days too tight for 9 net-new features', mit: 'Mitigation: cut Community MVP + Marketplace to placeholders. Ship Project Builder + Companion + Dashboard + Stripe at all costs.' },
  { label: 'Risk 4', title: 'Founding Cohort does not fill', mit: 'Mitigation: book Ali for 5 LinkedIn lives in Wk 5. Line up 3 Anthropic Partner cohort testimonials.' },
  { label: 'Risk 5', title: '6 AI agents do not actually self-manage', mit: 'Mitigation: design human-review queue in Mentor + Marketplace from day 1. Budget 1 part-time platform admin in v1.1.' },
];
let ry = 1.95;
for (const r of risks) {
  s9.addShape(pres.ShapeType.rect, { x: 0.5, y: ry, w: 0.15, h: 0.8, fill: { color: RED }, line: { type: 'none' } });
  s9.addText(r.label, { x: 0.8, y: ry, w: 1.5, h: 0.3, fontSize: 11, color: RED, bold: true, charSpacing: 2 });
  s9.addText(r.title, { x: 0.8, y: ry + 0.25, w: 12, h: 0.32, fontSize: 14, color: NAVY, bold: true });
  s9.addText(r.mit, { x: 0.8, y: ry + 0.55, w: 12, h: 0.3, fontSize: 11, color: SLATE_600, italic: true });
  ry += 0.95;
}

// SLIDE 10 - Next 7 days
const s10 = pres.addSlide();
addBrandHeader(s10, 'SECTION 9', 'Next 7 days', 'What we need to lock by Jun 6 - Week 0.');
const next = [
  { who: 'Ali', what: 'Lock the brand name. Confirm "AI Systems Architect Accelerator".' },
  { who: 'Ali', what: 'Confirm launch wedge persona = career changer.' },
  { who: 'Ali', what: 'Confirm pricing = $79 / $149 BYO Claude (rejecting the $99 bundled model).' },
  { who: 'Ali', what: 'Name leads: Website lead, Marketing lead, Sales lead.' },
  { who: 'Ali + counsel', what: 'TWC compliance docs drafted. Per-intensive outcome statements + artifact catalogs.' },
  { who: 'AI Team', what: 'Agent design review for Mentor + Portfolio + Architect + Success Coach.' },
  { who: 'Anthropic Partner', what: 'Push the remaining cohort members through their 4 required Anthropic courses by Jun 12.' },
  { who: 'Marketing', what: 'Brand assets finalized. Landing-page copy drafted for the 4 intensives + bundle.' },
];
let ny = 1.95;
for (const n of next) {
  s10.addShape(pres.ShapeType.rect, { x: 0.5, y: ny, w: 2.0, h: 0.45, fill: { color: NAVY }, line: { type: 'none' } });
  s10.addText(n.who, { x: 0.5, y: ny, w: 2.0, h: 0.45, fontSize: 11, color: WARM, bold: true, align: 'center', valign: 'middle', charSpacing: 2 });
  s10.addText(n.what, { x: 2.7, y: ny + 0.05, w: 10, h: 0.35, fontSize: 13, color: SLATE_700 });
  ny += 0.58;
}
s10.addText('41 days. The clock starts Monday Jun 1.', { x: 0.5, y: 6.7, w: 12.3, h: 0.5, fontSize: 16, color: NAVY, bold: true, italic: true, align: 'center' });

// WRITE
const outPath = path.resolve(__dirname, 'TRAINING_OVERVIEW.pptx');
pres.writeFile({ fileName: outPath }).then((fn) => {
  console.log('Wrote', fn);
}).catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
