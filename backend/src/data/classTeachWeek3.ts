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
    body: 'Open the portal, go to Projects, click "Start a new build", and describe your idea in one paragraph — who it is for, what it does, and the one thing it has to get right. Then hit go and leave the tab open. It takes a good while — it is writing your requirements and decomposing them into real work, not filling in a template — which is exactly why you start it now: it runs in the background all through the first half, and it will be waiting for you after the break. It does not have to be your final idea; it has to be an idea you care enough about to argue with.',
    bullets: [
      'Portal → Projects → "Start a new build"',
      'One paragraph: who it is for · what it does · the one thing it must get right',
      'Hit go and leave the tab running — you will open it after the break',
      'Not final — good enough to react to is the bar tonight',
    ],
    diagram: `flowchart LR
  P["🖥️ Portal"] --> PR["📁 Projects"]
  PR --> S["➕ Start a new build"]
  S --> I["✍️ Your idea,<br/>one paragraph"]
  I --> G["⏳ Go — it runs<br/>in the background"]`,
    script: 'Screen-share the exact click path once, slowly, then stop talking and let the room work. PACING — this matters: generating requirements and decomposing them takes a long time, well past the first half of class. Wait only until most students report theirs is SUBMITTED, never until one finishes. Nobody opens their plan until after the break; every slide before then teaches off YOUR plan on screen. Sitting here watching progress bars costs you the whole night. Anyone stuck goes to a mentor now, not at the break.',
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
    script: 'Walk the diagram left to right, one node at a time. Then pull up a FINISHED build on your own screen — one you generated before class — and point at each layer in the real UI. Theirs are still generating, so this is the moment to have a prepared example ready; a half-built plan on a student screen teaches the opposite of what you want here.',
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
    segment: 'business-problem', eyebrow: '🔌 The bridge', title: 'Half of every build plan needs something you have never done',
    body: 'Look at the plan on my screen and find the tasks that say the assistant classifies, drafts, summarizes, or decides something. Yours is still generating — decomposing requirements properly takes a while — but every plan has these, and they are the ones that need Claude running inside your product at 2am, on a schedule, with no human at the keyboard. Everything you know how to do so far involves you sitting in VS Code watching Claude Code work. That is a different door into the same building, and it has a different lock and a different bill.',
    bullets: [
      'Claude Code = you are there, watching, approving',
      'Your app = nobody is there; it still has to run',
      'The tasks that say "classify / draft / decide" are API tasks',
      'You will find yours after the break — the pattern is the same',
    ],
    diagram: `flowchart LR
  Y["👤 You"] --> CC["💻 Claude Code<br/>you are watching"]
  CC --> R[("📁 Your repo")]
  R -.->|"the code you<br/>just built"| APP["⚙️ Your app,<br/>running at 2am"]
  APP --> API["🔌 Claude API"]
  API --> APP`,
    script: 'TIMING — this is the slide the class pacing turns on: generating requirements and decomposing them into tasks takes a real while, so at this point in the night almost nobody has a finished plan. Do NOT ask them to open theirs here. Teach it entirely off YOUR plan on screen, point at two or three genuinely API-shaped tasks in it, and promise them the same in their own plan after the break. The payoff still lands — it just lands at minute 70 instead of minute 25, when it is actually true.',
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
    segment: 'micro-build', eyebrow: '📁 Where things live', title: 'One folder, one key, one command — set this up before you write anything',
    body: 'Two things have to be true before any of tonight works. First, you need a folder to build in: use the project folder Claude Code is already open in, and everything tonight lands inside it. Second, you need an API key from the Anthropic Console, set as an environment variable in the SAME terminal you will run Python from. These commands go in your terminal, not into Claude Code — that distinction matters more than it looks, and the next slide is entirely about why.',
    bullets: [
      'Work inside the project folder Claude Code already has open — not Downloads',
      'console.anthropic.com → API keys → Create key → copy it once (it is shown once)',
      'Set ANTHROPIC_API_KEY in the terminal you will run Python from',
      'Same window, same session: a new terminal tab does NOT have it until you set it again',
      'Verify with the echo line before you go on — blank output means it is not set',
    ],
    code: {
      kind: 'paste',
      pasteWhere: 'your TERMINAL (not Claude Code)',
      label: 'Terminal — install the SDK, set the key, verify it',
      code: '# 1. from inside your project folder\npip install anthropic\n\n# 2. set the key — macOS / Linux\nexport ANTHROPIC_API_KEY=sk-ant-...\n\n# 2. set the key — Windows PowerShell\n$env:ANTHROPIC_API_KEY="sk-ant-..."\n\n# 3. VERIFY — this must print your key, not a blank line\necho $ANTHROPIC_API_KEY        # macOS / Linux\necho $env:ANTHROPIC_API_KEY    # Windows PowerShell',
      expectedResult: 'Step 3 prints your key back. A blank line means it never got set — fix it here, before you write any Python.',
      stopCondition: 'Everyone has a non-blank echo. This is the one checkpoint tonight that blocks everything after it.',
      rescue: 'Blank echo? You are almost certainly in a different terminal window than the one you set it in. Set it again in THIS window.',
    },
    diagram: `flowchart LR
  CON["🎛️ Console —<br/>create key (shown once)"] --> T["⌨️ YOUR terminal —<br/>export ANTHROPIC_API_KEY"]
  T --> V["✅ echo prints it back"]
  V --> PY["🐍 Python reads it<br/>at run time"]
  F[("📁 Your project folder")] -.-> PY`,
    script: 'Do this one live, screen shared, slowly — a broken key here blocks everything after it. Say out loud that these are TERMINAL commands, not a Claude Code prompt; the chip on the slide says so too. Make everyone run the echo and confirm it is not blank. Do not advance until the pulse rail is nearly all green.',
  },
  {
    segment: 'micro-build', eyebrow: '🛡️ The part everyone gets wrong', title: 'Claude Code never sees your API key — and that is the whole design',
    body: 'A fair question at this point: if I never put the key in the prompt, how does Claude Code get it? The answer is that it never does, and it never needs to. You type the key into your own terminal. Claude Code writes Python that refers to the key only by NAME — the four words ANTHROPIC_API_KEY — and when you run that program, Python looks up the value from the environment at that moment. The secret and the code travel on completely separate paths and only meet inside your running process.',
    bullets: [
      'You → terminal: the real key value, typed by you, once',
      'Claude Code → your file: the NAME only, never the value',
      'Python at run time: looks the name up in the environment',
      'So: never in a prompt, never in a chat, never in a file, never in a commit',
      'If you ever do paste it somewhere it does not belong — rotate it, do not hide it',
    ],
    diagram: `flowchart LR
  YOU["👤 You"] -->|"the real key,<br/>typed once"| ENV["🔐 Your environment"]
  CC["💻 Claude Code"] -->|"writes the NAME<br/>ANTHROPIC_API_KEY"| CODE["📄 Your .py file"]
  ENV --> RUN["▶️ Running program"]
  CODE --> RUN
  CC -.->|"never sees<br/>the value"| ENV`,
    script: 'This is the slide that answers the question the room is already forming. Trace the two paths with your finger — the key goes one way, the code goes the other, and they only meet when the program runs. Then say the rule once, plainly: the key never enters a conversation with any AI, including this one.',
  },
  {
    segment: 'micro-build', eyebrow: '⌨️ Direct it', title: 'You do not write the Python. You tell Claude Code what it must do.',
    body: 'This is the same job you have done since Week 1, just pointed at a new target. You are not going to type an API client from memory — you are going to specify what the program must do, let Claude Code write it, and then read what came back and decide whether it is right. Paste this prompt, and notice what it does NOT contain: your key. Only the name of the variable it should read.',
    bullets: [
      'Paste this into Claude Code — it writes the file, you review it',
      'The prompt names ANTHROPIC_API_KEY; it never contains the key itself',
      'Ask for the token usage line — that is your cost meter',
      'Then READ the file before you run it. That is the whole skill.',
    ],
    code: {
      kind: 'paste',
      pasteWhere: 'Claude Code',
      ccMode: 'Plan Mode',
      label: 'Claude Code prompt — build the first call',
      code: 'Create a file called hello_claude.py in this project.\n\nIt should:\n1. Use the official `anthropic` Python SDK.\n2. Create the client with no arguments, so it reads the API key from the ANTHROPIC_API_KEY environment variable. Never hardcode a key, and never print the key.\n3. Send one message to model "claude-opus-5" with max_tokens 512 and a system prompt that says it is a concise, factual support-operations assistant.\n4. Ask it: "A customer cannot log in after a password reset. What do you need to help?"\n5. Print the reply text.\n6. On the last line, print the input and output token counts from the response usage, labelled clearly.\n\nKeep it under 20 lines and add a short comment on the client line explaining where the key comes from. Show me the file before running it.',
      expectedResult: 'A new hello_claude.py in your project folder, roughly 15 lines, with no key anywhere in it.',
      stopCondition: 'You have read the file and can point at the line that reads the key from the environment.',
    },
    diagram: `flowchart LR
  P["⌨️ Your prompt —<br/>what it must do"] --> CC["💻 Claude Code"]
  CC --> F["📄 hello_claude.py"]
  F --> R["👀 You read it"]
  R --> RUN["▶️ python hello_claude.py"]`,
    script: 'Paste it on screen and let Claude Code work while you narrate the decisions in the prompt — especially requirement 2. Do not run it yet; the next slide is the read-together.',
  },
  {
    segment: 'micro-build', eyebrow: '👀 Review it together', title: 'Read the file before you run it — here is what good looks like',
    body: 'This is roughly what should be sitting in your folder now. Read it as a group: the client line takes no arguments, which means the key comes from the environment at run time. The message list is the conversation. And the last line prints the meter. Yours will not match this word for word, and that is fine — what matters is that every one of those four things is present and you can point at each of them.',
    bullets: [
      'Line 3: no key argument → the environment supplies it',
      'model + max_tokens: the two decisions that set your bill',
      'system: the standing rules, separate from the question',
      'The last line: input and output tokens — your meter, on every call',
      'Now run it: python hello_claude.py',
    ],
    code: {
      kind: 'review',
      label: 'hello_claude.py — read it, do not paste it',
      code: 'import anthropic\n\nclient = anthropic.Anthropic()   # key comes from ANTHROPIC_API_KEY in the environment\n\nresp = client.messages.create(\n    model="claude-opus-5",\n    max_tokens=512,\n    system="You are a support-operations assistant. Be concise and factual.",\n    messages=[{"role": "user", "content": "A customer cannot log in after a password reset. What do you need to help?"}],\n)\n\nprint(next(b.text for b in resp.content if b.type == "text"))\nprint("tokens in/out:", resp.usage.input_tokens, resp.usage.output_tokens)',
      expectedResult: 'The client line with no arguments, and the usage line at the bottom — those are the two lines to put your finger on.',
    },
    diagram: `flowchart LR
  F["📄 hello_claude.py"] --> C1["🔑 Anthropic()<br/>no key argument"]
  F --> C2["🎚️ model + max_tokens<br/>= your bill"]
  F --> C3["📜 system + messages"]
  F --> C4["📊 usage = the meter"]`,
    script: 'Open the REAL file Claude Code just wrote on your screen, not this slide, and read it against these four points — the slide is your safety net if the generated file drifted. Then everyone runs it. Read your own token numbers out loud when it returns.',
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
      kind: 'paste',
      pasteWhere: 'Claude Code',
      label: 'Claude Code prompt — force a shape you can trust',
      code: 'Create triage.py in this project, based on hello_claude.py.\n\nIt should send a support ticket to Claude and get back STRUCTURED JSON instead of prose, using the Messages API `output_config` with a `format` of type `json_schema`.\n\nThe schema must require exactly these four fields, with `additionalProperties` false:\n- category: string, one of shipping / billing / technical / other\n- urgency: string, one of low / normal / high\n- order_id: string — the order ID, or an empty string if the ticket did not mention one\n- suggested_reply: string\n\nUse this ticket as the input: "Where is my order ORD-4471? It has been two weeks!"\n\nParse the JSON out of the response and print each field on its own labelled line, then print the input and output token counts. Keep reading the API key from the environment. Show me the file, then run it.',
      expectedResult: 'Four labelled lines — category shipping, urgency high, order_id ORD-4471, and a suggested reply — instead of a paragraph.',
      stopCondition: 'You can see real values in fields, not a sentence you would have to parse by hand.',
    },
    diagram: `flowchart LR
  S["📐 You declare the shape<br/>category · urgency · order_id"] --> R["📨 Request with<br/>output_config.format"]
  R --> V["📦 Validated JSON back"]
  V --> N["➡️ Your next function<br/>can rely on it"]`,
    script: 'Print the paragraph version and the object version side by side and ask: "which of these can your next line of code actually use?" The answer sells structured output without you arguing for it.',
  },
  {
    segment: 'micro-build', eyebrow: '🛠️ Give it hands', title: 'The demo moment: an assistant that looks up a real order and answers like a human',
    body: 'Here is where it stops being a toy. On its own the model can reason about an order but cannot look one up — so you hand it a tool and a real data file, and it decides on its own when to reach for it. Watch what happens: you ask a messy, human question, and it finds the order, reads the real status, and writes a reply you could actually send a customer. The most important second in the whole demo is step three on the diagram — Claude never runs anything. It asks. Your code decides.',
    bullets: [
      'Claude Code writes BOTH the data file and the assistant — you will see files appear',
      'You define the tool; Claude decides when it is needed',
      'stop_reason == "tool_use" means: run it, send the result back, call again',
      'Claude never executes your code — it asks, you execute, you return',
      'Try a ticket with NO order number and watch it decline to use the tool',
    ],
    code: {
      kind: 'paste',
      pasteWhere: 'Claude Code',
      label: 'Claude Code prompt — build the assistant that can actually look things up',
      code: 'Create two files in this project.\n\nFIRST — orders.json: a small database of 5 believable orders. Each has order_id (ORD-4471 through ORD-4475), customer_name, status (one of in_transit / delivered / delayed / lost), carrier, and eta. Make ORD-4471 "delayed" so the demo has something interesting to say.\n\nSECOND — assistant.py, based on triage.py. It should:\n1. Define one tool called lookup_order with a description saying it looks up an order by ID and returns status, carrier, and ETA. Its input_schema takes a required string order_id.\n2. Implement lookup_order in Python by reading orders.json and returning the matching record, or a clear not-found message.\n3. Send the ticket "Hi - where is order ORD-4471?? It was supposed to be here last week and nobody has told me anything." to claude-opus-5 with that tool available.\n4. Handle the full round trip: if stop_reason is "tool_use", run the real function, append the assistant turn, send back a tool_result block matching the tool_use_id, and call the API again so Claude can finish.\n5. Print, clearly labelled: which tool Claude asked for and with what arguments, what your function returned, and the final customer-ready reply.\n6. Print the total input and output tokens across BOTH API calls.\n\nKeep reading the key from the environment. Show me both files, then run it.',
      expectedResult: 'A printed trace: Claude asks for lookup_order(ORD-4471) → your function returns the delayed record → a final reply that names the real status and carrier.',
      stopCondition: 'The final reply contains facts that could only have come from orders.json — that is proof the tool actually fired.',
      rescue: 'Nothing printed after the tool call? The follow-up request needs the tool_result tool_use_id to match exactly — tell Claude Code that is the bug and let it fix it.',
    },
    diagram: `flowchart LR
  A["1️⃣ Ticket + tool list"] --> C["2️⃣ Claude asks for<br/>lookup_order(ORD-4471)"]
  C --> Y["3️⃣ YOUR code reads<br/>orders.json"]
  Y --> B["4️⃣ You send<br/>the record back"]
  B --> F["5️⃣ Claude writes the<br/>customer-ready reply"]`,
    script: 'Walk the five numbered steps on the diagram BEFORE you paste anything, and say step three twice — "Claude never runs your code" answers most of the security questions this room is about to ask. Then run it and read the final reply out loud; it names a real carrier and a real status, which is the moment the room understands what a tool is. If you have time, change the ticket to one with no order number and show it choosing NOT to call the tool — that is the part people remember.',
  },
  {
    segment: 'micro-build', eyebrow: '💵 Check the meter', title: 'Exactly how to find out what tonight cost you — two ways',
    body: 'There are two places to get this number and you should see both. The first is your own program: every response carries its token counts, so you can compute the dollar cost yourself with two multiplications. The second is the Anthropic Console usage page, which is the authoritative bill — it shows real spend per day and per model, and it is where you go when the number matters. Run the calculator below on the token counts you just printed and you will have tonight priced to the fifth decimal.',
    bullets: [
      'Your program: resp.usage.input_tokens and resp.usage.output_tokens on every call',
      'The math: (input ÷ 1,000,000 × input rate) + (output ÷ 1,000,000 × output rate)',
      'Opus 5 rates: $5 in / $25 out per million tokens',
      'The authoritative bill: console.anthropic.com → Usage (per day, per model)',
      'Also on that page: set a spend limit and an email alert — do it tonight',
    ],
    code: {
      kind: 'paste',
      pasteWhere: 'Claude Code',
      label: 'Claude Code prompt — price your own run',
      code: 'Create cost.py in this project.\n\nIt should define a function price(input_tokens, output_tokens, model) that returns the dollar cost of one API call, using a dict of per-million-token rates for claude-opus-5 (5.00 in / 25.00 out), claude-sonnet-5 (3.00 / 15.00) and claude-haiku-4-5 (1.00 / 5.00).\n\nThen, using the actual token counts I will paste in, print a small table showing what that same call would have cost on each of the three models, formatted to 5 decimal places, plus a line showing what 1,000 calls a day would cost per month on each.\n\nNo API call needed — this is pure arithmetic.',
      expectedResult: 'A three-row table pricing your own real call on Opus, Sonnet, and Haiku — and the monthly number at 1,000 calls a day.',
      stopCondition: 'You have a dollar figure for the call you personally made tonight.',
    },
    diagram: `flowchart LR
  R["📬 Your response"] --> U["📊 resp.usage<br/>in + out tokens"]
  U --> M["✖️ × the per-million<br/>rate for your model"]
  M --> D["💵 Dollars for THIS run"]
  CON["🎛️ Console → Usage"] --> BILL["🧾 The authoritative bill<br/>per day, per model"]`,
    script: 'Do the arithmetic on YOUR real token numbers on screen so the room watches a real invoice get computed from a real run. Then open console.anthropic.com → Usage live and show tonight actually appearing there — that connection, from a printed number to a real bill, is the thing that makes cost feel governable instead of scary. Close with the spend-limit setting; tell them to set one before Thursday. Then a quick round: each student names the workflow from their own build plan they will automate on Build Day.',
  },
];
