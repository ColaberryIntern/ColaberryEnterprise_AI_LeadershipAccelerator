// Deep Dive Field Guide — content spec. Week 6: QA Engineer.
// Content only; the deterministic generator supplies chrome, nav, read-tracker, upload gate.
module.exports = {
  week: 6,
  role: "QA Engineer",
  tag: "QA · Wk 6",
  sections: [

    {
      id: "dashboard",
      navLabel: "Dashboard",
      eyebrow: "QA Engineer · Week 6",
      title: "Prove the system works — and fails safely — before users do",
      body: `
        <p class="lead">The QA Engineer decides whether the system is <strong>safe to ship</strong> — not by opinion, but by evidence. Most trust is lost the first time software fails a real user in a way no one tested for. Your job as an architect isn't to write every test; it's to <strong>direct, evaluate, and approve</strong> the strategy, cases, and results an AI produces, so quality is <em>proven</em>, not assumed.</p>
        <div class="kpis">
          <div class="kpi"><div class="v">7</div><div class="l">Docs you'll build</div></div>
          <div class="kpi c1"><div class="v">4</div><div class="l">Case types</div></div>
          <div class="kpi c2"><div class="v">3</div><div class="l">Test tiers</div></div>
          <div class="kpi c3"><div class="v">100%</div><div class="l">Reqs traced</div></div>
        </div>
        <div class="card">
          <div class="sub">How this Deep Dive works</div>
          <ul class="clean">
            <li>Read the learning sections — the rail fills with green checks as you go.</li>
            <li>In <strong>Build &amp; Submit</strong>, copy the build prompt and run it in your own Claude Code. It builds a searchable <strong>Field Guide</strong> — with the QA documents generated for a chosen example, an Ask assistant, and downloads.</li>
            <li>Upload your Field Guide to earn <strong>100 points</strong>. When every section is read, <strong>Complete</strong> unlocks.</li>
          </ul>
        </div>
        <div class="callout"><strong>Running example.</strong> Throughout, we test the <em>online ordering</em> system for a regional restaurant chain — cart, checkout, and payment. In your build you can pick any of Restaurant, Insurance, Healthcare, Retail, or Manufacturing.</div>
      `
    },

    {
      id: "overview",
      navLabel: "Overview &amp; Mission",
      eyebrow: "Overview · Mission",
      title: "Why Quality Assurance exists",
      body: `
        <p>A team can build exactly what the requirements asked for and still ship a disaster: the payment retries and charges the customer twice, the cart empties at midnight, the search times out under load. QA is the discipline that <strong>turns "we think it works" into "we can show it works"</strong> — and, just as important, shows what happens when it doesn't. A defect caught in requirements costs pennies; the same defect caught by a customer costs a refund, a support ticket, and a piece of your reputation.</p>
        <div class="card"><div class="sub">Business value</div><ul class="clean"><li>Catches the expensive defects before customers do — cost to fix rises sharply the later it is found.</li><li>Turns "done" from an opinion into evidence tied to each requirement.</li><li>Protects against silent regressions — the feature that quietly breaks when something else changes.</li><li>Makes the ship / no-ship decision a data-backed call, not a gut feel.</li></ul></div>
        <div class="card"><div class="sub">Common misconceptions</div><ul class="clean"><li>"QA is clicking around at the end." Real QA starts at requirements (shift-left) and is mostly designed, repeatable checks.</li><li>"Testing proves there are no bugs." It proves the ones you looked for aren't there; you design where to look.</li><li>"If it passed once, it works." Without regression coverage, today's pass is tomorrow's surprise.</li><li>"More tests = better." Coverage of the <em>right</em> risks beats volume every time.</li></ul></div>
        <div class="callout"><strong>How AI changes QA.</strong> AI can draft test cases, negative paths, and automation scaffolding in seconds. What it can't do is decide which risks matter, how much coverage is enough, or whether an open defect is a blocker. You supply the risk judgment; AI supplies the first draft of the tests.</div>
      `
    },

    {
      id: "twenty",
      navLabel: "The 20% You Need",
      eyebrow: "The 20% You Need to Know",
      title: "Enough QA to direct and judge it",
      body: `
        <p>You don't need to become a QA Engineer. You need these building blocks well enough to spot when a test suite is shallow, flaky, or lying about coverage.</p>
        <div class="table-wrap"><table>
          <thead><tr><th>Concept</th><th>What it is</th><th>The tell of good work</th></tr></thead>
          <tbody>
            <tr><td>Strategy vs plan vs cases</td><td>Strategy = the approach &amp; risk model; plan = scope, schedule, environments for a release; cases = the concrete checks</td><td>All three exist and agree</td></tr>
            <tr><td>Testing pyramid</td><td>Many fast unit tests, fewer integration, fewest end-to-end (roughly 70/20/10)</td><td>Not inverted — few flaky E2E on top</td></tr>
            <tr><td>Functional vs non-functional</td><td>Does it do the thing vs how well (speed, security, uptime, accessibility)</td><td>Non-functionals have numeric targets</td></tr>
            <tr><td>Given / When / Then</td><td>An acceptance test: given a state, when an action, then an observable result</td><td>Objectively checkable, no ambiguity</td></tr>
            <tr><td>Positive &amp; negative</td><td>Valid input succeeds; invalid input fails <em>gracefully</em></td><td>Bad input is rejected, not swallowed</td></tr>
            <tr><td>Boundary cases</td><td>The edges: empty, zero, max length, off-by-one, the last item</td><td>The limits are tested, not just the middle</td></tr>
            <tr><td>Idempotency case</td><td>Running the same operation twice produces the same end state — no double charge</td><td>Retry / double-submit is covered</td></tr>
            <tr><td>Traceability (RTM)</td><td>Every requirement maps to a test; every test maps to a requirement</td><td>No untested requirement, no orphan test</td></tr>
            <tr><td>Coverage</td><td>How much of the requirements / code / paths is exercised — and the gaps</td><td>Gaps named honestly, not hidden</td></tr>
            <tr><td>Severity vs priority</td><td>Severity = how bad the impact; priority = how soon we fix</td><td>The two are scored separately</td></tr>
            <tr><td>Regression &amp; exploratory</td><td>Re-run the suite to catch new breaks; unscripted probing to find the unknown</td><td>Both are budgeted, not one or the other</td></tr>
            <tr><td>Shift-left</td><td>Test thinking starts at requirements, not after the build</td><td>Acceptance criteria written before code</td></tr>
          </tbody>
        </table></div>
        <div class="callout"><strong>Example.</strong> Weak case: "checkout works." Strong case: <em>Given</em> a cart of 3 items and a valid card, <em>when</em> I submit payment and the network drops so the app retries, <em>then</em> the order is created <strong>once</strong> and the card is charged <strong>once</strong>. That single idempotency test catches the defect that costs you customers.</div>
      `
    },

    {
      id: "role",
      navLabel: "Role in the SDLC",
      eyebrow: "Where it fits",
      title: "Role in the SDLC",
      body: `
        <p>QA is often drawn as a gate at the end, but its best work is <strong>shift-left</strong>: it starts reading requirements while the Business Analyst is still writing them, so every requirement arrives with a way to prove it. QA takes in requirements and built software, and hands off a <strong>verified release decision</strong> backed by evidence.</p>
        <div class="flow">
          <div class="step"><div class="k">Before</div><div class="t">Requirements + Build</div></div>
          <div class="step"><div class="k">You are here</div><div class="t">QA Engineer</div></div>
          <div class="step"><div class="k">After</div><div class="t">Release / Operations</div></div>
        </div>
        <div class="stack" style="margin-top:.4rem">
          <div class="tier"><div class="lab">Gives QA its input</div><div class="row"><span class="chip">Business Analyst (acceptance criteria)</span><span class="chip">Developers (built software)</span><span class="chip">Architect (risk profile)</span></div></div>
          <div class="tier"><div class="lab">The QA role (you direct it)</div><div class="row"><span class="chip pri">QA Engineer</span></div></div>
          <div class="tier"><div class="lab">Consumes QA's output</div><div class="row"><span class="chip">Release manager</span><span class="chip">Product owner</span><span class="chip">Operations / SRE</span></div></div>
        </div>
        <div class="callout"><strong>Approval gate you own:</strong> release readiness. Before software ships, you confirm the tests trace to the requirements, coverage meets the bar, non-functionals hit their targets, and no blocking defect is open.</div>
      `
    },

    {
      id: "io",
      navLabel: "Inputs &amp; Outputs",
      eyebrow: "Section · Inputs &amp; Outputs",
      title: "What comes in, what hands off",
      body: `
        <div class="card"><h4>Inputs</h4><ul class="clean"><li>Requirements with acceptance criteria (Given / When / Then)</li><li>The built software + a stable test environment</li><li>The risk profile — what must never fail</li><li>Prior defect history &amp; the existing regression suite</li></ul></div>
        <div class="card"><h4>Outputs</h4><ul class="clean"><li>Test strategy &amp; test plan</li><li>Test cases (positive, negative, boundary, idempotency)</li><li>Defect reports with severity and priority</li><li>Coverage matrix &amp; a test summary with a ship / no-ship call</li></ul></div>
        <div class="sub">Information flow</div>
        <div class="flow"><div class="step"><div class="k">In</div><div class="t">Reqs + build</div></div><div class="step"><div class="k">Plan</div><div class="t">Strategy &amp; risk</div></div><div class="step"><div class="k">Design</div><div class="t">Cases + data</div></div><div class="step"><div class="k">Execute</div><div class="t">Run + log defects</div></div><div class="step"><div class="k">Out</div><div class="t">Summary + decision</div></div></div>
      `
    },

    {
      id: "responsibilities",
      navLabel: "Responsibilities",
      eyebrow: "Ownership",
      title: "What a QA Engineer actually does",
      body: `
        <div class="card"><div class="sub">Across the lifecycle</div><ul class="clean">
          <li>Define the <strong>test strategy</strong> — risk-based, tied to what must not fail.</li>
          <li>Write the <strong>test plan</strong> — scope, environments, entry and exit criteria.</li>
          <li>Design <strong>test cases</strong> covering positive, negative, boundary, and idempotency paths.</li>
          <li>Maintain <strong>traceability</strong> — every requirement has a test; every test has a requirement.</li>
          <li>Execute functional and <strong>non-functional</strong> tests (performance, security, accessibility).</li>
          <li>Report <strong>defects</strong> with reproducible steps, severity, and priority.</li>
          <li>Run <strong>regression</strong> on every change and budget time for <strong>exploratory</strong> testing.</li>
          <li>Produce the <strong>test summary</strong> and a defensible ship / no-ship recommendation.</li>
        </ul></div>
        <div class="card"><div class="sub">You own vs you don't</div>
          <div class="kv"><span class="k">Own</span><span class="val">The risk model · Coverage bar · Release recommendation</span></div>
          <div class="kv"><span class="k">Don't own</span><span class="val">The fix · The feature scope · The final go decision</span></div>
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
            <tr><td>Test Strategy</td><td>The overall, risk-based approach: what we test, how, and why — the pyramid we aim for</td></tr>
            <tr><td>Test Plan</td><td>Scope, schedule, environments, data, and the entry / exit criteria for this release</td></tr>
            <tr><td>Test Cases (Given/When/Then)</td><td>The concrete, repeatable checks — positive, negative, boundary, and idempotency</td></tr>
            <tr><td>Requirements Traceability Matrix</td><td>Every requirement maps to a test; every test maps to a requirement — no gaps, no orphans</td></tr>
            <tr><td>Bug / Defect Report Template</td><td>How a defect is reported: repro steps, expected vs actual, severity, and priority</td></tr>
            <tr><td>Test Summary Report</td><td>What was tested, pass / fail, open defects, and the ship / no-ship recommendation</td></tr>
            <tr><td>Coverage Matrix</td><td>Which requirements and paths are covered — and, honestly, which are not</td></tr>
          </tbody>
        </table></div>
      `
    },

    {
      id: "goodbad",
      navLabel: "Good vs Bad Testing",
      eyebrow: "Section · Good vs Bad",
      title: "Good vs bad testing",
      body: `
        <div class="card good"><h4>Good testing</h4><ul>
          <li>Risk-based — the deepest coverage sits on what must never fail (payment, data integrity).</li>
          <li>Traceable — each test links to a requirement; each requirement has a test.</li>
          <li>Covers positive, negative, boundary, <em>and</em> idempotency, not just the happy path.</li>
          <li>Deterministic and repeatable — the same run gives the same result.</li>
          <li>Includes non-functionals with numeric targets (p95 latency, error rate, WCAG).</li>
          <li>Defects carry clear reproduction steps, severity, and priority.</li>
        </ul></div>
        <div class="card bad"><h4>Bad testing</h4><ul>
          <li>Happy-path only — no negative, boundary, or retry cases.</li>
          <li>Flaky — passes and fails at random, so no one trusts a red build.</li>
          <li>No traceability — you can't say which requirements are actually covered.</li>
          <li>Every defect marked "Critical" — severity and priority become meaningless.</li>
          <li>Manual regression only — so it's skipped under deadline pressure.</li>
          <li>No exit criteria — "done" is whenever time runs out.</li>
        </ul></div>
        <div class="callout"><strong>Red flags in AI-drafted tests:</strong> assertions that always pass (asserting a value equals itself), a suite that is 80% end-to-end, missing idempotency and concurrency cases, non-functionals with no numbers, and coverage claimed at 100% with no matrix behind it.</div>
      `
    },

    {
      id: "metrics",
      navLabel: "KPIs &amp; Success",
      eyebrow: "Section · Measurement",
      title: "KPIs &amp; success metrics",
      body: `
        <div class="card"><div class="sub">Quality signals</div><ul class="clean"><li>Requirement coverage — share of requirements with at least one passing test</li><li>Defect detection — share of defects caught before release</li><li>Automation rate — share of critical-path cases automated</li><li>Non-functional targets met (latency, error rate, accessibility)</li></ul></div>
        <div class="card"><div class="sub">Health signals</div><ul class="clean"><li>Defect escape rate — bugs found in production after ship</li><li>Test flakiness — non-deterministic pass / fail rate</li><li>Mean time to detect a regression</li><li>Regression suite pass rate on each change</li></ul></div>
        <div class="card"><div class="sub">Concrete targets (example)</div>
          <div class="kv"><span class="k">Requirement coverage</span><span class="val">&ge; 95%</span></div>
          <div class="kv"><span class="k">Critical paths automated</span><span class="val">&ge; 80%</span></div>
          <div class="kv"><span class="k">Defect escape rate</span><span class="val">&lt; 5%</span></div>
          <div class="kv"><span class="k">Critical defects open at release</span><span class="val">0</span></div>
        </div>
        <div class="callout"><strong>Leading vs lagging.</strong> Coverage and flakiness are <em>leading</em> — they warn you before customers feel it. Defect escape rate is <em>lagging</em> — it confirms where your testing had a blind spot.</div>
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
            <tr><td>Jest / Vitest / pytest</td><td>Unit tests (base of the pyramid)</td><td>Draft cases from acceptance criteria</td></tr>
            <tr><td>Playwright / Cypress / Selenium</td><td>End-to-end browser flows</td><td>Scaffold flows, generate selectors</td></tr>
            <tr><td>Postman / REST-assured</td><td>API &amp; contract testing</td><td>Draft request / assertion sets</td></tr>
            <tr><td>k6 / JMeter</td><td>Load &amp; performance (non-functional)</td><td>Model scenarios, read results</td></tr>
            <tr><td>TestRail / Zephyr</td><td>Test-case management &amp; runs</td><td>Organize cases, map to requirements</td></tr>
            <tr><td>Jira / Azure DevOps</td><td>Defect tracking &amp; triage</td><td>Draft defect reports, summarize trends</td></tr>
          </tbody>
        </table></div>
      `
    },

    {
      id: "ai",
      navLabel: "AI Collaboration",
      eyebrow: "Section · AI Collaboration",
      title: "Working with AI on testing",
      body: `
        <div class="card"><div class="sub">AI does well</div><ul class="clean"><li>Draft test cases from Given / When / Then criteria</li><li>Enumerate negative and boundary cases you'd miss</li><li>Generate automation scaffolding and test data</li><li>Summarize a defect log into trends</li></ul></div>
        <div class="card"><div class="sub">You still own</div><ul class="clean"><li>The risk model — what deserves the deepest testing</li><li>How much coverage is "enough" to ship</li><li>Whether an open defect is a blocker</li><li>The release recommendation</li></ul></div>
        <div class="card"><div class="sub">What AI gets wrong — check these</div><ul class="clean"><li>Writes happy-path-heavy suites; thin on negative, boundary, idempotency.</li><li>Produces assertions that pass trivially and prove nothing.</li><li>Inverts the pyramid — too many slow, flaky end-to-end tests.</li><li>Skips concurrency and retry (double-submit, network drop) unless told.</li><li>Claims coverage without a matrix to back it.</li></ul></div>
        <div class="sub">The loop</div>
        <div class="flow"><div class="step"><div class="k">1</div><div class="t">State the risk</div></div><div class="step"><div class="k">2</div><div class="t">AI drafts cases</div></div><div class="step"><div class="k">3</div><div class="t">You evaluate</div></div><div class="step"><div class="k">4</div><div class="t">Refine prompt</div></div><div class="step"><div class="k">5</div><div class="t">Approve</div></div></div>
      `
    },

    {
      id: "review",
      navLabel: "Architect Review Lens",
      eyebrow: "Architect Review",
      title: "Before you approve a test suite",
      body: `
        <p>Run every AI-generated test set and result through this lens before you let it gate a release.</p>
        <div class="card"><div class="sub">Coverage &amp; traceability</div><ul class="clean"><li>Does every requirement map to at least one test?</li><li>Any orphan tests that trace to nothing?</li><li>Are the coverage gaps named, not hidden?</li></ul></div>
        <div class="card"><div class="sub">Case quality</div><ul class="clean"><li>Are negative, boundary, and idempotency cases present?</li><li>Is each assertion meaningful — would it ever actually fail?</li><li>Is the pyramid right-side-up (mostly fast unit tests)?</li></ul></div>
        <div class="card"><div class="sub">Non-functionals &amp; risk</div><ul class="clean"><li>Do performance, security, and accessibility have numeric targets?</li><li>Is the deepest coverage on the highest-risk paths?</li><li>Is regression automated so it actually runs?</li></ul></div>
        <div class="card"><div class="sub">Defects &amp; release</div><ul class="clean"><li>Do defects carry both severity and priority?</li><li>Are reproduction steps good enough to act on?</li><li>Does the summary end in a clear, evidence-backed call?</li></ul></div>
        <div class="callout"><strong>Approve only when:</strong> every requirement is traced to a passing test, coverage clears the bar with gaps named honestly, cases include negative / boundary / idempotency, non-functionals hit their numeric targets, no blocking defect is open, and the summary states an explicit ship / no-ship decision with the evidence behind it.</div>
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
          <li><strong>Test Strategy</strong> — does it name the top risks and justify where the coverage goes, or is it generic?</li>
          <li><strong>Test Cases</strong> — does each have Given / When / Then, and are negative, boundary, and idempotency paths actually present?</li>
          <li><strong>Traceability Matrix</strong> — can you follow every requirement to a test and back? Any untested requirement or orphan test?</li>
          <li><strong>Defect report</strong> — does the worked example separate severity from priority and give steps you could reproduce?</li>
          <li><strong>Coverage Matrix</strong> — does it show real gaps, or claim a suspicious 100%?</li>
          <li><strong>Test Summary</strong> — does it end in a defensible ship / no-ship call, not just "testing complete"?</li>
          <li><strong>Ask assistant</strong> — try asking it "what's the difference between severity and priority?" and see if it answers from your docs.</li>
        </ul>
        <div class="callout">Found a gap? That's the point — refine your prompt, rebuild, and re-upload. The newest version replaces the old; points are awarded once.</div>
      `
    },

    {
      id: "kb",
      navLabel: "Knowledge Base",
      eyebrow: "Knowledge Base",
      title: "Glossary",
      body: `
        <div class="kv"><span class="k">Test strategy</span><span class="val">The risk-based approach: what we test, how, and why</span></div>
        <div class="kv"><span class="k">Test plan</span><span class="val">Scope, schedule, environments, and entry / exit criteria for a release</span></div>
        <div class="kv"><span class="k">Test case</span><span class="val">A single repeatable check with a defined input and expected result</span></div>
        <div class="kv"><span class="k">Testing pyramid</span><span class="val">Many unit, fewer integration, fewest end-to-end tests</span></div>
        <div class="kv"><span class="k">Functional vs non-functional</span><span class="val">Does the thing vs how well (speed, security, uptime, accessibility)</span></div>
        <div class="kv"><span class="k">Given / When / Then</span><span class="val">State, action, observable result — an acceptance test</span></div>
        <div class="kv"><span class="k">Boundary test</span><span class="val">Exercises the edges: empty, zero, max, off-by-one</span></div>
        <div class="kv"><span class="k">Idempotency test</span><span class="val">Same operation twice yields the same end state — no duplicate side effect</span></div>
        <div class="kv"><span class="k">Regression testing</span><span class="val">Re-running the suite to catch new breaks in existing behavior</span></div>
        <div class="kv"><span class="k">Exploratory testing</span><span class="val">Unscripted probing to find what the scripts didn't anticipate</span></div>
        <div class="kv"><span class="k">Traceability (RTM)</span><span class="val">Links each requirement to its tests, and back</span></div>
        <div class="kv"><span class="k">Coverage</span><span class="val">How much of the requirements / paths is exercised — and the gaps</span></div>
        <div class="kv"><span class="k">Severity vs priority</span><span class="val">How bad the impact vs how soon it must be fixed</span></div>
        <div class="kv"><span class="k">Shift-left</span><span class="val">Testing thinking starts at requirements, not after the build</span></div>
        <div class="q"><div class="qt">What is the difference between severity and priority?</div><button class="revealbtn">Reveal</button><div class="ans">Severity is how badly the defect hurts the system or user (data loss is high). Priority is how soon it should be fixed given the business context. A typo in the legal footer can be high priority but low severity; a rare crash can be high severity but low priority. Score them separately.</div></div>
        <div class="q"><div class="qt">What makes a test "flaky," and why does it matter?</div><button class="revealbtn">Reveal</button><div class="ans">A flaky test passes and fails without any code change — usually from timing, shared state, or test order. It matters because once a red build might be "just flakiness," the team stops trusting failures, and real defects slip through. Flaky tests must be fixed or quarantined, not ignored.</div></div>
        <div class="q"><div class="qt">Why not test everything through the UI?</div><button class="revealbtn">Reveal</button><div class="ans">End-to-end UI tests are slow, brittle, and expensive to maintain. The pyramid pushes most checks down to fast unit tests and reserves a thin layer of E2E for the few critical user journeys. A suite that is mostly E2E is inverted and will be slow and flaky.</div></div>
      `
    },

    {
      id: "build",
      navLabel: "Build &amp; Submit",
      eyebrow: "Build &amp; Submit",
      title: "Build your QA Engineer Field Guide",
      body: `
        <p class="lead">You'll build your Field Guide in <strong>your own Claude Code</strong>: a searchable, Colaberry-branded guide with the QA documents generated for a chosen example, an Ask assistant, and downloadable docs. Then upload it here.</p>
        <p>Your Field Guide will generate these documents, each in its own searchable section and individually downloadable:</p>
        <ul class="clean">
          <li><strong>Test Strategy</strong> — the risk-based approach and target pyramid.</li>
          <li><strong>Test Plan</strong> — scope, environments, entry and exit criteria.</li>
          <li><strong>Test Cases</strong> — Given / When / Then, with positive, negative, boundary, and idempotency paths.</li>
          <li><strong>Requirements Traceability Matrix</strong> — every requirement mapped to a test.</li>
          <li><strong>Bug / Defect Report Template</strong> — with one worked example defect.</li>
          <li><strong>Test Summary Report</strong> — pass / fail, open defects, and a ship / no-ship call.</li>
          <li><strong>Coverage Matrix</strong> — what's covered, and the honest gaps.</li>
        </ul>
        <button class="buildcta" id="copyPromptBtn2" type="button">Copy the build prompt</button>
        <p class="muted small">The prompt is long on purpose — just copy it and paste it straight into Claude Code. You don't need to read it.</p>
      `
    }

  ],

  buildPrompt: "Build a rich, self-contained QA Engineer FIELD GUIDE as a single HTML file named QAEngineer_FieldGuide.html. Take your time and make it genuinely substantial — this is a 5 to 10 minute build that should produce a polished, knowledge-base-style guide, not a quick page.\n\nWHO IT'S FOR: I'm a learner in the Colaberry Enterprise AI Leadership Accelerator becoming an AI Solution Architect. I need the ~20% of quality assurance required to DIRECT, EVALUATE, and APPROVE AI-generated tests and quality evidence. I have no project yet — pick ONE example industry (Restaurant, Insurance, Healthcare, Retail, or Manufacturing), invent a believable initiative for it, and make every document concrete to that example.\n\nMAKE IT A KNOWLEDGE BASE, not a brochure. Model it on a clean help-center / knowledge base (like a polished docs site): a left topic nav, a prominent SEARCH box, and an \"Ask\" assistant the learner can type questions into that answers FROM THE GUIDE'S OWN CONTENT (embed a small offline Q&A — match the question to the most relevant section/FAQ and show that answer; no external API; it must work offline).\n\nBRANDING & QUALITY: put the Colaberry logo in the header and on the print/PDF export. Executive, calm, authoritative voice. Light/dark aware. Fully self-contained: inline CSS + JS, NO external libraries or CDNs, works offline when saved as one file.\n\nTEACH THE DISCIPLINE (concise): why QA exists; the 20% to know (test strategy vs plan vs cases, the testing pyramid, functional vs non-functional testing, Given/When/Then acceptance tests, positive + negative + boundary + idempotency cases, traceability to requirements, coverage, defect severity vs priority, regression + exploratory testing, shift-left); good vs bad testing; KPIs; the architect's review lens.\n\nTHEN GENERATE THE DOCUMENTS — this is the heart of it. For the chosen example, produce REAL, substantial documents (not placeholders), each in its own searchable section, each individually DOWNLOADABLE. The PRIMARY format is a fully-styled, self-contained HTML file that must look like a genuine, reusable, professional deliverable — a branded cover with the Colaberry logo, a document-control strip (version, owner, status, date), styled section headers and navy tables, callouts, a sign-off block (Prepared / Reviewed / Approved), and a footer. Make each document EXTENSIVE and complete, not a summary. ALSO provide a Save-as-PDF that prints that SAME designed document, and an Excel-friendly .csv export for the tabular documents (test cases, traceability matrix, coverage matrix, defect log). Do NOT default to plain .md:\n  1. Test Strategy\n  2. Test Plan\n  3. Test Cases with acceptance tests (Given/When/Then) covering positive, negative, boundary, and idempotency paths\n  4. Requirements Traceability Matrix\n  5. Bug / Defect Report Template (with one fully worked example defect)\n  6. Test Summary Report (ending in an explicit ship / no-ship recommendation)\n  7. Coverage Matrix\n\nUSE RICH VISUALS wherever they aid understanding: Mermaid-style diagrams (the testing pyramid, a defect-lifecycle state diagram, a test-execution flow, a sequence diagram of a failing retry path) AND Power BI-style charts (KPI tiles, bar / line / donut) for anything quantitative (pass/fail mix, defects by severity, coverage %, defect trend over time). Render ALL diagrams and charts as INLINE SVG (self-contained, no external libraries or CDNs) so the guide works offline. QUALITY BAR: every requirement has at least one test; every test traces to a requirement; cases include negative, boundary, and idempotency paths, not just the happy path; non-functional tests (performance, security, accessibility) have measurable numeric targets; defects carry BOTH severity and priority; the summary ends in an explicit ship / no-ship recommendation with the evidence behind it. No orphan tests. No 'every defect is Critical.' Every document must be findable via the search box and answerable by the Ask assistant.\n\nEMBED metadata as a JSON script tag with id=\"deepdive-metadata\": { guide_type:\"QA Engineer Field Guide\", curriculum_type:\"deep_dive\", week:6, discipline:\"QA Engineer\", student_id, project_id, repository, generated_by:\"Claude Code\", generated_date, version, build_number }.\n\nWhen finished, open the file in the browser."
};
