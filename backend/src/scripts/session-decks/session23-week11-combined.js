/**
 * session23-week11-combined.js — builds the KitConfig for Session 23,
 * 2026-10-08, "Week 11 · Systems Architecture + Architecture Package".
 *
 * WHY A COMBINED SESSION
 * Session 22 (Week 11 Architecture Day) was not taught. Rather than add a
 * makeup night eight days before the Expo, Week 11's architecture teaching and
 * its build run as ONE class on this session. Session 22 is left alone.
 *
 * WHAT ALI ASKED FOR (2026-10-08, ~65 minutes before class)
 *   • combine both halves, without making it long
 *   • MORE theory, shaped so it can be run through quickly
 *   • NO MORE THAN 3 PROMPTS, but a story good enough to explain Systems
 *     Architecture
 *   • ~45 minutes of content inside a 60-minute room
 *   • remove every reference to the Monday/Thursday split — no "on Thursday we
 *     will…", no "by Thursday this exists", no "last Monday"
 *
 * HOW IT IS BUILT
 * This composes rather than transcribes. It runs inside the backend container,
 * requires the authored WEEK11_PACK from dist, and assembles the combined deck
 * from slides that already exist:
 *
 *   • TEN architecture slides lifted from week11.monday, re-segmented to
 *     'build-map' and placed FIRST, so the theory block runs before any
 *     keyboard comes out. build-map is the segment that sits between the
 *     readiness check and guided-build, which is exactly where a theory block
 *     belongs on a Build Day.
 *   • THREE guided-build prompt slides, newly authored here, that collapse the
 *     authored CP0-CP3 ladder (eight prompts) into three. Each one produces
 *     real files and is long enough to teach over while it runs.
 *   • ONE failure slide — the boundary-erasure drill, done out loud, no prompt.
 *
 * WHY checkpointsEnabled IS FALSE
 * The build-map slide and the CP0..CP3 slides render from week11.ts's own
 * `buildMap`/`checkpoints` arrays and are NOT overridable. They advertise four
 * checkpoints across eight prompts. Tonight is three prompts, so those five
 * slides would be stale in front of the room. Same trap as Week 4, 2026-08-20.
 *
 * WHY THE MONDAY SLIDES MOVE TO build-map AND NOT guided-build
 * guided-build is where the Build Bay renders prompts. Putting the theory there
 * works, but build-map comes first in the render order and carries no
 * checkpoint block once checkpointsEnabled is false — so it is empty, ordered
 * ahead of the prompts, and free. The theory lands before the build with no
 * reordering tricks.
 *
 * THE SPINE
 * "The building and the drawings." A system is a building with seven floors.
 * A trust boundary is the property line. An ADR is the drawing that carries a
 * signature, so the building survives the architect leaving. Two architects
 * walk into the same review; only the one with drawings gets funded.
 *
 * TIMING (45 minutes of content in a 60-minute room)
 *   cover + rules + result preview + baseline poll   ~5 min
 *   readiness                                        ~1 min
 *   theory, 10 slides                               ~19 min
 *   three prompts (paste, then teach while it runs) ~16 min
 *   boundary-erasure drill                           ~3 min
 *   close                                            ~3 min
 *
 * Run inside the container:   node /app/session23-week11-combined.js
 * Lint + compose locally:     node session23-week11-combined.js --check
 */

const L = (...lines) => lines.join('\n');

/* ------------------------------------------------------------------ lint -- */
/* Ali asked for every Monday/Thursday reference gone. Make it mechanical
 * rather than a promise: these patterns are rejected anywhere in the rendered
 * text of the deck this file produces. '8:30' goes too — the class now ends
 * around 19:15, and a slide that says 8:30 is a slide that lies. */
const BANNED = [
  /\bMonday\b/i,
  /\bTuesday\b/i,
  /\bWednesday\b/i,
  /\bThursday\b/i,
  /\bFriday night\b/i,
  /\b8:30\b/,
  /\btonight at 8\b/i,
];

/* Terminal blocks are a deck-contract violation — everything is a prompt. */
const TERMINAL = /(^|\n)\s*(npm |npx |cd |sudo |node |curl |git )/;

/* One carve-out, allowlisted BY NAME so nothing else sneaks through. The
 * before/after slide's heading is generated from week11.ts's `beforeAfter.label`
 * ("Monday → Thursday") and is NOT reachable from KitConfig, so it renders on
 * screen whatever this deck says. The only available fix tonight is a presenter
 * note telling Ali to ignore the heading — which has to quote it to be useful.
 * The week11.ts label itself is fixed in the PR, for the next cohort. */
const NOTE_ALLOWLIST = new Set(['beforeafter:cta--1']);

function lint(teach, notes, beats, interactions) {
  const problems = [];
  const scan = (where, text) => {
    if (!text) return;
    const s = String(text);
    BANNED.forEach((re) => {
      if (re.test(s)) problems.push(`${where}: banned /${re.source}/ in ${JSON.stringify(s.slice(0, 120))}`);
    });
  };

  teach.forEach((t, i) => {
    const where = `teach[${i}] ${t.segment} "${(t.title || '').slice(0, 48)}"`;
    [t.eyebrow, t.title, t.body, t.script].forEach((f) => scan(where, f));
    (t.bullets || []).forEach((b) => scan(where, b));
    if (t.code) {
      [t.code.label, t.code.code, t.code.expectedResult, t.code.stopCondition, t.code.rescue].forEach((f) => scan(where, f));
      if (/TERMINAL/i.test(t.code.pasteWhere || '')) problems.push(`${where}: pasteWhere names a TERMINAL`);
      if (t.code.kind === 'paste' && TERMINAL.test(t.code.code || '')) problems.push(`${where}: prompt body contains shell commands`);
    }
  });
  Object.entries(notes).forEach(([k, v]) => {
    if (NOTE_ALLOWLIST.has(k)) return;
    scan(`slideNotes[${k}]`, v);
  });
  beats.forEach((b, i) => [b.eyebrow, b.title, b.body, b.punch].forEach((f) => scan(`storyBeat[${i}]`, f)));
  interactions.forEach((q, i) => {
    [q.eyebrow, q.title, q.q, q.reveal, q.presenterTip].forEach((f) => scan(`interaction[${i}]`, f));
    (q.options || []).forEach((o) => scan(`interaction[${i}]`, o));
  });
  return problems;
}

