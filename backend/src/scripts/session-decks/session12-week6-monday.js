/**
 * session12-week6-monday.js — the rebuilt KitConfig override for
 * Session 12, Week 6 Architecture Day (2026-08-31),
 * "Advanced MCP + System Integration".
 *
 * WHY THIS EXISTS
 * The authored week6.ts Monday pack is good material that does not fit the room:
 * 21 teach slides, 5 story beats, 8 questions and FOUR live micro-builds inside a
 * 30-minute build window. Weeks 4 and 5 both ran past the end and the last two
 * segments were never reached. This override keeps the substance, cuts the
 * volume, and re-orders the night so the best moment is not stranded at minute 95.
 *
 * WHAT CHANGED, AND WHY
 *  1. ONE NARRATIVE SPINE — "the night shift". A helper that works while you
 *     watch (Week 5) becomes a worker who works while you sleep (tonight). The
 *     four protocol upgrades stop being a list and become the four things any
 *     night-shift worker needs: no keys of their own (sampling), a duty to call
 *     in (notifications), a floor they stay on (roots), and a posting somebody
 *     signed for (transport). Everyone understands a night shift; the spine is
 *     restated in the roadmap slide, in every architecture eyebrow, and at the close.
 *  2. 21 teach slides -> 16. Merged progress+log notifications into one slide,
 *     merged demo-shaped/loud-or-quiet, folded the trust ladder into the roadmap
 *     as a spoken line, and dropped the sampling-trace autopsy (most abstract,
 *     least load-bearing).
 *  3. FOUR live builds -> TWO. Progress notifications (fast, visible, highest
 *     satisfaction) and the graded transport decision record are built live.
 *     Logging and roots become kind:'review' TEACHING prompts — the full prompt
 *     is on screen and taught line by line, with the reasoning written into the
 *     prompt as comments, and the room runs them before Thursday. This is the
 *     single biggest time saving and it is deliberate: the teaching survives
 *     even where the building does not.
 *  4. THE THEATER POLL MOVED UP. The transport decision is the crown jewel of
 *     the night; authored, it sat in `challenge` at minute 95 and died whenever
 *     the build ran long. It now fires in `architecture` at ~minute 45. The
 *     `challenge` and `trivia` tail is now genuinely expendable.
 *  5. 5 story beats -> 4. Dropped the micro-build beat; its punch line is folded
 *     into the progress slide so build time stays build time.
 *
 * Questions are NOT reduced — 8 of them, same as authored, because they hold the
 * room and cost 1-2 minutes each. The time came out of prose and live builds,
 * which is where it actually goes.
 *
 * BUDGET: ~8,600 body chars vs 14,903 authored (-42%), 16 teach slides, 4 story
 * beats, 8 questions, 2 live builds.
 *
 * Apply with applySession12.js. Rollback is setting kit_config_json back to NULL.
 */

