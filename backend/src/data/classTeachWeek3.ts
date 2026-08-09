/**
 * classTeachWeek3.ts — hand-authored deep teaching content for Week 3
 * Architecture Day ("Claude API + Workflow Assistant").
 *
 * Week 3 Monday is the class where two things happen for the first time:
 *   1. Students actually generate their capstone build in the portal (the
 *      check-in segment is a celebration + a live "start it now" instruction,
 *      then the class explains what the platform did in the background and how
 *      to work the resulting task list as the architect).
 *   2. The Claude API is introduced to a room whose entire mental model so far
 *      is "Claude Code in the VS Code terminal". The subscription-vs-API-credits
 *      distinction is taught explicitly, with the token math, because it is the
 *      first time anything they build costs money per run.
 *
 * Every explanation slide carries its own mermaid diagram (Ram's standing
 * feedback, applied to Week 2 Thursday first) — kept to ≤7 short-labelled nodes
 * so the text stays legible when the instructor click-zooms a diagram to full
 * screen mid-class.
 *
 * Merged over the generated Week 3 Monday content by classTeachContent.ts;
 * Week 3 Thursday is untouched and still comes from classTeachWeeks.ts.
 * Dependency-free pure data, exactly like classTeachContent.ts.
 */
import type { TeachSlide } from './classTeachContent';

