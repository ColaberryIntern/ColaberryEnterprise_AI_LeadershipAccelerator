// Deep Dive Field Guide — content spec. Week 5 · UX Designer.
// Content only: the deterministic generator supplies chrome, nav, read-tracker, upload gate.
module.exports = {
  week: 5,
  role: "UX Designer",
  tag: "UX · Wk 5",
  sections: [

    {
      id: "dashboard",
      navLabel: "Dashboard",
      eyebrow: "UX Designer · Week 5",
      title: "Turn requirements into an experience people can use",
      body: `<p class="lead">The UX Designer decides <strong>how the solution feels to use</strong> — turning approved requirements into flows, screens, and interactions real people can complete without training. Your job as an architect isn't to push pixels; it's to <strong>direct, evaluate, and approve</strong> the experience an AI drafts, so the team ships something usable, accessible, and worth adopting.</p>
<div class="kpis">
  <div class="kpi"><div class="v">9</div><div class="l">Docs you'll build</div></div>
  <div class="kpi c1"><div class="v">10</div><div class="l">Usability heuristics</div></div>
  <div class="kpi c2"><div class="v">AA</div><div class="l">WCAG target</div></div>
  <div class="kpi c3"><div class="v">1</div><div class="l">Design system</div></div>
</div>
<div class="card">
  <div class="sub">How this Deep Dive works</div>
  <ul class="clean">
    <li>Read the learning sections — the rail fills with green checks as you go.</li>
    <li>In <strong>Build &amp; Submit</strong>, copy the build prompt and run it in your own Claude Code. It builds a searchable <strong>UX Designer Field Guide</strong> — personas, journeys, IA, wireframes, and a token sheet for a chosen example, plus an Ask assistant and downloads.</li>
    <li>Upload your Field Guide to earn <strong>100 points</strong>. When every section is read, <strong>Complete</strong> unlocks.</li>
  </ul>
</div>
<div class="callout"><strong>Running example.</strong> Throughout, we use one case — a regional clinic network adding an <em>online patient portal</em> for appointment booking and prescription refills. In your build you can pick any of Restaurant, Insurance, Healthcare, Retail, or Manufacturing.</div>`
    },

    {
      id: "overview",
      navLabel: "Overview & Mission",
      eyebrow: "Overview · Mission",
      title: "Why the UX Designer exists",
      body: `<p>Requirements say <em>what</em> to build; they rarely say how a nervous 68-year-old on a phone will actually book an appointment at 11pm. The UX Designer is the bridge between the requirement and the human: it <strong>researches</strong> who the users are, <strong>structures</strong> the information so they can find things, <strong>designs</strong> the flows and screens, and <strong>validates</strong> that real people can finish the task. Skip it and you ship a feature that technically works and nobody can use.</p>
<div class="card"><div class="sub">Business value</div><ul class="clean"><li>Turns "usable" from an opinion into a tested, measurable outcome.</li><li>Cuts the most expensive failure after launch: adoption that never happens.</li><li>Makes accessibility a design input, not a lawsuit or a retrofit.</li><li>Reduces rework — flows are cheap to change as wireframes, expensive as code.</li></ul></div>
<div class="card"><div class="sub">Common misconceptions</div><ul class="clean"><li>"UX is how it looks." UX is whether people can do the job; visual design is one slice.</li><li>"We'll add accessibility later." Later means a rebuild; it belongs in the first wireframe.</li><li>"Users will figure it out." If they have to figure it out, the design failed.</li><li>"Design once." Designs are hypotheses; usability testing is how you find out you were wrong cheaply.</li></ul></div>
<div class="callout warn"><strong>How AI changes UX.</strong> AI drafts personas, journey maps, IA, wireframe specs, and WCAG checklists in seconds. What it can't do is watch a real patient fail to find the "reschedule" button, or decide which of two flows respects the user's actual mental model. You supply the judgment and the evidence; AI supplies the first draft.</div>`
    },

    {
      id: "twenty",
      navLabel: "The 20% You Need",
      eyebrow: "The 20% You Need to Know",
      title: "Enough UX to direct and judge it",
      body: `<p>You don't need to become a UX Designer. You need these building blocks well enough to spot when an AI's design is untested, inaccessible, or built from aesthetics instead of tasks.</p>
<div class="table-wrap"><table>
  <thead><tr><th>Concept</th><th>What it is</th><th>The tell of good work</th></tr></thead>
  <tbody>
    <tr><td>Persona &amp; JTBD</td><td>An archetypal user and the "job" they hire the product to do</td><td>Goals &amp; frustrations, not demographics</td></tr>
    <tr><td>User journey map</td><td>The end-to-end path incl. thoughts, emotions, pain points</td><td>Shows the unhappy moments, not just the flow</td></tr>
    <tr><td>Information architecture</td><td>How content &amp; navigation are structured and labeled</td><td>Matches the user's mental model; validated</td></tr>
    <tr><td>Wireframe / mockup / prototype</td><td>Structure vs visual design vs clickable behavior</td><td>Right fidelity for the question being asked</td></tr>
    <tr><td>Usability heuristics</td><td>Nielsen's 10 rules of thumb for interface quality</td><td>Each screen rated against them</td></tr>
    <tr><td>Accessibility (WCAG AA)</td><td>Standards so people with disabilities can use it</td><td>Real contrast ratios, keyboard, focus, labels</td></tr>
    <tr><td>Visual &amp; interaction hierarchy</td><td>Guiding the eye and the action order on a screen</td><td>The primary action is unmistakable</td></tr>
    <tr><td>Design system &amp; tokens</td><td>Reusable components plus named style values</td><td>Screens are assembled, not reinvented</td></tr>
    <tr><td>Usability testing</td><td>Watching real users attempt real tasks</td><td>Findings change the design, not just confirm it</td></tr>
  </tbody>
</table></div>
<div class="callout"><strong>Example.</strong> Weak: "Make booking easy." Strong: a journey where a returning patient books a follow-up in <em>three taps</em>, the primary "Book" button meets a 4.5:1 contrast ratio, is reachable by keyboard with a visible focus ring, and the error state ("no slots this week") offers the next available date instead of a dead end.</div>`
    },

    {
      id: "role",
      navLabel: "Role in the SDLC",
      eyebrow: "Where it fits",
      title: "Role in the SDLC",
      body: `<p>The UX Designer owns the <strong>Design</strong> phase — after the problem and requirements are set, before engineering builds the front end. It takes the specified need and hands off a validated, accessible experience the team can build with confidence.</p>
<div class="flow">
  <div class="step"><div class="k">Before</div><div class="t">Requirements &amp; Solution shape</div></div>
  <div class="step"><div class="k">You are here</div><div class="t">UX Designer</div></div>
  <div class="step"><div class="k">After</div><div class="t">Front-end Development</div></div>
</div>
<div class="stack" style="margin-top:.4rem">
  <div class="tier"><div class="lab">Gives UX its input</div><div class="row"><span class="chip">Business Analyst</span><span class="chip">Product Owner</span><span class="chip">Users / Research</span></div></div>
  <div class="tier"><div class="lab">The UX role (you direct it)</div><div class="row"><span class="chip pri">UX Designer</span></div></div>
  <div class="tier"><div class="lab">Consumes UX's output</div><div class="row"><span class="chip">Front-end Dev</span><span class="chip">QA (tests flows &amp; a11y)</span><span class="chip">Solution Architect</span></div></div>
</div>
<div class="callout"><strong>Approval gate you own:</strong> design sign-off. Before engineering builds, you confirm the flows cover the real journeys, the IA is validated, accessibility meets WCAG AA, and usability testing shows people can complete the core task.</div>`
    },

    {
      id: "io",
      navLabel: "Inputs & Outputs",
      eyebrow: "Section · Inputs & Outputs",
      title: "What comes in, what hands off",
      body: `<div class="grid g2">
  <div class="card"><h4>Inputs</h4><ul class="clean"><li>Requirements &amp; user stories (from the BA)</li><li>User research, interviews, analytics</li><li>Brand, design system &amp; platform constraints</li><li>Accessibility &amp; compliance rules (WCAG, ADA / Section 508)</li></ul></div>
  <div class="card"><h4>Outputs</h4><ul class="clean"><li>Personas &amp; journey maps</li><li>Information architecture / sitemap</li><li>Annotated wireframes &amp; prototype spec</li><li>Heuristic eval, WCAG checklist, design tokens</li></ul></div>
</div>
<div class="sub">Information flow</div>
<div class="flow"><div class="step"><div class="k">In</div><div class="t">Reqs &amp; users</div></div><div class="step"><div class="k">Research</div><div class="t">Personas / JTBD</div></div><div class="step"><div class="k">Structure</div><div class="t">IA + journeys</div></div><div class="step"><div class="k">Design</div><div class="t">Wireframes</div></div><div class="step"><div class="k">Validate</div><div class="t">Usability + a11y</div></div><div class="step"><div class="k">Out</div><div class="t">Signed-off design</div></div></div>`
    },

    {
      id: "responsibilities",
      navLabel: "Responsibilities",
      eyebrow: "Ownership",
      title: "What a UX Designer actually does",
      body: `<div class="grid g2">
  <div class="card"><h4>Understand</h4><ul class="clean"><li>Research users &amp; their jobs-to-be-done</li><li>Build personas from goals, not demographics</li><li>Map journeys incl. pain points</li></ul></div>
  <div class="card"><h4>Structure</h4><ul class="clean"><li>Design the information architecture</li><li>Validate labels (card sort / tree test)</li><li>Define the primary task flows</li></ul></div>
  <div class="card"><h4>Design</h4><ul class="clean"><li>Wireframe screens &amp; every state</li><li>Set visual &amp; interaction hierarchy</li><li>Assemble from a design system + tokens</li></ul></div>
  <div class="card"><h4>Validate</h4><ul class="clean"><li>Run usability tests on real tasks</li><li>Audit accessibility to WCAG AA</li><li>Annotate &amp; hand off to engineering</li></ul></div>
</div>
<div class="card"><div class="sub">You own vs you don't</div>
  <div class="kv"><span class="k">Own</span><span class="val">The experience · Usability · Accessibility · Sign-off</span></div>
  <div class="kv"><span class="k">Don't own</span><span class="val">The requirements · The tech stack · The final CSS build</span></div>
</div>`
    },

    {
      id: "artifacts",
      navLabel: "Documents You'll Generate",
      eyebrow: "Section · Documents",
      title: "The 9 documents your Field Guide builds",
      body: `<p>These are exactly what your Field Guide generates for your chosen example — each viewable, searchable, and downloadable. Learn what each one proves.</p>
<div class="table-wrap"><table>
  <thead><tr><th>Document</th><th>What it proves</th></tr></thead>
  <tbody>
    <tr><td>Personas &amp; Jobs-to-be-Done</td><td>Who we design for and the job they need done</td></tr>
    <tr><td>User Journey Map</td><td>The end-to-end path, including pain and emotion</td></tr>
    <tr><td>Information Architecture / Sitemap</td><td>How content &amp; navigation are structured and labeled</td></tr>
    <tr><td>Annotated Wireframes</td><td>Screen structure and every state — empty, loading, error, success</td></tr>
    <tr><td>Usability Heuristic Evaluation</td><td>Each screen rated against Nielsen's 10, with severity</td></tr>
    <tr><td>Accessibility (WCAG 2.1 AA) Checklist</td><td>Contrast, keyboard, focus, labels — meets a real standard</td></tr>
    <tr><td>Design-System Token Sheet</td><td>Named color / type / spacing tokens — assembled, not reinvented</td></tr>
    <tr><td>Usability Test Plan &amp; Script</td><td>The tasks, metrics, and questions that prove people can use it</td></tr>
    <tr><td>Executive Summary</td><td>The design decisions and evidence, on one page</td></tr>
  </tbody>
</table></div>`
    },

    {
      id: "goodbad",
      navLabel: "Good vs Bad Design",
      eyebrow: "Section · Good vs Bad",
      title: "Good vs bad design",
      body: `<div class="gb">
  <div class="col good"><h4>Good design</h4><ul>
    <li>Flows designed from tested tasks, not from a nice-looking screen.</li>
    <li>Accessible by default — keyboard, contrast, labels, visible focus.</li>
    <li>Every state designed: empty, loading, error, success.</li>
    <li>Components come from one design system; tokens, not one-off hex.</li>
    <li>IA matches the user's mental model and was validated.</li>
  </ul></div>
  <div class="col bad"><h4>Bad design</h4><ul>
    <li>Aesthetics first; the task is an afterthought.</li>
    <li>Accessibility "added later" — low contrast, no focus, mouse-only.</li>
    <li>Happy path only; errors and empty states undefined.</li>
    <li>Every screen a bespoke snowflake — inconsistent and unmaintainable.</li>
    <li>Navigation mirrors the org chart, not the user's goals.</li>
  </ul></div>
</div>
<div class="callout warn"><strong>Red flags in AI-drafted UX:</strong> personas that are demographics, journeys with only the happy path, "WCAG AA compliant" claimed with no contrast ratios or focus order, wireframes full of lorem ipsum and missing states, and a "design system" that is really a random list of colors.</div>`
    },

    {
      id: "metrics",
      navLabel: "KPIs & Success",
      eyebrow: "Section · Measurement",
      title: "KPIs & success metrics",
      body: `<div class="grid g2">
  <div class="card"><h4>Usability signals</h4><ul class="clean"><li>Task success rate on the core flow</li><li>Time on task &amp; error rate</li><li>System Usability Scale (SUS) score</li><li>First-click success</li></ul></div>
  <div class="card"><h4>Health signals</h4><ul class="clean"><li>WCAG AA conformance (% criteria passed)</li><li>Funnel completion / drop-off</li><li>Support tickets traced to confusion</li></ul></div>
</div>
<div class="callout"><strong>Leading vs lagging.</strong> Usability-test success and accessibility conformance are <em>leading</em> — you can measure them before launch. Abandonment and confusion-driven support tickets are <em>lagging</em> — they confirm where the design failed after real users arrived.</div>`
    },

    {
      id: "tools",
      navLabel: "Common Tools",
      eyebrow: "Section · Tools",
      title: "Common tools (recognition only)",
      body: `<div class="table-wrap"><table>
  <thead><tr><th>Tool</th><th>Used for</th><th>Where AI assists</th></tr></thead>
  <tbody>
    <tr><td>Figma</td><td>Wireframes, mockups, prototypes, design systems</td><td>Draft screens &amp; component specs</td></tr>
    <tr><td>Maze / UserTesting</td><td>Remote usability testing</td><td>Draft task scripts &amp; questions</td></tr>
    <tr><td>axe / WAVE / Lighthouse</td><td>Accessibility auditing</td><td>Flag WCAG issues to verify</td></tr>
    <tr><td>Optimal Workshop</td><td>Card sorting &amp; tree testing (IA)</td><td>Propose an IA to validate</td></tr>
    <tr><td>Miro / FigJam</td><td>Journey maps &amp; workshops</td><td>Draft the journey &amp; pain points</td></tr>
    <tr><td>Style Dictionary / Tokens Studio</td><td>Design tokens</td><td>Generate a token scale</td></tr>
  </tbody>
</table></div>`
    },

    {
      id: "ai",
      navLabel: "AI Collaboration",
      eyebrow: "Section · AI Collaboration",
      title: "Working with AI on design",
      body: `<div class="grid g2">
  <div class="card"><h4>AI does well</h4><ul class="clean"><li>Draft personas, journeys, and IA</li><li>Describe wireframes &amp; every state</li><li>Run a first heuristic evaluation</li><li>Produce a WCAG checklist &amp; token scale</li></ul></div>
  <div class="card"><h4>You still own</h4><ul class="clean"><li>Whether it matches real users' mental model</li><li>That accessibility is real, not claimed</li><li>Which flow to ship &amp; the tradeoffs</li><li>Approving what testing actually proved</li></ul></div>
</div>
<div class="sub">The loop</div>
<div class="flow"><div class="step"><div class="k">1</div><div class="t">Describe users &amp; task</div></div><div class="step"><div class="k">2</div><div class="t">AI drafts UX</div></div><div class="step"><div class="k">3</div><div class="t">You evaluate</div></div><div class="step"><div class="k">4</div><div class="t">Test with users</div></div><div class="step"><div class="k">5</div><div class="t">Approve</div></div></div>
<div class="callout warn"><strong>What AI gets wrong.</strong> It will claim "WCAG AA compliant" without giving a single contrast ratio or focus order; it writes happy-path journeys; and its personas drift into age-and-income stereotypes. Make it show the specifics — ratios, success-criteria numbers, error states — or treat the claim as unproven.</div>`
    },

    {
      id: "review",
      navLabel: "Architect Review Lens",
      eyebrow: "Architect Review",
      title: "Before you approve a design",
      body: `<p>Run every AI-generated design through this lens before it reaches engineering.</p>
<div class="grid g2">
  <div class="card"><h4>Users &amp; tasks</h4><ul class="clean"><li>Do personas map to real jobs-to-be-done?</li><li>Does each journey cover errors &amp; edge states?</li><li>Is the core task genuinely fast?</li></ul></div>
  <div class="card"><h4>Structure</h4><ul class="clean"><li>Does the IA match the user's mental model?</li><li>Were labels validated (card sort / tree test)?</li><li>Core tasks reachable in about three clicks?</li></ul></div>
  <div class="card"><h4>Accessibility</h4><ul class="clean"><li>Text contrast at least 4.5:1 (3:1 for large)?</li><li>Fully keyboard operable, focus visible?</li><li>Labels, alt text, adequate target sizes?</li></ul></div>
  <div class="card"><h4>Consistency</h4><ul class="clean"><li>Assembled from the design system &amp; tokens?</li><li>Does it satisfy Nielsen's heuristics?</li><li>Is the primary action unmistakable?</li></ul></div>
</div>
<div class="callout"><strong>Approve only when:</strong> journeys cover the unhappy paths, the IA is validated, WCAG AA is verified with real ratios and criteria, components come from the design system, and usability testing shows real users complete the core task.</div>`
    },

    {
      id: "inspect",
      navLabel: "How to Inspect It",
      eyebrow: "Inspect Your Build",
      title: "What to check in your Field Guide",
      body: `<p>After Claude Code builds your Field Guide, open it and check these — this is how you practice the architect's review:</p>
<ul class="clean">
  <li><strong>Personas</strong> — goals, frustrations, and a real quote, or just age and income?</li>
  <li><strong>Journey map</strong> — does it show emotion and pain points, including the moment something goes wrong?</li>
  <li><strong>IA / sitemap</strong> — are core tasks within about three clicks, with plain-language labels?</li>
  <li><strong>Wireframes</strong> — is every state drawn (empty, loading, error, success), not just the happy screen?</li>
  <li><strong>WCAG checklist</strong> — does it cite real numbers (contrast 4.5:1) and criteria (like 2.4.7 Focus Visible), not just "compliant"?</li>
  <li><strong>Token sheet</strong> — semantic named tokens (color, type scale, spacing), or a random pile of hex codes?</li>
  <li><strong>Ask assistant</strong> — ask it "what contrast ratio does AA require?" and see if it answers from your docs.</li>
</ul>
<div class="callout">Found a gap? That's the point — refine your prompt, rebuild, and re-upload. The newest version replaces the old; points are awarded once.</div>`
    },

    {
      id: "kb",
      navLabel: "Knowledge Base",
      eyebrow: "Knowledge Base",
      title: "Glossary",
      body: `<div class="card">
  <div class="kv"><span class="k">Persona</span><span class="val">A concrete user archetype defined by goals and frustrations.</span></div>
  <div class="kv"><span class="k">Jobs-to-be-done</span><span class="val">The underlying task a user "hires" the product to accomplish.</span></div>
  <div class="kv"><span class="k">Journey map</span><span class="val">The end-to-end path a user takes, with thoughts, emotions, and pain points.</span></div>
  <div class="kv"><span class="k">Information architecture</span><span class="val">How content and navigation are organized, structured, and labeled.</span></div>
  <div class="kv"><span class="k">Wireframe</span><span class="val">A low-fidelity layout of structure and content — no final visuals.</span></div>
  <div class="kv"><span class="k">Mockup</span><span class="val">A static, high-fidelity visual design of a screen.</span></div>
  <div class="kv"><span class="k">Prototype</span><span class="val">A clickable model used to test behavior and flow.</span></div>
  <div class="kv"><span class="k">Usability heuristic</span><span class="val">One of Nielsen's 10 rules of thumb for interface quality.</span></div>
  <div class="kv"><span class="k">WCAG AA</span><span class="val">The accessibility conformance level most products target (e.g. 4.5:1 text contrast).</span></div>
  <div class="kv"><span class="k">Design token</span><span class="val">A named, reusable style value (color, spacing, type) shared across the system.</span></div>
  <div class="kv"><span class="k">Visual hierarchy</span><span class="val">Using size, weight, and contrast to guide the eye and rank actions.</span></div>
  <div class="kv"><span class="k">Tree testing</span><span class="val">Validating an IA by asking users to find items in the structure alone.</span></div>
</div>
<div class="q"><div class="qt">What's the difference between a wireframe, a mockup, and a prototype?</div><button class="revealbtn">Reveal</button><div class="ans">Wireframe = structure and content at low fidelity. Mockup = the high-fidelity visual look, static. Prototype = clickable, used to test behavior and flow. Use the lowest fidelity that answers your question.</div></div>
<div class="q"><div class="qt">What text contrast does WCAG AA require?</div><button class="revealbtn">Reveal</button><div class="ans">At least 4.5:1 for normal text and 3:1 for large text (roughly 18pt, or 14pt bold). Non-text UI components and focus indicators need at least 3:1.</div></div>
<div class="q"><div class="qt">Why validate information architecture with real users?</div><button class="revealbtn">Reveal</button><div class="ans">Because your mental model isn't theirs. Card sorting and tree testing reveal the labels and groupings users actually expect — before you build navigation around a guess.</div></div>`
    },

    {
      id: "build",
      navLabel: "Build & Submit",
      eyebrow: "Build & Submit",
      title: "Build your UX Designer Field Guide",
      body: `<p class="lead">You'll build your Field Guide in <strong>your own Claude Code</strong>: a searchable, Colaberry-branded UX Designer guide with personas, a journey map, information architecture, annotated wireframes, a heuristic evaluation, a WCAG checklist, and a design-token sheet — all generated for one chosen example, with an Ask assistant and downloadable documents. Then upload it here.</p>
<div class="sub">What your Field Guide will contain</div>
<ul class="clean">
  <li><strong>Personas &amp; Jobs-to-be-Done</strong> — who we design for and the job they need done.</li>
  <li><strong>User Journey Map</strong> — the end-to-end path with pain points and emotion.</li>
  <li><strong>Information Architecture / Sitemap</strong> — structure and labels for navigation.</li>
  <li><strong>Annotated Wireframes</strong> — key screens with every state.</li>
  <li><strong>Usability Heuristic Evaluation</strong> — each screen against Nielsen's 10.</li>
  <li><strong>Accessibility (WCAG 2.1 AA) Checklist</strong> — contrast, keyboard, focus, labels.</li>
  <li><strong>Design-System Token Sheet</strong> — named color, type, and spacing tokens.</li>
  <li><strong>Usability Test Plan &amp; Script</strong> — tasks, metrics, and questions.</li>
  <li><strong>Executive Summary</strong> — the decisions and evidence on one page.</li>
</ul>
<ol class="steps">
  <li>Click <strong>Copy the build prompt</strong> below (this is a required step).</li>
  <li>Open <strong>Claude Code</strong> — Week 5 needs no project yet, so a fresh folder is fine.</li>
  <li>Paste the prompt and run it. It takes Claude Code <strong>~5–10 minutes</strong> to build a full Field Guide.</li>
  <li>Explore it — search, ask the assistant, download the documents — then upload it to earn 100 points.</li>
</ol>
<button class="buildcta" id="copyPromptBtn2" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg> Copy the build prompt</button>`
    }

  ],

  buildPrompt: `Build a rich, self-contained UX Designer FIELD GUIDE as a single HTML file named UXDesigner_FieldGuide.html. Take your time and make it genuinely substantial — this is a 5 to 10 minute build that should produce a polished, knowledge-base-style guide, not a quick page.

WHO IT'S FOR: I'm a learner in the Colaberry Enterprise AI Leadership Accelerator becoming an AI Solution Architect. I need the ~20% of user-experience design required to DIRECT, EVALUATE, and APPROVE AI-generated UX work. I have no project yet — pick ONE example industry (Restaurant, Insurance, Healthcare, Retail, or Manufacturing), invent a believable initiative for it, and make every document concrete to that example.

MAKE IT A KNOWLEDGE BASE, not a brochure. Model it on a clean help-center / knowledge base (like a polished docs site): a left topic nav, a prominent SEARCH box, and an "Ask" assistant the learner can type questions into that answers FROM THE GUIDE'S OWN CONTENT (embed a small offline Q&A — match the question to the most relevant section/FAQ and show that answer; no external API; it must work offline).

BRANDING & QUALITY: put the Colaberry logo in the header and on the print/PDF export. Executive, calm, authoritative voice. Light/dark aware. Fully self-contained: inline CSS + JS, NO external libraries or CDNs, works offline when saved as one file.

TEACH THE DISCIPLINE (concise): why UX exists; the 20% to know (personas & jobs-to-be-done, user journeys, information architecture, wireframes vs mockups vs prototypes, Nielsen's usability heuristics, accessibility to WCAG 2.1 AA, visual & interaction hierarchy, design systems & tokens, usability testing); good vs bad design; UX KPIs (task success rate, time on task, SUS, WCAG conformance); the architect's review lens.

THEN GENERATE THE DOCUMENTS — this is the heart of it. For the chosen example, produce REAL, substantial documents (not placeholders), each in its own searchable section, each individually DOWNLOADABLE. The PRIMARY format is a fully-styled, self-contained HTML file that must look like a genuine, reusable, professional deliverable - a branded cover with the Colaberry logo, a document-control strip (version, owner, status, date), styled section headers and navy tables, callouts, a sign-off block (Prepared / Reviewed / Approved), and a footer. Make each document EXTENSIVE and complete, not a summary. ALSO provide a Save-as-PDF that prints that SAME designed document, and an Excel-friendly .csv export for the tabular documents (heuristic evaluation, WCAG checklist, token sheet). Do NOT default to plain .md:
  1. Personas & Jobs-to-be-Done (goals & frustrations, not demographics)
  2. User Journey Map (end-to-end, with thoughts, emotions, and pain points — including where it goes wrong)
  3. Information Architecture / Sitemap (structure and plain-language labels)
  4. Annotated Wireframes (key screens described, with every state: empty, loading, error, success)
  5. Usability Heuristic Evaluation (each screen scored against Nielsen's 10, with severity ratings)
  6. Accessibility (WCAG 2.1 AA) Checklist (real contrast ratios, keyboard operability, focus order, labels, target sizes, cited success criteria)
  7. Design-System Token Sheet (named color, type-scale, and spacing tokens — semantic, not raw hex)
  8. Usability Test Plan & Script (tasks, success metrics, and post-task questions)
  9. A one-page Executive Summary

USE RICH VISUALS wherever they aid understanding: Mermaid-style diagrams (user flow / journey maps, sitemap trees, the sequence of a task) AND Power BI-style charts (KPI tiles, bar / line / donut) for anything quantitative (task success rate, SUS score, WCAG pass rate, priority mix). Render ALL diagrams and charts as INLINE SVG (self-contained, no external libraries or CDNs) so the guide works offline. QUALITY BAR: personas grounded in goals; journeys that include the unhappy path; an IA no deeper than three clicks to core tasks; wireframes with every state; accessibility with real numbers (4.5:1 contrast, visible focus) and cited WCAG criteria; a design system of named tokens, not scattered colors. Every document must be findable via the search box and answerable by the Ask assistant.

EMBED metadata as a JSON script tag with id="deepdive-metadata": { guide_type:"UX Designer Field Guide", curriculum_type:"deep_dive", week:5, discipline:"UX Designer", student_id, project_id, repository, generated_by:"Claude Code", generated_date, version, build_number }.

When finished, open the file in the browser.`
};