/* ----------------------------------------------------- lifted architecture */
/* The ten Monday slides that carry the theory, by a distinctive fragment of
 * their title. Order here is the order they teach in. */
const LIFT = [
  'Enterprise AI pilots die at an extraordinary rate',   // why any of this exists
  'Two architects walk into the same review',            // THE story
  'A decision you cannot explain',                       // the idea of the week
  'Seven layers',                                        // the reference model
  'Storage, Data Fabric, Semantic',                      // layers 1-3
  'Intelligence proposes. Governance disposes',          // layers 4-5
  'Observability and Orchestration',                     // layers 6-7
  'A trust boundary is the exact line',                  // the security spine
  'Every package needs exactly two diagrams',            // what prompt 2 produces
  'You cannot fund a gap you cannot score',              // INPACT + Trust Band
];

/* Two of the lifted slides carry Monday/Thursday wording in their authored
 * script. Rewritten here for a single combined class, same voice. The other
 * eight scripts are reused untouched — they were already day-agnostic. */
const LIFTED_SCRIPTS = {
  'Enterprise AI pilots die at an extraordinary rate': L(
    'SITUATION: First teaching slide. This room has built for ten weeks and has never been given the vocabulary for what they built. Start here.',
    'MOOD: Cold and quiet. Do not sell it.',
    'OPEN: "Most of the AI pilots running inside your companies right now will not reach production this year. Not because Claude is weak. Because nobody drew the architecture."',
    'DO: Leave a beat. Then: "the next twenty minutes is how you become the person who draws it."',
    'NOTE: Be precise on the evidence — this is Ram’s argued thesis in Trust Before Intelligence, not a lab measurement. This room can smell an unfalsifiable statistic.',
  ),
  'Two architects walk into the same review': L(
    'SITUATION: The story that explains the entire discipline. If one thing survives tonight, make it this one.',
    'ROOM: Table on screen. Read the MIDDLE column out loud, in a slightly embarrassed voice.',
    'MOOD: Dry. The room laughs because they have all said "pretty ready" in a real meeting.',
    'OPEN: "Two architects walk into the same review. One brings a beautiful deck. One brings a folder. Only one of them gets funded."',
    'SAY: The difference is not presentation skill. It is that only one of them could answer a question that was not on the slide.',
    'DO: Ask "which architect are you today?" Every hand goes up for column three, aspirationally. Then say: "in about forty minutes, column three is a committed folder in your repo, not an aspiration."',
    'NOTE: Do not read the whole table. Middle column only, then move — you have nine more theory slides.',
  ),
  'Observability and Orchestration': L(
    'SITUATION: The reframe slide. Short, and it changes how they file the last two months of their own work.',
    'ROOM: Diagram up. Point at floors 6 and 7 on the stack you drew.',
    'MOOD: Firm. This is a correction, delivered as one.',
    'OPEN: "Reliability and governance are not things you bolt on when the build is finished."',
    'SAY: In this model they are floors five, six and seven. They are part of the building, not the paint.',
    'DO: Say it twice. This is the single thing most enterprise teams get wrong and it is the cheapest sentence to remember.',
    'NOTE: If you cannot trace one failure end to end on a single correlation id, floor six is incomplete no matter how many logs you have.',
  ),
  'Every package needs exactly two diagrams': L(
    'SITUATION: This slide is the spec for the second prompt. Everything on it is about to be generated for them, so it has to land.',
    'ROOM: Point at the diagram ON THIS VERY SLIDE as the format.',
    'MOOD: Practical and fast.',
    'OPEN: "Every package needs exactly two diagrams, and they answer different questions."',
    'SAY: The system diagram says what the pieces are. The data-flow diagram says how one request moves, and that is the one that exposes whether you gate before you execute.',
    'DO: Point at this slide’s own diagram: "this is the format. Text, seven boxes, short labels, readable from the back of the room." Every diagram you have shown for eleven weeks followed those rules.',
    'NOTE: That reveal usually gets a small laugh and it makes the standard concrete in one second instead of five minutes.',
  ),
};

/* ------------------------------------------------------- the three prompts */
/* Eight authored prompts collapse to three. Nothing in the package is lost:
 *   prompt 1 = CP0 inventory + CP1c seven-layer table
 *   prompt 2 = CP1a system diagram + CP1b data-flow diagram
 *   prompt 3 = CP2a/CP2b the five ADRs + CP3a/CP3b score, band, gate, commit
 * Every one carries a ⏱ estimate in the eyebrow and the label, and the script
 * says plainly "paste, then ADVANCE" so the room is taught over while it runs.
 * The folder fence is in every prompt: it only ever creates architecture/. */
const FENCE = '\n\nFence: create and edit files ONLY inside architecture/. Do not modify, move, or delete anything that already exists elsewhere in this repository. If any step would require touching a file outside architecture/, stop and ask me first.';

