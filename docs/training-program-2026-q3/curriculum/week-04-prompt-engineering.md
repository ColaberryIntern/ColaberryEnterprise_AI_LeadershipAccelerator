# Week 4 Content Spec: Prompt Engineering + Enterprise Prompt Library

**Intensive:** 2 — Create Your AI Team  
**Theme:** Prompt Engineering + Enterprise Prompt Library  
**Type:** Colaberry-original (no dedicated Anthropic Skilljar course)  
**Background course:** Claude 101 (pre-program, already completed by all students)  
**Architecture Day:** Monday 2026-08-18  
**Build Day:** Thursday 2026-08-21  
**BC ticket:** https://app.basecamp.com/3945211/buckets/47502609/todos/9984355775  
**Status:** Pending Ali approval

---

## Purpose

Week 4 opens Intensive 2 (Create Your AI Team). Students arrive with a working Claude Code workspace, three reusable AI Skills, and a Business Workflow Assistant (Intensive 1). This week teaches them to write production-grade prompts and commit the **Enterprise Prompt Library** — a structured, version-controlled collection of reusable prompts that becomes a permanent, callable layer of their AI project throughout Weeks 5-12.

Anthropic has no dedicated Skilljar PE course. The read/watch layer is sourced from Anthropic's free public Prompt Engineering documentation. Claude 101 is pre-program background; students do not retake it this week.

---

## Learning Objectives

By the end of Week 4, a student can:

1. Name and apply the six PE techniques that produce the largest quality delta on Claude outputs: system prompts, role assignment, XML structure, multishot examples, chain-of-thought, prefill.
2. Write a reusable prompt template for one business-critical function in their project (analysis, drafting, classification, or summarization), including system block, task block, output format, and a worked example.
3. Evaluate any prompt against four criteria: specificity (no ambiguous verbs), completeness (all required context present), output shape (format explicitly stated), failure guard (what Claude should do if input is missing or malformed).
4. Assemble, test, and commit a 10-entry Enterprise Prompt Library organized by function, with every entry marked "Tested: pass."

---

## Read/Watch Layer

Assign before Architecture Day. Estimated pre-class time: 60 min.

| # | Resource | URL | What to read |
|---|---|---|---|
| 1 | Prompt Engineering Overview | https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview | Full page — sets the frame and defines what PE produces |
| 2 | Be Clear and Direct | https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/be-clear-and-direct | Full page — the single largest source of prompt quality failures |
| 3 | Use XML Tags | https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/use-xml-tags | Full page — structural clarity for multi-part prompts |
| 4 | Multishot Prompting | https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/multishot-prompting | Full page — how to teach Claude the expected output format with examples |
| 5 | Chain of Thought | https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/chain-of-thought | Full page — when to ask Claude to reason before answering |
| 6 | System Prompts | https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/system-prompts | Full page — role + persona as the behavioral frame for every agent |
| 7 | Anthropic Prompt Library | https://docs.anthropic.com/en/prompt-library | Browse 10 examples — students pick 3 relevant to their project track |

**Background only (not re-assigned):** Claude 101 — https://anthropic.skilljar.com/claude-101 (completed pre-program)

---

## Architecture Day — Monday 2026-08-18

**Format:** Live, instructor-led, 90 min

### Agenda

| Time | Block | Description |
|---|---|---|
| 0:00-0:15 | The PE gap | Live demo: same business task (RFP analysis), naive prompt vs. structured prompt. Instructor shows the output delta side-by-side in Claude Code. Students see why "just ask Claude" fails in production. |
| 0:15-0:45 | The 6 techniques | Instructor demonstrates each technique with a live Claude Code example. Students annotate one example prompt per technique in their architecture journal. Techniques in order: system prompt, role assignment, XML structure, multishot, chain-of-thought, prefill. |
| 0:45-1:05 | Prompt anatomy dissection | Instructor presents a complete Tier-A business prompt (executive meeting summary). Students label each element: system block, role, context, task, output format, multishot example, failure guard. Class confirms each label. |
| 1:05-1:20 | Enterprise Prompt Library introduction | What it is: a version-controlled file in their Claude Code project. Why it exists: reusable prompts prevent prompt drift across agents. Walk through the template (see Artifact Spec below). Show a 5-prompt example library. |
| 1:20-1:30 | Build Day assignment | Instructor assigns: build 10 prompts using the template, test each one, commit as `prompts/enterprise-prompt-library.md`. Students leave with the template pre-loaded in their project. |

---

## Build Day — Thursday 2026-08-21

**Format:** Lab, live or async, 90 min

### Lab Assignment: Enterprise Prompt Library v1.0

Students build and commit their Enterprise Prompt Library. The library is a permanent artifact that their MCP servers, subagents, and governance layer will call throughout Weeks 5-12.

---

## Tier-A Artifact: Enterprise Prompt Library

### File location in student project
```
prompts/enterprise-prompt-library.md
```

### Prompt entry template (every entry must follow this exactly)

```markdown
## [Category] — [Prompt Name]

**Purpose:** [one sentence — what business task this prompt executes]
**When to use:** [the trigger — what event or need causes you to run this prompt]
**Inputs required:** [list each {{VARIABLE}} and what value it expects]

**Prompt:**
<system>
You are [role]. You [behavioral frame — what Claude is doing and for whom].
Output format: [exact format — bullet list / numbered list / JSON / paragraph].
If [failure condition], respond with: "[exact fallback text]".
</system>
<task>
{{CONTEXT}}

{{TASK_INSTRUCTION}}

Output: [format restatement with example structure if needed].
</task>

**Worked example:**
- Input: {{CONTEXT}} = "..." | {{TASK_INSTRUCTION}} = "..."
- Output: [3-5 sentence realistic Claude response]

**Tested:** [pass / needs revision] | **Version:** 1.0
```

