/**
 * openhouse-nov2026.js — the Open House for the November 2026 cohort, Thursday
 * 2026-10-29, built as a full KitConfig on the same Class Kit system the July
 * cohort ran on (▶ Present, phone check-in + live voting, presenter phone,
 * teaching guide). Same file shape as session20-week10-monday.js.
 *
 * WHY THIS EXISTS
 * Ali, 2026-10-29: build the Open House as the 1st session of the November
 * batch, in the Week 10 format, very interactive (a question every 2-3
 * slides, live moving numbers), on the Forward/Frontier Deployed Engineer
 * role, Anthropic's October $100M, current events and quotes, the 12-week
 * program, and a compelling case for the YEARLY subscription — with a raffle
 * for 3 copies of Ram's book and 3 scholarships worth 50% of a year.
 *
 * TITLE CONTRACT
 * The title contains "Open House", which selects the 'openhouse' day kind
 * (kitSpec.detectDayKind): every slide below is the whole deck, and no week
 * content is generated around it.
 *
 * SOURCES (every figure on a slide traces to one of these; verified 2026-10-29)
 *  [A1] anthropic.com/news/claude-frontier-academy (2026-10-02): $100M, 10,000
 *       engineers by end of 2027, Resident Engineer badge -> 12-week residency
 *       -> Frontier Deployed Engineer badge; first-cohort firms; the quote.
 *  [A2] anthropic.com/news/claude-partner-network (2026-03-12): $100M initial.
 *  [A3] anthropic.com/news index: Opus 5.5 (09-22), Sonnet 5.5 (09-28),
 *       Haiku 5.5 (10-07).
 *  [L1] levels.fyi FDE title page (updated 2026-09-08): median total comp
 *       $205K, 25th-75th $172K-$277K.
 *  [I1] Indeed data via Business Insider: 5,330 FDE postings Apr 2026 vs 643
 *       Apr 2025 (+729%). Secondary source; say "Indeed data".
 *  [G1] Gartner press release 2025-08-26: 40% of enterprise apps with
 *       task-specific agents by 2026, up from <5% in 2025.
 *  [M1] McKinsey State of AI 2025 (Nov 2025): 23% scaling agentic AI, 39%
 *       experimenting.
 *  [C1] Challenger, Gray & Christmas, July 2026 report: AI cited in 112,713
 *       US job cuts through July, more than double all of 2025.
 *  [LI] LinkedIn Jobs on the Rise 2026: AI engineer #1 in the US.
 *  [P1] claude.com/pricing: Pro $17/mo billed annually ($200/yr).
 *  [KB] /knowledge KB: 12 weeks / 4 intensives, CCA-F prep, internship,
 *       GitHub portfolio, $149/mo billed annually (founding rate, locked while
 *       active), 5,000+ careers since 2012.
 * NOT on any slide (unverified): FDE salaries above $300K base, a career-path
 * statistic, any Sam Altman / Satya Nadella quote.
 *
 * TWC: Colaberry is a licensed career school — never the word "free" or
 * "guarantee" (40 TAC 807.172(d)). "$0 to start" / "no card needed" instead.
 * PRICING ORDER (Ali, 2026-10-24): lead with $149/mo billed annually ALONE;
 * $199 month-to-month only if someone pushes back — it is in the presenter
 * notes, never on a slide.
 *
 * Run inside the container:  node /app/openhouse-nov2026.js [--dry]
 * Local, no DB:              node openhouse-nov2026.js --check
 * Idempotent: finds the session by (cohort, title) and creates it only if
 * missing; the config save is a full replacement, so a re-run converges.
 * Rollback: the BEFORE line printed on every run, or
 *           UPDATE live_sessions SET kit_config_json = NULL WHERE id = <id>.
 */

const COHORT_NAME = 'Cohort - November 2026';
const SESSION = {
  session_number: 1,
  title: 'Open House — The Forward Deployed Engineer',
  description: 'Open House: the Forward Deployed Engineer role, what changed this month, and how the 12-week Accelerator builds the proof. Live polls on your phone, giveaways at the end.',
  session_date: '2026-10-29',
  start_time: '18:30',
  end_time: '20:00',
  session_type: 'core',
  status: 'scheduled',
};
const L = (...lines) => lines.join('\n');

/* ------------------------------------------------------------- opening ---- */
const HOOK = {
  headline: 'In October, Anthropic put $100 million behind a job title most people have never heard of.',
  caption: 'Tonight: what that job is, what it pays, and how you get yourself into position for it in the next twelve months, on your own time.',
};