const PROMPTS = [
  {
    segment: 'guided-build',
    eyebrow: '1️⃣ Prompt 1 · ⏱ ~4 min · Inventory + the seven floors',
    title: 'You cannot map what you have not listed — and the draft is not the list',
    body: 'Every architecture package starts with an inventory, because the map is only ever as complete as the list beneath it. Claude Code drafts it from the repository and then binds every component to exactly one of the seven layers. Then you do the part no model can do for you: you verify it. In practice it will invent one or two components you do not have and miss one you do. Finding both is how you earn the inventory — and a component you forget has no layer, no boundary, and no failure plan.',
    bullets: [
      'Every service, model call, MCP server, datastore, queue, job, and policy file',
      'Each row cites a real path — a component with no path is a guess',
      'Then every component is bound to exactly one of the seven layers',
      'Claude drafts; you verify. It will invent one and miss one. Find both.',
      'Two files out of one prompt: inventory.md and seven-layer.md',
    ],
    code: {
      kind: 'paste',
      pasteWhere: 'Claude Code',
      label: '⏱ ~4 min · Claude Code prompt — inventory the system, then put every component on a floor',
      code: 'Scan this repository and write TWO files.\n\nFILE 1 — architecture/inventory.md\nList every component you can find evidence for: services and entry points, model calls, MCP servers and external integrations, datastores, queues, scheduled jobs, and policy or config files that change behaviour.\nColumns: COMPONENT | PATH | ONE-LINE PURPOSE.\nHard rules:\n1. Every row must cite a real path in this repo. If you cannot cite a path, do not list it.\n2. Do not infer components that a system like this "usually" has.\n3. End with a section called "Uncertain" listing anything you found but could not classify, phrased as questions for me.\n\nFILE 2 — architecture/seven-layer.md\nBind every component from FILE 1 to exactly ONE of these layers: 1 Storage, 2 Data Fabric, 3 Semantic, 4 Intelligence, 5 Governance, 6 Observability, 7 Orchestration.\nColumns: LAYER | COMPONENT(S) | WHAT IT DOES AT THIS LAYER.\nAny layer with nothing in it gets the word N/A plus a one-line reason grounded in MY system — never a blank row.\n\nThen tell me, in three lines: which two rows you are least confident about, and which layer looks emptiest.' + FENCE,
      expectedResult: 'Two files. A table where every row has a path you recognise, a seven-layer table with no blank rows, and a short honest list of what it was unsure about.',
      stopCondition: 'You have deleted at least one row Claude invented and added at least one it missed. If you deleted nothing, you have not read it yet.',
      rescue: 'If the table is suspiciously tidy, ask: "which of these did you find in the code and which did you infer from the project structure?" That question separates fact from plausible fiction immediately.',
    },
    diagram: `flowchart LR
  REPO[("📁 Your repo")] --> CC["💻 Claude Code<br/>drafts"]
  CC --> INV["📄 inventory.md"]
  INV --> TAB["🧱 seven-layer.md"]
  TAB --> V["👤 You delete one,<br/>you add one"]
  V --> OK["✅ A verified map"]`,
    script: L(
      'SITUATION: First prompt of the night. It runs for about four minutes, so this is a paste-then-teach slide, not a watch-the-spinner slide.',
      'ROOM: Your own repo open on screen with the prompt already in the clipboard.',
      'MOOD: Brisk. The theory is done; this is the room finally doing something.',
      'OPEN: "One prompt, two files. Paste it, hit enter, and then look back up here — it needs about four minutes and I am going to keep talking."',
      'DO: PASTE, THEN ADVANCE. Do not wait for it. Teach the next slide while every machine in the room is working.',
      'SAY: When it comes back, delete two lines it invented and add one it missed. It always does both.',
      'NOTE: Walk the room while prompt 2 is being set up and ask people what they deleted. The first time someone says "it listed a caching layer we do not have", the whole room learns trust-but-verify without a lecture.',
    ),
  },
  {
    segment: 'guided-build',
    eyebrow: '2️⃣ Prompt 2 · ⏱ ~5 min · Both diagrams, boundaries labelled',
    title: 'One diagram says what the pieces are. The other says whether you gate before you execute.',
    body: 'Now the two diagrams, from one prompt. The system diagram is static — what the pieces are, who calls whom, and one dashed line around what you control, with every crossing labelled B1 through B4 and a named validator or the honest word UNVALIDATED. The data-flow diagram is dynamic — one real request through the layers in order, on one correlation ID. That second one is where ordering becomes a claim you cannot hide: if the side effect appears before the policy check, you just found a real architecture bug in public, and that is a good night.',
    bullets: [
      'A dashed boundary around what you control — the single non-negotiable element',
      'Every crossing labelled on the arrow: B1, B2, B3, B4 and its validator',
      'Where nothing validates today, the label is UNVALIDATED. That word is honest, not embarrassing.',
      'The data flow traces your REAL code path, not the textbook one',
      'Propose, THEN gate, THEN execute — visible as an ordering, not a promise',
    ],
    code: {
      kind: 'paste',
      pasteWhere: 'Claude Code',
      label: '⏱ ~5 min · Claude Code prompt — system.mmd and data-flow.mmd, boundaries marked',
      code: 'Using architecture/inventory.md and architecture/seven-layer.md, write TWO mermaid files.\n\nFILE 1 — architecture/diagrams/system.mmd, a flowchart of MY system.\n1. A subgraph with a dashed style around everything we control, labelled "Trust boundary".\n2. External actors and external systems OUTSIDE that subgraph.\n3. Every arrow crossing the subgraph edge is labelled with its boundary id AND its validator, e.g. "B1 schema + auth" or "B2 UNVALIDATED".\n4. Where no validator exists in the code today, label the arrow UNVALIDATED. Never label a validator you cannot cite from this repo.\n5. At most 8 nodes. If my system needs more, group components and tell me what you grouped.\n6. Short quoted labels; use <br/> for line breaks, never a newline character.\n\nFILE 2 — architecture/diagrams/data-flow.mmd, a sequenceDiagram tracing ONE real request through the actual code path in this repo.\n1. Participants are the layers involved, named with their layer number, e.g. "Orchestration L7".\n2. The first message stamps a correlation id; the last message logs under that same id.\n3. A Note at each of the four boundaries showing what validates there, or the word UNVALIDATED.\n4. The proposed action is a SEPARATE message from the executed action, so propose-then-gate is visible.\n5. Trace what the code ACTUALLY does today, not what it should do. If it executes before it checks policy, draw it that way and flag it to me underneath.\n\nThen tell me two numbers and one sentence: how many arrows cross the boundary, how many are UNVALIDATED, and whether my real ordering is propose then gate then execute.' + FENCE,
      expectedResult: 'Two mermaid files that render, a count of crossings and unvalidated ones, and a plain yes-or-no about whether you gate before you execute.',
      stopCondition: 'You agree with every UNVALIDATED label, and you know whether your system gates before it executes.',
      rescue: 'If it renders as a blob with no boundary, the subgraph is missing — say exactly that. If it drew the ideal flow instead of yours, say: "trace the actual call path starting from <your entry file> and cite the function at each step."',
    },
    diagram: `flowchart LR
  IN["📥 Request,<br/>corr_id stamped"] -->|"B1 validate"| RET["🔎 Retrieve<br/>B2 scan"]
  RET --> PR["🧠 Propose action"]
  PR -->|"B3 policy,<br/>fail-closed"| G["⚖️ Governance"]
  G -->|"B4 execute once"| SE["💥 Side effect"]
  SE --> OB["👁️ Logged on the<br/>same corr_id"]`,
    script: L(
      'SITUATION: The prompt that produces the two artefacts a reviewer actually points at. About five minutes to run.',
      'ROOM: Have a rendered diagram of your own ready in case the room needs a reference while theirs generate.',
      'MOOD: Confident. This is the centrepiece.',
      'OPEN: "Second prompt. This one draws your building — and then it follows one person walking through it."',
      'DO: PASTE, THEN ADVANCE. While it runs, trace the diagram on this slide with your finger and stop hard between propose and gate.',
      'SAY: The model SAID do this. It does not get to DO it. This diagram is where that stops being a promise and becomes provable.',
      'DO: When the runs land, ask by show of hands: whose generated data flow put execute BEFORE gate? Every hand that goes up just found a genuine bug in public.',
      'NOTE: Fewer than four boundary crossings is not a smaller system. It is a hidden one, and a reviewer will find it.',
    ),
  },
  {
    segment: 'guided-build',
    eyebrow: '3️⃣ Prompt 3 · ⏱ ~7 min · Five ADRs, the score, and the gate',
    title: 'Five decisions written down so they survive you — then a number you can defend',
    body: 'The last prompt is the other two thirds of the package at once: the decisions and the evidence. Five ADRs for the choices that would hurt most to get wrong — model choice, the write boundary, authorization, data, exactly-once — each with the alternatives you rejected and the reason you rejected them. Then an INPACT composite, a Trust Band, your top three gaps, and a gate run over the whole folder. Watch the one rule: Claude proposes the rejected alternatives and marks each one CONFIRM. You own those. A preference is not a reason.',
    bullets: [
      'ADR 1 model choice · 2 write boundary · 3 authorization · 4 data · 5 exactly-once',
      'Every Alternatives block comes back marked [CONFIRM] — you supply the real reason',
      '"We preferred X" is banned. "X cannot express per-request context" is a reason.',
      'INPACT composite, Trust Band, and the top three gaps named with the layer that owns each',
      'Then the gate runs over the whole folder and it commits — files, not slides',
    ],
    code: {
      kind: 'paste',
      pasteWhere: 'Claude Code',
      label: '⏱ ~7 min · Claude Code prompt — the ADRs, the scorecard, the gate, the commit',
      code: 'Finish the architecture package in three steps.\n\nSTEP 1 — five ADRs, one file each in architecture/adr/, covering: 0001 model choice, 0002 which tools may cause side effects, 0003 how authorization is decided, 0004 where state and sensitive data live, 0005 how a side effect is guaranteed to happen exactly once.\nStructure each one:\n  ADR-000N: <decision in one line>\n  Status: Proposed | Accepted\n  Context: what is true in this system right now that pushes on the decision. Cite files.\n  Decision: what we do, specifically.\n  Alternatives considered:\n    - <option>: rejected because <a capability it lacks or a cost it imposes>\n  Consequences: what we now live with, good and bad.\n  Revisit when: the concrete trigger that reopens this.\nRules: Context and Consequences must cite real files or real behaviour in this repo. For Alternatives, propose candidates but mark each one [CONFIRM] — I supply or correct the real reason. Do not assert a rejection reason as fact. Preference language is banned: "we preferred X" is not a reason. In the model-choice ADR use the current model ids exactly: claude-opus-5, claude-sonnet-5, claude-haiku-4-5, and cite where the repo pins a model if it does.\n\nSTEP 2 — architecture/scorecard.md. Score my system 1-6 on each INPACT dimension: Instant, Natural, Permitted, Adaptive, Contextual, Transparent. composite = sum / 36 * 100. EVERY score must cite a file in this repo that justifies it; if nothing justifies it, score it low and say so. Place the composite on the Trust Band (High 86-100, Moderate 67-85, Low 50-66, Very Low 33-49, Critical below 33), state the readiness verdict in one sentence, then list the TOP 3 GAPS — for each: the dimension, the layer that owns the fix, the concrete action, and what evidence would prove it closed.\n\nSTEP 3 — write architecture/README.md explaining in four lines how to read this package, then run this gate over the whole architecture/ folder and report PASS or FAIL per line with the reason:\n  - both diagrams render as valid mermaid\n  - seven-layer.md has no blank rows and no unjustified N/A\n  - 5 ADRs exist, each with a non-empty Alternatives block and a revisit trigger\n  - every INPACT score cites an artefact that actually exists\n  - no secrets, keys, or credentials appear anywhere in the folder\nFix ONLY the mechanical failures (broken mermaid, missing headings). Report the judgement failures to me — do not invent content to make a check pass.\n\nFinally, commit ONLY the architecture/ folder, with the message: architecture package v1.' + FENCE,
      expectedResult: 'Five ADRs, a scorecard with a composite and a band, three named gaps, a pass/fail gate, and one commit containing only architecture/.',
      stopCondition: 'Every [CONFIRM] has been replaced with a real reason you own, and every gate line is PASS or you have written down why it is not.',
      rescue: 'If it starts inventing content to make a check pass, stop it immediately: "report the failure, do not fix it by writing something that is not true." That instinct is the thing this entire week exists to build.',
    },
    diagram: `flowchart LR
  A["📝 5 ADRs<br/>alternatives owned"] --> S["📊 INPACT<br/>composite"]
  S --> B["🎚️ Trust Band<br/>+ weeks of work"]
  B --> G["🥇 Top-3 gaps"]
  G --> GATE["✅ Gate passes"]
  GATE --> C["📦 git commit:<br/>architecture package v1"]`,
    script: L(
      'SITUATION: The longest prompt of the night, about seven minutes. It produces the decisions AND the evidence, so this is the one that finishes the package.',
      'ROOM: Clock visible. If the room is behind, this is the prompt that still has to run — cut the drill after it, never this.',
      'MOOD: Steady and serious. These five decisions are the ones they will be asked about at the Expo.',
      'OPEN: "Last prompt. Five decisions written down so they survive you, a number you can defend, and a commit."',
      'DO: PASTE, THEN ADVANCE. Teach the boundary drill while every machine in the room is writing ADRs.',
      'SAY: Watch for the word CONFIRM. Claude proposes the alternatives; you own the reason you rejected them. If it reads like a menu of equally good options, ask it what would have to be true for each rejected option to be the right one.',
      'NOTE: When the commits land, say the line plainly — "that folder answers where untrusted input enters, why every hard call was made, and how ready you really are, all from files. You did not make slides. You made evidence."',
    ),
  },
];

