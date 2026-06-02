#!/usr/bin/env node
// Generate an .xlsx spreadsheet for the AI Project Architect rollout:
// per-employee draft 5 numbers + 10 skills + draft rubrics + systems they touch.
// Ali refines in Excel/Sheets after we send it.
const path = require('path');
const ExcelJS = require(path.resolve(__dirname, '../../../node_modules/exceljs'));

const OUTPUT = path.resolve(__dirname, '../../../docs/ai-architect-rubrics-2026-06-02.xlsx');

// ===== EMPLOYEE ROSTER (draft - Ali to refine) =====
// PILOT = first wave (Karun, Kes). PHASE2 = exec team. PHASE3 = rest.
// Draft 5 numbers + 10 skills + draft 7-vs-8 rubric per number per person.
const EMPLOYEES = [
  {
    name: 'Karun Swaroop', email: 'karun@colaberry.com', role: 'VP Business Lead', wave: 'PILOT (Week 1)',
    domain: 'Strategic sales leadership; Coca-Cola + Patriot Insurance accounts; Anthropic partnership stewardship.',
    systems: ['HubSpot', 'Apollo', 'Basecamp', 'Gmail', 'CCPP', 'Anthropic Partner Portal'],
    numbers: [
      { n: 'Active strategic accounts in motion', target: '8-12', rubric: '5=≥12 named + warm / 7=≥8 active + 1 contract drafted / 9=≥10 active + 2 contracts in legal / 10=≥12 active + 3 signed YTD' },
      { n: 'Coca-Cola pipeline stage (CCC)', target: 'pilot signed by Aug', rubric: '5=discovery / 7=use case taxonomy locked / 9=pilot SOW drafted / 10=signed pilot' },
      { n: 'Patriot Insurance pipeline value', target: '$120K YTD', rubric: '5=<$40K committed / 7=$40-80K / 9=$80-120K / 10=>$120K closed' },
      { n: 'Anthropic partner touches / quarter', target: '6+', rubric: '5=<3 / 7=3-5 / 9=6-8 + co-marketing artifact / 10=9+ + active co-sell' },
      { n: 'Demo-to-pilot conversion rate', target: '40%', rubric: '5=<20% / 7=20-30% / 9=30-40% / 10=>40%' },
    ],
    skills: [
      'Strategic account discovery (industry taxonomy + decision-maker map)',
      'Use case taxonomy generation (per-industry, ranked by ROI)',
      'Multi-stakeholder pre-read prep (Coca-Cola About Colaberry pattern)',
      'Executive briefing facilitation',
      'POC scoping (success criteria + acceptance function)',
      'Pricing & terms negotiation',
      'Customer success handoff to delivery',
      'Anthropic partner-network stewardship',
      'Cross-functional coordination w/ David Lahme + JJ McBride',
      'Strategic narrative synthesis (One-pager generation)',
    ],
  },
  {
    name: 'Kesetebirhan Delele (Kes)', email: 'kes@colaberry.com', role: 'AI Systems Architect', wave: 'PILOT (Week 1)',
    domain: 'Platform architecture for enterprise.colaberry.ai + student platform + operations platform; AI agent infrastructure; voice AI + inbox AI; CRM/GHL integration.',
    systems: ['enterprise.colaberry.ai', 'GitHub', 'Claude Code', 'GHL', 'CRM', 'Basecamp', 'Voice AI infra', 'Inbox AI infra'],
    numbers: [
      { n: 'Production uptime (multi-platform)', target: '99.5%', rubric: '5=<98% / 7=98-99% / 9=99-99.5% / 10=≥99.5%' },
      { n: 'Voice AI + Inbox AI live agent count', target: '4 live by Aug', rubric: '5=1 / 7=2 / 9=3 / 10=4+ live + auto-scaling' },
      { n: 'Feature ship cadence (per sprint)', target: '3 P0 + 5 P1', rubric: '5=<2 P0 / 7=2 P0 + 3 P1 / 9=3 P0 + 4 P1 / 10=3+ P0 + 5+ P1' },
      { n: 'GHL/CRM integration coverage', target: '100% workflows live', rubric: '5=<50% / 7=50-75% / 9=75-95% / 10=100% + 30-day stable' },
      { n: 'Critical incident MTTR (minutes)', target: '<30 min', rubric: '5=>120 / 7=60-120 / 9=30-60 / 10=<30 min' },
    ],
    skills: [
      'Platform architecture (multi-product, multi-tenant)',
      'AI agent infrastructure design (Cory / CB System / Inbox COS patterns)',
      'Voice AI integration (Twilio + ElevenLabs + transcription)',
      'Inbox AI deployment (hardRule + LLM classification + autoArchive)',
      'CRM/GHL integration (workflows + webhooks)',
      'Student platform features (curriculum, portfolio, community)',
      'Operations platform features (PMO, briefing, reporting)',
      'Dev team coordination + code review',
      'Critic + verification loop pattern (Skool quality gate / Openclaw circuit breaker)',
      'Production incident response + postmortem',
    ],
  },
  {
    name: 'Ali Muwwakkil', email: 'ali@colaberry.com', role: 'Executive Sponsor / Managing Director / AI Systems Architect', wave: 'PHASE 2 (after pilot)',
    domain: 'CEO-tier strategic decisions, AI Systems Architect Accelerator launch, partner relationships (Anthropic), final approvals, CLAUDE.md DRI.',
    systems: ['Basecamp', 'Gmail', 'Mandrill', 'GitHub', 'Claude Code', 'HubSpot', 'CCPP', 'Bonfire', 'Apollo', 'Anthropic Partner Portal'],
    numbers: [
      { n: 'AI Accelerator launch milestones on-time', target: '100% by 2026-07-10', rubric: '5=>50% slipped / 7=1-2 critical slipped / 9=0 critical slipped / 10=on or ahead of plan' },
      { n: 'Strategic initiatives shipped / quarter', target: '4+', rubric: '5=<2 / 7=2-3 / 9=4-5 / 10=6+ w/ measurable lift' },
      { n: 'Anthropic partnership milestones', target: 'CCA-F cert by 2026-06-12', rubric: '5=missed gate / 7=on track / 9=signed + co-marketing in motion / 10=co-marketing live + 1 joint customer' },
      { n: 'Cross-functional escalations resolved <48h', target: '95%', rubric: '5=<70% / 7=70-85% / 9=85-95% / 10=≥95%' },
      { n: 'Direct-report 1:1 adherence (dashboard-fired)', target: '100%', rubric: '5=<60% / 7=60-85% / 9=85-100% / 10=100% + post-meeting score logged' },
    ],
    skills: [
      'Strategic direction setting (quarterly OKRs)',
      'AI architecture decisions (build vs buy, hosted vs hybrid)',
      'Cross-team escalation routing',
      'Anthropic partnership stewardship',
      'Investor / board communication',
      'Daily executive briefing review + action',
      'Direct-report DRI accountability',
      'Strategic narrative authoring (M&A, Coca-Cola, Coke pre-read)',
      'Governance review (CLAUDE.md quarterly)',
      'AI Project Architect rollout sponsorship',
    ],
  },
  {
    name: 'Ram Katamaraja', email: 'ram@colaberry.com', role: 'CEO', wave: 'PHASE 2 (after pilot)',
    domain: 'Business strategy, financials, partnerships, personnel decisions, overarching direction.',
    systems: ['Basecamp', 'Gmail', 'Expense system (AMEX)', 'Financial systems', 'Anthropic Partner Portal'],
    numbers: [
      { n: 'Revenue growth YoY', target: '40%+', rubric: '5=flat or down / 7=10-25% / 9=25-40% / 10=>40%' },
      { n: 'Runway (months)', target: '18+', rubric: '5=<6 / 7=6-12 / 9=12-18 / 10=18+' },
      { n: 'Gross margin', target: '70%+', rubric: '5=<50% / 7=50-60% / 9=60-70% / 10=>70%' },
      { n: 'Strategic partnerships signed / year', target: '3+', rubric: '5=0 / 7=1 / 9=2 / 10=3+ (Anthropic-tier)' },
      { n: 'Key hires (incl. leadership)', target: '6+', rubric: '5=<2 / 7=2-3 / 9=4-5 / 10=6+ w/ retention >12mo' },
    ],
    skills: [
      'Executive financial planning',
      'Strategic partnership negotiation',
      'Personnel decisions (hire/fire/promote)',
      'Investor communication',
      'Board governance',
      'M&A evaluation',
      'Vendor + supplier negotiation',
      'Compensation strategy',
      'Org structure design',
      'Quarterly OKR rollup',
    ],
  },
  {
    name: 'David Lahme', email: 'dlahme@colaberry.com', role: 'VP Sales / BD Lead', wave: 'PHASE 2 (after pilot)',
    domain: 'Utility sector relationships (NRECA, Duke, Oncor, Ameren); 15+ active corporate energy accounts; gov contracts via Bonfire.',
    systems: ['Gmail', 'Basecamp', 'Bonfire', 'Apollo', 'HubSpot', 'Brightdox', 'BC Vault (per-account dossiers)'],
    numbers: [
      { n: 'Active utility-sector accounts', target: '15+', rubric: '5=<8 / 7=8-12 / 9=12-15 / 10=15+ w/ active touch <14d' },
      { n: 'Pipeline value (weighted)', target: '$500K', rubric: '5=<$200K / 7=$200-350K / 9=$350-500K / 10=>$500K' },
      { n: 'RFP submissions / quarter', target: '4+', rubric: '5=0-1 / 7=2 / 9=3 / 10=4+ submitted on time' },
      { n: 'Win rate (RFP + RFI)', target: '25%', rubric: '5=<10% / 7=10-18% / 9=18-25% / 10=>25%' },
      { n: 'Executive meetings scheduled / month', target: '8+', rubric: '5=<3 / 7=3-5 / 9=5-8 / 10=8+ w/ C-suite' },
    ],
    skills: [
      'Utility-sector account discovery',
      'NRECA navigation (RE Magazine, NRECA Connect)',
      'RFP qualification + bid/no-bid decision',
      'Executive pre-read prep (Coca-Cola pattern)',
      'Bonfire portal navigation',
      'Apollo prospecting',
      'CRM pipeline hygiene',
      'Coordination w/ Karun on strategic accounts',
      'In-person tour facilitation (e.g. Coca-Cola Snyder)',
      'Account-level Vault dossier maintenance',
    ],
  },
  {
    name: 'JJ McBride (John)', email: 'john@colaberry.com', role: 'VP Sales / Relationship Lead', wave: 'PHASE 2 (after pilot)',
    domain: 'Patriot Insurance Group, insurance + financial services sector, past-engagement relationships.',
    systems: ['Basecamp', 'Gmail', 'Apollo', 'BC Vault (Patriot folder)'],
    numbers: [
      { n: 'Patriot Insurance pipeline ARR', target: '$200K', rubric: '5=<$50K / 7=$50-100K / 9=$100-200K / 10=>$200K signed' },
      { n: 'Insurance vertical net-new accounts / qtr', target: '3+', rubric: '5=0 / 7=1 / 9=2 / 10=3+ w/ paid pilot' },
      { n: 'Past-engagement reactivations', target: '5+', rubric: '5=0-1 / 7=2 / 9=3-4 / 10=5+ active conversations' },
      { n: 'Cycle time (intro → pilot)', target: '<90d', rubric: '5=>180d / 7=120-180d / 9=90-120d / 10=<90d' },
      { n: 'Customer success NPS (post-pilot)', target: '70+', rubric: '5=<30 / 7=30-50 / 9=50-70 / 10=70+' },
    ],
    skills: [
      'Past-engagement reactivation',
      'Insurance / financial services discovery',
      'SBU strategy framing',
      'Patriot relationship maintenance',
      'Cycle compression (intro → pilot)',
      'Vertical-specific use case framing',
      'Customer-success-led referrals',
      'Post-engagement NPS capture',
      'Cross-functional coordination w/ Karun',
      'Vault dossier maintenance (Patriot, future accounts)',
    ],
  },
  {
    name: 'Sohail Syed', email: 'sohail@colaberry.com', role: 'Marketing Lead', wave: 'PHASE 2 (after pilot)',
    domain: 'Marketing strategy, ads, landing pages, A/B testing, content distribution, AI Accelerator launch marketing.',
    systems: ['Basecamp', 'Gmail', 'Ad networks', 'Landing pages (training.colaberry.com)', 'Stripe (enrollment)'],
    numbers: [
      { n: 'Enrolled students / cohort', target: '50+', rubric: '5=<20 / 7=20-35 / 9=35-50 / 10=50+' },
      { n: 'CAC (blended)', target: '<$300', rubric: '5=>$600 / 7=$450-600 / 9=$300-450 / 10=<$300' },
      { n: 'Lead-to-enrollment conversion', target: '15%', rubric: '5=<5% / 7=5-10% / 9=10-15% / 10=>15%' },
      { n: 'Ad spend ROI (LTV/CAC)', target: '3x+', rubric: '5=<1.5x / 7=1.5-2x / 9=2-3x / 10=3x+' },
      { n: 'Content cadence (per week)', target: '5 posts + 1 long-form', rubric: '5=<2 / 7=3 / 9=4 / 10=5+ on cadence' },
    ],
    skills: [
      'Ad creative briefing + iteration',
      'Landing page conversion optimization',
      'A/B testing setup + analysis',
      'Content calendar management',
      'Distribution across channels (LinkedIn, X, Substack, Reddit)',
      'Cohort enrollment funnel orchestration',
      'AI Accelerator launch campaign',
      'SEO content collaboration w/ Sai Tejesh',
      'Brand consistency (w/ Aleem)',
      'Marketing analytics + attribution',
    ],
  },
  {
    name: 'Swati Raman', email: 'swatiraman1511@gmail.com', role: 'Curriculum Lead + TWC Compliance', wave: 'PHASE 3',
    domain: 'Curriculum review & design, TWC registration + compliance, training intensive design.',
    systems: ['Basecamp', 'Skilljar (Anthropic courses)', 'CCPP', 'TWC documentation', 'Gmail'],
    numbers: [
      { n: 'TWC compliance status', target: 'Green', rubric: '5=overdue items / 7=on track / 9=ahead + audit-ready / 10=fully audited + signed off' },
      { n: 'Curriculum modules ready per sprint', target: '3+', rubric: '5=<1 / 7=1-2 / 9=2-3 / 10=3+ with student verification' },
      { n: 'Student satisfaction (curriculum NPS)', target: '70+', rubric: '5=<30 / 7=30-50 / 9=50-70 / 10=70+' },
      { n: 'Instructor utilization', target: '80%+', rubric: '5=<50% / 7=50-65% / 9=65-80% / 10=80%+ w/ feedback loop' },
      { n: 'AI Architect Accelerator curriculum % complete', target: '100% by 2026-07-10', rubric: '5=<60% / 7=60-80% / 9=80-95% / 10=100% on or before' },
    ],
    skills: [
      'Curriculum design (project-based)',
      'TWC registration + compliance documentation',
      'Skilljar course integration',
      'Anthropic course wrapper authoring',
      'CCPP curriculum data hygiene',
      'Instructor coordination',
      'Student feedback loop',
      'Cohort retrospective facilitation',
      'Pre-read + worksheet generation',
      'Project Builder content authoring',
    ],
  },
  {
    name: 'Sai Tejesh', email: 'saitejesh@colaberry.com', role: 'Website Lead', wave: 'PHASE 3',
    domain: 'training.colaberry.com ownership, website migration, marketing site redesign, landing pages, SEO.',
    systems: ['training.colaberry.com', 'Basecamp', 'GitHub', 'HTML/CSS/JS dev'],
    numbers: [
      { n: 'training.colaberry.com uptime', target: '99.9%', rubric: '5=<98% / 7=98-99% / 9=99-99.5% / 10=99.9%+' },
      { n: 'Site conversion rate (visitor → lead)', target: '5%+', rubric: '5=<2% / 7=2-3% / 9=3-5% / 10=>5%' },
      { n: 'SEO position (target keywords)', target: 'page 1', rubric: '5=>page 3 / 7=page 2-3 / 9=top of page 2 / 10=page 1' },
      { n: 'Page load p95', target: '<2s', rubric: '5=>4s / 7=3-4s / 9=2-3s / 10=<2s' },
      { n: 'Landing pages shipped / quarter', target: '6+', rubric: '5=<2 / 7=2-3 / 9=4-5 / 10=6+ w/ A/B running' },
    ],
    skills: [
      'HTML/CSS/JS dev',
      'Landing page authoring',
      'SEO best practices',
      'Conversion optimization',
      'Site performance tuning',
      'A/B test instrumentation',
      'GitHub-driven deployment',
      'Stakeholder requirement capture',
      'Brand-consistent design (w/ Aleem)',
      'Marketing collaboration (w/ Sohail)',
    ],
  },
  {
    name: 'Jackie Chalk', email: 'jackie@colaberry.com', role: 'Community Manager + Events', wave: 'PHASE 3',
    domain: 'Events, WhatsApp community, Eventbrite, Open Houses, alumni communication, Architect Expo logistics.',
    systems: ['Basecamp', 'WhatsApp', 'Eventbrite', 'Gmail', 'Community platforms'],
    numbers: [
      { n: 'Active WhatsApp community members', target: '500+', rubric: '5=<150 / 7=150-300 / 9=300-500 / 10=500+ engaged weekly' },
      { n: 'Eventbrite signups / month', target: '100+', rubric: '5=<30 / 7=30-60 / 9=60-100 / 10=100+ w/ attendance >70%' },
      { n: 'Open House attendance', target: '40+/event', rubric: '5=<15 / 7=15-25 / 9=25-40 / 10=40+' },
      { n: 'Alumni engagement rate', target: '40%', rubric: '5=<15% / 7=15-25% / 9=25-40% / 10=>40%' },
      { n: 'Architect Expo (Oct 2026) milestones on time', target: '100%', rubric: '5=>50% slipped / 7=1-2 critical slipped / 9=0 critical / 10=ahead of plan' },
    ],
    skills: [
      'Community moderation',
      'Event logistics (Open Houses, Architect Expo)',
      'Eventbrite admin',
      'WhatsApp community admin',
      'Alumni outreach + reactivation',
      'Content distribution to community',
      'Speaker coordination',
      'Sponsor relationship management',
      'Post-event NPS capture',
      'Community-to-marketing handoff (w/ Sohail)',
    ],
  },
  {
    name: 'Taiwo Oludimimu', email: 'taiwo@colaberry.com', role: 'Admissions Operations Lead', wave: 'PHASE 3',
    domain: 'Enrollment monitoring, retention, reporting, subscription growth tracking, student lifecycle.',
    systems: ['Basecamp', 'CCPP', 'Stripe (enrollment metrics)', 'Gmail'],
    numbers: [
      { n: 'Enrolled students / month', target: '40+', rubric: '5=<15 / 7=15-25 / 9=25-40 / 10=40+' },
      { n: 'Retention rate (3-month)', target: '85%+', rubric: '5=<60% / 7=60-75% / 9=75-85% / 10=>85%' },
      { n: 'Refund rate', target: '<5%', rubric: '5=>15% / 7=10-15% / 9=5-10% / 10=<5%' },
      { n: 'Subscription growth (MoM)', target: '15%+', rubric: '5=<0% (decline) / 7=0-7% / 9=7-15% / 10=15%+' },
      { n: 'Stripe revenue accuracy / reconciliation', target: '100%', rubric: '5=<95% / 7=95-98% / 9=98-100% / 10=100% reconciled monthly' },
    ],
    skills: [
      'Enrollment workflow ops',
      'Stripe billing ops + reconciliation',
      'Retention email cadence',
      'Refund handling + escalation',
      'Subscription analytics',
      'CCPP enrollment data hygiene',
      'Student lifecycle reporting',
      'Coordination w/ Sohail (lead → enroll)',
      'Coordination w/ Mika replacement / instructor team',
      'Compliance reporting (TWC, finance)',
    ],
  },
  {
    name: 'Aleem', email: 'aleem@colaberry.com', role: 'Creative Director', wave: 'PHASE 3',
    domain: 'Design approval, viral videos, brand visuals, UI reviews, marketing creative.',
    systems: ['Basecamp', 'Design tools (Figma/Canva/Adobe)', 'Gmail'],
    numbers: [
      { n: 'Design approvals turnaround', target: '<24h', rubric: '5=>72h / 7=48-72h / 9=24-48h / 10=<24h' },
      { n: 'Brand assets shipped / quarter', target: '20+', rubric: '5=<8 / 7=8-12 / 9=12-20 / 10=20+ w/ usage rate >80%' },
      { n: 'Viral video reach (views/month)', target: '100K+', rubric: '5=<10K / 7=10-30K / 9=30-100K / 10=>100K' },
      { n: 'Brand consistency score', target: '90%+', rubric: '5=<60% / 7=60-75% / 9=75-90% / 10=>90%' },
      { n: 'UI review coverage (% releases)', target: '100%', rubric: '5=<50% / 7=50-75% / 9=75-100% / 10=100% w/ accessibility audit' },
    ],
    skills: [
      'Design approval (per BC PR pattern)',
      'Brand system maintenance',
      'Viral content ideation',
      'Video editing + thumbnail design',
      'UI review (accessibility + Bloomberg-meets-Salesforce baseline)',
      'Asset library curation',
      'Cross-function design partnership (Marketing, Website, Curriculum)',
      'Print design (RE Magazine ad pattern)',
      'Photography sourcing + commissioning',
      'Brand violation triage',
    ],
  },
  {
    name: 'Dheeraj Garg (Dhee)', email: 'dhee@colaberry.com', role: 'Operations Assistant (Ali, India)', wave: 'PHASE 3',
    domain: 'Documentation, research, administrative work, manual execution tasks, backup ops for Ali.',
    systems: ['Basecamp', 'Gmail', 'Research tools', 'Documentation platforms'],
    numbers: [
      { n: 'Admin tasks closed / week', target: '15+', rubric: '5=<5 / 7=5-10 / 9=10-15 / 10=15+ w/ accuracy >95%' },
      { n: 'Research artifacts shipped / month', target: '6+', rubric: '5=<2 / 7=2-3 / 9=4-5 / 10=6+ w/ Ali "good" rating' },
      { n: 'Ops escalations resolved <48h', target: '95%', rubric: '5=<70% / 7=70-85% / 9=85-95% / 10=>95%' },
      { n: 'India team coordination touchpoints', target: 'daily', rubric: '5=ad hoc / 7=weekly / 9=2-3x/week / 10=daily' },
      { n: 'Documentation freshness (Ali Personal artifacts)', target: '90%+ <30d', rubric: '5=<50% / 7=50-70% / 9=70-90% / 10=>90%' },
    ],
    skills: [
      'Documentation drafting',
      'Research synthesis',
      'Admin coordination (calendar, travel, vendor)',
      'India-team time-zone bridge',
      'Manual execution of repetitive ops',
      'Ad-hoc analysis (when CB System unavailable)',
      'Vendor follow-up',
      'Compliance paperwork',
      'Briefing prep for Ali',
      'Backup ops when team members are out',
    ],
  },
  {
    name: 'Vinay Shankar', email: 'vinay@colaberry.com', role: 'Government Contracts / Company Info Lead', wave: 'PHASE 3',
    domain: 'Gov bid preparation, corporate info assembly, certifications, past-performance documentation, compliance.',
    systems: ['Basecamp', 'Bonfire', 'Gmail', 'Compliance docs', 'Drive'],
    numbers: [
      { n: 'Gov bids submitted on time', target: '100%', rubric: '5=<70% / 7=70-85% / 9=85-100% / 10=100% w/ buffer >24h' },
      { n: 'Bid win rate', target: '20%', rubric: '5=<5% / 7=5-12% / 9=12-20% / 10=>20%' },
      { n: 'Compliance docs current (% reviewed <90d)', target: '100%', rubric: '5=<60% / 7=60-80% / 9=80-95% / 10=100%' },
      { n: 'Past performance updates / quarter', target: '6+', rubric: '5=<2 / 7=2-3 / 9=4-5 / 10=6+ w/ outcome data' },
      { n: 'Bid prep cycle time', target: '<5d', rubric: '5=>14d / 7=10-14d / 9=5-10d / 10=<5d' },
    ],
    skills: [
      'Bonfire navigation + bid submission',
      'RFP requirements parsing',
      'Compliance documentation curation',
      'Past performance writeup',
      'Capability statement maintenance',
      'Subcontractor coordination',
      'Pricing template assembly',
      'Bid/no-bid recommendation',
      'Coordination w/ David Lahme (utility sector) + Karun (strategic accounts)',
      'Post-bid debrief',
    ],
  },
  {
    name: 'Angie', email: 'angie@colaberry.com', role: 'HR / Personnel Lead', wave: 'PHASE 3',
    domain: 'Payroll, benefits, offboarding, COBRA, separation agreements, HR compliance.',
    systems: ['Gmail', 'HRIS', 'Payroll system'],
    numbers: [
      { n: 'Payroll on-time accuracy', target: '100%', rubric: '5=<95% / 7=95-98% / 9=98-100% / 10=100% w/ zero corrections' },
      { n: 'Benefits enrollment turnaround', target: '<5d', rubric: '5=>14d / 7=10-14d / 9=5-10d / 10=<5d' },
      { n: 'Offboarding completion rate', target: '100% w/in 2 weeks', rubric: '5=<70% / 7=70-85% / 9=85-100% / 10=100% w/ clean exit' },
      { n: 'Compliance items current', target: '100%', rubric: '5=<80% / 7=80-90% / 9=90-100% / 10=100% w/ proactive audit' },
      { n: 'Employee NPS (HR satisfaction)', target: '70+', rubric: '5=<30 / 7=30-50 / 9=50-70 / 10=70+' },
    ],
    skills: [
      'Payroll processing',
      'Benefits administration',
      'Offboarding execution',
      'COBRA + separation agreement drafting',
      'Compliance monitoring',
      'New-hire onboarding paperwork',
      'Performance review coordination',
      'HRIS hygiene',
      'Workforce reporting',
      'Employee escalation triage',
    ],
  },
  {
    name: 'Rashi', email: 'rashi@colaberry.com', role: 'Finance / Accounting', wave: 'PHASE 3',
    domain: 'Finance coordination, payment tracking, invoice + wire + deposit reconciliation.',
    systems: ['Gmail', 'Financial systems', 'Spreadsheets', 'Stripe (reconciliation)'],
    numbers: [
      { n: 'Invoices processed on time', target: '100%', rubric: '5=<85% / 7=85-95% / 9=95-100% / 10=100% within 5 business days' },
      { n: 'AR aging (>60d) %', target: '<5%', rubric: '5=>20% / 7=12-20% / 9=5-12% / 10=<5%' },
      { n: 'Cash reconciliation accuracy', target: '100%', rubric: '5=<98% / 7=98-99.5% / 9=99.5-100% / 10=100% monthly' },
      { n: 'Wire / deposit recording lag', target: '<24h', rubric: '5=>5d / 7=3-5d / 9=24h-3d / 10=<24h' },
      { n: 'Month-end close turnaround', target: '<5 business days', rubric: '5=>15d / 7=10-15d / 9=5-10d / 10=<5d' },
    ],
    skills: [
      'AR / AP processing',
      'Bank reconciliation',
      'Wire / deposit tracking',
      'Stripe revenue reconciliation',
      'Month-end close',
      'Cash forecasting',
      'Vendor payment ops',
      'Expense report processing',
      'Audit prep',
      'Coordination w/ Angie on payroll',
    ],
  },
];

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Ali Muwwakkil (drafted by Claude Code, refine in place)';
  wb.lastModifiedBy = 'Ali Muwwakkil';
  wb.created = new Date();

  // ===== Sheet 1: README / How to use =====
  const readme = wb.addWorksheet('README', { properties: { tabColor: { argb: 'FFD4A017' } } });
  readme.columns = [{ width: 100 }];
  const readmeLines = [
    ['AI Project Architect Rollout — Per-Employee Rubrics + Skills'],
    [''],
    ['Source: Alden DoRosario / CustomGPT talk via GAI Insights Daily AI News & Learning Lab (Ram sent 2026-06-02).'],
    ['Origin email: Triad thread Mandrill 9303b5d0-45bc-5845-fa32-bdc45b071d82.'],
    [''],
    ['HOW TO USE THIS WORKBOOK'],
    [''],
    ['Sheet 2 (Employee Master): one row per active Colaberry person + role + wave + systems they touch. Sort by Wave to see who is in PILOT (Karun + Kes), PHASE 2, PHASE 3.'],
    [''],
    ['Sheet 3 (5 Numbers + Draft Rubrics): per-person, the 5 numbers I think each DRI should own. Rubric format = "5=acceptable / 7=on plan / 9=ahead / 10=best-in-class." Ali to refine the targets + thresholds.'],
    [''],
    ['Sheet 4 (10 Skills per Person): the portable skills each DRI executes. These are what get committed to the AI_ProjectArchitect repo as "Colaberry approved" once you ratify them. Skills outlast people.'],
    [''],
    ['Sheet 5 (Systems Matrix): which person touches which system. This drives MCP wiring + agent context priming.'],
    [''],
    ['SUGGESTED REFINE WORKFLOW FOR ALI'],
    [''],
    ['1. Open in Excel or Google Sheets.'],
    ['2. Skim Sheet 1 (Employee Master) — confirm I have the right 17 people, right roles, right wave assignment.'],
    ['3. Spend 5 minutes each on Karun + Kes (pilots) on Sheet 3 — these need to be CORRECT before we build the agents. Change targets, change rubric thresholds, change number names.'],
    ['4. Defer Sheets 3 + 4 for the rest of the team until pilot is proven (rough draft is fine for now).'],
    ['5. Sheet 5 (Systems Matrix) — confirm I have the right tools per person.'],
    [''],
    ['NOTES'],
    [''],
    ['- Mika Hopson + Shveta are excluded (offboarded 2026-05-29 per memory).'],
    ['- Interns (Milad, Meghana, Sarbjit, Obi, etc.) are excluded — they go through the existing intern tracker, not this rollout.'],
    ['- External advisors (Vivek, Luda) are excluded.'],
    ['- Roselen is excluded until provisioned on Basecamp.'],
    ['- "CB System" / Vishnu OAuth identity is excluded — it is the AI executor, not a human.'],
    [''],
    ['QUESTIONS I COULDN\'T ANSWER WITHOUT YOUR INPUT'],
    [''],
    ['- Are the 5 numbers correct for each person? (I drafted based on what I saw in the repo, but you live with them daily.)'],
    ['- What is the FICO-style threshold curve for each rubric? (I used 5=acceptable, 7=on plan, 9=ahead, 10=best-in-class — feel free to change the spread.)'],
    ['- Should anyone be moved between waves? (e.g. Sohail might belong in PILOT instead of PHASE 2 given the July 10 launch.)'],
    ['- Are there skills I missed? (Some skills are obvious from repo; some only you know.)'],
    [''],
    ['When you are done refining, reply to this email with the updated XLSX attached. I will load it into AI_ProjectArchitect under the appropriate per-person folder + commit as "Colaberry approved" so everyone has it.'],
  ];
  readme.getColumn(1).font = { size: 11 };
  readme.getRow(1).font = { size: 18, bold: true };
  readmeLines.forEach((line, i) => {
    const row = readme.addRow(line);
    if (i === 0) row.height = 30;
    if (/^[A-Z][A-Z\s]+$/.test(line[0] || '')) {
      row.font = { bold: true, size: 12, color: { argb: 'FF1A365D' } };
    }
  });

  // ===== Sheet 2: Employee Master =====
  const master = wb.addWorksheet('Employee Master', { properties: { tabColor: { argb: 'FF1A365D' } } });
  master.columns = [
    { header: 'Name', key: 'name', width: 28 },
    { header: 'Email', key: 'email', width: 32 },
    { header: 'Role', key: 'role', width: 38 },
    { header: 'Wave', key: 'wave', width: 22 },
    { header: 'Domain (1-2 sentences)', key: 'domain', width: 60 },
    { header: 'Systems / tools they touch', key: 'systems', width: 45 },
  ];
  master.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  master.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A365D' } };
  master.getRow(1).height = 24;
  EMPLOYEES.forEach((e) => {
    const row = master.addRow({
      name: e.name, email: e.email, role: e.role, wave: e.wave, domain: e.domain,
      systems: e.systems.join(', '),
    });
    if (e.wave.startsWith('PILOT')) {
      row.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } }; c.font = { bold: true }; });
    }
    row.alignment = { vertical: 'top', wrapText: true };
    row.height = 56;
  });

  // ===== Sheet 3: 5 Numbers + Draft Rubrics =====
  const nums = wb.addWorksheet('5 Numbers + Rubrics', { properties: { tabColor: { argb: 'FF7C2D12' } } });
  nums.columns = [
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Wave', key: 'wave', width: 18 },
    { header: '#', key: 'idx', width: 4 },
    { header: 'Number they own', key: 'num', width: 40 },
    { header: 'Target (Ali to refine)', key: 'target', width: 24 },
    { header: 'Draft rubric (FICO-style: 5/7/9/10)', key: 'rubric', width: 80 },
    { header: 'Ali notes', key: 'notes', width: 30 },
  ];
  nums.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  nums.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C2D12' } };
  nums.getRow(1).height = 30;
  EMPLOYEES.forEach((e) => {
    e.numbers.forEach((numObj, i) => {
      const row = nums.addRow({
        name: e.name, wave: e.wave, idx: i + 1, num: numObj.n, target: numObj.target,
        rubric: numObj.rubric, notes: '',
      });
      if (e.wave.startsWith('PILOT')) {
        row.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } }; });
      }
      row.alignment = { vertical: 'top', wrapText: true };
      row.height = 40;
    });
    // separator row
    const sep = nums.addRow({});
    sep.height = 6;
  });

  // ===== Sheet 4: 10 Skills per Person =====
  const skills = wb.addWorksheet('10 Skills per Person', { properties: { tabColor: { argb: 'FF14532D' } } });
  skills.columns = [
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Wave', key: 'wave', width: 18 },
    { header: '#', key: 'idx', width: 4 },
    { header: 'Skill (intended for AI_ProjectArchitect library)', key: 'skill', width: 70 },
    { header: 'Colaberry-approved (Y/N once Ali ratifies)', key: 'approved', width: 18 },
    { header: 'Ali notes', key: 'notes', width: 36 },
  ];
  skills.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  skills.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14532D' } };
  skills.getRow(1).height = 30;
  EMPLOYEES.forEach((e) => {
    e.skills.forEach((s, i) => {
      const row = skills.addRow({
        name: e.name, wave: e.wave, idx: i + 1, skill: s, approved: '', notes: '',
      });
      if (e.wave.startsWith('PILOT')) {
        row.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } }; });
      }
      row.alignment = { vertical: 'top', wrapText: true };
      row.height = 28;
    });
    const sep = skills.addRow({});
    sep.height = 6;
  });

  // ===== Sheet 5: Systems Matrix =====
  const allSystems = [...new Set(EMPLOYEES.flatMap((e) => e.systems))].sort();
  const matrix = wb.addWorksheet('Systems Matrix', { properties: { tabColor: { argb: 'FF0C4A6E' } } });
  matrix.columns = [
    { header: 'Person', key: 'name', width: 24 },
    { header: 'Wave', key: 'wave', width: 16 },
    ...allSystems.map((s) => ({ header: s, key: s, width: 16 })),
  ];
  matrix.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  matrix.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0C4A6E' } };
  matrix.getRow(1).height = 36;
  matrix.getRow(1).alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
  EMPLOYEES.forEach((e) => {
    const data = { name: e.name, wave: e.wave };
    allSystems.forEach((s) => { data[s] = e.systems.includes(s) ? '✓' : ''; });
    const row = matrix.addRow(data);
    if (e.wave.startsWith('PILOT')) {
      row.eachCell((c) => { if (c.value === '✓') { c.font = { bold: true, color: { argb: 'FF14532D' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } }; } });
    } else {
      row.eachCell((c, i) => { if (c.value === '✓' && i > 2) { c.alignment = { horizontal: 'center' }; } });
    }
    row.height = 24;
  });

  // Freeze header on every data sheet
  master.views = [{ state: 'frozen', ySplit: 1 }];
  nums.views = [{ state: 'frozen', ySplit: 1, xSplit: 1 }];
  skills.views = [{ state: 'frozen', ySplit: 1, xSplit: 1 }];
  matrix.views = [{ state: 'frozen', ySplit: 1, xSplit: 2 }];

  await wb.xlsx.writeFile(OUTPUT);
  console.log(`Wrote ${OUTPUT}`);
}

main().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
