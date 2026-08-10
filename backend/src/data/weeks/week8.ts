/**
 * week8.ts — the complete authored content pack for WEEK 8,
 * "Claude Code Workflows + Automation" (Intensive 3 · Connect AI To The Real World).
 *
 * Arc beat: "The work runs itself; you stop being the trigger."
 *
 * Week 8 is the week the human stops being the starting gun. Weeks 1-7 built
 * capability, reach, and a team of agents — but every one of those things still
 * waits for a person to remember to type something. This week converts the
 * remembering into infrastructure: custom slash commands (a repeatable prompt
 * becomes a verb), hooks (deterministic guardrails that fire on an event),
 * headless / SDK runs (Claude Code with nobody watching, and the permission-mode
 * decision that comes with it), and GitHub Actions reviewing every PR.
 *
 * The judgment being taught, not the mechanics: WHAT SHOULD BE A HOOK VERSUS
 * WHAT SHOULD BE AN INSTRUCTION IN CLAUDE.md. A hook is code, so it is reliable
 * in a way a prompt instruction can never be. An instruction is a request; a
 * hook is a guarantee. Anything you can enforce in code should be enforced in
 * code. That distinction is the spine of both days.
 *
 * Recurring devices used: "the person who isn't there" = the reviewer on
 * vacation, so the PR just sits. Trust ladder = it now runs on a schedule and
 * coordinates other agents. The 2 AM question returns as "it ran at 2 AM and
 * nobody was there to stop it."
 *
 * Authoring rules honoured: every teach slide carries its own mermaid diagram
 * (<= 7 short-labelled nodes, <br/> for line breaks) so it stays legible when
 * click-zoomed full screen; every code block is either a Claude Code PROMPT
 * (kind 'paste', with an explicit paste target) or code the room READS together
 * (kind 'review'); shell and CI config name their real destination; model IDs
 * and API shapes are current; every slide has an instructor script.
 */
import type { WeekPack } from '../weekPack';