/* ---------------------------------------------------------------- teach ---- */
const TEACH = [
  /* ============================== welcome ============================== */
  {
    segment: 'welcome', eyebrow: '🎟️ Tonight, in 90 minutes',
    title: 'You leave tonight knowing exactly where the next year can take you',
    body: 'This is not a webinar. Your phone is your controller: you will vote about every three slides and the numbers move on screen as you answer. We give away three copies of our CEO’s book and three scholarships worth half a year of membership at the end, and you have to be here to win.',
    bullets: [
      'The signal: what Anthropic just paid for, and why',
      'The role: the Forward Deployed Engineer, what it does and what it pays',
      'How an architect thinks, tried live on a real decision',
      'The 12 weeks, the internship, the certification, the proof',
      'Giveaways: 3 books + 3 scholarships, drawn live at the end',
    ],
    script: L(
      'SITUATION: First content slide. Most of the room has never been in a class where they vote. Set that expectation now.',
      'ROOM: QR still visible in the corner. Watch the "checked in" counter on the rail climb before you move.',
      'MOOD: High energy, warm, confident. You are the host of a show, not a webinar presenter.',
      'OPEN: "Welcome. I am going to make you a promise: by the end of tonight you will know exactly what the next twelve months could look like for you."',
      'SAY: Your phone is your remote. Every few slides I ask, you answer, and you watch the room answer with you.',
      'SAY: And stay to the end. Three signed books and three scholarships get drawn live, and the draw only counts people who are here.',
      'DO: Point at the checked-in count on the rail. Read it out loud and celebrate it: "Forty-two of you already in, love it."',
      'NOTE: Do not move to the first vote until most of the room has scanned. Thirty seconds of waiting here buys you every vote after it.',
    ),
  },

  /* =============================== signal ============================== */
  {
    segment: 'signal', eyebrow: '📰 October 2, 2026 · Anthropic',
    title: '$100 million to train 10,000 Frontier Deployed Engineers',
    body: 'Anthropic launched the Claude Frontier Academy: one hundred million dollars to train ten thousand engineers by the end of 2027. The first cohort came from Accenture, Bain, Capgemini, Commonwealth Bank, Deloitte, McKinsey, Morgan Stanley and Novo Nordisk. Their own announcement says it plainly: the people with the skills to make AI work inside a real business have become the hardest talent to find.',
    bullets: [
      '$100M · 10,000 engineers · by end of 2027',
      'Step 1: an intensive program → "Claude Resident Engineer" badge',
      'Step 2: a 12-week residency leading a real Claude project at their company',
      'Step 3: a second assessment → "Claude Frontier Deployed Engineer" badge',
      'Source: anthropic.com/news, October 2, 2026',
    ],
    diagram: `flowchart LR
  A["🏫 intensive program"] --> B["🎖️ Resident Engineer"]
  B --> C["🛠️ 12-week residency<br/>a real use case"]
  C --> D["🏆 Frontier Deployed<br/>Engineer"]`,
    script: L(
      'SITUATION: The reveal of the prediction they just voted on. The answer is ten thousand.',
      'ROOM: Diagram up. Let the number sit before you talk.',
      'MOOD: Authoritative. This is news, and you are the person in the room who read the primary source.',
      'OPEN: "Ten thousand. That is the answer. Anthropic is paying to train ten thousand of these people, and they are starting with McKinsey, Deloitte and Morgan Stanley."',
      'SAY: Look at the shape of their program: learn it, then spend twelve weeks leading a real project, then get assessed on what you actually did.',
      'SAY: Hold on to that shape. You are going to see it again tonight.',
      'DO: Point at the 12-week residency box and pause.',
      'NOTE: It is Anthropic’s own word, "Frontier" Deployed Engineer. Everywhere else in the industry it is "Forward" Deployed Engineer, FDE. Same job. Say both once, then use FDE.',
    ),
  },
  {
    segment: 'signal', eyebrow: '🧭 Read the signal',
    title: 'When the company that builds the model pays to train the people who deploy it, the bottleneck is people',
    body: 'Models are not the scarce thing anymore. Anthropic shipped three new Claude models in seventeen days this fall. What is scarce is the person who can walk into a business, find the problem worth solving, and make an AI system work there safely, in production, with real data. That is a job. It has a name, it has a pay band, and right now there are not enough people who can do it.',
    bullets: [
      'Claude Opus 5.5 (Sep 22) · Sonnet 5.5 (Sep 28) · Haiku 5.5 (Oct 7)',
      'The model is a commodity on a three-week release cycle',
      'The person who can deploy it is not',
      'March 2026: Anthropic also committed $100M to its partner network',
    ],
    script: L(
      'SITUATION: Turn the news into the thesis of the night. This is the most important idea you will say.',
      'ROOM: Slide up. No diagram. Slow down.',
      'MOOD: Calm certainty. Lower your voice slightly.',
      'OPEN: "Here is what most people miss about that announcement."',
      'SAY: When the company that builds the most capable model in the world spends a hundred million dollars training the people who deploy it, they are telling you where the bottleneck is. It is not the model. It is people.',
      'SAY: And that is good news for everyone on this call, because a skill gap is the only kind of gap a person can close on their own.',
      'DO: Pause after "it is people." Count three in your head.',
      'NOTE: If someone asks about the March $100M partner-network commitment: it is a separate, earlier announcement. It is not clear whether October’s is additional to it, so do not add them together.',
    ),
  },

  /* ================================ news =============================== */
  {
    segment: 'news', eyebrow: '📊 Where business actually is',
    title: 'Everyone is experimenting. Almost nobody has it working at scale.',
    body: 'McKinsey surveyed nearly two thousand organizations: twenty-three percent are scaling an agentic AI system somewhere in the enterprise, and thirty-nine percent are still experimenting. In any single business function, no more than ten percent have agents running at scale. The gap between "we tried it" and "it runs the process" is exactly where the jobs are.',
    bullets: [
      '23% scaling an agentic AI system somewhere (McKinsey, Nov 2025)',
      '39% still experimenting',
      '≤10% scaling agents in any single function',
      'AI engineer: #1 on LinkedIn’s 2026 Jobs on the Rise (US)',
    ],
    diagram: `flowchart LR
  E["🧪 experimenting<br/>39%"] --> G["🕳️ the gap<br/>pilots that never ship"]
  G --> S["🚀 scaling<br/>23%"]
  P["👤 the person who<br/>closes the gap"] --> G`,
    script: L(
      'SITUATION: Ground the excitement in real adoption numbers. This is where you sound like you know your stuff.',
      'ROOM: Diagram up.',
      'MOOD: Analyst. Crisp numbers, no hype.',
      'OPEN: "Let me show you where companies actually are, not where the press releases say they are."',
      'SAY: Almost four in ten companies are experimenting. Fewer than a quarter have anything running at scale. That middle box, the pilots that never ship, is the most expensive place in corporate America right now.',
      'SAY: The person who walks a pilot across that gap into production is the person this whole night is about.',
      'DO: Trace the arrow from "the person" into "the gap".',
      'NOTE: The McKinsey survey ran in summer 2025 and was published November 2025. Say "McKinsey’s latest State of AI" rather than "this year".',
    ),
  },
  {
    segment: 'news', eyebrow: '🗣️ What the people building it are saying',
    title: 'The jobs are not going to AI. They are going to people who use AI.',
    body: 'Employers cited AI in more than one hundred and twelve thousand US job cuts through July of this year, more than double the whole of 2025, according to Challenger, Gray and Christmas. At the same time, AI engineer is the fastest-rising job in the country. Both are true. The work is moving, and it is moving to the people who can direct these systems.',
    bullets: [
      '“We may indeed have a serious employment crisis on our hands as the pipeline for these early-stage white-collar work starts to contract.” — Dario Amodei, Anthropic CEO, spring 2026',
      'Jensen Huang, NVIDIA CEO (Fortune, Apr 2026): workers will lose jobs to people who use AI, not to AI itself',
      '112,713 US job cuts citing AI through July 2026 (Challenger, Gray & Christmas)',
    ],
    script: L(
      'SITUATION: The honest, slightly uncomfortable slide. Do not soften it and do not dramatize it.',
      'ROOM: Slide up. Read the Amodei quote yourself, word for word.',
      'MOOD: Serious, then turning. You end this slide on opportunity.',
      'OPEN: "I am not going to pretend this is all good news. Here is the CEO of Anthropic, in his own words."',
      'SAY: One hundred and twelve thousand job cuts this year where the employer said AI was the reason. That is real.',
      'SAY: And Jensen Huang said it best: you are not competing with AI. You are competing with the person next to you who knows how to use it. Tonight is about being that person.',
      'DO: After the quote, step back from the camera a little, then lean in on "be that person".',
      'NOTE: The Huang line is a paraphrase of his Fortune interview. Say "Jensen Huang said, roughly". Never present it as a verbatim quote.',
    ),
  },

  /* ================================ role =============================== */
  {
    segment: 'role', eyebrow: '🛠️ The role',
    title: 'A Forward Deployed Engineer is an architect who ships inside the customer’s business',
    body: 'Palantir made the role famous. OpenAI and Anthropic now hire for it, and the consulting firms are building whole practices around it. An FDE sits with the business, finds the process worth automating, designs the system, builds it with tools like Claude Code, puts the guardrails around it, and stays until it works with real data and real people. Half engineer, half consultant, all accountability.',
    bullets: [
      'Sits with the customer, not behind a ticket queue',
      'Turns a messy business problem into a system design',
      'Builds it fast with AI tools, then makes it safe and reliable',
      'Owns the outcome: adoption, numbers, trust',
    ],
    diagram: `flowchart LR
  B["🏢 business problem"] --> D["🧭 design<br/>the architect"]
  D --> Bu["🤖 build<br/>Claude Code"]
  Bu --> G["🛡️ guardrails<br/>+ evals"]
  G --> P["📈 production<br/>real users, real data"]
  P -.what we learned.-> B`,
    script: L(
      'SITUATION: Define the role so concretely that people can picture their Monday in it.',
      'ROOM: Diagram up. Walk it left to right.',
      'MOOD: Teacher. Clear and visual.',
      'OPEN: "So what does one of these people actually do all day?"',
      'SAY: Notice where the AI is in that picture: one box. The other four are judgment. Finding the problem, designing the system, making it safe, owning the result.',
      'SAY: That is why this job pays what it pays. The code got cheap. The judgment did not.',
      'DO: Tap each box as you name it, then circle back along the dotted line.',
      'NOTE: If someone asks "do I need to be a programmer": no. They need to learn to direct Claude Code and think in systems, and the program teaches both. Many of the strongest builders come from operations, finance and project management, because they already understand the business problem.',
    ),
  },
  {
    segment: 'role', eyebrow: '📈 Demand',
    title: 'FDE job postings grew more than eightfold in one year',
    body: 'Indeed data reported by Business Insider: five thousand three hundred and thirty Forward Deployed Engineer postings in April 2026, against six hundred and forty-three in April 2025. That is a seven hundred percent jump in twelve months, for a title that barely existed outside Palantir three years ago.',
    bullets: [
      'April 2025: 643 FDE postings',
      'April 2026: 5,330 FDE postings',
      '+729% in a year (Indeed data, via Business Insider)',
      'The supply of people with real deployment proof did not grow eightfold',
    ],
    script: L(
      'SITUATION: Pure demand slide. One number does the work.',
      'ROOM: Slide up.',
      'MOOD: Let the number be the drama. You do not need to add any.',
      'OPEN: "Six hundred and forty-three. That was April of last year."',
      'SAY: Five thousand three hundred and thirty. That was April of this year.',
      'SAY: The number of people who can actually prove they have done this work did not grow eightfold. That gap is your opening.',
      'DO: Say both numbers slowly, with a pause between them.',
      'NOTE: This is Indeed data reported by Business Insider, a secondary source. Attribute it exactly that way if asked.',
    ),
  },

  /* ================================= pay =============================== */
  {
    segment: 'pay', eyebrow: '💰 What it pays',
    title: 'Median total compensation: $205,000',
    body: 'Levels.fyi tracks self-reported offers. For Forward Deployed Engineers the median total compensation is about two hundred and five thousand dollars, and the middle half of the market sits between one hundred and seventy-two and two hundred and seventy-seven thousand. That is the median, not the top. The frontier labs post base salary ranges well above it.',
    bullets: [
      'Median total comp: ~$205K (Levels.fyi, updated Sep 2026)',
      'Middle 50%: $172K – $277K',
      'Total comp includes base, bonus and equity',
      'Source: levels.fyi · Forward Deployed Engineer',
    ],
    script: L(
      'SITUATION: The reveal for the comp question they just answered. Most of the room guesses low.',
      'ROOM: Slide up.',
      'MOOD: Matter-of-fact. Money slides land harder when you say them flat.',
      'OPEN: "Two hundred and five thousand dollars. That is the middle of the market."',
      'SAY: Not the superstar number. The median. Half of the people doing this job earn more than that.',
      'DO: Point at the middle-50% range and read it.',
      'NOTE: Do not quote the six- and seven-figure numbers floating around on blogs for senior lab FDEs. They are unverified. If asked about Anthropic or OpenAI: their posted base ranges are reported above this median, but we have not verified the postings, so say "above the median" and stop.',
    ),
  },
  {
    segment: 'pay', eyebrow: '🚀 Where it leads',
    title: 'The FDE seat is the shortest path to running AI for a business',
    body: 'The person who has deployed AI inside a real business, with real data and real stakes, is the person a company trusts with its AI strategy next. That is the trajectory we see across the industry: from deploying one system, to designing the architecture for many, to owning AI for a team or a whole company. Or to building your own, because you now know exactly what businesses will pay for.',
    bullets: [
      'Deploy one system → Forward Deployed Engineer',
      'Design many → AI Solutions Architect',
      'Own the strategy → Head of AI / AI lead',
      'Or build your own: consulting, product, agency',
    ],
    diagram: `flowchart LR
  F["🛠️ FDE<br/>deploys one system"] --> A["🏛️ AI Architect<br/>designs many"]
  A --> H["🧭 Head of AI<br/>owns the strategy"]
  F --> O["🚀 your own firm<br/>or product"]`,
    script: L(
      'SITUATION: Trajectory. This is the "where does this go" answer for the ambitious people in the room.',
      'ROOM: Diagram up.',
      'MOOD: Visionary but grounded.',
      'OPEN: "Here is why this is not just a job. It is a launchpad."',
      'SAY: Every company that deploys AI is going to need someone who owns it. The people they trust with that seat are the ones who have already made it work somewhere.',
      'DO: Walk the diagram left to right, then come back to the branch going down to "your own firm".',
      'NOTE: This trajectory is our read of the market, not a published statistic. Present it as "the path we see", never as a number.',
    ),
  },

  /* ============================== architect ============================ */
  {
    segment: 'architect', eyebrow: '🏛️ What "architect" means',
    title: 'A coder asks "how do I build it?" An architect asks "what is it allowed to do?"',
    body: 'Anyone can now get an AI to produce working code. The architect is the person who decides what the system should do, what it must never do, who approves the risky moves, what happens when it fails, and how you prove it worked. That way of thinking is exactly what the FDE role pays for, and it is what an AI cannot do for you, because it requires owning the consequences.',
    bullets: [
      'What problem is actually worth solving?',
      'What is this system allowed to do, and what is it never allowed to do?',
      'Who approves the risky actions?',
      'What happens when it fails, and how do we know?',
      'How do we prove it worked, in business numbers?',
    ],
    script: L(
      'SITUATION: The heart of the night. This is the Colaberry difference: we teach architects, not prompt typists.',
      'ROOM: Slide up. Five questions. Read them as a ladder.',
      'MOOD: Thoughtful. Slow. This is the slide people will quote back to you.',
      'OPEN: "Here is the difference between a coder and an architect, and it is the most important slide of the night."',
      'SAY: Claude Code can write the code. It cannot own the consequences. The person who asks these five questions before anything ships is the person every company is trying to hire.',
      'DO: Read the five questions one at a time. Pause after "never allowed to do".',
      'NOTE: Next comes the story, then they get to try thinking like an architect on a real decision. Do not explain the answer before the vote.',
    ),
  },

  /* =============================== program ============================= */
  {
    segment: 'program', eyebrow: '🗺️ The 12 weeks',
    title: 'Twelve weeks, four intensives, one system you build from scratch',
    body: 'The AI Systems Architect Accelerator is a twelve-week, project-based program powered by Anthropic and Claude Code. You arrive with an idea and leave with a deployed AI system. Every week has an Architecture Day where you learn how the system should be designed, and a Build Day where you build it, live, with your instructor.',
    bullets: [
      'Weeks 1–3 · Build Your AI Foundation',
      'Weeks 4–6 · Create Your AI Team (agents)',
      'Weeks 7–9 · Connect AI to the Real World',
      'Weeks 10–12 · Design AI That Scales (governance, reliability)',
      'November cohort kicks off Thursday, November 12',
    ],
    diagram: `flowchart LR
  W1["🧱 Wk 1–3<br/>foundation"] --> W4["🤖 Wk 4–6<br/>AI team"]
  W4 --> W7["🔌 Wk 7–9<br/>real world"]
  W7 --> W10["🏛️ Wk 10–12<br/>scale + govern"]
  W10 --> D["🚀 deployed system"]`,
    script: L(
      'SITUATION: Program walkthrough. Remember the Anthropic slide: learn it, then a 12-week build, then prove it. Same shape.',
      'ROOM: Diagram up.',
      'MOOD: Proud and specific.',
      'OPEN: "Remember Anthropic’s program? Learn it, spend twelve weeks building something real, then prove it. Here is ours."',
      'SAY: Twelve weeks. Four intensives. By week twelve you are designing the governance and reliability layer, the exact work that separates a demo from a production system.',
      'DO: Walk the four boxes, then land on "deployed system".',
      'NOTE: November cohort starts Thursday, November 12.',
    ),
  },
  {
    segment: 'program', eyebrow: '⏰ Built around your life',
    title: 'Self-paced, with live sessions every week. Join live, or watch it later.',
    body: 'Most of the people in this program have a job, a family, or both. Some are between jobs and want to use this window. The program is self-paced, so you move on your schedule, and there are live sessions every week that you can join live or watch afterward. Either way you build the same system, get the same feedback and earn the same proof.',
    bullets: [
      'Self-paced: work on your own time',
      'Live sessions every week: join live or watch the recording',
      'Working full time? It fits around the job',
      'Between jobs? Use the window to build proof, not just apply',
    ],
    script: L(
      'SITUATION: Remove the "I don’t have time" objection before it is raised.',
      'ROOM: Slide up.',
      'MOOD: Empathetic and practical.',
      'OPEN: "I know what some of you are thinking: I have a job. Or: I am between jobs and I need to be job hunting, not studying."',
      'SAY: It is self-paced. Live sessions every week, and if you cannot make one, you watch it later.',
      'SAY: If you are between jobs, hear this: the people getting hired right now are not the ones with the best résumé. They are the ones who can show the thing they built.',
      'DO: Look into the camera on the last line.',
    ),
  },

  /* ================================ proof ============================== */
  {
    segment: 'proof', eyebrow: '📂 Proof, not promises',
    title: 'Internship, real projects and a GitHub profile that proves you can perform',
    body: 'Anthropic certifies knowledge. Colaberry certifies capability. Membership includes an internship experience on real AI projects, guided portfolio projects, and a GitHub profile where every system you build lives with its code, its decisions and its results, plus case studies that tell the business story. When an interviewer asks "have you deployed AI?", you send a link.',
    bullets: [
      'Internship experience on real AI projects',
      'Guided portfolio projects, built from scratch',
      'A GitHub profile with every system, decision and result',
      'Case studies that tell the business story',
      'Anthropic Architect certification prep (CCA-F) included',
    ],
    diagram: `flowchart LR
  B["🛠️ you build it"] --> G["📂 GitHub<br/>code + decisions"]
  G --> C["📑 case study<br/>business results"]
  C --> R["🎓 certification"]
  R --> H["🤝 the interview:<br/>'here is the link'"]`,
    script: L(
      'SITUATION: The proof slide. This is what the FDE hiring manager actually needs to see.',
      'ROOM: Diagram up.',
      'MOOD: Confident. This is the product.',
      'OPEN: "Here is the line I want you to remember: Anthropic certifies knowledge. Colaberry certifies capability."',
      'SAY: A certificate says you studied it. A GitHub profile full of working systems, with a case study for each, says you can do it. FDE hiring managers want the second one.',
      'DO: Land on the last box and say "you send a link" slowly.',
      'NOTE: Certification is Anthropic Architect certification PREP. Do not say we issue the Anthropic certification, and do not promise anyone passes.',
    ),
  },

  /* ============================= investment ============================ */
  {
    segment: 'investment', eyebrow: '🧮 The math of a year',
    title: 'Your year: Colaberry + Claude, $1,988 total',
    body: 'Here is the whole stack for a year. Colaberry membership at our founding rate: one hundred and forty-nine dollars a month, billed annually, one thousand seven hundred and eighty-eight dollars, and that rate stays locked for as long as your membership is active. Add a year of Claude Pro, the tool you build with, at two hundred dollars billed annually. That is one thousand nine hundred and eighty-eight dollars for a year of building, against a role whose median pays over two hundred thousand.',
    bullets: [
      'Colaberry membership · $149/mo billed annually = $1,788/yr',
      'Founding rate, locked while your membership stays active',
      'Claude Pro · $17/mo billed annually = $200/yr',
      'Total for a year of building: $1,988',
      'Start at $0 tonight · no card needed',
    ],
    script: L(
      'SITUATION: The price slide. Lead with the annual plan ALONE.',
      'ROOM: Slide up.',
      'MOOD: Calm, transparent, confident. Never apologize for the price.',
      'OPEN: "Let me show you the whole year, including the tool, so there are no surprises."',
      'SAY: One thousand seven hundred and eighty-eight for Colaberry, at a founding rate that stays locked. Two hundred for a year of Claude. One thousand nine hundred and eighty-eight dollars for the year.',
      'SAY: You just saw the median for this role. Do the math on what one year of proof is worth.',
      'DO: Point at the total, then at "start at $0".',
      'NOTE: Do NOT mention the $199 month-to-month option unless someone pushes back on price or commitment. If they do: "There is a month-to-month option at $199. Most people choose the year because it is cheaper and the year is what it takes." Never say the word "free": say "$0 to start" or "no card needed".',
    ),
  },
  {
    segment: 'investment', eyebrow: '📅 Why a year, not a month',
    title: 'Twelve weeks teaches you. Twelve months makes you hireable.',
    body: 'The twelve weeks build the system and the skills. The rest of the year is where the proof compounds: the internship, a second and third project, the certification, the case studies, a live cohort and community around you while you interview or pitch. A monthly plan makes you ask every month whether to keep going. A year makes the decision once, and spends the whole year on the work.',
    bullets: [
      'Months 1–3: the 12-week program, your first deployed system',
      'Months 4–6: internship + second project + certification prep',
      'Months 7–12: case studies, portfolio, interviews, your own clients',
      'One decision, a locked rate, and a year of momentum',
    ],
    diagram: `flowchart LR
  Q1["📘 months 1–3<br/>learn + build"] --> Q2["🛠️ months 4–6<br/>internship + cert"]
  Q2 --> Q3["📂 months 7–12<br/>proof + interviews"]
  Q3 --> Y["🏁 a year from now:<br/>an FDE portfolio"]`,
    script: L(
      'SITUATION: The annual case. This is the most important sales slide. The math vote follows it.',
      'ROOM: Diagram up.',
      'MOOD: Coach. You are on their side.',
      'OPEN: "Here is why I push the year."',
      'SAY: Twelve weeks teaches you. Twelve months makes you hireable. Anthropic’s own program is a 12-week residency after the training, because the proof is in the doing.',
      'SAY: A year from tonight, imagine opening your GitHub and seeing three deployed systems, a certification and case studies with business numbers. That is an FDE portfolio. That is what the year buys.',
      'DO: Walk the timeline, and stop on "a year from now".',
    ),
  },

  /* ============================== giveaway ============================= */
  {
    segment: 'books', eyebrow: '📚 Giveaway #1 · 3 copies',
    title: 'Trust Before Intelligence, by Ram Katamaraja',
    body: 'Our CEO, Ram Katamaraja, wrote the book on why AI agent projects fail and how to build ones that do not: the three frameworks, the right infrastructure and the ninety-day fix. Three copies go to three people in this room, right now. Entering takes one tap on your phone.',
    bullets: [
      'Trust Before Intelligence: Why 95% of AI Agent Projects Fail',
      'By Ram Katamaraja, CEO of Colaberry · on Amazon',
      '3 copies · drawn live, right now',
      'Tap “I’m in” on your phone to enter',
    ],
    script: L(
      'SITUATION: First giveaway. Energy up. Celebration mode.',
      'ROOM: Slide up. The draw slide is next.',
      'MOOD: Game-show host.',
      'OPEN: "Alright. Who wants a book?"',
      'SAY: Ram wrote the book on this, literally. Everything we teach about building agents that companies can trust is in here.',
      'DO: Advance to the draw. Tell everyone to tap "I’m in" now, and watch the entry count climb.',
      'NOTE: The draw only includes people logged in on their phones. Remind anyone who has not scanned to scan now.',
    ),
  },
  {
    segment: 'scholarships', eyebrow: '🎓 Giveaway #2 · 3 scholarships',
    title: 'Three scholarships: 50% off a full year of membership',
    body: 'Three people tonight win a scholarship worth fifty percent of the annual membership. A year at the founding rate is one thousand seven hundred and eighty-eight dollars. The scholarship is worth eight hundred and ninety-four dollars, so the year costs you eight hundred and ninety-four. Add Claude Pro and your whole year of building is one thousand and ninety-four dollars.',
    bullets: [
      'Value: $894 (50% of $1,788)',
      'Your year of membership: $894',
      'With a year of Claude Pro: $1,094 total',
      'Applies to the annual membership',
      '3 winners · drawn live, right now',
    ],
    script: L(
      'SITUATION: The big giveaway. This is the climax of the night.',
      'ROOM: Slide up. The draw slide is next.',
      'MOOD: Maximum energy.',
      'OPEN: "Now the big one."',
      'SAY: Fifty percent off a full year. That is eight hundred and ninety-four dollars. A year of building with Claude for one thousand and ninety-four dollars, all in.',
      'DO: Advance to the draw. Build suspense before every click on Draw.',
      'NOTE: Winners: the admissions team follows up by email tonight with how to claim. The scholarship applies to the annual plan. Confirm any other terms with Ali before you promise them.',
    ),
  },

  /* ================================ close ============================== */
  {
    segment: 'close', eyebrow: '✅ Tonight',
    title: 'Start tonight. A year from now you will have the proof.',
    body: 'Two ways in. Enroll in the annual membership tonight and lock the founding rate before the November 12 kickoff. Or start at zero dollars with no card needed: create your account, look around the platform, and decide. Either way, do it tonight while it is fresh, because the person who starts tonight is three days into building by the time the person who waits has finished thinking about it.',
    bullets: [
      'Annual membership · $149/mo billed annually, rate locked',
      'Or start at $0 · no card needed',
      'November cohort kicks off Thursday, November 12',
      'Questions? Stay on, we are here',
    ],
    script: L(
      'SITUATION: The close. One clear ask.',
      'ROOM: Slide up. Have the enrollment link ready to paste in chat.',
      'MOOD: Direct and warm. Not pushy.',
      'OPEN: "So here is my ask."',
      'SAY: Make the decision tonight. Lock the year at the founding rate before the 12th. And if you are not ready to commit, start at zero dollars, no card, and look around tonight.',
      'SAY: Anthropic just told the whole world what the next job is. You now know more about it than ninety-nine percent of the people who will apply for it. Go build the proof.',
      'DO: Paste the enrollment link in the chat as you say "tonight". Then take the last vote.',
      'NOTE: Stay on for questions after the vote. The best conversions happen in the five minutes after the formal close.',
    ),
  },
];

