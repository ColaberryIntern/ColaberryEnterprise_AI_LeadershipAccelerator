module.exports = {
  week: 11,
  role: "Governance Lead",
  tag: "GOV · Wk 11",
  sections: [
    {
      id: "dashboard",
      navLabel: "Dashboard",
      eyebrow: "Governance Lead · Week 11",
      title: "Set the rules that let an AI system scale safely",
      body: `
        <p class="lead">The Governance Lead defines <strong>who may decide what, what evidence proves it, and where a human must stay in the loop</strong> — the rules, roles, and controls that keep an AI system safe, compliant, and accountable as it scales. You don't run the model day to day; you <strong>direct, evaluate, and approve</strong> the governance an AI drafts.</p>
        <div class="kpis">
          <div class="kpi"><div class="v">7</div><div class="l">Docs you'll build</div></div>
          <div class="kpi c1"><div class="v">5</div><div class="l">AI risk classes</div></div>
          <div class="kpi c2"><div class="v">3</div><div class="l">Compliance frames</div></div>
          <div class="kpi c3"><div class="v">1</div><div class="l">Risk register</div></div>
        </div>
        <div class="callout"><strong>Running example.</strong> Throughout, we govern one system: a mid-size <em>insurer</em> deploying an AI <em>claims-triage assistant</em> that scores incoming claims and recommends fast-track, review, or investigation.</div>
      `
    },
    {
      id: "overview",
      navLabel: "Overview & Mission",
      eyebrow: "Overview · Mission",
      title: "Why governance exists",
      body: `
        <p>A model that works in a demo is not one an enterprise can trust at scale. The moment an AI shapes real decisions — approving a claim, denying a fast-track — someone must answer: <em>who is accountable, and where is the proof it was done right?</em> Governance produces those answers <strong>before</strong> a regulator or a harmed customer asks. Skip it and the AI outruns the organization's ability to stand behind it.</p>
        <div class="card"><div class="sub">Business value</div><ul class="clean">
          <li>Prevents the worst failure: an unaccountable system making adverse decisions.</li>
          <li>Turns "we think it's fine" into evidence a regulator accepts.</li>
          <li>Lets the system scale — new use cases inherit controls instead of re-arguing them.</li>
        </ul></div>
        <div class="card"><div class="sub">What breaks without it</div><ul class="clean">
          <li>No decision rights: everyone assumes someone else approved the model.</li>
          <li>No audit trail: you can't reconstruct why a claim was denied nine months ago.</li>
          <li>No oversight rule: the model quietly becomes the final decision-maker.</li>
        </ul></div>
        <div class="callout warn"><strong>How AI changes governance.</strong> AI can draft a framework, RACI, or risk register in minutes. It can't decide your <em>risk appetite</em> or whether a control is truly operating. You supply judgment; AI supplies the first draft.</div>
      `
    },
    {
      id: "twenty",
      navLabel: "The 20% You Need",
      eyebrow: "The 20% You Need to Know",
      title: "Enough governance to direct and judge it",
      body: `
        <p>You don't need to become a compliance officer — just enough to spot when an AI's governance is theater: impressive language, no real control behind it.</p>
        <div class="table-wrap"><table>
          <thead><tr><th>Concept</th><th>What it is</th><th>Tell of good work</th></tr></thead>
          <tbody>
            <tr><td>Governance vs management</td><td>Governance sets direction &amp; constraints; management operates within them</td><td>Board sets appetite; teams run inside it</td></tr>
            <tr><td>Decision rights &amp; RACI</td><td>Who is Responsible, Accountable, Consulted, Informed per decision</td><td>Exactly one Accountable each</td></tr>
            <tr><td>Policy / standard / control</td><td>Intent &rarr; required specifics &rarr; the mechanism that enforces it</td><td>Each policy traces to a control</td></tr>
            <tr><td>Risk register &amp; appetite</td><td>Scored catalog of risks; how much risk you'll knowingly accept</td><td>Owners, mitigations, numeric appetite</td></tr>
            <tr><td>AI-specific risk</td><td>Bias, privacy, security, model drift, misuse</td><td>Each has a named control</td></tr>
            <tr><td>Compliance mapping</td><td>Linking controls to SOC 2 / ISO 27001 / GDPR obligations</td><td>Every obligation has evidence</td></tr>
            <tr><td>Audit trail &amp; evidence</td><td>The record that proves a control ran</td><td>Reconstructable months later</td></tr>
            <tr><td>Responsible AI &amp; oversight</td><td>Fairness, transparency, a human in the loop for consequential calls</td><td>Adverse decisions get human review</td></tr>
            <tr><td>Operating model &amp; cadence</td><td>The standing bodies and review rhythm that keep it alive</td><td>Named forum, fixed schedule</td></tr>
          </tbody>
        </table></div>
        <div class="callout"><strong>Example.</strong> <em>Policy:</em> no adverse claim decision is final without human review. <em>Standard:</em> a triage score below 0.30 routes to a licensed adjuster within 24 hours. <em>Control:</em> the engine blocks auto-denial and logs the adjuster's ID. Now it is testable.</div>
      `
    },
    {
      id: "role",
      navLabel: "Role in the SDLC",
      eyebrow: "Where it fits",
      title: "Role in the SDLC",
      body: `
        <p>Governance is cross-cutting, but as a station on the arc it owns <strong>Operate &amp; Assure</strong> — where a working system must become a <em>trusted, scalable</em> one. It hands architecture a system that can be defended, audited, and grown.</p>
        <div class="flow">
          <div class="step"><div class="k">Before</div><div class="t">Deployment &amp; MLOps</div></div>
          <div class="step"><div class="k">You are here</div><div class="t">Governance Lead</div></div>
          <div class="step"><div class="k">After</div><div class="t">Solution Architect</div></div>
        </div>
        <div class="stack" style="margin-top:.4rem">
          <div class="tier"><div class="lab">Gives governance its input</div><div class="row"><span class="chip">Model owners</span><span class="chip">Security &amp; Privacy</span><span class="chip">Legal &amp; Compliance</span><span class="chip">Executive sponsor</span></div></div>
          <div class="tier"><div class="lab">The governance role (you direct it)</div><div class="row"><span class="chip pri">Governance Lead</span></div></div>
          <div class="tier"><div class="lab">Consumes governance's output</div><div class="row"><span class="chip">Auditors &amp; regulators</span><span class="chip">Model teams</span><span class="chip">Solution Architect</span><span class="chip">Risk council</span></div></div>
        </div>
        <div class="callout"><strong>Approval gate you own:</strong> the go-to-scale decision. Before a model moves from pilot to broad production use, you confirm decision rights, controls, risk register, and oversight rules are real and operating.</div>
      `
    },
    {
      id: "io",
      navLabel: "Inputs & Outputs",
      eyebrow: "Section · Inputs & Outputs",
      title: "What comes in, what hands off",
      body: `
        <div class="card"><h4>Inputs</h4><ul class="clean">
          <li>The deployed model, its purpose, and its decision surface</li>
          <li>Obligations to meet (SOC 2, ISO 27001, GDPR)</li>
          <li>Organizational risk appetite; known incidents and concerns</li>
        </ul></div>
        <div class="card"><h4>Outputs</h4><ul class="clean">
          <li>Governance framework and Responsible-AI policy</li>
          <li>Decision RACI and escalation paths</li>
          <li>Risk register, compliance mapping, audit plan, and cadence</li>
        </ul></div>
        <div class="sub">Information flow</div>
        <div class="flow"><div class="step"><div class="k">In</div><div class="t">Model + obligations</div></div><div class="step"><div class="k">Frame</div><div class="t">Rules &amp; roles</div></div><div class="step"><div class="k">Assess</div><div class="t">Risk register</div></div><div class="step"><div class="k">Control</div><div class="t">Map &amp; test</div></div><div class="step"><div class="k">Out</div><div class="t">Assured system</div></div></div>
      `
    },
    {
      id: "responsibilities",
      navLabel: "Responsibilities",
      eyebrow: "Ownership",
      title: "What a Governance Lead actually owns",
      body: `
        <ul class="clean">
          <li><strong>Set decision rights</strong> — who may deploy, retrain, override, and retire the model, one accountable owner each.</li>
          <li><strong>Author policy &amp; standards</strong> — the acceptable-use and human-oversight rules, each turned into an enforceable control.</li>
          <li><strong>Maintain the risk register</strong> — identify, score, assign, and re-review risks against a stated appetite.</li>
          <li><strong>Map compliance</strong> — link controls to SOC 2 / ISO 27001 / GDPR obligations and their evidence.</li>
          <li><strong>Guarantee the audit trail</strong> — ensure every consequential decision is reconstructable.</li>
          <li><strong>Enforce human oversight</strong> — keep a person in the loop for adverse, high-impact decisions.</li>
          <li><strong>Run the operating cadence</strong> — convene the bodies that keep governance alive as the system changes.</li>
        </ul>
        <div class="card"><div class="sub">You own vs you don't</div>
          <div class="kv"><span class="k">Own</span><span class="val">Decision rights · Risk appetite · Sign-off</span></div>
          <div class="kv"><span class="k">Don't own</span><span class="val">Model internals · Retrain code · Daily ops</span></div>
        </div>
      `
    },
    {
      id: "artifacts",
      navLabel: "Documents You'll Generate",
      eyebrow: "Section · Documents",
      title: "The 7 documents your Field Guide builds",
      body: `
        <p>These are exactly what your Field Guide generates for your chosen example — each viewable, searchable, and downloadable.</p>
        <div class="table-wrap"><table>
          <thead><tr><th>Document</th><th>What it proves</th></tr></thead>
          <tbody>
            <tr><td>Governance Framework</td><td>The operating charter: principles, scope, decision rights, and control structure</td></tr>
            <tr><td>Decision RACI</td><td>For each decision (deploy, retrain, override, retire) exactly who is accountable</td></tr>
            <tr><td>Compliance Checklist</td><td>Your controls mapped to SOC 2 / ISO 27001 / GDPR, with evidence pointers</td></tr>
            <tr><td>Risk Register</td><td>Live risks scored by likelihood &times; impact, with owners, mitigations, and appetite</td></tr>
            <tr><td>Policy Document</td><td>The Responsible-AI / acceptable-use policy and the human-oversight rules</td></tr>
            <tr><td>Audit Plan</td><td>How and when controls get tested, what evidence is collected, who signs off</td></tr>
            <tr><td>Operating Model / Cadence</td><td>The standing bodies, meetings, and review rhythm that keep governance alive</td></tr>
          </tbody>
        </table></div>
      `
    },
    {
      id: "goodbad",
      navLabel: "Good vs Bad Governance",
      eyebrow: "Section · Good vs Bad",
      title: "Good vs bad governance",
      body: `
        <div class="card good"><h4>Good governance</h4><ul>
          <li>Every policy traces to an operating control and to real evidence.</li>
          <li>Risk appetite stated in numbers, so decisions can be measured against it.</li>
          <li>One accountable owner per decision — no diffuse "the committee" answers.</li>
          <li>Human oversight enforced by the system, and run on a fixed cadence.</li>
        </ul></div>
        <div class="card bad"><h4>Bad governance</h4><ul>
          <li>Principles-only: a beautiful policy with no control behind it.</li>
          <li>A risk register written once and never re-reviewed.</li>
          <li>Accountability spread so thin no single person can be named.</li>
          <li>"Human in the loop" that is a rubber stamp, producing no evidence.</li>
        </ul></div>
        <div class="callout warn"><strong>Red flags in AI-drafted governance:</strong> aspirational language with no controls, a register where everything is "low," a RACI with two Accountables or none, and oversight rules that never say <em>when</em> a human must act.</div>
      `
    },
    {
      id: "metrics",
      navLabel: "KPIs & Success",
      eyebrow: "Section · Measurement",
      title: "KPIs & success metrics",
      body: `
        <p>Governance is measured by whether its controls actually operate — and catch trouble before it reaches a customer.</p>
        <div class="card"><div class="sub">Control &amp; compliance targets</div>
          <div class="kv"><span class="k">Adverse decisions with logged human review</span><span class="val">100%</span></div>
          <div class="kv"><span class="k">Policies traced to an operating control</span><span class="val">100%</span></div>
          <div class="kv"><span class="k">Compliance obligations with evidence</span><span class="val">&ge; 95%</span></div>
          <div class="kv"><span class="k">Open high risks past review date</span><span class="val">0</span></div>
        </div>
        <div class="card"><div class="sub">Health signals</div><ul class="clean">
          <li>Override rate and reason mix — is the human loop real or a rubber stamp?</li>
          <li>Incidents traced to a missing or failed control.</li>
          <li>Share of AI use on the sanctioned path (vs shadow AI).</li>
        </ul></div>
        <div class="callout"><strong>Leading vs lagging.</strong> Control coverage and evidence completeness are <em>leading</em> — they predict whether you can stand behind the system. Incidents traced to a failed control are <em>lagging</em> — they confirm where it was thinner than it looked.</div>
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
            <tr><td>GRC platforms (Vanta, Drata, OneTrust)</td><td>Control tracking &amp; evidence</td><td>Draft control-to-obligation maps</td></tr>
            <tr><td>Risk register (ServiceNow GRC, sheets)</td><td>Scoring &amp; ownership</td><td>Suggest risks &amp; likelihood x impact</td></tr>
            <tr><td>Audit-log / SIEM tooling</td><td>Immutable decision trails</td><td>Summarize what the logs show</td></tr>
            <tr><td>Fairness / drift monitors</td><td>Bias &amp; drift detection</td><td>Interpret metric shifts</td></tr>
          </tbody>
        </table></div>
        <p class="muted small">Recognition, not tutorials. You direct these; you don't have to operate them.</p>
      `
    },
    {
      id: "ai",
      navLabel: "AI Collaboration",
      eyebrow: "Section · AI Collaboration",
      title: "Working with AI on governance",
      body: `
        <div class="card"><h4>AI does well</h4><ul class="clean">
          <li>Draft a framework, RACI, and policy set from a description</li>
          <li>Enumerate AI risks you might overlook (bias, drift, misuse)</li>
          <li>Map a control to likely SOC 2 / ISO 27001 / GDPR clauses</li>
        </ul></div>
        <div class="card"><h4>You still own</h4><ul class="clean">
          <li>The organization's real risk appetite and accountability</li>
          <li>Which decisions are too consequential to automate</li>
          <li>Whether a control is truly operating, not just written</li>
        </ul></div>
        <div class="callout warn"><strong>What AI gets wrong here:</strong> it invents plausible compliance mappings, under-scores risk (everything drifts to "low"), and writes oversight rules with no trigger. Verify every compliance claim against the actual control and its evidence.</div>
        <div class="sub">The loop</div>
        <div class="flow"><div class="step"><div class="k">1</div><div class="t">Describe the system</div></div><div class="step"><div class="k">2</div><div class="t">AI drafts governance</div></div><div class="step"><div class="k">3</div><div class="t">You evaluate</div></div><div class="step"><div class="k">4</div><div class="t">Test the control</div></div><div class="step"><div class="k">5</div><div class="t">Approve</div></div></div>
      `
    },
    {
      id: "review",
      navLabel: "Architect Review Lens",
      eyebrow: "Architect Review",
      title: "Before you approve the governance",
      body: `
        <p>Run every AI-generated governance package through this lens before it scales.</p>
        <div class="card"><h4>Accountability &amp; decision rights</h4><ul class="clean">
          <li>Does each decision have exactly one accountable owner?</li>
          <li>Are deploy, retrain, override, and retire all covered, with a named escalation path?</li>
        </ul></div>
        <div class="card"><h4>Risk &amp; appetite</h4><ul class="clean">
          <li>Are bias, privacy, security, drift, and misuse all in the register?</li>
          <li>Is appetite stated in numbers, and does any high risk sit open past its review date?</li>
        </ul></div>
        <div class="card"><h4>Controls &amp; compliance</h4><ul class="clean">
          <li>Does every policy trace to an operating control, and every obligation to evidence?</li>
          <li>Is the audit trail complete enough to reconstruct a decision later?</li>
        </ul></div>
        <div class="card"><h4>Human oversight</h4><ul class="clean">
          <li>Do adverse, high-impact decisions require a human, with a specific trigger?</li>
          <li>Is the loop real, or would volume make it a rubber stamp?</li>
        </ul></div>
        <div class="callout"><strong>Approve only when:</strong> every decision has one accountable owner, every policy traces to an operating control, every obligation has evidence, high risks are scored against a numeric appetite, and human oversight is enforced for consequential decisions.</div>
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
          <li><strong>Governance Framework</strong> — does it name decision rights and controls, or just recite principles?</li>
          <li><strong>Decision RACI</strong> — exactly one Accountable per decision, no gaps or doubles?</li>
          <li><strong>Compliance Checklist</strong> — does every obligation have an evidence pointer, not just a check?</li>
          <li><strong>Risk Register</strong> — is anything scored "high," with a named owner and review date, and do oversight rules state a concrete trigger?</li>
          <li><strong>Ask assistant</strong> — ask it "who approves a retrain?" and see if it answers from your RACI.</li>
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
        <div class="kv"><span class="k">Governance vs management</span><span class="val">Setting the rules vs operating within them</span></div>
        <div class="kv"><span class="k">Decision rights / RACI</span><span class="val">Who may decide; Responsible, Accountable, Consulted, Informed</span></div>
        <div class="kv"><span class="k">Policy / standard / control</span><span class="val">Intent &rarr; specifics &rarr; enforcing mechanism</span></div>
        <div class="kv"><span class="k">Risk register / appetite</span><span class="val">Scored risk catalog / risk you'll accept</span></div>
        <div class="kv"><span class="k">Model drift</span><span class="val">Accuracy decaying as the world changes</span></div>
        <div class="kv"><span class="k">Human oversight</span><span class="val">A person in the loop on consequential calls</span></div>
        <div class="kv"><span class="k">Audit trail</span><span class="val">The evidence record proving a control ran</span></div>
        <div class="kv"><span class="k">SOC 2 / ISO 27001 / GDPR</span><span class="val">Trust-controls / security / privacy regimes</span></div>
        <div class="q"><div class="qt">Governance vs management — what's the difference?</div><button class="revealbtn">Reveal</button><div class="ans">Governance sets the rules, decision rights, and risk appetite; management operates inside them. The board governs; the team manages. Confusing the two is how accountability disappears.</div></div>
        <div class="q"><div class="qt">Why isn't a Responsible-AI policy enough on its own?</div><button class="revealbtn">Reveal</button><div class="ans">A policy states intent. Without a standard (the specifics) and a control (the enforcing mechanism that produces evidence), it is unenforceable. Auditors test controls, not aspirations.</div></div>
      `
    },
    {
      id: "build",
      navLabel: "Build & Submit",
      eyebrow: "Build & Submit",
      title: "Build your Governance Lead Field Guide",
      body: `
        <p class="lead">You'll build your Field Guide in <strong>your own Claude Code</strong>: a searchable, Colaberry-branded guide with the governance documents generated for a chosen example, an offline Ask assistant, and downloadable, professional deliverables. Then upload it here.</p>
        <p>Your Field Guide generates real, substantial versions of a Governance Lead's documents:</p>
        <ul>
          <li><strong>Governance Framework</strong> — principles, scope, decision rights, control structure</li>
          <li><strong>Decision RACI</strong> — deploy, retrain, override, retire, each with one accountable owner</li>
          <li><strong>Compliance Checklist</strong> — controls mapped to SOC 2 / ISO 27001 / GDPR with evidence</li>
          <li><strong>Risk Register</strong> — risks scored by likelihood &times; impact, owned, measured against appetite</li>
          <li><strong>Policy Document</strong> — Responsible-AI / acceptable-use policy and oversight rules</li>
          <li><strong>Audit Plan</strong> — control tests, evidence to collect, and sign-off</li>
          <li><strong>Operating Model / Cadence</strong> — the standing bodies and review rhythm that keep it alive</li>
        </ul>
        <button class="buildcta" id="copyPromptBtn2" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg> Copy the build prompt</button>
        <p class="muted small">The prompt is long on purpose — just copy it and paste it into Claude Code. You don't need to read it.</p>
      `
    }
  ],
  buildPrompt: `Build a rich, self-contained Governance Lead FIELD GUIDE as a single HTML file named GovernanceLead_FieldGuide.html. Take your time and make it genuinely substantial — a 5 to 10 minute build that produces a polished, knowledge-base-style guide, not a quick page.

WHO IT'S FOR: I'm a learner in the Colaberry Enterprise AI Leadership Accelerator becoming an AI Solution Architect. I need the ~20% of AI operations & governance required to DIRECT, EVALUATE, and APPROVE AI-generated governance work — the rules, roles, and controls that keep an AI system safe, compliant, and accountable as it scales. Pick ONE example industry (Restaurant, Insurance, Healthcare, Retail, or Manufacturing), invent a believable AI initiative (e.g. an insurer's AI claims-triage assistant), and make every document concrete to it.

MAKE IT A KNOWLEDGE BASE, not a brochure: a left topic nav, a prominent SEARCH box, and an offline "Ask" assistant that answers FROM THE GUIDE'S OWN CONTENT (a small offline Q&A matched to the most relevant section; no external API; works offline).

BRANDING & QUALITY: Colaberry logo in the header and on the print/PDF export; executive, calm, authoritative voice; light/dark aware; fully self-contained inline CSS + JS, NO external libraries or CDNs, works offline.

TEACH THE DISCIPLINE (concise): why governance exists and how it differs from management; the 20% (governance vs management; decision rights and RACI; policies, standards, and controls; the risk register and risk appetite; AI-specific risk — bias, privacy, security, model drift, misuse; compliance mapping to SOC 2 / ISO 27001 / GDPR at a concept level; audit trails and evidence; responsible-AI and human oversight; an operating model and cadence); good vs bad governance; KPIs; the architect's review lens.

THEN GENERATE THE DOCUMENTS — the heart of it. For the chosen example, produce REAL, substantial documents (not placeholders), each in its own searchable section, each individually DOWNLOADABLE. PRIMARY format = a fully-styled self-contained HTML deliverable that looks like a genuine professional document: a branded cover with the Colaberry logo, a document-control strip (version, owner, status, date), styled headers and tables, callouts, a sign-off block (Prepared / Reviewed / Approved), and a footer. Make each EXTENSIVE, not a summary. ALSO a Save-as-PDF that prints that same document, and an Excel-friendly .csv for the tabular ones (RACI, compliance checklist, risk register, audit plan). Do NOT default to plain .md:
  1. Governance Framework (principles, scope, decision rights, control structure)
  2. Decision RACI (who is Accountable for deploy / retrain / override / retire)
  3. Compliance Checklist mapped to SOC 2 / ISO 27001 / GDPR, with an evidence column
  4. Risk Register (likelihood x impact, owners, mitigations, scored against a stated risk appetite)
  5. Responsible-AI Policy Document (acceptable-use rules + human-oversight triggers)
  6. Audit Plan (control tests, evidence to collect, schedule, sign-off)
  7. Operating Model / Cadence (standing bodies, meeting rhythm, review schedule)

USE RICH VISUALS: Mermaid-style diagrams (operating model, a decision/escalation flow, a control-to-compliance mapping) AND Power BI-style charts (risk heatmap, KPI tiles, control-coverage donut), ALL as INLINE SVG (offline). QUALITY BAR: every policy traces to an operating control; every obligation has evidence; risk appetite in numbers; exactly one Accountable per decision; human oversight with a concrete trigger. No principles-only policies; no "everything is low risk."

EMBED metadata as a JSON script tag with id="deepdive-metadata": { guide_type:"Governance Lead Field Guide", curriculum_type:"deep_dive", week:11, discipline:"Governance Lead", student_id, project_id, repository, generated_by:"Claude Code", generated_date, version, build_number }.

When finished, open the file in the browser.`
};