export const WEEK8_PACK: WeekPack = {
  week: 8,
  arcBeat: 'The work runs itself; you stop being the trigger.',

  /* ======================================================================== */
  /*  MONDAY — Architecture Day                                               */
  /* ======================================================================== */
  monday: {
    hook: {
      headline: 'Every system you have built so far has one single point of failure: you remembering to start it.',
      caption: 'Tonight we remove you from the critical path — and discover that a rule you can enforce in code is worth ten rules you wrote down and hoped for.',
    },

    teach: [
      /* ========================= check-in ================================= */
      {
        segment: 'checkin', eyebrow: '🔔 Honest roll call', title: 'Seven weeks of building, and every single thing still waits for you to press go',
        body: 'Take a real inventory. Your Week 2 Skill fires when you open a session. Your Week 5 MCP server answers when you ask it something. Your Week 7 subagent team runs when you kick it off. Every one of those is genuinely impressive, and every one of them has the same single point of failure sitting in this room right now. If you get pulled into a meeting, none of it happens. That is not a capability. That is a very talented tool waiting for a hand.',
        bullets: [
          'Skills, MCP servers, subagents — all of them wait for a human trigger',
          'Miss a day and the work simply does not occur; nothing alerts you',
          'You are not the architect yet, you are the ignition switch',
          'Tonight: the trigger becomes part of the system, not part of your memory',
        ],
        diagram: `flowchart LR
  Y["👤 You remember"] --> T["⌨️ You type<br/>the prompt"]
  T --> W["🤖 The work<br/>happens"]
  N["😴 You forget"] --> Z["🚫 Nothing<br/>happens at all"]`,
        script: 'Open with the inventory as a live question, not a statement: "name one thing you built in the last seven weeks that has run since — without you starting it." Wait. Almost no hands. Do not rescue the silence; that silence is the entire premise of tonight, and letting the room sit in it for four seconds is worth more than any slide.',
      },
      {
        segment: 'checkin', eyebrow: '🗺️ The map', title: 'Four surfaces tonight — and one question that matters more than all four',
        body: 'Claude Code is not only a thing you talk to. It exposes four surfaces that turn it into automation you can commit to a repository. Custom commands package a prompt into a verb. Hooks are shell commands the harness runs at fixed points in the agent lifecycle, every time, no matter what the model decides. Headless mode and the SDK run it with nobody watching. GitHub Actions puts it on every pull request. But underneath all four sits one judgment call you will make for the rest of your career: which of your rules deserve to be code, and which are fine as words.',
        bullets: [
          '1️⃣ Custom commands — a repeatable prompt becomes a verb your team inherits',
          '2️⃣ Hooks — deterministic guardrails that fire on an event, not on good intentions',
          '3️⃣ Headless + SDK — unattended runs, and the permission decision that comes with them',
          '4️⃣ GitHub Actions — a reviewer who never goes on vacation',
          '🧭 The question under all four: hook, or instruction in CLAUDE.md?',
        ],
        diagram: `flowchart TD
  T["📚 Tonight"] --> C["1️⃣ Commands<br/>a prompt becomes a verb"]
  T --> H["2️⃣ Hooks<br/>fire every time"]
  T --> HL["3️⃣ Headless + SDK<br/>nobody watching"]
  T --> CI["4️⃣ CI review<br/>on every PR"]
  T --> J["🧭 Hook, or<br/>instruction?"]`,
        script: 'Put the four words on the board and leave them up all night. Then point at the fifth node and say the promise plainly: "three of these are mechanics you could learn from a doc page in twenty minutes. The fifth one is judgment, it takes years to get wrong enough to learn, and you are getting it tonight for free."',
      },

      /* ====================== business problem ============================ */
      {
        segment: 'business-problem', eyebrow: '🧾 The tax', title: 'The bottleneck was never the code. It is the ceremony around every change.',
        body: 'Think about what actually happens after Claude writes something for you. You run the tests. You format the files. You read the diff. You write a description of what changed and why. You open the pull request. You nudge somebody to look at it. None of that is thinking — it is ceremony, it is identical every time, and it is where the hours go. A team that gets faster at writing code and no faster at the ceremony around it has not gotten faster at all. It has just moved the queue.',
        bullets: [
          'The ritual after every change: test, format, describe, open, nudge',
          'Identical every time, which is exactly what makes it automatable',
          'Writing the change got 10× faster; the ceremony did not move',
          'Speed you cannot repeat is a good day, not a capability',
        ],
        diagram: `flowchart LR
  CH["✍️ The change<br/>(now fast)"] --> T["🧪 Test"]
  T --> F["🎨 Format"]
  F --> D["📝 Describe it"]
  D --> P["📬 Open the PR"]
  P --> N["🙏 Nudge someone"]`,
        script: 'Ask for a show of hands: "who has done all five of those, by hand, in the last week?" Then the follow-up that lands it: "how many times?" Somebody will say a number over ten. Write that number on the board and leave it there — you will point back at it when /ship exists.',
      },
      {
        segment: 'business-problem', eyebrow: '🏖️ The person who is not there', title: 'The reviewer is on vacation, so the pull request just sits',
        body: 'Here is the version of this you have actually lived. The change is done. The tests are green. It is sitting in a pull request waiting for the one person who knows that part of the system, and that person is on a beach with their phone off. So it waits. Two days becomes five. The author moves on and forgets the context. Somebody eventually approves it without really reading it, because the alternative is that it sits another week. Nobody in that story did anything wrong. The process simply had one human in it and that human was, reasonably, on holiday.',
        bullets: [
          'The work was finished on Tuesday and shipped the following Monday',
          'The delay had nothing to do with difficulty and everything to do with availability',
          'The eventual approval was a rubber stamp, because waiting cost more than reading',
          'Week 2 called this out: knowledge that lives in one head is the enemy',
        ],
        diagram: `flowchart LR
  PR["📬 PR opened<br/>Tuesday"] --> W["⏳ Waiting"]
  W --> V["🏖️ Reviewer<br/>on vacation"]
  V --> W
  W --> R["🖐️ Rubber stamp,<br/>Monday"]`,
        script: 'This is the recurring device for the week — the analyst who was out in Week 2, the one engineer who understood the integration in Week 6, now the reviewer on vacation. Name that lineage out loud so the room hears the pattern repeating. Then set the hook for tonight: "by Thursday, that PR gets a real review within ninety seconds of being opened, whether or not anybody is at a desk."',
      },
      {
        segment: 'business-problem', eyebrow: '🔑 The thesis of the week', title: 'An instruction is a request. A hook is a guarantee.',
        body: 'You have a CLAUDE.md. Some of you have written a rule in it like "always run the tests before committing." It is a good rule. It is also, technically, a suggestion — it goes into the context window alongside everything else, it competes for attention with a long session and a big diff, and most of the time it wins. Most of the time. A hook is not in the context window at all. It is a shell command the harness runs at a fixed lifecycle event, and it does not care what the model concluded. If it exits with code 2, the thing does not happen. Not usually. Ever. That difference — persuasion versus enforcement — is the whole of this week.',
        bullets: [
          'CLAUDE.md rule → read by the model → followed most of the time',
          'Hook → executed by the harness → runs every time, in every mode',
          'A hook is CODE, which is why it is reliable; the model cannot argue with it',
          'Rule of thumb: anything you can enforce in code should be enforced in code',
          'Words are for judgment. Code is for boundaries.',
        ],
        diagram: `flowchart TD
  R["📜 A rule you have"] --> Q{"🧭 Can code<br/>check this?"}
  Q -->|"yes"| H["🪝 Make it a HOOK<br/>= a guarantee"]
  Q -->|"no — needs taste"| C["📄 Put it in CLAUDE.md<br/>= a request"]
  H --> E["✅ Enforced<br/>every single time"]
  C --> M["🤞 Followed<br/>most of the time"]`,
        script: 'Slow down. This is the slide people quote back to you in Week 10 and again at the Expo. Say the two sentences deliberately and let them land: "an instruction is a request. A hook is a guarantee." Then ask one person to read a rule out of their own CLAUDE.md, and ask the room which side of that diagram it belongs on. Do not answer for them — the argument is the lesson.',
      },
      {
        segment: 'business-problem', eyebrow: '⚖️ What it buys, what it costs', title: 'Removing yourself from the loop removes your judgment too',
        body: 'Be clear-eyed about the trade you are making tonight. When you were the trigger, you were also the last line of defence — you saw the diff before it went anywhere, and if something looked wrong you simply did not press go. Automation deletes that moment. The work happens whether or not it should. So everything you used to decide in the moment now has to be decided in advance and written down as something that executes: which tools it may use, which paths it may touch, what counts as done, and what it must never do. That is not paperwork. That is the price of admission for unattended work, and it is exactly what the rest of tonight is.',
        bullets: [
          'You were the trigger AND the veto — automation removes both at once',
          'Every in-the-moment judgment becomes a pre-declared rule',
          'Scope (what it may touch) + verification (what counts as done) = the two halves',
          'Trust ladder, where you are now: it runs on a schedule and coordinates other agents',
        ],
        diagram: `flowchart LR
  B["🙋 Before:<br/>you press go"] --> V["👀 You see it<br/>before it lands"]
  A["🤖 After:<br/>it presses go"] --> N["🌙 Nobody sees it<br/>before it lands"]
  N --> D["📐 So: scope + verification<br/>declared in advance"]`,
        script: 'Name the trust-ladder position out loud — Week 1 they approved every keystroke, tonight the system runs on a schedule and coordinates other agents. Then be honest about the cost: "you are giving up the moment where you would have caught it. We are going to replace that moment with something that never gets tired." Straight into the architecture segment.',
      },

      /* ========================= architecture ============================= */
      {
        segment: 'architecture', eyebrow: '🗂️ The map', title: 'All four surfaces live in your repository, which is the point',
        body: 'None of tonight lives in a settings screen on somebody laptop. Custom commands are Markdown files. Hooks are shell scripts referenced from a JSON file. Permissions are a block in that same JSON. CI review is a YAML file in .github. Every one of them is committed, reviewed, and inherited — a teammate who clones your repo gets your automation for free and cannot accidentally not have it. That is what separates automation from a personal shortcut: a shortcut lives in your head, automation lives in version control.',
        bullets: [
          '.claude/commands/*.md — one file per command, filename becomes the verb',
          '.claude/settings.json — hooks + permissions, committed and team-shared',
          '.claude/settings.local.json — your personal overrides, git-ignored',
          '.claude/hooks/*.sh — the guardrail scripts themselves',
          '.github/workflows/*.yml — the reviewer that runs in CI',
        ],
        code: {
          kind: 'review',
          label: 'The automation layer of a real repo — read it, do not type it',
          code: '.claude/\n  settings.json          # hooks + permissions  (COMMITTED — the team contract)\n  settings.local.json    # your personal overrides (git-ignored)\n  commands/\n    ship.md              # -> becomes the /ship command\n    review.md            # -> becomes the /review command\n  hooks/\n    commit-guard.sh      # PreToolUse — can veto a tool call\n    format.sh            # PostToolUse — runs after an edit lands\n.github/workflows/\n  claude-review.yml      # AI review comments on every PR (advisory)\n  verify.yml             # tests + typecheck (the REQUIRED merge gate)',
          expectedResult: 'Put your finger on two lines: settings.json is committed, settings.local.json is not. That split is the whole team-versus-personal design.',
        },
        diagram: `flowchart TD
  R[("📁 Your capstone repo")] --> C["📄 .claude/commands/<br/>the verbs"]
  R --> S["⚙️ .claude/settings.json<br/>hooks + permissions"]
  R --> H["🪝 .claude/hooks/<br/>the guard scripts"]
  R --> G["🐙 .github/workflows/<br/>CI review + gate"]
  R --> T["👥 Teammate clones<br/>and inherits all of it"]`,
        script: 'Open a real repo on screen with these files in it — yours, not a slide. Then say the line that makes it click: "your automation is code, so it gets reviewed like code, versioned like code, and inherited like code. Nobody on your team has to be told about your /ship command. They just have it."',
      },
      {
        segment: 'architecture', eyebrow: '🔤 Surface 1', title: 'A custom command is how a repeatable prompt becomes a verb',
        body: 'You have almost certainly typed the same long prompt four times this month. A custom command is that prompt, saved as a Markdown file, where the filename becomes the command. Drop ship.md into .claude/commands and /ship exists immediately — no restart, no registration. The frontmatter is where you scope it: a description for the menu, an argument hint, and allowed-tools, which limits what this particular command may reach regardless of what it asks for. $ARGUMENTS carries whatever the user typed after the command name into the body.',
        bullets: [
          'Filename → the verb: ship.md becomes /ship, review.md becomes /review',
          'The body is just a prompt — plain English, the same words you already type',
          '$ARGUMENTS (or $1, $2) injects what the user typed after the command',
          'allowed-tools in frontmatter is least privilege at the command level',
          'Commit it and your standard becomes the team standard, not a preference',
        ],
        code: {
          kind: 'review',
          label: '.claude/commands/ship.md — the ceremony, written down once',
          code: '---\ndescription: Test, format, and draft a PR for the current change\nargument-hint: [pr-title]\nallowed-tools: Bash(npm test:*), Bash(npm run format:*), Bash(git diff:*), Bash(git add:*)\n---\n1. Run `npm test`. If anything fails, STOP and report the failures. Do not continue.\n2. On green, run `npm run format` and stage the changes.\n3. Read `git diff --staged` and draft a PR description titled: $ARGUMENTS\n   with a Summary, a Test Evidence line quoting the passing output, and a Risk note.',
          expectedResult: 'Nine lines. Notice allowed-tools has no git push and no git commit — this command can prepare a change, and structurally cannot ship one.',
        },
        diagram: `flowchart LR
  P["⌨️ A prompt you<br/>keep retyping"] --> F["📄 .claude/commands/<br/>ship.md"]
  F --> V["🔤 /ship<br/>exists instantly"]
  V --> A["🎯 allowed-tools<br/>scopes its reach"]
  F --> T["👥 Committed —<br/>the team has it too"]`,
        script: 'Create the file live and then type a slash in your session so the room watches /ship appear in the menu with no restart. Then point at allowed-tools and ask: "what can this command NOT do?" Somebody will spot that push and commit are missing. That is the answer you want out loud — scoping is a design decision, not a formality.',
      },
      {
        segment: 'architecture', eyebrow: '🪝 Surface 2', title: 'A hook is a contract with the harness: JSON in, exit code out',
        body: 'Hooks feel mysterious until you see the protocol, and the protocol is three lines long. At each lifecycle event the harness runs your shell command and pipes it a JSON payload on standard input describing what is about to happen or just happened. Your command reads that payload, decides, and answers with an exit code. Zero means proceed. Two, from a PreToolUse hook, blocks the tool call entirely and feeds your stderr back to Claude as the reason. That is it. The three events that matter this week are PreToolUse, which can veto; PostToolUse, which reacts after a tool succeeded; and Stop, which decides whether the session is allowed to end.',
        bullets: [
          'Events: PreToolUse · PostToolUse · UserPromptSubmit · Stop · SessionStart',
          'Input: JSON on stdin — .tool_name, .tool_input, .cwd, .hook_event_name',
          'Output: exit 0 = allow · exit 2 = block, and stderr becomes the reason Claude sees',
          'matcher scopes a hook to specific tools: "Bash" or "Edit|Write|MultiEdit"',
          '$CLAUDE_PROJECT_DIR makes the path portable for everyone who clones the repo',
        ],
        code: {
          kind: 'review',
          label: '.claude/hooks/commit-guard.sh — read the protocol, do not paste it',
          code: '#!/usr/bin/env bash\n# Runs BEFORE every Bash tool call. The harness pipes JSON on stdin.\ninput=$(cat)\ncmd=$(echo "$input" | jq -r \'.tool_input.command // empty\')\n\nif echo "$cmd" | grep -qE \'git push --force|rm -rf /\'; then\n  echo "Blocked: that command is on the never-run list." >&2   # stderr = the reason\n  exit 2                                                       # exit 2 vetoes the call\nfi\nexit 0                                                         # exit 0 = proceed',
          expectedResult: 'Three moving parts and no cleverness: read stdin, decide, exit. The exit code is the entire API.',
        },
        diagram: `flowchart LR
  A["🤖 Claude wants<br/>to run a tool"] --> HN["🪝 Harness runs<br/>your hook"]
  HN --> J["📨 JSON on stdin"]
  J --> D{"🧭 Exit code?"}
  D -->|"0"| GO["✅ Tool runs"]
  D -->|"2"| NO["🚫 Blocked —<br/>stderr tells Claude why"]`,
        script: 'Trace the diagram once with your finger, then say the sentence that demystifies hooks permanently: "the harness hands your script an envelope and asks a yes-or-no question. Your exit code is the answer." Once a room owns that, hooks stop being scary and start being the tool people over-use, which is the next slide problem.',
      },
      {
        segment: 'architecture', eyebrow: '🧭 The judgment call', title: 'Which of your rules deserve to be code — and which do not',
        body: 'Now the part that is actually hard. Not every rule should be a hook, and a room that just learned about exit code 2 will try to make everything one. The test is simple: can a script check this without understanding intent? Tests passing, no key in the diff, no push to main, files formatted — those are mechanically checkable, so they belong in code, and leaving them as words is a choice to be unreliable. But "explain the trade-off in the PR description," "prefer composition over inheritance," "match the tone of the existing docs" — no script can grade those. Those are taste, and taste belongs in CLAUDE.md where a model that understands language can apply it.',
        bullets: [
          'Mechanically checkable → HOOK. Tests green, no secret in the diff, no push to main',
          'Requires understanding intent → CLAUDE.md. Naming, tone, trade-off explanations',
          'The mistake people make: writing an enforceable rule as prose, then blaming the model',
          'The other mistake: hooking something subjective and fighting a script all day',
          'A hook that fires constantly and wrongly gets disabled — and then you have neither',
        ],
        code: {
          kind: 'review',
          label: 'The same rule, written two ways — read them side by side',
          code: '# ---- Way 1: an INSTRUCTION (CLAUDE.md) ---------------------------------\n#   "Never commit without running the tests first."\n#   -> loaded into context at session start\n#   -> competes with a 40-file diff for the model attention\n#   -> obeyed most of the time. Most.\n\n# ---- Way 2: a GUARANTEE (.claude/settings.json) ------------------------\n{\n  "hooks": {\n    "PreToolUse": [\n      { "matcher": "Bash",\n        "hooks": [ { "type": "command",\n                     "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/commit-guard.sh" } ] }\n    ]\n  }\n}\n#   -> runs before EVERY Bash call, interactive and headless alike\n#   -> exit 2 and the commit does not happen. Not usually. Ever.',
          expectedResult: 'Same rule, two reliability classes. One is a request you hope lands; the other is a boundary the model cannot reason its way past.',
        },
        diagram: `flowchart TD
  R["📜 A rule"] --> Q{"🔍 Can a script<br/>check it?"}
  Q -->|"yes"| H["🪝 Hook —<br/>enforce it"]
  Q -->|"no, needs taste"| C["📄 CLAUDE.md —<br/>ask for it"]
  H --> W["⚠️ But: wrong hooks<br/>get disabled"]
  C --> L["📉 Accept: it holds<br/>most of the time"]`,
        script: 'Run this as the theater poll — read four candidate rules aloud and make the room vote hook or instruction before you reveal. The one that splits the room every time is "always add a test for new behaviour," and the honest answer is that coverage is checkable but usefulness is not. Sit in that argument. Then close with the warning on the right-hand branch: a hook that fires wrongly gets turned off within a week, and a disabled hook protects nothing.',
      },
      {
        segment: 'architecture', eyebrow: '🌙 Surface 3', title: 'Headless mode: the same agent, with nobody in the chair',
        body: 'Interactive Claude Code assumes a person is present to approve things. Headless mode does not. You run claude with -p and a prompt, it runs the task to completion, prints a result, and exits — no approvals, no questions. Ask for JSON output and you get back a machine-readable receipt: whether it errored, what it produced, how many turns it took, and what it cost. That receipt is the whole reason headless matters, because it means the next program in your chain can read the outcome and decide what to do rather than a human squinting at a terminal. Put that command in a cron line or a CI step and you have a routine.',
        bullets: [
          '-p runs one prompt to completion, non-interactive, then exits',
          '--output-format json returns is_error, result, num_turns, total_cost_usd',
          '--max-turns caps a runaway loop — the same brake you learned in Week 3',
          '--allowedTools scopes the run before it starts, not while it is running',
          'A routine is just this command on a schedule: cron, CI, or a queue worker',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'your TERMINAL (not Claude Code)',
          label: 'Terminal — one scoped headless run, with a receipt',
          code: '# Runs to completion with no approvals, then prints a JSON receipt.\nclaude -p "Add a one-line JSDoc comment to every exported function in src/utils.ts" \\\n  --permission-mode acceptEdits \\\n  --allowedTools "Read" "Edit" \\\n  --output-format json \\\n  --max-turns 10',
          expectedResult: 'A JSON object, not a conversation. Look for is_error, result, num_turns, and total_cost_usd.',
          stopCondition: 'You have a JSON receipt on screen and can point at the field a program would branch on (is_error).',
          rescue: 'Hanging with no output? It is almost always waiting on a permission it was never granted — narrow the task or widen --allowedTools by one specific tool, never by removing the flag.',
        },
        diagram: `flowchart LR
  T["⏰ A trigger<br/>cron · CI · queue"] --> H["🌙 claude -p<br/>no human present"]
  H --> S["🎯 Scoped tools<br/>+ max turns"]
  S --> R["🧾 JSON receipt<br/>is_error · cost"]
  R --> N["➡️ Your program<br/>decides what next"]`,
        script: 'Run it live and pretty-print the JSON. Then say the part that reframes it: "nobody touched the keyboard and it handed back a receipt. That receipt is the difference between automation and hoping." Mention the SDK in one line — the same engine as a library, query() from TypeScript or Python — and promise they wire it Thursday. Do not detour into SDK syntax here.',
      },
      {
        segment: 'architecture', eyebrow: '🎛️ The trust dial', title: 'Permission mode is the single most consequential line in an unattended run',
        body: 'This deserves its own slide because it is where unattended work goes badly wrong. Default mode asks you before edits and shell commands — the supervised baseline, and useless headless because there is nobody to ask. acceptEdits writes files without asking but still gates shell commands. Plan mode reads and proposes and changes nothing, which makes it the correct mode for anything whose job is to review. And bypassPermissions skips every prompt entirely, which is only ever defensible inside a disposable sandbox you would be happy to delete. Independently of mode, the allow and deny lists in settings.json scope which tools and paths are reachable at all — and deny wins.',
        bullets: [
          'default — asks before edits and Bash; correct interactively, useless headless',
          'acceptEdits — edits freely, still gates shell; the usual choice for a routine',
          'plan — reads and proposes, mutates nothing; the right mode for a reviewer',
          'bypassPermissions — no prompts at all; disposable sandboxes only, never your repo',
          'allow / deny lists apply in every mode, and an explicit deny beats an allow',
        ],
        code: {
          kind: 'review',
          label: '.claude/settings.json — least privilege for an unattended run',
          code: '{\n  "permissions": {\n    "allow": [\n      "Read", "Edit",\n      "Bash(npm test:*)", "Bash(npm run format:*)",\n      "Bash(git add:*)", "Bash(git commit:*)"\n    ],\n    "deny": [\n      "Bash(git push:*)", "Bash(git reset --hard:*)",\n      "Bash(rm -rf:*)", "Read(./.env)", "Read(./secrets/**)"\n    ]\n  }\n}',
          expectedResult: 'Read the deny list out loud. This routine can build and commit; it cannot ship, cannot destroy history, and cannot read a secret.',
        },
        diagram: `flowchart LR
  D["🙋 default<br/>asks first"] --> AE["✍️ acceptEdits<br/>edits, gates shell"]
  AE --> BP["☠️ bypassPermissions<br/>sandbox only"]
  P["👓 plan<br/>reads, proposes"] -.->|"the reviewer mode"| AE
  AL["🚧 allow / deny<br/>applies in every mode"] -.-> AE`,
        script: 'Ask the question before you reveal: "your routine runs at 3 AM on your capstone repo. Which mode?" Take votes. The answer is acceptEdits plus a deny on push, and the reasoning matters more than the answer — what is the worst thing that happens if it goes wrong? An uncommitted mess you read over coffee. Least privilege turned a catastrophe into a Tuesday.',
      },
      {
        segment: 'architecture', eyebrow: '🐙 Surface 4', title: 'A reviewer that is never on vacation, and never allowed to approve',
        body: 'Now put it in the pipeline. The Claude Code GitHub Action runs on every pull request, reads the diff, and leaves review comments before a human opens the tab. That is the reach — the PR from the opening story gets a substantive first read within ninety seconds instead of five days. But notice the two constraints that make it safe rather than reckless. It is scoped to read-only tools, so it comments and structurally cannot change your code. And it is advisory: the thing that actually decides whether a PR can merge is a separate, boring, deterministic job that runs your tests and typecheck, wired into branch protection as a required check. The probabilistic reviewer advises. The deterministic check votes.',
        bullets: [
          'anthropics/claude-code-action@v1 on pull_request opened and synchronize',
          'Scoped to read tools — it can comment, it cannot edit, approve, or merge',
          'The API key is a repository secret, never a literal in the YAML',
          'The merge gate is a separate required job running tests + typecheck',
          'Same principle as the hook, one level up: advice from the model, decisions from code',
        ],
        diagram: `flowchart LR
  PR["📬 PR opened"] --> A["🤖 Claude review<br/>read-only tools"]
  A --> CM["💬 Inline comments<br/>advisory only"]
  PR --> V["🧪 verify job<br/>tests + typecheck"]
  V --> G{"🚦 Required check"}
  G -->|"green"| M["✅ Human may merge"]
  G -->|"red"| B["🚫 Merge blocked"]`,
        script: 'Land the keystone of the week here: "the AI review talks; the test job votes." Say why that split is not timidity — a reviewer that can approve its own work is a rubber stamp with extra steps. Then close the loop on the opening story: the reviewer on vacation still gets to be the human who approves, they just no longer block the first read.',
      },

      /* ========================== deconstruct ============================= */
      {
        segment: 'deconstruct', eyebrow: '🌙 The 2 AM run', title: 'It ran at two in the morning, and it did everything right except the part that mattered',
        body: 'Here is a real shape of failure, and it looks completely healthy the whole way through. A nightly routine picks up a task, reads the repo, edits four files, and pushes to main. It never errored. The logs are clean. The commit message is well written. But one of the edits broke an import that only fails at runtime, the tests would have caught it, and the tests were never run — because nothing in the configuration required them. At nine the next morning the site was down and the git blame pointed at an automation nobody had watched. No one prompted it badly. The prompt was fine.',
        bullets: [
          'Ran with bypassPermissions, so nothing scoped what it could touch',
          'Edited files, broke an import, and never ran a single test',
          'Pushed directly to main because push was never denied',
          'Zero errors, clean logs, confident commit message — and a dead site',
        ],
        diagram: `flowchart LR
  T["⏰ 2 AM trigger"] --> E["✍️ Edits 4 files"]
  E --> BR["💥 Breaks an import"]
  BR --> C["📦 Commits<br/>no tests run"]
  C --> P["🚀 Pushes to main"]
  P --> D["😵 9 AM:<br/>site is down"]`,
        script: 'Tell it slowly and without a villain — that is what makes it frightening. "Nobody wrote a bad prompt. Nobody was careless. The configuration was wrong, and configuration is invisible at 2 AM." Then set up the next slide as forensics rather than blame: we are going to find every place a five-line guardrail would have ended this.',
      },
      {
        segment: 'deconstruct', eyebrow: '🔎 Forensics', title: 'Four gates it walked straight past — any one of them was enough',
        body: 'Replay it and mark the misses. Gate one, permissions: it ran with everything allowed, so nothing scoped the blast radius. Gate two, a PostToolUse hook: a typecheck after every edit would have surfaced the broken import within seconds of it being written. Gate three, a Stop hook: a verification gate would have refused to let the session finish on a red build. Gate four, the deny list: git push was never denied, so it shipped. Four independent, cheap controls, and the failure had to beat all four to reach production. It only had to beat zero.',
        bullets: [
          '🚫 No scoped permissions → an allow/deny list bounds the blast radius',
          '🧪 No post-edit check → a PostToolUse typecheck hook catches the broken import',
          '🛑 No finish gate → a Stop hook refuses to end the session on red',
          '🔒 push not denied → deny Bash(git push:*) and a human ships it',
          'Defense in depth: you do not need one perfect control, you need four cheap ones',
        ],
        diagram: `flowchart TD
  F["💥 The 2 AM failure"] --> G1["🚫 Gate 1: permissions<br/>MISSED"]
  F --> G2["🧪 Gate 2: PostToolUse<br/>MISSED"]
  F --> G3["🛑 Gate 3: Stop hook<br/>MISSED"]
  F --> G4["🔒 Gate 4: deny push<br/>MISSED"]`,
        script: 'Draw the timeline on the board and put a visible X at each of the four points. Then ask the room the question that makes it stick: "which of these four would you personally have thought of before tonight?" Usually the honest answer is one. That gap is exactly what a checklist is for, and it is why we do this as forensics rather than as a lecture on best practice.',
      },
      {
        segment: 'deconstruct', eyebrow: '🥪 The shape of safe', title: 'Probabilistic in the middle, deterministic on both sides',
        body: 'Step back and look at what all four gates have in common — none of them make the model smarter. Underneath, the shape of every safe automation is the same. In the middle sits the model: creative, capable, and genuinely unpredictable, and you should not try to fix that. Below it is a layer of deterministic control that decides by fixed rules which actions are even permitted. Above it is a layer of deterministic verification that formats, typechecks, and proves the result before anything is allowed to stand. The model only reaches the outside world through those two slices. You get the creativity and you get the boundaries, and neither has to compromise.',
        bullets: [
          'Bottom slice — PreToolUse + permissions: what is allowed to happen at all',
          'Middle — the model: reasoning, judgment, the part you cannot make deterministic',
          'Top slice — PostToolUse + Stop + CI: what is allowed to stand',
          'The agent touches the world only through the deterministic slices',
          'This is the founding principle of the whole program, drawn as a picture',
        ],
        diagram: `flowchart TD
  TOP["🛡️ Verify: PostToolUse<br/>· Stop · CI check"] --> W["🌍 The real world"]
  M["🧠 The model<br/>creative, unpredictable"] --> TOP
  BOT["🚧 Control: PreToolUse<br/>· allow / deny"] --> M
  IN["📥 A task arrives"] --> BOT`,
        script: 'Draw the sandwich literally on the board — bread, filling, bread. "The filling is brilliant and unpredictable. The bread is boring and guaranteed. You do not fix unpredictability by making the model boring; you fix it by controlling the boundaries." Tell them to keep this picture, because on Thursday they build both slices with their own hands on their own repo.',
      },

      /* ========================== micro-build ============================= */
      {
        segment: 'micro-build', eyebrow: '📁 Set the stage', title: 'Open YOUR capstone repo — everything tonight lands in the project you are actually building',
        body: 'This is not a sandbox exercise. Open the repository your build plan lives in, the one with your own tasks in it, because the automation you write in the next thirty minutes is automation you will still be using in Week 12. Create the two folders that hold it. These are terminal commands, not a Claude Code prompt — that distinction matters all night, and every code block tonight tells you which one it is on the chip at the top.',
        bullets: [
          'Use YOUR capstone repo, not a scratch folder — this is real infrastructure',
          '.claude/commands holds the verbs, .claude/hooks holds the guardrails',
          'These are TERMINAL commands; the paste target is on every block tonight',
          'If your project is not a git repo yet, fix that now — Thursday assumes it is',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'your TERMINAL (not Claude Code)',
          label: 'Terminal — from inside your capstone repo',
          code: '# 1. confirm you are in the right place — this must print YOUR project\npwd\ngit remote -v\n\n# 2. create the automation layer\nmkdir -p .claude/commands .claude/hooks\n\n# 3. confirm\nls -la .claude',
          expectedResult: 'pwd prints your capstone project, git remote shows your GitHub URL, and ls shows commands/ and hooks/.',
          stopCondition: 'Everyone is inside their OWN repo with .claude/commands and .claude/hooks existing. Nobody proceeds from Downloads.',
          rescue: 'git remote prints nothing? You are in a folder that is not a repo yet, or not the project you think. Fix which folder you are in before anything else tonight.',
        },
        diagram: `flowchart LR
  R[("📁 Your capstone repo")] --> M["⌨️ mkdir .claude/<br/>commands + hooks"]
  M --> C["🔤 Verbs live here"]
  M --> H["🪝 Guardrails live here"]
  C --> G["📦 Committed —<br/>it travels with the project"]`,
        script: 'Walk the room and physically check that people are in their own project. Every cohort has three students who quietly do the whole night in a throwaway folder and get nothing they can keep. Catch them here, in the first two minutes, not at the break.',
      },
      {
        segment: 'micro-build', eyebrow: '🛠️ Micro-build 1', title: 'Turn the prompt you keep retyping into a verb',
        body: 'Pick the thing you have typed at Claude Code more than three times on this project. Maybe it is "run the tests and tell me what broke," maybe it is "summarize what changed since yesterday," maybe it is your own version of the ceremony from earlier. That is your first command. Direct Claude Code to author it — you are not writing Markdown by hand, you are specifying what the command must do and then reading what came back, which is the same job you have had since Week 1.',
        bullets: [
          'Pick a prompt from YOUR project, not a generic example',
          'Claude Code writes the file; you read it and approve the scope',
          'Insist on allowed-tools — an unscoped command is a habit you will regret',
          'The moment the file exists, the command exists. No restart.',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          ccMode: 'Plan Mode',
          label: 'Claude Code prompt — author my first custom command',
          code: 'I want to turn a prompt I keep retyping into a custom slash command in this project.\n\nThe prompt I keep retyping is: [WRITE YOURS HERE, in your own words].\n\nCreate .claude/commands/<a-short-verb>.md with:\n- frontmatter: a one-line description, an argument-hint if it takes an argument, and an allowed-tools list containing ONLY the tools this command actually needs\n- a body that is the prompt itself, written as numbered steps, using $ARGUMENTS wherever the user input belongs\n\nBefore you write it, tell me which tools you are going to put in allowed-tools and why each one is necessary. If any step could modify or push code, say so explicitly and ask me whether I want that in scope.\n\nShow me the file before you create it.',
          expectedResult: 'A short Markdown file with scoped frontmatter, plus a spoken justification for every tool in allowed-tools.',
          stopCondition: 'You have read the allowed-tools line and can say out loud what this command CANNOT do.',
          rescue: 'It proposed a wide-open allowed-tools list? That is the normal first draft. Tell it to remove every tool the numbered steps do not literally require, and watch the list get shorter.',
        },
        diagram: `flowchart LR
  P["🔁 A prompt you<br/>retype constantly"] --> CC["💻 Claude Code<br/>Plan Mode"]
  CC --> F["📄 .claude/commands/<br/>yours.md"]
  F --> R["👀 You read<br/>allowed-tools"]
  R --> V["🔤 /yourverb<br/>now exists"]`,
        script: 'Make everyone say their retyped prompt out loud to a neighbour before pasting — a vague answer here produces a useless command. Then have two people read theirs to the room. The specific ones produce visibly better files and the room notices immediately, which saves you an argument.',
      },
      {
        segment: 'micro-build', eyebrow: '👀 Read it together', title: 'Nine lines, and only one of them is a security decision',
        body: 'Open the file Claude Code just wrote — the real one, on your screen, not this slide. There are only two things worth putting your finger on. The body is a prompt: plain English, no syntax to learn, exactly what you would have typed. And allowed-tools is the only line that constrains anything. Everything else is labelling. A command with no allowed-tools inherits whatever the session has, which on Thursday means it inherits whatever your unattended routine has, and that is how a helper quietly becomes a hazard.',
        bullets: [
          'The body is just your prompt — nothing to learn, which is the point',
          'allowed-tools is the only enforcement line in the file',
          'Omit it and the command inherits the session permissions, which grow over time',
          'Yours will differ in wording; those two properties must be present',
        ],
        code: {
          kind: 'review',
          label: 'A finished command file — read it, do not paste it',
          code: '---\ndescription: Summarize what changed on this project today\nargument-hint: [since, e.g. yesterday]\nallowed-tools: Bash(git log:*), Bash(git diff:*), Read\n---\nRead the git log $ARGUMENTS for this repository.\n\nSummarize in four bullets: what shipped, what is in progress, what is blocked,\nand any change that touched a file listed as protected in CLAUDE.md.\nKeep it under 80 words. Do not edit anything.',
          expectedResult: 'Two fingers on two things: the body is a prompt, and allowed-tools contains no Edit and no Write — this command physically cannot change your code.',
        },
        diagram: `flowchart TD
  F["📄 The command file"] --> D["🏷️ description<br/>= the menu entry"]
  F --> A["🎯 allowed-tools<br/>= the only real limit"]
  F --> B["📝 body<br/>= your prompt"]
  A --> S["🛡️ No Edit means<br/>it cannot mutate"]`,
        script: 'Open the REAL generated file, not the slide — the slide is your safety net if Claude Code drifted. Ask one question and wait: "if you deleted the allowed-tools line, what would this command be able to do?" The answer — anything the session can — is the reason scoping is not optional.',
      },
      {
        segment: 'micro-build', eyebrow: '🪝 Micro-build 2', title: 'Now write the guarantee: a hook that fires on every single edit',
        body: 'Commands are convenience. This is the part that changes what your project is. Add a PostToolUse hook matched to the file-writing tools, so that after every edit Claude makes, your formatter runs. Not when it remembers. Not when you ask. Every time, including in the headless run you have not written yet, including on your teammate machine, including at 2 AM. Then go and delete the formatting rule out of your CLAUDE.md, because you no longer need to ask for something that now happens by itself.',
        bullets: [
          'matcher "Edit|Write|MultiEdit" scopes the hook to file writes',
          'The hook reads the edited path out of the JSON payload on stdin',
          'It runs deterministically — the model has no vote in whether it fires',
          'Then remove the equivalent CLAUDE.md line: it is enforced now, not requested',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — add a formatting hook to this project',
          code: 'Add a PostToolUse hook to .claude/settings.json in this project (create the file if it does not exist, and do not touch settings.local.json).\n\nIt should:\n- use the matcher "Edit|Write|MultiEdit"\n- run a command that reads the edited file path from the hook JSON on stdin (.tool_input.file_path) and pipes it to this project formatter\n- do nothing harmlessly when there is no path in the payload, rather than erroring\n\nUse whatever formatter this project actually uses — look at package.json or the config files and tell me which one you found before you write anything.\n\nAfter it is wired, tell me exactly how I can prove it fired, and then check my CLAUDE.md and tell me whether any rule in it is now redundant because this hook enforces it.',
          expectedResult: 'A hooks block in .claude/settings.json using this project real formatter, plus a named way to prove it fired and a list of now-redundant CLAUDE.md lines.',
          stopCondition: 'You have edited a deliberately messy file, watched it come back formatted without asking, and deleted at least one line from CLAUDE.md.',
          rescue: 'Nothing happened? Ninety percent of the time the hook is fine and the formatter command is wrong — run that command by hand in your terminal first and fix it there.',
        },
        diagram: `flowchart LR
  E["✍️ Claude edits<br/>a file"] --> HK["🪝 PostToolUse<br/>fires, always"]
  HK --> P["📨 Reads file_path<br/>from stdin JSON"]
  P --> F["🎨 Formatter runs"]
  F --> C["🗑️ Delete the CLAUDE.md<br/>rule — it is enforced now"]`,
        script: 'The deletion is the teaching moment, not the hook. When somebody removes a formatting line from their CLAUDE.md, stop the room and read it out: "that line has been a polite request for six weeks. It is now a fact." That is the sentence that carries the week.',
      },
      {
        segment: 'micro-build', eyebrow: '🌙 Micro-build 3', title: 'One small unattended run on your own repo — and read the receipt',
        body: 'Last thing tonight: take yourself out of the loop for one small, safe, reversible task on your own project. Scope the tools tightly, cap the turns, ask for JSON, and run it. Two things to notice when it comes back. Your formatting hook fired inside that run even though nobody was there — that is the guarantee proving itself. And the JSON is a receipt a program could branch on: is_error decides whether a scheduler retries, total_cost_usd decides whether you can afford to run it hourly. That is a routine in miniature, and on Thursday you put it on a schedule and give it a pull request to open.',
        bullets: [
          'Pick something small and reversible from your own build plan',
          '--allowedTools scoped, --max-turns capped, --output-format json',
          'Your hook fires in here too — guardrails do not care that nobody is watching',
          'is_error and total_cost_usd are what a scheduler actually reads',
          'Thursday: this becomes a routine, plus a reviewer on every PR',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'your TERMINAL (not Claude Code)',
          label: 'Terminal — your first unattended run, on your own project',
          code: '# Replace the prompt with one small, reversible task from YOUR build plan.\nclaude -p "Add a one-line comment above every exported function in <one file> explaining what it does. Change nothing else." \\\n  --permission-mode acceptEdits \\\n  --allowedTools "Read" "Edit" \\\n  --output-format json \\\n  --max-turns 10 \\\n  | jq "{ok: (.is_error|not), turns: .num_turns, cost: .total_cost_usd, result}"',
          expectedResult: 'A four-field summary: ok true, a turn count, a cost, and a one-line result — and a git diff showing formatted comments you never asked to be formatted.',
          stopCondition: 'You have run git diff and seen a change that a machine made, on your project, with nobody watching.',
          rescue: 'No jq installed? Drop the pipe and read the raw JSON — the fields are all there, it is only less pretty.',
        },
        diagram: `flowchart LR
  P["📋 A task from<br/>your build plan"] --> H["🌙 claude -p<br/>scoped + capped"]
  H --> HK["🪝 Your hook fires<br/>anyway"]
  HK --> R["🧾 JSON receipt"]
  R --> TH["📅 Thursday:<br/>on a schedule + a PR"]`,
        script: 'Have people run git diff afterwards and actually look at what a machine did to their own project while they sat there. Then close the loop on the opening question: "seven weeks and nothing had ever run without you. Something just did." Point at Thursday explicitly — a routine on a schedule, a hook that blocks a red commit, and a reviewer who is never on vacation. Tell them to bring the repo with Actions enabled.',
      },
    ],

    storyBeats: {
      checkin: [
        {
          icon: '⏰', tone: 'amber', eyebrow: 'Change of pace — the honest audit',
          title: 'The most fragile component in your entire system is that you have to remember it',
          body: 'Every process that depends on a person remembering has a failure rate, and it is never zero. Hospitals learned this the hard way: brilliant, careful surgeons were skipping steps not out of ignorance but because a human under load forgets, so the fix was never better doctors, it was a checklist somebody else reads out loud whether or not anyone feels it is necessary. Your automation has the same shape. The weakest part of everything you have built is not the model, the prompt, or the code.',
          punch: 'It is a person with a calendar, a commute, and a bad week.',
        },
      ],
      'business-problem': [
        {
          icon: '🏖️', tone: 'berry', eyebrow: 'The person who is not there — again',
          title: 'She had one week off in eighteen months, and the whole pipeline noticed',
          body: 'She was the only person who really understood that service, so every change to it waited for her. She took a week in July. Four pull requests stacked up behind her out-of-office reply, and by Thursday somebody approved two of them without reading, because the alternative was another week of nothing shipping. She came back to a codebase with two changes in it that nobody had actually reviewed, including her. The bottleneck was not her knowledge. It was that the knowledge had exactly one copy.',
          punch: 'Week 2 said knowledge in one head is the enemy. Week 8 says the same about availability.',
        },
      ],
      architecture: [
        {
          icon: '✈️', tone: 'violet', eyebrow: 'Change of pace — why the checklist beat the memo',
          title: 'A pilot who forgets an instruction is human. A gate that lets him take off is a design flaw.',
          body: 'Aviation spent decades writing better instructions, and crews kept missing steps anyway, because instructions compete with fatigue and time pressure and the eighty other things in a cockpit. What actually moved the numbers was converting the checkable items into things that physically interrupt you: a gear-warning horn, a challenge-and-response the other pilot must answer, a switch you cannot move until another one is set. Nobody decided pilots were untrustworthy. They decided that anything a machine can verify should not be left to a person under load.',
          punch: 'That is the whole of tonight. Words for judgment. Code for boundaries.',
        },
      ],
      deconstruct: [
        {
          icon: '🌙', tone: 'cherry', eyebrow: 'The 2 AM question returns',
          title: 'It worked perfectly all night, and that was the problem',
          body: 'Week 3 asked whether anything happens at all when nobody is at the keyboard. Week 6 asked whether the failure is loud or quiet. Tonight the question gets harder, because the run at 2 AM did not fail — it succeeded, confidently, at doing the wrong thing, and every log line said so. There was no exception to catch, no alert to fire, no red anywhere. The only thing that could have stopped it was a rule that ran whether or not the model agreed with it, and nobody had written one.',
          punch: 'A system that fails loudly wakes you up. A system that succeeds wrongly lets you sleep.',
        },
      ],
      'micro-build': [
        {
          icon: '🗝️', tone: 'leaf', eyebrow: 'Change of pace — what you are actually leaving behind',
          title: 'Six months later, someone you have never met will type your verb',
          body: 'The command you write in the next ten minutes goes into your repository, and repositories outlive the people who start them. Somebody joins the project long after you, clones it, types a slash, and finds a verb that encodes how you thought a change should be shipped: tests first, evidence in the description, a risk note nobody can skip. They will not know it was a preference. To them it will simply be how this project works.',
          punch: 'Week 2 you taught it once. Tonight you teach everyone who comes after you, once.',
        },
      ],
    },

    extraInteractions: [
      {
        segment: 'cold-open', kind: 'poll',
        q: 'Something you built in the last seven weeks — has it run since, without you starting it?',
        options: ['Yes, on its own', 'Only when I run it', 'It has not run since class', 'I honestly do not know'],
        eyebrow: '🔔 Opening read', title: 'Be honest — has any of it run without you?',
        presenterTip: 'This is the premise of the entire night, so ask it before you teach anything. The bars will pile onto the middle two options. Read the count out loud without judgement, then say: "that is not a criticism, that is the definition of where you are on the ladder. Tonight we move."',
      },
      {
        segment: 'checkin', kind: 'poll',
        q: 'Is your capstone repo open in Claude Code right now?',
        options: ['✅ Open and it is a git repo', '📁 Open but not a git repo yet', '🔍 Cannot find the right folder', '😵 Not set up at all'],
        eyebrow: '🚦 Room check', title: 'Everything tonight lands in YOUR project',
        presenterTip: 'Operational, not a teaching question. Anything but the first option goes to a mentor in the next three minutes. Do not begin the architecture segment with people who have nowhere to put what they learn — they will spend the night watching instead of building.',
      },
      {
        segment: 'business-problem', kind: 'poll',
        q: 'Your CLAUDE.md says "always run the tests before committing." Claude committed without running them. What actually failed?',
        options: [
          'The model ignored a clear instruction',
          'The instruction was not specific enough',
          'Nothing failed — an instruction was never a guarantee',
          'CLAUDE.md was not loaded that session',
        ],
        answer: 2,
        reveal: 'Nothing malfunctioned. You wrote a request and expected enforcement. A rule in CLAUDE.md is read, weighed against everything else in context, and followed most of the time. If "most of the time" is not good enough for that rule, it was never an instruction — it was a hook you had not written yet.',
        eyebrow: '🧭 The core judgment', title: 'It broke your rule. Whose fault is it?',
        presenterTip: 'Most rooms split between the first two options, and both are the trap — they lead to rewriting the sentence more forcefully, which changes nothing. Take votes, reveal, then say the line: "you can rewrite that rule in bold and it will still be a request." This question sets up the entire architecture segment.',
      },
      {
        segment: 'architecture', kind: 'poll',
        theater: true,
        q: 'Which of these four rules belongs in a HOOK rather than in CLAUDE.md?',
        options: [
          'Explain the trade-off you chose in the PR description',
          'Never commit when the tests are red',
          'Prefer composition over inheritance',
          'Match the tone of the existing documentation',
        ],
        answer: 1,
        reveal: 'Only one of these can be checked by a script that understands nothing about intent: run the tests, read the exit status, done. The other three need someone who can read meaning, which is exactly what a model is for. Mechanically checkable goes in code. Taste stays in words. Get that backwards and you either fight a script all day or trust a sentence you should not have.',
        eyebrow: '🧭 The decision of the week', title: 'Hook, or instruction? Choose, and defend it.',
        presenterTip: 'Full-screen theater — the one stop-everything moment tonight. Lock the votes, show the spread, and take one argument for a wrong answer BEFORE revealing; the argument for option 1 is genuinely interesting and worth ninety seconds. Then reveal and give the rule they will carry: anything you can enforce in code should be enforced in code.',
      },
      {
        segment: 'architecture', kind: 'trivia',
        q: 'A nightly routine runs on your capstone repo with nobody watching. Which permission mode?',
        options: [
          'default — it will ask if it needs something',
          'acceptEdits, with git push in the deny list',
          'bypassPermissions — otherwise it will get stuck',
          'plan — safest possible option',
        ],
        answer: 1,
        reveal: 'default is useless headless because there is nobody there to answer the question. plan cannot change anything, so nothing gets done. bypassPermissions is only ever defensible in a sandbox you would happily delete. acceptEdits plus an explicit deny on push means the worst case is an uncommitted mess you read over coffee.',
        eyebrow: '🎛️ Knowledge check', title: 'Pick the mode before you pick the task',
        presenterTip: 'Fast — vote, reveal, one line of why, move on. If a chunk of the room picks bypassPermissions, that is worth an extra thirty seconds: ask what the worst case is on their own repo, and let them say it out loud.',
      },
      {
        segment: 'deconstruct', kind: 'poll',
        q: 'Your PreToolUse hook is wired up but nothing is ever blocked. What do you check FIRST?',
        options: [
          'The matcher pattern',
          'Whether the script is executable and exits 2',
          'The model you are using',
          'Whether CLAUDE.md mentions the hook',
        ],
        answer: 1,
        reveal: 'Almost always one of two things: the script is not executable, so the harness cannot run it at all, or it is running fine and exiting 0. Exit 2 is what blocks — anything else, including a crash, lets the call through. Check chmod +x and check the exit code, in that order, before you touch the matcher.',
        eyebrow: '🔧 Diagnose it', title: 'The hook is silent. Where do you look?',
        presenterTip: 'A real debugging question, and both failure modes will happen to somebody on Thursday. After the reveal, tell them to write those two checks in their notes — it will save twenty minutes of build time in two days.',
      },
      {
        segment: 'micro-build', kind: 'poll',
        q: 'Did your custom command show up when you typed a slash?',
        options: ['✅ It is there and it ran', '📄 File exists but no command', '🤔 Still writing the file', '😵 Stuck — need help'],
        eyebrow: '🚦 Build check', title: 'Everyone gets a verb before we move on',
        presenterTip: 'Operational. Call the numbers out loud ("19 of 24 — five more"). The "file exists but no command" group is almost always in the wrong directory or missing the frontmatter fence; send a mentor with that one hint and it clears in a minute.',
      },
      {
        segment: 'trailer', kind: 'poll',
        q: 'Honestly — which rule in your CLAUDE.md are you least confident actually gets followed?',
        options: [
          'The one about running tests',
          'The one about file size or structure',
          'The one about never touching a protected path',
          'I have not read my CLAUDE.md in weeks',
        ],
        eyebrow: '🌡️ Self-check', title: 'No right answer — which rule do you quietly not trust?',
        presenterTip: 'No correct option, and the last one is the honest one for half the room. Say so. Then hand them Thursday homework in one sentence: "whatever you just picked, come on Thursday knowing whether a script could check it. If it could, you are converting it into a hook."',
      },
    ],
  },

  /* ======================================================================== */
  /*  THURSDAY — Build Day                                                    */
  /* ======================================================================== */
  thursday: {
    teach: [
      /* =========================== build map ============================== */
      {
        segment: 'build-map', eyebrow: '🎯 Tonight', title: 'By 8:30 your repo reviews its own pull requests and refuses its own bad commits',
        body: 'Four checkpoints, in an order that is not negotiable. First the verbs: two custom commands that encode the ceremony you do by hand. Then the guarantee: a hook that blocks a commit on a red build, which is the thing that makes everything after it safe. Then the autonomy: a scoped headless run and an SDK wrapper a scheduler can own. Then the reach: automated review on every pull request, plus the deterministic check that actually decides whether anything merges. We build guardrails before autonomy because the reverse order is how the 2 AM story from Monday happens.',
        bullets: [
          'CP1 — two custom commands: /ship and /review, scoped',
          'CP2 — the commit-guard hook: red tests cannot become a commit',
          'CP3 — scoped permissions + a headless run + an SDK routine',
          'CP4 — CI review on every PR + a required verification check',
          'Order is the lesson: guardrails first, then you let go of the wheel',
        ],
        diagram: `flowchart LR
  C1["1️⃣ Commands<br/>the verbs"] --> C2["2️⃣ Hook<br/>the guarantee"]
  C2 --> C3["3️⃣ Headless<br/>the autonomy"]
  C3 --> C4["4️⃣ CI review<br/>the reach"]
  C4 --> D["🏁 A repo that<br/>runs its own ceremony"]`,
        script: 'Show a finished pull request on screen first — with a real AI review comment on it and a green required check — before you explain anything. That is the cold open. Then put the four checkpoints up as a progress bar and say the rule out loud: "we do not skip, and we do not reorder. Guardrails before autonomy is the entire difference between tonight and Monday 2 AM story."',
      },
      {
        segment: 'build-map', eyebrow: '🧰 CP0 · Readiness', title: 'Five green lights, or you lose the night to setup',
        body: 'Two minutes here saves an hour later, because the headless and CI steps fail in confusing, silent ways on a repo that is not quite right. Your capstone project on GitHub. Actions enabled on that repo. The .claude folders you made Monday. A test command that actually runs — if your project has no tests at all, we fix that in the next three minutes with one trivial test, because the entire commit-guard depends on there being something to run. And one honest sentence: the ceremony you personally do after every change, which becomes /ship.',
        bullets: [
          '1️⃣ Your capstone repo on GitHub, pushed and current',
          '2️⃣ The Actions tab enabled on that repo',
          '3️⃣ .claude/commands and .claude/hooks from Monday',
          '4️⃣ A test command that runs and can go red on purpose',
          '5️⃣ Your ceremony, said in one sentence, out loud',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'your TERMINAL (not Claude Code)',
          label: 'Terminal — the five-point check, from inside your repo',
          code: '# 1 + 2: is this on GitHub, and are Actions on?\ngit remote -v\n#    then open the repo in a browser -> Actions tab -> must not say "disabled"\n\n# 3: Monday work survived\nls .claude/commands .claude/hooks\n\n# 4: a test command that RUNS (it may fail — it must not be missing)\nnpm test        # or: pytest / make test / whatever this project uses\n\n# 5: say your ceremony out loud before you touch anything else',
          expectedResult: 'A GitHub remote, an enabled Actions tab, both .claude folders, and a test command that produces output rather than "command not found".',
          stopCondition: 'All five green. Nobody starts CP1 red — the hook in CP2 has nothing to enforce without a working test command.',
          rescue: 'No tests at all? Ask Claude Code for one trivial passing test for the most boring function in the project. It exists so the guard has something to check; it does not have to be meaningful yet.',
        },
        diagram: `flowchart LR
  G["🐙 Repo on GitHub"] --> OK["✅ Ready to build"]
  A["⚙️ Actions enabled"] --> OK
  C["📁 .claude/ folders"] --> OK
  T["🧪 A test command<br/>that runs"] --> OK
  S["🗣️ Your ceremony,<br/>in one sentence"] --> OK`,
        script: 'Run this as a literal five-point roll call on the pulse rail and read the counts aloud. The one people fake is number four — ask two students to show you actual test output on their screen. A build day where half the room discovers at 7:45 that they have no test command is a build day you do not finish.',
      },

      /* ========================== guided build ============================ */
      {
        segment: 'guided-build', eyebrow: '1️⃣ CP1 · The verb', title: 'Build /ship — the ceremony you do by hand, encoded once',
        body: 'Start with the thing you named in readiness. /ship is the after-every-change ritual: run the tests, stop dead if they are red, format on green, read the staged diff, and draft a pull request description in the shape your team actually wants. Notice that verification is inside the command itself — step one is a stop condition, not a suggestion. Scope allowed-tools to exactly what those steps need and nothing more, which means no push and no commit; this command prepares a change and structurally cannot ship one.',
        bullets: [
          'Step 1 is a hard stop on red — the command refuses to continue',
          'The PR description encodes YOUR standard: summary, evidence, risk',
          'allowed-tools has no push and no commit — it prepares, it does not ship',
          'Commit ship.md so the ceremony belongs to the project, not to you',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — build /ship for this project',
          code: 'Create .claude/commands/ship.md in this project.\n\nFirst, look at package.json (or the equivalent config for this project) and tell me the exact commands this project uses to run its tests and to format code. Use those real commands, not generic ones.\n\nThen write the command file with:\n- frontmatter: a description, an argument-hint of [pr-title], and an allowed-tools list containing ONLY the test command, the format command, git diff, and git add\n- a numbered body that: (1) runs the tests and STOPS and reports the failures if anything is red, (2) on green formats and stages, (3) reads the staged diff and drafts a PR description titled $ARGUMENTS with a Summary, a Test Evidence line quoting the real passing output, and a Risk note\n\nallowed-tools must NOT include git commit or git push. Tell me why that matters before you write the file.',
          expectedResult: 'A ship.md using this project real test and format commands, with an allowed-tools line that cannot commit or push.',
          stopCondition: 'You have run /ship once and watched it either draft a PR description or refuse because the tests were red.',
          rescue: 'It hallucinated npm test on a Python project? That means it skipped the first instruction. Tell it to read the project config and try again — do not fix the file by hand, make it correct itself.',
        },
        diagram: `flowchart LR
  S["🔤 /ship 'title'"] --> T{"🧪 Tests green?"}
  T -->|"no"| STOP["🛑 Stop + report<br/>no PR drafted"]
  T -->|"yes"| F["🎨 Format + stage"]
  F --> D["📝 Draft the PR<br/>summary · evidence · risk"]`,
        script: 'Have everyone run /ship on a real change. Then do the thing that makes it memorable: break a test on purpose and run /ship again so the room watches it refuse. "Verification is not a step at the end. It is step one, and step one can say no."',
      },
      {
        segment: 'guided-build', eyebrow: '2️⃣ CP1 · The second verb', title: 'Build /review — a critic that is structurally incapable of editing your code',
        body: 'Your second command is a reviewer that changes nothing. Same file pattern, but the allowed-tools list contains only read operations — no Edit, no Write, no git commit. That is not a promise you are making, it is a property of the command: it could decide it wants to fix something and it would have no way to do it. This is the local rehearsal of what you put in CI at the end of the night, and it is also the same idea as plan permission mode, which reads and proposes and mutates nothing.',
        bullets: [
          'Read-only allowed-tools = a reviewer that cannot touch your code',
          'Ask for findings by severity with file and line references',
          'Same shape as plan mode: analyze and propose, never change',
          'This is CP4 in miniature — the CI reviewer is this command, on a schedule',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — build /review for this project',
          code: 'Create .claude/commands/review.md in this project.\n\nFrontmatter: a description, and an allowed-tools list containing ONLY read-only operations — git diff, Read, Grep, Glob. No Edit, no Write, no git commit, no git push.\n\nBody: review the staged diff for correctness, security, and compliance with this project CLAUDE.md. Output findings as a list of: [severity] file:line - the issue - the suggested fix. Any committed secret or credential is flagged FIRST and as CRITICAL. End with one line: REVIEW CLEAN or REVIEW HAS FINDINGS.\n\nExplicitly instruct it not to edit anything, AND make sure the allowed-tools list makes editing impossible. Tell me why both belong there rather than just one.',
          expectedResult: 'A review.md with a read-only tool list, and an explanation of why the instruction and the tool scope are both needed.',
          stopCondition: 'You ran /review on a real staged change and got findings with file:line references.',
          rescue: 'Review comes back vague and generic? It is reading nothing — check that git diff is in allowed-tools and that you actually have something staged.',
        },
        diagram: `flowchart LR
  R["🔤 /review"] --> RD["👓 Read-only tools<br/>diff · Read · Grep"]
  RD --> F["📋 Findings<br/>severity · file:line"]
  F --> V["🏁 REVIEW CLEAN<br/>or HAS FINDINGS"]
  X["🚫 No Edit tool"] -.->|"cannot mutate,<br/>by construction"| RD`,
        script: 'Ask the question and wait for it: "the body already says do not edit anything. Why also remove the Edit tool?" Somebody will get there — an instruction is a request, the tool list is a guarantee. That is Monday thesis reappearing inside a file they just wrote, and it lands much harder here than it did on a slide.',
      },
      {
        segment: 'guided-build', eyebrow: '👀 Read them together', title: 'Two files, and the one line in each that is doing the real work',
        body: 'Before we go further, look at what you actually have. Two Markdown files, both about ten lines, both readable by anyone on your team. In each one the body is just a prompt — your words, no syntax. And in each one exactly one line does the enforcement: allowed-tools. Yours will differ in wording and in the tool names, because they use your project real commands. What must be true in both is that you can say out loud what the command cannot do, and point at the line that makes that true.',
        bullets: [
          'The body is plain English — nothing about this is programming',
          'allowed-tools is the only enforcing line in either file',
          '/ship cannot commit or push. /review cannot edit anything.',
          'Both are committed, so a teammate inherits the standard, not a story about it',
        ],
        code: {
          kind: 'review',
          label: '.claude/commands/review.md as it should look — read it, do not paste it',
          code: '---\ndescription: Read-only review of the staged diff against this project standards\nallowed-tools: Bash(git diff:*), Read, Grep, Glob\n---\nReview `git diff --staged` for correctness, security, and CLAUDE.md compliance.\n\nOutput each finding as: [severity] file:line - the issue - the suggested fix.\nIf you find a committed secret or credential, flag it FIRST and as CRITICAL.\nDo NOT edit anything.\n\nEnd with exactly one line: REVIEW CLEAN or REVIEW HAS FINDINGS.',
          expectedResult: 'Put a finger on allowed-tools. There is no Edit and no Write in it — that is why "do NOT edit anything" is a courtesy rather than the safety mechanism.',
        },
        diagram: `flowchart TD
  F["📄 A command file"] --> B["📝 body =<br/>your prompt"]
  F --> A["🎯 allowed-tools =<br/>the enforcement"]
  B --> R["🤞 A request"]
  A --> G["🛡️ A guarantee"]`,
        script: 'Open the real files on screen, not the slide. Ninety seconds maximum — two fingers on two allowed-tools lines and move. Do not line-by-line these files or you will lose ten minutes of the build segment and the hook is where the night actually turns.',
      },
      {
        segment: 'guided-build', eyebrow: '3️⃣ CP2 · The guarantee', title: 'The commit-guard: no green tests, no commit — for anyone, in any mode',
        body: 'This is the most important thing you build tonight. A PreToolUse hook matched to Bash intercepts every shell command before it runs. When it sees a git commit, it runs your tests first, and if they are red it exits 2, which blocks the commit and hands the failure text back to Claude as the reason to go fix it. Read what that actually means: from this moment, a red build cannot become a commit in this repository. Not when you are tired. Not when the model decides it is probably fine. Not at 2 AM with nobody watching. It is the same gate in every mode, which is precisely why the autonomy in the next checkpoint is defensible.',
        bullets: [
          'PreToolUse + matcher Bash intercepts the commit before it happens',
          'exit 2 blocks it; stderr becomes the reason Claude sees and acts on',
          'Identical behaviour interactive and headless — the hook does not know or care',
          'This one gate is what makes CP3 safe rather than reckless',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — build the commit-guard hook',
          code: 'Create .claude/hooks/commit-guard.sh in this project and wire it into .claude/settings.json as a PreToolUse hook with the matcher "Bash".\n\nThe script must:\n1. Read the hook JSON from stdin and extract .tool_input.command\n2. Exit 0 immediately if that command is not a git commit — this hook must be invisible for everything else\n3. If it IS a git commit: run this project real test command (read the project config and use the actual one)\n4. If the tests fail: print a clear one-line reason to stderr and exit 2\n5. If the tests pass: exit 0\n\nUse $CLAUDE_PROJECT_DIR in the settings.json command path so it works for anyone who clones this repo. After writing it, tell me the exact terminal command I need to run to make the script executable, and tell me how I can prove the guard actually blocks something.',
          expectedResult: 'A short bash script plus a PreToolUse block in settings.json, and a told-to-you chmod command and proof plan.',
          stopCondition: 'The script is executable and you have read the exit 2 line with your own eyes.',
          rescue: 'Do not skip the chmod. A hook script without the executable bit fails silently and lets everything through, which looks exactly like a hook that is working.',
        },
        diagram: `flowchart LR
  C["💬 Claude wants<br/>git commit"] --> HK["🪝 commit-guard.sh"]
  HK --> T{"🧪 Tests green?"}
  T -->|"yes — exit 0"| OK["✅ Commit proceeds"]
  T -->|"no — exit 2"| NO["🚫 Blocked; stderr<br/>tells Claude to fix it"]`,
        script: 'Say the sentence deliberately before anyone pastes: "the line you are about to write is the one that makes everything after it safe." Then make sure every person runs the chmod. Silent hook failure is the number one time-sink of this class, and it looks identical to success.',
      },
      {
        segment: 'guided-build', eyebrow: '👀 Read it together', title: 'Fourteen lines, and one of them is the whole safety model',
        body: 'Look at what Claude Code wrote. Read stdin, extract the command, get out of the way if it is not a commit, otherwise run the tests and answer with an exit code. There is no framework here and no cleverness — the entire protocol is the number the script exits with. Notice line two of the guard clause: this hook is invisible for every command that is not a commit, which is what keeps it from becoming the annoying hook everybody disables by Friday. A guardrail that fires when it should not is a guardrail with a short life expectancy.',
        bullets: [
          'Read stdin, decide, exit — three moving parts, no framework',
          'The early exit 0 keeps it invisible for every other command',
          'exit 2 is the only line that blocks anything',
          'stderr is not logging; it is the message Claude reads and acts on',
        ],
        code: {
          kind: 'review',
          label: '.claude/hooks/commit-guard.sh — read it, do not paste it',
          code: '#!/usr/bin/env bash\ninput=$(cat)\ncmd=$(echo "$input" | jq -r \'.tool_input.command // empty\')\n\n# Invisible for anything that is not a commit — this is why it stays enabled.\nif ! echo "$cmd" | grep -q "git commit"; then\n  exit 0\nfi\n\nif ! npm test --silent > /tmp/guard.log 2>&1; then\n  echo "Commit blocked: tests are red. Fix them, then commit." >&2\n  exit 2\nfi\nexit 0',
          expectedResult: 'Two fingers: the early exit 0 that keeps it quiet, and the exit 2 that makes it a guarantee. Yours will use your project real test command.',
        },
        diagram: `flowchart TD
  IN["📨 stdin JSON"] --> P["🔍 Extract<br/>.tool_input.command"]
  P --> Q{"Is it a<br/>git commit?"}
  Q -->|"no"| Z["exit 0<br/>stay invisible"]
  Q -->|"yes"| T["🧪 Run the tests"]
  T --> E{"green?"}
  E -->|"no"| B["exit 2<br/>+ reason on stderr"]`,
        script: 'Point at the early exit and explain why it is a design decision, not an optimisation: "a hook that interrupts you constantly gets commented out within a week, and then it protects nothing at all." That nuance is what separates people who have run hooks in anger from people who have only read about them.',
      },
      {
        segment: 'guided-build', eyebrow: '4️⃣ CP2 · Prove it', title: 'Break a test on purpose and watch your own repo refuse you',
        body: 'A guardrail you have not seen fire is a guardrail you do not yet believe in. Break a test deliberately, then ask Claude Code to commit, and watch the guard stop it — not with an error you have to interpret, but with your own sentence coming back explaining why. Then fix the test and commit again so you see the gate open. Two runs, ninety seconds, and the feeling changes completely: this stops being a config file you copied and becomes a rule you have personally watched hold.',
        bullets: [
          'Break one assertion, ask for a commit, watch it refuse',
          'Read the message — it is the stderr line you wrote',
          'Fix it, commit again, watch it pass through cleanly',
          'You now trust the gate because you saw it hold, not because it was described',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — prove the guard actually blocks',
          code: 'We are going to prove the commit-guard works.\n\n1. Break exactly one assertion in one existing test so the suite goes red. Show me the one-line change.\n2. Now stage everything and try to commit with the message "proving the guard".\n3. Tell me exactly what happened, and quote the message you received.\n4. Now revert the broken assertion so the suite is green again, and commit with the message "guard verified".\n\nDo not disable, bypass, or edit the hook at any point. If the commit succeeds while the tests are red, stop immediately and tell me — that means the guard is not actually wired up.',
          expectedResult: 'A blocked commit quoting your own stderr message, then a successful commit once the tests are green.',
          stopCondition: 'You have personally seen the commit refused. If it went through on red, your hook is not running — check chmod +x first.',
          rescue: 'Committed on red? Two causes, in this order: the script is not executable, or it is exiting 0 instead of 2. Check both before touching the matcher.',
        },
        diagram: `flowchart LR
  B["🔨 Break one test"] --> C["💬 Ask for a commit"]
  C --> G["🪝 Guard fires"]
  G --> R["🚫 Refused —<br/>your own message"]
  R --> FX["🔧 Fix the test"]
  FX --> OK["✅ Commit proceeds"]`,
        script: 'Do not let anyone skip this. The students who skip the proof are the ones who discover during CP3 that their hook was never running. Get a show of hands on "I personally saw it refuse" and wait until it is nearly everybody.',
      },
      {
        segment: 'guided-build', eyebrow: '5️⃣ CP3 · Scope it', title: 'Decide what an unattended run may touch — before it ever runs',
        body: 'Now we start taking hands off the wheel, and the first move is not the run, it is the scope. Write the permissions block into settings.json: allow the minimum this work needs, and deny by name the things you never want a machine doing alone on your project. Push. Hard reset. Recursive delete. Reading your env file. Ask yourself the only question that matters here: if this thing goes completely wrong tonight while I am asleep, what is the worst state I find in the morning? With this block, the answer is a local commit you read over coffee.',
        bullets: [
          'allow: read, edit, test, format, add, commit — the minimum the work needs',
          'deny: push, hard reset, rm -rf, and reading .env or secrets by name',
          'deny wins over allow, so name your dangerous things explicitly',
          'The routine prepares a change; a human still ships it',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — write the least-privilege permissions block',
          code: 'Add a "permissions" block to .claude/settings.json in this project, for a routine that will run unattended.\n\nallow should contain the minimum needed to do the work and nothing more: Read, Edit, this project real test command, this project real format command, git add, and git commit.\n\ndeny should explicitly name: git push, git reset --hard, rm -rf, and reading .env and anything under a secrets directory.\n\nBefore you write it, look at this project and tell me if there is anything ELSE here that an unattended run should never touch — a deploy script, a migration command, a production config. If there is, propose adding it to deny and wait for me to agree.\n\nThen answer this in one sentence: if this routine goes completely wrong overnight, what is the worst state I find in the morning?',
          expectedResult: 'A permissions block plus a proposed list of project-specific things to deny, and a one-sentence worst-case answer.',
          stopCondition: 'You can say your own worst case out loud and you are comfortable with it.',
          rescue: 'It proposed denying nothing project-specific? Push back — every real project has a deploy script or a migration command that should never run unwatched. Make it look again.',
        },
        diagram: `flowchart LR
  P["⚙️ permissions"] --> A["✅ allow: read · edit<br/>test · format · commit"]
  P --> D["🚫 deny: push · reset --hard<br/>rm -rf · .env"]
  A --> W["🌙 Worst case at 3 AM:<br/>a local commit you review"]
  D --> W`,
        script: 'Make every student answer the worst-case question out loud to a neighbour before moving on. That single sentence is the thing they will repeat to a manager who asks whether this is safe, and it is much more persuasive than the config block that produced it.',
      },
      {
        segment: 'guided-build', eyebrow: '6️⃣ CP3 · Let go', title: 'The permission mode is the decision; the run is just the consequence',
        body: 'Now run it with nobody at the keyboard, and make the mode choice deliberately rather than by copying the flag off the slide. Default is out, because there is nobody there to answer a question. Plan is out, because a reviewer that changes nothing cannot do this job. bypassPermissions is out unless this is a sandbox you would happily delete, and it is not, it is your capstone. That leaves acceptEdits, which writes files freely and still gates shell commands, sitting inside a deny list that forbids the dangerous ones and behind a commit-guard that will not let a red build through. Watch the receipt when it comes back.',
        bullets: [
          'acceptEdits is the answer here, and you should be able to say why',
          '--max-turns caps a runaway; --allowedTools scopes it before it starts',
          'Your commit-guard fires inside this run too — verification is not skipped',
          'Read is_error and total_cost_usd: those are what a scheduler branches on',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'your TERMINAL (not Claude Code)',
          label: 'Terminal — the unattended run, on your own repo',
          code: '# Replace the prompt with a real, small, reversible task from YOUR build plan.\nclaude -p "Find any function in this project over 100 lines, split it into smaller functions, keep the tests green, and commit the change." \\\n  --permission-mode acceptEdits \\\n  --allowedTools "Read" "Edit" "Bash(npm test:*)" "Bash(git add:*)" "Bash(git commit:*)" \\\n  --output-format json \\\n  --max-turns 25 \\\n  | jq "{ok: (.is_error|not), turns: .num_turns, cost: .total_cost_usd, result}"',
          expectedResult: 'A JSON summary with ok true, a turn count, a cost, and a result line — plus a git log entry it made without you.',
          stopCondition: 'git log shows a commit you did not type, and the tests are green.',
          rescue: 'It stalled asking for something? A tool it needed is not in --allowedTools. Add that one specific tool. Never reach for --dangerously-skip-permissions to make a stall go away — that is how Monday story starts.',
        },
        diagram: `flowchart LR
  M["🎛️ acceptEdits<br/>chosen deliberately"] --> H["🌙 claude -p<br/>scoped + capped"]
  H --> G["🪝 commit-guard<br/>fires anyway"]
  G --> C["📦 Commit only<br/>on green"]
  C --> R["🧾 JSON receipt<br/>is_error · cost"]`,
        script: 'This is the theater poll moment — make them vote on the mode before you run anything, and take one argument for bypassPermissions before you reveal. Then run it live and read the jq summary out loud. "Nobody touched the keyboard, and it still could not commit a red build. That is not luck, that is the hook you built twenty minutes ago."',
      },
      {
        segment: 'guided-build', eyebrow: '7️⃣ CP3 · Hand it to a scheduler', title: 'Wrap the run in the SDK so a program owns it, not a person',
        body: 'A shell one-liner is a fine routine until you want retries, logging, or the same job across five repositories. The Agent SDK is the same engine as a library: you call query with a prompt and the same options you just used on the command line, and you stream the messages back into your own code. Now your program owns the parts a scheduler needs — it decides what a failure means, whether to retry and how many times, where the log goes, and whether this run was idempotent. That is the moment Claude Code stops being a tool you use and becomes a component you compose, which is the actual definition of the job you are training for.',
        bullets: [
          '@anthropic-ai/claude-agent-sdk in TypeScript, claude-agent-sdk in Python',
          'query() takes the same options: permissionMode, allowedTools, maxTurns',
          'Your code owns retries with a cap, logging, and idempotency around the run',
          'Exit non-zero on failure and let the scheduler decide — never retry forever',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — wrap the routine in the SDK',
          code: 'Create a small script in this project called routine.ts (or routine.py if this is a Python project) that runs the same unattended task I just ran from the command line, using the Claude Agent SDK.\n\nIt should:\n1. Use query() from @anthropic-ai/claude-agent-sdk (or the Python equivalent) with permissionMode "acceptEdits", the same scoped allowedTools list, and maxTurns 25\n2. Stream the messages and act on the one with type "result"\n3. On is_error, log a single structured line with the failure and exit with a non-zero code so a scheduler can decide whether to retry — do NOT retry inside the script\n4. On success, log the result, the turn count, and the cost as one structured JSON line\n5. Read the API key from the environment. Never hardcode it, never log it.\n\nThen tell me, in two sentences, what happens if this script runs twice in a row on the same repo — and whether that is safe.',
          expectedResult: 'A short routine script, plus an honest two-sentence answer about running it twice.',
          stopCondition: 'You have read the idempotency answer and you either agree with it or know what you would change.',
          rescue: 'If it wrote a retry loop inside the script, have it remove it. Retries belong to the scheduler; a script that retries itself is how you get an unbounded loop with nobody watching.',
        },
        diagram: `flowchart LR
  S["⏰ Scheduler<br/>cron · CI · queue"] --> R["📜 routine.ts"]
  R --> Q["🤖 query()<br/>same scoped options"]
  Q --> RES["🧾 result message"]
  RES --> D{"is_error?"}
  D -->|"yes"| X["exit non-zero —<br/>scheduler decides"]
  D -->|"no"| L["📊 Log cost + turns"]`,
        script: 'Land the composition point: "same task, now inside code you own." Then make the idempotency question do real work — Week 9 is entirely about running things twice safely, and asking it here means they arrive next week already uncomfortable, which is exactly where you want them.',
      },
      {
        segment: 'guided-build', eyebrow: '8️⃣ CP4 · The reviewer', title: 'Put a reviewer on every pull request who is never on vacation',
        body: 'This is the payoff for Monday opening story. Add a workflow file that triggers on pull request opened and updated, checks out the full history so the action can see the whole diff, and runs the Claude Code action with a review prompt in your own words. Two things make it safe. The API key comes from a repository secret, never as text in the file — a key in a YAML in a public repo is a key that is already stolen. And claude_args scopes it to read tools, so it comments and cannot touch your code. If you would rather not hand-write this, run /install-github-app from inside Claude Code and it will create the workflow and store the secret for you.',
        bullets: [
          'Triggers on pull_request opened and synchronize — every push to the branch',
          'fetch-depth 0 so the action can see the full diff, not a shallow clone',
          'permissions: pull-requests write to comment, contents read only',
          'claude_args scoped to read tools — it recommends, it never merges',
          'The key is a repository secret; /install-github-app sets both up for you',
        ],
        code: {
          kind: 'paste',
          pasteWhere: '.github/workflows/claude-review.yml (a new file in YOUR repo)',
          label: 'The CI reviewer — commit this file, then open a PR',
          code: 'name: Claude PR Review\non:\n  pull_request:\n    types: [opened, synchronize]\npermissions:\n  contents: read\n  pull-requests: write\njobs:\n  review:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          fetch-depth: 0\n      - uses: anthropics/claude-code-action@v1\n        with:\n          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}\n          prompt: |\n            Review this pull request for correctness, security, and compliance\n            with this repository CLAUDE.md. Leave inline comments on specific lines.\n            Flag any committed secret FIRST and as CRITICAL.\n            Recommend only. Do NOT approve and do NOT merge.\n          claude_args: "--allowedTools Read,Grep,Glob,Bash(git diff:*)"',
          expectedResult: 'Commit it, open a throwaway PR, and within a couple of minutes real review comments appear on the diff.',
          stopCondition: 'You are looking at an AI review comment on a pull request in your own repository.',
          rescue: 'Workflow did not run? Check the Actions tab is enabled and that ANTHROPIC_API_KEY exists in repository secrets — the run will fail instantly and clearly if the secret is missing.',
        },
        diagram: `flowchart LR
  PR["📬 PR opened"] --> A["🐙 Action runs"]
  A --> K["🔑 Key from<br/>repo secrets"]
  A --> RT["👓 Read-only tools"]
  RT --> CM["💬 Inline comments<br/>within ~90 seconds"]
  CM --> H["🧑 Human reviews<br/>a pre-read PR"]`,
        script: 'Have everyone open a throwaway pull request and wait together for the comments to land — that shared moment is the emotional peak of the night. Then close Monday loop explicitly: "the reviewer is still on vacation. The pull request got read anyway, in ninety seconds, and when she comes back she is reading a PR somebody already went through."',
      },
      {
        segment: 'guided-build', eyebrow: '9️⃣ CP4 · The gate', title: 'The AI review talks. The test job votes.',
        body: 'One more file, and it is the least glamorous thing you build tonight. A reviewer that can approve its own work is a rubber stamp with extra steps, so the automated review stays advisory and the actual merge decision goes to something completely deterministic: a job that installs, typechecks, and runs your tests, made a required status check in branch protection. Now nothing merges on red — not your change, not a routine change, not a change the AI reviewer said looked great. This is the same principle as the commit-guard, moved up one level to the pipeline, and it is the sentence you will use when somebody asks how you can possibly let a machine near your repository.',
        bullets: [
          'A separate workflow: install, typecheck, test — no AI in it at all',
          'Make it a required status check in Settings → Branches → branch protection',
          'AI review = advisory comments; the required check = the actual decision',
          'Same shape as the hook, one level up: advice from the model, decisions from code',
        ],
        code: {
          kind: 'paste',
          pasteWhere: '.github/workflows/verify.yml (a new file in YOUR repo)',
          label: 'The deterministic merge gate — then turn on branch protection',
          code: 'name: Verify\non:\n  pull_request:\n    types: [opened, synchronize]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with: { node-version: 20 }\n      - run: npm ci\n      - run: npm run typecheck   # tsc --noEmit — use YOUR project real command\n      - run: npm test            # use YOUR project real command\n\n# Then, in GitHub: Settings -> Branches -> add a rule for your default branch\n# -> "Require status checks to pass before merging" -> select "test".',
          expectedResult: 'A green (or honestly red) required check on your PR, and a merge button that is disabled when it is red.',
          stopCondition: 'You have seen the merge button blocked by a failing required check at least once.',
          rescue: 'Check not appearing in the branch-protection list? It only shows up after it has run once — push a commit to the PR, then go back and select it.',
        },
        diagram: `flowchart LR
  PR["📬 The PR"] --> AI["🤖 Claude review<br/>advisory"]
  PR --> V["🧪 verify job<br/>deterministic"]
  V --> G{"🚦 Required check"}
  G -->|"green"| M["✅ Merge allowed"]
  G -->|"red"| B["🚫 Merge blocked<br/>for everyone"]`,
        script: 'Say the line and let it sit: "the AI review talks; this job votes." Then have somebody push a deliberately failing test to their open PR so the room watches the merge button go grey. That grey button is the single most reassuring image you can give an executive who is nervous about all of this.',
      },

      /* ============================= failure =============================== */
      {
        segment: 'failure', eyebrow: '💥 Break it on purpose', title: 'Recreate the 2 AM disaster in ten seconds, on a branch you will throw away',
        body: 'Everything you built tonight is only convincing if you have seen what its absence looks like. So on a throwaway branch, strip the safety off: skip permissions entirely so nothing is scoped, bypass the guard so verification never runs, and push straight to the branch. Feed it a task that produces a subtly broken change. Watch it edit, commit, and push with total confidence and zero errors. This is Monday story, reproduced by you, in ten seconds, and the important observation is that nothing about it looks wrong while it is happening.',
        bullets: [
          'Throwaway branch only — never main, and never with real credentials in scope',
          '--dangerously-skip-permissions means nothing is scoped at all',
          'No guard means the tests are never consulted',
          'Result: a broken change, pushed, logged as a success',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'your TERMINAL (not Claude Code)',
          label: 'The anti-pattern — on a throwaway branch, and never for real',
          code: '# THROWAWAY BRANCH ONLY. This is the shape of the failure, not a technique.\ngit checkout -b break-it-on-purpose\n\n# no scope, no verification, nobody watching\nclaude -p "Rename the main exported function in one file and update its callers." \\\n  --dangerously-skip-permissions \\\n  --max-turns 50\n\ngit push origin break-it-on-purpose   # ships whatever it produced, verified or not\n\n# now look at what actually landed\ngit log -1 --stat\nnpm test        # this is the part that never ran',
          expectedResult: 'A pushed commit with a confident message, and a test suite that only now tells you it is red.',
          stopCondition: 'You have seen a broken change land without a single error being raised.',
          rescue: 'If your guard blocked it anyway — congratulations, your hook is stronger than the exercise. Note it, do not disable the hook to force the failure.',
        },
        diagram: `flowchart LR
  T["📝 A plausible task"] --> R["☠️ skip-permissions<br/>no scope"]
  R --> E["✍️ Edits + commits"]
  E --> P["🚀 Pushed"]
  P --> N["😐 Zero errors<br/>logged as success"]
  N --> RED["🧪 Tests: red<br/>(nobody asked)"]`,
        script: 'Do it live on your own screen first so nobody has to be brave. Then sit in it for a beat: "no one wrote a bad prompt. The configuration was wrong, and configuration does not announce itself." This is the highest-retention ninety seconds of the week — do not rush past it into the fix.',
      },
      {
        segment: 'failure', eyebrow: '🛡️ Harden it', title: 'One boring fix per break, and notice that none of them make the model smarter',
        body: 'Now repair it, and pay attention to how unglamorous each fix is. Skip-permissions becomes acceptEdits inside your allow and deny lists. The bypassed guard comes back, so a red build cannot commit. The direct push becomes a pull request, where the required check refuses to let anything merge on red. Run the exact same broken task again: the commit is refused, nothing is pushed, and the automation fails loudly and safely instead of succeeding wrongly. Same model, same prompt, same task. Completely different outcome, because the boundaries changed and the boundaries are code.',
        bullets: [
          'Scope: acceptEdits + allow/deny replaces skip-permissions',
          'Gate: the commit-guard is back, so red cannot become a commit',
          'Reach: no direct push — a PR, with a required check that decides',
          'Same task, same model: it now fails loudly instead of shipping quietly',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'your TERMINAL (not Claude Code)',
          label: 'The hardened routine — same task, three boundaries back in place',
          code: '# back to a real branch, with the guardrails on\ngit checkout -b hardened-attempt\n\nclaude -p "Rename the main exported function in one file and update its callers." \\\n  --permission-mode acceptEdits \\\n  --allowedTools "Read" "Edit" "Bash(npm test:*)" "Bash(git add:*)" "Bash(git commit:*)" \\\n  --output-format json \\\n  --max-turns 25\n\n# git push is DENIED in .claude/settings.json, so YOU open the PR:\ngit push origin hardened-attempt    # you, deliberately, as a human\n# then the required "test" check decides whether it can merge at all',
          expectedResult: 'Either a clean commit on green, or a refusal you can read — and in neither case does anything reach the default branch on its own.',
          stopCondition: 'You have run the same task twice, once unguarded and once guarded, and can describe the difference in one sentence.',
        },
        diagram: `flowchart LR
  F1["☠️ No scope"] --> H1["🎛️ acceptEdits<br/>+ allow / deny"]
  F2["🚫 No verification"] --> H2["🪝 commit-guard<br/>exit 2 on red"]
  F3["🚀 Direct push"] --> H3["📬 PR + required<br/>test check"]`,
        script: 'Ask the room which of the three fixes they would have thought of unprompted a week ago. Usually one, sometimes none. Then name the discipline out loud: "you did not make the model safer. You made the boundaries deterministic." That is the sentence to leave with — and it is exactly the sentence Week 10 builds governance on top of.',
      },
      {
        segment: 'failure', eyebrow: '🏁 The vacation test', title: 'Before you leave: turn one sentence in your CLAUDE.md into something that cannot be ignored',
        body: 'Here is the closing exercise, and it takes four minutes. Open your CLAUDE.md, find the rule you admitted on Monday you were least confident actually gets followed, and ask the honest question: could a script check this? If yes, it is not a rule tonight, it is a hook you have not written. Do that conversion before you close your laptop. Then look at what you have: a repo whose ceremony is a verb, whose commits are gated, whose routine runs on a schedule with a bounded blast radius, and whose pull requests get read within ninety seconds whether or not any human is available. Next week we find out what happens when it fails — because a system that has never failed is simply a system nobody has tested.',
        bullets: [
          'Pick the CLAUDE.md rule you trust least and ask: can a script check it?',
          'If yes, convert it tonight — it was never an instruction, it was a missing hook',
          'Where you are on the ladder now: it runs on a schedule and coordinates other agents',
          'Your proof: the commands, the hook, a headless run, and one real CI review comment',
          'Week 9: you break it on purpose, because untested reliability is a rumour',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — the conversion, before you leave',
          code: 'Read the CLAUDE.md in this project.\n\nFor every rule in it, classify it into exactly one of three buckets and show me the table:\n- ENFORCEABLE: a script could check this deterministically -> propose the specific hook (which event, which matcher, what the script checks, what exit code it returns)\n- JUDGMENT: this needs an understanding of intent and belongs in CLAUDE.md as words\n- DEAD: this rule is vague, unenforceable, or no longer true and should be deleted\n\nThen implement the single highest-value ENFORCEABLE rule as a real hook in this project, wire it into .claude/settings.json, tell me the chmod command, and tell me how to prove it fires.\n\nDo not implement more than one — I want to read the table before we do the rest.',
          expectedResult: 'A three-bucket table of your own governance, plus one new working hook converted from a sentence you had been hoping about.',
          stopCondition: 'One rule that was a request this morning is a guarantee before you leave.',
        },
        diagram: `flowchart TD
  CM["📄 Your CLAUDE.md"] --> S["🔍 Sort every rule"]
  S --> E["🪝 ENFORCEABLE<br/>→ becomes a hook"]
  S --> J["🧠 JUDGMENT<br/>→ stays as words"]
  S --> D["🗑️ DEAD<br/>→ delete it"]
  E --> W["🏖️ Holds while<br/>you are away"]`,
        script: 'Run the conversion live on your own CLAUDE.md so they see the table for a real project, including the DEAD rows — admitting some of your own governance is dead weight is the most credible thing you can do in this class. Then close on the arc: "Week 1 you approved every keystroke. Tonight it runs on a schedule and reviews other people work. Thursday next week we find out what happens when it breaks, because nobody has ever tested that."',
      },
    ],

    beforeAfter: {
      label: 'Before tonight → After tonight',
      before: [
        'You remember, then you type the prompt',
        'The ceremony done by hand after every change',
        'A rule in CLAUDE.md you hope gets followed',
        'The PR waits for whoever is available',
        'Unattended means unbounded',
      ],
      after: [
        'A schedule remembers, and it does not forget',
        'One verb your whole team inherits',
        'A hook that fires every time, in every mode',
        'A substantive review within ninety seconds',
        'Scoped tools, capped turns, and a receipt',
      ],
    },

    storyBeats: {
      'result-preview': [
        {
          icon: '🏖️', tone: 'violet', eyebrow: 'Before you build — the test that matters',
          title: 'The real question is not whether it works. It is whether it works while you are away.',
          body: 'There is a moment in every operations career when someone takes a genuine two-week holiday for the first time in years, and the honest measure of everything they built is what they come back to. Not whether it ran — whether it ran correctly, refused what it should have refused, and left a trail somebody else could read. Tonight you are building for that specific fortnight. Every guardrail is a decision you are making now on behalf of a version of you who is not going to be reachable.',
          punch: 'You are not automating a task tonight. You are writing down your judgment so it keeps working without you.',
        },
      ],
      'build-map': [
        {
          icon: '🏗️', tone: 'amber', eyebrow: 'Why the order is not negotiable',
          title: 'Nobody puts up the scaffolding after the third floor',
          body: 'On a real construction site the guardrails and the harness points go in before anyone works at height, and not because somebody is being careful — because retrofitting a safety system onto work already in progress is more dangerous than not having one. Tonight has the same shape. Commands and hooks come before the unattended run, and the unattended run comes before we let anything near a pull request. Every checkpoint exists to make the next one defensible.',
          punch: 'Autonomy is not the reward for finishing. It is the thing the guardrails pay for.',
        },
      ],
      failure: [
        {
          icon: '🌙', tone: 'cherry', eyebrow: 'The 2 AM story, one last time',
          title: 'The commit message was beautifully written, which is what made it so hard to spot',
          body: 'When the outage was traced back the next morning, the commit that caused it did not look suspicious in the slightest. Clear message, sensible scope, four files, tidy diff. It read exactly like the work of someone competent and unhurried. That is precisely why nobody caught it in review — reviewers scan for the signs of carelessness, and there were none. The failure was not in the change. It was in the fact that nothing had checked whether the change worked before it left the machine.',
          punch: 'Automation does not make careless work. It makes confident work, which is far harder to catch.',
        },
        {
          icon: '🔒', tone: 'leaf', eyebrow: 'Change of pace — what actually changed tonight',
          title: 'You did not make the model more trustworthy. You made trust unnecessary.',
          body: 'Notice what none of tonight required: a better model, a cleverer prompt, or a promise from anyone. The commit-guard does not trust the model to remember the tests. The deny list does not trust it to avoid pushing. The required check does not trust the reviewer, human or otherwise, to have read carefully. Every single control tonight replaced an act of faith with a piece of code that runs whether anyone is paying attention or not.',
          punch: 'That is what it means to be accountable for a system: you stopped needing to hope.',
        },
      ],
    },

    extraInteractions: [
      {
        segment: 'result-preview', kind: 'poll',
        q: 'Of the last ten changes you or your team shipped, how many got reviewed the same day?',
        options: ['Most of them', 'About half', 'Almost none', 'We do not really review'],
        eyebrow: '🏖️ Opening read', title: 'How long does a change actually wait?',
        presenterTip: 'Sets up the whole night in one question. Whatever the room says, the follow-up is the same: "and what were you waiting for?" The answer is almost always a person, not a problem. That is the gap CP4 closes.',
      },
      {
        segment: 'readiness', kind: 'poll',
        q: 'Five-point check — where are you?',
        options: ['✅ All five green', '🐙 Actions not enabled', '📁 Missing the .claude folders', '🧪 No test command that runs', '😵 Wrong repo entirely'],
        eyebrow: '🚦 Roll call', title: 'Nobody starts CP1 red',
        presenterTip: 'Operational. Read the counts out loud and send mentors immediately. The "no test command" group is the one to prioritise — the commit-guard in CP2 has nothing to enforce without one, and they will quietly fall behind for the rest of the night.',
      },
      {
        segment: 'build-map', kind: 'poll',
        q: 'Which ceremony are you encoding as /ship tonight?',
        options: ['Test, format, draft the PR', 'Update the changelog and version', 'Run the checks my team always forgets', 'Something specific to my project'],
        eyebrow: '📋 Commit to one', title: 'Name your verb before you build it',
        presenterTip: 'Have three people say theirs in one sentence, and push for specificity — "test and format" is fine, but the person who says "regenerate the API docs and check nothing in /legacy changed" gets a visibly better command. Read that one out as the standard.',
      },
      {
        segment: 'guided-build', kind: 'trivia',
        q: 'Your hook is wired into settings.json, but the commit went through on a red build. What do you check FIRST?',
        options: [
          'The matcher pattern',
          'chmod +x on the script, then whether it exits 2',
          'Your CLAUDE.md',
          'Whether the model supports hooks',
        ],
        answer: 1,
        reveal: 'A script without the executable bit fails silently and everything passes through — which looks exactly like a hook that is working fine. Check chmod first, then confirm it is actually exiting 2 rather than 0. The matcher is the third thing to check, not the first.',
        eyebrow: '🔧 Diagnose it', title: 'The guard let it through. Where do you look?',
        presenterTip: 'Fires right after CP2, and it will be live for three or four people in the room at that exact moment. Take the vote, reveal, then say "hands up if that is happening to you right now" and send mentors straight there.',
      },
      {
        segment: 'guided-build', kind: 'poll',
        theater: true,
        q: 'Your routine runs at 3 AM on your capstone repo, unattended. Which permission configuration do you ship?',
        options: [
          'bypassPermissions — otherwise it gets stuck and does nothing',
          'acceptEdits, with git push explicitly denied',
          'default — it will just ask if it needs something',
          'plan mode — the safest option available',
        ],
        answer: 1,
        reveal: 'default is meaningless with nobody there to answer. plan cannot change anything, so nothing gets done. bypassPermissions is only defensible in a sandbox you would happily delete, and your capstone is not that. acceptEdits with push denied means the worst case at 3 AM is a local commit you read over coffee — and the commit-guard means even that commit had green tests.',
        eyebrow: '🎛️ The decision', title: 'Nobody is awake. Choose the configuration.',
        presenterTip: 'The one full-screen theater moment tonight — lock the votes and show the spread before revealing. Take one honest argument for bypassPermissions first; the "it keeps getting stuck" frustration is real and worth naming, because the correct response is to widen allowedTools by one specific tool, never to remove the scope entirely.',
      },
      {
        segment: 'failure', kind: 'poll',
        q: 'In the 2 AM failure you just reproduced, which SINGLE guardrail would have prevented the outage?',
        options: [
          'Scoped permissions with push denied',
          'The commit-guard hook blocking on red tests',
          'The required verify check on the PR',
          'Any one of the three — that is the point',
        ],
        answer: 3,
        reveal: 'Every one of them independently stops it, and that is exactly the argument for defense in depth. You do not need one perfect control that never fails; you need three cheap ones, because the failure has to beat all of them and it never does.',
        eyebrow: '🛡️ Judgment call', title: 'Which single gate saves the morning?',
        presenterTip: 'A trap question with a real lesson — most rooms hunt for the one right answer and the honest answer is all of them. After the reveal, tie it to Week 9: reliability is layered, not heroic, and next week is entirely about what happens when a layer fails.',
      },
      {
        segment: 'demos', kind: 'poll',
        q: 'What did your CI reviewer actually catch on your pull request?',
        options: ['Something real I would have missed', 'Something valid but minor', 'Mostly noise', 'It has not run yet'],
        eyebrow: '🔍 Honest read', title: 'Was the automated review any good?',
        presenterTip: 'Ask for an honest answer and mean it — a room that reports "mostly noise" is telling you the prompt in the workflow is too generic, which is a fixable, teachable problem. Have one person from each of the first two groups read their comment out loud on screen.',
      },
      {
        segment: 'broadcast', kind: 'poll',
        q: 'Which rule in your CLAUDE.md are you converting into a hook this week?',
        options: ['The tests one', 'A protected-path or file-boundary rule', 'A secrets or credentials rule', 'I found one I did not expect'],
        eyebrow: '🎬 Say it out loud', title: 'One request becomes one guarantee',
        presenterTip: 'This is the Builder Broadcast prompt — every student names the rule they are converting and why a script can check it. It is a thirty-second clip that is genuinely worth posting, and it forces one last rehearsal of the judgment that defines the week.',
      },
    ],
  },
};
