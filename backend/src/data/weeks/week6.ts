/**
 * week6.ts — the complete authored content pack for WEEK 6,
 * "Advanced MCP + System Integration" (Intensive 2 · Create Your AI Team).
 *
 * Arc beat: **the integration stops being a demo and starts being something
 * on-call.** Week 6 also CLOSES ACT II, so it deliberately calls back to the
 * Orientation dragon promise, names where the room now sits on the trust
 * ladder, and ends Thursday by naming what a student can do now that they
 * could not do in Week 1.
 *
 * Teaching spine:
 *   • sampling — the server borrows the CLIENT's model instead of holding a key
 *   • progress + log notifications — long operations report instead of hanging
 *   • roots — the client declares the territory, the server must enforce it
 *   • transport — STDIO vs StreamableHTTP, stateful vs stateless, as a
 *     deployment decision that has to be JUSTIFIED, not inherited from a blog
 *
 * Recurring devices used this week:
 *   • the person who isn't there → the one engineer who understands the integration
 *   • the 2 AM question → it is 2 AM and the integration is down: loud or quiet?
 *   • the trust ladder → W5-6, it reaches real systems, read-mostly
 *   • the dragon → Act II boundary callback, Week 12 is still on the calendar
 *   • their own project → every micro-build and CP3 points at THEIR system
 *
 * Authoring rules honoured: every teach slide carries a ≤7-node mermaid diagram;
 * every code block is either a Claude Code PROMPT (kind 'paste') or code the
 * room READS together (kind 'review'), never something to type; shell commands
 * are explicitly marked for the terminal; model IDs are current
 * (claude-opus-5 / claude-sonnet-5 / claude-haiku-4-5) and structured output
 * uses output_config + json_schema, never the deprecated top-level
 * output_format. No pricing numbers are asserted anywhere in this pack.
 */
import type { WeekPack } from '../weekPack';