export const WEEK3_MONDAY: TeachSlide[] = [
  /* ================= check-in · celebration + launch the build ============= */
  {
    segment: 'checkin', eyebrow: '🎉 Today is the day', title: 'Everybody in this room gets their project built tonight',
    body: 'For two weeks you have been describing what you want to build. Tonight the platform turns that description into a real plan — releases, stories, tasks, each with a Claude Code prompt already written and acceptance criteria already defined. You are going to start that generation in the next ninety seconds and let it run while we talk. By the time we come back to it, every person in this room will have their own build plan on screen.',
    bullets: [
      'You start the generation NOW — it runs while class continues',
      'Then we explain what it did in the background',
      'Then we explain how you work it as the architect',
      'Then: what "call the Claude API" in those tasks actually means',
    ],
    diagram: `flowchart LR
  A["🚀 Start your build<br/>(right now)"] --> B["🏭 The platform<br/>decomposes it"]
  B --> C["📋 Your task list,<br/>prompts included"]
  C --> D["🔌 Tonight: what<br/>those prompts need"]`,
    script: 'Open with real energy — this is the payoff of two weeks of setup. Do not explain the pipeline yet. Get them clicking first; the explanation is more interesting once their own build is generating.',
  },
  {
    segment: 'checkin', eyebrow: '▶️ Do this right now', title: 'Four clicks, one paragraph, then leave it running',
    body: 'Open the portal, go to Projects, click "Start a new build", and describe your idea in one paragraph — who it is for, what it does, and the one thing it has to get right. Then hit go and leave the tab open. It takes about twenty minutes to build, which is exactly why you start it now: it runs in the background while we talk, and it will be waiting for you by the time we need it. It does not have to be your final idea; it has to be an idea you care enough about to argue with.',
    bullets: [
      'Portal → Projects → "Start a new build"',
      'One paragraph: who it is for · what it does · the one thing it must get right',
      'Hit go, leave the tab running — it takes about 20 minutes',
      'Not final — good enough to react to is the bar tonight',
    ],
    diagram: `flowchart LR
  P["🖥️ Portal"] --> PR["📁 Projects"]
  PR --> S["➕ Start a new build"]
  S --> I["✍️ Your idea,<br/>one paragraph"]
  I --> G["⏳ Go — it runs<br/>~20 min in the background"]`,
    script: 'Screen-share the exact click path once, slowly, then stop talking and let the room work. PACING — this matters: the build takes ~20 minutes, so wait only until most students report theirs is GENERATING, never until one finishes. If they launch around minute 5, builds land around minute 25, which is the end of the business-problem segment — that is deliberate, and it is why the pipeline explanation comes next. Sitting here watching progress bars puts you 20 minutes behind for the rest of the night. Anyone stuck goes to a mentor now, not at the break.',
  },
  {
    segment: 'checkin', eyebrow: '🗺️ While it runs', title: 'Three things you leave with tonight',
    body: 'While your build generates, here is the shape of the next two hours. First, what the platform actually did to your paragraph. Second, how you work the result — because the prompts are already written and your job is something else entirely. Third, the thing nobody has told you yet: what it costs when your project calls Claude from code instead of from your keyboard.',
    bullets: [
      '1️⃣ How your build got made — the decomposition pipeline',
      '2️⃣ How to work it — you are the architect, not the typist',
      '3️⃣ Claude Code vs the Claude API — and the two separate bills',
    ],
    diagram: `flowchart TD
  T["📚 Tonight"] --> A["1️⃣ How your build<br/>was made"]
  T --> B["2️⃣ How to work it<br/>as the architect"]
  T --> C["3️⃣ What 'call the API'<br/>actually costs"]`,
    script: 'Say the three out loud and hold up three fingers. Promise the third one explicitly — "nobody has told you what this costs yet; tonight we fix that." That promise carries the room through the first hour.',
  },

  /* ============ business problem · the pipeline + being the architect ====== */
  {
    segment: 'business-problem', eyebrow: '🏭 In the background', title: 'What the platform did to your paragraph',
    body: 'Your one paragraph went through a decomposition pipeline, not a template. It was shaped into who-what-why, turned into requirements, grouped into releases you could actually ship one at a time, split into stories a real user could do, and finally broken into tasks small enough that one Claude Code prompt can finish one. Nothing in that chain was guessed at random — each layer had to justify itself against the layer above it.',
    bullets: [
      'Shaping — who it serves, what it does, why it matters',
      'Requirements — the testable statements of what must be true',
      'Releases — shippable slices, not a big bang',
      'Stories → Tasks — one prompt, one outcome, one acceptance check',
    ],
    diagram: `flowchart LR
  I["✍️ Your idea"] --> SH["🔍 Shaping<br/>who + what + why"]
  SH --> RQ["📑 Requirements"]
  RQ --> RL["📦 Releases"]
  RL --> ST["📘 Stories"]
  ST --> TK["✅ Tasks<br/>prompt + acceptance"]`,
    script: 'Walk the diagram left to right, one node at a time. Then pull up a real student build on screen and point at each layer in the actual UI. Seeing their own words at the top of that chain is the moment this lands.',
  },
  {
    segment: 'business-problem', eyebrow: '🧭 Read your plan', title: 'Release, story, task — and why the acceptance line matters most',
    body: 'A release is a slice you could put in front of someone. A story is one thing a user can do. A task is one prompt-sized piece of work. Under every task sits an acceptance criterion — the sentence that tells you whether the thing that got built is the thing you wanted. Most people skim past that line. It is the most valuable line on the page, because it is the only one that can tell you Claude got it wrong.',
    bullets: [
      'Release = a shippable slice',
      'Story = one thing a user can do',
      'Task = one Claude Code prompt',
      'Acceptance = how you know it is actually done',
    ],
    diagram: `flowchart TD
  RL["📦 Release<br/>a shippable slice"] --> ST["📘 Story<br/>one user can do X"]
  ST --> TK["✅ Task<br/>one Claude Code prompt"]
  TK --> V["🔎 Acceptance<br/>how you know it is done"]`,
    script: 'Open one real task on screen and read its acceptance criterion out loud, slowly. Ask the room: "if Claude hands you something, how would you check that against this line?" Sit in the silence — that question is the whole job.',
  },
  {
    segment: 'business-problem', eyebrow: '🏛️ Your actual job', title: 'The prompts are already written. You are not the typist.',
    body: 'Every task ships with a copy-ready prompt. That means the typing is solved, and the part that is left is the part that is actually hard: looking at what comes back and deciding whether it is the system you want. Copy the prompt, paste it into Claude Code, read what it proposes — and then either approve it or say exactly what is wrong and make it re-propose. Redirecting is not a failure of the prompt. Redirecting is the job.',
    bullets: [
      'Copy the task prompt → paste in Claude Code → read the plan',
      'Approve only when it matches the system you actually want',
      'Wrong? Name the specific thing that is wrong and re-propose',
      'Then check the result against the acceptance criterion',
    ],
    diagram: `flowchart LR
  C["📋 Copy the task prompt"] --> P["⌨️ Paste in Claude Code"]
  P --> R["👀 Read what it proposes"]
  R --> D{"🏛️ Is this the<br/>system you want?"}
  D -->|"yes"| A["✅ Approve, then check<br/>the acceptance criterion"]
  D -->|"no"| RD["🎯 Redirect —<br/>name what is wrong"]
  RD --> R`,
    script: 'This is the highest-value slide of the first hour. Say the line plainly: "the prompt is not the skill — reading the answer is the skill." Then demo one redirect live so they see it is a normal, unremarkable thing to do.',
  },
  {
    segment: 'business-problem', eyebrow: '🔌 The bridge', title: 'Now look at your task list — half of it needs something you have never done',
    body: 'Scroll your own build plan and find the tasks that say the assistant classifies, drafts, summarizes, or decides something. Those tasks need Claude to run inside your product — at 2am, on a schedule, with no human at the keyboard. Everything you know how to do so far involves you sitting in VS Code watching Claude Code work. That is a different door into the same building, and it has a different lock and a different bill.',
    bullets: [
      'Claude Code = you are there, watching, approving',
      'Your app = nobody is there; it still has to run',
      'The tasks that say "classify / draft / decide" are API tasks',
      'That is the rest of tonight',
    ],
    diagram: `flowchart LR
  Y["👤 You"] --> CC["💻 Claude Code<br/>you are watching"]
  CC --> R[("📁 Your repo")]
  R -.->|"the code you<br/>just built"| APP["⚙️ Your app,<br/>running at 2am"]
  APP --> API["🔌 Claude API"]
  API --> APP`,
    script: 'Have students scroll their own plan and find one such task before you move on. Ask two people to read theirs out loud — the transition into the API lands ten times harder when it answers a question from their own build. TIMING: builds take ~20 minutes, so at this point in the class some are still finishing. Anyone whose plan is not ready uses yours on screen and checks their own at the break; do not stall the room waiting for stragglers.',
  },

  /* ================= architecture · two doors, two bills, Python ========== */
  {
    segment: 'architecture', eyebrow: '🚪 Two doors', title: 'Claude Code and the Claude API are two doors into the same models',
    body: 'The model behind both is the same. What differs is who is driving. In Claude Code, a human drives every turn — you type, it proposes, you approve. Through the API, a program drives every turn — your code sends the message, reads the answer, and decides what happens next. Nothing about the intelligence changes when you switch doors. What changes is that nobody is watching, so everything that used to be your judgment now has to be written down as code.',
    bullets: [
      'Same models on both sides — this is not a lesser Claude',
      'Claude Code: a human drives, one turn at a time',
      'API: a program drives, unattended, on a schedule or a trigger',
      'Unattended means your judgment has to be encoded, not assumed',
    ],
    diagram: `flowchart TD
  H["🙋 A human drives<br/>every turn"] --> CC["💻 Claude Code<br/>in VS Code"]
  P["🐍 A program drives<br/>every turn"] --> API["🔌 Claude API"]
  CC --> M["🧠 The same<br/>Claude models"]
  API --> M`,
    script: 'Kill the most common misconception up front: "the API is not a cheaper, dumber Claude — it is the same model with a program in your chair." Then pause. The rest of this segment is about what that chair costs.',
  },
  {
    segment: 'architecture', eyebrow: '💳 The money slide', title: 'One Anthropic account, two completely separate bills',
    body: 'This is the distinction that surprises everyone, so let us be exact about it. Your Claude subscription — Pro, Max, or a team seat — pays for the seat you personally sit in: Claude Code in your terminal and the Claude apps. It is a flat monthly fee. API access is a different product with a different meter: you create a key in the Anthropic Console, you load credits, and you are billed per token for every call your code makes. Your subscription does not pay for your app. Your API credits do not pay for Claude Code. Same login, two wallets.',
    bullets: [
      'Subscription (Pro / Max / Team) → Claude Code + the Claude apps → flat monthly',
      'Console (console.anthropic.com) → API keys + credits → billed per token',
      'A subscription grants ZERO API credits',
      'API credits do NOT pay for your Claude Code seat',
    ],
    diagram: `flowchart TD
  A["🏢 One Anthropic account"] --> S["💺 Claude subscription<br/>Pro / Max / Team"]
  A --> C["🎛️ Anthropic Console<br/>console.anthropic.com"]
  S --> CC["💻 Claude Code + apps<br/>flat monthly fee"]
  C --> K["🔑 API keys + credits<br/>billed per token"]`,
    script: 'Slow down here. Say the two sentences deliberately: "your subscription pays for YOUR seat" and "your API credits pay for YOUR CODE." Then screen-share the Console billing page next to the subscription page so they see two different screens with two different numbers.',
  },
  {
    segment: 'architecture', eyebrow: '🧮 The meter', title: 'Every call has two meters: what you send in, and what Claude writes back',
    body: 'A token is roughly three quarters of a word — a useful approximation, not a rule. Every API call bills your input tokens (the system prompt, the conversation so far, the tool definitions, the question) plus your output tokens (everything Claude writes back), each at a rate set by the model you named. Output costs about five times input on every current model, which is why long, chatty answers are the expensive part, not long questions. The model you name is therefore a cost decision, made once, in one line of code.',
    bullets: [
      '≈ 1 token ≈ ¾ of a word (rough, English text)',
      'Input = system + history + tools + your question',
      'Output = everything Claude writes back — about 5× the input rate',
      'Claude Opus 5 $5 / $25 · Sonnet 5 $3 / $15 · Haiku 4.5 $1 / $5 per million in / out',
    ],
    evidence: [
      {
        claim: 'Per-million-token rates: Opus 5 $5 in / $25 out, Sonnet 5 $3 in / $15 out, Haiku 4.5 $1 in / $5 out',
        publisher: 'Anthropic', sourceTitle: 'Claude API pricing (platform.claude.com/docs/en/pricing)',
        publicationDate: '2026', sourceType: 'official-doc',
        note: 'Sonnet 5 carries introductory pricing of $2 / $10 through 2026-08-31. Rates change — open the live pricing page in class rather than trusting this slide.',
      },
    ],
    diagram: `flowchart LR
  CALL["🔌 One API call"] --> IN["📥 Input tokens<br/>everything you send"]
  CALL --> OUT["📤 Output tokens<br/>everything Claude writes"]
  IN --> B["💵 The bill"]
  OUT --> B
  M["🎚️ Model choice sets<br/>both rates"] -.-> B`,
    script: 'Open the live pricing page on screen — do not read these numbers off the slide as gospel. Say plainly that rates move and that checking the page is part of the job. Then go straight into the worked example on the next slide.',
  },
  {
    segment: 'architecture', eyebrow: '💰 Worked example', title: 'The same assistant costs $90, $270, or $450 a month — you choose which',
    body: 'Take one realistic job: a support-triage assistant reading a thousand tickets a day. Each ticket costs about 1,500 input tokens once you count the system prompt, the ticket text, and the tool schema, and about 300 output tokens for the structured answer. That is a third of a cent per ticket on Haiku, nine tenths of a cent on Sonnet, a cent and a half on Opus. Nothing about the code changes between those three numbers. One string changes.',
    bullets: [
      'Per ticket: ~1,500 input tokens + ~300 output tokens',
      'Haiku 4.5 → ~$0.003 · Sonnet 5 → ~$0.009 · Opus 5 → ~$0.015',
      '1,000 tickets/day → about $90 · $270 · $450 per month',
      'Same code. The model name is the only difference.',
    ],
    diagram: `flowchart LR
  T["🎫 1,000 tickets/day<br/>1.5k in · 300 out"] --> H["🪶 Haiku 4.5<br/>≈ $90 / month"]
  T --> S["⚖️ Sonnet 5<br/>≈ $270 / month"]
  T --> O["🧠 Opus 5<br/>≈ $450 / month"]`,
    script: 'Do the arithmetic live on one model so they see it is just multiplication, then reveal the other two. Land the architect point: "you do not pick the smartest model, you pick the cheapest model that passes your eval" — and that is exactly why Week 3 ends with an eval.',
  },
  {
    segment: 'architecture', eyebrow: '🐍 Where Python comes in', title: 'Python is the thing that shows up when you do not',
    body: 'Here is the honest answer to "why do I suddenly need Python?" Something has to be awake at 2am. Something has to notice the ticket arrived, decide it is worth a Claude call, make the call, read the answer, and then do something real with it — write the row, send the email, update the sheet. Claude does not do that part. Your program does. Python is simply the most common language for that wrapper, and it is short: the interesting version of this is usually forty lines, not four hundred.',
    bullets: [
      'A trigger fires — a ticket, a file, a schedule, a webhook',
      'Your Python program wakes up and decides what to send',
      'It calls the API and reads the structured answer',
      'It writes the result somewhere real — that last step is the whole point',
    ],
    diagram: `flowchart LR
  T["⏰ A trigger<br/>ticket · file · 2am cron"] --> PY["🐍 Your Python program"]
  PY --> API["🔌 Claude API"]
  API --> PY
  PY --> SYS["🗄️ Your systems<br/>database · email · sheet"]`,
    script: 'Directly address the fear in the room: "you are not learning Python tonight, and you are not going to be a Python developer. You are learning to read forty lines and tell whether they do what you meant." Say it before anyone has to ask.',
  },
  {
    segment: 'architecture', eyebrow: '📮 One endpoint', title: 'The whole API is one move: you send a request, you get one message back',
    body: 'There is far less to this than people expect. You send three things — a system prompt with the standing rules, the conversation so far, and optionally a list of tools Claude is allowed to ask for. You get back one message, plus a usage report telling you exactly what it cost. Tools, structured output, streaming: those are all options on this one call, not separate APIs. And there is no server-side memory, so the conversation is whatever you resend.',
    bullets: [
      'system = standing rules · messages = the conversation · tools = what it may ask for',
      'One message comes back, plus a token bill you can read',
      'Structured output and tool use are options on this same call',
      'No memory on the server — your list IS the memory',
    ],
    diagram: `flowchart LR
  S["📜 system<br/>standing rules"] --> REQ["📨 One request"]
  MSG["💬 messages<br/>conversation so far"] --> REQ
  TL["🛠️ tools<br/>what it may ask for"] --> REQ
  REQ --> C["🧠 Claude"]
  C --> RSP["📬 One message back<br/>+ a token bill"]`,
    script: 'Relief slide — say "that is the entire API" and mean it. Then set up the statelessness point, because forgetting to resend history is the single most common bug they will hit on Thursday.',
  },

  /* ==================== deconstruct · the demo that breaks ================ */
  {
    segment: 'deconstruct', eyebrow: '✅ The happy path', title: 'It works perfectly in the demo. Watch.',
    body: 'Here is an assistant a student built last cohort. A ticket comes in, it calls a lookup tool for the order, and it writes back a clean, correct reply. In the demo it never missed. We are going to trace exactly this path, agree that it is good code, and then send it the inputs a real customer actually sends at 2am with nobody watching.',
    bullets: [
      'One clean ticket in, one correct reply out',
      'The demo proves it CAN work, never that it WILL',
      'Every hidden assumption here becomes a 2am page later',
    ],
    diagram: `flowchart LR
  T["🎫 One clean ticket"] --> A["🐍 The assistant"]
  A --> L["🔎 lookup_order"]
  L --> A
  A --> R["✅ A correct reply"]`,
    script: 'Let the code genuinely look good — do not telegraph the failure. Then flip: "now let us stop being nice to it." The contrast is what makes the next slide stick.',
  },
  {
    segment: 'deconstruct', eyebrow: '☠️ Three silent failures', title: 'None of these throw an error. That is what makes them expensive.',
    body: 'First: the model answers in a friendly paragraph instead of the JSON your code expects, so your parser grabs the wrong field and quietly writes a wrong answer to a real customer. Second: the tool loop has no cap, so a confused model calls the same tool over and over — and now it is 3am and your credits are draining with nobody awake to notice. Third: there is no eval, so when you tweak the prompt next week you have no way of knowing you made it worse. Notice that only one of these three is a coding bug.',
    bullets: [
      '🌀 Prose instead of JSON → the wrong field, written confidently',
      '♾️ Uncapped tool loop → credits draining overnight, no alarm',
      '🎲 No eval → you cannot tell that today is worse than yesterday',
      'Zero of the three raise an exception',
    ],
    diagram: `flowchart TD
  A["🐍 The assistant,<br/>in production"] --> F1["🌀 Prose, not JSON<br/>→ wrong field, silently"]
  A --> F2["♾️ Uncapped tool loop<br/>→ credits drain overnight"]
  A --> F3["🎲 No eval<br/>→ regressions are invisible"]`,
    script: 'Tie the middle one straight back to the money slide — this is the first time in the program where a bug has a dollar amount attached. Say the number: an uncapped overnight loop on Opus is not a rounding error.',
  },
  {
    segment: 'deconstruct', eyebrow: '🧭 What good looks like', title: 'Each fix is small, specific, and boring',
    body: 'The malformed output becomes a schema you declare and validate at the boundary. The runaway loop gets a maximum number of turns, a timeout on every call, and a spend ceiling that stops the thing before your credits do. The invisible regression gets an eval — a small dataset and a grader that produces a number you can compare week over week. None of this is clever. It is the difference between a program you can put your name on and one you cross your fingers over.',
    bullets: [
      '📦 A declared schema, validated at the boundary',
      '🛑 Max turns + per-call timeout + a spend ceiling',
      '📊 An eval: dataset + grader + a score you can defend',
      'That hardened version is what you build on Thursday',
    ],
    diagram: `flowchart TD
  A["🐍 The assistant,<br/>hardened"] --> H1["📦 Schema + validation<br/>at the boundary"]
  A --> H2["🛑 Max turns · timeout<br/>· spend ceiling"]
  A --> H3["📊 Eval: dataset<br/>+ grader + score"]`,
    script: 'Preview Thursday without giving away the code: "you will build the fragile version fast, break it on purpose three ways, and harden each break." Then break — they have earned it.',
  },

  /* ===================== micro-build · hands on Python ==================== */
  {
    segment: 'micro-build', eyebrow: '🔑 Your key', title: 'Get an API key — and put it somewhere your code can read but GitHub cannot',
    body: 'Go to the Anthropic Console, create an API key, and set it as an environment variable called ANTHROPIC_API_KEY. Then the Python client reads it for you with no arguments — which means the key never appears in a file, never gets committed, and never ends up in a screenshot. This is not a style preference. A key committed to git is a key you must treat as already stolen, because it is public the moment you push.',
    bullets: [
      'console.anthropic.com → API keys → create a key',
      'Set ANTHROPIC_API_KEY in your environment, not in a file',
      'anthropic.Anthropic() takes no key argument — it reads the environment',
      'A key in source is a compromised key. Rotate it, do not hide it.',
    ],
    code: {
      label: 'Set the key + install the SDK',
      code: 'pip install anthropic\n\n# macOS / Linux\nexport ANTHROPIC_API_KEY=sk-ant-...\n\n# Windows PowerShell\n$env:ANTHROPIC_API_KEY="sk-ant-..."',
    },
    diagram: `flowchart LR
  CON["🎛️ Console →<br/>create an API key"] --> ENV["🔐 Set ANTHROPIC_API_KEY<br/>in your environment"]
  ENV --> CL["🐍 anthropic.Anthropic()<br/>reads it for you"]
  CL --> OK["✅ Key never in your code,<br/>never on GitHub"]`,
    script: 'Do this one with them, screen shared, step by step — a broken key here blocks everything that follows. Watch the pulse rail and do not advance until most report a key set.',
  },
  {
    segment: 'micro-build', eyebrow: '⚙️ First call', title: 'Your first Claude call from a file instead of a keyboard',
    body: 'Everyone runs this now. It is a real Python file — you save it, you run it, and a reply comes back with no chat window anywhere. Notice the last line: every response tells you exactly how many input and output tokens it used. That is your meter, printed on every single call, and reading it is a habit worth forming tonight rather than after your first surprising invoice.',
    bullets: [
      'Save as hello_claude.py, then: python hello_claude.py',
      'The client takes no key — it reads the environment',
      'resp.usage tells you what the call cost, every time',
      'If a sentence comes back, your environment is real',
    ],
    code: {
      label: 'hello_claude.py',
      code: 'import anthropic\n\nclient = anthropic.Anthropic()   # reads ANTHROPIC_API_KEY from the environment\n\nresp = client.messages.create(\n    model="claude-opus-5",\n    max_tokens=512,\n    system="You are a support-operations assistant. Be concise and factual.",\n    messages=[{"role": "user", "content": "A customer cannot log in after a password reset. What do you need to help?"}],\n)\n\nprint(next(b.text for b in resp.content if b.type == "text"))\nprint("tokens in/out:", resp.usage.input_tokens, resp.usage.output_tokens)',
    },
    diagram: `flowchart LR
  PY["📄 hello_claude.py"] --> CL["🐍 client.messages.create"]
  CL --> API["🔌 Claude API"]
  API --> RSP["📬 resp.content<br/>+ resp.usage"]
  RSP --> PR["🖨️ print()"]`,
    script: 'Run it live first so they see the shape of a successful run, then let the room run it. Read the token numbers off your own screen out loud — connect it back to the money slide immediately.',
  },
  {
    segment: 'micro-build', eyebrow: '📦 Trustable output', title: 'Stop parsing prose — declare the shape you want',
    body: 'A friendly paragraph is unusable to the next function in your program, because your code has to guess where the order number lives. Instead you declare the shape once, and the response comes back matching it. Now the next step in your workflow can rely on category and urgency existing, with the values you allowed and nothing else. This one change is the difference between a demo and something the rest of your system can depend on.',
    bullets: [
      'Declare the fields and the allowed values, once',
      'enum pins the vocabulary — no creative new urgency levels',
      'Validate at the boundary, so bad shapes fail here, not three functions later',
      'The SDK also offers client.messages.parse() if you prefer typed objects',
    ],
    code: {
      label: 'A shape your next function can trust',
      code: 'import json\n\nTRIAGE = {\n    "type": "object",\n    "properties": {\n        "category": {"type": "string", "enum": ["shipping", "billing", "technical", "other"]},\n        "urgency": {"type": "string", "enum": ["low", "normal", "high"]},\n        "order_id": {"type": "string", "description": "The order ID, or an empty string if none was mentioned."},\n        "suggested_reply": {"type": "string"},\n    },\n    "required": ["category", "urgency", "order_id", "suggested_reply"],\n    "additionalProperties": False,\n}\n\nresp = client.messages.create(\n    model="claude-opus-5",\n    max_tokens=1024,\n    output_config={"format": {"type": "json_schema", "schema": TRIAGE}},\n    messages=[{"role": "user", "content": "Where is my order ORD-4471? It has been two weeks!"}],\n)\n\ntriage = json.loads(next(b.text for b in resp.content if b.type == "text"))\nprint(triage["category"], triage["urgency"], triage["order_id"])',
    },
    diagram: `flowchart LR
  S["📐 You declare the shape<br/>category · urgency · order_id"] --> R["📨 Request with<br/>output_config.format"]
  R --> V["📦 Validated JSON back"]
  V --> N["➡️ Your next function<br/>can rely on it"]`,
    script: 'Print the paragraph version and the object version side by side and ask: "which of these can your next line of code actually use?" The answer sells structured output without you arguing for it.',
  },
  {
    segment: 'micro-build', eyebrow: '🛠️ Give it hands', title: 'Tool use: Claude asks, your code runs it, Claude continues',
    body: 'A model can reason about an order but cannot look one up. So you describe a tool, and when Claude wants it, the reply comes back saying "run lookup_order with this ID." Your code runs your real function, sends the result back, and Claude finishes the thought. Read the diagram carefully, because the most important fact in it is step three: Claude never executes anything. It asks. You decide. That is the whole trust boundary of every agent you will build for the rest of this program.',
    bullets: [
      'You define the tool; Claude decides when to ask for it',
      'stop_reason == "tool_use" means: run it, then call again',
      'Match tool_use_id exactly or the follow-up call is rejected',
      'Claude never runs your code — it asks, you execute',
    ],
    code: {
      label: 'Define a tool, then handle the round trip',
      code: 'tools = [{\n    "name": "lookup_order",\n    "description": "Look up an order by ID. Returns status, carrier, and ETA.",\n    "input_schema": {\n        "type": "object",\n        "properties": {"order_id": {"type": "string", "description": "e.g. ORD-4471"}},\n        "required": ["order_id"],\n    },\n}]\n\ndef lookup_order(order_id):\n    return {"order_id": order_id, "status": "in_transit", "carrier": "UPS", "eta": "2 days"}\n\nmessages = [{"role": "user", "content": "Where is order ORD-4471?"}]\nresp = client.messages.create(model="claude-opus-5", max_tokens=1024, tools=tools, messages=messages)\n\nif resp.stop_reason == "tool_use":\n    messages.append({"role": "assistant", "content": resp.content})\n    results = []\n    for block in resp.content:\n        if block.type == "tool_use":\n            out = lookup_order(block.input["order_id"])\n            results.append({"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(out)})\n    messages.append({"role": "user", "content": results})\n    resp = client.messages.create(model="claude-opus-5", max_tokens=1024, tools=tools, messages=messages)\n\nprint(next(b.text for b in resp.content if b.type == "text"))',
    },
    diagram: `flowchart LR
  A["1️⃣ You send the question<br/>+ the tool list"] --> C["2️⃣ Claude asks:<br/>run lookup_order(4471)"]
  C --> Y["3️⃣ YOUR code<br/>runs the function"]
  Y --> B["4️⃣ You send<br/>the result back"]
  B --> F["5️⃣ Claude writes<br/>the final answer"]`,
    script: 'Walk the five numbered steps on the diagram before you show any code. Say step three twice: "Claude never runs your code." That single sentence answers most of the security questions this room is about to ask.',
  },
  {
    segment: 'micro-build', eyebrow: '💵 Check the meter', title: 'Before you leave: read what tonight actually cost you',
    body: 'Add up the usage from the calls you just made. It will be a fraction of a cent, and that is exactly the point — you now know how to find the number instead of guessing at it. Every response carries its own bill, so cost is something you can measure per run, per feature, and per model, the same way you measure whether the output was any good. On Thursday you assemble these four moves into one Workflow Assistant, break it on purpose, and harden it.',
    bullets: [
      'resp.usage.input_tokens + resp.usage.output_tokens on every call',
      'Cost is a number you measure, not a surprise you receive',
      'You now have: auth · a call · structured output · one tool',
      'Thursday: wire them into one assistant, then Build → Break → Harden',
    ],
    diagram: `flowchart LR
  R["📬 Every response"] --> U["📊 resp.usage"]
  U --> I["📥 input_tokens"]
  U --> O["📤 output_tokens"]
  I --> C["💵 What this run cost"]
  O --> C`,
    script: 'Close the loop with a quick round: each student names in one sentence the workflow from their own build plan that they will automate on Thursday. Saying it out loud raises the odds they actually finish it.',
  },
];