/* ---------------------------------------------------------- story beats ---- */
const STORY_BEATS = [
  {
    segment: 'architect', icon: '💸', tone: 'amber', eyebrow: '📖 A true-to-life story',
    title: 'The agent that worked perfectly and lost $2,400',
    body: 'A support agent was given a refund tool so it could handle the easy cases. A request came in that looked ordinary, and it refunded $2,400 to an account created six minutes earlier, with a shipping address changed after the order, after four other refunds that day. Every one of those facts was in the system. Nothing was responsible for checking them. Every line of code ran correctly.',
    punch: 'It was not a bug. It was a permission nobody thought to withhold.',
  },
];

/* --------------------------------------------------------- interactions ---- */
const INTERACTIONS = [
  /* welcome */
  {
    segment: 'welcome', kind: 'poll', theater: true, liveBars: true,
    q: 'Where are you right now?',
    options: ['Working, and I want to level up', 'Between jobs, and using this window', 'Running my own business', 'Student or changing careers'],
    eyebrow: '👋 Check in', title: 'Where are you right now?',
    presenterTip: L(
      'SITUATION: First vote of the night. The bars move as votes land, so the room watches itself fill in.',
      'ROOM: Theater view. Count climbs at the top.',
      'MOOD: Playful. Celebrate every vote.',
      'OPEN: "First vote. Grab your phone. Where are you right now?"',
      'DO: Read the climbing number out loud as it moves. Once it slows, Lock, then Reveal.',
      'SAY: Look at this room. However you answered, there are people here just like you, and that matters, because the cohort is who you build next to.',
      'NOTE: If the count stays at zero, the phones are not logged in. Put the QR back up (Q key) and say: scan, log in, and you will see the question.',
    ),
  },
  {
    segment: 'welcome', kind: 'prediction', theater: true, liveBars: true,
    q: 'In October, Anthropic committed $100 million to train a new kind of engineer. How many are they training?',
    options: ['1,000', '5,000', '10,000', '50,000'],
    eyebrow: '🔮 Predict', title: 'Make your call',
    presenterTip: L(
      'SITUATION: A prediction. The answer, 10,000, is the next slide. Do not reveal it here.',
      'ROOM: Theater. Bars move live.',
      'MOOD: Suspense.',
      'OPEN: "Here is a real number from this month. Make your call."',
      'DO: Let votes land, Lock, Reveal the spread, then advance. The next slide is the answer.',
      'NOTE: No correct option is marked on purpose. The next slide is the reveal.',
    ),
  },
  /* signal */
  {
    segment: 'signal', kind: 'poll', theater: true, liveBars: true,
    q: 'Honestly: how do you feel about AI and your career right now?',
    options: ['Excited, I see the opportunity', 'Anxious, I worry about being left behind', 'Both, depending on the day', 'Curious, still figuring it out'],
    eyebrow: '❤️ Gut check', title: 'How do you feel about it?',
    presenterTip: L(
      'SITUATION: An emotional vote. Whatever the split, honor it.',
      'ROOM: Theater. Bars move live.',
      'MOOD: Human. Warm.',
      'OPEN: "No wrong answers. How do you really feel about AI and your career?"',
      'DO: Lock, Reveal, and read the biggest bar.',
      'SAY: If you picked "both", you are in good company. The anxiety is a signal, not a verdict. The cure for it is building something.',
    ),
  },
  /* news */
  {
    segment: 'news', kind: 'trivia', theater: true,
    q: 'Gartner predicts what share of enterprise apps will feature task-specific AI agents by 2026?',
    options: ['Under 5%', 'About 15%', 'About 40%', 'About 75%'],
    answer: 2,
    reveal: 'About 40%, up from under 5% in 2025 (Gartner, August 2025). Eight times more agent-powered apps in one year, and every one of them needs someone to deploy it.',
    eyebrow: '🧠 Quick check', title: 'Guess the number',
    presenterTip: L(
      'SITUATION: Trivia with a correct answer. Names of people who got it right appear on reveal.',
      'ROOM: Theater. The count climbs; the bars stay hidden until the reveal.',
      'MOOD: Game show.',
      'OPEN: "Gartner put a number on this. What do you think it is?"',
      'DO: Lock, then Reveal. Call out a few names from the "got it right" list.',
      'SAY: Forty percent, up from under five. Eight times more agent-powered software, and somebody has to deploy every one of them.',
    ),
  },
  /* role */
  {
    segment: 'role', kind: 'trivia', theater: true,
    q: 'What is the median total compensation for a Forward Deployed Engineer (Levels.fyi)?',
    options: ['About $95,000', 'About $140,000', 'About $205,000', 'About $350,000'],
    answer: 2,
    reveal: 'About $205,000 median total compensation, with the middle half between $172K and $277K (Levels.fyi, September 2026).',
    eyebrow: '💰 Guess the pay', title: 'What does it pay?',
    presenterTip: L(
      'SITUATION: The comp reveal. Most of the room guesses low.',
      'ROOM: Theater.',
      'MOOD: Suspense, then a big reveal.',
      'OPEN: "OK. What do you think this role pays? Median, total compensation."',
      'DO: Lock, Reveal, read the names who got it right. The next slide unpacks it.',
    ),
  },
  /* pay */
  {
    segment: 'pay', kind: 'poll', theater: true, liveBars: true,
    q: 'Which part of the FDE job do you think is the hardest?',
    options: ['Writing the code', 'Understanding the business problem', 'Earning the customer’s trust', 'Making it work in production'],
    eyebrow: '🤔 Your take', title: 'What is the hard part?',
    presenterTip: L(
      'SITUATION: An opinion vote that sets up the architect segment.',
      'ROOM: Theater. Bars move live.',
      'MOOD: Curious.',
      'OPEN: "Which part of that job do you think is the hard part?"',
      'DO: Lock, Reveal.',
      'SAY: If you picked "writing the code", that is the one part that got easy. The other three are what we spend twelve weeks on, and they are why it pays what it pays.',
    ),
  },
  /* architect */
  {
    segment: 'architect', kind: 'trivia', theater: true,
    q: 'A bank wants an AI agent issuing customer refunds by Friday. As the architect, what is your FIRST move?',
    options: ['Start building the agent so you hit Friday', 'Define what it may refund, the limits, and who approves the rest', 'Pick the most powerful model available', 'Write a really detailed prompt'],
    answer: 1,
    reveal: 'The architect decides what the system is allowed to do before anything is built: limits, approvals, and what happens when it is wrong. The model and the prompt matter, but they come after the authority is designed.',
    eyebrow: '🎭 Decision theater', title: 'You are the architect. Decide.',
    presenterTip: L(
      'SITUATION: The room tries architect thinking live, right after the $2,400 story.',
      'ROOM: Theater. Hidden bars, names on reveal.',
      'MOOD: High stakes. You are the client asking.',
      'OPEN: "I am the bank. I want this live by Friday. You are my architect. What do you do first?"',
      'DO: Lock, Reveal. Read the names who chose B. Celebrate them by name.',
      'SAY: That is the whole job in one decision. Everyone can build. The architect decides what it is allowed to do. That is the person companies pay two hundred thousand dollars for.',
    ),
  },
  /* program */
  {
    segment: 'program', kind: 'poll', theater: true, liveBars: true,
    q: 'If you started on November 12, what would you want to build first?',
    options: ['An agent for my current job', 'A product for my own business', 'A portfolio project to get hired as an FDE', 'Something for my community or a nonprofit'],
    eyebrow: '🛠️ Your first build', title: 'What would you build?',
    presenterTip: L(
      'SITUATION: Get them picturing themselves in the program.',
      'ROOM: Theater. Bars move live.',
      'MOOD: Excited, future-focused.',
      'OPEN: "Imagine it is November 12. What would you build first?"',
      'DO: Lock, Reveal.',
      'SAY: Every one of those is a real capstone. You arrive with the idea, and you leave with it deployed.',
    ),
  },
  /* proof */
  {
    segment: 'proof', kind: 'poll', theater: true, liveBars: true,
    q: 'If an FDE hiring manager asked you for proof tomorrow, what could you show them?',
    options: ['A GitHub profile with deployed AI systems', 'An AI certification', 'A case study with business results', 'Honestly, nothing yet'],
    eyebrow: '📂 Be honest', title: 'What could you show?',
    presenterTip: L(
      'SITUATION: The honest gap. Most of the room will pick "nothing yet". That is the point.',
      'ROOM: Theater. Bars move live.',
      'MOOD: Kind, and direct.',
      'OPEN: "Be honest with yourself on this one. Nobody sees your name."',
      'DO: Lock, Reveal, and read the "nothing yet" bar.',
      'SAY: That bar is the reason this program exists. Twelve months from now, every one of those options can be yours.',
    ),
  },
  /* investment */
  {
    segment: 'investment', kind: 'trivia', theater: true,
    q: 'A full year of Colaberry + Claude Pro is $1,988. At the FDE median ($205K), that is roughly how much work?',
    options: ['About 2 months of pay', 'About 1 month of pay', 'About 2 weeks of pay', 'About 2½ working days of pay'],
    answer: 3,
    reveal: '$205,000 over about 260 working days is roughly $790 a day. $1,988 is about two and a half working days. That is the whole year of building.',
    eyebrow: '🧮 Do the math', title: 'What does a year cost, really?',
    presenterTip: L(
      'SITUATION: The value-math vote. It makes the annual decision obvious.',
      'ROOM: Theater. Hidden bars, names on reveal.',
      'MOOD: Light, confident.',
      'OPEN: "Let us do the math together."',
      'DO: Lock, Reveal. Read the math line slowly.',
      'SAY: Two and a half days. A whole year of building, for two and a half days of what this role pays at the median.',
      'NOTE: This is arithmetic on the Levels.fyi median, not a promise of income. Never say anyone will earn it. Say "this role pays".',
    ),
  },
  /* giveaway */
  {
    segment: 'books', kind: 'trivia', theater: true, raffle: 3,
    q: '📚 Enter the draw for one of 3 copies of Trust Before Intelligence',
    options: ['🎟️ I’m in, enter me'],
    answer: 0,
    reveal: 'You are in. Three names, drawn live.',
    eyebrow: '🎲 Book draw', title: 'Three books. Tap to enter.',
    presenterTip: L(
      'SITUATION: Live draw #1. Everyone who taps "I’m in" is an entrant.',
      'ROOM: Theater. Watch the count climb as people enter.',
      'MOOD: Party.',
      'OPEN: "Tap I am in, right now. Everybody."',
      'DO: When the count stops climbing: Lock, then Reveal (it shows how many are in), then hit Draw winner three times, one name per click, with a drumroll.',
      'NOTE: If nobody appears after Reveal, the draw has no entrants: ask them to tap again, Reopen, and repeat. Write the winners down for admissions.',
    ),
  },
  {
    segment: 'scholarships', kind: 'trivia', theater: true, raffle: 3,
    q: '🎓 Enter the draw for one of 3 scholarships: 50% off a year ($894 value)',
    options: ['🎟️ I’m in, enter me'],
    answer: 0,
    reveal: 'You are in. Three scholarships, drawn live.',
    eyebrow: '🎲 Scholarship draw', title: 'Three scholarships. Tap to enter.',
    presenterTip: L(
      'SITUATION: Live draw #2, the big one.',
      'ROOM: Theater.',
      'MOOD: Maximum celebration.',
      'OPEN: "This is the big one. Tap I am in."',
      'DO: Lock, Reveal, then Draw winner three times. Make every click a moment: say the name, and congratulate them by name.',
      'SAY: Winners, admissions will email you tonight with how to claim it.',
      'NOTE: Write the three winners down immediately and send them to admissions.',
    ),
  },
  /* close */
  {
    segment: 'close', kind: 'poll', theater: true, liveBars: true,
    q: 'Where are you leaving tonight?',
    options: ['Enrolling in the annual membership tonight', 'Starting at $0 tonight, deciding this week', 'I need to talk it over with family or my manager', 'Still exploring'],
    eyebrow: '🏁 Last vote', title: 'Where are you leaving tonight?',
    presenterTip: L(
      'SITUATION: The final vote. It doubles as a commitment device.',
      'ROOM: Theater. Bars move live.',
      'MOOD: Warm, celebratory.',
      'OPEN: "Last vote of the night. Where are you leaving tonight?"',
      'DO: Lock, Reveal. Celebrate the enrollers, and invite everyone else to stay on for questions.',
      'SAY: To everyone who picked "talk it over": do it tonight, and bring them the slide with the math.',
      'NOTE: Admissions follows up with the "starting at $0" and "talk it over" groups by email tomorrow.',
    ),
  },
];