/* ---------------------------------------------------------------- teach ---- */
const teach = [
  /* ===================== CHECK-IN — the spine ======================= */
  {
    segment: 'checkin', eyebrow: '🌙 The night shift', title: 'Week 5 you hired a helper. Tonight it starts working while you sleep.',
    body: 'In Week 5 you built an MCP server and it worked — on your laptop, for one user, with you sitting there watching it. That is a helper, and a helper is fine, because when it gets confused you are right there. Tonight it goes on the night shift, and everything changes, because the one thing a night worker does not have is you standing next to it. Every single thing we add in the next two hours exists to answer one question: what happens when this goes wrong and you are asleep?',
    bullets: [
      'A helper works while you watch. A worker works while you sleep.',
      'You will not be there. That is the whole design problem.',
      'Four upgrades tonight — all four are about your absence.',
      'This is the last night of Act II.',
    ],
    diagram: `flowchart LR
  W5["🧪 Week 5<br/>a helper<br/>you watch it work"] --> T["🌙 Tonight<br/>a night worker<br/>you are asleep"]
  T --> Q["❓ What happens<br/>when it goes wrong<br/>at 2 AM?"]`,
    script: [
      'SITUATION: First slide of the last night of Act II. They walked in expecting more MCP. Tonight is not about MCP, it is about their absence.',
      'ROOM: Deck on screen. Inspector stays closed for now.',
      'MOOD: Slow and low. This is a shift change, not a lecture opening.',
      'OPEN: "Week 5 you built something that works while you watch it. Tonight it starts working while you sleep."',
      'DO: Show of hands — who here has ever been the person called when something broke at night? Take two answers, briefly.',
      'NOTE: Do not say the word sampling yet. The four upgrades land on the next slide.',
    ].join('\n'),
  },
  {
    segment: 'checkin', eyebrow: '🗺️ Tonight, in one picture', title: 'Four things every night worker needs — and none of them are about being smarter',
    body: 'Here is the whole night on one slide, and none of it is about making your server cleverer. Think about what a building actually requires of somebody working the night shift. They do not get their own keys — they borrow access from whoever owns the building. They have to call in, because silence and disaster look identical from a distance. They stay on their assigned floor. And somebody had to decide where they are posted and sign their name to it. Those four requirements are tonight, in order, and each one has a name in the protocol.',
    bullets: [
      '🔑 No keys of their own → SAMPLING',
      '📞 They call in → PROGRESS + LOG NOTIFICATIONS',
      '🚪 They stay on their floor → ROOTS',
      '📋 Somebody signed off on the posting → TRANSPORT + STATE',
    ],
    definitions: [
      { term: 'Night shift (tonight’s spine)', meaning: 'Any capability that runs when the person who built it is not watching. All four upgrades answer the same question: what does it do without you?' },
    ],
    diagram: `flowchart TD
  N["🌙 A worker on<br/>the night shift"] --> K["🔑 No keys<br/>of their own<br/><b>sampling</b>"]
  N --> C["📞 Calls in<br/><b>notifications</b>"]
  N --> F["🚪 Stays on<br/>their floor<br/><b>roots</b>"]
  N --> P["📋 Posting is<br/>signed for<br/><b>transport</b>"]`,
    script: [
      'SITUATION: The map for the entire night. Everything after this hangs off these four branches.',
      'ROOM: Full screen on the diagram. Walk the four branches with your hand, slowly, one at a time.',
      'MOOD: Confident and unhurried. This is the slide they should still remember in Week 12.',
      'OPEN: "None of tonight is about making your server cleverer. It is about what a night worker needs that a daytime helper never does."',
      'DO: Say plainly — "you will see this picture again four times tonight, once per upgrade."',
      'SAY: Weeks 1 and 2 you approved every action. Weeks 3 and 4 it ran a bounded job unattended. Tonight it reaches real systems under rules you write. You are not an apprentice anymore.',
      'NOTE: The trust ladder is ONE spoken sentence here, not its own slide. Do not expand it.',
    ].join('\n'),
  },

  /* ================= BUSINESS PROBLEM — why it matters ============== */
  {
    segment: 'business-problem', eyebrow: '👤 The person who is not there', title: 'Every integration in your company has exactly one person who understands it',
    body: 'Think of a system at your work that quietly moves data between two places every night. Now name the one person who actually understands it. You almost certainly can, and that is the problem in a sentence. That system is not documented, not observable, and not explainable — it runs on one human being’s memory. The organisation believes it owns a capability. What it actually owns is that person’s availability, and it will find out the difference on the day they are on a plane.',
    bullets: [
      'You can name the person. That is the diagnosis.',
      'The company thinks it owns a system. It owns a phone number.',
      'The system cannot explain itself without them',
      'Tonight you build the version that CAN',
    ],
    diagram: `flowchart LR
  S["🌙 Nightly<br/>integration"] --> P["👤 One person<br/>who understands it"]
  P --> A["✈️ Unavailable"]
  A --> D["🔥 A full day of<br/>three people guessing"]`,
    script: [
      'SITUATION: First business slide. You are setting up Marcus, who lands two slides from now.',
      'ROOM: Stay on this slide. Nothing to run.',
      'MOOD: Quiet. Let silence do the work — this one needs four or five seconds of nothing.',
      'OPEN: "Think of a system at your work that quietly moves data between two places every night. Now name the one person who actually understands it."',
      'DO: Wait. Then ask ONE person to name the system out loud — the system, not the person.',
      'SAY: Your company does not own that capability. It rents it, from someone who has holiday days.',
      'NOTE: The recognition IS the teaching here. Do not rush to the next slide.',
    ].join('\n'),
  },
  {
    segment: 'business-problem', eyebrow: '🌙 The 2 AM question', title: 'The failure that ruins you is not the crash. It is the one that keeps answering.',
    body: 'A demo and an on-call system are two different objects, and the difference is not quality — it is what each one does when it is wrong. A demo that breaks stops, and somebody notices immediately. The failure that actually costs you money is the opposite: the system stays up, stays confident, and keeps returning answers that stopped being true hours ago. Nothing throws, nothing pages, and every answer looks exactly like the correct ones did. So here is the exam question for the rest of the night, and it is the only one that matters: at 2 AM, does yours fail loudly, or quietly?',
    bullets: [
      'Loud failure costs you a night',
      'Quiet failure costs you eleven days and a customer',
      'A confident wrong answer is indistinguishable from a right one',
      'Every upgrade tonight converts quiet failure into loud failure',
    ],
    definitions: [
      { term: 'Quiet failure', meaning: 'The system keeps returning successful-looking answers after it has stopped being correct. No error, no alert, no signal — discovered by a human, usually a customer.' },
    ],
    diagram: `flowchart TD
  F["⚠️ It goes wrong<br/>at 2 AM"] --> L["📟 LOUD<br/>it stops and pages"]
  F --> Q["🤫 QUIET<br/>it keeps answering"]
  L --> N["😴 Costs a night"]
  Q --> W["💸 Costs eleven days<br/>and a customer"]`,
    script: [
      'SITUATION: The exam question for the whole night gets set here. Everything after this is judged against it.',
      'ROOM: Write "LOUD or QUIET" on the whiteboard now and leave it up all night. Point at it after each upgrade.',
      'MOOD: Sharpen up. This is the turn from story into stakes.',
      'OPEN: "A demo that breaks stops, and somebody notices. The failure that costs you money is the one that keeps answering."',
      'SAY: At 2 AM, does yours fail loudly, or quietly?',
      'DO: Go straight into the 2 AM poll from here — do not pause between them. This slide IS the setup for the vote.',
    ].join('\n'),
  },

  /* ============= ARCHITECTURE — the four upgrades =================== */
  {
    segment: 'architecture', eyebrow: '🔁 The foundation', title: 'MCP goes both ways — which is the only reason tonight is possible at all',
    body: 'One correction before the upgrades, because everything depends on it. Most people leave Week 5 believing MCP is a one-way street: the client asks, the server answers, done. It is not. The connection is a two-way conversation, and the server can start one too — it can ask the client to run a model for it, it can push notifications without being asked, and it can ask what territory it is allowed to work in. Every single thing we add tonight is the server talking back. If you remember one structural fact from this session, make it this one.',
    bullets: [
      'Client → server: the part you already know',
      'Server → client: requests, notifications, questions',
      'All four upgrades tonight ARE the server talking back',
      'Get this wrong and none of the rest makes sense',
    ],
    definitions: [
      { term: 'Bidirectional protocol', meaning: 'Both ends can initiate. The server is not only a responder — it can make its own requests and push its own messages over the same connection.' },
    ],
    diagram: `flowchart LR
  C["💻 Client"] -->|"tools/call<br/>(you know this)"| S["🖥️ Server"]
  S -->|"sampling/createMessage"| C
  S -->|"notifications/progress"| C
  S -->|"roots/list"| C`,
    script: [
      'SITUATION: The pivot slide. Most of the room left Week 5 believing MCP only goes one way. Correct that before any upgrade.',
      'ROOM: Diagram up. Trace the three UPWARD arrows with your hand, one at a time.',
      'MOOD: Matter-of-fact. This is a correction, not a reveal.',
      'OPEN: "If you thought the server only answers, everything after this will feel like magic. It is not magic. It is just the arrow pointing the other way."',
      'DO: Name each upward arrow as an upgrade they are about to meet — sampling, notifications, roots.',
      'NOTE: If they do not get this one, nothing in the next twenty minutes will land.',
    ].join('\n'),
  },
  {
    segment: 'architecture', eyebrow: '🔑 Upgrade 1 of 4 — no keys of their own', title: 'Sampling: your server does the work and never holds a credential',
    body: 'Your server needs a model — to summarise something, to classify something, to make a judgement. The obvious move is to give the server its own API key. Do not. With sampling, the server asks the CLIENT to run the model on its behalf, and the client holds the key, picks the model, pays for the call, and can require a human to approve it before it runs. Your server does the entire job and never holds a secret. Say that sentence in any security review and watch what happens to the rest of the meeting.',
    bullets: [
      'Server sends sampling/createMessage — never an API key',
      'The client owns the key, the model choice, and the spend',
      'A human approval gate can sit in the middle',
      'Your server becomes model-agnostic for free',
    ],
    definitions: [
      { term: 'Sampling', meaning: 'The server asks the client to run a model on its behalf. Credentials, model choice, cost and approval all stay with the client.' },
    ],
    diagram: `flowchart LR
  S["🖥️ Your server<br/>🚫 no key"] -->|"sampling/<br/>createMessage"| C["💻 Client<br/>🔑 holds the key"]
  C --> H["🙋 Human approves<br/>(optional)"]
  H --> M["🧠 Model runs"]
  M --> S`,
    script: [
      'SITUATION: Upgrade 1 of 4. The contractor story lands right after this and does the emotional work — this slide does the mechanical work.',
      'ROOM: Diagram up. Point at the server node and the crossed-out key.',
      'MOOD: Practical. This is the one that wins them a meeting at work.',
      'OPEN: "Your server needs a model. The obvious move is to give it its own API key. Do not."',
      'SAY: My server does the entire job and never holds a credential.',
      'DO: Ask who has sat through a security review for software. Take ONE answer, then ask what the first question was. It is always about keys.',
    ].join('\n'),
  },
  {
    segment: 'architecture', eyebrow: '📞 Upgrade 2 of 4 — they call in', title: 'Silence and disaster look identical from a distance',
    body: 'Two streams, one purpose, and this is the merged half of the night so stay with both. Progress notifications are for the person waiting right now: while a long job runs, the server sends a running count against a real total, so a slow operation stops looking like a dead one. Log notifications are for whoever is diagnosing this at 2 AM: structured events at every real boundary — start, finish, denial, error — each carrying a correlation id so one invocation can be traced end to end. Neither one changes what your tool returns. Both change whether anyone trusts it.',
    bullets: [
      'PROGRESS → for the person waiting now: a count against a real total',
      'LOGS → for the person diagnosing later: events, not sentences',
      'One correlation id per invocation, on every line — that is tracing',
      'Neither changes the tool result. Both change whether it is trusted.',
    ],
    definitions: [
      { term: 'Progress token', meaning: 'An id the CLIENT supplies when it wants progress. No token means the client did not ask — emit nothing and behave exactly as before.' },
      { term: 'Correlation id', meaning: 'One id generated per invocation and stamped on every log line for it, so a single request can be followed across every boundary it crossed.' },
    ],
    diagram: `flowchart LR
  T["🛠️ A long-running<br/>tool"] --> P["📊 progress<br/>3 of 50…"]
  T --> L["🪵 log events<br/>+ correlationId"]
  P --> U["🙂 The person<br/>waiting now"]
  L --> O["🌙 The person<br/>at 2 AM"]`,
    script: [
      'SITUATION: Upgrade 2 of 4, and the most compressed slide of the night — two authored slides merged into one. Slow DOWN here, do not speed up.',
      'ROOM: Diagram up. Point at the two output arrows separately: one to "the person waiting now", one to "the person at 2 AM".',
      'MOOD: Deliberate. This is the slide most likely to get rushed.',
      'OPEN: "Progress is for now. Logs are for later. They are the same instinct."',
      'SAY: Half of what people call a performance problem is really a feedback problem. The job was never broken — everybody just cancelled it at twelve seconds.',
      'NOTE: This is the only upgrade they build live tonight, so it earns the extra minute.',
    ].join('\n'),
  },
  {
    segment: 'architecture', eyebrow: '🚪 Upgrade 3 of 4 — they stay on their floor', title: 'Roots: the client declares the territory. Enforcing it is entirely your job.',
    body: 'The client tells your server which directories it is allowed to work in. That declaration is information, not a fence — nothing stops your server from reading whatever it likes, and the protocol will not protect you. You write the control, and there is exactly one way to write it correctly: resolve the real path FIRST, then compare. Check the raw string and a dot-dot in the middle walks straight out, and so does a symlink pointing anywhere it likes. Resolve first, compare second. That is the whole control, and the order is the entire lesson.',
    bullets: [
      'roots/list is a DECLARATION, not enforcement',
      'A raw prefix check is defeated by dot-dot and by symlinks',
      '✅ Resolve the real path, THEN compare — order is the control',
      'Deny loudly, return an error, and log every attempt',
    ],
    definitions: [
      { term: 'Roots', meaning: 'The directories the client declares as the server’s allowed territory. The protocol declares; your code enforces.' },
      { term: 'Path traversal', meaning: 'Using dot-dot segments or a symlink to escape a directory that a naive string check believed you were inside.' },
    ],
    diagram: `flowchart LR
  C["💻 Client declares<br/>/work/project"] --> S["🖥️ Server"]
  R["📥 Request:<br/>…/../../.ssh/id_rsa"] --> RES["🧭 RESOLVE<br/>the real path"]
  RES --> CMP["⚖️ THEN compare<br/>to the roots"]
  CMP --> D["🚫 Denied<br/>+ logged"]`,
    script: [
      'SITUATION: Upgrade 3 of 4, and the security control of the week. The autopsy in the next segment shows it failing.',
      'ROOM: Diagram up. Point at the RESOLVE box, then the COMPARE box, in that order.',
      'MOOD: Firm. This is the one with a right answer.',
      'OPEN: "The client tells your server which directories it may work in. That declaration is information, not a fence."',
      'DO: Make the room say "resolve first, compare second" out loud, once, together. It feels silly. Do it anyway.',
      'NOTE: Tell them this exact control returns in Week 10 as a policy enforcement point — you are planting it now.',
    ].join('\n'),
  },
  {
    segment: 'architecture', eyebrow: '📋 Upgrade 4 of 4 — somebody signs the posting', title: 'STDIO or HTTP, stateful or stateless — inherit this from a blog and you will pay for it',
    body: 'Two separate decisions that people collapse into one. Transport is how the client reaches your server: STDIO means it runs as a local subprocess for exactly one user on one machine, and StreamableHTTP means it is reachable over the network by many. State is whether anything has to survive between requests: hold session state in one process’s memory and you have quietly promised that every request lands on the same machine forever. That promise breaks the moment there are two of them. Nobody is asking you to pick the sophisticated option. You are being asked to defend the one you picked.',
    bullets: [
      'STDIO — local subprocess, one user, one machine',
      'StreamableHTTP — over the network, many callers, many replicas',
      'In-memory state = a silent promise of exactly one instance',
      'The graded artifact is the RATIONALE, not the choice',
    ],
    definitions: [
      { term: 'Stateless', meaning: 'Every request carries what it needs. Any replica can serve any request, so you can run more than one.' },
    ],
    diagram: `flowchart TD
  Q["❓ Who calls it,<br/>from where,<br/>how many?"] --> A["⌨️ STDIO<br/>one user, local"]
  Q --> B["🌐 HTTP + stateful<br/>many users,<br/>ONE instance"]
  Q --> C["🌐 HTTP + stateless<br/>many users,<br/>many instances"]`,
    script: [
      'SITUATION: Upgrade 4 of 4, and the briefing for the biggest moment of the night. The theater vote fires immediately after this slide.',
      'ROOM: Diagram up, three branches visible. Do NOT advance past the vote by accident.',
      'MOOD: Raise the energy. You are handing them a decision, not a fact.',
      'OPEN: "Two separate decisions that people collapse into one — how it is reached, and what has to survive between requests."',
      'SAY: You are the architect, and in ninety seconds you have to choose.',
      'NOTE: Do NOT reveal the answer on this slide. The briefing and the vote belong together; go straight into it.',
    ].join('\n'),
  },

  /* ================= DECONSTRUCT — two autopsies ==================== */
  {
    segment: 'deconstruct', eyebrow: '🔬 Autopsy one', title: 'It worked perfectly in staging and died at instance number two',
    body: 'A team shipped an MCP server behind a load balancer with three replicas. It had passed every test, because every test ran against one instance. In production it failed about two times in three with "no valid session ID", intermittently and unreproducibly, and they spent two days on the load balancer. The load balancer was behaving perfectly. Session state lived in one process’s memory, so round-robin across three replicas found the right one about a third of the time — and the failure rate was telling them the answer the whole time, if anyone had read it as arithmetic.',
    bullets: [
      'Every test passed — every test ran against one instance',
      'Two in three is not random. It is 3 replicas, 1 correct.',
      'The infrastructure was fine. The assumption underneath it was the bug.',
      'A stateless server would not have had this failure to find',
    ],
    diagram: `flowchart LR
  R["📨 Request"] --> LB["⚖️ Load balancer"]
  LB --> A["🖥️ Replica 1<br/>✅ has the session"]
  LB --> B["🖥️ Replica 2<br/>❌"]
  LB --> C["🖥️ Replica 3<br/>❌"]`,
    script: [
      'SITUATION: First autopsy, straight after the break. This is the transport decision arriving as a real incident.',
      'ROOM: Diagram up — load balancer and three replicas, one green and two red.',
      'MOOD: Detective, not lecturer. You are handing them a case, not a conclusion.',
      'OPEN: "It passed every test. Every test ran against one instance."',
      'DO: Give them the failure RATE before the cause and WAIT. Somebody will get to "two thirds means three replicas" out loud.',
      'NOTE: When they do, STOP and let them explain it to the room. A peer landing this is worth three of you landing it.',
    ].join('\n'),
  },
  {
    segment: 'deconstruct', eyebrow: '🔬 Autopsy two', title: 'Wide-open roots: the exact path somebody walks out of your directory',
    body: 'Here is the failure written as the two lines it actually is. A server checks that the requested path starts with the allowed directory and then opens the file — which reads as careful, passes review, and is not a control. A dot-dot in the middle of the path satisfies the prefix check and then climbs out on the filesystem. A symlink inside the allowed folder satisfies it even more easily, because it points wherever it was made to point. Both are defeated by the same one-word fix, and it is not a longer check. It is a reordering.',
    bullets: [
      '❌ startsWith(raw_path, allowed) → opens the file',
      '🗡️ /work/project/../../../.ssh/id_rsa passes it',
      '🗡️ A symlink inside the folder passes it too',
      '✅ realpath() first, THEN compare — same check, right order',
    ],
    diagram: `flowchart TD
  BAD["❌ startsWith(raw)<br/>then open"] --> ESC["🗡️ dot-dot and symlinks<br/>both walk out"]
  GOOD["✅ realpath()<br/>THEN compare"] --> STOP["🚫 Both denied<br/>and logged"]`,
    script: [
      'SITUATION: Second autopsy, and the last teaching slide before the break-out build. It pays off the roots slide.',
      'ROOM: Have a FAKE file planted on your machine before class so you can run the escape live. Do not use a real one.',
      'MOOD: Demonstrative, not preachy. Show, do not moralise.',
      'OPEN: "This reads as careful. It passes review. And it is not a control."',
      'DO: Run the escape on your own screen, then fix the order and let the denial land visibly.',
      'SAY: Resolve first, compare second.',
    ].join('\n'),
  },

  /* ================= MICRO-BUILD — 2 built, 2 taught =============== */
  {
    segment: 'micro-build', eyebrow: '🔍 The floor', title: 'You cannot verify a notification you cannot see — Inspector open first',
    body: 'Everything in this segment is invisible unless you have something that shows you the protocol traffic. The MCP Inspector is a browser tool that speaks MCP directly, so you can call your tools by hand and watch notifications arrive live without writing any client code. Run this in your TERMINAL, not in Claude Code, from your Week 5 server folder. Do not move past this slide until one of your existing tools round-trips. This is the floor for the rest of tonight and all of Thursday.',
    bullets: [
      'The Inspector speaks MCP — no client code needed',
      'This is how you will SEE progress ticks arrive',
      'Get one Week 5 tool answering before you add anything',
      'Red connection? Mentor now, not at the break.',
    ],
    code: {
      kind: 'paste',
      pasteWhere: 'your TERMINAL (not Claude Code)',
      label: 'Terminal — launch your Week 5 server under the Inspector',
      code: '# 1. from inside your Week 5 MCP server folder\nnpm install\n\n# 2. launch YOUR server under the MCP Inspector\nnpx @modelcontextprotocol/inspector node build/server.js\n\n# 3. in the browser window that opens:\n#    Connect  ->  Tools  ->  pick any tool  ->  Run\n#    you must get a real result back before you go on',
      expectedResult: 'A browser window opens, the connection goes green, your Week 5 tools are listed, and one tool call returns a real result.',
      stopCondition: 'One of your own tools round-trips in the Inspector.',
      rescue: 'Nothing loads? Check you are in the server folder and that the build output path matches the command. If the connection drops instantly, run your server on its own first and read the startup error.',
    },
    diagram: `flowchart LR
  T["⌨️ Your terminal"] --> INS["🔍 MCP Inspector"]
  INS --> SRV["🖥️ Your Week 5<br/>server"]
  SRV --> RES["✅ A real result"]`,
    script: [
      'SITUATION: Build segment opens. This is a GATE, not a lesson — nothing after it works without it.',
      'ROOM: Screen-share your terminal. Inspector command ready to paste. Mentors standing, not sitting.',
      'MOOD: Brisk and operational. No storytelling here.',
      'OPEN: "Nothing we build next is visible unless you can see the protocol traffic. Terminal, not Claude Code."',
      'DO: Demonstrate ONCE, slowly, then STOP TALKING and let the room work.',
      'NOTE: Use the pulse rail as a hard gate — nobody starts the build on a red connection. Mentors to anyone stuck immediately.',
    ].join('\n'),
  },
  {
    segment: 'micro-build', eyebrow: '🛠️ BUILD THIS — upgrade 2', title: 'Give your slowest tool a voice, and watch it call in',
    body: 'This is the one you build live tonight, and it is the highest-satisfaction fifteen lines of the whole night. Pick the slowest tool on your OWN server — the one that reads a folder, paginates an API, or queries something big — and make it report. Read what the prompt directs before you paste it: take the token from request metadata, emit only if the client actually asked, count against a real total, and leave the return value untouched. Then watch ticks stream in the Inspector while the work is still running. That is the difference between a tool people trust and a tool people cancel at twelve seconds.',
    bullets: [
      'Point it at YOUR slowest tool, not a demo one',
      'No token from the client → emit nothing, behave exactly as before',
      'Count against a real total, never a fake percentage',
      'The tool result must not change at all',
    ],
    code: {
      kind: 'paste',
      pasteWhere: 'Claude Code',
      label: 'Claude Code prompt — add progress notifications to my slowest tool',
      code: 'Look at the MCP server in this project and tell me which tool takes the longest to run, then add progress notifications to it.\n\nRequirements:\n1. Read the progress token from the tool handler request metadata. If the client did not pass one, emit nothing and behave exactly as before.\n2. While the work loops, send notifications/progress with a running count, a REAL total, and a short human-readable message naming the current unit of work.\n3. Do not change the tool return value in any way.\n4. Add a one-line comment above the emit explaining why we only send when a token is present.\n\nShow me the diff before you apply it, and tell me exactly which line to watch in the Inspector to confirm it works.',
      expectedResult: 'A small diff on ONE tool, and progress ticks arriving live in the Inspector while the tool is still running.',
      stopCondition: 'You have seen at least two progress ticks arrive BEFORE the result did.',
      rescue: 'No ticks? Nine times out of ten the client did not send a token, so your guard is correctly doing nothing — that is your code working. Re-run in the Inspector and check the request metadata before you change anything.',
    },
    diagram: `flowchart LR
  P["⌨️ Your prompt"] --> CC["💻 Claude Code"]
  CC --> D["📄 A small diff"]
  D --> R["👀 You READ it"]
  R --> I["🔍 Ticks streaming<br/>in the Inspector"]`,
    script: [
      'SITUATION: The ONE live build of the night. Everything else in this segment is read-along.',
      'ROOM: Inspector open on your screen beside Claude Code, so the ticks are visible when they arrive.',
      'MOOD: This is the payoff. Let it be fun.',
      'OPEN: "Pick the slowest tool on your own server. Not a demo one — yours."',
      'DO: Have TWO students name their slowest tool out loud before anyone pastes. It makes the exercise theirs, not yours.',
      'NOTE: Expect an audible reaction when the ticks stream. Do not talk over it.',
    ].join('\n'),
  },
  {
    segment: 'micro-build', eyebrow: '📖 TEACHING PROMPT — upgrade 2b', title: 'The log stream you will run before Thursday — read it with me now',
    body: 'We are not building this one in the room tonight, and you are still going to learn it, because the reasoning lives inside the prompt rather than in the code it produces. Read it with me line by line. Requirement one is the trap: log notifications are silently DROPPED if you never declared the logging capability, so nothing arrives and nothing tells you why. Requirement two is what makes it tracing rather than printing. Requirement five decides whether your log stream is shareable — and here is the test for it: could you paste your logs into a group chat right now, without checking them first?',
    bullets: [
      'Requirement 1 — undeclared capability = silently dropped messages',
      'Requirement 2 — one correlation id per invocation IS the tracing',
      'Requirement 4 — structured events, never formatted sentences',
      'Requirement 5 — the group-chat test. Run this before Thursday.',
    ],
    code: {
      kind: 'review',
      pasteWhere: 'Claude Code',
      label: 'Read together now — run it on your own server before Thursday',
      code: 'Add structured log notifications to the MCP server in this project.\n\n1. Declare the logging capability when the server is constructed.\n   # WHY: without the declaration the client drops every log message on the\n   # floor. Nothing errors. You will think your code is broken and it is not.\n\n2. Generate ONE correlation id per tool invocation and put it on every log line\n   for that invocation.\n   # WHY: this is the difference between printing and TRACING. One id lets you\n   # follow a single request across every boundary it touched, at 2 AM.\n\n3. Emit a log at each real boundary: tool starting, any external call starting\n   and finishing with its duration in ms, any access denial, any caught error\n   with a stable error class name.\n   # WHY: boundaries are where things actually go wrong. Logging the middle of\n   # your own loop produces noise nobody reads.\n\n4. The data payload must be a structured object with stable event names, never\n   a formatted sentence.\n   # WHY: sentences are for a human reading one line. Objects are for anyone\n   # searching ten thousand.\n\n5. NEVER include an API key, a connection string, a full credential, or a raw\n   customer record in any payload. Identifiers, counts and durations only.\n   # WHY: this decides whether the log stream can be shared with a colleague,\n   # pasted into a ticket, or shipped to a vendor. Get it wrong once and it is\n   # in your log retention for a year.\n\nAfter you apply it, list every log event name you created so I can check the\nvocabulary is consistent.',
      expectedResult: 'Point at requirement 1 (the silent-drop trap), requirement 2 (the id that makes it tracing), and requirement 5 (the one that decides if it is shareable).',
      stopCondition: 'You can answer the group-chat question honestly about your own logs.',
    },
    diagram: `flowchart LR
  CAP["🎚️ logging<br/>capability declared"] --> SRV["🖥️ Your server"]
  SRV --> EV["🪵 event + correlationId<br/>+ duration"]
  EV --> INS["🔍 Live stream"]
  RED["🚫 No keys<br/>no records"] -.-> EV`,
    script: [
      'SITUATION: First of the two TEACHING prompts. Nobody builds this tonight; they run it before Thursday.',
      'ROOM: Prompt on screen, large. Nobody should have their hands on the keyboard.',
      'MOOD: Slower, seminar pace. This is a reading, not a race.',
      'OPEN: "We are not building this one tonight, and you are still going to learn it — because the reasoning is inside the prompt, not the code."',
      'DO: Say up front that this is read-along, so nobody sits waiting to type. That is what keeps the room with you.',
      'SAY: Could you paste your log stream into a group chat right now, without checking it first?',
      'NOTE: Read requirement five out loud TWICE, then ask the group-chat question and wait for the laugh. That question is the takeaway.',
    ].join('\n'),
  },
  {
    segment: 'micro-build', eyebrow: '📖 TEACHING PROMPT — upgrade 3', title: 'The boundary prompt — and note section four, which is the real one',
    body: 'Same deal: read now, run before Thursday. This prompt does something most prompts never do, and it is in section four — it asks Claude Code to write you an ATTACK LIST against the thing it just built. That is the instinct worth stealing tonight, whatever you are building. A boundary you have not attacked is a boundary you are hoping about, and the distance between hoping and knowing is about thirty seconds of your own typing. Notice the final line too: it forbids the naive check AND makes it explain why. You are not just getting code back, you are getting the reasoning on the record.',
    bullets: [
      'Section 1 — resolve the real path FIRST, then compare',
      'Section 2 — every file-touching tool, and make it list them',
      'Section 4 — make it write the attacks against its own work',
      'Last line — forbid the naive check and demand the reason why',
    ],
    code: {
      kind: 'review',
      pasteWhere: 'Claude Code',
      label: 'Read together now — run it on your own server before Thursday',
      code: 'Add real roots enforcement to the MCP server in this project.\n\n1. Write a helper that asks the client for its declared roots, RESOLVES THE REAL\n   PATH of the requested file so dot-dot traversal and symlinks are collapsed\n   first, and then confirms the resolved path is inside one of the allowed\n   roots. If it is not, deny it.\n   # The ORDER is the whole control. Resolve first, compare second.\n\n2. Wire that helper into EVERY tool in this server that touches the filesystem.\n   List them for me so I can confirm none were missed.\n   # One unguarded tool is the same as no guard at all.\n\n3. On a denial: return a clear error result rather than throwing, and emit a\n   warning log notification with the requested path and a stable event name.\n   # A denial nobody can see is indistinguishable from an attack that worked.\n\n4. Then write me a short list of exact attacks to run by hand in the Inspector,\n   including a dot-dot traversal out of the declared root and a symlink that\n   points outside it.\n   # THIS IS THE ONE TO STEAL. Ask the thing that built it to help you break it.\n\nDo not use a plain string prefix check on the raw path, and explain in a comment\nwhy that would be insufficient.',
      expectedResult: 'Point at the resolve-then-compare order in section 1, and at section 4 — the prompt asking for attacks against its own output.',
      stopCondition: 'You can say why a prefix check on the raw path is not a control.',
    },
    diagram: `flowchart LR
  H["🧭 Resolve, then<br/>compare"] --> T["🛠️ EVERY file tool"]
  T --> A["🗡️ Attacks it wrote<br/>for you"]
  A --> D["🚫 Denied"]
  D --> L["🪵 Logged"]`,
    script: [
      'SITUATION: Second TEACHING prompt, and the most portable idea in the session. Also read-along.',
      'ROOM: Prompt on screen. Your fake-file setup from the autopsy is still available if you want to demo the attack.',
      'MOOD: Conspiratorial. You are handing them a trick that works everywhere.',
      'OPEN: "Same deal — read now, run before Thursday. But look at section four, because that is the real one."',
      'SAY: Ask the thing that built it to help you break it.',
      'DO: If you have thirty seconds, run one attack live and let the denial land visibly.',
      'NOTE: Stop deliberately on section 4. That is a habit, not a trick, and it outlives this week.',
    ].join('\n'),
  },
  {
    segment: 'micro-build', eyebrow: '📝 BUILD THIS — graded', title: 'Ten minutes, and it is the artifact Thursday depends on',
    body: 'Last thing tonight, and it is the graded one. Your Week 6 deliverable is not a working server; it is a documented transport choice with a rationale you can defend. Open your own build plan, look at who will actually call your server and from where, and write it down before Thursday. Notice what this prompt REFUSES to do: it will not pick for you. It interviews you, records your answers, and produces a record with your reasoning in it — because a decision record written by the model is not a decision you can defend to a panel in Week 12.',
    bullets: [
      'Look at YOUR build plan: who calls it, from where, how many at once?',
      'Transport AND state model — two separate decisions',
      'Record the rationale, the option you rejected, and what would change your mind',
      'Ten minutes. It is graded, and Thursday builds on it.',
    ],
    code: {
      kind: 'paste',
      pasteWhere: 'Claude Code',
      ccMode: 'Plan Mode',
      label: 'Claude Code prompt — interview me, then write MY decision record',
      code: 'I need a transport decision record for the MCP server in my own project.\n\nDo NOT choose for me. First ask me these questions ONE AT A TIME and wait for my answers:\n1. Who calls this server, and from where?\n2. How many people or processes call it at the same time, realistically?\n3. Does it need to run on more than one machine, now or within a year?\n4. Does anything about it have to survive between requests?\n5. What is the worst thing that happens if it is unavailable for an hour?\n\nThen write docs/TRANSPORT_DECISION.md containing: my answers, the transport I chose, the state model I chose, my rationale in my own words, the option I rejected and why, and one line naming the condition that would make me revisit this.\n\nIf my answers are inconsistent with my choice, say so plainly instead of writing it up.',
      expectedResult: 'A short markdown decision record in YOUR project, written from YOUR answers, naming the option you rejected.',
      stopCondition: 'You could read the rationale aloud to a security reviewer without adding anything verbally.',
      rescue: 'If it starts writing before interviewing you, stop it and re-paste — the interview IS the exercise. A record you did not reason through is worth nothing on Thursday.',
    },
    diagram: `flowchart LR
  P["📋 Your build plan"] --> Q["❓ Five questions"]
  Q --> CH["⚖️ Transport +<br/>state model"]
  CH --> DOC["📄 TRANSPORT_DECISION.md"]
  DOC --> TH["🔨 Thursday"]`,
    script: [
      'SITUATION: Last slide of the build segment and the graded artifact. Close the night on the spine you opened with.',
      'ROOM: Plan Mode called out explicitly. Ten minutes on the clock, visible.',
      'MOOD: Land it. Slow down for the final three lines.',
      'OPEN: "Your Week 6 deliverable is not a working server. It is a transport decision you can defend."',
      'DO: Three students say their choice and ONE sentence of rationale out loud. Push back gently on anything that is really "whatever the tutorial used."',
      'SAY: Thursday you bring that decision, your Week 5 server, and the two prompts you did not run tonight. We wire all four upgrades in, and then we break two of them on purpose.',
      'SAY: It is 2 AM. Loud, or quiet?',
    ].join('\n'),
  },
];

