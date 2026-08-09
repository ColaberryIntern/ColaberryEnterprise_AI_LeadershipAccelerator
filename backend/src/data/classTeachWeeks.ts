/**
 * classTeachWeeks.ts — GENERATED. Deep teaching content for Weeks 2-12, authored
 * by the parallel fan-out and integrated by scripts/buildTeachWeeks.js. Do not
 * edit by hand; re-run the integrator to regenerate. classTeachContent.ts merges
 * this under the hand-authored weeks (Week 1 wins on conflict).
 */
import type { DayTeach } from './classTeachContent';

export const GENERATED_WEEK_TEACH: Record<number, DayTeach> = {
  "2": {
    "monday": [
      {
        "segment": "business-problem",
        "eyebrow": "📁 Where Agent Skill Files Live",
        "title": "Every file tonight stays inside your current project — nothing leaves it",
        "body": "Before we build, know exactly where things land. Project Skills live at .claude/skills/<skill-name>/SKILL.md, with supporting files in references/, templates/, and scripts/ subfolders. Tonight's lab inputs and outputs — the sample orders, the quality contract, every report — live in skill-lab/. After every build, Claude reports the exact project-relative path of every file it created so you can open it directly in the VS Code Explorer. No Downloads folder, no exports — everything stays in the project.",
        "bullets": [
          "Skill: .claude/skills/<skill-name>/SKILL.md",
          "Supporting files: .claude/skills/<skill-name>/references|templates|scripts/",
          "Lab inputs and outputs: skill-lab/",
          "Claude reports every path — you never guess where a file went"
        ],
        "script": "Say it plainly: nothing tonight leaves this project. Every file has a project-relative path, and Claude will tell you exactly what it is after every build."
      },
      {
        "segment": "business-problem",
        "eyebrow": "🛠️ Build data-quality-gate",
        "title": "First Skill: block bad data before it reaches the dashboard",
        "body": "We build the Skill that would have caught this morning's incident. It reads a dataset and a quality contract, checks schema, freshness, uniqueness, required fields, and numeric rules, and returns PASS, WARN, or FAIL with a PUBLISH or BLOCK recommendation. It never modifies the source data. First it checks whether .claude/skills/ already exists in this project and creates it if not — that check itself is part of the prompt, not assumed.",
        "code": {
          "label": "Claude Code prompt — build data-quality-gate",
          "code": "We are completing a guided Agent Skills lab inside my Week 1 workspace.\n\nFIRST: WORKSPACE AND SKILLS DIRECTORY CHECK\n1. Read CLAUDE.md and follow all project rules.\n2. Check whether the project directory .claude/skills/ exists.\n3. If .claude/skills/ does not exist, create it before doing anything else.\n4. Record whether the directory already existed or was created.\n5. If a CLAUDE.md rule conflicts with this request, stop and explain.\n\nCREATE THESE FILES\n1. .claude/skills/data-quality-gate/SKILL.md\n2. skill-lab/orders.csv\n3. skill-lab/quality-contract.md\n\nSKILL REQUIREMENTS\nName: data-quality-gate\nDescription: Use when the user asks to validate a dataset, CSV, ETL output, query result, or dashboard source before publication. Checks the data against a quality contract and returns PASS, WARN, or FAIL with evidence and a PUBLISH or BLOCK recommendation.\n\nThe instruction body must:\n- Require a dataset path.\n- Use a supplied quality contract when available.\n- Check schema, freshness, expected volume, key uniqueness, duplicates, required fields, nulls, and numeric rules.\n- Return a table with Check, Evidence, Status, and Recommended Action.\n- Finish with PASS, WARN, or FAIL.\n- Finish with a PUBLISH or BLOCK recommendation.\n- Never modify the source data.\n- Remain concise and procedural.\n- Not include allowed-tools yet.\n\nSAMPLE DATA\nCreate approximately 12 believable order records in skill-lab/orders.csv. Deliberately include: one duplicate order ID, one missing region, one negative revenue value, one load timestamp older than 48 hours.\n\nQUALITY CONTRACT\nCreate skill-lab/quality-contract.md with: order_id must be unique; region is required; revenue must be greater than zero; load_timestamp must be less than 24 hours old; expected row count is at least 10.\n\nDo not commit anything and do not run the Skill yet.\n\nWHEN FINISHED, REPORT:\n1. Whether .claude/skills/ already existed or was created\n2. Every file created\n3. The exact project-relative path of every file\n4. A one-line explanation of what each file contains\n5. The final Skill description\n6. Whether Claude Code should be restarted because the top-level Skills directory was created after the current session started"
        },
        "bullets": [
          "WHERE THESE FILES WILL BE STORED",
          ".claude/skills/data-quality-gate/SKILL.md",
          "skill-lab/orders.csv",
          "skill-lab/quality-contract.md"
        ],
        "script": "Paste this on screen exactly as written. Watch the pulse rail — nobody moves on until .claude/skills/ exists and all three files are reported back with their exact paths."
      },
      {
        "segment": "business-problem",
        "eyebrow": "🧪 Test Automatic Invocation",
        "title": "Separate slide, separate action: prove it fires without naming it",
        "body": "Never combine building a Skill with testing it on the same prompt. Now, in a fresh ask, validate the sample orders against the quality contract WITHOUT naming the Skill — Claude should invoke data-quality-gate on its own because the description matched. Expect FAIL and BLOCK: duplicate order, missing region, negative revenue, and stale data are all deliberately present.",
        "code": {
          "label": "Claude Code prompt — test automatic invocation",
          "code": "Before this data feeds the executive revenue dashboard, validate:\nskill-lab/orders.csv\nagainst:\nskill-lab/quality-contract.md\n\nTell me whether I should PUBLISH or BLOCK the dataset.\n\nSave the completed report to:\nskill-lab/data-quality-report.md\n\nDo not modify orders.csv.\n\nWHEN FINISHED, REPORT:\n1. Whether data-quality-gate was invoked automatically\n2. Every issue found\n3. The final PASS, WARN, or FAIL result\n4. The PUBLISH or BLOCK recommendation\n5. The exact path of the saved report"
        },
        "bullets": [
          "WHERE THE RESULT WILL BE STORED",
          "skill-lab/data-quality-report.md",
          "Expected: automatic invocation, FAIL, BLOCK"
        ],
        "script": "This is the acceptance test for every Skill tonight: ask in plain English, never name the Skill. If it fires on its own, the description works."
      },
      {
        "segment": "architecture",
        "eyebrow": "🗄️ Familiar Analogy",
        "title": "A prompt is like ad hoc SQL. A Skill is like a governed reusable procedure.",
        "body": "You already know this pattern from data work. Copied ad hoc SQL maps to a repeated prompt — works once, drifts every time you retype it. A stored procedure or reusable ETL package maps to an Agent Skill. The procedure catalog's metadata maps to the Skill's name and description. The procedure's steps map to the SKILL.md body. Lookup and configuration files map to supporting resources. Validation and reconciliation map to Skill tests. Source control maps to a committed project Skill. This is an analogy, not a claim that a Skill is executable SQL.",
        "bullets": [
          "Ad hoc SQL → repeated prompt",
          "Stored procedure / reusable ETL package → Agent Skill",
          "Procedure catalog metadata → Skill name + description",
          "Procedure steps → SKILL.md body",
          "Validation and reconciliation → Skill tests"
        ],
        "script": "Say explicitly: this is an analogy to build intuition, not a claim that a Skill literally executes SQL. Data people already understand governed reuse — we are just naming the AI-native version of it."
      },
      {
        "segment": "architecture",
        "eyebrow": "🧬 Anatomy",
        "title": "Metadata routes the work. Instructions perform the work.",
        "body": "A Skill has three parts and you must not confuse their jobs. The folder is the capability boundary. The name is the identifier. The description is routing information — the sentence Claude reads to decide WHEN to load this Skill at all. The body is the procedure Claude follows once triggered. References and templates are supporting knowledge, loaded only when needed. The output contract — PASS/WARN/FAIL, PUBLISH/BLOCK — is the evidence of correct execution.",
        "bullets": [
          "Folder = capability boundary",
          "Description = routing information (the trigger)",
          "Body = the procedure followed after invocation",
          "Output contract = evidence of correct execution"
        ],
        "script": "The description is not documentation about the Skill — it is the routing logic. Say that sentence out loud once."
      },
      {
        "segment": "architecture",
        "eyebrow": "🪜 Progressive Disclosure",
        "title": "Claude reads the catalog before loading the procedure",
        "body": "Only a Skill's name and description are advertised in context at all times — tiny, a line or two each. The full SKILL.md instructions load only when the Skill is actually invoked. Supporting resources — a reference file, a template — load only when the body says to read them. And once invoked, the rendered instructions remain in the conversation context for the rest of the turn. This is why having many Skills installed costs almost nothing until one actually fires.",
        "bullets": [
          "1. Name + description advertised at all times",
          "2. SKILL.md body loads when invoked",
          "3. Supporting resources load as needed",
          "4. Once invoked, instructions remain in context"
        ],
        "script": "Contrast this with CLAUDE.md, which loads in full every session whether relevant to this turn or not. Skills are lazy; CLAUDE.md is eager. Keep that fork in your head."
      },
      {
        "segment": "architecture",
        "eyebrow": "🧭 Skill, CLAUDE.md, Subagent, or MCP?",
        "title": "Four components, four different jobs — they are not interchangeable",
        "body": "Always-true project rule, like never modify production SQL without review → CLAUDE.md. A reusable procedure, like validate an extract before dashboard publication → Skill. A separate delegated investigation, like investigating several possible causes without filling the main context → Subagent. A connection to an outside system, like retrieving current data from Snowflake, Power BI, or Jira → MCP. Map every capability question to one of these four before you build.",
        "bullets": [
          "Always true, every turn → CLAUDE.md",
          "A repeated, invocable procedure → Skill",
          "Separate delegated investigation → Subagent",
          "Connection to an outside system → MCP"
        ],
        "script": "If you remember one slide tonight, make it this one. Most messy AI setups are someone stuffing a procedure into CLAUDE.md, or reaching for a Skill when they actually needed MCP."
      },
      {
        "segment": "deconstruct",
        "eyebrow": "🔬 Deconstruct",
        "title": "\"Helps with data\" versus a routable description",
        "body": "Compare description: Helps with data. against description: Use when the user asks to validate a dataset, CSV, ETL output, query result, or dashboard source before publication. Returns PASS, WARN, or FAIL with evidence and a PUBLISH or BLOCK recommendation. Identify the trigger, the input, the output, the boundary, and the user vocabulary in the second one — and notice the first has none of them.",
        "bullets": [
          "Trigger: when does this fire?",
          "Input: what does it need?",
          "Output: what does it produce?",
          "Boundary: what is it NOT for?",
          "Vocabulary: does it use the words a user actually says?"
        ],
        "script": "Read both out loud. Ask the room which one Claude could actually route on. The vague one has nothing to match against — Claude does the work inline and the Skill stays invisible."
      },
      {
        "segment": "deconstruct",
        "eyebrow": "🛡️ Harden data-quality-gate",
        "title": "Review and improve — do not rebuild from scratch",
        "body": "Now harden the Skill so it triggers reliably for data-validation and publish-readiness requests, without firing on unrelated SQL, dashboard-design, or metric-calculation requests. Move the detailed check explanations into a reference file so SKILL.md stays concise, and write down real positive and negative trigger tests so this stays verifiable, not a guess.",
        "code": {
          "label": "Claude Code prompt — harden data-quality-gate",
          "code": "Review the existing data-quality-gate Skill.\n\nDo not rebuild it from scratch.\n\nHarden it so it triggers reliably for data-validation and publish-readiness requests without triggering for unrelated SQL, dashboard-design, or metric-calculation requests.\n\nComplete these actions:\n1. Review and improve the description if necessary.\n2. Keep the trigger focused on: dataset validation, ETL-output validation, data-quality checks, dashboard or report publish readiness.\n3. Make clear that ordinary requests to write SQL, calculate a metric, or design a dashboard are not sufficient reasons to invoke it.\n4. Create .claude/skills/data-quality-gate/references/quality-checks.md\n5. Move detailed explanations of the quality checks into that reference.\n6. Keep SKILL.md concise and state exactly when to read the reference.\n7. Create skill-lab/data-quality-gate-tests.md\n8. Include: three prompts that should trigger the Skill, three prompts that should not trigger the Skill, expected output requirements.\n\nDo not commit anything.\n\nWHEN FINISHED, REPORT:\n1. Every file modified\n2. Every file created\n3. The exact project-relative path of every file\n4. A one-line explanation of what each file contains\n5. The final description\n6. The positive and negative trigger tests"
        },
        "bullets": [
          "WHERE THESE FILES WILL BE STORED",
          ".claude/skills/data-quality-gate/SKILL.md",
          ".claude/skills/data-quality-gate/references/quality-checks.md",
          "skill-lab/data-quality-gate-tests.md"
        ],
        "script": "This is a review-and-improve prompt, not a rebuild. Read the final description out loud and ask: does this fire on the way a data analyst actually talks?"
      },
      {
        "segment": "deconstruct",
        "eyebrow": "🎯 Three-Way Retest",
        "title": "Natural, direct, and negative — all three, every time",
        "body": "A hardened Skill needs three separate proofs, not one. Test 1 asks naturally without naming the Skill. Test 2 invokes it directly by name. Test 3 is a deliberate negative test — an ordinary SQL request that must NOT trigger it. All three matter: natural proves the description, direct proves the body, negative proves the boundary.",
        "code": {
          "label": "Three-way retest",
          "code": "TEST 1 — NATURAL INVOCATION\nIs skill-lab/orders.csv safe to publish to the executive dashboard?\n\nTEST 2 — DIRECT INVOCATION\n/data-quality-gate skill-lab/orders.csv using skill-lab/quality-contract.md\n\nTEST 3 — NEGATIVE TEST\nWrite a SQL query that totals revenue by region.\n\nExpected: Test 1 invokes data-quality-gate. Test 2 invokes data-quality-gate. Test 3 does not invoke data-quality-gate.\n\nNo new files are required for this test."
        },
        "script": "Run all three back to back. The negative test matters as much as the positive ones — a Skill that fires on everything is as broken as one that fires on nothing."
      },
      {
        "segment": "micro-build",
        "eyebrow": "🕵️ Build etl-failure-triage",
        "title": "Second Skill: rank likely causes with evidence, never guess",
        "body": "The gate blocked the bad data — now the business wants to know why the pipeline produced it. etl-failure-triage reads logs and run metadata, separates facts from hypotheses, ranks likely causes with cited evidence, and recommends the next diagnostic step. It never changes pipeline code and never reruns jobs — diagnosis, not action.",
        "code": {
          "label": "Claude Code prompt — build etl-failure-triage",
          "code": "Read CLAUDE.md and inspect the existing Week 2 Agent Skills lab.\n\nConfirm that .claude/skills/ exists. If it does not, create it.\n\nCreate:\n1. .claude/skills/etl-failure-triage/SKILL.md\n2. .claude/skills/etl-failure-triage/references/common-failures.md\n3. skill-lab/orders-pipeline-failure.log\n4. skill-lab/pipeline-run-metadata.md\n\nSKILL DESCRIPTION\nUse when the user asks why an ETL or ELT pipeline, scheduled load, SQL job, data refresh, or ingestion process failed or produced suspicious output. Reviews logs and run metadata, ranks likely causes, cites evidence, and recommends the next safe diagnostic steps.\n\nSKILL BEHAVIOR\n- Require a log, run output, or failure description.\n- Read run metadata when supplied.\n- Separate facts from hypotheses.\n- Cite evidence for every likely cause.\n- Rank the most likely causes.\n- Provide the next diagnostic step for each cause.\n- Do not change pipeline code.\n- Do not rerun jobs.\n- Do not claim a root cause without evidence.\n- Return: Incident Summary, Evidence, Ranked Causes, Next Tests, Escalation Recommendation.\n\nSAMPLE FAILURE\nCreate a believable ETL failure log and run-metadata file connected to the orders dataset. Include evidence of: a schema mismatch involving region, a failed conversion or mapping step, a retry that did not resolve the problem.\n\nDo not commit or run the Skill.\n\nWHEN FINISHED, REPORT:\n1. Every file created\n2. The exact project-relative path of every file\n3. A one-line explanation of what each file contains\n4. The final Skill description"
        },
        "bullets": [
          "WHERE THESE FILES WILL BE STORED",
          ".claude/skills/etl-failure-triage/SKILL.md",
          ".claude/skills/etl-failure-triage/references/common-failures.md",
          "skill-lab/orders-pipeline-failure.log",
          "skill-lab/pipeline-run-metadata.md"
        ],
        "script": "Same discipline as Skill #1, faster this time — description first, then the body. This one diagnoses; it never fixes or reruns anything."
      },
      {
        "segment": "micro-build",
        "eyebrow": "🧪 Test Automatic Invocation",
        "title": "Separate slide: prove triage fires and cites real evidence",
        "body": "Investigate the failure without naming the Skill. Expect it to invoke automatically, rank the schema mismatch as the top cause with cited log evidence, and recommend a next diagnostic step — never a fix, never a rerun.",
        "code": {
          "label": "Claude Code prompt — test etl-failure-triage",
          "code": "Investigate why the orders pipeline failed using:\nskill-lab/orders-pipeline-failure.log\nskill-lab/pipeline-run-metadata.md\n\nRank the likely causes, cite the evidence, and tell me what should be tested next.\n\nSave the investigation to:\nskill-lab/etl-triage-report.md\n\nDo not change the pipeline or rerun the job.\n\nWHEN FINISHED, REPORT:\n1. Whether etl-failure-triage was invoked automatically\n2. The highest-ranked likely cause\n3. The evidence supporting it\n4. The next recommended diagnostic test\n5. The exact path of the saved report"
        },
        "bullets": [
          "WHERE THE RESULT WILL BE STORED",
          "skill-lab/etl-triage-report.md"
        ],
        "script": "Confirm the report cites real evidence, not a guess. This is the difference between a Skill and a chatbot answer."
      },
      {
        "segment": "micro-build",
        "eyebrow": "📊 Build executive-dashboard-brief",
        "title": "Third Skill: a decision product, not a technical data dump",
        "body": "The technical team has an answer. Leadership needs something different: status, business impact, verified evidence, the decision needed, an owner, and the next update time. executive-dashboard-brief never invents financial impact, cause, owner, or timing — it only uses what the quality and triage reports actually established.",
        "code": {
          "label": "Claude Code prompt — build executive-dashboard-brief",
          "code": "Read CLAUDE.md and inspect the existing Week 2 lab outputs.\n\nConfirm that .claude/skills/ exists. If it does not, create it.\n\nCreate:\n1. .claude/skills/executive-dashboard-brief/SKILL.md\n2. .claude/skills/executive-dashboard-brief/template.md\n\nSKILL DESCRIPTION\nUse when the user asks to turn a data-quality result, failed refresh, pipeline incident, KPI variance, or technical investigation into an executive dashboard update. Produces a concise leadership brief containing status, business impact, verified evidence, decision needed, owner, and next update time.\n\nSKILL REQUIREMENTS\n- Use supplied quality and triage reports.\n- Separate verified facts from unresolved questions.\n- Never invent financial impact, cause, owner, or timing.\n- Avoid raw logs and unnecessary technical details.\n- State whether the dashboard should remain blocked.\n- Use template.md for the final structure.\n- Return: Status, Business Impact, What We Know, What We Do Not Know, Decision or Action Needed, Owner, Next Update.\n\nCreate template.md containing that exact executive structure.\n\nDo not commit or run the Skill.\n\nWHEN FINISHED, REPORT:\n1. Every file created\n2. The exact project-relative path of every file\n3. A one-line explanation of what each file contains\n4. The final Skill description\n5. How SKILL.md uses template.md"
        },
        "bullets": [
          "WHERE THESE FILES WILL BE STORED",
          ".claude/skills/executive-dashboard-brief/SKILL.md",
          ".claude/skills/executive-dashboard-brief/template.md"
        ],
        "script": "Read the required structure out loud: Status, Impact, What We Know, What We Do Not Know, Decision, Owner, Next Update. That is the whole shape of good incident communication."
      },
      {
        "segment": "micro-build",
        "eyebrow": "🧪 Test + Complete the Incident Package",
        "title": "Run all three Skills together — the full connected workflow",
        "body": "The orders dashboard is scheduled to publish. Run the complete incident workflow: validate, and if unsafe, investigate, then brief leadership — using the appropriate Skill for each stage, automatically, without naming any of them. This is the moment the three Skills stop being three separate builds and become one connected system.",
        "code": {
          "label": "Claude Code prompt — full incident workflow",
          "code": "The orders dashboard is scheduled to publish.\n\nComplete the incident workflow using the appropriate Agent Skills.\n\n1. Validate: skill-lab/orders.csv against skill-lab/quality-contract.md\n2. If the data is unsafe, investigate: skill-lab/orders-pipeline-failure.log and skill-lab/pipeline-run-metadata.md\n3. Use the resulting findings to prepare a concise executive dashboard incident brief.\n\nDo not modify the source data.\nDo not change the pipeline.\nDo not invent financial impact, an owner, or a resolution time.\n\nSave the final outputs to:\nskill-lab/final-incident-package/data-quality-report.md\nskill-lab/final-incident-package/etl-triage-report.md\nskill-lab/final-incident-package/executive-dashboard-brief.md\n\nWHEN FINISHED, REPORT:\n1. Which Skill handled each stage\n2. Why each Skill was selected\n3. Whether each Skill was invoked automatically\n4. The exact path of each final output\n5. The final dashboard PUBLISH or BLOCK decision\n6. The next recommended business action"
        },
        "bullets": [
          "WHERE THE FINAL INCIDENT PACKAGE WILL BE STORED",
          "skill-lab/final-incident-package/data-quality-report.md",
          "skill-lab/final-incident-package/etl-triage-report.md",
          "skill-lab/final-incident-package/executive-dashboard-brief.md"
        ],
        "script": "This is the payoff slide. Three Skills, one incident, zero manual coordination. Ask the room: which Skill handled which stage, and why that one and not another?"
      }
    ],
    "thursday": [
      {
        "segment": "build-map",
        "eyebrow": "🗺️ Build Map",
        "title": "Four checkpoints: idea → diagram → stack → a demo you can show off",
        "body": "Here is the whole arc for tonight, and each checkpoint is a state you can screenshot as proof. CP0: your .claude/skills/ folder is ready. CP1: system-architect draws your first real architecture diagram from nothing but your idea. CP2: all three Skills are authored. CP3: mvp-scoper — multi-file and tool-scoped — hands you a Week-1 plan, a visual mockup, and a one-pager, committed. Nobody's idea needs to be final tonight. It needs to be one paragraph.",
        "bullets": [
          "CP0: .claude/skills/ folder ready",
          "CP1: system-architect draws your first diagram",
          "CP2: all three Skills authored",
          "CP3: mvp-scoper is multi-file, scoped, and shows off your idea"
        ],
        "diagram": "flowchart LR\n  I[\"💡 Your idea\\n(one paragraph)\"] --> SA[\"🏗️ system-architect\"]\n  SA --> TS[\"🎨 tech-stack-recommender\"]\n  TS --> MVP[\"🚀 mvp-scoper\"]\n  MVP --> B[\"📦 Your Blueprint:\\ndiagram + stack + demo\"]",
        "script": "Four checkpoints, each one you can screenshot as proof. We go deep on the first skill, then the next two build on it directly."
      },
      {
        "segment": "build-map",
        "eyebrow": "💡 Your Idea, As-Is",
        "title": "Your idea does not need to be final tonight — it needs to be one paragraph",
        "body": "This is not the night your idea gets locked in. It is the night a rough idea becomes something you can actually look at: a diagram, a stack, a demo. A good starting paragraph names who it is for, what it does, and the one thing that would make it useful on day one. That is genuinely enough fuel for all three Skills tonight.",
        "bullets": [
          "Who is this for?",
          "What does it actually do?",
          "What is the one thing it must do well on day one?"
        ],
        "diagram": "flowchart LR\n  R[\"🌱 Rough idea,\\nnot finalized\"] --> P[\"📝 One paragraph:\\nwho + what + day-one job\"]\n  P --> T[\"🧰 Tonight's 3 Skills\"]\n  T --> C[\"👀 Something concrete\\nto react to\"]",
        "script": "Give everyone 60 seconds to write their one paragraph before we build. If someone says their idea isn't ready, tell them that is exactly what tonight is for."
      },
      {
        "segment": "guided-build",
        "eyebrow": "📁 Where Skill Files Live",
        "title": "Everything tonight stays inside your own project",
        "body": "Same rule as Monday. Project Skills live at .claude/skills/<skill-name>/SKILL.md. mvp-scoper will produce a few extra files — a task list, a visual mockup, a one-pager — and every one of them gets an exact, reported path so you never have to guess where something landed.",
        "bullets": [
          "Skill: .claude/skills/<skill-name>/SKILL.md",
          "Generated outputs: project-blueprint/ (new folder, created tonight)",
          "Claude reports every path after every build"
        ],
        "diagram": "flowchart TD\n  S[\".claude/skills/\"] --> A[\"🏗️ system-architect/\\nSKILL.md\"]\n  S --> B[\"🎨 tech-stack-recommender/\\nSKILL.md\"]\n  S --> C[\"🚀 mvp-scoper/\\nSKILL.md + template.md\"]\n  O[\"project-blueprint/\"] --> D[\"architecture.md\"]\n  O --> E[\"tech-stack.md\"]\n  O --> F[\"mockup.html + one-pager.pdf\"]",
        "script": "Point at the diagram. Two folders tonight: the Skills themselves, and where their outputs land. Nobody should ever have to ask 'where did that go?'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "🏗️ CP1 — Build system-architect",
        "title": "Skill #1: turn one paragraph into a real system architecture",
        "body": "This is the Skill everyone remembers. Description: use when the user has a project idea and wants a system architecture. Body: read the idea, identify the real components — frontend, backend/API, database, any external services or an AI layer — and produce a genuine mermaid diagram showing how they connect, not a toy box-and-arrow sketch. This should feel like a week of an architect's thinking, delivered in one pass.",
        "bullets": [
          "Description names the trigger: 'has a project idea, wants an architecture'",
          "Identifies real components — not a generic template",
          "Outputs an actual mermaid diagram, extensive enough to mean something"
        ],
        "diagram": "flowchart LR\n  D[\"💡 One-paragraph idea\"] --> SA[\"🏗️ system-architect\"]\n  SA --> F[\"🖥️ Frontend\"]\n  SA --> BE[\"⚙️ Backend / API\"]\n  SA --> DB[\"🗄️ Database\"]\n  SA --> EX[\"🔌 External services\\n/ AI layer\"]\n  F --> DIA[\"📐 Real mermaid\\narchitecture diagram\"]\n  BE --> DIA\n  DB --> DIA\n  EX --> DIA",
        "code": {
          "label": "Claude Code prompt — build system-architect",
          "code": "Confirm .claude/skills/ exists (create it if not). Create .claude/skills/system-architect/SKILL.md.\n\nDescription: Use when the user has a project idea and wants a system architecture, a technical design, or a diagram of how it would work.\n\nBody must: take a one-paragraph project idea as input; identify the real components this specific idea needs (frontend, backend/API, database, external services, an AI/agent layer if relevant) — never a generic template that ignores what the idea actually said; produce a genuine mermaid flowchart showing how the components connect and how data flows between them; explain each component in one plain-English sentence a non-technical person could follow; save the result to project-blueprint/architecture.md.\n\nWHEN FINISHED, REPORT: the exact path, the final description, and the component list it identified."
        },
        "script": "Paste this. When it comes back, do not just glance at the diagram — read it out loud, node by node, and ask the room if it actually matches their idea."
      },
      {
        "segment": "guided-build",
        "eyebrow": "🧪 Test Automatic Invocation",
        "title": "Separate slide, separate action: prove it fires without naming it",
        "body": "Never combine building a Skill with testing it. Now, in a fresh ask, describe your idea in plain English and ask for how it would work — without naming system-architect. If it auto-fires, your description works. If you have to name it, the description is too weak, and that is exactly what we harden after the break.",
        "bullets": [
          "Ask naturally — never say 'use system-architect'",
          "Auto-fires = CP1 met",
          "This ask also builds a full browsable knowledge-base site — give it time",
          "Only-when-named = the description needs sharpening"
        ],
        "diagram": "flowchart LR\n  ASK[\"🗣️ Natural-language ask,\\nSkill never named\"] --> SA[\"🏗️ system-architect\\n(should auto-fire)\"]\n  SA --> MD[\"📄 architecture.md\"]\n  SA --> KB[\"🌐 project-blueprint/\\nindex.html — a browsable\\nknowledge-base site\"]",
        "code": {
          "label": "Claude Code prompt — test automatic invocation",
          "code": "My idea: [describe your project in one paragraph — who it's for, what it does,\nand the one thing it must do well on day one]\n\nHow would this actually work as a system? Then build it out as a knowledge base\nI can browse.\n\n────────────────────────────────────────\n1. DESIGN THE SYSTEM\n────────────────────────────────────────\nDerive the component list from what my paragraph actually says. Every component\nmust trace back to specific words in it; every component it implies must appear.\nInclude a frontend only if a human uses one, a database only if state outlives a\nsession, a queue only if work is slow or bursty, an AI layer only if the idea\nneeds generation, extraction, or ranking by meaning. A padded diagram is a worse\nanswer than a small one.\n\nThe sentence naming what it must do well on day one outranks everything else.\nSome component exists specifically to guarantee it — name that component.\n\n────────────────────────────────────────\n2. WRITE project-blueprint/architecture.md\n────────────────────────────────────────\nSections: The Idea (my paragraph) · Components (table, each with ONE plain-English\nsentence saying what it does for THIS project, plus the words that required it) ·\nHow It Fits Together (mermaid flowchart) · Data Flow (numbered walkthrough) ·\nBuild Order (phases, and what each phase proves) · Assumptions (with impact) ·\nWhat This Design Does Not Cover (honest).\n\nMermaid rules: `flowchart TD`. Readable labels, not `DB`. EVERY arrow labelled\nwith the data or action crossing it. `[Rectangle]` services you build,\n`[(Cylinder)]` data stores, `{{Hexagon}}` third parties, `([Stadium])` entry\npoints. Quote any label with a comma or parenthesis. No reserved words as node\nIDs. Verify it parses.\n\n────────────────────────────────────────\n3. BUILD THE KNOWLEDGE BASE (multi-page)\n────────────────────────────────────────\nA small static site under project-blueprint/ — SEPARATE PAGES, not one long\nscroll, so I can open a section, read it, go back to the Command Center, and\nopen the next one:\n\n  index.html          Command Center\n  01-summary.html … 0N-<section>.html   one page per section\n  assets/blueprint.js  the data object\n  assets/site.js       shared rendering, nav, agent\n  assets/site.css      shared styles\n\nCOMMAND CENTER (index.html): a responsive grid of tiles, one per section. Each\ntile has an inline-SVG picture previewing what's inside — a miniature node graph,\nstacked flow steps, phase bars, a coverage grid — drawn from my data, not stock\nart or emoji. Plus the section name, one line of description, and a live count\n(\"11 components\", \"3 deferred\"). The whole tile is the link.\n\nEVERY SECTION PAGE: sticky top nav, a \"← Command Center\" control, breadcrumbs,\nprevious/next section links at the foot, scroll progress, back-to-top, search,\ntheme toggle, print. Keyboard reachable throughout.\n\nONE DATA OBJECT: assets/blueprint.js defines `const BLUEPRINT = {...}` holding\neverything — components, diagram source, flow steps, phases, coverage,\nassumptions. Every page renders from it. If a number appears twice in the source,\nthat's the bug. (Note `const` at top level is NOT a property of window — other\nscripts must reference the bare identifier, not window.BLUEPRINT.)\n\nSEARCH ACROSS THE WHOLE SITE: build one plain-JavaScript index over every field\nof BLUEPRINT — components, flow steps, phases, coverage rows, assumptions, KPIs,\nartifacts — each entry tagged with the section it belongs to. Typing in the nav\nsearch box does two things at once: narrows what's visible on the current page,\nAND drops down ranked matches from every OTHER section, each one a link to the\nright page with the matched words highlighted. Score by term frequency with a\ntitle boost and a whole-phrase bonus; drop stopwords; fall back to a stem match\nso \"components\" finds \"component\". No model, no network, works offline.\n\nDIAGRAMS AND CHARTS: Mermaid for the architecture, the data flow (sequence\ndiagram), and the build order (gantt). Charts only where my idea has real data to\nsupport one — never invent a metric to fill a chart. EVERY diagram and chart has\nan expand control that opens it FULL SCREEN with zoom in / zoom out / reset and\nEsc to close. Every one also carries a one-line plain-English interpretation\nbeneath it: what it means, not what it shows.\n\nILLUSTRATIONS — PICTURES THAT TELL THE STORY: alongside the technical diagrams,\ndraw purpose-built inline-SVG illustrations, generated from BLUEPRINT so they\nstay true when the data changes. Aim for one per section, for example: the whole\nidea as inputs → pipeline → output; the components grouped into layers with the\nreal names placed in them; the steps as a numbered ribbon colour-coded by which\nones the model actually touches; the build phases as a proportional timeline with\nthe make-or-break phase highlighted; coverage as a conditional-formatted grid; the\nopen question as a two-branch fork showing what changes under each answer. Use\ninline SVG only — no stock photography, no icon fonts, no emoji as the main\nvisual, no external image files. They must scale, follow the light/dark theme,\nwork offline, and expand full screen like every other figure.\n\nAI AGENT — TWO MODES, AND THE DEFAULT NEEDS NO KEY: an \"Ask\" panel on every page\nwith a mode switch.\n\n  MODE 1 (default) \"Search — no key\": answers from the same local index as the\n  nav search. No API key, no network, no model. It returns the matching passages\n  as cards, each labelled with its section, snippet highlighted, linking to the\n  page. When nothing matches it says so and points at Coverage, since a miss may\n  itself be the answer. This mode must work with the internet switched off.\n\n  MODE 2 \"Claude — needs key\": I paste my own Anthropic API key (stored in\n  localStorage, never hardcoded), pick a model, and choose scope — this section\n  or the whole blueprint. It answers ONLY from the BLUEPRINT object, which you\n  put in the system prompt, and says so plainly when the blueprint doesn't cover\n  something. Every failure path (bad key, rate limit, blocked request) tells me I\n  can fall back to Search mode. Call the API directly:\n\n  POST https://api.anthropic.com/v1/messages\n  headers: content-type: application/json\n           x-api-key: <the key the user pasted>\n           anthropic-version: 2023-06-01\n           anthropic-dangerous-direct-browser-access: true\n  body:    { model, max_tokens: 16000, system, messages: [{role, content}] }\n\n  Models: claude-opus-5 (default), claude-sonnet-5, claude-haiku-4-5.\n  Send output_config: {effort: \"low\"} on the first two ONLY — Haiku rejects it.\n  Read the reply from data.content, filtering blocks where type === \"text\".\n  Check data.stop_reason === \"refusal\" before reading content.\n  Show a readable error on a bad key, rate limit, or lost connection.\n\nCOLABERRY FORMATTING:\n  background #eef2f6   text  #0f172a   accent #0f766e\n  cards      #ffffff   muted #64748b   borders #e2e8f0\n  radius 10-12px · soft shadows · \"Segoe UI\", system-ui, sans-serif\n  Semantic colors only — green good, amber warning, red risk, blue info,\n  slate neutral. An entity keeps the same color everywhere it appears.\n  Executive and calm, not consumer SaaS. Support a dark theme too.\n\n────────────────────────────────────────\n4. PORTABILITY — THIS RUNS ON MANY MACHINES\n────────────────────────────────────────\nPlain HTML, CSS, and vanilla JS. No build step, no framework, no bundler, no\npackage install, no local server required — opening index.html from disk must\nwork. Classic <script src=\"...\"> only; no ES modules and no fetch() of local\nfiles, both of which browsers block on file:// URLs. Mermaid and Chart.js from\nCDN. No other network calls except the Anthropic one I trigger myself. Nothing\nthat depends on your operating system, your shell, or anything installed here.\n\n────────────────────────────────────────\n5. FINISH\n────────────────────────────────────────\nOpen project-blueprint/index.html in my browser.\n\nWHEN FINISHED, REPORT: the exact path of the saved architecture, the exact path\nof the knowledge base, the component list with one line on why my idea required\neach, what you assumed, the one question that would most change the design, that\nAsk works with no API key in Search mode, and that Mermaid and Chart.js need\ninternet on first load — with an offer to build an offline version."
        },
        "script": "CP1 isn't 'the skill exists' — it's 'the skill fires when I talk like a human.' Test it that way every time or it will bite you in production. This build is bigger than most tests — it produces a whole browsable site — so give it real time to finish before moving on."
      },
      {
        "segment": "guided-build",
        "eyebrow": "✨ You Just Watched This Happen",
        "title": "An idea became a diagram in one pass",
        "body": "A few minutes ago this was a paragraph. Now it is a real architecture with real components and a real diagram — the kind of artifact that used to mean a week with an architect. That is the whole promise of tonight: watch your idea become something you can point at.",
        "bullets": [
          "A paragraph in, a real architecture out",
          "This is the artifact you screenshot for your portfolio",
          "Next: give this architecture a stack it actually deserves"
        ],
        "diagram": "flowchart LR\n  B[\"📝 Before:\\na paragraph\"] -.->|\"a few minutes\"| A[\"📐 After:\\na real architecture\"]",
        "script": "Let this land for a second before moving on. Ask one or two students to read their architecture's component list out loud."
      },
      {
        "segment": "guided-build",
        "eyebrow": "🎨 CP2 — Build tech-stack-recommender",
        "title": "Skill #2: a stack recommendation a non-technical person can actually read",
        "body": "This Skill takes your architecture and recommends real technology for each component — colorful, icon-led, with a fit rating (🟢 great fit, 🟡 good fit, 🔴 consider carefully) instead of a wall of text. Every recommendation gets one plain-English reason, and a ready-to-copy prompt for going deeper on that exact technology later, whenever you're curious.",
        "bullets": [
          "One row per component: pick, fit rating, plain-English why",
          "Icons and color-coded fit ratings, not paragraphs",
          "Ends with a copy-ready 'learn more about X' prompt per technology"
        ],
        "diagram": "flowchart LR\n  ARCH[\"📐 Your architecture\"] --> TSR[\"🎨 tech-stack-recommender\"]\n  TSR --> F1[\"🟢 Great fit\"]\n  TSR --> F2[\"🟡 Good fit\"]\n  TSR --> F3[\"🔴 Consider carefully\"]\n  F1 --> L[\"🔎 Learn-more prompt,\\nper technology\"]\n  F2 --> L\n  F3 --> L",
        "code": {
          "label": "Claude Code prompt — build tech-stack-recommender",
          "code": "Create .claude/skills/tech-stack-recommender/SKILL.md.\n\nDescription: Use when the user has a system architecture and wants a recommended tech stack, explained simply.\n\nBody must: read project-blueprint/architecture.md; for each component recommend one real, current technology; give every recommendation a fit rating using 🟢 great fit / 🟡 good fit / 🔴 consider carefully, based on how well it matches THIS idea's actual scale and needs (not a generic default); explain the 'why' in one plain-English sentence, no jargon without a one-line definition; use icons and short labels, never a wall of text; end each row with a copy-ready prompt the user could paste later to learn more about that specific technology (e.g. 'Explain PostgreSQL to me like I'm new to databases, using my project as the example'); save the result to project-blueprint/tech-stack.md.\n\nWHEN FINISHED, REPORT: the exact path, and the fit-rating breakdown (how many 🟢/🟡/🔴)."
        },
        "script": "When this comes back, do not read it like a spec sheet. Read the fit ratings out loud like a weather report — this is the moment non-technical students realize they can actually follow an architecture conversation."
      },
      {
        "segment": "guided-build",
        "eyebrow": "🧪 Test Automatic Invocation",
        "title": "Ask for a stack in plain English — confirm it reads like a human wrote it",
        "body": "Ask naturally, without naming the Skill. A good result is scannable in ten seconds: icons, color, one line per choice — never a technical essay. Confirm at least one learn-more prompt is copy-ready.",
        "bullets": [
          "Ask naturally — never say 'use tech-stack-recommender'",
          "Scannable in 10 seconds, not a technical essay",
          "This ask also builds a full browsable knowledge base — give it time",
          "At least one learn-more prompt, ready to copy"
        ],
        "diagram": "flowchart LR\n  ASK[\"🗣️ 'what stack should I use?'\"] --> TSR[\"🎨 tech-stack-recommender\"]\n  TSR --> MD[\"📄 tech-stack.md\"]\n  TSR --> KB[\"🌐 project-blueprint/stack/\\nindex.html — a browsable\\nknowledge-base site\"]",
        "code": {
          "label": "Claude Code prompt — test automatic invocation",
          "code": "Given my architecture, what stack should I actually use? Explain it like I might\nnot be technical.\n\nRead project-blueprint/architecture.md first. Everything below is about THAT\nsystem — not a generic web app.\n\n────────────────────────────────────────\n1. RECOMMEND ONE TECHNOLOGY PER COMPONENT\n────────────────────────────────────────\nWalk my architecture's component list in order. For each one, name ONE real,\ncurrent, specific technology — \"PostgreSQL 16\", not \"a database\"; \"React + Vite\",\nnot \"a frontend framework\". Use my architecture's own component names so I can\nline the two documents up side by side.\n\nThen add any technology my DATA FLOW clearly needs that the component list never\nnamed — text extraction, PDF rendering, hosting. Mark those as a separate group\nso I can see they came from the flow, not the component list.\n\n────────────────────────────────────────\n2. RATE THE FIT — AND MEAN IT\n────────────────────────────────────────\nEvery recommendation gets one of:\n\n  🟢 great fit          — matches this project's size and needs; pick it, move on\n  🟡 good fit           — works, but there is a real caveat I should read first\n  🔴 consider carefully — where this plan is most likely to hurt me\n\nRate against MY project's actual scale and constraints — how much traffic, how\nmany people building it, what kind of data — not against what is popular. A\ntechnology can be excellent and still be 🔴 here.\n\nIf everything comes back 🟢, you have not thought hard enough. Say plainly which\nchoices you are least confident about and why.\n\n────────────────────────────────────────\n3. EXPLAIN IT TO SOMEONE NON-TECHNICAL\n────────────────────────────────────────\nEach recommendation gets ONE plain-English sentence saying why it fits MY project.\nNo jargon unless you define it in the same breath, in five words or fewer —\n\"TypeScript, which checks your code's shapes before it runs\".\n\nIcons and short labels, never a wall of text. If a row needs a caveat, put it in\nits own short block labelled so I cannot miss it — don't bury it in the sentence.\n\n────────────────────────────────────────\n4. GIVE ME A PROMPT I CAN PASTE LATER\n────────────────────────────────────────\nEnd every recommendation with a copy-ready prompt I can paste into Claude to learn\nthat one technology properly. Each must already name my project so the answer is\nabout my system, not a textbook. For example:\n\n  \"Explain PostgreSQL to me like I'm new to databases, using my <project> as the\n   example. What tables would I actually have?\"\n\n────────────────────────────────────────\n5. WRITE project-blueprint/tech-stack.md\n────────────────────────────────────────\nSections: the fit-rating key and what a rating means · a one-paragraph headline\nnaming where this stack is most likely to break · the recommendations grouped\n(things a person touches / things you write / things you store / things you depend\non / things the data flow needs) · every copy-ready prompt collected in one table ·\nwhat to learn first, in order · alternatives considered and why not · how hard each\ndecision is to undo · what this document does NOT tell me.\n\n────────────────────────────────────────\n6. BUILD THE KNOWLEDGE BASE (multi-page)\n────────────────────────────────────────\nSame shape as my architecture knowledge base, under project-blueprint/stack/ so\nthe two sit side by side:\n\n  index.html           Command Center\n  01-summary.html … 08-appendix.html    one page per section\n  assets/stack.js      the data object\n  assets/site.js       shared rendering, nav, search, agent\n  assets/site.css      shared styles\n\nCOMMAND CENTER: a responsive grid of tiles, one per section, each with an inline-SVG\npicture previewing what's inside and a live count pulled from the data (\"14\nrecommendations\", \"2 to watch\"). The whole tile is the link.\n\nEVERY SECTION PAGE: sticky nav, \"← Command Center\", breadcrumbs, previous/next at\nthe foot, scroll progress, back-to-top, search, theme toggle, print.\n\nONE DATA OBJECT: assets/stack.js defines `const STACK = {...}` holding every\nrecommendation, rating, caveat, prompt, alternative and decision. Every page renders\nfrom it. Nothing typed twice. (Note `const` at top level is NOT a window property —\nother scripts must reference the bare identifier.)\n\nSEARCH ACROSS THE WHOLE SITE: one plain-JavaScript index over every field of STACK,\neach entry tagged with its section. The nav box narrows the current page AND drops\ndown ranked matches from every other section, linked and highlighted. No model, no\nnetwork, works offline.\n\nCOPY BUTTONS: every copy-ready prompt gets a working copy-to-clipboard button that\nconfirms it copied. Use navigator.clipboard with a textarea + execCommand fallback,\nbecause the clipboard API is often blocked on file:// URLs.\n\nILLUSTRATIONS: inline SVG generated from STACK — the whole stack as bands coloured\nby fit rating; a proportional bar of 🟢/🟡/🔴 with the reds called out; a topology\nshowing what runs on my machine versus somebody else's; a learning ladder; a lock-in\nscale. No stock art, no icon fonts, no external images. Every figure expands FULL\nSCREEN with zoom in / out / reset and Esc. Never draw two labels at the same\ncoordinate — offset every repeated element by its index.\n\nAI AGENT — TWO MODES, DEFAULT NEEDS NO KEY:\n  MODE 1 (default) \"Search — no key\": answers from the local index, returns matching\n  passages as linked cards. No key, no network, works offline.\n  MODE 2 \"Claude — needs key\": my own Anthropic API key in localStorage, model and\n  scope pickers, answers ONLY from STACK and says so when something isn't covered.\n  Tell it never to talk me out of a 🔴 rating. Every failure path points back to\n  Search mode. Call the API directly:\n\n  POST https://api.anthropic.com/v1/messages\n  headers: content-type: application/json\n           x-api-key: <the key the user pasted>\n           anthropic-version: 2023-06-01\n           anthropic-dangerous-direct-browser-access: true\n  body:    { model, max_tokens: 16000, system, messages: [{role, content}] }\n\n  Models: claude-opus-5 (default), claude-sonnet-5, claude-haiku-4-5.\n  Send output_config: {effort: \"low\"} on the first two ONLY — Haiku rejects it.\n  Read the reply from data.content where type === \"text\".\n  Check data.stop_reason === \"refusal\" before reading content.\n\nCOLABERRY FORMATTING:\n  background #eef2f6   text  #0f172a   accent #0f766e\n  cards      #ffffff   muted #64748b   borders #e2e8f0\n  radius 10-12px · soft shadows · \"Segoe UI\", system-ui, sans-serif\n  Fit ratings map to the semantic colours: 🟢 green, 🟡 amber, 🔴 red — and a\n  technology keeps its rating colour everywhere it appears. Support a dark theme.\n  Keep nav labels short enough that eight of them fit on one line.\n\n────────────────────────────────────────\n7. PORTABILITY — THIS RUNS ON MANY MACHINES\n────────────────────────────────────────\nPlain HTML, CSS, vanilla JS. No build step, no framework, no install, no server —\nopening index.html from disk must work. Classic <script src=\"...\"> only; no ES\nmodules and no fetch() of local files, both blocked on file:// URLs. No CDN needed\nat all: draw every figure as inline SVG rather than pulling in a chart library.\n\n────────────────────────────────────────\n8. FINISH\n────────────────────────────────────────\nOpen project-blueprint/stack/index.html in my browser.\n\nWHEN FINISHED, REPORT: the exact path of the saved recommendation, the exact path of\nthe knowledge base, the fit-rating breakdown (how many 🟢 / 🟡 / 🔴), which\nrecommendations you were least confident about, and confirmation that every\ncomponent in my architecture has a row."
        },
        "script": "If a non-technical student in the room can read the output and nod along, the Skill did its job. This build also produces a full browsable knowledge base under project-blueprint/stack/ — give it real time to finish before moving on."
      },
      {
        "segment": "guided-build",
        "eyebrow": "✨ Your Stack Isn't Generic Anymore",
        "title": "Every pick is justified against YOUR idea, not a template",
        "body": "A generic stack recommendation says 'use React and Postgres' for everything. Yours says why — tied to your idea's actual scale, actual users, actual day-one job. That difference is the entire point of grounding the Skill in your real architecture file instead of a canned answer.",
        "bullets": [
          "Generic: one stack for every idea",
          "Yours: justified against your architecture, component by component",
          "Next: turn this into something you can actually show someone"
        ],
        "diagram": "flowchart LR\n  G[\"📋 Generic stack:\\nsame answer for everyone\"] -.->|\"vs.\"| Y[\"🎯 Your stack:\\njustified per component\"]",
        "script": "Ask one student to say their #1 fit-rated pick out loud and the one-line reason. That reason is the proof this wasn't a canned response."
      },
      {
        "segment": "guided-build",
        "eyebrow": "🚀 CP3 — Build + Scope mvp-scoper",
        "title": "Skill #3: not just a plan — a demo you can actually show someone",
        "body": "This is the payoff Skill, and it is multi-file on purpose. It produces three real things: a scoped Week-1 task list, a genuine visual HTML mockup of what the idea could look like, and a short marketing one-pager as a real, formatted PDF — who needs this, what it does, why it matters — so a friend, a mentor, or a recruiter can understand the idea in ten seconds. Scoped to Read, Write, and Bash: the first two write the plan and the mockup, Bash is what actually turns the one-pager into a real PDF.",
        "bullets": [
          "Week-1 plan: the smallest real thing that proves this idea works",
          "A real, visual mockup.html — open it in a browser, it looks like a product",
          "A one-pager: who it's for, what it does, why it matters — as a real PDF",
          "allowed-tools: Read, Write, Bash — Bash only to generate the PDF"
        ],
        "diagram": "flowchart LR\n  ARCH[\"📐 Architecture + 🎨 stack\"] --> MVP[\"🚀 mvp-scoper\"]\n  MVP --> W1[\"✅ Week-1 task list\"]\n  MVP --> VIS[\"🖼️ Visual HTML mockup\"]\n  MVP --> MKT[\"📄 One-pager PDF\"]",
        "code": {
          "label": "Claude Code prompt — build + scope mvp-scoper",
          "code": "Create .claude/skills/mvp-scoper/SKILL.md and .claude/skills/mvp-scoper/template.md.\n\nDescription: Use when the user wants to know what to build first, see what their idea could look like, and get a short pitch for it.\n\nBody must produce THREE files in project-blueprint/:\n1. mvp-plan.md — the smallest real slice to build in Week 1 that proves the idea works, as a short checklist, grounded in architecture.md and tech-stack.md.\n2. mockup.html — a real, self-contained, visually appealing static HTML+CSS mockup of the idea's main screen (a landing page or the core app view) — actual layout, actual sample content for THIS idea, not lorem ipsum, not a wireframe of boxes. Use color, icons, and real-feeling copy.\n3. one-pager.pdf — a short marketing one-pager, as a real single-page PDF: what it does, who needs it, one sentence on why it matters, using icons and short punchy lines, not a technical description. Generate it with whatever PDF tool is available (headless-Chrome print-to-PDF, a Python library such as reportlab, or a Node library such as puppeteer) — never save it as a renamed .md or .html file.\n\nUse template.md to keep mvp-plan.md's structure consistent every time.\n\nAdd allowed-tools: Read, Write, Bash to the frontmatter — Read and Write cover the plan and the mockup; Bash is scoped narrowly to whatever single command actually generates the PDF, nothing broader.\n\nDo not commit yet.\n\nWHEN FINISHED, REPORT: every file created, its exact path, one line on what each contains, and which tool generated the PDF."
        },
        "script": "This is the big one. When mockup.html is ready, open it in an actual browser on the projector before you do anything else — let the room see it."
      },
      {
        "segment": "guided-build",
        "eyebrow": "🧪 Test + Demo the Full Blueprint",
        "title": "Test mvp-scoper — open the mockup, open the PDF one-pager",
        "body": "Confirm mvp-scoper fires naturally. This one Skill reads what system-architect and tech-stack-recommender already produced — it does not re-run them. Then do the thing that makes tonight land: open mockup.html, and open the real one-page PDF it generated. This is the moment a rough paragraph becomes something a student would screenshot and send to a friend.",
        "bullets": [
          "Ask naturally — confirm mvp-scoper auto-fires",
          "Reads architecture.md + tech-stack.md — never regenerates them",
          "Open mockup.html in an actual browser",
          "Open one-pager.pdf — a real PDF, not a markdown file",
          "This ask also builds a full browsable knowledge base — give it time"
        ],
        "diagram": "flowchart LR\n  RUN[\"🗣️ 'show me what this could\\nlook like, and how to pitch it'\"] --> MVP[\"🚀 mvp-scoper\\n(should auto-fire, reads-only\\narchitecture.md + tech-stack.md)\"]\n  MVP --> OPEN[\"🌐 mockup.html\\nin your browser\"]\n  MVP --> PDF[\"📄 one-pager.pdf\\na real PDF\"]\n  MVP --> KB[\"🌐 project-blueprint/mvp/\\nindex.html — a browsable\\nknowledge-base site\"]",
        "code": {
          "label": "Claude Code prompt — test + demo",
          "code": "Given my architecture and stack, what should I build first, what could this look\nlike, and how would I pitch it to someone?\n\n────────────────────────────────────────\n0. READ FIRST — DO NOT REGENERATE\n────────────────────────────────────────\nRead project-blueprint/architecture.md and project-blueprint/tech-stack.md.\n\nBoth already exist. Do not rebuild, re-derive or overwrite either one — this run\nonly adds the MVP stage on top of them. If either file is missing, stop and tell\nme which one, rather than inventing it.\n\n────────────────────────────────────────\n1. WRITE project-blueprint/mvp-plan.md\n────────────────────────────────────────\nThe smallest real slice I could build in WEEK 1 — five working days — that\ngenuinely tests whether the idea works.\n\nThe whole discipline here is SUBTRACTION. Start from my architecture's component\nlist and cut until only the risky part is left. Expect to delete most of it. A\nWeek 1 plan containing auth, a queue, a database and a deploy pipeline is not a\nWeek 1 plan — it is week one of a six-month project, and it proves nothing by\nFriday.\n\nSections, in this order:\n\n  • The one question Week 1 answers — one sentence. Not \"build the app\": the\n    single risky assumption that, if wrong, means nothing else is worth building.\n  • What you are building — 3 to 6 items, each naming the architecture component\n    it came from.\n  • What you are NOT building, and why that's safe — a table, one row per cut,\n    each saying what it would prove and why that isn't this week's question.\n    This table should be LONGER than the one above.\n  • The stack, cut down to Week 1 — what I actually use this week versus the\n    fuller recommendation in tech-stack.md.\n  • Five days — Monday to Friday as a checklist. Each day names an OUTCOME, not\n    an activity: \"gap list renders from a real résumé\", not \"work on extraction\".\n    Friday is putting it in front of a real person.\n  • What \"it worked\" looks like — a specific, checkable bar somebody else could\n    apply without me in the room. A number or a yes/no, never \"it feels good\".\n  • What \"it didn't work\" looks like — equally specific. Name the failure you\n    actually expect.\n  • What you'll know on Friday, and what to do about it — a table with three\n    outcomes (pass / partial / fail) and the next move for each. The fail branch\n    must be allowed to say \"stop and reconsider the product\".\n  • What Week 1 deliberately proves nothing about — so nobody over-reads a good\n    result.\n\n────────────────────────────────────────\n2. WRITE project-blueprint/mockup.html\n────────────────────────────────────────\nA real, self-contained, visually appealing static HTML + CSS mockup of my idea's\nMAIN SCREEN — the landing page or the core app view, whichever better sells it.\n\n  • REAL SAMPLE CONTENT for THIS idea. Actual names, actual numbers, actual copy\n    somebody would really see on that screen. Never lorem ipsum. Never\n    \"Feature 1 / Feature 2\". Never [placeholder].\n  • A DESIGNED SCREEN, NOT A WIREFRAME. Colour, icons, hierarchy, spacing, real\n    buttons. Grey boxes with labels on them is a failure.\n  • Show the PRODUCT, not the architecture. No boxes-and-arrows diagrams here.\n  • One file. Inline CSS and inline SVG icons only — no CDN, no external images,\n    no script tags. It must open from disk.\n  • If the idea involves people's data, make the sample data obviously fictional\n    and say so in a footer line.\n\n────────────────────────────────────────\n3. WRITE project-blueprint/one-pager.pdf\n────────────────────────────────────────\nA short marketing one-pager, formatted as a real, single-page PDF: what it does,\nwho needs it, and one sentence on why it matters.\n\nBuild it as a genuine PDF file, not a renamed HTML file. Use whatever PDF\ngeneration is actually available on this machine — a headless-Chrome\nprint-to-PDF command, a Python library such as reportlab or weasyprint, or a Node\nlibrary such as puppeteer — in that order of preference. If none is available,\ninstall the lightest one that needs no compiler (prefer reportlab or similar)\nrather than leaving this as an HTML file. State which tool you used.\n\nIcons and short punchy lines, plenty of white space, one page, print-ready\nmargins. Written for a dean, a funder, or a colleague in a hallway.\n\nNO technical description: no component names, no technology names, no\narchitecture, no jargon at all. If a claim uses a number, say plainly whether it\nis measured or estimated.\n\n────────────────────────────────────────\n4. BUILD THE KNOWLEDGE BASE (multi-page)\n────────────────────────────────────────\nSame shape as my architecture and stack knowledge bases, under\nproject-blueprint/mvp/ so all three sit side by side:\n\n  index.html           Command Center\n  01-…html … 0N-…html  one page per section\n  assets/mvp.js        the data object\n  assets/site.js       shared rendering, nav, search, agent\n  assets/site.css      shared styles\n\nSections should cover: the bet · the five days · what's cut · the mockup · the\npitch · did it work · appendix.\n\nCOMMAND CENTER: a responsive grid of tiles, one per section, each with an\ninline-SVG picture previewing what's inside and a live count pulled from the data\n(\"10 cuts\", \"3 outcomes\"). The whole tile is the link.\n\nEVERY SECTION PAGE: sticky nav, \"← Command Center\", breadcrumbs, previous/next at\nthe foot, scroll progress, back-to-top, search, theme toggle, print.\n\nONE DATA OBJECT: assets/mvp.js defines `const MVP = {...}` holding the question,\nwhat's kept, every cut, the five days, the pass and fail bars, the outcomes and\nthe pitch. Every page renders from it. Nothing typed twice. (Note `const` at top\nlevel is NOT a property of window — other scripts must reference the bare\nidentifier.)\n\nSEARCH ACROSS THE WHOLE SITE: one plain-JavaScript index over every field of MVP,\neach entry tagged with its section. The nav box narrows the current page AND drops\ndown ranked matches from every other section, linked and highlighted. No model, no\nnetwork, works offline.\n\nTHE MOCKUP PAGE: link OUT to mockup.html with a large, obvious button — do NOT\nembed it in an iframe, because browsers block file:// iframes and it will render\nas a blank panel. Alongside the button, draw an inline-SVG schematic of the screen\nlayout and list the handful of things worth noticing on it.\n\nTHE PITCH PAGE: link OUT to one-pager.pdf the same way — a large, obvious button,\nnever embedded (file:// PDF embeds are just as unreliable as iframes). Summarise\nthe one-pager's actual content on the page itself so the section is still useful\nwithout opening the PDF.\n\nILLUSTRATIONS: inline SVG generated from MVP — the whole week as inputs → one\nscreen → one person's verdict; the five days as a strip; kept versus deleted; the\nFriday decision as a three-way fork. No stock art, no icon fonts, no external\nimages. Every figure expands FULL SCREEN with zoom in / out / reset and Esc.\nNever draw two labels at the same coordinate — offset every repeated element by\nits index. Keep nav labels short enough that they all fit on one line.\n\nAI AGENT — TWO MODES, DEFAULT NEEDS NO KEY:\n  MODE 1 (default) \"Search — no key\": answers from the local index, returns\n  matching passages as linked cards. No key, no network, works offline.\n  MODE 2 \"Claude — needs key\": my own Anthropic API key in localStorage, model and\n  scope pickers, answers ONLY from MVP. Tell it to protect the plan's discipline —\n  never suggest adding back something the plan deliberately cut unless I ask what\n  it would cost. Every failure path points back to Search mode. Call the API\n  directly:\n\n  POST https://api.anthropic.com/v1/messages\n  headers: content-type: application/json\n           x-api-key: <the key the user pasted>\n           anthropic-version: 2023-06-01\n           anthropic-dangerous-direct-browser-access: true\n  body:    { model, max_tokens: 16000, system, messages: [{role, content}] }\n\n  Models: claude-opus-5 (default), claude-sonnet-5, claude-haiku-4-5.\n  Send output_config: {effort: \"low\"} on the first two ONLY — Haiku rejects it.\n  Read the reply from data.content where type === \"text\".\n  Check data.stop_reason === \"refusal\" before reading content.\n\nCOLABERRY FORMATTING (mockup and knowledge base alike):\n  background #eef2f6   text  #0f172a   accent #0f766e\n  cards      #ffffff   muted #64748b   borders #e2e8f0\n  radius 10-12px · soft shadows · \"Segoe UI\", system-ui, sans-serif\n  Semantic colours only — green good, amber warning, red risk, blue info, slate\n  neutral. Support a dark theme in the knowledge base.\n\n────────────────────────────────────────\n5. PORTABILITY — THIS RUNS ON MANY MACHINES\n────────────────────────────────────────\nPlain HTML, CSS, vanilla JS. No build step, no framework, no install, no server —\nopening index.html and mockup.html from disk must work. Classic <script src=\"...\">\nonly; no ES modules and no fetch() of local files, both blocked on file:// URLs.\nNo CDN at all: draw every figure as inline SVG rather than pulling in a library.\n\nDo not commit anything.\n\n────────────────────────────────────────\n6. FINISH\n────────────────────────────────────────\nOpen project-blueprint/mockup.html in my browser, then\nproject-blueprint/mvp/index.html, then open project-blueprint/one-pager.pdf in my\ndefault PDF viewer.\n\nWHEN FINISHED, REPORT: whether mvp-scoper was invoked automatically, the exact\npaths of mvp-plan.md, mockup.html and one-pager.pdf with one line on what each\ncontains, which tool generated the PDF, the exact path of the knowledge base, how\nmany architecture components you kept versus cut, and confirmation that you did\nnot modify architecture.md or tech-stack.md."
        },
        "script": "This is the room-energy moment. Walk around while mockups open on screens — this is the closest thing tonight has to magic, and it should feel like it. This build also produces a full browsable knowledge base under project-blueprint/mvp/ — give it real time to finish before moving on."
      },
      {
        "segment": "guided-build",
        "eyebrow": "📦 Your Idea's Blueprint",
        "title": "Three Skills, one committed folder: diagram, stack, and a demo",
        "body": "Commit .claude/skills/ and project-blueprint/ together. Anyone who pulls your repo — a mentor, a teammate, future you — gets the architecture, the justified stack, the Week-1 plan, and the visual mockup, generated from one paragraph you wrote an hour ago.",
        "diagram": "flowchart LR\n  SA[\"🏗️ system-architect\"] --> BP[\"📦 Your Blueprint\"]\n  TSR[\"🎨 tech-stack-recommender\"] --> BP\n  MVP[\"🚀 mvp-scoper\"] --> BP\n  BP --> DEMO[\"🎬 Demo it tonight\"]",
        "code": {
          "label": "Commit the blueprint",
          "code": "git add .claude/skills project-blueprint\ngit commit -m \"feat(blueprint): system-architect, tech-stack-recommender, mvp-scoper\""
        },
        "script": "Before the break, have two or three students share their mockup on screen. This is worth the two minutes it costs."
      },
      {
        "segment": "failure",
        "eyebrow": "💾 The Failure Nobody Warns You About",
        "title": "Your blueprint has one copy — and it lives on the one laptop in this room most likely to have a bad day",
        "body": "Everything built tonight — the architecture, the stack, the mockup, the PDF — exists in exactly one place right now: this machine. No error message is coming to warn you. A crashed drive, a reformatted laptop, or one careless git checkout can erase an hour of real work in a single command, and it will look identical to success until the moment it does not. The fix is not more caution. It is a habit, and the habit is git.",
        "bullets": [
          "Everything tonight lives in ONE place: this laptop",
          "No warning, no error — it just quietly stays unsaved",
          "The fix isn't caution. It's a habit: commit early, commit often"
        ],
        "diagram": "flowchart LR\n  A[\"🖥️ Laptop only\\n(tonight, right now)\"] -.->|\"one bad day\"| B[\"💥 Gone\"]\n  A -->|\"git commit\"| C[\"📸 Saved snapshot\"]\n  C --> D[\"🛡️ Survives a crash,\\na reformat, a bad checkout\"]",
        "script": "This is the real failure tonight teaches — not a Skill bug, a saving bug. Ask the room: whose blueprint currently exists in exactly one place? Every hand should go up."
      },
      {
        "segment": "failure",
        "eyebrow": "📸 Git Basics: status → add → commit → log",
        "title": "Four commands. That is the entire lesson.",
        "body": "git status shows what changed since your last save point. git add stages exactly the files you want captured. git commit -m saves a permanent, named snapshot you can always return to. git log --oneline is your proof — a timestamped, ordered record that you actually built this, tonight. Run all four right now, on the blueprint you just built.",
        "bullets": [
          "git status — what changed since your last commit",
          "git add <path> — stage exactly what you want saved",
          "git commit -m \"message\" — a permanent, named snapshot",
          "git log --oneline — the proof, in order, that you built this"
        ],
        "diagram": "flowchart LR\n  S[\"🔍 git status\\nwhat changed?\"] --> Ad[\"➕ git add\\nstage it\"]\n  Ad --> C[\"📸 git commit\\nsave it, named\"]\n  C --> L[\"📜 git log\\nyour proof, in order\"]",
        "code": {
          "label": "Run this now — commit tonight's blueprint",
          "code": "git status\n\ngit add .claude/skills project-blueprint\n\ngit commit -m \"feat(blueprint): system-architect, tech-stack-recommender, mvp-scoper\"\n\ngit log --oneline -5"
        },
        "script": "Run these four live, on your own machine, in order. When git log prints your commit, that line is the first real entry in your capstone's paper trail — point at it and say so."
      },
      {
        "segment": "failure",
        "eyebrow": "🧰 Repo-less Setup",
        "title": "Get everything else ready — before you even have a live GitHub repo",
        "body": "Most of you have not created your capstone's actual GitHub repository yet, and that is fine — that comes later in the program. But real, valuable setup work does not need to wait for a remote to exist: a README that explains what a stranger is looking at, and a .gitignore that keeps noise out of every future commit. Both are 100% local, both take two minutes, and both mean you look and act like someone who ships professionally the moment a remote does exist.",
        "bullets": [
          "A README.md explaining what's in project-blueprint/ — future you (and a recruiter) will thank you",
          "A .gitignore so Skill outputs never accidentally track junk (node_modules, .env, OS files)",
          "git log --oneline is your own proof-of-work ledger — screenshot it for your portfolio",
          "None of this needs a GitHub repo yet — all of it is fully local"
        ],
        "diagram": "flowchart LR\n  L[\"💻 Local repo\\n(already have it)\"] --> R[\"📄 README.md\"]\n  L --> G[\"🚫 .gitignore\"]\n  R --> P[\"✅ Ready to push\\nthe moment a remote exists\"]\n  G --> P",
        "code": {
          "label": "Claude Code prompt — draft README + .gitignore",
          "code": "Look at what is currently in .claude/skills/ and project-blueprint/.\n\nCreate a README.md at the project root that explains, for someone who has never seen this project before: what the idea is, what the three Skills do (system-architect, tech-stack-recommender, mvp-scoper), and the exact prompt pattern to re-run them if the blueprint ever needs to be regenerated.\n\nCreate a .gitignore appropriate for a Node + Claude Code project if one does not already exist: node_modules, .env, .DS_Store, and any local build output. Never list an actual .env file's contents — only ignore the filename.\n\nDo not commit anything yet — just create the two files.\n\nWHEN FINISHED, REPORT: the exact path of each file created, and confirm the .gitignore excludes .env without ever printing what is inside it."
        },
        "script": "This is the last mile. You don't need a live GitHub repo tonight to look like someone who ships professionally — you need a README, a .gitignore, and the habit you just practiced. Close by pointing at git log one more time: that is tonight's real deliverable, not just the blueprint."
      }
    ]
  },
  "3": {
    "monday": [
      {
        "segment": "business-problem",
        "eyebrow": "🕒 The 2am problem",
        "title": "A chat window cannot run your business at 2am",
        "body": "Everything you have done so far lives inside a chat box with a human driving every turn. That is fine for exploration, but a business process runs on its own: a ticket lands, an invoice arrives, an order needs checking, and nobody is watching. The Claude API is how a conversation becomes a program: authenticated, repeatable, and callable from code you schedule. This week you cross the line from talking to Claude to building software that uses Claude.",
        "bullets": [
          "Chat = human-in-the-loop, one conversation at a time",
          "API = unattended, authenticated, runs on a schedule or a webhook",
          "Same model, but now your code is the driver"
        ],
        "script": "Open by asking: 'What happens to your workflow when you close the laptop?' Let them sit with it, then frame the week as turning a conversation into a program."
      },
      {
        "segment": "business-problem",
        "eyebrow": "💸 The copy-paste tax",
        "title": "Where the money leaks: humans routing text between tools",
        "body": "Pick almost any team and you will find someone reading an inbound message, deciding what it is, looking something up in another system, and typing a reply. Support triage, invoice extraction, lead qualification, and status lookups are all the same shape: read, decide, fetch, respond. Each one is slow, inconsistent, and only runs during business hours. A Workflow Assistant automates exactly one of these end to end, and one is enough to prove the pattern for your whole company.",
        "bullets": [
          "The pattern: read -> classify -> look something up -> respond",
          "Cost is hidden in minutes-per-item times thousands of items",
          "Automate ONE workflow well before you touch a second"
        ],
        "script": "Have each student name one real 'read-decide-fetch-respond' task from their own job. That named task is the one they will automate on Thursday."
      },
      {
        "segment": "business-problem",
        "eyebrow": "🎯 Intensive 1 capstone",
        "title": "You ship a Workflow Assistant, not another demo",
        "body": "Your deliverable is a small program that automates one real workflow: it takes an input, reasons about it, calls a tool to fetch real data, and returns a structured result your downstream code can trust. It closes Intensive 1 alongside your AI environment and your Skills library. The bar is not 'it worked once in front of the class' — it is that it survives being broken, because a demo that has never failed is a demo you do not understand yet.",
        "bullets": [
          "Input -> reason -> call tools -> structured result",
          "Success = tool use + structured output + a real eval",
          "Proof = a demo video of it automating a real task"
        ],
        "script": "Set the standard explicitly: a working assistant, a structured output, and an eval that scores it. 'Worked once' is not done."
      },
      {
        "segment": "architecture",
        "eyebrow": "🔑 Auth & the client",
        "title": "It is all one endpoint: POST /v1/messages",
        "body": "The whole Claude API is essentially one endpoint — you send messages, you get a message back. The SDK wraps it in a client object that reads your key from the ANTHROPIC_API_KEY environment variable, so your code never contains the secret. That single rule — key in the environment, never in source — is the most important thing you learn this week, because a key committed to git is a key you must treat as already stolen. Tools, structured output, and streaming are all just features of this one call, not separate APIs.",
        "code": {
          "label": "The client reads the key from the environment",
          "code": "import anthropic\n\n# Reads ANTHROPIC_API_KEY from the environment. No key in source, ever.\nclient = anthropic.Anthropic()\n\nresp = client.messages.create(\n    model=\"claude-opus-4-8\",\n    max_tokens=1024,\n    messages=[{\"role\": \"user\", \"content\": \"Say hello in one sentence.\"}],\n)\nprint(next(b.text for b in resp.content if b.type == \"text\"))"
        },
        "script": "Show the bare client with no arguments and stress that the key lives in the environment. Say the sentence out loud: 'A key in source is a compromised key.'"
      },
      {
        "segment": "architecture",
        "eyebrow": "💬 Messages & roles",
        "title": "The API is stateless: you resend the whole conversation every time",
        "body": "There is no server-side memory. Each request carries the full list of messages — alternating user and assistant turns — and Claude replies based only on what you sent. A system prompt sits above the conversation and sets the assistant's role and rules. max_tokens is required and caps the reply length. To hold a multi-turn conversation you append Claude's response to your list and send it back next time; forget to append and the assistant has amnesia.",
        "bullets": [
          "system = the standing instructions; messages = the transcript",
          "First message must be role 'user'; you resend history each call",
          "max_tokens is a hard cap — set it high enough to finish"
        ],
        "code": {
          "label": "System prompt + a growing message list",
          "code": "messages = [{\"role\": \"user\", \"content\": \"Where is order ORD-4471?\"}]\n\nresp = client.messages.create(\n    model=\"claude-opus-4-8\",\n    max_tokens=1024,\n    system=\"You are a support-triage assistant. Be terse and factual.\",\n    messages=messages,\n)\n\n# Keep the conversation alive by appending Claude's turn back onto the list\nmessages.append({\"role\": \"assistant\", \"content\": resp.content})"
        },
        "script": "Draw the message list on the board and physically append the assistant turn. Emphasize: the API remembers nothing — your list is the memory."
      },
      {
        "segment": "architecture",
        "eyebrow": "🌊 Streaming",
        "title": "Stream long calls so your process does not hang",
        "body": "A non-streaming request holds the connection open until the entire reply is generated. For long outputs that can exceed the SDK's HTTP timeout and your program simply hangs. Streaming sends tokens as they are produced, so the connection stays alive and you can show progress. Even when you do not need to render token-by-token, streaming with get_final_message gives you timeout protection for free — treat it as the default for anything with a large max_tokens.",
        "bullets": [
          "Long output + no streaming = SDK timeout risk",
          "stream.text_stream yields tokens as they arrive",
          "get_final_message() gives you the complete reply when done"
        ],
        "code": {
          "label": "Stream and still get the whole message",
          "code": "with client.messages.stream(\n    model=\"claude-opus-4-8\",\n    max_tokens=4096,\n    messages=[{\"role\": \"user\", \"content\": \"Draft a reply to this ticket...\"}],\n) as stream:\n    for text in stream.text_stream:\n        print(text, end=\"\", flush=True)\n    final = stream.get_final_message()   # full Message object, timeout-safe"
        },
        "script": "Explain the failure mode first (the hang), then the fix. 'Streaming is not just for pretty typing effects — it keeps your program from timing out.'"
      },
      {
        "segment": "architecture",
        "eyebrow": "📦 Structured output",
        "title": "Stop parsing prose — demand JSON and validate it",
        "body": "If your assistant returns a friendly paragraph, your downstream code has to guess where the order number is. That guessing is where production breaks. Structured output constrains Claude's reply to a JSON schema you define, so the shape is guaranteed. The recommended path in Python is messages.parse with a Pydantic model — you get back a validated object, not a string you hope parses. Hope is not a parsing strategy; a schema is.",
        "bullets": [
          "Define the shape once as a schema or Pydantic model",
          "parse() returns a validated object via parsed_output",
          "Validate at the boundary — reject malformed shapes loudly"
        ],
        "code": {
          "label": "A schema you can trust downstream",
          "code": "from pydantic import BaseModel\n\nclass Triage(BaseModel):\n    category: str          # shipping | billing | technical | other\n    urgency: str           # low | normal | high\n    order_id: str | None\n    suggested_reply: str\n\nresp = client.messages.parse(\n    model=\"claude-opus-4-8\",\n    max_tokens=1024,\n    messages=[{\"role\": \"user\", \"content\": \"Where is my order ORD-4471?!\"}],\n    output_format=Triage,\n)\ntriage = resp.parsed_output      # a validated Triage instance"
        },
        "script": "Contrast a prose reply with a typed object. Ask: 'Which of these can your next function actually rely on?' The answer sells structured output."
      },
      {
        "segment": "architecture",
        "eyebrow": "🛠️ Tool use",
        "title": "Tools turn talk into action",
        "body": "A model on its own can reason about an order but cannot look it up. Tool use fixes that: you describe a tool with a JSON input schema, and when Claude wants to use it, the reply comes back with stop_reason 'tool_use' and a tool_use block containing the arguments. Your code executes the real function, sends the result back as a tool_result block keyed by tool_use_id, and Claude continues. Claude never runs your code — it asks, you execute, you return the answer, it reasons on.",
        "bullets": [
          "You define the schema; Claude decides when to call it",
          "stop_reason == 'tool_use' means: run the tool, then continue",
          "One assistant turn can request several tools — return all results together"
        ],
        "code": {
          "label": "A tool is a name, a description, and an input schema",
          "code": "tools = [{\n    \"name\": \"lookup_order\",\n    \"description\": \"Look up an order by ID. Returns status, carrier, and ETA.\",\n    \"input_schema\": {\n        \"type\": \"object\",\n        \"properties\": {\n            \"order_id\": {\"type\": \"string\", \"description\": \"Order ID, e.g. ORD-4471\"}\n        },\n        \"required\": [\"order_id\"],\n    },\n}]"
        },
        "script": "Walk the round-trip on the board: Claude asks -> you run -> you return -> Claude reasons. Stress that Claude never executes anything itself."
      },
      {
        "segment": "deconstruct",
        "eyebrow": "🔍 Anatomy of a demo",
        "title": "It works in the demo. Then production happens.",
        "body": "Here is an assistant a student built last cohort: it read a ticket, called a lookup tool, and printed a nice reply. In the demo it was flawless. We are going to trace exactly that happy path, then follow the same code into production where the inputs are messier and nobody is watching. The point is not that the code is bad — it is that untested code hides its failure modes until the worst possible moment.",
        "bullets": [
          "Happy path: clean input, tool returns, model replies",
          "The demo proves it CAN work, not that it WILL",
          "Every hidden assumption is a future 2am page"
        ],
        "script": "Read the happy-path code aloud and let it look good. Then say: 'Now let's send it the inputs a real customer sends,' and pivot to the failures."
      },
      {
        "segment": "deconstruct",
        "eyebrow": "☠️ Silent failures",
        "title": "Three ways this quietly breaks in production",
        "body": "First, the model sometimes returns a chatty paragraph instead of the JSON your parser expects, and the code crashes or, worse, extracts the wrong field. Second, the tool loop has no limit, so a confused model can call the same tool forever, burning tokens and money with no brake. Third, there is no eval, so when you tweak the prompt next week you have no way to know you made it worse. These are the exact three risk areas for this assignment.",
        "bullets": [
          "Malformed output with no validation -> silent wrong answers",
          "Unbounded tool calls with no timeout or cap -> runaway cost",
          "No eval -> quality is guesswork and regressions are invisible"
        ],
        "script": "Name each failure and tie it to money or trust. These three become the Break-It targets on Thursday, so plant them firmly now."
      },
      {
        "segment": "deconstruct",
        "eyebrow": "🧭 What good looks like",
        "title": "The same assistant, hardened",
        "body": "The fix for each failure is small and specific. Malformed output becomes a validated structured schema. The runaway loop gets a max-turns cap, a per-call timeout, and a clear error class when it gives up. The invisible regression gets an eval — a tiny dataset plus a grader that produces a number. None of this is exotic; it is the difference between a program you can put your name on and one you cross your fingers over. That hardened version is what you build Thursday.",
        "bullets": [
          "Validation replaces hope",
          "A capped loop with an error class replaces the runaway",
          "An eval score replaces 'it felt better'"
        ],
        "script": "Preview Thursday's shape without giving away the code. 'You'll build the fragile version fast, then break it on purpose, then harden each break.'"
      },
      {
        "segment": "micro-build",
        "eyebrow": "⚙️ First call",
        "title": "Your first authenticated call, from code",
        "body": "Everyone runs this now. Install the SDK, put your key in the environment, and make a single call from a Python file — not a chat box. The client takes no key argument because it reads ANTHROPIC_API_KEY for you. We read the text out by checking each content block's type, which is the safe habit even when there is only one block. If this returns a sentence, your environment is real and the rest of the week is downhill.",
        "bullets": [
          "pip install anthropic",
          "macOS/Linux: export ANTHROPIC_API_KEY=sk-ant-...  (Windows PowerShell: $env:ANTHROPIC_API_KEY=\"sk-ant-...\")",
          "Model choice: claude-opus-4-8 for hardest reasoning; claude-haiku-4-5 or claude-sonnet-5 for high-volume, cost-sensitive triage"
        ],
        "code": {
          "label": "hello_claude.py",
          "code": "import anthropic\n\nclient = anthropic.Anthropic()   # reads ANTHROPIC_API_KEY from the environment\n\nresp = client.messages.create(\n    model=\"claude-opus-4-8\",\n    max_tokens=512,\n    system=\"You are a support-operations assistant. Be concise and factual.\",\n    messages=[{\"role\": \"user\", \"content\": \"A customer cannot log in after a password reset. What do you need to help?\"}],\n)\n\nprint(next(b.text for b in resp.content if b.type == \"text\"))"
        },
        "script": "Run it live first, then have everyone run it. Do not move on until every screen shows a real reply — a broken key here blocks everything."
      },
      {
        "segment": "micro-build",
        "eyebrow": "🧭 Steer it",
        "title": "Control behavior with the system prompt",
        "body": "The system prompt is where you set the assistant's job, its output rules, and its boundaries. Change it and behavior changes without touching your logic. Now make it multi-turn: send a message, append Claude's reply to your list, and ask a follow-up. Feel the statelessness — the model only knows what is in your list, so if you drop the append it forgets everything. This muscle memory is what tool use and eval both build on.",
        "bullets": [
          "system = standing rules; user turns = the actual work",
          "Append the assistant reply to keep context alive",
          "Consecutive same-role messages are allowed; the API merges them"
        ],
        "code": {
          "label": "Multi-turn, holding context yourself",
          "code": "messages = [{\"role\": \"user\", \"content\": \"A customer emailed: 'Where is order ORD-4471?'\"}]\n\nresp = client.messages.create(\n    model=\"claude-opus-4-8\", max_tokens=512,\n    system=\"You are a support-triage assistant. Classify, then decide the next action. Be terse.\",\n    messages=messages,\n)\nmessages.append({\"role\": \"assistant\", \"content\": resp.content})\n\nmessages.append({\"role\": \"user\", \"content\": \"How urgent is it on a scale of low/normal/high?\"})\nresp = client.messages.create(model=\"claude-opus-4-8\", max_tokens=256,\n    system=\"You are a support-triage assistant. Be terse.\", messages=messages)\nprint(next(b.text for b in resp.content if b.type == \"text\"))"
        },
        "script": "Have them deliberately delete the append line and watch the follow-up lose context. The bug teaches statelessness better than any slide."
      },
      {
        "segment": "micro-build",
        "eyebrow": "📦 Trustable JSON",
        "title": "Get structured output you can act on",
        "body": "Now replace the paragraph with a schema. Define a small Pydantic model for what triage should produce, call messages.parse with output_format, and read parsed_output — a real object with typed fields. If the model tried to return the wrong shape, you find out here, at the boundary, instead of three functions downstream. This is the single change that makes the difference between a toy and something the rest of your code can depend on.",
        "bullets": [
          "Model the output as fields, not free text",
          "parsed_output is a validated instance, not a string",
          "A refusal or a max_tokens cutoff can still break the shape — check for it"
        ],
        "code": {
          "label": "parse() returns a validated object",
          "code": "from pydantic import BaseModel\n\nclass Triage(BaseModel):\n    category: str\n    urgency: str\n    order_id: str | None\n    suggested_reply: str\n\nresp = client.messages.parse(\n    model=\"claude-opus-4-8\", max_tokens=1024,\n    messages=[{\"role\": \"user\", \"content\": \"Where is my order ORD-4471? It's been two weeks!\"}],\n    output_format=Triage,\n)\n\ntriage = resp.parsed_output\nprint(triage.category, triage.urgency, triage.order_id)"
        },
        "script": "Print the object and access .category directly. 'No regex, no split, no guessing — that is the whole point of structured output.'"
      },
      {
        "segment": "micro-build",
        "eyebrow": "🛠️ Give it hands",
        "title": "Add one tool and handle the result",
        "body": "Define the lookup_order tool, make a call, and watch stop_reason come back as 'tool_use'. That is Claude asking you to run the function. You execute your real lookup, package the answer as a tool_result block keyed by the tool_use_id, append it, and call again so Claude can finish the thought. This request-execute-return-continue loop is the beating heart of every agent you will build for the rest of the program.",
        "bullets": [
          "stop_reason 'tool_use' means Claude wants a function run",
          "tool_result.content is a string — json.dumps your data",
          "Match tool_use_id exactly or the follow-up call is rejected"
        ],
        "code": {
          "label": "Detect tool_use, execute, return the result",
          "code": "import json\n\ndef lookup_order(order_id):\n    return {\"order_id\": order_id, \"status\": \"in_transit\", \"carrier\": \"UPS\", \"eta\": \"2 days\"}\n\nmessages = [{\"role\": \"user\", \"content\": \"Where is order ORD-4471?\"}]\nresp = client.messages.create(model=\"claude-opus-4-8\", max_tokens=1024, tools=tools, messages=messages)\n\nif resp.stop_reason == \"tool_use\":\n    messages.append({\"role\": \"assistant\", \"content\": resp.content})\n    results = []\n    for block in resp.content:\n        if block.type == \"tool_use\":\n            out = lookup_order(block.input[\"order_id\"])\n            results.append({\"type\": \"tool_result\", \"tool_use_id\": block.id, \"content\": json.dumps(out)})\n    messages.append({\"role\": \"user\", \"content\": results})\n    resp = client.messages.create(model=\"claude-opus-4-8\", max_tokens=1024, tools=tools, messages=messages)\n\nprint(next(b.text for b in resp.content if b.type == \"text\"))"
        },
        "script": "Trace the two API calls: the first returns tool_use, the second returns the finished answer. Emphasize the tool_use_id must match."
      },
      {
        "segment": "micro-build",
        "eyebrow": "✅ Checkpoint",
        "title": "You can now call, structure, and act",
        "body": "In one session you made an authenticated call, steered it with a system prompt, forced a trustable JSON shape, and gave the model a tool it can call. Those four moves are the entire vocabulary of a Workflow Assistant. Thursday you wire them into one program that automates the specific workflow you named today, and then you deliberately break it three ways and harden each break. Bring your one real task — the build only matters if it is yours.",
        "bullets": [
          "Auth + messages + structured output + one tool = the whole kit",
          "Thursday: assemble the assistant, then Build-Break-Harden it",
          "Come with the exact workflow you want to automate"
        ],
        "script": "Do a quick round: each student states in one sentence the workflow they will automate Thursday. Commitment out loud raises the odds they finish."
      }
    ],
    "thursday": [
      {
        "segment": "build-map",
        "eyebrow": "🗺️ Today's build",
        "title": "From four loose pieces to one running assistant",
        "body": "Today you assemble Monday's four moves into a Business Workflow Assistant for one concrete task, then you prove it with an eval. Our running example is support-ticket triage: a customer message comes in, the assistant classifies it, looks up the order with a real tool when one is mentioned, and returns a structured resolution. Swap in your own workflow — invoice extraction, lead scoring, status lookup — the skeleton is identical. Four checkpoints take you from a bare call to a green eval.",
        "bullets": [
          "CP0: an authenticated call from your repo",
          "CP1: one tool working end to end",
          "CP2: a structured result for one real workflow",
          "CP3: an eval harness that scores it green"
        ],
        "script": "Put the four checkpoints on the board and leave them up all class. Every student maps the triage example onto their own named workflow before we start."
      },
      {
        "segment": "build-map",
        "eyebrow": "🧰 Readiness",
        "title": "Green light before you write a line",
        "body": "Two-minute pre-flight so nobody loses the hour to setup. Confirm your API key is in the environment and never in a file you will commit. Confirm Python (or Node) runs and your repo is open. And confirm you have picked exactly one workflow with a real lookup step — trying to automate three at once is how people finish zero. If your Monday hello_claude.py still runs, you are ready.",
        "bullets": [
          "ANTHROPIC_API_KEY in the environment, .env in .gitignore",
          "Python/Node ready; repo open; a scratch file to build in",
          "One workflow chosen, with one thing it needs to look up"
        ],
        "script": "Run the pre-flight as a live checklist — thumbs up per item. Fix any red key now; a bad key at CP1 wastes ten minutes."
      },
      {
        "segment": "guided-build",
        "eyebrow": "🔌 CP0 · Authenticated",
        "title": "Step 1: a client module you can import everywhere",
        "body": "Start with a tiny client module the rest of your assistant imports. It reads the key from the environment, so the secret lives in exactly one place: outside your code. Prove it with one real call. If you would rather drive this with Claude Code, the prompt below produces exactly this file. Do not continue until this prints a real sentence — every later step imports this client.",
        "bullets": [
          "One import point for the client keeps the key in one place",
          "Claude Code prompt: 'Write a minimal Claude API client that reads the key from an environment variable, never hardcoded, and prints a test response.'"
        ],
        "code": {
          "label": "assistant/client.py",
          "code": "import anthropic\n\n# Single source of the configured client. Key comes from ANTHROPIC_API_KEY.\nclient = anthropic.Anthropic()\nMODEL = \"claude-opus-4-8\"   # swap to claude-haiku-4-5 for cheaper, high-volume triage\n\nif __name__ == \"__main__\":\n    resp = client.messages.create(\n        model=MODEL, max_tokens=256,\n        messages=[{\"role\": \"user\", \"content\": \"Reply OK if you can read this.\"}],\n    )\n    print(next(b.text for b in resp.content if b.type == \"text\"))"
        },
        "script": "Have everyone run python -m assistant.client and see OK. Green light this checkpoint out loud before moving on."
      },
      {
        "segment": "guided-build",
        "eyebrow": "🧠 CP1 · Prompt",
        "title": "Step 2: write the system prompt up the technique ladder",
        "body": "Before any tool, get the instruction right, because a vague prompt makes every later step noisy. Walk the ladder: be clear and direct about the job, be specific about the exact categories and rules, give the structure an XML skeleton so the rules are unmistakable, and add one worked example so the model sees the target. This is the same prompt-engineering ladder you will formalize into a library next week — today you feel why each rung matters.",
        "bullets": [
          "Clear & direct -> specific -> XML structure -> one example",
          "Name the tool's trigger condition in the prompt, not just its schema",
          "A tighter prompt is cheaper than more retries"
        ],
        "code": {
          "label": "assistant/prompt.py",
          "code": "SYSTEM = \"\"\"You triage inbound customer support messages.\n\n<instructions>\n- Classify category as exactly one of: shipping, billing, technical, other.\n- Rate urgency as exactly one of: low, normal, high.\n- If the message names an order (pattern ORD-####), extract it.\n- Call the lookup_order tool ONLY when an order id is present.\n- After any lookup, write a short, factual suggested_reply.\n</instructions>\n\n<example>\nMessage: \"My order ORD-1002 still hasn't shipped!\"\ncategory: shipping | urgency: high | order_id: ORD-1002\n</example>\n\"\"\""
        },
        "script": "Read the prompt aloud rung by rung and name each technique as you hit it. 'This XML block is the difference between a suggestion and a spec.'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "🛠️ CP1 · Tool",
        "title": "Step 3: define the tool and a real dispatcher",
        "body": "Declare the tool with a strict schema and write the actual function behind it. In production this hits your order system; today a stub with realistic fields is fine, because the loop mechanics are what we are testing. Setting additionalProperties false and required makes the model's arguments predictable. The dispatcher maps a tool name to a real function, so adding a second tool later is one line — this is how your assistant grows without turning into spaghetti.",
        "bullets": [
          "Strict schema: required fields + additionalProperties false",
          "dispatch() maps name -> function so tools stay pluggable",
          "Return a plain dict; the loop will json.dumps it"
        ],
        "code": {
          "label": "assistant/tools.py",
          "code": "TOOLS = [{\n    \"name\": \"lookup_order\",\n    \"description\": \"Look up an order by ID. Call this whenever the message names an order.\",\n    \"input_schema\": {\n        \"type\": \"object\",\n        \"properties\": {\"order_id\": {\"type\": \"string\", \"description\": \"e.g. ORD-4471\"}},\n        \"required\": [\"order_id\"],\n        \"additionalProperties\": False,\n    },\n}]\n\ndef lookup_order(order_id):\n    # Replace with a real system call. Stub returns realistic fields.\n    return {\"order_id\": order_id, \"status\": \"in_transit\", \"carrier\": \"UPS\", \"eta\": \"2 days\"}\n\ndef dispatch(name, args):\n    if name == \"lookup_order\":\n        return lookup_order(args[\"order_id\"])\n    return {\"error\": f\"unknown tool: {name}\"}"
        },
        "script": "Point out additionalProperties false and why it matters: it stops the model inventing extra arguments. The dispatcher is the extension point for tool #2."
      },
      {
        "segment": "guided-build",
        "eyebrow": "🔁 CP1 · The loop",
        "title": "Step 4: run the request-execute-return loop",
        "body": "This is the engine. Call the API; if stop_reason is tool_use, run every tool block, append all results in a single user turn, and call again — repeat until the model stops asking. Returning all tool_results together in one message is important: splitting them trains the model to stop making parallel calls. For now this happy-path loop has no brake; we add the cap on purpose during Break-It, so you feel why it is not optional.",
        "bullets": [
          "Loop while stop_reason == 'tool_use'",
          "Return ALL tool_results in one user message, not several",
          "Happy path first — the safety cap comes in Break-It"
        ],
        "code": {
          "label": "assistant/loop.py",
          "code": "import json\nfrom .client import client, MODEL\nfrom .prompt import SYSTEM\nfrom .tools import TOOLS, dispatch\n\ndef run_tools(messages):\n    resp = client.messages.create(model=MODEL, max_tokens=1024,\n                                  system=SYSTEM, tools=TOOLS, messages=messages)\n    while resp.stop_reason == \"tool_use\":\n        messages.append({\"role\": \"assistant\", \"content\": resp.content})\n        results = []\n        for block in resp.content:\n            if block.type == \"tool_use\":\n                out = dispatch(block.name, block.input)\n                results.append({\"type\": \"tool_result\",\n                                \"tool_use_id\": block.id, \"content\": json.dumps(out)})\n        messages.append({\"role\": \"user\", \"content\": results})\n        resp = client.messages.create(model=MODEL, max_tokens=1024,\n                                      system=SYSTEM, tools=TOOLS, messages=messages)\n    return resp"
        },
        "script": "Trace one full lap on the board. Flag loudly: 'This while loop has no exit if the model keeps asking — remember that, we break it on purpose later.'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "📦 CP2 · Structured",
        "title": "Step 5: end the run with a validated resolution",
        "body": "After the tool loop settles, do one final parse call that forces the whole result into a schema. Append the model's last turn, then ask for the resolution as structured JSON with output_format. You get back a typed Resolution object carrying the category, the order status your tool fetched, and a suggested reply — the exact record your ticketing system can ingest. This is where reasoning plus tool data becomes something a machine can consume, not a human paragraph.",
        "bullets": [
          "Run the tool loop for facts, then parse for the shape",
          "parsed_output is your downstream record",
          "Structured output and tool use compose in the same assistant"
        ],
        "code": {
          "label": "assistant/schema.py + the final parse",
          "code": "from pydantic import BaseModel\nfrom .client import client, MODEL\nfrom .prompt import SYSTEM\n\nclass Resolution(BaseModel):\n    category: str\n    urgency: str\n    order_id: str | None\n    order_status: str | None\n    suggested_reply: str\n\ndef finalize(messages, last_turn):\n    messages.append({\"role\": \"assistant\", \"content\": last_turn.content})\n    messages.append({\"role\": \"user\",\n                     \"content\": \"Return the final resolution as structured JSON matching the schema.\"})\n    resp = client.messages.parse(model=MODEL, max_tokens=1024,\n                                 system=SYSTEM, messages=messages, output_format=Resolution)\n    return resp.parsed_output"
        },
        "script": "Show the returned object with order_status filled in from the tool. 'The tool fetched the fact, the schema shaped it — that is the whole workflow in one object.'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "🧩 CP2 · Assemble",
        "title": "Step 6: one function, input to structured result",
        "body": "Now wire the pieces into the single entry point everything else calls. assist takes a raw message and returns a validated Resolution: it seeds the conversation, runs the tool loop, and finalizes into the schema. This is your Workflow Assistant — the thing your demo video shows and the thing your eval scores. Run it against three sample tickets and read the objects out loud. If they look right, you have hit CP2.",
        "bullets": [
          "assist(message) -> Resolution is the public API of your assistant",
          "Everything downstream depends on this one contract",
          "Test on a shipping, a billing, and a technical ticket"
        ],
        "code": {
          "label": "assistant/app.py",
          "code": "from .loop import run_tools\nfrom .schema import finalize, Resolution\n\ndef assist(message: str) -> Resolution:\n    messages = [{\"role\": \"user\", \"content\": message}]\n    last = run_tools(messages)          # reason + call tools\n    return finalize(messages, last)     # force the validated shape\n\nif __name__ == \"__main__\":\n    r = assist(\"Where is my order ORD-4471? It's been two weeks!\")\n    print(r.category, r.urgency, r.order_id, r.order_status)\n    print(r.suggested_reply)"
        },
        "script": "Run assist on three tickets live. Celebrate the first fully-structured resolution — that is the capstone deliverable in embryo."
      },
      {
        "segment": "guided-build",
        "eyebrow": "🧪 CP3 · Dataset",
        "title": "Step 7: write a tiny eval dataset",
        "body": "You cannot improve what you cannot measure. An eval starts with a handful of inputs paired with what a correct answer must contain — not the exact wording, but the fields and values that must be right. Five to ten cases covering your main categories is plenty to catch a regression. Keep it in code so it runs anywhere. This dataset is the objective standard that turns 'the prompt feels better' into a number you can defend.",
        "bullets": [
          "Each case = an input plus the fields/values that must hold",
          "Cover your real categories, including one tricky edge case",
          "Small and in-repo beats large and aspirational"
        ],
        "code": {
          "label": "evals/dataset.py",
          "code": "CASES = [\n    {\"input\": \"Where is my order ORD-4471? It's been two weeks!\",\n     \"expect\": {\"category\": \"shipping\", \"order_id\": \"ORD-4471\",\n                \"required\": [\"category\", \"urgency\", \"suggested_reply\"]}},\n    {\"input\": \"I was charged twice for invoice INV-88.\",\n     \"expect\": {\"category\": \"billing\",\n                \"required\": [\"category\", \"urgency\", \"suggested_reply\"]}},\n    {\"input\": \"The app crashes when I upload a photo.\",\n     \"expect\": {\"category\": \"technical\",\n                \"required\": [\"category\", \"urgency\", \"suggested_reply\"]}},\n]"
        },
        "script": "Have each student write two cases for their own workflow right now. The dataset is theirs — a generic one proves nothing about their assistant."
      },
      {
        "segment": "guided-build",
        "eyebrow": "✅ CP3 · Grader",
        "title": "Step 8: grade it and make the number green",
        "body": "The grader runs your assistant on every case and checks two things with plain code: are the required fields present and non-empty, and do the known values match. That produces a pass rate — your eval score. Code-based grading is exact and free; for fuzzy fields like the reply wording you can add a model-based judge that asks Claude to score against a rubric and return structured JSON. Run it, read the score, then improve the prompt and watch the number move. That loop is professional AI work.",
        "bullets": [
          "Code-based grader: exact, deterministic, ideal for fields and labels",
          "Model-based judge: a second Claude call scoring fuzzy output on a rubric",
          "A change is only real if the score moves"
        ],
        "code": {
          "label": "evals/run.py",
          "code": "from assistant.app import assist\nfrom evals.dataset import CASES\n\ndef grade(result, expect):\n    checks = {f\"has_{f}\": bool(getattr(result, f, None)) for f in expect[\"required\"]}\n    if \"category\" in expect:\n        checks[\"category_ok\"] = result.category == expect[\"category\"]\n    if \"order_id\" in expect:\n        checks[\"order_id_ok\"] = result.order_id == expect[\"order_id\"]\n    checks[\"passed\"] = all(checks.values())\n    return checks\n\ndef run_eval():\n    rows = [grade(assist(c[\"input\"]), c[\"expect\"]) for c in CASES]\n    score = sum(r[\"passed\"] for r in rows) / len(rows)\n    print(f\"eval score: {score:.0%}\")\n    return score\n\nif __name__ == \"__main__\":\n    run_eval()"
        },
        "script": "Run the eval, get a score, then tweak one prompt line and re-run so they see the number move. That live feedback loop is the whole lesson of CP3."
      },
      {
        "segment": "failure",
        "eyebrow": "🔥 Break it · Secrets",
        "title": "Hardcode the key, watch it leak",
        "body": "Let's break it on purpose. Paste your key straight into the client and commit — now it lives in git history forever, readable by anyone with repo access, and a rotated key does not erase the old one from history. The fix is the rule from Monday: read the key from the environment, keep .env out of git, and redact any key fragment you log. If a secret is ever committed, treat it as compromised and rotate it immediately.",
        "bullets": [
          "A key in source is in git history permanently",
          "Read from the environment; add .env to .gitignore",
          "Redact keys in logs; rotate on any accidental commit"
        ],
        "code": {
          "label": "Before and after",
          "code": "import os, anthropic\n\n# BAD: committed to git = compromised, forever\n# client = anthropic.Anthropic(api_key=\"sk-ant-abc123realkey\")\n\n# GOOD: key stays in the environment\nclient = anthropic.Anthropic()\nkey = os.environ[\"ANTHROPIC_API_KEY\"]\nprint(\"using key\", key[:7] + \"...<redacted>\")   # never log the whole key"
        },
        "script": "Actually type the key into the file and 'accidentally' show it on the projector, then delete it. The visceral moment is the lesson; then show the env-var fix."
      },
      {
        "segment": "failure",
        "eyebrow": "🔥 Break it · Runaway loop",
        "title": "A tool loop with no brakes",
        "body": "Feed the assistant an ambiguous message and a stubbed tool that keeps looking unresolved, and the happy-path while loop can call the tool forever — real tokens, real dollars, no exit. Harden it: cap the turns, put a timeout on every API call, convert tool exceptions into is_error results so one bad call does not crash the run, and raise a clear error when the cap is hit so a human can pick it up. That is failure-first design — you decided what happens when it breaks before it broke.",
        "bullets": [
          "Cap max turns; every external call gets a timeout",
          "Tool exceptions become is_error results, not crashes",
          "Exhaustion raises a clear error class -> escalate, don't hang"
        ],
        "code": {
          "label": "assistant/loop.py, hardened",
          "code": "import json\nfrom .client import client, MODEL\nfrom .prompt import SYSTEM\nfrom .tools import TOOLS, dispatch\n\nMAX_TURNS = 6\n\ndef run_tools(messages, max_turns=MAX_TURNS):\n    for _ in range(max_turns):\n        resp = client.with_options(timeout=30).messages.create(\n            model=MODEL, max_tokens=1024, system=SYSTEM, tools=TOOLS, messages=messages)\n        if resp.stop_reason != \"tool_use\":\n            return resp\n        messages.append({\"role\": \"assistant\", \"content\": resp.content})\n        results = []\n        for block in resp.content:\n            if block.type == \"tool_use\":\n                try:\n                    out, err = dispatch(block.name, block.input), False\n                except Exception as e:\n                    out, err = {\"error\": type(e).__name__}, True\n                results.append({\"type\": \"tool_result\", \"tool_use_id\": block.id,\n                                \"content\": json.dumps(out), \"is_error\": err})\n        messages.append({\"role\": \"user\", \"content\": results})\n    raise RuntimeError(\"tool loop exceeded MAX_TURNS\")   # dead-letter / escalate"
        },
        "script": "Show the runaway first (let it spin a few turns), then drop in the cap, timeout, and is_error handling. Name each guard as failure-first design."
      },
      {
        "segment": "failure",
        "eyebrow": "🔥 Break it · Vibes",
        "title": "No eval means every change is a gamble",
        "body": "The last failure is invisible: with no eval, you edit the prompt to fix one ticket and silently break two others, and you will not know until a customer tells you. The harden is to make the eval a gate — the assistant is not shippable unless the score clears a threshold, and you wire that check into CI so a regression fails the build, not production. Now every change is measured. You leave today with an assistant that works, survives being broken, and proves its own quality.",
        "bullets": [
          "Ship-gate: block release when the eval drops below threshold",
          "Wire the eval into CI so regressions fail the build",
          "Done = works + survives Break-It + a green eval"
        ],
        "code": {
          "label": "The eval gate",
          "code": "from evals.run import run_eval\n\nTHRESHOLD = 0.80\n\nif run_eval() < THRESHOLD:\n    raise SystemExit(f\"eval below {THRESHOLD:.0%} - not shipping\")\nprint(\"eval green - safe to ship\")"
        },
        "script": "Close the loop back to the deliverable: 'A demo that has never been broken is a demo you don't understand. Yours is broken, hardened, and scored — that's shippable.' Point them to the assignment: repo plus a demo video."
      }
    ]
  },
  "4": {
    "monday": [
      {
        "segment": "business-problem",
        "eyebrow": "🧩 The Problem",
        "title": "When everyone prompts their own way, prompting becomes chaos",
        "body": "Right now your team's best prompts live in scattered chat histories, a Notion page nobody updates, and three people's heads. The same task — summarize a call, triage a ticket, draft an exec summary — gets solved from scratch every time, differently, by whoever happens to do it. Nothing is reproducible, nothing is tested, and nothing improves because there is no shared artifact to improve. This is the exact state most 'AI-forward' companies are actually in behind the demo.",
        "bullets": [
          "The best prompt on the team is invisible to everyone else on the team",
          "Two people prompt the same task and get two different output shapes",
          "When a prompt breaks, no one knows what the working version looked like",
          "Quality is a matter of who wrote it, not a standard the org holds"
        ],
        "script": "Open by asking: 'Where does your best prompt live right now?' Let them answer — chat history, a doc, my head. That is the problem in one sentence. Prompting is treated as a personal skill, not a shared, governed asset. Today we fix that."
      },
      {
        "segment": "business-problem",
        "eyebrow": "💸 The Cost",
        "title": "Ad-hoc prompting has a measurable business cost",
        "body": "An unversioned, untested prompt is a liability, not an asset. It works in the demo, then a model update shifts its behavior and nobody notices until a customer does. Every new hire re-learns the same lessons the last hire already learned. And because there is no eval, quality arguments are settled by opinion — the loudest person, not the best output. Multiply that across every repetitive AI task in the company and you are paying a reproducibility tax on every single run.",
        "bullets": [
          "Silent drift: a prompt that worked at 92% quietly degrades and no test catches it",
          "Onboarding tax: every new person rediscovers the same prompt tricks",
          "Opinion-driven QA: 'this reads better' instead of 'this scores 0.94 vs 0.71'",
          "No compounding: yesterday's improvement does not carry into tomorrow's work"
        ],
        "script": "Name the tax explicitly. The cost is not one bad output — it is that nothing compounds. Every improvement evaporates because it was never captured as a reusable, tested asset. That is money spent re-learning what you already knew."
      },
      {
        "segment": "business-problem",
        "eyebrow": "🎯 The Fix",
        "title": "Treat prompts like code: engineered, versioned, tested, shared",
        "body": "The fix is not a better one-off prompt. It is a system: a repeatable technique ladder that turns a vague ask into an engineered prompt, a template format so prompts carry variables and metadata, versioning so changes are traceable, and an eval so 'good' is a number, not a vibe. Assemble those into a governed Enterprise Prompt Library and prompting stops being a personal skill and becomes shared infrastructure. That library is your Thursday deliverable and the foundation for the multi-agent team you build in Weeks 5 through 7.",
        "bullets": [
          "Technique ladder: clear & direct → specific → XML/structure → examples → decomposition",
          "Templates with variables so one prompt serves many inputs",
          "Versioning + metadata so the library is traceable, not a junk drawer",
          "Eval gate so a prompt is 'library-ready' only when it passes"
        ],
        "script": "Set the frame for the whole week: prompts are assets, and assets get engineered, versioned, and tested. By Thursday you have 8+ of them in a governed library. Everything today builds toward that."
      },
      {
        "segment": "architecture",
        "eyebrow": "📐 The Ladder",
        "title": "Five rungs turn a guess into an engineered prompt",
        "body": "Systematic prompt engineering is a ladder you climb in order, adding one technique at a time and measuring the gain. Rung 1 is clear and direct — say exactly what you want. Rung 2 is specific — pin the format, constraints, and edge cases. Rung 3 is structure — use XML tags to separate role, task, input, and output. Rung 4 is examples — show the model one or two worked cases (few-shot). Rung 5 is decomposition — break a hard task into steps or let the model reason before answering. You do not jump to rung 5; you climb, and you stop when the eval says you have enough.",
        "bullets": [
          "1. Clear & direct — unambiguous instruction, no hedging",
          "2. Specific — format, length, constraints, what to do with edge cases",
          "3. XML / structure — tag the parts so the model cannot conflate them",
          "4. Examples — one or two worked input→output pairs (few-shot)",
          "5. Decomposition — step-by-step reasoning or split into sub-prompts"
        ],
        "script": "Draw the ladder on screen. The discipline is: add ONE rung, re-run the eval, keep the gain if it earns its cost. This is how you avoid the two failure modes — a lazy one-liner and a bloated 800-word prompt that nobody can maintain."
      },
      {
        "segment": "architecture",
        "eyebrow": "🪜 Rungs 1-2",
        "title": "Clear & direct, then specific — most gains live here",
        "body": "The largest single jump in prompt quality usually comes from the bottom two rungs, which is why teams that skip them stay stuck. Clear and direct means you remove ambiguity: state the role, the exact task, and the audience. Specific means you pin down everything a competent human would ask before starting — output format, length, tone, and crucially what to do at the edges (missing data, ambiguous input, nothing to report). A model given no edge-case instruction will improvise one, and improvisation is exactly what you cannot reproduce.",
        "bullets": [
          "Name the role and audience: 'You are a RevOps analyst preparing a CRM update'",
          "State the exact task and the exact output format",
          "Define edge cases explicitly: no due date → null, no action items → empty list",
          "Cut hedging words ('maybe', 'try to') — they invite variance"
        ],
        "code": {
          "label": "Weak → clear & direct + specific",
          "code": "WEAK:\nSummarize this call and tell me what to do next.\n\nCLEAR & DIRECT + SPECIFIC:\nYou are a RevOps analyst preparing a post-call CRM update.\nSummarize the sales call transcript in exactly 3 sentences of plain language.\nThen list every action item as owner, task, and due date.\nRules:\n- Owner must be a named person who appears in the transcript.\n- If a due date is not stated, set it to null (do not guess).\n- If there are no action items, return an empty list, not a sentence.\nAudience: the account executive, who will paste this into Salesforce."
        },
        "script": "Show the weak version, then the specific version side by side. Point at each added constraint and ask 'what variance did this just remove?' The edge-case rules are the ones students always forget — that is where reproducibility is won or lost."
      },
      {
        "segment": "architecture",
        "eyebrow": "🏷️ Rung 3",
        "title": "XML structure stops the model from conflating your parts",
        "body": "As a prompt grows, the model starts blurring the line between your instructions and your data — it treats a sentence in the transcript as a command, or buries the output rules in the input. XML-style tags fix this by giving each part an unambiguous boundary: role, task, the input to operate on, and the required output format each live in their own tagged block. Claude is specifically trained to respect this structure, so tagging is one of the highest-leverage, lowest-effort rungs. It also makes the prompt a template: the tagged input block is exactly where your variable goes.",
        "bullets": [
          "Separate instructions from data — untrusted input can't hijack the task",
          "Tags make the output contract explicit and easy to parse",
          "The input tag is the natural home for your {{variable}}",
          "Claude follows tagged structure more reliably than prose walls"
        ],
        "code": {
          "label": "Rung 3 — XML structure",
          "code": "<role>You are a RevOps analyst preparing a post-call CRM update.</role>\n\n<task>Summarize the call and extract action items.</task>\n\n<transcript>\n{{transcript}}\n</transcript>\n\n<rules>\n- Summary: exactly 3 plain-language sentences.\n- Action items: owner (named person from transcript), task, due (null if not stated).\n- No action items -> return an empty list.\n</rules>\n\n<output_format>\nReturn ONLY valid JSON:\n{\"summary\": str, \"action_items\": [{\"owner\": str, \"task\": str, \"due\": str|null}]}\n</output_format>"
        },
        "script": "Highlight the transcript tag: 'everything inside here is DATA, not instructions.' That is a security property too — it is why a line in the transcript saying \"ignore previous instructions\" can't take over. Then point at output_format: this is now a contract we can test against."
      },
      {
        "segment": "architecture",
        "eyebrow": "🎓 Rungs 4-5",
        "title": "Examples calibrate; decomposition unlocks hard tasks",
        "body": "The top two rungs are the ones you add only when the eval demands them. Rung 4, examples (few-shot), is the fastest way to lock format and tone — one or two worked input→output pairs teach the model your exact house style better than a paragraph of description ever could. Rung 5, decomposition, is for genuinely hard tasks: either you let the model reason step by step inside a scratchpad before it answers (chain of thought), or you split one giant prompt into a chain of smaller, individually testable prompts. Decomposition is powerful and expensive — more tokens, more latency — so you earn it against the eval, you do not reach for it first.",
        "bullets": [
          "Few-shot: 1-2 worked examples calibrate format and tone precisely",
          "Chain of thought: let the model reason in <scratchpad> before the final answer",
          "Prompt chaining: split one hard prompt into small, testable steps",
          "Both cost tokens and latency — add them only when the score justifies it"
        ],
        "code": {
          "label": "Rung 4-5 — example + scratchpad reasoning",
          "code": "<example>\n<transcript>Maya (AE): I'll send the MSA by Friday. Client wants SOC 2 proof.</transcript>\n<output>{\"summary\": \"Client is moving forward pending security review. Maya committed to sending the MSA. SOC 2 evidence is the open blocker.\", \"action_items\": [{\"owner\": \"Maya\", \"task\": \"Send MSA\", \"due\": \"Friday\"}, {\"owner\": \"Maya\", \"task\": \"Provide SOC 2 proof\", \"due\": null}]}</output>\n</example>\n\n<instructions>\nFirst think step by step inside <scratchpad> tags: list who spoke, what each committed to, and any stated dates.\nThen produce the final JSON. Do NOT include the scratchpad in your final answer.\n</instructions>"
        },
        "script": "Make the trade-off explicit: examples are cheap and almost always worth it; decomposition is powerful but you pay for it in tokens and latency. The rule is the same as the whole ladder — measure the gain, keep it only if it earns its cost."
      },
      {
        "segment": "architecture",
        "eyebrow": "🗂️ Library Architecture",
        "title": "A prompt becomes an asset when it carries a template, a version, and metadata",
        "body": "An engineered prompt is still a one-off until you wrap it in the three things that make it reusable: a template with named variables so it serves many inputs, a version so every change is traceable, and metadata so a teammate knows what it does, which workflow it serves, and how well it scored — without reading the whole prompt. This is the difference between a library and a junk drawer. Naming is a convention (verb-noun, like summarize-customer-call), versioning is semantic (major.minor.patch), and metadata is front-matter that travels with the prompt file in your repo.",
        "bullets": [
          "Template: variables like {{transcript}} so one prompt handles many inputs",
          "Version: semver — bump on every behavioral change, never edit in place silently",
          "Metadata: name, purpose, workflow it serves, model, I/O shape, last eval score",
          "Naming convention: verb-noun, lowercase, one file per prompt in prompts/"
        ],
        "code": {
          "label": "Front-matter metadata schema",
          "code": "---\nname: summarize-customer-call\nversion: 1.2.0\nowner: revops\npurpose: Turn a raw call transcript into a 3-sentence summary + structured action items\nworkflow: RevOps > post-call CRM update\nmodel: claude-sonnet-4-5\ninputs:\n  transcript: string   # raw call transcript text\noutput: json { summary: str, action_items: [{owner, task, due}] }\nlast_eval: { date: 2026-07-20, score: 0.94, cases: 12 }\nstatus: library-ready\n---\n<role>You are a RevOps analyst...</role>   # the engineered prompt body follows"
        },
        "script": "Walk the front-matter line by line. Ask: 'could a teammate who has never seen this prompt decide whether to use it, from the metadata alone?' If yes, it is an asset. If they have to read the whole body to understand it, it is not library-ready yet."
      },
      {
        "segment": "deconstruct",
        "eyebrow": "🔬 Baseline",
        "title": "Start with the weak prompt and give it an honest score",
        "body": "We are going to take one deliberately weak prompt and walk it up the ladder, scoring every rung against a fixed eval so the improvement is a number, not a feeling. The baseline is the one-liner everyone actually writes: 'Summarize this call and tell me what to do next.' Run it across our 12 test transcripts and grade each output against objective checks — is it valid JSON, does every action item have a named owner, are due dates correct or correctly null. The weak prompt scores about 0.40: it summarizes fine but invents owners, formats inconsistently, and guesses due dates.",
        "bullets": [
          "Baseline prompt: 'Summarize this call and tell me what to do next.'",
          "Graded on 12 fixed transcripts against objective checks",
          "Fails: inconsistent format, invented owners, guessed due dates",
          "Score ≈ 0.40 — and now we have a number to beat"
        ],
        "script": "Run the baseline live if you can. Point out that it 'looks fine' on one example — that is the trap. The eval across 12 cases is what exposes the invented owners and format drift. You cannot see quality by eyeballing one output."
      },
      {
        "segment": "deconstruct",
        "eyebrow": "📈 Climb",
        "title": "Add one rung, re-score, watch the number climb",
        "body": "Now we climb, adding exactly one technique per step and re-running the same eval. Clear and direct plus specific rules takes it from 0.40 to about 0.68 — the edge-case rules kill the guessed due dates. XML structure takes it to 0.79 by locking the output contract so JSON parsing stops failing. One few-shot example pushes it to 0.88 by calibrating the action-item shape. A scratchpad reasoning step lands it at 0.94. The lesson is not 'more technique is better' — it is that each rung's gain is visible and attributable, so you know exactly what bought the improvement and what you could cut.",
        "bullets": [
          "Clear + specific: 0.40 → 0.68 (edge-case rules stop the guessing)",
          "XML structure: 0.68 → 0.79 (output contract holds, JSON parses)",
          "One example: 0.79 → 0.88 (action-item shape locked)",
          "Scratchpad reasoning: 0.88 → 0.94 (fewer missed action items)"
        ],
        "code": {
          "label": "The climb, as a scoreboard",
          "code": "rung                         score   delta\n0  baseline one-liner        0.40    —\n1  clear & direct + specific 0.68    +0.28\n2  + XML structure           0.79    +0.11\n3  + one few-shot example     0.88    +0.09\n4  + scratchpad reasoning     0.94    +0.06\n\n# Note the shape: the biggest gain is at the bottom of the ladder.\n# Decomposition earned only +0.06 for +40% tokens — worth it here, not always."
        },
        "script": "This scoreboard is the whole lesson of the day. Point at the deltas: the cheap rungs at the bottom bought the most. That is why you climb in order and measure — you find the point of diminishing returns instead of guessing."
      },
      {
        "segment": "deconstruct",
        "eyebrow": "⚖️ The Eval",
        "title": "What the eval actually measures — 'good' as objective checks",
        "body": "The scoreboard only means something because the eval is objective and fixed. An eval here is a small set of frozen test cases plus a grader that returns pass/fail on concrete properties — not 'does this read nicely.' For our prompt the checks are: output is valid JSON matching the schema, every action item owner is a real name from the transcript, every due date is either a stated date or null, and the summary is exactly three sentences. The score is the fraction of checks passed averaged across all cases. Because the cases are frozen, the same prompt always gets the same score, which is exactly what makes improvement comparable and drift detectable.",
        "bullets": [
          "Frozen test cases — the same inputs every run, so scores are comparable",
          "Checks are objective properties, not aesthetic judgments",
          "Score = fraction of checks passed, averaged across cases",
          "This is what lets you say 0.94 vs 0.71 instead of 'this one is better'"
        ],
        "code": {
          "label": "The grader — objective checks",
          "code": "def grade(output, transcript):\n    checks = {\n        \"valid_json\":    is_valid_schema(output),\n        \"owners_real\":   all(a[\"owner\"] in named_people(transcript)\n                             for a in output[\"action_items\"]),\n        \"dates_honest\":  all(a[\"due\"] is None or a[\"due\"] in stated_dates(transcript)\n                             for a in output[\"action_items\"]),\n        \"summary_len\":   sentence_count(output[\"summary\"]) == 3,\n    }\n    return sum(checks.values()) / len(checks)   # 0.0 .. 1.0"
        },
        "script": "Stress that the grader has no opinions. Every check is a property you could verify by hand. 'Owners real' catches hallucinated names; 'dates honest' catches guessing. This is Week 3's eval discipline applied to prompts — quality is a measurement, not a debate."
      },
      {
        "segment": "micro-build",
        "eyebrow": "🛠️ Micro-Build",
        "title": "Now turn that engineered prompt into a versioned template",
        "body": "In the next ten minutes each of you takes one prompt you already use and turns it into a proper template — the exact move you'll repeat eight times on Thursday. A template is the engineered prompt body plus named variables plus front-matter metadata, saved as one file in a prompts/ folder. We'll do it in four small steps: choose the file and format, extract the variables, attach the metadata, and add one tested example with its eval score. When you finish, you have your first library-ready asset and the pattern locked.",
        "bullets": [
          "Pick one prompt you actually use in your work this week",
          "Four steps: format → variables → metadata → tested example",
          "Output: one file in prompts/ that anyone on your team could pick up",
          "This is the rep you'll repeat 8× on Thursday"
        ],
        "script": "Frame this as the rehearsal for Thursday. Everyone picks a real prompt from their own work — not a toy. By the end of the micro-build they have done the full loop once, so Thursday is repetition, not first-time struggle."
      },
      {
        "segment": "micro-build",
        "eyebrow": "🧬 Step 1-2",
        "title": "Choose the file format, then extract the variables",
        "body": "First, pick a template format and commit to it for the whole library — consistency is more valuable than any particular choice. We'll use one Markdown file per prompt with YAML front-matter for metadata and the prompt body below it, saved as prompts/<name>/v<major>.<minor>.<patch>.md. Second, hunt down every value that changes between runs and replace it with a named variable in double braces. The specific transcript, the customer name, the target length — those are inputs, not part of the prompt. What is left after you extract the variables is the reusable skeleton that serves every input.",
        "bullets": [
          "One convention for the whole library: prompts/<name>/vX.Y.Z.md",
          "Front-matter on top, prompt body below",
          "Extract every run-specific value into a {{variable}}",
          "The skeleton that remains is what makes it reusable"
        ],
        "code": {
          "label": "Extract variables from a hardcoded prompt",
          "code": "# BEFORE (hardcoded to one run):\n\"Summarize the call with Acme Corp from Jan 14 in 3 sentences...\"\n\n# AFTER (templated):\n# file: prompts/summarize-customer-call/v1.2.0.md\n<task>Summarize the {{customer_name}} call in {{summary_len}} sentences.</task>\n<transcript>\n{{transcript}}\n</transcript>\n\n# Variables become the documented input contract:\n#   customer_name: string\n#   summary_len:   int (default 3)\n#   transcript:    string"
        },
        "script": "Have them literally circle the parts of their prompt that change every time — those are the variables. A common miss: they leave the customer name hardcoded. If it changes between runs, it is an input. Extracting it is what turns one prompt into a reusable one."
      },
      {
        "segment": "micro-build",
        "eyebrow": "🏷️ Step 3",
        "title": "Attach metadata so the prompt explains itself",
        "body": "Now add the front-matter that lets a teammate use this prompt without reading its body. The non-negotiable fields are name, version, purpose, the workflow it serves, the model it was tuned on, the input/output shape, and the last eval score with its date. The workflow field is the one people skip and the one that matters most for the library — it is how prompts get found by the person who has that job to do. A prompt without a workflow mapping is technically in the library but practically invisible.",
        "bullets": [
          "Required: name, version, purpose, workflow, model, inputs, output, last_eval",
          "Workflow mapping = how the right person finds the right prompt",
          "Model field = a reminder to re-eval when you change models",
          "last_eval score + date = proof it earned its place"
        ],
        "code": {
          "label": "Complete front-matter",
          "code": "---\nname: summarize-customer-call\nversion: 1.2.0\npurpose: Raw call transcript -> 3-sentence summary + structured action items\nworkflow: RevOps > post-call CRM update\nmodel: claude-sonnet-4-5\ninputs: { customer_name: string, summary_len: int, transcript: string }\noutput: json { summary: str, action_items: [{owner, task, due}] }\nlast_eval: { date: 2026-07-20, score: 0.94, cases: 12 }\nstatus: library-ready\n---"
        },
        "script": "Point at the workflow line and say 'this is the index of your library.' When a new AE joins and asks 'is there a prompt for post-call updates?', they grep the workflow field and find it. Without it, your great prompt is a file nobody discovers."
      },
      {
        "segment": "micro-build",
        "eyebrow": "✅ Step 4 + Gate",
        "title": "Add one tested example, then apply the library-ready gate",
        "body": "The last step is what separates a library from a folder of hopeful text: a tested example. Save at least one input→expected-output pair next to the prompt and the eval score it produced. Then apply the gate — a prompt is 'library-ready' only when all four are true: it has a version, it has complete metadata, it has a tested example, and that example passes the eval at your threshold. Anything missing one of the four is a draft, not a library entry. Write that gate down today; on Thursday it becomes the rule that guards your whole library.",
        "bullets": [
          "Ship a tested example: input, expected output, and its eval score",
          "The four-part gate — version + metadata + example + passing eval",
          "Miss any one → it is a draft, not library-ready",
          "The gate is a written standard, not a preference"
        ],
        "code": {
          "label": "Library-ready gate (checklist)",
          "code": "LIBRARY-READY  ==  all of:\n  [ ] version present and bumped for this change (semver)\n  [ ] front-matter complete (name, purpose, workflow, model, I/O)\n  [ ] >= 1 tested example checked in (input + expected output)\n  [ ] example passes the eval at threshold (>= 0.85)\n\n# If any box is unchecked, status: draft — NOT in the library."
        },
        "script": "Read the gate out loud as a commitment. 'Worked once' is not on this list — that is the whole point. Tell them: on Thursday, this checklist is the bouncer at the door of your library. Nothing gets in without all four."
      }
    ],
    "thursday": [
      {
        "segment": "build-map",
        "eyebrow": "🗺️ The Build Map",
        "title": "Four checkpoints from empty folder to governed library",
        "body": "Tonight you build the real thing: an Enterprise Prompt Library with 8+ versioned, tested, documented prompts and a written standard that governs it. We move in four checkpoints. CP0: scaffold the prompts/ folder and lock your template format. CP1: build your first fully versioned template with variables and a tested example. CP2: fill the library to eight prompts, each mapped to a real workflow with metadata. CP3: write the CONTRIBUTING standard and wire the eval gate so the library can't rot. Each checkpoint is a clean stopping point — if you only reach CP1 tonight, you still have a real asset.",
        "bullets": [
          "CP0: prompts/ scaffold + chosen template format",
          "CP1: first versioned template with variables + a tested example",
          "CP2: 8+ prompts, each with metadata and a workflow mapping",
          "CP3: CONTRIBUTING standard doc + eval gate"
        ],
        "script": "Show the four checkpoints and set the expectation: CP1 is the hard one — after that it is repetition. Tell them to get one prompt fully right before making eight half-right. Depth first, then breadth."
      },
      {
        "segment": "build-map",
        "eyebrow": "🎯 Readiness + Targets",
        "title": "Repo open, Week 3 eval handy, eight workflows in mind",
        "body": "Before we scaffold, get set: your repo open with a place for prompts/, and your Week 3 eval pattern nearby because we reuse it as the gate. Then decide your eight workflows now so CP2 is filling in a plan, not brainstorming under time pressure. Pick real, repetitive tasks from your own world — the ones worth turning into shared assets. Here is a strong default eight spanning the common enterprise functions; swap in your own where you have something more real.",
        "bullets": [
          "1. summarize-customer-call → RevOps post-call CRM update",
          "2. extract-action-items → Meeting operations",
          "3. classify-support-ticket → Support triage & routing",
          "4. draft-exec-summary → Weekly leadership brief",
          "5. redline-contract-clause → Legal first-pass review",
          "6. nl-to-sql → Analytics self-serve",
          "7. qa-release-notes → Product release comms",
          "8. score-lead → Sales lead qualification"
        ],
        "script": "Have everyone write their eight workflows down before touching code. The single biggest time-sink tonight is deciding what to build while the clock runs. Decide now; build fast. If they lack eight of their own, the default list is theirs to use."
      },
      {
        "segment": "guided-build",
        "eyebrow": "📁 CP0 · Scaffold",
        "title": "CP0 — stand up prompts/ and lock the format",
        "body": "First checkpoint: create the folder structure and commit to one template format for the entire library. One directory per prompt, versioned files inside, an eval case file alongside, and a top-level standard doc. Consistency here is what makes the library navigable at 50 prompts, so decide the shape once and never deviate. Use Claude Code to scaffold it so the convention is encoded from the first commit.",
        "bullets": [
          "One folder per prompt: prompts/<name>/",
          "Versioned prompt files: vX.Y.Z.md with front-matter + body",
          "Eval cases live next to the prompt: eval.jsonl",
          "Standard doc at prompts/CONTRIBUTING.md"
        ],
        "code": {
          "label": "Claude Code — scaffold the library",
          "code": "Create a prompts/ library in this repo with this exact convention and nothing more:\n\nprompts/\n  CONTRIBUTING.md              # the library-ready standard (stub for now)\n  <prompt-name>/\n    v1.0.0.md                  # YAML front-matter + prompt body\n    eval.jsonl                 # one test case per line: {input, expected}\n  _template/\n    v1.0.0.md                  # blank template showing required front-matter\n    eval.jsonl                 # one example case\n\nGenerate the _template files with every required metadata field present but empty, so new prompts start from a correct skeleton. Do not invent prompts yet."
        },
        "script": "Run this and review the tree together. The _template folder is the trick that keeps the whole library consistent — every new prompt is a copy of the template, so nobody forgets a metadata field. Commit CP0 before moving on."
      },
      {
        "segment": "guided-build",
        "eyebrow": "🧱 CP1 · First Template",
        "title": "CP1 — build one prompt all the way up the ladder",
        "body": "Now build your first real prompt end to end: climb the ladder to the rung the task needs, extract variables, and structure it with XML. Do not fill the whole library yet — get this one genuinely right, because it becomes the pattern you copy seven more times. Feed Claude Code your rough prompt and the target output shape and have it produce the engineered template in your locked format.",
        "bullets": [
          "Climb only as far as the task needs — measure, don't over-engineer",
          "Extract every run-specific value into a {{variable}}",
          "Structure with XML: role, task, input, rules, output_format",
          "Save as prompts/<name>/v1.0.0.md"
        ],
        "code": {
          "label": "Claude Code — templatize prompt #1",
          "code": "Turn this rough prompt into a reusable template in our prompts/ format:\n\nROUGH: \"summarize this sales call and give me the action items\"\n\nRequirements:\n- Extract variables: {{transcript}}, {{customer_name}}, {{summary_len}} (default 3).\n- Use XML structure: <role> <task> <transcript> <rules> <output_format>.\n- Rules must handle edge cases: owner must be a named person; due=null if unstated; empty list if no action items.\n- Output contract: strict JSON {summary, action_items:[{owner,task,due}]}.\n- Save as prompts/summarize-customer-call/v1.0.0.md with the front-matter skeleton filled in (leave last_eval blank for now)."
        },
        "script": "Watch that it actually extracts customer_name as a variable — that is the common miss. Read the generated XML together and confirm the edge-case rules made it in. This one prompt is the template for the whole night."
      },
      {
        "segment": "guided-build",
        "eyebrow": "🏷️ CP1 · Metadata",
        "title": "CP1 — attach the front-matter that makes it findable",
        "body": "A great prompt body is only half an asset. Fill in the complete front-matter so the prompt explains itself and, most importantly, maps to the workflow it serves. This is the metadata contract from Monday: name, version, purpose, workflow, model, inputs, output, and a last_eval slot we'll populate at the next step. Have Claude Code write it and then eyeball the workflow line — that field is the index of your library.",
        "bullets": [
          "Complete every required field — no blanks in a library entry",
          "workflow: is how the right teammate discovers this prompt",
          "model: reminds you to re-eval when you switch models",
          "last_eval: left empty until the tested example passes"
        ],
        "code": {
          "label": "Claude Code — add front-matter metadata",
          "code": "Add complete YAML front-matter to prompts/summarize-customer-call/v1.0.0.md:\n\n---\nname: summarize-customer-call\nversion: 1.0.0\npurpose: <one line: what this prompt turns input into>\nworkflow: RevOps > post-call CRM update\nmodel: claude-sonnet-4-5\ninputs: { customer_name: string, summary_len: int, transcript: string }\noutput: json { summary: str, action_items: [{owner, task, due}] }\nlast_eval: null        # fill after the eval passes\nstatus: draft          # promote to library-ready only when the gate passes\n---\n\nKeep status: draft until we have a passing tested example."
        },
        "script": "Note the two honesty markers: last_eval null and status draft. The prompt is NOT in the library yet — it is a draft with good metadata. Promotion happens only after the eval passes. Keep them disciplined about that distinction."
      },
      {
        "segment": "guided-build",
        "eyebrow": "🧪 CP1 · Tested Example",
        "title": "CP1 — add the tested example and run the gate",
        "body": "This is the checkpoint that turns a draft into a library entry. Write at least one eval case — an input transcript and the expected output — into eval.jsonl, then run the grader from Monday against the prompt. If it clears your threshold, populate last_eval and flip status to library-ready. If it doesn't, you climb one more rung and re-run. This is exactly the Week 3 eval discipline, now guarding prompt quality instead of code.",
        "bullets": [
          "Write >= 1 case in eval.jsonl: input + expected output",
          "Run the objective grader; get a real score",
          "Pass threshold → fill last_eval, set status: library-ready",
          "Fail → add a rung, re-run — do not lower the bar"
        ],
        "code": {
          "label": "eval.jsonl + gate run",
          "code": "# prompts/summarize-customer-call/eval.jsonl  (one case per line)\n{\"input\": {\"customer_name\": \"Acme\", \"summary_len\": 3, \"transcript\": \"Maya: I'll send the MSA Friday. Client wants SOC 2 proof.\"}, \"expected\": {\"action_items\": [{\"owner\": \"Maya\", \"task\": \"Send MSA\", \"due\": \"Friday\"}, {\"owner\": \"Maya\", \"task\": \"Provide SOC 2 proof\", \"due\": null}]}}\n\n# run the gate\n$ python eval_prompt.py prompts/summarize-customer-call/v1.0.0.md\n  case 1/1  valid_json:PASS owners_real:PASS dates_honest:PASS summary_len:PASS\n  score: 1.00   threshold: 0.85   ->  LIBRARY-READY\n# now set last_eval: {date: 2026-07-22, score: 1.00, cases: 1} and status: library-ready"
        },
        "script": "Run the gate live on prompt #1. When it prints LIBRARY-READY, that is the moment — one real, tested, versioned asset exists. Celebrate it, then say: now do this seven more times. The loop is the whole library."
      },
      {
        "segment": "guided-build",
        "eyebrow": "📚 CP2 · Fill to Eight",
        "title": "CP2 — repeat the loop across all eight workflows",
        "body": "Now scale the pattern. For each of your eight workflows, copy _template, climb the ladder as far as that task needs, fill the metadata, write one eval case, and run the gate. The tasks differ so the rungs differ — classification wants examples, SQL generation wants decomposition, an exec summary wants tight format rules — but the loop is identical every time. Batch the templatizing with Claude Code, then gate each one individually. Do not mark any prompt library-ready until its own eval passes; eight drafts is not a library.",
        "bullets": [
          "Same loop ×8: template → metadata → eval case → gate",
          "Different tasks need different rungs — classification loves few-shot",
          "Map each to its workflow so the library is discoverable",
          "Gate each individually; no prompt is library-ready on faith"
        ],
        "code": {
          "label": "Claude Code — batch the remaining seven",
          "code": "For each workflow below, create prompts/<name>/v1.0.0.md following the _template exactly: engineered body with XML structure, extracted variables, complete front-matter (set workflow to the mapping shown, status: draft, last_eval: null), and a starter eval.jsonl with one realistic case.\n\n  extract-action-items    -> Meeting operations\n  classify-support-ticket -> Support triage & routing   (use 2 few-shot examples)\n  draft-exec-summary      -> Weekly leadership brief     (strict length + tone rules)\n  redline-contract-clause -> Legal first-pass review\n  nl-to-sql               -> Analytics self-serve         (scratchpad reasoning step)\n  qa-release-notes        -> Product release comms\n  score-lead              -> Sales lead qualification     (rubric in <rules>)\n\nDo NOT set any status to library-ready. I will run the eval gate on each one."
        },
        "script": "Let Claude Code generate the seven bodies, but slow them down at the gate: each prompt earns library-ready on its own eval, one at a time. The note in the prompt — 'do not set library-ready' — is deliberate. The human runs the gate; the model does not self-certify."
      },
      {
        "segment": "guided-build",
        "eyebrow": "📜 CP3 · Govern",
        "title": "CP3 — write the standard and wire the gate that guards it",
        "body": "The final checkpoint makes the library self-defending. Write CONTRIBUTING.md stating exactly what 'library-ready' means and make the eval gate runnable across the whole folder so a new prompt can't sneak in unversioned or untested. This is the difference between a library and a junk drawer that fills with hopeful text over six months. Have Claude Code write the standard from the four-part gate and a runner that scores every prompt and fails on any draft masquerading as library-ready.",
        "bullets": [
          "CONTRIBUTING.md: the written 'library-ready' definition",
          "A runner that evals every prompt/ folder in one command",
          "Fail the run if any status: library-ready prompt scores below threshold",
          "This is what stops the library from silently rotting"
        ],
        "code": {
          "label": "Claude Code — standard doc + gate runner",
          "code": "1) Write prompts/CONTRIBUTING.md defining library-ready as ALL of:\n   - versioned filename (vX.Y.Z.md) with semver bumped for behavioral changes\n   - complete front-matter (name, purpose, workflow, model, inputs, output)\n   - >= 1 tested example in eval.jsonl\n   - passing eval at threshold >= 0.85, recorded in last_eval\n   Include the naming convention (verb-noun) and how to add a new prompt.\n\n2) Write scripts/gate_library.py that:\n   - walks prompts/*/vX.Y.Z.md\n   - for any file with status: library-ready, runs eval.jsonl through the grader\n   - prints a table of name, version, score, status\n   - exits non-zero if any library-ready prompt is missing metadata,\n     missing an eval case, or scores below 0.85\n\nThis is the CI gate for the library."
        },
        "script": "This is the payoff of the whole week: the library now enforces its own standard. Run gate_library.py and show the green table. Then tell them to wire it into CI so a bad prompt fails the build — governance that runs itself, not a doc nobody reads."
      },
      {
        "segment": "failure",
        "eyebrow": "💥 Break It",
        "title": "Failure injection — add an unversioned, untested prompt and change the model",
        "body": "Let's prove why the gate matters by breaking the library on purpose. Drop in a prompt the way people actually do it: no version, no metadata, no eval — just text that 'works on my machine' against today's model. It looks fine tonight. Now change the model in the front-matter, or simply run it a week later after a model update, and watch the behavior drift — the output shape shifts, an owner gets invented, the JSON stops parsing. Nothing warns you, because there is no test and no version to compare against.",
        "bullets": [
          "The bad prompt: no version, no metadata, no eval case",
          "Works tonight on the current model — the trap of 'works once'",
          "Swap the model / wait a week → output silently drifts",
          "No eval = no alarm; no version = nothing to roll back to"
        ],
        "code": {
          "label": "The prompt that will silently rot",
          "code": "# prompts/summarize-call-QUICK.md   <-- everything wrong with it\nSummarize this call and list the action items as JSON.\n{{transcript}}\n\n# no version in the filename\n# no front-matter (no workflow, no model, no last_eval)\n# no eval.jsonl beside it\n# status: (none) -- yet someone will treat it as library-ready\n\n$ python scripts/gate_library.py\n  summarize-call-QUICK   NO VERSION / NO METADATA / NO EVAL  ->  FAIL (exit 1)"
        },
        "script": "Add the bad prompt, then run the gate and let it fail loudly. This is the visceral moment: the library rejects the exact thing everyone is tempted to do. 'Works on my machine' is not a status. Let them feel the drift before you show the fix."
      },
      {
        "segment": "failure",
        "eyebrow": "🛡️ Harden It",
        "title": "Recovery — no prompt enters without version, metadata, and a passing eval",
        "body": "The recovery is not to fix that one prompt; it's to make the failure impossible to repeat. Re-add it the right way: give it a versioned filename, complete front-matter with its workflow and model, one eval case, and a passing score — then and only then flip it to library-ready. The gate you wired in CP3 enforces this in CI, so the next person literally cannot merge an untested prompt. That is the whole discipline of the week made permanent: quality is a gate the system holds, not a habit you hope people keep.",
        "bullets": [
          "Re-add with version + full metadata + eval case + passing score",
          "Only then set status: library-ready",
          "The CP3 gate blocks it in CI — the standard enforces itself",
          "Quality becomes a property of the system, not of the author"
        ],
        "code": {
          "label": "Fixed prompt passes the gate",
          "code": "# prompts/summarize-customer-call/v1.0.0.md  (re-added correctly)\n---\nname: summarize-customer-call\nversion: 1.0.0\nworkflow: RevOps > post-call CRM update\nmodel: claude-sonnet-4-5\ninputs: { transcript: string }\noutput: json { summary, action_items }\nlast_eval: { date: 2026-07-22, score: 0.94, cases: 3 }\nstatus: library-ready\n---\n\n$ python scripts/gate_library.py\n  summarize-customer-call  v1.0.0  score 0.94  LIBRARY-READY  ->  PASS (exit 0)"
        },
        "script": "Re-add it correctly and re-run the gate to green. Drive the point home: we didn't just fix a prompt, we made the whole class of failure impossible to merge. Failure-first design applied to a prompt library."
      },
      {
        "segment": "failure",
        "eyebrow": "🏁 Ship It",
        "title": "You built shared infrastructure — versioning is the difference",
        "body": "Step back at what exists now: eight versioned, tested, documented prompts, each mapped to a real workflow, guarded by a written standard and an eval gate that runs itself. That is not a folder of prompts — it is shared infrastructure your whole team can rely on and improve, where every gain compounds instead of evaporating. The one word that makes it a library and not a junk drawer is versioning: changes are traceable, drift is catchable, and there is always a working version to return to. This is the foundation the multi-agent team in Weeks 5 through 7 will be built on.",
        "bullets": [
          "Deliverable: 8+ versioned prompts, each with metadata + a tested example",
          "A CONTRIBUTING standard + eval gate that enforces itself",
          "Portfolio proof: a before/after of one prompt with its eval scores",
          "Next: these prompts become the tools your Week 5-7 agents call"
        ],
        "script": "Close on the assignment and the through-line. Their proof is the before/after eval scores — the number climbing is the story. Then connect forward: in Weeks 5-7 these library prompts become the reliable building blocks your agents invoke. A team without this library builds agents on sand."
      }
    ]
  },
  "5": {
    "monday": [
      {
        "segment": "business-problem",
        "eyebrow": "🔌 The reach problem",
        "title": "AI is only as smart as what it can reach",
        "body": "A model with no connection to your systems is a brilliant consultant locked in a room with no phone. It can reason, but it cannot look up your latest order, read your runbook, or file a ticket. Every genuinely useful AI feature you have shipped so far worked because you hand-fed it context or wired a bespoke tool call. The ceiling on enterprise AI is almost never model intelligence — it is reach: what the model is allowed to see and do in your real systems.",
        "bullets": [
          "A frozen model knows the world up to its training cutoff and nothing about your company today",
          "Useful = reasoning + live context + the ability to take action",
          "This week is about the standard way to grant that reach: MCP"
        ],
        "script": "Open by asking the room: what is the single most useful AI feature you have shipped, and what made it useful? Steer every answer toward the same truth — it was useful because it could reach something real. Set the frame: today is architecture, Thursday we build a server that gives Claude reach."
      },
      {
        "segment": "business-problem",
        "eyebrow": "🧨 The M×N explosion",
        "title": "Why every team keeps rebuilding the same integrations",
        "body": "Before MCP, if you had M AI applications and N systems to connect — Slack, Postgres, GitHub, your CRM — you wrote M×N integrations. Each app re-implemented the tool schema, the auth, the execution, and the error handling for every system, in its own way. Ten apps and ten systems is a hundred bespoke, drifting connectors. Because the tool definitions lived inside each app, nothing was reusable, and every team solved the exact same problem again from scratch.",
        "bullets": [
          "Tool schema + auth + execution copied into every app, once per system",
          "No reuse: your Slack connector cannot be dropped into a teammate's app",
          "Drift: each copy diverges, and a bug fixed in one place stays broken in the others"
        ],
        "script": "Draw the bipartite graph on the board — M apps on the left, N systems on the right, every line drawn. Let the mess speak. Then ask: what number do we want that to be? Land on M+N. That reframing is the whole reason MCP exists."
      },
      {
        "segment": "business-problem",
        "eyebrow": "🔋 USB-C for AI",
        "title": "MCP turns M×N into M+N",
        "body": "Model Context Protocol is an open standard, originated by Anthropic and now broadly adopted, that defines one common way for AI applications to talk to external capabilities. Each system exposes its tools, data, and templates once, behind an MCP server. Any MCP-capable app then speaks the same protocol to consume them. Write the GitHub server once and Claude Desktop, Claude Code, your internal app, and even a competitor's app all use it unchanged. It is the USB-C analogy: one connector standard replaces a drawer full of proprietary cables.",
        "bullets": [
          "Server author integrates a system once, for every client that will ever exist",
          "Client author speaks one protocol, for every server that will ever exist",
          "M+N connectors instead of M×N — and the ecosystem compounds over time"
        ],
        "script": "Make the payoff concrete: the moment MCP exists, integrations become shareable assets, not per-app tax. Preview the week — by Thursday each of you has authored one of these servers exposing a real capability."
      },
      {
        "segment": "architecture",
        "eyebrow": "🏛️ The four roles",
        "title": "Host, client, server, transport — and the 1:1 rule",
        "body": "MCP has four moving parts. The host is the AI application the user runs (Claude Desktop, Claude Code, your app). Inside the host, one MCP client is instantiated per server, holding a dedicated 1:1 connection. The server is a separate program that exposes capabilities. The transport is the pipe between client and server: STDIO for a local subprocess, Streamable HTTP for a remote service. The critical design fact is that 1:1 client-to-server connection — the host runs many clients, but each client talks to exactly one server, which keeps capability namespaces and lifecycles cleanly isolated.",
        "bullets": [
          "Host: the app the human uses; can run many clients at once",
          "Client: one per server, owns a single connection and its lifecycle",
          "Server: exposes tools/resources/prompts; runs as its own process",
          "Transport: STDIO (local subprocess) or Streamable HTTP (remote)"
        ],
        "script": "Draw the host as a big box, three client circles inside it, three server boxes outside, one line each. Emphasize the 1:1 — this is why a misbehaving server cannot corrupt another server's namespace. This diagram is the mental model for the entire intensive."
      },
      {
        "segment": "architecture",
        "eyebrow": "📦 The big shift",
        "title": "Tool definition AND execution move off your app",
        "body": "This is the architectural heart of MCP. In the old world, the tool's JSON schema and the code that runs it both lived inside your application. With MCP, both move out to the server. Your app no longer knows how to query Postgres; it only knows how to speak MCP. It asks the server what tools exist — the server returns their schemas — and when the model chooses one, the app forwards the call and the server executes it. Your application shrinks to a protocol client, and all the integration-specific knowledge (schema, credentials, execution, rate limits) becomes the server's concern, owned and versioned in exactly one place.",
        "bullets": [
          "Before: schema + execution hardcoded into every app",
          "After: the app holds neither; it discovers schemas and forwards calls",
          "The server owns integration logic, auth, and versioning — one source of truth",
          "Consequence: swap or upgrade a server without touching any client"
        ],
        "script": "This is the slide to slow down on. Contrast two boxes: 'app before' bulging with integration code, 'app after' nearly empty with all the mass moved into the server. Tie it back to M+N — this move is what makes the connector reusable."
      },
      {
        "segment": "architecture",
        "eyebrow": "🧩 Three primitives",
        "title": "Tools, resources, prompts — and who controls each",
        "body": "An MCP server exposes exactly three kinds of capability, and the deep distinction is not what they do but who decides to invoke them. Tools are model-controlled: the model chooses to call them during a turn to take an action. Resources are application-controlled: the host app decides what read-only context to pull into the model's window. Prompts are user-controlled: the human explicitly triggers them, typically as a slash command or menu pick. Get the control model right and the rest of MCP design follows; get it wrong and your server fights its clients.",
        "bullets": [
          "Tools = model-controlled actions (the model picks them, like a function call)",
          "Resources = app-controlled read-only context (the app loads them, like GET)",
          "Prompts = user-controlled templates (the human invokes them, like a slash command)",
          "The axis that matters: who initiates — model, app, or user"
        ],
        "script": "Put a three-column table on the board: primitive, analogy, who controls. Fill 'who controls' last and loud — that is the exam-worthy insight. Tell them most beginner MCP bugs are a control-model mismatch, which sets up the deconstruct segment."
      },
      {
        "segment": "architecture",
        "eyebrow": "🔧 Tools, precisely",
        "title": "Tools are actions the model decides to take",
        "body": "A tool is a function the model can invoke, exposed with a name, a description, and a JSON Schema for its inputs. It is model-controlled and generally has side effects or does real work: search a database, create a ticket, send an email. Think POST, not GET. The description and schema are not documentation for humans — they are the model's only guide to when and how to call the tool, so they carry real weight. The server executes the tool and returns structured content the model reads back. Because the model decides when to fire a tool, tools are exactly where you put input validation and authorization.",
        "bullets": [
          "Shape: name + description + inputSchema (JSON Schema) + execution",
          "Model-controlled: the model chooses when to call, mid-turn",
          "Has effects / does work — treat like POST, and guard it accordingly",
          "The description is a prompt to the model, not a code comment"
        ],
        "script": "Stress that the tool description is load-bearing: a vague description means the model calls the tool at the wrong time. Show the mental shape of a tool call and note that Thursday's first checkpoint is exactly this."
      },
      {
        "segment": "architecture",
        "eyebrow": "📚 Resources vs prompts",
        "title": "Read-only context (resources) and reusable templates (prompts)",
        "body": "A resource is identified by a URI (docs://catalog, file:///runbook.md) and carries a MIME type so the client knows how to handle its bytes — text/markdown, application/json, image/png. Resources are read-only and side-effect free, like GET, and the application decides which to load into context. Resource templates parameterize the URI (docs://article/{id}) so one handler serves many items. A prompt is a named, reusable message template the user invokes deliberately, often surfaced as a slash command; it can take arguments and expand into one or more messages. Rule of thumb: data the model reads is a resource, an action the model performs is a tool, a workflow the human triggers is a prompt.",
        "bullets": [
          "Resource: URI + MIME type, read-only context, app-controlled (like GET)",
          "Resource template: docs://article/{id} — one handler, many items",
          "Prompt: named template with arguments, user-invoked (like a slash command)",
          "Decision rule: reads = resource, does = tool, human triggers = prompt"
        ],
        "script": "Hammer the MIME type: it is the contract that tells the client whether it is rendering markdown, parsing JSON, or showing an image. Read the decision rule aloud twice — it is the answer to today's poll and the fix in the deconstruct."
      },
      {
        "segment": "architecture",
        "eyebrow": "📨 Under the hood",
        "title": "It is all JSON-RPC 2.0 over a transport",
        "body": "MCP is not magic — it is JSON-RPC 2.0 messages flowing over a transport. The connection opens with an initialize handshake where client and server negotiate capabilities and protocol version. After that, the client sends requests like tools/list, tools/call, resources/list, resources/read, and prompts/get, and the server answers. STDIO transport runs the server as a local subprocess and pipes JSON over stdin/stdout — perfect for local, single-user tools. Streamable HTTP runs the server as a network service for remote, multi-user access, which is Week 6. Knowing the wire format is exactly why the inspector is so useful: you can watch every message go by.",
        "bullets": [
          "Opens with initialize: capability + protocol-version negotiation",
          "Methods: tools/list, tools/call, resources/read, prompts/get, and more",
          "STDIO = local subprocess over stdin/stdout (this week)",
          "Streamable HTTP = remote, multi-user service (Week 6)"
        ],
        "code": {
          "label": "A tools/call request on the wire (JSON-RPC 2.0)",
          "code": "{\n  \"jsonrpc\": \"2.0\",\n  \"id\": 2,\n  \"method\": \"tools/call\",\n  \"params\": {\n    \"name\": \"search_docs\",\n    \"arguments\": { \"query\": \"reset password\", \"limit\": 5 }\n  }\n}\n\n// the server replies with matching content and the same id"
        },
        "script": "Show the raw message so MCP stops feeling abstract. Point out id, method, and params.arguments. Tell them the inspector we open in the micro-build is just a friendly window onto exactly these messages."
      },
      {
        "segment": "deconstruct",
        "eyebrow": "🔎 Broken by design",
        "title": "A server that exposes reference data as a tool",
        "body": "Here is a real anti-pattern. The author has a read-only company refund policy the AI needs for context, and they expose it as a tool called get_policy() that returns the whole document. It technically works in a demo, but it is modeled wrong: read-only context has been dressed up as an action. Read the code and notice that nothing changes as a result of calling it — there is no verb, no side effect, no work. Now watch what that miscategorization costs the moment a client tries to use it correctly.",
        "bullets": [
          "The data never changes as a result of the call — it is pure context",
          "Yet it is a tool, so only the model can decide to fetch it",
          "The client cannot preload it the way it would preload a resource"
        ],
        "code": {
          "label": "The mismodeled server (anti-pattern)",
          "code": "# ANTI-PATTERN: read-only context modeled as an action\nPOLICY = open('refund_policy.md').read()\n\n@mcp.tool()\ndef get_policy() -> str:\n    '''Return the full company refund policy.'''\n    return POLICY   # nothing changes — this is data, not an action"
        },
        "script": "Read the code and ask the room to spot the smell before you name it. Someone will say 'that is just data.' Exactly — hold that thought for the next slide."
      },
      {
        "segment": "deconstruct",
        "eyebrow": "💥 Why the client mis-uses it",
        "title": "A control-model mismatch has real consequences",
        "body": "Because get_policy is a tool, it is model-controlled: the policy only enters context if the model happens to decide to call it, which is unreliable and burns a tool-call round trip every time. The application cannot attach the policy up front the way it attaches resources, and the user cannot pin it. Worse, the model may skip it entirely and answer from stale memory, or call it repeatedly in one turn. The primitive choice dictates who can initiate the load — and here the wrong choice took control away from the app, which is the one component that actually knows this policy is always relevant.",
        "bullets": [
          "Model-controlled means the policy loads only if the model elects to — unreliable",
          "Every fetch is a wasted tool round trip for data that could be preloaded",
          "The app cannot attach it as context; the user cannot pin it",
          "Symptom: inconsistent answers that sometimes ignore the policy entirely"
        ],
        "script": "Tie each symptom back to the control axis from the architecture segment. This is the payoff of that table — the bug becomes legible the instant you ask 'who should control this load?'"
      },
      {
        "segment": "deconstruct",
        "eyebrow": "✅ The fix",
        "title": "Reclassify it as a resource with a MIME type",
        "body": "The document is read-only context, so it is a resource. Expose it at a stable URI with the right MIME type, and now the application can load it into context deterministically, the user can reference it, and no tool round trip is spent. The decision rule does all the work: reads become resources, does become tools, human-triggered workflows become prompts. Same data, correct primitive, and every client can now consume it the way it was meant to be consumed.",
        "bullets": [
          "Read-only ⇒ resource at a stable URI with a MIME type",
          "The app loads it deterministically; zero wasted tool calls",
          "One-line rule prevents this entire class of bug"
        ],
        "code": {
          "label": "Corrected: the same data as a resource",
          "code": "# CORRECT: read-only context is a resource with a MIME type\n@mcp.resource('docs://refund-policy', mime_type='text/markdown')\ndef refund_policy() -> str:\n    '''The company refund policy, loadable as context.'''\n    return open('refund_policy.md').read()"
        },
        "script": "Show before/after side by side in words. Land the rule one more time — reads = resource, does = tool, triggers = prompt — then transition: now let's build a correct one from scratch."
      },
      {
        "segment": "micro-build",
        "eyebrow": "🛠️ Scaffold",
        "title": "A FastMCP server in fifteen lines",
        "body": "We use the official MCP Python SDK, whose FastMCP class turns decorated functions into a fully compliant server. Create an isolated project with uv, add the SDK, and write a server object with a name — that name is how clients identify this server. What you have then is a complete, runnable (if empty) MCP server; everything else this week is just decorating functions onto it. We run it over STDIO because we are local and single-user for now.",
        "bullets": [
          "uv gives you a clean, reproducible Python environment",
          "FastMCP('support-kb') is the entire server object",
          "mcp.run(transport='stdio') speaks the protocol over stdin/stdout"
        ],
        "code": {
          "label": "Terminal + server.py skeleton",
          "code": "# one-time project setup\nuv init support-kb && cd support-kb\nuv add \"mcp[cli]\"\n\n# server.py\nfrom mcp.server.fastmcp import FastMCP\n\nmcp = FastMCP('support-kb')\n\nif __name__ == '__main__':\n    mcp.run(transport='stdio')"
        },
        "script": "Do this live. Type the commands, create server.py, run it, show it sits waiting on STDIO. Do not over-explain — the point is how little ceremony there is to a working server."
      },
      {
        "segment": "micro-build",
        "eyebrow": "🔧 One tool",
        "title": "Define search_docs with validated input",
        "body": "Decorate a function with @mcp.tool() and FastMCP does the rest: it reads your type hints to generate the input JSON Schema, uses the docstring as the tool description the model sees, and registers execution. We type query as a constrained string and give it a specific docstring, because those two things are the model's entire interface to the tool. Returning a list of dicts hands the model structured content it can read and cite back, rather than an opaque blob of text.",
        "bullets": [
          "@mcp.tool() registers name, schema, description, and execution at once",
          "Type hints ⇒ JSON Schema; docstring ⇒ the model-facing description",
          "Constrain inputs with Annotated + Field so bad calls are rejected early",
          "Return structured data (list[dict]), not a wall of prose"
        ],
        "code": {
          "label": "server.py — the search_docs tool",
          "code": "from typing import Annotated\nfrom mcp.server.fastmcp import FastMCP\nfrom pydantic import Field\n\nmcp = FastMCP('support-kb')\n\nKB = [\n    {'id': 'kb-101', 'title': 'Reset your password', 'body': 'Settings > Security > Reset'},\n    {'id': 'kb-102', 'title': 'Enable two-factor auth', 'body': 'Security > 2FA'},\n]\n\n@mcp.tool()\ndef search_docs(\n    query: Annotated[str, Field(min_length=1, max_length=200, description='Search terms')],\n    limit: Annotated[int, Field(ge=1, le=25)] = 5,\n) -> list[dict]:\n    '''Search the support knowledge base and return matching articles by relevance.'''\n    q = query.lower()\n    hits = [a for a in KB if q in a['title'].lower() or q in a['body'].lower()]\n    return [{'id': a['id'], 'title': a['title']} for a in hits[:limit]]"
        },
        "script": "Point at the docstring and say 'this is a prompt — write it like one.' Point at the Field constraints and foreshadow Thursday's failure injection: this is where validation lives, and it is exactly what we will delete to break the server."
      },
      {
        "segment": "micro-build",
        "eyebrow": "🔬 The inspector",
        "title": "Exercise the server before any client exists",
        "body": "The MCP Inspector is a browser tool that connects to your server and lets you list and invoke tools, read resources, and render prompts by hand — no client code required. The Python SDK launches it with mcp dev server.py, which starts your server and opens the Inspector wired to it. This is your primary debugging surface all week: you see the initialize handshake, the tool schemas the server advertises, and the raw request and response for every call. Prove the server works here first; only then write a client.",
        "bullets": [
          "mcp dev server.py starts the server and opens the Inspector",
          "Left panel shows the tools/resources/prompts your server advertises",
          "You can fill in arguments and call a tool with zero client code",
          "You see the actual JSON-RPC request and response for every call"
        ],
        "code": {
          "label": "Launch the inspector",
          "code": "# launches your server AND opens the Inspector wired to it\nmcp dev server.py\n\n# alternative, without the SDK helper:\nnpx @modelcontextprotocol/inspector uv run server.py"
        },
        "script": "Run it live. Walk the panels. This removes the fear — they can always see what their server is actually exposing. Set the rule for Thursday: inspector-green before any client code gets written."
      },
      {
        "segment": "micro-build",
        "eyebrow": "▶️ Call it",
        "title": "Invoke search_docs and read the response",
        "body": "In the Inspector, open Tools, select search_docs, type a query, and run it. You get back the structured result your function returned, wrapped in the protocol's content envelope, plus the exact JSON-RPC that crossed the wire. That round trip — client asks tools/call, server executes, structured content returns — is the atom of everything we build for the rest of the intensive. You have now seen a complete MCP interaction end to end without writing a single line of client code.",
        "bullets": [
          "Tools tab ⇒ search_docs ⇒ enter arguments ⇒ Run",
          "The response is your list[dict] inside the MCP content envelope",
          "You just watched a full tools/call round trip, live",
          "Thursday: add a resource and a prompt, then connect a real client"
        ],
        "script": "Do the call live and let them see structured JSON come back. Recap the three primitives and the control axis in one breath. Trailer Thursday: same server, add resource + prompt, then connect a real client and break it on purpose."
      }
    ],
    "thursday": [
      {
        "segment": "build-map",
        "eyebrow": "🗺️ Today's result",
        "title": "By the end: a real MCP server, proven and called",
        "body": "Two hours from now you will have a Support Knowledge MCP server exposing all three primitives — a search_docs tool, a documentation resource with a MIME type, and a support-reply prompt — verified in the Inspector and called by a real client. We move in four checkpoints, each one runnable before we advance. If a checkpoint is not green in the Inspector, we do not move on. That discipline is the difference between a demo that works once and a server you can build on next week.",
        "bullets": [
          "CP0 scaffold that starts → CP1 a validated tool → CP2 resource + prompt → CP3 a client calls it",
          "Inspector-green gate between every checkpoint",
          "Scenario: a Support Knowledge base Claude can search and answer from"
        ],
        "script": "Show the four-checkpoint map. Set the gate rule explicitly — nothing advances until the Inspector shows it working. Tell them Week 6 takes this exact server to production, so building it cleanly now pays off directly."
      },
      {
        "segment": "build-map",
        "eyebrow": "🧰 Readiness",
        "title": "What you need open before we type",
        "body": "You need Python 3.10 or newer, the uv package manager, Node installed (the Inspector runs on it), and your repo open. We build against a tiny in-memory knowledge base so nobody is blocked on database access today — Week 6 swaps that for a real system. The scenario is deliberately boring and real: a support team wants Claude to search their KB, cite an article, and draft a reply. Boring-and-real is exactly the kind of capability MCP was built for.",
        "bullets": [
          "Python 3.10+, uv, Node (the Inspector needs it), repo open",
          "In-memory KB today; a real data source arrives in Week 6",
          "Target capability: search KB → cite article → draft reply"
        ],
        "code": {
          "label": "Sanity check your toolchain",
          "code": "python --version   # need 3.10 or newer\nuv --version\nnode --version     # the Inspector runs on Node"
        },
        "script": "Have everyone run the three version checks now and fix any red before we start typing. Ninety seconds here saves twenty minutes mid-build."
      },
      {
        "segment": "guided-build",
        "eyebrow": "0️⃣ Scaffold",
        "title": "CP0 — a server that starts",
        "body": "Initialize the project with uv, add the MCP SDK, and create server.py with a named FastMCP instance and the STDIO run block. This is the same skeleton from Monday, now living in your own repo. Run it once to confirm it starts and waits on STDIO without error. A server that boots cleanly is checkpoint zero — do not add capabilities until this is green, because a server that will not start hides every later bug behind an import error.",
        "bullets": [
          "uv init, then uv add \"mcp[cli]\"",
          "FastMCP('support-kb') + mcp.run(transport='stdio')",
          "Confirm it starts with no import or syntax errors before advancing"
        ],
        "code": {
          "label": "CP0 — scaffold and run (copy-ready)",
          "code": "uv init support-kb && cd support-kb\nuv add \"mcp[cli]\"\n\n# server.py\nfrom mcp.server.fastmcp import FastMCP\n\nmcp = FastMCP('support-kb')\n\nif __name__ == '__main__':\n    mcp.run(transport='stdio')"
        },
        "script": "Type it live and run it. If a student's server will not start, stop and fix it now — everything downstream depends on a clean boot. Prompt to give Claude Code if pairing: 'Create an MCP server with FastMCP named support-kb that runs over stdio.'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "1️⃣ The tool",
        "title": "CP1 — search_docs with a validated boundary",
        "body": "Add the seed knowledge base and the search_docs tool. Constrain the inputs with Annotated + Field: a non-empty, bounded query and a bounded limit. FastMCP turns those constraints into the JSON Schema the model must satisfy, so malformed calls are rejected at the protocol boundary before your code ever runs. Return a list of dicts — id, title, score — so the model receives structured, citable results instead of prose. Call it in the Inspector and confirm rows come back before you move on.",
        "bullets": [
          "Annotated + Field(min_length, max_length, ge, le) = validation for free",
          "The docstring is the model's instruction manual — make it specific",
          "Return structured, citable rows the model can reference by id"
        ],
        "code": {
          "label": "server.py — seed KB + validated tool",
          "code": "from typing import Annotated\nfrom mcp.server.fastmcp import FastMCP\nfrom pydantic import Field\n\nmcp = FastMCP('support-kb')\n\nKB = [\n    {'id': 'kb-101', 'title': 'Reset your password', 'body': 'Settings > Security > Reset'},\n    {'id': 'kb-102', 'title': 'Enable two-factor auth', 'body': 'Security > 2FA'},\n    {'id': 'kb-103', 'title': 'Update billing card', 'body': 'Billing > Payment method'},\n]\n\n@mcp.tool()\ndef search_docs(\n    query: Annotated[str, Field(min_length=1, max_length=200, description='What to search for')],\n    limit: Annotated[int, Field(ge=1, le=25)] = 5,\n) -> list[dict]:\n    '''Search the support KB; returns matching articles as {id, title, score}.'''\n    q = query.lower()\n    scored = []\n    for a in KB:\n        score = a['title'].lower().count(q) * 2 + a['body'].lower().count(q)\n        if score:\n            scored.append({'id': a['id'], 'title': a['title'], 'score': score})\n    scored.sort(key=lambda r: r['score'], reverse=True)\n    return scored[:limit]"
        },
        "script": "Emphasize the two model-facing surfaces again — docstring and schema. Have them call the tool in the Inspector with a good query, watch scored rows come back, then keep that Inspector tab open for the rest of the build."
      },
      {
        "segment": "guided-build",
        "eyebrow": "2️⃣ A resource",
        "title": "CP2a — expose the KB as a resource with a MIME type",
        "body": "Now add read-only context as a resource, not a tool. A static resource at docs://catalog returns the article index as application/json. A resource template at docs://article/{doc_id} returns one article body as text/markdown, so a single handler serves every article addressable by URI. The MIME type is the contract — it tells the client to parse JSON here and render markdown there. This is the corrected pattern from Monday's deconstruct, now built into your own server rather than critiqued on a slide.",
        "bullets": [
          "Static resource docs://catalog ⇒ application/json index",
          "Template docs://article/{doc_id} ⇒ text/markdown body, one handler many items",
          "MIME type is the handling contract, never optional",
          "Resource = the app loads it as context; no tool round trip is spent"
        ],
        "code": {
          "label": "server.py — a resource and a resource template",
          "code": "import json\n\n@mcp.resource('docs://catalog', mime_type='application/json')\ndef catalog() -> str:\n    '''Read-only index of every KB article.'''\n    return json.dumps([{'id': a['id'], 'title': a['title']} for a in KB])\n\n@mcp.resource('docs://article/{doc_id}', mime_type='text/markdown')\ndef article(doc_id: str) -> str:\n    '''One article body, addressed by id.'''\n    match = next((a for a in KB if a['id'] == doc_id), None)\n    return match['body'] if match else f'# Not found\\n\\nNo article {doc_id}.'"
        },
        "script": "Contrast with Monday's anti-pattern out loud: this same data could have been a tool, but it is read-only, so it is a resource. Show both resources appearing in the Inspector's Resources tab and read one to confirm its MIME type."
      },
      {
        "segment": "guided-build",
        "eyebrow": "3️⃣ A prompt",
        "title": "CP2b — a user-invoked support-reply prompt",
        "body": "Add the third primitive: a prompt the human triggers to standardize a workflow. support_reply takes a topic and an optional tone and expands into a ready-to-run template that tells Claude to search the KB, cite an article by id, and draft a reply. Prompts are user-controlled — they surface as slash commands or menu picks in the client — so this is how you ship a repeatable team workflow, not just raw capability. You can return a string or a list of typed messages; we start with a string for clarity and note the message form for multi-turn workflows.",
        "bullets": [
          "@mcp.prompt() registers a named, argument-taking template",
          "User-controlled: it appears as a slash command / menu action in the client",
          "Encapsulates a workflow — search → cite → draft — the same way every time",
          "Return a string, or base.UserMessage/AssistantMessage for multi-turn"
        ],
        "code": {
          "label": "server.py — the support_reply prompt",
          "code": "@mcp.prompt()\ndef support_reply(topic: str, tone: str = 'friendly') -> str:\n    '''Template a support reply grounded in the KB.'''\n    return (\n        f'Search the knowledge base for the topic: {topic}. '\n        f'Cite the best matching article by id, then draft a {tone}, concise reply '\n        f'to a customer about {topic}. If nothing matches, say so and offer to escalate.'\n    )"
        },
        "script": "Frame prompts as shipping a workflow, not just a capability. Note this is where the Week 4 Prompt Library meets MCP — your best, tested prompts can ship as server prompts that every client can invoke by name."
      },
      {
        "segment": "guided-build",
        "eyebrow": "🔬 Prove all three",
        "title": "Verify tools, resources, and prompts in the Inspector",
        "body": "Relaunch with mcp dev server.py and walk all three tabs. Tools: call search_docs and confirm structured rows. Resources: read docs://catalog and docs://article/kb-101 and confirm the MIME types match what you declared. Prompts: render support_reply with a topic and read the expanded template. Seeing all three primitives light up correctly is the CP2 gate. If a MIME type is wrong or a prompt fails to expand, fix it here — before a client is anywhere near it.",
        "bullets": [
          "Tools tab: search_docs returns structured rows",
          "Resources tab: both URIs read, MIME types match your declarations",
          "Prompts tab: support_reply expands with its arguments",
          "Green across all three is your CP2 gate — do not skip it"
        ],
        "code": {
          "label": "Relaunch the inspector",
          "code": "mcp dev server.py\n# Tools     -> search_docs\n# Resources -> docs://catalog, docs://article/kb-101\n# Prompts   -> support_reply(topic=..., tone=...)"
        },
        "script": "Do the full walk live. This is the confidence moment — the whole server, all three primitives, provable without a line of client code. Only now do we write a client."
      },
      {
        "segment": "guided-build",
        "eyebrow": "4️⃣ A client",
        "title": "CP3 — a minimal client that connects and calls",
        "body": "Write a small Python client using the SDK's stdio_client and ClientSession. It launches your server as a subprocess, runs the initialize handshake, lists tools and resources, calls search_docs, and reads a resource. This is the same sequence the Inspector automated, now in code you own. Notice the shape: open the transport, open the session, initialize, then list/call/read. That is every MCP client, from this fifteen-line script all the way up to Claude Desktop.",
        "bullets": [
          "stdio_client + ClientSession = the client core",
          "Always call initialize() first — it negotiates capabilities",
          "list_tools / call_tool / read_resource mirror the protocol methods",
          "The same lifecycle scales up to production clients unchanged"
        ],
        "code": {
          "label": "client.py — connect, list, call, read",
          "code": "import asyncio\nfrom mcp import ClientSession, StdioServerParameters\nfrom mcp.client.stdio import stdio_client\n\nasync def main():\n    params = StdioServerParameters(command='uv', args=['run', 'server.py'])\n    async with stdio_client(params) as (read, write):\n        async with ClientSession(read, write) as session:\n            await session.initialize()                     # capability handshake\n            tools = await session.list_tools()\n            print('tools:', [t.name for t in tools.tools])\n            result = await session.call_tool('search_docs', {'query': 'password'})\n            print('result:', result.content)\n            doc = await session.read_resource('docs://article/kb-101')\n            print('resource:', doc.contents[0].text[:80])\n\nasyncio.run(main())"
        },
        "script": "Run the client live against the server. Print the tool names and the call result. Land it: they have now authored both halves of an MCP conversation — the server and a client that speaks to it."
      },
      {
        "segment": "guided-build",
        "eyebrow": "🔌 A real client",
        "title": "Register the server with Claude Desktop or Claude Code",
        "body": "The final step is connecting your server to a real host so a human can use it in conversation. For Claude Desktop, add an entry under mcpServers in claude_desktop_config.json pointing at your run command, restart, and your tools, resources, and prompts appear in the app. For Claude Code, one command registers it. Now Claude can search your KB and invoke your support-reply prompt inside a normal chat — the capability you built is live in a product people actually use, with zero code changes to the server.",
        "bullets": [
          "Claude Desktop: add to mcpServers in claude_desktop_config.json, then restart",
          "Claude Code: claude mcp add support-kb -- uv run server.py",
          "Your prompt shows up as a slash command; your tools are callable in chat",
          "Same server, zero code changes — the M+N payoff, realized"
        ],
        "code": {
          "label": "Register with a host (Desktop config + Claude Code)",
          "code": "// claude_desktop_config.json\n{\n  \"mcpServers\": {\n    \"support-kb\": {\n      \"command\": \"uv\",\n      \"args\": [\"--directory\", \"/abs/path/support-kb\", \"run\", \"server.py\"]\n    }\n  }\n}\n\n# Claude Code -- one command:\nclaude mcp add support-kb -- uv run server.py"
        },
        "script": "If time allows, demo it live in Claude Desktop or Claude Code. Seeing the prompt appear as a slash command is the mic-drop. Reconnect to Monday: you wrote this integration once, and every client uses it unchanged."
      },
      {
        "segment": "failure",
        "eyebrow": "💣 Break it",
        "title": "A tool with no validation, fed garbage",
        "body": "Let's earn the hardening. Strip the type hints and the Field constraints off search_docs so FastMCP can generate no meaningful schema, and index the KB directly with the raw query. Now call it from the Inspector with an empty string, a 5,000-character string, and a number. The lookup throws a KeyError deep inside your function, and what the model receives is an opaque internal error with no guidance. Nothing rejected the bad input at the boundary — because you deleted the boundary.",
        "bullets": [
          "No type hints ⇒ no useful input schema ⇒ anything gets through",
          "Raw KB[query] throws KeyError deep in the call stack",
          "The model sees an unhelpful internal error, not a usable message",
          "Failure mode: the further from the boundary an error is, the worse it reads"
        ],
        "code": {
          "label": "The un-hardened tool (do NOT ship)",
          "code": "# NO validation -- do not ship this\nKB_BY_QUERY = {'password': ['kb-101']}\n\n@mcp.tool()\ndef search_docs(query):            # no type hint ⇒ no useful schema\n    return KB_BY_QUERY[query]       # KeyError deep in the server on any miss"
        },
        "script": "Run the three bad inputs live in the Inspector and show the ugly stack error. Ask the room: whose job was it to stop this? Answer: the boundary we just deleted."
      },
      {
        "segment": "failure",
        "eyebrow": "🛡️ Harden",
        "title": "Validate at the boundary, fail with a clear message",
        "body": "Restore the constraints and add an explicit guard. Annotated + Field rejects empty and oversized queries at the protocol boundary, before your code runs, with a schema error the client can actually understand. Inside the tool, handle the no-results case by returning a structured empty result instead of throwing — an empty list with a message is a valid answer, not a crash. Re-run the same three bad inputs: the malformed calls are refused with a clear reason, and the valid-but-empty query returns clean structured data. The error moved from deep and opaque to boundary and legible.",
        "bullets": [
          "Field(min_length=1, max_length=200) refuses bad input at the schema boundary",
          "Guard the miss: return {results: [], message: ...}, never throw on 'not found'",
          "The same bad inputs now yield clear, actionable responses",
          "Rule: validate at the edge, return structured results, reserve exceptions for the truly exceptional"
        ],
        "code": {
          "label": "server.py — hardened boundary",
          "code": "from typing import Annotated\nfrom pydantic import Field\n\n@mcp.tool()\ndef search_docs(\n    query: Annotated[str, Field(min_length=1, max_length=200)],\n    limit: Annotated[int, Field(ge=1, le=25)] = 5,\n) -> dict:\n    '''Search the KB. Bad input is rejected at the boundary; a miss returns empty, never throws.'''\n    q = query.strip().lower()\n    hits = [a for a in KB if q in a['title'].lower() or q in a['body'].lower()]\n    if not hits:\n        return {'results': [], 'message': f'No articles matched {q!r}.'}\n    return {'results': [{'id': a['id'], 'title': a['title']} for a in hits[:limit]]}"
        },
        "script": "Re-run the exact three inputs from the previous slide and show the difference. This is the Build-Break-Harden loop in miniature — you built it, you broke it, now it survives. Have them do the same on their own tool before we close."
      },
      {
        "segment": "failure",
        "eyebrow": "🧯 State + idempotency",
        "title": "The failure mode you cannot see: hidden server state",
        "body": "One last trap. If your tool mutates module-level state or caches per-connection assumptions, it works in the Inspector's single session and breaks the moment a second client connects or the server restarts mid-conversation. Keep tools stateless where you can: same inputs, same outputs, no dependence on what happened on a previous call. That property is exactly what lets Week 6 scale this server to multiple instances behind Streamable HTTP without corruption. Idempotent, stateless tools are not a nicety here — they are the precondition for production.",
        "bullets": [
          "Module-level mutable state looks fine in one session, corrupts under two",
          "Stateless tools: same input ⇒ same output, no cross-call memory",
          "This is precisely what makes the Week 6 scale-out safe",
          "Assignment: mcp-server repo with tool + resource + prompt; proof = an Inspector demo"
        ],
        "script": "Close the loop on the whole week: three primitives chosen by control model, validated boundaries, stateless tools. Recap the assignment and its proof — the Inspector demo. Trailer Week 6: sampling, notifications, roots, transports, and wiring this exact server to a real system."
      }
    ]
  },
  "6": {
    "monday": [
      {
        "segment": "business-problem",
        "eyebrow": "🏗️ The gap",
        "title": "The demo worked. Production didn't.",
        "body": "In Week 5 you built an MCP server that exposes a real capability through tools, resources, and prompts. It works on your laptop, over STDIO, for one user. That is a prototype. The moment it touches a real business system with real users, five things a prototype ignores become non-negotiable: long operations need feedback, file access needs a boundary, the transport has to scale, in-memory state breaks under load balancing, and the server sometimes needs the model itself. Today is about closing that gap: taking a toy server to production-shaped.",
        "bullets": [
          "Prototype = works once, locally, for you",
          "Production = works every time, at scale, for everyone, safely",
          "This is the last session of Intensive 2 — your deliverable is an integrated, hardened server"
        ],
        "script": "Open by asking: 'How many of you have shipped something that demoed perfectly and then fell over in production?' Let hands go up. Say: 'That is the exact gap we close today. The MCP spec has features specifically for this — most tutorials never reach them.'"
      },
      {
        "segment": "business-problem",
        "eyebrow": "💸 The cost of skipping this",
        "title": "Each production feature you skip is a specific failure in production",
        "body": "These are not nice-to-haves — every one maps to an incident. Skip progress notifications and a 40-second AR export looks frozen; the user cancels and retries, doubling load. Skip roots and a path bug lets the model read your .env. Skip the transport decision and you cannot put the server behind a load balancer. Assume statefulness and the server shatters the moment you run two copies. Skip sampling and you rebuild an LLM client inside every tool instead of borrowing the one the user already trusts.",
        "bullets": [
          "No progress feedback → users cancel long jobs, retry storms",
          "Unbounded roots → the model reads secrets and customer data",
          "Wrong transport → cannot scale past one machine",
          "Stateful assumption → breaks at instance #2",
          "No sampling → duplicated, ungoverned model calls in every tool"
        ],
        "script": "Walk the list slowly. For each, name the incident, not the feature. The point: 'advanced MCP' is not advanced for its own sake — each primitive is a production defect it prevents."
      },
      {
        "segment": "business-problem",
        "eyebrow": "🧨 The real example",
        "title": "A server that assumed it was stateful — and died at two instances",
        "body": "A team shipped a StreamableHTTP MCP server that stored each session's context in a Node Map keyed by session id. It worked in staging on one container. In production they scaled to three replicas behind a round-robin load balancer. A client would initialize on replica A, then its next request would land on replica B, which had never heard of that session id and returned 'Bad Request: No valid session ID'. Intermittent, unreproducible-on-a-laptop, and caused entirely by one design choice: in-memory session state plus horizontal scaling. This is the tension for the whole week.",
        "bullets": [
          "Session created on replica A, next call routed to replica B",
          "B has no record of the session → 400, connection dies",
          "Fails ~2/3 of the time with 3 replicas — looks 'random'",
          "Root cause: stateful in-memory map, not a bug in any handler"
        ],
        "script": "Tell it as a war story. Pause on: 'Nothing in any single request handler was wrong. The bug was an architectural assumption — statefulness — colliding with scaling.' Promise: 'By the end you will be able to see this coming.'"
      },
      {
        "segment": "architecture",
        "eyebrow": "🔁 Foundation",
        "title": "MCP is bidirectional JSON-RPC 2.0 — both sides can initiate",
        "body": "Everything advanced follows from one fact: MCP is not request/response like REST. It is JSON-RPC 2.0 running in both directions over a persistent connection. There are exactly three message shapes: requests (have an id, expect a response), responses (carry the matching id plus result or error), and notifications (a method with no id, fire-and-forget, no reply). The client sends requests like tools/call. But the server can send requests back to the client — sampling/createMessage, roots/list. And either side streams notifications — notifications/progress, notifications/message. Sampling, roots, and progress are just specific uses of this two-way channel.",
        "bullets": [
          "Request: { id, method, params } → expects a response with that id",
          "Response: { id, result } or { id, error }",
          "Notification: { method, params } — no id, no reply",
          "Server→client requests: sampling/createMessage, roots/list, elicitation/create",
          "Both directions: notifications/progress, notifications/message, *_list_changed"
        ],
        "code": {
          "label": "The three message shapes on the wire",
          "code": "// client -> server: a request (has id)\n{ \"jsonrpc\": \"2.0\", \"id\": 7, \"method\": \"tools/call\",\n  \"params\": { \"name\": \"summarize_account\", \"arguments\": { \"customerId\": \"C-1042\" } } }\n\n// server -> client: a request BACK (sampling) — server borrows the client's model\n{ \"jsonrpc\": \"2.0\", \"id\": 31, \"method\": \"sampling/createMessage\",\n  \"params\": { \"messages\": [ ... ], \"maxTokens\": 400 } }\n\n// server -> client: a notification (no id, no response expected)\n{ \"jsonrpc\": \"2.0\", \"method\": \"notifications/progress\",\n  \"params\": { \"progressToken\": 7, \"progress\": 12, \"total\": 40 } }"
        },
        "script": "Draw the arrows on the board: client box, server box, arrows both ways. 'REST people assume the server only ever answers. MCP servers can ask. Hold that idea — it is the whole reason sampling and roots exist.'"
      },
      {
        "segment": "architecture",
        "eyebrow": "🧠 Sampling",
        "title": "Sampling: the server borrows the client's brain",
        "body": "Sampling inverts the usual flow. Instead of the server calling an LLM API directly, a tool asks the client to run a completion on its behalf, via the sampling/createMessage request. Why hand it to the client? Three reasons that matter to an enterprise. The client owns the model choice and the API key, so the server stays model-agnostic and holds no credentials. The client is the human-in-the-loop point — it can show the prompt and require approval before spending tokens. And the server ships without an LLM dependency, so it runs in a locked-down environment that has no outbound API access of its own.",
        "bullets": [
          "Tool needs reasoning → calls server.server.createMessage(...)",
          "That becomes a sampling/createMessage request to the CLIENT",
          "Client runs the model (its key, its choice, its approval gate) and returns the text",
          "Server stays credential-free and model-agnostic"
        ],
        "code": {
          "label": "A tool that requests a model call through the client",
          "code": "server.registerTool(\"summarize_account\", {\n  title: \"Summarize Account\",\n  description: \"Summarize a customer's AR history using the client's model\",\n  inputSchema: { customerId: z.string() },\n}, async ({ customerId }) => {\n  const report = await ar.agingReport(customerId);   // long text, no LLM here\n  const result = await server.server.createMessage({  // -> sampling/createMessage\n    messages: [{ role: \"user\", content: { type: \"text\",\n      text: `Summarize this AR aging report in 3 bullets:\\n${report}` } }],\n    systemPrompt: \"You are a terse revenue analyst.\",\n    maxTokens: 400,\n  });\n  const text = result.content.type === \"text\" ? result.content.text : \"\";\n  return { content: [{ type: \"text\", text }] };\n});"
        },
        "script": "Emphasize the governance angle for this audience: 'The server never sees the API key. The user's client decides which model, and can require a click before any tokens are spent. That is exactly the control an enterprise security team asks for.'"
      },
      {
        "segment": "architecture",
        "eyebrow": "📊 Notifications",
        "title": "Progress and logs: making long operations observable",
        "body": "A tool that reads 40 files or paginates a big API can run for tens of seconds. Over a persistent connection the server can narrate that work with two kinds of notification. Progress: the client attaches a progressToken in the request metadata, and the server emits notifications/progress with progress and total so the UI can render a real bar. Logging: the server emits notifications/message at info/warning/error levels, which is your structured-observability stream flowing back to the client's console. Both are fire-and-forget — no id, no response — so they never block the tool's actual result.",
        "bullets": [
          "notifications/progress: { progressToken, progress, total, message }",
          "progressToken comes from the client's request _meta — only send if present",
          "notifications/message: structured logs at info | warning | error",
          "Fire-and-forget: they stream alongside the work, don't block the result"
        ],
        "code": {
          "label": "The progress + log message shapes",
          "code": "// progress — client passed _meta.progressToken on the tools/call request\n{ \"method\": \"notifications/progress\",\n  \"params\": { \"progressToken\": 7, \"progress\": 18, \"total\": 40,\n              \"message\": \"Indexed invoice_2024_18.pdf\" } }\n\n// log — server must declare the `logging` capability at startup\n{ \"method\": \"notifications/message\",\n  \"params\": { \"level\": \"info\", \"logger\": \"revops-server\",\n              \"data\": { \"event\": \"db_query\", \"rows\": 214, \"duration_ms\": 63 } } }"
        },
        "script": "Tie back to the Observability Framework from earlier weeks: 'notifications/message IS your JSON-structured log stream, but flowing to the operator in real time. Level, logger, structured data — same discipline, live channel.'"
      },
      {
        "segment": "architecture",
        "eyebrow": "🚪 Roots",
        "title": "Roots: the file-access boundary — declared by the client, enforced by the server",
        "body": "Roots answer 'which parts of the filesystem may this server touch?' Here is the subtlety most people miss: roots are a CLIENT capability. The client advertises a set of allowed directories, and the server queries them with a roots/list request. Roots by themselves are advisory — they tell the server the intended boundary; they do not physically stop anything. The server has to enforce them. Real hardening means: read the client's roots, then for every path the model gives you, resolve the real path (realpath, to defeat symlinks and ../ traversal) and verify it still sits inside an allowed root before you open the file.",
        "bullets": [
          "Client declares roots (a `roots` capability); server asks via roots/list",
          "Roots are advisory boundaries — the SERVER must enforce them",
          "Enforcement = realpath the requested path, check it's inside an allowed root",
          "realpath defeats ../../ traversal and symlink escape; string-prefix alone does not"
        ],
        "code": {
          "label": "Query roots, then enforce with a real-path check",
          "code": "import path from \"node:path\";\nimport fs from \"node:fs/promises\";\nimport { fileURLToPath } from \"node:url\";\n\nasync function assertInRoots(server, requested) {\n  const { roots } = await server.server.listRoots();          // ask the client\n  const real = await fs.realpath(requested);                  // resolve symlinks + ..\n  const bases = await Promise.all(\n    roots.map(r => fs.realpath(fileURLToPath(r.uri)))\n  );\n  const ok = bases.some(b => real === b || real.startsWith(b + path.sep));\n  if (!ok) throw new Error(`Access denied: ${requested} is outside declared roots`);\n  return real;\n}"
        },
        "script": "Stress the ownership flip: 'The CLIENT says where you may go. The SERVER is responsible for actually staying there. Advisory versus enforced — that distinction is the difference between a comment and a control.'"
      },
      {
        "segment": "architecture",
        "eyebrow": "🔌 Transports",
        "title": "STDIO vs StreamableHTTP, stateless vs stateful — the deployment decision",
        "body": "The transport is how bytes move between client and server, and it is a deployment decision, not a coding detail. STDIO: the client launches the server as a subprocess and talks over stdin/stdout. It is perfect for local, single-user tools — one process per client, in-memory state is fine because nothing scales. StreamableHTTP: the server is a web service at one /mcp endpoint (POST for client→server, an optional SSE stream for server→client). It is what you need for a remote, multi-user integration. Then a second axis: stateful (keeps per-session state in memory — cannot scale horizontally without sticky sessions or a shared store) versus stateless (every request is self-contained — scales behind any load balancer).",
        "bullets": [
          "STDIO → local, single-user, one subprocess per client; in-memory state is fine",
          "StreamableHTTP → remote, multi-user, one /mcp endpoint over HTTP",
          "Stateful → per-session memory; breaks under horizontal scaling unless sticky/shared",
          "Stateless → self-contained requests; scales horizontally by default",
          "Public multi-user integration → StreamableHTTP, stateless where possible"
        ],
        "code": {
          "label": "Decision table (say it out loud, don't just read)",
          "code": "deployment                       -> transport            state\n----------------------------------------------------------------\nlocal dev tool, one user         -> STDIO                in-memory ok\nteam tool behind one server      -> StreamableHTTP       stateful ok\npublic, multi-user, autoscaled   -> StreamableHTTP       STATELESS\nneeds server-push mid-tool       -> StreamableHTTP + SSE (keep request open)"
        },
        "script": "This is the slide behind today's poll. Set it up: 'Given a public multi-user integration, which transport — and stateful or stateless?' Take the vote, then reveal: 'StreamableHTTP, stateless where possible. STDIO is a laptop tool; it cannot serve two users.'"
      },
      {
        "segment": "deconstruct",
        "eyebrow": "🔬 Autopsy",
        "title": "Deconstruct the 'died at two instances' incident, line by line",
        "body": "Let us trace the exact failure from the opener. The server generates a session id on initialize and stashes the transport in an in-memory object keyed by that id. Every subsequent request must carry mcp-session-id so the server can find its transport. With one replica, the map always has the session. With three replicas behind round-robin, initialize hits replica A which stores the session in A's memory only. The next request round-robins to replica B, whose map is empty, so it falls to the else branch and returns a 400. The session id was valid — it just lived in the wrong process's RAM.",
        "bullets": [
          "initialize → replica A creates session, stores transport in A's local Map",
          "next request → round-robin sends it to replica B",
          "B's Map has no such session → 400 'No valid session ID'",
          "Fix options: sticky sessions, a shared session store (Redis), or go stateless"
        ],
        "code": {
          "label": "The stateful pattern that breaks — and where",
          "code": "const transports = {};                       // <-- lives in ONE process's memory\n\napp.post(\"/mcp\", async (req, res) => {\n  const sid = req.headers[\"mcp-session-id\"];\n  let transport;\n  if (sid && transports[sid]) {               // replica B: MISS\n    transport = transports[sid];\n  } else if (!sid && isInitializeRequest(req.body)) {\n    transport = new StreamableHTTPServerTransport({\n      sessionIdGenerator: () => randomUUID(),\n      onsessioninitialized: (id) => { transports[id] = transport; },\n    });\n    await server.connect(transport);\n  } else {\n    return res.status(400).json({ jsonrpc: \"2.0\",           // <-- B lands here\n      error: { code: -32000, message: \"Bad Request: No valid session ID\" }, id: null });\n  }\n  await transport.handleRequest(req, res, req.body);\n});"
        },
        "script": "Point at the `transports` object and the else branch. 'The line that stores state and the line that 400s are on different machines. That is the whole bug. Now you will recognize it in code review before it ships.'"
      },
      {
        "segment": "deconstruct",
        "eyebrow": "🔬 Round-trip",
        "title": "Deconstruct a sampling call — five hops, one prompt",
        "body": "Sampling has more moving parts than a normal tool call, so let us watch the whole round trip. (1) The client calls the tool: tools/call summarize_account. (2) Inside that tool the server calls createMessage, which the SDK turns into a sampling/createMessage request sent back to the client. (3) The client's handler runs the actual model — the client's key, the client's model choice, and optionally a human approval gate. (4) The client returns the completion as the response to request id 31. (5) The server takes that text and returns it as the result of the original tools/call. One user action, one nested model call, and the server never touched an API key.",
        "bullets": [
          "1. client → server: tools/call (summarize_account)",
          "2. server → client: sampling/createMessage (the nested request)",
          "3. client runs the model — its key, its approval gate",
          "4. client → server: the completion (response to the sampling id)",
          "5. server → client: the tool result built from that completion"
        ],
        "code": {
          "label": "The nesting on the wire (ids matter)",
          "code": "-> { id: 7,  method: \"tools/call\", params: { name: \"summarize_account\", ... } }\n     <- { id: 31, method: \"sampling/createMessage\", params: { messages, maxTokens: 400 } }\n     -> { id: 31, result: { role: \"assistant\", content: { type: \"text\", text: \"...\" } } }\n<- { id: 7,  result: { content: [ { type: \"text\", text: \"...\" } ] } }"
        },
        "script": "Trace the ids with a finger: 'Request 7 is still open while request 31 happens inside it. Sampling is a request nested inside a request — that is only possible because the channel is bidirectional and persistent.'"
      },
      {
        "segment": "deconstruct",
        "eyebrow": "🔬 The escape",
        "title": "Deconstruct 'wide-open roots' — the exact path an attacker walks",
        "body": "What does 'unbounded roots' actually let someone do? Suppose a read_file tool opens whatever path it is handed, with no root check. The client declared ./data as the only root — but that was advisory and the server ignored it. Now the model (nudged by a malicious document, or just a bad prompt) calls read_file with ../../.env. The tool happily reads it and returns your AR_DATABASE_URL and Anthropic key straight into the transcript. String-prefix checks are not enough either: a symlink inside ./data pointing at /etc, or a path like ./data/../../secrets, slips past a naive startsWith. Only realpath-then-check closes it.",
        "bullets": [
          "Declared root ./data was advisory — server never enforced it",
          "read_file('../../.env') resolves outside ./data and leaks secrets",
          "Naive checks bypassed by ../ traversal AND symlinks",
          "Enforcement must resolve the REAL path before comparing"
        ],
        "code": {
          "label": "The traversal, step by step",
          "code": "// declared root:      /srv/app/data\n// model asks for:     ../../.env\n// naive server does:   fs.readFile(\"/srv/app/data/../../.env\")\n// OS resolves that to: /srv/.env   <-- OUTSIDE the root, secrets leak\n//\n// realpath check catches it:\n//   real = /srv/.env ; base = /srv/app/data\n//   real.startsWith(base + \"/\")  ->  false  ->  DENY"
        },
        "script": "Make it visceral: 'The declared root said data-only. The model asked for the .env. Without enforcement, the server just... handed it over. This is the exact thing we inject and then fix on Thursday.'"
      },
      {
        "segment": "micro-build",
        "eyebrow": "🛠️ Build 1",
        "title": "Micro-build: add progress notifications to a long-running tool",
        "body": "This is today's live micro-build — the smallest change that turns a frozen-looking tool into one with a real progress bar. The tool indexes every file in a folder. The client passes a progressToken in the request metadata; we read it from the handler's extra context and, only if it is present, emit a notifications/progress after each file with the running count and total. Notice we never block on these — they stream while the loop runs, and the tool still returns its normal result at the end. Type it live; it is under fifteen lines of real change.",
        "bullets": [
          "Read progressToken from extra._meta — only emit if the client asked for it",
          "Send notifications/progress with progress + total after each unit",
          "The tool result is unchanged — notifications stream alongside it",
          "No token → tool still works, just no live bar (graceful)"
        ],
        "code": {
          "label": "Progress notifications inside a tool handler (copy-ready)",
          "code": "server.registerTool(\"index_folder\", {\n  title: \"Index Folder\",\n  description: \"Read and index every file in a folder (long-running)\",\n  inputSchema: { folder: z.string() },\n}, async ({ folder }, extra) => {\n  const files = await fs.readdir(folder);\n  const total = files.length;\n  const token = extra._meta?.progressToken;\n  for (let i = 0; i < total; i++) {\n    await indexOne(path.join(folder, files[i]));\n    if (token !== undefined) {\n      await extra.sendNotification({\n        method: \"notifications/progress\",\n        params: { progressToken: token, progress: i + 1, total,\n                  message: `Indexed ${files[i]}` },\n      });\n    }\n  }\n  return { content: [{ type: \"text\", text: `Indexed ${total} files.` }] };\n});"
        },
        "script": "Type it live in the inspector. Run it against a folder and watch the progress ticks stream in. 'That is the entire difference between a tool that looks hung and a tool users trust. Fifteen lines.'"
      },
      {
        "segment": "micro-build",
        "eyebrow": "🛠️ Build 2",
        "title": "Micro-build: emit a structured log notification",
        "body": "Progress tells the user how far along a job is; logging tells the operator what actually happened. Same channel, different method. One prerequisite people forget: the server has to advertise the logging capability at startup, or the client rejects the message. Then anywhere in a handler you emit notifications/message with a level, a logger name, and a structured data payload — the same JSON-log discipline from our Observability Framework, streamed live to the client's console. This is how you get correlation-friendly, greppable telemetry out of an MCP server without writing to a file.",
        "bullets": [
          "Declare `logging: {}` in the server's capabilities at construction",
          "notifications/message carries level, logger, and structured data",
          "levels: debug | info | notice | warning | error | critical",
          "Structured data (objects, not strings) → greppable, correlatable"
        ],
        "code": {
          "label": "Declare the capability, then log with structure",
          "code": "const server = new McpServer(\n  { name: \"revops-server\", version: \"1.0.0\" },\n  { capabilities: { logging: {} } }        // <-- required or logs are rejected\n);\n\n// ...inside any tool handler:\nawait extra.sendNotification({\n  method: \"notifications/message\",\n  params: {\n    level: \"info\",\n    logger: \"revops-server\",\n    data: { event: \"ar_lookup\", customerId, rows: rows.length, duration_ms: ms },\n  },\n});"
        },
        "script": "Call back to the earlier weeks: 'Same structured-JSON logging rule we hold everywhere — timestamp, level, event, structured context — just delivered over MCP's notification channel. Objects, not string soup.'"
      },
      {
        "segment": "micro-build",
        "eyebrow": "🛠️ Build 3 + wrap",
        "title": "Micro-build: enforce roots on a read — then vote the transport",
        "body": "Wire the roots enforcement from the architecture section into an actual tool so you feel it work. The read_file tool now calls assertInRoots before it opens anything: query the client's roots, resolve the real path, confirm it is inside an allowed root, and only then read. Try the escape from the deconstruction — ../../.env — and watch it get denied. Then we vote: for the class's own Thursday deployment (a server other cohort-mates will call), STDIO or StreamableHTTP, stateful or stateless? Log your choice with a one-line rationale, because Thursday you build it and defend it.",
        "bullets": [
          "read_file now resolves + checks against the client's roots before opening",
          "Test the escape: ../../.env now throws 'Access denied'",
          "Poll: your Thursday server is multi-user — pick transport + state model",
          "Write the rationale down now — it is a graded part of the deliverable"
        ],
        "code": {
          "label": "A read tool that actually respects roots",
          "code": "server.registerTool(\"read_file\", {\n  title: \"Read File\",\n  description: \"Read a text file, bounded to the client's declared roots\",\n  inputSchema: { path: z.string() },\n}, async ({ path: requested }, extra) => {\n  const real = await assertInRoots(server, requested);  // throws if outside roots\n  const text = await fs.readFile(real, \"utf8\");\n  return { content: [{ type: \"text\", text }] };\n});\n// try it:  read_file({ path: \"../../.env\" })  ->  Access denied"
        },
        "script": "Run the escape live and let the denial land on screen. Then run the transport poll and the roots trivia ('roots control file-access boundaries — a security control, not a nicety'). Close: 'Thursday we harden all of this and wire it to a real database. Bring your Week 5 server and your transport decision.'"
      }
    ],
    "thursday": [
      {
        "segment": "build-map",
        "eyebrow": "🗺️ Today's result",
        "title": "By the end: a production-shaped server wired to a real system",
        "body": "Today we take your Week 5 server from toy to production-shaped and integrate it with a real business system — the Intensive 2 deliverable that ships alongside your Prompt Library. Four checkpoints. CP0: baseline, your Week 5 server running and verified in the inspector. CP1: upgraded — sampling plus progress and log notifications. CP2: bounded and transported — roots enforced and a documented transport choice. CP3: integrated — a tool wired to a real database with a timeout and error handling. Readiness check: your Week 5 server plus access to a real system or dataset (we use a Postgres accounts-receivable DB as the running example).",
        "bullets": [
          "CP0 Baseline — Week 5 server runs, inspector connects",
          "CP1 Upgraded — sampling + progress/log notifications",
          "CP2 Bounded + transported — roots enforced, transport chosen with rationale",
          "CP3 Integrated — a tool hits a real DB/API with timeout + error handling",
          "Deliverable: upgraded repo (transport config + integration adapter) + a demo"
        ],
        "script": "Read the map, then say: 'Every checkpoint is a paste-and-run step. We are building one server — a RevOps server — and by CP3 it answers a real question against a real database. Have your Week 5 code open.'"
      },
      {
        "segment": "build-map",
        "eyebrow": "🧩 The target architecture",
        "title": "What we're assembling: the RevOps MCP server",
        "body": "Here is the shape of the thing we build today, so every step has a place. Core: an McpServer exposing three tools — overdue_invoices (hits Postgres), summarize_account (uses sampling to reason over AR text), and read_file (bounded by roots). Cross-cutting: progress notifications on the long jobs, structured log notifications for observability, roots enforcement on file access, and a stateless StreamableHTTP transport so it scales. External edges: a Postgres accounts-receivable database behind a connection pool with a timeout, and the client's model reached through sampling. That is the whole system on one slide.",
        "bullets": [
          "Tools: overdue_invoices (DB), summarize_account (sampling), read_file (roots)",
          "Cross-cutting: progress + log notifications, roots enforcement",
          "Transport: stateless StreamableHTTP (scales horizontally)",
          "Edges: Postgres AR DB via pooled connection; client's model via sampling"
        ],
        "code": {
          "label": "Module map",
          "code": "revops-server/\n  server.ts        // McpServer + capabilities (logging, sampling wired via tools)\n  tools/\n    invoices.ts    // overdue_invoices  -> Postgres adapter (CP3)\n    account.ts     // summarize_account -> sampling      (CP1)\n    files.ts       // read_file         -> roots         (CP2)\n  lib/\n    roots.ts       // assertInRoots(): realpath + prefix check\n    ar.ts          // pg Pool, timeout, error mapping\n  http.ts          // stateless StreamableHTTP entrypoint (CP2)"
        },
        "script": "Keep this on screen as an anchor. 'Each checkpoint fills one box. When you feel lost in a step, come back here and find which box we are in.'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "✅ CP0",
        "title": "Baseline: Week 5 server running, verified in the inspector",
        "body": "Do not build on an unverified base. Install the SDK and Zod, then launch your Week 5 server under the MCP Inspector — the browser tool that speaks the protocol and lets you call tools by hand. Confirm three things before touching anything: the server initializes, tools/list returns your Week 5 tools, and one tool call round-trips a real result. If the inspector connects and a tool answers, CP0 is green and you have a known-good baseline to diff every later change against. If it does not connect, fix that first — every later checkpoint assumes this works.",
        "bullets": [
          "Install once: @modelcontextprotocol/sdk, zod, (later) pg, @anthropic-ai/sdk",
          "Launch under the Inspector — it speaks MCP, no client code needed",
          "Verify: initialize OK, tools/list populated, one tool call round-trips",
          "Green CP0 = a baseline you can diff every later change against"
        ],
        "code": {
          "label": "Run + inspect (paste)",
          "code": "npm install @modelcontextprotocol/sdk zod\nnpm install pg @anthropic-ai/sdk        # needed at CP1 and CP3\n\n# launch the Week 5 server under the inspector\nnpx @modelcontextprotocol/inspector node build/server.js\n\n# in the inspector UI: Connect -> Tools -> pick a tool -> Run\n# confirm you get a real result back before moving on"
        },
        "script": "Have everyone get a green inspector before you move on. 'Nobody advances until a tool round-trips in the inspector. This is our floor.' Walk the room / check the chat for red connections."
      },
      {
        "segment": "guided-build",
        "eyebrow": "✅ CP1a",
        "title": "Add sampling — the server asks the client's model to summarize",
        "body": "First half of CP1: sampling. Add the summarize_account tool that pulls a customer's AR aging report and asks the client's model to condense it — the server calls createMessage and stays credential-free. Sampling has two halves, and both must be present or it silently does nothing. Server half: the tool calls server.server.createMessage. Client half: the client must declare the sampling capability and register a handler for sampling/createMessage that actually runs a model — here, the Anthropic SDK with claude-opus-4-8 and adaptive thinking. This is also where you put the human-in-the-loop gate if you want one.",
        "bullets": [
          "Server half: tool calls server.server.createMessage(...)",
          "Client half: declare `sampling: {}` and handle CreateMessageRequestSchema",
          "The client's handler runs the real model — its key, its model, its approval gate",
          "Miss either half and sampling silently no-ops — test end to end"
        ],
        "code": {
          "label": "Client-side sampling handler (the half people forget)",
          "code": "import { Client } from \"@modelcontextprotocol/sdk/client/index.js\";\nimport { CreateMessageRequestSchema } from \"@modelcontextprotocol/sdk/types.js\";\nimport Anthropic from \"@anthropic-ai/sdk\";\n\nconst client = new Client(\n  { name: \"revops-client\", version: \"1.0.0\" },\n  { capabilities: { sampling: {} } }          // <-- advertise sampling\n);\nconst anthropic = new Anthropic();             // reads ANTHROPIC_API_KEY\n\nclient.setRequestHandler(CreateMessageRequestSchema, async (req) => {\n  // Human-in-the-loop gate would live here (show prompt, await approval)\n  const msg = await anthropic.messages.create({\n    model: \"claude-opus-4-8\",\n    max_tokens: req.params.maxTokens ?? 512,\n    thinking: { type: \"adaptive\" },\n    system: req.params.systemPrompt,\n    messages: req.params.messages.map(m => ({\n      role: m.role,\n      content: m.content.type === \"text\" ? m.content.text : \"\",\n    })),\n  });\n  const first = msg.content.find(b => b.type === \"text\");\n  return {\n    role: \"assistant\",\n    model: msg.model,\n    stopReason: \"endTurn\",\n    content: { type: \"text\", text: first?.text ?? \"\" },\n  };\n});"
        },
        "script": "Show the server tool from Monday, then paste this client handler beside it. 'Two halves. Server asks, client answers with the real model. The key never leaves the client.' Run it and read the summary out loud."
      },
      {
        "segment": "guided-build",
        "eyebrow": "✅ CP1b",
        "title": "Add progress notifications to the long jobs",
        "body": "Second part of CP1: make the slow tools observable. The AR summarize and the invoice pull both do real I/O, so wrap their work in progress notifications keyed to the client's progressToken. This is the Monday micro-build, now landing in the real server. The rule holds: only emit if the client passed a token, count against a real total, and let the notifications stream while the result still returns normally. In the inspector you will see the progress ticks arrive live — that is the feedback that stops users from cancelling and retrying a job that was actually fine.",
        "bullets": [
          "Read extra._meta?.progressToken; emit only when present",
          "notifications/progress with a running progress and a real total",
          "Notifications stream during the work; the tool result is unaffected",
          "Verify live in the inspector — the ticks should arrive as work happens"
        ],
        "code": {
          "label": "Progress on the invoice pull (paste)",
          "code": "async function pullWithProgress(pages, extra) {\n  const token = extra._meta?.progressToken;\n  const all = [];\n  for (let i = 0; i < pages.length; i++) {\n    all.push(...await fetchPage(pages[i]));\n    if (token !== undefined) {\n      await extra.sendNotification({\n        method: \"notifications/progress\",\n        params: { progressToken: token, progress: i + 1, total: pages.length,\n                  message: `Fetched page ${i + 1}/${pages.length}` },\n      });\n    }\n  }\n  return all;\n}"
        },
        "script": "Reuse Monday's muscle memory. 'Same pattern, real server. Watch the inspector — those ticks are the difference between a 40-second job that looks alive and one that looks dead.'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "✅ CP1c",
        "title": "Add structured log notifications for observability",
        "body": "Close out CP1 with the operator's view: structured logs over notifications/message. Declare the logging capability at construction, then emit a log at each meaningful boundary — a DB query, a sampling call, an error — with a level, a logger name, and a structured data object. This is your production telemetry stream: greppable, correlatable, and delivered live to whoever is running the client, with no ad-hoc file writes. Keep secrets out of it — log the customer id and row count, never the connection string. When this lands, CP1 is complete: sampling plus progress plus logs.",
        "bullets": [
          "Declare `logging: {}` in the server capabilities (or logs are rejected)",
          "Log at boundaries: query start/end, sampling call, caught errors",
          "Structured data object, stable event names — greppable and correlatable",
          "Redact secrets: log customerId + rows, never the DB URL or API key"
        ],
        "code": {
          "label": "A logged, timed DB boundary (paste)",
          "code": "async function loggedQuery(sql, params, extra, correlationId) {\n  const start = Date.now();\n  const { rows } = await pool.query(sql, params);\n  await extra.sendNotification({\n    method: \"notifications/message\",\n    params: { level: \"info\", logger: \"revops-server\",\n      data: { event: \"db_query\", correlationId, rows: rows.length,\n              duration_ms: Date.now() - start } },\n  });\n  return rows;\n}"
        },
        "script": "Tie the whole week's observability thread together: 'Progress is for the user, logs are for you. Both ride the same notification channel. Same structured discipline we hold everywhere — objects, stable event names, no secrets.'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "✅ CP2a",
        "title": "Bound roots to ./data — and actually enforce it",
        "body": "First half of CP2: the security boundary. Wire the assertInRoots helper into every file-touching tool so the server reads the client's declared roots and refuses anything outside them. Enforcement is realpath-then-prefix-check, which is what defeats both ../ traversal and symlink escape — a plain startsWith on the raw path does not. Set the client's declared root to ./data, then prove the boundary by attempting the escape and watching it get denied and logged. This is the failure we will inject in a moment, so getting the enforcement right here is the whole point.",
        "bullets": [
          "Client declares ./data as its root; server enforces it, not just trusts it",
          "assertInRoots = realpath the request, confirm it's inside an allowed base",
          "realpath is load-bearing: it neutralizes ../ and symlinks",
          "Deny attempts should also emit a warning log (you'll want the audit trail)"
        ],
        "code": {
          "label": "read_file, root-bounded and audited (paste)",
          "code": "server.registerTool(\"read_file\", {\n  title: \"Read File\",\n  description: \"Read a text file, bounded to the client's declared roots\",\n  inputSchema: { path: z.string() },\n}, async ({ path: requested }, extra) => {\n  try {\n    const real = await assertInRoots(server, requested);  // realpath + prefix check\n    const text = await fs.readFile(real, \"utf8\");\n    return { content: [{ type: \"text\", text }] };\n  } catch (err) {\n    await extra.sendNotification({ method: \"notifications/message\",\n      params: { level: \"warning\", logger: \"revops-server\",\n        data: { event: \"root_escape_denied\", requested } } });\n    return { isError: true, content: [{ type: \"text\", text: \"Access denied.\" }] };\n  }\n});"
        },
        "script": "Have them set the root to ./data and confirm a normal read still works. 'Enforcement, not advice. Next slide you try to break it — you want this bulletproof first.'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "✅ CP2b",
        "title": "Choose the transport — and make it stateless StreamableHTTP",
        "body": "Second half of CP2: the transport decision you defended on Monday. Because this server is multi-user and meant to scale, we choose StreamableHTTP, stateless — sessionIdGenerator set to undefined so there is no in-memory session map to strand a request on the wrong replica. A fresh server plus transport per request means every request is self-contained and any load balancer can route it anywhere. Contrast this on screen with the stateful version from Monday's autopsy so the class sees exactly which line changed and why it matters. Document the choice with a one-line rationale in the repo — that is a graded artifact.",
        "bullets": [
          "Multi-user + autoscaled → StreamableHTTP, stateless",
          "sessionIdGenerator: undefined → no session map, nothing to strand",
          "Fresh server+transport per request → any replica can serve any request",
          "Write the rationale in the repo — a documented transport choice is required"
        ],
        "code": {
          "label": "Stateless StreamableHTTP entrypoint (paste)",
          "code": "import express from \"express\";\nimport { StreamableHTTPServerTransport }\n  from \"@modelcontextprotocol/sdk/server/streamableHttp.js\";\n\nconst app = express();\napp.use(express.json());\n\napp.post(\"/mcp\", async (req, res) => {\n  const server = buildServer();                 // fresh instance, no shared state\n  const transport = new StreamableHTTPServerTransport({\n    sessionIdGenerator: undefined,              // <-- STATELESS: no session map\n  });\n  res.on(\"close\", () => { transport.close(); server.close(); });\n  await server.connect(transport);\n  await transport.handleRequest(req, res, req.body);\n});\n\napp.listen(3000, () => console.log(\"revops MCP on :3000/mcp\"));"
        },
        "script": "Put Monday's stateful map next to this stateless entrypoint. 'One field — sessionIdGenerator undefined — is the difference between a server that dies at two replicas and one that does not. Say why in your README; it is graded.'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "✅ CP3",
        "title": "Integrate a real system — Postgres AR, with timeout and error handling",
        "body": "The capstone checkpoint: wire a tool to a real business system. overdue_invoices hits a Postgres accounts-receivable database through a pooled connection. Three production requirements, none optional. A parameterized query — never string-concatenate the customer id, or you have SQL injection through the model. An explicit timeout — race the query against a timer so a hung DB cannot hang the tool forever. And structured error handling that returns the MCP error contract, isError: true with a message, rather than throwing and killing the connection. When this returns real overdue invoices with a timeout guard and a clean error path, CP3 is green and your Intensive 2 server is integrated.",
        "bullets": [
          "Parameterized query ($1) — untrusted model input never touches SQL text",
          "Explicit timeout — race the query so a hung DB can't hang the tool",
          "Return the MCP error contract { isError: true, content } — don't throw",
          "Pooled connection, released in finally — no leaked handles under load"
        ],
        "code": {
          "label": "overdue_invoices — real DB, timeout, error contract (paste)",
          "code": "import { Pool } from \"pg\";\nconst pool = new Pool({\n  connectionString: process.env.AR_DATABASE_URL,\n  connectionTimeoutMillis: 5000,\n});\n\nserver.registerTool(\"overdue_invoices\", {\n  title: \"Overdue Invoices\",\n  description: \"List overdue invoices for a customer from the AR database\",\n  inputSchema: { customerId: z.string() },\n}, async ({ customerId }) => {\n  try {\n    const q = pool.query(\n      \"select id, amount, due_date from invoices \" +\n      \"where customer_id = $1 and status = 'overdue' order by due_date\",\n      [customerId]                                   // parameterized: no injection\n    );\n    const timeout = new Promise((_, rej) =>\n      setTimeout(() => rej(new Error(\"AR query timed out\")), 8000));\n    const { rows } = await Promise.race([q, timeout]);\n    return { content: [{ type: \"text\", text: JSON.stringify(rows, null, 2) }] };\n  } catch (err) {\n    return { isError: true,\n      content: [{ type: \"text\", text: `AR lookup failed: ${err.message}` }] };\n  }\n});"
        },
        "script": "This is the checkpoint everyone came for — real data. Emphasize the three guards: 'Parameterized or you have injection through the model. Timeout or a slow DB hangs every user. isError contract or one bad query kills the connection. Ship all three.'"
      },
      {
        "segment": "failure",
        "eyebrow": "💥 Inject",
        "title": "Break it: leave roots wide open and read outside ./data",
        "body": "Now we deliberately break the server to prove the boundary matters. Revert read_file to the naive version — no assertInRoots, it opens whatever path it is handed. The client still declares ./data as its only root, but the server ignores that advice. Call read_file with ../../.env. It reads it. Your AR_DATABASE_URL and Anthropic key land in the transcript, readable by the model and anyone watching. This is the failure injection from the blueprint: roots left wide open, a tool reading outside its directory. Reproduce it live so the fix on the next slide is felt, not just described.",
        "bullets": [
          "Naive read_file ignores the declared root entirely",
          "read_file('../../.env') resolves outside ./data and succeeds",
          "Secrets (DB URL, API key) leak straight into the transcript",
          "The declared root was advisory — with no enforcement, it did nothing"
        ],
        "code": {
          "label": "The broken tool — do NOT ship this",
          "code": "// BROKEN: no root check — the model can walk out of ./data\nserver.registerTool(\"read_file\", {\n  inputSchema: { path: z.string() },\n}, async ({ path: p }) => {\n  const text = await fs.readFile(p, \"utf8\");   // reads ANYTHING it's handed\n  return { content: [{ type: \"text\", text }] };\n});\n\n// attack:  read_file({ path: \"../../.env\" })\n// result:  AR_DATABASE_URL=... , ANTHROPIC_API_KEY=...   <-- leaked"
        },
        "script": "Run the escape live and let the .env contents appear on screen (use a fake .env!). 'The client SAID data-only. The server shrugged and handed over the secrets. Advisory is not a control. Now watch us close it.'"
      },
      {
        "segment": "failure",
        "eyebrow": "🩹 Harden",
        "title": "Fix it: constrain roots, deny the escape, log the attempt",
        "body": "Restore the enforced read_file — assertInRoots resolves the real path, checks it against the client's roots, denies anything outside, and emits a warning log on every attempt. Run the exact same attack: read_file with ../../.env now returns 'Access denied' and leaves an audit trail instead of leaking secrets. Then close the loop on the other week-6 failure mode with the trivia: a stateful server scaled to three instances with a shared in-memory session loses state because requests hit different instances — which is exactly why we chose stateless at CP2. Two failures, both injected, both hardened, both with a test that reproduces the original break.",
        "bullets": [
          "assertInRoots resolves + checks; the escape now returns 'Access denied'",
          "Every denial emits a warning log — the audit trail you'll want later",
          "Second failure: stateful @ 3 instances → requests hit different instances, lose state",
          "That is why CP2 chose stateless — go stateless or externalize state",
          "Each fix ships with a test that reproduces the original break (Build-Break-Harden)"
        ],
        "code": {
          "label": "The hardened tool + the reproduction test",
          "code": "// hardened read_file (from CP2a): assertInRoots -> realpath + prefix check -> deny + log\n\n// the test that must exist alongside the fix:\ntest(\"denies traversal outside declared roots\", async () => {\n  const res = await callTool(\"read_file\", { path: \"../../.env\" });\n  expect(res.isError).toBe(true);\n  expect(res.content[0].text).toBe(\"Access denied.\");\n});"
        },
        "script": "Run the same attack against the fixed tool — 'Access denied' on screen — then run the test green. Do the stateful-scaling trivia. 'Roots escape: denied and logged. Stateful-at-scale: avoided by design. That is Build-Break-Harden — every break gets a fix and a test.'"
      },
      {
        "segment": "failure",
        "eyebrow": "🧪 Ship gate",
        "title": "The BREAK matrix — what to throw at it before you call it done",
        "body": "A feature that has been built but not broken is not shipped. Before you demo, run your RevOps server through the failure path deliberately. Point the DB adapter at a dead connection — does the tool return isError cleanly, or hang? Feed a malformed or oversized customerId — does the parameterized query hold? Fire the same tool twice in a second — is it idempotent, no double side effects? Kill the DB mid-query — does the timeout fire and the error log appear? Attempt a roots escape — denied and logged? Deny a sampling request at the client — does the tool degrade instead of crashing? Every 'no' is a defect to harden before the deliverable ships.",
        "bullets": [
          "DB down → tool returns { isError: true }, not a hang",
          "Malformed / oversized input → parameterized query holds, no injection",
          "Same tool twice in 1s → idempotent, no duplicate side effects",
          "DB killed mid-query → timeout fires, error is logged with the correlation id",
          "Roots escape attempt → denied and logged",
          "Client denies sampling → tool degrades gracefully, no crash"
        ],
        "code": {
          "label": "Definition of Done for the Intensive 2 server",
          "code": "SHIP ONLY IF:\n[ ] sampling works end-to-end (server createMessage + client handler)\n[ ] progress + log notifications stream on the long jobs\n[ ] roots enforced (realpath), escape denied + logged, test proves it\n[ ] transport = StreamableHTTP stateless, rationale in README\n[ ] real integration: parameterized query + timeout + isError contract\n[ ] every injected break has a fix AND a reproduction test\n[ ] no secrets in logs; DB URL and API key never printed\n[ ] demo: the integrated server handles one real task end to end"
        },
        "script": "End on the gate. 'Built is not shipped. Broken-and-hardened is shipped. Run this matrix, fix every no, and your Intensive 2 deliverable — an integrated, production-shaped MCP server — is real. Demo it handling one live task.'"
      }
    ]
  },
  "7": {
    "monday": [
      {
        "segment": "business-problem",
        "eyebrow": "🧱 The ceiling",
        "title": "One assistant, one context window - and it fills up",
        "body": "A single Claude Code session has one context window and one train of thought. When you point it at a real system - map this subsystem, then review the risk, then make the change - it does all three in the same window. By the time it starts editing, the context is stuffed with forty files it read while exploring, and the signal you actually care about is buried under noise. A solo assistant is also single-threaded: two unrelated questions get answered one after the other, never at the same time. This is the ceiling every student hits by Week 7, and subagents are how you break through it.",
        "bullets": [
          "One window = exploration noise pollutes the edit",
          "Single-threaded = no parallelism on independent work",
          "One system prompt = no specialization, one generic role",
          "The fix is a team, not a bigger prompt"
        ],
        "script": "Open by asking: 'How many of you have watched Claude read 30 files to answer one question, and then it seemed dumber for the rest of the session?' Hands go up. That is context pollution. Tell them today is the week their single assistant becomes a team."
      },
      {
        "segment": "business-problem",
        "eyebrow": "💸 Two costs",
        "title": "The two things a solo assistant cannot do",
        "body": "There are exactly two failure modes we are solving this week, and naming them keeps you from over-using subagents later. First, context pollution: heavy read-only exploration burns your window and degrades every later step in the same session. Second, no parallelism: independent tasks that could run at the same time are forced into a line. Notice what is NOT on this list - subagents do not make Claude smarter, and they do not make a single small edit faster. If your problem is not one of these two, a subagent is the wrong tool. Hold onto that; it is the whole anti-pattern lesson in one sentence.",
        "bullets": [
          "Problem 1: exploration noise burning the main window",
          "Problem 2: independent work stuck in a sequence",
          "NOT a problem subagents solve: making one small edit",
          "NOT a problem subagents solve: making Claude 'smarter'"
        ],
        "script": "Write the two problems on the board and leave them up all class. Every architecture decision today maps back to one of these two. If a student proposes a subagent, make them point at which problem it solves."
      },
      {
        "segment": "business-problem",
        "eyebrow": "🎯 The payoff",
        "title": "By Thursday: a coordinated team of three",
        "body": "Here is where we land. By the end of Thursday you will have a .claude/agents/ folder with three specialized subagents - an explorer that maps code read-only, a reviewer that flags risk, and an editor that is the only one allowed to touch files. You will run them on one real change, with the explorer's findings flowing to the reviewer and the reviewer's verdict gating the editor. This is the exact pattern Anthropic's own engineering teams use on large codebases, and it is the pattern this very repository's CLAUDE.md documents. Today, Monday, is about understanding the machine before you build it.",
        "bullets": [
          "explorer (read-only) - maps the subsystem",
          "reviewer (read-only) - scores the risk",
          "editor (write access) - makes the minimal change",
          "One orchestrator routes all three"
        ],
        "script": "Show the end state first so the architecture has a destination. Say: 'Everything I teach for the next hour is a part of this machine. Keep asking - which part of the team does this belong to?'"
      },
      {
        "segment": "architecture",
        "eyebrow": "🪟 The core idea",
        "title": "A subagent is a separate Claude with its own context window",
        "body": "A subagent is not a mode or a persona - it is a genuinely separate instance of Claude. It has its own context window, its own system prompt, and its own set of allowed tools, completely isolated from the main session. When the main agent delegates, the subagent starts fresh: it cannot see your conversation history unless you put it in the task. It does the work in its own window, and then only its final message returns to the main agent. Think of it as hiring a contractor: you hand them a brief, they go work in their own office, and they hand you back a report - not their entire desk.",
        "bullets": [
          "Own context window (isolated from main)",
          "Own system prompt (the .md file body)",
          "Own tool allowlist (least privilege)",
          "Starts with a clean slate - no memory of your chat"
        ],
        "script": "Draw two boxes. Left = main agent. Right = subagent. Draw a hard wall between them. Say the wall is the whole point: what happens on the right stays on the right, except for one thin channel back."
      },
      {
        "segment": "architecture",
        "eyebrow": "🔁 The flow",
        "title": "Input flows in, work happens in isolation, a summary flows back",
        "body": "The channel between main and subagent is deliberately narrow, and understanding it is everything. The main agent sends ONE thing in - a task prompt. The subagent may read forty files, run ten searches, and think through the problem across thousands of tokens, but the main agent never sees any of that. When the subagent finishes, exactly ONE thing comes back - its final message. All the intermediate work is discarded. That is why the return value must be complete and self-contained: if the summary leaves something out, it is gone forever, because the main agent cannot reach back into the subagent's window.",
        "bullets": [
          "IN: a single task prompt (must contain everything needed)",
          "MIDDLE: unlimited private work in the subagent's window",
          "OUT: a single final message (everything else is discarded)",
          "The summary IS the deliverable - nothing else survives"
        ],
        "code": {
          "label": "The isolation boundary (conceptual)",
          "code": "MAIN AGENT                         SUBAGENT (explorer)\n----------                         -------------------\n\"Map the auth flow\"   ---in--->     reads 40 files\n                                   greps 12 patterns\n                                   traces data flow\n                                   (main sees NONE of this)\n\n(main context stays               <---out---   returns ONE\n clean - 1 summary)                            structured summary"
        },
        "script": "Trace the arrow with your finger. Emphasize: 'The subagent read 40 files. How many landed in your main window? One paragraph. That is context hygiene, and it is free.'"
      },
      {
        "segment": "architecture",
        "eyebrow": "🧼 Why it matters",
        "title": "Isolation is a context-hygiene machine",
        "body": "The isolated window is not a limitation to work around - it is the primary value. Exploration is expensive in tokens and noisy in signal: to answer 'where does the enrollment webhook write to the database' Claude might read twenty files, but the answer is two lines. If you do that in your main session, you pay for those twenty files for the rest of the conversation. Delegate it to an explorer, and you pay for it once, inside a window you throw away, and your main session receives only the two-line answer. This is why the strongest use of subagents is often not parallelism at all - it is keeping your main context clean enough to stay sharp.",
        "bullets": [
          "Exploration is high-token, low-signal - quarantine it",
          "The throwaway window absorbs the noise",
          "Main session receives distilled signal only",
          "Cleaner context = sharper main agent for longer"
        ],
        "script": "Callback to the opening question. 'Remember the assistant that got dumber after reading 30 files? An explorer subagent is the cure. It reads the 30 files so your main session never has to.'"
      },
      {
        "segment": "architecture",
        "eyebrow": "🏗️ The three pillars",
        "title": "A reliable subagent has structured output, obstacle reporting, and scoped tools",
        "body": "A subagent you cannot trust is worse than no subagent, because you will act on its summary without re-checking. Three design properties make a subagent trustworthy. Structured output: the subagent returns a fixed, predictable format so the coordinator can parse and act on it mechanically, not re-read prose. Obstacle reporting: the subagent is told to say explicitly when it cannot find something or is unsure, instead of guessing - a confident wrong answer is the most dangerous output an agent can produce. Scoped tools: the subagent gets only the tools its job needs, so it physically cannot wander off task. Miss any one of these and the whole team becomes untrustworthy.",
        "bullets": [
          "Structured output = a contract the coordinator can trust",
          "Obstacle reporting = 'I could not find X' beats a confident guess",
          "Scoped tools = least privilege, cannot wander",
          "Single responsibility = one clear job per agent"
        ],
        "code": {
          "label": "The output-contract idea, in the system prompt",
          "code": "Return EXACTLY this structure, nothing else:\n\n## Findings\n- <file:line> - <what is here>\n## Data flow\n1. <step> -> <step>\n## Obstacles\n- <anything you could NOT determine, and why>\n## Confidence\n<high | medium | low> - <one sentence why>"
        },
        "script": "This is the most important slide of the day. Say the trivia line out loud: structured output is the CONTRACT that lets the coordinator trust the result. Without a contract, you are just hoping."
      },
      {
        "segment": "architecture",
        "eyebrow": "🤝 Coordination",
        "title": "Split exploration from editing - the canonical team pattern",
        "body": "The signature move of a multi-agent team is splitting exploration from editing. A read-only explorer maps the code and returns findings; then the main agent, now holding the full picture in a clean context, makes the change - or hands it to a dedicated editor. This works because the two jobs have opposite needs: exploration wants wide, cheap, throwaway reading, while editing wants narrow, careful, high-stakes writing. One more rule: subagents do not talk to each other. The main agent is the orchestrator - it receives each subagent's summary and decides what to route where. There is no agent-to-agent chatter, and subagents cannot spawn their own subagents.",
        "bullets": [
          "Explorer reads wide and throwaway; editor writes narrow and careful",
          "Orchestrator (main agent) routes every handoff",
          "Subagents never message each other directly",
          "No recursion: a subagent cannot spawn subagents"
        ],
        "code": {
          "label": "The coordination graph",
          "code": "                 +---------------------+\n                 |    MAIN AGENT       |\n                 |   (orchestrator)    |\n                 +----+-----+-----+----+\n        task/summary  |     |     |  task/summary\n            +---------+     |     +---------+\n            v               v               v\n       [explorer]      [reviewer]       [editor]\n       read-only       read-only     read+edit+bash\n       maps code      flags risk    makes the change\n\n  Agents report to MAIN only. They never talk to each other."
        },
        "script": "Draw the hub-and-spoke. Stress that it is a hub, not a chain. Students imagine a relay race; correct them - it is a manager delegating, collecting reports, and deciding the next move each time."
      },
      {
        "segment": "architecture",
        "eyebrow": "⚡ Parallelism",
        "title": "Independent work runs at the same time",
        "body": "The second reason to use a team is wall-clock speed on independent work. When two tasks do not depend on each other - research topic A and research topic B, or audit module X and module Y - you can launch both subagents in a single turn and they run concurrently, each in its own window. Dependent work cannot parallelize: if task B needs task A's output, they must run in sequence, because the summary is the only thing that crosses between windows. Be honest about the tradeoff - parallel subagents save time, not tokens. Each agent still burns its own full context, so you pay more total tokens for a faster answer.",
        "bullets": [
          "Independent tasks -> launch together in one turn",
          "Dependent tasks (B needs A) -> must run in sequence",
          "Parallelism buys wall-clock time, NOT token savings",
          "Concurrency is bounded - extras queue automatically"
        ],
        "code": {
          "label": "Real example from THIS repo's CLAUDE.md",
          "code": "# Coca-Cola AI use-case taxonomy (2026-05-14)\n# 3 parallel general-purpose subagents, one message:\n#   agent 1 -> company research\n#   agent 2 -> bottling operations research\n#   agent 3 -> proven AI use cases\n# Returned in ~2 minutes total (would have been ~6 sequential).\n# Main session then SYNTHESIZED the 3 summaries into 12 use cases."
        },
        "script": "Point at the real example. 'This is not a toy - our own repo ran three research agents in parallel and cut the time by two-thirds. The main session did the synthesis, because synthesis needs all three answers at once.'"
      },
      {
        "segment": "deconstruct",
        "eyebrow": "🔍 Anti-pattern 1",
        "title": "Over-delegation: a subagent for one-line work",
        "body": "Watch this failure closely because it is the most common. A student learns subagents and immediately delegates everything: 'spin up a subagent to rename this variable,' 'use a subagent to add one import.' Every delegation has fixed overhead - the main agent writes a task prompt, the subagent boots a fresh context, does the trivial work, then writes a summary back. For a one-line change, that round trip costs more time and tokens than just doing it inline, and it fragments the work across windows for no benefit. The rule from Monday's poll: skip subagents for trivial work; use them to isolate context or parallelize. If the task is smaller than the prompt describing it, do it yourself.",
        "bullets": [
          "Every delegation pays fixed coordination overhead",
          "One-line edit + a subagent = the tax exceeds the work",
          "Smell test: is the task smaller than its own brief?",
          "Reserve delegation for context isolation or parallelism"
        ],
        "script": "Do a live bad demo if time allows: ask Claude to delegate a one-word rename to a subagent and let students watch the round trip. Then do it inline in two seconds. The contrast sells it."
      },
      {
        "segment": "deconstruct",
        "eyebrow": "🧨 Anti-pattern 2",
        "title": "Unscoped tools + unstructured output = results you cannot trust",
        "body": "Here is the failure we inject on Thursday, shown now so you recognize it. Give a subagent the default tool access - which is ALL tools, including Edit, Write, and Bash - and a vague job like 'look into the payments code.' With no tool boundary, it starts editing files you never asked it to touch. With no output contract, it returns a wall of unstructured prose. Now the coordinator has two problems: it cannot tell what actually changed, and it cannot mechanically act on the summary. The agent did work, but none of it is trustworthy. The fix is both pillars at once - scope the tools to read-only and require a structured schema - and the same run becomes reliable.",
        "bullets": [
          "Default tools = ALL tools (Edit, Write, Bash inherited)",
          "Unscoped explorer can silently edit files",
          "Unstructured output cannot be parsed or trusted",
          "Fix = scope tools + require a schema (both, not one)"
        ],
        "code": {
          "label": "Broken vs fixed frontmatter",
          "code": "# BROKEN: no tools line -> inherits EVERYTHING, wanders and edits\n---\nname: explorer\ndescription: looks into code\n---\n\n# FIXED: read-only tools + a system prompt that mandates a schema\n---\nname: explorer\ndescription: Read-only cartographer. Returns a structured map, never edits.\ntools: Read, Grep, Glob\n---"
        },
        "script": "Hold up the broken version. 'The dangerous line here is the one that is missing.' Then reveal the fix. Tell them Thursday they will break it live and feel why the guardrail matters."
      },
      {
        "segment": "deconstruct",
        "eyebrow": "🧠 The gotcha",
        "title": "A subagent remembers nothing about your conversation",
        "body": "This trips up everyone once. Because a subagent starts with a fresh context window, it has zero knowledge of what you and the main agent discussed. If you told the main agent 'we are refactoring the enrollment service' and then delegate 'add the field,' the subagent has no idea what 'the field' or 'the service' means - it sees only the words in its task prompt. So a delegation must be self-contained: name the files, state the goal, include the constraints, define done. This is the exact opposite of talking to your main session, where context accumulates. Treat every subagent brief like onboarding a brand-new contractor who has read none of your emails.",
        "bullets": [
          "No access to the main conversation history",
          "It knows ONLY what is in the task prompt",
          "Name files, goal, constraints, and definition of done",
          "Write the brief like onboarding a stranger"
        ],
        "script": "Great place for a quick misconception check. Ask: 'If I told the main agent our plan five minutes ago, does the subagent know it?' Let them answer. The 'no' is the lesson."
      },
      {
        "segment": "micro-build",
        "eyebrow": "🛠️ /agents",
        "title": "Create your first subagent with the /agents command",
        "body": "Time to build one. In Claude Code, type /agents to open the interactive manager. It walks you through creating a subagent: choose project-level (stored in .claude/agents/, shared with your team via git) or user-level (in ~/.claude/agents/, personal across all projects); name it; write the description that tells the main agent WHEN to use it; and select which tools it may use from a checklist. Claude can even draft the system prompt for you. When you finish, it writes a plain Markdown file to .claude/agents/<name>.md. That file is the whole subagent - no hidden state, fully version-controllable, reviewable in a PR.",
        "bullets": [
          "Type /agents to open the manager",
          "Project-level (.claude/agents/, git-shared) vs user-level (~/.claude/agents/)",
          "The description drives WHEN the main agent delegates",
          "Output is one reviewable .md file per agent"
        ],
        "code": {
          "label": "What /agents produces on disk",
          "code": ".claude/\n  agents/\n    explorer.md      <- created by /agents\n    reviewer.md\n    editor.md\n\n# Each file = YAML frontmatter (name, description, tools, model)\n#           + a Markdown body (the agent's system prompt)"
        },
        "script": "Do this live. Run /agents, create 'explorer' project-level, and narrate every choice. Pick project-level on purpose so the team can commit it. Let the room see the file appear in .claude/agents/."
      },
      {
        "segment": "micro-build",
        "eyebrow": "🧬 Anatomy",
        "title": "Read the anatomy of an agent file",
        "body": "Every subagent is the same simple shape, and once you can read it you can write it. The frontmatter carries four fields: name (how you invoke it), description (when the main agent should reach for it - write this for the orchestrator, not for humans), tools (the allowlist; omit it and the agent inherits ALL tools, which is the anti-pattern from earlier), and optional model (sonnet, opus, haiku, or inherit). Everything below the frontmatter is the system prompt - the agent's entire personality, process, and output contract. Notice the description does double duty: phrases like 'use PROACTIVELY' or 'MUST BE USED' nudge the main agent to delegate automatically instead of waiting to be told.",
        "bullets": [
          "name - the handle you invoke",
          "description - WHEN to delegate (write it for the orchestrator)",
          "tools - the allowlist; omitting it inherits everything",
          "body - the system prompt: process + output contract"
        ],
        "code": {
          "label": ".claude/agents/explorer.md - annotated",
          "code": "---\nname: explorer\ndescription: Read-only cartographer. Use PROACTIVELY when a question needs reading more than 5 files. Maps subsystems, never edits.\ntools: Read, Grep, Glob            # least privilege\nmodel: sonnet                      # fast + cheap for wide reads\n---\n\nYou are a read-only exploration agent...   <- system prompt starts here"
        },
        "script": "Put this file on the screen and label each line by hand. Ask the room: 'Which single line makes this agent safe to point at any code?' Answer: the tools line."
      },
      {
        "segment": "micro-build",
        "eyebrow": "✍️ The prompt",
        "title": "Write the explorer's system prompt - with a real output contract",
        "body": "Now write the body, where reliability actually lives. The system prompt does three jobs: it fences the role ('you never modify files'), it prescribes a process (search wide before reading deep), and - most important - it mandates a fixed output structure with an explicit obstacles section. That obstacles section is what turns a guessing agent into a trustworthy one: you are ordering it to admit uncertainty rather than fabricate. Copy this into your explorer.md body exactly. This is the same contract the reviewer and editor will follow on Thursday, just adapted to their jobs.",
        "bullets": [
          "Fence the role: read-only, one responsibility",
          "Prescribe process: search wide, then read narrow",
          "Mandate a schema with a required Obstacles section",
          "Obstacles section = permission to say 'I do not know'"
        ],
        "code": {
          "label": ".claude/agents/explorer.md - the system prompt body",
          "code": "You are a read-only exploration agent. Your ONLY job is to map code\nand report findings. You never modify files.\n\nProcess:\n1. Search broadly with Glob/Grep before reading. Read only what matters.\n2. Trace the specific subsystem or data flow named in the task.\n3. Do not speculate. If a path is unclear or a file is missing, say so.\n\nReturn EXACTLY this structure and nothing else:\n\n## Entry points\n- <file:line> - <what starts here>\n## Key modules\n- <file> - <responsibility>\n## Data flow\n1. <step> -> <step>\n## Obstacles\n- <anything you could NOT determine, and why>\n## Confidence\n<high | medium | low> - <one sentence why>"
        },
        "script": "Have everyone paste this into their explorer.md and save. Say: 'You just wrote a contract. The main agent no longer reads prose from this agent - it reads these five headers.'"
      },
      {
        "segment": "micro-build",
        "eyebrow": "🚀 Delegate",
        "title": "Delegate a scoped task and read the summary come back",
        "body": "Close Monday by using the agent you just built. Point Claude Code at any real subsystem and delegate to the explorer. Because the explorer is read-only, you can run it fearlessly - it physically cannot change anything. Watch what returns: not a transcript of forty files, but the five-section summary, obstacles and all, landing cleanly in your main context. That contrast - all that reading, one tidy report - is the entire value proposition of subagents in a single interaction. On Thursday we add the reviewer and editor and wire the handoffs into a real change.",
        "bullets": [
          "Invoke explicitly: 'use the explorer subagent to map X'",
          "Read-only means zero risk on a real subsystem",
          "You receive the schema, not the file dump",
          "That contrast IS the lesson - carry it into Thursday"
        ],
        "code": {
          "label": "Delegating to your new subagent (type this to Claude Code)",
          "code": "Use the explorer subagent to map how the enrollment webhook\nflows from the HTTP route to the database write. I only want\nthe structured summary - do not read the whole codebase, and\nreport anything you cannot trace in the Obstacles section."
        },
        "script": "Run it live on the class repo. When the summary returns, scroll up to show how little landed in the main window. End with the Thursday trailer: 'Next class, three of these, coordinated on one real change.'"
      }
    ],
    "thursday": [
      {
        "segment": "build-map",
        "eyebrow": "🗺️ Today's build",
        "title": "Four checkpoints to a coordinated team of three",
        "body": "Today you ship the machine you saw Monday. Four checkpoints: CP0 scaffold the .claude/agents/ folder, CP1 build one specialized subagent with a structured output, CP2 grow it into a team of three with scoped tools, and CP3 run a coordinated pass that splits exploration from editing on a real change. Each checkpoint produces a committed artifact, so by the end your repository holds a reusable AI team, not a one-off chat. Keep Monday's two problems in view - context pollution and no parallelism - because every agent we build exists to attack one of them.",
        "bullets": [
          "CP0 - scaffold .claude/agents/",
          "CP1 - first subagent with structured output",
          "CP2 - three subagents with scoped tools",
          "CP3 - a coordinated run: explore -> review -> edit"
        ],
        "script": "Post the four checkpoints on the wall. Tell students we do not advance to the next CP until the current artifact is saved and verifiable. This is a build day - hands on keyboards the whole time."
      },
      {
        "segment": "build-map",
        "eyebrow": "👥 The roster",
        "title": "Meet the three roles and the one rule that separates them",
        "body": "The team is deliberately small and deliberately unequal in power. The explorer is read-only and maps code. The reviewer is read-only and scores risk. The editor is the ONLY agent with write and bash access, and it runs last, after the other two have done their jobs. That asymmetry is the safety design: exploration and review can never accidentally change your code, and the one agent that can change code has the narrowest, most supervised job. As you build each file, notice the tools line getting more powerful only when the role genuinely needs it.",
        "bullets": [
          "explorer - Read, Grep, Glob (maps)",
          "reviewer - Read, Grep, Glob (scores risk)",
          "editor - Read, Edit, Write, Bash (changes code, runs last)",
          "Only ONE agent can write - that is the safety design"
        ],
        "code": {
          "label": "Least-privilege at a glance",
          "code": "AGENT      TOOLS                        CAN IT CHANGE CODE?\n--------   --------------------------   -------------------\nexplorer   Read, Grep, Glob             no\nreviewer   Read, Grep, Glob             no\neditor     Read, Edit, Write, Bash      YES (and runs last)"
        },
        "script": "Walk the table row by row. Ask: 'If the explorer is compromised or confused, what is the worst it can do?' Answer: nothing, it cannot write. That is why we scope tools."
      },
      {
        "segment": "guided-build",
        "eyebrow": "📁 CP0",
        "title": "Scaffold the .claude/agents/ folder",
        "body": "Start by making the home for your team. Project-level subagents live in .claude/agents/ at the repo root, which means they get committed and shared with everyone who clones the repo - your teammates inherit the team automatically. Create the folder, then open /agents to confirm Claude Code sees it and lists it as the project scope. We deliberately choose project-level over user-level here: this team is a repo asset, reviewable in a pull request, not a personal preference hidden in your home directory.",
        "bullets": [
          "Project scope = .claude/agents/ (committed, team-shared)",
          "User scope = ~/.claude/agents/ (personal, all projects)",
          "Run /agents to confirm Claude Code sees the folder",
          "Project-level wins when two agents share a name"
        ],
        "code": {
          "label": "CP0 - create and verify",
          "code": "mkdir -p .claude/agents\n\n# then in Claude Code:\n/agents\n# confirm it opens the manager and shows 'Project agents' scope\n# pointing at .claude/agents/ (empty for now)"
        },
        "script": "Everyone runs the mkdir and opens /agents. Do a quick thumbs-up check that the manager opened for each student before moving on. No one advances with a broken scaffold."
      },
      {
        "segment": "guided-build",
        "eyebrow": "🧭 CP1",
        "title": "Build the explorer - your first structured subagent",
        "body": "Create explorer.md, the read-only cartographer from Monday. This is the copy-ready file: least-privilege tools, a fenced read-only role, a search-wide-then-read-narrow process, and the mandatory five-section output schema ending in Obstacles and Confidence. Save it in .claude/agents/, then open /agents to confirm it registered. The description matters as much as the body - it is how the main agent decides to delegate, so it names the trigger condition ('needs reading more than five files') explicitly.",
        "bullets": [
          "tools: Read, Grep, Glob - cannot edit anything",
          "description names the delegation trigger",
          "Body mandates the five-section schema",
          "Confidence + Obstacles make it trustworthy"
        ],
        "code": {
          "label": ".claude/agents/explorer.md (complete file)",
          "code": "---\nname: explorer\ndescription: Read-only codebase cartographer. Use PROACTIVELY when a question needs reading more than 5 files. Maps subsystems, traces data flow, locates code. Returns a structured summary and never edits.\ntools: Read, Grep, Glob\nmodel: sonnet\n---\n\nYou are a read-only exploration agent. Your ONLY job is to map code\nand report findings. You never modify files.\n\nProcess:\n1. Search broadly with Glob/Grep before reading. Read only what matters.\n2. Trace the specific subsystem or data flow named in the task.\n3. Do not speculate. If a path is unclear or a file is missing, say so.\n\nReturn EXACTLY this structure and nothing else:\n\n## Entry points\n- <file:line> - <what starts here>\n## Key modules\n- <file> - <responsibility>\n## Data flow\n1. <step> -> <step>\n## Obstacles\n- <anything you could NOT determine, and why>\n## Confidence\n<high | medium | low> - <one sentence why>"
        },
        "script": "Paste, save, verify in /agents together. Then delegate one real question to it and read the schema back. Do not move on until every student has a working explorer returning the five headers."
      },
      {
        "segment": "guided-build",
        "eyebrow": "🧪 CP1 check",
        "title": "Prove the explorer's output contract holds",
        "body": "Before adding more agents, stress the contract on the one you have. Delegate a question you know the answer to, and check three things: did it return exactly the five sections, did it fill Obstacles honestly rather than leaving it blank, and did its Confidence match reality. If it drifted from the schema, the fix is in the body - tighten the 'return EXACTLY this structure' instruction. A subagent whose output you have verified once is a subagent the rest of the team can trust; do this now while there is only one to debug.",
        "bullets": [
          "Delegate a question with a known answer",
          "Verify: five sections, honest Obstacles, calibrated Confidence",
          "Drift? Tighten the schema instruction in the body",
          "Verify the contract now, while there is only one agent"
        ],
        "code": {
          "label": "CP1 verification prompt",
          "code": "Use the explorer subagent to map where the scheduler service\nregisters its cron jobs and what each one calls. Return only\nyour structured summary. In Obstacles, list any job whose\ntarget you could not resolve."
        },
        "script": "Have two students share their explorer's output on screen. Compare the Obstacles sections - the honest one is doing its job. Reinforce: an empty Obstacles section on a hard question is a red flag, not a gold star."
      },
      {
        "segment": "guided-build",
        "eyebrow": "🛡️ CP2a",
        "title": "Add the reviewer - a read-only risk scorer",
        "body": "Now grow the team. The reviewer is also read-only, but its job is judgment, not mapping: given a plan or a diff, it checks the work against this repo's CLAUDE.md governance - idempotency, contracts, failure paths, security - and returns a scored verdict. Give it a heavier model (opus) because judgment benefits from it, and keep its tools read-only because a reviewer that can edit is a reviewer with a conflict of interest. Its output contract ends in a verdict the orchestrator can gate on: PASS, CHANGES_REQUESTED, or BLOCK.",
        "bullets": [
          "Read-only: a reviewer must never fix what it reviews",
          "model: opus - judgment earns the heavier model",
          "Checks idempotency, contracts, failure path, security",
          "Verdict enum lets the orchestrator gate the editor"
        ],
        "code": {
          "label": ".claude/agents/reviewer.md (complete file)",
          "code": "---\nname: reviewer\ndescription: Risk and correctness reviewer. Use before any non-trivial edit. Reviews a plan or diff against CLAUDE.md rules and returns a scored verdict. Read-only and never edits.\ntools: Read, Grep, Glob\nmodel: opus\n---\n\nYou are a review agent. You do not fix code; you find what is wrong\nwith it and report. Review only what the task names - do not expand scope.\n\nCheck every item:\n- Idempotency: is the operation safe to run twice?\n- Contracts: are inputs/outputs typed and validated?\n- Failure path: timeout, retry cap, error class, fallback present?\n- Security: input validated, no secrets, access scoped?\n\nReturn EXACTLY:\n\n## Verdict\nPASS | CHANGES_REQUESTED | BLOCK\n## Findings\n- [high|med|low] <file:line> - <problem> -> <required fix>\n## Not reviewed\n- <anything out of scope or that you could not access>"
        },
        "script": "Build reviewer.md together. Point out the conflict-of-interest reasoning: the maker is never its own checker. This mirrors the repo's own remediate-pr rule - the fixer and the verifier are different agents."
      },
      {
        "segment": "guided-build",
        "eyebrow": "✏️ CP2b",
        "title": "Add the editor - the only agent that can change code",
        "body": "The third agent is the only one with power to write, so it gets the tightest leash. The editor takes an already-explored, already-reviewed change and makes the minimal diff - no redesign, no scope expansion. It runs the typecheck itself and refuses to report success until tsc passes, which is this repo's minimum gate. Critically, it is told to STOP and report an obstacle if the approved plan does not fit the real code, rather than improvising. That single instruction is what keeps the powerful agent from going rogue when reality disagrees with the plan.",
        "bullets": [
          "tools: Read, Edit, Write, Bash - the only writer",
          "Minimal diff only - no redesign, no scope creep",
          "Runs tsc --noEmit and gates its own success on it",
          "STOP-and-report if the plan does not fit reality"
        ],
        "code": {
          "label": ".claude/agents/editor.md (complete file)",
          "code": "---\nname: editor\ndescription: Implements a scoped, pre-reviewed change. Use ONLY after explorer has mapped the code and reviewer has cleared the plan. Makes the minimal edit, runs the typecheck, reports what changed.\ntools: Read, Edit, Write, Bash\nmodel: sonnet\n---\n\nYou implement one specific, already-approved change. You do not\nredesign, expand scope, or explore beyond the files named in your task.\n\nRules:\n- Make the minimal diff that satisfies the task.\n- After editing, run: npx tsc --noEmit. Do not report success until it passes.\n- If the task is ambiguous or the approved plan does not fit the actual\n  code, STOP and report the obstacle. Do not guess.\n\nReturn EXACTLY:\n\n## Changed\n- <file> - <what changed>\n## Verification\n- tsc --noEmit: <pass | fail + first error>\n## Obstacles\n- <anything that blocked you, or \"none\">"
        },
        "script": "Save editor.md, then run /agents and show all three registered. Say: 'Your repo now has a team. It is three Markdown files. Commit them and every teammate inherits it.' git add .claude/agents/ live."
      },
      {
        "segment": "guided-build",
        "eyebrow": "🔗 CP3",
        "title": "Coordinate the team on one real change",
        "body": "This is the payoff run. Pick a genuine small change in the repo and drive all three agents through it from the main session as orchestrator. The explorer maps the affected code and returns its schema; you pass those findings to the reviewer, which returns a verdict; only if the verdict is PASS or CHANGES_REQUESTED-then-addressed do you hand the scoped plan to the editor. Notice you - the main agent - are the hub: each summary comes back to you, and you decide the next handoff. This is exploration split from editing, with a review gate in between, running as one coordinated pass.",
        "bullets": [
          "You are the orchestrator - route every handoff",
          "explorer maps -> reviewer scores -> editor implements",
          "The reviewer's verdict gates whether the editor runs",
          "Each agent's summary returns to you, not to each other"
        ],
        "code": {
          "label": "CP3 - the coordinated run (type this to Claude Code)",
          "code": "We are adding a 5s timeout to the Apollo API client.\n\n1. Use the explorer subagent to map every call site in\n   apolloService.ts and how errors are currently handled.\n2. Take its summary and use the reviewer subagent to check\n   the plan against our failure-path and idempotency rules.\n3. Only if the reviewer returns PASS or its fixes are addressed,\n   use the editor subagent to make the minimal change and run tsc.\nShow me each agent's structured summary at every handoff."
        },
        "script": "Run this end to end on the projector. Pause at each handoff and read the returning schema aloud. When the editor's tsc passes, you have demonstrated the whole week in one run. This is the Thursday deliverable."
      },
      {
        "segment": "guided-build",
        "eyebrow": "⚡ CP3 bonus",
        "title": "Parallel variant - two explorers, two subsystems, one turn",
        "body": "For independent work, show the team's other superpower. When you need to understand two unrelated subsystems, launch two explorer runs in a single message and they execute concurrently, each in its own window, cutting wall-clock time roughly in half. The constraint is independence: this only works because mapping the billing code does not depend on mapping the auth code. Remember the honest tradeoff from Monday - you are buying time, not tokens; both agents run their full context. Use this whenever two questions do not need each other's answers.",
        "bullets": [
          "Two independent maps -> one message, concurrent runs",
          "Only valid when the tasks do not depend on each other",
          "Buys wall-clock time, not token savings",
          "Main session synthesizes both summaries afterward"
        ],
        "code": {
          "label": "Parallel delegation (type this to Claude Code)",
          "code": "These two are independent - run them in parallel:\n- Use the explorer subagent to map the enrollment webhook flow.\n- Use the explorer subagent to map the scheduler cron registration.\nWhen both return, synthesize a single list of shared dependencies\nbetween the two subsystems."
        },
        "script": "Kick both off in one message and let students watch them run at once. Contrast with CP3, which was strictly sequential because each step needed the last. Independence is the deciding factor - say it twice."
      },
      {
        "segment": "failure",
        "eyebrow": "💥 Break it",
        "title": "Injection: full tool access and unstructured output",
        "body": "Now we deliberately break the team the way real teams break. Edit the explorer: delete its tools line so it inherits ALL tools, and strip the output schema from its body, leaving a vague 'look into the code' job. Delegate a task and watch two things go wrong at once. With no tool boundary, the read-only mapper can now edit files - and may. With no schema, it returns a wall of prose you cannot parse or trust. The agent did work; none of it is safe to act on. This is exactly Monday's second anti-pattern, felt firsthand.",
        "bullets": [
          "Remove tools line -> explorer inherits Edit, Write, Bash",
          "Remove schema -> output is unstructured prose",
          "The 'read-only' mapper can now silently change code",
          "Coordinator can no longer trust or parse the result"
        ],
        "code": {
          "label": "The broken explorer (do NOT keep this)",
          "code": "---\nname: explorer\ndescription: looks into the code\n---\n\nLook into the code and tell me what you find.\n\n# No tools line  -> inherits ALL tools (can edit!)\n# No schema      -> returns unparseable prose\n# No obstacles   -> hides what it could not determine"
        },
        "script": "Have students actually make this change and run it. The room needs to feel the wrongness - an explorer that edited a file, a summary they cannot use. Discomfort here is the point; it makes the fix stick."
      },
      {
        "segment": "failure",
        "eyebrow": "🕳️ Break it again",
        "title": "Injection: over-delegation and the coordination tax",
        "body": "The second failure is quieter and more common. Take a genuinely trivial task - rename one variable, add one import - and force it through the full team: explorer maps, reviewer reviews, editor edits. Time it. The three round trips, each booting a fresh context and writing a summary, take far longer and cost far more tokens than doing the edit inline in two seconds. Nothing errored, which is why this failure hides - the team 'worked,' it was just the wrong tool. This is the over-delegation anti-pattern, and the smell test is simple: was the task smaller than the briefs describing it?",
        "bullets": [
          "Force a one-line task through all three agents",
          "Three round trips of overhead for two seconds of work",
          "It succeeds - which is why the waste is invisible",
          "Smell test: task smaller than its own brief? Do it inline"
        ],
        "code": {
          "label": "Over-delegation (the wrong call)",
          "code": "# DON'T: three subagents to rename one variable\nUse the explorer to find where userId is defined, then the\nreviewer to check the rename, then the editor to rename it.\n\n# DO: just make the edit inline in the main session.\n# Reserve the team for context isolation or parallel work."
        },
        "script": "Run both the delegated and the inline version and put the timers side by side. The gap is the coordination tax. Tie it back: subagents solve context pollution and parallelism, not small edits."
      },
      {
        "segment": "failure",
        "eyebrow": "🔧 Harden",
        "title": "Recovery: scope the tools, mandate the schema, restore trust",
        "body": "Now fix what you broke and watch reliability return. Put the tools line back to Read, Grep, Glob so the explorer physically cannot edit. Restore the mandatory five-section schema with its Obstacles section so the output is parseable and honest. Re-run the same task from the injection slide: the explorer now maps without touching anything and returns clean, structured findings the reviewer can consume. That is the whole thesis of the week made concrete - a subagent is only trustworthy when its tools are scoped, its output is structured, and it is honest about what it could not do. Commit the hardened team; that is your deliverable.",
        "bullets": [
          "Restore tools: Read, Grep, Glob (read-only again)",
          "Restore the five-section schema + Obstacles",
          "Re-run: clean, structured, trustworthy output returns",
          "Commit .claude/agents/ - the hardened team is the deliverable"
        ],
        "code": {
          "label": "The hardened explorer restored + committed",
          "code": "---\nname: explorer\ndescription: Read-only cartographer. Returns a structured map, never edits.\ntools: Read, Grep, Glob\nmodel: sonnet\n---\n(five-section schema body restored, Obstacles required)\n\n# then lock it in:\ngit add .claude/agents/explorer.md .claude/agents/reviewer.md \\\n        .claude/agents/editor.md\ngit commit -m \"Add coordinated 3-agent team (explorer/reviewer/editor)\""
        },
        "script": "End the class here. Re-run the injection task on the hardened agent so the room sees trust restored in real time. Recap the three pillars one last time, then have everyone commit their team. That commit is the portfolio artifact."
      }
    ]
  },
  "8": {
    "monday": [
      {
        "segment": "business-problem",
        "eyebrow": "🔁 The compounding problem",
        "title": "A one-time AI win doesn't compound. A workflow does.",
        "body": "Weeks 1 through 7 you learned to get Claude to do the work. But every change still rides a human-driven ritual: run the tests, format the code, write the PR description, wait for review. If a person has to sit and babysit each run, you have a faster typist, not an automation platform. The value of AI in engineering only compounds when the ritual around the change runs itself, reliably, on every change, without you watching.",
        "bullets": [
          "One-off: you prompt, you verify, you ship. Linear effort.",
          "Repeatable: the workflow verifies and ships. Effort amortizes to zero.",
          "The bottleneck is never writing code, it is the ceremony around each change",
          "This week turns Claude Code from a chat tool into a platform"
        ],
        "script": "Open by asking: 'How many of you, in Weeks 1 to 7, did the same three things after every AI change: test, format, describe the PR?' Let hands go up. 'That ceremony is the tax. Today we make the ceremony automatic. That is the whole difference between an AI experiment and an AI capability.'"
      },
      {
        "segment": "business-problem",
        "eyebrow": "💥 The cautionary tale",
        "title": "Automation without verification ships a bad change quietly.",
        "body": "Picture a nightly routine wired to run headless with full permissions and no checks. It gets a task, edits files, and pushes straight to main, all while everyone sleeps. One malformed edit, a broken import, a deleted test, and the automation happily commits and pushes it. Nobody prompted it wrong. The failure is architectural: broad permissions plus no verification step equals an unattended liability. The demo worked; production broke, and no human was in the loop to catch it.",
        "bullets": [
          "Broad permissions: it can do anything, including push and delete",
          "No verification: it never confirms the change actually works",
          "Unattended: no human catches the red build before it lands",
          "Result: a silent regression shipped with full confidence"
        ],
        "script": "Tell the story slowly. 'It ran at 2am. It edited a file, the import broke, tests would have caught it, but there were no tests in the loop. It pushed to main. At 9am the site was down.' Then land the frame: 'Every guardrail we build today exists to make that story impossible. Hold this example, we will dissect it in the deconstruct segment.'"
      },
      {
        "segment": "business-problem",
        "eyebrow": "🏗️ The reframe",
        "title": "Claude Code has five automation surfaces. Learn the map.",
        "body": "Most people use Claude Code as an interactive assistant and stop there. But it exposes five distinct surfaces that together make it a programmable automation platform. Custom commands package repeatable prompts. Hooks add deterministic guardrails around a probabilistic agent. The SDK and headless mode let it run unattended. Permission modes set how much you trust a given run. And GitHub Actions plus automated review put it in your CI pipeline. Your job this week is to wire all five into one real workflow that runs itself.",
        "bullets": [
          "Custom commands — reusable, parameterized prompts as files",
          "Hooks — deterministic control and formatting around every tool call",
          "SDK + headless — unattended runs from a script or a cron",
          "Permission modes — the supervised-to-unsupervised trust dial",
          "GitHub Actions + code review — automation inside your pipeline"
        ],
        "script": "Put the five words on the board and leave them up all class. 'By Thursday every one of these is wired into your repo. Monday is the map, Thursday is the build. Notice the order: the last two only become safe because of the middle three.'"
      },
      {
        "segment": "architecture",
        "eyebrow": "🗺️ The surface map",
        "title": "Where each surface lives and what it controls.",
        "body": "These five surfaces are not interchangeable, they compose. Commands and hooks live in your repo under .claude/ and travel with the code, so the whole team inherits them. The SDK and headless mode are how the same agent runs without a human at the keyboard. Permission modes and the allow/deny lists gate what any run is allowed to touch. GitHub Actions is where the agent meets your existing CI. Read the map as layers: local authoring at the bottom, unattended execution in the middle, pipeline integration on top.",
        "bullets": [
          "Custom commands — .claude/commands/*.md — packaged prompts",
          "Hooks — .claude/settings.json + .claude/hooks/*.sh — deterministic gates",
          "SDK — @anthropic-ai/claude-agent-sdk (TS) / claude-agent-sdk (Py)",
          "Headless — claude -p '...' — non-interactive one-shot runs",
          "CI — anthropics/claude-code-action@v1 — review on every PR"
        ],
        "code": {
          "label": "The .claude/ directory that ships with your repo",
          "code": ".claude/\n  settings.json          # hooks, permissions, model (team-shared, committed)\n  settings.local.json    # personal overrides (git-ignored)\n  commands/\n    ship.md              # -> becomes the /ship command\n    review.md            # -> becomes the /review command\n  hooks/\n    pre-commit-guard.sh  # PreToolUse guardrail\n    format.sh            # PostToolUse formatter\n    verify.sh            # Stop-hook verification gate"
        },
        "script": "Walk the tree top to bottom. 'Everything here is version-controlled. That is the point: your automation is code, it is reviewed, it is shared. settings.json is the team contract; settings.local.json is your personal desk. When a teammate clones the repo, they inherit your /ship command for free.'"
      },
      {
        "segment": "architecture",
        "eyebrow": "⚙️ The local layer",
        "title": "Commands package prompts; hooks make the probabilistic deterministic.",
        "body": "A custom command is just a Markdown file whose body is a prompt template. The filename becomes the command, and $ARGUMENTS or $1, $2 inject parameters. Hooks are the deeper idea: they are shell commands the harness runs deterministically at fixed points in the agent's lifecycle. Where the agent is probabilistic, the hook is guaranteed to run every single time. That is the core principle of this repo made concrete: LLMs are probabilistic, so you wrap them in deterministic control. A hook can format code after every edit, or block a dangerous command before it runs.",
        "bullets": [
          "Command = a prompt file; frontmatter sets allowed-tools, description, model",
          "Hook = a shell command the harness runs at a lifecycle event, every time",
          "PreToolUse hook can veto a tool call (exit code 2 blocks it)",
          "PostToolUse hook runs after a tool succeeds (format, lint, log)",
          "Determinism wraps the probabilistic core — this is the whole design"
        ],
        "code": {
          "label": "A custom command is a file: .claude/commands/ship.md",
          "code": "---\ndescription: Test, format, and draft a PR for the current change\nargument-hint: [pr-title]\nallowed-tools: Bash(npm test:*), Bash(npm run format:*), Bash(git diff:*)\n---\nRun `npm test`. If it passes, run `npm run format`.\nThen read `git diff` and draft a PR description titled: $ARGUMENTS\nInclude a summary, a test-evidence line, and a risk note."
        },
        "script": "Type /ship right there in a live session so they see it resolve. 'The command is a file. The hook is a guarantee. Say it back to me: what runs every time no matter what the model decides? The hook. That word deterministic is the whole reason hooks exist.'"
      },
      {
        "segment": "architecture",
        "eyebrow": "🤖 The unattended layer",
        "title": "The SDK and headless mode remove the human from the keyboard.",
        "body": "Interactive Claude Code assumes a person is present to approve. Headless mode, invoked with claude -p, runs a single prompt to completion and prints a result, no prompts, no approvals. The Claude Agent SDK is the same engine as a library: you call query() from TypeScript or Python and stream messages back. This is how you turn a workflow into a routine, a scheduled unattended run: a cron job, a CI step, or a queue worker that calls the SDK. The output can be JSON so a downstream program can parse the result and decide what to do next.",
        "bullets": [
          "claude -p 'prompt' — one-shot, non-interactive, prints and exits",
          "--output-format json | stream-json — machine-readable results",
          "SDK query() — embed the agent in your own program",
          "Routine = headless run on a schedule (cron, CI, queue)",
          "No human present means every safety decision must be pre-declared"
        ],
        "code": {
          "label": "The same task, two ways to run it unattended",
          "code": "# Headless one-shot (shell / cron)\nclaude -p \"Regenerate CHANGELOG.md from the last 10 commits\" \\\n  --output-format json --max-turns 15\n\n# As a library (TypeScript, @anthropic-ai/claude-agent-sdk)\nimport { query } from \"@anthropic-ai/claude-agent-sdk\";\nfor await (const msg of query({ prompt: \"Regenerate CHANGELOG.md\" })) {\n  if (msg.type === \"result\") console.log(msg.result);\n}"
        },
        "script": "Frame the shift: 'Interactive mode has a safety net — you. Headless removes the net. So everything you would have decided in the moment, you now decide in advance: which tools, which files, what counts as done. That is not a limitation, that is the contract that makes unattended safe.'"
      },
      {
        "segment": "architecture",
        "eyebrow": "🎛️ The trust dial",
        "title": "Permission modes decide how much rope an unsupervised run gets.",
        "body": "Permission mode is the single most important safety control in automation. In default mode Claude asks before edits and commands. acceptEdits lets it write files without asking but still stops for shell commands. plan mode lets it explore and propose but change nothing. bypassPermissions skips every prompt, which is only ever appropriate in a sandbox you can throw away. Independently of the mode, the permissions block in settings.json holds allow, deny, and ask lists that scope exactly which tools and paths are reachable. Least privilege is the rule: grant the minimum the task needs and deny everything dangerous by name.",
        "bullets": [
          "default — asks before edits and Bash; the supervised baseline",
          "acceptEdits — writes files freely, still gates shell commands",
          "plan — read and propose only, zero mutations (great for review)",
          "bypassPermissions — no prompts; disposable sandboxes only",
          "allow / deny / ask lists scope tools and paths regardless of mode"
        ],
        "code": {
          "label": "Least-privilege permissions for an unattended run (settings.json)",
          "code": "{\n  \"permissions\": {\n    \"allow\": [\n      \"Read\", \"Edit\",\n      \"Bash(npm test:*)\", \"Bash(npm run format:*)\",\n      \"Bash(git add:*)\", \"Bash(git commit:*)\"\n    ],\n    \"deny\": [\n      \"Bash(git push:*)\", \"Bash(rm -rf:*)\",\n      \"Read(./.env)\", \"Read(./secrets/**)\"\n    ]\n  }\n}"
        },
        "script": "Point at the deny list. 'Notice what is denied: push, rm -rf, and reading .env. The automation can build and commit, but it cannot ship on its own and it cannot read your secrets. That is least privilege. When someone asks how you run this unsupervised safely, this block is half your answer.'"
      },
      {
        "segment": "architecture",
        "eyebrow": "✅ The trust keystone",
        "title": "CI review is the reach; verification is what makes it trustworthy.",
        "body": "GitHub Actions puts Claude in your pipeline: on every pull request the claude-code-action runs a review and comments findings inline, before a human even looks. That is the reach. But reach without a verification step is exactly the 2am failure from earlier. Verification is the discipline that a run must prove its change works, by running the tests and reading the output, before it is allowed to finish or ship. It is the other half of the safety answer: least-privilege permissions decide what a run may touch, and the verification gate decides whether its result is allowed to stand.",
        "bullets": [
          "CI review — automated PR review on open and every push",
          "Recommend-only — the reviewer comments, humans still approve and merge",
          "Verification — the run must execute tests and observe green to proceed",
          "Two halves of trust: permissions scope the blast radius, verification proves the result",
          "Automation without verification is a production defect waiting to happen"
        ],
        "code": {
          "label": "Verification gate as a Stop hook — blocks finishing on a red build",
          "code": "// .claude/hooks/verify.sh\n#!/usr/bin/env bash\nif ! npm test --silent > /tmp/verify.log 2>&1; then\n  echo \"Verification failed: tests are red. Do not finish — fix them.\" >&2\n  exit 2   # exit 2 blocks Stop; stderr is fed back so Claude keeps working\nfi\nexit 0"
        },
        "script": "This is the poll moment. Ask: 'Running Claude Code headless in CI, what MUST be true?' Take votes, then reveal: 'Scoped permissions plus a verification step. Not full permissions, not never-fails, not nothing special.' Then hold the verify.sh hook up: 'This little script is the difference between an automation you trust and one you fear. Exit 2 means: you are not done, the build is red, go fix it.'"
      },
      {
        "segment": "deconstruct",
        "eyebrow": "🔎 Anatomy of the 2am failure",
        "title": "Replay the bad run and mark where each guardrail catches it.",
        "body": "Let's take the cautionary tale apart step by step and find every point a guardrail would have stopped it. The run started with bypassPermissions, so no allow/deny list scoped it: guardrail one missed. It edited a file and broke an import; a PostToolUse formatter or typecheck hook would have surfaced it immediately: guardrail two missed. It never ran the tests; a Stop-hook verification would have blocked finishing on red: guardrail three missed. Then it ran git push because push was not denied: guardrail four missed. Four independent controls, any one of which converts a silent disaster into a caught, logged, harmless failure.",
        "bullets": [
          "bypassPermissions with no deny list → add scoped allow/deny",
          "Broken import shipped → PostToolUse typecheck/format hook catches it",
          "Tests never ran → Stop-hook verification blocks on red",
          "git push not denied → deny Bash(git push:*), require human to ship",
          "Defense in depth: four gates, each independently sufficient"
        ],
        "script": "Draw the timeline left to right on the board and put an X at each of the four missed gates. 'Any single one of these would have saved the morning. This is defense in depth: you do not rely on one control being perfect, you stack cheap controls so the failure has to beat all of them. It never does.'"
      },
      {
        "segment": "deconstruct",
        "eyebrow": "🧬 Hook lifecycle",
        "title": "How a hook actually intercepts the agent: events, stdin, exit codes.",
        "body": "A hook is not magic, it is a contract with the harness. At each lifecycle event the harness runs your command and pipes a JSON payload to its stdin describing what is about to happen or just happened. Your command inspects that payload and signals back through its exit code. Exit 0 means proceed. For a PreToolUse hook, exit 2 blocks the tool call and feeds your stderr back to Claude as the reason. The events you care about this week are PreToolUse (veto or approve a tool call), PostToolUse (react after a tool ran), and Stop (gate whether the session may end). Matchers restrict a hook to specific tools, like Bash or Edit.",
        "bullets": [
          "Events: PreToolUse, PostToolUse, UserPromptSubmit, Stop, SessionStart, and more",
          "Input: JSON on stdin — .tool_name, .tool_input, .cwd, .hook_event_name",
          "Output: exit 0 = allow, exit 2 = block (stderr becomes the reason)",
          "matcher scopes the hook to a tool: 'Bash', 'Edit|Write|MultiEdit'",
          "$CLAUDE_PROJECT_DIR resolves paths so hooks are portable"
        ],
        "code": {
          "label": "A PreToolUse guardrail reading stdin JSON and vetoing by exit code",
          "code": "// .claude/hooks/pre-commit-guard.sh\n#!/usr/bin/env bash\ninput=$(cat)                                   # harness pipes JSON on stdin\ncmd=$(echo \"$input\" | jq -r '.tool_input.command')\nif echo \"$cmd\" | grep -qE 'rm -rf|git push --force'; then\n  echo \"Blocked dangerous command: $cmd\" >&2   # stderr -> reason shown to Claude\n  exit 2                                        # exit 2 vetoes the tool call\nfi\nexit 0"
        },
        "script": "Slow down here, this is the mental model everything else rests on. 'The harness hands your hook a JSON envelope and asks: should this happen? Your exit code answers. Zero: yes. Two: no, and here is why. That is the entire protocol. Once you own this, hooks stop being mysterious and start being your favorite tool.'"
      },
      {
        "segment": "deconstruct",
        "eyebrow": "🥪 The determinism sandwich",
        "title": "Probabilistic agent in the middle, deterministic bread on both sides.",
        "body": "Step back and see the shape of a safe automation. In the middle is the model: creative, capable, and non-deterministic, you cannot guarantee its exact next move. On the bottom is a PreToolUse layer of deterministic control: it decides, by fixed rules, which actions are even allowed to happen. On the top is a PostToolUse and Stop layer of deterministic verification: it formats, typechecks, and proves the result before anything is final. The agent never touches the outside world except through those two deterministic slices. That is how you get creativity and safety at once, and it is exactly this repo's founding principle: LLMs are probabilistic, production systems must be deterministic.",
        "bullets": [
          "Bottom slice (PreToolUse): rule-based control — what may run",
          "Middle (the model): probabilistic reasoning and generation",
          "Top slice (PostToolUse + Stop): format, typecheck, verify — what may stand",
          "The agent reaches the world only through the deterministic slices",
          "Creativity in the core, determinism at every boundary"
        ],
        "script": "Draw the sandwich literally. 'Bread, filling, bread. The filling is brilliant and unpredictable. The bread is boring and guaranteed. You do not fix unpredictability by making the model boring, you fix it by controlling the boundaries. Keep this picture, on Thursday you build both slices of bread with your own hands.'"
      },
      {
        "segment": "micro-build",
        "eyebrow": "🛠️ Micro-build 1 of 4",
        "title": "Write your first custom command and run it live.",
        "body": "Time to build. Create the file .claude/commands/standup.md with a short frontmatter and a prompt body. The moment you save it, /standup exists in this project for you and anyone who clones the repo. Frontmatter is where you scope it: allowed-tools limits what the command may reach, description shows in the menu, and argument-hint documents the parameter. Then run it and watch Claude execute your packaged prompt. You have just turned a repeatable prompt into a reusable, version-controlled asset.",
        "bullets": [
          "File name becomes the command: standup.md → /standup",
          "$ARGUMENTS injects everything after the command name",
          "allowed-tools in frontmatter scopes the command's reach",
          "Commit it and the whole team inherits the command"
        ],
        "code": {
          "label": "Create .claude/commands/standup.md, then run /standup",
          "code": "---\ndescription: Summarize what changed today for standup\nallowed-tools: Bash(git log:*), Bash(git diff:*)\nargument-hint: [since e.g. yesterday]\n---\nRead the git log $ARGUMENTS and summarize, in 4 bullets, what changed,\nwhat is in progress, and any blocker. Keep it under 80 words."
        },
        "script": "Have everyone save the file and type /standup at the same time. 'Did it appear in your command menu? Good. You just shipped your first automation and it took nine lines. Notice you did not restart anything — drop a file in commands/, it exists. Now try passing an argument: /standup since last Friday.'"
      },
      {
        "segment": "micro-build",
        "eyebrow": "🛠️ Micro-build 2 of 4",
        "title": "Add a PostToolUse hook that formats every file Claude edits.",
        "body": "Now build the top slice of the sandwich: a formatter that runs deterministically after every edit. Add a PostToolUse hook to settings.json matched to the edit tools. The hook reads the edited file's path from the stdin JSON and pipes it to your formatter. From now on, no matter what the model does, every file it touches comes out consistently formatted, without you asking and without a single prompt spent on style. This is a hook earning its keep: a boring, guaranteed action wrapped around a creative, unpredictable one.",
        "bullets": [
          "matcher 'Edit|Write|MultiEdit' scopes the hook to file writes",
          "jq -r '.tool_input.file_path' pulls the path from the stdin payload",
          "xargs -r skips running when no path is present (empty-input safety)",
          "Runs on every edit, deterministically, forever"
        ],
        "code": {
          "label": "Add to .claude/settings.json",
          "code": "{\n  \"hooks\": {\n    \"PostToolUse\": [\n      {\n        \"matcher\": \"Edit|Write|MultiEdit\",\n        \"hooks\": [\n          {\n            \"type\": \"command\",\n            \"command\": \"jq -r '.tool_input.file_path' | xargs -r npx prettier --write\"\n          }\n        ]\n      }\n    ]\n  }\n}"
        },
        "script": "After they add it, tell Claude to edit a deliberately messy file. 'Watch — it comes back formatted and you never mentioned formatting. That is the deterministic top slice. From this second on, style is not the model's job, it is the hook's job, and the hook never forgets.'"
      },
      {
        "segment": "micro-build",
        "eyebrow": "🛠️ Micro-build 3 of 4",
        "title": "Add a PreToolUse guardrail that vetoes dangerous commands.",
        "body": "Build the bottom slice: control over what is even allowed to run. Add a PreToolUse hook matched to Bash that calls a guard script, and make the script executable. The script reads the proposed command from stdin and, if it matches a dangerous pattern, exits 2 to block the call and explains why on stderr. Test it by asking Claude to do something reckless and watch the hook refuse. You now have deterministic control on the front and deterministic verification on the back, the two slices of bread around the model.",
        "bullets": [
          "matcher 'Bash' runs the guard before any shell command",
          "chmod +x the script so the harness can execute it",
          "exit 2 blocks the call; stderr is returned to Claude as the reason",
          "Pair with a settings.json deny list for defense in depth"
        ],
        "code": {
          "label": "Wire the guard in settings.json, then chmod +x it",
          "code": "// settings.json (add alongside PostToolUse)\n\"PreToolUse\": [\n  {\n    \"matcher\": \"Bash\",\n    \"hooks\": [\n      { \"type\": \"command\", \"command\": \"$CLAUDE_PROJECT_DIR/.claude/hooks/pre-commit-guard.sh\" }\n    ]\n  }\n]\n\n# make it runnable\nchmod +x .claude/hooks/pre-commit-guard.sh"
        },
        "script": "Have them ask Claude to run 'rm -rf build' or a force-push. 'It should refuse and tell you why. Feel that? You just gave a probabilistic agent a hard boundary it cannot cross no matter how it reasons. That is what turns fear into trust.' This is the trivia beat — ask 'what is a hook good for?' Answer: formatting and guardrails around commands, your automation's safety rails."
      },
      {
        "segment": "micro-build",
        "eyebrow": "🛠️ Micro-build 4 of 4",
        "title": "Run one scoped headless task and read the JSON result.",
        "body": "Finally, take the human out of the loop for one small, safe task. Run claude -p in acceptEdits mode with a tight allowedTools list and JSON output. Because the task is scoped and the tools are limited, this is a safe first unattended run. Read the JSON: it carries the result text, whether it succeeded, the number of turns, and the cost. That structured output is what a routine or CI step would parse to decide the next move. You have now touched all five surfaces at micro scale, which is exactly Thursday's build, just larger.",
        "bullets": [
          "-p makes it non-interactive; it runs to completion and exits",
          "--permission-mode acceptEdits + tight --allowedTools = safe scope",
          "--output-format json returns result, is_error, num_turns, total_cost_usd",
          "This is a routine in miniature — Thursday you schedule it"
        ],
        "code": {
          "label": "A safe, scoped headless run",
          "code": "claude -p \"Add a one-line JSDoc comment to every exported function in src/utils.ts\" \\\n  --permission-mode acceptEdits \\\n  --allowedTools \"Read\" \"Edit\" \\\n  --output-format json \\\n  --max-turns 10"
        },
        "script": "Run it live and pretty-print the JSON. 'No prompts, no approvals, it just did the work and handed back a receipt. See is_error and total_cost_usd? A program reads those and decides whether to continue. That is the seed of a routine. Poll recap, trivia recap, and here is Thursday: we take these five micro-builds and wire them into one workflow that ships a PR, runs headless, and reviews itself in CI. Come with your repo and Actions enabled.'"
      }
    ],
    "thursday": [
      {
        "segment": "build-map",
        "eyebrow": "🎯 Today's build",
        "title": "Four checkpoints: from empty repo to self-running workflow.",
        "body": "Today you assemble Monday's five surfaces into one workflow that runs itself. CP0 is readiness: a GitHub repo with Actions enabled and the SDK installed. CP1 is the local layer: two custom commands and a hook wired into a real task. CP2 is unattended: a headless or SDK routine that completes a task with nobody watching. CP3 is the pipeline: GitHub Actions running automated code review on every pull request. We build in that order deliberately, because each checkpoint is the safety foundation for the next.",
        "bullets": [
          "CP0 — Ready: repo on GitHub, Actions enabled, SDK installed",
          "CP1 — Automated locally: 2 custom commands + 1 hook in a real workflow",
          "CP2 — Headless: a routine completing a task unattended",
          "CP3 — CI review: Actions running automated review on PRs",
          "Order matters: control and verification before you let it run alone"
        ],
        "script": "Put the four checkpoints on the board as a progress bar. 'We move left to right and we do not skip. By the end, all four are green and you have a workflow that tests, formats, ships a PR, runs a routine, and reviews itself. That is a real capability you can put on a resume and demo to an employer.'"
      },
      {
        "segment": "build-map",
        "eyebrow": "🧭 Readiness check (CP0)",
        "title": "Confirm the ground before we build on it.",
        "body": "Two minutes of setup saves an hour of confusion. Confirm your project is a GitHub repo and Actions is enabled under the repo's Actions tab. Install the Claude Agent SDK so the routine step works later. If you plan to use CI review, run the one-time GitHub app install from inside Claude Code, which creates the workflow file and stores your API key as a repository secret. Verify Claude Code sees your project by checking that .claude/ exists or creating it. If any of these fail, fix it now, everything downstream assumes CP0 is green.",
        "bullets": [
          "GitHub repo with the Actions tab enabled",
          "Claude Agent SDK installed for the routine step",
          "/install-github-app sets up CI + stores ANTHROPIC_API_KEY as a secret",
          "A .claude/ directory in the repo root"
        ],
        "code": {
          "label": "CP0 setup commands",
          "code": "# Install the Agent SDK (TypeScript)\nnpm install @anthropic-ai/claude-agent-sdk\n#   (Python:  pip install claude-agent-sdk)\n\n# One-time CI setup from inside Claude Code — creates the workflow + secret\n/install-github-app\n\n# Confirm the config dir exists\nmkdir -p .claude/commands .claude/hooks"
        },
        "script": "Walk the room. 'Raise your hand if your Actions tab is enabled. If not, Settings, Actions, allow all actions, do it now.' Get everyone to green on CP0 before moving, because the headless and CI steps silently fail on a broken repo and you will waste the class debugging setup instead of learning the build."
      },
      {
        "segment": "guided-build",
        "eyebrow": "🔨 Step 1 — CP1",
        "title": "Build the /ship command: test, format, draft the PR.",
        "body": "The first automation packages the after-every-change ritual into one command. Create .claude/commands/ship.md. The frontmatter scopes it to exactly the tools it needs and nothing more, which is least privilege applied at the command level. The body is the recipe: run the tests, format on green, read the diff, and draft a PR description with a test-evidence line. Now the three-step ceremony from Monday's opening is a single word, /ship, and it is identical every time any teammate runs it.",
        "bullets": [
          "allowed-tools scopes the command — it cannot push, only prepare",
          "The prompt encodes YOUR standard: summary, evidence, risk note",
          "$ARGUMENTS carries the PR title through",
          "Commit ship.md so the ceremony is shared, not personal"
        ],
        "code": {
          "label": ".claude/commands/ship.md",
          "code": "---\ndescription: Test, format, and draft a PR for the current change\nargument-hint: [pr-title]\nallowed-tools: Bash(npm test:*), Bash(npm run format:*), Bash(git diff:*), Bash(git add:*)\n---\n1. Run `npm test`. If it fails, STOP and report the failures — do not continue.\n2. On green, run `npm run format` and stage the changes.\n3. Read `git diff --staged` and draft a PR description titled: $ARGUMENTS\n   with a Summary, a Test Evidence line (paste the passing result), and a Risk note."
        },
        "script": "Everyone creates the file and runs /ship 'add rate limiting to the login route'. 'Watch it refuse to draft the PR if tests are red — that is intentional, verification is baked into the command itself. This is your standard now, encoded once, applied forever.'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "🔨 Step 2 — CP1",
        "title": "Add the /review command as a read-only second opinion.",
        "body": "Your second command is a local reviewer that changes nothing. Create .claude/commands/review.md and scope its allowed-tools to read-only operations only, no Edit, no write. The prompt asks Claude to review the staged diff against your team's standards and list findings by severity. Because it can only read, you can run it fearlessly, even on a routine. This is also a preview of CP3: the same reviewing behavior you will soon run automatically in CI on every pull request.",
        "bullets": [
          "Read-only allowed-tools = a review that physically cannot mutate code",
          "Ask for findings ranked by severity, with file:line references",
          "Mirrors plan permission mode: analyze and propose, never change",
          "Same idea scales to CI review in Step 7"
        ],
        "code": {
          "label": ".claude/commands/review.md",
          "code": "---\ndescription: Read-only review of the staged diff against team standards\nallowed-tools: Bash(git diff:*), Read, Grep, Glob\n---\nReview `git diff --staged` for correctness, security, and CLAUDE.md compliance.\nList findings as: [severity] file:line — issue — suggested fix.\nDo NOT edit anything. If you find a committed secret, flag it FIRST as CRITICAL."
        },
        "script": "'Two commands now: /ship prepares, /review critiques. Notice /review has no Edit tool at all — it is structurally incapable of changing your code. That is a permission decision, not a promise. Run /review on the change you just staged and read what it caught.'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "🔨 Step 3 — CP1",
        "title": "Add the commit-guard hook: no green tests, no commit.",
        "body": "Now the hook that enforces verification at the commit boundary. Add a PreToolUse hook matched to Bash and point it at a guard script. The script reads the proposed command from stdin, and when it sees a git commit it first formats staged files, then runs the tests. If the tests fail it exits 2, which blocks the commit and hands the failure back to Claude as the reason to fix it. This is the hard gate that makes every later step safe: a red build can no longer become a commit, whether a human or a routine is driving.",
        "bullets": [
          "PreToolUse + matcher Bash intercepts the commit before it runs",
          "Format first, then test — the whole verification ceremony in one gate",
          "exit 2 blocks the commit; the failure text steers Claude to fix it",
          "Works identically in interactive and headless runs"
        ],
        "code": {
          "label": ".claude/hooks/pre-commit-guard.sh (chmod +x it, and wire in settings.json)",
          "code": "#!/usr/bin/env bash\ninput=$(cat)\ncmd=$(echo \"$input\" | jq -r '.tool_input.command // empty')\nif echo \"$cmd\" | grep -qE 'git commit'; then\n  npm run format --silent\n  if ! npm test --silent; then\n    echo \"Commit blocked: tests are red. Fix them before committing.\" >&2\n    exit 2\n  fi\nfi\nexit 0"
        },
        "script": "'This is the single most important line you write today: exit 2 on red. Test it — break a test on purpose, then ask Claude to commit. It cannot. The gate holds. Now the difference between supervised and unsupervised stops being scary, because the same gate protects both.'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "🔨 Step 4 — CP2",
        "title": "Scope permissions so an unattended run has least privilege.",
        "body": "Before you let anything run without you, define exactly what it may touch. Add a permissions block to settings.json with a tight allow list and an explicit deny list. Allow reading, editing, testing, formatting, and committing. Deny pushing, destructive shell, and reading secrets by name. This is the blast-radius control from Monday: even if the model misbehaves, it cannot ship on its own and it cannot exfiltrate a secret. Pair this with acceptEdits mode and your routine is scoped to build-and-commit, never build-and-deploy.",
        "bullets": [
          "allow: the minimum the task needs — read, edit, test, format, commit",
          "deny: push, rm -rf, and Read on .env and secrets/**",
          "The routine can prepare a change but a human still ships it",
          "Blast radius is bounded before the run ever starts"
        ],
        "code": {
          "label": "settings.json — permissions for the routine",
          "code": "{\n  \"permissions\": {\n    \"allow\": [\n      \"Read\", \"Edit\",\n      \"Bash(npm test:*)\", \"Bash(npm run format:*)\",\n      \"Bash(git add:*)\", \"Bash(git commit:*)\"\n    ],\n    \"deny\": [\n      \"Bash(git push:*)\", \"Bash(git reset --hard:*)\",\n      \"Bash(rm -rf:*)\", \"Read(./.env)\", \"Read(./secrets/**)\"\n    ]\n  }\n}"
        },
        "script": "'Read the deny list out loud with me: no push, no hard reset, no rm -rf, no reading .env. Now, if this routine goes haywire at 2am, what is the worst it can do? Leave an uncommitted mess or a local commit you review in the morning. That is a Tuesday, not a disaster. Least privilege turned catastrophe into inconvenience.'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "🔨 Step 5 — CP2",
        "title": "Run the task headless and confirm it completes unattended.",
        "body": "With permissions scoped and the commit-guard in place, run the task with no human at the keyboard. Use claude -p in acceptEdits mode with JSON output and a turn cap. The commit-guard still fires inside this run, so the headless agent physically cannot commit a red build. Read the JSON result to confirm success: is_error false, a result summary, and a cost. This is CP2: a real task completed unattended, with the exact same safety gates you built for interactive work still enforcing themselves.",
        "bullets": [
          "-p runs to completion with no approvals",
          "--max-turns caps runaway loops (a stall-detection safeguard)",
          "The PreToolUse commit-guard fires here too — verification is not skipped",
          "Parse is_error / result from the JSON to decide the next action"
        ],
        "code": {
          "label": "The headless routine run",
          "code": "claude -p \"Find any function in src/ over 100 lines, split it, keep tests green, and commit.\" \\\n  --permission-mode acceptEdits \\\n  --allowedTools \"Read\" \"Edit\" \"Bash(npm test:*)\" \"Bash(npm run format:*)\" \"Bash(git add:*)\" \"Bash(git commit:*)\" \\\n  --output-format json \\\n  --max-turns 25 \\\n  | jq '{ok: (.is_error|not), turns: .num_turns, cost: .total_cost_usd, result}'"
        },
        "script": "Run it live and read the piped jq summary aloud. 'Nobody touched the keyboard. It refactored, it tested, and because the guard held, it only committed on green. This exact command, dropped into a cron line or a CI step, is a routine — the same thing Anthropic calls headless automation.'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "🔨 Step 6 — CP2",
        "title": "Wrap the run in the SDK so a program can schedule it.",
        "body": "A shell one-liner is a fine routine, but the SDK gives you a routine your own program controls. Call query() from TypeScript, pass the same permission mode and scoped tools as options, and stream the messages. Your code can now inspect each result, log it, retry on failure with a cap, or fan out across many repos. This is how a routine becomes a real unattended worker: a scheduled script, a queue consumer, or a CI job that embeds the agent and reacts to its structured output.",
        "bullets": [
          "query() takes the same options: permissionMode, allowedTools, maxTurns",
          "Stream messages; act on the type: 'result' payload",
          "Your program owns retries, logging, and idempotency around the run",
          "Schedule it: cron, a queue worker, or a CI job"
        ],
        "code": {
          "label": "routine.ts — the SDK version of the headless run",
          "code": "import { query } from \"@anthropic-ai/claude-agent-sdk\";\n\nconst run = query({\n  prompt: \"Split any function in src/ over 100 lines, keep tests green, commit.\",\n  options: {\n    permissionMode: \"acceptEdits\",\n    allowedTools: [\"Read\", \"Edit\", \"Bash(npm test:*)\", \"Bash(git commit:*)\"],\n    maxTurns: 25,\n  },\n});\n\nfor await (const msg of run) {\n  if (msg.type === \"result\") {\n    if (msg.is_error) process.exit(1);     // let the scheduler retry\n    console.log(\"done:\", msg.result);\n  }\n}"
        },
        "script": "'Same task, now inside code you control. See process.exit(1) on error? That hands the failure to your scheduler, which retries with a cap — no infinite loops. This is the moment Claude Code stops being a tool you use and becomes a component you compose. That is the architect's job: composition, not typing.'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "🔨 Step 7 — CP3",
        "title": "Add GitHub Actions automated review on every pull request.",
        "body": "Now put the reviewer in your pipeline. Add .github/workflows/claude-review.yml. It triggers on pull request open and update, checks out the full history, and runs the claude-code-action with a review prompt. The permissions block grants pull-requests write so it can comment, and read-only for contents. Scope claude_args to read tools so the CI reviewer cannot modify code, it recommends only. Your API key lives in repository secrets, never in the YAML. From now on every PR gets an automated review before a human opens it.",
        "bullets": [
          "Trigger on pull_request opened and synchronize",
          "fetch-depth: 0 so the action sees the full diff",
          "permissions: pull-requests write to comment, contents read only",
          "claude_args scoped to read tools — review recommends, never merges",
          "ANTHROPIC_API_KEY from secrets, redacted, never inline"
        ],
        "code": {
          "label": ".github/workflows/claude-review.yml",
          "code": "name: Claude PR Review\non:\n  pull_request:\n    types: [opened, synchronize]\npermissions:\n  contents: read\n  pull-requests: write\njobs:\n  review:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          fetch-depth: 0\n      - uses: anthropics/claude-code-action@v1\n        with:\n          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}\n          prompt: |\n            Review this PR for correctness, security, and CLAUDE.md compliance.\n            Leave inline comments on specific lines. Flag any committed secret as CRITICAL.\n            Recommend only — do NOT approve or merge.\n          claude_args: \"--allowedTools Read,Grep,Glob,Bash(git diff:*)\""
        },
        "script": "Have them commit the workflow, open a throwaway PR, and watch the review appear as comments. 'That review ran with zero humans involved. Two things make it safe: the key is a secret, not text in the file, and the reviewer has read-only tools, so it comments but cannot touch your code. Reach plus guardrails.'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "🔨 Step 8 — CP3",
        "title": "Make CI review advisory, not authoritative: keep the verification gate.",
        "body": "A reviewer that can approve its own work is not a gate, it is a rubber stamp. Keep the automated review recommend-only and put the real gate on deterministic verification: a separate CI job that runs your tests and typecheck, wired into branch protection as a required check. The review comments help humans; the test job decides whether the PR can merge at all. This mirrors the whole week: the probabilistic reviewer advises, the deterministic verification decides. Merge is blocked until the required checks are green.",
        "bullets": [
          "AI review = advisory comments; humans still approve",
          "A required test/typecheck job = the deterministic merge gate",
          "Branch protection makes that job a mandatory status check",
          "Same principle as the commit-guard, now at the pipeline level"
        ],
        "code": {
          "label": ".github/workflows/verify.yml — the required merge gate",
          "code": "name: Verify\non:\n  pull_request:\n    types: [opened, synchronize]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with: { node-version: 20 }\n      - run: npm ci\n      - run: npm run typecheck   # tsc --noEmit\n      - run: npm test\n# Then in repo Settings > Branches: require the \"test\" check to pass before merge."
        },
        "script": "'Here is the keystone of the whole week. The AI review talks; this job votes. Turn on branch protection and require the test check. Now no PR merges on a red build — not yours, not a routine's, not the AI reviewer's. That is what lets you trust the automation while you sleep. Verification is not a nice-to-have, it is the permission slip for unsupervised work.'"
      },
      {
        "segment": "failure",
        "eyebrow": "💥 Break it on purpose",
        "title": "Failure injection: broad permissions, no verification, push to main.",
        "body": "Now we recreate Monday's 2am disaster deliberately so you feel exactly why the guardrails matter. Take the routine and strip its safety: run with dangerously-skip-permissions so nothing is scoped, remove the commit-guard so tests never gate the commit, and let it push straight to main. Feed it a task that produces a subtly broken change. Watch it edit, commit, and push an unverified regression with total confidence. This is the known-broken state, and per this repo's rules, a feature in a known-broken state is not shipped.",
        "bullets": [
          "--dangerously-skip-permissions — no allow/deny scope at all",
          "Commit-guard bypassed — verification never runs",
          "Direct push to main — no human, no CI gate in the way",
          "Outcome: a red change lands in production, silently"
        ],
        "code": {
          "label": "The anti-pattern — never run this for real",
          "code": "# UNSAFE: broad permissions + no verification + direct push\nclaude -p \"$TASK\" --dangerously-skip-permissions --max-turns 50\ngit push origin main    # ships whatever it produced, verified or not"
        },
        "script": "Run it in a throwaway branch so everyone sees it actually push a broken change. 'There it is — the exact failure from Monday, reproduced in ten seconds. No one made a mistake in the prompt. The mistake is in the configuration: no scope, no gate, no human. This is BREAK. Now we HARDEN.'"
      },
      {
        "segment": "failure",
        "eyebrow": "🛡️ Harden it",
        "title": "Recovery: scope permissions and add the verification gate.",
        "body": "Fix each break with the matching guardrail. Replace dangerously-skip-permissions with acceptEdits plus the scoped allow and deny lists from Step 4. Restore the commit-guard so a red build cannot commit. Remove the direct push and route the change through a PR, where the required verify job from Step 8 blocks merge on red. Run the same broken task again: now the commit is refused, nothing is pushed, and the automation fails safely and loudly instead of shipping silently. Each fix lands with the test that reproduces the original break, exactly the Build-Break-Harden loop.",
        "bullets": [
          "Scope: acceptEdits + allow/deny replaces skip-permissions",
          "Gate: commit-guard restored, red build cannot commit",
          "No direct push: change goes through a PR + required verify check",
          "Re-run the break: it now fails safe, loud, and recoverable"
        ],
        "code": {
          "label": "The hardened routine — same task, now safe",
          "code": "claude -p \"$TASK\" \\\n  --permission-mode acceptEdits \\\n  --allowedTools \"Read\" \"Edit\" \"Bash(npm test:*)\" \"Bash(git add:*)\" \"Bash(git commit:*)\" \\\n  --max-turns 25 --output-format json\n# git push is DENIED in settings.json -> open a PR; the required 'test' check gates merge."
        },
        "script": "Re-run the broken task with the hardened config. 'Same task, same bug, completely different outcome: the guard blocks the commit, the deny list blocks the push, nothing bad reaches main. You did not make the model smarter, you made the boundaries deterministic. That is the entire discipline of this week.'"
      },
      {
        "segment": "failure",
        "eyebrow": "🏁 Close the loop",
        "title": "Verify before you automate. That is the whole rule.",
        "body": "Land the principle that ties Week 8 together: automation multiplies whatever you feed it, correctness or defects, so it is only trustworthy when a verification step proves the result before it stands. Trivia recap: automation with no verification step is a production defect waiting to happen. Your deliverable is a workflow that survived BREAK and HARDEN: two or more custom commands, a hook, a headless run, and CI review, with least-privilege permissions and a required verification gate. Ship the demo and one real CI review comment as proof.",
        "bullets": [
          "Least-privilege permissions bound what a run may touch",
          "A verification gate proves the result before it is allowed to stand",
          "Recommend-only AI review + a required test check = trustworthy CI",
          "Deliverable: .claude/ commands + hooks and a working review workflow",
          "Proof: a demo of the self-running workflow + a CI review comment"
        ],
        "script": "Close on the sentence you want them to remember for the certification and the job: 'Verify before you automate.' Then set the assignment: 'Submit your .claude/ commands and hooks plus the GitHub Actions review workflow, and prove it with a demo and one real CI comment. You now have something most working engineers do not: a development workflow that runs, and verifies, itself.'"
      }
    ]
  },
  "9": {
    "monday": [
      {
        "segment": "business-problem",
        "eyebrow": "🔥 The Production Gap",
        "title": "The demo worked. Production didn't.",
        "body": "Every system you have built this cohort passed its demo: happy path, dependencies up, one request at a time. Production is the opposite of a demo, the LLM API times out, the CRM returns a 500, the webhook fires twice, and two requests hit the same row at once. A successful demo is not evidence of reliability; it is evidence that the happy path exists. This week you design the failure path before the happy path, because in production the failure path IS the path.",
        "bullets": [
          "Demo = happy path, deps up, one request at a time",
          "Prod = timeouts, 5xx, duplicates, concurrency",
          "A green demo says nothing about failure behavior",
          "Reliability is engineered, never inherited"
        ],
        "script": "Ask the room: how many of your Intensive projects have ever been run twice in a row against a failing dependency? Almost no hands. That silence is the week's thesis."
      },
      {
        "segment": "business-problem",
        "eyebrow": "💸 What Unreliability Costs",
        "title": "One network blip becomes a duplicate charge.",
        "body": "Picture the agent that charges a customer, then writes the receipt. The charge succeeds, the receipt write times out, your code throws, and a naive retry runs the whole operation again, a second charge. The same failure mode duplicates emails, double-books calendar slots, and files the same support ticket twice. Unreliability is not an abstract quality metric; it is duplicate money, lost jobs, and a pager at 2am. The cost is always paid by the side effect that fired twice or the job that vanished silently.",
        "bullets": [
          "Retry without idempotency to a duplicate charge",
          "Swallowed error to a job silently lost",
          "Failing dependency hammered to a cascading outage",
          "Unchecked AI output to a wrong answer shipped as truth"
        ],
        "script": "Walk the duplicate-charge trace on the board step by step. Land the line: a script that works once but breaks on the second run is broken, not fragile."
      },
      {
        "segment": "business-problem",
        "eyebrow": "🧭 Failure-First Design",
        "title": "Design the failure path before the happy path.",
        "body": "Failure-first design flips the default order of engineering. Before you write the call, you answer four questions in writing: what happens if this fails, will it retry and with what strategy, what is the recovery path when retries are exhausted, and which failure modes does this code explicitly not handle. Every external boundary, LLM, database, webhook, third-party API, gets those four answers. The reliability layer you build this week is just the disciplined implementation of those answers.",
        "bullets": [
          "1. What happens if this fails?",
          "2. Will it retry? With what strategy (backoff, cap)?",
          "3. Recovery when retries are exhausted? (fallback, DLQ, escalate)",
          "4. Which failure modes are explicitly NOT handled?"
        ],
        "script": "Put the four questions on screen and keep them there all of Monday. Every architecture slide answers one of them. Tell them: by Thursday, code that cannot answer these does not ship."
      },
      {
        "segment": "architecture",
        "eyebrow": "🏗️ The Reliability + Quality Layer",
        "title": "Seven primitives wrap every external boundary.",
        "body": "The reliability layer is not one big thing; it is seven small, composable primitives, each answering a specific failure. Timeout bounds how long you wait. Retry-with-backoff handles transient failures. The circuit breaker stops you from hammering a dead dependency. Fallback gives a degraded-but-correct answer. The dead-letter queue parks what you cannot process so it is never lost. Idempotency makes replay safe. The quality gate makes AI output measured, not assumed. You will implement all seven this week, nested in a deliberate order.",
        "bullets": [
          "Timeout, bound the wait",
          "Retry + backoff, survive transient blips",
          "Circuit breaker, stop hammering a dead upstream",
          "Fallback + dead-letter, degrade, never lose",
          "Idempotency, safe to re-run",
          "Quality gate, block bad AI output"
        ],
        "script": "Draw the boundary as a wall between your system and the upstream. Every primitive is a checkpoint on that wall. Emphasize: these compose, they are not alternatives to each other."
      },
      {
        "segment": "architecture",
        "eyebrow": "🗺️ Enumerate The Failure Modes",
        "title": "Every boundary has a failure table, write it first.",
        "body": "You cannot harden what you have not enumerated. For each external boundary, list the concrete ways it fails and the response for each. An LLM call can time out, return 429, return 500, hang, or return success with the wrong shape. A database write can hit a unique-constraint violation on retry or drop the connection mid-transaction. A webhook can arrive twice, out of order, or malformed. The enumeration is the design; the code is just the enumeration made executable.",
        "bullets": [
          "LLM: timeout / 429 / 5xx / hang / wrong-shape success",
          "DB: constraint violation / connection drop mid-tx / deadlock",
          "Webhook: duplicate / out-of-order / malformed payload",
          "Third-party API: 5xx / rate limit / silent schema change"
        ],
        "code": {
          "label": "Failure-mode table (write one per boundary before coding)",
          "code": "// boundary: OpenAI chat.completions\n// | failure mode         | detect                | response                     | retryable |\n// |-----------------------|-----------------------|------------------------------|-----------|\n// | timeout (>8s)         | AbortController fires  | TimeoutError -> retry        | yes       |\n// | 429 rate limit        | status === 429         | backoff, honor Retry-After   | yes       |\n// | 5xx upstream          | status >= 500          | retry up to cap              | yes       |\n// | 400 bad request       | status === 400         | fail fast, do NOT retry      | no        |\n// | success, wrong shape  | zod parse fails        | ContractViolation -> gate    | no        |"
        },
        "script": "Have each student open their Intensive project and write this table for their single most important external call, right now, five minutes. No code until the table exists."
      },
      {
        "segment": "architecture",
        "eyebrow": "⏱️ Timeouts + Capped Retries",
        "title": "An unbounded wait and an unbounded retry are both outages.",
        "body": "Two defaults will take your system down: a call with no timeout that hangs forever, and a retry loop with no cap that hammers a struggling upstream until it dies, a retry storm. Every outbound call gets an explicit timeout, typically 5 to 30 seconds. Every retry is capped (three to five attempts) with exponential backoff so each failure waits longer, and full jitter so a thousand clients do not retry in lockstep and create a thundering herd. Only transient errors retry; a 400 is a bug in your request and retrying it just wastes the upstream.",
        "bullets": [
          "No timeout = infinite hang; always bound it (5-30s)",
          "No cap = retry storm; 3-5 attempts maximum",
          "Exponential backoff: each wait roughly doubles, capped",
          "Full jitter: spread retries, avoid the thundering herd",
          "Retry only transient (timeout/429/5xx), never 4xx"
        ],
        "script": "Draw two curves: retry-in-lockstep (sharp spikes) vs jittered (smooth). The spike is what kills a database that was just starting to recover. Jitter is not politeness, it is load protection."
      },
      {
        "segment": "architecture",
        "eyebrow": "🔌 The Circuit Breaker",
        "title": "When the upstream is dead, stop calling it.",
        "body": "Retries help with a blip, but if a dependency is genuinely down, retrying every request just piles load onto a service that cannot answer and makes recovery slower. The circuit breaker is a three-state machine. Closed: calls flow normally. After N consecutive failures it trips to Open: every call fails fast with a clear error and never touches the upstream. After a cooldown it goes Half-open: one trial call is allowed, success closes the circuit, failure re-opens it. The breaker converts a slow cascading failure into a fast, clear, contained one.",
        "bullets": [
          "Closed, calls flow, count consecutive failures",
          "Open, fail fast, do not touch the upstream (cooldown)",
          "Half-open, one trial call decides the next state",
          "Turns a cascading failure into a fast, contained one"
        ],
        "script": "Trace the state machine on the board with a marker moving between three boxes. Ask: what is the worst thing you can do to a database at 100% CPU? Answer: send it more traffic. The breaker is how you stop yourself."
      },
      {
        "segment": "architecture",
        "eyebrow": "♻️ Idempotency",
        "title": "Same input, same end state, no duplicate side effects.",
        "body": "Idempotency is the property that running an operation twice with the same input produces the same end state as running it once, no second charge, no duplicate row, no double email. It is what makes retries and duplicate webhooks safe. You achieve it with an idempotency key derived from the business event (for a charge: a hash of customer plus order id), stored and checked before the side effect fires. A replay finds the key already recorded and returns the stored result instead of re-running. At the database, a unique constraint plus INSERT ON CONFLICT DO NOTHING is the last line of defense.",
        "bullets": [
          "Key = hash(business event), NOT a fresh UUID per attempt",
          "Check the key BEFORE the side effect fires",
          "Replay returns the stored result, does not re-run",
          "DB unique constraint + ON CONFLICT DO NOTHING as backstop",
          "Retry-safe by default, or the operation is broken"
        ],
        "script": "Run the blueprint poll: a webhook can fire twice, how do you stay correct? Let them answer, then reveal: idempotency key plus unique constraint. If a retry can duplicate a side effect, the operation is broken, not fragile, broken."
      },
      {
        "segment": "deconstruct",
        "eyebrow": "🔬 Deconstruct: The Duplicate Charge",
        "title": "Trace one blip into two charges, line by line.",
        "body": "Here is the real anatomy. The agent calls the payment API, success. It then writes the receipt row, the connection drops, the write throws. The outer try/catch retries the whole handler. The payment API is called a second time, a second charge, because nothing recorded that step one already succeeded. The bug is not the network; the network will always blip. The bug is that the operation was not idempotent and the retry boundary wrapped a side effect that had already fired. Move the idempotency check above the charge and the replay becomes a no-op.",
        "bullets": [
          "charge() succeeds, then receipt write throws",
          "retry re-runs the whole handler, charge() fires again",
          "Root cause: no idempotency key recorded step 1",
          "Fix: claim the key before charge; replay returns stored result"
        ],
        "code": {
          "label": "The bug vs the fix",
          "code": "// BUG: retry wraps a side effect with no idempotency record\nasync function handle(order) {\n  await paymentApi.charge(order);   // fires AGAIN on every retry\n  await db.insertReceipt(order);    // this throw triggers the retry\n}\n\n// FIX: claim an idempotency key first; the charge fires exactly once\nasync function handle(order) {\n  const key = hash(order.customerId + ':' + order.id);\n  await runOnce(key, async () => {\n    await paymentApi.charge(order);\n    await db.insertReceipt(order);\n  });\n}"
        },
        "script": "Walk the BUG version and ask the room to spot the double charge before you reveal the FIX. This is the exact bug you will reproduce live on Thursday, then kill."
      },
      {
        "segment": "deconstruct",
        "eyebrow": "🚦 Deconstruct: The Bad AI Output",
        "title": "Reliability keeps the pipe alive. Quality decides what's allowed through.",
        "body": "A perfectly reliable pipeline can still ship a confidently wrong answer. The quality gate treats AI output like untrusted input: it scores the output against a rubric and blocks anything below threshold, returning a clear rejection instead of a bad answer. The rubric mixes cheap deterministic checks (is it valid JSON, does it match the schema, does it cite a source, is it within length) with an LLM-judge for grounding and relevance. Below threshold the output never reaches the user, it is rejected, logged, and optionally regenerated. Measured, not assumed.",
        "bullets": [
          "A reliable pipe can still ship a confidently wrong answer",
          "Gate = score the output, block below threshold",
          "Cheap deterministic checks first (schema, cites, length)",
          "LLM-judge for grounding and relevance",
          "Below threshold, reject + log, never ship"
        ],
        "code": {
          "label": "Eval rubric = deterministic checks + judge",
          "code": "async function scoreOutput(output: string, ctx: GateCtx): Promise<EvalResult> {\n  const reasons: string[] = [];\n  let score = 1.0;\n  // cheap deterministic gates first, no LLM cost\n  const parsed = safeJsonParse(output);\n  if (!parsed) return { score: 0, reasons: ['not valid JSON'] };\n  if (!schema.safeParse(parsed).success) { score -= 0.5; reasons.push('schema mismatch'); }\n  if (!parsed.citations?.length) { score -= 0.25; reasons.push('no source cited'); }\n  // expensive judge only if it survived the cheap gates\n  if (score >= 0.5) {\n    const grounding = await llmJudge(parsed, ctx.sources); // 0..1 grounded-in-sources\n    score = Math.min(score, grounding);\n    if (grounding < 0.75) reasons.push('weak grounding ' + grounding.toFixed(2));\n  }\n  return { score, reasons };\n}"
        },
        "script": "Frame it: you already validate a form field before you trust it. AI output is a form field the model filled in, validate it the same way. Cheap checks before the expensive judge is both correctness and cost discipline."
      },
      {
        "segment": "deconstruct",
        "eyebrow": "🚫 Deconstruct: Three Fatal Anti-Patterns",
        "title": "The empty catch, the unbounded retry, the non-idempotent write.",
        "body": "Three patterns appear in almost every un-hardened codebase, and all three are production defects, not style nits. The empty catch swallows an error silently, the operation failed, no one knows, root cause is gone. The unbounded retry loops forever against a failing upstream and becomes the outage. The non-idempotent write duplicates its side effect on any replay. On Thursday every one of these gets replaced with its hardened form: classify-and-log, capped-backoff, and an idempotency key. If you can make a contract change silently without a test failing, the contract is too weak.",
        "bullets": [
          "Empty catch {} to silent failure; classify + log instead",
          "Unbounded retry to the outage; cap attempts + backoff",
          "Non-idempotent write to duplicate on replay; add a key",
          "All three are defects, not nits, they block Definition of Done"
        ],
        "code": {
          "label": "The three defects, named",
          "code": "try { await risky(); } catch (e) {}                       // 1. silent swallow, root cause vanishes\nwhile (true) { try { return await call(); } catch {} }   // 2. unbounded retry, becomes the outage\nawait db.insert({ ...row });                              // 3. no key + no constraint, duplicates on replay"
        },
        "script": "Read each line and ask what breaks before moving on. Tell them: these are the three things I will grep your Thursday PR for. Any of them present means not done."
      },
      {
        "segment": "micro-build",
        "eyebrow": "🛠️ Micro-build 1: withTimeout",
        "title": "Give every outbound call a deadline.",
        "body": "Your first hardening primitive. withTimeout races the real call against a timer; if the timer wins it aborts the call and rejects with a typed TimeoutError so the error is classifiable downstream. The AbortSignal is passed into fetch so the underlying socket is actually torn down, not just abandoned. Wrap the single most important external call in your Intensive project with this now. This is the innermost layer, it bounds one attempt.",
        "code": {
          "label": "timeout.ts, copy into your reliability module",
          "code": "export class TimeoutError extends Error {\n  readonly error_class = 'TimeoutError';\n  constructor(ms: number) { super('operation exceeded ' + ms + 'ms'); this.name = 'TimeoutError'; }\n}\n\nexport async function withTimeout<T>(\n  fn: (signal: AbortSignal) => Promise<T>,\n  ms: number,\n): Promise<T> {\n  const ctrl = new AbortController();\n  let timer: NodeJS.Timeout;\n  const timeout = new Promise<never>((_, reject) => {\n    timer = setTimeout(() => { ctrl.abort(); reject(new TimeoutError(ms)); }, ms);\n  });\n  try {\n    return await Promise.race([fn(ctrl.signal), timeout]);\n  } finally {\n    clearTimeout(timer!);\n  }\n}\n\n// usage\nconst res = await withTimeout((signal) => fetch(url, { signal }), 8000);"
        },
        "script": "Everyone wrap one call, run it, then temporarily set ms to 1 and watch the TimeoutError fire. Feeling the timeout trip on purpose is the point."
      },
      {
        "segment": "micro-build",
        "eyebrow": "🛠️ Micro-build 2: capped backoff retry",
        "title": "Retry the transient, cap the attempts, jitter the wait.",
        "body": "Add the retry primitive around the timeout. It attempts up to a cap, waits an exponentially growing but capped delay with full jitter between attempts, and, critically, only retries errors classified as transient. A 400 throws immediately because retrying a malformed request is pointless. Notice it never loops forever: the cap is structural, not a hope.",
        "code": {
          "label": "retry.ts, capped exponential backoff + full jitter",
          "code": "const RETRYABLE = new Set(['TimeoutError', 'RateLimitError', 'UpstreamUnavailable']);\nconst sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));\n\nexport async function withRetry<T>(\n  fn: () => Promise<T>,\n  opts: { attempts?: number; baseMs?: number; capMs?: number } = {},\n): Promise<T> {\n  const { attempts = 4, baseMs = 250, capMs = 4000 } = opts;\n  let lastErr: unknown;\n  for (let attempt = 1; attempt <= attempts; attempt++) {\n    try {\n      return await fn();\n    } catch (err) {\n      lastErr = err;\n      const cls = classify(err);\n      if (!RETRYABLE.has(cls) || attempt === attempts) throw err; // 4xx or last attempt: stop\n      const backoff = Math.min(capMs, baseMs * 2 ** (attempt - 1));\n      const wait = backoff / 2 + Math.random() * (backoff / 2);   // full jitter\n      log.warn({ event: 'retry', attempt, error_class: cls, wait_ms: Math.round(wait) });\n      await sleep(wait);\n    }\n  }\n  throw lastErr;\n}"
        },
        "script": "Point at the two lines that make this safe: the attempt cap and the RETRYABLE check. Ask what happens if I retry a 400 four times, you annoy the upstream and still fail."
      },
      {
        "segment": "micro-build",
        "eyebrow": "🛠️ Micro-build 3: classify the error",
        "title": "Every caught error gets a stable class before you log it.",
        "body": "Retry, breaker, and logging all depend on one function: classify. It maps any thrown thing to a stable error_class string, TimeoutError, RateLimitError, UpstreamUnavailable, ClientError, ContractViolation, so decisions are made on a class, never on a fragile message match. Generic Error is not an acceptable class in a production path; if classify returns UnknownError, that is a signal you are missing a specific catch. This is the backbone of the observability you will wire later.",
        "code": {
          "label": "classify.ts, stable error classes for every decision",
          "code": "export function classify(err: unknown): string {\n  if (err instanceof TimeoutError) return 'TimeoutError';\n  if (err instanceof CircuitOpenError) return 'CircuitOpen';\n  const status = (err as any)?.response?.status ?? (err as any)?.status;\n  if (status === 429) return 'RateLimitError';\n  if (typeof status === 'number' && status >= 500) return 'UpstreamUnavailable';\n  if (typeof status === 'number' && status >= 400) return 'ClientError'; // do NOT retry\n  const code = (err as any)?.code;\n  if (code === 'ECONNRESET' || code === 'ETIMEDOUT') return 'UpstreamUnavailable';\n  return 'UnknownError'; // if you see this in logs, add a specific catch\n}"
        },
        "script": "Tell them: the retry set keys on these strings, the breaker keys on these strings, your dashboards key on these strings. One function, everything downstream depends on it. UnknownError in prod logs is a to-do, not an outcome."
      },
      {
        "segment": "micro-build",
        "eyebrow": "🛠️ Micro-build 4: the idempotency key",
        "title": "Derive the key from the business event, not the attempt.",
        "body": "The single most common idempotency mistake is generating a fresh UUID per attempt, then every retry has a new key and nothing dedupes. The key must be derived deterministically from the business event so that a retry of the same charge computes the same key. Sketch the key for your project's main side effect now, and add the unique constraint that backstops it at the database. Thursday you will wrap the side effect in runOnce; today you just decide the key.",
        "code": {
          "label": "idempotencyKey.ts + the constraint that backstops it",
          "code": "import { createHash } from 'crypto';\n\n// deterministic: same business event -> same key, every attempt\nexport function idempotencyKey(evt: { type: string; entityId: string; actor: string }): string {\n  return createHash('sha256')\n    .update([evt.type, evt.entityId, evt.actor].join(':'))\n    .digest('hex');\n}\n\n// last line of defense at the DB (Postgres migration)\n// CREATE TABLE idempotency_keys (\n//   key         TEXT PRIMARY KEY,\n//   status      TEXT NOT NULL DEFAULT 'in_progress',\n//   result      JSONB,\n//   created_at  TIMESTAMPTZ NOT NULL DEFAULT now()\n// );\n// -- the side-effect table also carries its own guard:\n// ALTER TABLE receipts ADD CONSTRAINT uq_receipt UNIQUE (customer_id, order_id);"
        },
        "script": "Have each student write the key expression for their one most dangerous side effect out loud to a neighbor. If two different attempts could produce two different keys, it is wrong. That is the whole discipline in one sentence."
      }
    ],
    "thursday": [
      {
        "segment": "build-map",
        "eyebrow": "🗺️ Build Map",
        "title": "Four checkpoints: baseline, resilient, idempotent, gated.",
        "body": "Today you wrap your Intensive 1-3 system in the reliability + quality layer. CP0 is your system running on the happy path plus the failure-mode table you wrote Monday. CP1 adds timeouts, capped retries, a circuit breaker, and a fallback to your most important external call. CP2 makes the side effect idempotent and proves it by running the same operation twice to one end state. CP3 adds a quality gate that blocks a deliberately bad output. Each checkpoint is demoable on its own.",
        "bullets": [
          "CP0 Baseline, happy path runs + failure table exists",
          "CP1 Resilient, timeout + retry + breaker + fallback",
          "CP2 Idempotent, same op twice, one end state",
          "CP3 Gated, an eval threshold blocks a bad output"
        ],
        "script": "Set the rhythm: we build a primitive, then we break it, then we watch it hold. Nobody moves to the next checkpoint until the current one survives being broken on purpose."
      },
      {
        "segment": "build-map",
        "eyebrow": "🧅 The Stack Order",
        "title": "Order matters: breaker(retry(timeout(call))).",
        "body": "The primitives nest, and the nesting order is a design decision. Timeout is innermost, it bounds a single attempt. Retry wraps the timeout so each attempt gets its own fresh deadline. The circuit breaker is outermost so it counts total failures and can fail fast before any attempt when the upstream is known-dead. Idempotency sits above the whole call because it governs the side effect, not the transport. The quality gate sits at the very end, on the output. Get the order wrong and, for example, a breaker inside the retry never trips because retry keeps resetting it.",
        "bullets": [
          "timeout, innermost, bounds one attempt",
          "retry, wraps timeout, fresh deadline per attempt",
          "breaker, outermost, fails fast on a known-dead upstream",
          "idempotency, above the call, governs the side effect",
          "quality gate, last, on the output"
        ],
        "code": {
          "label": "How the layers assemble",
          "code": "// the nesting, outside in\nawait runOnce(idempotencyKey(evt), () =>        // idempotency: guards the side effect\n  breaker.call(() =>                             // breaker: fail fast if upstream is dead\n    withRetry(() =>                               // retry: capped backoff over attempts\n      withTimeout((signal) =>                     // timeout: bound one attempt\n        callUpstream(payload, signal), 8000),\n      { attempts: 4 })));\nconst safe = await qualityGate(result, ctx);      // gate: block bad output last"
        },
        "script": "Draw the onion on the board with a request arrow going in and a response arrow coming out. Ask why the breaker goes outside the retry. Let them reason to it: so it counts the whole failure, not each attempt."
      },
      {
        "segment": "guided-build",
        "eyebrow": "🧱 Step 1, CP0: Baseline + failure table",
        "title": "Name the call you are about to harden, and how it fails.",
        "body": "Start from your real system. Identify the single external call with the highest blast radius, the one that touches money, identity, or a side effect a user would notice twice. Write the naive version and its failure-mode table side by side. Everything today hardens this one call; you will repeat the pattern across the others after class. Do not skip the table, the table is the spec for the next seven steps.",
        "code": {
          "label": "baseline.ts, the call + its failure table",
          "code": "// TARGET: the highest-blast-radius call in your system\nexport async function callUpstream(payload: Payload, signal?: AbortSignal): Promise<Result> {\n  const res = await fetch(UPSTREAM_URL, {\n    method: 'POST',\n    headers: { 'content-type': 'application/json' },\n    body: JSON.stringify(payload),\n    signal,\n  });\n  if (!res.ok) { const e: any = new Error('upstream ' + res.status); e.status = res.status; throw e; }\n  return res.json() as Promise<Result>;\n}\n// failure modes to handle: timeout | 429 | 5xx | 400(no-retry) | wrong-shape(gate)\n// NOT handled here (documented): partial-write recovery is the caller's job via runOnce"
        },
        "script": "Everyone picks their one call and pastes it here. If someone's project has no external side effect, pair them with someone whose does, the drill needs a real boundary."
      },
      {
        "segment": "guided-build",
        "eyebrow": "⏱️ Step 2, Timeout",
        "title": "Bound the single attempt.",
        "body": "Drop in the withTimeout primitive from Monday and wrap callUpstream. The signal flows into fetch so an abort actually tears down the socket. Confirm it works by temporarily setting the timeout to 1ms and watching a TimeoutError, a typed, classifiable error, not a generic hang. This is the innermost layer of the stack.",
        "code": {
          "label": "add the timeout around the call",
          "code": "import { withTimeout, TimeoutError } from './timeout';\n\nexport function callWithTimeout(payload: Payload) {\n  return withTimeout((signal) => callUpstream(payload, signal), 8000);\n}\n// verify: temporarily pass 1 instead of 8000 -> expect TimeoutError"
        },
        "script": "Live-set the timeout to 1, run it, point at the TimeoutError in the console, set it back to 8000. Ten seconds, but they see the primitive actually fire."
      },
      {
        "segment": "guided-build",
        "eyebrow": "🔁 Step 3, Capped retry + backoff",
        "title": "Survive the transient blip without becoming the storm.",
        "body": "Wrap the timeout in withRetry. Because retry keys on classify, a 429 or 5xx retries with growing jittered backoff while a 400 fails immediately. The attempt cap guarantees termination. Test it by pointing the call at a mock that fails twice then succeeds, you should see two retry log lines then a success, and the total time should reflect the backoff waits.",
        "code": {
          "label": "add capped retry around the timeout",
          "code": "import { withRetry } from './retry';\n\nexport function callResilient(payload: Payload) {\n  return withRetry(\n    () => withTimeout((signal) => callUpstream(payload, signal), 8000),\n    { attempts: 4, baseMs: 250, capMs: 4000 },\n  );\n}\n// verify with a mock that fails twice then succeeds:\n//   expect 2 'retry' warn logs, then one success, ~0.75s+ elapsed from backoff"
        },
        "script": "Run against the fail-twice mock live. Count the retry log lines with the room. Then flip the mock to return 400 and show it does NOT retry, the class check earns its keep."
      },
      {
        "segment": "guided-build",
        "eyebrow": "🔌 Step 4, Circuit breaker",
        "title": "Stop hammering a dead upstream.",
        "body": "Add the breaker as the outermost transport layer. After five consecutive failures it opens and every further call fails fast with CircuitOpenError for the cooldown window, your system stays responsive instead of blocking on a dead dependency. After the cooldown, one half-open trial call decides whether to close. This is the difference between a contained failure and a cascading one.",
        "code": {
          "label": "circuitBreaker.ts, three-state machine",
          "code": "export class CircuitOpenError extends Error {\n  readonly error_class = 'CircuitOpen';\n  constructor() { super('circuit open'); this.name = 'CircuitOpenError'; }\n}\ntype State = 'closed' | 'open' | 'half_open';\n\nexport class CircuitBreaker {\n  private state: State = 'closed';\n  private failures = 0;\n  private openedAt = 0;\n  constructor(private threshold = 5, private cooldownMs = 30000) {}\n\n  async call<T>(fn: () => Promise<T>): Promise<T> {\n    if (this.state === 'open') {\n      if (Date.now() - this.openedAt < this.cooldownMs) throw new CircuitOpenError();\n      this.state = 'half_open';\n    }\n    try { const out = await fn(); this.onSuccess(); return out; }\n    catch (err) { this.onFailure(); throw err; }\n  }\n  private onSuccess() { this.failures = 0; this.state = 'closed'; }\n  private onFailure() {\n    this.failures++;\n    if (this.state === 'half_open' || this.failures >= this.threshold) {\n      this.state = 'open'; this.openedAt = Date.now();\n    }\n  }\n}\nexport const upstreamBreaker = new CircuitBreaker(5, 30000);"
        },
        "script": "Force the mock to fail six times in a row. Watch calls 1 through 5 actually try, then call 6 return CircuitOpenError instantly. The instant failure is the feature, you are protecting both systems."
      },
      {
        "segment": "guided-build",
        "eyebrow": "🪂 Step 5, Fallback + dead-letter",
        "title": "Degrade if you can, park it if you can't, never lose it.",
        "body": "When the resilient call still fails, do not just throw into the void. If a degraded-but-correct path exists, a cached answer, a cheaper model, a queued follow-up, take it. If nothing works, write the job to a dead-letter store with full context and the correlation id so it can be triaged and replayed later, not silently dropped. Exhausted retries plus no dead-letter equals lost work.",
        "code": {
          "label": "fallback.ts, degrade then dead-letter",
          "code": "export async function callWithFallback<T>(\n  primary: () => Promise<T>,\n  fallback: (() => Promise<T>) | null,\n  ctx: { correlationId: string; payload: unknown },\n): Promise<T> {\n  try {\n    return await primary();\n  } catch (err) {\n    log.error({ event: 'primary_failed', error_class: classify(err), correlation_id: ctx.correlationId });\n    if (fallback) {\n      try { return await fallback(); }\n      catch (fbErr) { await deadLetter(ctx, fbErr); throw fbErr; }\n    }\n    await deadLetter(ctx, err);\n    throw err;\n  }\n}\n\nasync function deadLetter(ctx: { correlationId: string; payload: unknown }, err: unknown) {\n  await sql`INSERT INTO dead_letters (correlation_id, payload, error_class, failed_at)\n            VALUES (${ctx.correlationId}, ${JSON.stringify(ctx.payload)}, ${classify(err)}, now())\n            ON CONFLICT (correlation_id) DO NOTHING`;\n}"
        },
        "script": "Ask where a failed job goes in your current project. The honest answer is usually nowhere, it throws and vanishes. The dead-letter table is where nowhere becomes a row I can replay Monday morning."
      },
      {
        "segment": "guided-build",
        "eyebrow": "♻️ Step 6, CP2: Idempotency",
        "title": "Wrap the side effect so replay is a no-op.",
        "body": "Now guard the side effect itself. runOnce claims the idempotency key with an atomic INSERT ON CONFLICT DO NOTHING; if the claim succeeds the operation runs and the result is stored; if the key already exists, a completed run returns its stored result and an in-flight one rejects a concurrent duplicate. The key comes from the business event, so a retry computes the same key and the charge fires exactly once. This is the checkpoint you prove on camera.",
        "code": {
          "label": "idempotency.ts, claim-run-store",
          "code": "export class InFlightError extends Error { readonly error_class = 'InFlight'; }\n\nexport async function runOnce<T>(key: string, operation: () => Promise<T>): Promise<T> {\n  const claimed = await sql`\n    INSERT INTO idempotency_keys (key, status)\n    VALUES (${key}, 'in_progress')\n    ON CONFLICT (key) DO NOTHING\n    RETURNING key`;\n  if (claimed.length === 0) {\n    const prior = await sql`SELECT status, result FROM idempotency_keys WHERE key = ${key}`;\n    if (prior[0]?.status === 'succeeded') return prior[0].result as T; // replay -> stored result\n    throw new InFlightError('duplicate in flight: ' + key);\n  }\n  try {\n    const result = await operation();       // the side effect fires exactly once\n    await sql`UPDATE idempotency_keys SET status='succeeded', result=${JSON.stringify(result)} WHERE key=${key}`;\n    return result;\n  } catch (err) {\n    await sql`DELETE FROM idempotency_keys WHERE key=${key}`; // failed run: release so a real retry can proceed\n    throw err;\n  }\n}"
        },
        "script": "Walk the three branches: a fresh key runs, a succeeded key replays, an in-flight key rejects. Then note the catch: a failed run releases the key so a legitimate retry is not permanently blocked. That release is the subtle correct move most people miss."
      },
      {
        "segment": "guided-build",
        "eyebrow": "🚦 Step 7, CP3: Quality gate",
        "title": "Score the output; block it below threshold.",
        "body": "The last layer sits on the AI output. qualityGate scores the output against the rubric from Monday and throws a typed QualityGateError below threshold, so a bad answer is rejected with clear reasons instead of shipped. The rejection is logged with the score and correlation id, and the caller can regenerate or fall back. Quality is now a gate in the pipe, not a hope in a prompt.",
        "code": {
          "label": "qualityGate.ts, the eval threshold that blocks",
          "code": "export class QualityGateError extends Error {\n  readonly error_class = 'QualityGateFailed';\n  constructor(public score: number, public reasons: string[]) {\n    super('quality gate failed at ' + score.toFixed(2) + ': ' + reasons.join('; '));\n    this.name = 'QualityGateError';\n  }\n}\nconst THRESHOLD = 0.75;\n\nexport async function qualityGate(output: string, ctx: GateCtx): Promise<string> {\n  const { score, reasons } = await scoreOutput(output, ctx);\n  log.info({ event: 'quality_gate', outcome: score >= THRESHOLD ? 'pass' : 'block',\n             score, correlation_id: ctx.correlationId });\n  if (score < THRESHOLD) throw new QualityGateError(score, reasons);\n  return output;\n}"
        },
        "script": "Feed it a hand-crafted bad output, malformed JSON or a missing citation, and watch it block with reasons. Then feed a good one and watch it pass. The threshold is a dial; show them that moving it changes what ships."
      },
      {
        "segment": "guided-build",
        "eyebrow": "🧩 Step 8, Assemble + correlation id",
        "title": "One hardened operation, end to end, fully traced.",
        "body": "Compose all seven primitives into the single entry point, and generate a correlation id at the top so every log line and side effect for this operation shares one thread. This is the finished reliability + quality layer: idempotent, resilient, gated, and observable. If a failure happens tonight, you can reconstruct the whole story from one id, which is the observability bar this layer has to clear.",
        "code": {
          "label": "reliableOperation.ts, the whole layer composed",
          "code": "import { randomUUID } from 'crypto';\n\nexport async function reliableOperation(evt: BusinessEvent, payload: Payload): Promise<string> {\n  const correlationId = randomUUID();\n  const key = idempotencyKey(evt);\n  log.info({ event: 'op_start', correlation_id: correlationId, idem_key: key });\n\n  const result = await runOnce(key, () =>\n    callWithFallback(\n      () => upstreamBreaker.call(() =>\n        withRetry(\n          () => withTimeout((signal) => callUpstream(payload, signal), 8000),\n          { attempts: 4, baseMs: 250, capMs: 4000 },\n        )),\n      () => cachedFallback(payload),           // degraded-but-correct\n      { correlationId, payload },\n    ));\n\n  const safe = await qualityGate(render(result), { correlationId, sources: payload.sources });\n  log.info({ event: 'op_done', correlation_id: correlationId, outcome: 'success' });\n  return safe;\n}"
        },
        "script": "This is the deliverable. Read it top to bottom and name each layer as you pass it. Tell them: your assignment is this exact shape wrapped around your own call, with tests."
      },
      {
        "segment": "failure",
        "eyebrow": "💥 Break It On Purpose: the duplicate",
        "title": "Force a 500, fire the same op twice, watch it duplicate.",
        "body": "Time to reproduce Monday's bug live. Point the upstream at a mock that 500s after the side effect, disable runOnce, and fire the same event twice within a second. You will see two charges, two rows, two of whatever the side effect is. Capture that broken state, the duplicate is the evidence that the naive system is unsafe. This is the BREAK phase: you have not shipped anything until you have broken it.",
        "bullets": [
          "Mock upstream: succeed the charge, then 500 the receipt",
          "Disable runOnce, fire the same event twice in under 1s",
          "Observe: two charges / two rows, the duplicate",
          "Capture it, the break is the proof the fix is needed"
        ],
        "code": {
          "label": "chaos.test.ts, reproduce the duplicate side effect",
          "code": "it('BREAK: non-idempotent handler duplicates on retry', async () => {\n  const charge = jest.fn().mockResolvedValue({ ok: true });\n  const insert = jest.fn()\n    .mockRejectedValueOnce(Object.assign(new Error('conn drop'), { code: 'ECONNRESET' }))\n    .mockResolvedValue({ ok: true });\n  const naive = async () => { await charge(); await insert(); };\n  await expect(withRetry(naive, { attempts: 2, baseMs: 1 })).resolves.toBeDefined();\n  expect(charge).toHaveBeenCalledTimes(2); // <-- the bug: charged twice\n});"
        },
        "script": "Run it red-handed. The assertion that charge was called twice IS the duplicate charge. Let the room sit with that being a second real charge for a beat before you fix it."
      },
      {
        "segment": "failure",
        "eyebrow": "🛡️ Recover: one clean end state",
        "title": "Re-run the exact same failure, now it holds.",
        "body": "Now turn on runOnce and re-run the identical failure. The first attempt claims the key and fires the charge; the retry finds the key already claimed and returns the stored result instead of charging again. Same input, same end state, exactly one side effect. This is the HARDEN phase and the idempotency proof your assignment requires: the same operation run twice yields one end state, demonstrated by a passing test.",
        "bullets": [
          "Enable runOnce, re-run the identical chaos",
          "First attempt claims key + charges; retry replays stored result",
          "Assert: charge called exactly once",
          "Same input to same end state, the proof"
        ],
        "code": {
          "label": "idempotency.test.ts, the proof (run twice, one effect)",
          "code": "it('HARDEN: same operation run twice yields one side effect', async () => {\n  const charge = jest.fn().mockResolvedValue({ receiptId: 'r_1' });\n  const key = idempotencyKey({ type: 'charge', entityId: 'ord_9', actor: 'cust_7' });\n  const run = () => runOnce(key, () => charge());\n\n  const first = await run();\n  const second = await run();          // replay of the exact same business event\n\n  expect(charge).toHaveBeenCalledTimes(1);   // fired exactly once\n  expect(second).toEqual(first);             // replay returns the stored result\n});"
        },
        "script": "Run it green. charge called once, second equals first. Say it plainly: this passing test is the artifact you demo Thursday. If it is red, the operation is broken, not fragile, broken."
      },
      {
        "segment": "failure",
        "eyebrow": "✅ Definition of Done",
        "title": "What has to be true before this ships.",
        "body": "A feature that has been built but not broken is not shipped; broken but not hardened is a known-broken state. Before your reliability layer is done: every external boundary has a timeout, retries are capped with backoff and only fire on transient classes, a breaker guards the upstream, exhausted work lands in a dead-letter store, the side effect is idempotent with a proof test, and a quality gate blocks below threshold. No empty catches, no unbounded loops, no non-idempotent writes. If a contract can change silently without a test failing, the contract is too weak, strengthen it.",
        "bullets": [
          "Timeout on every outbound call",
          "Capped retry + backoff, transient-only",
          "Breaker + fallback + dead-letter for exhaustion",
          "Idempotent side effect with a passing proof test",
          "Quality gate blocks bad output with a clear reason",
          "Zero empty catches / unbounded retries / unkeyed writes"
        ],
        "script": "Turn the bullets into a live checklist against one volunteer's project on the projector. Anything unchecked is tonight's homework. Close on the week's line: you broke it on purpose, and it recovered, that is reliability engineering."
      }
    ]
  },
  "10": {
    "monday": [
      {
        "segment": "business-problem",
        "eyebrow": "🚨 Cold open",
        "title": "This AI tried to act. Nothing stopped it.",
        "body": "You spent three intensives making an agent capable: it can read data, call tools, generate content, and write to production. Capability without limits is the exact failure mode that makes leadership refuse to deploy. An agent that can issue a refund can issue a $9,000 refund to the wrong account, at 3am, with nobody watching. Week 10 is the week we install the thing that turns 'an agent that can act' into 'an agent that is safe to let act' — the Governance Engine.",
        "bullets": [
          "Capable is not the same as safe: capability is what you built, governance is what makes it deployable",
          "Governance is the trust layer that gates every action before its side effect fires",
          "This is Intensive 4, Layer 5 of the 7-Layer Architecture — the layer executives ask about first"
        ],
        "script": "Open cold. Read the title, pause. Ask the room: 'Your agent from last week can now send email and issue refunds. Who here would let it run against your company's production systems, unsupervised, tonight?' No hands. That reluctance IS the business problem. Governance is how you earn the yes."
      },
      {
        "segment": "business-problem",
        "eyebrow": "💸 The cost of ungoverned action",
        "title": "The most expensive line of code is the one that fired without permission",
        "body": "An ungoverned side effect is not a bug you can patch after the fact — the email is sent, the money moved, the row deleted, the customer already saw it. Unlike a display bug, an action has no undo. The blast radius of one wrong autonomous action can be a refund fraud loss, a regulatory disclosure, a deleted production table, or a message sent to a real human on your company's behalf. Governance exists because some mistakes cannot be rolled back, only prevented.",
        "bullets": [
          "A read error costs you a retry; an action error costs you a real-world consequence",
          "Side effects are irreversible by default — money, messages, and deletes have no undo",
          "The question is never 'can the agent do this?' — it is 'is the agent permitted to do this, here, now?'"
        ],
        "script": "Make it concrete and personal. 'Raise your hand if your system touches money, sends messages to customers, or writes to a database.' Most hands. 'Then you already have the failure mode. Governance is not optional theater — it is the difference between an agent and a liability.'"
      },
      {
        "segment": "business-problem",
        "eyebrow": "🔩 Governance-first vs governance-after",
        "title": "Bolt governance on afterward and it leaks actions on day one",
        "body": "The tempting shortcut is to ship the capable agent now and 'add governance later' — a wrapper, a log review, a nightly report. That design leaks, because the side effect has already fired by the time the after-the-fact check runs. Governance-first means the engine sits in front of the action: it evaluates, and only then does the side effect get to run. Governance-after is a smoke detector you read the next morning; governance-first is a lock on the door.",
        "bullets": [
          "Governance-after: action fires → you find out later → too late, the effect is real",
          "Governance-first: request → evaluate → decision gates the side effect → only allowed actions fire",
          "The single most common production incident here is 'we logged it but did not block it'"
        ],
        "script": "Draw two timelines on the board. Top: ACT then CHECK (governance-after) — circle the gap and label it 'leaked actions live here'. Bottom: CHECK then ACT (governance-first). Say: 'Every governance failure I have seen in production is the top timeline. Today we only build the bottom one.'"
      },
      {
        "segment": "architecture",
        "eyebrow": "🏛️ The engine",
        "title": "Four moving parts: policy, evaluator, human gate, audit",
        "body": "The Governance Engine is not one component — it is four, arranged in a strict order. A policy declares what is permitted (data, not code). An evaluator reads the request against the policy and returns a decision. A human-in-the-loop gate catches the high-risk decisions that a machine should not make alone. An immutable audit trail records every decision so any of them can be reconstructed later. The entire engine sits on the hot path, in front of every side-effecting action.",
        "bullets": [
          "Policy — declarative rules over 5 factors; changing behavior is a config change, not a redeploy",
          "Evaluator — pure function: (request, policy) → decision; fail-closed by construction",
          "HITL gate — pauses high-risk actions, escalates to a human, resumes on approval",
          "Audit trail — append-only, keyed on a correlation ID, secrets redacted",
          "Order is load-bearing: evaluate → (maybe escalate) → audit → act"
        ],
        "code": {
          "label": "The gate that ties all four together (governance/gate.ts)",
          "code": "// Every side effect in the system routes through this one function.\nexport async function governedExecute<T>(\n  req: ActionRequest,\n  sideEffect: () => Promise<T>,\n): Promise<{ ok: true; result: T } | { ok: false; decision: Decision }> {\n  const decision = evaluate(req);            // 1. POLICY + EVALUATOR\n  await audit.record(req, decision, 'decided'); // 3. AUDIT before anything fires\n\n  if (decision.effect === 'deny') {\n    return { ok: false, decision };          // blocked — side effect never runs\n  }\n  if (decision.effect === 'escalate') {\n    const queued = await hitl.enqueue(req, decision); // 2. HUMAN GATE\n    return { ok: false, decision: { ...decision, queueId: queued.id } };\n  }\n\n  const result = await sideEffect();         // allow — only now does the effect fire\n  await audit.record(req, decision, 'executed');\n  return { ok: true, result };\n}"
        },
        "script": "Walk the four parts left to right, then show the code. Trace one allowed request with your finger: evaluate, audit 'decided', run the side effect, audit 'executed'. Then trace a deny: it returns before the side effect line is ever reached. Emphasize: 'The side effect is physically unreachable unless the decision permits it.'"
      },
      {
        "segment": "architecture",
        "eyebrow": "🧬 5-factor ABAC",
        "title": "Who, on what, doing what, in what context, at what risk",
        "body": "ABAC — attribute-based access control — decides permission from attributes, not from a hardcoded per-user list. We evaluate five factors on every request. USER: roles and attributes of the caller. RESOURCE: the thing being acted on and who owns it. ACTION: the specific verb being requested. CONTEXT: environment, channel, time, amount. RISK: a computed tier that rises with the stakes. A rule matches only when all five factors line up, which is what lets one small policy govern a large system.",
        "bullets": [
          "USER — roles, attributes (is this a bot? an admin? acting on its own resource?)",
          "RESOURCE — type, owner, sensitivity (a refund is not a blog draft)",
          "ACTION — the verb (read vs delete vs issue) — most-restrictive verb wins",
          "CONTEXT — env, channel, time, amount (prod at 3am ≠ dev at noon)",
          "RISK — a derived tier (low → critical) that any factor can escalate"
        ],
        "code": {
          "label": "The request the evaluator sees (governance/types.ts)",
          "code": "export type RiskTier = 'low' | 'medium' | 'high' | 'critical';\n\nexport interface ActionRequest {\n  correlationId: string;                 // threads this decision through every log\n  principal: {                           // FACTOR 1 — USER\n    userId: string;\n    roles: string[];                     // e.g. ['support_bot']\n    attributes: Record<string, unknown>;\n  };\n  resource: {                            // FACTOR 2 — RESOURCE\n    type: string;                        // 'refund' | 'email' | 'db_row'\n    id?: string;\n    ownerId?: string;\n  };\n  action: string;                        // FACTOR 3 — ACTION ('refund.issue')\n  context: {                             // FACTOR 4 — CONTEXT\n    env: 'dev' | 'staging' | 'prod';\n    channel: string;\n    timestamp: string;                   // ISO-8601\n    amount?: number;\n  };\n  // FACTOR 5 — RISK is computed, never trusted from the caller.\n}"
        },
        "script": "Name the five factors on your fingers and make the class say them back. Key teaching point on the last one: 'Risk is COMPUTED by us, never sent by the caller — because an attacker or a confused agent would just claim low risk.' That single sentence separates real ABAC from a checkbox."
      },
      {
        "segment": "architecture",
        "eyebrow": "🙋 Human-in-the-loop",
        "title": "Eight categories a machine is not allowed to green-light alone",
        "body": "Some actions are too consequential for an automated allow, no matter how confident the model is. We define eight high-risk categories; any action that falls into one is forced to escalate to a human rather than execute. The design target is a low escalation rate — under 15% — because if everything escalates, the human becomes a rubber stamp and the value of automation evaporates. Escalate the genuinely dangerous few; auto-allow the safe many. That balance is the INPACT 'Permitted' dimension made real.",
        "bullets": [
          "financial_movement · data_deletion · external_communication · access_grant",
          "credential_access · production_write · identity_action · irreversible_side_effect",
          "Target < 15% escalation — escalate the dangerous few, auto-allow the safe many",
          "Escalation path: pause → notify approver → approve/deny → resume (never block the caller thread)"
        ],
        "code": {
          "label": "The eight categories + the risk classifier (governance/risk.ts)",
          "code": "export const HIGH_RISK_CATEGORIES = [\n  'financial_movement',       // payments, refunds, payouts\n  'data_deletion',            // hard deletes, drops\n  'external_communication',   // email/SMS/social to real people\n  'access_grant',             // granting roles or permissions\n  'credential_access',        // reading secrets or keys\n  'production_write',         // any write to prod state\n  'identity_action',          // acting as another user\n  'irreversible_side_effect', // no compensating action exists\n] as const;\n\nexport function classifyRisk(req: ActionRequest): { tier: RiskTier; categories: string[] } {\n  const cats: string[] = [];\n  const amount = req.context.amount ?? 0;\n  if (/refund|payment|payout/.test(req.action)) cats.push('financial_movement');\n  if (/\\.delete$|\\.drop$/.test(req.action))     cats.push('data_deletion');\n  if (/email|sms|post/.test(req.action))        cats.push('external_communication');\n  if (req.context.env === 'prod' && /\\.(write|update|create)$/.test(req.action)) cats.push('production_write');\n\n  let tier: RiskTier = cats.length ? 'high' : 'low';\n  if (amount >= 500 || cats.includes('data_deletion')) tier = 'critical';\n  return { tier, categories: cats };\n}"
        },
        "script": "Read all eight categories aloud slowly — the class should feel the pattern: money, deletion, real-world messages, access, secrets, prod, identity, irreversibility. Then the punchline: 'The engineering skill is not escalating everything. It is the under-15% number. A governance engine that escalates 80% of actions gets turned off by Friday.'"
      },
      {
        "segment": "architecture",
        "eyebrow": "🧾 The audit trail",
        "title": "One correlation ID reconstructs the whole decision",
        "body": "When someone asks 'why did the agent do that?' three weeks later, you cannot answer from memory or from scattered logs. You answer from an audit trail: an append-only record where every decision, tool call, and write carries the same correlation ID, generated once at the entry point and threaded through everything downstream. Give the trail one ID and it returns the entire timeline of a decision, in order. The trail is immutable — you never UPDATE or DELETE a row — and it redacts secrets so the record itself is not a leak.",
        "bullets": [
          "One correlation ID (UUID v4) minted at entry, propagated through every log line and side effect",
          "Append-only: an audit row is never updated or deleted — corrections are new rows",
          "Redact on write: passwords, tokens, keys, SSNs never land in the trail",
          "Reconstruct = query by correlationId, ordered by time → the full story of one decision"
        ],
        "code": {
          "label": "Redacted, append-only audit + reconstruction (governance/audit.ts)",
          "code": "const SECRET_KEYS = /(password|token|secret|api[-_]?key|authorization|ssn|card)/i;\n\nfunction redact(obj: Record<string, unknown>): Record<string, unknown> {\n  const out: Record<string, unknown> = {};\n  for (const [k, v] of Object.entries(obj)) {\n    out[k] = SECRET_KEYS.test(k) ? '<redacted>' : v;   // never log a secret\n  }\n  return out;\n}\n\nexport async function record(req: ActionRequest, d: Decision, phase: string, meta = {}) {\n  await db.audit.insert({                 // APPEND ONLY — never update/delete\n    id: crypto.randomUUID(),\n    correlationId: req.correlationId,     // the thread that ties it all together\n    ts: new Date().toISOString(),\n    actor: req.principal.userId,\n    action: req.action,\n    effect: d.effect,\n    reason: d.reason,\n    matchedRule: d.matchedRule,\n    riskTier: d.riskTier,\n    phase,                                // 'decided' | 'executed' | 'approved' | 'denied'\n    meta: redact(meta),\n  });\n}\n\n// Any decision, fully reconstructed, from ONE id:\nexport const reconstruct = (correlationId: string) =>\n  db.audit.find({ correlationId }, { orderBy: 'ts ASC' });"
        },
        "script": "Point at the correlationId line twice — 'this one field is the whole game.' Then the redact function: 'Governance that leaks secrets into its own audit log is a new vulnerability, not a control. Redact on write, not on read.' Note append-only: 'A mutable audit trail is not an audit trail — it is a suggestion.'"
      },
      {
        "segment": "architecture",
        "eyebrow": "🔒 Fail-closed + the frameworks",
        "title": "Ungoverned equals denied — and how we score it",
        "body": "The default that makes the whole engine trustworthy is fail-closed: if no rule explicitly permits an action, the action is denied. A missing rule, a policy that failed to load, an unrecognized action — all resolve to deny, never to allow. This is the opposite of most systems, which default-open and add blocklists. On the scoring side, this maps to two frameworks: INPACT rates the system on Permitted (the right things are allowed, the wrong things blocked) and Transparent (every decision is explainable from the trail), and the GOALS Governance pillar rates whether authority limits and audit exist at all.",
        "bullets": [
          "Fail-closed: no explicit allow → deny. Absence of permission is denial.",
          "Default-open + blocklist is the wrong shape — you cannot enumerate every bad action",
          "INPACT · Permitted — the right actions allowed, the wrong ones blocked and escalated",
          "INPACT · Transparent — every decision reconstructable from its audit trail",
          "GOALS · Governance pillar — authority limits and audit are present and enforced"
        ],
        "code": {
          "label": "The one line that makes it fail-closed (governance/policy.ts)",
          "code": "// Rules describe what IS permitted. Anything not described is denied.\nexport const DEFAULT_DECISION: Decision = {\n  effect: 'deny',\n  reason: 'No policy rule permits this action (fail-closed default).',\n  matchedRule: 'default-deny',\n  riskTier: 'low',\n};\n\n// In the evaluator: chosen ?? DEFAULT_DECISION\n// If the policy file fails to load, evaluate() still returns deny — never allow.\n// Absence of a decision is a decision: NO."
        },
        "script": "This is the philosophical center of the day. Say it slowly: 'Fail-open asks you to list everything bad. Fail-closed asks you to list everything good. You can enumerate what is safe. You can never enumerate what is dangerous.' Tie to frameworks: 'When we score your system on INPACT Permitted and GOALS Governance in Week 11, this default is worth the most points.'"
      },
      {
        "segment": "deconstruct",
        "eyebrow": "🔬 Trace a decision",
        "title": "Deconstruct: a $900 refund request, factor by factor",
        "body": "Let us run one real request through the evaluator by hand before we write any code. A support bot requests a $900 refund in prod. Watch all five factors resolve: USER is a bot (role support_bot), RESOURCE is a refund, ACTION is refund.issue, CONTEXT is prod with amount 900, and RISK computes to critical because amount ≥ 500. The policy has no allow rule that covers a critical-tier refund, but it has an escalate rule for refunds. Escalate wins over the fail-closed deny. The decision is: escalate to a human.",
        "bullets": [
          "USER: support_bot · RESOURCE: refund · ACTION: refund.issue",
          "CONTEXT: env=prod, amount=900 · RISK: critical (amount ≥ 500)",
          "Matched rule: escalate-high-value-refund → effect ESCALATE, not allow, not silent deny",
          "The side effect (the refund) does NOT fire — it is queued for a human"
        ],
        "code": {
          "label": "The exact request that produces an escalate",
          "code": "const req: ActionRequest = {\n  correlationId: '8f3c...-uuid',\n  principal: { userId: 'support-bot-7', roles: ['support_bot'], attributes: {} },\n  resource:  { type: 'refund', id: 'rf_912', ownerId: 'cust_44' },\n  action:    'refund.issue',\n  context:   { env: 'prod', channel: 'chat', timestamp: '2026-09-17T03:14:00Z', amount: 900 },\n};\n\nevaluate(req);\n// => {\n//   effect: 'escalate',\n//   reason: 'Refunds over $500 escalate to a human.',\n//   matchedRule: 'escalate-high-value-refund',\n//   riskTier: 'critical'\n// }"
        },
        "script": "Do this live, on the board, no code running. Ask the class to call out each factor's value as you point to it. When you hit RISK, ask 'who set this to critical?' — answer: WE did, because amount ≥ 500. Then: 'The bot never got to choose. That is the point of a computed risk factor.'"
      },
      {
        "segment": "deconstruct",
        "eyebrow": "🔄 The escalation lifecycle",
        "title": "Deconstruct: pause, notify, approve, resume — and why it must be idempotent",
        "body": "An escalated action does not block the calling thread and it does not vanish. It becomes a durable pending row: status 'pending', with the full request and decision captured. An approver is notified out-of-band. When they approve, status flips to 'approved' and only then can the original side effect resume. Every step here must be idempotent: a retried enqueue must not create two pending rows, and a double-clicked approval must not fire the refund twice. Idempotency is what makes governance safe to retry.",
        "bullets": [
          "pending → (human decides) → approved | denied → (if approved) → resumed",
          "Idempotent enqueue: one pending row per (correlationId, action) — retries dedupe",
          "Idempotent resolve: resolving an already-resolved row is a no-op, not a second effect",
          "Guard against double-resume: a resumed action cannot resume again"
        ],
        "code": {
          "label": "Idempotent enqueue + resolve (governance/hitl.ts)",
          "code": "export async function enqueue(req: ActionRequest, d: Decision): Promise<PendingDecision> {\n  // IDEMPOTENT: one pending row per (correlationId, action). Retries do not double-queue.\n  const existing = await db.pending.findOne({ correlationId: req.correlationId, action: req.action });\n  if (existing) return existing;\n\n  const row: PendingDecision = {\n    id: crypto.randomUUID(), correlationId: req.correlationId,\n    request: req, decision: d, status: 'pending', createdAt: new Date().toISOString(),\n  };\n  await db.pending.insert(row);\n  await notifyApprover(row);          // Slack/email — out of band, never blocks the caller\n  return row;\n}\n\nexport async function resolve(id: string, approverId: string, approved: boolean) {\n  const row = await db.pending.findById(id);\n  if (!row) throw new Error('NotFound');\n  if (row.status !== 'pending') return row;   // IDEMPOTENT: already resolved => no-op\n  row.status = approved ? 'approved' : 'denied';\n  row.resolvedBy = approverId; row.resolvedAt = new Date().toISOString();\n  await db.pending.update(row);\n  await audit.record(row.request, row.decision, approved ? 'approved' : 'denied', { approverId });\n  return row;\n}"
        },
        "script": "Ask the trap question: 'The approver double-clicks Approve. What happens?' Let them squirm, then point to the `if (row.status !== 'pending') return row` line. 'That line is the difference between a $900 refund and an $1,800 refund. Idempotency is not a nicety in governance — it is the control.'"
      },
      {
        "segment": "deconstruct",
        "eyebrow": "🕵️ Reconstruct the story",
        "title": "Deconstruct: from one ID to the full timeline",
        "body": "Now the payoff of the correlation ID. Weeks later, compliance asks what happened with refund rf_912. You do not grep five services — you run reconstruct('8f3c...') and get an ordered timeline: the decision was made (escalate, critical), a human approved it, then it executed via HITL resume. Every row shares the ID; every row is human-readable; no secrets appear. That is the INPACT 'Transparent' dimension in one query — a decision explained end to end from a single key.",
        "bullets": [
          "One query, one ID → the complete, ordered life of a decision",
          "Rows: decided (escalate) → approved (by whom, when) → executed (via hitl_resume)",
          "No cross-service log spelunking — the ID is the join key across the whole system",
          "This IS INPACT Transparent: any decision, fully explainable, after the fact"
        ],
        "code": {
          "label": "What reconstruct() returns",
          "code": "await reconstruct('8f3c...-uuid');\n// [\n//   { ts: '03:14:00', phase: 'decided',  effect: 'escalate', riskTier: 'critical',\n//     action: 'refund.issue', matchedRule: 'escalate-high-value-refund' },\n//   { ts: '09:02:11', phase: 'approved', effect: 'escalate',\n//     action: 'refund.issue', meta: { approverId: 'ali@colaberry.com' } },\n//   { ts: '09:02:12', phase: 'executed', effect: 'escalate',\n//     action: 'refund.issue', meta: { via: 'hitl_resume' } }\n// ]\n// Three rows, one id, full story. Notice: no card number, no token — redacted on write."
        },
        "script": "Read the three rows like a story: 'At 3am the machine said escalate. At 9am a human approved it. One second later it executed, and we know exactly how — via HITL resume.' Then: 'If you cannot produce this from one ID, your observability is incomplete. This is what an auditor, a regulator, or your own future self needs.'"
      },
      {
        "segment": "micro-build",
        "eyebrow": "🛠️ Micro-build (10 min)",
        "title": "Write one ABAC rule that denies — with a reason",
        "body": "Now you build the smallest real thing: a single ABAC rule that denies an action and returns a clear, human-readable reason, backed by a fail-closed default. We are not building the whole engine yet — that is Thursday. Today you prove you can express a permission decision as data plus a pure function, and that when no rule matches, the answer is deny. Open a scratch file; we will grow it together in three moves.",
        "bullets": [
          "Goal: input a request, output { effect, reason, rule } — and default to deny",
          "One rule: a bot may not hard-delete in production",
          "The reason string is not decoration — it is what the caller and the audit log see"
        ],
        "script": "Set the timer. 'Ten minutes, one rule, one deny with a reason. If yours denies AND explains why, you have understood the whole day in miniature.' Have everyone open an empty TS scratch file. Build it live with them, one slide at a time."
      },
      {
        "segment": "micro-build",
        "eyebrow": "1️⃣ Shape the request + rule",
        "title": "Move 1: model the request and the rule as data",
        "body": "First, type the request and express the rule as a small object with a predicate and an effect. Notice the rule is DATA — a `when` predicate over the factors, an effect, and a reason. This is the seed of the whole policy file: on Thursday `when` becomes a 5-factor match block, but the shape is identical. Keeping the rule declarative is what lets you change governance behavior without touching the evaluator.",
        "code": {
          "label": "Step 1 — types + one rule",
          "code": "type Ctx = { env: 'dev' | 'staging' | 'prod' };\ntype Req = { role: string; action: string; ctx: Ctx };\n\nconst denyBotProdDelete = {\n  id: 'deny-prod-delete-by-bot',\n  when: (r: Req) =>\n    r.role === 'support_bot' &&\n    r.action.endsWith('.delete') &&\n    r.ctx.env === 'prod',\n  effect: 'deny' as const,\n  reason: 'Bots may not hard-delete in production.',\n};"
        },
        "script": "Type it with them. Emphasize `when` is a plain predicate — 'no framework, no magic, just a function that returns true or false over the factors.' Ask: 'How many of the five factors does this rule touch?' (three: user/role, action, context/env). 'The other two would just be more conditions.'"
      },
      {
        "segment": "micro-build",
        "eyebrow": "2️⃣ The fail-closed evaluator",
        "title": "Move 2: decide — and default to deny when nothing matches",
        "body": "Now the pure function that turns a request into a decision. It checks the rule; if the rule fires, return its deny with the reason. Critically, if the rule does NOT fire, we do not return allow — we return the fail-closed default deny. That single `return` at the bottom is the most important line in the function. Absence of a matching allow is denial, always.",
        "code": {
          "label": "Step 2 — decide(), fail-closed",
          "code": "type Decision = { effect: 'allow' | 'deny'; reason: string; rule: string };\n\nfunction decide(r: Req): Decision {\n  if (denyBotProdDelete.when(r)) {\n    return { effect: 'deny', reason: denyBotProdDelete.reason, rule: denyBotProdDelete.id };\n  }\n  // FAIL-CLOSED: no rule permitted this, so deny. Never fall through to allow.\n  return { effect: 'deny', reason: 'No rule permits this action (fail-closed default).', rule: 'default-deny' };\n}"
        },
        "script": "Point at the last return. 'In a normal app the bottom of a function like this returns allow or true. Here it returns DENY. That inversion is the entire safety posture.' Ask: 'What happens if I typo the rule and it never matches?' Answer: 'You get denied, not exposed. Fail-closed protects you even from your own bugs.'"
      },
      {
        "segment": "micro-build",
        "eyebrow": "3️⃣ Prove it",
        "title": "Move 3: run it — a blocked action that explains itself",
        "body": "Run the evaluator against the dangerous request and against a benign one. The bot's prod delete comes back denied, with the exact reason a human can act on. A read request comes back denied too — because we have no allow rule yet, and fail-closed means unlisted equals denied. That second result surprises people, and it should: it proves the default is doing its job. On Thursday you will add the allow rules that let the safe majority through.",
        "code": {
          "label": "Step 3 — run and read the output",
          "code": "decide({ role: 'support_bot', action: 'user.delete', ctx: { env: 'prod' } });\n// { effect: 'deny', reason: 'Bots may not hard-delete in production.', rule: 'deny-prod-delete-by-bot' }\n\ndecide({ role: 'support_bot', action: 'ticket.read', ctx: { env: 'prod' } });\n// { effect: 'deny', reason: 'No rule permits this action (fail-closed default).', rule: 'default-deny' }\n//  ^ surprising but correct — nothing is allowed until a rule allows it."
        },
        "script": "Run both. Let the second one land: 'Wait, we blocked a harmless read?' Yes — 'because a governance engine starts closed and you open it deliberately, rule by rule. That is the opposite of every firewall you have configured, and it is the correct default for autonomous action.'"
      },
      {
        "segment": "micro-build",
        "eyebrow": "🗳️ Design choice + trailer",
        "title": "The refund poll — and what Thursday builds",
        "body": "Close with the decision that frames the build. An agent requests a high-risk action — a refund over $500. What is the correct default behavior? Take the poll, then reveal: high-risk actions escalate to a human and resume only after approval — fail-closed by default. 'Log and allow' is the trap answer, because it is governance-after: the money already moved. Thursday we build the full engine — block, escalate, approve, audit — over your Intensive 1-3 system.",
        "bullets": [
          "Poll: refund > $500 → Allow? · Escalate then resume? · Deny silently? · Log and allow?",
          "Answer: escalate to a human, resume on approval — fail-closed",
          "Trap: 'log and allow' fires the side effect first — that is governance-after",
          "Thursday: correlation ID → ABAC policy → risk classifier → evaluator → gate → HITL → audit"
        ],
        "script": "Run the live poll before revealing. Most rooms split between 'escalate' and 'log and allow' — that split IS the lesson. 'Half of you would have let the money move. The other half built a governance engine in their heads. Thursday we build it in code.' End on the trivia: one correlation ID reconstructs any decision."
      }
    ],
    "thursday": [
      {
        "segment": "build-map",
        "eyebrow": "🗺️ Today's result",
        "title": "By the end: block, escalate, approve, audit — proven three times",
        "body": "Today you ship a Governance Engine over the system you have built across Intensives 1-3, now carrying the reliability layer from Week 9. Four checkpoints, each with a demonstrable proof. CP0: the system runs with no governance. CP1: an ABAC evaluator blocks a disallowed action with a reason. CP2: a HITL gate escalates a high-risk action and resumes it on approval. CP3: you reconstruct that whole decision from one correlation ID. Three proofs at the end: one blocked, one escalated, one reconstructed.",
        "bullets": [
          "CP0 Baseline — the system acts, ungoverned (the 'before')",
          "CP1 Policy blocks — ABAC evaluator denies a disallowed action, fail-closed, with a reason",
          "CP2 Human gate — high-risk action escalates, a human approves, it resumes",
          "CP3 Auditable — one correlation ID reconstructs the decision end to end",
          "Deliverable: governance module = policy file + evaluator middleware + HITL queue + audit log"
        ],
        "script": "Show the four checkpoints as a ladder. 'Each rung has a proof — not a claim, a demo. You are not done with a checkpoint until you can show it firing.' Set expectation: 'We build in the same order the request flows: identity of a decision first, then policy, then the gate, then the human, then the audit.'"
      },
      {
        "segment": "build-map",
        "eyebrow": "📁 Readiness + layout",
        "title": "Where the engine lives in your repo",
        "body": "Before we build, confirm readiness and agree on structure. Readiness: your Intensive 1-3 system runs, and Week 9's reliability layer (timeouts, retries, breaker) is in place — governance sits in front of that, on the same hot path. Create a single `governance/` module so the four parts live together and the rest of your system imports one gate function. Everything routes through `governedExecute` — if an action can cause a side effect and does not go through the gate, it is ungoverned by definition.",
        "bullets": [
          "governance/types.ts — the request, decision, and risk types (the contracts)",
          "governance/policy.ts — the ABAC rules + fail-closed default (data, not logic)",
          "governance/risk.ts — the eight categories + classifyRisk()",
          "governance/evaluator.ts — pure (request, policy) → decision",
          "governance/gate.ts + hitl.ts + audit.ts — the runtime: gate, queue, trail"
        ],
        "script": "Have everyone create the `governance/` folder and the empty files now. 'One module, one import surface — the rest of your system calls governedExecute and nothing else. That single choke point is what makes it auditable: there is exactly one door.'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "🧵 Step 1",
        "title": "Mint the correlation ID at the entry point",
        "body": "Everything downstream hangs off one ID, so we create it first. At the true entry point of any request or scheduled job, take an inbound X-Correlation-ID if present (so a trace can span services) or mint a fresh UUID v4. Attach it to the request and echo it on the response header. From here on, every log line, every policy decision, and every audit row carries this ID. If you mint it late, part of the story is untraceable — mint it at the door.",
        "code": {
          "label": "middleware/correlation.ts",
          "code": "import { randomUUID } from 'crypto';\nimport type { Request, Response, NextFunction } from 'express';\n\nexport function correlationId(req: Request, res: Response, next: NextFunction) {\n  // Reuse an upstream id so a trace can span services; otherwise mint one.\n  const id = (req.header('X-Correlation-ID') || randomUUID());\n  (req as any).correlationId = id;\n  res.setHeader('X-Correlation-ID', id);   // echo it back for the caller\n  next();\n}\n\n// Wire it FIRST, before any route that can cause a side effect:\n//   app.use(correlationId);"
        },
        "script": "Have them add the middleware and register it first. 'Mint at the door, not at the desk. If your correlation ID is created inside the business logic, everything that happened before it — auth, routing, validation — is invisible to your audit trail.'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "📜 Step 2",
        "title": "Author the ABAC policy file (data, not code)",
        "body": "Now the policy: a list of rules over the five factors, plus the fail-closed default. Each rule declares who, on what resource, doing what action, in what context, up to what risk tier — and its effect. Order matters because we resolve most-restrictive-first: a deny or escalate should be able to win over a broad allow. Keep this file free of logic; it is the one place a reviewer reads to understand what your agent is permitted to do.",
        "code": {
          "label": "governance/policy.ts",
          "code": "export interface AbacRule {\n  id: string;\n  description: string;\n  match: {\n    roles?: string[];            // USER factor\n    resourceTypes?: string[];    // RESOURCE factor\n    actions?: string[];          // ACTION factor (supports '*.read' globs)\n    context?: { env?: string[] };// CONTEXT factor\n    maxRiskTier?: RiskTier;      // RISK factor — rule applies only up to this tier\n  };\n  effect: 'allow' | 'deny' | 'escalate';\n}\n\nexport const POLICY: AbacRule[] = [\n  { id: 'deny-prod-delete-by-bot', description: 'Bots may not hard-delete in prod.',\n    match: { roles: ['support_bot', 'agent'], actions: ['*.delete'], context: { env: ['prod'] } },\n    effect: 'deny' },\n  { id: 'escalate-high-value-refund', description: 'Refunds over $500 escalate to a human.',\n    match: { resourceTypes: ['refund'], actions: ['refund.issue'] },\n    effect: 'escalate' },\n  { id: 'allow-read-low-risk', description: 'Any agent may read low-risk resources.',\n    match: { actions: ['*.read'], maxRiskTier: 'low' },\n    effect: 'allow' },\n];\n\n// FAIL-CLOSED: nothing matched => deny.\nexport const DEFAULT_DECISION: Decision = {\n  effect: 'deny', reason: 'No policy rule permits this action (fail-closed default).',\n  matchedRule: 'default-deny', riskTier: 'low',\n};"
        },
        "script": "Build the three rules together and name their factors aloud. 'A reviewer should be able to read this file and tell you exactly what your agent can and cannot do — no source diving. That readability is a feature, not an accident. Governance you cannot review is governance you cannot trust.'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "⚖️ Step 3",
        "title": "Compute risk — never trust it from the caller",
        "body": "Risk is the fifth factor and the one factor we compute rather than accept. classifyRisk inspects the action and context and returns a tier plus the high-risk categories it triggered. Money and deletion push to critical; anything in the eight categories is at least high. Because we derive it, a compromised or confused agent cannot smuggle a dangerous action through by claiming it is low risk. This is the code the evaluator leans on to decide whether a rule even applies.",
        "code": {
          "label": "governance/risk.ts",
          "code": "export const HIGH_RISK_CATEGORIES = [\n  'financial_movement', 'data_deletion', 'external_communication', 'access_grant',\n  'credential_access', 'production_write', 'identity_action', 'irreversible_side_effect',\n] as const;\n\nexport function classifyRisk(req: ActionRequest): { tier: RiskTier; categories: string[] } {\n  const cats: string[] = [];\n  const amount = req.context.amount ?? 0;\n  if (/refund|payment|payout/.test(req.action))               cats.push('financial_movement');\n  if (/\\.delete$|\\.drop$/.test(req.action))                   cats.push('data_deletion');\n  if (/email|sms|post|message/.test(req.action))              cats.push('external_communication');\n  if (/grant|role|permission/.test(req.action))               cats.push('access_grant');\n  if (req.context.env === 'prod' && /\\.(write|update|create)$/.test(req.action))\n                                                              cats.push('production_write');\n\n  let tier: RiskTier = cats.length ? 'high' : 'low';\n  if (amount >= 500 || cats.includes('data_deletion')) tier = 'critical';\n  return { tier, categories: cats };\n}"
        },
        "script": "Emphasize the trust boundary. 'Notice the caller sends amount and action, but never sends risk. We compute risk from those. If you let the caller assert its own risk tier, you have built a lock whose key is printed on the door.' Ask the class to name one more rule they would add for their own system."
      },
      {
        "segment": "guided-build",
        "eyebrow": "🧮 Step 4",
        "title": "The evaluator: pure, fail-closed, under budget",
        "body": "Here is the heart: a pure function that takes a request, computes risk, walks the policy most-restrictive-first, and returns a decision. Deny short-circuits immediately. Escalate is remembered and beats a later allow. Allow only sticks if nothing more restrictive matched. If the loop ends with no decision, we return the fail-closed default. And because this runs on every action, we hold it to a budget — under 10ms — and warn if we blow it, so governance never becomes the bottleneck.",
        "bullets": [
          "Resolution order: deny > escalate > allow > fail-closed default",
          "Pure function — no I/O, trivially unit-testable, deterministic",
          "Budget: < 10ms per evaluation; log a warning if exceeded (keep the hot path fast)"
        ],
        "code": {
          "label": "governance/evaluator.ts",
          "code": "const TIER_ORDER: Record<RiskTier, number> = { low: 0, medium: 1, high: 2, critical: 3 };\n\nfunction ruleMatches(rule: AbacRule, req: ActionRequest, tier: RiskTier): boolean {\n  const m = rule.match;\n  if (m.roles && !m.roles.some(r => req.principal.roles.includes(r))) return false;\n  if (m.resourceTypes && !m.resourceTypes.includes(req.resource.type)) return false;\n  if (m.actions && !m.actions.some(a => globMatch(a, req.action))) return false;\n  if (m.context?.env && !m.context.env.includes(req.context.env)) return false;\n  if (m.maxRiskTier && TIER_ORDER[tier] > TIER_ORDER[m.maxRiskTier]) return false;\n  return true;                                  // all five factors lined up\n}\n\nexport function evaluate(req: ActionRequest): Decision {\n  const started = performance.now();\n  const { tier } = classifyRisk(req);\n  let chosen: Decision | null = null;\n\n  for (const rule of POLICY) {\n    if (!ruleMatches(rule, req, tier)) continue;\n    if (rule.effect === 'deny')     { chosen = { effect: 'deny', reason: rule.description, matchedRule: rule.id, riskTier: tier }; break; }\n    if (rule.effect === 'escalate') { chosen = { effect: 'escalate', reason: rule.description, matchedRule: rule.id, riskTier: tier, queueId: '' }; continue; }\n    if (rule.effect === 'allow' && !chosen) chosen = { effect: 'allow', reason: rule.description, matchedRule: rule.id, riskTier: tier };\n  }\n\n  const decision = chosen ?? { ...DEFAULT_DECISION, riskTier: tier };\n  const ms = performance.now() - started;\n  if (ms > 10) console.warn(JSON.stringify({ event: 'policy_budget_exceeded', correlationId: req.correlationId, ms }));\n  return decision;\n}"
        },
        "script": "Trace resolution order out loud: deny breaks the loop, escalate continues but is remembered, allow only sticks if nothing beat it, and `chosen ?? DEFAULT` catches the fall-through. Point at the budget check: 'Governance on the hot path must be fast. A pure function over a small policy is microseconds — the warning is your smoke alarm if the policy ever grows teeth.'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "🚪 Step 5",
        "title": "The gate: one door in front of every side effect",
        "body": "The evaluator decides; the gate enforces. governedExecute wraps any side effect: it evaluates, audits the decision BEFORE anything fires, and then branches. Deny returns without ever calling the side effect. Escalate enqueues to the human gate and returns — the side effect is deferred, not run. Allow calls the side effect and audits the outcome. This is the choke point: refactor your system so every money-move, delete, and send goes through this one function.",
        "code": {
          "label": "governance/gate.ts",
          "code": "export async function governedExecute<T>(\n  req: ActionRequest,\n  sideEffect: () => Promise<T>,\n): Promise<{ ok: true; result: T } | { ok: false; decision: Decision }> {\n  const decision = evaluate(req);\n  await audit.record(req, decision, 'decided');   // audit BEFORE the effect can fire\n\n  if (decision.effect === 'deny') {\n    return { ok: false, decision };                // blocked — side effect unreachable\n  }\n  if (decision.effect === 'escalate') {\n    const queued = await hitl.enqueue(req, decision);\n    return { ok: false, decision: { ...decision, queueId: queued.id } };\n  }\n\n  const result = await sideEffect();               // allow — only now\n  await audit.record(req, decision, 'executed');\n  return { ok: true, result };\n}\n\n// Usage — every side effect is wrapped:\n//   const out = await governedExecute(req, () => payments.refund(req.context.amount!));\n//   if (!out.ok) return respond(out.decision);    // blocked or escalated"
        },
        "script": "This is CP1. Have them wrap one real side effect from their own system in governedExecute and watch a disallowed action come back blocked. 'The proof of CP1 is not that it works — it is that the side effect line is unreachable when the decision is deny. Put a console.log inside the side effect and confirm it never prints on a blocked action.'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "🙋 Step 6",
        "title": "The human gate: escalate durably, notify out of band",
        "body": "When the decision is escalate, the action must survive until a human looks at it — so it becomes a durable pending row, not an in-memory promise. enqueue is idempotent: one pending row per (correlationId, action), so a retry does not double-queue. The approver is notified out of band (Slack, email) and the calling thread returns immediately — governance never blocks the caller waiting on a human. This is the queue half of CP2.",
        "code": {
          "label": "governance/hitl.ts — enqueue",
          "code": "export interface PendingDecision {\n  id: string; correlationId: string;\n  request: ActionRequest; decision: Decision;\n  status: 'pending' | 'approved' | 'denied' | 'resumed';\n  createdAt: string; resolvedBy?: string; resolvedAt?: string;\n}\n\nexport async function enqueue(req: ActionRequest, decision: Decision): Promise<PendingDecision> {\n  // IDEMPOTENT: dedupe on (correlationId, action) so retries never double-queue.\n  const existing = await db.pending.findOne({ correlationId: req.correlationId, action: req.action });\n  if (existing) return existing;\n\n  const row: PendingDecision = {\n    id: crypto.randomUUID(), correlationId: req.correlationId,\n    request: req, decision, status: 'pending', createdAt: new Date().toISOString(),\n  };\n  await db.pending.insert(row);\n  await notifyApprover(row);      // out-of-band; the caller thread does NOT wait on the human\n  return row;\n}"
        },
        "script": "Stress durability and idempotency together. 'A pending action that only lives in memory dies when the process restarts — and processes restart. Persist it.' Then the dedupe line: 'Retries are normal. Two pending rows for one action is a double refund waiting to happen. One row per correlation+action, always.'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "✅ Step 7",
        "title": "Approve and resume — exactly once",
        "body": "The human decides, then the deferred side effect runs — but only under strict idempotency. resolve flips a pending row to approved or denied, and is a no-op if the row is already resolved (double-click safe). resume runs the original side effect only if the row is approved, then marks it resumed so it can never fire twice. Both steps write to the audit trail, capturing who approved and that it executed via HITL resume. This completes CP2: escalate, approve, resume.",
        "code": {
          "label": "governance/hitl.ts — resolve + resume",
          "code": "export async function resolve(id: string, approverId: string, approved: boolean) {\n  const row = await db.pending.findById(id);\n  if (!row) throw new Error('NotFound');\n  if (row.status !== 'pending') return row;         // IDEMPOTENT: already resolved => no-op\n  row.status = approved ? 'approved' : 'denied';\n  row.resolvedBy = approverId; row.resolvedAt = new Date().toISOString();\n  await db.pending.update(row);\n  await audit.record(row.request, row.decision, approved ? 'approved' : 'denied', { approverId });\n  return row;\n}\n\nexport async function resume(id: string, sideEffect: () => Promise<unknown>) {\n  const row = await db.pending.findById(id);\n  if (!row || row.status !== 'approved') return { ok: false, reason: 'not approved' };\n  // Guard double-resume: an approved action fires exactly once, then is 'resumed'.\n  const result = await sideEffect();\n  row.status = 'resumed';\n  await db.pending.update(row);\n  await audit.record(row.request, row.decision, 'executed', { via: 'hitl_resume' });\n  return { ok: true, result };\n}"
        },
        "script": "This is the exactly-once demo. Approve a pending refund, resume it, then call resume AGAIN in front of the class. 'Watch — the second resume returns not-approved because the row is already resumed. The refund fires once, no matter how many times the resume is triggered. That is exactly-once under retry, which is the only acceptable behavior for money.'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "🕵️ Step 8",
        "title": "Audit reconstruction: the whole decision from one ID",
        "body": "CP3, the payoff. Because every phase — decided, approved, executed — wrote an append-only, redacted audit row carrying the same correlation ID, reconstruction is a single query ordered by time. You get the complete life of the decision: when the machine escalated, who approved it, and that it executed via resume. No cross-service grepping, no secrets in the output. This is INPACT Transparent delivered: any decision, fully explainable, from one key.",
        "code": {
          "label": "governance/audit.ts — record + reconstruct",
          "code": "const SECRET_KEYS = /(password|token|secret|api[-_]?key|authorization|ssn|card)/i;\nconst redact = (o: Record<string, unknown>) =>\n  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, SECRET_KEYS.test(k) ? '<redacted>' : v]));\n\nexport async function record(req: ActionRequest, d: Decision, phase: string, meta = {}) {\n  await db.audit.insert({                       // APPEND-ONLY — never update or delete a row\n    id: crypto.randomUUID(), correlationId: req.correlationId, ts: new Date().toISOString(),\n    actor: req.principal.userId, action: req.action,\n    effect: d.effect, reason: d.reason, matchedRule: d.matchedRule, riskTier: d.riskTier,\n    phase, meta: redact(meta),                  // secrets never reach the trail\n  });\n}\n\n// One id in, the full ordered story out:\nexport const reconstruct = (correlationId: string) =>\n  db.audit.find({ correlationId }, { orderBy: 'ts ASC' });\n\n// reconstruct('8f3c...') =>\n//   decided(escalate, critical) -> approved(by ali@colaberry.com) -> executed(via hitl_resume)"
        },
        "script": "Close the build here. Run reconstruct on the correlation ID from the refund you just approved and read the three rows aloud as one sentence. 'This is your CP3 proof and your INPACT Transparent score. If a decision cannot be reconstructed from one ID, it did not happen governably.' Now you have all three: blocked, escalated, reconstructed."
      },
      {
        "segment": "failure",
        "eyebrow": "💥 Break it",
        "title": "Failure injection: run the action with governance disabled",
        "body": "Now we prove why the engine matters by removing it. Take the $900 refund and call the side effect directly — no evaluate, no gate, no audit, no human. It fires. The money moves. There is no record, no reason, no correlation ID, no chance for anyone to have stopped it. This is not a hypothetical; it is exactly what 'governance-after' ships to production, and it is the single most common way an autonomous system causes real damage.",
        "code": {
          "label": "The ungoverned path (do NOT ship this)",
          "code": "// GOVERNANCE DISABLED — the side effect fires unchecked.\nasync function issueRefundUngoverned(amount: number) {\n  // no evaluate(), no audit.record(), no hitl.enqueue()\n  return payments.refund(amount);        // $900 leaves the account\n}\n\nawait issueRefundUngoverned(900);\n// Result: refund sent. No decision. No block. No human. No audit row.\n// Ask afterward: 'why did this happen?' -> there is no way to answer."
        },
        "script": "Run it live with a mock payments client that logs 'REFUND SENT: $900'. Let the class see it fire with zero friction. 'That took no permission and left no trace. If a regulator asks why, your honest answer is a shrug. This is the before. Now we turn governance back on.'"
      },
      {
        "segment": "failure",
        "eyebrow": "🛡️ Harden",
        "title": "Recovery: the same action, now blocked, escalated, and audited",
        "body": "Route the identical $900 refund through governedExecute. classifyRisk marks it critical, the escalate rule matches, and the gate returns before the side effect can fire — instead enqueuing a pending decision for a human, with a full audit row already written. Nothing changed about the action; everything changed about whether it was permitted to fire unsupervised. Flip governance on and the exact same request is safe. That contrast is the whole week in ten seconds.",
        "code": {
          "label": "The governed path — same request, safe outcome",
          "code": "const req: ActionRequest = {\n  correlationId: (ctx as any).correlationId,\n  principal: { userId: 'support-bot-7', roles: ['support_bot'], attributes: {} },\n  resource:  { type: 'refund', id: 'rf_912' },\n  action:    'refund.issue',\n  context:   { env: 'prod', channel: 'chat', timestamp: new Date().toISOString(), amount: 900 },\n};\n\nconst out = await governedExecute(req, () => payments.refund(900));\n// out = { ok: false, decision: { effect: 'escalate', riskTier: 'critical', queueId: 'pd_...' } }\n// The refund did NOT fire. It is queued for a human and already audited.\n// Approve it later -> hitl.resume(queueId, () => payments.refund(900)) fires it exactly once."
        },
        "script": "Run the governed version right after the ungoverned one, same 900. The mock payments client prints NOTHING this time — because the side effect never ran. 'Same request. One line of difference: it went through the gate. The refund is now a pending decision waiting for you, not a loss waiting to be discovered.'"
      },
      {
        "segment": "failure",
        "eyebrow": "🧯 Failure modes + trivia",
        "title": "Three ways a governance engine itself fails",
        "body": "Governance is code, so it has its own failure modes you must design against. First, the evaluator on the hot path can be too slow and become the bottleneck — keep it a pure function under budget and warn if it exceeds 10ms. Second, the audit trail can leak secrets — redact on write, and treat a token in the trail as an incident. Third, escalation can storm — if you escalate 80% of actions, humans rubber-stamp and the control is worthless; tune rules to stay under 15%. Fail-closed protects you when any of these break: when in doubt, the answer is deny.",
        "bullets": [
          "Too slow → governance becomes the bottleneck. Pure function, <10ms budget, warn on breach.",
          "Audit leaks secrets → the control becomes a vulnerability. Redact on write; secrets in the trail = incident.",
          "Escalation storm → humans rubber-stamp. Tune rules to keep escalation < 15%.",
          "Trivia: fail-closed means — deny when a governing decision is missing. Ungoverned equals disallowed."
        ],
        "script": "End on the trivia and land the week's one sentence. Ask: 'Fail-closed means?' — get them to say 'deny when unsure.' Then close: 'You built four parts — policy, evaluator, human gate, audit — but the doctrine is one line. No explicit permission means denied. Bring your three proofs on Monday: one blocked, one escalated, one reconstructed. That is your Governance Engine.'"
      }
    ]
  },
  "11": {
    "monday": [
      {
        "segment": "business-problem",
        "eyebrow": "🏗️ The Stakes",
        "title": "95% of enterprise AI pilots die. The model is almost never why.",
        "body": "Ram Katamaraja's thesis in Trust Before Intelligence is blunt: 95% of enterprise generative-AI pilots fail, and they fail on infrastructure gaps, not model limitations. The demo works, the pilot stalls, the budget evaporates. The architect's job is to close the infrastructure gap before the model ever runs in front of an executive. The Solution Architecture Package you assemble this week is the artifact that proves you closed it, and it is the single exhibit that survives an architecture review.",
        "bullets": [
          "Root cause 1: Data foundation gaps (30%) - batch ETL cannot feed a sub-2s agent",
          "Root cause 2: Architecture misalignment (25%) - static RBAC where context-aware ABAC is required",
          "Root cause 3: Demo-driven development (20%) - a POC with no operational infrastructure",
          "Root cause 4: Reinvention over framework (15%) - custom glue instead of a reference architecture",
          "Root cause 5: Conceptual misunderstanding (10%) - treating agents as fancy search, not autonomous systems"
        ],
        "script": "Open cold: 'Nineteen of every twenty AI pilots in this room's companies will fail this year. Not because Claude is weak. Because nobody drew the architecture.' Let it land. Then: 'This week you become the person who draws it.'"
      },
      {
        "segment": "business-problem",
        "eyebrow": "🖼️ Slides vs Evidence",
        "title": "A beautiful slide deck is not an architecture. It is a liability in disguise.",
        "body": "Two architects walk into the same review. One brings a polished deck: gradients, a hero diagram, three bullet points per slide, and zero trust boundaries. The other brings a 7-layer mapping table, five ADRs, a data-flow diagram with marked boundaries, and an INPACT scorecard. The first gets applause and no budget; the second gets interrogated and funded. An architecture package is diagrams plus decisions plus evidence you can defend under questioning, and the difference is whether it survives the first hostile question.",
        "code": {
          "label": "The review test: what a reviewer actually asks",
          "code": "REVIEWER QUESTION            | SLIDES ANSWER      | EVIDENCE-PACKAGE ANSWER\n----------------------------|--------------------|---------------------------------\nWhere does untrusted input  | (hand-wave)        | Data-flow diagram, boundary B2,\n  enter?                    |                    |   validator = Zod + injection scan\nWhy this model, not that?   | 'it was better'    | ADR-001: alternatives + rejection\nWhat happens when it fails? | (silence)          | Failure/recovery table, per layer\nHow ready are we for prod?  | 'pretty ready'     | INPACT 71 -> Moderate Trust,\n                            |                    |   4-8 wks, top-3 gaps named\nProve the governance works. | 'we have auth'     | Layer 5 ADR + <10ms ABAC budget"
        },
        "script": "Show the table. Ask the room: 'Which architect are you today?' Every hand goes to column two aspirationally. Say: 'By Thursday, column two is your actual deliverable, not your aspiration.'"
      },
      {
        "segment": "business-problem",
        "eyebrow": "📈 The Payoff",
        "title": "Echo Health went from a Trust Band of 28 to 89. The package is why it got funded.",
        "body": "Echo Health Systems started at an INPACT composite of 28: Critical band, a complete-rebuild diagnosis. Twelve weeks later they scored 89, in the High Trust production band. The move that unlocked the money was not the model; it was an architecture package that let executives see exactly which of the six INPACT dimensions were weak and what closing each one would cost. The result: $942K spent, 23% under a $1.23M budget, 209% first-year ROI, and a 10-week payback. That is what an evidence-backed package buys you: it converts a vague fear of AI into a fundable, sequenced plan.",
        "bullets": [
          "Start: INPACT 28 (Critical band, 16+ weeks of work)",
          "End: INPACT 89 (High Trust band, production-ready)",
          "Cost: $942K, 23% under the $1.23M budget",
          "Return: 209% Year-1 ROI, 10-week payback",
          "The instrument that made it fundable: the architecture package, not the demo"
        ],
        "script": "Draw the number line 0-100 on the board with the five bands. Put a dot at 28, a dot at 89. Say: 'The package is the map from the first dot to the second. Executives fund maps. They do not fund vibes.'"
      },
      {
        "segment": "architecture",
        "eyebrow": "🧱 The 7-Layer Reference",
        "title": "Seven layers. Every agentic system on earth maps onto them.",
        "body": "The reference architecture is a stack of seven layers, each with exactly one job, and every component you have built in Intensives 1 through 4 lives in one of them. Data flows up the stack (Storage feeds Data Fabric feeds Semantic feeds Intelligence) and control flows down (Orchestration coordinates, Governance gates, Observability watches everything). The two hardest-won weeks of this course are layers here, not afterthoughts: reliability from Week 9 lives in Observability and Orchestration, and governance from Week 10 lives in Layer 5. When you can name the layer a component belongs to, you can reason about its trust boundary, its failure mode, and its recovery path.",
        "code": {
          "label": "7-Layer Reference Architecture (canonical)",
          "code": "L | LAYER          | JOB                              | CANONICAL TECH\n--|----------------|---------------------------------|------------------------------------\n1 | Storage        | Durable bytes at rest           | RDBMS, NoSQL, Graph, Object,\n  |                |                                 |   Lakehouse, Model Registry\n2 | Data Fabric    | Move + integrate data           | CDC (Debezium), Kafka, Flink\n3 | Semantic       | Turn data into meaning          | Glossary (1000+ terms), entity\n  |                |                                 |   resolution, ontologies, KG\n4 | Intelligence   | Reason + decide                 | 7-stage RAG, LLM/agents, tool-use\n5 | Governance     | Say yes/no before an action     | ABAC engine (OPA), HITL, policy ver\n6 | Observability  | See everything that happens     | OpenTelemetry, APM, cost attribution,\n  |                |                                 |   drift detection\n7 | Orchestration  | Coordinate work across layers   | Multi-agent coordination, context\n  |                |                                 |   mgmt, HITL escalation, queues"
        },
        "script": "Build the stack on the board from the bottom up, one layer at a time, naming the job before the tech. Then say: 'Point at your capstone. Every box you drew is a tenant of one of these seven floors. This week you assign every tenant to its floor.'"
      },
      {
        "segment": "architecture",
        "eyebrow": "🚧 Trust Boundaries",
        "title": "A trust boundary is the line where you stop trusting the caller.",
        "body": "Inside a boundary, data is validated and safe to act on; outside it, data is hostile until proven otherwise. Agentic systems have four boundaries that matter, and the deadliest is the one architects forget: the Intelligence layer's own output is untrusted until Governance checks it, because a model can be manipulated by content it retrieved. Prompt injection is not a model bug; it is an unguarded boundary at the Data Fabric where poisoned external content crosses in and rides the retrieval into the model. Every boundary must name a validator, and a boundary with no named validator is a security finding, not a diagram gap.",
        "bullets": [
          "B1 User -> System: untrusted user input. Validator = schema (Zod), auth, rate limit",
          "B2 External data / MCP -> System: untrusted tool + retrieval output. Validator = injection scan, allow-list, output schema",
          "B3 Intelligence -> Governance: model output is a PROPOSED action, not a done deal. Validator = ABAC policy, fail-closed",
          "B4 System -> Side effect (write, payment, email): the irreversible edge. Validator = idempotency key, HITL for high-risk"
        ],
        "script": "Draw a box for the system. Draw four arrows crossing its edge. On each arrow write 'UNTRUSTED' in red, then write the validator that makes it trusted. Ask: 'Which of your four boundaries has no validator right now?' Silence means they found their first gap."
      },
      {
        "segment": "architecture",
        "eyebrow": "🔃 Data Flow",
        "title": "Follow one request. It touches all seven layers, in order.",
        "body": "A system diagram shows what the pieces are; a data-flow diagram shows how one request moves through them, and it is the diagram that exposes gaps. Trace a single support-triage request: it enters at Orchestration, gets a correlation ID stamped on it, crosses boundary B1 for validation, the Semantic layer resolves entities and retrieves context from Storage via the Data Fabric, the Intelligence layer reasons and proposes an action, Governance evaluates that proposal fail-closed at boundary B3, Orchestration executes the side effect idempotently at B4, and Observability records the entire trace under that one correlation ID. If you cannot trace a failure from symptom back to root cause using a single correlation ID, your observability is incomplete.",
        "code": {
          "label": "Data-flow trace: one request, one correlation ID",
          "code": "corr_id = req-7f3a  (stamped once, propagated everywhere)\n\n[7 Orchestration] receive request, stamp corr_id, start trace\n   |  B1 validate (Zod schema + authN)         <- trust boundary\n[3 Semantic]      resolve entities, plan retrieval\n[2 Data Fabric]   pull fresh context (freshness SLA <30s)\n   |  B2 injection scan on retrieved content   <- trust boundary\n[1 Storage]       read grounding docs / vectors\n[4 Intelligence]  reason -> PROPOSE action: refund $240\n   |  B3 ABAC policy eval, fail-closed (<10ms)  <- trust boundary\n[5 Governance]    ALLOW (amount < HITL threshold) OR escalate\n   |  B4 idempotency key = corr_id             <- trust boundary\n[7 Orchestration] execute side effect exactly once\n[6 Observability] log every hop under corr_id, emit metrics"
        },
        "script": "Walk the trace line by line with your finger on the board. At B3 pause: 'The model SAID refund $240. It does not get to DO it. Governance decides.' That distinction is the whole reason Layer 5 exists as a layer."
      },
      {
        "segment": "architecture",
        "eyebrow": "🔥 Failure-First per Layer",
        "title": "Every layer fails differently. Name the failure before you name the feature.",
        "body": "Failure-First design says you answer four questions in writing before you ship: what happens when this fails, will it retry and how, what is the recovery when retries are exhausted, and which failure modes you explicitly do not handle. Each of the seven layers has a characteristic failure mode and a matching recovery, and an architecture package that lists features but not failures is a package that has never been stress-tested. The recovery column is where reliability from Week 9 becomes visible: timeouts, retries with capped backoff, circuit breakers, dead-letter queues, and fail-closed defaults are all recovery mechanisms attached to specific layers.",
        "code": {
          "label": "Failure / recovery matrix (per layer)",
          "code": "LAYER          | CHARACTERISTIC FAILURE      | RECOVERY / CONTROL\n---------------|-----------------------------|-------------------------------------\nStorage        | corruption, data loss       | backups + tested restore, PITR\nData Fabric    | stale or poisoned data       | freshness SLA, CDC lag alert, scan\nSemantic       | wrong entity, bad retrieval  | grounding checks, retrieval evals\nIntelligence   | hallucination, wrong action  | eval gates, HITL on low confidence\nGovernance     | policy bypass, over-permit   | fail-closed default, policy tests\nObservability  | blind spot, silent failure   | correlation IDs, SLO alerts\nOrchestration  | stuck job, duplicate action  | timeout + capped retry, circuit\n               |                             |   breaker, DLQ, idempotency key"
        },
        "script": "Cover the RECOVERY column with your hand. Read a failure aloud and make the room shout the recovery before you reveal it. When they miss 'Orchestration / duplicate action', that is your cue for the idempotency lecture."
      },
      {
        "segment": "architecture",
        "eyebrow": "📊 INPACT + Trust Band",
        "title": "You cannot fund a gap you cannot score. INPACT gives the number; Trust Band gives the timeline.",
        "body": "INPACT scores six dimensions an agent needs from its infrastructure, one to six each, summed to a maximum of 36 and converted to a 100-point composite; the production threshold is 86. Trust Band then maps that composite onto a readiness band and a realistic timeline, so a single number becomes an executive decision about how many weeks of work stand between you and production. The power of the pairing is that it turns architecture from an argument into arithmetic: instead of debating whether the system is 'ready', you show a 71 sitting in the Moderate band, four to eight weeks out, with the three lowest dimensions named as the work.",
        "code": {
          "label": "INPACT (6 dims, 1-6 each -> /36 -> /100) + Trust Band",
          "code": "INPACT DIMENSION                              | RUBRIC ANCHOR (score 6)\n----------------------------------------------|-------------------------------\nI  Instant     - responsiveness + freshness   | <2s response, <30s freshness\nN  Natural     - business-language understand | no schema knowledge needed\nP  Permitted   - context-aware ABAC authz     | dynamic 5-factor, <15% escal.\nA  Adaptive    - learns from feedback         | closed-loop improvement\nC  Contextual  - cross-domain, unified view   | one context across silos\nT  Transparent - observable reasoning + audit | full trace, complete audit log\n\ncomposite = (sum of 6 scores / 36) * 100      threshold = 86\n\nTRUST BAND      | COMPOSITE | READINESS\n----------------|-----------|-----------------------------------\nHigh Trust      | 86-100    | Production-ready, minimal gaps (2-4 wk)\nModerate Trust  | 67-85     | Pilot-ready, known gaps (4-8 wk)\nLow Trust       | 50-66     | Significant work (8-12 wk)\nVery Low Trust  | 33-49     | Major transformation (12-16 wk)\nCritical        | <33       | Complete rebuild (16+ wk)"
        },
        "script": "Write 'INPACT 71' on the board. Ask: 'Ship it?' Then reveal the Trust Band table: 'No. 71 is Moderate, four to eight weeks out. And here are the exact three dimensions costing you the other 15 points.' That sentence is the whole value of the framework."
      },
      {
        "segment": "deconstruct",
        "eyebrow": "🔍 Anatomy of an ADR",
        "title": "An ADR that only describes is worthless. Watch the exact line where value appears.",
        "body": "An Architecture Decision Record captures a high-stakes decision so future-you, a new hire, or a skeptical reviewer can understand and defend it without you in the room. The failure mode is the describing ADR, which states what you did ('we use Postgres') and stops. The valuable ADR justifies: it states the context and forces, the decision, the alternatives you considered and specifically why you rejected each, the consequences you now live with, and a revisit trigger that says when this decision should be reopened. The single most important line is 'Alternatives considered', because a decision with no rejected alternatives was never actually a decision.",
        "code": {
          "label": "Describing ADR vs Justifying ADR (same decision)",
          "code": "--- DESCRIBING (worthless) ---\nTitle: Use Postgres\nWe use Postgres for storage. It works well.\n\n--- JUSTIFYING (defensible) ---\nADR-004: Postgres as system-of-record for agent state\nStatus:   Accepted (2026-09-24)\nContext:  Agent state must survive restarts, support ACID\n          writes at B4, and be queryable for audit. Team\n          knows SQL; data residency must stay in us-east.\nDecision: Postgres 16, single-region, row-level security on.\nAlternatives considered:\n  - DynamoDB: rejected - weak multi-row transactions for\n      the refund saga; audit queries need joins.\n  - SQLite: rejected - no concurrent writer story for the\n      orchestration queue.\n  - Mongo: rejected - schema drift already bit us in Wk8.\nConsequences: vertical-scale ceiling accepted; we add a\n  read replica before 500 rps. RLS adds ~1ms/query.\nRevisit when: write throughput > 500 rps sustained."
        },
        "script": "Read the describing version. Ask: 'Could you defend that in a review?' Read the justifying version. Point at 'Alternatives considered'. Say: 'THIS block is the ADR. Everything else is context. If you cannot name what you rejected and why, you did not make a decision, you made a guess.'"
      },
      {
        "segment": "deconstruct",
        "eyebrow": "🧩 Reverse-Engineer a Real Decision",
        "title": "Deconstruct Echo Health's Layer 5: why ABAC, not RBAC?",
        "body": "Root cause number two of AI failure is architecture misalignment: teams bring role-based access control to a problem that demands context-aware attribute-based access control. Static roles leak, because an agent acting on behalf of a user across domains cannot be pinned to one role, and 'is this action permitted right now, for this user, on this resource, in this context' is a question RBAC literally cannot express. Echo Health's Layer 5 ADR is the decision that moved them out of the 25%-failure bucket. Read it as a model for your own governance ADR: notice how the rejection reasons are specific and technical, not aesthetic.",
        "code": {
          "label": "ADR-005 (Echo Health, reconstructed): ABAC over RBAC",
          "code": "ADR-005: Context-aware ABAC for agent authorization\nStatus:   Accepted\nContext:  Agents act on behalf of clinicians across billing,\n          records, and scheduling. A single action (release\n          a record) is permitted or not depending on patient\n          consent, requester relationship, time, and purpose\n          - four attributes that change per request.\nDecision: 5-factor ABAC via OPA, evaluated inline with a\n          hard <10ms policy budget, fail-closed on timeout.\nAlternatives considered:\n  - RBAC: rejected - cannot express per-request context;\n      would require a role explosion (thousands) and still\n      leak on cross-domain actions.\n  - Homegrown if/else in app code: rejected - no audit\n      trail, no policy versioning, untestable at scale.\nConsequences: policy latency counts against the <2s Instant\n  budget; policies are versioned + unit-tested; a failed\n  eval denies the action (fail-closed), raising escalation.\nRevisit when: escalation rate > 15% (INPACT Permitted floor)."
        },
        "script": "Walk the four attributes: consent, relationship, time, purpose. Say: 'Try writing a ROLE that captures all four. You cannot. That is not a preference, it is an expressiveness limit. That single sentence is why ADR-005 exists and why RBAC put a quarter of all AI pilots in the ground.'"
      },
      {
        "segment": "deconstruct",
        "eyebrow": "📋 Read a Scorecard",
        "title": "A scorecard with no named gaps is a scorecard nobody actually read.",
        "body": "The composite number is not the deliverable; the gap analysis is. To read a scorecard, score all six dimensions honestly, compute the composite, place it on the Trust Band, and then do the one analytical move that matters: rank the dimensions by distance from their target and take the lowest three. Those three gaps are your roadmap, and each one names a layer to work on and a concrete fix. Watch how Echo Health's mid-project scorecard turns a 61 into a three-item plan, and notice that the biggest point-swing comes from the dimension that was lowest, not the one that was loudest.",
        "code": {
          "label": "Worked scorecard -> top-3 gaps (Echo Health, mid-project)",
          "code": "DIM          | NOW | TGT | GAP | LAYER TO FIX\n-------------|-----|-----|-----|--------------------------\nI Instant    |  3  |  5  |  2  | 2 Data Fabric (add CDC)\nN Natural    |  4  |  5  |  1  | 3 Semantic (glossary)\nP Permitted  |  2  |  6  |  4  | 5 Governance (ABAC)   <-\nA Adaptive   |  3  |  4  |  1  | 4 Intelligence (evals)\nC Contextual |  3  |  5  |  2  | 3 Semantic (KG merge)\nT Transparent|  3  |  6  |  3  | 6 Observability (trace) <-\n-------------|-----|-----|-----|--------------------------\nsum = 18 / 36 -> composite 50  (Low Trust, 8-12 wk)\n\nTOP 3 GAPS (rank by GAP desc):\n  1. Permitted   gap 4 -> Layer 5: ship ABAC engine\n  2. Transparent gap 3 -> Layer 6: full trace + audit log\n  3. Instant     gap 2 -> Layer 2: CDC for <30s freshness"
        },
        "script": "Point at Permitted = 2. Say: 'This is a 2. It is dragging the whole composite. Fixing the thing that is already a 4 is vanity. The architect fixes the 2 first, because that is where the points and the risk both live.'"
      },
      {
        "segment": "micro-build",
        "eyebrow": "✍️ Micro-Build: Map Your System",
        "title": "Fifteen minutes: map YOUR system onto the seven layers.",
        "body": "Open a blank mapping table and put every component you built in Intensives 1 through 4 onto exactly one layer. For each component write what it does at that layer, and if a layer has nothing in your system, write N/A with a one-line reason, because a justified N/A is a real architectural statement, not a blank. Add a trust-boundary note wherever a component sits on the edge of your system. This table becomes checkpoint CP1 of Thursday's package, so do it honestly now.",
        "code": {
          "label": "Blank 7-layer mapping template (fill this now)",
          "code": "LAYER          | YOUR COMPONENT(S) | WHAT IT DOES HERE | TRUST BOUNDARY?\n---------------|-------------------|-------------------|----------------\n1 Storage      |                   |                   |\n2 Data Fabric  |                   |                   |\n3 Semantic     |                   |                   |\n4 Intelligence |                   |                   |\n5 Governance   |                   |                   |\n6 Observability|                   |                   |\n7 Orchestration|                   |                   |\n\nRule: every layer gets a component OR an N/A + reason.\nRule: mark B1-B4 in the boundary column where they apply."
        },
        "script": "Set a visible 15-minute timer. Walk the room. When someone leaves Governance blank, ask 'is that N/A or unfinished?' Force the distinction. The blank Governance cells are the students who will fail their Expo defense; find them now."
      },
      {
        "segment": "micro-build",
        "eyebrow": "✍️ Worked Example",
        "title": "Here is mine, filled end to end. Now yours has a target to hit.",
        "body": "This is a support-triage agent mapped across all seven layers, including two honest N/A calls with reasons. Notice that Intelligence is one row, not the whole system, which is the mental shift of the week: the model is a single tenant on floor four, and the other six floors are what make it trustworthy. Notice also that the trust-boundary column is not decoration; it is where B1 through B4 land on concrete components. Use this density as your bar: if your table has one-word cells, it is not done.",
        "code": {
          "label": "Filled example: support-triage agent",
          "code": "LAYER          | COMPONENT            | DOES                    | BOUNDARY\n---------------|----------------------|-------------------------|---------\n1 Storage      | Postgres, S3 tickets  | state, attachments      | -\n2 Data Fabric  | Zendesk MCP, CRM sync | pull ticket + account   | B2\n3 Semantic     | entity resolver, KB   | map user->account, RAG  | -\n4 Intelligence | Claude + tool-use     | classify, propose reply | -\n5 Governance   | OPA ABAC, refund HITL | gate refunds > $200     | B3\n6 Observability| OTel traces, cost log | trace per corr_id       | -\n7 Orchestration| queue + retry + DLQ   | sequence, idempotency   | B1,B4\n\nN/A: none this system. (If you had no external data,\n     Data Fabric = N/A: 'all context is user-supplied\n     inline; no ingestion pipeline exists.')"
        },
        "script": "Fill this live, cell by cell, narrating each choice. At Governance say: 'Refunds over $200 go to a human. That one cell is the difference between a demo and a system you would let touch money.' Then: 'Your table should be this dense. Go make it so.'"
      },
      {
        "segment": "micro-build",
        "eyebrow": "🚧 Mark the Boundaries",
        "title": "Now draw the boundaries. Where does untrusted input actually touch your system?",
        "body": "Go back to your filled table and overlay the four trust boundaries onto concrete components, then give each boundary a named validator. B1 is your entry point, B2 is every MCP server or external fetch, B3 is the handoff from Intelligence to Governance, and B4 is every irreversible side effect. The exercise is deliberately uncomfortable: any boundary you cannot attach a validator to is a real gap you will fix on Thursday, not a diagramming inconvenience. Write the gaps down explicitly, because a named gap is halfway to closed.",
        "code": {
          "label": "Boundary + validator worksheet",
          "code": "BND | WHERE (component)        | VALIDATOR (name it)          | GAP?\n----|--------------------------|------------------------------|-----\nB1  | API entry / chat input    | Zod schema + authN + rate    | \n----|--------------------------|------------------------------|-----\nB2  | Zendesk MCP, web fetch    | injection scan + output      | \n    |                          |   schema + source allow-list |\n----|--------------------------|------------------------------|-----\nB3  | Intelligence -> Gov       | ABAC policy eval, fail-closed| \n----|--------------------------|------------------------------|-----\nB4  | refund / email / DB write | idempotency key + HITL       | \n----|--------------------------|------------------------------|-----\nAny row with a blank VALIDATOR = a gap for Thursday."
        },
        "script": "Say: 'B2 is where prompt injection lives. If your validator cell for B2 is empty, a poisoned support ticket can make your agent issue a refund to an attacker. Write EMPTY there if it is empty. That honesty is the assignment.'"
      },
      {
        "segment": "micro-build",
        "eyebrow": "📝 One ADR, Right Now",
        "title": "Before you leave, write one ADR: your single highest-stakes decision.",
        "body": "Pick the one choice in your system that would hurt the most to get wrong: which model, which MCP tools get write access, where data lives, or how you guarantee exactly-once side effects. Fill the template completely, and spend most of your effort on the 'Alternatives considered' block, because that is the part reviewers attack and the part that proves you decided rather than defaulted. This is one of the five-plus ADRs your Thursday package needs, so it is not throwaway practice; it is a real deliverable started early. If you cannot name a rejected alternative, you have found a decision you never actually made.",
        "code": {
          "label": "ADR template (fill for your riskiest decision)",
          "code": "ADR-0XX: <decision in one line>\nStatus:   Proposed | Accepted | Superseded\nContext:  <the forces: constraints, requirements, what is\n          true right now that pushes on this decision>\nDecision: <what you are doing, specifically>\nAlternatives considered:\n  - <option A>: rejected because <specific technical reason>\n  - <option B>: rejected because <specific technical reason>\nConsequences: <what you now live with - good and bad>\nRevisit when: <the concrete trigger to reopen this>"
        },
        "script": "Give them 10 minutes. The instruction: 'Two rejected alternatives minimum, each with a technical reason, not a taste reason. \"We liked it better\" is banned. \"It cannot do multi-row transactions\" is the bar.'"
      },
      {
        "segment": "micro-build",
        "eyebrow": "🎯 Score One + Trailer",
        "title": "Score one dimension honestly, then Thursday we assemble the whole package.",
        "body": "Pick Permitted or Transparent and score it one to six against the rubric anchors, and be honest even though honesty costs points, because a self-flattering scorecard is the thing that fails at the Expo when someone asks for the evidence. That single honest score is the seed of Thursday's full INPACT composite. Thursday you produce the complete Solution Architecture Package: system and data-flow diagrams, the finished 7-layer table, five-plus ADRs, and an INPACT composite plus Trust Band scorecard with your top-three gaps. Bring your whole repo; we build the exhibit that goes to the Architect Expo.",
        "bullets": [
          "Bring: your full system from Intensives 1-4, in the repo",
          "Bring: today's filled 7-layer table and boundary worksheet",
          "Bring: your one ADR (and the honest score you just wrote)",
          "Poll answer: an ADR is worth writing when it justifies the choice and the alternatives rejected",
          "Trivia answer: an architecture package is diagrams + decisions + evidence, not slides"
        ],
        "script": "Close: 'You walked in able to build. You walk out able to EXPLAIN and DEFEND what you built, which is the actual job title. Thursday we turn today's honest gaps into a package that gets funded. Score your one dimension. See you Thursday.'"
      }
    ],
    "thursday": [
      {
        "segment": "build-map",
        "eyebrow": "🗺️ Today's Result",
        "title": "By the end of today: a Solution Architecture Package you can defend end to end.",
        "body": "The deliverable is a single reviewable artifact containing system and data-flow diagrams, a complete 7-layer mapping table, five or more ADRs for your highest-stakes decisions, and an INPACT composite plus Trust Band scorecard that names your top three gaps. We build it in four checkpoints, each producing a real file, not a slide. The rule for the whole session: diagrams plus decisions plus evidence, every claim traceable to an artifact in the repo. This package is simultaneously your Architect Expo exhibit and your CCA-Foundations portfolio piece, so we build it to survive a hostile review.",
        "code": {
          "label": "Build map: 4 checkpoints -> the package",
          "code": "CP  | LABEL      | PRODUCES                              | FILE\n----|------------|---------------------------------------|------------------\nCP0 | Inventory  | every component listed                | inventory.md\nCP1 | Mapped     | 7-layer table + system + data-flow    | seven-layer.md,\n    |            |   diagrams, boundaries marked         |   diagrams/*.mmd\nCP2 | Justified  | 5+ ADRs, alternatives rejected        | adr/000X-*.md\nCP3 | Scored     | INPACT composite + Trust Band +       | scorecard.md\n    |            |   top-3 gaps                          |\n----|------------|---------------------------------------|------------------\nGATE: a reviewer can answer 'where does untrusted input\n      enter?' and 'why this decision?' from the files alone."
        },
        "script": "Put the four checkpoints on the board and leave them up all session; check each off in front of the room as they land. Say: 'Four files. Not four decks. If it is not a committed file at the end, it did not happen.'"
      },
      {
        "segment": "build-map",
        "eyebrow": "📁 The Package Is a Folder",
        "title": "The package is a folder in your repo, not an export from a slide tool.",
        "body": "An architecture package is version-controlled, which is what makes it evidence: every diagram is text (mermaid), every decision is a numbered markdown file, and the scorecard is a table anyone can diff. It renders to a PDF or a static site for the Expo, but the source of truth is the /architecture folder that lives beside the code it describes. This is the Production Readiness principle applied to documentation: the package is built, released, and run the same way the system is, and it drifts the moment it stops living in the repo. Set up this skeleton now, then we fill it checkpoint by checkpoint.",
        "code": {
          "label": "/architecture folder skeleton",
          "code": "architecture/\n  README.md              <- one-paragraph system summary + how to read\n  inventory.md           <- CP0\n  seven-layer.md         <- CP1 mapping table\n  diagrams/\n    system.mmd           <- CP1 component diagram (mermaid)\n    data-flow.mmd        <- CP1 request trace (mermaid sequence)\n  adr/\n    0001-model-choice.md\n    0002-mcp-write-boundary.md\n    0003-governance-abac.md\n    0004-storage-residency.md\n    0005-orchestration-idempotency.md\n  scorecard.md           <- CP3 INPACT + Trust Band + top-3 gaps\n\n# render for the Expo (text -> one artifact):\n#   npx @mermaid-js/mermaid-cli on diagrams/*.mmd, then\n#   pandoc architecture/*.md -o architecture-package.pdf"
        },
        "script": "Have everyone run 'mkdir -p architecture/diagrams architecture/adr' and commit the empty skeleton right now. Say: 'You just made the package real. Now we fill it. Committing the skeleton first means every checkpoint has a home to land in.'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "📦 CP0: Inventory",
        "title": "Step 0: inventory every component. You cannot map what you have not listed.",
        "body": "List every service, model call, MCP server, datastore, queue, cron job, and policy in your system, because the map is only as complete as the inventory beneath it. The discipline here is idempotency applied to documentation: your inventory should be regenerable from the repo, so it never silently drifts from reality. Use Claude to draft it from your codebase, then verify every line by hand, because a research draft describes intent while the repo describes fact. A component you forget to inventory is a component with no layer, no boundary, and no failure plan.",
        "code": {
          "label": "CP0 inventory template + Claude prompt",
          "code": "# Claude prompt:\n'Scan this repo and list every component: services, model\n calls, MCP servers, datastores, queues, crons, and policy\n files. For each, give name, path, and one-line purpose.\n Do not infer components that are not in the code.'\n\n# inventory.md (verify every row against the repo):\nCOMPONENT           | PATH                    | PURPOSE\n--------------------|-------------------------|------------------\napi-gateway         | src/routes/             | entry, authN\nzendesk-mcp         | src/mcp/zendesk.ts      | pull tickets\nclaude-triage       | src/agents/triage.ts    | classify+reply\nopa-policies        | policy/*.rego           | ABAC gate\ntriage-queue        | src/queue/              | sequence+retry\notel-collector      | infra/otel.yaml         | traces+metrics\npostgres            | infra/db/               | state of record"
        },
        "script": "Say: 'Run the prompt, then delete two lines Claude invented and add one it missed. It always does both. The verify step is where you earn the inventory. Trust but verify - the draft is a starting point, not a fact.'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "🗺️ CP1a: System Diagram",
        "title": "Step 1a: draw the system diagram. Boxes are components, lines are calls, the dashed line is the boundary.",
        "body": "The system diagram answers 'what are the pieces and who calls whom', and its one non-negotiable element is the trust boundary drawn as a dashed line around what you control. Everything crossing that dashed line is untrusted until a validator clears it, so the diagram makes B1 through B4 visible at a glance. Write it in mermaid so it is text you can diff and commit, which is what makes it evidence rather than a screenshot. If a reviewer cannot point at where untrusted input crosses your boundary using this diagram alone, the diagram is not done.",
        "code": {
          "label": "diagrams/system.mmd (mermaid)",
          "code": "flowchart TB\n  user([User])\n  subgraph TRUST[Trust boundary: what we control]\n    gw[API Gateway B1]\n    tri[Claude Triage L4]\n    gov[OPA ABAC L5]\n    q[Queue + DLQ L7]\n    db[(Postgres L1)]\n    otel[[OTel L6]]\n  end\n  ext[(Zendesk / CRM)]\n  user -->|B1 validate| gw --> tri\n  tri -->|external fetch B2| ext\n  tri -->|proposed action B3| gov\n  gov -->|allow| q -->|side effect B4| ext\n  q --> db\n  otel -.observes.- gw & tri & gov & q"
        },
        "script": "Render it live. Trace the dashed TRUST box with your finger. Say: 'Everything inside this box is ours. Every arrow that crosses the line is a boundary. Count them. Four. If you drew fewer than four crossings, you hid one, and a reviewer will find it.'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "🔃 CP1b: Data-Flow Diagram",
        "title": "Step 1b: draw the request trace. One arrow per hop, one correlation ID throughout.",
        "body": "Where the system diagram is static, the data-flow diagram is dynamic: it follows one request through the layers in order and shows exactly where validation, governance, and the side effect happen. Model it as a sequence so the ordering is explicit, and stamp the correlation ID at the entry so every downstream hop carries it. This is the diagram that exposes the deadly gap, because if governance is drawn after the side effect, or the correlation ID appears halfway through, the picture makes the bug obvious. A failure you cannot trace end to end on this diagram is a failure you cannot debug in production.",
        "code": {
          "label": "diagrams/data-flow.mmd (mermaid sequence)",
          "code": "sequenceDiagram\n  autonumber\n  participant U as User\n  participant O as Orchestration L7\n  participant S as Semantic L3\n  participant I as Intelligence L4\n  participant G as Governance L5\n  participant X as Side effect B4\n  participant OB as Observability L6\n  U->>O: request (stamp corr_id)\n  Note over O: B1 validate schema + authN\n  O->>S: resolve entities + retrieve\n  Note over S: B2 injection scan on retrieved content\n  S->>I: grounded context\n  I->>G: PROPOSE action (corr_id)\n  Note over G: B3 ABAC eval, fail-closed <10ms\n  G->>X: allow -> execute (idempotency key)\n  X-->>OB: log every hop under corr_id"
        },
        "script": "Point at message 6->7: 'Propose, then gate. In that order. If your diagram executes before it gates, you built an unguarded system that happens to work in the demo.' Then: 'One corr_id from message 1 to the last log line. Trace it with me.'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "🧱 CP1c: 7-Layer Table",
        "title": "Step 1c: fill the 7-layer table. N/A is a valid answer, but only with a reason.",
        "body": "Now bind every inventoried component to exactly one layer, note what it does there, and mark the trust boundary where one applies. A blank layer is not allowed; either a component lives there or you write N/A with a one-line reason that is itself an architectural statement. Use the Week 11 prompt to draft it, then correct it against your inventory, because Claude will sometimes place a component on the wrong floor. This table plus the two diagrams completes CP1, and together they are the 'diagrams' third of diagrams-plus-decisions-plus-evidence.",
        "code": {
          "label": "seven-layer.md (filled, verify against inventory)",
          "code": "# Prompt: 'Map each component from inventory.md onto the 7\n# layers (Storage->Data Fabric->Semantic->Intelligence->\n# Governance->Observability->Orchestration). Note trust\n# boundaries. Mark N/A layers with a reason.'\n\nL | LAYER         | COMPONENT          | BOUNDARY\n--|---------------|--------------------|----------\n1 | Storage       | postgres           | -\n2 | Data Fabric   | zendesk-mcp, crm   | B2\n3 | Semantic      | entity-resolver    | -\n4 | Intelligence  | claude-triage      | -\n5 | Governance    | opa-policies       | B3\n6 | Observability | otel-collector     | -\n7 | Orchestration | api-gateway, queue | B1, B4\n\n# Example justified N/A:\n#   L2 Data Fabric = N/A: no streaming ingest; all context\n#   is fetched synchronously per request via MCP at B2."
        },
        "script": "Say: 'Every row filled or a reasoned N/A. Now the trick: read your BOUNDARY column top to bottom. B1, B2, B3, B4 should all appear. If one is missing from the table but present in your diagram, your table and diagram disagree, and evidence that contradicts itself is worse than no evidence.'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "📋 CP2a: Name the Five Decisions",
        "title": "Step 2a: name your five highest-stakes decisions before you write a word.",
        "body": "Five ADRs is the floor, and they should cover the decisions that would hurt most to get wrong, not the five that are easiest to write. The canonical high-stakes set for an agentic system is model choice, which MCP tools get write access, the governance model, storage and data residency, and the orchestration idempotency and retry strategy. Name all five as titles first, because seeing them listed forces you to notice the one you were avoiding. Each title becomes a numbered file in adr/, and each file must justify, not describe.",
        "code": {
          "label": "The 5 high-stakes ADR titles (adr/)",
          "code": "0001-model-choice.md\n    Which model tier for triage vs escalation, and why not\n    one model for everything?\n0002-mcp-write-boundary.md\n    Which MCP tools may WRITE (side effects) vs read-only,\n    and what gates a write?\n0003-governance-abac.md\n    ABAC vs RBAC; policy budget; fail-open vs fail-closed.\n0004-storage-residency.md\n    Where does state + PII live; retention; encryption.\n0005-orchestration-idempotency.md\n    Exactly-once side effects: idempotency key, retry\n    backoff, DLQ, circuit breaker.\n\n# Rule: 5 is the floor. Add one per genuinely hard call\n# your system made (e.g. 0006-prompt-injection-defense)."
        },
        "script": "Say: 'Look at 0002. Which of your MCP tools can WRITE? Refunds, emails, DB updates? That is your most dangerous decision and the one people skip. If you skip it, a reviewer asks \"what stops the agent from emailing every customer?\" and you have no file to point at.'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "📝 CP2b: Write ADRs That Justify",
        "title": "Step 2b: write each ADR so future-you can defend it without you in the room.",
        "body": "Run the Week 11 prompt to draft all five, then apply the justify test to each: does it name the alternatives you rejected and give a specific technical reason for each rejection, and does it state a revisit trigger? Draft with Claude, but you own the 'Alternatives considered' block, because that is the part that must reflect the real trade-offs of your system, not a generic list. Here is a fully worked ADR for the most-skipped decision, MCP write boundaries, at the density your reviewer expects. If any of your five is missing rejected alternatives, it is a description wearing an ADR's clothes.",
        "code": {
          "label": "adr/0002-mcp-write-boundary.md (worked, full)",
          "code": "ADR-0002: MCP tools split into read-only and gated-write\nStatus:   Accepted (2026-09-24)\nContext:  The triage agent has 6 MCP tools. Three read\n          (fetch ticket, lookup account, search KB) and\n          three write (issue refund, send email, close\n          ticket). A prompt-injected ticket (B2) could\n          steer the model to call a write tool.\nDecision: Read tools are always available. Write tools are\n          behind Governance (B3): every write is a PROPOSED\n          action that OPA must ALLOW; refunds > $200 and any\n          bulk email require HITL. Write tools are never\n          exposed directly to model output.\nAlternatives considered:\n  - All tools freely callable: rejected - a poisoned\n      ticket becomes an unauthorized refund; no audit gate.\n  - Human-approve every write: rejected - kills the <2s\n      Instant budget and the automation ROI.\n  - Separate write-only agent: rejected - moves the same\n      boundary without adding a control; more surface.\nConsequences: adds one ABAC eval (<10ms) per write; HITL\n  raises escalation on high-value refunds (watch the 15%\n  Permitted floor). All writes carry an idempotency key.\nRevisit when: a new write tool is added, or injection\n  scan (B2) false-negative rate exceeds target."
        },
        "script": "Read the three rejected alternatives aloud. Say: 'THIS is a defensible decision. Not because of the Decision line, but because of the three things it says no to and why. Hold your five against this bar. If yours has an empty Alternatives block, it is not done, it is decorated.'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "🔢 CP3a: INPACT Composite",
        "title": "Step 3a: score all six dimensions, sum to 36, convert to 100. Honestly.",
        "body": "Score each INPACT dimension one to six against the rubric anchors, sum the six, and multiply by 100 over 36 to get the composite; the production threshold is 86. Honesty is the entire point of this step, because a scorecard you inflated is a scorecard that collapses the moment a panelist asks for the evidence behind a 5. Use the Week 11 prompt to propose scores from your evidence, then challenge each one: can you point at the artifact that justifies it? A dimension you cannot back with a file in the repo is a dimension you should score lower, not higher.",
        "code": {
          "label": "scorecard.md - INPACT composite (worked)",
          "code": "# Prompt: 'Score my system on the 6 INPACT dimensions 1-6\n# using the rubric. Cite the evidence file for each score.\n# Compute composite = sum/36*100.'\n\nDIM          | SCORE | EVIDENCE (must cite a file)\n-------------|-------|--------------------------------\nI Instant    |   4   | otel p95 = 2.4s (needs <2s)\nN Natural    |   5   | entity-resolver eval 98.6%\nP Permitted  |   4   | ABAC live; escalation 19% (>15)\nA Adaptive   |   3   | no feedback loop yet\nC Contextual |   4   | CRM+Zendesk unified; billing gap\nT Transparent|   5   | full corr_id trace + audit log\n-------------|-------|--------------------------------\nsum = 25 / 36  ->  composite = 25/36*100 = 69\n\n69 is BELOW the 86 production threshold.\nRule: no score without a cited evidence file."
        },
        "script": "Say: 'Point at the file behind every score. Adaptive is a 3 because there is NO feedback loop file to point at. That is not pessimism, that is evidence discipline. The panel will ask \"show me\" for every number. Score what you can show.'"
      },
      {
        "segment": "guided-build",
        "eyebrow": "📊 CP3b: Trust Band + Gaps + Package",
        "title": "Step 3b: place the score on the Trust Band, name the top-3 gaps, and ship the package.",
        "body": "Map the composite onto the Trust Band to convert a number into a readiness verdict and a timeline, then rank the dimensions by distance from target and take the lowest three as your gaps. Each gap names the INPACT dimension, the layer that owns the fix, and the concrete action, which is exactly the roadmap slide of your Expo defense. Then assemble the folder into one reviewable artifact and run the final checklist, because an unrendered package is a package nobody reviewed. Commit it: the /architecture folder is now your Expo exhibit and your CCA-Foundations portfolio piece.",
        "code": {
          "label": "scorecard.md - Trust Band + top-3 gaps + package gate",
          "code": "composite 69 -> MODERATE TRUST (67-85), pilot-ready, 4-8 wk\n\nTOP 3 GAPS (rank by target distance):\n  1. Adaptive   3->5  L4 Intelligence: add feedback-eval loop\n  2. Instant    4->6  L2 Data Fabric: CDC for <2s + <30s fresh\n  3. Permitted  4->6  L5 Governance: tune ABAC, escal 19->15%\n\nEach gap = the fix that moves the number = the roadmap.\n\n--- PACKAGE GATE (all must be true to ship) ---\n[ ] system.mmd + data-flow.mmd render, 4 boundaries visible\n[ ] seven-layer.md complete (no blank rows)\n[ ] 5+ ADRs, each with rejected alternatives + revisit\n[ ] scorecard: composite, Trust Band, top-3 gaps, evidence\n[ ] render: pandoc architecture/*.md -o package.pdf\n[ ] git commit -m 'architecture package v1'"
        },
        "script": "Check the six boxes on the board with the room. Say: 'That commit is your Expo exhibit. It answers where untrusted input enters, why every hard call was made, and how ready you are, all from files. You did not make slides. You made evidence.'"
      },
      {
        "segment": "failure",
        "eyebrow": "💥 Failure Injection",
        "title": "Injection: present your map with the trust boundaries erased. Now find them.",
        "body": "Take your finished system diagram and delete the dashed boundary and every B1 through B4 marker, leaving only components and arrows, which is exactly how most real architecture diagrams arrive at a review. Now ask the killer question out loud: where does untrusted input enter this system? Without the boundaries, the answer is guesswork, and the gap becomes visceral: a poisoned ticket at the Data Fabric and unvalidated model output both flow straight to a side effect with nothing standing in the way. This is not a hypothetical; it is the number-two root cause of AI failure, architecture misalignment, rendered as a picture.",
        "bullets": [
          "Without boundaries you cannot answer 'where does untrusted input enter?'",
          "B2 unguarded = prompt injection rides retrieval into the model",
          "B3 unguarded = model output becomes an action with no policy check",
          "B4 unguarded = an irreversible side effect fires on hostile input",
          "A diagram that hides its boundaries hides its vulnerabilities"
        ],
        "script": "Erase the boundary from the rendered diagram live. Ask one student: 'Where does untrusted input enter?' Let them struggle. Say: 'That struggle is what every reviewer feels looking at a boundary-less diagram. The gap was always there. Erasing the line just stopped hiding it.'"
      },
      {
        "segment": "failure",
        "eyebrow": "🛠️ Recovery",
        "title": "Recovery: draw the boundary, name the validator, and the gap closes itself.",
        "body": "Add the explicit trust boundary back as a dashed line and re-mark B1 through B4 with data-flow arrows, and the entry points and their controls become obvious again. The recovery is not cosmetic: naming a validator at each boundary is the actual control, and the default at every boundary is fail-closed, so an unrecognized input is denied rather than passed through. The move that closes root cause number two is precisely this: make the boundary explicit, attach a named validator, and default to deny. Once the boundaries are back on the picture, the reviewer's killer question has a one-word answer at each crossing.",
        "code": {
          "label": "Before / after: boundary recovery",
          "code": "BEFORE (injection):\n  user --> gateway --> model --> refund tool\n  (no line, no validator, no answer to 'where in?')\n\nAFTER (recovery):\n  user --|B1 Zod+authN|--> gateway\n  gateway --> model\n  model --|B2 injection scan|--> external fetch\n  model --|B3 ABAC fail-closed|--> governance\n  governance --|B4 idempotency+HITL|--> refund tool\n\nAt every | boundary |: a NAMED validator, default DENY.\n'Where does untrusted input enter?' -> B1, B2. Answered."
        },
        "script": "Redraw the boundaries live. Ask the same student the same question. This time they answer instantly: 'B1 and B2.' Say: 'Same system. The only thing that changed is you can now SEE the controls. That visibility is what an architecture package buys a reviewer.'"
      },
      {
        "segment": "failure",
        "eyebrow": "⚠️ Three Ways It Fails Review",
        "title": "Three ways this package fails a review. Kill all three before the Expo.",
        "body": "The package fails in exactly three ways, and each has a specific fix you can apply today. It fails as slides instead of evidence when claims are not traceable to a committed file, so the fix is the package gate: every claim points at an artifact. It fails on missing trust boundaries when a reviewer can ask 'where does untrusted input enter' and get silence, so the fix is B1 through B4 on both diagrams with named validators. And it fails on ADRs that describe without justifying, so the fix is a rejected-alternatives block in every ADR. Remember the Expo is a defense, not a demo: every claim you make gets 'show me', and the package is what lets you answer without hesitating.",
        "bullets": [
          "Fail 1 - slides not evidence: fix = every claim traces to a committed file (the package gate)",
          "Fail 2 - missing trust boundaries: fix = B1-B4 on both diagrams, each with a named validator",
          "Fail 3 - ADRs that describe, not justify: fix = a rejected-alternatives block in every ADR",
          "Trivia answer: reliability + governance are their own LAYERS (Observability + Governance), not afterthoughts",
          "The Expo is a defense: problem, architecture, evidence for every claim, roadmap from your top-3 gaps"
        ],
        "script": "Close the week: 'You started this course able to build a system. You end it able to draw it, defend every decision in it, and score exactly how far it is from production. That is the Architect job. Your package IS the credential. Commit it. See you at the Expo.'"
      }
    ]
  },
  "12": {
    "monday": [
      {
        "segment": "business-problem",
        "eyebrow": "🎯 The stakes",
        "title": "You have six working parts. The panel wants one system.",
        "body": "Over twelve weeks you built six threads separately — foundation, team, integration, reliability, governance, and architecture — each proven in isolation. The capstone is not a seventh thing to build; it is the act of wiring those six into one system that runs end to end. The hard part is the seams: the API call the MCP server makes, the retry that wraps it, the policy that gates it, the log that traces it. 'It worked in pieces' is the single most common capstone failure, and the Architect Expo panel exists to find exactly that gap.",
        "bullets": [
          "The six threads: foundation, team, integration, reliability, governance, architecture",
          "The seams between components are the deliverable, not the components",
          "You are graded on integration, not on how many features you have"
        ],
        "script": "Open by naming all six threads on the board and asking: which two of yours are actually wired together, and which two only met in a slide? That discomfort is the class."
      },
      {
        "segment": "business-problem",
        "eyebrow": "💼 Why it matters",
        "title": "The capstone is the asset you show a buyer, not a grade you collect.",
        "body": "Executives do not buy a tools tour; they buy an outcome tied to a problem. Your capstone has to answer one executive question — what business problem does this system solve, and what does solving it produce. Frame the whole thing around one real workflow (the same Business Workflow Assistant you started in Intensive 1, now grown into a governed system) so the throughline stays a business outcome, not a feature list. The graduation artifact is a set: the CCA-F certification, the architecture package, and the recorded Expo talk — and all three point back to that one business problem.",
        "bullets": [
          "Problem then outcome first; architecture is the proof, not the pitch",
          "One real workflow grown up, not a zoo of disconnected demos",
          "Graduation artifact = certification + architecture package + recorded Expo talk"
        ],
        "script": "Have each student say their capstone's business problem in one sentence out loud. If it takes more than one breath, it is too wide for a five-minute Expo."
      },
      {
        "segment": "business-problem",
        "eyebrow": "🚪 Two gates this week",
        "title": "Thursday you defend a system and you sit an exam.",
        "body": "Week 12 has an internal gate and an external gate, and Monday's job is to close both. The internal gate is the Architect Expo — a demo plus a defense, where you justify your highest-stakes architecture decisions and cite evidence for every claim. The external gate is the Claude Certified Architect — Foundations (CCA-F) exam, an independent credential across five domains. Freezing a system worth defending and closing the last CCA-F prep gaps are two different kinds of work, and both start today, not Thursday morning.",
        "bullets": [
          "Internal gate = the Expo: demo + defense in front of a panel",
          "External gate = CCA-F: an independent, five-domain credential",
          "Monday = prep both; leaving CCA-F to the last day is a named risk"
        ],
        "script": "Draw two doors on the board. Tell them the demo gets them to the first door; only the defense gets them through it. The exam is a separate door with its own key."
      },
      {
        "segment": "architecture",
        "eyebrow": "🏛️ Architecture story",
        "title": "The integration map: six threads, one runnable system.",
        "body": "Your capstone is the composition of everything you built. Foundation gives the workspace and the workflow spine; team gives the multi-agent division of labor; integration (MCP) connects to real systems; reliability wraps every risky call; governance gates every action; architecture organizes it into layers while observability makes it traceable. The single test of integration is one command that runs the whole thing end to end. If you cannot produce that command, you have parts, not a system — and that is the first thing to fix today.",
        "bullets": [
          "Foundation (wk1-3) → the workflow spine",
          "Team (wk4, wk7) → coordinator + subagents",
          "Integration (wk5-6) → the MCP server",
          "Reliability (wk9) + Governance (wk10) → cross-cutting layers",
          "Architecture + Observability (wk11) → 7 layers + correlation IDs"
        ],
        "code": {
          "label": "Integrate (Claude Code)",
          "code": "Wire my Intensive 1-4 components into one runnable capstone and produce a single command that runs it end to end. Map each component to a layer, list every seam between components, and flag any component that is not yet actually wired to another."
        },
        "script": "Run this prompt live against a student repo. The flagged, not-yet-wired components are the honest state of the capstone. Do not let them argue with the list; let them fix it."
      },
      {
        "segment": "architecture",
        "eyebrow": "🧱 Threads 1 and 2",
        "title": "Foundation is the spine; the team runs inside it.",
        "body": "Intensive 1 gave you a Claude Code workspace governed by CLAUDE.md and a Business Workflow Assistant that automates one real workflow end to end — that is the spine of the capstone. Intensive 2 and Week 7 gave you the team: a coordinator that delegates to read-only explorers, reviewers, and editors that return structured summaries. In the capstone, the workflow spine is what the multi-agent team operates on — the coordinator plans, subagents do isolated work, and the spine executes deterministically. CLAUDE.md is the persistent contract that keeps every agent inside the same standards, so the team scales without drifting.",
        "bullets": [
          "CLAUDE.md = persistent standards every agent inherits",
          "Business Workflow Assistant = the deterministic spine",
          "Coordinator → explorer (read-only) / reviewer / editor",
          "Subagents return structured summaries, not raw context"
        ],
        "script": "Point out that the spine is deterministic and the agents are probabilistic. That split — reason with agents, execute with deterministic code — is the whole architecture philosophy in one sentence."
      },
      {
        "segment": "architecture",
        "eyebrow": "🔌 Thread 3",
        "title": "MCP is the connective tissue to the real world.",
        "body": "A capstone that only talks to itself is a toy. The MCP server you built in Weeks 5-6 is how the system reaches real business systems — exposing tools (actions), resources (context), and prompts (templates). Production-shaped means it also handles sampling, progress and log notifications, roots that limit file access, and a real transport (STDIO or StreamableHTTP). In the capstone, the MCP server is the boundary where your governed, reliable agent logic meets the systems of record — and every crossing of that boundary is a seam you must be able to trace and defend.",
        "bullets": [
          "Tools = actions, Resources = context, Prompts = templates",
          "Production-shaped: sampling, notifications, roots, transport",
          "The MCP boundary is a seam — trace it, defend it"
        ],
        "script": "Ask: when your agent reads a customer record, does it go through the MCP server or a hard-coded call you snuck in during week 3? The honest answer tells you whether integration is real."
      },
      {
        "segment": "architecture",
        "eyebrow": "🛡️ Threads 4 and 5",
        "title": "Reliability and governance are layers, not features.",
        "body": "The most common architecture-defense failure is treating reliability and governance as things you bolt on at the end. In the capstone they are cross-cutting: every outbound call is wrapped by an explicit timeout, capped retry with backoff, and a circuit breaker with a fallback or dead-letter path; every replayable side effect carries an idempotency key; every generated output passes a quality gate, which is an eval. And every action the agent wants to take is gated by an ABAC policy evaluated on user, resource, action, context, and risk. When a panelist asks what happens when this fails or when someone unauthorized calls it, these layers are your answer.",
        "bullets": [
          "timeout → capped retry + backoff → circuit breaker → fallback / dead-letter",
          "idempotency key = same input, same end state, safe replay",
          "eval = the quality gate on every generated output",
          "ABAC = allow/deny on user · resource · action · context · risk"
        ],
        "code": {
          "label": "Reliability envelope (per external call)",
          "code": "call(fetchInvoice, { timeoutMs: 10000, retries: 3, backoff: \"exponential\", breaker: \"open-after-5\", onOpen: deadLetter, idempotencyKey: invoiceId })"
        },
        "script": "Read the envelope aloud and ask which line they would remove to save time. Whichever they pick is the failure a panelist will engineer live on Thursday. None of them is optional."
      },
      {
        "segment": "architecture",
        "eyebrow": "🗂️ Thread 6",
        "title": "Seven layers make it explainable; correlation IDs make it traceable.",
        "body": "Week 11 organized the whole thing into seven layers — Storage, Data Fabric, Semantic, Intelligence, Governance, Observability, Orchestration — so you can point at any capability and say which layer owns it. Reliability and governance are the Governance and Observability layers here, not add-ons stapled on the side. Observability is what turns 'trust me' into 'here is the evidence': a correlation ID generated at every entry point flows through every log line, downstream call, and database write, so any outcome traces back to its cause. The architecture package is this picture, written down and defensible.",
        "bullets": [
          "7 layers: Storage → Data Fabric → Semantic → Intelligence → Governance → Observability → Orchestration",
          "Reliability (wk9) and governance (wk10) ARE layers, not features",
          "One correlation ID = one thread from symptom back to root cause",
          "Architecture package = the layered picture, written and defensible"
        ],
        "script": "Have them name which of the seven layers their capstone is weakest at. Most will say Semantic or Data Fabric. That weak layer is exactly where the defense should preempt the panel with an honest limitation."
      },
      {
        "segment": "deconstruct",
        "eyebrow": "🔍 Deconstruct",
        "title": "Two demos. Same feature. Only one earns the credential.",
        "body": "Watch two versions of the same capstone demo. Demo A: the presenter clicks through a happy path, says 'and it works,' and moves on. Demo B: the presenter makes the same claim and immediately backs it — this call has a ten-second timeout and three capped retries; here is the log with the correlation ID; here is the eval score on forty cases; here is the ABAC policy that blocked the unauthorized attempt. A is a demo. B is a defense. The panel grades B, and so does a buyer.",
        "bullets": [
          "Demo A = a claim with no artifact behind it",
          "Demo B = the same claim + evidence for every part of it",
          "The defense is the point; the demo is just its setup"
        ],
        "script": "Show both mentally, or role-play them. After A, ask 'do you believe it works?' After B, ask again. The room feels the difference before you explain it."
      },
      {
        "segment": "deconstruct",
        "eyebrow": "🧾 The evidence standard",
        "title": "Every claim needs an artifact behind it.",
        "body": "A defense is a claim-to-evidence mapping, and it is stricter than it sounds. 'It is reliable' maps to the retry and circuit-breaker config plus a chaos test that trips it. 'It is governed' maps to the ABAC policy and a denied-action log line. 'It is correct' maps to the eval dataset, the grader, and the pass rate. 'It is traceable' maps to one correlation ID followed from request to database write. If a claim has no artifact, cut the claim — an unbacked claim is precisely where the panel pushes and the defense collapses.",
        "bullets": [
          "reliable → retry/breaker config + a chaos test that trips it",
          "governed → the ABAC policy + a denial log line",
          "correct → the eval dataset + grader + pass rate",
          "traceable → one correlation ID, request to write",
          "no artifact → cut the claim"
        ],
        "script": "Make each student write three claims they plan to make, then name the artifact for each. Any claim with a blank artifact column gets struck through in front of them."
      },
      {
        "segment": "deconstruct",
        "eyebrow": "⚠️ The trap",
        "title": "A demo without a defense hides the integration gap.",
        "body": "The reason the Expo grades the defense and not the demo is that a polished happy-path demo can hide an unintegrated system. When you are forced to trace a real request through every seam — API to MCP to reliability wrapper to governance gate to log — you cannot fake integration. That is also why Monday's job is to freeze and run end to end today, not Thursday morning: the defense is only as strong as the seams you have actually tested. Rehearse the defense against a skeptic before the panel does it for you.",
        "bullets": [
          "A happy-path demo can hide a system that is not wired together",
          "Forcing a full trace is proof of integration you cannot fake",
          "Freeze and run today; rehearse the defense against a skeptic"
        ],
        "code": {
          "label": "Dry-run the defense (Claude Code)",
          "code": "Play a skeptical panelist: ask me to justify my three highest-stakes architecture decisions and probe for the weakest one. When I hand-wave, push harder and ask for the artifact behind the claim."
        },
        "script": "Run this prompt on a volunteer live. Let Claude corner them. The whole room learns where their own defense is soft by watching one person's get probed."
      },
      {
        "segment": "micro-build",
        "eyebrow": "🛠️ Micro-build 1",
        "title": "Produce the one command that runs everything.",
        "body": "The first build step is the integration test itself: get to a single command that runs the capstone end to end. Use Claude Code to map each Intensive 1-4 component to a layer, list the seams, and flag anything not yet wired — then fix the flagged seams one at a time. You are done with this step when one command starts the workflow, the agent team executes, the MCP server touches the real system, reliability wraps the calls, governance gates the actions, and observability logs the whole path. No hand-holding, no manual step in the middle.",
        "bullets": [
          "One command, zero manual steps in the middle",
          "Fix flagged seams one at a time, not all at once",
          "The run must visibly exercise all six threads"
        ],
        "code": {
          "label": "Run end to end",
          "code": "npm run capstone -- --governance on --observability on --correlation-id \"$(uuidgen)\""
        },
        "script": "Everyone runs their command now, in the room. Whoever needs a manual step in the middle does not have a system yet — that is their next 30 minutes, not Thursday's problem."
      },
      {
        "segment": "micro-build",
        "eyebrow": "🔦 Micro-build 2",
        "title": "Freeze with the lights on, not off.",
        "body": "A capstone that only runs with governance and observability disabled is not the system you are defending. Flip both on and run again: confirm the ABAC policy actually evaluates — and denies at least one action you expect it to deny — and confirm every step emits a structured log line carrying the same correlation ID. If turning governance on breaks the run, that break is real and the panel would find it, so fix it now. The frozen capstone is defined as an end-to-end run with governance and observability ON.",
        "bullets": [
          "governance ON = at least one real, expected denial",
          "observability ON = one correlation ID across every log line",
          "If it only runs with the lights off, it was never done"
        ],
        "code": {
          "label": "Verify the trace",
          "code": "export CID=<the id you passed above>; cat logs/capstone.jsonl | jq -c 'select(.correlation_id==env.CID) | [.event,.service,.outcome]'"
        },
        "script": "Have them read their own trace out loud. If they cannot find a single denial or a single correlation ID that spans the whole run, the lights were not actually on."
      },
      {
        "segment": "micro-build",
        "eyebrow": "🧊 Micro-build 3",
        "title": "Tag the freeze so the demo is reproducible.",
        "body": "Once the end-to-end run is green with the lights on, freeze it. Tag the commit so the exact system you demo at the Expo is the exact system in the repo — no live edits during the show. A frozen build is a reliability decision: you are removing the single biggest source of live-demo failure, which is a change you made an hour before. Record the run once now as a fallback, so if a seam fails live you can recover on camera and still show the green path.",
        "bullets": [
          "git tag the exact commit you will demo",
          "Demo == repo: no live edits during the Expo",
          "Record one green run now as your on-camera fallback"
        ],
        "code": {
          "label": "Freeze",
          "code": "git tag -a expo-freeze -m \"Capstone frozen for Architect Expo\" && git push origin expo-freeze"
        },
        "script": "Tell them the story of every demo that died: someone touched the code an hour before to make it 'a little better.' The tag is how you make that impossible."
      },
      {
        "segment": "micro-build",
        "eyebrow": "🎤 Micro-build 4",
        "title": "One sentence: the problem and the outcome.",
        "body": "The Expo talk leads with problem then outcome, not the tech stack — executives buy the outcome and the architecture is the proof it will hold. Before you script anything, write the single throughline sentence: for a given audience, a given problem costs a given amount, and this system does a given thing so that a given outcome follows. Everything else in the talk — architecture, demo, evidence, roadmap — exists to back that one sentence. If the throughline needs the word 'and' twice, the scope is too wide for a five-minute Expo.",
        "bullets": [
          "Template: for X, problem Y costs Z; this system does A so that outcome B",
          "Lead with the outcome, never the stack or a tools tour",
          "One problem, one outcome — cut a second 'and'"
        ],
        "code": {
          "label": "Expo cut (Claude Code)",
          "code": "From my capstone, draft an Expo script: problem, architecture, live demo beats, evidence, and one honest limitation. Keep it to five minutes and make the first sentence a problem-then-outcome throughline."
        },
        "script": "Each student reads their throughline sentence aloud. The room votes: does it lead with the outcome or the tech? Rewrite on the spot if it leads with tech."
      },
      {
        "segment": "micro-build",
        "eyebrow": "📚 Micro-build 5",
        "title": "Quiz yourself across all five CCA-F domains today.",
        "body": "Do not leave CCA-F prep to Thursday morning — that is a named risk for exactly this week. The Foundations exam covers five domains: Agentic Workflows, MCP, Claude Code Configuration, Prompt Engineering, and Reliability and Governance. You built every one of these over twelve weeks, so prep is gap-closing, not new learning. Have Claude quiz you across all five, note your two weakest, and re-read those against the official exam guide tonight — walk into Thursday having already found your weak domain instead of discovering it in the exam.",
        "bullets": [
          "Five domains: Agentic Workflows, MCP, Claude Code Config, Prompt Engineering, Reliability & Governance",
          "Prep is gap-closing, not cramming — you already built all five",
          "Find your two weakest domains today; re-read the official exam guide"
        ],
        "code": {
          "label": "CCA-F self-quiz (Claude Code)",
          "code": "Quiz me with 15 scenario questions spread across the five CCA-F domains: Agentic Workflows, MCP, Claude Code Configuration, Prompt Engineering, and Reliability and Governance. After each answer tell me which domain it tested and score it. End by naming my two weakest domains."
        },
        "script": "Everyone runs the self-quiz before they leave. Have them write their two weakest domains on a sticky and take it home. That sticky is tonight's homework, not the whole exam."
      }
    ],
    "thursday": [
      {
        "segment": "build-map",
        "eyebrow": "🗺️ Build map",
        "title": "The Expo run of show: four checkpoints.",
        "body": "Today is the Architect Expo. The run of show is four checkpoints, each a gate you do not pass until the prior one is green. CP0: confirm the integrated capstone. CP1: do the frozen end-to-end run with governance and observability on. CP2: deliver the recorded talk — problem, architecture, demo, evidence, roadmap. CP3: sit the CCA-F and submit the architecture package. Nothing here is new; you are executing a rehearsed sequence, and the calm of a rehearsed sequence is itself part of the defense.",
        "bullets": [
          "CP0 Integrated — all threads wired into one capstone",
          "CP1 Frozen run — end to end, governance + observability on",
          "CP2 Presented — recorded talk, five beats",
          "CP3 Certified — CCA-F attempt + submitted architecture package"
        ],
        "script": "Put the four checkpoints on the board and check them off as the room clears each one together. Treat it as a launch sequence, not a class."
      },
      {
        "segment": "build-map",
        "eyebrow": "⏱️ Timing",
        "title": "Two hours: present, defend, certify.",
        "body": "Budget the block so the exam is not rushed. Roughly: a short frozen-run confirmation, then presentations with live defense Q&A, then a protected window to sit the CCA-F. Record every presentation — the recording is a portfolio deliverable and your proof of the defense. Keep the architecture package open in a tab during your talk; it is what you point to the moment a panelist asks for evidence. The defense Q&A is the graded part, so protect time for it over slide polish.",
        "bullets": [
          "Confirm the frozen run → present + defend → sit the CCA-F",
          "Record every talk; the recording is a graded deliverable",
          "Keep the architecture package open — it is your evidence tab",
          "Protect Q&A time over slide polish"
        ],
        "script": "Set a visible timer. When someone over-polishes slides, remind them the panel grades the defense, and the defense lives in the package tab, not the deck."
      },
      {
        "segment": "guided-build",
        "eyebrow": "1️⃣ Beat: Problem",
        "title": "Open on the problem and the outcome — sixty seconds.",
        "body": "Lead with the throughline you wrote Monday. State who has the problem, what it costs them, and the outcome your system produces — no architecture yet. This is where you earn the room: an executive decides in the first minute whether this is worth their attention. Do not apologize for anything unfinished and do not open with a tools tour. Problem, cost, outcome, then move to the architecture.",
        "bullets": [
          "Who has the problem + what it costs + the outcome you produce",
          "No stack, no tools tour, no apology for what is unfinished",
          "Sixty seconds, then transition to architecture"
        ],
        "script": "Time the opening with a stopwatch. If a student names a tool before naming the outcome, stop them and make them restart. The reset is the lesson."
      },
      {
        "segment": "guided-build",
        "eyebrow": "2️⃣ Beat: Architecture",
        "title": "Show the seven layers, name the seams.",
        "body": "Now show the architecture — the seven-layer picture from your package. Walk it top to bottom fast, then spend your time on the two or three seams that actually matter: where the agent team meets the MCP server, where reliability wraps the external call, where governance gates the action. Frame each one as a decision — I chose X over Y because — because those are exactly what the defense will probe. The architecture beat is not a diagram tour; it is a preview of the decisions you are about to defend.",
        "bullets": [
          "Seven layers fast, then two or three seams slow",
          "Frame each seam as a decision: X over Y, because",
          "This beat sets up the questions you want the panel to ask"
        ],
        "script": "Coach them to slow down at the seams and speed up on the layers. Watching where a presenter lingers tells the panel where the real engineering is."
      },
      {
        "segment": "guided-build",
        "eyebrow": "3️⃣ Beat: Demo",
        "title": "Run the frozen build end to end, lights on.",
        "body": "Trigger the one command and let the capstone run end to end with governance and observability on. Narrate the path as it executes: the workflow starts, the agent team divides the work, the MCP server touches the real system, a reliability wrapper handles a call, the governance gate allows or denies, and the logs stream with one correlation ID. This is the frozen build from Monday, not a live edit. The demo's job is not to look pretty; it is to make the architecture visible in motion.",
        "bullets": [
          "One command, no live edits — this is the tagged freeze",
          "Narrate each seam as it fires so the architecture is visible",
          "Governance and observability are visibly ON"
        ],
        "code": {
          "label": "The demo command",
          "code": "npm run capstone -- --governance on --observability on --correlation-id \"$(uuidgen)\"  # running at tag expo-freeze"
        },
        "script": "Make them narrate the seams out loud as the log streams. A silent demo where the presenter just watches the screen is a demo; a narrated one is the start of a defense."
      },
      {
        "segment": "guided-build",
        "eyebrow": "4️⃣ Beat: Evidence",
        "title": "Back every claim with an artifact.",
        "body": "This is the beat that separates a demo from a defense. For each claim you made, show the artifact: the eval dataset and pass rate for 'correct,' the retry and circuit-breaker config plus a chaos test for 'reliable,' the ABAC policy and a denial log for 'governed,' one correlation ID traced end to end for 'traceable.' Pull these straight from your architecture package so each is one click away. Evidence is what turns skepticism into trust, and trust is precisely what the credential certifies.",
        "bullets": [
          "correct → eval dataset + pass rate",
          "reliable → retry/breaker config + a chaos test",
          "governed → ABAC policy + a denial log line",
          "traceable → one correlation ID, end to end"
        ],
        "code": {
          "label": "Evidence: trace one request",
          "code": "cat logs/capstone.jsonl | jq -c 'select(.correlation_id==env.CID) | {event,service,outcome,duration_ms}'"
        },
        "script": "When a presenter claims something, hold up a hand and say 'artifact?' If they cannot produce it in one click from the package, that claim was a liability, not an asset."
      },
      {
        "segment": "guided-build",
        "eyebrow": "5️⃣ Beat: Roadmap + defend",
        "title": "Close on the roadmap, then defend on the record.",
        "body": "End the talk with the roadmap: what you would build next, what you would harden, and one honest limitation you already know about. Naming a limitation yourself is a strength — it shows you can see your own system clearly and it takes the panel's easiest attack off the table. Then open the defense: the panel probes your highest-stakes decisions and hunts for the weakest one. Answer with the decision, the alternative you rejected, and the evidence — the same claim-to-artifact discipline from the evidence beat, now under pressure.",
        "bullets": [
          "Roadmap = what is next + what to harden + one honest limitation",
          "Name your own weakest point before the panel does",
          "Defend with: the decision + the rejected alternative + the evidence"
        ],
        "code": {
          "label": "Final defense rehearsal (Claude Code)",
          "code": "Play three panelists: a security lead, a reliability engineer, and a CFO. Each asks one hard question about my capstone, then follows up on my weakest answer. Do not go easy, and do not accept a claim without an artifact."
        },
        "script": "Run the three-panelist rehearsal on the first presenter before the real panel. The security lead, reliability engineer, and CFO each attack a different layer — students see the defense is a full-surface exercise, not a Q&A."
      },
      {
        "segment": "guided-build",
        "eyebrow": "🎓 The exam",
        "title": "Sit the CCA-F: five domains you already built.",
        "body": "With the Expo done, sit the Claude Certified Architect — Foundations exam. The five domains map directly onto your twelve weeks: Agentic Workflows (the agentic loop and subagents), MCP (your server — tools, resources, prompts, transport), Claude Code Configuration (CLAUDE.md, skills, hooks, permissions), Prompt Engineering (your versioned, eval-tested Prompt Library), and Reliability and Governance (timeouts, retries, circuit breakers, idempotency, ABAC, observability). Read each question as 'which of my capstone's parts does this describe.' This is an open-book review of work you have already shipped.",
        "bullets": [
          "Agentic Workflows = the agentic loop + subagents (wk1, wk7)",
          "MCP = your production-shaped server (wk5-6)",
          "Claude Code Config = CLAUDE.md, skills, hooks, permissions (wk1-2, wk8)",
          "Prompt Engineering = your versioned Prompt Library (wk4)",
          "Reliability & Governance = wk9 + wk10"
        ],
        "code": {
          "label": "Last-mile domain check (Claude Code)",
          "code": "For each of the five CCA-F domains, give me the one concept students most often miss and a one-line way to remember it. Then ask me the single hardest question in my two weakest domains."
        },
        "script": "Before the timer starts, have each student map one capstone artifact to each of the five domains out loud. Once they see the exam is a mirror of their own build, the nerves drop."
      },
      {
        "segment": "guided-build",
        "eyebrow": "📦 Certify",
        "title": "Submit the architecture package. You are an architect now.",
        "body": "The final gate is CP3: your CCA-F attempt plus a submitted architecture package. The package is the written form of your defense — the seven-layer picture, the key decisions with their rejected alternatives, and the evidence behind each trust claim. The graduation artifact is the whole set: the certification, the architecture package, and the recorded Expo talk. Together they are the proof you carry to a buyer — not 'I took a course,' but 'here is a governed, observable AI system I built and defended in twelve weeks.'",
        "bullets": [
          "Submit: CCA-F attempt + the final architecture package",
          "Graduation artifact = certification + package + recorded talk",
          "This is a portfolio asset a buyer can inspect, not a certificate to frame"
        ],
        "script": "Close the loop: the same six threads from Monday are now one submitted system with a credential attached. Name each student's business problem back to them and note it is now solved and defended."
      },
      {
        "segment": "failure",
        "eyebrow": "💥 Failure injection",
        "title": "A seam fails mid-demo. Do not hide it.",
        "body": "This is the highest-retention moment of the Expo and it is on purpose: during the live run, one integration seam fails — the MCP call times out, the governance gate denies something you expected to pass, or a downstream service returns the wrong shape. This is the classic 'it worked in pieces' moment, live and on camera. The instinct is to hide it, click away, or blame the network. The architect move is the opposite: name it, freeze on it, and diagnose it in front of the panel, because a recovery on camera makes the defense stronger, not weaker.",
        "bullets": [
          "The seam fails: a timeout, an unexpected denial, or a wrong-shape response",
          "Do not hide it, click away, or blame the network",
          "Name it, freeze on it, and diagnose it live"
        ],
        "script": "Do not hide the error. This controlled failure is the highest-retention moment of the show. Tell the presenter to say the words out loud: 'there is the failure, let me trace it.'"
      },
      {
        "segment": "failure",
        "eyebrow": "🔧 Recover on camera",
        "title": "Trace the correlation ID; let the reliability layer do its job.",
        "body": "Recovery is a procedure, not a scramble. Grab the correlation ID from the failing request and follow it through the logs to the exact seam that broke — this is what observability was built for. Then show the reliability layer responding: the timeout fired, the retry backed off, the circuit breaker opened, the fallback or dead-letter caught it. You are not fixing code live; you are demonstrating that the system was designed to fail safely. Then fall back to the recorded green run so the panel still sees the happy path end to end.",
        "bullets": [
          "Correlation ID → the exact seam that broke",
          "Show timeout / retry / breaker / fallback doing their jobs",
          "You are not editing code — you are proving failure-safe design",
          "Fall back to the recorded green run to finish the story"
        ],
        "code": {
          "label": "Diagnose the seam",
          "code": "cat logs/capstone.jsonl | jq -c 'select(.correlation_id==env.CID and .outcome==\"failure\") | [.service,.error_class,.event]'"
        },
        "script": "Narrate the diagnosis step by step. This is where they learn architecture thinking, not just syntax. The recorded fallback run is the safety net that lets them stay calm while they trace."
      },
      {
        "segment": "failure",
        "eyebrow": "🏅 The lesson",
        "title": "Recovering on camera is the defense that cannot be faked.",
        "body": "A demo that never fails proves the happy path works; a recovery proves the whole failure-first architecture works. When you diagnose a live seam with a correlation ID and show the reliability layer containing it, you have demonstrated observability, reliability, and governance all at once — under pressure and unrehearsed. That is worth more to the panel than a flawless click-through, because it is the one thing they cannot fake and cannot script. This is the difference between someone who built an AI feature and someone who architected an AI system.",
        "bullets": [
          "A no-fail demo proves only the happy path",
          "A live recovery proves the entire failure-first architecture at once",
          "Unfakeable and unscripted = the highest-trust moment of the Expo",
          "Feature-builder vs system-architect — the recovery is the line between them"
        ],
        "script": "End on this: the students who recover on camera are the ones who leave as architects. Point back to Week 9 — failure-first design was always the point; the Expo is where it pays off."
      }
    ]
  }
};