/* ---------------------------------------------------------- slide notes ---- */
const SLIDE_NOTES = {
  'cover:welcome-0': L(
    'SITUATION: Doors open. People are trickling in.',
    'ROOM: Cover up. Music if you have it. Hit Start class the moment you begin talking.',
    'MOOD: Warm host energy.',
    'OPEN: "Welcome, welcome! Come on in. We are going to start in just a minute."',
    'DO: Greet people by name as they appear in the ticker on the rail.',
    'NOTE: Start on time. Latecomers catch up on the next slide.',
  ),
  'rules:welcome-1': L(
    'SITUATION: Everyone scans the QR and logs in. Every vote and both giveaways depend on this.',
    'ROOM: QR on screen. Watch the checked-in count.',
    'MOOD: Patient and upbeat.',
    'OPEN: "Grab your phone. Scan this code and log in. That is how you vote tonight, and how you enter the giveaways."',
    'DO: Wait until the checked-in number stops climbing. Read it out loud.',
    'NOTE: People without a login: they sign up on the same page in seconds, $0, no card needed. Never say "free".',
  ),
  'hook:welcome--1': L(
    'SITUATION: The one-sentence hook.',
    'ROOM: Hook slide.',
    'MOOD: Dramatic. Slow.',
    'OPEN: Read the headline, word for word, and stop.',
    'DO: Count three in your head before you advance.',
  ),
};