/* --------------------------------------------------------- failure segment */
/* One slide, no prompt. It costs three minutes and it is the highest-retention
 * moment available at this length. */
const FAILURE = [
  {
    segment: 'failure',
    eyebrow: '💥 Break it on purpose · ⏱ ~3 min',
    title: 'Erase the boundaries from your own diagram. Now answer the killer question.',
    body: 'Open the system diagram you just generated and mentally delete the dashed box and every label on every arrow. What is left is exactly the diagram most enterprise architecture decks ship with: real boxes, real arrows, and no answer to the only question a reviewer actually asks. Now say out loud where untrusted input enters your system. You cannot — not from that picture. That is the whole gap, and it is why the dashed line and the four labels are not decoration. Put them back and the question answers itself in two seconds.',
    bullets: [
      'Delete the dashed box and the labels — the diagram still looks professional',
      'Now answer: where does untrusted input enter? From that picture, you cannot',
      'That is the exact diagram that gets applause and no budget',
      'Draw the line, name the validator on every crossing, default to deny',
      'A boundary with no named validator is a finding, not a diagramming gap',
    ],
    diagram: `flowchart LR
  D["📐 Your diagram"] --> E["✂️ Erase the<br/>boundary + labels"]
  E --> Q["❓ Where does untrusted<br/>input enter?"]
  Q --> N["🤷 No answer<br/>from the picture"]
  N --> R["🚧 Put them back:<br/>answered in 2 seconds"]`,
    script: L(
      'SITUATION: The payoff of the whole night, and it runs while prompt 3 is still working. No keyboards.',
      'ROOM: Put a student’s generated system diagram on screen if anyone will volunteer one. Yours if not.',
      'MOOD: Playful, then one serious beat.',
      'OPEN: "Look at the diagram you just made. Now mentally erase the dashed box and every label on every arrow."',
      'SAY: What is left is a perfectly professional-looking diagram that cannot answer the only question a reviewer asks.',
      'DO: Ask the room, cold: "where does untrusted input enter your system?" Let the silence sit for three full seconds before you rescue it.',
      'SAY: That silence is the gap. The dashed line and four labels are not decoration — they are the answer, and you already have them.',
      'NOTE: This is the moment people quote back to you. Do not rush it and do not add a fourth prompt after it.',
    ),
  },
];

