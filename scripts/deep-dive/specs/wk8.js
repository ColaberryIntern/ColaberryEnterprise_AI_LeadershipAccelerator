// Deep Dive Field Guide content spec — Week 8 · AI Engineer.
// Content only. The deterministic generator supplies chrome, brand CSS, nav,
// read-tracker, upload gate, the "Start here" banner (section 1) and the
// checklist/upload box (section 15). Bodies begin AFTER the injected <h2> title.
module.exports = {
  week: 8,
  role: "AI Engineer",
  tag: "AI · Wk 8",
  sections: [

    {
      id: "dashboard",
      navLabel: "Dashboard",
      eyebrow: "AI Engineer · Week 8",
      title: "Design the AI capability itself — and make it evaluable",
      body: `
<p class="lead">The AI Engineer builds the <strong>capability itself</strong> — the prompts, agents, tools, and retrieval that turn a model into a reliable feature. Your job as an architect isn't to write the prompt; it's to <strong>direct, evaluate, and approve</strong> an AI-designed capability so it is grounded, safe, fast enough, and measurably good — not just a demo that impresses once and hallucinates in production.</p>
<div class="kpis">
  <div class="kpi"><div class="v">8</div><div class="l">AI design docs</div></div>
  <div class="kpi c1"><div class="v">40</div><div class="l">Golden-set cases</div></div>
  <div class="kpi c2"><div class="v">5</div><div class="l">Eval metrics</div></div>
  <div class="kpi c3"><div class="v">2</div><div class="l">Guardrail layers</div></div>
</div>
<div class="card">
  <div class="sub">How this Deep Dive works</div>
  <ul class="clean">
    <li>Read the learning sections — the rail fills with green checks as you go.</li>
    <li>In <strong>Build &amp; Submit</strong>, copy the build prompt and run it in your own Claude Code. It builds a searchable <strong>Field Guide</strong> — with the AI-capability documents generated for a chosen example, an Ask assistant, and downloads.</li>
    <li>Upload your Field Guide to earn <strong>100 points</strong>. When every section is read, <strong>Complete</strong> unlocks.</li>
  </ul>
</div>
<div class="callout"><strong>Running example.</strong> Throughout, we use one case — an insurer building a <em>policyholder coverage copilot</em> that answers "am I covered for this?" grounded in the customer's own policy and endorsements. In your build you can pick any of Restaurant, Insurance, Healthcare, Retail, or Manufacturing.</div>
`
    },

    {
      id: "overview",
      navLabel: "Overview & Mission",
      eyebrow: "Overview · Mission",
      title: "Why the AI Engineer exists",
      body: `
<p>A model on its own is a fluent guesser. The AI Engineer turns it into a <strong>dependable capability</strong>: framing exactly what the AI must do, feeding it the right context, grounding its answers in real sources, wrapping it in guardrails, and — critically — building the <strong>evaluation</strong> that proves it works before and after every change. Skip this discipline and you ship a demo: dazzling in the meeting, wrong in the wild, with no way to tell whether last week's prompt tweak helped or hurt.</p>
<div class="card"><div class="sub">Business value</div><ul class="clean"><li>Converts "the model sounds smart" into "the capability is measurably correct."</li><li>Makes every prompt, model, or retrieval change a <em>measured</em> change, not a gamble.</li><li>Controls the three things that sink AI features in production: hallucination, cost, and latency.</li><li>Draws a clear line between what the AI decides and what a human must approve.</li></ul></div>
<div class="card"><div class="sub">Common misconceptions</div><ul class="clean"><li>"Prompt engineering is the whole job." The evaluation is the job; the prompt is one input to it.</li><li>"It worked in the demo." A demo is one lucky sample; an eval is the distribution.</li><li>"Bigger model fixes it." Often the fix is better context and retrieval, at a fraction of the cost.</li><li>"AI output is deterministic." It is probabilistic — the same input can yield different answers.</li></ul></div>
<div class="callout warn"><strong>What breaks without it.</strong> No golden set, so no one can prove a change is safe. Answers with no grounding, so the copilot confidently invents a coverage limit. No cost or latency budget, so the feature is unaffordable at scale. No escalation path, so a low-confidence guess reaches a customer as fact.</div>
`
    },

    {
      id: "twenty",
      navLabel: "The 20% You Need",
      eyebrow: "The 20% You Need to Know",
      title: "Enough AI engineering to direct and judge it",
      body: `
<p>You don't need to become an AI Engineer. You need these building blocks well enough to spot when an AI-designed capability is ungrounded, unevaluated, unsafe, or quietly expensive.</p>
<div class="table-wrap"><table>
  <thead><tr><th>Concept</th><th>What it is</th><th>The tell of good work</th></tr></thead>
  <tbody>
    <tr><td>Use-case framing</td><td>Deciding what the AI must do and what "good" means</td><td>One success metric plus explicit non-goals</td></tr>
    <tr><td>Prompt &amp; context engineering</td><td>Instructions plus the right context assembled per call</td><td>Context is curated for the task, not dumped in</td></tr>
    <tr><td>Agents, tools &amp; skills</td><td>A model that can call tools/skills to act, not just chat</td><td>Each tool has a clear contract; the loop is bounded</td></tr>
    <tr><td>Retrieval / RAG</td><td>Grounding answers in retrieved source passages</td><td>No source found means no claim made</td></tr>
    <tr><td>Evaluation</td><td>Offline evals, a golden set, LLM-as-judge scoring</td><td>Every change is measured, not eyeballed</td></tr>
    <tr><td>Guardrails &amp; safety</td><td>Input/output checks; hallucination and refusal control</td><td>Ungrounded or unsafe output is blocked, not hoped away</td></tr>
    <tr><td>Model selection</td><td>Matching model tier to the job's cost/latency/quality</td><td>The cheapest model that still passes the evals</td></tr>
    <tr><td>Determinism vs probabilistic</td><td>The same input can yield different output</td><td>Critical paths are validated, not trusted blindly</td></tr>
    <tr><td>Human-in-the-loop</td><td>Routing low-confidence cases to a person</td><td>A real confidence threshold and a real review queue</td></tr>
  </tbody>
</table></div>
<div class="callout"><strong>Example.</strong> Weak framing: "Answer policy questions." Strong framing: "Answer a policyholder's coverage question using only their policy and endorsements; if the document is silent or ambiguous, say so and route to a licensed adjuster — never assert a binding coverage determination." Target: at least 95% of answers grounded in a cited clause.</div>
`
    },

    {
      id: "role",
      navLabel: "Role in the SDLC",
      eyebrow: "Where it fits",
      title: "Role in the SDLC",
      body: `
<p>The AI Engineer owns the <strong>Build-the-capability</strong> phase. It takes an approved design and indexed knowledge and hands off an evaluated, guardrailed capability that QA can test and MLOps can deploy and monitor.</p>
<div class="flow">
  <div class="step"><div class="k">Before</div><div class="t">Architecture + indexed knowledge</div></div>
  <div class="step"><div class="k">You are here</div><div class="t">AI Engineer</div></div>
  <div class="step"><div class="k">After</div><div class="t">QA / Evaluation + MLOps</div></div>
</div>
<div class="stack" style="margin-top:.4rem">
  <div class="tier"><div class="lab">Gives the AI Engineer its input</div><div class="row"><span class="chip">Solution Architect</span><span class="chip">Data Engineer</span><span class="chip">Domain SMEs</span></div></div>
  <div class="tier"><div class="lab">The AI Engineer role (you direct it)</div><div class="row"><span class="chip pri">AI Engineer</span></div></div>
  <div class="tier"><div class="lab">Consumes the AI Engineer's output</div><div class="row"><span class="chip">QA / Evaluation</span><span class="chip">MLOps / DevOps</span><span class="chip">Security &amp; Compliance</span></div></div>
</div>
<div class="callout"><strong>Approval gate you own:</strong> capability readiness. Before the AI feature ships, you confirm it passes the golden-set evals at target, guardrails block the known-bad cases, cost and latency are within budget, and low-confidence cases escalate to a human.</div>
`
    },

    {
      id: "io",
      navLabel: "Inputs & Outputs",
      eyebrow: "Section · Inputs & Outputs",
      title: "What comes in, what hands off",
      body: `
<div class="grid g2">
  <div class="card"><h4>Inputs</h4><ul class="clean"><li>Approved use-case and definition of "good"</li><li>Source knowledge to ground on (policy docs, KB)</li><li>Model access, rate limits, and a cost budget</li><li>Safety, privacy, and compliance constraints</li><li>Example questions and gold answers from SMEs</li></ul></div>
  <div class="card"><h4>Outputs</h4><ul class="clean"><li>AI use-case spec and prompt/agent design</li><li>Retrieval/context design and grounding rules</li><li>Evaluation plan plus a golden set</li><li>Model selection rationale and guardrails spec</li><li>Cost + latency budget and human-in-the-loop design</li></ul></div>
</div>
<div class="sub">Information flow</div>
<div class="flow"><div class="step"><div class="k">In</div><div class="t">Use-case + sources</div></div><div class="step"><div class="k">Frame</div><div class="t">What good looks like</div></div><div class="step"><div class="k">Design</div><div class="t">Prompt · agent · retrieval</div></div><div class="step"><div class="k">Evaluate</div><div class="t">Golden set + judge</div></div><div class="step"><div class="k">Harden</div><div class="t">Guardrails + HITL</div></div><div class="step"><div class="k">Out</div><div class="t">Approved capability</div></div></div>
`
    },

    {
      id: "responsibilities",
      navLabel: "Responsibilities",
      eyebrow: "Ownership",
      title: "What an AI Engineer actually does",
      body: `
<div class="grid g2">
  <div class="card"><h4>Frame</h4><ul class="clean"><li>Define the use-case and success metric</li><li>Set explicit non-goals and refusal cases</li><li>Agree the human-in-the-loop threshold</li></ul></div>
  <div class="card"><h4>Design</h4><ul class="clean"><li>Engineer the system prompt and context</li><li>Design agents, tools, and skills with contracts</li><li>Design retrieval: sources, chunking, grounding</li></ul></div>
  <div class="card"><h4>Evaluate</h4><ul class="clean"><li>Build a golden set with hard and adversarial cases</li><li>Choose metrics and an LLM-as-judge rubric</li><li>Run offline evals on every change</li></ul></div>
  <div class="card"><h4>Harden</h4><ul class="clean"><li>Add input/output guardrails and refusals</li><li>Select the cheapest model that passes evals</li><li>Budget cost and latency; wire escalation</li></ul></div>
</div>
<div class="card"><div class="sub">You own vs you don't</div>
  <div class="kv"><span class="k">Own</span><span class="val">The eval bar · Grounding rules · Safety sign-off</span></div>
  <div class="kv"><span class="k">Don't own</span><span class="val">The model's weights · The infra · The business policy</span></div>
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
    <tr><td>AI Use-Case Spec</td><td>The problem, what "good" looks like, the success metric, and the non-goals</td></tr>
    <tr><td>Prompt &amp; Agent Design</td><td>The system prompt, tools/skills, and how context is assembled each call</td></tr>
    <tr><td>Retrieval / Context Design</td><td>Sources, chunking, index, and what happens when nothing relevant is found</td></tr>
    <tr><td>Evaluation Plan + Golden Set</td><td>The metrics, the graded test cases, and the LLM-as-judge rubric</td></tr>
    <tr><td>Model Selection Rationale</td><td>Candidates weighed on cost, latency, and quality — and the decision</td></tr>
    <tr><td>Guardrails &amp; Safety Spec</td><td>The input/output checks, refusal policy, and hallucination controls</td></tr>
    <tr><td>Cost + Latency Budget</td><td>Token math, per-request cost, and p50/p95 latency targets</td></tr>
    <tr><td>Human-in-the-Loop &amp; Escalation Design</td><td>The confidence threshold and the review queue for uncertain cases</td></tr>
  </tbody>
</table></div>
`
    },

    {
      id: "goodbad",
      navLabel: "Good vs Bad Capability",
      eyebrow: "Section · Good vs Bad",
      title: "Good vs bad AI capability design",
      body: `
<div class="gb">
  <div class="col good"><h4>Good capability design</h4><ul>
    <li>Every answer is grounded in a retrieved, cited source.</li>
    <li>A golden set with adversarial cases gates each change.</li>
    <li>Guardrails block the known-bad outputs by rule, not by hope.</li>
    <li>The model is the cheapest tier that still passes the evals.</li>
    <li>Low-confidence cases escalate to a human on a real threshold.</li>
  </ul></div>
  <div class="col bad"><h4>Bad capability design</h4><ul>
    <li>Answers freely, ungrounded — invents limits, dates, and clauses.</li>
    <li>"Tested" by eyeballing a few prompts in a chat window.</li>
    <li>No refusal path, so ambiguity becomes a confident wrong answer.</li>
    <li>Defaults to the biggest model, so cost and latency balloon.</li>
    <li>Judge prompt rewards long, fluent answers over correct ones.</li>
  </ul></div>
</div>
<div class="callout warn"><strong>Red flags in an AI-designed capability:</strong> a golden set with only easy cases, an eval with no failure examples, a system prompt that assumes context instead of retrieving it, no measured hallucination rate, and no defined behavior for "no relevant source found."</div>
`
    },

    {
      id: "metrics",
      navLabel: "KPIs & Success",
      eyebrow: "Section · Measurement",
      title: "KPIs & success metrics",
      body: `
<div class="kpis">
  <div class="kpi"><div class="v">95%</div><div class="l">Grounded answers</div></div>
  <div class="kpi c1"><div class="v">90%</div><div class="l">Golden-set pass</div></div>
  <div class="kpi c2"><div class="v">&lt;2%</div><div class="l">Hallucination rate</div></div>
  <div class="kpi c3"><div class="v">2.5s</div><div class="l">p95 latency</div></div>
</div>
<div class="grid g2" style="margin-top:.5rem">
  <div class="card"><h4>Quality signals</h4><ul class="clean"><li>Groundedness / faithfulness to the cited source</li><li>Answer accuracy against the golden set</li><li>Refusal correctness — it refuses when it should</li></ul></div>
  <div class="card"><h4>Health signals</h4><ul class="clean"><li>Cost per request and p95 latency</li><li>Escalation rate to the human queue</li><li>Eval pass-rate trend across versions</li></ul></div>
</div>
<div class="callout"><strong>Leading vs lagging.</strong> Groundedness and golden-set pass-rate are <em>leading</em> — they predict trouble before release. Hallucination rate and escalation volume in production are <em>lagging</em> — they confirm where the design fell short.</div>
`
    },

    {
      id: "tools",
      navLabel: "Common Tools",
      eyebrow: "Section · Tools",
      title: "Common tools (recognition only)",
      body: `
<div class="table-wrap"><table>
  <thead><tr><th>Tool category</th><th>Used for</th><th>What to notice</th></tr></thead>
  <tbody>
    <tr><td>Model APIs (e.g. Claude)</td><td>The reasoning engine and tool-calling loop</td><td>A small fast tier and a larger reasoning tier for different jobs</td></tr>
    <tr><td>Retrieval / vector index</td><td>Finding the passages to ground on</td><td>Chunking and recall quality, not just "it has embeddings"</td></tr>
    <tr><td>Agent / orchestration</td><td>Wiring tools, skills, and the control loop</td><td>Bounded loops and typed tool contracts</td></tr>
    <tr><td>Eval frameworks</td><td>Running the golden set and scoring</td><td>Reproducible runs and an LLM-as-judge rubric</td></tr>
    <tr><td>Prompt / context management</td><td>Versioning prompts and assembled context</td><td>Prompt changes are tracked like code</td></tr>
    <tr><td>Tracing / observability</td><td>Seeing tokens, latency, and failures per call</td><td>Correlation IDs from request to answer</td></tr>
  </tbody>
</table></div>
<p class="muted small">Recognition, not tutorials. You direct these; you don't have to operate them. Match the tool to the job, not the hype.</p>
`
    },

    {
      id: "ai",
      navLabel: "AI Collaboration",
      eyebrow: "Section · AI Collaboration",
      title: "Working with AI to build AI",
      body: `
<div class="grid g2">
  <div class="card"><h4>AI does well</h4><ul class="clean"><li>Draft the system prompt and tool contracts</li><li>Generate golden-set candidate questions</li><li>Propose edge, adversarial, and refusal cases</li><li>Draft an LLM-as-judge scoring rubric</li></ul></div>
  <div class="card"><h4>You still own</h4><ul class="clean"><li>Whether the golden set is actually hard</li><li>What counts as grounded and what counts as unsafe</li><li>The cost/latency budget and the model choice</li><li>Approving that the evals mean what they claim</li></ul></div>
</div>
<div class="callout warn"><strong>What AI gets wrong here.</strong> It writes golden sets that are too easy, judge prompts that reward length over correctness, and system prompts that assume context instead of retrieving it. It over-claims capability and under-writes the failure path. Check the hard cases first — the model is optimistic about its own work.</div>
<div class="sub">The loop</div>
<div class="flow"><div class="step"><div class="k">1</div><div class="t">Frame the use-case</div></div><div class="step"><div class="k">2</div><div class="t">AI drafts design + evals</div></div><div class="step"><div class="k">3</div><div class="t">You run the golden set</div></div><div class="step"><div class="k">4</div><div class="t">Harden the failures</div></div><div class="step"><div class="k">5</div><div class="t">Approve</div></div></div>
`
    },

    {
      id: "review",
      navLabel: "Architect Review Lens",
      eyebrow: "Architect Review",
      title: "Before you approve an AI capability",
      body: `
<p>Run every AI-designed capability through this lens before it ships.</p>
<div class="grid g2">
  <div class="card"><h4>Use-case &amp; success</h4><ul class="clean"><li>Is there one success metric, not a vibe?</li><li>Are the non-goals and refusals explicit?</li><li>Is the human-in-the-loop threshold defined?</li></ul></div>
  <div class="card"><h4>Evaluation rigor</h4><ul class="clean"><li>Does the golden set include hard, adversarial cases?</li><li>Does the judge reward grounding, not length?</li><li>Is every change measured against the same set?</li></ul></div>
  <div class="card"><h4>Safety &amp; grounding</h4><ul class="clean"><li>Is every answer traceable to a cited source?</li><li>What happens when no source is found?</li><li>Do guardrails block the known-bad outputs?</li></ul></div>
  <div class="card"><h4>Cost &amp; latency</h4><ul class="clean"><li>Is this the cheapest model that passes?</li><li>Are p50/p95 latency targets budgeted?</li><li>Does cost per request scale affordably?</li></ul></div>
</div>
<div class="callout"><strong>Approve only when:</strong> the use-case has a measurable success metric, the golden set passes at target with adversarial cases covered, every answer is grounded or refused, guardrails block the known-bad outputs, the model is the cheapest that passes, cost and latency are within budget, and low-confidence cases escalate to a human.</div>
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
  <li><strong>Use-Case Spec</strong> — does it open with a measurable success metric and explicit non-goals, not a feature list?</li>
  <li><strong>Golden set</strong> — are there adversarial and ambiguous cases with expected answers, or only easy ones?</li>
  <li><strong>Evaluation plan</strong> — is there a metric per case and a judge rubric that rewards grounding over fluency?</li>
  <li><strong>Retrieval design</strong> — does it define what happens on "no relevant source" — refuse or escalate?</li>
  <li><strong>Guardrails spec</strong> — does it name concrete blocked outputs (a coverage guarantee, leaked PII) and the check that stops each?</li>
  <li><strong>Cost + latency budget</strong> — is there real token math and a p95 target, not just "it's cheap and fast"?</li>
  <li><strong>Ask assistant</strong> — try asking it "what is in the golden set?" and see if it answers from your own documents.</li>
</ul>
<div class="callout">Found a gap? That's the point — refine your prompt, rebuild, and re-upload. The newest version replaces the old; points are awarded once.</div>
`
    },

    {
      id: "kb",
      navLabel: "Knowledge Base",
      eyebrow: "Knowledge Base",
      title: "Glossary & FAQ",
      body: `
<div class="kv"><span class="k">RAG</span><span class="val">Retrieval-augmented generation — ground answers in fetched sources</span></div>
<div class="kv"><span class="k">Groundedness</span><span class="val">Every claim is supported by a cited passage</span></div>
<div class="kv"><span class="k">Golden set</span><span class="val">Curated test cases with expected answers</span></div>
<div class="kv"><span class="k">LLM-as-judge</span><span class="val">A model scores outputs against a rubric</span></div>
<div class="kv"><span class="k">Offline eval</span><span class="val">Graded run before release, not in production</span></div>
<div class="kv"><span class="k">Guardrail</span><span class="val">A rule that blocks unsafe or ungrounded output</span></div>
<div class="kv"><span class="k">Hallucination</span><span class="val">Confident output with no source in reality</span></div>
<div class="kv"><span class="k">System prompt</span><span class="val">The standing instructions given every call</span></div>
<div class="kv"><span class="k">Tool / function call</span><span class="val">The model invokes a typed action, not just text</span></div>
<div class="kv"><span class="k">Determinism</span><span class="val">Same input, same output — not guaranteed for LLMs</span></div>
<div class="kv"><span class="k">Human-in-the-loop</span><span class="val">Uncertain cases routed to a person to decide</span></div>
<div class="kv"><span class="k">p95 latency</span><span class="val">95% of responses finish within this time</span></div>
<div class="q"><div class="qt">1. Why is a golden set more trustworthy than a good demo?</div><button class="revealbtn">Reveal</button><div class="ans">A demo is one lucky sample; a golden set measures the distribution, including the hard and adversarial cases, so a change is proven, not hoped.</div></div>
<div class="q"><div class="qt">2. What should the capability do when retrieval finds no relevant source?</div><button class="revealbtn">Reveal</button><div class="ans">Refuse to answer and escalate — say the document is silent or ambiguous and route to a human. No source means no claim.</div></div>
<div class="q"><div class="qt">3. When is the biggest model the wrong choice?</div><button class="revealbtn">Reveal</button><div class="ans">When a cheaper, faster tier already passes the golden set at target. Pick the cheapest model that passes, not the most powerful one available.</div></div>
`
    },

    {
      id: "build",
      navLabel: "Build & Submit",
      eyebrow: "Build & Submit",
      title: "Build your AI Engineer Field Guide",
      body: `
<p class="lead">You'll build your Field Guide in <strong>your own Claude Code</strong>: a searchable, Colaberry-branded guide with the AI-capability documents generated for a chosen example, an Ask assistant, and downloadable docs. Then upload it here.</p>
<p>Your Field Guide will generate real, substantial versions of the AI Engineer's core documents:</p>
<ul class="clean">
  <li><strong>AI Use-Case Spec</strong> — problem, what good looks like, success metric, non-goals</li>
  <li><strong>Prompt &amp; Agent Design</strong> — system prompt, tools/skills, context assembly</li>
  <li><strong>Retrieval / Context Design</strong> — sources, chunking, index, grounding rules</li>
  <li><strong>Evaluation Plan + Golden Set</strong> — metrics, graded cases, LLM-as-judge rubric</li>
  <li><strong>Model Selection Rationale</strong> — cost / latency / quality trade-off and decision</li>
  <li><strong>Guardrails &amp; Safety Spec</strong> — input/output checks, refusal policy, hallucination control</li>
  <li><strong>Cost + Latency Budget</strong> — token math, per-request cost, p50/p95 targets</li>
  <li><strong>Human-in-the-Loop &amp; Escalation Design</strong> — confidence threshold and review queue</li>
</ul>
<button class="buildcta" id="copyPromptBtn2" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg> Copy the build prompt</button>
<p class="muted small">The prompt is long on purpose — just copy it and paste it straight into Claude Code. You don't need to read it.</p>
`
    }

  ],
  buildPrompt: `Build a rich, self-contained AI Engineer FIELD GUIDE as a single HTML file named AIEngineer_FieldGuide.html. Take your time and make it genuinely substantial — this is a 5 to 10 minute build that should produce a polished, knowledge-base-style guide, not a quick page.

WHO IT'S FOR: I'm a learner in the Colaberry Enterprise AI Leadership Accelerator becoming an AI Solution Architect. I need the ~20% of AI systems engineering required to DIRECT, EVALUATE, and APPROVE an AI-designed capability — the prompts, agents, tools, retrieval, evaluations, and guardrails an AI drafts. I have no project yet — pick ONE example industry (Restaurant, Insurance, Healthcare, Retail, or Manufacturing), invent a believable AI capability for it (for example, a grounded policyholder coverage copilot for Insurance that answers "am I covered for this?" from the customer's own policy and endorsements), and make every document concrete to that example.

MAKE IT A KNOWLEDGE BASE, not a brochure. Model it on a clean help-center / knowledge base (like a polished docs site): a left topic nav, a prominent SEARCH box, and an "Ask" assistant the learner can type questions into that answers FROM THE GUIDE'S OWN CONTENT (embed a small offline Q&A — match the question to the most relevant section/FAQ and show that answer; no external API; it must work offline).

BRANDING & QUALITY: put the Colaberry logo in the header and on the print/PDF export. Executive, calm, authoritative voice. Light/dark aware. Fully self-contained: inline CSS + JS, NO external libraries or CDNs, works offline when saved as one file.

TEACH THE DISCIPLINE (concise): framing an AI use-case (what good looks like); prompt & context engineering; agents, tools & skills; retrieval / RAG; evaluation (offline evals, golden sets, LLM-as-judge); guardrails, safety & hallucination control; model selection & cost/latency trade-offs; determinism vs probabilistic; human-in-the-loop.

THEN GENERATE THE DOCUMENTS — this is the heart of it. For the chosen example, produce REAL, substantial documents (not placeholders), each in its own searchable section, each individually DOWNLOADABLE. The PRIMARY format is a fully-styled, self-contained HTML file that must look like a genuine, reusable, professional deliverable — a branded cover with the Colaberry logo, a document-control strip (version, owner, status, date), styled section headers and navy tables, callouts, a sign-off block (Prepared / Reviewed / Approved), and a footer. Make each document EXTENSIVE and complete, not a summary. ALSO provide a Save-as-PDF that prints that SAME designed document, and an Excel-friendly .csv export for the tabular documents (golden set, evaluation results, cost model). Do NOT default to plain .md:
  1. AI Use-Case Spec (problem, what good looks like, success metric, non-goals)
  2. Prompt & Agent Design (system prompt, tools/skills, context assembly)
  3. Retrieval / Context Design (sources, chunking, index, grounding rules, no-source behavior)
  4. Evaluation Plan + Golden Set (metrics, a ~40-case golden set with hard and adversarial cases, LLM-as-judge rubric)
  5. Model Selection Rationale (candidate models weighed on cost, latency, and quality, and the decision)
  6. Guardrails & Safety Spec (input/output guardrails, refusal policy, hallucination control)
  7. Cost + Latency Budget (token math, per-request cost, p50/p95 latency targets)
  8. Human-in-the-Loop & Escalation Design (confidence thresholds, the review queue, when a human decides)

USE RICH VISUALS wherever they aid understanding: Mermaid-style diagrams (the RAG pipeline flow, an agent tool-call sequence, the escalation decision tree) AND Power BI-style charts (KPI tiles, bar / line / donut) for anything quantitative (golden-set pass-rate, cost mix by token type, latency distribution). Render ALL diagrams and charts as INLINE SVG (self-contained, no external libraries or CDNs) so the guide works offline. QUALITY BAR: every answer grounded in a cited source; a golden set with adversarial cases; guardrails that block the known-bad outputs by rule; the cheapest model that still passes the evals; a defined behavior for "no relevant source found." Every document must be findable via the search box and answerable by the Ask assistant.

EMBED metadata as a JSON script tag with id="deepdive-metadata": { guide_type:"AI Engineer Field Guide", curriculum_type:"deep_dive", week:8, discipline:"AI Engineer", student_id, project_id, repository, generated_by:"Claude Code", generated_date, version, build_number }.

When finished, open the file in the browser.`
};