export const WEEK6_PACK: WeekPack = {
  week: 6,
  arcBeat: 'The integration stops being a demo and starts being something on-call — and Act II closes with their AI reaching a system the business actually depends on.',

  /* ======================================================================== */
  /*  MONDAY — Architecture Day                                               */
  /* ======================================================================== */
  monday: {
    hook: {
      headline: 'Tonight your integration stops being a demo and becomes something somebody can be paged about.',
      caption: 'Which makes only one question matter: it is 2 AM, the integration is down — does it fail loudly, or quietly?',
    },

    teach: [
      /* ===================== check-in · where we are ====================== */
      {
        segment: 'checkin', eyebrow: '🏁 The last night of Act II', title: 'Five weeks ago you asked an AI for help. Tonight you put something on call.',
        body: 'In Week 5 you built an MCP server and it worked — on your laptop, over STDIO, for exactly one user, with you sitting there watching it. That is a prototype, and a prototype is a promise rather than a system. Tonight is the night the promise gets tested. We take that same server and shape it so a business could actually depend on it, which is another way of saying somebody could be woken up by it. Everything we add in the next two hours exists to answer one question: what happens when this breaks and you are asleep?',
        bullets: [
          'Week 5 proved it CAN work. Tonight is about whether it WILL.',
          'Four upgrades: sampling · notifications · roots · transport',
          'One real integration — your server touching a system that matters',
          'This is the close of Intensive 2. Act II ends tonight.',
        ],
        diagram: `flowchart LR
  W5["🧪 Week 5<br/>works on your laptop"] --> T["🌙 Tonight<br/>production-shaped"]
  T --> I["🔌 A real<br/>business system"]
  I --> P["📟 Something you<br/>can be paged about"]`,
        script: 'Open on the word "on-call" and let it sit. Ask for a show of hands: who here has ever been the person called when something broke? Take two answers. Then say the line plainly — "tonight the thing you built joins that category, and we are going to make sure it behaves like it."',
      },
      {
        segment: 'checkin', eyebrow: '🪜 Where you actually stand', title: 'In Week 1 you approved every single action. Look at the reins now.',
        body: 'At Orientation we made you a promise: every builder starts as an apprentice, and in Week 12 you face the dragon — a real system, live, defended in front of people. Here is your honest position on that road tonight. Weeks 1 and 2, you approved every action Claude took, one at a time. Weeks 3 and 4, it ran a bounded job with nobody watching. Weeks 5 and 6, it reaches real systems, read-mostly, under rules that you write. You are not an apprentice anymore. You are a journeyman with a crew — and tonight the crew starts touching things that matter.',
        bullets: [
          'W1-2 — you approved every single action',
          'W3-4 — it ran a bounded job unattended',
          'W5-6 — it reaches real systems, read-mostly, under your rules',
          'W12 — the dragon: your system, live, defended. Still on the calendar.',
        ],
        diagram: `flowchart TD
  A["🖐️ W1-2<br/>approve everything"] --> B["⏰ W3-4<br/>bounded, unattended"]
  B --> C["🔌 W5-6<br/>reaches real systems"]
  C --> D["👥 W7-9<br/>a team, surviving failure"]
  D --> E["🐉 W12<br/>the dragon, defended"]`,
        script: 'Walk the ladder with your hand and stop on W5-6. Say: "read-mostly, under rules you write — that phrase is doing a lot of work, and tonight is where you write the rules." Then point at the dragon node and remind them it was promised in the first hour of this program, not invented later.',
      },
      {
        segment: 'checkin', eyebrow: '🗺️ Tonight in one line', title: 'It is 2 AM and the integration is down. Does it fail loudly or quietly?',
        body: 'In Week 3 the 2 AM question was simply whether anything happens at all when nobody is at the keyboard. Tonight it gets harder, because now something IS happening — your server is reaching a real system on somebody else’s behalf. And the failure that hurts you is never the loud one. Loud failures get fixed before breakfast. Quiet failures run for eleven days returning confident, wrong answers, and by the time anyone notices, the damage is in a report somebody already acted on. Every feature we add tonight is a way of making failure louder.',
        bullets: [
          '🧠 Sampling — the server asks YOUR model and holds no keys',
          '📊 Notifications — long work reports instead of looking hung',
          '🚪 Roots — a hard boundary on what territory it can touch',
          '🔌 Transport — a deployment decision you justify, not default into',
        ],
        diagram: `flowchart LR
  Q["🌙 2 AM:<br/>it is down"] --> S["🧠 Sampling"]
  Q --> N["📊 Notifications"]
  Q --> R["🚪 Roots"]
  Q --> T["🔌 Transport"]`,
        script: 'Say the 2 AM question exactly as written and do not soften it. Then tell them the four nodes on this diagram are not four topics — they are four answers to that one question, and you will point back at this slide every time you introduce one.',
      },

      /* ============ business problem · the on-call gap ==================== */
      {
        segment: 'business-problem', eyebrow: '👤 The person who is not there', title: 'Every integration in your company has exactly one person who understands it',
        body: 'You already know who it is where you work. There is a connection between two systems that has run quietly for years, one engineer’s name is informally attached to it, and everybody hopes he does not take a long holiday. That is not a staffing problem, it is an architecture problem. The integration produces no observable behaviour, so the only way to understand it is to have built it. Every single thing we add tonight — the live log stream, the progress reporting, the declared boundary, the written transport rationale — is a way of moving that knowledge out of one head and into the system itself.',
        bullets: [
          'One name on the integration · no telemetry · no written rationale',
          'Understanding it requires having built it — that IS the defect',
          'Week 2 named this problem. Week 6 is where it gets expensive.',
          'Tonight: the system explains itself, so it does not need him awake',
        ],
        diagram: `flowchart LR
  K["🧠 Knowledge lives<br/>in one head"] --> O["🌙 He is out<br/>this week"]
  O --> D["❓ Nobody can<br/>diagnose it"]
  D --> L["⏳ A 20-minute fix<br/>becomes two days"]`,
        script: 'Ask the room to think of their own version of this person — do not make anyone name them out loud. Then land the reframe: "we are not going to train more people on the integration. We are going to make the integration say what it is doing." That is the whole night in one sentence.',
      },
      {
        segment: 'business-problem', eyebrow: '🏗️ The gap', title: 'Demo-shaped and on-call-shaped are two different objects',
        body: 'A demo has to work once, for you, on inputs you chose, on a network you control. An on-call system has to work every time, for people you have never met, on inputs chosen by whoever is having the worst day of their week. The distance between those two is not intelligence — your Week 5 server is already smart enough. The distance is five specific behaviours a prototype is allowed to skip: long operations report their progress, file territory is bounded, the transport can serve more than one person, no request depends on which machine answered it, and the server never has to hold a credential of its own.',
        bullets: [
          'Demo: works once · locally · for you · on your inputs',
          'On-call: works every time · for strangers · on their inputs',
          'The five behaviours: progress · boundaries · transport · statelessness · no credentials',
          'None of them make it smarter. All of them make it survivable.',
        ],
        diagram: `flowchart LR
  P["🧪 Demo-shaped"] -->|"add progress<br/>+ boundaries"| M["🔧 Bounded and<br/>observable"]
  M -->|"add transport<br/>+ statelessness"| S["📈 Scalable"]
  S -->|"remove its<br/>credentials"| O["📟 On-call-shaped"]`,
        script: 'Put the two words on the board — DEMO and ON-CALL — and ask the room which one their Week 5 server is. Everyone says demo, which is the correct and honest answer. Then say: "good. Nothing is wrong with your server. It is simply not yet the other object."',
      },
      {
        segment: 'business-problem', eyebrow: '💸 The incident list', title: 'Each production feature you skip is a specific page at a specific hour',
        body: 'These are not nice-to-haves, and it helps enormously to name the incident rather than the feature. Skip progress notifications and a forty-second export looks frozen, so users cancel and retry, and now your own interface is generating a load spike. Skip roots enforcement and one path bug lets the model read your environment file straight into a transcript. Skip the transport decision and you cannot put the thing behind a load balancer at all. Assume in-memory state and it shatters the moment somebody runs a second copy. Skip sampling and every tool grows its own model client, with its own key, governed by nobody.',
        bullets: [
          'No progress feedback → users cancel and retry → self-inflicted load spike',
          'Unbounded roots → the model reads secrets and customer data',
          'Wrong transport → cannot scale past one machine, ever',
          'Stateful assumption → breaks at instance number two',
          'No sampling → duplicated, ungoverned model calls in every tool',
        ],
        diagram: `flowchart TD
  S["⏭️ What you skipped"] --> A["🥶 Frozen-looking job<br/>→ retry storm"]
  S --> B["🔓 Secrets in<br/>a transcript"]
  S --> C["🚧 Cannot scale<br/>past one box"]
  S --> D["💥 Breaks at<br/>instance two"]
  S --> E["🔑 A key in<br/>every tool"]`,
        script: 'Walk the list slowly and name the incident, never the feature. For each one, ask "who owns that incident at your company?" The answer is always a person, and that person is usually in the room or reports to someone in the room. That is what makes this segment land for this audience.',
      },
      {
        segment: 'business-problem', eyebrow: '🌙 Loud or quiet', title: 'The failure that ruins you is the one that keeps returning answers',
        body: 'Sort every failure you will ever have into two piles. Loud failures throw, page, and stop — an unreachable database, a refused connection, a timeout that actually fires. They are unpleasant at 2 AM and they are also honest. Quiet failures keep answering: a query silently returns zero rows because a filter changed upstream, a sampling request is denied so the tool quietly guesses, a stale cached file gets reported as current. Quiet failures produce a system that looks perfectly healthy on every dashboard and is wrong in a way that compounds daily. Tonight your job is to convert as many quiet failures into loud ones as you can.',
        bullets: [
          'Loud: throws · pages · stops · you fix it before breakfast',
          'Quiet: keeps answering · looks healthy · wrong for eleven days',
          'A "zero results" answer and a "the database is down" answer look identical to a user',
          'Design goal tonight: make the quiet ones loud',
        ],
        diagram: `flowchart LR
  F["⚠️ Something<br/>goes wrong"] --> L["📢 LOUD<br/>throws · pages · stops"]
  F --> Q["🤫 QUIET<br/>keeps answering"]
  L --> G["✅ Fixed by<br/>breakfast"]
  Q --> B["📉 Wrong for<br/>eleven days"]`,
        script: 'This is the emotional centre of the first hour. Ask: "how would you find out that your integration started returning zero rows instead of the right rows?" Let the silence do the work — most rooms have no answer, and that silence is the argument for the entire notifications section coming up.',
      },

      /* ================= architecture · the four primitives =============== */
      {
        segment: 'architecture', eyebrow: '🔁 The foundation', title: 'MCP is a two-way conversation — that is why any of tonight is possible',
        body: 'REST trained all of us to believe servers only ever answer. MCP does not work that way. It is JSON-RPC 2.0 running in both directions over a persistent connection, and there are exactly three message shapes. A request carries an id and expects a matching response. A response carries that same id plus either a result or an error. A notification carries a method with no id and expects nothing back at all. Your client sends tools/call. Your server can send sampling/createMessage and roots/list back the other way. Either side can stream notifications. Sampling, roots, and progress are not three new subsystems — they are three uses of one two-way channel.',
        bullets: [
          'Request: has an id → expects a response with that id',
          'Response: the matching id, plus a result or an error',
          'Notification: a method, no id, no reply — fire and forget',
          'Server → client requests exist: sampling/createMessage, roots/list',
          'Both directions stream: notifications/progress, notifications/message',
        ],
        code: {
          kind: 'review',
          label: 'The three message shapes on the wire — read them, do not paste them',
          code: '// client -> server: a REQUEST (it has an id, so it expects an answer)\n{ "jsonrpc": "2.0", "id": 7, "method": "tools/call",\n  "params": { "name": "summarize_account", "arguments": { "customerId": "C-1042" } } }\n\n// server -> client: a REQUEST going the OTHER WAY (this is sampling)\n{ "jsonrpc": "2.0", "id": 31, "method": "sampling/createMessage",\n  "params": { "messages": [], "maxTokens": 400 } }\n\n// server -> client: a NOTIFICATION (no id, nobody replies, nothing blocks)\n{ "jsonrpc": "2.0", "method": "notifications/progress",\n  "params": { "progressToken": 7, "progress": 12, "total": 40 } }',
          expectedResult: 'Put your finger on the difference: the first two have an id and the third does not. That single field is the whole distinction between a request and a notification.',
        },
        evidence: [
          {
            claim: 'MCP uses JSON-RPC 2.0 with requests, responses, and notifications, and supports server-initiated requests such as sampling/createMessage and roots/list',
            publisher: 'Anthropic / Model Context Protocol',
            sourceTitle: 'Model Context Protocol specification',
            sourceType: 'official-doc',
            note: 'The MCP spec moves. Open the live specification page in class rather than trusting this slide, and show the room where the message-type section actually lives.',
          },
        ],
        diagram: `flowchart LR
  C["💻 Client"] -->|"tools/call"| S["🖥️ Server"]
  S -->|"sampling/createMessage"| C
  S -->|"roots/list"| C
  S -.->|"notifications/*<br/>no reply"| C`,
        script: 'Draw the arrows in the air before you show the slide — client box, server box, arrows BOTH ways. Say: "if you only remember one thing from the architecture hour, remember that an MCP server can ask. Everything else tonight is a specific thing it asks for."',
      },
      {
        segment: 'architecture', eyebrow: '🧠 Sampling', title: 'Sampling: the server asks to borrow your model instead of bringing its own',
        body: 'A tool sometimes needs reasoning rather than data — summarize this aging report, judge whether these two records are the same customer. The obvious move is for the server to call a model API itself, which means the server holds a key, picks a model on your behalf, and spends your money without asking anyone. Sampling inverts that completely. The server sends a sampling/createMessage request to the CLIENT, and the client runs the model with its own key, its own model choice, and optionally a human approval gate in front of it. The server ends up model-agnostic and credential-free, which is precisely what a security review asks you for.',
        bullets: [
          'A tool needs reasoning → it asks the client, it does not call an API',
          'The client owns the key, the model choice, and the approval gate',
          'The server ships with no LLM dependency and no credential of its own',
          'It runs happily in a locked-down network with no outbound API access',
        ],
        code: {
          kind: 'review',
          label: 'A tool that borrows the client model — read it, do not paste it',
          code: 'server.registerTool("summarize_account", {\n  title: "Summarize Account",\n  description: "Summarize a customer AR history using the client model",\n  inputSchema: { customerId: z.string() },\n}, async ({ customerId }) => {\n  const report = await ar.agingReport(customerId);   // real data, no model here\n\n  // this becomes a sampling/createMessage request sent BACK to the client\n  const result = await server.server.createMessage({\n    messages: [{ role: "user", content: { type: "text",\n      text: "Summarize this AR aging report in 3 bullets:\\n" + report } }],\n    systemPrompt: "You are a terse revenue analyst.",\n    maxTokens: 400,\n  });\n\n  const text = result.content.type === "text" ? result.content.text : "";\n  return { content: [{ type: "text", text }] };\n});',
          expectedResult: 'Two things to notice: there is no API key anywhere in this file, and there is no model name either. Both decisions belong to the client.',
        },
        diagram: `flowchart LR
  T["🛠️ Tool needs<br/>reasoning"] --> S["🖥️ Server calls<br/>createMessage"]
  S --> C["💻 Client runs<br/>the model"]
  C --> G["🙋 Optional<br/>approval gate"]
  G --> B["↩️ Text back<br/>to the tool"]`,
        script: 'Lead with the governance framing, because this audience buys it instantly: "the server never sees an API key, and the user’s own client decides which model and whether to spend anything at all." Then ask who in the room would have to sign off on a server that held its own credentials. That is the sale.',
      },
      {
        segment: 'architecture', eyebrow: '📊 Progress notifications', title: 'A long operation that says nothing is indistinguishable from a broken one',
        body: 'The mechanism is small and the effect is out of all proportion to it. The client attaches a progressToken in the request metadata; if that token is present, the server emits notifications/progress with a running count and a real total while the work is happening. That is the whole feature. A forty-second job that ticks is a job people wait for. A forty-second job that is silent gets cancelled at second twelve and retried, which is how a merely slow tool becomes a load problem. And notice the graceful degradation: no token means no notifications, and the tool still returns its result perfectly.',
        bullets: [
          'The client passes a progressToken in the request metadata',
          'The server emits notifications/progress with progress and a real total',
          'Fire and forget — they stream alongside the work and block nothing',
          'No token → no notifications → the tool still works. Degrade, never fail.',
        ],
        code: {
          kind: 'review',
          label: 'What a progress notification actually looks like',
          code: '// server -> client, repeatedly, while the work is happening\n{ "method": "notifications/progress",\n  "params": {\n    "progressToken": 7,            // came from the client request metadata\n    "progress": 18,                // how far along\n    "total": 40,                   // out of how many\n    "message": "Indexed invoice_2026_18.pdf"\n  } }',
          expectedResult: 'Three fields carry the whole feature: a token to correlate with, a count, and a total. Everything else is optional decoration.',
        },
        diagram: `flowchart LR
  R["📨 Request with<br/>progressToken"] --> W["⚙️ Long work<br/>starts"]
  W --> N1["📊 progress 1 of 40"]
  W --> N2["📊 progress 18 of 40"]
  W --> D["✅ Result returns<br/>normally"]`,
        script: 'Ask how many people have force-quit something that was actually working fine. Every hand goes up. Then say: "that is a design failure, not a user failure — and it is about fifteen lines to fix." You are building the case for the micro-build later tonight.',
      },
      {
        segment: 'architecture', eyebrow: '🪵 Log notifications', title: 'notifications/message is your structured log stream, delivered live',
        body: 'Progress is for the person waiting. Logs are for the person diagnosing, which at 2 AM is you. The server declares a logging capability at startup — miss that and your log messages are simply rejected — and then emits notifications/message at every meaningful boundary: query started, query finished, sampling requested, access denied, error caught. This is the same structured-logging discipline you would hold anywhere else, riding a channel MCP already gives you, and arriving live in front of whoever is running the client. Two rules that are not negotiable: log objects rather than sentences, and never put a secret in the payload.',
        bullets: [
          'Declare the logging capability at startup or the messages are rejected',
          'Levels: debug · info · notice · warning · error · critical',
          'Structured data objects, stable event names → greppable and correlatable',
          'Never log a connection string, a token, or a key. Log the id and the count.',
        ],
        code: {
          kind: 'review',
          label: 'Declare the capability, then log with structure',
          code: 'const server = new McpServer(\n  { name: "revops-server", version: "1.0.0" },\n  { capabilities: { logging: {} } }        // <-- required, or logs are dropped\n);\n\n// ...at any meaningful boundary inside a handler:\nawait extra.sendNotification({\n  method: "notifications/message",\n  params: {\n    level: "info",\n    logger: "revops-server",\n    data: {\n      event: "db_query",\n      correlationId,          // trace one request end to end\n      customerId,             // safe: an identifier\n      rows: rows.length,      // safe: a count\n      duration_ms: elapsed,   // safe: a measurement\n    },\n  },\n});',
          expectedResult: 'Look at what is in the data object and, more importantly, what is not: no connection string, no key, no raw customer record.',
        },
        diagram: `flowchart LR
  B["🚧 A boundary<br/>is crossed"] --> L["🪵 notifications/message"]
  L --> LV["🎚️ level +<br/>logger name"]
  L --> DT["📦 structured data<br/>event · ids · timings"]
  DT --> OP["🧑‍🔧 The operator,<br/>live"]`,
        script: 'Connect it back to the person who is not there: "this stream is how somebody who did not build the integration can still diagnose it." That is the payoff of the opening story, and it lands better here than it would as an abstract observability lecture.',
      },
      {
        segment: 'architecture', eyebrow: '🚪 Roots', title: 'Roots: the client declares the territory — the server is responsible for staying inside it',
        body: 'Roots answer the question of which parts of the filesystem this server may touch, and there is one subtlety here that catches nearly everybody. Roots are a CLIENT capability. The client advertises the allowed directories, and the server asks for them with a roots/list request. What comes back is advisory — a statement of intent, not a wall. If the server does not enforce it, nothing does. Real enforcement means resolving the REAL path of anything the model hands you, so that dot-dot traversal and symlinks are collapsed before you compare, and only then checking that the resolved path still sits inside an allowed root.',
        bullets: [
          'The client declares roots; the server asks for them with roots/list',
          'Roots are advisory. Advisory is a comment, not a control.',
          'Enforcement = resolve the real path FIRST, then check containment',
          'Resolving is load-bearing: it defeats both ../ traversal and symlinks',
        ],
        code: {
          kind: 'review',
          label: 'Ask the client, then actually enforce it — read it together',
          code: 'import path from "node:path";\nimport fs from "node:fs/promises";\nimport { fileURLToPath } from "node:url";\n\nasync function assertInRoots(server, requested) {\n  const { roots } = await server.server.listRoots();     // ask the CLIENT\n  const real = await fs.realpath(requested);             // collapse .. and symlinks\n  const bases = await Promise.all(\n    roots.map((r) => fs.realpath(fileURLToPath(r.uri)))\n  );\n  const ok = bases.some((b) => real === b || real.startsWith(b + path.sep));\n  if (!ok) throw new Error("Access denied: outside declared roots");\n  return real;\n}',
          expectedResult: 'The order of operations is the entire lesson: realpath FIRST, compare SECOND. Swap those two lines and the check is decorative.',
        },
        diagram: `flowchart LR
  CL["💻 Client declares<br/>./data"] -->|"roots/list"| SV["🖥️ Server asks"]
  SV --> RP["🧭 Resolve the<br/>REAL path"]
  RP --> CK{"🚪 Inside an<br/>allowed root?"}
  CK -->|"yes"| OK["✅ Read it"]
  CK -->|"no"| NO["🚫 Deny + log"]`,
        script: 'Stress the ownership flip until it is uncomfortable: "the CLIENT says where you may go. The SERVER is the one responsible for actually staying there." Then ask the room who is accountable if the server ignores it. The answer is the person whose name is on the server — which, from tonight, is them.',
      },
      {
        segment: 'architecture', eyebrow: '🔌 The deployment decision', title: 'STDIO or StreamableHTTP, stateful or stateless — justify it, do not inherit it',
        body: 'The transport is how bytes actually move between client and server, and most people choose it by copying whatever the tutorial they read used. That is the mistake this slide exists to prevent. STDIO: the client launches your server as a subprocess and talks over standard input and output. One process per user, ideal for a local tool, and in-memory state is completely fine because nothing scales. StreamableHTTP: your server is a web service at a single endpoint, which is what a remote multi-user integration requires. Then the second axis, which is the one that actually bites — stateful keeps per-session data in one process’s memory, stateless treats every request as self-contained.',
        bullets: [
          'STDIO → local, single-user, one subprocess per client; in-memory state is fine',
          'StreamableHTTP → remote, multi-user, one HTTP endpoint',
          'Stateful → per-session memory → needs sticky sessions or a shared store',
          'Stateless → self-contained requests → scales behind any load balancer',
          'The deliverable is not the choice. It is the written rationale for the choice.',
        ],
        code: {
          kind: 'review',
          label: 'The decision table — say it out loud, do not just read it',
          code: 'deployment                        -> transport         state model\n---------------------------------------------------------------------\nlocal dev tool, one user          -> STDIO             in-memory is fine\nteam tool, one server, no scaling -> StreamableHTTP    stateful is fine\npublic, multi-user, autoscaled    -> StreamableHTTP    STATELESS\nserver must push mid-operation    -> StreamableHTTP    keep the stream open',
          expectedResult: 'Find the row that matches YOUR deployment. If two rows look right, your deployment is not defined well enough yet — that is the real finding.',
        },
        diagram: `flowchart TD
  D{"🤔 Who calls<br/>this server?"} -->|"just me,<br/>locally"| ST["🔌 STDIO<br/>state is fine"]
  D -->|"a team, one box"| H1["🌐 StreamableHTTP<br/>stateful ok"]
  D -->|"many users,<br/>autoscaled"| H2["🌐 StreamableHTTP<br/>STATELESS"]`,
        script: 'Do not reveal the answer before the poll — this slide sets up the theater moment. Ask the room to look at their own project and decide which node they land on, then run the vote. The reveal only matters after they have committed.',
      },

      /* =================== deconstruct · three autopsies ================== */
      {
        segment: 'deconstruct', eyebrow: '🔬 Autopsy one', title: 'The server that worked in staging and died at instance number two',
        body: 'Here is a real shape of failure worth knowing by heart. A team shipped a StreamableHTTP server that stored each session’s context in an in-memory map keyed by session id. Perfect in staging, which ran one container. In production they scaled to three replicas behind a round-robin load balancer, and a client would initialise on replica A, then send its next request to replica B, which had never heard of that session and returned an error. Intermittent, impossible to reproduce on a laptop, and caused entirely by one architectural assumption colliding with one scaling decision. No individual request handler was wrong.',
        bullets: [
          'initialize lands on replica A → session stored in A s memory only',
          'The next request round-robins to replica B → B has never heard of it',
          'Fails roughly two times in three with three replicas — it looks random',
          'Root cause: an in-memory map, not a bug in any handler',
        ],
        code: {
          kind: 'review',
          label: 'The stateful pattern that breaks — and exactly where',
          code: 'const transports = {};              // <-- lives in ONE process memory\n\napp.post("/mcp", async (req, res) => {\n  const sid = req.headers["mcp-session-id"];\n\n  if (sid && transports[sid]) {     // replica B: MISS, every time\n    return transports[sid].handleRequest(req, res, req.body);\n  }\n\n  if (!sid && isInitializeRequest(req.body)) {\n    const transport = new StreamableHTTPServerTransport({\n      sessionIdGenerator: () => randomUUID(),\n      onsessioninitialized: (id) => { transports[id] = transport; },\n    });\n    await server.connect(transport);\n    return transport.handleRequest(req, res, req.body);\n  }\n\n  res.status(400).json({ error: "Bad Request: No valid session ID" });  // <-- B lands here\n});',
          expectedResult: 'The line that STORES the session and the line that REJECTS the request are running on different machines. That distance is the entire bug.',
        },
        diagram: `flowchart LR
  I["📨 initialize"] --> A["🅰️ Replica A<br/>stores session"]
  N["📨 next request"] --> B["🅱️ Replica B<br/>never heard of it"]
  B --> E["🚫 400 No valid<br/>session ID"]
  E --> U["😵 Looks random<br/>to everyone"]`,
        script: 'Tell it as a war story with a pause before the cause. Then say the sentence that makes it stick: "nothing inside any request handler was wrong — the bug was an assumption meeting a scaling decision." Promise them that after tonight they will see this coming in a code review.',
      },
      {
        segment: 'deconstruct', eyebrow: '🔬 Autopsy two', title: 'A sampling call, traced: a request living inside another request',
        body: 'Sampling has more moving parts than an ordinary tool call, so watch the whole round trip once, slowly. The client calls tools/call with id seven. Inside that handler, the server calls createMessage, which the SDK turns into a sampling/createMessage request with its own id, sent back to the client. The client runs the actual model — its key, its model choice, its approval gate if it has one — and answers request thirty-one. Only then does the server finish and answer request seven. One user action, one nested model call, and at no point did the server touch a credential.',
        bullets: [
          '1 · client → server: tools/call, id 7',
          '2 · server → client: sampling/createMessage, id 31, nested inside 7',
          '3 · client runs the model with its own key and its own approval gate',
          '4 · client → server: the completion, answering id 31',
          '5 · server → client: the tool result, finally answering id 7',
        ],
        code: {
          kind: 'review',
          label: 'The nesting on the wire — follow the ids with your finger',
          code: '-> { id: 7,  method: "tools/call", params: { name: "summarize_account" } }\n\n     <- { id: 31, method: "sampling/createMessage", params: { maxTokens: 400 } }\n     -> { id: 31, result: { role: "assistant", content: { type: "text" } } }\n\n<- { id: 7,  result: { content: [ { type: "text" } ] } }',
          expectedResult: 'Request 7 is still open the whole time request 31 happens. That is only possible because the channel is persistent and bidirectional.',
        },
        diagram: `flowchart LR
  C1["1️⃣ tools/call<br/>id 7"] --> S1["2️⃣ createMessage<br/>id 31"]
  S1 --> M["3️⃣ Client runs<br/>the model"]
  M --> S2["4️⃣ completion<br/>answers id 31"]
  S2 --> C2["5️⃣ tool result<br/>answers id 7"]`,
        script: 'Trace the ids physically with a finger on the screen. The moment students see that 31 opens and closes inside 7, sampling stops being mysterious. If anyone asks what happens when the client denies the sampling request, tell them to hold that thought — it is the second failure injection on Thursday.',
      },
      {
        segment: 'deconstruct', eyebrow: '🔬 Autopsy three', title: 'Wide-open roots: the exact path somebody walks out of your directory',
        body: 'What does unbounded file access actually let somebody do? Suppose a read tool opens whatever path it is handed, with no containment check. The client declared a data directory as its only root — but that was advisory, and this server ignored it. Now the model, nudged by a poisoned document or simply a badly-worded request, asks for a path that walks up two directories to your environment file. The tool reads it and returns your database URL and your API key into a transcript. And a naive string check does not save you either: a symlink inside the data directory, or a path with a dot-dot in the middle, slips straight past it.',
        bullets: [
          'The declared root was advisory — the server never enforced it',
          'A path that walks up two levels resolves outside the root and leaks secrets',
          'A plain prefix check is bypassed by both traversal AND symlinks',
          'Only resolving the real path BEFORE comparing closes it',
        ],
        code: {
          kind: 'review',
          label: 'The traversal, step by step',
          code: '// declared root:        /srv/app/data\n// the model asks for:   ../../.env\n// a naive server does:  fs.readFile("/srv/app/data/../../.env")\n// the OS resolves that: /srv/.env      <-- OUTSIDE the root. Secrets leak.\n\n// the same request, with the real-path check in front of it:\n//   real  = /srv/.env\n//   base  = /srv/app/data\n//   real.startsWith(base + "/")  ->  false  ->  DENY + log the attempt',
          expectedResult: 'Notice the OS is not doing anything wrong. It resolves the path exactly as asked. The missing piece is entirely on the server side.',
        },
        diagram: `flowchart LR
  M["🤖 Model asks for<br/>../../.env"] --> N["🖥️ Naive server<br/>no check"]
  N --> OS["💽 OS resolves<br/>outside the root"]
  OS --> LK["🔓 Key and DB URL<br/>in the transcript"]
  RP["🧭 Real-path check"] -.->|"would have<br/>denied it"| OS`,
        script: 'Make it visceral and unhurried: "the client SAID data only. The server shrugged and handed over the secrets." Tell them this exact failure is what we inject and then fix on Thursday, so nobody has to imagine it — they will watch it happen with a fake environment file on screen.',
      },

      /* ================= micro-build · four small upgrades ================ */
      {
        segment: 'micro-build', eyebrow: '🔍 Set up to SEE', title: 'You cannot verify a notification you cannot see — get the Inspector open',
        body: 'Everything we build in this segment is invisible unless you have something that shows you the protocol traffic. The MCP Inspector is a browser tool that speaks MCP directly, so you can call your tools by hand and watch notifications arrive live, with no client code to write. Run this in your terminal — not in Claude Code — from your Week 5 server folder, and do not move on until you can call one of your existing tools and get a real answer back. This is the floor for the rest of tonight and all of Thursday.',
        bullets: [
          'The Inspector speaks MCP — no client code needed to test a server',
          'You will use it to SEE progress ticks and log lines arrive',
          'Get one existing Week 5 tool round-tripping before you add anything',
          'Red connection? Fix it now with a mentor, not at the break',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'your TERMINAL (not Claude Code)',
          label: 'Terminal — launch your Week 5 server under the Inspector',
          code: '# 1. from inside your Week 5 MCP server folder\nnpm install\n\n# 2. launch YOUR server under the MCP Inspector\nnpx @modelcontextprotocol/inspector node build/server.js\n\n# 3. in the browser window that opens:\n#    Connect  ->  Tools  ->  pick any tool  ->  Run\n#    you must get a real result back before you go on',
          expectedResult: 'A browser window opens, the connection goes green, tools/list shows your Week 5 tools, and one tool call returns a real result.',
          stopCondition: 'One of your own tools round-trips in the Inspector. That is the floor for the whole night.',
          rescue: 'Nothing loads? Check that you are in the server folder and that your build output path matches the one in the command. If the connection drops immediately, run your server on its own first and read the startup error.',
        },
        diagram: `flowchart LR
  T["⌨️ Your terminal"] --> INS["🔍 MCP Inspector"]
  INS --> SRV["🖥️ Your Week 5<br/>server"]
  SRV --> RES["✅ A real tool<br/>result"]
  INS -.->|"and soon:<br/>live notifications"| RES`,
        script: 'Screen-share this once, slowly, then stop talking and let the room work. Use the pulse rail as a hard gate — do not begin the first micro-build with people on a red connection. Anyone stuck goes to a mentor immediately.',
      },
      {
        segment: 'micro-build', eyebrow: '🛠️ Upgrade one', title: 'Make your slowest tool report instead of hanging',
        body: 'Pick the slowest tool on your own server — the one that reads a folder, paginates an API, or queries something large — and give it a voice. Notice what you are directing Claude Code to do here: read the progress token from the request metadata, emit only if the client actually asked for progress, count against a real total, and leave the tool’s return value completely unchanged. When it works, you will watch the ticks arrive in the Inspector while the work is still running. That is the entire difference between a tool people trust and a tool people cancel.',
        bullets: [
          'Point it at YOUR slowest tool, not a demo one',
          'Emit only when the client passed a token — otherwise degrade silently',
          'Count against a real total, not a fake percentage',
          'The tool result must not change at all',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — add progress notifications to my slowest tool',
          code: 'Look at the MCP server in this project and tell me which tool takes the longest to run, then add progress notifications to it.\n\nRequirements:\n1. Read the progress token from the tool handler request metadata. If the client did not pass one, emit nothing and behave exactly as before.\n2. While the work loops, send notifications/progress with a running progress count, a real total, and a short human-readable message naming the current unit of work.\n3. Do not change the tool return value in any way.\n4. Add a one-line comment above the emit explaining why we only send when a token is present.\n\nShow me the diff before you apply it, and tell me exactly which line I should watch in the Inspector to confirm it works.',
          expectedResult: 'A small diff on one tool, and progress ticks arriving live in the Inspector while the tool is still running.',
          stopCondition: 'You have seen at least two progress ticks arrive in the Inspector BEFORE the result did.',
          rescue: 'No ticks? Nine times out of ten the client did not send a token, so the guard is correctly doing nothing. In the Inspector, re-run the tool and check the request metadata before you change any code.',
        },
        diagram: `flowchart LR
  P["⌨️ Your prompt"] --> CC["💻 Claude Code"]
  CC --> D["📄 A small diff on<br/>your slowest tool"]
  D --> R["👀 You read it"]
  R --> I["🔍 Ticks in the<br/>Inspector"]`,
        script: 'Have two students name their slowest tool out loud before anyone pastes — it makes the exercise theirs rather than yours. Then run it and let the room watch ticks stream. This is the highest-satisfaction fifteen lines of the night.',
      },
      {
        segment: 'micro-build', eyebrow: '🛠️ Upgrade two', title: 'Give the operator a log stream — objects, ids, and no secrets',
        body: 'Now the other half of observability: the stream that exists for whoever is diagnosing this at 2 AM. You are directing Claude Code to declare the logging capability, generate one correlation id per tool invocation, and emit a structured log at each real boundary — start, finish, denial, error. Pay attention to the last requirement in this prompt, because it is the one that matters most: you are explicitly telling it what must never appear in a log payload. That instruction is not paranoia. It is the difference between a log stream you can share with a colleague and one you cannot.',
        bullets: [
          'Declare the logging capability or the messages are dropped',
          'One correlation id per invocation, on every line — that is how you trace',
          'Log at boundaries: start · finish · denial · error',
          'Explicitly forbid keys, connection strings, and raw records in the payload',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — add a structured log stream',
          code: 'Add structured log notifications to the MCP server in this project.\n\nRequirements:\n1. Declare the logging capability when the server is constructed, and add a comment noting that log notifications are dropped without it.\n2. Generate one correlation id per tool invocation and include it on every log line for that invocation.\n3. Emit a log at each real boundary: the tool starting, any external call starting and finishing with its duration in milliseconds, any access denial, and any caught error with a stable error class name.\n4. The data payload must be a structured object with stable event names, never a formatted sentence.\n5. NEVER include an API key, a connection string, a full credential, or a raw customer record in any log payload. Log identifiers, counts, and durations only.\n\nAfter you apply it, list every log event name you created so I can check the vocabulary is consistent.',
          expectedResult: 'Log lines arriving in the Inspector with a level, a logger name, an event name, a correlation id, and timings — and a printed list of the event names you now have.',
          stopCondition: 'You can trace ONE tool invocation from start to finish using a single correlation id.',
          rescue: 'Nothing appearing? The logging capability declaration is almost certainly missing or in the wrong place. Tell Claude Code that is the suspect rather than describing the symptom.',
        },
        diagram: `flowchart LR
  CAP["🎚️ logging<br/>capability"] --> SRV["🖥️ Your server"]
  SRV --> EV["🪵 event + correlationId<br/>+ duration"]
  EV --> INS["🔍 Live in the<br/>Inspector"]
  RED["🚫 No keys<br/>no records"] -.-> EV`,
        script: 'Read requirement five out loud twice. Then ask: "could you paste your log stream into a group chat right now without checking it first?" If the honest answer is no, the log stream is not finished. That question is the takeaway.',
      },
      {
        segment: 'micro-build', eyebrow: '🛠️ Upgrade three', title: 'Put a boundary on it — then try to walk out and watch it fail',
        body: 'This is the security control of the week, and it is only real once you have attacked it yourself. You are directing Claude Code to add the containment helper, wire it into every file-touching tool, deny anything outside the declared roots, and log every denial. Then you personally try the escape. Do not skip that second half. A boundary you have not attacked is a boundary you are hoping about, and the difference between hoping and knowing is thirty seconds of your own typing.',
        bullets: [
          'Add the helper: ask the client for roots, resolve the real path, then check',
          'Wire it into EVERY tool that touches a file, not just the obvious one',
          'Deny loudly, return an error result, and log the attempt as a warning',
          'Then attack it yourself — traversal and a symlink. Both must be denied.',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — enforce roots, then help me attack it',
          code: 'Add real roots enforcement to the MCP server in this project.\n\n1. Write a helper that asks the client for its declared roots, resolves the REAL path of the requested file so that dot-dot traversal and symlinks are collapsed first, and then confirms the resolved path is inside one of the allowed roots. If it is not, deny it.\n2. Wire that helper into EVERY tool in this server that touches the filesystem. List them for me so I can confirm none were missed.\n3. On a denial: return a clear error result rather than throwing, and emit a warning log notification with the requested path and a stable event name.\n4. Then write me a short list of exact attacks to run against it by hand in the Inspector, including a dot-dot traversal out of the declared root and a symlink that points outside it.\n\nDo not use a plain string prefix check on the raw path, and explain in a comment why that would be insufficient.',
          expectedResult: 'Every file-touching tool routed through the helper, plus a short attack list you can run by hand in the Inspector.',
          stopCondition: 'You have personally run the traversal attack and watched it come back denied AND logged.',
          rescue: 'Attack succeeded? The check is almost certainly comparing the raw path rather than the resolved one. Tell Claude Code the resolution has to happen before the comparison, not after.',
        },
        diagram: `flowchart LR
  H["🧭 Containment<br/>helper"] --> T["🛠️ Every file tool"]
  T --> A["🗡️ You attack it:<br/>traversal + symlink"]
  A --> D["🚫 Denied"]
  D --> L["🪵 Logged as<br/>a warning"]`,
        script: 'Run the attack live on your own screen with a FAKE environment file, before they run theirs. Let the denial land visibly. Then make everybody do it — the room should hear a small ripple of people trying to break their own servers. That noise is the lesson.',
      },
      {
        segment: 'micro-build', eyebrow: '📝 The decision you must defend', title: 'Write the transport decision record — for YOUR project, tonight',
        body: 'Here is the part that is graded, and the part most people would otherwise skip. Your Week 6 deliverable is not just a working server; it is a documented transport choice with a rationale. So open your own build plan, look at who will actually call your server and from where, and write the decision down before Thursday. Notice what this prompt refuses to do for you: it will not pick. It asks you the questions, records your answers, and produces a record with your reasoning in it, because a decision record written by the model is not a decision you can defend in Week 12.',
        bullets: [
          'Look at YOUR build plan: who calls this server, from where, how many at once?',
          'Choose transport AND state model — they are two separate decisions',
          'Write the rationale, the alternative you rejected, and what would change your mind',
          'This document is a graded artifact and it takes ten minutes',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          ccMode: 'Plan Mode',
          label: 'Claude Code prompt — interview me, then write MY decision record',
          code: 'I need a transport decision record for the MCP server in my own project.\n\nDo NOT choose for me. First, ask me these questions one at a time and wait for my answers:\n1. Who calls this server, and from where?\n2. How many people or processes call it at the same time, realistically?\n3. Does it need to run on more than one machine, now or within a year?\n4. Does anything about it have to survive between requests?\n5. What is the worst thing that happens if it is unavailable for an hour?\n\nThen write docs/TRANSPORT_DECISION.md containing: my answers, the transport I chose, the state model I chose, my rationale in my own words, the option I rejected and why, and one line naming the condition that would make me revisit this decision.\n\nIf my answers are inconsistent with my choice, say so plainly instead of writing it up.',
          expectedResult: 'A short markdown decision record in your own project, written from YOUR answers, including the option you rejected.',
          stopCondition: 'You could read the rationale section aloud to a security reviewer without adding anything verbally.',
          rescue: 'If it starts writing before interviewing you, stop it and re-paste — the interview is the exercise, and a record you did not reason through is worth nothing on Thursday.',
        },
        diagram: `flowchart LR
  P["📋 Your build plan"] --> Q["❓ Five questions<br/>about real usage"]
  Q --> CH["⚖️ Transport +<br/>state model"]
  CH --> DOC["📄 TRANSPORT_DECISION.md<br/>in your repo"]
  DOC --> TH["🔨 Thursday:<br/>you build it"]`,
        script: 'Close the night here. Have three students say their choice and one sentence of rationale out loud — and push back gently on any answer that is really "whatever the tutorial used." Then set up Thursday: "you bring that decision, your Week 5 server, and access to one real system. We wire all four upgrades in, then we break two of them on purpose."',
      },
    ],

    storyBeats: {
      checkin: [
        {
          icon: '🐉', tone: 'violet', eyebrow: 'Change of pace — the promise from night one',
          title: 'You were told about the dragon before you had written a single line',
          body: 'On the first night of this program we said something that probably sounded like theatre: every builder starts as an apprentice, and in Week 12 you face the dragon — a real system, live, defended in front of people who will ask hard questions. Six weeks in, that has quietly stopped being a metaphor. Tonight your server stops being a thing you show and becomes a thing that runs. That is exactly the transition an apprentice makes when they become a journeyman with a crew.',
          punch: 'Nobody defends a demo in front of a panel. Tonight you start building the thing you will actually have to stand behind.',
        },
      ],
      'business-problem': [
        {
          icon: '📟', tone: 'cherry', eyebrow: 'The person who is not there',
          title: 'The integration ran for four years. Then Marcus took a holiday.',
          body: 'A finance team had a nightly job that moved invoice data between two systems. It had worked since before most of them joined, and exactly one engineer understood it — he had written it in a week and never needed to explain it. When it stopped one Tuesday, three people spent a full day reading the code trying to figure out what it was supposed to do, because the job produced no logs, no progress, and no errors it did not swallow. Marcus fixed it in twenty minutes on Thursday, from an airport.',
          punch: 'The failure was not that Marcus went away. The failure was that the system could not explain itself without him.',
        },
      ],
      architecture: [
        {
          icon: '🔑', tone: 'leaf', eyebrow: 'Change of pace — what sampling really is',
          title: 'The contractor who does excellent work and never gets a key to the building',
          body: 'Think about how a serious building actually handles contractors. The good ones do not get their own master key and their own alarm code. They get let in, watched while they work, and let out — not because anyone doubts their competence, but because the building owner keeps control of access no matter who is doing the work. Sampling is that arrangement, expressed in a protocol. Your server does excellent work and never holds a credential. The client opens the door, runs the model, and can require a human to say yes first.',
          punch: 'Every security review you will ever sit in comes down to one question: who holds the keys? Sampling has a very good answer.',
        },
      ],
      deconstruct: [
        {
          icon: '🤫', tone: 'berry', eyebrow: 'The 2 AM story',
          title: 'It answered every question correctly for eleven days. The answers were from a stale file.',
          body: 'A team wired an assistant to a pricing sheet through a tool that read the file from disk. Two weeks later somebody changed the export process and the file stopped refreshing. Nothing threw. Nothing paged. The tool kept opening the same file, the model kept summarising it confidently, and eleven days of quotes went out against prices that no longer existed. The whole thing was discovered by a customer, not a dashboard, and the fix took four minutes once anyone knew to look.',
          punch: 'A system that fails loudly costs you a night. A system that fails quietly costs you eleven days and a customer.',
        },
      ],
      'micro-build': [
        {
          icon: '⏳', tone: 'amber', eyebrow: 'Before you build — the smallest big win',
          title: 'The job was never broken. Everybody just cancelled it at twelve seconds.',
          body: 'There is a well-known pattern in software where a slow operation with no feedback gets abandoned, retried, abandoned again — and the retries make it slower, which makes more people abandon it. The operation was working the entire time. What was missing was any evidence of life. The three lines that emit a progress count are not a cosmetic improvement; they are the difference between a system that survives its own users and one that gets taken down by them.',
          punch: 'Half of what people call a performance problem is actually a feedback problem.',
        },
      ],
    },

    extraInteractions: [
      {
        segment: 'checkin', kind: 'poll',
        q: 'Right now, before we touch anything — where is your Week 5 MCP server?',
        options: ['✅ Running, I can call a tool', '🗂️ I have the code but have not run it tonight', '🧩 It half works', '😬 I do not have one'],
        eyebrow: '🚦 Room check', title: 'Everyone needs a starting point before we upgrade anything',
        presenterTip: 'Purely operational. Read the counts out loud and send mentors to the last two groups immediately. Anyone without a Week 5 server pairs with a neighbour for tonight and rebuilds theirs before Thursday — do not let them sit stuck for two hours.',
      },
      {
        segment: 'business-problem', kind: 'poll',
        q: 'It is 2 AM and your integration has been returning wrong answers for six hours. How do you find out?',
        options: [
          'A monitoring alert fires',
          'A customer or colleague tells me',
          'I would notice next time I looked at it',
          'Honestly — I would not find out',
        ],
        answer: 0,
        reveal: 'Most rooms are honest and pick the middle two, which is exactly the point. If the only detector is a human noticing, you do not have a system — you have a hope. Everything tonight exists to move you toward the first answer.',
        eyebrow: '🌙 The 2 AM question', title: 'Six hours of wrong answers. Who tells you?',
        presenterTip: 'Take the vote before revealing and read the spread out loud without judgement. The honest answers are the useful ones. If a lot of people pick the last option, say so plainly — it earns you the whole notifications segment.',
      },
      {
        segment: 'architecture', kind: 'trivia',
        q: 'A server uses sampling to summarise a document. Whose API key pays for that call?',
        options: [
          'The server holds a key and pays for it',
          'The client holds the key and pays for it',
          'MCP provides a shared key',
          'Sampling calls are free',
        ],
        answer: 1,
        reveal: 'The client. That is the entire point of sampling — the server stays credential-free and model-agnostic, and the client keeps control of the model choice, the spend, and the approval gate.',
        eyebrow: '🧠 Knowledge check', title: 'One question before we go further',
        presenterTip: 'Fast, one line of why, then move. If anyone argues that the server holding a key is simpler, agree that it is — and then ask who signs off on that server going into their company. That reframes it in five seconds.',
      },
      {
        segment: 'architecture', kind: 'poll',
        theater: true,
        q: 'Your server will be called by forty colleagues across three offices, and it will run on more than one machine. Transport and state model?',
        options: [
          'STDIO, in-memory state',
          'StreamableHTTP, stateful in memory',
          'StreamableHTTP, stateless',
          'Whichever the tutorial I followed used',
        ],
        answer: 2,
        reveal: 'StreamableHTTP, stateless. STDIO cannot serve a second user at all, and in-memory state is what strands a request on the wrong replica. The fourth option is the honest one for most people right now — and that is exactly why the written rationale is graded.',
        eyebrow: '🔌 The real decision', title: 'You are the architect. Choose the transport.',
        presenterTip: 'Full-screen theater moment — lock the votes, show the spread, then reveal. Ask anyone who picked the last option to say it out loud without embarrassment; naming the default is the first step to replacing it. This is the slide people quote back to you in Week 11.',
      },
      {
        segment: 'deconstruct', kind: 'poll',
        q: 'Your server works perfectly for one user. In production with three replicas it fails about two times in three with "no valid session ID". What do you check FIRST?',
        options: [
          'The load balancer configuration',
          'Whether session state lives in one process memory',
          'The client version',
          'Network latency between replicas',
        ],
        answer: 1,
        reveal: 'In-memory session state. The two-in-three failure rate is the tell — with three replicas, round-robin lands you on the wrong one about two thirds of the time. The load balancer is behaving perfectly; the assumption underneath it is the bug.',
        eyebrow: '🩺 Diagnose it', title: 'Intermittent, unreproducible, and two-in-three',
        presenterTip: 'Give them the failure RATE and let someone in the room work out why two in three is meaningful. When somebody gets there out loud, stop and let them explain it — a peer explaining this lands harder than you explaining it.',
      },
      {
        segment: 'deconstruct', kind: 'trivia',
        q: 'A server checks that the requested path starts with the allowed directory, then opens the file. Is that enough?',
        options: [
          'Yes, that is a containment check',
          'No — dot-dot traversal and symlinks both slip past it',
          'Yes, as long as the directory is absolute',
          'Only on Windows',
        ],
        answer: 1,
        reveal: 'No. A prefix check on the raw path is defeated by a dot-dot in the middle and by a symlink pointing outside. You must resolve the real path first, then compare — order of operations is the whole control.',
        eyebrow: '🚪 Security check', title: 'Is a prefix check a control?',
        presenterTip: 'Reveal, then say the sentence you want them to carry: "resolve first, compare second." Have the room say it back once. It shows up again in Week 10 when we talk about policy enforcement points.',
      },
      {
        segment: 'micro-build', kind: 'poll',
        q: 'Did the progress ticks arrive in your Inspector?',
        options: ['✅ I can see them streaming', '🤔 The tool works but no ticks', '🔍 Inspector will not connect', '💥 Still fixing something else'],
        eyebrow: '🚦 Build check', title: 'Everybody sees a tick before we move on',
        presenterTip: 'Operational. Call the numbers out loud ("17 of 22 — five more"). For the "no ticks" group, the answer is almost always that the client did not pass a token, which means their guard is working correctly — say that out loud so they do not start deleting good code.',
      },
      {
        segment: 'micro-build', kind: 'poll',
        q: 'Honestly: could you explain your transport choice to a security reviewer right now, without preparing?',
        options: [
          '💪 Yes, and I could defend the alternative I rejected',
          '🙂 Roughly — I know why, I would fumble the details',
          '😬 No — I picked what the example used',
          '🤷 I have not chosen yet',
        ],
        eyebrow: '🌡️ Self-check', title: 'No right answer — where do you actually stand?',
        presenterTip: 'Ask this AFTER they have written the decision record, not before. It is a confidence read on the artifact they just produced. If the middle two dominate, say so plainly and tell them that is precisely what the ten-minute document is for — and that in Week 12 the panel asks this exact question.',
      },
    ],
  },

  /* ======================================================================== */
  /*  THURSDAY — Build Day                                                    */
  /* ======================================================================== */
  thursday: {
    beforeAfter: {
      label: 'Week 5 → tonight',
      before: [
        'Runs on your laptop, over STDIO, for exactly one person',
        'A long tool that sits there looking frozen',
        'Opens whatever file path it is handed',
        'Whatever transport the example you copied used',
        'When it breaks, someone reads the code to find out why',
      ],
      after: [
        'A transport you chose, with the rationale written down',
        'Progress ticks and a live structured log stream',
        'A declared boundary, actually enforced, with denials logged',
        'A real system behind a parameterised query and a timeout',
        'When it breaks it says so — loudly, with a correlation id',
      ],
    },

    teach: [
      /* ============================ build map ============================= */
      {
        segment: 'build-map', eyebrow: '🗺️ Tonight', title: 'Four checkpoints, and at the end your server touches something real',
        body: 'Tonight your Week 5 server grows up. CP0 is the baseline — it runs and one tool answers in the Inspector. CP1 is the upgrade — sampling so the server can borrow the client’s model, plus progress and log notifications so it stops being silent. CP2 is the boundary and the deployment decision — roots actually enforced and the transport you chose on Monday, built rather than described. CP3 is the one you came for: a tool wired to a real system, with the three guards that make that safe. Then we break two of them on purpose and harden both.',
        bullets: [
          'CP0 Baseline — your server runs, the Inspector connects, one tool answers',
          'CP1 Upgraded — sampling + progress + structured logs',
          'CP2 Bounded and transported — roots enforced, your transport built',
          'CP3 Integrated — a tool hits a real system with timeout and error contract',
          'Then: BREAK two things deliberately, HARDEN both, with tests',
        ],
        diagram: `flowchart LR
  C0["0️⃣ Baseline<br/>it runs"] --> C1["1️⃣ Upgraded<br/>sampling + notifications"]
  C1 --> C2["2️⃣ Bounded<br/>roots + transport"]
  C2 --> C3["3️⃣ Integrated<br/>a real system"]
  C3 --> BK["💥 Break it,<br/>then harden it"]`,
        script: 'Show a finished run on screen first — the cold open — then read the map. Say the honest thing about pacing: "CP3 is the checkpoint that matters most, so if we run long we compress CP1, never CP3." Have two students name the real system they are wiring tonight before you move.',
      },
      {
        segment: 'build-map', eyebrow: '🧩 The target', title: 'What we are assembling, so every step has a place to land',
        body: 'Here is the whole shape on one slide, and it is worth keeping open in another window all night. The core is your server exposing tools. Cross-cutting concerns wrap all of them: progress notifications on the long ones, structured logs everywhere, and roots enforcement on anything that touches a file. The transport is the decision you documented on Monday, built for real. And at the edges: a real business system reached through a pooled, timed-out connection, and the client’s model reached through sampling. When you feel lost in a step tonight, come back here and find which box you are in.',
        bullets: [
          'Core: your tools — one of them will hit a real system tonight',
          'Cross-cutting: progress · structured logs · roots enforcement',
          'Transport: what YOUR decision record says, built rather than described',
          'Edges: the real system, and the client’s model via sampling',
        ],
        code: {
          kind: 'review',
          label: 'The module map — read it, then keep it open in a second window',
          code: 'your-mcp-server/\n  server.ts          // McpServer + capabilities: logging, and tools registered\n  tools/\n    integration.ts   // the tool that hits YOUR real system      (CP3)\n    summarize.ts     // the tool that uses sampling               (CP1)\n    files.ts         // anything touching the filesystem          (CP2)\n  lib/\n    roots.ts         // containment: resolve the real path, then check\n    logging.ts       // correlation ids + structured log emitter\n    adapter.ts       // pooled connection, timeout, error mapping (CP3)\n  http.ts            // the transport entrypoint your record chose (CP2)\n  docs/\n    TRANSPORT_DECISION.md   // written Monday, graded',
          expectedResult: 'Four checkpoints, four places in this tree. Point at where CP3 lands before you start — that is the file you will be in for the last forty minutes.',
        },
        diagram: `flowchart TD
  S["🖥️ Your server"] --> T["🛠️ Tools"]
  S --> X["🔁 Cross-cutting:<br/>logs · progress · roots"]
  S --> TR["🔌 Transport<br/>from your record"]
  T --> E1["🗄️ Your real system"]
  T --> E2["🧠 Client model<br/>via sampling"]`,
        script: 'Keep this on screen as an anchor for the whole night. Tell the room explicitly: "when you get lost, do not scroll your code — come back to this picture and find your box." That single instruction saves you a dozen individual rescues.',
      },
      {
        segment: 'build-map', eyebrow: '🧰 Readiness', title: 'Five things green before anybody writes a line',
        body: 'Build days die in the first fifteen minutes when people start building on a broken base. Five things: your Week 5 server runs, the Inspector connects to it, your transport decision record exists from Monday, you have access to a real system or a realistic dataset to integrate, and any credential that system needs is in your environment rather than in a file. If any of those is red, fix it in the next three minutes with a mentor. The rescue branch is here, at the start, not at the break.',
        bullets: [
          '1️⃣ Week 5 server runs and one tool answers in the Inspector',
          '2️⃣ docs/TRANSPORT_DECISION.md exists from Monday',
          '3️⃣ Access to a REAL system or a realistic dataset',
          '4️⃣ Its credential is in your environment, not in a source file',
          '5️⃣ Claude Code open in the server folder',
        ],
        diagram: `flowchart LR
  A["🖥️ Server runs"] --> GO["✅ Ready to build"]
  B["📄 Decision record"] --> GO
  C["🗄️ Real system access"] --> GO
  D["🔐 Credential in env"] --> GO
  E["💻 Claude Code open"] --> GO`,
        script: 'Run this as a literal five-point roll call on the pulse rail and do not start CP0 until it is nearly all green. Point at item four specifically — anyone who has a database password sitting in a file fixes that right now, and it costs them ninety seconds instead of a Week 9 incident.',
      },

      /* ========================== guided build ============================ */
      {
        segment: 'guided-build', eyebrow: '0️⃣ CP0 · Baseline', title: 'Never build on an unverified base',
        body: 'Before anything changes, establish a known-good floor you can diff against for the rest of the night. Launch your Week 5 server under the Inspector in your terminal, confirm three things — it initialises, your tool list comes back populated, and one tool call round-trips a real result — and then leave the Inspector open. You will be watching notifications arrive in it for the next ninety minutes. If it does not connect, that is tonight’s first task and every later checkpoint depends on it.',
        bullets: [
          'Green means: initialises · tools listed · one tool round-trips',
          'Leave the Inspector open — it is your window into everything tonight',
          'A verified baseline is what makes every later change diffable',
          'Not connecting? That is your only task until it does',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'your TERMINAL (not Claude Code)',
          label: 'Terminal — bring up the baseline',
          code: '# from inside your MCP server folder\nnpm install\nnpm run build          # if your project has a build step\n\n# launch your server under the Inspector and LEAVE IT OPEN\nnpx @modelcontextprotocol/inspector node build/server.js\n\n# in the browser: Connect -> Tools -> run one tool -> confirm a real result',
          expectedResult: 'A green connection, your Week 5 tools listed, and one real result back from a tool call.',
          stopCondition: 'One of your own tools answers in the Inspector. Nobody moves past this.',
          rescue: 'Connection drops instantly? Run the server on its own in the terminal first and read the startup error — it is nearly always a build path or a missing environment variable, not MCP.',
        },
        diagram: `flowchart LR
  T["⌨️ Terminal"] --> I["🔍 Inspector"]
  I --> S["🖥️ Your server"]
  S --> OK["✅ One tool<br/>answers"]
  OK --> BASE["📌 Known-good<br/>baseline"]`,
        script: 'Hard gate. Walk the room or scan the chat and get everybody green before you say another word about sampling. "Nobody advances until a tool round-trips" is not a suggestion tonight — a red baseline turns into three rescues at CP3.',
      },
      {
        segment: 'guided-build', eyebrow: '1️⃣ CP1a · Sampling, server half', title: 'Add a tool that asks the client to think, instead of thinking on its own',
        body: 'The first upgrade. Pick something in your own workflow that needs judgement rather than lookup — summarise this record, decide whether these two entries are the same thing, draft the one-line explanation a human will read. That tool fetches the real data itself and then asks the CLIENT to do the reasoning. Watch what is absent from the file Claude Code writes: no API key, and no model name. Both of those decisions now belong to whoever runs the client, which is exactly the property that makes this server deployable inside a company.',
        bullets: [
          'Pick a real judgement task from YOUR workflow, not a demo one',
          'The tool fetches the data; the client does the reasoning',
          'No key and no model name should appear anywhere in the server',
          'Handle the case where the client refuses — that is a real branch',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — add a sampling-based tool',
          code: 'Add one new tool to this MCP server that needs reasoning rather than lookup. For my project that tool should: [DESCRIBE THE JUDGEMENT TASK IN ONE LINE].\n\nRequirements:\n1. The tool fetches the real data it needs itself, with no model call for that part.\n2. It then requests a model completion THROUGH THE CLIENT using MCP sampling, with a short system prompt and a sensible max tokens.\n3. No API key and no model name may appear anywhere in this server — both belong to the client.\n4. If the client does not support sampling, or refuses the request, the tool must return a clear, useful degraded result and log a warning. It must not crash and it must not silently return an empty answer.\n5. Emit a log notification when the sampling request starts and when it returns, with the duration.\n\nShow me the file and point out the line where the request leaves for the client.',
          expectedResult: 'A new tool whose file contains no credential and no model id, and which has an explicit branch for a refused sampling request.',
          stopCondition: 'You can point at the line that sends the request to the client, and at the branch that handles refusal.',
          rescue: 'Sampling appears to do nothing at all? That is almost always the client half, not your server. Hold that thought — the next slide is exactly that problem.',
        },
        diagram: `flowchart LR
  D["🗄️ Tool fetches<br/>real data"] --> A["🖥️ Server asks<br/>the client"]
  A --> C["💻 Client runs<br/>the model"]
  C --> R["↩️ Text back"]
  A -.->|"refused"| G["⚠️ Degrade +<br/>log a warning"]`,
        script: 'Make everyone write their one-line judgement task before pasting; a vague line produces a vague tool and they will feel it immediately. Read two out loud. Then flag requirement four as the one that separates tonight from a tutorial — refusal is a normal outcome, not an error.',
      },
      {
        segment: 'guided-build', eyebrow: '👀 CP1b · Read it together', title: 'The client half of sampling — the half everybody forgets',
        body: 'Sampling has two halves and it silently does nothing if either is missing. Your server asking is the half you just built. This is the other half: the client must advertise that it supports sampling, and it must register a handler that actually runs a model. Read this together and notice three things — where the capability is declared, where the human approval gate would go, and that the model id lives HERE, on the client, not in your server. This is also the file where an enterprise would put a spend limit or an audit hook.',
        bullets: [
          'The client declares a sampling capability, or your server’s request is refused',
          'The handler runs the real model with the client’s own key',
          'The model id lives on the client — swap it here, not in the server',
          'This is exactly where a human approval gate or a spend cap belongs',
        ],
        code: {
          kind: 'review',
          label: 'The client-side sampling handler — read it, do not paste it',
          code: 'import { Client } from "@modelcontextprotocol/sdk/client/index.js";\nimport { CreateMessageRequestSchema } from "@modelcontextprotocol/sdk/types.js";\nimport Anthropic from "@anthropic-ai/sdk";\n\nconst client = new Client(\n  { name: "my-client", version: "1.0.0" },\n  { capabilities: { sampling: {} } }        // <-- without this, the server is refused\n);\n\nconst anthropic = new Anthropic();          // reads ANTHROPIC_API_KEY from the env\n\nclient.setRequestHandler(CreateMessageRequestSchema, async (req) => {\n  // A human-in-the-loop gate belongs RIGHT HERE:\n  //   show the prompt, await approval, deny if the user says no.\n\n  const msg = await anthropic.messages.create({\n    model: "claude-sonnet-5",                // the CLIENT owns this decision\n    max_tokens: req.params.maxTokens ?? 512,\n    system: req.params.systemPrompt,\n    messages: req.params.messages.map((m) => ({\n      role: m.role,\n      content: m.content.type === "text" ? m.content.text : "",\n    })),\n  });\n\n  const first = msg.content.find((b) => b.type === "text");\n  return {\n    role: "assistant",\n    model: msg.model,\n    stopReason: "endTurn",\n    content: { type: "text", text: first?.text ?? "" },\n  };\n});',
          expectedResult: 'Three fingers on three lines: the capability declaration, the comment where the approval gate goes, and the model id that belongs to the client rather than the server.',
        },
        diagram: `flowchart LR
  CAP["📣 sampling<br/>capability"] --> H["🎛️ Request handler"]
  H --> GATE["🙋 Approval gate<br/>goes here"]
  GATE --> M["🧠 The client model"]
  M --> BACK["↩️ Completion to<br/>the server"]`,
        script: 'Read this with the room rather than at them — three fingers, three lines, then move. Say the governance line once: "the model choice, the key, and the yes-or-no all live in this file, and none of them live in the server." That is the sentence they repeat to their security team.',
      },
      {
        segment: 'guided-build', eyebrow: '2️⃣ CP1c · Progress', title: 'Make the long tools report — and watch it happen in the Inspector',
        body: 'Monday you added progress to one tool as a micro-build. Now it goes into the real server, on every operation that can take more than a couple of seconds — the sampling tool, the integration tool once it exists, anything that loops. The rule holds exactly as before: emit only when the client asked, count against a real total, never change the result. The verification is not "the code looks right"; the verification is that you watch ticks arrive in the Inspector before the result does. If you cannot see them, it is not done.',
        bullets: [
          'Every operation over roughly two seconds gets progress',
          'Only emit when the client passed a token — otherwise degrade silently',
          'Real totals, not invented percentages',
          'Verification = you SAW ticks arrive before the result, in the Inspector',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — progress on every slow operation',
          code: 'Find every tool in this MCP server whose work can take more than about two seconds, and add progress notifications to all of them.\n\nRequirements:\n1. Read the progress token from the request metadata; if the client did not send one, emit nothing and behave identically to before.\n2. Send a running progress count against a REAL total. Do not invent a percentage when the total is genuinely unknown — in that case, send progress without a total and say so in the message.\n3. Never change what the tool returns.\n4. Put the emit logic in one shared helper rather than copying it into each tool.\n\nWhen you are done, list the tools you changed and tell me which one I should run in the Inspector to see the most ticks.',
          expectedResult: 'One shared helper, several tools using it, and a named tool to run so you can watch ticks stream.',
          stopCondition: 'You watched progress ticks arrive in the Inspector BEFORE the result did.',
          rescue: 'Ticks not arriving? Confirm the client actually sent a token before you touch the emit code — a correctly guarded emit that stays silent is not a bug.',
        },
        diagram: `flowchart LR
  H["🧰 One shared<br/>progress helper"] --> T1["🛠️ Sampling tool"]
  H --> T2["🛠️ Integration tool"]
  H --> T3["🛠️ Any loop"]
  T1 --> I["🔍 Ticks in the<br/>Inspector"]
  T2 --> I`,
        script: 'Push on requirement four — one helper, not copy-paste. This is the first moment tonight where they are refactoring rather than adding, and it is worth naming that out loud: "you are now maintaining a server, not writing a script."',
      },
      {
        segment: 'guided-build', eyebrow: '3️⃣ CP1d · Logs', title: 'Give it a voice for the person diagnosing it at 2 AM',
        body: 'Progress is for the user waiting; logs are for whoever has to figure out what happened. Declare the logging capability, generate one correlation id per tool invocation, and emit structured events at every boundary that matters. The test of whether this is done is specific and easy to check: pick one invocation, take its correlation id, and see whether you can follow that single request from the moment it arrived to the moment it answered, including any external call it made. If you cannot, add the missing line now while it is cheap.',
        bullets: [
          'One correlation id per invocation, on every line for that invocation',
          'Events at boundaries: tool start · external call start and end · denial · error',
          'Every caught error gets a stable error class name, never a bare message',
          'Test: can you trace ONE request end to end using only its id?',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — a log stream you can actually trace with',
          code: 'Add structured log notifications across this whole MCP server.\n\nRequirements:\n1. Declare the logging capability on the server. Note in a comment that log notifications are silently dropped without it.\n2. Generate one correlation id at the start of every tool invocation and include it on every log line produced by that invocation.\n3. Emit events at these boundaries: tool invoked, external call started, external call finished with duration in milliseconds, access denied, error caught.\n4. Every caught error must be logged with a stable error class name such as TimeoutError, ValidationError, UpstreamUnavailable, AccessDenied — never a bare message string.\n5. Payloads are structured objects with stable event names. Never log a key, a connection string, or a raw record.\n\nThen show me the log lines a SINGLE successful invocation produces, in order, so I can check I could actually trace one.',
          expectedResult: 'A printed, ordered list of the log lines one invocation produces, all sharing one correlation id.',
          stopCondition: 'You can follow one request from arrival to answer using nothing but its correlation id.',
          rescue: 'Lines appearing without a correlation id? The id is being generated too deep in the call stack — it has to be created once at invocation and passed down.',
        },
        diagram: `flowchart LR
  INV["📨 Tool invoked<br/>id created"] --> EX1["🔗 External call<br/>started"]
  EX1 --> EX2["⏱️ Finished<br/>+ duration"]
  EX2 --> DONE["✅ Answered"]
  ERR["💥 Error caught<br/>+ error class"] -.-> DONE`,
        script: 'Do the trace live on your own server — pick one correlation id and read the story of that request out loud, line by line. That thirty-second demonstration is what makes the room actually add the missing lines rather than nodding at the idea.',
      },
      {
        segment: 'guided-build', eyebrow: '4️⃣ CP2a · Roots', title: 'Enforce the boundary on every tool that touches a file',
        body: 'Now the control. Wire the containment helper into every file-touching tool in your server — not just the obvious one, which is how this gets missed in real code. Resolve the real path first so traversal and symlinks collapse, then check containment, then deny with a clear error result and a warning log. And notice the last requirement in the prompt: it asks Claude Code to tell you which tools it changed and which it did not. That list is the audit, and reading it is your job, not its job.',
        bullets: [
          'Every file-touching tool, not just the obvious one',
          'Resolve the real path FIRST, then check containment',
          'Deny with an error result, not an exception that kills the connection',
          'Read the list of what it changed — the audit is yours',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — containment on every file path',
          code: 'Enforce roots across this entire MCP server.\n\nRequirements:\n1. Use one containment helper: ask the client for its declared roots, resolve the REAL path of the requested file so dot-dot traversal and symlinks are collapsed, then confirm the resolved path sits inside an allowed root.\n2. Route EVERY tool that touches the filesystem through it. Do not use a plain string prefix check on the raw path, and explain in a comment why that is insufficient.\n3. On denial: return an error result rather than throwing, and emit a warning log with a stable event name and the requested path.\n4. If the client declares no roots at all, deny file access by default rather than allowing everything, and log that decision clearly.\n\nThen give me two lists: every tool you routed through the helper, and every tool that touches a file which you did NOT change. I want to check the second list myself.',
          expectedResult: 'Two lists, and a default-deny branch for the case where the client declares no roots at all.',
          stopCondition: 'The second list is empty, or you have personally decided each item on it is genuinely fine.',
          rescue: 'If it reports that no tools touch the filesystem, search the project yourself for file reads — indirect helpers are exactly where this gets missed.',
        },
        diagram: `flowchart LR
  RQ["📄 Requested path"] --> RP["🧭 Resolve the<br/>REAL path"]
  RP --> CK{"🚪 Inside a<br/>declared root?"}
  CK -->|"yes"| RD["✅ Read it"]
  CK -->|"no"| DN["🚫 Error result<br/>+ warning log"]
  NR["🕳️ No roots<br/>declared"] --> DN`,
        script: 'Spend your time on requirement four, default-deny, because it is the one nobody thinks of and it is the difference between a control and a coincidence. Then make them actually read the second list out loud to a neighbour — that is the audit habit you want them carrying into Week 10.',
      },
      {
        segment: 'guided-build', eyebrow: '5️⃣ CP2b · Transport', title: 'Build the transport you defended on Monday — not the one the example used',
        body: 'Monday you wrote a decision record. Tonight you build exactly what it says, and if the code and the document disagree, one of them is wrong and you fix it before you leave. For most people in this room the record says StreamableHTTP and stateless, because the server will be called by more than one person and will eventually run on more than one machine. Stateless means no session map to strand a request on the wrong replica — every request carries what it needs and any instance can serve it. If your record says STDIO because it genuinely is a personal tool, build that, and say so out loud so the room hears a defended alternative.',
        bullets: [
          'Build what YOUR record says — and reconcile if the code disagrees',
          'Stateless means no in-memory session map to strand a request',
          'STDIO is a perfectly good answer for a genuinely single-user tool',
          'The record and the code must match before you leave tonight',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — implement my documented transport',
          code: 'Read docs/TRANSPORT_DECISION.md in this project and implement exactly the transport and state model it specifies.\n\nRequirements:\n1. Implement what the document says. If the document is ambiguous, ask me rather than guessing.\n2. If it specifies a stateless HTTP transport, ensure there is no in-memory session map anywhere and that each request is fully self-contained, so any instance can serve any request. Add a comment naming the failure this avoids.\n3. If it specifies STDIO, keep it simple and add a comment stating the single-user assumption explicitly, so nobody scales it by accident.\n4. Add a startup log line stating which transport and state model this process is running, so an operator can tell from the logs alone.\n5. Finally, compare the running code to the document and tell me about ANY place they disagree. Do not quietly fix the document to match the code.',
          expectedResult: 'A transport that matches your written decision, a startup log line naming it, and an explicit report of any disagreement.',
          stopCondition: 'Your code and your decision record say the same thing, and you fixed whichever one was wrong.',
          rescue: 'If it says the document is ambiguous, that is a real finding — answer the question, then update the record. An ambiguous decision record fails in Week 12 for the same reason it fails here.',
        },
        diagram: `flowchart LR
  DOC["📄 Your decision<br/>record"] --> IMP["🔧 Implement<br/>exactly that"]
  IMP --> LOG["📣 Startup line<br/>names the choice"]
  IMP --> CMP{"⚖️ Code vs<br/>document?"}
  CMP -->|"disagree"| FIX["✏️ Fix the wrong<br/>one, now"]`,
        script: 'Requirement five is the teaching moment — the model must not silently rewrite the document to match whatever it built. Say why: "a decision record that gets edited to match the code is not a decision record, it is a transcript." Ask if anyone had a disagreement and let one person describe theirs.',
      },
      {
        segment: 'guided-build', eyebrow: '6️⃣ CP3 · The integration', title: 'Wire it to something real — with the three guards that make that safe',
        body: 'This is the checkpoint everyone came for. Point one tool at a real system from your own build plan: a database, an internal API, a spreadsheet export, a ticket system. Three requirements, none of them optional. Parameterised access, because untrusted model output must never be concatenated into a query or a command. An explicit timeout, because a hung dependency must not hang every user. And the MCP error contract on failure — return an error result rather than throwing, so one bad call does not kill the connection for everybody. When those three hold, your integration is real.',
        bullets: [
          'Parameterised — model output never gets concatenated into a query',
          'Explicit timeout — a hung dependency must not hang your users',
          'Error result, not an exception — one bad call must not kill the connection',
          'Credentials from the environment, released connections, no leaked handles',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — integrate my real system, safely',
          code: 'Add one tool to this MCP server that reads from a real system in my project: [NAME THE SYSTEM AND THE ONE QUESTION IT SHOULD ANSWER].\n\nNon-negotiable requirements:\n1. Any value that came from the model is passed as a bound parameter. Never concatenate model output into a query, a command, or a URL path.\n2. Every outbound call has an explicit timeout. If it fires, return a clear timed-out error result and log it with a TimeoutError class name.\n3. On any failure return the MCP error result contract rather than throwing, so a single bad call cannot kill the connection.\n4. Read every credential from the environment. No credential, host, or connection string may appear in source, in a log, or in an error message returned to the caller.\n5. Use a pooled or reused connection and release it in a finally block.\n6. Emit progress notifications if the call can take more than about two seconds, and log the call boundaries with the correlation id.\n\nShow me the file, then run it once against real data and print the result.',
          expectedResult: 'A real answer from your real system, plus a file where you can point at the parameter binding, the timeout, and the error-result branch.',
          stopCondition: 'The tool returns data that could only have come from your real system — and you can point at all three guards.',
          rescue: 'Connection refused? Check the credential is in the environment of the terminal running the server, not in your shell somewhere else. That is the same lesson as Week 3, in a new costume.',
        },
        diagram: `flowchart LR
  T["🛠️ Your tool"] --> P["🔒 Bound<br/>parameters"]
  P --> TO["⏱️ Timeout<br/>on the call"]
  TO --> SYS["🗄️ Your real<br/>system"]
  SYS --> OK["✅ Real data"]
  TO -.->|"fires"| ER["⚠️ Error result<br/>+ logged"]`,
        script: 'Slow right down and let people actually get real data back — this is the peak moment of Act II. Call on two students to say what their tool just returned and from which system. Then say it plainly: "your AI just touched a system your business depends on. That is what Act II was for."',
      },
      {
        segment: 'guided-build', eyebrow: '7️⃣ CP3 · Prove it', title: 'Run the whole chain once, on your own real question',
        body: 'Put it together end to end. Ask a real question your own workflow would ask, and watch the whole machine work: the tool starts and logs its correlation id, progress ticks arrive, the real system answers behind a timeout, sampling asks your client to turn the raw result into something a person can read, and a final structured record comes back. Read the log stream afterwards and follow that single id from start to finish. If you can do that, you have built something an operator who has never met you could support.',
        bullets: [
          'One real question from your own workflow, not a sample one',
          'Watch: log start → progress ticks → real data → sampling → structured result',
          'Then trace the whole thing back using one correlation id',
          'Tap "I finished" so we know who to call on for demos',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — one end-to-end run, with a record I can keep',
          code: 'Run the full chain once against my real system with this question: [YOUR REAL QUESTION].\n\nThen produce a short structured run record as validated JSON, using the Messages API output_config with a format of type json_schema — not the deprecated top-level output_format parameter. The schema must require, with additionalProperties false: the question asked, the tools invoked in order, the correlation id, whether sampling was used, the total duration in milliseconds, and the final answer.\n\nPrint that record, then print the ordered log lines for that same correlation id underneath it so I can check the two agree.',
          expectedResult: 'A validated JSON run record, and beneath it the ordered log lines carrying the same correlation id.',
          stopCondition: 'The record and the log stream tell the same story about the same request.',
          rescue: 'If it reaches for a top-level output_format parameter, stop it — that shape is deprecated. Tell it to use output_config with a json_schema format instead.',
        },
        diagram: `flowchart LR
  Q["❓ Your real<br/>question"] --> L["🪵 Log start<br/>+ correlation id"]
  L --> PR["📊 Progress ticks"]
  PR --> SY["🗄️ Real system"]
  SY --> SM["🧠 Sampling"]
  SM --> REC["📦 Structured<br/>run record"]`,
        script: 'Call out the deprecation deliberately as you paste — the older top-level parameter is what a blog post will show them, and naming it teaches the real habit: check the current API surface, do not trust the first search result. Then let the room read their own run records.',
      },

      /* ============================= failure ============================== */
      {
        segment: 'failure', eyebrow: '💥 Break one', title: 'Take the boundary off and walk out of your own directory',
        body: 'Your server works, which is exactly why this is the right moment to break it — while it is small, while nothing depends on it, and while an instructor is standing here. On a COPY, remove the containment check and put a fake environment file with obviously fake secrets two directories up. Then ask the tool for it. It will hand it over, cheerfully, with no error and no log line, because a boundary that is not enforced is a comment. Watch it happen with your own eyes; the fix means something completely different afterwards.',
        bullets: [
          'Work on a COPY — do not break your real server',
          'Use a FAKE environment file with obviously fake values',
          'The escape produces no error and no warning — that is the lesson',
          'Advisory is not a control. You are about to feel the difference.',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — break the boundary, deliberately',
          code: 'We are doing a deliberate failure exercise. Do NOT change my working server.\n\n1. Copy the server folder to a folder named broken/ and work only there.\n2. Create a FAKE environment file two directories above the declared root, containing obviously fake placeholder values only. Never use a real credential for this exercise.\n3. In the copy, remove the roots containment check from the file-reading tool so it opens whatever path it is given.\n4. Show me the exact tool call I should run in the Inspector to read that fake file from outside the declared root.\n\nDo not fix anything yet, and tell me what error or warning, if any, the server produced during the escape.',
          expectedResult: 'The fake file contents appearing in the Inspector transcript — and the honest answer that no error and no warning were produced.',
          stopCondition: 'You have seen the escape succeed silently.',
          rescue: 'If the escape is denied, another tool is still routed through the helper — that is good news about your CP2a work. Break the copy properly so you can see the failure, then move on.',
        },
        diagram: `flowchart LR
  C["📁 broken/ copy"] --> R["✂️ Check removed"]
  R --> A["🗡️ Read outside<br/>the root"]
  A --> S["📄 Fake secrets<br/>in the transcript"]
  S --> Q["🤫 No error.<br/>No warning."]`,
        script: 'Do it on your own screen first with an obviously fake file, then let them do theirs. Sit in the silence after the escape succeeds — the absence of an error message is the entire teaching moment, and rushing past it wastes the best thirty seconds of the night.',
      },
      {
        segment: 'failure', eyebrow: '💥 Break two', title: 'Kill the real system mid-call — loud, or quiet?',
        body: 'Now the 2 AM question, tested rather than discussed. Take the dependency away while a call is in flight: stop the database, revoke the token, point the host at somewhere that will never answer. Then watch what your tool does. There are only three possible outcomes and you need to know which one you built. It hangs forever, which is the worst one, because it takes your users with it. It fails quietly and returns something plausible and empty. Or it fails loudly — a named error, a logged event, a correlation id you can search for. Only the third one is acceptable.',
        bullets: [
          'Take the dependency away mid-call and observe honestly',
          'Hangs forever → your timeout is missing or too generous',
          'Returns an empty-but-plausible answer → the quiet failure, the dangerous one',
          'Named error + log line + correlation id → this is the one you want',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — take the dependency away and report honestly',
          code: 'In the broken/ copy, simulate my real system being unavailable in three separate ways, one at a time:\n\n1. Unreachable: point the connection at a host or port that will never answer.\n2. Slow: make it take far longer than my timeout allows.\n3. Wrong shape: make it return an empty or malformed result instead of an error.\n\nFor each one, run the tool and report honestly: did it hang, did it return something plausible but wrong, or did it fail loudly with a named error and a log line? Give me a small table of the three cases and what actually happened.\n\nDo not fix anything yet. I want the honest table first.',
          expectedResult: 'A three-row table of what actually happened — and case three is very often the quiet one nobody had handled.',
          stopCondition: 'You know, factually rather than hopefully, which of your three failure modes are quiet.',
          rescue: 'If everything fails loudly on the first try, congratulations — now try case three specifically, an empty-but-valid result. That is the one that survives most people’s first pass.',
        },
        diagram: `flowchart LR
  K["🔌 Dependency<br/>taken away"] --> H["🥶 Hangs forever"]
  K --> Q["🤫 Plausible<br/>but empty"]
  K --> L["📢 Named error<br/>+ log + id"]
  H --> BAD["❌ Not shippable"]
  Q --> BAD
  L --> OK["✅ Shippable"]`,
        script: 'Case three is the one to dwell on — an empty result that looks like a valid answer is the exact shape of the eleven-day story from Monday. Ask who got a quiet failure and let two people describe theirs. Honesty here is worth more than a clean table.',
      },
      {
        segment: 'failure', eyebrow: '🔧 Harden', title: 'One fix per break — and each one ships with a test that reproduces it',
        body: 'Now repair both, and notice how unglamorous each fix is. The boundary comes back, denials get logged, and a test proves the escape is refused. The quiet dependency failure becomes a loud one: an empty result where a result was required is now an explicit named error rather than a shrug, the timeout is tightened to something you would actually accept at 2 AM, and both get a test that reproduces the original break. That last part is the rule, not the flourish — a fix without a test is an intention, and intentions do not survive the next refactor.',
        bullets: [
          'Restore containment, log every denial, and test that the escape is refused',
          'Turn the quiet dependency failure into a named, logged, loud one',
          'Tighten the timeout to a number you would defend at 2 AM',
          'Every fix ships with a test that reproduces the original break',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — harden both breaks, with tests',
          code: 'Now fix both failures, in my REAL server rather than the copy, and show me each diff.\n\n1. Restore roots containment on every file-touching tool. Every denial emits a warning log with a stable event name and the requested path.\n2. For each quiet failure in the table we just produced, make it loud: an empty or malformed result where a real result was required must raise a specific named error, be logged with its error class and correlation id, and be returned as an MCP error result — never as a plausible-looking empty answer.\n3. Review my timeout value and tell me whether you would defend it at 2 AM. If not, propose a number and say why.\n4. Write one test per break that reproduces the ORIGINAL failure and now passes because of the fix. Name each test after the failure it prevents.\n\nThen run the tests and show me them passing.',
          expectedResult: 'Two diffs, a defended timeout value, and a passing test per break, each named after the failure it prevents.',
          stopCondition: 'Both tests pass, and both would have failed before your fix.',
          rescue: 'If a test passes before the fix is applied, it is not reproducing the break — tell Claude Code that and have it write a genuinely failing test first.',
        },
        diagram: `flowchart LR
  B1["🔓 Escape"] --> F1["🚪 Containment<br/>restored + logged"]
  B2["🤫 Quiet failure"] --> F2["📢 Named error<br/>+ log + error result"]
  F1 --> T["🧪 A test per break"]
  F2 --> T
  T --> G["✅ Green"]`,
        script: 'Ask the room which of these two fixes they would have thought of unprompted. It is almost always the first. Name that gap: "the boundary is the one you can imagine — the quiet failure is the one that actually gets you, and you only found it because you went looking."',
      },
      {
        segment: 'failure', eyebrow: '🏁 Act II closes', title: 'The ship gate — and what you can do now that you could not in Week 1',
        body: 'Built is not shipped. Run this gate before you demo, and fix every unchecked line. Then look up for a second, because Act II ends here. In Week 1 you could ask an AI for help and read what it wrote back. Tonight you have a server that reaches a real business system, holds no credentials of its own, refuses to leave its territory, reports what it is doing while it does it, fails loudly on purpose, and comes with a written decision you could defend to a reviewer. Week 7 makes it a team. Week 9 breaks it harder than we did tonight. Week 12 is the dragon, exactly as promised.',
        bullets: [
          'Every line on the gate is checkable in under a minute',
          'You did not get smarter tonight — your system got survivable',
          'Trust ladder: it now reaches real systems, read-mostly, under your rules',
          'Next: Week 7 turns one server into a coordinated team',
        ],
        code: {
          kind: 'review',
          label: 'Definition of Done for the Intensive 2 server — read it together',
          code: 'SHIP ONLY IF:\n[ ] sampling works end to end, and a refused sampling request degrades cleanly\n[ ] no API key and no model id anywhere in the server\n[ ] progress notifications stream on every operation over ~2 seconds\n[ ] one correlation id traces a single invocation from arrival to answer\n[ ] roots enforced on EVERY file-touching tool, default-deny when none declared\n[ ] the escape attempt is denied AND logged, with a test that proves it\n[ ] transport matches docs/TRANSPORT_DECISION.md, and a startup line names it\n[ ] the real integration uses bound parameters, an explicit timeout, and the error contract\n[ ] no secret appears in any log line or in any error returned to a caller\n[ ] every deliberate break has a fix AND a test named after the failure',
          expectedResult: 'Ten checkable lines. Anything unchecked is tonight’s homework, not a nice-to-have.',
        },
        diagram: `flowchart LR
  W1["🖐️ Week 1<br/>you approved<br/>every action"] --> W6["🔌 Week 6<br/>it reaches a<br/>real system"]
  W6 --> W7["👥 Week 7<br/>a team"]
  W7 --> W9["💥 Week 9<br/>it survives failure"]
  W9 --> W12["🐉 Week 12<br/>the dragon"]`,
        script: 'Read the gate out loud line by line and have people check their own. Then close Act II deliberately — slow down, put the Week 1 to Week 12 diagram up, and name the distance travelled. Finish on the open loop: "you have one server that does one job well. Next week you find out what happens when one is not enough."',
      },
    ],

    storyBeats: {
      'result-preview': [
        {
          icon: '📟', tone: 'violet', eyebrow: 'Before you build — what changes tonight',
          title: 'The moment something becomes real is the moment somebody could be woken up by it',
          body: 'There is a specific and slightly uncomfortable threshold in every engineer’s career: the first time a thing they built has a phone number attached to it. Up to that point, software is something you show. After it, software is something that runs whether or not you are thinking about it, and its failures belong to you. Tonight your server crosses that line. Nothing about the code gets harder. What changes is that the failure path stops being hypothetical.',
          punch: 'You are not making it smarter tonight. You are making it something you would be willing to be responsible for.',
        },
      ],
      'build-map': [
        {
          icon: '🧑‍🔧', tone: 'leaf', eyebrow: 'Why we are adding all this plumbing',
          title: 'The best compliment an integration ever gets is that somebody else fixed it',
          body: 'Think about what it would take for a colleague who has never seen your code to diagnose it at 2 AM. They would need to know what it was doing when it stopped, how far it got, what it was allowed to touch, and which decisions were deliberate. That is not documentation — documentation goes stale in a fortnight. It is progress notifications, structured logs with a correlation id, an enforced boundary, and one short written rationale. Four things, all of which you build tonight.',
          punch: 'Marcus from Monday could not hand his integration over. Yours will hand itself over.',
        },
      ],
      failure: [
        {
          icon: '🧯', tone: 'amber', eyebrow: 'Why we break it in the room',
          title: 'Every fire drill you have ever done was for a fire that never came that day',
          body: 'Nobody runs a fire drill because they expect a fire on Tuesday. They run it because the first time you look for the exit should not be the first time you need it. Tonight we take the boundary off your server and walk out of its directory, and we take its dependency away mid-call, deliberately, while it is small and nothing depends on it and there is an instructor standing right there. Both of these are failures that have taken down real integrations at real companies.',
          punch: 'The first time your system fails should never be the first time you have seen it fail.',
        },
        {
          icon: '🧭', tone: 'violet', eyebrow: 'Act II closes here',
          title: 'Six weeks ago you were asking an AI for help. Tonight it reached a system your business depends on.',
          body: 'Look back honestly at Week 1. You approved every single action, one at a time, and reading the output was the whole job. Then it ran a bounded task while you were not in the room. Then your judgement became something a team could reuse. Then it grew hands. Tonight those hands reached into a real system, under a boundary you wrote, reporting what they were doing the entire time. That is not a bigger prompt. That is a different category of thing, and you built it in six weeks.',
          punch: 'Apprentice in Act I. Journeyman with a crew in Act II. In Week 12, the one who signs the drawings.',
        },
      ],
    },

    extraInteractions: [
      {
        segment: 'readiness', kind: 'poll',
        q: 'Five-point check — where are you?',
        options: [
          '✅ All five green',
          '🖥️ Server or Inspector will not come up',
          '📄 No transport decision record from Monday',
          '🗄️ No access to a real system yet',
        ],
        eyebrow: '🚦 Roll call', title: 'Before anybody writes a line',
        presenterTip: 'Operational. Read the counts out loud and send mentors immediately. For the "no real system" group, a realistic local dataset is an acceptable substitute tonight — say that explicitly so nobody sits frozen. For the missing decision record, they write it in five minutes during CP0.',
      },
      {
        segment: 'result-preview', kind: 'poll',
        q: 'What real system are you wiring your server to tonight?',
        options: [
          'A database I already have access to',
          'An internal API or SaaS tool',
          'A file or spreadsheet export that matters',
          'A realistic dataset — the real one needs approval',
        ],
        eyebrow: '🎯 Commit to one', title: 'Name your integration before you build it',
        presenterTip: 'Have three people say theirs out loud in one sentence, including which question the tool will answer. The specific answers visibly raise the quality of everyone else s CP3, and the fourth option is a completely respectable answer for a regulated employer.',
      },
      {
        segment: 'guided-build', kind: 'poll',
        q: 'You added sampling to a tool and it silently does nothing at all. What do you check FIRST?',
        options: [
          'The system prompt wording',
          'Whether the CLIENT declares a sampling capability and has a handler',
          'The max tokens value',
          'Whether the model supports sampling',
        ],
        answer: 1,
        reveal: 'The client half. Sampling has two halves and it no-ops silently when the client does not advertise the capability or has no handler registered. The server side is almost never the problem here.',
        eyebrow: '🩺 Diagnose it', title: 'Sampling is silent. Where do you look?',
        presenterTip: 'Fires right after CP1a, before anyone has spent ten minutes rewriting a perfectly good system prompt. Reveal fast, then move straight into the client-half slide — the timing is the point.',
      },
      {
        segment: 'guided-build', kind: 'poll',
        q: 'Where are you right now?',
        options: ['✅ CP1 done, notifications streaming', '🧠 Working on sampling', '🚪 On roots and transport', '💥 Stuck — I need a mentor'],
        eyebrow: '🚦 Build check', title: 'Halfway pulse — nobody stays stuck alone',
        presenterTip: 'Operational. Call the numbers out loud and route mentors to the last group by name if you can see it. Do not start CP3 with more than a couple of people stuck — CP3 is the checkpoint that must land tonight.',
      },
      {
        segment: 'guided-build', kind: 'trivia',
        q: 'Your tool passes a customer id that came from the model into a query. What is the requirement?',
        options: [
          'Escape any quotes in the string',
          'Pass it as a bound parameter, never concatenated',
          'Validate the length and then concatenate',
          'It is fine — the model would not send anything malicious',
        ],
        answer: 1,
        reveal: 'Bound parameter, always. Model output is untrusted input, exactly like a form field from the internet. Escaping by hand is how injection bugs get written by careful people.',
        eyebrow: '🔒 Security check', title: 'The model just handed you a value. Now what?',
        presenterTip: 'Fires right before CP3 so it lands while they are writing the integration. If anyone picks the last option, do not embarrass them — point out that a poisoned document in a shared drive is enough to make it false, which reframes the risk in one sentence.',
      },
      {
        segment: 'failure', kind: 'poll',
        theater: true,
        q: 'You took the real system away mid-call. What did YOUR tool actually do?',
        options: [
          '📢 Failed loudly — named error, logged, with a correlation id',
          '🥶 Hung until I gave up',
          '🤫 Returned something plausible and empty',
          '💥 Crashed and killed the connection',
        ],
        answer: 0,
        reveal: 'Only the first one is shippable. If you got the third, you just found the exact failure from Monday’s story — eleven days of confident, wrong answers — in your own code, tonight, with an instructor standing here. That is the best possible place to find it.',
        eyebrow: '💥 The 2 AM test', title: 'Loud or quiet? Report honestly.',
        presenterTip: 'Full-screen theater moment, and the honesty is the whole value — say clearly that the quiet answer is the most useful result in the room. Lock the votes, show the spread, then ask one person with a quiet failure to describe it before you reveal. Do not let this become a competition to look competent.',
      },
      {
        segment: 'failure', kind: 'trivia',
        q: 'You fixed the roots escape. Do you need a test for it?',
        options: [
          'No — the fix is obvious and small',
          'Yes — a fix without a test is an intention',
          'Only if the code is going to production',
          'Only if someone else will maintain it',
        ],
        answer: 1,
        reveal: 'Every break gets a fix AND a test that reproduces the original failure. Without the test, the next refactor quietly removes your fix and nothing tells you. That rule is what Build-Break-Harden actually means.',
        eyebrow: '🧪 Habit check', title: 'One question before you call it done',
        presenterTip: 'Fast. Reveal, one line of why, and move — this rule comes back hard in Week 9, so plant it now rather than arguing it now.',
      },
      {
        segment: 'cta', kind: 'poll',
        q: 'Honestly: could you hand this server to a colleague tonight and go away for a week?',
        options: [
          '💪 Yes — the logs and the record would carry them',
          '🙂 Mostly, but they would need one conversation with me',
          '😬 No — I am the only one who understands it',
          '🤷 I would not want anyone touching it yet',
        ],
        eyebrow: '🌡️ Self-check', title: 'The Marcus test — no right answer',
        presenterTip: 'This closes the loop on Monday’s opening story and it closes Act II. No right answer, but read the spread out loud and name it: anyone who moved from the third option toward the first this week did the actual work of the intensive. Then point at Week 7.',
      },
    ],
  },
};
