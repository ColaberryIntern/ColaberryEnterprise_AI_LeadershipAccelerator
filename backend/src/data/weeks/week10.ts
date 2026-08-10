/**
 * week10.ts — the complete authored content pack for WEEK 10,
 * "Governance + Governance Engine" (Intensive 4 · Design AI That Scales).
 *
 * Week 10 opens Act IV. Weeks 1-9 answered "can I build it?" — this week the
 * question changes to "who answers for it?" The arc beat is: you give it a
 * conscience — policy, a human gate, and an audit trail.
 *
 * The centrepiece of the week (and the public title, "This AI Tried to Act —
 * Governance Stopped It") is one live moment on Build Day: the identical
 * high-risk request run twice, once ungoverned so the side effect fires, once
 * through the gate so it never reaches the side effect at all. Everything on
 * Monday is designed so the room understands exactly why that second run
 * printed nothing.
 *
 * Five things this week must land:
 *   1. ABAC — decisions come from user, resource, action, context AND a
 *      computed risk tier, not from a role alone.
 *   2. The policy check runs BEFORE the side effect. This is the single most
 *      important engineering point of the week; governance-after is a receipt,
 *      not a control.
 *   3. HITL — high-risk actions escalate to a human and resume cleanly, exactly
 *      once, after approval.
 *   4. Fail-closed — absence of an explicit permission is a denial.
 *   5. Audit — one correlation ID minted at the door reconstructs any decision.
 *
 * Audience note: this room is full of enterprise executives. Governance is the
 * language they already speak — approval thresholds, delegation of authority,
 * segregation of duties, audit. Week 10 is where many of them feel most at home
 * and most able to lead, so the teaching leans on that rather than apologising
 * for it.
 *
 * Authoring rules honoured here: every teach slide carries its own mermaid
 * diagram (<=7 short-labelled nodes, legible click-zoomed from the back of a
 * room); every code block is either a Claude Code prompt the student directs
 * with, a terminal command explicitly labelled as such, or code marked
 * `kind: 'review'` that the room reads together and nobody pastes.
 *
 * Pure data, one type-only import — same discipline as classTeachWeek3.ts.
 */
import type { WeekPack } from '../weekPack';