/* --------------------------------------------------------------- build ---- */
function buildConfig(before) {
  const base = before && typeof before === 'object' ? before : {};
  return {
    ...base,
    theaterEnabled: true,
    checkpointsEnabled: false,
    teach: { enabled: true, max: null, overrides: TEACH },
    storyBeats: { enabled: true, max: null, overrides: STORY_BEATS },
    interactions: { enabled: true, max: null, overrides: INTERACTIONS },
    prompts: { enabled: false, max: null, overrides: [] },
    opening: {
      hook: { enabled: true, override: HOOK },
      coldOpen: { enabled: false, override: null },
      resultPreview: { enabled: false, override: null },
    },
    slideNotes: SLIDE_NOTES,
  };
}

const TAGS = /^(SITUATION|ROOM|MOOD|OPEN|SAY|DO|NOTE):/;
const SEGMENTS = ['welcome', 'signal', 'news', 'role', 'pay', 'architect', 'program', 'proof', 'investment', 'books', 'scholarships', 'close'];

function lint() {
  const bad = [];
  const tagged = (s, where) => String(s || '').split('\n').forEach((line) => {
    if (!TAGS.test(line)) bad.push(`untagged line in ${where}: ${line.slice(0, 50)}`);
  });
  TEACH.forEach((t) => { tagged(t.script, t.title); if (!SEGMENTS.includes(t.segment)) bad.push(`unknown segment ${t.segment}`); });
  INTERACTIONS.forEach((q) => {
    tagged(q.presenterTip, q.q);
    if (!SEGMENTS.includes(q.segment)) bad.push(`unknown segment ${q.segment}`);
    if (q.kind === 'trivia' && typeof q.answer !== 'number') bad.push(`trivia without answer: ${q.q}`);
    if (typeof q.answer === 'number' && !q.reveal) bad.push(`answer without reveal: ${q.q}`);
    if (q.raffle && q.answer !== 0) bad.push(`raffle must use answer 0: ${q.q}`);
  });
  Object.entries(SLIDE_NOTES).forEach(([k, v]) => tagged(v, k));
  // TWC 40 TAC 807.172(d): never "free" or "guarantee" on any surface.
  const all = JSON.stringify({ HOOK, TEACH, STORY_BEATS, INTERACTIONS, SLIDE_NOTES, SESSION });
  const banned = all.match(/\bfree\b|\bguarantee(d)?\b/gi) || [];
  // Presenter notes may tell the presenter NOT to say the word; only quoted bans are allowed.
  const allowed = (all.match(/never say (the word )?\\?"free\\?"|Never say \\?"free\\?"/gi) || []).length;
  if (banned.length > allowed) bad.push(`TWC banned word count ${banned.length} (allowed ${allowed})`);
  // Pricing order: $199 month-to-month only in presenter notes, never on a slide.
  const onSlides = JSON.stringify({ HOOK, TEACH: TEACH.map((t) => ({ ...t, script: '' })), STORY_BEATS, INTERACTIONS: INTERACTIONS.map((q) => ({ ...q, presenterTip: '' })) });
  if (/\$199/.test(onSlides)) bad.push('$199 appears on a slide; it belongs in presenter notes only');
  // Interactivity: no run of more than 3 content slides without a question.
  let run = 0;
  SEGMENTS.forEach((seg) => {
    run += TEACH.filter((t) => t.segment === seg).length + STORY_BEATS.filter((b) => b.segment === seg).length;
    if (run > 3) bad.push(`${run} content slides in a row before a question (segment ${seg})`);
    if (INTERACTIONS.some((q) => q.segment === seg)) run = 0;
  });
  return bad;
}

