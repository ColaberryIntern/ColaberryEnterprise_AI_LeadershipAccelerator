/**
 * week9.ts — the complete authored content pack for WEEK 9,
 * "Reliability Engineering + Quality Layer" (Intensive 3 · Connect AI To The
 * Real World). Public title: "I Broke Our AI System on Purpose."
 *
 * Week 9 CLOSES ACT III. The arc beat is: you break it on purpose, because a
 * system that never failed is untested. Three call-backs are deliberate and
 * load-bearing:
 *   • Week 3 Thursday already ran a small Build → Break → Harden drill on three
 *     faults. Week 9 is the SYSTEMATIC version of that same instinct — every
 *     external boundary, enumerated, with a named response per failure mode.
 *     Monday says so out loud rather than repeating the Week 3 exercise.
 *   • The 2 AM question, Week 9 edition: "it retried four hundred times — who
 *     pays for that?" That lands only because Week 3 taught token-cost literacy,
 *     so the retry-storm slide does the arithmetic in the same units.
 *   • The Orientation dragon promise and the trust ladder both get named: the
 *     room moves from "it coordinates agents on a schedule" (weeks 7–8) to
 *     "it handles its own failures" (week 9), one rung below Act IV governance.
 *
 * Emotional core: a demo that has never failed is a demo nobody has tested.
 * Idempotency carries its own slide on both days, because "it worked once but
 * breaks on the second run" is a production defect with a business consequence
 * an executive audience feels immediately — a customer charged twice.
 *
 * Authoring rules honoured here: every teach slide carries a ≤7-node mermaid
 * diagram with short quoted labels; every code block is a Claude Code PROMPT
 * (kind 'paste') or code the room READS together (kind 'review'), never code to
 * type; shell commands are explicitly marked for the terminal; model IDs and
 * API shapes are current (claude-opus-5 / claude-sonnet-5 / claude-haiku-4-5,
 * output_config + json_schema); every slide has an instructor script; and the
 * whole night hardens the student's OWN capstone, not a demo.
 *
 * Pure data — the only import is a type.
 */
import type { WeekPack } from '../weekPack';

