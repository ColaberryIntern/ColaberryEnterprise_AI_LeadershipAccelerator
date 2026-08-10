/**
 * week2.ts — the complete authored content pack for WEEK 2,
 * "Agent Skills (build 3 skills)" (Intensive 1 · Build Your AI Foundation).
 *
 * Arc position. Week 2 is the second beat of Act I ("Hands"). Week 1 crossed the
 * student from user to builder; Week 2 is where the thing they can direct stops
 * being a thing only they can direct. It also introduces the arc's recurring
 * "person who isn't there" device — the analyst who is out today, so a check
 * nobody else knows how to run does not get run — which weeks 4, 6, 8 and 10 all
 * call back to. Week 3 then takes what they taught it once and runs it unattended.
 *
 * Provenance. This pack CARRIES FORWARD the Week 2 content that has already been
 * taught to a live cohort: both days' teach slides (14 Monday, 15 Thursday), the
 * Monday cold-open hook, four Monday story beats, two Thursday story beats, and
 * eight of the sixteen survey questions. That content is deliberate and proven —
 * it is reproduced here essentially verbatim, not rewritten. What this file ADDS
 * is the layer Weeks 4-12 have and Week 2 did not: a mermaid diagram on every
 * Monday teach slide, a read-along SKILL.md on each day, more participation, two
 * Build Day story beats, and the before/after payoff.
 *
 * Deliberate corrections preserved from the current Week 2 (do not regress them):
 *   • allowed-tools PRE-APPROVES named tools for the invocation turn. It does not
 *     permanently restrict — disallowed-tools and permission deny rules do that.
 *   • Every file-creating slide names the exact project-relative path, and nothing
 *     is ever written to a Downloads folder. Everything stays inside the project.
 *   • Model IDs are current: claude-opus-5 / claude-sonnet-5 / claude-haiku-4-5,
 *     with output_config for effort. The deprecated top-level output_format
 *     parameter appears nowhere.
 *
 * Authoring standard (matches week4.ts and classTeachWeek3*.ts):
 *   • EVERY teach slide carries a mermaid diagram, <=7 short-labelled nodes with
 *     <br/> line breaks, because the instructor click-zooms it to full screen.
 *   • Code blocks are Claude Code PROMPTS the student directs with ('paste'), or
 *     artifacts the room reads together ('review'). Shell commands declare a
 *     terminal paste target, never Claude Code.
 *   • Story beats are stories — a named person, a specific moment, a real stake.
 */
import type { WeekPack } from '../weekPack';

