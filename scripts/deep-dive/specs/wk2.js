// Deep Dive Field Guide content spec — Week 2 · Solution Architect. Content only.
module.exports = {
  week: 2,
  role: "Solution Architect",
  tag: "SA · Wk 2",
  sections: [

    {
      id: "dashboard",
      navLabel: "Dashboard",
      eyebrow: "Solution Architect · Week 2",
      title: "Turn approved requirements into a buildable design",
      body: `
<p class="lead">The Solution Architect decides <strong>how the system will be built</strong> — its structure, its technology, and the trade-offs behind every choice — before a line of code is written. Your job as the directing architect is not to draw every box yourself; it is to <strong>direct, evaluate, and approve</strong> the design an AI drafts, so the team builds something that actually holds up under load, under attack, and under budget.</p>
<div class="kpis">
  <div class="kpi"><div class="v">8</div><div class="l">Docs you'll build</div></div>
  <div class="kpi c1"><div class="v">3</div><div class="l">C4 levels</div></div>
  <div class="kpi c2"><div class="v">6</div><div class="l">Quality attributes</div></div>
  <div class="kpi c3"><div class="v">1</div><div class="l">Source of truth</div></div>
</div>
<div class="card">
  <div class="sub">What a good design earns you</div>
  <ul class="clean">
    <li>A blueprint an AI and a team can build from without guessing.</li>
    <li>Quality attributes — scale, security, cost — designed in, not discovered in production.</li>
    <li>Every hard choice recorded with its reasoning, so no one relitigates it in six months.</li>
    <li>A structure where change is cheap, not a demolition.</li>
  </ul>
</div>
<div class="callout"><strong>Running example.</strong> We continue the Week 1 case — a regional restaurant chain launching <em>online ordering</em>. The Business Analyst handed you approved requirements; this week you turn them into a solution architecture. In your own build you may pick Restaurant, Insurance, Healthcare, Retail, or Manufacturing.</div>
`
    },

    {
      id: "overview",
      navLabel: "Overview &amp; Mission",
      eyebrow: "Overview · Mission",
      title: "Why the Solution Architect exists",
      body: `
<p>Approved requirements tell you <strong>what</strong> the restaurant chain needs — reorder in one tap, checkout in under 30 seconds, survive a Friday dinner rush. They do not tell a builder <strong>how</strong> to arrange the moving parts so all of that holds at once. That is the Solution Architect's job: take the signed-off requirements and produce a technical design — the shape of the system, the technologies, the boundaries between parts, and the reasoning behind each decision — a team and an AI can build against with confidence.</p>
<div class="card"><div class="sub">Business value</div><ul class="clean"><li>Makes the expensive requirements — scale, security, uptime, cost — achievable by design.</li><li>Turns "it works on my laptop" into "it holds up on Friday at 7pm."</li><li>Records every trade-off so decisions are deliberate, not accidental.</li><li>Gives the build one authoritative blueprint instead of ten conflicting mental models.</li></ul></div>
<div class="card"><div class="sub">Common misconceptions</div><ul class="clean"><li>"Architecture is just picking a framework." It is the structure and the trade-offs, not a logo.</li><li>"Newer and more distributed is better." The right answer is usually the simplest one that meets the requirements.</li><li>"We'll figure out scale later." Non-functional requirements are cheap to design in and brutal to retrofit.</li><li>"Diagrams are decoration." A diagram no one can build from is waste; a diagram the team builds from is the product.</li></ul></div>
<div class="callout warn"><strong>How AI changes architecture.</strong> AI will produce a plausible, confident design in seconds — diagrams, a stack, patterns and all. What it cannot do is own the trade-offs, weigh your real constraints (budget, team skills, compliance), or notice that the "clean" microservices design it drew will bankrupt a three-person team. You supply judgment; AI supplies the first draft.</div>
`
    },

    {
      id: "twenty",
      navLabel: "The 20% You Need",
      eyebrow: "The 20% You Need to Know",
      title: "Enough architecture to direct and judge it",
      body: `
<p>You do not need to become a Solution Architect. You need these building blocks well enough to tell when an AI's design is over-engineered, unsafe, or quietly ignoring a requirement.</p>
<div class="table-wrap"><table>
  <thead><tr><th>Concept</th><th>What it is</th><th>The tell of good work</th></tr></thead>
  <tbody>
    <tr><td>Quality attributes (NFRs)</td><td>How well the system must perform — scalability, availability, security, performance, maintainability, cost</td><td>Each has a measurable target</td></tr>
    <tr><td>Architecture styles</td><td>Monolith vs services vs event-driven — the big structural shape</td><td>Chosen for the requirement, not the trend</td></tr>
    <tr><td>C4 model</td><td>Diagrams at four zoom levels: Context, Container, Component, Code</td><td>You can zoom from "who uses it" to "what runs where"</td></tr>
    <tr><td>ADR</td><td>Architecture Decision Record — one decision, its context, options, and consequences</td><td>Records the rejected options and the "why"</td></tr>
    <tr><td>Trade-off analysis</td><td>Weighing options against the quality attributes that matter</td><td>Names what each choice costs, not just its wins</td></tr>
    <tr><td>Patterns</td><td>Proven solutions — cache, queue, gateway, circuit breaker, CQRS</td><td>Applied to a real force, not sprinkled on</td></tr>
    <tr><td>Fitness functions</td><td>Automated checks that the architecture stays within its targets</td><td>The design can be tested, not just admired</td></tr>
    <tr><td>Build vs buy</td><td>Deciding what to build vs adopt — payments, auth, search</td><td>Doesn't rebuild a commodity like payments</td></tr>
  </tbody>
</table></div>
<div class="callout"><strong>Example.</strong> Weak: "We'll use microservices and Kafka because they scale." Strong: "Order volume peaks near 40 orders/min per location; a modular monolith on one database meets it at far lower operational cost. We isolate <em>payments</em> behind a gateway and add a queue only for the kitchen-printer integration, which must survive restaurant Wi-Fi drops." The strong version ties each choice to a measured requirement.</div>
`
    },

    {
      id: "role",
      navLabel: "Role in the SDLC",
      eyebrow: "Where it fits",
      title: "Role in the SDLC",
      body: `
<p>The Solution Architect owns the <strong>Design</strong> phase. It takes the approved requirements from the Business Analyst and produces the technical blueprint the build depends on. It sits between "what to build" and "start building."</p>
<div class="flow">
  <div class="step"><div class="k">Before</div><div class="t">Business Analyst — approved requirements</div></div>
  <div class="step"><div class="k">You are here</div><div class="t">Solution Architect</div></div>
  <div class="step"><div class="k">After</div><div class="t">Development &amp; DevOps — the build</div></div>
</div>
<div class="stack" style="margin-top:.4rem">
  <div class="tier"><div class="lab">Gives architecture its input</div><div class="row"><span class="chip">Business Analyst</span><span class="chip">Product Owner</span><span class="chip">Security &amp; Compliance</span></div></div>
  <div class="tier"><div class="lab">The architecture role (you direct it)</div><div class="row"><span class="chip pri">Solution Architect</span></div></div>
  <div class="tier"><div class="lab">Consumes architecture's output</div><div class="row"><span class="chip">Developers</span><span class="chip">DevOps / Platform</span><span class="chip">QA</span></div></div>
</div>
<div class="callout"><strong>Approval gate you own:</strong> the architecture sign-off (design review). Before the build begins, you confirm the design meets every requirement, the quality-attribute targets are achievable, the trade-offs are recorded, and the risky decisions have owners.</div>
`
    },

    {
      id: "io",
      navLabel: "Inputs &amp; Outputs",
      eyebrow: "Section · Inputs &amp; Outputs",
      title: "What comes in, what hands off",
      body: `
<div class="card"><h4>Inputs</h4><ul class="clean"><li>Approved functional &amp; non-functional requirements</li><li>Constraints: budget, timeline, team skills, existing systems</li><li>Compliance &amp; security obligations (e.g. PCI for card payments)</li><li>Expected load &amp; growth — orders per minute, locations, peaks</li></ul></div>
<div class="card"><h4>Outputs</h4><ul class="clean"><li>Solution Architecture Document — the blueprint</li><li>C4 diagrams — context, container, component</li><li>Architecture Decision Records (ADRs)</li><li>NFR spec, technology trade-off matrix, risk register</li></ul></div>
<div class="sub">Information flow</div>
<div class="flow"><div class="step"><div class="k">In</div><div class="t">Approved reqs</div></div><div class="step"><div class="k">Frame</div><div class="t">Quality attributes</div></div><div class="step"><div class="k">Decide</div><div class="t">Style &amp; tech</div></div><div class="step"><div class="k">Model</div><div class="t">C4 + ADRs</div></div><div class="step"><div class="k">Out</div><div class="t">Signed-off design</div></div></div>
`
    },

    {
      id: "responsibilities",
      navLabel: "Responsibilities",
      eyebrow: "Ownership",
      title: "What a Solution Architect actually does",
      body: `
<p>The Solution Architect owns the design decisions and their consequences — not the typing of the code.</p>
<ul class="clean">
  <li>Translate non-functional requirements into concrete, measurable targets.</li>
  <li>Choose the architecture style and justify it against those targets.</li>
  <li>Define the components, their boundaries, and how they communicate.</li>
  <li>Select technologies and make build-vs-buy calls, with trade-offs recorded.</li>
  <li>Produce C4 diagrams and data-flow / sequence views the team can build from.</li>
  <li>Record every significant decision as an ADR.</li>
  <li>Identify architectural risks and define mitigations and fitness functions.</li>
  <li>Run the design review and hold the architecture sign-off gate.</li>
</ul>
<div class="card"><div class="sub">You own vs you don't</div>
  <div class="kv"><span class="k">Own</span><span class="val">Structure · Trade-offs · Tech choice · Sign-off</span></div>
  <div class="kv"><span class="k">Don't own</span><span class="val">Line-by-line code · Detailed UI · Sprint mechanics</span></div>
</div>
`
    },

    {
      id: "artifacts",
      navLabel: "Documents You'll Generate",
      eyebrow: "Section · Documents",
      title: "The 8 documents your Field Guide builds",
      body: `
<p>These are exactly what your Field Guide generates for your chosen example — each viewable, searchable, and downloadable. Learn what each one proves.</p>
<div class="table-wrap"><table>
  <thead><tr><th>Document</th><th>What it proves</th></tr></thead>
  <tbody>
    <tr><td>Solution Architecture Document (SAD)</td><td>The whole design in one authoritative place</td></tr>
    <tr><td>C4 Diagrams (context / container / component)</td><td>The system at three zoom levels the team can build from</td></tr>
    <tr><td>Architecture Decision Records (ADRs)</td><td>Each hard choice, its options, and why one won</td></tr>
    <tr><td>Non-Functional Requirements Spec</td><td>Quality attributes turned into measurable targets</td></tr>
    <tr><td>Technology &amp; Trade-off Matrix</td><td>Options scored against the attributes that matter</td></tr>
    <tr><td>Sequence &amp; Data-Flow Diagrams</td><td>How a real request moves through the system</td></tr>
    <tr><td>Architecture Risk Register</td><td>What could break the design, and the mitigation</td></tr>
    <tr><td>Architecture Package One-Pager</td><td>The executive summary a sponsor signs off</td></tr>
  </tbody>
</table></div>
`
    },

    {
      id: "goodbad",
      navLabel: "Good vs Bad Architecture",
      eyebrow: "Section · Good vs Bad",
      title: "Good vs bad architecture",
      body: `
<div class="card good"><h4>Good architecture</h4><ul>
  <li>Every quality attribute has a measurable target it is designed to meet.</li>
  <li>The style fits the requirement — the simplest structure that works.</li>
  <li>Decisions are recorded as ADRs, with rejected options visible.</li>
  <li>Boundaries are clear; a change stays local instead of rippling.</li>
  <li>Risks are named with mitigations, not hidden by optimism.</li>
</ul></div>
<div class="card bad"><h4>Bad architecture</h4><ul>
  <li>Trend-driven — microservices and a message bus for a form-and-database app.</li>
  <li>NFRs are absent or aspirational ("must be scalable and secure").</li>
  <li>No recorded decisions, so every choice gets relitigated later.</li>
  <li>A big ball of mud — everything depends on everything.</li>
  <li>Resume-driven technology the team can't operate or afford.</li>
</ul></div>
<div class="callout warn"><strong>Red flags in AI-drafted architecture:</strong> a microservices diagram with no stated load, quality attributes listed but never given numbers, patterns named for their own sake, a stack of five databases, and not a single ADR explaining why.</div>
`
    },

    {
      id: "metrics",
      navLabel: "KPIs &amp; Success",
      eyebrow: "Section · Measurement",
      title: "KPIs &amp; success metrics",
      body: `
<p>Architecture quality shows up as signals — some predict trouble early, some confirm it late.</p>
<div class="card"><div class="sub">Design quality signals (leading)</div>
  <div class="kv"><span class="k">NFRs with a measurable target</span><span class="val">100%</span></div>
  <div class="kv"><span class="k">Significant decisions captured as ADRs</span><span class="val">Every one</span></div>
  <div class="kv"><span class="k">Components with a single clear responsibility</span><span class="val">High</span></div>
  <div class="kv"><span class="k">Fitness functions defined for key attributes</span><span class="val">Yes</span></div>
</div>
<div class="card"><div class="sub">Health signals (lagging)</div>
  <div class="kv"><span class="k">Change coupling — files that change together</span><span class="val">Low</span></div>
  <div class="kv"><span class="k">Incidents traced to a design gap</span><span class="val">Falling</span></div>
  <div class="kv"><span class="k">Time to add a typical feature</span><span class="val">Stable</span></div>
</div>
<div class="callout"><strong>Leading vs lagging.</strong> Measurable NFR targets and recorded decisions are <em>leading</em> — they predict whether the build will hold. Incidents traced to design gaps are <em>lagging</em> — they confirm where the architecture fell short.</div>
`
    },

    {
      id: "tools",
      navLabel: "Common Tools",
      eyebrow: "Section · Tools",
      title: "Common tools (recognition only)",
      body: `
<div class="table-wrap"><table>
  <thead><tr><th>Tool</th><th>Used for</th><th>Where AI assists</th></tr></thead>
  <tbody>
    <tr><td>Structurizr / Mermaid / PlantUML</td><td>C4 &amp; sequence diagrams as code</td><td>Draft diagrams from the requirements</td></tr>
    <tr><td>Lucidchart / draw.io</td><td>Freeform architecture diagrams</td><td>Sketch the first container view</td></tr>
    <tr><td>ADR tools / Markdown + Git</td><td>Recording &amp; versioning decisions</td><td>Draft the ADR; you judge the trade-off</td></tr>
    <tr><td>Cloud well-architected reviews</td><td>Checking against proven pillars</td><td>Flag gaps in security, cost, reliability</td></tr>
    <tr><td>ArchUnit / fitness-function tests</td><td>Enforcing the design in CI</td><td>Generate the rules from your boundaries</td></tr>
  </tbody>
</table></div>
<p class="muted small">Recognition, not tutorials — you should know what each is for when you see it in a design.</p>
`
    },

    {
      id: "ai",
      navLabel: "AI Collaboration",
      eyebrow: "Section · AI Collaboration",
      title: "Working with AI on architecture",
      body: `
<div class="card"><h4>AI does well</h4><ul class="clean"><li>Draft C4 diagrams and sequence flows from requirements</li><li>Propose an architecture style and candidate patterns</li><li>Write the first ADR for a decision you've framed</li><li>Enumerate options for a build-vs-buy call</li></ul></div>
<div class="card"><h4>You must check</h4><ul class="clean"><li>It over-engineers — distributed systems for simple loads</li><li>NFR targets are vague or invented, not tied to real load</li><li>Trade-offs list only benefits, never the costs</li><li>It ignores your constraints — team size, budget, compliance</li><li>Patterns are name-dropped without a force that justifies them</li></ul></div>
<div class="sub">The loop</div>
<div class="flow"><div class="step"><div class="k">1</div><div class="t">State reqs &amp; constraints</div></div><div class="step"><div class="k">2</div><div class="t">AI drafts design</div></div><div class="step"><div class="k">3</div><div class="t">You weigh trade-offs</div></div><div class="step"><div class="k">4</div><div class="t">Refine &amp; record ADRs</div></div><div class="step"><div class="k">5</div><div class="t">Approve</div></div></div>
`
    },

    {
      id: "review",
      navLabel: "Architect Review Lens",
      eyebrow: "Architect Review",
      title: "Before you approve a design",
      body: `
<p>Run every AI-generated design through this lens before you sign off.</p>
<div class="card"><h4>Requirements fit</h4><ul class="clean"><li>Does the design meet every non-functional target?</li><li>Is each quality attribute given a number, not an adjective?</li><li>Can you trace each component back to a requirement?</li></ul></div>
<div class="card"><h4>Trade-offs &amp; decisions</h4><ul class="clean"><li>Is the style the simplest that meets the load?</li><li>Are rejected options recorded in ADRs?</li><li>Does each trade-off state its cost, not just its win?</li></ul></div>
<div class="card"><h4>Risk &amp; operability</h4><ul class="clean"><li>What breaks first under stress, and what's the mitigation?</li><li>Can this team actually build and operate it?</li><li>Are there fitness functions to keep it honest?</li></ul></div>
<div class="card"><h4>Cost &amp; fit</h4><ul class="clean"><li>Are we building a commodity we should buy?</li><li>Does the stack fit the budget and the skills on hand?</li><li>What's the smallest design that satisfies the requirements?</li></ul></div>
<div class="callout"><strong>Approve only when:</strong> every quality attribute has a measurable target the design meets, the style is the simplest that works, each significant decision has an ADR with its trade-off, the top risks have mitigations, and the team can realistically build and run it.</div>
`
    },

    {
      id: "inspect",
      navLabel: "How to Inspect It",
      eyebrow: "Inspect Your Build",
      title: "What to check in your Field Guide",
      body: `
<p>After Claude Code builds your Field Guide, open it and check these — this is how you practice the architect's review:</p>
<ul class="clean">
  <li><strong>SAD</strong> — does it open with the quality attributes and constraints, not a technology list?</li>
  <li><strong>C4 diagrams</strong> — can you zoom from context to container to component without a gap?</li>
  <li><strong>NFR spec</strong> — does every attribute carry a number (e.g. "p95 &lt; 500ms at 40 orders/min")?</li>
  <li><strong>ADRs</strong> — does each show the options considered and why one lost, not just the winner?</li>
  <li><strong>Trade-off matrix</strong> — are options scored against attributes, or is it a feature checklist?</li>
  <li><strong>Risk register</strong> — is each risk paired with a mitigation and an owner?</li>
  <li><strong>Ask assistant</strong> — ask it "why a monolith over microservices?" and see if it answers from your ADRs.</li>
</ul>
<div class="callout">Found a gap? That's the point — refine your prompt, rebuild, and re-upload. The newest version replaces the old; points are awarded once.</div>
`
    },

    {
      id: "kb",
      navLabel: "Knowledge Base",
      eyebrow: "Knowledge Base",
      title: "Glossary &amp; FAQ",
      body: `
<p class="muted small">The core vocabulary you need to direct an architecture conversation with confidence.</p>
<div class="kv"><span class="k">Quality attribute (NFR)</span><span class="val">How well the system must perform — scale, security, speed, cost</span></div>
<div class="kv"><span class="k">Monolith</span><span class="val">One deployable unit; simplest to build and operate</span></div>
<div class="kv"><span class="k">Microservices</span><span class="val">Many small, independently deployed services</span></div>
<div class="kv"><span class="k">Event-driven</span><span class="val">Components react to events via a queue or bus</span></div>
<div class="kv"><span class="k">C4 model</span><span class="val">Context, Container, Component, Code — four diagram zoom levels</span></div>
<div class="kv"><span class="k">ADR</span><span class="val">Architecture Decision Record — one decision and its trade-off</span></div>
<div class="kv"><span class="k">Trade-off analysis</span><span class="val">Weighing options against the attributes that matter</span></div>
<div class="kv"><span class="k">Pattern</span><span class="val">A proven solution to a recurring force — cache, queue, gateway</span></div>
<div class="kv"><span class="k">Fitness function</span><span class="val">An automated test that the architecture stays within its targets</span></div>
<div class="kv"><span class="k">Build vs buy</span><span class="val">Whether to build a capability or adopt an existing one</span></div>
<div class="kv"><span class="k">Coupling</span><span class="val">How strongly parts depend on each other; lower is more flexible</span></div>
<div class="kv"><span class="k">Big ball of mud</span><span class="val">A structure with no clear boundaries; every change ripples</span></div>
<div class="q"><strong>When is a monolith the right choice over microservices?</strong><button class="revealbtn">Reveal</button><div class="ans">When load is moderate and the team is small. A modular monolith gives clear boundaries at far lower operational cost; you split out a service only when a specific part has a real, different scaling or reliability need.</div></div>
<div class="q"><strong>What makes an ADR worth writing?</strong><button class="revealbtn">Reveal</button><div class="ans">It captures the context, the options considered, the decision, and the consequences — including the rejected paths. Six months later it stops the team from relitigating a settled choice.</div></div>
<div class="q"><strong>Why insist on numbers for every quality attribute?</strong><button class="revealbtn">Reveal</button><div class="ans">"Fast" and "secure" can't be designed for or tested. "p95 under 500ms at 40 orders per minute" can — it drives the design and becomes a fitness function.</div></div>
`
    },

    {
      id: "build",
      navLabel: "Build &amp; Submit",
      eyebrow: "Build &amp; Submit",
      title: "Build your Solution Architect Field Guide",
      body: `
<p class="lead">You'll build your Field Guide in <strong>your own Claude Code</strong>: a searchable, Colaberry-branded guide with the architecture documents generated for a chosen example, an Ask assistant, and downloadable docs. Then upload it here.</p>
<p>Your build generates real, substantial versions of these documents for one example industry:</p>
<ul class="clean">
  <li><strong>Solution Architecture Document</strong> — the whole design in one place</li>
  <li><strong>C4 diagrams</strong> — context, container, and component views</li>
  <li><strong>Architecture Decision Records</strong> — several real decisions with trade-offs</li>
  <li><strong>Non-Functional Requirements spec</strong> — quality attributes with measurable targets</li>
  <li><strong>Technology &amp; trade-off matrix</strong> — options scored against the attributes</li>
  <li><strong>Sequence &amp; data-flow diagrams</strong> — how a request moves through the system</li>
  <li><strong>Architecture risk register</strong> — what could break, and the mitigation</li>
  <li><strong>Architecture package one-pager</strong> — the summary a sponsor signs off</li>
</ul>
<button class="buildcta" id="copyPromptBtn2" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg> Copy the build prompt</button>
<p class="muted small">The prompt is long on purpose — just copy it and paste it straight into Claude Code. You don't need to read it.</p>
`
    }

  ],

  buildPrompt: `Build a rich, self-contained Solution Architect FIELD GUIDE as a single HTML file named SolutionArchitecture_FieldGuide.html. Take your time and make it genuinely substantial — this is a 5 to 10 minute build that should produce a polished, knowledge-base-style guide, not a quick page.

WHO IT'S FOR: I'm a learner in the Colaberry Enterprise AI Leadership Accelerator becoming an AI Solution Architect. I need the ~20% of solution architecture required to DIRECT, EVALUATE, and APPROVE AI-generated technical designs. I have no project yet — pick ONE example industry (Restaurant, Insurance, Healthcare, Retail, or Manufacturing), invent a believable initiative for it, assume its requirements are already approved, and make every document concrete to that example.

MAKE IT A KNOWLEDGE BASE, not a brochure. Model it on a clean help-center / knowledge base (like a polished docs site): a left topic nav, a prominent SEARCH box, and an "Ask" assistant the learner can type questions into that answers FROM THE GUIDE'S OWN CONTENT (embed a small offline Q&A — match the question to the most relevant section/FAQ and show that answer; no external API; it must work offline).

BRANDING & QUALITY: put the Colaberry logo in the header and on the print/PDF export. Executive, calm, authoritative voice. Light/dark aware. Fully self-contained: inline CSS + JS, NO external libraries or CDNs, works offline when saved as one file.

TEACH THE DISCIPLINE (concise): why solution architecture exists; the 20% to know (quality attributes / non-functional requirements, architecture styles — monolith vs services vs event-driven, the C4 model, Architecture Decision Records, trade-off analysis, key patterns, fitness functions, build-vs-buy); good vs bad architecture; KPIs; the architect's review lens.

THEN GENERATE THE DOCUMENTS — this is the heart of it. For the chosen example, produce REAL, substantial documents (not placeholders), each in its own searchable section, each individually DOWNLOADABLE. The PRIMARY format is a fully-styled, self-contained HTML file that must look like a genuine, reusable, professional deliverable — a branded cover with the Colaberry logo, a document-control strip (version, owner, status, date), styled section headers and navy tables, callouts, a sign-off block (Prepared / Reviewed / Approved), and a footer. Make each document EXTENSIVE and complete, not a summary. ALSO provide a Save-as-PDF that prints that SAME designed document, and an Excel-friendly .csv export for the tabular documents (NFR spec, trade-off matrix, risk register). Do NOT default to plain .md:
  1. Solution Architecture Document (SAD)
  2. C4 Diagrams — Context, Container, and Component views
  3. Architecture Decision Records (ADRs) — several real decisions
  4. Non-Functional Requirements Specification (with measurable targets)
  5. Technology Selection & Trade-off Matrix
  6. Sequence & Data-Flow Diagrams
  7. Architecture Risk Register
  8. A one-page Architecture Package summary for sign-off

USE RICH VISUALS wherever they aid understanding: Mermaid-style diagrams (C4 context / container / component, sequence diagrams, data-flow, ERDs) AND Power BI-style charts (KPI tiles, bar / line / donut) for anything quantitative (load, cost, trade-off scores). Render ALL diagrams and charts as INLINE SVG (self-contained, no external libraries or CDNs) so the guide works offline. QUALITY BAR: every quality attribute has a measurable target; the architecture style is justified against the load; every significant decision has an ADR with its rejected options; trade-offs state costs, not just wins; no over-engineering. Every document must be findable via the search box and answerable by the Ask assistant.

EMBED metadata as a JSON script tag with id="deepdive-metadata": { guide_type:"Solution Architect Field Guide", curriculum_type:"deep_dive", week:2, discipline:"Solution Architect", student_id, project_id, repository, generated_by:"Claude Code", generated_date, version, build_number }.

When finished, open the file in the browser.`
};