export const WEEK9_PACK: WeekPack = {
  week: 9,
  arcBeat:
    'You break it on purpose, because a system that never failed is untested — Act III closes with a system that survives contact with reality.',

  /* ======================================================================== */
  /*  MONDAY — Architecture Day                                               */
  /* ======================================================================== */
  monday: {
    hook: {
      headline: 'A demo that has never failed is a demo nobody has tested.',
      caption: 'Tonight you stop admiring the happy path and start designing the other one.',
    },

    teach: [
      /* ========================= check-in ================================= */
      {
        segment: 'checkin', eyebrow: '🏁 Act III ends here', title: 'Nine weeks ago you approved every keystroke. Tonight your system handles its own failures.',
        body: 'Look at how far the reins have loosened. In Weeks 1 and 2 you approved every single action. By Week 3 something of yours ran a bounded task unattended. Weeks 5 and 6 gave it hands into real systems. Weeks 7 and 8 turned one assistant into a coordinated team running on a schedule. That is the rung you are standing on right now — and every rung so far assumed the world behaved. Tonight is the rung where it does not, and your system deals with it anyway.',
        bullets: [
          'W1–2 — you approve every action',
          'W3–4 — it runs a bounded task unattended',
          'W5–6 — it reaches real systems',
          'W7–8 — it coordinates agents on a schedule',
          'W9 — it handles its own failures. That is tonight.',
        ],
        diagram: `flowchart LR
  A["W1-2<br/>you approve<br/>everything"] --> B["W3-4<br/>runs unattended"]
  B --> C["W5-6<br/>touches real<br/>systems"]
  C --> D["W7-8<br/>coordinates<br/>on a schedule"]
  D --> E["W9 — handles<br/>its own failures"]
  E -.-> F["W10-12<br/>acts under policy"]`,
        script: 'Walk the ladder left to right with your hand and let them feel the distance from Week 1. Then name the boundary out loud: "this is the last week of Intensive 3. Thursday your system survives contact with reality, and then Act IV asks who answers for it." Keep the Orientation promise alive — the dragon in Week 12 is a real system, live, defended, and a system that has never failed is not defensible.',
      },
      {
        segment: 'checkin', eyebrow: '🎯 Pick it now', title: 'Find the one call in your project you would hate to explain twice',
        body: 'Everything tonight points at one specific line in your own build. Open your project and find the external call with the highest blast radius — the one that touches money, identity, a customer inbox, or anything a person would notice happening twice. Write it down. Every primitive we teach in the next ninety minutes gets wrapped around that exact call on Thursday, and the assignment is that call, hardened, with a test that proves it.',
        bullets: [
          'Open your own build plan — not a demo, not a tutorial',
          'Find the call that touches money, identity, or a human being',
          'Write it on a sticky note. That is tonight’s target.',
          'No external side effect in your project? Pair with someone who has one',
        ],
        diagram: `flowchart TD
  P["📋 Your build plan"] --> S["🔎 Scan for<br/>external calls"]
  S --> M["💳 Touches money?"]
  S --> I["👤 Touches identity?"]
  S --> N["📨 A human would<br/>notice it twice?"]
  M --> T["🎯 Tonight's target"]
  I --> T
  N --> T`,
        script: 'Make them actually do it — sixty seconds of silence while people scroll their own plan. Then take three out loud. Naming a real call up front is what stops tonight from turning into an abstract lecture about reliability patterns.',
      },

      /* ===================== business problem ============================= */
      {
        segment: 'business-problem', eyebrow: '🎭 The uncomfortable truth', title: 'Your demo has a perfect record because it has never been tested',
        body: 'Every system you have built this cohort passed its demo, and a demo is a very specific set of conditions: the happy path, every dependency awake, one request at a time, and you watching. Production is the exact inverse. The model call times out, the CRM returns a 500, the webhook arrives twice, two requests hit the same row in the same second. A green demo is evidence that a happy path exists. It is not evidence of anything else, and the industry has spent decades confusing the two.',
        bullets: [
          'Demo = happy path · deps up · one at a time · you watching',
          'Production = timeouts · 5xx · duplicates · concurrency',
          'A perfect demo record means nobody has tried to break it',
          'Reliability is engineered on purpose. It is never inherited.',
        ],
        diagram: `flowchart LR
  D["🎬 The demo<br/>happy path only"] --> G["✅ It worked!"]
  P["🏭 Production"] --> T["⏱️ Timeouts"]
  P --> F["💥 5xx errors"]
  P --> DUP["👯 Duplicates"]
  P --> C["🔀 Concurrency"]`,
        script: 'Ask the room directly: "how many of you have ever run your project twice in a row against a dependency that was deliberately failing?" Almost no hands go up. That silence IS the thesis of the week — do not rush past it, let it sit for a beat before you move on.',
      },
      {
        segment: 'business-problem', eyebrow: '🌙 The 2 AM question', title: 'It is 2 AM and it retried four hundred times. Who pays for that?',
        body: 'The 2 AM question has followed you since Week 3, and tonight it comes back with an invoice attached. Picture your Week 8 scheduled job firing at 2 AM. The upstream is having a bad night and returns a 500. Your code retries. It retries again. There is no cap, so it retries in a tight loop for six hours, and every single one of those attempts is a real model call with real input tokens on the meter. Nobody is awake. Nothing crashes. Nothing pages anyone. In the morning there is no error to find — just a bill and an upstream you helped push over.',
        bullets: [
          'W3: is anything happening at 2 AM at all?',
          'W6: is the integration failing loudly or quietly?',
          'W9: it retried four hundred times — who pays?',
          '400 attempts × ~2,000 input tokens is a real number, on a real card',
          'And the upstream you hammered was already struggling',
        ],
        evidence: [
          {
            claim: 'Per-million-token rates: Opus 5 $5 in / $25 out, Sonnet 5 $3 in / $15 out, Haiku 4.5 $1 in / $5 out',
            publisher: 'Anthropic', sourceTitle: 'Claude API pricing (platform.claude.com/docs/en/pricing)',
            publicationDate: '2026', sourceType: 'official-doc',
            note: 'Rates move — open the live pricing page in class rather than reading these off the slide. The teaching point is the multiplication, not the constant.',
          },
        ],
        diagram: `flowchart LR
  J["⏰ 2 AM job fires"] --> U["💥 Upstream 500s"]
  U --> R["🔁 Retry<br/>no cap"]
  R --> R
  R --> B["💵 400 calls<br/>on the meter"]
  R --> H["🏚️ Upstream<br/>pushed over"]
  B --> M["😐 No error<br/>in the morning"]`,
        script: 'Do the arithmetic live in the same units as Week 3 — attempts × input tokens × the per-million rate — and open the live pricing page rather than trusting the slide. Then land the second cost, which people always miss: the retry storm did not just spend your money, it made the upstream’s recovery slower. You were part of the outage.',
      },
      {
        segment: 'business-problem', eyebrow: '💳 The consequence', title: 'One network blip. Two charges on one customer’s card.',
        body: 'Here is the version that reaches a boardroom. Your agent charges a customer, then writes the receipt row. The charge succeeds. The receipt write times out because a connection dropped. Your code throws, a perfectly ordinary retry re-runs the whole handler, and the customer is charged a second time. Nothing was written badly. Nobody was careless. The network did the completely normal thing networks do, and a real person now has two charges and a reason to never trust you again.',
        bullets: [
          'charge() succeeded · receipt write threw · retry re-ran everything',
          'Same shape duplicates emails, tickets, calendar invites, payouts',
          'The bug is not the network. The network will always blip.',
          'The bug is that the operation was not safe to run twice.',
        ],
        diagram: `flowchart LR
  A["1️⃣ charge() ✅"] --> B["2️⃣ write receipt<br/>💥 connection drop"]
  B --> C["3️⃣ handler throws"]
  C --> D["4️⃣ retry re-runs<br/>the WHOLE handler"]
  D --> E["5️⃣ charge() ✅ again"]
  E --> F["😱 Two charges,<br/>one customer"]`,
        script: 'Walk the five steps on the board slowly, one finger per box. Ask the room to tell you which step is the bug before you say it. Most people point at step two; the bug is step four wrapping a side effect that had already fired. Then say the line the whole week hangs on: a script that works once but breaks on the second run is not fragile, it is broken.',
      },
      {
        segment: 'business-problem', eyebrow: '🧭 The method', title: 'Design the failure path before the happy path',
        body: 'Failure-first design flips the order engineers naturally work in. Before you write the call, you answer four questions in writing — in a comment, in the directive, anywhere a human will find them. What happens if this fails. Will it retry, and with what strategy. What is the recovery path when the retries are exhausted. And, the one everybody skips, which failure modes does this code explicitly NOT handle. Every external boundary gets those four answers. The reliability layer you build Thursday is nothing more than those answers made executable.',
        bullets: [
          '1️⃣ What happens if this fails?',
          '2️⃣ Will it retry — capped how, backing off how?',
          '3️⃣ Recovery when retries are exhausted: fallback, dead-letter, escalate?',
          '4️⃣ Which failure modes are explicitly NOT handled?',
          'Written down. Unwritten answers are not answers.',
        ],
        diagram: `flowchart TD
  Q["🧭 Before you<br/>write the call"] --> A["1️⃣ What if<br/>it fails?"]
  Q --> B["2️⃣ Retry —<br/>cap + backoff?"]
  Q --> C["3️⃣ Recovery when<br/>retries run out?"]
  Q --> D["4️⃣ What is NOT<br/>handled?"]
  A --> CODE["⌨️ Now write<br/>the code"]
  B --> CODE
  C --> CODE`,
        script: 'Put the four questions on screen and leave them up for the rest of Monday — every architecture slide after this answers one of them. Say the rule for Thursday plainly: code that cannot answer these four does not ship. Question four is the one to defend; naming what you have NOT handled is honesty, not weakness, and it is what stops a system from pretending to be bulletproof.',
      },

      /* ======================== architecture ============================== */
      {
        segment: 'architecture', eyebrow: '🧅 The layer', title: 'Seven small primitives, wrapped around every external boundary',
        body: 'The reliability layer is not one big clever thing. It is seven small, boring, composable primitives, each answering one specific failure. A timeout bounds how long you wait. A capped retry survives a transient blip. A circuit breaker stops you hammering something that is already down. A fallback gives a degraded-but-correct answer. A dead-letter store parks what you could not process so it is never silently lost. Idempotency makes a replay harmless. And the quality gate makes AI output measured instead of assumed. They compose. They are not alternatives to each other.',
        bullets: [
          '⏱️ Timeout — bound the wait',
          '🔁 Retry + backoff — survive the transient blip',
          '🔌 Breaker — stop hammering a dead upstream',
          '🪂 Fallback + dead-letter — degrade, never lose',
          '♻️ Idempotency — safe to re-run',
          '🚦 Quality gate — block bad output before it ships',
        ],
        diagram: `flowchart LR
  Y["🏠 Your system"] --> G["🚦 Quality gate"]
  G --> I["♻️ Idempotency"]
  I --> BR["🔌 Breaker"]
  BR --> RT["🔁 Retry"]
  RT --> TO["⏱️ Timeout"]
  TO --> UP["🌍 The upstream"]`,
        script: 'Draw the boundary as a literal wall between their system and the outside world, and put each primitive on it as a checkpoint. Emphasise the word compose — students routinely think a breaker replaces retries. It does not. Each one answers a different question, and Thursday you assemble all seven around one real call.',
      },
      {
        segment: 'architecture', eyebrow: '🗺️ Enumerate first', title: 'Every boundary gets a failure table — and you write it before the code',
        body: 'You cannot harden what you have not listed. For every external boundary, write the concrete ways it fails and the response to each one. A model call can time out, return a 429, return a 500, hang forever, or — the sneaky one — return a perfectly successful response with the wrong shape. A database write can violate a unique constraint on retry or drop the connection mid-transaction. A webhook can arrive twice, out of order, or malformed. The enumeration IS the design. The code is just the enumeration made executable.',
        bullets: [
          'Model call: timeout · 429 · 5xx · hang · success with the wrong shape',
          'Database: constraint violation on retry · connection drop mid-transaction',
          'Webhook: duplicate · out of order · malformed payload',
          'Note the retryable column — a 400 is your bug, retrying it is pointless',
        ],
        code: {
          kind: 'review',
          label: 'A failure table — read it together, then write your own on Thursday',
          code: '// BOUNDARY: the Claude API call in my triage assistant\n//\n// | failure mode           | how I detect it        | my response                  | retry? |\n// |------------------------|------------------------|------------------------------|--------|\n// | timeout (> 8s)         | AbortController fires  | TimeoutError -> retry        | yes    |\n// | 429 rate limited       | status === 429         | back off, honour Retry-After | yes    |\n// | 5xx upstream           | status >= 500          | retry up to the cap          | yes    |\n// | 400 bad request        | status === 400         | fail fast, do NOT retry      | no     |\n// | 200 but wrong shape    | schema validation fails| ContractViolation -> gate    | no     |\n//\n// EXPLICITLY NOT HANDLED (question 4): partial-write recovery. That is the\n// caller\'s job, via the idempotency wrapper — documented here on purpose.',
          expectedResult: 'Four columns and an explicit "not handled" line. The last line is the one people skip and the one that makes this honest.',
        },
        diagram: `flowchart LR
  B["🌍 One boundary"] --> L["📝 List the<br/>failure modes"]
  L --> D["🔎 How do I<br/>detect each?"]
  D --> R["🛠️ What do I<br/>do about it?"]
  R --> RT["🔁 Retryable<br/>yes / no"]
  RT --> NH["🚫 And what I do<br/>NOT handle"]`,
        script: 'Read the table across, one row at a time, and stop hard on the last two rows. "200 with the wrong shape" is the failure nobody predicts and the one the quality gate exists for. Then read the NOT HANDLED line aloud and tell them that sentence is what a senior engineer looks for in a review.',
      },
      {
        segment: 'architecture', eyebrow: '⏱️ Primitive 1', title: 'An unbounded wait is an outage that has not finished happening yet',
        body: 'The default behaviour of most HTTP clients is to wait essentially forever, and a call that hangs forever holds a worker, a connection, and a queue slot with it. One hung call is a curiosity; two hundred hung calls is your whole system unavailable while every dependency looks green. So every outbound call gets an explicit deadline — typically five to thirty seconds — and when the deadline passes you abort the underlying request rather than merely stopping caring about it. The error you raise has a name, TimeoutError, because everything downstream will make decisions on that name.',
        bullets: [
          'Every outbound call gets an explicit timeout. No exceptions.',
          'Typical range 5–30s; pick it deliberately, per boundary',
          'Abort the request, do not just stop waiting for it',
          'Raise a NAMED error — retry and logging both key on the name',
        ],
        diagram: `flowchart LR
  C["📤 Your call"] --> RACE{"🏁 Which wins?"}
  RACE -->|"response first"| OK["✅ Result"]
  RACE -->|"timer first"| AB["🛑 Abort the<br/>request"]
  AB --> E["🏷️ TimeoutError<br/>a NAMED class"]
  E --> DEC["🔁 Retry decides<br/>on the name"]`,
        script: 'Ask what the default timeout is on the HTTP client in their language. Most people do not know, which is exactly the point — a limit you did not choose is a limit you cannot defend. Then stress the naming: "TimeoutError" is not decoration, it is the input to every decision the next three slides make.',
      },
      {
        segment: 'architecture', eyebrow: '🔁 Primitive 2', title: 'Cap the attempts, grow the wait, and scatter it — or you become the outage',
        body: 'Retrying is right for a transient blip and catastrophic for anything else. Three rules make it safe. Cap the attempts — three to five, structurally, not by hope. Back off exponentially so each wait roughly doubles, up to a ceiling, giving a struggling upstream room to breathe. And add jitter, a random spread on each wait, so a thousand clients do not all retry on the same tick and hit the recovering service with a thundering herd. Then the rule that saves the most money: only retry what is transient. A 400 means your request was wrong, and retrying a wrong request four times is just being wrong four times more expensively.',
        bullets: [
          'Attempts capped at 3–5 — structural, never "it usually stops"',
          'Exponential backoff: 250ms · 500ms · 1s · 2s, capped',
          'Full jitter: randomise each wait so retries do not synchronise',
          'Retry ONLY transient classes: timeout, 429, 5xx',
          'Never retry a 4xx — that is your bug, not their outage',
        ],
        diagram: `flowchart LR
  F["💥 Call failed"] --> CL{"🏷️ Which<br/>error class?"}
  CL -->|"4xx"| STOP["🛑 Fail fast<br/>no retry"]
  CL -->|"timeout / 429 / 5xx"| N{"🔢 Attempts<br/>left?"}
  N -->|"no"| EX["🪂 Exhausted —<br/>fallback / DLQ"]
  N -->|"yes"| W["⏳ Backoff<br/>+ jitter"]
  W --> F`,
        script: 'Draw two curves on the board: everyone retrying in lockstep produces sharp spikes, jittered retries produce a smooth line. The spike is what kills a database that was just starting to recover. Say it plainly — jitter is not politeness, it is load protection. Then connect back to the 2 AM slide: the cap is the line of code that decides whether that story costs you four hundred calls or four.',
      },
      {
        segment: 'architecture', eyebrow: '🔌 Primitive 3', title: 'When the upstream is genuinely dead, the kindest thing you can do is stop calling it',
        body: 'Retries fix a blip. They make a real outage worse, because every retry adds load to a service that already cannot answer, and now recovery takes longer for everyone. The circuit breaker is a three-state machine that notices. Closed: calls flow normally and it counts consecutive failures. After N failures it trips Open: every call fails instantly with a clear CircuitOpen error and never touches the upstream at all. After a cooldown it goes Half-open and allows exactly one trial call — success closes the circuit, failure re-opens it. The breaker converts a slow cascading failure into a fast, obvious, contained one.',
        bullets: [
          'Closed — calls flow, count consecutive failures',
          'Open — fail fast for the cooldown, never touch the upstream',
          'Half-open — one trial call decides the next state',
          'Your system stays responsive instead of blocking on a corpse',
          'Failing instantly is the feature, not the bug',
        ],
        diagram: `flowchart LR
  CL["🟢 CLOSED<br/>calls flow"] -->|"N failures<br/>in a row"| OP["🔴 OPEN<br/>fail fast"]
  OP -->|"cooldown<br/>elapsed"| HO["🟡 HALF-OPEN<br/>one trial call"]
  HO -->|"trial succeeds"| CL
  HO -->|"trial fails"| OP`,
        script: 'Trace the three boxes with a marker as if the marker is the request. Then ask the room the question that makes it obvious: "what is the single worst thing you can do to a database sitting at 100% CPU?" Someone always says "send it more traffic." Exactly — the breaker is how you stop yourself from doing that automatically.',
      },
      {
        segment: 'architecture', eyebrow: '🪂 Primitive 4', title: 'Degrade if you can, park it if you cannot, lose it never',
        body: 'The retries are exhausted and the breaker is open. Now what? Two answers, in order. If a degraded-but-correct path exists — a cached answer, a cheaper model, a queued follow-up, a plain "we will email you shortly" — take it deliberately. If nothing works, the job does not evaporate: it goes to a dead-letter store with the full payload, the error class, and the correlation ID, so a human can triage it on Monday morning and replay it. Ask yourself where a failed job goes in your project today. For most people the honest answer is "nowhere" — it throws, and it is gone.',
        bullets: [
          'Fallback first: cached, cheaper, queued, or an honest holding reply',
          'A fallback must be CORRECT, not just quiet',
          'Dead-letter second: payload + error class + correlation ID',
          'Exhausted retries and no dead-letter equals work silently lost',
          'A dead-letter row is a job you can replay. Nowhere is not.',
        ],
        diagram: `flowchart LR
  X["💥 Retries<br/>exhausted"] --> FB{"🪂 Is there a<br/>degraded path?"}
  FB -->|"yes"| D["✅ Degraded but<br/>CORRECT answer"]
  FB -->|"no"| DL["📦 Dead-letter:<br/>payload + class + id"]
  DL --> T["🧑 Human triage<br/>Monday morning"]
  T --> RP["🔁 Replay it"]`,
        script: 'Ask the room directly where a failed job goes in their current project and wait through the awkward pause. The honest answer is almost always nowhere. Then say the reframe: the dead-letter table is where "nowhere" becomes a row you can look at, count, and replay. That is the difference between losing work and deferring it.',
      },
      {
        segment: 'architecture', eyebrow: '♻️ Primitive 5 — the one to remember', title: 'The key comes from the EVENT, not from the attempt',
        body: 'Idempotency means running an operation twice with the same input leaves the same end state as running it once: no second charge, no duplicate row, no second email. It is the property that makes retries and duplicate webhooks harmless instead of expensive. You get it with an idempotency key derived deterministically from the business event — for a charge, a hash of the customer plus the order — recorded before the side effect fires. And here is the mistake almost everyone makes on their first attempt: they generate a fresh UUID inside the retry, so every attempt has a different key, nothing ever matches, and the whole mechanism does precisely nothing while looking completely correct.',
        bullets: [
          '✅ key = hash(event type + entity id + actor) — same every attempt',
          '❌ key = randomUUID() inside the retry — a new key every time, dedupes nothing',
          'Claim the key BEFORE the side effect fires, not after',
          'A replay finds the key and returns the STORED result',
          'Backstop it at the database: unique constraint + ON CONFLICT DO NOTHING',
        ],
        diagram: `flowchart LR
  E["📨 Business event"] --> K["🔑 key = hash of<br/>event, not attempt"]
  K --> C{"🗄️ Key already<br/>recorded?"}
  C -->|"no"| RUN["⚡ Run it once,<br/>store the result"]
  C -->|"yes, done"| REP["📄 Return the<br/>stored result"]
  C -->|"yes, in flight"| REJ["🚫 Reject the<br/>duplicate"]`,
        script: 'This is the slide people quote back to you in Week 12 — slow all the way down. Have every student say the key expression for their own most dangerous side effect out loud to a neighbour. The test is one sentence: if two different attempts at the SAME business event could produce two different keys, it is wrong. Then say the standard once, flatly — a script that works once but breaks on the second run is a production defect, not a quirk.',
      },

      /* ========================= deconstruct ============================== */
      {
        segment: 'deconstruct', eyebrow: '🔗 Callback to Week 3', title: 'You already did this once, by hand, on three faults. Tonight it becomes a method.',
        body: 'On Week 3 Build Day you broke your assistant on purpose three ways — a leaked key, an uncapped loop, and a vaguer prompt — and you noticed that none of them threw an error. That was the instinct. Tonight is the discipline: instead of three faults you happened to think of, you enumerate every failure mode of every external boundary and give each one a named response. Same loop, Build then Break then Harden. What changes is that the break list stops being a good idea somebody had and becomes a table you can hand to a reviewer.',
        bullets: [
          'Week 3: three faults, chosen by us, on a small script',
          'Week 9: every boundary, enumerated by you, on your real system',
          'Same loop — BUILD, then BREAK, then HARDEN, in that order',
          'The break list goes in the PR description. That is the new part.',
        ],
        diagram: `flowchart LR
  W3["🔨 Week 3<br/>3 faults, by hand"] --> W9["🗺️ Week 9<br/>every boundary,<br/>enumerated"]
  W9 --> B["🔨 BUILD"]
  B --> K["💥 BREAK<br/>on purpose"]
  K --> H["🛡️ HARDEN<br/>one fix per break"]
  H --> PR["📋 Break list<br/>in the PR"]`,
        script: 'Explicitly remind them of the Week 3 night — most will remember the hardcoded key exercise vividly. Then draw the distinction that earns tonight its place: three faults you thought of is luck, and a table per boundary is engineering. Do NOT re-run the Week 3 drill; this is the grown-up version of the same instinct.',
      },
      {
        segment: 'deconstruct', eyebrow: '🔬 Line by line', title: 'The double charge, and the four lines that make it impossible',
        body: 'Read these two versions side by side. In the first, the retry boundary wraps a side effect that has already fired, so a failure after the charge means the charge happens again. In the second, the operation claims an idempotency key derived from the business event before anything happens; a replay finds the key already claimed and returns the stored result instead of re-running. Four lines of difference. Notice that the fix is not cleverness — it is putting the guard above the side effect instead of around it.',
        bullets: [
          'BUG: retry wraps a side effect with no record that it already fired',
          'FIX: claim the key first; the charge is inside the guarded block',
          'The replay path returns a stored result — it does not re-execute',
          'Same input, same end state, exactly one side effect. That is the definition.',
        ],
        code: {
          kind: 'review',
          label: 'The bug and the fix — read together, nobody pastes',
          code: '// 🐛 BUG — the retry re-runs a side effect that already succeeded\nasync function handleOrder(order) {\n  await paymentApi.charge(order);    // fires AGAIN on every retry\n  await db.insertReceipt(order);     // this throw is what triggers the retry\n}\n\n// ✅ FIX — claim the key first; the charge fires exactly once\nasync function handleOrder(order) {\n  const key = idempotencyKey({\n    type: "charge",\n    entityId: order.id,\n    actor: order.customerId,\n  });                                            // same event -> same key, always\n  return runOnce(key, async () => {             // claim, then guard both effects\n    await paymentApi.charge(order);\n    await db.insertReceipt(order);\n  });\n}',
          expectedResult: 'Put your finger on one thing: in the FIX, both side effects live INSIDE the guarded block, and the key is computed from the order — never from the attempt.',
        },
        diagram: `flowchart LR
  BUG["🐛 retry wraps<br/>the side effect"] --> TWO["💳 Two charges"]
  FIX["✅ key claimed<br/>above the effect"] --> ONE["💳 One charge"]
  R["🔁 Replay"] --> FIX
  FIX --> ST["📄 Stored result<br/>returned"]`,
        script: 'Show the BUG version alone first and ask the room to find the double charge before you reveal the FIX. Someone will point at the receipt write; gently redirect to the retry boundary. This is the exact bug they reproduce live on Thursday and then kill with a passing test, so tell them that now — it makes Thursday feel like a promise rather than an exercise.',
      },
      {
        segment: 'deconstruct', eyebrow: '🚦 Reliability is not quality', title: 'A perfectly reliable pipeline will happily ship a confidently wrong answer',
        body: 'Everything so far keeps the pipe alive. None of it has any opinion about what flows through it. A system with timeouts, retries, a breaker, and idempotency can deliver a beautifully reliable, thoroughly wrong answer to a customer, on time, every time. So the last layer treats AI output the way you already treat a form field: as untrusted input that gets validated before anyone acts on it. Score the output against a rubric, and if it falls below your threshold it does not ship — it is rejected with reasons, logged, and either regenerated or handed to a person.',
        bullets: [
          'Cheap deterministic checks FIRST: valid JSON, schema match, citation present, length',
          'Only then the expensive check: an LLM judge for grounding and relevance',
          'Below threshold: reject with named reasons, log the score, never ship',
          'The threshold is a dial you can defend — and move, with evidence',
          'Cheap-before-expensive is correctness AND cost discipline',
        ],
        diagram: `flowchart LR
  O["🤖 AI output"] --> C1["🧪 Valid JSON?<br/>Schema match?"]
  C1 -->|"fail"| BLK["🚫 Blocked<br/>+ reasons logged"]
  C1 -->|"pass"| C2["⚖️ LLM judge:<br/>grounded? relevant?"]
  C2 -->|"below threshold"| BLK
  C2 -->|"at or above"| SHIP["✅ Ships"]`,
        script: 'Frame it with something they already do: you would never write a form field straight to your database without validating it. AI output is a form field the model filled in. Then make the cost point — running the expensive judge on output that is not even valid JSON is paying to grade a blank page.',
      },
      {
        segment: 'deconstruct', eyebrow: '🚫 Not style nits', title: 'Three patterns that are production defects, and I will grep your PR for all three',
        body: 'These three show up in nearly every un-hardened codebase and each one is a defect, not a preference. The empty catch swallows an error silently — the operation failed, nobody knows, and the root cause is gone forever. The unbounded retry loops against a failing upstream until it becomes the outage. The unkeyed write duplicates its side effect on any replay. On Thursday each one is replaced by its hardened form: classify-and-log, capped-backoff, and an idempotency key. If a contract can change silently without a test failing, the contract is too weak.',
        bullets: [
          '🕳️ catch (e) {} → silent failure. Classify, log, then handle.',
          '♾️ while (true) retry → you are now the outage. Cap it.',
          '👯 insert with no key or constraint → duplicates on replay. Key it.',
          'All three block Definition of Done. None of them are opinions.',
        ],
        code: {
          kind: 'review',
          label: 'The three defects, named — read them out loud',
          code: '// 1. SILENT SWALLOW — the operation failed and the root cause is gone\ntry { await risky(); } catch (e) {}\n\n// 2. UNBOUNDED RETRY — this does not stop, and at 2 AM nobody notices\nwhile (true) { try { return await call(); } catch { /* try again */ } }\n\n// 3. UNKEYED WRITE — no idempotency key, no unique constraint, duplicates on replay\nawait db.insert({ customerId, orderId, amount });\n\n// The hardened forms, in the same order:\n//   1. catch (e) { log.error({ error_class: classify(e), correlation_id }); throw e; }\n//   2. withRetry(fn, { attempts: 4, baseMs: 250, capMs: 4000 })\n//   3. runOnce(idempotencyKey(evt), () => db.insert({ ... }))  + a UNIQUE constraint',
          expectedResult: 'Three defects and their three replacements. If any of the top three appear in your Thursday work, it is not done.',
        },
        diagram: `flowchart LR
  D1["🕳️ Empty catch"] --> H1["🏷️ classify + log<br/>then rethrow"]
  D2["♾️ Unbounded retry"] --> H2["🛑 Capped backoff"]
  D3["👯 Unkeyed write"] --> H3["🔑 runOnce + a<br/>unique constraint"]`,
        script: 'Read each defect line aloud and ask what breaks before revealing the fix. Then set the Thursday bar explicitly: "these are the three things I will search your code for on Build Day, and any of them present means not done." Saying it now makes Thursday’s review feel fair rather than punitive.',
      },

      /* ========================= micro-build ============================== */
      {
        segment: 'micro-build', eyebrow: '1️⃣ Your boundary', title: 'Write the failure table for the call you picked at the start of class',
        body: 'Time to make it yours. Take the call you wrote down in the first ten minutes and have Claude Code help you enumerate its failure modes — not generically, but for that specific call, in your specific project. You are the one who knows the business consequence of each failure; Claude is the one who knows the shapes an HTTP client throws. That division of labour is the whole method. The table you produce here is the spec for everything you build on Thursday.',
        bullets: [
          'Point it at YOUR call, in YOUR repo — not a generic example',
          'Every row needs: how you detect it, what you do, retryable yes or no',
          'Force the fourth question: what are you explicitly NOT handling?',
          'You confirm the business consequences. Do not let it guess those.',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          ccMode: 'Plan Mode',
          label: 'Claude Code prompt — enumerate the failure modes of my real call',
          code: 'Find the external call in this project at [FILE / FUNCTION NAME — the one I picked].\n\nIn Plan Mode, do NOT change any code. Instead produce a failure-mode table for that specific call as a comment block, with these columns: failure mode, how I detect it in code, my response, and retryable (yes/no).\n\nCover at minimum: timeout, rate limit (429), upstream 5xx, client error (4xx), a hung connection, and a successful response whose shape does not match what my code expects.\n\nFor each row, ask ME what the business consequence is if that failure is handled badly — do not invent the consequence yourself.\n\nEnd the table with a line beginning "EXPLICITLY NOT HANDLED:" listing the failure modes this code will deliberately not cover, and why that is acceptable.\n\nShow me the table and wait. Do not edit anything.',
          expectedResult: 'A commented table with six or more rows, and a NOT HANDLED line you personally agree with.',
          stopCondition: 'You can read your table aloud and every row has a response, not just a description.',
          rescue: 'It wrote generic rows about "the API"? Tell it to open the actual file and quote the actual call — a table that could apply to any project is not your table.',
        },
        diagram: `flowchart LR
  ME["👤 You: the business<br/>consequences"] --> T["📋 The failure table"]
  CC["💻 Claude Code: the<br/>error shapes"] --> T
  T --> NH["🚫 EXPLICITLY<br/>NOT HANDLED"]
  T --> TH["🔨 Thursday's spec"]`,
        script: 'Give this a genuine five minutes of silence — it is the highest-value five minutes of the night. Walk the room and check that people pointed it at a real file. Then read two tables aloud; the difference between a specific table and a generic one is instantly obvious to the room and teaches the lesson better than you can.',
      },
      {
        segment: 'micro-build', eyebrow: '2️⃣ Two small files', title: 'classify() and withTimeout() — the two pieces everything else keys on',
        body: 'Build the foundation of the layer. classify turns any thrown thing into a stable error-class string, because retry decisions, breaker decisions, and dashboards all key on that string and never on a fragile message match. withTimeout races the call against a deadline and aborts the underlying request when the deadline wins. Two small files, maybe sixty lines together, and every other primitive this week stands on them. Note the deliberate detail in the prompt: if classify ever returns UnknownError in production, that is a to-do, not an outcome.',
        bullets: [
          'classify(err) → a stable string: TimeoutError, RateLimitError, UpstreamUnavailable, ClientError',
          'Generic "Error" is not an acceptable class in a production path',
          'withTimeout aborts the request — it does not just stop waiting',
          'UnknownError in your logs means you are missing a specific catch',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — the two foundation primitives',
          code: 'Create a reliability module in this project with two files. Match the language and conventions already used here.\n\n1. classify.ts (or .py to match my project): a single classify(err) function that maps any thrown value to a STABLE error-class string. Handle at minimum: my own TimeoutError, HTTP 429 -> "RateLimitError", HTTP >= 500 -> "UpstreamUnavailable", HTTP 4xx -> "ClientError", socket errors like ECONNRESET/ETIMEDOUT -> "UpstreamUnavailable", and anything else -> "UnknownError". Add a comment on the UnknownError branch saying that seeing it in production logs means a specific catch is missing.\n\n2. timeout.ts: a named TimeoutError class carrying an error_class property, and a withTimeout(fn, ms) helper that races the call against a timer, ABORTS the underlying request when the timer wins (pass an abort signal into the call, do not merely stop awaiting), and always clears the timer.\n\nAdd one unit test per file: classify maps a 429 to RateLimitError, and withTimeout raises TimeoutError for a call that never resolves.\n\nShow me both files and the tests before running anything.',
          expectedResult: 'Two small files plus two tests. The timeout helper passes an abort signal into the real call.',
          stopCondition: 'You can point at the line that aborts the request, and the line that returns "UnknownError".',
          rescue: 'If it wrote a timeout that only stops awaiting, say so directly: "this abandons the call but leaves the socket open — pass the abort signal into the request."',
        },
        diagram: `flowchart LR
  ERR["💥 Anything thrown"] --> CLS["🏷️ classify()"]
  CLS --> S["📛 A stable<br/>class string"]
  S --> RT["🔁 Retry decides"]
  S --> BR["🔌 Breaker counts"]
  S --> LG["📊 Logs + dashboards"]`,
        script: 'Land why classify comes first: three separate systems make decisions on its output, so it is the single point everything downstream trusts. Then show the diagram and say it — one function, three consumers. That is why it gets its own file and its own test instead of being an if-statement buried in the retry.',
      },
      {
        segment: 'micro-build', eyebrow: '👀 Read it together', title: 'The retry function — four lines carry all the safety',
        body: 'This is roughly what a capped retry looks like once Claude Code writes it. Do not paste it; read it. There are exactly four lines that matter and everything else is bookkeeping. The attempt cap makes termination structural. The classify check means a 400 fails immediately instead of four times. The exponential backoff gives the upstream room. And the jitter stops a thousand clients synchronising into a thundering herd. Yours will differ in wording. All four properties must be present.',
        bullets: [
          'The for-loop bound — termination is structural, not hopeful',
          'The RETRYABLE check — a 4xx throws immediately',
          'backoff = min(cap, base × 2^attempt) — growth with a ceiling',
          'The random half — jitter, so retries scatter instead of stacking',
        ],
        code: {
          kind: 'review',
          label: 'retry.ts — read it, do not paste it',
          code: 'const RETRYABLE = new Set(["TimeoutError", "RateLimitError", "UpstreamUnavailable"]);\nconst sleep = (ms) => new Promise((r) => setTimeout(r, ms));\n\nexport async function withRetry(fn, opts = {}) {\n  const { attempts = 4, baseMs = 250, capMs = 4000 } = opts;\n  for (let attempt = 1; attempt <= attempts; attempt++) {   // 1. the cap is structural\n    try {\n      return await fn();\n    } catch (err) {\n      const cls = classify(err);\n      if (!RETRYABLE.has(cls) || attempt === attempts) throw err;   // 2. 4xx stops here\n      const backoff = Math.min(capMs, baseMs * 2 ** (attempt - 1)); // 3. growth, capped\n      const wait = backoff / 2 + Math.random() * (backoff / 2);     // 4. full jitter\n      log.warn({ event: "retry", attempt, error_class: cls, wait_ms: Math.round(wait) });\n      await sleep(wait);\n    }\n  }\n}',
          expectedResult: 'Four numbered comments. Put a finger on each one and say what it prevents.',
        },
        diagram: `flowchart LR
  F["📄 retry.ts"] --> L1["1️⃣ Attempt cap<br/>= termination"]
  F --> L2["2️⃣ classify check<br/>= no 4xx retries"]
  F --> L3["3️⃣ Capped growth<br/>= upstream breathes"]
  F --> L4["4️⃣ Jitter<br/>= no herd"]
  L1 --> SAFE["🛡️ Safe to run<br/>at 2 AM"]`,
        script: 'Open the REAL file Claude Code just wrote on your screen rather than this slide — the slide is your safety net if the generated version drifted. Four fingers, four lines, then move on. Do not line-by-line the whole function or you will lose the segment.',
      },
      {
        segment: 'micro-build', eyebrow: '3️⃣ Make it fire', title: 'Set the timeout to 1 millisecond and watch your own error class appear',
        body: 'A primitive you have never seen trigger is a primitive you are trusting on faith. So make it fire on purpose right now: run your tests with the timeout deliberately impossible and watch a TimeoutError — your named class, not a generic hang — appear in the output. Ten seconds of work, and it converts the concept into something you have personally observed. Then put it back. This is the smallest possible version of the whole week.',
        bullets: [
          'Run the tests with the timeout forced to 1ms',
          'You should see YOUR TimeoutError, by name, not a generic failure',
          'Then set it back and confirm the suite passes again',
          'A primitive you have never watched fire is a hope, not a control',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'your TERMINAL (not Claude Code)',
          label: 'Terminal — force the timeout, then restore it',
          code: '# run just the reliability tests with an impossible deadline\nRELIABILITY_TIMEOUT_MS=1 npm test -- reliability\n\n# Windows PowerShell\n$env:RELIABILITY_TIMEOUT_MS=1; npm test -- reliability\n\n# then restore the real deadline and confirm green again\nunset RELIABILITY_TIMEOUT_MS && npm test -- reliability',
          expectedResult: 'A failing-on-purpose run naming TimeoutError, then a clean run once the deadline is restored.',
          stopCondition: 'You have personally watched your own TimeoutError print. Not read about it — watched it.',
          rescue: 'No TimeoutError, just a hang? The abort signal is not reaching the underlying call. Tell Claude Code exactly that and let it fix the wiring.',
        },
        diagram: `flowchart LR
  S["⚙️ Timeout = 1ms"] --> R["▶️ Run the tests"]
  R --> E["🏷️ TimeoutError<br/>printed by name"]
  E --> B["↩️ Restore 8000ms"]
  B --> G["✅ Suite green again"]`,
        script: 'Do this live and wait for the room. Watching your own named error appear is a tiny moment that pays off all night — it is the first time a failure feels like something they control rather than something that happens to them. Call out two students who got it on the pulse rail before moving on.',
      },
      {
        segment: 'micro-build', eyebrow: '4️⃣ The key', title: 'Write the idempotency key for the most dangerous side effect in your project',
        body: 'Last piece of Monday, and it is the one that carries into Thursday. Decide the key for your project’s single most dangerous side effect — the one a customer would notice happening twice. Not the code that uses it; just the expression. If two different attempts at the same business event could produce two different keys, it is wrong, and the whole mechanism silently does nothing. Get the key right tonight and Thursday’s idempotency checkpoint takes ten minutes instead of an hour.',
        bullets: [
          'One expression: hash(event type + entity id + actor)',
          'The test: same business event, twice → identical key. Always.',
          'Add the database backstop too — a unique constraint on the side-effect table',
          'You decide the key. Do not let Claude Code guess your business event.',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — derive my idempotency key (and prove it is stable)',
          code: 'I need an idempotency key for the most dangerous side effect in this project: [NAME IT — e.g. "charging a customer", "sending the welcome email", "creating the ticket"].\n\nFirst, ASK ME which fields uniquely identify that business event. Do not guess them — a wrong field here silently disables the whole mechanism.\n\nThen create an idempotencyKey(evt) function that hashes those fields deterministically (SHA-256 of the joined values) and returns a hex string. It must never include a timestamp, a random value, an attempt number, or anything else that changes between attempts.\n\nAdd two unit tests: (a) the same business event produces an identical key across two separate calls, and (b) two genuinely different events produce different keys.\n\nFinally, propose the database migration that backstops this: an idempotency_keys table (key primary key, status, result, created_at) and a UNIQUE constraint on my actual side-effect table. Show me the migration, do not run it.',
          expectedResult: 'A key function with no time or randomness in it, two passing tests, and a proposed unique constraint.',
          stopCondition: 'Test (a) passes — the same event produces the same key twice. That single assertion is the whole idea.',
          rescue: 'If it put a timestamp or a UUID in the key, say so plainly: "that makes every attempt unique, which is the exact opposite of what an idempotency key is for."',
        },
        diagram: `flowchart LR
  Q["❓ Which fields<br/>identify the event?"] --> K["🔑 idempotencyKey()"]
  K --> T1["🧪 Same event<br/>= same key"]
  K --> T2["🧪 Different events<br/>= different keys"]
  K --> DB["🗄️ UNIQUE constraint<br/>as the backstop"]
  T1 --> TH["🔨 Thursday: runOnce"]`,
        script: 'Close Monday here. Have each student say their key expression out loud to a neighbour and apply the one-sentence test: could two attempts at the same event produce two different keys? Then open the loop into Thursday — "Thursday you wrap your real call in all seven primitives, then we force a failure and fire the same operation twice on camera. If two charges appear, we have a story. If one appears, you have a system."',
      },
    ],

    storyBeats: {
      checkin: [
        {
          icon: '🐉', tone: 'violet', eyebrow: 'A promise from Orientation',
          title: 'You were told about the dragon on your first night',
          body: 'On Orientation night you were told this program ends with a dragon — Week 12, a real system, live, defended in front of people who will ask hard questions. Nobody said the dragon was the hard part. The hard part is walking in there with something you have never once seen fail, because the first question a serious panel asks is not "does it work?" It is "what happens when it does not?"',
          punch: 'Tonight is the night you stop being able to be surprised by that question.',
        },
      ],
      'business-problem': [
        {
          icon: '🚢', tone: 'berry', eyebrow: 'Change of pace — a story from the docks',
          title: 'The ship that could not sink had lifeboats for half the people aboard',
          body: 'The Titanic carried lifeboats for about half its passengers, and this was not an oversight or a cost cut. It was compliant, it was conventional, and it followed from a belief the entire industry shared: the ship was its own lifeboat. The design was not wrong about the bulkheads. It was wrong about the premise that the failure path did not need to be built, because the failure would not happen.',
          punch: 'Nobody skips the failure path because they are lazy. They skip it because the demo keeps working.',
        },
      ],
      architecture: [
        {
          icon: '💸', tone: 'amber', eyebrow: 'The 2 AM story, this time with an invoice',
          title: 'It did not crash. It did not alert. It just spent all night asking the same question.',
          body: 'A team shipped a scheduled agent on a Friday. On Saturday at 1 AM the vendor API started returning 500s, and the retry logic did exactly what it was written to do, which was retry. There was no cap, because nothing in testing had ever failed twice in a row. By Monday there was no exception in the logs, no failed job, no alert — just an unfamiliar number on the usage dashboard and a vendor asking why one customer had sent four hundred thousand requests over a weekend.',
          punch: 'A system that fails loudly is a nuisance. A system that fails silently is an invoice.',
        },
      ],
      deconstruct: [
        {
          icon: '🧾', tone: 'cherry', eyebrow: 'The one your customers feel',
          title: 'She was charged twice, and the second charge was technically correct',
          body: 'Every line of code ran exactly as written. The charge succeeded, the receipt write hit a dropped connection, the handler threw, the retry did its job, and the charge ran again — correctly, by the letter of the code. Somewhere a person saw two identical amounts on a statement, and no amount of explaining that the network blipped will make that feel like anything other than being taken from.',
          punch: 'Idempotency is not a technical nicety. It is the difference between an outage and a betrayal.',
        },
      ],
      'micro-build': [
        {
          icon: '🧯', tone: 'leaf', eyebrow: 'Before you build — why we do this on purpose',
          title: 'Nobody has ever scheduled a fire drill because they expected a fire that Tuesday',
          body: 'You do the drill so that the first time you find the exit is not the first time you need it. Week 3 you set fire to a small script while an instructor was standing next to you. Tonight you build the extinguishers, and Thursday you set fire to the real thing — your capstone, on purpose, while it is small enough that nothing depends on it and someone is there to help.',
          punch: 'The first time your system fails should never be the first time you have seen it fail.',
        },
      ],
    },

    extraInteractions: [
      {
        segment: 'checkin', kind: 'poll',
        q: 'Be honest — has your project ever been run against a dependency that was deliberately failing?',
        options: ['Never tried it', 'It failed and I fixed it', 'It failed and I have not fixed it', 'Yes, and it held up'],
        eyebrow: '🌡️ Honest check', title: 'Has anything of yours ever actually failed?',
        presenterTip: 'No right answer, and that is the point — read the spread aloud. The first option usually dominates, and that number IS the thesis of the week. If a couple of people pick the last option, ask them what broke first; their answer sets up the whole architecture segment for you.',
      },
      {
        segment: 'business-problem', kind: 'poll',
        q: 'Your 2 AM job hits a failing upstream and retries with no cap for six hours. What is the FIRST cost you notice?',
        options: [
          'The token bill for hundreds of wasted calls',
          'The upstream stayed down longer because you hammered it',
          'The work that never got done while it looped',
          'Nothing — that is exactly the problem',
        ],
        answer: 3,
        reveal: 'Nothing. All three of the others are real costs, and none of them announce themselves. No exception, no alert, no failed job — the first signal is a bill or an angry vendor, days later. That silence is why the cap goes in before the incident, not after.',
        eyebrow: '🌙 The 2 AM question', title: 'It retried four hundred times. What do you notice first?',
        presenterTip: 'Take votes before revealing and let people argue for the first two — they are genuinely defensible. Then reveal the fourth and connect straight back to Week 3: this is the same silent-failure lesson, at production scale, with the token meter running.',
      },
      {
        segment: 'business-problem', kind: 'trivia',
        q: 'Which of these is NOT a reason to retry a failed call?',
        options: ['A 429 rate limit', 'A 503 from the upstream', 'A 400 bad request', 'A connection timeout'],
        answer: 2,
        reveal: 'A 400 means your request was malformed. The upstream will reject it identically every time, so retrying it four times is being wrong four times, slower and more expensively. Retry the transient; fail fast on your own bugs.',
        eyebrow: '🎯 Knowledge check', title: 'Which one should never be retried?',
        presenterTip: 'Fast — thirty seconds. Reveal, one line of why, move on. If several people pick the 429, that is worth ten extra seconds: 429 IS retryable, but only with backoff and respecting Retry-After.',
      },
      {
        segment: 'architecture', kind: 'poll',
        theater: true,
        q: 'A webhook fires twice for the same payment. Your handler charges the card. What actually keeps you correct?',
        options: [
          'Check whether we already processed it, right before charging',
          'An idempotency key derived from the payment event, claimed before the charge',
          'A fresh UUID generated at the top of each attempt',
          'Wrap it in a try/catch and retry on failure',
        ],
        answer: 1,
        reveal: 'The key, derived from the EVENT. Option 1 is a race — two webhooks a millisecond apart both pass the check. Option 3 is the mistake almost everyone makes first: a new UUID per attempt means every attempt has a different key and nothing ever dedupes, while the code looks completely correct. Option 4 makes it worse by adding more attempts.',
        eyebrow: '♻️ The decision that matters', title: 'The webhook fired twice. Stay correct.',
        presenterTip: 'Full-screen theater moment — lock the votes, show the spread, then reveal slowly. Option 3 always draws real votes, and that is the teaching moment: it is the mistake that looks like the fix. Spend a full minute on why a per-attempt UUID silently disables the whole mechanism.',
      },
      {
        segment: 'architecture', kind: 'trivia',
        q: 'A circuit breaker exists in order to…',
        options: [
          'Make calls faster',
          'Stop calling a failing upstream and fail clearly instead',
          'Retry more aggressively when things are down',
          'Produce more log lines',
        ],
        answer: 1,
        reveal: 'When an upstream keeps failing, the breaker opens: you stop calling it entirely for a cooldown and surface one clear error instead. Failing instantly is the feature — you protect your own responsiveness and you stop making their recovery harder.',
        eyebrow: '🔌 Knowledge check', title: 'What is a breaker actually for?',
        presenterTip: 'Quick. The distractor worth naming is the third one — plenty of production incidents have been made worse by exactly that instinct.',
      },
      {
        segment: 'deconstruct', kind: 'poll',
        q: 'Which of these three defects would be hardest to find in your own codebase right now?',
        options: [
          'An empty catch swallowing an error',
          'A retry with no cap',
          'A write with no idempotency key',
          'Honestly, I would not find any of them',
        ],
        eyebrow: '🔎 Look inward', title: 'Which one is hiding in your project?',
        presenterTip: 'Opinion poll, no correct answer. The unkeyed write usually wins, because the other two are visible in the code while a missing key is an absence — there is nothing to see. Say that out loud; it explains why idempotency needs a deliberate check rather than a code review.',
      },
      {
        segment: 'micro-build', kind: 'poll',
        q: 'Where are you with your failure table?',
        options: ['✅ Written, and it is specific to my call', '📝 Written, but it feels generic', '🤔 Still choosing which call', '🆘 Stuck — I need a hand'],
        eyebrow: '🚦 Room check', title: 'Everyone has a table before we go on',
        presenterTip: 'Operational, not a teaching question. Read the counts aloud and send a mentor to anyone on the last two options immediately. If "feels generic" is large, that is a one-line fix in front of the room: tell Claude Code to open the actual file and quote the actual call.',
      },
      {
        segment: 'micro-build', kind: 'trivia',
        q: 'Your idempotency key includes the current timestamp. What happens?',
        options: [
          'It works fine — the timestamp adds uniqueness',
          'Every attempt gets a new key, so nothing ever dedupes',
          'The database rejects it',
          'It only breaks under high load',
        ],
        answer: 1,
        reveal: 'Every attempt computes a different key, so the lookup never matches, the guard never fires, and the side effect happens every single time — while the code, the tests, and the dashboard all look perfectly healthy. The key must come from the business event and nothing else.',
        eyebrow: '🔑 Diagnose it', title: 'There is a timestamp in the key. Now what?',
        presenterTip: 'Fires right after they write the key. Take answers, reveal, then have everyone re-read their own key expression against it. Several people fix theirs on the spot, which is exactly the outcome you want before Thursday.',
      },
    ],
  },

  /* ======================================================================== */
  /*  THURSDAY — Build Day                                                    */
  /* ======================================================================== */
  thursday: {
    beforeAfter: {
      label: 'Monday → Thursday',
      before: [
        'A demo with a perfect record nobody has tested',
        'Calls that wait forever and retry forever',
        'A failed job that throws and vanishes',
        'The same operation run twice, twice the side effect',
        '"The output looked fine to me"',
      ],
      after: [
        'A break list you ran on purpose, in the PR',
        'Every call bounded, capped, and breaker-guarded',
        'A dead-letter row you can triage and replay',
        'Run it twice, one end state — proven by a passing test',
        'An eval threshold that blocks a bad output on camera',
      ],
    },

    teach: [
      /* ========================== build map =============================== */
      {
        segment: 'build-map', eyebrow: '🗺️ Tonight', title: 'Four checkpoints, wrapped around one real call in YOUR system',
        body: 'Tonight your Intensive 1–3 system puts on the reliability and quality layer. CP0 is your happy path running plus the failure table you wrote Monday. CP1 makes the call resilient — timeout, capped retry, circuit breaker, fallback, dead-letter. CP2 makes the side effect idempotent and PROVES it by running the same operation twice to one end state. CP3 adds the quality gate that blocks a deliberately bad output. Each checkpoint is demoable on its own, so nobody leaves with nothing.',
        bullets: [
          'CP0 Baseline — happy path runs, failure table exists',
          'CP1 Resilient — timeout + retry + breaker + fallback + dead-letter',
          'CP2 Idempotent — the same operation twice, one end state, proven',
          'CP3 Gated — an eval threshold blocks a bad output on camera',
          'It is YOUR call being hardened. Not a demo, not a sample.',
        ],
        diagram: `flowchart LR
  CP0["0️⃣ Baseline<br/>+ failure table"] --> CP1["1️⃣ Resilient<br/>timeout·retry·breaker"]
  CP1 --> CP2["2️⃣ Idempotent<br/>run twice, one state"]
  CP2 --> CP3["3️⃣ Gated<br/>bad output blocked"]
  CP3 --> D["🎬 Demo it"]`,
        script: 'Show the finished run first — the cold open. A forced failure, a graceful recovery, and one clean end state. Then set the rhythm for the night: we build a primitive, we break it, we watch it hold. Nobody advances to the next checkpoint until the current one has survived being broken on purpose.',
      },
      {
        segment: 'build-map', eyebrow: '🧅 Order matters', title: 'breaker( retry( timeout( call ) ) ) — and the nesting is a design decision',
        body: 'The primitives nest, and the order is not arbitrary. Timeout is innermost because it bounds a single attempt. Retry wraps the timeout so every attempt gets its own fresh deadline. The breaker sits outside the retry so it counts the whole operation as one failure and can fail fast before any attempt when the upstream is known dead. Idempotency sits above all of it, because it governs the side effect rather than the transport. The quality gate comes last, on the output. Get this backwards — a breaker inside the retry — and the breaker never trips, because every retry resets it.',
        bullets: [
          'timeout — innermost, bounds one attempt',
          'retry — wraps the timeout, fresh deadline per attempt',
          'breaker — outside the retry, or it never trips',
          'idempotency — above the whole call, guards the side effect',
          'quality gate — last, on the output',
        ],
        diagram: `flowchart TD
  I["♻️ runOnce — the<br/>side effect"] --> B["🔌 breaker"]
  B --> R["🔁 retry"]
  R --> T["⏱️ timeout"]
  T --> C["🌍 the call"]
  I --> G["🚦 quality gate<br/>on the output"]`,
        script: 'Draw the onion with a request arrow going in and a response arrow coming out. Then ask the room WHY the breaker goes outside the retry and let them reason to it rather than telling them — the answer, that a breaker inside the retry gets reset on every attempt and never counts to its threshold, is much stickier when they find it.',
      },

      /* ========================= guided build ============================= */
      {
        segment: 'guided-build', eyebrow: '0️⃣ CP0 · Baseline', title: 'Put your real call and your failure table side by side',
        body: 'Start from the truth. Open the call you enumerated on Monday and get it in front of you next to its failure table, unhardened. Everything tonight wraps this one function, and after class you repeat the pattern across your other boundaries. Do not substitute a tutorial example — a fake boundary teaches a fake lesson, and the assignment is graded on your real one.',
        bullets: [
          'Your real call, in your real repo, unchanged for now',
          'Monday’s failure table directly above it',
          'Confirm the happy path still runs before you touch anything',
          'No external side effect in your project? Pair up — the drill needs a real boundary',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          ccMode: 'Plan Mode',
          label: 'Claude Code prompt — establish the baseline',
          code: 'In Plan Mode, without changing anything:\n\n1. Show me the current implementation of [MY CALL — file and function], exactly as it is today.\n2. Show me the failure-mode table I wrote for it on Monday. If it is not in this repo, tell me and stop.\n3. List, honestly, which failure modes in that table the current code handles TODAY. For each one, name the line that handles it or say "not handled".\n4. Confirm the happy path still runs — tell me the exact command I should run to prove it, but do not run it yourself.\n\nDo not propose fixes yet. I want the honest starting picture first.',
          expectedResult: 'A short, uncomfortable list where most rows say "not handled" — that is the correct starting state, not a failure.',
          stopCondition: 'You have the honest baseline and you have run the happy path once, successfully.',
          rescue: 'No failure table in the repo? Write the four-row minimum now — timeout, 429, 5xx, wrong shape — and move on. Do not lose the night to documentation.',
        },
        diagram: `flowchart LR
  C["📄 Your real call"] --> H["✅ Happy path<br/>still runs"]
  T["📋 Monday's<br/>failure table"] --> G["🔎 Which rows are<br/>handled today?"]
  C --> G
  G --> B["0️⃣ CP0 baseline<br/>honest picture"]`,
        script: 'Insist on real calls. If someone’s project genuinely has no external side effect, pair them with someone whose does — the drill is worthless against a fake boundary. Then normalise the discomfort: a baseline where nine rows say "not handled" is exactly right, and it is why the room is here tonight.',
      },
      {
        segment: 'guided-build', eyebrow: '1️⃣ CP1 · Timeout', title: 'Bound the single attempt — the innermost layer goes on first',
        body: 'Wrap your call in the withTimeout primitive from Monday and make sure the abort signal actually reaches the underlying request. This is the layer everything else stacks on, so it goes first. Then verify it the same way you did Monday: force the deadline to something impossible, watch your named TimeoutError, and restore it. A primitive you have not watched fire is not installed, it is assumed.',
        bullets: [
          'Wrap the real call, pass the abort signal all the way down',
          'Choose the deadline deliberately per boundary — 5 to 30 seconds',
          'Verify by forcing it to fail, then restore the real value',
          'Confirm the error class is TimeoutError, not a generic Error',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — timeout on the real call',
          code: 'Wrap [MY CALL] with the withTimeout helper from my reliability module.\n\nRequirements:\n- The abort signal must be passed into the actual underlying request, so an abort tears the connection down rather than just abandoning the promise.\n- The deadline must come from a named constant with a comment explaining why I chose that number for THIS boundary — not a magic number inline.\n- On timeout it must raise my TimeoutError, so classify() maps it correctly.\n\nThen add a test that proves the timeout fires: point the call at something that never resolves and assert the thrown error\'s class is "TimeoutError".\n\nShow me the diff and the test before running anything.',
          expectedResult: 'A one-line wrap around your call, a named deadline constant, and a passing test that asserts on the error CLASS.',
          stopCondition: 'The test passes, and you have seen TimeoutError by name in the output.',
          rescue: 'Test hangs instead of failing? The signal is not reaching the request. Say exactly that to Claude Code — it is a wiring problem, not a logic problem.',
        },
        diagram: `flowchart LR
  CALL["🌍 Your call"] --> W["⏱️ withTimeout"]
  W --> SIG["📡 Abort signal<br/>reaches the request"]
  W --> D["🎚️ Named deadline<br/>+ why"]
  W --> T["🧪 Test asserts<br/>error CLASS"]`,
        script: 'Watch for the classic mistake: a timeout that stops awaiting but leaves the socket open. Ask two students to show you the line where the signal enters the request. Then note the test detail that matters — asserting on the error CLASS, not the message, because messages change and classes are the contract.',
      },
      {
        segment: 'guided-build', eyebrow: '2️⃣ CP1 · Capped retry', title: 'Survive the blip without becoming the storm',
        body: 'Now wrap the timeout in the capped retry. Because retry keys on classify, a 429 or a 5xx retries with growing jittered backoff while a 400 fails immediately. The cap guarantees termination structurally rather than hopefully. Prove it against a mock that fails twice and then succeeds: you should see exactly two retry log lines, one success, and an elapsed time that visibly reflects the backoff waits. Then flip the mock to a 400 and confirm it does not retry at all.',
        bullets: [
          'withRetry wraps withTimeout — each attempt gets a fresh deadline',
          'Prove it: a mock that fails twice, then succeeds',
          'Expect two retry log lines and a visible backoff delay',
          'Then flip to a 400 and confirm zero retries',
          'Every retry logs its attempt number and error class',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — capped retry with proof',
          code: 'Wrap the timed call from the last step in withRetry, with attempts 4, baseMs 250, capMs 4000.\n\nIt must only retry error classes classify() maps to TimeoutError, RateLimitError, or UpstreamUnavailable. A ClientError must throw immediately without a retry.\n\nEach retry attempt logs a structured line with: event "retry", the attempt number, the error_class, and the wait in milliseconds.\n\nThen write two tests:\n1. A mock that fails twice with a 503 and then succeeds — assert the call was made 3 times and the result came back.\n2. A mock that returns 400 — assert the call was made exactly ONCE and the error propagated.\n\nRun both and show me the log output from test 1 so I can see the backoff growing.',
          expectedResult: 'Two green tests, and log lines showing the wait growing between attempts — roughly 250ms, then 500ms, jittered.',
          stopCondition: 'Test 2 passes: the 400 was attempted exactly once. That assertion is the one people skip.',
          rescue: 'Test 2 retrying? classify() is not recognising your 4xx shape. Have Claude Code print what classify returns for that error and fix the mapping.',
        },
        diagram: `flowchart LR
  M1["🎭 Mock: fail·fail·ok"] --> R["🔁 withRetry"]
  R --> L["📊 2 retry logs<br/>then success"]
  M2["🎭 Mock: 400"] --> R
  R --> ONE["🛑 Attempted<br/>exactly once"]`,
        script: 'Run the fail-twice mock live and count the retry log lines out loud with the room. Then flip to the 400 and let them watch it fail instantly — the classify check earns its keep in front of their eyes. That second test is the one students skip, so make a point of it.',
      },
      {
        segment: 'guided-build', eyebrow: '👀 Read it together', title: 'Two layers on, and this is what your call looks like now',
        body: 'Pause and read what you have. The shape is the lesson: your original call is untouched at the centre, and the reliability behaviour lives in wrappers around it rather than tangled inside it. That separation is why you can test each layer alone, swap the deadline without touching business logic, and reuse the exact same wrappers on your next boundary. Yours will differ in naming. The nesting must match.',
        bullets: [
          'The business call in the middle is unchanged — that is deliberate',
          'Each layer is independently testable',
          'Reusable: the same two wrappers go on your next boundary unchanged',
          'The deadline and the attempt cap are both named constants, not literals',
        ],
        code: {
          kind: 'review',
          label: 'The resilient call so far — read it, do not paste it',
          code: '// unchanged business call — the reliability layer never reaches inside it\nasync function callUpstream(payload, signal) {\n  const res = await fetch(UPSTREAM_URL, {\n    method: "POST",\n    headers: { "content-type": "application/json" },\n    body: JSON.stringify(payload),\n    signal,                                  // the abort signal reaches the request\n  });\n  if (!res.ok) {\n    const e = new Error("upstream " + res.status);\n    e.status = res.status;                   // classify() reads this\n    throw e;\n  }\n  return res.json();\n}\n\n// two layers, applied from the outside in\nexport function callResilient(payload) {\n  return withRetry(\n    () => withTimeout((signal) => callUpstream(payload, signal), UPSTREAM_DEADLINE_MS),\n    { attempts: 4, baseMs: 250, capMs: 4000 },\n  );\n}',
          expectedResult: 'Two things to point at: the signal flowing into fetch, and the fact that callUpstream itself knows nothing about retries.',
        },
        diagram: `flowchart LR
  P["📥 payload"] --> RT["🔁 withRetry"]
  RT --> TO["⏱️ withTimeout"]
  TO --> CU["🌍 callUpstream<br/>unchanged"]
  CU --> ST["🏷️ e.status set<br/>for classify()"]
  RT --> OUT["✅ Result"]`,
        script: 'Open the REAL file rather than this slide; the slide is the safety net if the generated code drifted. Two fingers, two points: the signal reaching fetch, and callUpstream having no idea it is being retried. That second point is the architectural lesson — reliability wraps business logic, it never invades it.',
      },
      {
        segment: 'guided-build', eyebrow: '3️⃣ CP1 · Circuit breaker', title: 'Six failures in a row, and the sixth call never leaves your process',
        body: 'Add the breaker as the outermost transport layer. After a threshold of consecutive failures it opens, and every further call fails instantly with CircuitOpenError for the cooldown window — your system stays responsive instead of blocking on a dependency that cannot answer. After the cooldown, one half-open trial call decides whether to close. Prove it by forcing six consecutive failures: calls one through five actually try, and call six returns instantly without touching the network at all.',
        bullets: [
          'Breaker goes OUTSIDE the retry, or it never reaches its threshold',
          'Threshold of 5 consecutive failures, 30 second cooldown — tune per boundary',
          'Open state: fail fast with CircuitOpenError, zero network traffic',
          'Half-open: exactly one trial call decides the next state',
          'The instant failure is the feature. You are protecting both systems.',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — the three-state breaker',
          code: 'Add a CircuitBreaker to my reliability module and put it OUTSIDE withRetry on my call.\n\nRequirements:\n- Three states: closed, open, half_open.\n- Opens after 5 consecutive failures; cooldown of 30 seconds, both as named constructor arguments with defaults.\n- While open, calls throw CircuitOpenError immediately without invoking the wrapped function at all.\n- After the cooldown, the next call goes half_open: success closes the circuit and resets the counter, failure re-opens it and restarts the cooldown.\n- CircuitOpenError carries an error_class of "CircuitOpen", and classify() must map it.\n- One breaker instance per upstream, exported as a module-level singleton — not one per request.\n\nThen write a test that forces 6 consecutive failures and asserts the underlying function was invoked exactly 5 times, with the 6th call throwing CircuitOpenError.\n\nExplain in one comment why the breaker sits outside the retry.',
          expectedResult: 'A passing test where the 6th call never reaches the upstream, and a comment explaining the nesting.',
          stopCondition: 'You can point at the assertion proving call six never touched the network.',
          rescue: 'Breaker never opening? It is almost certainly instantiated per request instead of once per module — the counter resets every call.',
        },
        diagram: `flowchart LR
  C1["1️⃣-5️⃣ calls<br/>actually try"] --> TH["🔴 Threshold hit<br/>circuit OPENS"]
  TH --> C6["6️⃣ Fails instantly<br/>no network"]
  C6 --> CD["⏲️ Cooldown 30s"]
  CD --> HO["🟡 One trial call"]
  HO --> BACK["🟢 Closed again"]`,
        script: 'Run the six-failure test live and let the room watch call six return in single-digit milliseconds. Then name the two beneficiaries out loud: your system stays responsive, and the upstream gets to recover without you on its back. Watch for the per-request instantiation bug — it is the single most common breaker mistake and it is invisible in a passing happy-path test.',
      },
      {
        segment: 'guided-build', eyebrow: '4️⃣ CP1 · Fallback + dead-letter', title: 'Where does a failed job go in your project right now? Tonight the answer stops being "nowhere".',
        body: 'The retries are exhausted, the breaker is open, and the work still needs to not disappear. If a degraded-but-correct path exists, take it deliberately — a cached result, a cheaper model, a queued follow-up, an honest holding message. If nothing works, write the job to a dead-letter store with the full payload, the error class, and the correlation ID, so someone can triage and replay it. A dead-letter row is work you deferred. A thrown exception with nowhere to land is work you lost.',
        bullets: [
          'Fallback must be CORRECT, not merely quiet — a wrong cached answer is worse than an error',
          'Dead-letter carries: payload, error class, correlation ID, timestamp',
          'The dead-letter insert is itself idempotent — ON CONFLICT DO NOTHING',
          'Log the primary failure before falling back, or you lose the reason',
          'If you cannot replay it from the dead-letter row, it is not a dead-letter row',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — degrade, then park',
          code: 'Add fallback and dead-letter handling around my resilient call.\n\n1. callWithFallback(primary, fallback, ctx): try the primary. On failure, log a structured error line with event "primary_failed", the error_class from classify(), and ctx.correlationId. If a fallback is supplied, try it; if the fallback also fails, dead-letter and rethrow. If no fallback exists, dead-letter and rethrow.\n\n2. deadLetter(ctx, err): insert into a dead_letters table (correlation_id, payload, error_class, failed_at) using ON CONFLICT DO NOTHING so the dead-letter write is itself idempotent. Propose the migration; do not run it.\n\n3. Ask ME what a correct degraded answer would be for my specific workflow. Do not invent one — a plausible-sounding wrong fallback is worse than an honest error.\n\nThen write a test asserting that when both primary and fallback fail, exactly one dead_letters row is written and the original error propagates.',
          expectedResult: 'A dead-letter row containing enough context to replay the job, and a test proving it is written exactly once.',
          stopCondition: 'You can describe, out loud, how you would replay a job from a dead-letter row on Monday morning.',
          rescue: 'Cannot think of a degraded path for your workflow? Then pass null and go straight to dead-letter. "No safe fallback exists" is a legitimate, documented answer.',
        },
        diagram: `flowchart LR
  P["⚡ Primary fails"] --> LG["📝 Log the reason<br/>+ correlation id"]
  LG --> FB{"🪂 Degraded path?"}
  FB -->|"yes"| OK["✅ Correct,<br/>degraded answer"]
  FB -->|"no"| DL["📦 dead_letters row"]
  DL --> RP["🔁 Replayable<br/>by a human"]`,
        script: 'Push back hard on invented fallbacks. Ask two students what their degraded answer is and make them defend that it is CORRECT and not merely reassuring. A fallback that quietly returns stale or wrong data is worse than an error, because the error at least told the truth.',
      },
      {
        segment: 'guided-build', eyebrow: '5️⃣ CP2 · Idempotency', title: 'runOnce — claim the key, run once, store the result',
        body: 'This is the checkpoint you demo. runOnce claims the idempotency key with an atomic insert that does nothing on conflict. If the claim succeeds, the operation runs and its result is stored. If the key already exists and the prior run succeeded, you return the stored result instead of re-running. If it exists and is still in flight, you reject the concurrent duplicate. And the subtle correct move most people miss: a run that FAILED releases its key, so a legitimate retry is not permanently locked out by a transient error.',
        bullets: [
          'Claim atomically — INSERT ... ON CONFLICT DO NOTHING, not read-then-write',
          'Fresh key → run the operation, store the result',
          'Succeeded key → return the stored result, do not re-run',
          'In-flight key → reject the concurrent duplicate',
          'Failed run → RELEASE the key, so a real retry can still proceed',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — the idempotency wrapper',
          code: 'Implement runOnce(key, operation) in my reliability module, and wrap my side effect with it using the idempotencyKey() function I wrote on Monday.\n\nBehaviour:\n1. Claim the key with an ATOMIC insert into idempotency_keys (key, status="in_progress") using ON CONFLICT DO NOTHING. Do not read-then-write — that is a race.\n2. If the claim succeeded: run the operation, store the result, mark status "succeeded", return the result.\n3. If the claim failed and the existing row is "succeeded": return the STORED result without re-running the operation.\n4. If the claim failed and the existing row is "in_progress": throw a named InFlightError for the concurrent duplicate.\n5. If the operation throws: DELETE the key row before rethrowing, so a legitimate retry is not permanently blocked, and add a comment explaining why.\n\nThe side effect must sit INSIDE runOnce, not beside it.\n\nShow me the diff and explain, in your own words, which branch handles a duplicate webhook.',
          expectedResult: 'Four branches — claim, replay, in-flight, and the failure release — with the side effect fully inside the guarded block.',
          stopCondition: 'You can name which branch a duplicate webhook lands in, and which one a retry after a crash lands in.',
          rescue: 'If it wrote a SELECT followed by an INSERT, stop it: two requests a millisecond apart both pass the SELECT. The claim has to be one atomic statement.',
        },
        diagram: `flowchart LR
  K["🔑 Claim the key<br/>atomically"] --> C{"Result?"}
  C -->|"claimed"| RUN["⚡ Run once,<br/>store result"]
  C -->|"succeeded"| REP["📄 Return stored"]
  C -->|"in flight"| REJ["🚫 InFlightError"]
  RUN -->|"threw"| REL["♻️ Release the key"]`,
        script: 'Walk all four branches on the diagram, then stop on the release branch and say why it matters — without it, one transient failure locks that business event out forever and you have traded a duplicate for a permanent block. That release is the move most tutorials miss and the one a reviewer will look for.',
      },
      {
        segment: 'guided-build', eyebrow: '6️⃣ CP3 · Quality gate', title: 'Score the output, and block it below the threshold',
        body: 'The last layer sits on the AI output, not the transport. The gate scores the output against the rubric — cheap deterministic checks first, then an LLM judge only if it survived them — and throws a typed QualityGateError below your threshold, so a bad answer is rejected with named reasons instead of shipped. The rejection is logged with the score and the correlation ID so you can see, later, what your gate has been catching. Quality stops being a hope in a prompt and becomes a gate in the pipe.',
        bullets: [
          'Deterministic checks first: valid JSON, schema match, required citation, length',
          'LLM judge only after the cheap checks pass — that is cost discipline',
          'Below threshold: throw with the score AND the reasons, never a bare failure',
          'Log every gate decision, pass or block, with the correlation ID',
          'The threshold is a dial. Show the room what moving it changes.',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — the eval threshold that blocks',
          code: 'Add a quality gate on the AI output in my pipeline.\n\n1. scoreOutput(output, ctx) returns { score, reasons }. Run the CHEAP deterministic checks first and return early if they fail hard: is it valid JSON, does it match my declared schema, does it include the fields my workflow requires. Only if it survives those, call an LLM judge with model "claude-haiku-4-5" to score grounding against ctx.sources on a 0 to 1 scale, and take the lower of the two scores.\n\nWhen you call the judge, use output_config with a format of type json_schema so the judge itself returns validated JSON — do NOT use the deprecated top-level output_format parameter.\n\n2. qualityGate(output, ctx) throws a named QualityGateError carrying the score and the reasons when score is below a THRESHOLD constant of 0.75, and returns the output otherwise. Log a structured line with event "quality_gate", outcome pass or block, the score, and ctx.correlationId either way.\n\n3. Write two tests: a hand-crafted BAD output (malformed JSON or a missing required field) is blocked with reasons, and a good output passes.\n\nRun both and show me the blocked output\'s reasons.',
          expectedResult: 'A blocked output with named reasons printed, and a good output passing — plus a log line for both decisions.',
          stopCondition: 'You have watched a bad output get blocked with a reason you can read aloud.',
          rescue: 'Judge costing too much or too slow? Confirm the cheap checks run first and return early — if the judge is scoring invalid JSON, the ordering is wrong.',
        },
        diagram: `flowchart LR
  O["🤖 Output"] --> CH["🧪 Cheap checks<br/>JSON · schema"]
  CH -->|"fail"| BLK["🚫 Blocked<br/>+ reasons + log"]
  CH -->|"pass"| J["⚖️ Haiku judge<br/>grounding 0-1"]
  J -->|"< 0.75"| BLK
  J -->|">= 0.75"| SHIP["✅ Ships"]`,
        script: 'Feed it a hand-crafted bad output live and read the blocked reasons aloud, then a good one and watch it pass. Then move the threshold up in front of the room and re-run — watching a previously-passing output get blocked makes the dial real. Note the API detail deliberately: output_config with a json_schema, not the deprecated top-level output_format. Checking the current API surface rather than trusting the first search result is a habit, not a footnote.',
      },
      {
        segment: 'guided-build', eyebrow: '7️⃣ Assemble', title: 'One operation, seven layers, one correlation ID threading all of it',
        body: 'Compose it. Generate a correlation ID at the top of the operation so every log line, every retry, every dead-letter row, and every gate decision for this run shares one thread. This is the finished layer: idempotent, resilient, gated, and observable. The bar to clear is simple and strict — if something fails tonight, you should be able to reconstruct the entire story from that single ID, without guessing and without adding logging after the fact.',
        bullets: [
          'One correlation ID generated at the entry point, passed everywhere',
          'It appears in every log line, the dead-letter row, and the gate decision',
          'Structured JSON logs to stdout — never ad-hoc strings, never a file',
          'Log op_start and op_done with the outcome, so you can measure success rate',
          'If you cannot trace symptom to cause with one ID, observability is incomplete',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — compose the whole layer',
          code: 'Compose everything into a single entry point for my operation.\n\nStructure it exactly in this order, outside in:\n  runOnce( idempotencyKey(event), () =>\n    callWithFallback( () => breaker.call( () => withRetry( () => withTimeout(call) ) ), fallback, ctx ) )\nand then run the result through qualityGate before returning.\n\nGenerate a correlation ID (UUID v4) at the top of the function and thread it through every log line, the dead-letter row, and the quality-gate decision.\n\nEmit structured JSON logs to stdout with: timestamp, level, service, event, correlation_id, duration_ms, outcome, error_class when failing. Log op_start at the beginning and op_done at the end with the outcome. Never log the payload if it could contain secrets or personal data — redact those fields explicitly.\n\nThen show me one example of the complete log output for a single successful run, and one for a run that exhausted its retries, so I can see the same correlation ID threading both.',
          expectedResult: 'Two sample log traces where one correlation ID threads every line of the operation, start to finish.',
          stopCondition: 'You can follow one correlation ID from op_start to op_done, or to the dead-letter row, with nothing missing in between.',
          rescue: 'Correlation ID missing from some lines? Those are the lines that will be useless at 2 AM. Have Claude Code list every log call in the module and confirm each one carries it.',
        },
        diagram: `flowchart LR
  ID["🧵 correlation_id<br/>generated once"] --> ST["📝 op_start"]
  ST --> OP["⚙️ The 7 layers<br/>run"]
  OP --> LG["📊 Every log line<br/>carries the id"]
  LG --> DN["🏁 op_done<br/>+ outcome"]
  OP -.-> DL["📦 dead_letters<br/>same id"]`,
        script: 'This is the deliverable — read the composed function top to bottom and name each layer as you pass it. Then hold up the two sample traces side by side and make the observability point concrete: at 2 AM you will have a symptom and one ID, and either the story is reconstructable or your night just got much longer.',
      },

      /* ============================ failure =============================== */
      {
        segment: 'failure', eyebrow: '💥 BREAK it on purpose', title: 'Force the failure, fire the same operation twice, and watch it duplicate',
        body: 'Time to reproduce Monday’s bug on your own system, deliberately, while everyone is watching and nothing depends on it. Turn runOnce OFF, point the upstream at a mock that succeeds the side effect and then fails immediately after, and fire the identical business event twice within a second. You will see two of whatever your side effect is. Capture that. The duplicate is the evidence — you have not shipped anything until you have broken it and seen what breaking looks like.',
        bullets: [
          'Disable runOnce — temporarily, on purpose, in a test',
          'Mock: the side effect succeeds, then the very next step fails',
          'Fire the SAME business event twice, under a second apart',
          'Observe two charges, two rows, two emails — whatever yours is',
          'Capture it. The break is the proof the fix is needed.',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — reproduce the duplicate, red-handed',
          code: 'Write a chaos test that PROVES my system currently duplicates its side effect on retry. This test is expected to demonstrate the bug, not to pass a review.\n\n1. Mock my side effect so it always succeeds, and count how many times it is called.\n2. Mock the step immediately after it so it fails the first time with a connection-reset style error, then succeeds.\n3. Call the handler WITHOUT runOnce, wrapped in withRetry with 2 attempts.\n4. Assert that the side effect was called TWICE — that assertion IS the duplicate, and it should pass.\n\nName the test so it is obvious it documents a defect, for example "BREAK: non-idempotent handler duplicates the side effect on retry".\n\nRun it and show me the output. Do not fix anything yet.',
          expectedResult: 'A passing test whose passing assertion is the bug: your side effect fired twice for one business event.',
          stopCondition: 'You have seen the number 2 where a 1 belongs, on your own system.',
          rescue: 'Side effect only firing once? Your retry is probably wrapping too narrowly. Move the retry boundary to wrap the whole handler — that is the realistic shape of the bug.',
        },
        diagram: `flowchart LR
  E["📨 One business<br/>event"] --> H["⚙️ Handler<br/>runOnce OFF"]
  H --> S1["💳 Side effect ✅"]
  S1 --> F["💥 Next step fails"]
  F --> RT["🔁 Retry re-runs<br/>the handler"]
  RT --> S2["💳 Side effect ✅<br/>AGAIN"]
  S2 --> D["😱 Two of them"]`,
        script: 'Run it red-handed and let the room sit in it for a beat. Say what the number two actually means in their domain — two charges on a card, two welcome emails to the same person, two tickets for one complaint. This is the highest-retention moment of the week; do not rush to the fix.',
      },
      {
        segment: 'failure', eyebrow: '🌙 Who pays?', title: 'Count the attempts, price them, and answer the 2 AM question with a number',
        body: 'Now put a figure on the retry storm. Run the chaos suite with the cap deliberately removed and a hard stop after a few seconds, and count how many attempts happened in that window. Extrapolate to six hours. Multiply by your input tokens per call and the per-million rate for the model you chose — the exact arithmetic from Week 3. That number is the answer to the 2 AM question, and it is the argument you will use when someone asks why the cap is worth the ten minutes it took to write.',
        bullets: [
          'Run uncapped for a few seconds, count the attempts',
          'Extrapolate to an overnight window: six hours, nobody awake',
          'attempts × input tokens × the per-million rate — Week 3 arithmetic',
          'Then add the cost you cannot invoice: the upstream you hammered',
          'Open the live pricing page — do not trust a rate from a slide',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'your TERMINAL (not Claude Code)',
          label: 'Terminal — count the attempts an uncapped retry makes',
          code: '# run the chaos suite with the cap disabled and a hard 5-second stop\nRELIABILITY_MAX_ATTEMPTS=0 CHAOS_STOP_AFTER_MS=5000 npm test -- chaos\n\n# Windows PowerShell\n$env:RELIABILITY_MAX_ATTEMPTS=0; $env:CHAOS_STOP_AFTER_MS=5000; npm test -- chaos\n\n# read the "retry" log lines and count them, then do the math out loud:\n#   attempts in 5s  ->  x 720  =  attempts in 6 hours\n#   x your input tokens per call  x the per-million rate for your model',
          expectedResult: 'A count of attempts in five seconds, and a defensible overnight dollar figure you worked out yourself.',
          stopCondition: 'You have a number. Say it out loud — that is what the missing cap costs.',
          rescue: 'No cap flag in your code? Then the cap is hardcoded, which is fine — reason about it instead: 5 seconds of tight-loop retries, extrapolated, gets you the same number.',
        },
        diagram: `flowchart LR
  U["♾️ Uncapped retry<br/>5 seconds"] --> N["🔢 Count the<br/>attempts"]
  N --> X["✖️ 720 = a<br/>6-hour night"]
  X --> TK["🧮 × input tokens<br/>× per-million rate"]
  TK --> $["💵 The 2 AM answer"]
  U -.-> UP["🏚️ Plus the upstream<br/>you hammered"]`,
        script: 'Do the arithmetic live, in the same units as Week 3, and open the live pricing page rather than reading a rate off the slide. Then ask the room what the cap cost to write — about ten minutes — and let the comparison make the argument. This is the slide that turns reliability from an engineering preference into a business case.',
      },
      {
        segment: 'failure', eyebrow: '🛡️ HARDEN it', title: 'Turn runOnce back on, re-run the identical chaos, and get one end state',
        body: 'Now the payoff. Change nothing about the chaos — same mock, same failure, same two firings of the same business event — and simply enable runOnce. The first attempt claims the key and the side effect fires. The retry computes the identical key, finds it claimed, and returns the stored result instead of re-running. Same input, same end state, exactly one side effect. That passing test is the artifact your assignment requires and the thing you demo on camera.',
        bullets: [
          'Identical chaos. The only change is that runOnce is enabled.',
          'Assert the side effect was called exactly ONCE',
          'Assert the second call returned the same result as the first',
          'That is the definition of idempotent, expressed as an assertion',
          'Red here means the operation is broken, not fragile. Broken.',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — the idempotency proof test',
          code: 'Now write the HARDEN counterpart to the chaos test, with runOnce enabled and everything else identical.\n\n1. Same mocked side effect with a call counter.\n2. Same business event, run through the full hardened operation twice — a genuine replay, not two different events.\n3. Assert the side effect was called EXACTLY ONCE.\n4. Assert the second call returned a result equal to the first (the stored result, replayed).\n5. Add a third case: two calls fired CONCURRENTLY with Promise.all for the same event — assert the side effect still fired exactly once, and that the loser either got the stored result or a clean InFlightError, never a duplicate.\n\nName it "HARDEN: same operation run twice yields exactly one side effect".\n\nRun the whole suite and show me both the BREAK test and this one, side by side.',
          expectedResult: 'Green. Side effect called once, second result equals the first, and the concurrent case holds too.',
          stopCondition: 'The concurrent case passes. Sequential idempotency is table stakes; concurrent is what production actually does to you.',
          rescue: 'Concurrent case producing two effects? Your claim is not atomic — a SELECT followed by an INSERT loses this race every time. Make it one statement.',
        },
        diagram: `flowchart LR
  E["📨 Same event,<br/>twice"] --> R1["1️⃣ Claims key<br/>💳 fires once"]
  E --> R2["2️⃣ Key exists<br/>📄 stored result"]
  E --> R3["⚡ Concurrent<br/>🚫 InFlight"]
  R1 --> ONE["✅ Exactly one<br/>side effect"]
  R2 --> ONE
  R3 --> ONE`,
        script: 'Run it green and read the two assertions out loud. Then say the standard plainly one more time: this passing test is the artifact, and if it is red the operation is broken rather than fragile. Make a point of the concurrent case — most students would never have written it, and production writes it for you whether you like it or not.',
      },
      {
        segment: 'failure', eyebrow: '🏁 Act III closes', title: 'Definition of Done — and what you can now say that you could not on Monday',
        body: 'A feature that has been built but not broken is not shipped. Broken but not hardened is a known-broken state. Before your reliability layer is done: every external boundary has a timeout, retries are capped and fire only on transient classes, a breaker guards the upstream, exhausted work lands somewhere replayable, the side effect is idempotent with a passing proof test, and a quality gate blocks below threshold with named reasons. Zero empty catches. Zero unbounded retries. Zero unkeyed writes. That is Intensive 3 closed — your system now survives contact with reality, and Week 10 asks the harder question: who answers for what it does?',
        bullets: [
          '⏱️ A timeout on every outbound call',
          '🔁 Capped retry with backoff, transient classes only',
          '🔌 A breaker, a fallback, and a dead-letter for exhaustion',
          '♻️ An idempotent side effect with a passing proof test',
          '🚦 A quality gate that blocks with named reasons',
          '🚫 No empty catches, no unbounded retries, no unkeyed writes',
        ],
        diagram: `flowchart LR
  A["🎬 Act III<br/>weeks 7-9"] --> D["✅ Definition<br/>of Done"]
  D --> S["🛡️ It survives<br/>failure"]
  S --> A4["⚖️ Act IV: who<br/>answers for it?"]
  A4 --> W12["🐉 Week 12<br/>the dragon"]`,
        script: 'Turn the bullets into a live checklist against one volunteer’s project on the projector — anything unchecked is tonight’s homework, named in public. Then close the act properly: "On Orientation night you were promised a dragon. Tonight your system stopped being something that has never failed and became something that has failed, on purpose, in front of you, and recovered. That is the difference between a demo and a system you can defend." Then open the loop into Week 10: it survives failure now, but it still does whatever it is told.',
      },
    ],

    storyBeats: {
      'result-preview': [
        {
          icon: '🧗', tone: 'violet', eyebrow: 'Before you build — where you actually are',
          title: 'The climber does not test the rope on the wall',
          body: 'Nobody finds out whether the rope holds by falling from two hundred feet. They load it, deliberately, at head height, on the ground, where a failure is embarrassing rather than fatal. Tonight is head height. Your system is small, nothing depends on it yet, and there is an instructor in the room — which makes this the cheapest chance you will ever get to watch your own work fail.',
          punch: 'You are not testing whether it works. You already know it works. You are testing what happens when it does not.',
        },
      ],
      'build-map': [
        {
          icon: '🏥', tone: 'amber', eyebrow: 'Change of pace — why the boring layers win',
          title: 'The checklist that made surgery safer was not clever. That was the point.',
          body: 'When hospitals adopted a nineteen-item surgical safety checklist, complications and deaths fell measurably, and not one item on it was a medical breakthrough. Confirm the patient’s name. Confirm the site. Confirm everyone in the room has introduced themselves. The items were so obvious they felt insulting to experienced surgeons — which is precisely why they had been skipped, quietly, for years.',
          punch: 'Every primitive tonight is boring. Boring is what survives 2 AM.',
        },
      ],
      failure: [
        {
          icon: '🎰', tone: 'cherry', eyebrow: 'The moment it lands',
          title: 'The assertion says two, and two is a person’s bank statement',
          body: 'In a moment you will run a test whose passing assertion is that your side effect fired twice. It will be green. It will look like success. And in the domain your project actually lives in, that number two is two charges on somebody’s card, or two identical emails to a customer who already told you once, or two tickets a support rep now has to reconcile. The test is green and the system is wrong.',
          punch: 'The scariest bugs are the ones your tests are perfectly happy about.',
        },
        {
          icon: '🐉', tone: 'berry', eyebrow: 'A promise kept — Act III closes',
          title: 'You are three weeks from the dragon, and you have finally seen your own system fail',
          body: 'On Orientation night you were told this ends with a real system, live, defended in front of people. Tonight you did the thing that makes that defensible: you broke your own work on purpose and watched it recover. Apprentices are given work that cannot hurt anyone. What you did tonight is what a journeyman does — take the thing you built, try seriously to destroy it, and fix what gives.',
          punch: 'Nobody defends a system they have never seen fail. Now you have.',
        },
      ],
    },

    extraInteractions: [
      {
        segment: 'result-preview', kind: 'poll',
        q: 'You just watched a forced failure recover into one clean end state. Could your system do that right now?',
        options: ['Not a chance', 'Partly — I have some of it', 'Mostly, but idempotency is missing', 'Yes, I think it would hold'],
        eyebrow: '🔮 Honest read', title: 'Before we start — where does yours stand?',
        presenterTip: 'Take this immediately after the cold-open demo while the contrast is sharp. Read the spread out loud; the first two options dominating is normal and worth naming, because it tells the room they are all in the same place at the start of the night.',
      },
      {
        segment: 'readiness', kind: 'poll',
        q: 'Four-point check — where are you?',
        options: [
          '✅ All four green',
          '📋 No failure table from Monday',
          '🎯 Have not picked my target call',
          '🆘 Project will not run at all',
        ],
        eyebrow: '🚦 Roll call', title: 'Before anyone writes a line',
        presenterTip: 'Purely operational. Read the counts aloud and send mentors to the non-green students immediately. Anyone on the last option gets paired NOW — they can harden a partner’s call and still complete the assignment. Do not start the guided build with people stuck on setup.',
      },
      {
        segment: 'build-map', kind: 'trivia',
        q: 'Why does the circuit breaker go OUTSIDE the retry rather than inside it?',
        options: [
          'It is faster that way',
          'Inside the retry it gets reset on every attempt and never trips',
          'It does not matter — either order works',
          'Because retries are more important than breakers',
        ],
        answer: 1,
        reveal: 'A breaker inside the retry counts failures within a single operation and gets reset by the next call, so it never reaches its threshold. Outside, it counts operations, which is the thing you actually want to stop doing when an upstream is dead.',
        eyebrow: '🧅 Design check', title: 'Defend the nesting order',
        presenterTip: 'Ask this BEFORE you explain the onion, not after. Let the room reason to it — the wrong answers are genuinely tempting, and the reasoning is what makes the order stick rather than the rule.',
      },
      {
        segment: 'guided-build', kind: 'poll',
        q: 'Your retry test against a mocked 400 keeps retrying. What do you check FIRST?',
        options: [
          'The attempt cap',
          'What classify() returns for that error shape',
          'The backoff timings',
          'Whether the mock is set up correctly',
        ],
        answer: 1,
        reveal: 'classify(). Retry decides on the error class, so if a 4xx is being retried, classify is not recognising your error shape — usually because the status lives somewhere the mapper is not looking. Print what classify returns before touching anything else.',
        eyebrow: '🔧 Diagnose it', title: 'It is retrying a 400. Where do you look?',
        presenterTip: 'Fires right after the retry step, when several students are hitting this for real. Take answers, reveal, then have anyone with a red test print classify’s output — most of them fix it within a minute.',
      },
      {
        segment: 'guided-build', kind: 'poll',
        q: 'Where does a failed job go in YOUR project today, honestly?',
        options: [
          'Nowhere — it throws and disappears',
          'Into a log line I would probably never read',
          'Into a queue or table I could actually replay',
          'I genuinely do not know',
        ],
        eyebrow: '📦 Look at yours', title: 'Where does the work go when it fails?',
        presenterTip: 'No right answer, and the honesty is the point. The first and last options usually dominate. Say the reframe out loud after the results: the dead-letter table is where "nowhere" becomes a row you can count, triage, and replay on Monday morning.',
      },
      {
        segment: 'failure', kind: 'poll',
        theater: true,
        q: 'The chaos test just went GREEN, and its assertion is that your side effect fired twice. What did you just prove?',
        options: [
          'The retry logic works correctly',
          'The test suite is healthy',
          'That one business event produces two real-world side effects',
          'Nothing — it is only a mock',
        ],
        answer: 2,
        reveal: 'A green test that asserts two charges is not a passing test, it is a documented defect. In your domain that number two is two charges on a card, two emails to the same customer, or two tickets for one complaint. A test suite can be perfectly happy about a bug that costs you a customer.',
        eyebrow: '😐 Sit with this', title: 'The test is green. Is the system correct?',
        presenterTip: 'Full-screen theater moment. Lock the votes before revealing and let the silence do the work — the realisation that a green suite can certify a defect is the highest-retention beat of the entire week. Do not rush into the fix; take a full minute here.',
      },
      {
        segment: 'failure', kind: 'trivia',
        q: 'Your idempotent operation FAILS mid-run. What should happen to the key it claimed?',
        options: [
          'Keep it — the operation was attempted',
          'Release it, so a legitimate retry can proceed',
          'Mark it succeeded to be safe',
          'It does not matter either way',
        ],
        answer: 1,
        reveal: 'Release it. A key left claimed by a failed run locks that business event out permanently, so one transient blip becomes a job that can never complete. You traded a duplicate for a silent, permanent block — which is arguably worse, because nobody notices.',
        eyebrow: '♻️ The subtle one', title: 'The run failed. What happens to the key?',
        presenterTip: 'This is the branch nearly everyone misses. Take answers before revealing — option 1 draws real votes and is a completely reasonable instinct. Then have them check their own runOnce for the release path; several will find it missing.',
      },
      {
        segment: 'demos', kind: 'poll',
        q: 'Which checkpoint are you demoing?',
        options: [
          'CP1 — resilient call with breaker and fallback',
          'CP2 — the idempotency proof test, green',
          'CP3 — a bad output blocked by the gate',
          'All four, end to end with the correlation ID',
        ],
        eyebrow: '🎬 Pick your moment', title: 'What are you showing the room?',
        presenterTip: 'Use this to build the demo running order in real time. Lead with a CP2 so the room sees the idempotency proof first — it is the most visceral one — then a CP3 block, then someone brave enough for the full end-to-end trace.',
      },
    ],
  },
};
