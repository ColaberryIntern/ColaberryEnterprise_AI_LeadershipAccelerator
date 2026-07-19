// Deep Dive Field Guide — content spec. Week 3 · Project Manager.
// Content-only module: the deterministic generator supplies all chrome (brand CSS,
// nav rail, read-tracker, start banner, checklist/upload gate). We author ONLY the
// 15 section bodies + the build prompt. Shared classes only. No emoji, no colors,
// no <style>/<script>. Running example: a regional auto insurer launching a
// self-service Claims Portal.
module.exports = {
  week: 3,
  role: "Project Manager",
  tag: "PM · Wk 3",
  sections: [

    {
      id: "dashboard",
      navLabel: "Dashboard",
      eyebrow: "Project Manager · Week 3",
      title: "Turn a design into a plan that ships",
      body: `
<p class="lead">The Project Manager turns an approved design into a <strong>plan, a sequence, and a cadence</strong> that ships on time without heroics. Your job as an architect isn't to draw the Gantt chart; it's to <strong>direct, evaluate, and approve</strong> the plan an AI drafts, so the team delivers predictably.</p>
<div class="kpis">
  <div class="kpi"><div class="v">8</div><div class="l">Docs you'll build</div></div>
  <div class="kpi c1"><div class="v">3</div><div class="l">Triangle constraints</div></div>
  <div class="kpi c2"><div class="v">4</div><div class="l">RAID streams</div></div>
  <div class="kpi c3"><div class="v">1</div><div class="l">Critical path</div></div>
</div>
<div class="card">
  <div class="sub">How this Deep Dive works</div>
  <ul class="clean">
    <li>Read the learning sections — the rail fills with green checks as you go.</li>
    <li>In <strong>Build &amp; Submit</strong>, copy the build prompt and run it in your own Claude Code. It builds a searchable <strong>Field Guide</strong> — with the PM documents generated for a chosen example, an Ask assistant, and downloads.</li>
    <li>Upload your Field Guide to earn <strong>100 points</strong>. When every section is read, <strong>Complete</strong> unlocks.</li>
  </ul>
</div>
<div class="callout"><strong>Running example.</strong> Throughout, we use one case — a regional auto insurer launching a <em>self-service Claims Portal</em> so policyholders can file and track claims online. In your build you can pick any of Restaurant, Insurance, Healthcare, Retail, or Manufacturing.</div>`
    },

    {
      id: "overview",
      navLabel: "Overview & Mission",
      eyebrow: "Overview · Mission",
      title: "Why the Project Manager exists",
      body: `
<p>A design tells you <em>what</em> to build. It says nothing about the order to build it in, who owns each piece, what happens when the vendor slips, or how you will know in week three that go-live is already at risk. The Project Manager is the discipline that turns the design into a <strong>sequenced, resourced, dated plan</strong> and the cadence that keeps it honest. Skip it and even a perfect design ships late, over budget, and by heroics.</p>
<div class="card"><div class="sub">Business value</div><ul class="clean"><li>Makes the delivery date defensible instead of hopeful.</li><li>Exposes the critical path so the right work gets protected.</li><li>Turns risk from a surprise into a managed, owned list.</li><li>Gives the sponsor one honest picture of health, early.</li></ul></div>
<div class="card"><div class="sub">Common misconceptions</div><ul class="clean"><li>"PM is updating a spreadsheet." It's sequencing work and protecting the path.</li><li>"A date is a plan." A date without a WBS and dependencies is a wish.</li><li>"Agile means no plan." It means a different planning cadence, not none.</li><li>"Green status is good news." Green that never moves is the most dangerous color.</li></ul></div>
<div class="callout warn"><strong>How AI changes PM.</strong> AI can draft a WBS, propose a RACI, and generate a risk list in seconds. What it can't do is know which dependency is truly the long pole, which estimate is fantasy, or when to escalate. You supply judgment and the honest call; AI supplies the first draft.</div>`
    },

    {
      id: "twenty",
      navLabel: "The 20% You Need",
      eyebrow: "The 20% You Need to Know",
      title: "Enough PM to direct and judge it",
      body: `
<p>You don't need to run a PMO. You need these building blocks well enough to spot when an AI's plan is unsequenced, over-optimistic, or missing its risks.</p>
<div class="table-wrap"><table>
  <thead><tr><th>Concept</th><th>What it is</th><th>The tell of good work</th></tr></thead>
  <tbody>
    <tr><td>Iron triangle</td><td>Scope, schedule, cost — move one, another moves</td><td>Which one is fixed is stated</td></tr>
    <tr><td>Work Breakdown Structure</td><td>The whole scope decomposed into work packages</td><td>100% of the work, no overlap</td></tr>
    <tr><td>Critical path</td><td>The longest chain of dependent tasks</td><td>Named, and actively protected</td></tr>
    <tr><td>Milestones &amp; gates</td><td>Checkpoints with go / no-go exit criteria</td><td>Each gate has explicit criteria</td></tr>
    <tr><td>RAID</td><td>Risks, Assumptions, Issues, Dependencies log</td><td>Each item has an owner &amp; date</td></tr>
    <tr><td>RACI</td><td>Responsible / Accountable / Consulted / Informed</td><td>Exactly one "A" per row</td></tr>
    <tr><td>Agile vs waterfall vs hybrid</td><td>Iterative cadence vs phase-gated vs a blend</td><td>Method fits the risk, not fashion</td></tr>
    <tr><td>Velocity &amp; burndown</td><td>Work done per sprint; work remaining over time</td><td>A trend, not a single point</td></tr>
    <tr><td>Status reporting</td><td>RAG health vs baseline, decisions needed</td><td>Reflects reality, not hope</td></tr>
  </tbody>
</table></div>
<div class="callout"><strong>Example.</strong> On the Claims Portal, the long pole is the integration with the insurer's policy-admin system (vendor-gated). Weak plan: "integrate with PAS — 2 weeks." Strong: a work package sitting on the critical path, the dependency owned by the vendor lead, and a gate that says "integration passes UAT with 20 test claims before go-live is committed."</div>`
    },

    {
      id: "role",
      navLabel: "Role in the SDLC",
      eyebrow: "Where it fits",
      title: "Role in the SDLC",
      body: `
<p>The Project Manager owns the <strong>Plan &amp; Deliver</strong> spine — it picks up an approved design and runs the work all the way to a shipped increment. It doesn't decide <em>what</em> to build (Business Analysis) or <em>how</em> it's shaped (Architecture); it decides the order, the owners, the cadence, and the gates.</p>
<div class="flow">
  <div class="step"><div class="k">Before</div><div class="t">Approved design &amp; scope</div></div>
  <div class="step"><div class="k">You are here</div><div class="t">Project Manager</div></div>
  <div class="step"><div class="k">After</div><div class="t">Build, QA &amp; go-live</div></div>
</div>
<div class="stack" style="margin-top:.4rem">
  <div class="tier"><div class="lab">Gives PM its input</div><div class="row"><span class="chip">Executive Sponsor</span><span class="chip">Solution Architect</span><span class="chip">Product Owner</span></div></div>
  <div class="tier"><div class="lab">The PM role (you direct it)</div><div class="row"><span class="chip pri">Project Manager</span></div></div>
  <div class="tier"><div class="lab">Consumes PM's output</div><div class="row"><span class="chip">Dev leads</span><span class="chip">QA</span><span class="chip">Ops / Release</span><span class="chip">Stakeholders</span></div></div>
</div>
<div class="callout"><strong>Approval gates you own:</strong> the plan baseline and every stage gate. Before build starts you confirm the plan is sequenced, resourced, and risk-owned; at each gate you confirm the exit criteria are truly met before the next phase spends money.</div>`
    },

    {
      id: "io",
      navLabel: "Inputs & Outputs",
      eyebrow: "Section · Inputs & Outputs",
      title: "What comes in, what hands off",
      body: `
<div class="grid g2">
  <div class="card"><h4>Inputs</h4><ul class="clean"><li>Approved design &amp; architecture</li><li>Scope, requirements &amp; success criteria</li><li>Team, capacity &amp; skills available</li><li>Budget, deadline &amp; hard constraints</li><li>Regulatory / compliance obligations</li></ul></div>
  <div class="card"><h4>Outputs</h4><ul class="clean"><li>Project charter &amp; baseline</li><li>WBS, schedule &amp; critical path</li><li>RAID log &amp; RACI matrix</li><li>Sprint plan &amp; cadence</li><li>Status reports &amp; budget / burn</li></ul></div>
</div>
<div class="sub">Information flow</div>
<div class="flow"><div class="step"><div class="k">In</div><div class="t">Design &amp; scope</div></div><div class="step"><div class="k">Plan</div><div class="t">WBS &amp; estimates</div></div><div class="step"><div class="k">Sequence</div><div class="t">Critical path</div></div><div class="step"><div class="k">Run</div><div class="t">Sprints &amp; cadence</div></div><div class="step"><div class="k">Out</div><div class="t">Shipped increment</div></div></div>`
    },

    {
      id: "responsibilities",
      navLabel: "Responsibilities",
      eyebrow: "Ownership",
      title: "What a Project Manager actually does",
      body: `
<div class="grid g2">
  <div class="card"><h4>Plan</h4><ul class="clean"><li>Write the charter &amp; define scope boundaries</li><li>Decompose work into a WBS</li><li>Baseline scope, schedule &amp; cost</li></ul></div>
  <div class="card"><h4>Sequence</h4><ul class="clean"><li>Map dependencies</li><li>Find &amp; protect the critical path</li><li>Set milestones &amp; gate criteria</li></ul></div>
  <div class="card"><h4>Run</h4><ul class="clean"><li>Run the cadence (planning, standups, reviews)</li><li>Remove blockers &amp; keep work flowing</li><li>Commit each sprint / iteration</li></ul></div>
  <div class="card"><h4>Control</h4><ul class="clean"><li>Track velocity, burn &amp; variance</li><li>Manage the RAID log</li><li>Run change control &amp; report status</li></ul></div>
</div>
<div class="card"><div class="sub">You own vs you don't</div>
  <div class="kv"><span class="k">Own</span><span class="val">The plan · Sequence · Cadence · RAID · Gate readiness</span></div>
  <div class="kv"><span class="k">Don't own</span><span class="val">The design · The code · The tech choice · The requirements</span></div>
</div>`
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
    <tr><td>Project Charter</td><td>The mandate: sponsor, scope boundaries, success criteria, authority</td></tr>
    <tr><td>Work Breakdown Structure</td><td>The full scope decomposed — nothing missing, nothing double-counted</td></tr>
    <tr><td>Milestone Timeline / Gantt</td><td>Sequence, dependencies, dates, and the critical path</td></tr>
    <tr><td>RAID Log</td><td>Risks, assumptions, issues &amp; dependencies — each owned and dated</td></tr>
    <tr><td>RACI Matrix</td><td>Who is Responsible, Accountable, Consulted, Informed per activity</td></tr>
    <tr><td>Sprint / Iteration Plan</td><td>The next increment sliced into a committed, estimated cadence</td></tr>
    <tr><td>Status Report</td><td>RAG health vs baseline, progress, and the decisions you need</td></tr>
    <tr><td>Budget / Burn</td><td>Planned vs actual spend and a forecast to complete</td></tr>
  </tbody>
</table></div>`
    },

    {
      id: "goodbad",
      navLabel: "Good vs Bad Plans",
      eyebrow: "Section · Good vs Bad",
      title: "Good vs bad project plans",
      body: `
<div class="gb">
  <div class="col good"><h4>Good project plans</h4><ul>
    <li>State which triangle constraint is fixed (here, the go-live date).</li>
    <li>Name the critical path and protect it explicitly.</li>
    <li>Have milestones with real go / no-go gate criteria.</li>
    <li>Carry estimates with buffer, not single-point fantasy.</li>
    <li>Keep a live RAID log — every item owned and dated.</li>
    <li>Report status that reflects reality, red when it's red.</li>
  </ul></div>
  <div class="col bad"><h4>Bad project plans</h4><ul>
    <li>Pick the date first, then "make the work fit."</li>
    <li>Show every task "on track" until the week it slips (watermelon status).</li>
    <li>Map no dependencies — so everything looks parallel.</li>
    <li>Use single-point estimates with no contingency.</li>
    <li>Absorb scope creep silently instead of via change control.</li>
    <li>Keep a RAID log that was last touched at kickoff.</li>
  </ul></div>
</div>
<div class="callout warn"><strong>Red flags in AI-drafted plans:</strong> a schedule with no critical path, every task the same tidy 2-day estimate, a RAID log of generic risks with no owners, a RACI with two "A"s on a row, and a status that stays green with no movement.</div>`
    },

    {
      id: "metrics",
      navLabel: "KPIs & Success",
      eyebrow: "Section · Measurement",
      title: "KPIs & success metrics",
      body: `
<div class="grid g2">
  <div class="card"><h4>Delivery signals</h4><ul class="clean"><li>Schedule variance / SPI vs baseline</li><li>Cost variance / CPI vs budget</li><li>Milestone hit rate</li><li>Velocity trend across sprints</li></ul></div>
  <div class="card"><h4>Health signals</h4><ul class="clean"><li>Blocker age — how long issues sit unresolved</li><li>RAID items overdue or unowned</li><li>% of tasks with an owner and a date</li><li>Burndown slope vs the ideal line</li></ul></div>
</div>
<div class="callout"><strong>Leading vs lagging.</strong> Blocker age and burndown slope are <em>leading</em> — they warn you before a milestone slips. Milestone hit rate and cost variance are <em>lagging</em> — they confirm where the plan already broke.</div>`
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
    <tr><td>Jira / Azure DevOps</td><td>Backlog, sprints, burndown</td><td>Draft stories, estimate, summarize</td></tr>
    <tr><td>MS Project / Smartsheet</td><td>Gantt, dependencies, critical path</td><td>Draft the WBS &amp; schedule</td></tr>
    <tr><td>Asana / Monday / ClickUp</td><td>Task tracking &amp; cadence</td><td>Generate tasks &amp; owners</td></tr>
    <tr><td>Confluence / Notion</td><td>Charter, status, decisions</td><td>Draft charter &amp; status narrative</td></tr>
    <tr><td>Excel / Sheets</td><td>Budget / burn, RAID, RACI</td><td>Build &amp; check the tables</td></tr>
  </tbody>
</table></div>`
    },

    {
      id: "ai",
      navLabel: "AI Collaboration",
      eyebrow: "Section · AI Collaboration",
      title: "Working with AI on the plan",
      body: `
<div class="grid g2">
  <div class="card"><h4>AI does well</h4><ul class="clean"><li>Draft a WBS from a scope statement</li><li>Propose a RACI &amp; a first RAID list</li><li>Write the status-report narrative</li><li>Estimate a task list &amp; flag gaps</li></ul></div>
  <div class="card"><h4>You still own</h4><ul class="clean"><li>The true dependencies &amp; critical path</li><li>Which estimates are realistic</li><li>Priorities, tradeoffs &amp; the fixed constraint</li><li>The honest RAG and the escalation call</li></ul></div>
</div>
<div class="sub">The loop</div>
<div class="flow"><div class="step"><div class="k">1</div><div class="t">Describe scope</div></div><div class="step"><div class="k">2</div><div class="t">AI drafts plan</div></div><div class="step"><div class="k">3</div><div class="t">You stress-test</div></div><div class="step"><div class="k">4</div><div class="t">Refine</div></div><div class="step"><div class="k">5</div><div class="t">Baseline</div></div></div>`
    },

    {
      id: "review",
      navLabel: "Architect Review Lens",
      eyebrow: "Architect Review",
      title: "Before you approve the plan",
      body: `
<p>Run every AI-generated plan through this lens before you baseline it.</p>
<div class="grid g2">
  <div class="card"><h4>Scope &amp; sequence</h4><ul class="clean"><li>Does the WBS cover 100% of scope, no overlap?</li><li>Is the critical path identified?</li><li>Are dependencies explicit, not assumed?</li></ul></div>
  <div class="card"><h4>Estimates &amp; risk</h4><ul class="clean"><li>Do estimates carry buffer, not single points?</li><li>Are the top risks owned with mitigations?</li><li>Which triangle constraint is fixed?</li></ul></div>
  <div class="card"><h4>Ownership</h4><ul class="clean"><li>Exactly one Accountable per RACI row?</li><li>Does every task have an owner and a date?</li><li>Who signs off each gate?</li></ul></div>
  <div class="card"><h4>Cadence &amp; control</h4><ul class="clean"><li>Is the method (agile / hybrid) fit for the risk?</li><li>Are milestones gated with exit criteria?</li><li>How will status stay honest?</li></ul></div>
</div>
<div class="callout"><strong>Approve only when:</strong> the WBS is complete, the critical path is named and protected, estimates carry buffer, every RAID and RACI row has one clear owner, gates have exit criteria, and the fixed constraint is stated.</div>`
    },

    {
      id: "inspect",
      navLabel: "How to Inspect It",
      eyebrow: "Inspect Your Build",
      title: "What to check in your Field Guide",
      body: `
<p>After Claude Code builds your Field Guide, open it and check these — this is how you practice the architect's review:</p>
<ul class="clean">
  <li><strong>Charter</strong> — does it state the sponsor, the fixed constraint, and measurable success criteria?</li>
  <li><strong>WBS</strong> — does it add up to the whole scope with no overlapping work packages?</li>
  <li><strong>Gantt</strong> — is the critical path visibly marked, and are dependencies drawn, not implied?</li>
  <li><strong>RAID log</strong> — does every item have an owner and a due date, or are they generic placeholders?</li>
  <li><strong>RACI</strong> — is there exactly one Accountable per row? Any row with two "A"s is broken.</li>
  <li><strong>Burndown / burn</strong> — do the charts show a trend against an ideal line, not a lone bar?</li>
  <li><strong>Ask assistant</strong> — try asking it "what is on the critical path?" and see if it answers from your docs.</li>
</ul>
<div class="callout">Found a gap? That's the point — refine your prompt, rebuild, and re-upload. The newest version replaces the old; points are awarded once.</div>`
    },

    {
      id: "kb",
      navLabel: "Knowledge Base",
      eyebrow: "Knowledge Base",
      title: "Glossary & FAQ",
      body: `
<div class="terms">
  <div class="term"><b>Iron triangle</b><p>Scope, schedule, and cost are linked — change one and at least one other must move.</p></div>
  <div class="term"><b>WBS</b><p>Work Breakdown Structure — the whole scope decomposed into work packages that sum to 100%.</p></div>
  <div class="term"><b>Critical path</b><p>The longest chain of dependent tasks; any slip on it slips the whole project.</p></div>
  <div class="term"><b>Float / slack</b><p>How long a task can slip before it delays the project. Critical-path tasks have zero.</p></div>
  <div class="term"><b>Milestone &amp; gate</b><p>A checkpoint with explicit go / no-go exit criteria that must be met to proceed.</p></div>
  <div class="term"><b>RAID</b><p>Risks, Assumptions, Issues, Dependencies — the log that keeps surprises owned.</p></div>
  <div class="term"><b>RACI</b><p>Responsible, Accountable, Consulted, Informed — one Accountable per activity.</p></div>
  <div class="term"><b>Baseline</b><p>The approved plan you measure variance against; changes go through change control.</p></div>
  <div class="term"><b>Velocity</b><p>Work a team completes per sprint, used to forecast — a trend, not one number.</p></div>
  <div class="term"><b>Burndown</b><p>Work remaining over time vs an ideal line; the earliest honest schedule signal.</p></div>
  <div class="term"><b>Change control</b><p>The disciplined path for altering baselined scope, schedule, or cost.</p></div>
  <div class="term"><b>RAG status</b><p>Red / Amber / Green health against baseline; green that never moves is a warning.</p></div>
</div>
<div class="q"><div class="qt">1. Why find the critical path before committing a date?</div><button class="revealbtn">Reveal</button><div class="ans">Because the critical path is the longest chain of dependent work — it sets the earliest possible finish. A date that ignores it is a wish, not a plan.</div></div>
<div class="q"><div class="qt">2. What's wrong with a RACI row that has two "A"s?</div><button class="revealbtn">Reveal</button><div class="ans">Two Accountables means no one is accountable. Exactly one person must own the outcome of each activity, or decisions stall.</div></div>
<div class="q"><div class="qt">3. When is hybrid better than pure agile or waterfall?</div><button class="revealbtn">Reveal</button><div class="ans">When part of the work is exploratory (build the portal UI in sprints) and part is gate-bound (compliance and vendor integration need fixed sign-offs). Hybrid runs both cadences at once.</div></div>`
    },

    {
      id: "build",
      navLabel: "Build & Submit",
      eyebrow: "Build & Submit",
      title: "Build your Project Manager Field Guide",
      body: `
<p class="lead">You'll build your Field Guide in <strong>your own Claude Code</strong>: a searchable, Colaberry-branded guide with the PM documents generated for a chosen example, an Ask assistant, and downloadable docs. Then upload it here.</p>
<ol class="steps">
  <li>Click <strong>Copy the build prompt</strong> below (this is a required step).</li>
  <li>Open <strong>Claude Code</strong> — Week 3 has no project yet, so a fresh folder is fine.</li>
  <li>Paste the prompt and run it. It takes Claude Code <strong>~5–10 minutes</strong> to build a full Field Guide.</li>
  <li>Explore it — search, ask the assistant, download the documents — then upload it to earn 100 points.</li>
</ol>
<button class="buildcta" id="copyPromptBtn2" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg> Copy the build prompt</button>
<p class="muted small">The prompt is long on purpose — just copy it and paste it straight into Claude Code. You don't need to read it.</p>
<div class="sub" style="margin-top:1rem">The 8 documents it generates</div>
<ul class="clean">
  <li><strong>Project Charter</strong> — mandate, scope boundaries, and success criteria.</li>
  <li><strong>Work Breakdown Structure</strong> — the full scope decomposed into work packages.</li>
  <li><strong>Milestone Timeline / Gantt</strong> — sequence, dependencies, and the critical path.</li>
  <li><strong>RAID Log</strong> — risks, assumptions, issues, dependencies, each owned.</li>
  <li><strong>RACI Matrix</strong> — one Accountable per activity.</li>
  <li><strong>Sprint / Iteration Plan</strong> — the next increment, estimated and committed.</li>
  <li><strong>Status Report</strong> — RAG health vs baseline and the decisions needed.</li>
  <li><strong>Budget / Burn</strong> — planned vs actual spend and forecast to complete.</li>
</ul>`
    }

  ],
  buildPrompt: `Build a rich, self-contained Project Manager FIELD GUIDE as a single HTML file named ProjectManager_FieldGuide.html. Take your time and make it genuinely substantial — this is a 5 to 10 minute build that should produce a polished, knowledge-base-style guide, not a quick page.

WHO IT'S FOR: I'm a learner in the Colaberry Enterprise AI Leadership Accelerator becoming an AI Solution Architect. I need the ~20% of project management required to DIRECT, EVALUATE, and APPROVE AI-generated project plans. I have no project yet — pick ONE example industry (Restaurant, Insurance, Healthcare, Retail, or Manufacturing), invent a believable initiative for it, and make every document concrete to that example.

MAKE IT A KNOWLEDGE BASE, not a brochure. Model it on a clean help-center / knowledge base (like a polished docs site): a left topic nav, a prominent SEARCH box, and an "Ask" assistant the learner can type questions into that answers FROM THE GUIDE'S OWN CONTENT (embed a small offline Q&A — match the question to the most relevant section/FAQ and show that answer; no external API; it must work offline).

BRANDING & QUALITY: put the Colaberry logo in the header and on the print/PDF export. Executive, calm, authoritative voice. Light/dark aware. Fully self-contained: inline CSS + JS, NO external libraries or CDNs, works offline when saved as one file.

TEACH THE DISCIPLINE (concise): why project management exists; the 20% to know (the scope/schedule/cost triangle, Work Breakdown Structure, critical path, milestones & gates, RAID, RACI, agile vs waterfall vs hybrid, velocity & burndown, status reporting); good vs bad plans; KPIs; the architect's review lens.

THEN GENERATE THE DOCUMENTS — this is the heart of it. For the chosen example, produce REAL, substantial documents (not placeholders), each in its own searchable section, each individually DOWNLOADABLE. The PRIMARY format is a fully-styled, self-contained HTML file that must look like a genuine, reusable, professional deliverable — a branded cover with the Colaberry logo, a document-control strip (version, owner, status, date), styled section headers and navy tables, callouts, a sign-off block (Prepared / Reviewed / Approved), and a footer. Make each document EXTENSIVE and complete, not a summary. ALSO provide a Save-as-PDF that prints that SAME designed document, and an Excel-friendly .csv export for the tabular documents (WBS, RAID log, RACI matrix, budget/burn). Do NOT default to plain .md:
  1. Project Charter (sponsor, scope boundaries, objectives, success criteria, authority)
  2. Work Breakdown Structure (work packages that sum to 100% of scope)
  3. Milestone Timeline / Gantt (sequence, dependencies, dates, critical path marked)
  4. RAID Log (risks, assumptions, issues, dependencies — each owned and dated)
  5. RACI Matrix (one Accountable per activity)
  6. Sprint / Iteration Plan (the next increment, estimated and committed)
  7. Status Report (RAG health vs baseline, progress, decisions needed)
  8. Budget / Burn (planned vs actual spend and a forecast to complete)

USE RICH VISUALS wherever they aid understanding: Mermaid-style diagrams (a WBS tree, a Gantt / milestone timeline, a dependency network, a RACI grid) AND Power BI-style charts (KPI tiles, a burndown line, a budget-burn line, a milestone-RAG donut) for anything quantitative. Render ALL diagrams and charts as INLINE SVG (self-contained, no external libraries or CDNs) so the guide works offline. QUALITY BAR: the critical path is named and protected; estimates carry buffer, not single points; every RAID and RACI row has exactly one clear owner; gates have explicit exit criteria; the fixed triangle constraint is stated. Every document must be findable via the search box and answerable by the Ask assistant.

EMBED metadata as a JSON script tag with id="deepdive-metadata": { guide_type:"Project Manager Field Guide", curriculum_type:"deep_dive", week:3, discipline:"Project Manager", student_id, project_id, repository, generated_by:"Claude Code", generated_date, version, build_number }.

When finished, open the file in the browser.`
};