/* ------------------------------------------------------------ story beats */
/* Two. Both land AFTER their segment's teach slides — never between them.
 * (kitSpecDaySlides builds opener, then teach, then beats, then questions.)
 * The result-preview beat therefore opens the class; the failure beat closes
 * the drill. Written for exactly those positions. */
const STORY_BEATS = [
  {
    segment: 'result-preview',
    icon: '🏗️',
    tone: 'calm',
    eyebrow: '🏗️ The drawings',
    title: 'On every building site, one set of drawings carries a signature',
    body: 'Anyone on a construction site can tell you what the building looks like. Only one set of drawings says why the beam is that size, which cheaper beam was rejected, and what load it was protecting against. That set is signed, and it is the one the inspector asks for. The building is not the deliverable. The drawings are what let somebody change the building safely after the architect has gone home.',
    punch: 'You have been building for ten weeks. Tonight you draw the drawings.',
  },
  {
    segment: 'failure',
    icon: '🚪',
    tone: 'serious',
    eyebrow: '🚪 The one who was not there',
    title: 'She left in March, and by June nobody could say why the timeout was eight seconds',
    body: 'It was not a bad decision. It was a good decision, made for a real reason, by someone who was no longer there to say what the reason was. So nobody touched it. For two years, every engineer who looked at that number assumed it was protecting something — and every one of them was right, and none of them could say what. A decision nobody can explain is a decision nobody can change.',
    punch: 'An ADR is not paperwork. It is how a choice survives the person who made it.',
  },
];