/* ----------------------------------------------------------- storyBeats ---- */
const storyBeats = [
  {
    segment: 'checkin',
    icon: '🐉', tone: 'violet', eyebrow: 'Change of pace — the promise from night one',
    title: 'You were told about the dragon before you had written a single line',
    body: 'On the first night of this program we said something that probably sounded like theatre: every builder starts as an apprentice, and in Week 12 you face the dragon — a real system, live, defended in front of people who ask hard questions. Six weeks in, that has quietly stopped being a metaphor. Tonight your server stops being a thing you show and becomes a thing that runs.',
    punch: 'Nobody defends a demo in front of a panel. Tonight you start building the thing you will have to stand behind.',
  },
  {
    segment: 'business-problem',
    icon: '📟', tone: 'cherry', eyebrow: 'The person who is not there',
    title: 'The integration ran for four years. Then Marcus took a holiday.',
    body: 'A finance team had a nightly job moving invoice data between two systems. It had worked since before most of them joined, and exactly one engineer understood it — he had written it in a week and never needed to explain it. When it stopped one Tuesday, three people spent a full day reading code trying to work out what it was supposed to do, because the job produced no logs, no progress, and no errors it did not swallow. Marcus fixed it in twenty minutes on Thursday, from an airport.',
    punch: 'The failure was not that Marcus went away. It was that the system could not explain itself without him.',
  },
  {
    segment: 'architecture',
    icon: '🔑', tone: 'leaf', eyebrow: 'Change of pace — what sampling really is',
    title: 'The contractor who does excellent work and never gets a key to the building',
    body: 'Think about how a serious building handles contractors. The good ones do not get their own master key and alarm code. They get let in, watched while they work, and let out — not because anyone doubts their competence, but because the building owner keeps control of access no matter who is doing the work. Sampling is that arrangement written as a protocol. Your server does excellent work and never holds a credential.',
    punch: 'Every security review you will ever sit in comes down to one question: who holds the keys? Sampling has a very good answer.',
  },
  {
    segment: 'deconstruct',
    icon: '🤫', tone: 'berry', eyebrow: 'The 2 AM story',
    title: 'It answered every question correctly for eleven days. The answers were from a stale file.',
    body: 'A team wired an assistant to a pricing sheet through a tool that read the file from disk. Two weeks later somebody changed the export process and the file stopped refreshing. Nothing threw. Nothing paged. The tool kept opening the same file, the model kept summarising it confidently, and eleven days of quotes went out against prices that no longer existed. It was found by a customer, not a dashboard, and the fix took four minutes once anyone knew to look.',
    punch: 'A system that fails loudly costs you a night. A system that fails quietly costs you eleven days and a customer.',
  },
];