### Required 10 entries (one per category)

| # | Category | Business task |
|---|---|---|
| 1 | Executive Summary | Summarize a document (5+ pages) into 5 bullets for a C-suite audience |
| 2 | Meeting Notes | Extract decisions, owners, and deadlines from a raw meeting transcript |
| 3 | Requirement Analysis | Identify gaps and ambiguities in a business requirement document |
| 4 | Risk Assessment | Surface the top 3 risks in a project plan with likelihood and impact |
| 5 | Email Draft | Draft a professional follow-up email from a set of meeting notes |
| 6 | Code Review | Review a code block for correctness, security issues, and readability |
| 7 | Data Classification | Classify a list of items into predefined categories with confidence score |
| 8 | Stakeholder Update | Write a weekly status update from a set of bullet points |
| 9 | Decision Brief | Structure a go/no-go recommendation with problem, options, risks, and recommendation |
| 10 | Student's Choice | One prompt specific to their project's primary use case (student defines the category) |

### Acceptance criteria for Tier-A

- [ ] 10 entries present, one per required category
- [ ] Every entry uses the template exactly (system block, task block, inputs, worked example, tested status)
- [ ] Every entry marked "Tested: pass" — the student ran the prompt in Claude Code and got an acceptable output
- [ ] File committed at `prompts/enterprise-prompt-library.md` with commit message: `feat(prompts): enterprise prompt library v1.0`
- [ ] Instructor can read, run, and evaluate every prompt without asking the student for clarification

---

## Assessment Hooks (for Swati's assessment pack)

### Warmup quiz (5 questions, before Architecture Day)

1. What is the purpose of a system prompt in Claude? (Answer: sets role, behavioral frame, and output constraints before the task begins)
2. Multishot prompting means giving Claude: (a) many tokens, (b) multiple worked examples, (c) repeated instructions. (Answer: b)
3. XML tags in a prompt serve what function? (Answer: separate distinct sections so Claude processes them as independent units, preventing content bleed)
4. Name one reason chain-of-thought prompting improves accuracy on complex tasks. (Answer: forces Claude to reason step-by-step before committing to an output, catching errors in intermediate logic)
5. "Prefill" in Claude PE means: (Answer: providing the opening words of Claude's response to constrain its format and prevent preamble)

### Post quiz (10 questions, after Build Day)

Questions test practical application, not recall:
- Given a prompt, identify which of the 6 techniques are present and which are missing
- Given a business scenario, write the correct system prompt (open-ended, 2-3 sentences)
- Given a flawed prompt (ambiguous verb, no output format, no failure guard), identify each flaw and rewrite the faulty element
- Given two prompts producing different output quality on the same task, explain why (requires applying the 4-criteria rubric)
- Describe what "Tested: pass" means in the context of the Enterprise Prompt Library (not just "it ran" — the output matches the worked example shape and quality)

### Week 4 feedback survey (4 questions)

1. "The six PE techniques are clear and I can apply them to my own prompts." (1-5 scale)
2. "The Enterprise Prompt Library template gave me enough structure to complete all 10 entries without additional guidance." (1-5 scale)
3. "I understand the difference between a prompt that works once and a prompt that is production-ready." (1-5 scale)
4. Open: "Which of your 10 prompts was hardest to write, and what made it hard?"

---

## NotebookLM Video Hooks (for Swati)

**One video, target length 12-15 min.**

| Segment | Duration | Content |
|---|---|---|
| Why prompts fail in production | 3 min | The gap between "it worked in the demo" and "it works reliably at 9pm on a Friday." Show 2 real failure examples: vague instruction produces vague output; missing output format produces inconsistent structure across runs. |
| The 6 techniques, one per minute | 6 min | One concrete business example per technique. Use the Anthropic Prompt Library as source material — pick 6 examples across the categories. |
| Walk the template | 3 min | Fill out one complete prompt entry live using the Week 4 template. Narrate each field decision aloud. |
| The commit | 2 min | Show a completed 10-entry library. Run git commit. Explain why version control on prompts matters: prompt drift is a production reliability problem. |

**Source material:** the 7 read/watch resources listed above + Anthropic Prompt Library (https://docs.anthropic.com/en/prompt-library) for worked examples.

---

## Non-Goals (Week 4 scope boundary)

These are explicitly deferred:

| Deferred topic | Where it belongs |
|---|---|
| Prompt caching and API-level optimization | Week 3 (Claude API) — already covered |
| Tool use / function calling in prompts | Weeks 2+ (Agent Skills) — already covered |
| Multi-step prompt chains beyond introduction | Week 6 (Advanced MCP) — part of MCP integration |
| Loading the prompt library into MCP | Week 5 (MCP Foundations) — students wire it there |
| Governance audit trail for prompt usage | Week 10 (Governance) |
| Prompt-level UI for student portal | Design E (portal build, separate Epic) |

---

## Done Criteria

This week is complete when ALL of the following are true:

- [ ] Ali approves this spec
- [ ] The 7 read/watch resources are accessible via the links above (Anthropic public docs — no login required)
- [ ] Swati has built the assessment pack (5-question warmup + 10-question post quiz + 4-question feedback survey) using the hooks above
- [ ] Swati has produced the NotebookLM video (12-15 min) from the source material above
- [ ] The Enterprise Prompt Library template is embedded in the student portal Week 4 page (Design E dependency — deferred until Epic 1/2 land)
- [ ] Swati sign-off on full week as launch-ready
