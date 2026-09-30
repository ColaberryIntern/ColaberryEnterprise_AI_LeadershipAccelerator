module.exports = {
  week: 10,
  role: "DevOps Engineer",
  tag: "OPS · Wk 10",
  sections: [
    {
      id: "dashboard",
      navLabel: "Dashboard",
      eyebrow: "DevOps Engineer · Week 10",
      title: "Ship safely and repeatedly — and keep it running",
      body: `<p class="lead">The DevOps Engineer decides <strong>how the system reaches production and stays healthy there</strong> — turning a validated build into a repeatable, observable, reversible release. Your job as an architect is not to write the pipeline yourself; it is to <strong>direct, evaluate, and approve</strong> the delivery and operations plan an AI drafts, so that shipping is boring and outages are short.</p>
<div class="kpis">
  <div class="kpi"><div class="v">7</div><div class="l">Docs you'll build</div></div>
  <div class="kpi c1"><div class="v">3</div><div class="l">Environments</div></div>
  <div class="kpi c2"><div class="v">99.9%</div><div class="l">Availability SLO</div></div>
  <div class="kpi c3"><div class="v">&lt;5m</div><div class="l">Rollback target</div></div>
</div>
<div class="card">
  <div class="sub">How this Deep Dive works</div>
  <ul class="clean">
    <li>Read the learning sections — the rail fills with green checks as you go.</li>
    <li>In <strong>Build &amp; Submit</strong>, copy the build prompt and run it in your own Claude Code. It builds a searchable <strong>Field Guide</strong> — with the DevOps documents generated for a chosen example, an Ask assistant, and downloads.</li>
    <li>Upload your Field Guide to earn <strong>100 points</strong>. When every section is read, <strong>Complete</strong> unlocks.</li>
  </ul>
</div>
<div class="callout"><strong>Running example.</strong> Throughout, we use one case — a national retailer putting its <em>online checkout &amp; payments service</em> into production. In your build you can pick any of Restaurant, Insurance, Healthcare, Retail, or Manufacturing.</div>`
    },
    {
      id: "overview",
      navLabel: "Overview & Mission",
      eyebrow: "Overview · Mission",
      title: "Why DevOps exists",
      body: `<p>A team can build a flawless checkout service and still lose money if releasing it is slow, risky, or irreversible — and if no one notices when it breaks at 2 a.m. <strong>DevOps</strong> is the discipline that closes the gap between "the code works on a laptop" and "the system serves real customers reliably." It makes shipping <strong>repeatable</strong>, infrastructure <strong>reproducible</strong>, and production <strong>observable</strong>, so change is cheap and failure is survivable.</p>
<div class="card"><div class="sub">Business value</div><ul class="clean"><li>Turns releases from risky events into routine, boring operations.</li><li>Shrinks the time from a commit to customers' hands from weeks to hours.</li><li>Makes every failure recoverable — fast rollback beats slow perfection.</li><li>Gives one honest, measured view of whether production is healthy.</li></ul></div>
<div class="card"><div class="sub">What breaks without it</div><ul class="clean"><li>Deploys are hand-crafted, undocumented, and only one person can do them.</li><li>"Works in dev" fails in prod because the environments quietly differ.</li><li>An outage is found by customers on social media, not by an alert.</li><li>A bad release cannot be undone, so every deploy is a held breath.</li></ul></div>
<div class="callout warn"><strong>How AI changes DevOps.</strong> AI can draft an entire pipeline, Terraform module, or runbook in seconds. What it cannot do is decide your real risk tolerance, your rollback strategy, or what "healthy" means for <em>your</em> business. You supply the judgment and the guardrails; AI supplies the first draft.</div>`
    },
    {
      id: "twenty",
      navLabel: "The 20% You Need",
      eyebrow: "The 20% You Need to Know",
      title: "Enough DevOps to direct and judge it",
      body: `<p>You do not need to run the pipeline by hand. You need these building blocks well enough to spot when an AI's delivery plan is fragile, irreversible, or blind in production.</p>
<div class="table-wrap"><table>
  <thead><tr><th>Concept</th><th>What it is</th><th>The tell of good work</th></tr></thead>
  <tbody>
    <tr><td>CI / CD pipeline</td><td>Automated build, test, and deploy on every change</td><td>Green before merge; no manual steps</td></tr>
    <tr><td>Build / release / run</td><td>Separate the artifact, its config, and the running process</td><td>One build promoted across envs unchanged</td></tr>
    <tr><td>Infrastructure as Code</td><td>Servers &amp; networks defined in version-controlled files</td><td>Rebuildable from zero, peer-reviewed</td></tr>
    <tr><td>Environment parity</td><td>Dev, stage, and prod are as alike as possible</td><td>Same image &amp; config shape everywhere</td></tr>
    <tr><td>Containers</td><td>The app plus its dependencies, packaged to run anywhere</td><td>Same image runs on laptop and in prod</td></tr>
    <tr><td>Deployment strategy</td><td>Blue-green, canary, or rolling release patterns</td><td>New version proven before full cutover</td></tr>
    <tr><td>Rollback</td><td>A fast, tested path back to the last good version</td><td>One command, minutes, no data loss</td></tr>
    <tr><td>Monitoring / logging / alerting</td><td>Metrics, structured logs, and alerts on symptoms</td><td>You detect issues before customers do</td></tr>
    <tr><td>SLI / SLO / error budget</td><td>A measured target for reliability and its allowance</td><td>A number, not a vibe; budget is tracked</td></tr>
    <tr><td>Incident response &amp; runbooks</td><td>A rehearsed plan for when things break</td><td>Roles, steps, and comms are written down</td></tr>
    <tr><td>Twelve-Factor app</td><td>Principles for portable, disposable services</td><td>Config in env, stateless, logs to stdout</td></tr>
  </tbody>
</table></div>
<div class="callout"><strong>Example.</strong> Weak: "We'll deploy checkout on Friday and watch it." Strong: "We ship the new checkout to 5% of traffic (canary), watch payment success rate and p95 latency for 30 minutes against our SLO, then roll forward to 100% — or roll back in under 5 minutes if the error budget starts to burn."</div>`
    },
    {
      id: "role",
      navLabel: "Role in the SDLC",
      eyebrow: "Where it fits",
      title: "Role in the SDLC",
      body: `<p>The DevOps Engineer owns the <strong>Release &amp; Run</strong> stretch of the lifecycle — the bridge between a validated build and a healthy production system. It takes tested code from development and delivers a running, monitored service the business can rely on.</p>
<div class="flow">
  <div class="step"><div class="k">Before</div><div class="t">Development &amp; QA</div></div>
  <div class="step"><div class="k">You are here</div><div class="t">DevOps Engineer</div></div>
  <div class="step"><div class="k">After</div><div class="t">Production Operations / SRE</div></div>
</div>
<div class="stack" style="margin-top:.4rem">
  <div class="tier"><div class="lab">Gives DevOps its input</div><div class="row"><span class="chip">Developers</span><span class="chip">QA / Test</span><span class="chip">Security</span></div></div>
  <div class="tier"><div class="lab">The DevOps role (you direct it)</div><div class="row"><span class="chip pri">DevOps Engineer</span></div></div>
  <div class="tier"><div class="lab">Consumes DevOps's output</div><div class="row"><span class="chip">On-call / SRE</span><span class="chip">Support</span><span class="chip">The business</span></div></div>
</div>
<div class="callout"><strong>Approval gate you own:</strong> the production release. Before code reaches customers, you confirm the pipeline is green, the deployment is reversible, monitoring is live, and there is a written rollback and incident plan.</div>`
    },
    {
      id: "io",
      navLabel: "Inputs & Outputs",
      eyebrow: "Section · Inputs & Outputs",
      title: "What comes in, what hands off",
      body: `<div class="grid g2">
  <div class="card"><h4>Inputs</h4><ul class="clean"><li>A tested, versioned build artifact</li><li>Non-functional targets: uptime, latency, throughput</li><li>Cloud/account access, cost &amp; compliance limits</li><li>The security review &amp; approved dependencies</li></ul></div>
  <div class="card"><h4>Outputs</h4><ul class="clean"><li>A CI/CD pipeline and Infrastructure-as-Code</li><li>Provisioned dev / stage / prod environments</li><li>A deployment runbook &amp; rollback plan</li><li>Monitoring, alerting, and an SLO / error-budget sheet</li></ul></div>
</div>
<div class="sub">Delivery flow</div>
<div class="flow"><div class="step"><div class="k">In</div><div class="t">Tested build</div></div><div class="step"><div class="k">Build</div><div class="t">CI + artifact</div></div><div class="step"><div class="k">Release</div><div class="t">Config + deploy</div></div><div class="step"><div class="k">Run</div><div class="t">Monitor + alert</div></div><div class="step"><div class="k">Out</div><div class="t">Healthy service</div></div></div>`
    },
    {
      id: "responsibilities",
      navLabel: "Responsibilities",
      eyebrow: "Ownership",
      title: "What a DevOps Engineer actually does",
      body: `<div class="grid g2">
  <div class="card"><h4>Build</h4><ul class="clean"><li>Automate build &amp; test in CI</li><li>Produce one immutable artifact</li><li>Gate merges on a green pipeline</li></ul></div>
  <div class="card"><h4>Release</h4><ul class="clean"><li>Provision infrastructure as code</li><li>Keep environments in parity</li><li>Choose a safe deploy strategy</li></ul></div>
  <div class="card"><h4>Run</h4><ul class="clean"><li>Instrument metrics &amp; logs</li><li>Alert on symptoms, not noise</li><li>Set and track SLOs</li></ul></div>
  <div class="card"><h4>Recover</h4><ul class="clean"><li>Keep rollback fast &amp; tested</li><li>Write &amp; rehearse runbooks</li><li>Lead incident response</li></ul></div>
</div>
<div class="card"><div class="sub">You own vs you don't</div>
  <div class="kv"><span class="k">Own</span><span class="val">The pipeline · Release safety · Production health</span></div>
  <div class="kv"><span class="k">Don't own</span><span class="val">Feature scope · App logic · The product roadmap</span></div>
</div>`
    },
    {
      id: "artifacts",
      navLabel: "Documents You'll Generate",
      eyebrow: "Section · Documents",
      title: "The 7 documents your Field Guide builds",
      body: `<p>These are exactly what your Field Guide generates for your chosen example — each viewable, searchable, and downloadable. Learn what each one proves.</p>
<div class="table-wrap"><table>
  <thead><tr><th>Document</th><th>What it proves</th></tr></thead>
  <tbody>
    <tr><td>CI/CD Pipeline Design</td><td>Every change is built, tested, and shipped the same safe way</td></tr>
    <tr><td>Infrastructure-as-Code Plan</td><td>The environment can be rebuilt from zero, reviewably</td></tr>
    <tr><td>Environment Strategy</td><td>Dev, stage, and prod are defined, parity-checked, and promoted through</td></tr>
    <tr><td>Deployment Runbook</td><td>Anyone on the team can perform the release, step by step</td></tr>
    <tr><td>Rollback Plan</td><td>A bad release can be undone fast, without data loss</td></tr>
    <tr><td>Monitoring &amp; Alerting Plan</td><td>Problems are detected by the team before customers feel them</td></tr>
    <tr><td>SLO / Error-Budget Sheet</td><td>Reliability has a number, and change is governed by the budget</td></tr>
  </tbody>
</table></div>`
    },
    {
      id: "goodbad",
      navLabel: "Good vs Bad Delivery",
      eyebrow: "Section · Good vs Bad",
      title: "Good vs bad delivery",
      body: `<div class="gb">
  <div class="col good"><h4>Good delivery</h4><ul>
    <li>Every deploy is automated, repeatable, and logged.</li>
    <li>One build artifact is promoted dev &rarr; stage &rarr; prod, unchanged.</li>
    <li>Releases are reversible — rollback is one tested command.</li>
    <li>Monitoring alerts on customer-facing symptoms with clear owners.</li>
    <li>Reliability has an SLO and a tracked error budget.</li>
  </ul></div>
  <div class="col bad"><h4>Bad delivery</h4><ul>
    <li>Deploys are manual, undocumented, and known to one person.</li>
    <li>Config is edited by hand in prod; environments have drifted.</li>
    <li>No rollback plan — the only fix is "fix forward" under pressure.</li>
    <li>Alerts are either absent or so noisy everyone ignores them.</li>
    <li>"Uptime" is a feeling; no SLI is actually measured.</li>
  </ul></div>
</div>
<div class="callout warn"><strong>Red flags in AI-drafted delivery plans:</strong> a pipeline with no rollback step, secrets hard-coded in the config, "monitor it manually" instead of alerts, one environment standing in for all three, and an SLO of "100%" (which leaves no room to ship).</div>`
    },
    {
      id: "metrics",
      navLabel: "KPIs & Success",
      eyebrow: "Section · Measurement",
      title: "KPIs & success metrics",
      body: `<div class="grid g2">
  <div class="card"><h4>Delivery signals (DORA)</h4><ul class="clean"><li>Deployment frequency — how often you ship</li><li>Lead time for changes — commit to production</li><li>Change failure rate — deploys that cause incidents</li><li>Mean time to restore (MTTR)</li></ul></div>
  <div class="card"><h4>Reliability signals</h4><ul class="clean"><li>Availability &amp; error rate vs the SLO</li><li>p95 / p99 latency</li><li>Error-budget burn rate</li><li>Alert precision — real vs false alarms</li></ul></div>
</div>
<div class="callout"><strong>Leading vs lagging.</strong> Lead time and error-budget burn are <em>leading</em> — they warn you before customers are hurt. Change failure rate and MTTR are <em>lagging</em> — they tell you how well delivery held up after the fact. Elite teams ship often <em>and</em> restore fast; the two are not in tension.</div>`
    },
    {
      id: "tools",
      navLabel: "Common Tools",
      eyebrow: "Section · Tools",
      title: "Common tools (recognition only)",
      body: `<div class="table-wrap"><table>
  <thead><tr><th>Tool</th><th>Used for</th><th>Where AI assists</th></tr></thead>
  <tbody>
    <tr><td>GitHub Actions / GitLab CI</td><td>CI/CD pipelines</td><td>Draft &amp; lint pipeline config</td></tr>
    <tr><td>Docker</td><td>Containers &amp; images</td><td>Write &amp; slim Dockerfiles</td></tr>
    <tr><td>Terraform / Pulumi</td><td>Infrastructure as Code</td><td>Draft modules; explain diffs</td></tr>
    <tr><td>Kubernetes</td><td>Orchestration &amp; rollout</td><td>Draft manifests &amp; strategies</td></tr>
    <tr><td>Prometheus / Grafana</td><td>Metrics &amp; dashboards</td><td>Suggest SLIs &amp; alert rules</td></tr>
    <tr><td>Datadog / CloudWatch</td><td>Logs, traces, alerting</td><td>Draft alert &amp; log queries</td></tr>
    <tr><td>PagerDuty / Opsgenie</td><td>On-call &amp; incidents</td><td>Draft runbooks &amp; escalation</td></tr>
  </tbody>
</table></div>`
    },
    {
      id: "ai",
      navLabel: "AI Collaboration",
      eyebrow: "Section · AI Collaboration",
      title: "Working with AI on delivery & operations",
      body: `<div class="grid g2">
  <div class="card"><h4>AI does well</h4><ul class="clean"><li>Draft pipelines, Dockerfiles, and Terraform</li><li>Write a first runbook and alert rules</li><li>Explain a failing build or a risky diff</li><li>Generate SLO and rollback templates</li></ul></div>
  <div class="card"><h4>You still own</h4><ul class="clean"><li>Risk tolerance &amp; the rollback strategy</li><li>What "healthy" means for the business</li><li>Secrets, access, and blast radius</li><li>Approving what actually ships</li></ul></div>
</div>
<div class="sub">The loop</div>
<div class="flow"><div class="step"><div class="k">1</div><div class="t">Describe the service</div></div><div class="step"><div class="k">2</div><div class="t">AI drafts delivery</div></div><div class="step"><div class="k">3</div><div class="t">You evaluate risk</div></div><div class="step"><div class="k">4</div><div class="t">Harden &amp; test</div></div><div class="step"><div class="k">5</div><div class="t">Approve</div></div></div>
<div class="callout warn"><strong>What AI gets wrong.</strong> It happily writes pipelines with no rollback, bakes secrets into config, invents plausible-but-wrong resource names, assumes an environment already exists, and sets alerts on causes (CPU) instead of symptoms (checkout failing). Read every generated pipeline and IaC file as if it will run in production — because it will.</div>`
    },
    {
      id: "review",
      navLabel: "Architect Review Lens",
      eyebrow: "Architect Review",
      title: "Before you approve a delivery plan",
      body: `<p>Run every AI-generated delivery and operations plan through this lens before it ships.</p>
<div class="grid g2">
  <div class="card"><h4>Pipeline &amp; build</h4><ul class="clean"><li>Is every step automated and repeatable?</li><li>Is one artifact promoted across envs?</li><li>Are secrets kept out of code &amp; logs?</li></ul></div>
  <div class="card"><h4>Release &amp; rollback</h4><ul class="clean"><li>Does the deploy strategy fit the blast radius?</li><li>Is rollback one tested command?</li><li>Are database migrations reversible?</li></ul></div>
  <div class="card"><h4>Environments</h4><ul class="clean"><li>Are dev/stage/prod in real parity?</li><li>Is infra defined as reviewable code?</li><li>Can prod be rebuilt from zero?</li></ul></div>
  <div class="card"><h4>Run &amp; recover</h4><ul class="clean"><li>Do alerts fire on customer symptoms?</li><li>Is there an SLO and error budget?</li><li>Is the runbook written &amp; rehearsed?</li></ul></div>
</div>
<div class="callout"><strong>Approve only when:</strong> the pipeline is green and reproducible, one artifact promotes across environments, the release is reversible in minutes, monitoring alerts on real symptoms with named owners, and there is a written SLO, rollback plan, and incident runbook.</div>`
    },
    {
      id: "inspect",
      navLabel: "How to Inspect It",
      eyebrow: "Inspect Your Build",
      title: "What to check in your Field Guide",
      body: `<p>After Claude Code builds your Field Guide, open it and check these — this is how you practice the architect's review:</p>
<ul class="clean">
  <li><strong>Pipeline design</strong> — does it show build &rarr; test &rarr; release &rarr; deploy with a rollback path, not just a happy line?</li>
  <li><strong>IaC plan</strong> — could someone rebuild the whole environment from these files alone? Any secrets hard-coded?</li>
  <li><strong>Deployment runbook</strong> — is it step-by-step enough that a new engineer could run the release at 2 a.m.?</li>
  <li><strong>Rollback plan</strong> — is there a clear trigger, a target version, and a data-safety note?</li>
  <li><strong>SLO sheet</strong> — is the target a real number with an error budget, not "100%"?</li>
  <li><strong>Ask assistant</strong> — try asking it "what is our rollback procedure?" and see if it answers from your docs.</li>
</ul>
<div class="callout">Found a gap? That is the point — refine your prompt, rebuild, and re-upload. The newest version replaces the old; points are awarded once.</div>`
    },
    {
      id: "kb",
      navLabel: "Knowledge Base",
      eyebrow: "Knowledge Base",
      title: "Glossary",
      body: `<div class="terms">
  <div class="term"><b>CI / CD</b><p>Continuous Integration (auto-build &amp; test on every change) and Continuous Delivery/Deployment (auto-release).</p></div>
  <div class="term"><b>Artifact</b><p>The immutable, versioned build output — e.g., a container image — that is promoted across environments.</p></div>
  <div class="term"><b>Infrastructure as Code</b><p>Servers, networks, and services defined in version-controlled files instead of clicked by hand.</p></div>
  <div class="term"><b>Blue-green deployment</b><p>Run two identical environments; switch traffic to the new one, keep the old as instant rollback.</p></div>
  <div class="term"><b>Canary release</b><p>Send a small slice of traffic to the new version first; widen only if it stays healthy.</p></div>
  <div class="term"><b>Rollback</b><p>Returning to the last known-good version quickly and safely when a release goes wrong.</p></div>
  <div class="term"><b>SLI / SLO</b><p>Service Level Indicator (a measured signal) and Objective (its target) — e.g., 99.9% availability.</p></div>
  <div class="term"><b>Error budget</b><p>The allowed amount of unreliability under the SLO; when spent, you stop shipping and stabilize.</p></div>
  <div class="term"><b>MTTR</b><p>Mean Time To Restore — how long, on average, to recover from an incident.</p></div>
  <div class="term"><b>Runbook</b><p>A written, rehearsed procedure for deploying, or for responding to a specific failure.</p></div>
  <div class="term"><b>Twelve-Factor app</b><p>Principles for portable services: config in the environment, stateless processes, logs to stdout.</p></div>
</div>
<div class="q"><div class="qt">Why separate build, release, and run?</div><button class="revealbtn">Reveal</button><div class="ans">So the same tested artifact runs everywhere and only config changes between environments — you test what you ship, and you can roll back to an exact prior release.</div></div>
<div class="q"><div class="qt">Why not target 100% uptime?</div><button class="revealbtn">Reveal</button><div class="ans">Perfect reliability is infinitely expensive and leaves no room to ship. An SLO such as 99.9%, plus an error budget, lets you balance reliability against the pace of change.</div></div>
<div class="q"><div class="qt">Canary or blue-green — which one?</div><button class="revealbtn">Reveal</button><div class="ans">Blue-green gives instant, whole-system cutover and rollback; canary limits blast radius by exposing a small traffic slice first. Choose by risk and by how quickly you can detect trouble.</div></div>`
    },
    {
      id: "build",
      navLabel: "Build & Submit",
      eyebrow: "Build & Submit",
      title: "Build your DevOps Engineer Field Guide",
      body: `<p class="lead">You'll build your Field Guide in <strong>your own Claude Code</strong>: a searchable, Colaberry-branded guide with the DevOps documents generated for a chosen example, an Ask assistant, and downloadable docs. Then upload it here.</p>
<p>Your guide will generate real, downloadable versions of these documents for one example service:</p>
<ul class="clean">
  <li><strong>CI/CD Pipeline Design</strong> — build, test, release, deploy, with gates and rollback.</li>
  <li><strong>Infrastructure-as-Code Plan</strong> — environments defined as reviewable code.</li>
  <li><strong>Environment Strategy</strong> — dev / stage / prod, parity, and promotion.</li>
  <li><strong>Deployment Runbook</strong> — the step-by-step release procedure.</li>
  <li><strong>Rollback Plan</strong> — triggers, target version, and data safety.</li>
  <li><strong>Monitoring &amp; Alerting Plan</strong> — SLIs, dashboards, and alert rules.</li>
  <li><strong>SLO / Error-Budget Sheet</strong> — the reliability target and its budget.</li>
</ul>
<button class="buildcta" id="copyPromptBtn2" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg> Copy the build prompt</button>
<p class="muted small">The prompt is long on purpose — just copy it and paste it straight into Claude Code. You don't need to read it.</p>`
    }
  ],
  buildPrompt: `Build a rich, self-contained DevOps Engineer FIELD GUIDE as a single HTML file named DevOpsEngineer_FieldGuide.html. Take your time and make it genuinely substantial — this is a 5 to 10 minute build that should produce a polished, knowledge-base-style guide, not a quick page.

WHO IT'S FOR: I'm a learner in the Colaberry Enterprise AI Leadership Accelerator becoming an AI Solution Architect. I need the ~20% of DevOps required to DIRECT, EVALUATE, and APPROVE AI-generated delivery and operations work. I have no project yet — pick ONE example industry (Restaurant, Insurance, Healthcare, Retail, or Manufacturing), invent a believable service to put into production, and make every document concrete to that example.

MAKE IT A KNOWLEDGE BASE, not a brochure. Model it on a clean help-center / knowledge base (like a polished docs site): a left topic nav, a prominent SEARCH box, and an "Ask" assistant the learner can type questions into that answers FROM THE GUIDE'S OWN CONTENT (embed a small offline Q&A — match the question to the most relevant section/FAQ and show that answer; no external API; it must work offline).

BRANDING & QUALITY: put the Colaberry logo in the header and on the print/PDF export. Executive, calm, authoritative voice. Light/dark aware. Fully self-contained: inline CSS + JS, NO external libraries or CDNs, works offline when saved as one file.

TEACH THE DISCIPLINE (concise): why DevOps exists; the 20% to know (CI/CD pipelines; build/release/run separation; Infrastructure as Code; environments and parity; containers; deployment strategies — blue-green, canary, rolling; rollback; monitoring, logging, and alerting; SLIs, SLOs, and error budgets; incident response and runbooks; the twelve-factor idea); good vs bad delivery; the DORA metrics; the architect's review lens.

THEN GENERATE THE DOCUMENTS — this is the heart of it. For the chosen example, produce REAL, substantial documents (not placeholders), each in its own searchable section, each individually DOWNLOADABLE. The PRIMARY format is a fully-styled, self-contained HTML file that must look like a genuine, reusable, professional deliverable — a branded cover with the Colaberry logo, a document-control strip (version, owner, status, date), styled section headers and navy tables, callouts, a sign-off block (Prepared / Reviewed / Approved), and a footer. Make each document EXTENSIVE and complete, not a summary. ALSO provide a Save-as-PDF that prints that SAME designed document, and an Excel-friendly .csv export for the tabular documents (environment matrix, SLO / error-budget sheet, alert catalog). Do NOT default to plain .md:
  1. CI/CD Pipeline Design (build, test, release, and deploy stages, gates, and rollback)
  2. Infrastructure-as-Code Plan
  3. Environment Strategy (dev / stage / prod parity and promotion)
  4. Deployment Runbook (step-by-step release procedure)
  5. Rollback Plan (triggers, target version, data safety)
  6. Monitoring & Alerting Plan (SLIs, dashboards, alert rules)
  7. SLO / Error-Budget Sheet
  8. A one-page Executive Summary

USE RICH VISUALS wherever they aid understanding: Mermaid-style diagrams (a CI/CD pipeline flow, a blue-green / canary deployment sequence, an environment-promotion map, an architecture / C4 view) AND Power BI-style charts (KPI tiles, bar / line / donut) for anything quantitative (deployment frequency, lead time, change failure rate, MTTR, error-budget burn). Render ALL diagrams and charts as INLINE SVG (self-contained, no external libraries or CDNs) so the guide works offline. QUALITY BAR: pipelines automated and reversible; one artifact promoted across environments; secrets never in code; alerts on symptoms with named owners; an SLO with a real number and a tracked error budget. No manual-only deploys. No "100%" SLOs. Every document must be findable via the search box and answerable by the Ask assistant.

EMBED metadata as a JSON script tag with id="deepdive-metadata": { guide_type:"DevOps Engineer Field Guide", curriculum_type:"deep_dive", week:10, discipline:"DevOps Engineer", student_id, project_id, repository, generated_by:"Claude Code", generated_date, version, build_number }.

When finished, open the file in the browser.`
};