/* --------------------------------------------------------- interactions ---- */
const interactions = [
  {
    segment: 'checkin', kind: 'poll',
    q: 'Right now, before we touch anything — where is your Week 5 MCP server?',
    options: ['✅ Running, I can call a tool', '🗂️ I have the code but have not run it tonight', '🧩 It half works', '😬 I do not have one'],
    eyebrow: '🚦 Room check', title: 'Everyone needs a starting point before we upgrade anything',
    presenterTip: 'Purely operational. Read the counts out loud and send mentors to the last two groups IMMEDIATELY. Anyone without a Week 5 server pairs with a neighbour for tonight and rebuilds before Thursday — do not let somebody sit stuck for two hours.',
  },
  {
    segment: 'business-problem', kind: 'poll',
    q: 'It is 2 AM and your integration has been returning wrong answers for six hours. How do you find out?',
    options: ['A monitoring alert fires', 'A customer or colleague tells me', 'I would notice next time I looked at it', 'Honestly — I would not find out'],
    answer: 0,
    reveal: 'Most rooms are honest and pick the middle two, which is exactly the point. If the only detector is a human noticing, you do not have a system — you have a hope. Everything tonight moves you toward the first answer.',
    eyebrow: '🌙 The 2 AM question', title: 'Six hours of wrong answers. Who tells you?',
    presenterTip: 'Take the vote before revealing and read the spread out loud WITHOUT judgement — the honest answers are the useful ones. If a lot of people pick the last option, say so plainly. It earns you the entire notifications segment.',
  },
  {
    segment: 'architecture', kind: 'trivia',
    q: 'A server uses sampling to summarise a document. Whose API key pays for that call?',
    options: ['The server holds a key and pays for it', 'The client holds the key and pays for it', 'MCP provides a shared key', 'Sampling calls are free'],
    answer: 1,
    reveal: 'The client. That is the entire point — the server stays credential-free and model-agnostic, and the client keeps control of the model choice, the spend, and the approval gate.',
    eyebrow: '🧠 Quick check', title: 'Who pays for a sampling call?',
    presenterTip: 'FAST. Reveal, one line of why, move on. If someone argues a server holding its own key is simpler, agree that it is — then ask who signs off on that server going into their company. Reframes it in five seconds.',
  },
  {
    segment: 'architecture', kind: 'poll',
    theater: true,
    q: 'Your server will be called by forty colleagues across three offices, and it will run on more than one machine. Transport and state model?',
    options: ['STDIO, in-memory state', 'StreamableHTTP, stateful in memory', 'StreamableHTTP, stateless', 'Whichever the tutorial I followed used'],
    answer: 2,
    reveal: 'StreamableHTTP, stateless. STDIO cannot serve a second user at all, and in-memory state is what strands a request on the wrong replica. The fourth option is the honest answer for most people right now — and that is exactly why the written rationale is what gets graded.',
    eyebrow: '🔌 The real decision', title: 'You are the architect. Choose the transport.',
    presenterTip: 'MOVED EARLIER ON PURPOSE — this is the best moment of the night and it used to sit at minute 95, where it kept getting cut. Full-screen theater: lock the votes, show the spread, then reveal. Ask anyone who picked the last option to say it out loud without embarrassment; naming the default is the first step to replacing it.',
  },
  {
    segment: 'deconstruct', kind: 'poll',
    q: 'Your server works perfectly for one user. In production with three replicas it fails about two times in three with "no valid session ID". What do you check FIRST?',
    options: ['The load balancer configuration', 'Whether session state lives in one process memory', 'The client version', 'Network latency between replicas'],
    answer: 1,
    reveal: 'In-memory session state. The two-in-three failure rate is the tell — with three replicas, round-robin lands you on the wrong one about two thirds of the time. The load balancer is behaving perfectly; the assumption underneath it is the bug.',
    eyebrow: '🩺 Diagnose it', title: 'Intermittent, unreproducible, and two-in-three',
    presenterTip: 'Give them the failure RATE and let somebody in the room work out why two in three is meaningful. When they get there out loud, STOP and let them explain it — a peer landing this beats you landing it.',
  },
  {
    segment: 'micro-build', kind: 'poll',
    q: 'Did the progress ticks arrive in your Inspector?',
    options: ['✅ I can see them streaming', '🤔 The tool works but no ticks', '🔍 Inspector will not connect', '💥 Still fixing something else'],
    eyebrow: '🚦 Build check', title: 'Everybody sees a tick before we move on',
    presenterTip: 'Operational. Call the numbers out loud ("17 of 22 — five more"). For the "no ticks" group the answer is almost always that the client did not pass a token, which means their guard is working correctly — say that out loud so nobody starts deleting good code.',
  },
  {
    segment: 'challenge', kind: 'poll',
    q: 'Your own server, honestly: which of the four upgrades would change the most if you added it FIRST?',
    options: [
      '🔑 Sampling — I am holding a key I should not be holding',
      '📞 Notifications — nobody would know if it broke',
      '🚪 Roots — it can currently read more than it should',
      '📋 Transport — I inherited a choice I cannot defend',
    ],
    eyebrow: '🧭 Architecture challenge', title: 'Four upgrades. Which one is YOUR gap?',
    presenterTip: 'No wrong answer — a self-diagnosis on their own project. This is the segment that gets squeezed if you run long, which is fine by design. Read the spread, take two answers out loud, and connect each one back to the night-shift picture from the start of class.',
  },
  {
    segment: 'trivia', kind: 'trivia',
    q: 'A server checks the requested path starts with the allowed directory, then opens the file. Is that enough?',
    options: ['Yes, that is a containment check', 'No — dot-dot traversal and symlinks both slip past it', 'Yes, as long as the directory is absolute', 'Only on Windows'],
    answer: 1,
    reveal: 'No. A prefix check on the raw path is defeated by a dot-dot in the middle and by a symlink pointing outside. Resolve the real path first, THEN compare — the order of operations is the whole control.',
    eyebrow: '🚪 Knowledge check', title: 'Is a prefix check a control?',
    presenterTip: 'Close the night on this. Reveal, then have the room say "resolve first, compare second" back to you once. It returns in Week 10 as a policy enforcement point.',
  },
];

/* -------------------------------------------------------------- config ---- */
module.exports = {
  sessionId: '586c296b-9dc9-44a5-a96c-54c354e72de1',
  config: {
    storyBeats: { enabled: true, max: null, overrides: storyBeats },
    theaterEnabled: true,
    buildBayDetail: true,
    checkpointsEnabled: true,
    evidenceOverrides: null,
    teach: { enabled: true, max: null, overrides: teach },
    prompts: { enabled: true, max: null, overrides: null },
    interactions: { enabled: true, max: null, overrides: interactions },
    opening: {
      coldOpen: {
        enabled: true,
        override: {
          title: 'By Thursday, this will exist',
          body: 'Your Week 5 server, upgraded to work the night shift: it reports while it runs, streams a traceable log, refuses to leave its own directory, and carries a written transport decision you can defend to a panel.',
        },
      },
      hook: {
        enabled: true,
        override: {
          headline: 'Tonight the thing you built stops working while you watch, and starts working while you sleep.',
          caption: 'Which makes only one question matter: it is 2 AM, it is going wrong — does it fail loudly, or quietly?',
        },
      },
      resultPreview: { enabled: true, override: null },
    },
  },
};
