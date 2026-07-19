module.exports = {
  week: 12,
  role: "AI Solution Architect",
  tag: "ARCH · Wk 12",
  sections: [
    {
      id: "dashboard",
      navLabel: "Dashboard",
      eyebrow: "AI Solution Architect · Week 12",
      title: "Make eleven disciplines into one buildable solution",
      body:
`<p class="lead">The <strong>AI Solution Architect</strong> is the one role that sees the whole board. You do not write the code, run the sprint, or label the data — you <strong>direct, evaluate, and approve</strong> how every discipline fits into a single coherent, buildable, governable system. Week 12 closes the arc: everything you learned to direct across Weeks 1&ndash;11 becomes one package a team could build from tomorrow.</p>
<div class="kpis">
<div class="kpi"><div class="v">11</div><div class="l">Disciplines integrated</div></div>
<div class="kpi c1"><div class="v">6</div><div class="l">Capstone artifacts</div></div>
<div class="kpi c2"><div class="v">1</div><div class="l">Source of truth</div></div>
<div class="kpi c4"><div class="v">100%</div><div class="l">Traced end to end</div></div>
</div>
<div class="callout"><strong>Running example.</strong> We carry one initiative through: a regional restaurant chain, <em>Northwind Grill</em>, building an AI-enabled order-ahead and demand-forecasting platform. Every prior discipline produced a piece; your job is to make the pieces one system. In your build you may pick any of Restaurant, Insurance, Healthcare, Retail, or Manufacturing.</div>`
    },
    {
      id: "overview",
      navLabel: "Overview & Mission",
      eyebrow: "Overview · Mission",
      title: "Why the solution architect exists",
      body:
`<p>Every prior week taught you to direct one specialist — and each optimizes their own layer. The Data Engineer wants clean pipelines; UX wants the smoothest flow; the AI Engineer wants the most accurate model. Left uncoordinated, eleven locally-optimal decisions produce a globally-incoherent system: a beautiful interface on a data model that cannot support it, a model too slow at the counter, a governance rule discovered <em>after</em> the build. The architect makes it hang together and decides the trade-offs no single discipline can see.</p>
<div class="card"><div class="sub">Business value</div><ul class="clean"><li>Turns eleven deliverables into one system a sponsor can fund and a team can build.</li><li>Surfaces cross-cutting trade-offs (cost, latency, risk) before they become rework.</li><li>Creates a single source of truth every discipline points back to.</li></ul></div>
<div class="card"><div class="sub">What breaks without it</div><ul class="clean"><li>Integration surprises: two teams built to different contracts.</li><li>Non-functionals missed: works in the demo, melts on Friday dinner rush.</li><li>A model shipped with no owner for drift, cost, or compliance.</li></ul></div>
<div class="callout warn"><strong>How AI changes the architect.</strong> AI can draft an architecture document, a decision log, even a cost model in minutes. It cannot own the trade-off, defend the design to a skeptical sponsor, or decide what the business will accept. You supply the synthesis and judgment; AI supplies the first draft.</div>`
    },
    {
      id: "twenty",
      navLabel: "The 20% You Need",
      eyebrow: "The 20% You Need to Know",
      title: "Enough architecture to direct the whole system",
      body:
`<p>You are not becoming a full-time architect. You need these building blocks well enough to see when an AI-drafted architecture is incoherent, under-traced, or ducking a hard decision.</p>
<div class="table-wrap"><table>
<thead><tr><th>Concept</th><th>What it is</th><th>The tell of good work</th></tr></thead>
<tbody>
<tr><td>Synthesis role</td><td>Holding every discipline at once and making one system</td><td>Cross-layer conflicts are named, not hidden</td></tr>
<tr><td>End-to-end traceability</td><td>Each requirement linked need &rarr; design &rarr; build &rarr; test &rarr; run &rarr; govern</td><td>No orphan requirement or component</td></tr>
<tr><td>Decision record (ADR)</td><td>One decision: context, options, choice, consequences</td><td>Options considered are shown, not just the winner</td></tr>
<tr><td>Whole-system trade-off</td><td>Cost vs latency vs risk vs build-vs-buy, on the record</td><td>A stated winner and what was given up</td></tr>
<tr><td>Architecture package</td><td>The single document set that is the source of truth</td><td>One index; every artifact reachable from it</td></tr>
<tr><td>Quality attributes</td><td>System non-functionals (latency, uptime, cost per order)</td><td>Each has a number and a test</td></tr>
<tr><td>Cost model &amp; roadmap</td><td>Build/run economics, and a phased plan with gates</td><td>Real figures; sequenced by dependency and risk</td></tr>
</tbody>
</table></div>
<div class="callout"><strong>Example.</strong> Weak: "The platform will use AI for forecasting." Strong: an ADR naming the choice (a managed forecasting service over a self-hosted model), the options weighed, and the consequence — "accepts ~\$0.002/call to avoid a data-science hire and a GPU host; revisit past 50k orders/day." A decision you can defend.</div>`
    },
    {
      id: "role",
      navLabel: "Role in the SDLC",
      eyebrow: "Where it fits",
      title: "Role in the SDLC",
      body:
`<p>The AI Solution Architect does not own one phase — it spans the arc. It takes the outputs of every prior discipline, integrates them, then hands the business one package to fund and a team one blueprint to build. The capstone is where you <em>review</em> and <em>integrate</em> everything Weeks 1&ndash;11 produced.</p>
<div class="flow">
<div class="step"><div class="k">Wk 1</div><div class="t">Business Analysis</div></div>
<div class="step"><div class="k">Wk 2&ndash;3</div><div class="t">Design &amp; Plan</div></div>
<div class="step"><div class="k">Wk 4&ndash;7</div><div class="t">Build · UX · QA · Integrate</div></div>
<div class="step"><div class="k">Wk 8&ndash;9</div><div class="t">AI &amp; Data</div></div>
<div class="step"><div class="k">Wk 10&ndash;11</div><div class="t">DevOps &amp; Govern</div></div>
<div class="step"><div class="k">Wk 12 · you</div><div class="t">Architect: synthesize</div></div>
</div>
<div class="stack" style="margin-top:.4rem">
<div class="tier"><div class="lab">Feeds the architect</div><div class="row"><span class="chip">Requirements</span><span class="chip">Design</span><span class="chip">Plan</span><span class="chip">UX &amp; QA</span><span class="chip">Data model</span><span class="chip">AI approach</span><span class="chip">Runbooks</span><span class="chip">Governance</span></div></div>
<div class="tier"><div class="lab">The architect role (you direct it) &rarr; consumed by Sponsor, Delivery team, Governance</div><div class="row"><span class="chip pri">AI Solution Architect</span></div></div>
</div>
<div class="callout"><strong>Approval gate you own:</strong> architecture sign-off. Before a dollar of build is committed, you confirm the system is coherent, every requirement traces end to end, every hard trade-off has a recorded decision, and the cost and roadmap are honest.</div>`
    },
    {
      id: "io",
      navLabel: "Inputs & Outputs",
      eyebrow: "Section · Inputs & Outputs",
      title: "What comes in, what hands off",
      body:
`<div class="card"><h4>Inputs</h4><ul class="clean"><li>Requirements and the business case (Wk 1)</li><li>Solution design and delivery plan (Wk 2&ndash;3)</li><li>UX flows, test strategy, integration contracts (Wk 5&ndash;7)</li><li>The AI approach and the data model (Wk 8&ndash;9)</li><li>Deployment runbooks and governance policy (Wk 10&ndash;11)</li><li>Constraints: budget, regulation, timeline, existing systems</li></ul></div>
<div class="card"><h4>Outputs</h4><ul class="clean"><li>End-to-end Solution Architecture Document</li><li>Architecture Decision Log spanning the arc</li><li>Integrated document-set index and review</li><li>Cost model and delivery roadmap</li><li>The Capstone Architecture Package — one signed-off source of truth</li></ul></div>
<div class="sub">Information flow</div>
<div class="flow"><div class="step"><div class="k">In</div><div class="t">Eleven artifacts</div></div><div class="step"><div class="k">Review</div><div class="t">Trace &amp; conflict-check</div></div><div class="step"><div class="k">Decide</div><div class="t">Trade-offs &amp; ADRs</div></div><div class="step"><div class="k">Integrate</div><div class="t">One package</div></div><div class="step"><div class="k">Out</div><div class="t">Signed-off architecture</div></div></div>`
    },
    {
      id: "responsibilities",
      navLabel: "Responsibilities",
      eyebrow: "Ownership",
      title: "What the architect actually owns",
      body:
`<p>Seven responsibilities sit with the architect and no one else — each something you evaluate and approve, not personally produce.</p>
<ul class="clean">
<li><strong>Coherence</strong> — every discipline's output fits one system with no contradictions.</li>
<li><strong>Traceability</strong> — each requirement followed from need through to how it is governed.</li>
<li><strong>Trade-off decisions</strong> — cost, latency, risk, build-vs-buy decided on the record.</li>
<li><strong>Decision log</strong> — every significant choice captured as an ADR, dated and owned.</li>
<li><strong>Cost model &amp; roadmap</strong> — realistic economics and an explicit, gated delivery sequence.</li>
<li><strong>Presenting and defending</strong> — the design survives a skeptical sponsor.</li>
<li><strong>Sign-off</strong> — you say it is ready to build, or name exactly what is missing.</li>
</ul>
<div class="card"><div class="sub">You own vs you don't</div>
<div class="kv"><span class="k">Own</span><span class="val">Coherence · Trade-offs · The package · Sign-off</span></div>
<div class="kv"><span class="k">Don't own</span><span class="val">The code · The pipeline · The model weights · The tickets</span></div>
</div>`
    },
    {
      id: "artifacts",
      navLabel: "Documents You'll Generate",
      eyebrow: "Section · Documents",
      title: "The 6 documents your capstone builds",
      body:
`<p>These are exactly what your Field Guide generates for the chosen example — each viewable, searchable, and downloadable. Together they are the Capstone Architecture Package.</p>
<div class="table-wrap"><table>
<thead><tr><th>Document</th><th>What it proves</th></tr></thead>
<tbody>
<tr><td>End-to-End Solution Architecture Document</td><td>The whole system in one place — context, containers, components, data, integration, AI, deployment, security</td></tr>
<tr><td>Architecture Decision Log</td><td>Every significant choice across the arc, each as an ADR with options and consequences</td></tr>
<tr><td>Integrated Document-Set Index &amp; Review</td><td>One index of all upstream artifacts, tracing requirement &rarr; design &rarr; build &rarr; test &rarr; run &rarr; govern</td></tr>
<tr><td>Cost Model</td><td>Build cost, run cost, unit economics, and a 12-month total cost of ownership</td></tr>
<tr><td>Delivery Roadmap</td><td>Phased milestones with dependencies and approval gates</td></tr>
<tr><td>Capstone Architecture Package</td><td>One cohesive cover deliverable referencing the whole system, plus a one-page executive summary a sponsor can approve from</td></tr>
</tbody>
</table></div>`
    },
    {
      id: "goodbad",
      navLabel: "Good vs Bad Architecture",
      eyebrow: "Section · Good vs Bad",
      title: "Good vs bad architecture",
      body:
`<div class="card good"><h4>Good architecture</h4><ul>
<li>Every requirement traces end to end — no orphan needs or components.</li>
<li>Hard trade-offs decided on the record, with what was given up stated.</li>
<li>Non-functionals have numbers and tests (latency, uptime, cost per order).</li>
<li>One indexed package is the single source of truth; a roadmap sequenced by risk.</li>
</ul></div>
<div class="card bad"><h4>Bad architecture</h4><ul>
<li>A diagram with no decisions — pretty boxes, no defensible choices.</li>
<li>Trade-offs ducked: "we'll optimize later," "scale is not a concern yet."</li>
<li>Non-functionals as adjectives ("fast," "secure") with no target.</li>
<li>Eleven disconnected files and no index; a cost model that says "cloud is cheap."</li>
</ul></div>
<div class="callout warn"><strong>Red flags in AI-drafted architecture:</strong> a decision log where every ADR shows only the chosen option; traceability that stops at design and never reaches "govern"; a cost model with round numbers and no unit economics; a roadmap with no dependencies between phases.</div>`
    },
    {
      id: "metrics",
      navLabel: "KPIs & Success",
      eyebrow: "Section · Measurement",
      title: "KPIs & success measures",
      body:
`<p>Architecture quality is measurable. These are the signals you check before and after sign-off.</p>
<div class="card"><div class="sub">Architecture health</div>
<div class="kv"><span class="k">Requirements traced end to end</span><span class="val">Target 100%</span></div>
<div class="kv"><span class="k">Significant decisions with an ADR</span><span class="val">Target 100%</span></div>
<div class="kv"><span class="k">Non-functionals with a number + test</span><span class="val">Target 100%</span></div>
<div class="kv"><span class="k">Orphan components; cost variance to actuals</span><span class="val">0 · &plusmn;15%</span></div>
</div>
<div class="callout"><strong>Leading vs lagging.</strong> Traceability coverage and ADR completeness are <em>leading</em> — they predict a clean build. Integration defects at seams and re-litigated decisions are <em>lagging</em> — they confirm where the architecture was thin.</div>`
    },
    {
      id: "tools",
      navLabel: "Common Tools",
      eyebrow: "Section · Tools",
      title: "Common tools (recognition only)",
      body:
`<p>You direct these, you do not have to master them. Recognize what each is for and where AI accelerates it.</p>
<div class="table-wrap"><table>
<thead><tr><th>Tool</th><th>Used for</th><th>Where AI assists</th></tr></thead>
<tbody>
<tr><td>C4 model / Structurizr</td><td>Context, container, component views</td><td>Draft views from requirements</td></tr>
<tr><td>draw.io / Lucidchart</td><td>System and deployment diagrams</td><td>Generate first-pass diagrams</td></tr>
<tr><td>Markdown ADRs / Log4brains</td><td>The decision log</td><td>Draft ADRs from a summary</td></tr>
<tr><td>Confluence / Notion</td><td>The architecture package &amp; index</td><td>Assemble and cross-link the set</td></tr>
<tr><td>Jira Roadmaps / cost calculators</td><td>Roadmap &amp; cost model</td><td>Sequence phases; estimate run cost</td></tr>
</tbody>
</table></div>`
    },
    {
      id: "ai",
      navLabel: "AI Collaboration",
      eyebrow: "Section · AI Collaboration",
      title: "Working with AI on architecture",
      body:
`<div class="card"><h4>AI does well</h4><ul class="clean"><li>Assemble a first architecture document from the upstream artifacts</li><li>Draft ADRs and spot decisions that were never recorded</li><li>Build the traceability index and flag orphans</li><li>Produce a cost model and a phased roadmap skeleton</li></ul></div>
<div class="card"><h4>You still own</h4><ul class="clean"><li>The trade-off the business will actually accept</li><li>Which conflicting discipline is right</li><li>Whether the cost and timeline are honest</li><li>Defending the design and signing it off</li></ul></div>
<div class="callout warn"><strong>What AI gets wrong here.</strong> It writes confident diagrams that hide unmade decisions; presents one option as if no alternative existed; invents cost figures that look precise; and lets traceability stop at "build" instead of reaching "run" and "govern." Check every seam.</div>`
    },
    {
      id: "review",
      navLabel: "Architect Review Lens",
      eyebrow: "Architect Review",
      title: "Before you sign off the architecture",
      body:
`<p>Run the whole package through this lens before you commit a build.</p>
<div class="card"><h4>Coherence &amp; traceability</h4><ul class="clean"><li>Does every requirement trace need &rarr; design &rarr; build &rarr; test &rarr; run &rarr; govern?</li><li>Any orphan components with no requirement behind them?</li><li>Do the disciplines contradict each other anywhere?</li></ul></div>
<div class="card"><h4>Decisions, quality &amp; cost</h4><ul class="clean"><li>Does every significant choice have an ADR with the options it beat?</li><li>Do system non-functionals have numbers and tests?</li><li>Is the cost model real, and the roadmap sequenced by dependency with gates?</li></ul></div>
<div class="card"><h4>Defensibility</h4><ul class="clean"><li>Can you explain the design in one context diagram?</li><li>Can you answer "why not the cheaper option" on the spot?</li><li>Is there one index a sponsor and a builder both point to?</li></ul></div>
<div class="callout"><strong>Approve only when:</strong> every requirement traces end to end, every significant decision has an ADR, non-functionals have measurable targets, the cost model and roadmap are honest, and you can defend the whole design from a single package.</div>`
    },
    {
      id: "inspect",
      navLabel: "How to Inspect It",
      eyebrow: "Inspect Your Build",
      title: "What to check in your capstone package",
      body:
`<p>After Claude Code builds your Field Guide, open it and inspect these — the architect's review, practiced on your own deliverable:</p>
<ul class="clean">
<li><strong>Architecture Document</strong> — does it open with a context view of the whole system, not a component detail?</li>
<li><strong>Decision log</strong> — pick any ADR; does it show the options it beat and what the choice cost?</li>
<li><strong>Traceability index</strong> — follow one requirement all the way to how it is governed. Any break in the chain?</li>
<li><strong>Cost model</strong> — real unit economics (cost per order, per prediction), or just totals?</li>
<li><strong>Roadmap</strong> — do later phases actually depend on earlier ones, with visible gates?</li>
<li><strong>Ask assistant</strong> — ask "what trade-off did we make on the forecasting model?" and see if it answers from your ADRs.</li>
</ul>
<div class="callout">Found a gap? That is the point — refine your prompt, rebuild, re-upload. The newest version replaces the old; points are awarded once.</div>`
    },
    {
      id: "kb",
      navLabel: "Knowledge Base",
      eyebrow: "Knowledge Base",
      title: "Glossary & FAQ",
      body:
`<div class="kv"><span class="k">Solution architecture</span><span class="val">The whole system as one coherent, buildable design</span></div>
<div class="kv"><span class="k">Traceability</span><span class="val">Each requirement linked need &rarr; design &rarr; build &rarr; test &rarr; run &rarr; govern</span></div>
<div class="kv"><span class="k">ADR</span><span class="val">Architecture Decision Record — context, options, choice, consequences</span></div>
<div class="kv"><span class="k">Decision log</span><span class="val">The ledger of ADRs across the whole arc</span></div>
<div class="kv"><span class="k">C4 model</span><span class="val">Context, container, component, code views at four altitudes</span></div>
<div class="kv"><span class="k">Quality attribute</span><span class="val">A system non-functional with a target (latency, uptime, cost)</span></div>
<div class="kv"><span class="k">Trade-off / build vs buy</span><span class="val">Gaining one property by giving up another; build or adopt a capability</span></div>
<div class="kv"><span class="k">Cost model / TCO</span><span class="val">Build and run economics over a defined horizon</span></div>
<div class="kv"><span class="k">Delivery roadmap</span><span class="val">Phased milestones with dependencies and approval gates</span></div>
<div class="kv"><span class="k">Architecture package</span><span class="val">The single indexed document set that is the source of truth</span></div>
<div class="q"><div class="qt">Is the architect the boss of the other roles?</div><button class="revealbtn">Reveal</button><div class="ans">No. The architect has authority over the design's coherence, not over people. You decide how the pieces fit and which trade-off wins; the disciplines still own their craft.</div></div>
<div class="q"><div class="qt">What is the most common capstone failure?</div><button class="revealbtn">Reveal</button><div class="ans">Eleven good artifacts that never became one system — no index, no end-to-end trace, and the hard trade-offs still unmade. Integration is where the architect earns the title.</div></div>`
    },
    {
      id: "build",
      navLabel: "Build & Submit",
      eyebrow: "Build & Submit",
      title: "Build your AI Solution Architect capstone",
      body:
`<p class="lead">You will build your capstone in <strong>your own Claude Code</strong>: a searchable, Colaberry-branded AI Solution Architect Field Guide that generates the full architecture package for a chosen example, with an Ask assistant and downloadable documents. Then upload it here.</p>
<p>The package your build produces:</p>
<ul>
<li>End-to-End Solution Architecture Document (context, container, component, data, integration, AI, deployment, security views)</li>
<li>Architecture Decision Log — key decisions across the arc, each as an ADR</li>
<li>Integrated Document-Set Index &amp; Review, with end-to-end traceability</li>
<li>Cost Model with unit economics and a 12-month total cost of ownership</li>
<li>Delivery Roadmap with milestones, dependencies, and approval gates</li>
<li>The Capstone Architecture Package plus a one-page executive summary</li>
</ul>
<button class="buildcta" id="copyPromptBtn2" type="button">Copy the build prompt</button>
<p class="muted small">The prompt is long on purpose — just copy it and paste it straight into Claude Code. You do not need to read it.</p>`
    }
  ],
  buildPrompt: "Build a rich, self-contained AI Solution Architect FIELD GUIDE as a single HTML file named AISolutionArchitect_FieldGuide.html. Take your time and make it genuinely substantial — a 5 to 10 minute build that produces a polished, knowledge-base-style guide, not a quick page. This is the Week 12 CAPSTONE, so it must read as the culminating package that ties the whole 12-week arc into one coherent system.\n\nWHO IT'S FOR: I'm a learner in the Colaberry Enterprise AI Leadership Accelerator becoming an AI Solution Architect. I need the ~20% of solution architecture required to DIRECT, EVALUATE, and APPROVE an AI-assisted team spanning eleven disciplines — Business Analysis, Solution Architecture, Project Management, Software Engineering, UX, QA, Integration, AI Engineering, Data Engineering, DevOps, and Governance. Pick ONE example industry (Restaurant, Insurance, Healthcare, Retail, or Manufacturing), invent a believable AI-enabled initiative, and make every document concrete to it. The package must reference the outputs of all earlier disciplines for that same initiative, so it reads as the integration of a whole program, not a standalone doc.\n\nMAKE IT A KNOWLEDGE BASE, not a brochure: a left topic nav, a prominent SEARCH box, and an offline \"Ask\" assistant that answers FROM THE GUIDE'S OWN CONTENT (a small Q&A that matches a question to the most relevant section; no external API; works offline).\n\nBRANDING & QUALITY: Colaberry logo in the header and on the print/PDF export; executive, calm, authoritative voice; light/dark aware; fully self-contained inline CSS + JS, NO external libraries or CDNs, works offline.\n\nTEACH THE DISCIPLINE (concise): the architect's synthesis role; end-to-end traceability (requirement to design to build to test to run to govern); architecture decision records and a decision log across the arc; whole-system trade-offs (cost vs latency vs risk vs build-vs-buy); the architecture package as single source of truth; C4 views; system quality attributes; a cost model; a delivery roadmap; presenting and defending a design. Then good vs bad architecture, system KPIs, and the review lens.\n\nTHEN GENERATE THE DOCUMENTS — the heart of it. For the chosen example produce REAL, substantial documents (not placeholders), each in its own searchable section, each individually DOWNLOADABLE. PRIMARY format = a fully-styled, self-contained HTML deliverable that looks like a genuine professional document: a branded cover with the Colaberry logo, a document-control strip (version, owner, status, date), styled headers and navy tables, callouts, a sign-off block (Prepared / Reviewed / Approved), and a footer. Make each EXTENSIVE, not a summary. ALSO a Save-as-PDF that prints that same document, and an Excel-friendly .csv for the tabular ones (decision log, cost model, roadmap, traceability index). Do NOT default to plain .md:\n  1. End-to-End Solution Architecture Document (context, containers, components, data, integration, AI, deployment, security & governance views)\n  2. Architecture Decision Log — key decisions across the arc, each an ADR (context, options, decision, consequences)\n  3. Integrated Document-Set Index & Review — one index of every upstream artifact (BRD, design, plan, UX, test strategy, integration contracts, AI approach, data model, runbooks, governance policy) tracing requirement -> design -> build -> test -> run -> govern\n  4. Cost Model — build and run costs, unit economics (cost per order, per prediction), and a 12-month total cost of ownership\n  5. Delivery Roadmap — phased milestones with dependencies and approval gates\n  6. Capstone Architecture Package — one cohesive cover deliverable referencing the whole system and its document set, plus a one-page Executive Summary a sponsor could approve from\n\nUSE RICH VISUALS: Mermaid-style diagrams (a C4 context and container diagram, a sequence diagram for one AI-assisted flow, an ERD, and a deployment / CI-CD pipeline) AND Power BI-style charts (KPI tiles, cost bars, a roadmap/Gantt timeline, a trade-off matrix), ALL as INLINE SVG, self-contained and offline. QUALITY BAR: every requirement traces end to end; every significant decision has an ADR showing the options it beat; every trade-off states a winner and what was given up; the cost model uses real numbers with unit economics; nothing is an orphan.\n\nEMBED metadata as a JSON script tag id=\"deepdive-metadata\": { guide_type:\"AI Solution Architect Field Guide\", curriculum_type:\"deep_dive\", week:12, discipline:\"AI Solution Architect\", student_id, project_id, repository, generated_by:\"Claude Code\", generated_date, version, build_number }.\n\nWhen finished, open the file in the browser."
};