/* ------------------------------------------------------------ interactions */
/* Two questions, both fast. The first is a cold baseline the room will fail,
 * asked again implicitly at the drill. The second is the one that makes every
 * person look at their own system. */
const INTERACTIONS = [
  {
    segment: 'result-preview',
    kind: 'poll',
    eyebrow: '🎯 Baseline',
    title: 'The killer question, before we start',
    q: 'Right now, without opening anything: can you say exactly where untrusted input enters your system?',
    options: ['Yes, and I could point at the validator', 'I know roughly where, not what validates it', 'No', 'I am not sure what counts as untrusted'],
    reveal: 'Most of the room is on options two and three. That is the gap the next forty minutes closes — and we ask this exact question again at the end.',
    presenterTip: L(
      'SITUATION: Cold baseline, thirty seconds. Do not teach off it.',
      'ROOM: Everyone has already scanned. Take the responses live.',
      'MOOD: Light. Nobody is in trouble for answering three.',
      'OPEN: "Before anything else — without opening a single file, where does untrusted input enter your system?"',
      'DO: Read the spread out loud, say "we ask this again at the end", and move. Do not let it become a discussion.',
    ),
  },
  {
    segment: 'build-map',
    kind: 'poll',
    eyebrow: '🚦 Find your own gap',
    title: 'Which floor of your building is empty?',
    q: 'Of the seven layers, which one has the least in it for your system right now?',
    options: ['1-3 Storage / Data Fabric / Semantic', '4 Intelligence', '5 Governance', '6 Observability', '7 Orchestration'],
    reveal: 'Whatever you picked is the first thing the scorecard will flag in about half an hour — and now you already know what it is going to say.',
    presenterTip: L(
      'SITUATION: Last thing before keyboards. It turns ten minutes of theory into a personal finding.',
      'ROOM: Theory is done. Say so — "that is all the theory; the rest of the night is three prompts."',
      'MOOD: Energised. They have a vocabulary now and they are about to use it.',
      'OPEN: "Seven floors. Point at your own system — which floor is emptiest?"',
      'DO: Take the spread, name the top two answers out loud, then go straight into prompt 1. Do not debate individual answers.',
      'NOTE: This fires AFTER all ten theory slides, not between them. It is the hinge into the build.',
    ),
  },
];

/* --------------------------------------------------------------- the notes */
/* Commentary for every generated slide this deck renders. Keyed `kind:id`
 * because ids are not unique — the cover and the result-preview segment slide
 * are both `result-preview-0`. */
