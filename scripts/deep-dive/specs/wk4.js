// Deep Dive Field Guide — content spec. Week 4 · Software Engineer.
// Content only; the deterministic generator supplies chrome (brand CSS, nav,
// read-tracker, upload gate). Shared classes only. No emoji, no colors,
// no <style>/<script>. Running example: an insurer's online First Notice of
// Loss (FNOL) claims-intake service.

module.exports = {
  week: 4,
  role: "Software Engineer",
  tag: "SWE · Wk 4",
  sections: [

    {
      id: "dashboard",
      navLabel: "Dashboard",
      eyebrow: "Software Engineer · Week 4",
      title: "Turn an approved design into working, tested code",
      body: `
        <p class="lead">The Software Engineer turns an approved design into <strong>working, maintainable, tested code</strong> — the part an AI now writes most of. Your job as an architect is not to type every line; it is to <strong>direct, evaluate, and approve</strong> the code an AI produces, so what ships is correct, readable, and safe to change.</p>
        <div class="kpis">
          <div class="kpi"><div class="v">7</div><div class="l">Docs you'll build</div></div>
          <div class="kpi c1"><div class="v">3</div><div class="l">Test tiers</div></div>
          <div class="kpi c2"><div class="v">5</div><div class="l">SOLID principles</div></div>
          <div class="kpi c3"><div class="v">1</div><div class="l">Definition of done</div></div>
        </div>
        <div class="card">
          <div class="sub">How this Deep Dive works</div>
          <ul class="clean">
            <li>Read the learning sections — the rail fills with checks as you go.</li>
            <li>In <strong>Build &amp; Submit</strong>, copy the build prompt and run it in your own Claude Code. It builds a searchable <strong>Field Guide</strong> — the engineering documents generated for a chosen example, an Ask assistant, and downloads.</li>
            <li>Upload your Field Guide to earn points. When every section is read, <strong>Complete</strong> unlocks.</li>
          </ul>
        </div>
        <div class="callout"><strong>Running example.</strong> Throughout, we use one case — an insurer building an online <em>First Notice of Loss</em> (FNOL) claims-intake service. In your build you can pick any of Restaurant, Insurance, Healthcare, Retail, or Manufacturing.</div>
      `
    },

    {
      id: "overview",
      navLabel: "Overview & Mission",
      eyebrow: "Overview · Mission",
      title: "Why the Software Engineer exists",
      body: `
        <p>An approved design is a promise; code is the reality that either keeps it or breaks it. The Software Engineer <strong>implements</strong> the design, <strong>structures</strong> it so it can be understood and changed, and <strong>proves</strong> it works with tests. Skip the discipline and you still get code that runs once — then rots into something no one can safely touch. When a claim is filed at 2 a.m., the difference between a clean intake service and a fragile one is whether the customer's claim is captured or silently lost.</p>
        <div class="card"><div class="sub">Business value</div><ul class="clean"><li>Turns a design into software that actually behaves as specified.</li><li>Keeps code <em>changeable</em> — most cost lands in the years after launch, not the first release.</li><li>Catches defects with tests before customers do.</li><li>Makes the codebase legible so the next engineer (or AI) can extend it safely.</li></ul></div>
        <div class="card"><div class="sub">Common misconceptions</div><ul class="clean"><li>"It compiles, so it's done." Done means designed, tested, reviewed, and shippable.</li><li>"Working code is good code." Code is read far more than it is written; readability is a feature.</li><li>"Tests slow us down." Untested code slows every future change.</li><li>"AI writes it, so we can skip review." AI writes fast and confidently — including confident mistakes.</li></ul></div>
        <div class="callout"><strong>How AI changes engineering.</strong> AI now writes most of the lines — scaffolding modules, boilerplate, and tests in seconds. What it does not own is architecture fit, correctness on the edge cases, security, and whether the code truly satisfies the design. You supply judgment and the standard; AI supplies the draft.</div>
      `
    },

    {
      id: "twenty",
      navLabel: "The 20% You Need",
      eyebrow: "The 20% You Need to Know",
      title: "Enough engineering to direct and judge it",
      body: `
        <p>You don't need to become a senior engineer. You need these building blocks well enough to spot when AI-written code is fragile, unreadable, untested, or quietly wrong.</p>
        <div class="table-wrap"><table>
          <thead><tr><th>Concept</th><th>What it is</th><th>The tell of good work</th></tr></thead>
          <tbody>
            <tr><td>Technical design doc</td><td>The plan for how the code will be built, before it is written</td><td>Approach, modules, and trade-offs are explicit</td></tr>
            <tr><td>Modularity / separation of concerns</td><td>One responsibility per module; unrelated things kept apart</td><td>You can change one part without touching the rest</td></tr>
            <tr><td>Interfaces &amp; contracts</td><td>The typed inputs, outputs, and errors a module promises</td><td>Callers depend on the contract, not the internals</td></tr>
            <tr><td>Clean code &amp; naming</td><td>Names and structure that reveal intent</td><td>Reads like prose; needs few comments to follow</td></tr>
            <tr><td>Version control &amp; branching</td><td>Git history, feature branches, and reviewable pull requests</td><td>Small, focused PRs with a clear story</td></tr>
            <tr><td>Code review</td><td>A second set of eyes before code merges</td><td>Catches design and safety issues, not just typos</td></tr>
            <tr><td>Testing pyramid</td><td>Many fast unit tests, fewer integration, fewest end-to-end</td><td>Failure and boundary paths are tested, not just the happy path</td></tr>
            <tr><td>Technical debt</td><td>Shortcuts that cost interest until repaid</td><td>Taken deliberately and tracked, not accidental</td></tr>
            <tr><td>DRY / SOLID</td><td>Don't repeat yourself; five principles for change-friendly code</td><td>Logic lives in one place; modules have a single responsibility</td></tr>
            <tr><td>Error handling</td><td>How the code behaves when things fail</td><td>Explicit, logged, and typed — never a silent catch</td></tr>
          </tbody>
        </table></div>
        <div class="callout"><strong>Example.</strong> Weak: a 400-line <code>processClaim()</code> that validates, saves, emails, and formats a response. Strong: a <code>ClaimIntake</code> module with a typed contract that delegates to <code>validateClaim</code>, <code>ClaimRepository.save</code>, and <code>notifyAdjuster</code> — each testable on its own, each with its own failure path.</div>
      `
    },

    {
      id: "role",
      navLabel: "Role in the SDLC",
      eyebrow: "Where It Fits",
      title: "Role in the SDLC",
      body: `
        <p>The Software Engineer owns the <strong>Build</strong> phase — the construction stage of the lifecycle. It takes an approved technical design and hands tested, reviewed code to QA and release.</p>
        <div class="flow">
          <div class="step"><div class="k">Before</div><div class="t">Architecture &amp; Technical Design</div></div>
          <div class="step"><div class="k">You are here</div><div class="t">Software Engineer</div></div>
          <div class="step"><div class="k">After</div><div class="t">QA / Testing &amp; Release</div></div>
        </div>
        <div class="stack" style="margin-top:.4rem">
          <div class="tier"><div class="lab">Gives engineering its input</div><div class="row"><span class="chip">Solution Architect</span><span class="chip">Tech Lead</span><span class="chip">Design doc &amp; acceptance criteria</span></div></div>
          <div class="tier"><div class="lab">The engineering role (you direct it)</div><div class="row"><span class="chip pri">Software Engineer</span></div></div>
          <div class="tier"><div class="lab">Consumes engineering's output</div><div class="row"><span class="chip">QA / Test</span><span class="chip">DevOps / Release</span><span class="chip">The next engineer</span></div></div>
        </div>
        <div class="callout"><strong>Approval gate you own:</strong> code review and merge to the main branch. Before code advances, you confirm it meets the design, is tested, is readable, handles failure, and satisfies the definition of done.</div>
      `
    },

    {
      id: "io",
      navLabel: "Inputs & Outputs",
      eyebrow: "Section · Inputs &amp; Outputs",
      title: "What comes in, what hands off",
      body: `
        <div class="card"><h4>Inputs</h4><ul class="clean"><li>Approved technical design / architecture</li><li>Acceptance criteria for each story</li><li>Coding standards &amp; the existing codebase</li><li>Interface &amp; data contracts from adjacent systems</li></ul></div>
        <div class="card"><h4>Outputs</h4><ul class="clean"><li>Working, readable, modular code</li><li>Unit &amp; integration tests that prove it</li><li>Pull requests with a clear change story</li><li>Updated docs and a met definition of done</li></ul></div>
        <div class="sub">Information flow</div>
        <div class="flow"><div class="step"><div class="k">In</div><div class="t">Approved design</div></div><div class="step"><div class="k">Design</div><div class="t">Modules &amp; contracts</div></div><div class="step"><div class="k">Build</div><div class="t">Code + tests</div></div><div class="step"><div class="k">Review</div><div class="t">PR &amp; merge</div></div><div class="step"><div class="k">Out</div><div class="t">Shippable change</div></div></div>
      `
    },

    {
      id: "responsibilities",
      navLabel: "Responsibilities",
      eyebrow: "Ownership",
      title: "What a Software Engineer actually does",
      body: `
        <p>The Software Engineer owns the path from an approved design to a merged, tested change.</p>
        <ul class="clean">
          <li>Translate the design into a module breakdown with explicit interfaces and contracts.</li>
          <li>Write code that is small, single-responsibility, and named to reveal intent.</li>
          <li>Cover behavior with tests across the pyramid — unit, integration, and the critical end-to-end paths.</li>
          <li>Handle failure explicitly: timeouts, retries, and errors that are logged and typed, never swallowed.</li>
          <li>Keep changes in small, reviewable pull requests with a clear story.</li>
          <li>Review peers' (and AI's) code against the checklist before it merges.</li>
          <li>Track technical debt deliberately instead of letting it accrue silently.</li>
          <li>Confirm every change meets the definition of done before calling it complete.</li>
        </ul>
        <div class="card"><div class="sub">You own vs you don't</div>
          <div class="kv"><span class="k">Own</span><span class="val">Structure · Tests · Code review · Merge</span></div>
          <div class="kv"><span class="k">Don't own</span><span class="val">The requirements · The overall architecture · Release scheduling</span></div>
        </div>
      `
    },

    {
      id: "artifacts",
      navLabel: "Documents You'll Generate",
      eyebrow: "Section · Documents",
      title: "The 7 documents your Field Guide builds",
      body: `
        <p>These are exactly what your Field Guide generates for your chosen example — each viewable, searchable, and downloadable. Learn what each one proves.</p>
        <div class="table-wrap"><table>
          <thead><tr><th>Document</th><th>What it proves</th></tr></thead>
          <tbody>
            <tr><td>Technical Design Document (TDD)</td><td>How the code will be built — approach, modules, data, trade-offs — before writing it</td></tr>
            <tr><td>Module / Component Design + API signatures</td><td>Each part has one responsibility and an explicit, typed contract</td></tr>
            <tr><td>Coding Standards</td><td>The house style and naming rules AI and humans must follow</td></tr>
            <tr><td>Code Review Checklist</td><td>The concrete gate every pull request must pass</td></tr>
            <tr><td>Unit &amp; Integration Test Plan</td><td>What is tested, at which tier, including failure and boundary cases</td></tr>
            <tr><td>Branching &amp; PR Workflow</td><td>How change moves from branch to review to main, safely</td></tr>
            <tr><td>Definition of Done</td><td>The objective bar that separates "it runs" from "it ships"</td></tr>
          </tbody>
        </table></div>
      `
    },

    {
      id: "goodbad",
      navLabel: "Good vs Bad Code",
      eyebrow: "Section · Good vs Bad",
      title: "Good vs bad code",
      body: `
        <div class="card good"><h4>Good code</h4><ul class="clean">
          <li>Small, single-responsibility modules with explicit contracts.</li>
          <li>Names that reveal intent — <code>validateClaim</code>, not <code>doStuff</code>.</li>
          <li>Tested behavior, including failure and boundary paths.</li>
          <li>Errors handled explicitly, logged, and typed.</li>
          <li>Changed in small, reviewable pull requests.</li>
        </ul></div>
        <div class="card bad"><h4>Bad code</h4><ul class="clean">
          <li>God functions that validate, save, notify, and format at once.</li>
          <li>Vague names and copy-pasted logic in three places.</li>
          <li>Happy-path only — no tests for what happens when it fails.</li>
          <li>Empty <code>catch</code> blocks that hide the real error.</li>
          <li>A 2,000-line pull request no one can truly review.</li>
        </ul></div>
        <div class="callout"><strong>Red flags in AI-written code:</strong> confident code with no tests, a silently swallowed error, duplicated logic instead of a shared function, a plausible-looking function that never handles empty or malformed input, and a giant diff that "does everything."</div>
      `
    },

    {
      id: "metrics",
      navLabel: "KPIs & Success",
      eyebrow: "Section · Measurement",
      title: "KPIs &amp; success metrics",
      body: `
        <div class="kpis">
          <div class="kpi"><div class="v">&ge;80%</div><div class="l">Test coverage</div></div>
          <div class="kpi c1"><div class="v">100%</div><div class="l">Code reviewed</div></div>
          <div class="kpi c2"><div class="v">&lt;24h</div><div class="l">PR cycle time</div></div>
          <div class="kpi c3"><div class="v">0</div><div class="l">Known criticals at merge</div></div>
        </div>
        <div class="card"><div class="sub">What to watch</div>
          <div class="kv"><span class="k">Test coverage of critical paths</span><span class="val">Leading</span></div>
          <div class="kv"><span class="k">Pull-request size &amp; review time</span><span class="val">Leading</span></div>
          <div class="kv"><span class="k">Change failure rate</span><span class="val">Lagging</span></div>
          <div class="kv"><span class="k">Defects escaped to production</span><span class="val">Lagging</span></div>
          <div class="kv"><span class="k">Time to restore after a failure</span><span class="val">Lagging</span></div>
        </div>
        <div class="callout"><strong>Leading vs lagging.</strong> Small PRs, review coverage, and tested critical paths are <em>leading</em> — they predict trouble early. Change-failure rate and escaped defects are <em>lagging</em> — they confirm where the discipline slipped.</div>
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
            <tr><td>Git / GitHub / GitLab</td><td>Version control, branches, pull requests</td><td>Draft PR descriptions &amp; summarize diffs</td></tr>
            <tr><td>Claude Code / Copilot</td><td>Writing &amp; refactoring code</td><td>Generate modules, tests, and refactors</td></tr>
            <tr><td>ESLint / Prettier</td><td>Style &amp; static checks</td><td>Enforce standards; auto-fix violations</td></tr>
            <tr><td>Jest / PyTest</td><td>Unit &amp; integration tests</td><td>Draft test cases from the spec</td></tr>
            <tr><td>GitHub Actions / CI</td><td>Build, test, and gate on every PR</td><td>Suggest pipeline steps &amp; surface failures</td></tr>
            <tr><td>TypeScript / typed languages</td><td>Contracts enforced at compile time</td><td>Infer types &amp; flag contract breaks</td></tr>
          </tbody>
        </table></div>
        <p class="muted small">Recognition, not tutorials — you direct these; you don't have to master each one.</p>
      `
    },

    {
      id: "ai",
      navLabel: "AI Collaboration",
      eyebrow: "Section · AI Collaboration",
      title: "Working with AI on code",
      body: `
        <div class="card"><h4>AI does well</h4><ul class="clean"><li>Scaffold modules and boilerplate from a clear spec</li><li>Write first-draft unit and integration tests</li><li>Refactor toward smaller, named functions</li><li>Explain unfamiliar code and suggest edge cases</li></ul></div>
        <div class="card"><h4>You still own</h4><ul class="clean"><li>Whether the code fits the approved architecture</li><li>Correctness on the edge and failure cases</li><li>Security and handling of untrusted input</li><li>Approving that it truly meets the design</li></ul></div>
        <div class="sub">The loop</div>
        <div class="flow"><div class="step"><div class="k">1</div><div class="t">Give the spec</div></div><div class="step"><div class="k">2</div><div class="t">AI drafts code</div></div><div class="step"><div class="k">3</div><div class="t">You review</div></div><div class="step"><div class="k">4</div><div class="t">Refine prompt</div></div><div class="step"><div class="k">5</div><div class="t">Test &amp; merge</div></div></div>
        <div class="callout"><strong>What AI gets wrong.</strong> It writes plausible code that skips empty or malformed input, invents an API that doesn't exist, duplicates logic instead of reusing it, and marks work done without a failing-path test. Assume the draft is confident, not correct.</div>
      `
    },

    {
      id: "review",
      navLabel: "Architect Review Lens",
      eyebrow: "Architect Review",
      title: "Before you approve a change",
      body: `
        <p>Run every AI-generated change through this lens before it merges.</p>
        <div class="card"><h4>Correctness</h4><ul class="clean"><li>Does it do what the design and acceptance criteria specify?</li><li>Are edge, empty, and malformed inputs handled?</li><li>Does it fail safely — logged, typed, no silent catch?</li></ul></div>
        <div class="card"><h4>Design &amp; structure</h4><ul class="clean"><li>One responsibility per module, with a clear contract?</li><li>Any duplicated logic that should be shared?</li><li>Names that reveal intent without comments?</li></ul></div>
        <div class="card"><h4>Tests</h4><ul class="clean"><li>Do tests assert behavior, not just run the code?</li><li>Are failure and boundary paths covered?</li><li>Is the mix right — mostly fast unit tests?</li></ul></div>
        <div class="card"><h4>Safety &amp; change</h4><ul class="clean"><li>Is untrusted input validated at the boundary?</li><li>Is the PR small enough to truly review?</li><li>Is any shortcut tracked as explicit debt?</li></ul></div>
        <div class="callout"><strong>Approve only when:</strong> the code meets the design, edge and failure paths are handled and tested, modules are single-responsibility with clear contracts, the change is small enough to review, and the definition of done is fully met.</div>
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
          <li><strong>Technical Design Document</strong> — does it state the approach and trade-offs, not just restate the requirement?</li>
          <li><strong>Module design</strong> — does each module have one responsibility and a typed contract (inputs, outputs, errors)?</li>
          <li><strong>Test plan</strong> — is it a real pyramid, and does it list failure and boundary cases, not only the happy path?</li>
          <li><strong>Code review checklist</strong> — would it actually catch a silent catch, a god function, or duplicated logic?</li>
          <li><strong>Branching &amp; PR workflow</strong> — is there a rule that keeps pull requests small and reviewed before merge?</li>
          <li><strong>Definition of done</strong> — is it objective enough that two people would agree whether a change passes?</li>
          <li><strong>Ask assistant</strong> — try asking "what belongs in the definition of done?" and see if it answers from your docs.</li>
        </ul>
        <div class="callout">Found a gap? That's the point — refine your prompt, rebuild, and re-upload. The newest version replaces the old.</div>
      `
    },

    {
      id: "kb",
      navLabel: "Knowledge Base",
      eyebrow: "Knowledge Base",
      title: "Glossary",
      body: `
        <div class="card"><div class="sub">Key terms</div>
          <div class="kv"><span class="k">Technical Design Doc (TDD)</span><span class="val">The plan for how code will be built, before writing it</span></div>
          <div class="kv"><span class="k">Interface / contract</span><span class="val">A module's promised inputs, outputs, and errors</span></div>
          <div class="kv"><span class="k">Separation of concerns</span><span class="val">Keeping unrelated responsibilities in separate modules</span></div>
          <div class="kv"><span class="k">DRY</span><span class="val">Don't Repeat Yourself — one home for each piece of logic</span></div>
          <div class="kv"><span class="k">SOLID</span><span class="val">Five principles for change-friendly object design</span></div>
          <div class="kv"><span class="k">Testing pyramid</span><span class="val">Many unit, fewer integration, fewest end-to-end tests</span></div>
          <div class="kv"><span class="k">Technical debt</span><span class="val">A shortcut that costs interest until it is repaid</span></div>
          <div class="kv"><span class="k">Pull request (PR)</span><span class="val">A proposed change reviewed before it merges</span></div>
          <div class="kv"><span class="k">Refactor</span><span class="val">Improving structure without changing behavior</span></div>
          <div class="kv"><span class="k">Definition of done</span><span class="val">The objective bar a change must meet to ship</span></div>
          <div class="kv"><span class="k">Idempotency</span><span class="val">Running an operation twice yields the same end state</span></div>
        </div>
        <div class="q"><div class="qt">Why review AI-written code if it compiles and the tests pass?</div><button class="revealbtn">Reveal</button><div class="ans">Compiling and green tests only prove what the tests check. AI writes confident code that can skip edge cases, security, and architecture fit — the things a review lens catches.</div></div>
        <div class="q"><div class="qt">What is the single fastest signal of risky code?</div><button class="revealbtn">Reveal</button><div class="ans">A large pull request with no tests. Size hides defects, and no tests means nothing proves behavior — insist on small, tested changes.</div></div>
        <div class="q"><div class="qt">Unit or end-to-end — which should there be most of?</div><button class="revealbtn">Reveal</button><div class="ans">Unit. They are fast, precise, and cheap. The pyramid wants many unit tests, fewer integration, and only the most critical end-to-end paths.</div></div>
      `
    },

    {
      id: "build",
      navLabel: "Build & Submit",
      eyebrow: "Build &amp; Submit",
      title: "Build your Software Engineer Field Guide",
      body: `
        <p class="lead">You'll build your Field Guide in <strong>your own Claude Code</strong>: a searchable, Colaberry-branded guide with the engineering documents generated for a chosen example, an Ask assistant, and downloadable docs.</p>
        <p>It produces real, professional versions of these documents for one example initiative:</p>
        <ul>
          <li><strong>Technical Design Document</strong> — approach, module breakdown, data model, and trade-offs</li>
          <li><strong>Module / Component Design + API signatures</strong> — one responsibility and a typed contract per module</li>
          <li><strong>Coding Standards</strong> — the naming and style rules AI must follow</li>
          <li><strong>Code Review Checklist</strong> — the gate every pull request passes</li>
          <li><strong>Unit &amp; Integration Test Plan</strong> — cases mapped to the testing pyramid, including failure paths</li>
          <li><strong>Branching &amp; PR Workflow</strong> — how change moves to main safely</li>
          <li><strong>Definition of Done</strong> — the objective bar for shippable</li>
        </ul>
        <button class="buildcta" id="copyPromptBtn2" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg> Copy the build prompt</button>
        <p class="muted small">The prompt is long on purpose — just copy it and paste it straight into Claude Code.</p>
        <div class="sub" style="margin-top:1rem">Self-check</div>
        <div class="q"><div class="qt">Why is a small pull request safer than a large one?</div><button class="revealbtn">Reveal</button><div class="ans">Small PRs can actually be reviewed — defects hide in large diffs. They also fail smaller and are easier to revert.</div></div>
        <div class="q"><div class="qt">Name one thing tests should cover beyond the happy path.</div><button class="revealbtn">Reveal</button><div class="ans">Failure and boundary cases — empty, malformed, or oversized input, and what happens when a dependency is unavailable.</div></div>
        <div class="q"><div class="qt">What does a good module contract specify?</div><button class="revealbtn">Reveal</button><div class="ans">Its inputs, its outputs, and its errors — so callers depend on the promise, not the internals.</div></div>
      `
    }

  ],

  buildPrompt: `Build a rich, self-contained Software Engineer FIELD GUIDE as a single HTML file named SoftwareEngineer_FieldGuide.html. Take your time and make it genuinely substantial — this is a 5 to 10 minute build that should produce a polished, knowledge-base-style guide, not a quick page.

WHO IT'S FOR: I'm a learner in the Colaberry Enterprise AI Leadership Accelerator becoming an AI Solution Architect. I need the ~20% of software engineering required to DIRECT, EVALUATE, and APPROVE AI-generated code. I have no project yet — pick ONE example industry (Restaurant, Insurance, Healthcare, Retail, or Manufacturing), invent a believable feature for it, and make every document concrete to that example.

MAKE IT A KNOWLEDGE BASE, not a brochure. Model it on a clean help-center / knowledge base: a left topic nav, a prominent SEARCH box, and an "Ask" assistant the learner can type questions into that answers FROM THE GUIDE'S OWN CONTENT (embed a small offline Q&A — match the question to the most relevant section/FAQ and show that answer; no external API; it must work offline).

BRANDING & QUALITY: put the Colaberry logo in the header and on the print/PDF export. Executive, calm, authoritative voice. Light/dark aware. Fully self-contained: inline CSS + JS, NO external libraries or CDNs, works offline when saved as one file.

TEACH THE DISCIPLINE (concise): why software engineering exists; the 20% to know — technical design documents, modularity and separation of concerns, interfaces and contracts, clean code and naming, version control with branching and code review, the testing pyramid, technical debt, DRY and SOLID (lightly), and error handling; good vs bad code; engineering KPIs; the architect's review lens for approving AI-written code.

THEN GENERATE THE DOCUMENTS — this is the heart of it. For the chosen example, produce REAL, substantial documents (not placeholders), each in its own searchable section, each individually DOWNLOADABLE. The PRIMARY format is a fully-styled, self-contained HTML file that must look like a genuine, reusable, professional deliverable - a branded cover with the Colaberry logo, a document-control strip (version, owner, status, date), styled section headers and navy tables, callouts, a sign-off block (Prepared / Reviewed / Approved), and a footer. Make each document EXTENSIVE and complete, not a summary. ALSO provide a Save-as-PDF that prints that SAME designed document, and an Excel-friendly .csv export for the tabular documents (code review checklist, test plan, definition of done). Do NOT default to plain .md:
  1. Technical Design Document (TDD) — context, chosen approach, module breakdown, data model, a sequence for the main flow, risks and trade-offs
  2. Module / Component Design with API signatures — each module's single responsibility plus its typed interface and contract (inputs, outputs, errors)
  3. Coding Standards & Naming Conventions — the house style AI and humans must follow
  4. Code Review Checklist — the concrete gate every pull request passes
  5. Unit & Integration Test Plan — cases mapped to the testing pyramid (unit / integration / end-to-end), including failure and boundary cases
  6. Branching & Pull-Request Workflow — branch naming, PR size, review and merge rules
  7. Definition of Done — the objective bar that says a change is truly shippable

USE RICH VISUALS wherever they aid understanding: Mermaid-style diagrams (a component / C4 diagram, a sequence diagram for the main flow, an ERD for the data model, a branching / git-flow diagram) AND Power BI-style charts (KPI tiles, bar / donut) for anything quantitative (test-pyramid mix, coverage, PR cycle time, defect trend). Render ALL diagrams and charts as INLINE SVG (self-contained, no external libraries or CDNs) so the guide works offline. QUALITY BAR: modules single-responsibility with explicit contracts; names that reveal intent; tests that assert behavior and cover failure paths; error handling with no silent catches; every requirement traceable to a design element and a test. Every document must be findable via the search box and answerable by the Ask assistant.

EMBED metadata as a JSON script tag with id="deepdive-metadata": { guide_type:"Software Engineer Field Guide", curriculum_type:"deep_dive", week:4, discipline:"Software Engineer", student_id, project_id, repository, generated_by:"Claude Code", generated_date, version, build_number }.

When finished, open the file in the browser.`
};