export const WEEK10_PACK: WeekPack = {
  week: 10,
  arcBeat: 'You give it a conscience: policy, a human gate, and an audit trail.',

  /* ======================================================================== */
  /*  MONDAY — ARCHITECTURE DAY                                               */
  /* ======================================================================== */
  monday: {
    hook: {
      headline: 'It is 2 AM. It did something nobody approved.',
      caption: 'Tonight you design the thing that would have stopped it — and the record that explains why.',
    },

    teach: [
      /* ========================= check-in ================================= */
      {
        segment: 'checkin',
        eyebrow: '🪜 Where you are',
        title: 'In Week 1 you approved every keystroke. Tonight it acts on its own.',
        body: 'Look back down the ladder you have been climbing. Week 1, you approved every single action Claude Code proposed. Week 3, something of yours ran with nobody in the room. Weeks 5 and 6 gave it hands into systems the business depends on. Weeks 7 and 8 gave it a team and a schedule. Last week it learned to survive its own failures. Tonight is the rung where it is allowed to act without asking you first — and the only reason that is safe is that tonight you also build the thing that can say no.',
        bullets: [
          'Wk 1–2 — you approve every action, one at a time',
          'Wk 3–4 — it runs a bounded task unattended',
          'Wk 5–6 — it reaches real systems · Wk 7–8 — it coordinates and schedules',
          'Wk 9 — it handles its own failures',
          'Wk 10–12 — it acts under policy, human-gated on high risk, fully audited',
        ],
        diagram: `flowchart LR
  W1["👀 Wk 1–2<br/>you approve<br/>everything"] --> W3["🕐 Wk 3–4<br/>bounded, unattended"]
  W3 --> W5["🤝 Wk 5–8<br/>real systems,<br/>a team, a schedule"]
  W5 --> W9["🛡️ Wk 9<br/>survives failure"]
  W9 --> W10["⚖️ Wk 10<br/>acts under policy,<br/>human-gated, audited"]`,
        script: 'Open by naming the ladder out loud and pointing at the last rung. Ask: "who in this room would have let a Week 1 Claude Code session run in Auto mode against production?" Nobody. "So what changed between then and now?" Let them answer. The honest answer is: nothing yet. That is what tonight is for.',
      },
      {
        segment: 'checkin',
        eyebrow: '🎯 Tonight and Thursday',
        title: 'Three proofs — one blocked, one escalated, one reconstructed',
        body: 'Here is the whole week in one line: by Thursday night your system can refuse an action, escalate an action, and explain an action. Tonight is the design — five factors, one gate, one default, one ID. Thursday you build it over the system you have carried through three intensives, and you record the three proofs. Not three claims. Three demos.',
        bullets: [
          '🚫 BLOCKED — a disallowed action denied, with a reason a human can act on',
          '🙋 ESCALATED — a high-risk action paused, approved, and resumed exactly once',
          '🕵️ RECONSTRUCTED — the whole decision recovered from one correlation ID',
          'Readiness check: your Week 9 reliability layer is in place — governance sits in front of it',
        ],
        diagram: `flowchart TD
  T["🎯 Week 10"] --> B["🚫 Blocked<br/>with a reason"]
  T --> E["🙋 Escalated<br/>then resumed"]
  T --> R["🕵️ Reconstructed<br/>from one ID"]
  B --> P["📼 Three demos,<br/>not three claims"]
  E --> P
  R --> P`,
        script: 'Say the three proofs and hold up three fingers; you will come back to those fingers four times tonight. Then run the readiness roll call on the pulse rail — anyone whose Week 9 layer is not in place goes to a mentor at the break, not now.',
      },

      /* ===================== business problem ============================ */
      {
        segment: 'business-problem',
        eyebrow: '🚨 The 2 AM question',
        title: 'It is 2 AM and it did something nobody approved. Who answers for it?',
        body: 'At 3:14 in the morning a support agent you built decides a customer deserves a refund. It is not confused and it is not broken — it reasons its way there, calls the tool you gave it, and moves nine thousand dollars. There is no error in the log because nothing errored. By the time anyone looks, the money is gone, the customer has been notified, and the only person who can explain the decision is a language model that does not remember making it. Nothing in the last nine weeks would have stopped that.',
        bullets: [
          'You spent three intensives making it capable. Capable is not the same as permitted.',
          'It did not malfunction — it did exactly what you built it to be able to do',
          'The 2 AM question has changed: not "does anything happen?" but "who answers for it?"',
          'Act IV starts here: the question is no longer can I build it, it is who is accountable',
        ],
        diagram: `flowchart LR
  A["🤖 Capable agent<br/>Weeks 1–9"] --> D["🧠 It reasons its<br/>way to an action"]
  D --> S["💸 Side effect fires<br/>03:14 AM"]
  S --> Q["❓ Who approved<br/>this?"]
  Q --> N["🤷 Nobody.<br/>And no record."]`,
        script: 'Open cold and slow. Read the title, then pause for a full beat. Ask the room: "your agent from last week can send email and touch your data. Hands up — who would let it run unsupervised against your production systems tonight?" No hands go up. Then: "That reluctance is not caution. It is a correct engineering judgement, and it is the business problem. Governance is how you earn the yes."',
      },
      {
        segment: 'business-problem',
        eyebrow: '↩️ There is no undo',
        title: 'A read error costs you a retry. An action error costs you a consequence.',
        body: 'Everything you hardened last week was recoverable. A timeout retries. A failed parse throws. A crashed worker restarts. That is why Week 9 worked — failure was survivable because nothing had left the building. Actions are different in kind, not degree. The money moved. The email is in a human being’s inbox. The row is deleted. The permission is granted. There is no compensating action for most of these, which is why the control has to exist before the action, not after it.',
        bullets: [
          'Retryable: reads, parses, computations, anything that stayed inside your process',
          'Irreversible: money, messages to real humans, deletes, access grants, identity actions',
          'The question is never "can the agent do this?" — it is "is it permitted, here, now?"',
          'Week 9 made failure survivable. Week 10 makes some failures impossible.',
        ],
        diagram: `flowchart TD
  E["⚡ Something<br/>goes wrong"] --> R["🔁 Inside your process<br/>→ retry, recover"]
  E --> A["🌍 Out in the world<br/>→ no undo"]
  A --> M["💸 Money moved"]
  A --> C["📧 Human received it"]
  A --> D["🗑️ Data deleted"]`,
        script: 'Make it personal and get a count: "hands up if your system touches money, messages a real person, or deletes something." Most hands stay up. "Then you already own this failure mode — you just have not met it yet. Governance is not theatre for the compliance team. It is the difference between an agent and a liability."',
      },
      {
        segment: 'business-problem',
        eyebrow: '⏱️ The one point that matters',
        title: 'The check has to run BEFORE the side effect. Everything else tonight is detail.',
        body: 'If you take one sentence out of Week 10, take this one. The tempting shortcut is to ship the capable agent now and add governance later — a wrapper, a nightly log review, an alerting rule. That design leaks on day one, because by the time the after-the-fact check runs, the effect is already real. Governance-after is a smoke detector you read the following morning. Governance-first is a lock on the door. Every governance incident I have watched in production was the top timeline on this diagram.',
        bullets: [
          'Governance-after: act → log → discover → too late. The effect is already in the world.',
          'Governance-first: request → evaluate → the effect fires only if permitted',
          'The most common production incident in this space: "we logged it but we did not block it"',
          'A log is evidence. Only a gate is a control.',
        ],
        diagram: `flowchart LR
  A1["📨 Request"] --> A2["💥 Side effect fires"]
  A2 --> A3["🧾 You read the log<br/>next morning"]
  B1["📨 Request"] --> B2["⚖️ Policy decides"]
  B2 --> B3["💥 Side effect —<br/>only if permitted"]`,
        script: 'Draw both timelines on the board before you show the slide. On the top one, circle the gap between ACT and CHECK and label it "leaked actions live here." Then say the line plainly and slowly: "the check runs before the side effect." Have the room say it back once. Tonight and Thursday you will only build the bottom timeline.',
      },
      {
        segment: 'business-problem',
        eyebrow: '🏛️ Your native language',
        title: 'You already run this conversation at work. Tonight you learn to write it in code.',
        body: 'Nobody in this room needs to be convinced that authority has limits. You already work inside approval thresholds, delegated signing authority, segregation of duties, and an audit that shows up once a year and asks awkward questions. Every one of those controls exists because somebody once acted without permission. What is new is not the concept — it is that the actor is now software that never sleeps, and the control has to be expressed as a policy file and a function instead of a signature on a form. This is the week where your day job is the advantage.',
        bullets: [
          'Approval threshold → an escalate rule with an amount in it',
          'Delegation of authority → an ABAC rule scoped by role, resource, and environment',
          'Segregation of duties → the requester is never the approver',
          'The annual audit → reconstruct() on one correlation ID, in one second',
        ],
        diagram: `flowchart LR
  B["🏢 What you<br/>already run"] --> T["💵 Approval<br/>thresholds"]
  B --> D["✍️ Delegated<br/>authority"]
  B --> S["👥 Segregation<br/>of duties"]
  B --> A["📚 The audit"]
  T --> G["⚙️ Tonight: the same<br/>controls, as code"]
  D --> G
  S --> G
  A --> G`,
        script: 'This is the slide that changes the temperature of the room. Say it directly: "for nine weeks the engineers in here had the advantage. Tonight the people who have sat on a risk committee have it." Then ask two students to name one control from their own organization out loud, and map it to the diagram live. The architect who can explain why the system refused is the one the business hands more autonomy to — say that, because it is the career argument for this entire week.',
      },

      /* ======================== architecture ============================= */
      {
        segment: 'architecture',
        eyebrow: '🏛️ The engine',
        title: 'Four parts in a strict order: policy, evaluator, human gate, audit',
        body: 'The Governance Engine is not one component. It is four, and the order they run in is load-bearing. A policy declares what is permitted — data, not code, so changing what your agent may do is a config change and a code review, not a redeploy. An evaluator reads a request against that policy and returns a decision. A human gate catches the decisions a machine should not make alone. An audit trail records every decision so any of them can be reconstructed. All four sit on the hot path, in front of every side-effecting action, and behind them sits the reliability layer you built last week.',
        bullets: [
          'POLICY — declarative rules over five factors; reviewable by a non-engineer',
          'EVALUATOR — a pure function: (request, policy) → decision. No I/O, no surprises.',
          'HUMAN GATE — pauses high-risk actions, escalates, resumes on approval',
          'AUDIT — append-only, keyed on a correlation ID, secrets redacted',
          'Order: evaluate → audit → (maybe escalate) → act. Never act → audit.',
        ],
        code: {
          kind: 'review',
          label: 'governance/gate.ts — the one function everything routes through',
          code: '// EVERY side effect in your system routes through this one door.\nexport async function governedExecute<T>(\n  req: ActionRequest,\n  sideEffect: () => Promise<T>,\n): Promise<GateResult<T>> {\n  const decision = evaluate(req);                  // 1. POLICY + EVALUATOR\n  await audit.record(req, decision, "decided");    // 2. AUDIT, before anything fires\n\n  if (decision.effect === "deny") {\n    return { ok: false, decision };                // blocked: sideEffect is unreachable\n  }\n  if (decision.effect === "escalate") {\n    const queued = await hitl.enqueue(req, decision);            // 3. HUMAN GATE\n    return { ok: false, decision: { ...decision, queueId: queued.id } };\n  }\n\n  const result = await sideEffect();               // 4. ALLOW — only now does it fire\n  await audit.record(req, decision, "executed");\n  return { ok: true, result };\n}',
          expectedResult: 'Put your finger on the sideEffect() call. Notice how many returns happen above it.',
        },
        diagram: `flowchart LR
  R["📨 Request"] --> E["⚖️ Evaluator<br/>+ policy"]
  E --> AU["🧾 Audit<br/>the decision"]
  AU --> H{"🙋 High risk?"}
  H -->|"yes"| Q["⏸️ Human gate<br/>(queued)"]
  H -->|"no · allowed"| S["💥 Side effect"]
  H -->|"no · denied"| X["🚫 Stop"]`,
        script: 'Walk the four parts left to right, then put the code on screen and trace one allowed request with your finger: evaluate, audit "decided", run the side effect, audit "executed". Then trace a deny and show that the function physically returns before the side effect line is ever reached. Say it once: "the side effect is unreachable unless the decision permits it." That sentence is the architecture.',
      },
      {
        segment: 'architecture',
        eyebrow: '🧬 Five-factor ABAC',
        title: 'Not "what is your role" — who, on what, doing what, where, at what risk',
        body: 'Role-based access control asks one question: who are you? That works for a filing cabinet and fails immediately for an agent, because the same agent doing the same action is fine at noon in dev and catastrophic at 3 AM in production for nine hundred dollars. Attribute-based access control evaluates five factors on every single request. USER: the roles and attributes of the caller. RESOURCE: what is being acted on, and who owns it. ACTION: the specific verb. CONTEXT: environment, channel, time, amount. RISK: a tier you compute. A rule only matches when all five line up, which is exactly what lets one small readable policy govern a large system.',
        bullets: [
          '1️⃣ USER — roles and attributes. Is this a bot? An admin? Acting on its own resource?',
          '2️⃣ RESOURCE — type, owner, sensitivity. A refund is not a blog draft.',
          '3️⃣ ACTION — the verb. refund.issue is not ticket.read.',
          '4️⃣ CONTEXT — env, channel, time, amount. Prod at 3 AM is not dev at noon.',
          '5️⃣ RISK — a derived tier, low through critical, that any factor can push upward',
        ],
        diagram: `flowchart TD
  U["1️⃣ USER<br/>roles"] --> DEC["⚖️ Decision"]
  RS["2️⃣ RESOURCE<br/>type + owner"] --> DEC
  AC["3️⃣ ACTION<br/>the verb"] --> DEC
  CX["4️⃣ CONTEXT<br/>env · time · amount"] --> DEC
  RK["5️⃣ RISK<br/>computed tier"] --> DEC
  DEC --> O["allow · deny<br/>· escalate"]`,
        script: 'Name the five factors on your fingers and make the room say them back once. Then ask a student to describe a rule from their own job — an approval limit, a four-eyes requirement — and map it onto the five factors live on the board. Almost every real corporate control decomposes cleanly into these five, and watching that happen is what makes ABAC click.',
      },
      {
        segment: 'architecture',
        eyebrow: '⚖️ The trust boundary',
        title: 'Risk is the one factor you compute. It is never a field the caller sends.',
        body: 'Four of the five factors arrive with the request. The fifth does not, and this is the sharpest engineering distinction in the whole design. If the caller can tell you its own risk tier, then a confused agent — or a prompt-injected one, or a compromised service — simply declares itself low risk and walks straight through the gate. So you derive risk from the action, the resource, and the context, in your own code, every time. A lock whose key is printed on the door is not a lock.',
        bullets: [
          'The caller sends: who, what, which action, what context — all inspectable facts',
          'You compute: which high-risk categories this touches, and the resulting tier',
          'Never accept riskTier, isSafe, alreadyApproved, or skipGovernance from a caller',
          'Test for it explicitly: send a request that lies about its own risk and assert it is ignored',
        ],
        diagram: `flowchart LR
  C["📨 Caller sends<br/>user · resource<br/>· action · context"] --> B{"🚧 Trust<br/>boundary"}
  B --> K["🧮 YOU compute<br/>the risk tier"]
  L["🎭 Caller claims<br/>riskTier: low"] -.->|"ignored"| B
  K --> D["⚖️ Decision"]`,
        script: 'Ask the trap question before you explain: "the agent sends us a request that says riskTier: low. Do we use it?" Someone will say yes. Then land it: "that is the entire attack. Risk is computed by us, never claimed by the caller." Tell them the unit test for this is one of the three tests you will insist on Thursday.',
      },
      {
        segment: 'architecture',
        eyebrow: '🙋 Human-in-the-loop',
        title: 'Eight categories a machine may not green-light alone — and the under-15% rule',
        body: 'Some actions are too consequential for an automated allow no matter how confident the model sounds. Eight categories cover almost everything that has ever gone badly wrong: money movement, data deletion, external communication to real people, access grants, credential access, production writes, acting as another identity, and anything with no compensating action. Any request touching one of these escalates instead of executing. The engineering skill is not escalating everything — it is keeping escalation under about fifteen percent, because a human asked to approve eighty percent of actions becomes a rubber stamp, and a rubber stamp is worse than no control at all.',
        bullets: [
          'financial_movement · data_deletion · external_communication · access_grant',
          'credential_access · production_write · identity_action · irreversible_side_effect',
          'Target under 15% escalation — escalate the dangerous few, auto-allow the safe many',
          'Path: pause → notify out of band → approve or deny → resume. Never block the caller thread.',
        ],
        diagram: `flowchart LR
  A["⚠️ High-risk<br/>categories"] --> M["💰 Money<br/>🗑️ Deletion"]
  A --> C["📣 External messages<br/>🔑 Access + secrets"]
  A --> P["🏭 Prod writes · 🎭 Identity<br/>⛔ Irreversible"]
  M --> E["🙋 Escalate<br/>to a human"]
  C --> E
  P --> E`,
        script: 'Read all eight aloud slowly and let the room feel the pattern: money, deletion, real-world messages, access, secrets, production, identity, irreversibility. Then the punchline they will remember: "a governance engine that escalates eighty percent of actions gets switched off by Friday, and then you have no governance at all. The number is the design."',
      },
      {
        segment: 'architecture',
        eyebrow: '🔒 Fail-closed',
        title: 'Absence of a decision IS a decision — and the decision is no',
        body: 'Here is the default that makes the whole engine trustworthy. If no rule explicitly permits an action, the action is denied. A missing rule, a policy file that failed to parse, an action nobody anticipated, a typo in a rule id — all of them resolve to deny, never to allow. This is the opposite of almost every system you have configured, which defaults open and adds a blocklist. Fail-open asks you to enumerate everything dangerous, and you cannot; fail-closed asks you to enumerate everything safe, and you can. That inversion is the entire safety posture.',
        bullets: [
          'No explicit allow → deny. Ungoverned equals disallowed.',
          'Policy fails to load → deny. A broken control is a closed control.',
          'It protects you from your own bugs: a rule that never matches denies, it does not expose',
          'It is also the highest-scoring single choice on INPACT Permitted and the GOALS Governance pillar',
        ],
        diagram: `flowchart TD
  R["📨 Request"] --> W{"🔎 Does a rule<br/>explicitly permit it?"}
  W -->|"yes"| A["✅ Allow<br/>(or escalate)"]
  W -->|"no"| D["🚫 Deny —<br/>fail-closed default"]
  W -->|"policy failed<br/>to load"| D
  W -->|"action nobody<br/>anticipated"| D`,
        script: 'This is the philosophical centre of the night — slow all the way down. Say it twice: "fail-open asks you to list everything bad. Fail-closed asks you to list everything good. You can enumerate what is safe. You can never enumerate what is dangerous." Then warn them about the feeling: on Thursday their first fail-closed run will deny something harmless and they will assume it is broken. It is not. That is it working.',
      },
      {
        segment: 'architecture',
        eyebrow: '🧾 The audit trail',
        title: 'One correlation ID, minted at the door, reconstructs the whole decision',
        body: 'Three weeks after the fact somebody asks why your agent did that. You cannot answer from memory and you cannot answer by grepping five services. You answer from an audit trail: an append-only record where every decision, tool call, approval, and write carries the same correlation ID, minted once at the true entry point and threaded through everything downstream. Mint it late and part of the story is untraceable. Update or delete a row and it stops being an audit trail and becomes a suggestion. And redact on write, because a governance log full of tokens is not a control, it is a new vulnerability.',
        bullets: [
          'One UUID v4 minted at the entry point — reuse an inbound X-Correlation-ID so traces span services',
          'Append-only. Never UPDATE, never DELETE. A correction is a new row.',
          'Redact on write: passwords, tokens, keys, card numbers never reach the trail',
          'Reconstruct = one query by correlationId, ordered by time = the full story',
        ],
        diagram: `flowchart LR
  E["🚪 Entry point<br/>mint the ID"] --> D["⚖️ Decision<br/>row"]
  D --> AP["🙋 Approval<br/>row"]
  AP --> X["💥 Execution<br/>row"]
  X --> Q["🔍 reconstruct(id)<br/>→ the whole story"]`,
        script: 'Point at "mint at the door" twice. "If your correlation ID is created inside the business logic, then auth, routing, and validation all happened invisibly." Then the redaction line: "redact on write, not on read — because the read might be a CSV somebody emails." Close with the sentence that sells it to an executive: "any decision, fully explainable, from one key."',
      },
      {
        segment: 'architecture',
        eyebrow: '🤖 The line you do not cross',
        title: 'The model is never the judge of its own permissions',
        body: 'A reasonable-sounding idea will occur to somebody in this room: why not just ask Claude whether the action is allowed? Three reasons, and they are all disqualifying. It is non-deterministic, so the same request can be permitted twice and denied once. It is being asked to grade its own homework, since the thing requesting the action is the thing approving it. And it can be talked out of a no by the very input it is evaluating — the injected instruction sits inside the text you hand it. The ALLOW, DENY, ESCALATE decision stays in deterministic code you can unit-test. A model may summarize risk for the human approver, but it never holds the gavel.',
        bullets: [
          'Deterministic: same request, same decision, every time — and unit-testable',
          'Free and fast: a policy walk is microseconds, and it costs zero tokens on the hot path',
          'Separation of duties applies to software too: the requester is not the approver',
          'Legitimate model use: draft a plain-English risk brief for the human reviewing the queue',
          'If you do that, use claude-haiku-4-5 with output_config + a json_schema — the top-level output_format parameter is deprecated',
        ],
        diagram: `flowchart LR
  R["📨 Request"] --> EV["⚙️ Deterministic<br/>evaluator"]
  EV --> DEC["⚖️ allow · deny<br/>· escalate"]
  DEC --> Q["📋 Human queue"]
  M["🧠 claude-haiku-4-5"] -.->|"risk summary<br/>for the human"| Q
  M -.->|"never decides"| DEC`,
        script: 'Ask the question before they do: "why not just ask Claude if it is allowed?" Take answers, then give the three reasons and put weight on the third — prompt injection means the text being judged can argue with the judge. Note the dashed lines on the diagram: the model touches the human queue, never the decision. Then the API correction while you are here: output_config with a json_schema, not the deprecated top-level output_format.',
      },

      /* ========================= deconstruct ============================= */
      {
        segment: 'deconstruct',
        eyebrow: '🔬 Trace it by hand',
        title: 'One $900 refund, factor by factor, before we write any code',
        body: 'Let us run a real request through the evaluator on the board. A support bot requests a nine hundred dollar refund in production at 3:14 AM. Watch all five factors resolve. USER is a bot with the role support_bot. RESOURCE is a refund belonging to a customer. ACTION is refund.issue. CONTEXT is prod, channel chat, amount 900. And RISK computes to critical, because the amount crosses the threshold you set. No allow rule covers a critical-tier refund, but an escalate rule matches refunds — and escalate beats the fail-closed deny. The decision is: escalate. The money does not move.',
        bullets: [
          'USER support_bot · RESOURCE refund · ACTION refund.issue',
          'CONTEXT env=prod, amount=900 · RISK critical, because WE computed it',
          'Matched rule: escalate-high-value-refund → effect ESCALATE',
          'The side effect does not fire. It becomes a pending decision waiting for a person.',
        ],
        code: {
          kind: 'review',
          label: 'The exact request that produces an escalate — read it, do not paste it',
          code: 'const req: ActionRequest = {\n  correlationId: "8f3c1e60-...",                                   // minted at the door\n  principal: { userId: "support-bot-7", roles: ["support_bot"] },  // 1. USER\n  resource:  { type: "refund", id: "rf_912", ownerId: "cust_44" }, // 2. RESOURCE\n  action:    "refund.issue",                                       // 3. ACTION\n  context:   { env: "prod", channel: "chat", amount: 900 },         // 4. CONTEXT\n};                                        // 5. RISK is computed, never sent\n\nevaluate(req);\n// => {\n//      effect:      "escalate",\n//      riskTier:    "critical",\n//      matchedRule: "escalate-high-value-refund",\n//      reason:      "Refunds over $500 escalate to a human."\n//    }',
          expectedResult: 'Five factors in, one decision out — and the decision is not a boolean, it is a decision with a reason attached.',
        },
        diagram: `flowchart LR
  Q["🤖 support_bot<br/>refund.issue $900"] --> F["🧬 Five factors<br/>resolved"]
  F --> RK["🔥 Risk: critical<br/>(amount ≥ 500)"]
  RK --> RU["📜 Rule: escalate-<br/>high-value-refund"]
  RU --> D["🙋 ESCALATE<br/>money does not move"]`,
        script: 'Do this live on the board with nothing running. Ask the room to call out each factor as you point at it. When you get to RISK, ask "who decided this was critical?" — the answer is WE did, from the amount. "The bot never got a vote on its own risk level. That is the point."',
      },
      {
        segment: 'deconstruct',
        eyebrow: '🩻 Two versions',
        title: 'The only difference is which line runs first — and that is the whole week',
        body: 'Here are two implementations of the same feature, both written by competent engineers, both passing their tests. The first calls the payment client and then writes an audit row. It is honest, it is well-intentioned, and it leaks every single time, because the money left before anything was consulted. The second wraps the identical side effect in the gate, so the decision happens first and the payment call is unreachable unless the decision permits it. Same feature. Same tests, probably. One of them is a control and the other is a receipt.',
        bullets: [
          'Version A: act, then record → you can explain what happened, never prevent it',
          'Version B: decide, record, then act → the side effect is physically unreachable on a deny',
          'Both look reasonable in code review. That is exactly why this is worth an hour of class.',
          'Reviewer test: can you find a call site that causes a side effect outside the gate? Then you are ungoverned.',
        ],
        code: {
          kind: 'review',
          label: 'Governance-after vs governance-first — read both, then say which one you have shipped',
          code: '// ---------- A · GOVERNANCE-AFTER — this is the one that leaks ----------\nconst result = await payments.refund(900);              // the money is already gone\nawait audit.record(req, evaluate(req), "logged");       // a receipt, not a control\n// The evaluator ran. It even said "escalate". Nobody was listening.\n\n// ---------- B · GOVERNANCE-FIRST — the side effect is unreachable -------\nconst out = await governedExecute(req, () => payments.refund(900));\nif (!out.ok) return respond(out.decision);              // blocked, or queued for a human\n// payments.refund is inside a closure the gate may simply never call.',
          expectedResult: 'In version A the evaluator still runs — and it still says escalate. Notice that it changes nothing.',
        },
        diagram: `flowchart TD
  A["🅰️ act → record"] --> AL["💸 Effect is real<br/>before anyone decided"]
  AL --> AR["🧾 A receipt"]
  B["🅱️ decide → record → act"] --> BL["⚖️ Decision gates<br/>the closure"]
  BL --> BR["🔒 A control"]`,
        script: 'Put version A on screen without comment and ask the room whether it looks fine. It does — that is the trap. Then reveal that the evaluator in version A ran and returned escalate, and it changed nothing at all, because the refund was on the previous line. "The evaluator was not the control. The gate is the control."',
      },
      {
        segment: 'deconstruct',
        eyebrow: '🔄 The escalation lifecycle',
        title: 'Pause, notify, approve, resume — and the double-click that sends two refunds',
        body: 'An escalated action must not block the caller and must not evaporate. It becomes a durable pending row with the full request and decision captured, status pending. The approver is notified out of band — email, chat, a queue page — and the calling thread returns immediately with a queue id. When a human approves, the status flips, and only then may the original side effect resume. Every step here has to be idempotent, because retries are normal and humans double-click. A retried enqueue that creates two pending rows is a double refund waiting to happen.',
        bullets: [
          'pending → (a human decides) → approved | denied → (if approved) → resumed',
          'Idempotent enqueue: one row per (correlationId, action). Retries return the existing row.',
          'Idempotent resolve: resolving an already-resolved row is a no-op, not a second decision',
          'Guard double-resume: an approved action fires exactly once, then becomes resumed forever',
          'Never block the caller waiting on a person. The approver may be asleep — that is the normal case.',
        ],
        diagram: `flowchart LR
  D["🙋 Escalate"] --> P["⏸️ pending row<br/>(durable)"]
  P --> N["📣 Notify approver<br/>out of band"]
  N --> H{"👤 Human decides"}
  H -->|"approve"| RS["▶️ resume once<br/>→ status: resumed"]
  H -->|"deny"| X["🚫 denied, audited"]
  RS -.->|"second resume<br/>= no-op"| X`,
        script: 'Ask the trap question and let them squirm: "the approver double-clicks Approve. What happens?" Then show the guard: resolving a row that is not pending returns it unchanged. "That one line is the difference between a nine hundred dollar refund and an eighteen hundred dollar refund. In governance, idempotency is not a nicety — it IS the control."',
      },
      {
        segment: 'deconstruct',
        eyebrow: '🕵️ Reconstruct',
        title: 'Three rows, one ID, the entire story — with no secrets in it',
        body: 'This is the payoff of everything you just designed. Weeks later, compliance asks what happened with refund rf_912. You do not spelunk through five services. You run reconstruct on one correlation ID and you get an ordered timeline: at 3:14 the machine escalated because the amount was critical, at 9:02 a named human approved it, and one second later it executed via HITL resume. Every row carries the same ID, every row is readable by a non-engineer, and no card number or token appears anywhere, because redaction happened at write time. That is what "explainable" actually means in production.',
        bullets: [
          'One query, one ID → the complete, ordered life of a decision',
          'decided (escalate, critical) → approved (by whom, when) → executed (via hitl_resume)',
          'The ID is the join key across every service — no cross-log archaeology',
          'This IS the INPACT Transparent dimension, delivered rather than described',
        ],
        code: {
          kind: 'review',
          label: 'What reconstruct() returns — read it as one sentence',
          code: 'await reconstruct("8f3c1e60-...");\n// [\n//   { ts: "03:14:00", phase: "decided",  effect: "escalate", riskTier: "critical",\n//     action: "refund.issue", matchedRule: "escalate-high-value-refund" },\n//\n//   { ts: "09:02:11", phase: "approved", action: "refund.issue",\n//     meta: { approverId: "ali@colaberry.com" } },\n//\n//   { ts: "09:02:12", phase: "executed", action: "refund.issue",\n//     meta: { via: "hitl_resume" } }\n// ]\n// Three rows, one id, the whole story.\n// No card number. No token. Redacted on write, not on read.',
          expectedResult: 'A timeline you could paste into an email to an auditor without editing it first.',
        },
        diagram: `flowchart LR
  ID["🔑 One correlation ID"] --> R1["🕒 03:14 decided<br/>escalate · critical"]
  R1 --> R2["🕘 09:02 approved<br/>by a named human"]
  R2 --> R3["🕘 09:02 executed<br/>via hitl_resume"]
  R3 --> A["📜 An answer you<br/>can hand an auditor"]`,
        script: 'Read the three rows aloud as one sentence: "at three in the morning the machine said escalate, at nine a human approved it, one second later it ran." Then the standard: "if you cannot produce this from one ID, your system is not auditable — and in Week 12 that is a question the panel will ask you."',
      },

      /* ========================= micro-build ============================= */
      {
        segment: 'micro-build',
        eyebrow: '🛠️ Ten minutes',
        title: 'Build the smallest real thing: one rule that denies, and explains why',
        body: 'You are not building the engine tonight — that is Thursday. Tonight you prove you can express a permission decision as data plus a pure function, with a fail-closed default underneath it. One rule: a bot may not hard-delete in production. One function: decide. One property that matters more than the rule itself: when nothing matches, the answer is deny. Direct Claude Code to write it, then read what came back — that is the same job you have done since Week 1, pointed at a new target.',
        bullets: [
          'Goal: request in → { effect, reason, rule } out, defaulting to deny',
          'The rule is DATA — a predicate over the factors, an effect, and a reason',
          'The reason string is not decoration; it is what the caller and the audit row both show',
          'Ten minutes. If yours denies AND explains why, you have the whole day in miniature.',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — the scratch evaluator',
          code: 'Create a scratch file called governance_scratch.ts in this project. It is a teaching sketch, not part of my application yet.\n\nIt should contain:\n1. A Req type with role (string), action (string), and ctx: { env: "dev" | "staging" | "prod" }.\n2. A Decision type with effect ("allow" | "deny"), reason (string), and rule (string).\n3. ONE rule object named denyBotProdDelete with an id, a when(r: Req) predicate that is true when the role is "support_bot" AND the action ends in ".delete" AND ctx.env is "prod", an effect of "deny", and a plain-English reason a non-engineer could act on.\n4. A pure function decide(r: Req): Decision that checks that one rule and — this is the important part — returns a DENY when no rule matched, never an allow. Put a comment on that line saying it is the fail-closed default.\n5. At the bottom, call decide() twice and print both results: once with a support_bot doing "user.delete" in prod, and once with the same bot doing "ticket.read" in prod.\n\nNo imports, no I/O, under 40 lines. Show me the file before running anything.',
          expectedResult: 'A single short file with one rule, one pure decide() function, and two printed decisions at the bottom.',
          stopCondition: 'You can point at the line that returns deny when nothing matched.',
        },
        diagram: `flowchart LR
  P["⌨️ Your prompt"] --> CC["💻 Claude Code"]
  CC --> F["📄 governance_scratch.ts"]
  F --> RU["📜 One rule<br/>(data)"]
  F --> DE["⚙️ decide()<br/>(pure function)"]
  F --> FD["🔒 Fail-closed<br/>default"]`,
        script: 'Set a visible ten-minute timer and say the bar out loud: "one deny, with a reason." Paste the prompt on screen and narrate requirement 4 while Claude Code works — that requirement is the entire lesson and everything else is scaffolding.',
      },
      {
        segment: 'micro-build',
        eyebrow: '👀 Read it together',
        title: 'The most important line in the file is the last return',
        body: 'This is roughly what should be in your folder now. Yours will differ in wording and that is fine — three things must be present. The rule is a plain object with a predicate; there is no framework and no magic. The decision carries a reason a human can act on, not a boolean. And the bottom of the function returns deny. In almost any other function you have written, the fall-through at the bottom returns true, or null, or the happy default. Here it returns no. That inversion is the safety posture of the entire engine.',
        bullets: [
          'The rule is data: a when() predicate, an effect, a reason',
          'The decision is not a boolean — a bare false cannot be audited or explained',
          'The last return is DENY. Read it out loud.',
          'A typo in your rule id now fails closed: you get denied, not exposed',
        ],
        code: {
          kind: 'review',
          label: 'governance_scratch.ts — read it, do not paste it',
          code: 'type Ctx = { env: "dev" | "staging" | "prod" };\ntype Req = { role: string; action: string; ctx: Ctx };\ntype Decision = { effect: "allow" | "deny"; reason: string; rule: string };\n\nconst denyBotProdDelete = {\n  id: "deny-prod-delete-by-bot",\n  when: (r: Req) =>\n    r.role === "support_bot" &&\n    r.action.endsWith(".delete") &&\n    r.ctx.env === "prod",\n  effect: "deny" as const,\n  reason: "Bots may not hard-delete in production.",\n};\n\nfunction decide(r: Req): Decision {\n  if (denyBotProdDelete.when(r)) {\n    return { effect: "deny", reason: denyBotProdDelete.reason, rule: denyBotProdDelete.id };\n  }\n  // FAIL-CLOSED: no rule permitted this, so deny. Never fall through to allow.\n  return { effect: "deny", reason: "No rule permits this action (fail-closed default).", rule: "default-deny" };\n}',
          expectedResult: 'Two fingers on two lines: the when() predicate, and the fail-closed return at the bottom.',
        },
        diagram: `flowchart TD
  F["📄 The scratch file"] --> A["📜 Rule as data<br/>when + effect + reason"]
  F --> B["⚙️ decide()<br/>pure, no I/O"]
  F --> C["🔒 Bottom return<br/>= DENY"]
  C --> D["🛡️ Protects you<br/>from your own typos"]`,
        script: 'Open the REAL file Claude Code wrote on your screen, not this slide — the slide is your safety net if the generated file drifted. Two fingers, two lines, then move. Ask: "how many of the five factors does this rule touch?" Three — user, action, context. "The other two are just more conditions. The shape does not change."',
      },
      {
        segment: 'micro-build',
        eyebrow: '▶️ Run it',
        title: 'Run both requests — and be surprised that the harmless one is denied too',
        body: 'Run it. The dangerous request comes back denied with a reason you could put in front of a customer service manager. And then the benign one — a bot reading a ticket — comes back denied as well, because no rule permits it yet and fail-closed means unlisted equals denied. That second result is the one people call a bug. It is not. It is the engine doing its job on the very first run, and on Thursday you will open it up deliberately, one allow rule at a time.',
        bullets: [
          'Result 1: deny, "Bots may not hard-delete in production." — the rule fired',
          'Result 2: deny, "No rule permits this action (fail-closed default)." — nothing matched',
          'That second one is correct and it should feel wrong. Sit with it.',
          'Thursday: you add the narrow allow rules that let the safe majority through',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'your TERMINAL (not Claude Code)',
          label: 'Terminal — run the scratch evaluator',
          code: '# from your project folder\nnpx tsx governance_scratch.ts\n\n# expected: TWO decisions printed, and BOTH of them say deny\n# the second one should say "fail-closed default" — that is not a bug',
          expectedResult: 'Two printed decisions. Both deny. The second one names the fail-closed default as its rule.',
          stopCondition: 'You have seen a harmless read get denied and you understand why that is correct.',
          rescue: 'npx tsx not found? Tell Claude Code: "run governance_scratch.ts however is easiest in this project" and let it choose the runner.',
        },
        diagram: `flowchart LR
  R1["🗑️ bot · user.delete<br/>· prod"] --> D1["🚫 deny<br/>rule fired"]
  R2["📖 bot · ticket.read<br/>· prod"] --> D2["🚫 deny<br/>fail-closed default"]
  D2 --> S["😯 Surprising —<br/>and correct"]`,
        script: 'Let the second result land and name the reaction before someone says it: "wait, we blocked a harmless read?" Yes. "A governance engine starts closed and you open it deliberately, rule by rule. That is the opposite of every firewall you have ever configured, and it is the correct default when the actor is autonomous."',
      },
      {
        segment: 'micro-build',
        eyebrow: '📋 Your own system',
        title: 'Before Thursday: name every action in YOUR build plan that cannot be undone',
        body: 'Everything tonight was a refund because a refund is easy to picture. Thursday is not about refunds — it is about your capstone. So the homework is the most valuable thirty minutes of the week: open your own project and inventory every action it can take that reaches the real world. You cannot govern what you have not named, and on Thursday this list becomes your policy file, your risk categories, and your escalation rules. Students who arrive with this list finish all four checkpoints. Students who arrive without it spend the first hour writing it.',
        bullets: [
          'Every side effect, named in verb.noun form: refund.issue, email.send, record.delete',
          'Which of the eight categories it falls into — and whether it can be undone',
          'The three that should escalate to a human rather than auto-allow',
          'Bring the list Thursday. It becomes your policy file in the first twenty minutes.',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          ccMode: 'Plan Mode',
          label: 'Claude Code prompt — inventory YOUR irreversible actions',
          code: 'Read my build plan and the code in this project. Do not change anything.\n\nProduce a table called IRREVERSIBLE ACTIONS. For every action my system can take that causes a real-world side effect, give me:\n- the action name in verb.noun form (for example refund.issue, email.send, record.delete)\n- the file and function where the side effect actually fires\n- which of these it falls into: financial_movement, data_deletion, external_communication, access_grant, credential_access, production_write, identity_action, irreversible_side_effect\n- whether a compensating action exists — can it be undone? yes or no\n- who in my organization would have to answer for it if it fired wrongly at 2 AM\n\nRank the table worst-case-first. Then tell me which three should escalate to a human rather than being auto-allowed, and why.\n\nSave it as GOVERNANCE_INVENTORY.md.',
          expectedResult: 'A ranked table of your own irreversible actions, with three of them flagged for human approval.',
          stopCondition: 'You can name, out loud, the single worst thing your system could do unsupervised at 2 AM.',
        },
        diagram: `flowchart LR
  P["📋 Your build plan<br/>+ your code"] --> I["🔎 Inventory every<br/>side effect"]
  I --> C["🏷️ Category<br/>+ reversible?"]
  C --> T["🥇 Ranked<br/>worst-case first"]
  T --> TH["🔨 Thursday:<br/>this becomes<br/>your policy file"]`,
        script: 'Close the night here. Have three students name the worst thing their own system could do unsupervised — say it out loud, in the room. That is the moment governance stops being abstract. Then the open loop into Thursday: "you have designed a conscience tonight. Thursday you install one, and we watch it stop something."',
      },
    ],

    storyBeats: {
      checkin: [
        {
          icon: '🪜',
          tone: 'violet',
          eyebrow: 'Change of pace — how far you have come',
          title: 'Nine weeks ago you would not let it rename a file without watching',
          body: 'Remember Week 1, sitting in Plan Mode, reading every proposed edit before approving it, half-expecting it to wander off and wreck something. It never did, and slowly you stopped watching so closely. That is not carelessness — that is exactly how trust is supposed to be earned, in increments, by a system that keeps proving itself. But somewhere in the last nine weeks the reins got long enough that nobody is holding them at 2 AM.',
          punch: 'Autonomy you granted by drifting is the only kind that has no policy behind it.',
        },
      ],
      'business-problem': [
        {
          icon: '🌃',
          tone: 'cherry',
          eyebrow: 'Change of pace — 3:14 AM',
          title: 'The system did not fail. That is what made it unanswerable.',
          body: 'A support agent handled 4,100 tickets in a month, and 4,099 of them were unremarkable. On the 4,100th it read an angry message about a two-week-late delivery, reasoned that the customer deserved to be made whole, and issued a nine thousand dollar refund at 3:14 in the morning. There was no exception, no alert, no retry storm — nothing for the reliability layer to catch, because nothing had gone wrong in the engineering sense. Someone noticed nine days later, in a reconciliation report.',
          punch: 'Nothing broke. That is precisely why nobody found out for nine days.',
        },
      ],
      architecture: [
        {
          icon: '🌙',
          tone: 'amber',
          eyebrow: 'Change of pace — the person who is not there',
          title: 'The approver nobody can find at 2 AM',
          body: 'Every escalation design eventually meets the same wall: the human it escalates to is asleep, on a plane, or left the company in March. Teams respond to this in one of two ways. The first builds a timeout that auto-approves after an hour, which is not a human gate at all — it is a delay with extra steps. The second accepts that the action waits, makes the pending row durable, and makes the resume clean whenever the approver finally shows up. Only one of those is governance.',
          punch: 'The approver being unavailable is not the exception you design around. It is the normal case, and it is exactly why the gate must resume cleanly hours later.',
        },
      ],
      deconstruct: [
        {
          icon: '🖱️',
          tone: 'berry',
          eyebrow: 'Change of pace — the double-click',
          title: 'Two wire transfers, one approval, one impatient finger',
          body: 'An operations manager opened the approval queue on a slow laptop, clicked Approve, saw nothing happen, and clicked again. The queue had no idempotency guard, so the second click resolved the row a second time and the resume ran twice. Two identical transfers left the account four hundred milliseconds apart. The post-mortem did not blame the manager, and it should not have — a control that assumes a human clicks exactly once has misunderstood humans.',
          punch: 'Idempotency in a governance gate is not defensive programming. It is the control itself.',
        },
      ],
      'micro-build': [
        {
          icon: '🏛️',
          tone: 'leaf',
          eyebrow: 'Change of pace — why this week is your week',
          title: 'The architect who could explain the refusal got the bigger system',
          body: 'Two teams presented agents to the same executive committee. The first demoed a system that did everything asked of it and, when someone asked what would stop it doing something reckless, described a monitoring dashboard. The second demoed a system that refused an action live on screen, showed the rule that refused it in a file a non-engineer could read, and reconstructed the whole decision from one ID. The second team got production access and a bigger budget. Their system was not more capable. It was more explainable.',
          punch: 'The architect who can explain why the system said no is the one the business trusts with more autonomy.',
        },
      ],
    },

    extraInteractions: [
      {
        segment: 'cold-open',
        kind: 'prediction',
        q: 'Your Week 9 agent can send email and touch production data. Would you let it run unsupervised against your company’s real systems tonight?',
        options: ['Yes, it has been reliable', 'Only for read-only actions', 'Only with someone watching the logs', 'Absolutely not'],
        reveal: 'Almost nobody says yes — and that instinct is correct. Tonight we turn that instinct into a design instead of a feeling.',
        eyebrow: '🚦 Before we start',
        title: 'Would you turn it loose tonight?',
        presenterTip: 'No right answer. Read the split out loud, then say: "the reluctance is not caution, it is a missing layer. Let us go build the missing layer."',
      },
      {
        segment: 'checkin',
        kind: 'poll',
        q: 'Roll call — is Week 9’s reliability layer (timeouts, retries, breaker) in place in your project?',
        options: ['Yes, running', 'Partly — some paths only', 'Not yet', 'Not sure where it lives'],
        reveal: 'Governance sits IN FRONT of reliability on the same hot path. If your Week 9 layer is thin, Thursday still works — you will just wrap fewer call sites.',
        eyebrow: '🧰 Readiness',
        title: 'Do you have last week’s layer?',
        presenterTip: 'Operational roll call. Anyone red gets a mentor at the break — do not stop the class for it.',
      },
      {
        segment: 'business-problem',
        kind: 'poll',
        q: 'Where must the policy check run relative to the side effect?',
        options: ['Immediately after, so you can log what happened', 'Before it, so a denied action never fires', 'Nightly, in a review job', 'Whenever the model decides to ask'],
        answer: 1,
        reveal: 'Before. Always before. An after-the-fact check is a receipt, not a control — the money already moved, the email is already in an inbox.',
        theater: true,
        eyebrow: '⏱️ The decision of the week',
        title: 'Before or after?',
        presenterTip: 'This is the one theater moment tonight. Lock the votes, hold the reveal for a beat, then say the line: "the check runs BEFORE the side effect." Have them say it back.',
      },
      {
        segment: 'architecture',
        kind: 'poll',
        q: 'An incoming request includes a field that says riskTier: "low", alongside a $900 refund. What do you do with that field?',
        options: ['Trust it — the caller knows its own context', 'Ignore it and compute risk yourself', 'Average it with your own estimate', 'Log it and allow the action'],
        answer: 1,
        reveal: 'Risk is the one factor you always compute. A caller that can declare itself low-risk is a lock whose key is printed on the door.',
        eyebrow: '🚧 Trust boundary',
        title: 'The caller says it is low risk',
        presenterTip: 'Diagnostic. Some rooms split on option 3 — name that as the dangerous middle ground: a compromise between trusting and verifying is still trusting.',
      },
      {
        segment: 'deconstruct',
        kind: 'poll',
        q: 'The approver double-clicks Approve on a pending $900 refund. Without an idempotency guard, what happens?',
        options: ['Nothing — the second click is ignored by the browser', 'The row resolves twice and the refund fires twice', 'The database rejects it automatically', 'The model notices and stops it'],
        answer: 1,
        reveal: 'It fires twice. The guard is one line: if the row is not "pending", return it unchanged. That line is the difference between $900 and $1,800.',
        eyebrow: '🖱️ Diagnose it',
        title: 'One approval, two clicks',
        presenterTip: 'Let them squirm before revealing. Then connect back to Week 9: idempotency was reliability engineering there; here it is the control itself.',
      },
      {
        segment: 'micro-build',
        kind: 'poll',
        q: 'Your fail-closed evaluator just denied a completely harmless read. What is your first move?',
        options: ['Change the default to allow', 'Add a narrow allow rule for that action', 'Wrap it in a try/catch', 'Turn governance off for reads'],
        answer: 1,
        reveal: 'You open the engine deliberately, one narrow rule at a time. Changing the default to allow throws away the entire safety posture to fix one inconvenience.',
        eyebrow: '🔒 Judgment call',
        title: 'It denied something harmless',
        presenterTip: 'Option 1 is the tempting one and some hands will go there honestly. Praise the instinct, then explain why it trades a permanent guarantee for a temporary annoyance.',
      },
      {
        segment: 'trivia',
        kind: 'trivia',
        q: 'Fail-closed means…',
        options: ['Allow when the policy is unclear', 'Deny when no rule explicitly permits the action', 'Crash the process on an unknown action', 'Retry until a rule matches'],
        answer: 1,
        reveal: 'No explicit permission means denied. Ungoverned equals disallowed — including when the policy file itself failed to load.',
        eyebrow: '🧠 Knowledge check',
        title: 'Say it precisely',
        presenterTip: 'Read the reveal exactly as written. "Crash" is a real distractor — failing closed is a decision, not an outage.',
      },
      {
        segment: 'trailer',
        kind: 'poll',
        q: 'Of Thursday’s three proofs, which one do you expect to be hardest in YOUR system?',
        options: ['Blocking a disallowed action', 'Escalating and resuming cleanly', 'Reconstructing a decision from one ID', 'Finding all my side effects in the first place'],
        reveal: 'Most rooms pick the last one — and they are right. That is why your homework is the inventory, not the code.',
        eyebrow: '🎬 Thursday',
        title: 'Which proof scares you?',
        presenterTip: 'No right answer. Use the split to set homework expectations, then close on the inventory prompt from the last slide.',
      },
    ],
  },

  /* ======================================================================== */
  /*  THURSDAY — BUILD DAY                                                    */
  /* ======================================================================== */
  thursday: {
    teach: [
      /* ========================== build map ============================== */
      {
        segment: 'build-map',
        eyebrow: '🗺️ Tonight’s result',
        title: 'By 8:30 you will have made your own system refuse to do something',
        body: 'Four checkpoints, each with a demo rather than a claim. CP0: you inventory every side effect in your own system and route them through one door. CP1: an ABAC evaluator blocks a disallowed action, fail-closed, with a reason. CP2: a high-risk action escalates to a human, gets approved, and resumes exactly once. CP3: you reconstruct that entire decision from a single correlation ID. The night ends with the demo the whole week is named after — the same request run twice, once ungoverned and once through the gate.',
        bullets: [
          'CP0 Baseline — every side effect found and routed through governedExecute',
          'CP1 Policy blocks — a denied action, with a reason, and proof the side effect never ran',
          'CP2 Human gate — escalate, approve, resume exactly once',
          'CP3 Auditable — one correlation ID reconstructs the decision end to end',
          'Deliverable: governance/ = policy + evaluator + gate + HITL queue + audit log',
        ],
        diagram: `flowchart LR
  C0["0️⃣ One door<br/>governedExecute"] --> C1["1️⃣ Blocked<br/>with a reason"]
  C1 --> C2["2️⃣ Escalated<br/>+ resumed once"]
  C2 --> C3["3️⃣ Reconstructed<br/>from one ID"]
  C3 --> D["🎬 The demo:<br/>same request,<br/>stopped"]`,
        script: 'Show the four checkpoints as a ladder and set the standard immediately: "you are not done with a rung until you can SHOW it firing. A checkpoint is a demo, not a claim." Then promise the ending explicitly — the two-run demo — because that promise carries the room through the middle of the build.',
      },
      {
        segment: 'build-map',
        eyebrow: '📁 Readiness + layout',
        title: 'One module, one import surface, exactly one door',
        body: 'Before any code, agree on the shape. Everything lives in one governance folder so the four parts sit together and the rest of your system imports exactly one function. That single choke point is what makes the system auditable at all: if an action can cause a side effect and does not go through governedExecute, it is ungoverned by definition, and no amount of policy authoring fixes it. Readiness is four things — your project running, Week 9’s reliability layer present, Claude Code open in the repo, and Monday’s inventory in your hand.',
        bullets: [
          'types.ts — the contracts · policy.ts — the rules (data) · risk.ts — the eight categories',
          'evaluator.ts — pure decision · gate.ts — the door · hitl.ts — the queue · audit.ts — the trail',
          'Readiness: project runs · Week 9 layer present · Claude Code open · inventory in hand',
          'No inventory? Run Monday’s last prompt right now — it takes four minutes and saves forty',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'your TERMINAL (not Claude Code)',
          label: 'Terminal — create the module (pick your OS)',
          code: '# macOS / Linux\nmkdir -p governance\ntouch governance/types.ts governance/policy.ts governance/risk.ts\ntouch governance/evaluator.ts governance/gate.ts governance/hitl.ts governance/audit.ts\n\n# Windows PowerShell\nNew-Item -ItemType Directory -Force governance\n"types","policy","risk","evaluator","gate","hitl","audit" | ForEach-Object { New-Item -ItemType File "governance/$_.ts" }\n\n# both — you should see seven files\nls governance',
          expectedResult: 'Seven empty files in a governance/ folder.',
          stopCondition: 'Everyone can see seven files listed. This is the last purely mechanical step tonight.',
          rescue: 'On Windows and the quotes are fighting you? Just create the folder and let Claude Code create the files in the next step.',
        },
        diagram: `flowchart LR
  APP["⚙️ Your system"] --> G["🚪 governedExecute<br/>the ONE door"]
  G --> P["📜 policy + risk"]
  G --> E["⚙️ evaluator"]
  G --> H["🙋 hitl queue"]
  G --> A["🧾 audit trail"]`,
        script: 'Run the four-point readiness roll call on the pulse rail first — anyone missing the inventory runs Monday’s prompt right now while the rest create the folder. Then say the sentence that governs the whole night: "one door. If a side effect can happen anywhere else, you do not have governance, you have a suggestion."',
      },

      /* ========================= guided build ============================ */
      {
        segment: 'guided-build',
        eyebrow: '0️⃣ CP0 · Find every door',
        title: 'You cannot govern what you have not found',
        body: 'Start where Monday’s homework ended. Have Claude Code read your project and locate every place a side effect actually fires — money, messages, deletes, access grants, secret reads, production writes. Then have it propose the smallest refactor that routes all of them through one function. Do this in Plan Mode and read the list before approving anything, because this list is about to become your policy file, and a side effect that is missing here will be ungoverned for the rest of the program.',
        bullets: [
          'Plan Mode — you are reading a list, not accepting a refactor yet',
          'Every call site: file, function, and whether it currently has ANY check in front of it',
          'A verb.noun action name for each one — that name goes straight into the policy',
          'Expect surprises. Everyone finds at least one side effect they had forgotten about.',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          ccMode: 'Plan Mode',
          label: 'Claude Code prompt — inventory and propose one door',
          code: 'In Plan Mode. Do not change any code yet.\n\nRead this project and find every place where a side effect actually fires — anything that moves money, sends a message to a real person, deletes or overwrites stored data, grants access or roles, reads a secret, or writes to production.\n\nFor each one give me:\n- the call site: file, function, line\n- a verb.noun action name I could put in a policy file\n- whether it currently has ANY permission check in front of it\n\nThen propose the smallest refactor that routes every one of them through a single function called governedExecute(request, sideEffect), so my system has exactly one door. List the files you would touch and the order you would touch them in.\n\nDo not touch them yet. I want to read the list first.',
          expectedResult: 'A list of real call sites in YOUR project, each with an action name, and a refactor plan you have not approved yet.',
          stopCondition: 'You have read the list and it matches what you expected — plus at least one thing you had forgotten.',
          rescue: 'List looks thin? Tell it: "also search for HTTP clients, email/SMS SDKs, file deletes, and any raw SQL that is not a SELECT."',
        },
        diagram: `flowchart LR
  R[("📁 Your repo")] --> S["🔎 Find every<br/>side effect"]
  S --> N["🏷️ Name each one<br/>verb.noun"]
  N --> P["🗺️ Refactor plan:<br/>one door"]
  P --> A["✅ You approve<br/>before any edit"]`,
        script: 'Have two students read their longest forgotten side effect out loud. There is always one — a fire-and-forget email, a cleanup job, a webhook that writes. That moment does more for the lesson than any slide: "you have been running ungoverned for nine weeks and this is the first time anyone counted the doors."',
      },
      {
        segment: 'guided-build',
        eyebrow: '1️⃣ Step 1 · The thread',
        title: 'Mint the correlation ID at the door, not at the desk',
        body: 'Everything downstream hangs off one identifier, so it is the first thing you build. At the true entry point of any request or scheduled job, reuse an inbound X-Correlation-ID if there is one — so a trace can span services — or mint a fresh UUID v4. Attach it to the request, echo it on the response, and thread it through every log line. Mint it late, inside your business logic, and everything that happened before it — auth, routing, validation — is invisible to your audit trail forever.',
        bullets: [
          'Reuse an inbound X-Correlation-ID; otherwise mint a UUID v4',
          'Register the middleware BEFORE any route that can cause a side effect',
          'Scheduled jobs and workers mint one ID per run, at the top',
          'Every structured log line in a side-effecting path carries correlationId',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — correlation IDs everywhere',
          code: 'Add correlation IDs to this project.\n\n1. Create middleware that runs BEFORE any route that can cause a side effect. It reuses an inbound X-Correlation-ID header when present, otherwise mints a fresh UUID v4, attaches it to the request object, and echoes it back on the response header.\n2. Do the same for my scheduled jobs and background workers: each run mints one ID at the very top and passes it down through every function that can act.\n3. Update the log lines in every side-effecting path to emit structured JSON including a correlationId field.\n\nThen show me exactly where you registered the middleware, and prove it runs before the routes. If an ID is being minted anywhere other than an entry point, tell me where and fix it.',
          expectedResult: 'A registered middleware, an echoed X-Correlation-ID header on a real response, and correlationId appearing in your logs.',
          stopCondition: 'You can hit one endpoint and see the same ID in the response header AND in the log line.',
          rescue: 'ID missing from some logs? That path probably has its own logger. Tell Claude Code to find every logger and thread the ID through all of them.',
        },
        diagram: `flowchart LR
  IN["📥 Request or<br/>scheduled run"] --> M["🧵 Mint / reuse<br/>correlation ID"]
  M --> RT["🛣️ Routes +<br/>business logic"]
  RT --> LG["📝 Every log line"]
  RT --> SE["💥 Every side effect"]
  M --> HD["📤 Echoed on<br/>the response"]`,
        script: 'Have them curl one endpoint twice — once with their own X-Correlation-ID header and once without — and watch it echo back both times. Then the rule: "mint at the door, not at the desk." Thirty seconds of proof now saves the CP3 demo later.',
      },
      {
        segment: 'guided-build',
        eyebrow: '2️⃣ Step 2 · The policy',
        title: 'Write the rules as data — a non-engineer must be able to read this file',
        body: 'Now the policy file, and it is the one artifact in your whole system that a compliance officer could review without help. Each rule declares who, on what resource, doing what action, in what environment, up to what risk tier — plus its effect. Keep logic out of it entirely; the moment a rule contains a function call, the file stops being reviewable. Use the action names from your CP0 inventory, not generic examples, so the policy describes your system and not a refund demo.',
        bullets: [
          'A rule = id + one-sentence description + a five-factor match block + an effect',
          'Three seed rules: one deny, one escalate on your highest-value action, one narrow allow',
          'DEFAULT_DECISION lives here too — effect deny, reason "no policy rule permits this"',
          'Data and types only. No imports from your application. No logic.',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — the ABAC policy file',
          code: 'Create governance/policy.ts.\n\nExport an AbacRule interface and a POLICY array. A rule has: id, a one-sentence human-readable description, an effect of "allow" | "deny" | "escalate", and a match block covering the five ABAC factors — roles, resourceTypes, actions (support a "*.read" style glob), context.env, and maxRiskTier.\n\nSeed POLICY using the real action names from my GOVERNANCE_INVENTORY.md:\n- one DENY rule for the most dangerous thing a bot should never do in production\n- one ESCALATE rule for the highest-stakes action in my inventory\n- one narrow ALLOW rule that lets the safe read-only majority through\n\nAlso export DEFAULT_DECISION with effect "deny" and the reason "No policy rule permits this action (fail-closed default)."\n\nThis file must contain data and types only — no logic, no imports from my app. When you are done, print the three rules as plain English sentences so I can check that a non-engineer would understand them.',
          expectedResult: 'Three rules written against YOUR action names, plus a fail-closed default, and three plain-English sentences describing them.',
          stopCondition: 'You can read your own policy out loud and a non-engineer in the room understands what your agent may and may not do.',
        },
        diagram: `flowchart LR
  I["📋 Your inventory"] --> P["📜 policy.ts"]
  P --> D["🚫 One deny rule"]
  P --> E["🙋 One escalate rule"]
  P --> A["✅ One narrow allow"]
  P --> F["🔒 DEFAULT_DECISION<br/>= deny"]`,
        script: 'Have two students read their three rules out loud as sentences. If the room cannot follow a rule from hearing it, the description is wrong — fix it there and then. Say the standard: "governance you cannot review is governance you cannot trust, and readability here is a feature, not a courtesy."',
      },
      {
        segment: 'guided-build',
        eyebrow: '3️⃣ Step 3 · Compute the risk',
        title: 'The eight categories — derived by you, never sent by the caller',
        body: 'Risk is the fifth factor and the only one you calculate. classifyRisk inspects the action, the resource, and the context, returns a tier from low to critical, and names the high-risk categories it triggered. Anything landing in one of the eight categories is at least high; money over your threshold or any hard delete is critical. Because you derive it, a confused or compromised agent cannot smuggle a dangerous action past the gate by claiming to be harmless. Write the test for that today, not after the incident.',
        bullets: [
          'Eight categories: money, deletion, external comms, access grants, credentials, prod writes, identity, irreversible',
          'Derive from action + resource + context only — never from a caller-supplied field',
          'At least "high" for any category hit; "critical" for money over threshold or any delete',
          'Required test: a request that sends its own riskTier is ignored and recomputed',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — the risk classifier + its tests',
          code: 'Create governance/risk.ts.\n\nExport HIGH_RISK_CATEGORIES as a const array of exactly these eight: financial_movement, data_deletion, external_communication, access_grant, credential_access, production_write, identity_action, irreversible_side_effect.\n\nExport classifyRisk(req) returning { tier, categories }, where tier is "low" | "medium" | "high" | "critical". Derive it ONLY from req.action, req.resource and req.context — never from any field the caller supplies. Anything matching a category is at least "high". Money above a threshold constant I can tune, or any data_deletion, is "critical". Map my own action names from GOVERNANCE_INVENTORY.md onto the categories, not generic refund examples.\n\nThen write unit tests: one per category, plus one test that passes in a request carrying its own riskTier: "low" field and asserts the computed tier ignores it entirely.\n\nRun the tests and show me they pass.',
          expectedResult: 'Green tests, including the one proving a caller-declared risk tier is ignored.',
          stopCondition: 'The "caller lies about its own risk" test passes.',
          rescue: 'Categories not matching your actions? Your action names are probably too generic — rename them verb.noun in the inventory first.',
        },
        diagram: `flowchart LR
  RQ["📨 action + resource<br/>+ context"] --> CL["🧮 classifyRisk()"]
  CL --> CT["🏷️ Categories hit"]
  CT --> TR["🔥 Tier: low → critical"]
  LIE["🎭 Caller-sent<br/>riskTier"] -.->|"ignored"| CL`,
        script: 'Point at the dashed line on the diagram and say it once more: "the caller sends facts, we compute judgement." Then have the room name one category their own system triggers that they had not thought about — external_communication catches almost everyone.',
      },
      {
        segment: 'guided-build',
        eyebrow: '4️⃣ Step 4 · The evaluator',
        title: 'Pure, deterministic, fail-closed, and under 10 milliseconds',
        body: 'Here is the heart of the engine, and it is a pure function: request in, decision out, no database, no network, no model call. Determinism is the point — the same request must produce the same decision every single time, or you cannot test it and you cannot defend it. Resolution order is deny first and short-circuiting, escalate remembered and beating any later allow, allow only sticking when nothing more restrictive matched, and the fail-closed default catching the fall-through. And because it runs on the hot path of every action, hold it to a budget so governance never becomes the bottleneck.',
        bullets: [
          'Pure function — no I/O, trivially unit-testable, deterministic by construction',
          'Resolution order: deny > escalate > allow > fail-closed default',
          'Budget: under 10ms; log a structured warning if it is exceeded',
          'Four required tests — including an action no rule mentions, which must come back denied',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — the evaluator + its tests',
          code: 'Create governance/evaluator.ts.\n\nExport a PURE function evaluate(req): Decision. No I/O, no database, no network, and no model call — same input, same decision, every time.\n\nIt must:\n1. Call classifyRisk(req) to compute the risk tier.\n2. Walk POLICY and keep only rules where ALL five factors match.\n3. Resolve in this order: a deny wins immediately and breaks the loop; an escalate is remembered and beats any later allow; an allow only sticks if nothing more restrictive matched.\n4. If nothing matched, return DEFAULT_DECISION — deny. Never fall through to allow.\n5. Time itself and emit a structured JSON warning including the correlationId if it exceeds 10ms.\n\nEvery Decision must carry: effect, reason, matchedRule, riskTier.\n\nThen write unit tests covering an explicit deny, an escalate beating a later allow, a plain allow, and — most important — an action that no rule mentions at all, which must come back denied. Run them.',
          expectedResult: 'Four green tests. The fourth one is the one that matters.',
          stopCondition: 'The "no rule mentions this action" test passes with a deny.',
        },
        diagram: `flowchart LR
  R["📨 Request"] --> RK["🧮 Compute risk"]
  RK --> W["🔁 Walk POLICY<br/>five-factor match"]
  W --> O{"⚖️ Resolve"}
  O -->|"deny wins"| D["🚫 deny"]
  O -->|"escalate beats allow"| E["🙋 escalate"]
  O -->|"nothing matched"| F["🔒 fail-closed deny"]`,
        script: 'Say "pure function" and explain why it earns its place: no I/O means you can run ten thousand policy tests in a second, and determinism means a decision you can reproduce in front of an auditor. Then flag the budget line as a smoke alarm, not a limit — a policy walk is microseconds today and the warning tells you the day that stops being true.',
      },
      {
        segment: 'guided-build',
        eyebrow: '👀 Read it together',
        title: 'Four lines carry the entire safety posture',
        body: 'Stop and read what came back before you build on it. Only four things matter in this function. Risk is computed inside, not accepted from outside. A deny breaks the loop, so nothing later can soften it. An escalate is kept and a subsequent allow cannot overwrite it, because of that one guard on the allow branch. And the nullish coalesce at the bottom means the absence of any matching rule resolves to deny. Everything else in the file is glue.',
        bullets: [
          'classifyRisk() is called here — the caller never supplies the tier',
          'deny → break. Nothing evaluated later can loosen a deny.',
          'allow only sets `chosen` when nothing is already chosen — that is how escalate wins',
          '`chosen ?? DEFAULT_DECISION` — the fail-closed line, in one operator',
        ],
        code: {
          kind: 'review',
          label: 'governance/evaluator.ts — read it, do not paste it',
          code: 'export function evaluate(req: ActionRequest): Decision {\n  const started = performance.now();\n  const { tier } = classifyRisk(req);          // computed here — never trusted from the caller\n  let chosen: Decision | null = null;\n\n  for (const rule of POLICY) {\n    if (!ruleMatches(rule, req, tier)) continue;\n    if (rule.effect === "deny")     { chosen = decisionFrom(rule, tier); break; }      // deny wins, stop\n    if (rule.effect === "escalate") { chosen = decisionFrom(rule, tier); continue; }   // remembered\n    if (rule.effect === "allow" && !chosen) chosen = decisionFrom(rule, tier);         // weakest\n  }\n\n  const decision = chosen ?? { ...DEFAULT_DECISION, riskTier: tier };   // FAIL-CLOSED\n  warnIfOverBudget(performance.now() - started, req.correlationId);\n  return decision;\n}',
          expectedResult: 'Four fingers on four lines: classifyRisk, the deny break, the !chosen guard, and the ?? default.',
        },
        diagram: `flowchart TD
  F["📄 evaluate()"] --> L1["🧮 risk computed<br/>inside"]
  F --> L2["🚫 deny breaks<br/>the loop"]
  F --> L3["🙋 allow cannot<br/>overwrite escalate"]
  F --> L4["🔒 ?? DEFAULT<br/>= fail-closed"]`,
        script: 'Open the REAL file Claude Code wrote, not this slide — the slide is your safety net if it drifted. Four fingers, four lines, then move. If a student’s generated version puts allow before the !chosen guard, that is a genuine bug worth fixing live: it means one broad allow can quietly override an escalate.',
      },
      {
        segment: 'guided-build',
        eyebrow: '5️⃣ CP1 · The gate',
        title: 'One door in front of every side effect — and prove the door is shut',
        body: 'The evaluator decides; the gate enforces. governedExecute wraps any side effect as a closure, evaluates the request, writes the audit row before anything can fire, and then branches. Deny returns without ever calling the closure. Escalate hands it to the human queue and returns. Only allow reaches the line that runs it. This is CP1, and the proof is not that it works — the proof is that the side effect line is unreachable. So put a log statement inside a real side effect and write the test that asserts it never printed.',
        bullets: [
          'The side effect is a closure the gate may simply never invoke',
          'Audit "decided" happens BEFORE the branch, so even a deny leaves a record',
          'Refactor your three highest-risk call sites from CP0 to go through it',
          'CP1 proof: a log line inside the side effect that never prints on a denied request',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — the gate, plus the proof',
          code: 'Create governance/gate.ts with governedExecute(req, sideEffect).\n\nThe order is load-bearing and I want exactly this:\n1. decision = evaluate(req)\n2. await audit.record(req, decision, "decided") — BEFORE anything can fire\n3. if the effect is "deny": return { ok: false, decision } and never call sideEffect\n4. if the effect is "escalate": await hitl.enqueue(req, decision), then return { ok: false, decision } including the queue id — still never call sideEffect\n5. only on "allow": call sideEffect(), then audit.record(..., "executed"), then return { ok: true, result }\n\nThen refactor the three highest-risk call sites from GOVERNANCE_INVENTORY.md to go through it.\n\nFinally, give me the proof: add console.log("SIDE EFFECT FIRED") as the FIRST line inside one of those side effects, and write a test that sends a request the policy denies and asserts that line never printed. I want the proof, not the claim.',
          expectedResult: 'A passing test proving the side effect never ran on a denied request.',
          stopCondition: 'You have watched a denied request come back with a reason, and the SIDE EFFECT FIRED line did not appear.',
          rescue: 'Line still printing? Something is calling the side effect outside the gate. Ask Claude Code to list every remaining call site that does not go through governedExecute.',
        },
        diagram: `flowchart LR
  RQ["📨 Request"] --> EV["⚖️ evaluate()"]
  EV --> AU["🧾 audit 'decided'"]
  AU --> BR{"🚦 effect?"}
  BR -->|"deny"| ST["🚫 return —<br/>closure never called"]
  BR -->|"escalate"| QU["⏸️ enqueue<br/>+ return"]
  BR -->|"allow"| SE["💥 sideEffect()<br/>then audit 'executed'"]`,
        script: 'This is CP1 and it deserves a pause. When the test goes green, say what actually happened: "the function that would have moved money was passed to the gate and the gate declined to call it. Not blocked afterwards — never called." Have three students tap "I finished" so you know who to call on for demos.',
      },
      {
        segment: 'guided-build',
        eyebrow: '6️⃣ CP2a · The human gate',
        title: 'Escalate durably, notify out of band, never block the caller',
        body: 'When the decision is escalate, the action has to survive until a human looks at it — which may be nine hours. So it becomes a durable row in your database, not a promise held in memory, because processes restart and in-memory pending actions simply vanish. The enqueue must be idempotent, enforced by a unique constraint rather than a hopeful check, so a retry returns the existing row instead of creating a second pending refund. The approver is notified out of band and the calling thread returns immediately with a queue id.',
        bullets: [
          'Durable: a pending row in the database, with the full request and decision captured',
          'Idempotent: unique on (correlationId, action) — a retry returns the existing row',
          'Out of band: email or chat. The caller thread never waits on a person.',
          'If the notification fails, the pending row still exists. Losing a notification must not lose the action.',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — the durable HITL queue',
          code: 'Create governance/hitl.ts with a durable pending queue.\n\n1. A PendingDecision persisted in my database (NOT in memory): id, correlationId, action, the full request, the decision, status ("pending" | "approved" | "denied" | "resumed"), createdAt, resolvedBy, resolvedAt.\n2. enqueue(req, decision) must be IDEMPOTENT and enforced at the database level: add a unique constraint on (correlationId, action), and on conflict return the existing row instead of inserting a second one. A retry must never create two pending actions.\n3. Notify the approver out of band using whatever email or chat path my project already has, then return immediately. The calling thread must never wait on a human.\n4. If the notification throws, the pending row must still exist and the error must be logged with the correlationId. Losing a notification must not lose the action.\n\nThen write a test that calls enqueue twice with the same request and asserts exactly one row exists.',
          expectedResult: 'One pending row after two enqueue calls, and a notification sent without the caller waiting.',
          stopCondition: 'The double-enqueue test passes with exactly one row.',
          rescue: 'No email path in your project? Have it log the notification as a structured JSON line for now — the queue is the control, the notification is delivery.',
        },
        diagram: `flowchart LR
  ES["🙋 escalate"] --> EN["🗄️ enqueue<br/>durable row"]
  EN --> UQ["🔐 unique on<br/>(corrId, action)"]
  EN --> NT["📣 notify approver<br/>out of band"]
  EN --> RT["↩️ caller returns<br/>immediately"]
  NT -.->|"fails? row<br/>still exists"| EN`,
        script: 'Stress durability and idempotency together, because they fail together. "A pending action that lives only in memory dies when the process restarts, and processes restart." Then the unique constraint: "a hopeful findOne-then-insert is a race. Put the guarantee in the database where two concurrent retries cannot both win."',
      },
      {
        segment: 'guided-build',
        eyebrow: '7️⃣ CP2b · Approve and resume',
        title: 'Exactly once — approve twice, resume twice, fire once',
        body: 'The human decides, and only then may the deferred side effect run. resolve flips a pending row to approved or denied and is a no-op if the row is already resolved, which is what makes a double-clicked Approve harmless. resume runs the original side effect only when the status is approved, then immediately marks the row resumed so it can never fire again. Both write audit rows capturing who approved and that execution happened via HITL resume. This completes CP2, and the test that matters is the ugly one: approve once, resume twice, assert the side effect ran exactly one time.',
        bullets: [
          'resolve on a non-pending row → return unchanged. Double-click safe.',
          'resume only when status is approved, then set resumed — a second resume fires nothing',
          'Both steps audit: who approved, when, and that execution came via hitl_resume',
          'The test: approve once, resume twice, side effect ran exactly once',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — resolve + resume, exactly once',
          code: 'Add resolve() and resume() to governance/hitl.ts.\n\nresolve(id, approverId, approved): load the row. If its status is not "pending", return it unchanged — a double-clicked Approve must be a no-op, not a second decision. Otherwise set the status to "approved" or "denied", record resolvedBy and resolvedAt, and write an audit row with the phase set accordingly.\n\nresume(id, sideEffect): load the row. Run the side effect ONLY if the status is "approved". Immediately afterwards set the status to "resumed" and write an audit row with meta { via: "hitl_resume" }. A second resume must return not-approved and fire nothing.\n\nAlso enforce segregation of duties: if resolvedBy equals the userId that requested the action, refuse the approval and say why.\n\nThen write the test I actually care about: approve once, call resume twice, and assert the side effect ran exactly ONE time.',
          expectedResult: 'A green "approve once, resume twice, fired once" test, and a refused self-approval.',
          stopCondition: 'You have seen the second resume return not-approved while the first one fired.',
        },
        diagram: `flowchart LR
  P["⏸️ pending"] --> RS["✅ resolve()<br/>approved"]
  RS --> RM["▶️ resume()<br/>fires once"]
  RM --> RD["🔒 status: resumed"]
  RD -.->|"resume again<br/>= nothing"| RD
  RS -.->|"self-approval<br/>refused"| P`,
        script: 'Do this one live in front of the room: approve a pending action, resume it, then call resume again while everyone watches. The second call returns not-approved and the mock client prints nothing. "Exactly once, under retry, is the only acceptable behaviour for money — and you just built it in eleven lines."',
      },
      {
        segment: 'guided-build',
        eyebrow: '8️⃣ CP3 · The trail',
        title: 'Append-only, redacted on write, reconstructable from one ID',
        body: 'CP3 is the payoff, and it is almost free now, because every phase already wrote a row carrying the same correlation ID. Make the trail append-only — never update, never delete, corrections are new rows — and redact secrets at write time so the log itself is never the leak. Then reconstruct is a single query ordered by time, returning the complete life of a decision: when the machine escalated, who approved it, and that it executed via resume. Write the redaction test today; an audit log that stores a token is an incident, not a nit.',
        bullets: [
          'record() appends: correlationId, ts, actor, action, effect, reason, matchedRule, riskTier, phase, meta',
          'Append-only. No UPDATE, no DELETE. A correction is a new row.',
          'Redact on write — password, token, secret, api key, authorization, ssn, card',
          'reconstruct(correlationId) → the ordered story, ready to hand to an auditor',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — the audit trail + reconstruction',
          code: 'Create governance/audit.ts.\n\n1. record(req, decision, phase, meta) appends ONE row: id, correlationId, ts, actor, action, effect, reason, matchedRule, riskTier, phase, meta. APPEND ONLY — no update path, no delete path. A correction is a new row.\n2. Redact ON WRITE: any key matching password, token, secret, api key, authorization, ssn, or card becomes "<redacted>" before it is stored. An audit log that stores secrets is a new vulnerability, not a control.\n3. reconstruct(correlationId) returns every row for that ID, ordered by time.\n4. Write a test that pushes an object containing an api_key and a card number through record(), then asserts the stored row does not contain either value anywhere.\n\nThen run reconstruct on the correlation ID from the action we just approved and print the timeline in a readable form.',
          expectedResult: 'A printed timeline — decided, approved, executed — sharing one ID, with no secret values anywhere in it.',
          stopCondition: 'You can read your own three-row timeline out loud, and the redaction test is green.',
          rescue: 'Only one row comes back? Your phases are probably writing different IDs — check that the resume path reuses the ORIGINAL request correlationId, not a fresh one.',
        },
        diagram: `flowchart LR
  D["⚖️ decided"] --> T[("🧾 Append-only<br/>trail")]
  A["✅ approved"] --> T
  X["💥 executed"] --> T
  S["🔐 redact on write"] --> T
  T --> RC["🔍 reconstruct(id)<br/>→ the story"]`,
        script: 'Have a student read their own reconstructed timeline aloud as one sentence. That is CP3 done, and it is the artifact that goes in their Week 12 portfolio. Then set the standard: "if a decision cannot be reconstructed from one ID, in this program it did not happen governably."',
      },

      /* =========================== failure =============================== */
      {
        segment: 'failure',
        eyebrow: '💥 Break it',
        title: 'Run your most dangerous action with governance switched off',
        body: 'Now prove why the engine matters by removing it. Take the worst action on your inventory and call the side effect directly — no evaluate, no gate, no audit, no human. It fires. It fires instantly, cleanly, with no friction and no record. There is no reason, no correlation ID, and nobody who could have stopped it. This is not a hypothetical failure mode; it is exactly what your system looked like at 6:30 tonight, and it is what governance-after ships to production every day.',
        bullets: [
          'Same action, same arguments, no gate — and a mock client so nothing real happens',
          'Watch the friction: there is none. That is the whole problem.',
          'No decision, no reason, no correlation ID, no audit row, no human',
          'Ask afterwards "why did this happen?" — there is no way to answer',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — the ungoverned run (a scratch file, not your app)',
          code: 'Create a temporary file scratch/ungoverned_demo.ts. Do NOT change my real code.\n\nIt should call the highest-risk side effect from GOVERNANCE_INVENTORY.md DIRECTLY — no evaluate, no gate, no audit, no human — using a realistic request. Use a mock client that prints "SIDE EFFECT FIRED: <what it would have done>" instead of doing anything real.\n\nThen run it and show me the output.\n\nDo not fix anything and do not add governance to this file. This is the "before" and I want to see it fire.',
          expectedResult: 'One line: SIDE EFFECT FIRED. No decision, no reason, no correlation ID, nothing else.',
          stopCondition: 'You have watched your own most dangerous action execute with zero friction.',
        },
        diagram: `flowchart LR
  R["📨 Request"] --> SE["💥 SIDE EFFECT<br/>FIRED"]
  SE --> N1["❌ No decision"]
  SE --> N2["❌ No audit row"]
  SE --> N3["❌ No human"]
  N2 --> Q["❓ Why did this<br/>happen? Unanswerable."]`,
        script: 'Run it live and let it fire with no ceremony at all. Sit in the silence for a beat. "That took no permission and left no trace. If a regulator asked why, your honest answer is a shrug." Then set up the next slide: "same request, one line of difference."',
      },
      {
        segment: 'failure',
        eyebrow: '🛑 The demo',
        title: 'This AI tried to act — governance stopped it',
        body: 'Now run the identical request through the gate, with the identical mock client and its identical print statement. The risk classifier marks it critical. The escalate rule matches. The gate writes the audit row and returns before the closure is ever invoked. And the thing everyone in the room is watching for — SIDE EFFECT FIRED — does not appear. Nothing about the action changed. Everything about whether it was permitted to fire unsupervised did. That silence on the screen is the entire week in one second.',
        bullets: [
          'Same request object. Same mock client. Same print statement.',
          'The output is a decision — effect, matched rule, risk tier, reason, queue id, correlation ID',
          'What is missing from the output is the point: the side effect line never printed',
          'It is not lost. It is a pending decision waiting for a human, already audited.',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — the governed run, then both side by side',
          code: 'Now create scratch/governed_demo.ts.\n\nBuild the IDENTICAL request object from ungoverned_demo.ts, but call it through the gate: governedExecute(req, () => mockClient.doTheThing()). Keep the mock client and its "SIDE EFFECT FIRED" line exactly as it is — do not change or remove it.\n\nPrint, clearly labelled: the decision effect, the matched rule, the computed risk tier, the reason, the queue id if it escalated, and the correlation ID.\n\nThen run both files back to back and show me the two outputs one after the other so I can read them side by side.',
          expectedResult: 'Run one prints SIDE EFFECT FIRED. Run two prints a decision — and does NOT print SIDE EFFECT FIRED at all.',
          stopCondition: 'You have both outputs on screen at once and can point at the line that is missing from the second one.',
          rescue: 'Second run still fired? Either the request does not match your escalate rule, or the call site is bypassing the gate. Print the decision first and read what it actually said.',
        },
        diagram: `flowchart LR
  RQ["📨 The SAME<br/>request"] --> U["🔓 Ungoverned<br/>run"]
  RQ --> G["🚪 Through<br/>the gate"]
  U --> F["💥 SIDE EFFECT<br/>FIRED"]
  G --> D["⚖️ escalate · critical<br/>· queued · audited"]
  D --> Q["🤫 Nothing fired"]`,
        script: 'This is the centrepiece of the week — stage it properly. Put both terminals on screen at once. Run the ungoverned one, let it print. Then run the governed one and STOP TALKING while the room reads the output looking for a line that is not there. Then say it: "the AI tried to act. Governance stopped it — before anything happened, not after." Take demos from three students right here while the energy is at its peak.',
      },
      {
        segment: 'failure',
        eyebrow: '🧯 Break the engine itself',
        title: 'Three ways a governance engine fails: slow, leaky, and stormy',
        body: 'Governance is code, so it has its own failure modes and you should find them tonight rather than in month three. It can be too slow, because it runs on the hot path of every action and a policy that grows teeth becomes a bottleneck. It can leak, because an audit trail collects exactly the sensitive material you least want copied into a spreadsheet. And it can storm, escalating so much that the human approver becomes a rubber stamp — at which point you have the cost of governance and none of the control. Measure all three, on your own system, now.',
        bullets: [
          '🐢 SLOW — p95 evaluation over 10ms means governance is now your bottleneck',
          '💧 LEAKY — a token or card number in the trail is an incident, not a nit',
          '🌪️ STORMY — over 15% escalation and your approver stops reading',
          'Fail-closed covers you while you fix all three: when in doubt, deny',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — audit your own governance engine',
          code: 'Audit my governance module for its own failure modes. Report numbers, do not silently change my policy.\n\n1. SLOW — evaluate() runs on the hot path of every action. Time it over 1,000 synthetic requests built from my real action names and report p50 and p95. If p95 is over 10ms, tell me which part is slow.\n2. LEAKY — scan every audit row written by my test suite for anything resembling a token, api key, password, card number, or SSN. Report any hit as an incident with the row id.\n3. STORMY — run my full policy against 100 realistic requests drawn from my own system and report the percentage that came back "escalate". If it is over 15%, name the single rule that is over-escalating and propose a narrower match block.\n\nGive me the three numbers first, then your proposed changes. Wait for my approval before editing policy.ts.',
          expectedResult: 'Three numbers: p95 evaluation time, leak count, escalation percentage — measured on YOUR policy.',
          stopCondition: 'You know your own escalation rate. Most first policies come in far above 15%.',
        },
        diagram: `flowchart TD
  G["⚙️ Your governance<br/>engine"] --> S["🐢 Slow<br/>p95 > 10ms"]
  G --> L["💧 Leaky<br/>secrets in the trail"]
  G --> E["🌪️ Stormy<br/>escalation > 15%"]
  S --> FC["🔒 Fail-closed<br/>holds while you fix"]
  L --> FC
  E --> FC`,
        script: 'Collect escalation percentages from the room out loud — they will be wildly high the first time, and that is the lesson. "A governance engine that escalates sixty percent of actions gets switched off by Friday, and then you have no governance at all. Tuning that number down without loosening the dangerous rules is the actual engineering skill of this week."',
      },
      {
        segment: 'failure',
        eyebrow: '🏁 Prove it',
        title: 'Write down what your system will NOT do — in language an executive can read',
        body: 'One last artifact, and it is the one that travels. Capture the three proofs with their real output — the blocked action, the escalate-approve-resume cycle, the reconstructed timeline — and then write the section that matters most to the people who decide whether your system ships: a plain-language list of what your agent is not permitted to do, and why. That page is your Week 11 architecture exhibit, your Week 12 defence, and the single most persuasive thing you can put in front of a risk committee. Capability is table stakes now. Restraint you can explain is the differentiator.',
        bullets: [
          'Three proofs, with real output pasted in — not descriptions of output',
          'Plus: WHAT THIS SYSTEM WILL NOT DO, written for a non-engineer',
          'This file is the Week 10 portfolio deliverable and the Week 11 exhibit',
          'Next Monday: Week 11, where you explain and defend the whole architecture',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — capture the evidence',
          code: 'Write GOVERNANCE_PROOFS.md in my repo. Use the REAL output we produced tonight, not a description of it.\n\n1. BLOCKED — the request, the decision, the matched rule, and the test proving the side effect line never ran.\n2. ESCALATED — the pending row, the approval, the resume, and the test proving the side effect ran exactly once across two resume calls.\n3. RECONSTRUCTED — the full reconstruct() timeline for one correlation ID, with secrets redacted.\n\nThen add a final section called WHAT THIS SYSTEM WILL NOT DO, written for a non-engineer executive: the specific actions my agent is not permitted to take, which of them escalate to a human instead, and why each limit exists. Plain language, no code, no jargon. Six bullets maximum.\n\nKeep it under two pages.',
          expectedResult: 'A two-page evidence file ending in six plain-English sentences about what your agent may never do alone.',
          stopCondition: 'You could hand the last section to your CFO without translating it.',
        },
        diagram: `flowchart LR
  P1["🚫 Blocked"] --> DOC["📄 GOVERNANCE_<br/>PROOFS.md"]
  P2["🙋 Escalated<br/>+ resumed once"] --> DOC
  P3["🕵️ Reconstructed"] --> DOC
  DOC --> EX["🏛️ What this system<br/>will NOT do"]
  EX --> W11["➡️ Week 11:<br/>explain and defend it"]`,
        script: 'Close the night on the executive section, not the code. Have one student read their six "will not do" bullets out loud. Then land the arc: "in Week 1 you approved every action because you did not trust it yet. Tonight it acts on its own, and you can say exactly where the line is and prove it holds. That is what accountability looks like." Then the open loop: "Monday you have to explain the whole system — every layer, every trust boundary, every decision. Week 11."',
      },
    ],

    beforeAfter: {
      label: 'The same action, governed',
      before: [
        'The agent reasons its way to a $900 refund at 3:14 AM',
        'The refund fires the instant the tool is called',
        'Nobody was asked; nothing was recorded',
        '"Why did it do that?" has no answer anyone can produce',
      ],
      after: [
        'The request is evaluated against five factors before anything runs',
        'Risk computes to critical — the side effect is never invoked at all',
        'A named human approves out of band; it resumes exactly once',
        'One correlation ID reconstructs the entire decision, secrets redacted',
      ],
    },

    storyBeats: {
      'result-preview': [
        {
          icon: '🧾',
          tone: 'amber',
          eyebrow: 'Change of pace — the email that arrives in November',
          title: '"On September 17 at 3:14 AM your system issued a refund. Please explain."',
          body: 'It is not an angry email. It is a routine one, from someone doing their job, and it gives you five business days. The team that shipped governance-after spends those five days grepping logs across four services, reconstructing a timeline from timestamps that do not quite line up, and eventually writing a paragraph that begins "we believe." The team that shipped governance-first runs one query, pastes three rows, and replies in under a minute.',
          punch: 'Nobody ever regretted the audit trail. Every single person regretted not having one.',
        },
      ],
      'build-map': [
        {
          icon: '🚪',
          tone: 'leaf',
          eyebrow: 'Change of pace — forty doors and one lobby',
          title: 'A building with forty side doors does not have a security desk. It has a lobby.',
          body: 'Every office building solves this the same way: you can leave through any door, but you can only enter through one, and that one has a desk with a person at it. Nobody argues that this is inelegant. It is the only arrangement where a single control can cover an entire building, and it is exactly why your system needs exactly one governedExecute rather than a permission check scattered near each side effect. A check you have to remember to add is a check you will eventually forget to add.',
          punch: 'One door is not a design constraint. It is the only reason the control can be trusted at all.',
        },
      ],
      failure: [
        {
          icon: '🤫',
          tone: 'cherry',
          eyebrow: 'Change of pace — the best demo is the one where nothing happens',
          title: 'The room went quiet waiting for a line that never printed',
          body: 'Every other demo in this program has been about making something appear — a reply, a record, a deployed service, a passing test. This one is the opposite. You run it, everyone leans in, and the line they are watching for simply is not there. There is a specific silence that happens in a room when people realize the absence is the achievement, and it usually takes about three seconds to arrive.',
          punch: 'For nine weeks you have been proving your system can act. Tonight you proved it can refuse.',
        },
        {
          icon: '🌪️',
          tone: 'berry',
          eyebrow: 'Change of pace — the gate that got switched off',
          title: 'They escalated eighty percent of actions. By Friday, approval was one click and no reading.',
          body: 'A team shipped a governance engine that was, on paper, excellent: every category covered, every rule strict, fail-closed throughout. It escalated four out of every five actions. Within a week the approver had a keyboard shortcut for Approve, was clearing the queue in batches during standup, and had stopped reading the requests entirely. The control still existed in the architecture diagram. It had stopped existing in reality.',
          punch: 'A human gate that approves everything is not a gate. Under fifteen percent is not a nice-to-have — it is what keeps the control real.',
        },
      ],
    },

    extraInteractions: [
      {
        segment: 'result-preview',
        kind: 'prediction',
        q: 'Tonight we run the same dangerous request twice — once ungoverned, once through the gate. What will the mock client print on the second run?',
        options: ['SIDE EFFECT FIRED, but with a warning', 'Nothing at all', 'SIDE EFFECT FIRED twice', 'An error stack trace'],
        answer: 1,
        reveal: 'Nothing. The side effect is a closure the gate simply never calls. It is not caught after firing — it never fires.',
        eyebrow: '🔮 Predict it',
        title: 'What does the second run print?',
        presenterTip: 'Ask this at the top of the night and write the room’s split on the board. Come back to it during the demo — being right about "nothing" is what makes the demo land.',
      },
      {
        segment: 'readiness',
        kind: 'poll',
        q: 'Roll call — do you have Monday’s GOVERNANCE_INVENTORY.md, listing your own irreversible actions?',
        options: ['Yes, ranked and ready', 'Started it but not finished', 'Not yet — running it now', 'I do not know which of my actions are irreversible'],
        reveal: 'The inventory is the single biggest predictor of who finishes all four checkpoints tonight. If you do not have it, run Monday’s last prompt in the next four minutes.',
        eyebrow: '🧰 Readiness',
        title: 'Do you have the inventory?',
        presenterTip: 'Operational roll call. Anyone on option 3 or 4 runs the prompt now while the rest create the module folder — do not let it become a break-time problem.',
      },
      {
        segment: 'build-map',
        kind: 'poll',
        q: 'How many places in YOUR system can cause a real-world side effect?',
        options: ['1–3', '4–10', 'More than 10', 'I genuinely have no idea yet'],
        reveal: 'No right answer — but "no idea" is the honest majority, and it is exactly why CP0 is finding the doors before building the lock.',
        eyebrow: '🚪 Self-check',
        title: 'Count your doors',
        presenterTip: 'Honest self-check. The point is discomfort, not accuracy. Follow it straight into the CP0 inventory prompt.',
      },
      {
        segment: 'guided-build',
        kind: 'poll',
        q: 'Your policy file has a syntax error and fails to load at startup. What should evaluate() return?',
        options: ['Allow, so the system keeps working', 'Deny, every time, until the policy loads', 'The last known good policy from cache', 'Throw and crash the process'],
        answer: 1,
        reveal: 'Deny. A broken control is a closed control. "Keep working" during a governance outage is exactly how ungoverned actions reach production.',
        eyebrow: '🔒 Diagnose it',
        title: 'The policy failed to load',
        presenterTip: 'Option 3 is the sophisticated-sounding trap — a stale cached policy is an unreviewed policy. Name that explicitly.',
      },
      {
        segment: 'guided-build',
        kind: 'poll',
        q: 'Your test says the decision was "deny", but SIDE EFFECT FIRED still printed. What is the most likely bug?',
        options: ['The evaluator returned the wrong effect', 'A call site is bypassing the gate entirely', 'The audit row was written too late', 'The risk tier was computed as low'],
        answer: 1,
        reveal: 'The decision was correct — something is calling the side effect outside governedExecute. One door means one door; find the second one.',
        eyebrow: '🩺 Diagnose it',
        title: 'Denied, and it fired anyway',
        presenterTip: 'This is the most common real bug of the night. Read the reveal, then tell them the fix: list every call site that does not route through the gate.',
      },
      {
        segment: 'failure',
        kind: 'poll',
        q: 'A high-risk action escalates at 2 AM and the approver is asleep. What should the calling thread do?',
        options: ['Block and wait until someone approves', 'Auto-approve after a 60-minute timeout', 'Return immediately with a queue id; resume later on approval', 'Deny and discard the action'],
        answer: 2,
        reveal: 'Return immediately. The pending row is durable, the approver is notified out of band, and the action resumes cleanly hours later — exactly once. An auto-approve timeout is not a human gate; it is a delay with extra steps.',
        theater: true,
        eyebrow: '🌙 The 2 AM decision',
        title: 'The approver is asleep',
        presenterTip: 'The one theater moment tonight. Option 2 always attracts votes — name it as the most dangerous answer on the board, because it looks responsible and removes the control entirely.',
      },
      {
        segment: 'demos',
        kind: 'poll',
        q: 'Which of the three proofs can you demo on YOUR system right now?',
        options: ['All three', 'Blocked and escalated', 'Blocked only', 'Still wiring it up'],
        reveal: 'Whatever you have, record it tonight while it is running. A proof you cannot reproduce next month is a claim.',
        eyebrow: '📼 Self-check',
        title: 'What can you show?',
        presenterTip: 'Use this to pick your three demo volunteers — take one from each of the first three options so the room sees a range, not just the finished ones.',
      },
      {
        segment: 'cta',
        kind: 'trivia',
        q: 'What single thing lets you reconstruct any decision your system made?',
        options: ['Larger log files', 'A correlation ID minted at the entry point', 'Asking the model what it remembers', 'A nightly summary report'],
        answer: 1,
        reveal: 'One ID, minted at the door and threaded through every log line, decision, approval, and side effect. Mint it late and part of the story is gone forever.',
        eyebrow: '🧠 Knowledge check',
        title: 'One ID, one story',
        presenterTip: 'Close the class on this. Then the open loop into Week 11: "Monday you have to explain this entire architecture to someone who did not build it."',
      },
    ],
  },
};