const SLIDE_NOTES = {
  'cover:result-preview-0': L(
    'SITUATION: Opening slide. Session 22 did not happen, so tonight is both halves of Week 11 in one sitting — the architecture teaching and the package build.',
    'ROOM: Press Start class the moment you begin; the pace bar tracks from here.',
    'MOOD: Warm, direct, no apology for the combined format.',
    'OPEN: "Tonight is the whole of Week 11 in one class. About twenty minutes of architecture, then three prompts, and you leave with a committed architecture package."',
    'DO: Say the shape of the night out loud, including that it is about forty-five minutes. People relax when they know the length.',
    'NOTE: The Expo is the next class. Everything built tonight is the exhibit — say that once, here, and then do not keep selling it.',
  ),
  'rules:result-preview-1': L(
    'SITUATION: Phone check-in. Sixty seconds, once, properly.',
    'ROOM: Wait until you can SEE people scanning before you advance.',
    'MOOD: Matter of fact.',
    'OPEN: "Your phone is your controller tonight. Scan once now and stay connected — there are two questions coming and I can see when the room is stuck."',
    'NOTE: Short class tonight, so chasing stragglers later costs proportionally more. Get everyone in now.',
  ),
  'segment:result-preview-0': L(
    'SITUATION: The result preview — show the finished thing before you explain any of it.',
    'ROOM: Have a real architecture/ folder open on your screen. Click into one ADR. Click into the scorecard.',
    'MOOD: Concrete. This is a demo, not a promise.',
    'OPEN: "This is what you are walking out with. Not slides — a folder."',
    'DO: Click three files in front of them: a diagram, one ADR, the scorecard. Ten seconds each. Then close it and start teaching.',
    'NOTE: Showing the artefact first is what makes the theory block feel like a spec instead of a lecture.',
  ),
  'storybeat:result-preview-900': L(
    'SITUATION: The spine of the whole class, told before a single layer is named. Sixty seconds.',
    'ROOM: Story card full screen. Step away from the keyboard and talk to the room.',
    'MOOD: Unhurried, even though the class is short. This one earns its minute.',
    'OPEN: "On every building site, one set of drawings carries a signature."',
    'SAY: Anyone can tell you what the building looks like. Only that set says why the beam is that size, which cheaper beam was rejected, and what load it was protecting against. That is the set the inspector asks for.',
    'DO: Land the punch and go straight into the baseline question. Do not explain the metaphor — it does not need help.',
    'NOTE: Every piece of vocabulary tonight hangs off this: seven floors, the property line, the signed drawing. Call back to it at the erase-the-boundaries drill.',
  ),
  'storybeat:failure-900': L(
    'SITUATION: The last story of the night, and the reason ADRs exist. It lands right after the erase-the-boundaries drill, while the third prompt is still writing their ADRs.',
    'ROOM: Story card full screen. If you have a real example of a number nobody can explain, use yours instead.',
    'MOOD: Serious, briefly. This is the one that costs people money at work.',
    'OPEN: "She left in March. By June, nobody could say why the timeout was eight seconds."',
    'SAY: It was not a bad decision. It was a good decision whose reason walked out of the building.',
    'DO: Ask for one number or one setting in their own system that nobody can currently explain. Someone always has one.',
    'NOTE: Then the punch — an ADR is not paperwork, it is how a choice survives the person who made it. That is the sentence to leave the room with.',
  ),
  'segment:readiness-0': L(
    'SITUATION: Readiness check. One line, then move — you have a tight room tonight.',
    'ROOM: Ask for a tap on "I’m here". Anyone without a repo open pairs with a neighbour rather than stalling the room.',
    'MOOD: Quick.',
    'OPEN: "All you need open is your own project repo. If you do not have one in front of you, sit next to someone who does — you can still do all three prompts on theirs and watch what happens."',
    'NOTE: IGNORE THE WORDING ON THE SLIDE. It names the Intensives, which is generated boilerplate this session cannot override. Say your own line above instead — nobody is excluded tonight for having missed a build.',
  ),
  'break:reset-0': L(
    'SITUATION: A break slide the generator inserts automatically. There is NO break tonight.',
    'ROOM: Keep moving.',
    'MOOD: n/a.',
    'DO: ADVANCE STRAIGHT PAST THIS SLIDE. Do not read it, do not announce a break — the class is forty-five minutes and the third prompt is still running.',
    'NOTE: If the room genuinely needs a pause, take it here and cut the drill instead. Never cut prompt 3.',
  ),
  'demos:demos-0': L(
    'SITUATION: Student demos. At this length you have time for ONE, maybe two.',
    'ROOM: Call on someone whose data-flow diagram showed execute before gate. That is the best thirty seconds in the deck.',
    'MOOD: Celebratory and fast.',
    'OPEN: "One person — put your system diagram on screen and point at your dashed line."',
    'DO: Hard-limit it to sixty seconds each. If the clock is past forty-five minutes, skip this entirely and go to the close.',
    'NOTE: Do not open the floor to volunteers. Name one person you watched succeed while walking the room.',
  ),
  'broadcast:broadcast-0': L(
    'SITUATION: Build Proof recording. Optional at this length.',
    'ROOM: Phones out, thirty seconds each, nobody is made to do it.',
    'MOOD: Light.',
    'OPEN: "Thirty seconds on your phone: show the folder, say what the hardest decision in it was."',
    'DO: If you are at time, say that line, tell them to record it at home tonight, and move on. Do not run it live.',
  ),
  'beforeafter:cta--1': L(
    'SITUATION: The transformation payoff. Two columns, read neither.',
    'ROOM: Leave it on screen and stop talking.',
    'MOOD: Still.',
    'OPEN: "Left column was you an hour ago. Right column is you now."',
    'DO: Pause. Let the columns sit. Do not narrate the rows — reading them out loud is what kills this slide.',
    'NOTE: IGNORE THE HEADING. It reads "Monday → Thursday", which is generated boilerplate this session cannot override. Say "an hour ago → now" instead. The ten rows underneath it are correct and are the only part worth looking at.',
  ),
  'assignment:cta-0': L(
    'SITUATION: The last thing they see. It has to be concrete.',
    'ROOM: Read the proof line off the slide rather than from memory.',
    'MOOD: Clear and short.',
    'OPEN: "Here is what you owe, and here is exactly what counts as proof."',
    'SAY: Your architecture package is the exhibit you defend at the Expo. Every [CONFIRM] still sitting in an ADR is a question somebody will ask you, so go replace them this week.',
    'DO: Ask the baseline question one last time: "where does untrusted input enter your system?" Then let them answer it, and end there.',
    'NOTE: That callback is the close. Nothing after it.',
  ),
};

/* ------------------------------------------------------------------ build -- */
function compose(pack) {
  const pick = (slides, fragment) => slides.find((s) => (s.title || '').includes(fragment));

  const theory = LIFT.map((frag) => {
    const s = pick(pack.monday.teach, frag);
    if (!s) throw new Error('architecture slide not found: ' + frag);
    return {
      ...s,
      segment: 'build-map',
      eyebrow: '🏛️ ' + (s.eyebrow || '').replace(/^[^\s]+\s*/, ''),
      script: LIFTED_SCRIPTS[frag] || s.script,
    };
  });

  return [...theory, ...PROMPTS, ...FAILURE];
}

