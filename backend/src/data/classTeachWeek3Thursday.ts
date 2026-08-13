/**
 * classTeachWeek3Thursday.ts — hand-authored deep teaching content for Week 3
 * BUILD DAY ("Claude API + Workflow Assistant", session #7, 2026-08-13).
 *
 * Companion to classTeachWeek3.ts (Architecture Day). Same three corrections
 * applied here that Monday needed, because the generated Thursday content had
 * all of them:
 *   • model IDs were the superseded `claude-opus-4-8` → now `claude-opus-5`
 *   • structured output used the deprecated top-level `output_format` +
 *     `messages.parse` → now `output_config.format` with a json_schema
 *   • every code block was raw Python presented as if the student types it →
 *     now the direct-then-review flow the program actually teaches: a real
 *     Claude Code prompt describing what must exist, then the resulting code
 *     marked `kind: 'review'` so the room reads it together and nobody pastes.
 *
 * Every teach slide carries its own mermaid diagram (≤7 short-labelled nodes,
 * so the text stays legible when the instructor click-zooms it full screen).
 *
 * The through-line: students do NOT build a generic demo. They automate one
 * real workflow from the build plan they generated on Monday.
 */
import type { TeachSlide } from './classTeachContent';

export const WEEK3_THURSDAY: TeachSlide[] = [
  /* ============================ build map ================================= */
  {
    segment: 'build-map', eyebrow: '🗺️ Tonight', title: 'You are shipping one assistant that automates one real thing from YOUR plan',
    body: 'Monday you learned four separate moves: authenticate, steer with a system prompt, force a structured shape, and hand Claude a tool. Tonight they stop being four exercises and become one program. And it does not automate a made-up support ticket — it automates a workflow you picked out of your own build plan. By 8:30 you will have run it, broken it three ways on purpose, and hardened each break.',
    bullets: [
      'One module, not a pile of scripts — the thing you can actually reuse',
      'It automates a workflow from YOUR build plan, not a demo ticket',
      'Build → Break → Harden, in that order, on purpose',
      'It ends with an eval score, so "better" becomes a number',
    ],
    diagram: `flowchart LR
  W["📋 A workflow<br/>from your plan"] --> B["🔨 BUILD<br/>make it work"]
  B --> K["💥 BREAK<br/>three ways, on purpose"]
  K --> H["🛡️ HARDEN<br/>one fix per break"]
  H --> E["📊 EVAL<br/>a number you can defend"]`,
    script: 'Show a finished run on screen first — the cold open. Then say the part that matters: tonight is not a tutorial they follow, it is their own workflow getting automated. Have two students name theirs out loud before you move on.',
  },
  {
    segment: 'build-map', eyebrow: '🧰 Readiness', title: 'Green light before you write a line',
    body: 'Four things have to be true or you will lose twenty minutes to setup instead of building. Your key still has to be live in the terminal you are about to use — remember it does not survive a new tab. Your project folder from Monday, Claude Code open in it, and one workflow chosen. If any of those is red, fix it in the next three minutes; the rescue branch is here, not at the break.',
    bullets: [
      '1️⃣ echo your key in THIS terminal — not blank',
      '2️⃣ Monday\'s project folder, with hello_claude.py in it',
      '3️⃣ Claude Code open in that folder',
      '4️⃣ One workflow named out loud from your own build plan',
    ],
    diagram: `flowchart LR
  K["🔑 Key live<br/>in this terminal"] --> GO["✅ Ready to build"]
  F["📁 Monday's folder"] --> GO
  CC["💻 Claude Code open"] --> GO
  W["📋 Your chosen workflow"] --> GO`,
    script: 'Run this as a literal four-point roll call on the pulse rail. Anyone red goes to a mentor NOW. Do not start the guided build with people stuck on step one — that is how a build day dies.',
  },

  /* ============================ guided build ============================== */
  {
    segment: 'guided-build', eyebrow: '0️⃣ CP0 · Your workflow', title: 'Name the workflow, then let Claude Code lay out the project',
    body: 'Start by writing down the one workflow in plain language: what comes in, what decision gets made, what has to come out. That sentence is the specification for everything after it. Then have Claude Code scaffold a proper little package rather than one long file — because the thing you build tonight has to survive being reused on Thursday of Week 4.',
    bullets: [
      'Write the one-liner: input → decision → output',
      'Claude Code scaffolds the package; you approve the shape',
      'Separate files: client, prompt, tools, the assistant, the eval',
      'No product code yet — structure only, exactly like Week 1',
    ],
    code: {
      kind: 'paste', pasteWhere: 'Claude Code', ccMode: 'Plan Mode',
      label: 'Claude Code prompt — scaffold the assistant',
      code: 'I am building a Workflow Assistant that automates one real workflow from my project.\n\nMy workflow, in one line: [WRITE YOURS HERE — what comes in, what decision is made, what comes out].\n\nIn Plan Mode, propose a small Python package called assistant/ inside this project with one file per responsibility: the configured API client, the system prompt, the tool definitions and their real implementations, the main assistant function, and an eval harness. For each file say what belongs in it and what must never go in it.\n\nDo not create anything yet. Show me the plan and wait for my approval.',
      expectedResult: 'A proposed folder tree with one clear responsibility per file, and the API key living in none of them.',
      stopCondition: 'You have approved a structure you understand and could explain to someone else.',
    },
    diagram: `flowchart LR
  L["✍️ Your one-line<br/>workflow spec"] --> CC["💻 Claude Code<br/>Plan Mode"]
  CC --> P["📁 assistant/<br/>one file per job"]
  P --> A["✅ You approve<br/>the shape"]`,
    script: 'Make everyone actually write the one-liner before pasting — the prompt is worthless without it. Read two of them aloud; the specific ones produce visibly better plans, and the room notices that immediately.',
  },
  {
    segment: 'guided-build', eyebrow: '1️⃣ CP1 · Client + prompt', title: 'One configured client, one system prompt, both in their own file',
    body: 'Two foundations. The client is created once, in one place, reading the key from the environment — so the model name lives in exactly one line and switching models later is a one-word change, not a search-and-replace. The system prompt is where the assistant\'s job, its rules, and its boundaries live. Put it in its own file and it becomes something you can version and improve, instead of a string buried in the middle of your logic.',
    bullets: [
      'One client, one place — the model name is a single line',
      'The system prompt is a FILE, not a buried string',
      'Key still comes from the environment; nothing changes there',
      'Model choice is a cost decision — you priced it on Monday',
    ],
    code: {
      kind: 'paste', pasteWhere: 'Claude Code',
      label: 'Claude Code prompt — client + system prompt',
      code: 'Create assistant/client.py and assistant/prompt.py.\n\nclient.py: create one `anthropic.Anthropic()` client with no arguments so it reads ANTHROPIC_API_KEY from the environment, and define a single MODEL constant set to "claude-opus-5". Add a one-line comment noting that swapping MODEL to "claude-haiku-4-5" is the cheap high-volume option. Include a tiny __main__ block that sends "Reply OK if you can read this." so the file is self-testing.\n\nprompt.py: define a SYSTEM string that describes the assistant for MY workflow — its job, the decision it must make, the output it must produce, and one explicit boundary about what it must never do or claim. Ask me for those details if my workflow is not obvious from the project.\n\nThen run client.py so we know the connection works.',
      expectedResult: 'python -m assistant.client prints OK — and prompt.py holds a system prompt written for YOUR workflow, not a generic one.',
      stopCondition: 'You see OK, and you have read your own system prompt out loud once.',
      rescue: 'No OK? It is the key, not the code — re-run the echo check from the readiness slide in THIS terminal.',
    },
    diagram: `flowchart LR
  ENV["🔐 ANTHROPIC_API_KEY"] --> CL["🐍 client.py<br/>one client, one MODEL"]
  PR["📜 prompt.py<br/>the assistant's job"] --> AS["🤖 Your assistant"]
  CL --> AS
  AS --> OK["✅ prints OK"]`,
    script: 'Land why the model name lives in one line: on Monday they saw the same job cost $90 or $450 depending on that word. Here is where that decision physically lives.',
  },
  {
    segment: 'guided-build', eyebrow: '👀 Read it together', title: 'Two small files — and the two lines that matter in them',
    body: 'Before we add anything, look at what came back. There are only two things worth pointing at. First: the client takes no arguments, which is the whole security model from Monday, still holding. Second: MODEL is one constant on one line — that is your cost dial, and it is the only thing you change to trade intelligence against money. Everything else in these files is plumbing.',
    bullets: [
      'Anthropic() with no arguments → the environment supplies the key',
      'MODEL on one line → your cost dial, changed in one word',
      'SYSTEM in its own file → versionable, improvable, testable',
      'Yours will differ in wording — the three properties must be there',
    ],
    code: {
      kind: 'review',
      label: 'assistant/client.py — read it, do not paste it',
      code: 'import anthropic\n\n# One client for the whole package. Key comes from ANTHROPIC_API_KEY.\nclient = anthropic.Anthropic()\n\n# Your cost dial. claude-haiku-4-5 is the cheap high-volume option.\nMODEL = "claude-opus-5"\n\nif __name__ == "__main__":\n    resp = client.messages.create(\n        model=MODEL, max_tokens=256,\n        messages=[{"role": "user", "content": "Reply OK if you can read this."}],\n    )\n    print(next(b.text for b in resp.content if b.type == "text"))',
      expectedResult: 'Put your finger on two lines: the bare Anthropic() call, and the MODEL constant.',
    },
    diagram: `flowchart LR
  F["📄 client.py"] --> A["🔑 Anthropic()<br/>no arguments"]
  F --> B["🎚️ MODEL<br/>= your cost dial"]
  F --> C["🧪 __main__<br/>self-test"]`,
    script: 'Open the REAL file on your screen, not this slide — this is the safety net if what Claude Code wrote drifted. Two fingers, two lines, then move; do not line-by-line the whole file or you will lose the segment.',
  },
  {
    segment: 'guided-build', eyebrow: '2️⃣ CP1 · The tool', title: 'Give it a tool that touches something real in your workflow',
    body: 'A tool is how the assistant stops guessing. Define what it does, what arguments it needs, and then actually implement it — reading a file, querying a list, calling something you already have. The description is not documentation; it is how Claude decides whether this tool is the right one to reach for. Vague descriptions produce tools that never fire, which is the single most common tool-use bug.',
    bullets: [
      'The description IS the routing logic — say when to use it',
      'Implement it for real; a stub teaches you nothing tonight',
      'One tool is enough. Two is a Week 4 problem.',
      'Claude asks for it — your code decides whether to run it',
    ],
    code: {
      kind: 'paste', pasteWhere: 'Claude Code',
      label: 'Claude Code prompt — define and implement the tool',
      code: 'Create assistant/tools.py for my workflow.\n\nDefine ONE tool that fetches the real information my assistant needs in order to decide. Give it:\n- a precise name\n- a description that says exactly WHEN it should be used, in the words someone would actually use\n- an input_schema with the minimum required arguments\n\nThen implement the real Python function behind it. If my project has a data file or an existing function it should read, use that; if not, create a small realistic JSON data file alongside it and read from that.\n\nAlso export a dispatch(name, args) helper that runs the right function by name and returns a plain dict, raising a clear error for an unknown tool name.\n\nShow me the tool description on its own before you write the rest — I want to read it.',
      expectedResult: 'A tool whose description names a trigger, plus a real function behind it that returns actual data.',
      stopCondition: 'You can read the description aloud and it says WHEN to use the tool, not just what it does.',
    },
    diagram: `flowchart LR
  D["📝 Description<br/>= when to use it"] --> T["🛠️ Tool definition"]
  S["📐 input_schema<br/>minimum arguments"] --> T
  T --> IMPL["🐍 Real function"]
  IMPL --> DATA[("🗄️ Real data")]`,
    script: 'Stop on the description and compare a vague one to a precise one on screen — same lesson as Week 2\'s Skills descriptions, and it lands faster because they have seen it before. This is the slide where tool use either works all night or silently does not.',
  },
  {
    segment: 'guided-build', eyebrow: '3️⃣ CP2 · The capped loop', title: 'The request-execute-return loop — with brakes on it from the start',
    body: 'This is the beating heart of every agent you will build for the rest of the program. Claude asks for a tool, your code runs it, you hand the result back, Claude continues. The one thing we are doing differently from every tutorial on the internet: the cap goes in now, not later. A loop without a maximum turn count is the bug that spends money all night, and you already know that because we watched it happen on Monday.',
    bullets: [
      'stop_reason == "tool_use" → run it, return the result, call again',
      'The tool_result must carry the matching tool_use_id',
      'MAX_TURNS from the first line of code, not after the incident',
      'Return every tool result in ONE user message, not several',
    ],
    code: {
      kind: 'paste', pasteWhere: 'Claude Code',
      label: 'Claude Code prompt — the loop, with a cap',
      code: 'Add the tool-use loop to assistant/assistant.py.\n\nIt should:\n1. Send the incoming item with the SYSTEM prompt and the tool from tools.py.\n2. While stop_reason is "tool_use": append the assistant turn, run every requested tool through dispatch(), and append ALL the tool_result blocks in a SINGLE user message, each with its matching tool_use_id. Then call the API again.\n3. Enforce a MAX_TURNS constant of 5. If the loop hits it, stop and raise a clear, named error rather than continuing.\n4. Pass an explicit timeout on every API call.\n5. Accumulate the total input and output tokens across every call in the loop and return them alongside the result.\n\nExplain the MAX_TURNS choice in a one-line comment.',
      expectedResult: 'A loop that terminates on its own, and a token total covering EVERY call it made — not just the last one.',
      stopCondition: 'You can point at the line that stops a runaway loop.',
      rescue: 'Second call rejected? The tool_use_id on the result has to match the one Claude sent — tell Claude Code that is the bug.',
    },
    diagram: `flowchart LR
  Q["📨 The item"] --> C["🧠 Claude"]
  C -->|"tool_use"| R["🐍 dispatch()<br/>runs your function"]
  R --> C
  C -->|"end_turn"| OUT["✅ Answer"]
  CAP["🛑 MAX_TURNS = 5"] -.-> C`,
    script: 'Trace the cycle on the diagram, then point at the dashed brake line and say it plainly: this is the difference between a program and a liability. Everyone adds the cap now, tonight, before it has ever misbehaved.',
  },
  {
    segment: 'guided-build', eyebrow: '4️⃣ CP2 · Structured result', title: 'End every run with a shape your systems can ingest',
    body: 'The loop gives you a good answer in prose. Prose is where automation goes to die — the next system in your chain cannot act on a paragraph. So the last step of every run forces the result into a declared schema: the decision, the evidence the tool returned, and whatever your workflow actually needs downstream. That record is the real output of tonight. Everything before it was how you earned the right to produce it.',
    bullets: [
      'One final call that constrains the output to your schema',
      'Include the tool data, not just the model\'s conclusion',
      'Validate at the boundary — reject a bad shape loudly, here',
      'This record is what a database, a ticket system, or an email can consume',
    ],
    code: {
      kind: 'paste', pasteWhere: 'Claude Code',
      label: 'Claude Code prompt — force the final shape',
      code: 'Add a final structured step to assistant/assistant.py.\n\nAfter the tool loop finishes, make one more API call that returns the result as validated JSON using `output_config` with a `format` of type `json_schema` (NOT the deprecated top-level output_format parameter).\n\nDesign the schema for MY workflow. It must include: the decision or category, the key facts the tool actually returned, a confidence or urgency field, and the human-readable output my workflow needs. Set additionalProperties to false and mark every field required.\n\nParse the JSON and return it as a plain dict together with the accumulated token totals. If parsing fails, raise a clear named error instead of returning a half-built record.',
      expectedResult: 'A dict with real values in named fields — including facts that could only have come from your tool.',
      stopCondition: 'The record contains tool-sourced data, which is proof the whole chain ran.',
    },
    diagram: `flowchart LR
  L["🔁 Loop finishes"] --> F["📨 One final call<br/>output_config.format"]
  F --> J["📦 Validated record"]
  J --> DB[("🗄️ Your systems")]
  J --> TOK["📊 Token totals"]`,
    script: 'Say the deprecation out loud — the older pattern they may find in a blog post is the deprecated one, and the prompt names the current parameter deliberately. That is a real habit: check the API surface, do not trust the first search result.',
  },
  {
    segment: 'guided-build', eyebrow: '5️⃣ CP2 · Run it for real', title: 'Point it at your own workflow and watch it do the thing',
    body: 'This is the moment. Feed it a genuine item from your own world — a real ticket, a real invoice, a real request — and read the record that comes back. It should name a decision, cite something the tool actually fetched, and print what it cost. If it does all three, you have built a Workflow Assistant, and the rest of tonight is about making it trustworthy.',
    bullets: [
      'Use a REAL item from your workflow, not a made-up one',
      'Check: is the decision right? Is the tool data actually in there?',
      'Read the token total — that is one run of your automation, priced',
      'Then tap "I finished" so we know who to call on for demos',
    ],
    code: {
      kind: 'paste', pasteWhere: 'Claude Code',
      label: 'Claude Code prompt — run it end to end',
      code: 'Add a small __main__ entry point to assistant/assistant.py that takes one input item on the command line, runs the full assistant, and prints — clearly labelled — the structured record, which tools were called with which arguments, and the total input and output tokens for the whole run.\n\nThen run it once with this real item from my workflow: [PASTE A REAL ONE].',
      expectedResult: 'A labelled printout: the record, the tool calls, and the token total for the whole run.',
      stopCondition: 'The record is right for a real item you brought — not a sample.',
    },
    diagram: `flowchart LR
  IT["📥 A real item<br/>from your work"] --> A["🤖 Your assistant"]
  A --> REC["📦 The record"]
  A --> TC["🛠️ Tools called"]
  A --> TOK["💵 Tokens + cost"]`,
    script: 'Slow down and let the room actually read their own output. Call on two people to say what their assistant decided and what it cost. This is the peak-energy moment of the night — do not rush past it into the eval.',
  },
  {
    segment: 'guided-build', eyebrow: '6️⃣ CP3 · The dataset', title: 'Ten examples with known answers — that is an eval',
    body: 'Here is the thing nobody expects: an eval is not sophisticated. It is a handful of inputs where you already know the right answer, written down in a file. Ten is plenty. The value is not the size, it is that the answer is decided in advance, by you, in a calm moment — instead of after a change, when you are looking at the output and trying to convince yourself it looks fine.',
    bullets: [
      'Ten items, each with the answer you know is correct',
      'Include the awkward ones: missing data, ambiguous, malformed',
      'Written down BEFORE you look at what the assistant says',
      'This file is the asset — it outlives every prompt you write',
    ],
    code: {
      kind: 'paste', pasteWhere: 'Claude Code',
      label: 'Claude Code prompt — build the eval set',
      code: 'Create assistant/eval_set.json with 10 test cases for my workflow.\n\nEach case has the input item and the expected values for the fields my schema produces. Base them on my real workflow, and make sure at least three are deliberately awkward: one where the tool will find nothing, one that is genuinely ambiguous, and one with malformed or incomplete input.\n\nAsk me to confirm the expected answers rather than inventing them — I am the one who knows what correct looks like here.',
      expectedResult: 'Ten cases you agree with, including three that are genuinely hard.',
      stopCondition: 'You have personally confirmed the expected answers — not accepted the model\'s guesses.',
    },
    diagram: `flowchart LR
  Y["👤 You decide<br/>what is correct"] --> D["📄 eval_set.json<br/>10 cases"]
  D --> E1["🙂 7 normal"]
  D --> E2["😖 3 awkward<br/>empty · ambiguous · malformed"]`,
    script: 'Push back on anyone who lets Claude Code invent the expected answers — that is grading your own homework with the answer key you just wrote. The instructor confirming the answers IS the exercise.',
  },
  {
    segment: 'guided-build', eyebrow: '7️⃣ CP3 · The number', title: 'Grade it — and now "better" stops being an opinion',
    body: 'Run all ten, compare each result to the expected answer, print a score and a list of what failed. That number is the whole point. From here on, when you change the prompt or drop to a cheaper model, you are not guessing whether you made it worse — you re-run this and look. That is the difference between tuning a system and rearranging it hopefully.',
    bullets: [
      'Score = how many matched, plus exactly which ones did not',
      'It also totals the tokens, so quality and cost sit side by side',
      'Now try Haiku and re-run: did the score hold? Then you just saved 80%',
      'A failing case is a gift — it is the next thing to fix, named for you',
    ],
    code: {
      kind: 'paste', pasteWhere: 'Claude Code',
      label: 'Claude Code prompt — the grader',
      code: 'Create assistant/eval.py.\n\nIt should load eval_set.json, run the assistant on every case, compare the produced fields to the expected ones, and print:\n- a score line, "N of 10 passed"\n- for each failure: the input, what was expected, and what actually came back\n- the total tokens and estimated dollar cost for the whole eval run\n\nMake the model configurable from the command line so I can re-run the identical eval against a different model without editing code.\n\nRun it now against claude-opus-5.',
      expectedResult: 'A score out of 10, named failures, and what the run cost.',
      stopCondition: 'You have a number. It does not have to be 10 — it has to be measured.',
      rescue: 'Score is 0? Almost always the comparison is too strict — string-equality on a free-text field. Tell Claude Code to compare the decision fields only.',
    },
    diagram: `flowchart LR
  D["📄 10 cases"] --> R["🔁 Run each"]
  R --> CMP["⚖️ Compare to expected"]
  CMP --> S["📊 N of 10 + failures"]
  S --> SW["🔄 Swap model,<br/>re-run, compare"]`,
    script: 'If time allows, do the model swap live — re-run against Haiku and put the two scores side by side with the two costs. That single comparison is the most valuable thirty seconds of the entire week, because it is the architect decision made with evidence instead of vibes.',
  },

  /* ============================== failure ================================= */
  {
    segment: 'failure', eyebrow: '💥 Break it on purpose', title: 'Three ways this dies in production — let us cause all three now',
    body: 'Your assistant works. That is exactly why this is the right moment to break it, while it is small and you are watching. We are going to cause the three failures we predicted on Monday: hardcode the key so it leaks, remove the cap so the loop runs away, and change the prompt with no eval so a regression goes unnoticed. Do all three. None of them will throw an error, which is precisely the lesson.',
    bullets: [
      '🔓 Move the key into the source file — see how normal it looks',
      '♾️ Remove MAX_TURNS and feed it something confusing',
      '🎲 Change the system prompt, ship it, and try to tell if it got worse',
      'None of the three raises an exception. That is the point.',
    ],
    code: {
      kind: 'paste', pasteWhere: 'Claude Code',
      label: 'Claude Code prompt — break it, deliberately',
      code: 'We are doing a deliberate failure exercise on a copy — do NOT change my working files.\n\nCopy assistant/ to assistant_broken/ and introduce these three faults there:\n1. Replace the environment lookup with a hardcoded placeholder API key string in the source.\n2. Remove the MAX_TURNS cap so the tool loop can run without limit.\n3. Reword the system prompt so it is noticeably vaguer.\n\nThen run the broken copy against the eval set and show me the score next to the original score.\n\nDo not fix anything yet.',
      expectedResult: 'A visibly worse eval score from fault 3 — and faults 1 and 2 producing no error at all.',
      stopCondition: 'You have seen the score drop and noticed nothing crashed.',
    },
    diagram: `flowchart TD
  A["🤖 Working assistant"] --> F1["🔓 Key in source<br/>→ leaks on push"]
  A --> F2["♾️ No cap<br/>→ spends all night"]
  A --> F3["🎲 Vaguer prompt<br/>→ score drops"]
  F1 --> N["😐 No error raised"]
  F2 --> N
  F3 --> N`,
    script: 'Let it fail visibly and sit in it for a beat — this is the highest-retention moment of the week. Point out that only fault 3 was even detectable, and only because they built the eval. Faults 1 and 2 looked completely healthy.',
  },
  {
    segment: 'failure', eyebrow: '🔧 Harden it', title: 'One fix per break — and each one is boring on purpose',
    body: 'Now repair them, and notice how unglamorous each fix is. The key goes back to the environment and the leaked one gets rotated, because a key that has been in a file is compromised whether or not it was pushed. The cap comes back, with a timeout and a clear named error. And the prompt change gets reverted because the eval told you it was worse — which is the entire reason the eval exists. This is what "production-ready" actually looks like: small, dull, deliberate.',
    bullets: [
      '🔐 Key back to the environment — and rotate the exposed one',
      '🛑 Cap + timeout + a named error when it gives up',
      '📊 Revert the prompt, because the number said so',
      'Boring fixes are the sign you are doing this right',
    ],
    code: {
      kind: 'paste', pasteWhere: 'Claude Code',
      label: 'Claude Code prompt — harden all three',
      code: 'Now fix all three faults in assistant_broken/ and show me each diff:\n\n1. Restore the environment lookup and remove the hardcoded key entirely. Add a startup check that raises a clear error if ANTHROPIC_API_KEY is missing, so a misconfiguration fails immediately instead of halfway through a run.\n2. Restore MAX_TURNS, add an explicit per-call timeout, and raise a specific named error when the cap is hit — not a generic Exception.\n3. Revert the system prompt to the version that scored higher.\n\nThen re-run the eval and show me the score is back.\n\nFinally: list anything else in this code that would fail silently rather than loudly.',
      expectedResult: 'Score back to where it was, and a list of remaining silent-failure risks.',
      stopCondition: 'The number recovered, and you have read the silent-failure list.',
    },
    diagram: `flowchart LR
  F1["🔓 Leaked key"] --> H1["🔐 Environment<br/>+ rotate + startup check"]
  F2["♾️ Runaway loop"] --> H2["🛑 Cap + timeout<br/>+ named error"]
  F3["🎲 Worse prompt"] --> H3["📊 Revert —<br/>the eval said so"]`,
    script: 'Ask the room which of the three fixes they would have thought of on their own before tonight. Usually it is only the first. That gap is exactly what the Build-Break-Harden habit is for, and it is worth naming out loud.',
  },
  {
    segment: 'failure', eyebrow: '🏁 Prove it', title: 'Rotate the key you just exposed — yes, really, before you leave',
    body: 'One last thing, and it is not theoretical. If you hardcoded a real key into a file tonight, that key is now in your shell history, possibly in your editor\'s undo buffer, and one careless commit from being public. Go to the Console, revoke it, and create a new one. It takes forty seconds. The habit of rotating without hesitating — rather than reasoning about whether it probably leaked — is the actual security lesson of this week.',
    bullets: [
      'Console → API keys → revoke the exposed one → create a new one',
      'Set the new one in your terminal; re-run the eval to confirm',
      'While you are there: set a spend limit if you have not',
      'Rotate first, investigate second. Always that order.',
    ],
    diagram: `flowchart LR
  E["🔓 Key touched a file"] --> R["🚫 Revoke it<br/>in the Console"]
  R --> N["🔑 Create a new one"]
  N --> T["⌨️ Set it in your terminal"]
  T --> V["✅ Re-run the eval"]`,
    script: 'Do this one with them, live, and wait — it is forty seconds and it is the difference between knowing the rule and having the habit. Then straight into demos while the energy is high.',
  },
];