export const WEEK2_PACK: WeekPack = {
  week: 2,
  arcBeat: 'You teach it once, and it never forgets — knowledge stops living in one head.',

  /* ====================================================================== */
  /*  MONDAY — Architecture Day                                             */
  /* ====================================================================== */
  monday: {
    hook: {
      headline: 'The ETL job says SUCCESS. The revenue number is wrong.',
      caption: 'A green pipeline proves the job ran. It never proved the data was trustworthy.',
    },

    teach: [
      {
        segment: 'business-problem', eyebrow: '📁 Where Agent Skill Files Live', title: 'Every file tonight stays inside your current project — nothing leaves it',
        body: 'Before we build, know exactly where things land. Project Skills live at .claude/skills/<skill-name>/SKILL.md, with supporting files in references/, templates/, and scripts/ subfolders. Tonight’s lab inputs and outputs — the sample orders, the quality contract, every report — live in skill-lab/. After every build, Claude reports the exact project-relative path of every file it created so you can open it directly in the VS Code Explorer. No Downloads folder, no exports — everything stays in the project.',
        bullets: [
          'Skill: .claude/skills/<skill-name>/SKILL.md',
          'Supporting files: .claude/skills/<skill-name>/references|templates|scripts/',
          'Lab inputs and outputs: skill-lab/',
          'Claude reports every path — you never guess where a file went',
        ],
        diagram: `flowchart TD
  P["📁 Your project folder"] --> S["🧩 .claude/skills/NAME/<br/>SKILL.md"]
  P --> L["🧪 skill-lab/<br/>inputs + outputs"]
  S --> R["📣 Claude reports the exact<br/>project-relative path"]
  L --> R
  R --> V["👀 You open it in the<br/>VS Code Explorer"]`,
        script: 'Say it plainly: nothing tonight leaves this project. Every file has a project-relative path, and Claude will tell you exactly what it is after every build.',
      },
      {
        segment: 'business-problem', eyebrow: '🛠️ Build data-quality-gate', title: 'First Skill: block bad data before it reaches the dashboard',
        body: 'We build the Skill that would have caught this morning’s incident. It reads a dataset and a quality contract, checks schema, freshness, uniqueness, required fields, and numeric rules, and returns PASS, WARN, or FAIL with a PUBLISH or BLOCK recommendation. It never modifies the source data. First it checks whether .claude/skills/ already exists in this project and creates it if not — that check itself is part of the prompt, not assumed.',
        bullets: [
          'WHERE THESE FILES WILL BE STORED',
          '.claude/skills/data-quality-gate/SKILL.md',
          'skill-lab/orders.csv',
          'skill-lab/quality-contract.md',
        ],
        code: {
          kind: 'paste',
          label: 'Claude Code prompt — build data-quality-gate',
          pasteWhere: 'Claude Code',
          code: 'We are completing a guided Agent Skills lab inside my Week 1 workspace.\n\nFIRST: WORKSPACE AND SKILLS DIRECTORY CHECK\n1. Read CLAUDE.md and follow all project rules.\n2. Check whether the project directory .claude/skills/ exists.\n3. If .claude/skills/ does not exist, create it before doing anything else.\n4. Record whether the directory already existed or was created.\n5. If a CLAUDE.md rule conflicts with this request, stop and explain.\n\nCREATE THESE FILES\n1. .claude/skills/data-quality-gate/SKILL.md\n2. skill-lab/orders.csv\n3. skill-lab/quality-contract.md\n\nSKILL REQUIREMENTS\nName: data-quality-gate\nDescription: Use when the user asks to validate a dataset, CSV, ETL output, query result, or dashboard source before publication. Checks the data against a quality contract and returns PASS, WARN, or FAIL with evidence and a PUBLISH or BLOCK recommendation.\n\nThe instruction body must:\n- Require a dataset path.\n- Use a supplied quality contract when available.\n- Check schema, freshness, expected volume, key uniqueness, duplicates, required fields, nulls, and numeric rules.\n- Return a table with Check, Evidence, Status, and Recommended Action.\n- Finish with PASS, WARN, or FAIL.\n- Finish with a PUBLISH or BLOCK recommendation.\n- Never modify the source data.\n- Remain concise and procedural.\n- Not include allowed-tools yet.\n\nSAMPLE DATA\nCreate approximately 12 believable order records in skill-lab/orders.csv. Deliberately include: one duplicate order ID, one missing region, one negative revenue value, one load timestamp older than 48 hours.\n\nQUALITY CONTRACT\nCreate skill-lab/quality-contract.md with: order_id must be unique; region is required; revenue must be greater than zero; load_timestamp must be less than 24 hours old; expected row count is at least 10.\n\nDo not commit anything and do not run the Skill yet.\n\nWHEN FINISHED, REPORT:\n1. Whether .claude/skills/ already existed or was created\n2. Every file created\n3. The exact project-relative path of every file\n4. A one-line explanation of what each file contains\n5. The final Skill description\n6. Whether Claude Code should be restarted because the top-level Skills directory was created after the current session started',
        },
        diagram: `flowchart LR
  D["📄 skill-lab/orders.csv"] --> G["🛡️ data-quality-gate"]
  C["📜 quality-contract.md"] --> G
  G --> K["🔎 Schema · freshness · uniqueness<br/>· required fields · numeric rules"]
  K --> R["🚦 PASS / WARN / FAIL"]
  R --> A["✅ PUBLISH or 🛑 BLOCK"]
  G -.->|"never"| X["🚫 Source data<br/>untouched"]`,
        script: 'Paste this on screen exactly as written. Watch the pulse rail — nobody moves on until .claude/skills/ exists and all three files are reported back with their exact paths.',
      },
      {
        segment: 'business-problem', eyebrow: '🧪 Test Automatic Invocation', title: 'Separate slide, separate action: prove it fires without naming it',
        body: 'Never combine building a Skill with testing it on the same prompt. Now, in a fresh ask, validate the sample orders against the quality contract WITHOUT naming the Skill — Claude should invoke data-quality-gate on its own because the description matched. Expect FAIL and BLOCK: duplicate order, missing region, negative revenue, and stale data are all deliberately present.',
        bullets: [
          'WHERE THE RESULT WILL BE STORED',
          'skill-lab/data-quality-report.md',
          'Expected: automatic invocation, FAIL, BLOCK',
        ],
        code: {
          kind: 'paste',
          label: 'Claude Code prompt — test automatic invocation',
          pasteWhere: 'Claude Code',
          code: 'Before this data feeds the executive revenue dashboard, validate:\nskill-lab/orders.csv\nagainst:\nskill-lab/quality-contract.md\n\nTell me whether I should PUBLISH or BLOCK the dataset.\n\nSave the completed report to:\nskill-lab/data-quality-report.md\n\nDo not modify orders.csv.\n\nWHEN FINISHED, REPORT:\n1. Whether data-quality-gate was invoked automatically\n2. Every issue found\n3. The final PASS, WARN, or FAIL result\n4. The PUBLISH or BLOCK recommendation\n5. The exact path of the saved report',
        },
        diagram: `flowchart LR
  A["🗣️ Plain-English ask —<br/>Skill never named"] --> M["🧭 Description matched"]
  M --> G["🛡️ data-quality-gate<br/>fires on its own"]
  G --> R["📄 skill-lab/<br/>data-quality-report.md"]
  R --> X["🛑 Expected: FAIL → BLOCK<br/>(4 defects were seeded)"]`,
        script: 'This is the acceptance test for every Skill tonight: ask in plain English, never name the Skill. If it fires on its own, the description works.',
      },
      {
        segment: 'architecture', eyebrow: '🗄️ Familiar Analogy', title: 'A prompt is like ad hoc SQL. A Skill is like a governed reusable procedure.',
        body: 'You already know this pattern from data work. Copied ad hoc SQL maps to a repeated prompt — works once, drifts every time you retype it. A stored procedure or reusable ETL package maps to an Agent Skill. The procedure catalog’s metadata maps to the Skill’s name and description. The procedure’s steps map to the SKILL.md body. Lookup and configuration files map to supporting resources. Validation and reconciliation map to Skill tests. Source control maps to a committed project Skill. This is an analogy, not a claim that a Skill is executable SQL.',
        bullets: [
          'Ad hoc SQL → repeated prompt',
          'Stored procedure / reusable ETL package → Agent Skill',
          'Procedure catalog metadata → Skill name + description',
          'Procedure steps → SKILL.md body',
          'Validation and reconciliation → Skill tests',
        ],
        diagram: `flowchart LR
  P["💬 Repeated prompt<br/>= ad hoc SQL"] --> D["🎲 Drifts every<br/>time you retype it"]
  S["🧩 Agent Skill<br/>= stored procedure"] --> G["🏛️ Governed reuse"]
  G --> M["🏷️ Description =<br/>catalog metadata"]
  G --> B["📜 SKILL.md body =<br/>the procedure steps"]
  G --> T["🧪 Skill tests =<br/>reconciliation"]`,
        script: 'Say explicitly: this is an analogy to build intuition, not a claim that a Skill literally executes SQL. Data people already understand governed reuse — we are just naming the AI-native version of it.',
      },
      {
        segment: 'architecture', eyebrow: '🧬 Anatomy', title: 'Metadata routes the work. Instructions perform the work.',
        body: 'A Skill has three parts and you must not confuse their jobs. The folder is the capability boundary. The name is the identifier. The description is routing information — the sentence Claude reads to decide WHEN to load this Skill at all. The body is the procedure Claude follows once triggered. References and templates are supporting knowledge, loaded only when needed. The output contract — PASS/WARN/FAIL, PUBLISH/BLOCK — is the evidence of correct execution.',
        bullets: [
          'Folder = capability boundary',
          'Description = routing information (the trigger)',
          'Body = the procedure followed after invocation',
          'Output contract = evidence of correct execution',
        ],
        code: {
          kind: 'review',
          label: 'Read together — the SKILL.md your prompt just produced',
          expectedResult: 'Everything above the closing fence is routing information Claude reads to decide WHETHER to load this Skill. Everything below it is the procedure it follows once loaded. Nobody pastes this — read it with the room.',
          code: '---\nname: data-quality-gate\ndescription: Use when the user asks to validate a dataset, CSV, ETL output,\n  query result, or dashboard source before publication. Checks the data against\n  a quality contract and returns PASS, WARN, or FAIL with evidence and a\n  PUBLISH or BLOCK recommendation.\n---\n\n# Data Quality Gate\n\n## Inputs\n- A dataset path (required).\n- A quality contract, when one is supplied.\n\n## Procedure\n1. Read the dataset and the contract. Never modify the source data.\n2. Check, in order: schema, freshness, expected volume, key uniqueness,\n   duplicates, required fields, nulls, numeric rules.\n3. Record the evidence for every check — the row, the value, the timestamp.\n\n## Output\n| Check | Evidence | Status | Recommended Action |\n|---|---|---|---|\n\nEnd with PASS, WARN, or FAIL.\nEnd with a PUBLISH or BLOCK recommendation.',
        },
        diagram: `flowchart TD
  F["📁 Folder =<br/>capability boundary"] --> N["🏷️ Name =<br/>the identifier"]
  F --> D["🧭 Description = ROUTING —<br/>when to load this at all"]
  F --> B["📜 Body = the procedure,<br/>followed after invocation"]
  F --> R["📚 References + templates —<br/>loaded only when needed"]
  B --> OC["🚦 Output contract =<br/>evidence it ran correctly"]`,
        script: 'The description is not documentation about the Skill — it is the routing logic. Say that sentence out loud once.',
      },
      {
        segment: 'architecture', eyebrow: '🪜 Progressive Disclosure', title: 'Claude reads the catalog before loading the procedure',
        body: 'Only a Skill’s name and description are advertised in context at all times — tiny, a line or two each. The full SKILL.md instructions load only when the Skill is actually invoked. Supporting resources — a reference file, a template — load only when the body says to read them. And once invoked, the rendered instructions remain in the conversation context for the rest of the turn. This is why having many Skills installed costs almost nothing until one actually fires.',
        bullets: [
          '1. Name + description advertised at all times',
          '2. SKILL.md body loads when invoked',
          '3. Supporting resources load as needed',
          '4. Once invoked, instructions remain in context',
        ],
        diagram: `flowchart LR
  A["1️⃣ Name + description —<br/>always in context, tiny"] --> B["2️⃣ SKILL.md body —<br/>loads on invocation"]
  B --> C["3️⃣ Reference files —<br/>load only when told to"]
  C --> D["4️⃣ Loaded instructions stay<br/>for the rest of the turn"]
  E["📄 CLAUDE.md — eager,<br/>loads in full every session"] -.->|"lazy vs eager"| A`,
        script: 'Contrast this with CLAUDE.md, which loads in full every session whether relevant to this turn or not. Skills are lazy; CLAUDE.md is eager. Keep that fork in your head.',
      },
      {
        segment: 'architecture', eyebrow: '🧭 Skill, CLAUDE.md, Subagent, or MCP?', title: 'Four components, four different jobs — they are not interchangeable',
        body: 'Always-true project rule, like never modify production SQL without review → CLAUDE.md. A reusable procedure, like validate an extract before dashboard publication → Skill. A separate delegated investigation, like investigating several possible causes without filling the main context → Subagent. A connection to an outside system, like retrieving current data from Snowflake, Power BI, or Jira → MCP. Map every capability question to one of these four before you build.',
        bullets: [
          'Always true, every turn → CLAUDE.md',
          'A repeated, invocable procedure → Skill',
          'Separate delegated investigation → Subagent',
          'Connection to an outside system → MCP',
        ],
        diagram: `flowchart TD
  Q["❓ What kind of<br/>capability is this?"] --> C["📄 CLAUDE.md — always true,<br/>every single turn"]
  Q --> S["🧩 Skill — a repeatable,<br/>invocable procedure"]
  Q --> A["🕵️ Subagent — a delegated<br/>investigation"]
  Q --> M["🔌 MCP — a connection to<br/>an outside system"]`,
        script: 'If you remember one slide tonight, make it this one. Most messy AI setups are someone stuffing a procedure into CLAUDE.md, or reaching for a Skill when they actually needed MCP.',
      },
      {
        segment: 'deconstruct', eyebrow: '🔬 Deconstruct', title: '"Helps with data" versus a routable description',
        body: 'Compare description: Helps with data. against description: Use when the user asks to validate a dataset, CSV, ETL output, query result, or dashboard source before publication. Returns PASS, WARN, or FAIL with evidence and a PUBLISH or BLOCK recommendation. Identify the trigger, the input, the output, the boundary, and the user vocabulary in the second one — and notice the first has none of them.',
        bullets: [
          'Trigger: when does this fire?',
          'Input: what does it need?',
          'Output: what does it produce?',
          'Boundary: what is it NOT for?',
          'Vocabulary: does it use the words a user actually says?',
        ],
        diagram: `flowchart LR
  V["🌫️ 'Helps with data'"] --> N["❌ No trigger · no input ·<br/>no output · no boundary"]
  N --> X["🙈 Claude answers inline —<br/>the Skill stays invisible"]
  R["🎯 'Use when the user asks to<br/>validate a dataset…'"] --> Y["✅ Trigger · input · output ·<br/>boundary · user vocabulary"]
  Y --> Z["🚀 Routes reliably,<br/>every time"]`,
        script: 'Read both out loud. Ask the room which one Claude could actually route on. The vague one has nothing to match against — Claude does the work inline and the Skill stays invisible.',
      },
      {
        segment: 'deconstruct', eyebrow: '🛡️ Harden data-quality-gate', title: 'Review and improve — do not rebuild from scratch',
        body: 'Now harden the Skill so it triggers reliably for data-validation and publish-readiness requests, without firing on unrelated SQL, dashboard-design, or metric-calculation requests. Move the detailed check explanations into a reference file so SKILL.md stays concise, and write down real positive and negative trigger tests so this stays verifiable, not a guess.',
        bullets: [
          'WHERE THESE FILES WILL BE STORED',
          '.claude/skills/data-quality-gate/SKILL.md',
          '.claude/skills/data-quality-gate/references/quality-checks.md',
          'skill-lab/data-quality-gate-tests.md',
        ],
        code: {
          kind: 'paste',
          label: 'Claude Code prompt — harden data-quality-gate',
          pasteWhere: 'Claude Code',
          code: 'Review the existing data-quality-gate Skill.\n\nDo not rebuild it from scratch.\n\nHarden it so it triggers reliably for data-validation and publish-readiness requests without triggering for unrelated SQL, dashboard-design, or metric-calculation requests.\n\nComplete these actions:\n1. Review and improve the description if necessary.\n2. Keep the trigger focused on: dataset validation, ETL-output validation, data-quality checks, dashboard or report publish readiness.\n3. Make clear that ordinary requests to write SQL, calculate a metric, or design a dashboard are not sufficient reasons to invoke it.\n4. Create .claude/skills/data-quality-gate/references/quality-checks.md\n5. Move detailed explanations of the quality checks into that reference.\n6. Keep SKILL.md concise and state exactly when to read the reference.\n7. Create skill-lab/data-quality-gate-tests.md\n8. Include: three prompts that should trigger the Skill, three prompts that should not trigger the Skill, expected output requirements.\n\nDo not commit anything.\n\nWHEN FINISHED, REPORT:\n1. Every file modified\n2. Every file created\n3. The exact project-relative path of every file\n4. A one-line explanation of what each file contains\n5. The final description\n6. The positive and negative trigger tests',
        },
        diagram: `flowchart LR
  S["🛡️ The Skill you<br/>already built"] --> H["🔧 Review and improve —<br/>never rebuild"]
  H --> D["🎯 Sharper description"]
  H --> R["📚 references/<br/>quality-checks.md"]
  H --> T["🧪 skill-lab/<br/>data-quality-gate-tests.md"]
  T --> P["✅ 3 prompts that must fire<br/>+ 3 that must not"]`,
        script: 'This is a review-and-improve prompt, not a rebuild. Read the final description out loud and ask: does this fire on the way a data analyst actually talks?',
      },
      {
        segment: 'deconstruct', eyebrow: '🎯 Three-Way Retest', title: 'Natural, direct, and negative — all three, every time',
        body: 'A hardened Skill needs three separate proofs, not one. Test 1 asks naturally without naming the Skill. Test 2 invokes it directly by name. Test 3 is a deliberate negative test — an ordinary SQL request that must NOT trigger it. All three matter: natural proves the description, direct proves the body, negative proves the boundary.',
        code: {
          kind: 'paste',
          label: 'Three-way retest',
          pasteWhere: 'Claude Code',
          code: 'TEST 1 — NATURAL INVOCATION\nIs skill-lab/orders.csv safe to publish to the executive dashboard?\n\nTEST 2 — DIRECT INVOCATION\n/data-quality-gate skill-lab/orders.csv using skill-lab/quality-contract.md\n\nTEST 3 — NEGATIVE TEST\nWrite a SQL query that totals revenue by region.\n\nExpected: Test 1 invokes data-quality-gate. Test 2 invokes data-quality-gate. Test 3 does not invoke data-quality-gate.\n\nNo new files are required for this test.',
        },
        diagram: `flowchart TD
  H["🛡️ Hardened Skill"] --> T1["1️⃣ Natural ask —<br/>proves the description"]
  H --> T2["2️⃣ Direct invocation —<br/>proves the body"]
  H --> T3["3️⃣ Plain SQL request —<br/>proves the boundary"]
  T1 --> V["✅ All three, every time"]
  T2 --> V
  T3 --> V`,
        script: 'Run all three back to back. The negative test matters as much as the positive ones — a Skill that fires on everything is as broken as one that fires on nothing.',
      },
      {
        segment: 'micro-build', eyebrow: '🕵️ Build etl-failure-triage', title: 'Second Skill: rank likely causes with evidence, never guess',
        body: 'The gate blocked the bad data — now the business wants to know why the pipeline produced it. etl-failure-triage reads logs and run metadata, separates facts from hypotheses, ranks likely causes with cited evidence, and recommends the next diagnostic step. It never changes pipeline code and never reruns jobs — diagnosis, not action.',
        bullets: [
          'WHERE THESE FILES WILL BE STORED',
          '.claude/skills/etl-failure-triage/SKILL.md',
          '.claude/skills/etl-failure-triage/references/common-failures.md',
          'skill-lab/orders-pipeline-failure.log',
          'skill-lab/pipeline-run-metadata.md',
        ],
        code: {
          kind: 'paste',
          label: 'Claude Code prompt — build etl-failure-triage',
          pasteWhere: 'Claude Code',
          code: 'Read CLAUDE.md and inspect the existing Week 2 Agent Skills lab.\n\nConfirm that .claude/skills/ exists. If it does not, create it.\n\nCreate:\n1. .claude/skills/etl-failure-triage/SKILL.md\n2. .claude/skills/etl-failure-triage/references/common-failures.md\n3. skill-lab/orders-pipeline-failure.log\n4. skill-lab/pipeline-run-metadata.md\n\nSKILL DESCRIPTION\nUse when the user asks why an ETL or ELT pipeline, scheduled load, SQL job, data refresh, or ingestion process failed or produced suspicious output. Reviews logs and run metadata, ranks likely causes, cites evidence, and recommends the next safe diagnostic steps.\n\nSKILL BEHAVIOR\n- Require a log, run output, or failure description.\n- Read run metadata when supplied.\n- Separate facts from hypotheses.\n- Cite evidence for every likely cause.\n- Rank the most likely causes.\n- Provide the next diagnostic step for each cause.\n- Do not change pipeline code.\n- Do not rerun jobs.\n- Do not claim a root cause without evidence.\n- Return: Incident Summary, Evidence, Ranked Causes, Next Tests, Escalation Recommendation.\n\nSAMPLE FAILURE\nCreate a believable ETL failure log and run-metadata file connected to the orders dataset. Include evidence of: a schema mismatch involving region, a failed conversion or mapping step, a retry that did not resolve the problem.\n\nDo not commit or run the Skill.\n\nWHEN FINISHED, REPORT:\n1. Every file created\n2. The exact project-relative path of every file\n3. A one-line explanation of what each file contains\n4. The final Skill description',
        },
        diagram: `flowchart LR
  L["📄 Failure log +<br/>run metadata"] --> T["🕵️ etl-failure-triage"]
  T --> F["🧾 Facts separated<br/>from hypotheses"]
  F --> C["📊 Ranked causes, each<br/>with cited evidence"]
  C --> N["🔬 The next<br/>diagnostic test"]
  T -.->|"never"| X["🚫 No code change,<br/>no rerun"]`,
        script: 'Same discipline as Skill #1, faster this time — description first, then the body. This one diagnoses; it never fixes or reruns anything.',
      },
      {
        segment: 'micro-build', eyebrow: '🧪 Test Automatic Invocation', title: 'Separate slide: prove triage fires and cites real evidence',
        body: 'Investigate the failure without naming the Skill. Expect it to invoke automatically, rank the schema mismatch as the top cause with cited log evidence, and recommend a next diagnostic step — never a fix, never a rerun.',
        bullets: [
          'WHERE THE RESULT WILL BE STORED',
          'skill-lab/etl-triage-report.md',
        ],
        code: {
          kind: 'paste',
          label: 'Claude Code prompt — test etl-failure-triage',
          pasteWhere: 'Claude Code',
          code: 'Investigate why the orders pipeline failed using:\nskill-lab/orders-pipeline-failure.log\nskill-lab/pipeline-run-metadata.md\n\nRank the likely causes, cite the evidence, and tell me what should be tested next.\n\nSave the investigation to:\nskill-lab/etl-triage-report.md\n\nDo not change the pipeline or rerun the job.\n\nWHEN FINISHED, REPORT:\n1. Whether etl-failure-triage was invoked automatically\n2. The highest-ranked likely cause\n3. The evidence supporting it\n4. The next recommended diagnostic test\n5. The exact path of the saved report',
        },
        diagram: `flowchart LR
  A["🗣️ 'Why did the orders<br/>pipeline fail?'"] --> T["🕵️ Fires automatically"]
  T --> E["🔍 Schema mismatch on region —<br/>quoted from the log"]
  E --> R["📄 skill-lab/<br/>etl-triage-report.md"]
  R --> N["🔬 Recommends the next test,<br/>never a fix"]`,
        script: 'Confirm the report cites real evidence, not a guess. This is the difference between a Skill and a chatbot answer.',
      },
      {
        segment: 'micro-build', eyebrow: '📊 Build executive-dashboard-brief', title: 'Third Skill: a decision product, not a technical data dump',
        body: 'The technical team has an answer. Leadership needs something different: status, business impact, verified evidence, the decision needed, an owner, and the next update time. executive-dashboard-brief never invents financial impact, cause, owner, or timing — it only uses what the quality and triage reports actually established.',
        bullets: [
          'WHERE THESE FILES WILL BE STORED',
          '.claude/skills/executive-dashboard-brief/SKILL.md',
          '.claude/skills/executive-dashboard-brief/template.md',
        ],
        code: {
          kind: 'paste',
          label: 'Claude Code prompt — build executive-dashboard-brief',
          pasteWhere: 'Claude Code',
          code: 'Read CLAUDE.md and inspect the existing Week 2 lab outputs.\n\nConfirm that .claude/skills/ exists. If it does not, create it.\n\nCreate:\n1. .claude/skills/executive-dashboard-brief/SKILL.md\n2. .claude/skills/executive-dashboard-brief/template.md\n\nSKILL DESCRIPTION\nUse when the user asks to turn a data-quality result, failed refresh, pipeline incident, KPI variance, or technical investigation into an executive dashboard update. Produces a concise leadership brief containing status, business impact, verified evidence, decision needed, owner, and next update time.\n\nSKILL REQUIREMENTS\n- Use supplied quality and triage reports.\n- Separate verified facts from unresolved questions.\n- Never invent financial impact, cause, owner, or timing.\n- Avoid raw logs and unnecessary technical details.\n- State whether the dashboard should remain blocked.\n- Use template.md for the final structure.\n- Return: Status, Business Impact, What We Know, What We Do Not Know, Decision or Action Needed, Owner, Next Update.\n\nCreate template.md containing that exact executive structure.\n\nDo not commit or run the Skill.\n\nWHEN FINISHED, REPORT:\n1. Every file created\n2. The exact project-relative path of every file\n3. A one-line explanation of what each file contains\n4. The final Skill description\n5. How SKILL.md uses template.md',
        },
        diagram: `flowchart LR
  Q["📄 Quality report"] --> B["📊 executive-dashboard-brief"]
  T["📄 Triage report"] --> B
  B --> S["🚦 Status +<br/>business impact"]
  B --> K["✅ What we know /<br/>❓ what we do not"]
  B --> D["🧑‍⚖️ Decision · owner ·<br/>next update"]
  B -.->|"never"| X["🚫 No invented impact,<br/>cause, owner, or timing"]`,
        script: 'Read the required structure out loud: Status, Impact, What We Know, What We Do Not Know, Decision, Owner, Next Update. That is the whole shape of good incident communication.',
      },
      {
        segment: 'micro-build', eyebrow: '🧪 Test + Complete the Incident Package', title: 'Run all three Skills together — the full connected workflow',
        body: 'The orders dashboard is scheduled to publish. Run the complete incident workflow: validate, and if unsafe, investigate, then brief leadership — using the appropriate Skill for each stage, automatically, without naming any of them. This is the moment the three Skills stop being three separate builds and become one connected system.',
        bullets: [
          'WHERE THE FINAL INCIDENT PACKAGE WILL BE STORED',
          'skill-lab/final-incident-package/data-quality-report.md',
          'skill-lab/final-incident-package/etl-triage-report.md',
          'skill-lab/final-incident-package/executive-dashboard-brief.md',
        ],
        code: {
          kind: 'paste',
          label: 'Claude Code prompt — full incident workflow',
          pasteWhere: 'Claude Code',
          code: 'The orders dashboard is scheduled to publish.\n\nComplete the incident workflow using the appropriate Agent Skills.\n\n1. Validate: skill-lab/orders.csv against skill-lab/quality-contract.md\n2. If the data is unsafe, investigate: skill-lab/orders-pipeline-failure.log and skill-lab/pipeline-run-metadata.md\n3. Use the resulting findings to prepare a concise executive dashboard incident brief.\n\nDo not modify the source data.\nDo not change the pipeline.\nDo not invent financial impact, an owner, or a resolution time.\n\nSave the final outputs to:\nskill-lab/final-incident-package/data-quality-report.md\nskill-lab/final-incident-package/etl-triage-report.md\nskill-lab/final-incident-package/executive-dashboard-brief.md\n\nWHEN FINISHED, REPORT:\n1. Which Skill handled each stage\n2. Why each Skill was selected\n3. Whether each Skill was invoked automatically\n4. The exact path of each final output\n5. The final dashboard PUBLISH or BLOCK decision\n6. The next recommended business action',
        },
        diagram: `flowchart LR
  I["🚨 8:05 AM —<br/>the dashboard is wrong"] --> D["🛡️ Detect —<br/>data-quality-gate"]
  D --> G["🕵️ Diagnose —<br/>etl-failure-triage"]
  G --> C["📣 Communicate —<br/>executive-dashboard-brief"]
  C --> P["📦 skill-lab/<br/>final-incident-package/"]
  P --> R["🛑 BLOCK, with the next<br/>business action named"]`,
        script: 'This is the payoff slide. Three Skills, one incident, zero manual coordination. Ask the room: which Skill handled which stage, and why that one and not another?',
      },
    ],

    storyBeats: {
      checkin: [
        {
          icon: '🕗', tone: 'violet', eyebrow: '8:05 AM · The analyst is unavailable',
          title: 'The analyst who normally catches this is out today.',
          body: 'The company does not lack a procedure. The analyst runs the same checks every morning: freshness, row count, duplicate keys, required fields, unreasonable amounts. But the procedure exists only in her head, so the control disappears the day she is unavailable.',
          punch: 'The analyst should not be the control. The repeatable procedure should be the control.',
        },
      ],
      'business-problem': [
        {
          icon: '✅', tone: 'berry', eyebrow: 'The procedure became visible',
          title: 'Everyone in the room just performed the same checks.',
          body: 'A few minutes ago, the procedure existed only in an analyst’s memory and saved prompts. Now every student used the same checks, the same thresholds, and the same PASS or FAIL language.',
          punch: 'Tribal knowledge just became an executable team asset.',
        },
      ],
      deconstruct: [
        {
          icon: '🚧', tone: 'cherry', eyebrow: 'The incident continues',
          title: 'The gate protected the dashboard. Now the business wants the cause.',
          body: 'Blocking unsafe data is the correct decision, but it does not resolve the incident. Operations still needs to understand why the pipeline produced invalid data, what evidence supports the diagnosis, and what should be tested next.',
          punch: 'Detection protects the business. Diagnosis restores the system.',
        },
      ],
      'micro-build': [
        {
          icon: '📣', tone: 'amber', eyebrow: 'The audience changes',
          title: 'The technical team has an answer. Leadership is still waiting.',
          body: 'The data-quality report explains what is wrong. The triage report explains why it may have happened. Neither is written for the CFO, who needs impact, confidence, action, ownership, and the next update.',
          punch: 'A technically correct answer can still be the wrong communication product.',
        },
      ],
    },

    extraInteractions: [
      {
        segment: 'cold-open', kind: 'poll',
        q: 'Think about your own team. If one specific person did not log on tomorrow, which check simply would not get run?',
        options: [
          '😬 I know exactly who that person is',
          '🙋 It is me — I am that person',
          '🤷 Several people could cover it',
          '✅ It is written down, and anyone could run it',
        ],
        eyebrow: '🚪 The person who is not there', title: 'Which check lives in exactly one head?',
        presenterTip: 'No right answer — this is the diagnosis, not the test. Read the spread out loud, and when people pick the second option, thank them for it: admitting you are the single point of failure is uncomfortable and it is precisely the problem tonight solves. Do not reveal anything. Go straight into the 8:05 AM story.',
      },
      {
        segment: 'checkin', kind: 'poll',
        q: 'Three things before we build — where are you?',
        options: [
          '✅ Workspace open, Claude Code running',
          '📁 Workspace open, Claude Code not started',
          '🧩 Running, but I cannot find my project folder',
          '😵 I need a mentor right now',
        ],
        eyebrow: '🚦 Roll call', title: 'Before anyone pastes a prompt',
        presenterTip: 'Operational, not teaching. Call the counts out loud ("17 of 21 — four more") and send mentors to the last two options immediately. Nobody needs a .claude/skills/ folder yet, because the first build prompt creates it — do not let that question stall the room.',
      },
      {
        segment: 'business-problem', kind: 'poll',
        q: 'You created .claude/skills/ during this session, all three files are there, and the Skill still will not fire. What do you check first?',
        options: [
          'Rewrite the description until something fires',
          'Restart Claude Code — the Skills directory was created after the session started',
          'Add allowed-tools to the frontmatter',
          'Move the whole procedure into CLAUDE.md',
        ],
        answer: 1,
        reveal: 'Claude Code reads the Skills directory when a session starts. If the folder did not exist at that moment, nothing inside it is advertised yet — which is exactly why the build prompt ends by asking whether a restart is needed. Check the boring environmental thing before you edit a description that was probably fine.',
        eyebrow: '🔎 Diagnose it', title: 'Everything looks right. Nothing fires.',
        presenterTip: 'Take answers before revealing — option one always leads, because rewriting the description feels like doing something. Name that instinct out loud: rewriting a working description to chase an environment problem is how a good Skill gets quietly ruined.',
      },
      {
        segment: 'architecture', kind: 'poll',
        theater: true,
        q: '"Never modify production SQL without a review." Where does that rule belong?',
        options: [
          'In a Skill, so it can be invoked whenever SQL comes up',
          'In CLAUDE.md, because it has to be true on every single turn',
          'In a subagent that reviews SQL changes',
          'In an MCP server connected to the warehouse',
        ],
        answer: 1,
        reveal: 'Always-true goes in CLAUDE.md, which loads in full at the start of every session. A Skill is lazy on purpose — only its name and description sit in context until something invokes it — so a rule that must hold on every turn cannot live there. Getting this fork wrong is the most common way a working AI setup turns into an unpredictable one.',
        eyebrow: '🧭 The fork', title: 'Skill, CLAUDE.md, Subagent, or MCP?',
        presenterTip: 'Full-screen theater moment — lock the votes before revealing. Option one polls well and deserves a serious answer: a Skill would work right up until the turn nobody invoked it, which is exactly the turn that matters. Do not rush this; it is the slide the room should still remember in Week 10.',
      },
      {
        segment: 'deconstruct', kind: 'poll',
        q: 'The Skill works when you type /data-quality-gate, but not when you ask, "Is this dataset safe to publish?" What should you inspect first?',
        options: [
          'Dataset size',
          'Skill description',
          'Body length',
          'CSV filename',
        ],
        answer: 1,
        reveal: 'Direct invocation proves the body can run. Natural invocation tests whether the description helps Claude recognize when the Skill is relevant.',
        eyebrow: '🔬 Deconstruct', title: 'Direct invocation works. Natural does not. Why?',
        presenterTip: 'This is the trigger-failure diagnosis moment — land it before moving into Harden.',
      },
      {
        segment: 'micro-build', kind: 'poll',
        q: 'The gate blocked the dataset. What capability should come next?',
        options: [
          'Rebuild the dashboard',
          'Add a permanent rule to CLAUDE.md',
          'Run a reusable ETL failure-triage procedure',
          'Send the entire log to the CFO',
        ],
        answer: 2,
        reveal: 'The gate tells us the data is unsafe. Triage determines what evidence explains the failure and what should be tested next.',
        eyebrow: '🩺 The incident continues', title: 'Data is blocked. What comes next?',
        presenterTip: 'Take responses, reveal, then move straight into building etl-failure-triage.',
      },
      {
        segment: 'micro-build', kind: 'poll',
        q: 'What belongs in the executive incident update?',
        options: [
          'The entire pipeline log',
          'Every SQL statement tested',
          'Status, impact, evidence, decision, owner, and next update',
          'A generic statement that IT is investigating',
        ],
        answer: 2,
        reveal: 'Leadership needs a decision product, not a technical data dump.',
        eyebrow: '📣 Leadership is waiting', title: 'What goes in the brief?',
        presenterTip: 'Take responses, reveal, then move straight into building executive-dashboard-brief.',
      },
      {
        segment: 'trivia', kind: 'trivia',
        q: 'What does allowed-tools currently do?',
        options: [
          'Permanently restricts the Skill to those tools',
          'Pre-approves named tools for the invocation turn',
          'Prevents automatic Skill invocation',
          'Loads every reference file',
        ],
        answer: 1,
        reveal: 'Pre-approval and restriction are different controls. allowed-tools pre-approves tools for the turn; disallowed-tools and broader permission deny rules are what actually restrict.',
        eyebrow: '🧠 Knowledge check', title: 'Tool permissions, precisely',
        presenterTip: 'This corrects a common misconception — read the reveal exactly as written, do not paraphrase.',
      },
    ],
  },

  /* ====================================================================== */
  /*  THURSDAY — Build Day                                                  */
  /* ====================================================================== */
  thursday: {
    teach: [
      {
        segment: 'build-map', eyebrow: '🗺️ Build Map', title: 'Four checkpoints: idea → diagram → stack → a demo you can show off',
        body: 'Here is the whole arc for tonight, and each checkpoint is a state you can screenshot as proof. CP0: your .claude/skills/ folder is ready. CP1: system-architect draws your first real architecture diagram from nothing but your idea. CP2: all three Skills are authored. CP3: mvp-scoper — multi-file and tool-scoped — hands you a Week-1 plan, a visual mockup, and a one-pager, committed. Nobody’s idea needs to be final tonight. It needs to be one paragraph.',
        bullets: [
          'CP0: .claude/skills/ folder ready',
          'CP1: system-architect draws your first diagram',
          'CP2: all three Skills authored',
          'CP3: mvp-scoper is multi-file, scoped, and shows off your idea',
        ],
        diagram: `flowchart LR
  I["💡 Your idea<br/>(one paragraph)"] --> SA["🏗️ system-architect"]
  SA --> TS["🎨 tech-stack-recommender"]
  TS --> MVP["🚀 mvp-scoper"]
  MVP --> B["📦 Your Blueprint:<br/>diagram + stack + demo"]`,
        script: 'Four checkpoints, each one you can screenshot as proof. We go deep on the first skill, then the next two build on it directly.',
      },
      {
        segment: 'build-map', eyebrow: '💡 Your Idea, As-Is', title: 'Your idea does not need to be final tonight — it needs to be one paragraph',
        body: 'This is not the night your idea gets locked in. It is the night a rough idea becomes something you can actually look at: a diagram, a stack, a demo. A good starting paragraph names who it is for, what it does, and the one thing that would make it useful on day one. That is genuinely enough fuel for all three Skills tonight.',
        bullets: [
          'Who is this for?',
          'What does it actually do?',
          'What is the one thing it must do well on day one?',
        ],
        diagram: `flowchart LR
  R["🌱 Rough idea,<br/>not finalized"] --> P["📝 One paragraph:<br/>who + what + day-one job"]
  P --> T["🧰 Tonight's 3 Skills"]
  T --> C["👀 Something concrete<br/>to react to"]`,
        script: 'Give everyone 60 seconds to write their one paragraph before we build. If someone says their idea isn’t ready, tell them that is exactly what tonight is for.',
      },
      {
        segment: 'guided-build', eyebrow: '📁 Where Skill Files Live', title: 'Everything tonight stays inside your own project',
        body: 'Same rule as Monday. Project Skills live at .claude/skills/<skill-name>/SKILL.md. mvp-scoper will produce a few extra files — a task list, a visual mockup, a one-pager — and every one of them gets an exact, reported path so you never have to guess where something landed.',
        bullets: [
          'Skill: .claude/skills/<skill-name>/SKILL.md',
          'Generated outputs: project-blueprint/ (new folder, created tonight)',
          'Claude reports every path after every build',
        ],
        diagram: `flowchart TD
  S[".claude/skills/"] --> A["🏗️ system-architect/<br/>SKILL.md"]
  S --> B["🎨 tech-stack-recommender/<br/>SKILL.md"]
  S --> C["🚀 mvp-scoper/<br/>SKILL.md + template.md"]
  O["project-blueprint/"] --> D["architecture.md"]
  O --> E["tech-stack.md"]
  O --> F["mockup.html + one-pager.pdf"]`,
        script: 'Point at the diagram. Two folders tonight: the Skills themselves, and where their outputs land. Nobody should ever have to ask ‘where did that go?’',
      },
      {
        segment: 'guided-build', eyebrow: '🏗️ CP1 — Build system-architect', title: 'Skill #1: turn one paragraph into a real system architecture',
        body: 'This is the Skill everyone remembers. Description: use when the user has a project idea and wants a system architecture. Body: read the idea, identify the real components — frontend, backend/API, database, any external services or an AI layer — and produce a genuine mermaid diagram showing how they connect, not a toy box-and-arrow sketch. This should feel like a week of an architect’s thinking, delivered in one pass.',
        bullets: [
          'Description names the trigger: ‘has a project idea, wants an architecture’',
          'Identifies real components — not a generic template',
          'Outputs an actual mermaid diagram, extensive enough to mean something',
        ],
        code: {
          kind: 'paste',
          label: 'Claude Code prompt — build system-architect',
          pasteWhere: 'Claude Code',
          code: 'Confirm .claude/skills/ exists (create it if not). Create .claude/skills/system-architect/SKILL.md.\n\nDescription: Use when the user has a project idea and wants a system architecture, a technical design, or a diagram of how it would work.\n\nBody must: take a one-paragraph project idea as input; identify the real components this specific idea needs (frontend, backend/API, database, external services, an AI/agent layer if relevant) — never a generic template that ignores what the idea actually said; produce a genuine mermaid flowchart showing how the components connect and how data flows between them; explain each component in one plain-English sentence a non-technical person could follow; save the result to project-blueprint/architecture.md.\n\nWHEN FINISHED, REPORT: the exact path, the final description, and the component list it identified.',
        },
        diagram: `flowchart LR
  D["💡 One-paragraph idea"] --> SA["🏗️ system-architect"]
  SA --> F["🖥️ Frontend"]
  SA --> BE["⚙️ Backend / API"]
  SA --> DB["🗄️ Database"]
  SA --> EX["🔌 External services<br/>/ AI layer"]
  F --> DIA["📐 Real mermaid<br/>architecture diagram"]
  BE --> DIA
  DB --> DIA
  EX --> DIA`,
        script: 'Paste this. When it comes back, do not just glance at the diagram — read it out loud, node by node, and ask the room if it actually matches their idea.',
      },
      {
        segment: 'guided-build', eyebrow: '🧪 Test Automatic Invocation', title: 'Separate slide, separate action: prove it fires without naming it',
        body: 'Never combine building a Skill with testing it. Now, in a fresh ask, describe your idea in plain English and ask for how it would work — without naming system-architect. If it auto-fires, your description works. If you have to name it, the description is too weak, and that is exactly what we harden after the break.',
        bullets: [
          'Ask naturally — never say ‘use system-architect’',
          'Auto-fires = CP1 met',
          'This ask also builds a full browsable knowledge-base site — give it time',
          'Only-when-named = the description needs sharpening',
        ],
        code: {
          kind: 'paste',
          label: 'Claude Code prompt — test automatic invocation',
          pasteWhere: 'Claude Code',
          code: 'My idea: [describe your project in one paragraph — who it’s for, what it does,\nand the one thing it must do well on day one]\n\nHow would this actually work as a system? Then build it out as a knowledge base\nI can browse.\n\n────────────────────────────────────────\n1. DESIGN THE SYSTEM\n────────────────────────────────────────\nDerive the component list from what my paragraph actually says. Every component\nmust trace back to specific words in it; every component it implies must appear.\nInclude a frontend only if a human uses one, a database only if state outlives a\nsession, a queue only if work is slow or bursty, an AI layer only if the idea\nneeds generation, extraction, or ranking by meaning. A padded diagram is a worse\nanswer than a small one.\n\nThe sentence naming what it must do well on day one outranks everything else.\nSome component exists specifically to guarantee it — name that component.\n\n────────────────────────────────────────\n2. WRITE project-blueprint/architecture.md\n────────────────────────────────────────\nSections: The Idea (my paragraph) · Components (table, each with ONE plain-English\nsentence saying what it does for THIS project, plus the words that required it) ·\nHow It Fits Together (mermaid flowchart) · Data Flow (numbered walkthrough) ·\nBuild Order (phases, and what each phase proves) · Assumptions (with impact) ·\nWhat This Design Does Not Cover (honest).\n\nMermaid rules: `flowchart TD`. Readable labels, not `DB`. EVERY arrow labelled\nwith the data or action crossing it. `[Rectangle]` services you build,\n`[(Cylinder)]` data stores, `{{Hexagon}}` third parties, `([Stadium])` entry\npoints. Quote any label with a comma or parenthesis. No reserved words as node\nIDs. Verify it parses.\n\n────────────────────────────────────────\n3. BUILD THE KNOWLEDGE BASE (multi-page)\n────────────────────────────────────────\nA small static site under project-blueprint/ — SEPARATE PAGES, not one long\nscroll, so I can open a section, read it, go back to the Command Center, and\nopen the next one:\n\n  index.html          Command Center\n  01-summary.html … 0N-<section>.html   one page per section\n  assets/blueprint.js  the data object\n  assets/site.js       shared rendering, nav, agent\n  assets/site.css      shared styles\n\nCOMMAND CENTER (index.html): a responsive grid of tiles, one per section. Each\ntile has an inline-SVG picture previewing what’s inside — a miniature node graph,\nstacked flow steps, phase bars, a coverage grid — drawn from my data, not stock\nart or emoji. Plus the section name, one line of description, and a live count\n("11 components", "3 deferred"). The whole tile is the link.\n\nEVERY SECTION PAGE: sticky top nav, a "← Command Center" control, breadcrumbs,\nprevious/next section links at the foot, scroll progress, back-to-top, search,\ntheme toggle, print. Keyboard reachable throughout.\n\nONE DATA OBJECT: assets/blueprint.js defines `const BLUEPRINT = {...}` holding\neverything — components, diagram source, flow steps, phases, coverage,\nassumptions. Every page renders from it. If a number appears twice in the source,\nthat’s the bug. (Note `const` at top level is NOT a property of window — other\nscripts must reference the bare identifier, not window.BLUEPRINT.)\n\nSEARCH ACROSS THE WHOLE SITE: build one plain-JavaScript index over every field\nof BLUEPRINT — components, flow steps, phases, coverage rows, assumptions, KPIs,\nartifacts — each entry tagged with the section it belongs to. Typing in the nav\nsearch box does two things at once: narrows what’s visible on the current page,\nAND drops down ranked matches from every OTHER section, each one a link to the\nright page with the matched words highlighted. Score by term frequency with a\ntitle boost and a whole-phrase bonus; drop stopwords; fall back to a stem match\nso "components" finds "component". No model, no network, works offline.\n\nDIAGRAMS AND CHARTS: Mermaid for the architecture, the data flow (sequence\ndiagram), and the build order (gantt). Charts only where my idea has real data to\nsupport one — never invent a metric to fill a chart. EVERY diagram and chart has\nan expand control that opens it FULL SCREEN with zoom in / zoom out / reset and\nEsc to close. Every one also carries a one-line plain-English interpretation\nbeneath it: what it means, not what it shows.\n\nILLUSTRATIONS — PICTURES THAT TELL THE STORY: alongside the technical diagrams,\ndraw purpose-built inline-SVG illustrations, generated from BLUEPRINT so they\nstay true when the data changes. Aim for one per section, for example: the whole\nidea as inputs → pipeline → output; the components grouped into layers with the\nreal names placed in them; the steps as a numbered ribbon colour-coded by which\nones the model actually touches; the build phases as a proportional timeline with\nthe make-or-break phase highlighted; coverage as a conditional-formatted grid; the\nopen question as a two-branch fork showing what changes under each answer. Use\ninline SVG only — no stock photography, no icon fonts, no emoji as the main\nvisual, no external image files. They must scale, follow the light/dark theme,\nwork offline, and expand full screen like every other figure.\n\nAI AGENT — TWO MODES, AND THE DEFAULT NEEDS NO KEY: an "Ask" panel on every page\nwith a mode switch.\n\n  MODE 1 (default) "Search — no key": answers from the same local index as the\n  nav search. No API key, no network, no model. It returns the matching passages\n  as cards, each labelled with its section, snippet highlighted, linking to the\n  page. When nothing matches it says so and points at Coverage, since a miss may\n  itself be the answer. This mode must work with the internet switched off.\n\n  MODE 2 "Claude — needs key": I paste my own Anthropic API key (stored in\n  localStorage, never hardcoded), pick a model, and choose scope — this section\n  or the whole blueprint. It answers ONLY from the BLUEPRINT object, which you\n  put in the system prompt, and says so plainly when the blueprint doesn’t cover\n  something. Every failure path (bad key, rate limit, blocked request) tells me I\n  can fall back to Search mode. Call the API directly:\n\n  POST https://api.anthropic.com/v1/messages\n  headers: content-type: application/json\n           x-api-key: <the key the user pasted>\n           anthropic-version: 2023-06-01\n           anthropic-dangerous-direct-browser-access: true\n  body:    { model, max_tokens: 16000, system, messages: [{role, content}] }\n\n  Models: claude-opus-5 (default), claude-sonnet-5, claude-haiku-4-5.\n  Send output_config: {effort: "low"} on the first two ONLY — Haiku rejects it.\n  Read the reply from data.content, filtering blocks where type === "text".\n  Check data.stop_reason === "refusal" before reading content.\n  Show a readable error on a bad key, rate limit, or lost connection.\n\nCOLABERRY FORMATTING:\n  background #eef2f6   text  #0f172a   accent #0f766e\n  cards      #ffffff   muted #64748b   borders #e2e8f0\n  radius 10-12px · soft shadows · "Segoe UI", system-ui, sans-serif\n  Semantic colors only — green good, amber warning, red risk, blue info,\n  slate neutral. An entity keeps the same color everywhere it appears.\n  Executive and calm, not consumer SaaS. Support a dark theme too.\n\n────────────────────────────────────────\n4. PORTABILITY — THIS RUNS ON MANY MACHINES\n────────────────────────────────────────\nPlain HTML, CSS, and vanilla JS. No build step, no framework, no bundler, no\npackage install, no local server required — opening index.html from disk must\nwork. Classic <script src="..."> only; no ES modules and no fetch() of local\nfiles, both of which browsers block on file:// URLs. Mermaid and Chart.js from\nCDN. No other network calls except the Anthropic one I trigger myself. Nothing\nthat depends on your operating system, your shell, or anything installed here.\n\n────────────────────────────────────────\n5. FINISH\n────────────────────────────────────────\nOpen project-blueprint/index.html in my browser.\n\nWHEN FINISHED, REPORT: the exact path of the saved architecture, the exact path\nof the knowledge base, the component list with one line on why my idea required\neach, what you assumed, the one question that would most change the design, that\nAsk works with no API key in Search mode, and that Mermaid and Chart.js need\ninternet on first load — with an offer to build an offline version.',
        },
        diagram: `flowchart LR
  ASK["🗣️ Natural-language ask,<br/>Skill never named"] --> SA["🏗️ system-architect<br/>(should auto-fire)"]
  SA --> MD["📄 architecture.md"]
  SA --> KB["🌐 project-blueprint/<br/>index.html — a browsable<br/>knowledge-base site"]`,
        script: 'CP1 isn’t ‘the skill exists’ — it’s ‘the skill fires when I talk like a human.’ Test it that way every time or it will bite you in production. This build is bigger than most tests — it produces a whole browsable site — so give it real time to finish before moving on.',
      },
      {
        segment: 'guided-build', eyebrow: '✨ You Just Watched This Happen', title: 'An idea became a diagram in one pass',
        body: 'A few minutes ago this was a paragraph. Now it is a real architecture with real components and a real diagram — the kind of artifact that used to mean a week with an architect. That is the whole promise of tonight: watch your idea become something you can point at.',
        bullets: [
          'A paragraph in, a real architecture out',
          'This is the artifact you screenshot for your portfolio',
          'Next: give this architecture a stack it actually deserves',
        ],
        code: {
          kind: 'review',
          label: 'Read together — the system-architect SKILL.md Claude just wrote',
          expectedResult: 'Two paragraphs of routing, then a procedure short enough to read aloud. That is the whole artifact that turned your paragraph into a diagram. Nobody pastes this — open the file and read it with the room.',
          code: '---\nname: system-architect\ndescription: Use when the user has a project idea and wants a system\n  architecture, a technical design, or a diagram of how it would work.\n---\n\n# System Architect\n\n## Input\nOne paragraph describing the idea: who it is for, what it does, and the one\nthing it must do well on day one.\n\n## Procedure\n1. Derive the component list from what the paragraph actually says. Every\n   component must trace back to specific words in it.\n2. Add a component only when the idea requires it — a database only if state\n   outlives a session, a queue only if work is slow or bursty, an AI layer\n   only if the idea needs generation, extraction, or ranking by meaning.\n3. Name the component that exists specifically to guarantee the day-one job.\n4. Draw the connections as a mermaid flowchart. Label every arrow with the\n   data or action crossing it.\n5. Explain each component in one plain-English sentence a non-technical\n   person could follow.\n\n## Output\nWrite project-blueprint/architecture.md.',
        },
        diagram: `flowchart LR
  B["📝 Before:<br/>a paragraph"] -.->|"a few minutes"| A["📐 After:<br/>a real architecture"]`,
        script: 'Let this land for a second before moving on. Ask one or two students to read their architecture’s component list out loud.',
      },
      {
        segment: 'guided-build', eyebrow: '🎨 CP2 — Build tech-stack-recommender', title: 'Skill #2: a stack recommendation a non-technical person can actually read',
        body: 'This Skill takes your architecture and recommends real technology for each component — colorful, icon-led, with a fit rating (🟢 great fit, 🟡 good fit, 🔴 consider carefully) instead of a wall of text. Every recommendation gets one plain-English reason, and a ready-to-copy prompt for going deeper on that exact technology later, whenever you’re curious.',
        bullets: [
          'One row per component: pick, fit rating, plain-English why',
          'Icons and color-coded fit ratings, not paragraphs',
          'Ends with a copy-ready ‘learn more about X’ prompt per technology',
        ],
        code: {
          kind: 'paste',
          label: 'Claude Code prompt — build tech-stack-recommender',
          pasteWhere: 'Claude Code',
          code: 'Create .claude/skills/tech-stack-recommender/SKILL.md.\n\nDescription: Use when the user has a system architecture and wants a recommended tech stack, explained simply.\n\nBody must: read project-blueprint/architecture.md; for each component recommend one real, current technology; give every recommendation a fit rating using 🟢 great fit / 🟡 good fit / 🔴 consider carefully, based on how well it matches THIS idea’s actual scale and needs (not a generic default); explain the ‘why’ in one plain-English sentence, no jargon without a one-line definition; use icons and short labels, never a wall of text; end each row with a copy-ready prompt the user could paste later to learn more about that specific technology (e.g. ‘Explain PostgreSQL to me like I’m new to databases, using my project as the example’); save the result to project-blueprint/tech-stack.md.\n\nWHEN FINISHED, REPORT: the exact path, and the fit-rating breakdown (how many 🟢/🟡/🔴).',
        },
        diagram: `flowchart LR
  ARCH["📐 Your architecture"] --> TSR["🎨 tech-stack-recommender"]
  TSR --> F1["🟢 Great fit"]
  TSR --> F2["🟡 Good fit"]
  TSR --> F3["🔴 Consider carefully"]
  F1 --> L["🔎 Learn-more prompt,<br/>per technology"]
  F2 --> L
  F3 --> L`,
        script: 'When this comes back, do not read it like a spec sheet. Read the fit ratings out loud like a weather report — this is the moment non-technical students realize they can actually follow an architecture conversation.',
      },
      {
        segment: 'guided-build', eyebrow: '🧪 Test Automatic Invocation', title: 'Ask for a stack in plain English — confirm it reads like a human wrote it',
        body: 'Ask naturally, without naming the Skill. A good result is scannable in ten seconds: icons, color, one line per choice — never a technical essay. Confirm at least one learn-more prompt is copy-ready.',
        bullets: [
          'Ask naturally — never say ‘use tech-stack-recommender’',
          'Scannable in 10 seconds, not a technical essay',
          'This ask also builds a full browsable knowledge base — give it time',
          'At least one learn-more prompt, ready to copy',
        ],
        code: {
          kind: 'paste',
          label: 'Claude Code prompt — test automatic invocation',
          pasteWhere: 'Claude Code',
          code: 'Given my architecture, what stack should I actually use? Explain it like I might\nnot be technical.\n\nRead project-blueprint/architecture.md first. Everything below is about THAT\nsystem — not a generic web app.\n\n────────────────────────────────────────\n1. RECOMMEND ONE TECHNOLOGY PER COMPONENT\n────────────────────────────────────────\nWalk my architecture’s component list in order. For each one, name ONE real,\ncurrent, specific technology — "PostgreSQL 16", not "a database"; "React + Vite",\nnot "a frontend framework". Use my architecture’s own component names so I can\nline the two documents up side by side.\n\nThen add any technology my DATA FLOW clearly needs that the component list never\nnamed — text extraction, PDF rendering, hosting. Mark those as a separate group\nso I can see they came from the flow, not the component list.\n\n────────────────────────────────────────\n2. RATE THE FIT — AND MEAN IT\n────────────────────────────────────────\nEvery recommendation gets one of:\n\n  🟢 great fit          — matches this project’s size and needs; pick it, move on\n  🟡 good fit           — works, but there is a real caveat I should read first\n  🔴 consider carefully — where this plan is most likely to hurt me\n\nRate against MY project’s actual scale and constraints — how much traffic, how\nmany people building it, what kind of data — not against what is popular. A\ntechnology can be excellent and still be 🔴 here.\n\nIf everything comes back 🟢, you have not thought hard enough. Say plainly which\nchoices you are least confident about and why.\n\n────────────────────────────────────────\n3. EXPLAIN IT TO SOMEONE NON-TECHNICAL\n────────────────────────────────────────\nEach recommendation gets ONE plain-English sentence saying why it fits MY project.\nNo jargon unless you define it in the same breath, in five words or fewer —\n"TypeScript, which checks your code’s shapes before it runs".\n\nIcons and short labels, never a wall of text. If a row needs a caveat, put it in\nits own short block labelled so I cannot miss it — don’t bury it in the sentence.\n\n────────────────────────────────────────\n4. GIVE ME A PROMPT I CAN PASTE LATER\n────────────────────────────────────────\nEnd every recommendation with a copy-ready prompt I can paste into Claude to learn\nthat one technology properly. Each must already name my project so the answer is\nabout my system, not a textbook. For example:\n\n  "Explain PostgreSQL to me like I’m new to databases, using my <project> as the\n   example. What tables would I actually have?"\n\n────────────────────────────────────────\n5. WRITE project-blueprint/tech-stack.md\n────────────────────────────────────────\nSections: the fit-rating key and what a rating means · a one-paragraph headline\nnaming where this stack is most likely to break · the recommendations grouped\n(things a person touches / things you write / things you store / things you depend\non / things the data flow needs) · every copy-ready prompt collected in one table ·\nwhat to learn first, in order · alternatives considered and why not · how hard each\ndecision is to undo · what this document does NOT tell me.\n\n────────────────────────────────────────\n6. BUILD THE KNOWLEDGE BASE (multi-page)\n────────────────────────────────────────\nSame shape as my architecture knowledge base, under project-blueprint/stack/ so\nthe two sit side by side:\n\n  index.html           Command Center\n  01-summary.html … 08-appendix.html    one page per section\n  assets/stack.js      the data object\n  assets/site.js       shared rendering, nav, search, agent\n  assets/site.css      shared styles\n\nCOMMAND CENTER: a responsive grid of tiles, one per section, each with an inline-SVG\npicture previewing what’s inside and a live count pulled from the data ("14\nrecommendations", "2 to watch"). The whole tile is the link.\n\nEVERY SECTION PAGE: sticky nav, "← Command Center", breadcrumbs, previous/next at\nthe foot, scroll progress, back-to-top, search, theme toggle, print.\n\nONE DATA OBJECT: assets/stack.js defines `const STACK = {...}` holding every\nrecommendation, rating, caveat, prompt, alternative and decision. Every page renders\nfrom it. Nothing typed twice. (Note `const` at top level is NOT a window property —\nother scripts must reference the bare identifier.)\n\nSEARCH ACROSS THE WHOLE SITE: one plain-JavaScript index over every field of STACK,\neach entry tagged with its section. The nav box narrows the current page AND drops\ndown ranked matches from every other section, linked and highlighted. No model, no\nnetwork, works offline.\n\nCOPY BUTTONS: every copy-ready prompt gets a working copy-to-clipboard button that\nconfirms it copied. Use navigator.clipboard with a textarea + execCommand fallback,\nbecause the clipboard API is often blocked on file:// URLs.\n\nILLUSTRATIONS: inline SVG generated from STACK — the whole stack as bands coloured\nby fit rating; a proportional bar of 🟢/🟡/🔴 with the reds called out; a topology\nshowing what runs on my machine versus somebody else’s; a learning ladder; a lock-in\nscale. No stock art, no icon fonts, no external images. Every figure expands FULL\nSCREEN with zoom in / out / reset and Esc. Never draw two labels at the same\ncoordinate — offset every repeated element by its index.\n\nAI AGENT — TWO MODES, DEFAULT NEEDS NO KEY:\n  MODE 1 (default) "Search — no key": answers from the local index, returns matching\n  passages as linked cards. No key, no network, works offline.\n  MODE 2 "Claude — needs key": my own Anthropic API key in localStorage, model and\n  scope pickers, answers ONLY from STACK and says so when something isn’t covered.\n  Tell it never to talk me out of a 🔴 rating. Every failure path points back to\n  Search mode. Call the API directly:\n\n  POST https://api.anthropic.com/v1/messages\n  headers: content-type: application/json\n           x-api-key: <the key the user pasted>\n           anthropic-version: 2023-06-01\n           anthropic-dangerous-direct-browser-access: true\n  body:    { model, max_tokens: 16000, system, messages: [{role, content}] }\n\n  Models: claude-opus-5 (default), claude-sonnet-5, claude-haiku-4-5.\n  Send output_config: {effort: "low"} on the first two ONLY — Haiku rejects it.\n  Read the reply from data.content where type === "text".\n  Check data.stop_reason === "refusal" before reading content.\n\nCOLABERRY FORMATTING:\n  background #eef2f6   text  #0f172a   accent #0f766e\n  cards      #ffffff   muted #64748b   borders #e2e8f0\n  radius 10-12px · soft shadows · "Segoe UI", system-ui, sans-serif\n  Fit ratings map to the semantic colours: 🟢 green, 🟡 amber, 🔴 red — and a\n  technology keeps its rating colour everywhere it appears. Support a dark theme.\n  Keep nav labels short enough that eight of them fit on one line.\n\n────────────────────────────────────────\n7. PORTABILITY — THIS RUNS ON MANY MACHINES\n────────────────────────────────────────\nPlain HTML, CSS, vanilla JS. No build step, no framework, no install, no server —\nopening index.html from disk must work. Classic <script src="..."> only; no ES\nmodules and no fetch() of local files, both blocked on file:// URLs. No CDN needed\nat all: draw every figure as inline SVG rather than pulling in a chart library.\n\n────────────────────────────────────────\n8. FINISH\n────────────────────────────────────────\nOpen project-blueprint/stack/index.html in my browser.\n\nWHEN FINISHED, REPORT: the exact path of the saved recommendation, the exact path of\nthe knowledge base, the fit-rating breakdown (how many 🟢 / 🟡 / 🔴), which\nrecommendations you were least confident about, and confirmation that every\ncomponent in my architecture has a row.',
        },
        diagram: `flowchart LR
  ASK["🗣️ 'what stack should I use?'"] --> TSR["🎨 tech-stack-recommender"]
  TSR --> MD["📄 tech-stack.md"]
  TSR --> KB["🌐 project-blueprint/stack/<br/>index.html — a browsable<br/>knowledge-base site"]`,
        script: 'If a non-technical student in the room can read the output and nod along, the Skill did its job. This build also produces a full browsable knowledge base under project-blueprint/stack/ — give it real time to finish before moving on.',
      },
      {
        segment: 'guided-build', eyebrow: '✨ Your Stack Isn’t Generic Anymore', title: 'Every pick is justified against YOUR idea, not a template',
        body: 'A generic stack recommendation says ‘use React and Postgres’ for everything. Yours says why — tied to your idea’s actual scale, actual users, actual day-one job. That difference is the entire point of grounding the Skill in your real architecture file instead of a canned answer.',
        bullets: [
          'Generic: one stack for every idea',
          'Yours: justified against your architecture, component by component',
          'Next: turn this into something you can actually show someone',
        ],
        diagram: `flowchart LR
  G["📋 Generic stack:<br/>same answer for everyone"] -.->|"vs."| Y["🎯 Your stack:<br/>justified per component"]`,
        script: 'Ask one student to say their #1 fit-rated pick out loud and the one-line reason. That reason is the proof this wasn’t a canned response.',
      },
      {
        segment: 'guided-build', eyebrow: '🚀 CP3 — Build + Scope mvp-scoper', title: 'Skill #3: not just a plan — a demo you can actually show someone',
        body: 'This is the payoff Skill, and it is multi-file on purpose. It produces three real things: a scoped Week-1 task list, a genuine visual HTML mockup of what the idea could look like, and a short marketing one-pager as a real, formatted PDF — who needs this, what it does, why it matters — so a friend, a mentor, or a recruiter can understand the idea in ten seconds. Scoped to Read, Write, and Bash: the first two write the plan and the mockup, Bash is what actually turns the one-pager into a real PDF.',
        bullets: [
          'Week-1 plan: the smallest real thing that proves this idea works',
          'A real, visual mockup.html — open it in a browser, it looks like a product',
          'A one-pager: who it’s for, what it does, why it matters — as a real PDF',
          'allowed-tools: Read, Write, Bash — Bash only to generate the PDF',
        ],
        code: {
          kind: 'paste',
          label: 'Claude Code prompt — build + scope mvp-scoper',
          pasteWhere: 'Claude Code',
          code: 'Create .claude/skills/mvp-scoper/SKILL.md and .claude/skills/mvp-scoper/template.md.\n\nDescription: Use when the user wants to know what to build first, see what their idea could look like, and get a short pitch for it.\n\nBody must produce THREE files in project-blueprint/:\n1. mvp-plan.md — the smallest real slice to build in Week 1 that proves the idea works, as a short checklist, grounded in architecture.md and tech-stack.md.\n2. mockup.html — a real, self-contained, visually appealing static HTML+CSS mockup of the idea’s main screen (a landing page or the core app view) — actual layout, actual sample content for THIS idea, not lorem ipsum, not a wireframe of boxes. Use color, icons, and real-feeling copy.\n3. one-pager.pdf — a short marketing one-pager, as a real single-page PDF: what it does, who needs it, one sentence on why it matters, using icons and short punchy lines, not a technical description. Generate it with whatever PDF tool is available (headless-Chrome print-to-PDF, a Python library such as reportlab, or a Node library such as puppeteer) — never save it as a renamed .md or .html file.\n\nUse template.md to keep mvp-plan.md’s structure consistent every time.\n\nAdd allowed-tools: Read, Write, Bash to the frontmatter — Read and Write cover the plan and the mockup; Bash is scoped narrowly to whatever single command actually generates the PDF, nothing broader.\n\nDo not commit yet.\n\nWHEN FINISHED, REPORT: every file created, its exact path, one line on what each contains, and which tool generated the PDF.',
        },
        diagram: `flowchart LR
  ARCH["📐 Architecture + 🎨 stack"] --> MVP["🚀 mvp-scoper"]
  MVP --> W1["✅ Week-1 task list"]
  MVP --> VIS["🖼️ Visual HTML mockup"]
  MVP --> MKT["📄 One-pager PDF"]`,
        script: 'This is the big one. When mockup.html is ready, open it in an actual browser on the projector before you do anything else — let the room see it.',
      },
      {
        segment: 'guided-build', eyebrow: '🧪 Test + Demo the Full Blueprint', title: 'Test mvp-scoper — open the mockup, open the PDF one-pager',
        body: 'Confirm mvp-scoper fires naturally. This one Skill reads what system-architect and tech-stack-recommender already produced — it does not re-run them. Then do the thing that makes tonight land: open mockup.html, and open the real one-page PDF it generated. This is the moment a rough paragraph becomes something a student would screenshot and send to a friend.',
        bullets: [
          'Ask naturally — confirm mvp-scoper auto-fires',
          'Reads architecture.md + tech-stack.md — never regenerates them',
          'Open mockup.html in an actual browser',
          'Open one-pager.pdf — a real PDF, not a markdown file',
          'This ask also builds a full browsable knowledge base — give it time',
        ],
        code: {
          kind: 'paste',
          label: 'Claude Code prompt — test + demo',
          pasteWhere: 'Claude Code',
          code: 'Given my architecture and stack, what should I build first, what could this look\nlike, and how would I pitch it to someone?\n\n────────────────────────────────────────\n0. READ FIRST — DO NOT REGENERATE\n────────────────────────────────────────\nRead project-blueprint/architecture.md and project-blueprint/tech-stack.md.\n\nBoth already exist. Do not rebuild, re-derive or overwrite either one — this run\nonly adds the MVP stage on top of them. If either file is missing, stop and tell\nme which one, rather than inventing it.\n\n────────────────────────────────────────\n1. WRITE project-blueprint/mvp-plan.md\n────────────────────────────────────────\nThe smallest real slice I could build in WEEK 1 — five working days — that\ngenuinely tests whether the idea works.\n\nThe whole discipline here is SUBTRACTION. Start from my architecture’s component\nlist and cut until only the risky part is left. Expect to delete most of it. A\nWeek 1 plan containing auth, a queue, a database and a deploy pipeline is not a\nWeek 1 plan — it is week one of a six-month project, and it proves nothing by\nFriday.\n\nSections, in this order:\n\n  • The one question Week 1 answers — one sentence. Not "build the app": the\n    single risky assumption that, if wrong, means nothing else is worth building.\n  • What you are building — 3 to 6 items, each naming the architecture component\n    it came from.\n  • What you are NOT building, and why that’s safe — a table, one row per cut,\n    each saying what it would prove and why that isn’t this week’s question.\n    This table should be LONGER than the one above.\n  • The stack, cut down to Week 1 — what I actually use this week versus the\n    fuller recommendation in tech-stack.md.\n  • Five days — Monday to Friday as a checklist. Each day names an OUTCOME, not\n    an activity: "gap list renders from a real résumé", not "work on extraction".\n    Friday is putting it in front of a real person.\n  • What "it worked" looks like — a specific, checkable bar somebody else could\n    apply without me in the room. A number or a yes/no, never "it feels good".\n  • What "it didn’t work" looks like — equally specific. Name the failure you\n    actually expect.\n  • What you’ll know on Friday, and what to do about it — a table with three\n    outcomes (pass / partial / fail) and the next move for each. The fail branch\n    must be allowed to say "stop and reconsider the product".\n  • What Week 1 deliberately proves nothing about — so nobody over-reads a good\n    result.\n\n────────────────────────────────────────\n2. WRITE project-blueprint/mockup.html\n────────────────────────────────────────\nA real, self-contained, visually appealing static HTML + CSS mockup of my idea’s\nMAIN SCREEN — the landing page or the core app view, whichever better sells it.\n\n  • REAL SAMPLE CONTENT for THIS idea. Actual names, actual numbers, actual copy\n    somebody would really see on that screen. Never lorem ipsum. Never\n    "Feature 1 / Feature 2". Never [placeholder].\n  • A DESIGNED SCREEN, NOT A WIREFRAME. Colour, icons, hierarchy, spacing, real\n    buttons. Grey boxes with labels on them is a failure.\n  • Show the PRODUCT, not the architecture. No boxes-and-arrows diagrams here.\n  • One file. Inline CSS and inline SVG icons only — no CDN, no external images,\n    no script tags. It must open from disk.\n  • If the idea involves people’s data, make the sample data obviously fictional\n    and say so in a footer line.\n\n────────────────────────────────────────\n3. WRITE project-blueprint/one-pager.pdf\n────────────────────────────────────────\nA short marketing one-pager, formatted as a real, single-page PDF: what it does,\nwho needs it, and one sentence on why it matters.\n\nBuild it as a genuine PDF file, not a renamed HTML file. Use whatever PDF\ngeneration is actually available on this machine — a headless-Chrome\nprint-to-PDF command, a Python library such as reportlab or weasyprint, or a Node\nlibrary such as puppeteer — in that order of preference. If none is available,\ninstall the lightest one that needs no compiler (prefer reportlab or similar)\nrather than leaving this as an HTML file. State which tool you used.\n\nIcons and short punchy lines, plenty of white space, one page, print-ready\nmargins. Written for a dean, a funder, or a colleague in a hallway.\n\nNO technical description: no component names, no technology names, no\narchitecture, no jargon at all. If a claim uses a number, say plainly whether it\nis measured or estimated.\n\n────────────────────────────────────────\n4. BUILD THE KNOWLEDGE BASE (multi-page)\n────────────────────────────────────────\nSame shape as my architecture and stack knowledge bases, under\nproject-blueprint/mvp/ so all three sit side by side:\n\n  index.html           Command Center\n  01-…html … 0N-…html  one page per section\n  assets/mvp.js        the data object\n  assets/site.js       shared rendering, nav, search, agent\n  assets/site.css      shared styles\n\nSections should cover: the bet · the five days · what’s cut · the mockup · the\npitch · did it work · appendix.\n\nCOMMAND CENTER: a responsive grid of tiles, one per section, each with an\ninline-SVG picture previewing what’s inside and a live count pulled from the data\n("10 cuts", "3 outcomes"). The whole tile is the link.\n\nEVERY SECTION PAGE: sticky nav, "← Command Center", breadcrumbs, previous/next at\nthe foot, scroll progress, back-to-top, search, theme toggle, print.\n\nONE DATA OBJECT: assets/mvp.js defines `const MVP = {...}` holding the question,\nwhat’s kept, every cut, the five days, the pass and fail bars, the outcomes and\nthe pitch. Every page renders from it. Nothing typed twice. (Note `const` at top\nlevel is NOT a property of window — other scripts must reference the bare\nidentifier.)\n\nSEARCH ACROSS THE WHOLE SITE: one plain-JavaScript index over every field of MVP,\neach entry tagged with its section. The nav box narrows the current page AND drops\ndown ranked matches from every other section, linked and highlighted. No model, no\nnetwork, works offline.\n\nTHE MOCKUP PAGE: link OUT to mockup.html with a large, obvious button — do NOT\nembed it in an iframe, because browsers block file:// iframes and it will render\nas a blank panel. Alongside the button, draw an inline-SVG schematic of the screen\nlayout and list the handful of things worth noticing on it.\n\nTHE PITCH PAGE: link OUT to one-pager.pdf the same way — a large, obvious button,\nnever embedded (file:// PDF embeds are just as unreliable as iframes). Summarise\nthe one-pager’s actual content on the page itself so the section is still useful\nwithout opening the PDF.\n\nILLUSTRATIONS: inline SVG generated from MVP — the whole week as inputs → one\nscreen → one person’s verdict; the five days as a strip; kept versus deleted; the\nFriday decision as a three-way fork. No stock art, no icon fonts, no external\nimages. Every figure expands FULL SCREEN with zoom in / out / reset and Esc.\nNever draw two labels at the same coordinate — offset every repeated element by\nits index. Keep nav labels short enough that they all fit on one line.\n\nAI AGENT — TWO MODES, DEFAULT NEEDS NO KEY:\n  MODE 1 (default) "Search — no key": answers from the local index, returns\n  matching passages as linked cards. No key, no network, works offline.\n  MODE 2 "Claude — needs key": my own Anthropic API key in localStorage, model and\n  scope pickers, answers ONLY from MVP. Tell it to protect the plan’s discipline —\n  never suggest adding back something the plan deliberately cut unless I ask what\n  it would cost. Every failure path points back to Search mode. Call the API\n  directly:\n\n  POST https://api.anthropic.com/v1/messages\n  headers: content-type: application/json\n           x-api-key: <the key the user pasted>\n           anthropic-version: 2023-06-01\n           anthropic-dangerous-direct-browser-access: true\n  body:    { model, max_tokens: 16000, system, messages: [{role, content}] }\n\n  Models: claude-opus-5 (default), claude-sonnet-5, claude-haiku-4-5.\n  Send output_config: {effort: "low"} on the first two ONLY — Haiku rejects it.\n  Read the reply from data.content where type === "text".\n  Check data.stop_reason === "refusal" before reading content.\n\nCOLABERRY FORMATTING (mockup and knowledge base alike):\n  background #eef2f6   text  #0f172a   accent #0f766e\n  cards      #ffffff   muted #64748b   borders #e2e8f0\n  radius 10-12px · soft shadows · "Segoe UI", system-ui, sans-serif\n  Semantic colours only — green good, amber warning, red risk, blue info, slate\n  neutral. Support a dark theme in the knowledge base.\n\n────────────────────────────────────────\n5. PORTABILITY — THIS RUNS ON MANY MACHINES\n────────────────────────────────────────\nPlain HTML, CSS, vanilla JS. No build step, no framework, no install, no server —\nopening index.html and mockup.html from disk must work. Classic <script src="...">\nonly; no ES modules and no fetch() of local files, both blocked on file:// URLs.\nNo CDN at all: draw every figure as inline SVG rather than pulling in a library.\n\nDo not commit anything.\n\n────────────────────────────────────────\n6. FINISH\n────────────────────────────────────────\nOpen project-blueprint/mockup.html in my browser, then\nproject-blueprint/mvp/index.html, then open project-blueprint/one-pager.pdf in my\ndefault PDF viewer.\n\nWHEN FINISHED, REPORT: whether mvp-scoper was invoked automatically, the exact\npaths of mvp-plan.md, mockup.html and one-pager.pdf with one line on what each\ncontains, which tool generated the PDF, the exact path of the knowledge base, how\nmany architecture components you kept versus cut, and confirmation that you did\nnot modify architecture.md or tech-stack.md.',
        },
        diagram: `flowchart LR
  RUN["🗣️ 'show me what this could<br/>look like, and how to pitch it'"] --> MVP["🚀 mvp-scoper<br/>(should auto-fire, reads-only<br/>architecture.md + tech-stack.md)"]
  MVP --> OPEN["🌐 mockup.html<br/>in your browser"]
  MVP --> PDF["📄 one-pager.pdf<br/>a real PDF"]
  MVP --> KB["🌐 project-blueprint/mvp/<br/>index.html — a browsable<br/>knowledge-base site"]`,
        script: 'This is the room-energy moment. Walk around while mockups open on screens — this is the closest thing tonight has to magic, and it should feel like it. This build also produces a full browsable knowledge base under project-blueprint/mvp/ — give it real time to finish before moving on.',
      },
      {
        segment: 'guided-build', eyebrow: '📦 Your Idea’s Blueprint', title: 'Three Skills, one committed folder: diagram, stack, and a demo',
        body: 'Commit .claude/skills/ and project-blueprint/ together. Anyone who pulls your repo — a mentor, a teammate, future you — gets the architecture, the justified stack, the Week-1 plan, and the visual mockup, generated from one paragraph you wrote an hour ago.',
        code: {
          kind: 'paste',
          label: 'Commit the blueprint',
          pasteWhere: 'your TERMINAL (not Claude Code)',
          code: 'git add .claude/skills project-blueprint\ngit commit -m "feat(blueprint): system-architect, tech-stack-recommender, mvp-scoper"',
        },
        diagram: `flowchart LR
  SA["🏗️ system-architect"] --> BP["📦 Your Blueprint"]
  TSR["🎨 tech-stack-recommender"] --> BP
  MVP["🚀 mvp-scoper"] --> BP
  BP --> DEMO["🎬 Demo it tonight"]`,
        script: 'Before the break, have two or three students share their mockup on screen. This is worth the two minutes it costs.',
      },
      {
        segment: 'failure', eyebrow: '💾 The Failure Nobody Warns You About', title: 'Your blueprint has one copy — and it lives on the one laptop in this room most likely to have a bad day',
        body: 'Everything built tonight — the architecture, the stack, the mockup, the PDF — exists in exactly one place right now: this machine. No error message is coming to warn you. A crashed drive, a reformatted laptop, or one careless git checkout can erase an hour of real work in a single command, and it will look identical to success until the moment it does not. The fix is not more caution. It is a habit, and the habit is git.',
        bullets: [
          'Everything tonight lives in ONE place: this laptop',
          'No warning, no error — it just quietly stays unsaved',
          'The fix isn’t caution. It’s a habit: commit early, commit often',
        ],
        diagram: `flowchart LR
  A["🖥️ Laptop only<br/>(tonight, right now)"] -.->|"one bad day"| B["💥 Gone"]
  A -->|"git commit"| C["📸 Saved snapshot"]
  C --> D["🛡️ Survives a crash,<br/>a reformat, a bad checkout"]`,
        script: 'This is the real failure tonight teaches — not a Skill bug, a saving bug. Ask the room: whose blueprint currently exists in exactly one place? Every hand should go up.',
      },
      {
        segment: 'failure', eyebrow: '📸 Git Basics: status → add → commit → log', title: 'Four commands. That is the entire lesson.',
        body: 'git status shows what changed since your last save point. git add stages exactly the files you want captured. git commit -m saves a permanent, named snapshot you can always return to. git log --oneline is your proof — a timestamped, ordered record that you actually built this, tonight. Run all four right now, on the blueprint you just built.',
        bullets: [
          'git status — what changed since your last commit',
          'git add <path> — stage exactly what you want saved',
          'git commit -m "message" — a permanent, named snapshot',
          'git log --oneline — the proof, in order, that you built this',
        ],
        code: {
          kind: 'paste',
          label: 'Run this now — commit tonight’s blueprint',
          pasteWhere: 'your TERMINAL (not Claude Code)',
          code: 'git status\n\ngit add .claude/skills project-blueprint\n\ngit commit -m "feat(blueprint): system-architect, tech-stack-recommender, mvp-scoper"\n\ngit log --oneline -5',
        },
        diagram: `flowchart LR
  S["🔍 git status<br/>what changed?"] --> Ad["➕ git add<br/>stage it"]
  Ad --> C["📸 git commit<br/>save it, named"]
  C --> L["📜 git log<br/>your proof, in order"]`,
        script: 'Run these four live, on your own machine, in order. When git log prints your commit, that line is the first real entry in your capstone’s paper trail — point at it and say so.',
      },
      {
        segment: 'failure', eyebrow: '🧰 Repo-less Setup', title: 'Get everything else ready — before you even have a live GitHub repo',
        body: 'Most of you have not created your capstone’s actual GitHub repository yet, and that is fine — that comes later in the program. But real, valuable setup work does not need to wait for a remote to exist: a README that explains what a stranger is looking at, and a .gitignore that keeps noise out of every future commit. Both are 100% local, both take two minutes, and both mean you look and act like someone who ships professionally the moment a remote does exist.',
        bullets: [
          'A README.md explaining what’s in project-blueprint/ — future you (and a recruiter) will thank you',
          'A .gitignore so Skill outputs never accidentally track junk (node_modules, .env, OS files)',
          'git log --oneline is your own proof-of-work ledger — screenshot it for your portfolio',
          'None of this needs a GitHub repo yet — all of it is fully local',
        ],
        code: {
          kind: 'paste',
          label: 'Claude Code prompt — draft README + .gitignore',
          pasteWhere: 'Claude Code',
          code: 'Look at what is currently in .claude/skills/ and project-blueprint/.\n\nCreate a README.md at the project root that explains, for someone who has never seen this project before: what the idea is, what the three Skills do (system-architect, tech-stack-recommender, mvp-scoper), and the exact prompt pattern to re-run them if the blueprint ever needs to be regenerated.\n\nCreate a .gitignore appropriate for a Node + Claude Code project if one does not already exist: node_modules, .env, .DS_Store, and any local build output. Never list an actual .env file’s contents — only ignore the filename.\n\nDo not commit anything yet — just create the two files.\n\nWHEN FINISHED, REPORT: the exact path of each file created, and confirm the .gitignore excludes .env without ever printing what is inside it.',
        },
        diagram: `flowchart LR
  L["💻 Local repo<br/>(already have it)"] --> R["📄 README.md"]
  L --> G["🚫 .gitignore"]
  R --> P["✅ Ready to push<br/>the moment a remote exists"]
  G --> P`,
        script: 'This is the last mile. You don’t need a live GitHub repo tonight to look like someone who ships professionally — you need a README, a .gitignore, and the habit you just practiced. Close by pointing at git log one more time: that is tonight’s real deliverable, not just the blueprint.',
      },
    ],

    beforeAfter: {
      label: 'One paragraph → a blueprint you can hand to someone',
      before: [
        'An idea you could describe out loud, but never show anybody',
        'Three Skills that belonged to a lab exercise, not to your project',
        'A stack you would have picked by whichever name you had heard of',
        'A mental note that you would write it up properly later',
        'Everything you made living in exactly one place: this laptop',
      ],
      after: [
        'An architecture diagram generated from your own paragraph, component by component',
        'Three Skills in .claude/skills/, committed and re-runnable on any idea',
        'A stack rated 🟢 / 🟡 / 🔴 against your project’s real scale, each pick justified',
        'A visual mockup and a one-page PDF a mentor or recruiter can read in ten seconds',
        'A git log with timestamps — proof that survives a closed laptop and a reformat',
      ],
    },

    storyBeats: {
      'result-preview': [
        {
          icon: '🏛️', tone: 'violet', eyebrow: 'Before you build — the story behind tonight',
          title: 'Every real system you have ever used started exactly where you are right now',
          body: 'Somewhere there is a napkin, a Slack message, or a one-paragraph email that was the entire spec for a system now worth millions. The founders did not wait until the idea was perfect. They wrote down who it was for, what it did, and the one thing it had to get right — then handed that paragraph to whoever could turn it into a diagram. Tonight, that whoever is Claude, and the paragraph is yours.',
          punch: 'A blueprint is not what you build after the idea is finished. It is what makes an unfinished idea real enough to argue with.',
        },
      ],
      'build-map': [
        {
          icon: '📐', tone: 'berry', eyebrow: 'Why architecture comes before code',
          title: 'Nobody pours a foundation before seeing the blueprint — the same rule applies here',
          body: 'A contractor who starts pouring concrete before the blueprint exists is not moving fast, they are gambling with the client’s money. The four checkpoints tonight exist for the same reason a real blueprint exists: so the expensive mistakes get caught on paper, in minutes, instead of in code, in weeks. system-architect is not a formality before the "real" work — it IS the real work, just faster than an architect could ever do it by hand.',
          punch: 'Slow is not the opposite of fast here. Guessing is.',
        },
      ],
      failure: [
        {
          icon: '💾', tone: 'cherry', eyebrow: 'A true story, told every cohort',
          title: 'He rebuilt four hours of work from a screenshot, because that was the only copy left',
          body: 'Devon spent a Thursday night exactly like this one and left with a blueprint he was genuinely proud of. The following Tuesday his laptop went in for a screen repair and came back reimaged, which is completely standard practice and which nobody thought to warn him about. Nothing was corrupted and no error was thrown. The folder simply was not there anymore. What he actually recovered was one screenshot of the mockup he had texted his sister, and he rebuilt the rest from that.',
          punch: 'Nothing failed. There was just never a second copy.',
        },
        {
          icon: '🧾', tone: 'amber', eyebrow: 'The proof you will want in twelve weeks',
          title: 'At the Expo somebody will ask when you actually built this, and a folder cannot answer',
          body: 'A folder of files has no history. It cannot show what existed on the first Thursday of the program, it cannot show the order things were made in, and it cannot show that the architecture came before the mockup rather than being tidied up afterwards. git log shows all three, with timestamps, in one command. Twelve weeks from now, defending this in front of a panel, that ordered list is the difference between describing your process and demonstrating it.',
          punch: 'Commit history is not admin. It is the only evidence you built it the way you say you did.',
        },
      ],
    },

    extraInteractions: [
      {
        segment: 'readiness', kind: 'poll',
        q: 'Three-point check — where are you?',
        options: [
          '✅ Workspace open, .claude/skills/ there, paragraph written',
          '📝 Set up, but I have not written my paragraph yet',
          '🧩 No .claude/skills/ folder yet',
          '😵 I need a mentor right now',
        ],
        eyebrow: '🚦 Roll call', title: 'Before anyone builds a Skill',
        presenterTip: 'Operational. Read the counts and send mentors to the last two options immediately. The second option is the one that quietly kills a Build Day — give those students sixty seconds right now to write who it is for, what it does, and the day-one job, and do not start CP1 until that count is near zero.',
      },
      {
        segment: 'result-preview', kind: 'poll',
        theater: true,
        q: 'system-architect hands you eleven components for an idea whose day-one job is one single thing. What is the right response?',
        options: [
          'Accept it — more components means it thought harder',
          'Make it trace each component back to your paragraph, then cut what cannot be traced',
          'Start building the biggest component first',
          'Add the two components you noticed it missed',
        ],
        answer: 1,
        reveal: 'A padded diagram is a worse answer than a small one, because every extra box is work somebody eventually has to justify, build, and maintain. The architect move is to make it trace each component back to specific words in your paragraph, then delete whatever cannot be traced. The Skill is fast. Reviewing it is still your job.',
        eyebrow: '📐 Judgment call', title: 'Eleven components. One day-one job.',
        presenterTip: 'Full-screen theater moment — lock the votes before revealing. Expect a genuine split, because "it thought harder" feels generous and "add the missing ones" feels engaged. Both are the same mistake: accepting output nobody made trace back to anything. This is the sentence to repeat all night — you direct, and you review.',
      },
      {
        segment: 'build-map', kind: 'poll',
        q: 'How ready do you feel to turn your idea into a real architecture tonight?',
        options: [
          '😬 Honestly nervous',
          '🙂 Cautiously ready',
          '😎 Let’s go',
          '🔥 Already sketching it in my head',
        ],
        eyebrow: '🌡️ Room check', title: 'Before we start building',
        presenterTip: 'Quick temperature check, no reveal needed — just read a few answers out loud to loosen the room up before CP0.',
      },
      {
        segment: 'guided-build', kind: 'poll',
        q: 'Rate how cool your deliverable is right now, honestly.',
        options: [
          '🙂 Solid',
          '😃 Really good',
          '🤩 Genuinely impressive',
          '🚀 I would show this to an investor tomorrow',
        ],
        eyebrow: '📣 Show it off', title: 'Rate your blueprint',
        presenterTip: 'Fires right after CP3 lands, while mockups are still open on screen. Read a few of the "🚀" answers out loud by name — this is the peak-energy moment of the night.',
      },
      {
        segment: 'guided-build', kind: 'poll',
        q: 'How much did tonight get your creative juices flowing for your actual capstone?',
        options: [
          '💧 A little',
          '🌊 A lot',
          '🌪️ I already have three new ideas',
          '🎢 I want to redo my whole idea now',
        ],
        eyebrow: '💡 Spark check', title: 'Did this change how you’re thinking about your project?',
        presenterTip: 'Pairs with the poll above — back-to-back reaction round right before the break. If several people pick the last two options, say so out loud; that is the class working.',
      },
      {
        segment: 'failure', kind: 'poll',
        q: 'You ran git commit and got back: "nothing added to commit but untracked files present". What happened?',
        options: [
          'Git is not installed properly',
          'You skipped git add — nothing was staged, so there was nothing to save',
          'Your files were deleted',
          'The commit already succeeded',
        ],
        answer: 1,
        reveal: 'Git will not guess what you meant to save. add stages, commit saves what was staged — and that message is git telling you it can see your files and is deliberately not touching them. Run git status, then git add, then commit again.',
        eyebrow: '🔧 Diagnose it', title: '"nothing added to commit"',
        presenterTip: 'Fires while people are actually running the four commands, when several in the room have this on screen right now. Take answers, reveal, then walk anyone stuck through git status out loud with you. Two minutes here saves ten later.',
      },
      {
        segment: 'failure', kind: 'poll',
        q: 'Be honest — how comfortable are you with git commands like add and commit right now?',
        options: [
          '😅 Still Googling every command',
          '🙂 I can follow along',
          '💪 I could teach this to someone else',
          '🧙 I dream in git log',
        ],
        eyebrow: '🧠 Self-check', title: 'Where you stand on git, right now',
        presenterTip: 'Ask this AFTER the git lesson, not before — it is a confidence check on what was just taught, not a cold-open poll. Reveal is unnecessary; just note the spread.',
      },
      {
        segment: 'demos', kind: 'poll',
        q: 'Turn your screen to the person next to you. Without saying a word, could they tell what your product does in ten seconds?',
        options: [
          '✅ Yes — they got it straight away',
          '🤏 Nearly — one thing needed explaining',
          '🙃 No, I had to talk them through it',
          '⏳ We did not get to try it',
        ],
        eyebrow: '🤝 The real test', title: 'Does it work without you in the room?',
        presenterTip: 'No wrong answer, and the middle two options are the useful ones — ask those students what sentence they had to say out loud, because that sentence is the thing missing from the mockup. Then close the week on it: tonight was about knowledge that survives you not being there, and a demo you have to narrate has not got there yet.',
      },
    ],
  },
};