const CONFIG_SHELL = (teach) => ({
  storyBeats: { enabled: true, max: null, overrides: STORY_BEATS },
  // Full-screen decision theater is excellent and costs three minutes we do
  // not have tonight; the same polls render as compact inline questions.
  theaterEnabled: false,
  buildBayDetail: true,
  // Three prompts, not four checkpoints across eight. See the header.
  checkpointsEnabled: false,
  evidenceOverrides: null,
  teach: { enabled: true, max: null, overrides: teach },
  prompts: { enabled: true, max: null, overrides: null },
  interactions: { enabled: true, max: null, overrides: INTERACTIONS },
  slideNotes: SLIDE_NOTES,
  opening: {
    coldOpen: { enabled: true, override: null },
    hook: { enabled: true, override: null },
    resultPreview: {
      enabled: true,
      override: {
        title: 'One class, one folder: your system explained well enough to fund',
        body: 'Tonight is the whole of Week 11 in one sitting. First the architecture — seven layers, four trust boundaries, and the two diagrams every package needs. Then three prompts that turn your own repo into a committed architecture package: an inventory bound to the seven layers, both diagrams with the boundaries labelled, five ADRs that justify your hardest calls, and an INPACT scorecard with a Trust Band and your top three gaps named. Files, not slides.',
      },
    },
  },
});

module.exports = { LIFT, LIFTED_SCRIPTS, PROMPTS, FAILURE, STORY_BEATS, INTERACTIONS, SLIDE_NOTES, compose, lint, CONFIG_SHELL, BANNED };

/* --------------------------------------------------------------- check mode */
/* `--check` runs with no database and no dist build. week11.ts is pure data
 * with a single type-only import, so it loads locally after stripping the TS
 * syntax — which means the lint runs against the REAL lifted slide text, not a
 * copy of it. */
function loadPackLocally() {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../../data/weeks/week11.ts'), 'utf8');
  const js = src
    .replace(/^import type .*$/m, '')
    .replace('export const WEEK11_PACK: WeekPack =', 'module.exports.WEEK11_PACK =');
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', js)(mod, mod.exports);
  return mod.exports.WEEK11_PACK;
}

if (require.main === module && process.argv.includes('--check')) {
  const pack = loadPackLocally();
  const teach = compose(pack);
  const problems = lint(teach, SLIDE_NOTES, STORY_BEATS, INTERACTIONS);
  const bySeg = {};
  teach.forEach((s) => { bySeg[s.segment] = (bySeg[s.segment] || 0) + 1; });
  const prompts = teach.filter((s) => s.code && s.code.kind === 'paste').length;
  console.log('teach slides  : ' + teach.length + '  ' + JSON.stringify(bySeg));
  console.log('paste prompts : ' + prompts);
  console.log('story beats   : ' + STORY_BEATS.length + '   interactions: ' + INTERACTIONS.length);
  console.log('slideNotes    : ' + Object.keys(SLIDE_NOTES).length);
  teach.forEach((s, i) => console.log('  ' + String(i).padStart(2) + ' ' + s.segment.padEnd(13) + ' ' + (s.title || '').slice(0, 72)));
  if (problems.length) {
    console.error('\nLINT FAILURES (' + problems.length + '):');
    problems.forEach((p) => console.error('  ✗ ' + p));
    process.exit(1);
  }
  console.log('\nlint: clean — no Monday/Thursday wording, no terminal blocks, 3 prompts.');
  process.exit(0);
}

/* --------------------------------------------------------------- apply mode */
/* Executed inside the backend container. Looks the session up by number rather
 * than carrying a hardcoded uuid, backs the current kit up to /tmp, saves, and
 * re-reads to prove the write landed. Idempotent: re-running produces the same
 * config, and the backup is written before every save. */
if (require.main === module && !process.argv.includes('--check')) {
  const { WEEK11_PACK } = require('/app/dist/data/weeks/week11');
  const { saveKitConfig, getKitConfig } = require('/app/dist/services/sessionKitConfigService');
  const { sequelize } = require('/app/dist/config/database');
  const fs = require('fs');

  const teach = compose(WEEK11_PACK);
  const problems = lint(teach, SLIDE_NOTES, STORY_BEATS, INTERACTIONS);
  if (problems.length) {
    console.error('LINT FAILURES — refusing to save:');
    problems.forEach((p) => console.error('  ✗ ' + p));
    process.exit(1);
  }

  sequelize
    .query('SELECT id, title, kit_config_json FROM live_sessions WHERE session_number = 23', { type: 'SELECT' })
    .then(async (rows) => {
      if (!rows.length) throw new Error('session 23 not found');
      const s = rows[0];
      console.error('session 23: ' + s.id + '  ' + s.title);
      const backup = '/tmp/kit-before-session23-20261008.json';
      fs.writeFileSync(backup, JSON.stringify(s.kit_config_json ?? null, null, 1));
      console.error('backup: ' + backup + ' (' + (s.kit_config_json ? 'had a kit' : 'was NULL — rollback is kit_config_json = NULL') + ')');

      await saveKitConfig(s.id, CONFIG_SHELL(teach));
      const saved = await getKitConfig(s.id);
      const t = saved.teach.overrides || [];
      const bySeg = {};
      t.forEach((x) => { bySeg[x.segment] = (bySeg[x.segment] || 0) + 1; });
      console.error('SAVED teach=' + t.length + ' ' + JSON.stringify(bySeg));
      console.error('  paste prompts : ' + t.filter((x) => x.code && x.code.kind === 'paste').length);
      console.error('  checkpoints   : ' + saved.checkpointsEnabled);
      console.error('  storyBeats    : ' + (saved.storyBeats.overrides || []).length);
      console.error('  interactions  : ' + (saved.interactions.overrides || []).length);
      console.error('  slideNotes    : ' + Object.keys(saved.slideNotes || {}).length);
      console.error('  sessionId     : ' + s.id);
      process.exit(0);
    })
    .catch((e) => { console.error('FAIL ' + e.message); process.exit(1); });
}