function summary() {
  return `teach=${TEACH.length} storyBeats=${STORY_BEATS.length} interactions=${INTERACTIONS.length} `
    + `raffles=${INTERACTIONS.filter((q) => q.raffle).length} slideNotes=${Object.keys(SLIDE_NOTES).length}`;
}

module.exports = { COHORT_NAME, SESSION, HOOK, TEACH, STORY_BEATS, INTERACTIONS, SLIDE_NOTES, buildConfig, lint, summary };

/* ---------------------------------------------------------------- main ---- */
if (require.main === module) {
  const dry = process.argv.includes('--dry');
  const check = process.argv.includes('--check');
  const problems = lint();
  if (problems.length) {
    console.error('LINT FAIL\n  ' + problems.join('\n  '));
    process.exit(1);
  }
  console.error('LINT OK  ' + summary());
  if (check) {
    const json = JSON.stringify(buildConfig(null));
    console.error(`CHECK OK  ${json.length} bytes`);
    process.exit(0);
  }

  const { getKitConfig, saveKitConfig } = require('/app/dist/services/sessionKitConfigService');
  const LiveSession = require('/app/dist/models/LiveSession').default;
  const Cohort = require('/app/dist/models/Cohort').default;

  (async () => {
    const cohort = await Cohort.findOne({ where: { name: COHORT_NAME } });
    if (!cohort) throw new Error(`cohort not found: ${COHORT_NAME}`);
    const cohortId = cohort.get('id');
    // Idempotent create: (cohort, title) identifies the session.
    let session = await LiveSession.findOne({ where: { cohort_id: cohortId, title: SESSION.title } });
    if (!session) {
      if (dry) { console.error('DRY RUN: would create session in ' + cohortId); process.exit(0); }
      session = await LiveSession.create({ ...SESSION, cohort_id: cohortId });
      console.error('CREATED session ' + session.get('id'));
    } else {
      console.error('FOUND session ' + session.get('id'));
    }
    const sid = session.get('id');
    const before = await getKitConfig(sid);
    console.log('BEFORE ' + JSON.stringify(before));
    if (dry) { console.error('DRY RUN: not saving. ' + summary()); process.exit(0); }
    await saveKitConfig(sid, buildConfig(before));

    const after = await getKitConfig(sid);
    const teach = (after.teach && after.teach.overrides) || [];
    const qs = (after.interactions && after.interactions.overrides) || [];
    const beats = (after.storyBeats && after.storyBeats.overrides) || [];
    console.error(`SAVED sid=${sid} teach=${teach.length} interactions=${qs.length} storyBeats=${beats.length} `
      + `raffles=${qs.filter((q) => q.raffle).length} liveBars=${qs.filter((q) => q.liveBars).length}`);
    if (teach.length !== TEACH.length || qs.length !== INTERACTIONS.length || beats.length !== STORY_BEATS.length) {
      console.error('VERIFY FAIL');
      process.exit(1);
    }
    process.exit(0);
  })().catch((e) => { console.error('FAIL ' + e.message); process.exit(1); });
}
